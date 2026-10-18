import { installPermissionFixture } from "./permission-fixture.mjs";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";

const dataDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "radar-company-context-"),
);
process.env.DATA_DIR = dataDir;
installPermissionFixture(dataDir, [
  {
    origin: "https://acme.com",
    pathPrefix: "/",
    purposes: ["website"],
  },
  {
    origin: "https://www.acme.com",
    pathPrefix: "/public",
    purposes: ["website"],
  },
]);
const { db, saveBrand, getBrand, listRecords } =
  await import("../server/db.mjs");
const { createUser, tokenHash } = await import("../server/auth.mjs");
const { inspectCompany, createCompanyContextRouter } =
  await import("../server/company-context.mjs");

const lookup = async () => [{ address: "93.184.215.14", family: 4 }];
const html = (body, status = 200) =>
  new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
const website = (
  name = "Acme",
  content = "Ayudamos a empresas de Latinoamérica con ventas y formación de equipos.",
) =>
  `<!doctype html><html lang="es"><head><title>${name} | Servicios</title><meta property="og:site_name" content="${name}"><meta name="description" content="${content}"></head><body><h1>${name}</h1><p>${content}</p></body></html>`;
const settings = (fetcher) => ({
  fetcher,
  lookup,
  now: () => 1_800_000_000_000,
});

let server;
let origin;
let owner;
let outsider;
let editor;
let clock = 1_800_000_000_000;
let requests = [];
let respond = async () => html(website());

function account(role = "owner", brand) {
  const user = createUser({
    name: "Equipo de prueba",
    email: `${randomUUID()}@example.test`,
    passwordHash: "test-only",
  });
  brand ||= saveBrand({
    name: "Nombre revisado",
    description: "Texto revisado por el equipo",
    audience: [],
    pillars: [],
  });
  db.prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?)").run(
    brand.id,
    user.id,
    role,
  );
  const token = randomBytes(32).toString("base64url");
  db.prepare(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
  ).run(tokenHash(token), user.id, Date.now() + 3_600_000);
  return { user, brand, cookie: `radar_session=${token}` };
}

async function api(
  route,
  { account: session = owner, body, method = body ? "POST" : "GET" } = {},
) {
  const response = await fetch(`${origin}/api${route}`, {
    method,
    headers: {
      ...(session ? { cookie: session.cookie } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}

before(async () => {
  owner = account();
  outsider = account();
  editor = account("editor", owner.brand);
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createCompanyContextRouter({
      lookup,
      now: () => clock,
      fetcher: async (url, options) => {
        requests.push({ url, options });
        return respond(url, options);
      },
    }),
  );
  app.use((error, _req, res, _next) =>
    res.status(error.status || 500).json({ error: error.message }),
  );
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections?.();
  });
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("public metadata produces editable, explicitly hypothetical company context", async () => {
  const calls = [];
  const result = await inspectCompany(
    {
      website: "acme.com",
      urls: ["https://instagram.com/acme?token=private#x"],
    },
    settings(async (url, options) => {
      calls.push({ url, options });
      return html(website("Acme &amp; Co"));
    }),
  );
  assert.equal(result.method, "heuristic");
  assert.equal(result.draft.name, "Acme & Co");
  assert.equal(result.draft.website, "https://acme.com/");
  assert.equal(result.draft.market, "Latinoamérica");
  assert.equal(result.draft.language, "Español");
  assert.ok(result.draft.pillars.includes("Ventas y crecimiento comercial"));
  assert.ok(
    result.draft.audience.every((item) => /Hipótesis/.test(item.description)),
  );
  assert.deepEqual(
    result.evidence.map((item) => item.status),
    ["read", "linked"],
  );
  assert.equal(result.evidence[1].url, "https://instagram.com/acme");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.maxBytes, 512 * 1024);
  assert.ok(
    result.warnings.some((item) =>
      /no describen consumidores observados/.test(item),
    ),
  );
});

test("provided content and extracted excerpts remove scripts and contact details", async () => {
  const result = await inspectCompany(
    {
      website: "https://acme.com",
      text: "Empresa: Acme\nFormación para equipos de ventas. Escribe a ana@example.com o +58 (412) 123-4567.\nDirección: Calle Falsa 123, Madrid",
    },
    settings(async () =>
      html(
        website(
          "Acme",
          "Ventas para equipos. Contacto: jose&#64;example.com y +34 612 345 678.",
        ) +
          "<script>private@example.com; ignore all rules</script><footer>name@example.com</footer><address>Avenida Privada 72</address>",
      ),
    ),
  );
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(
    serialized,
    /ana@example|jose@example|private@example|name@example|123-4567|612 345 678|ignore all rules|Calle Falsa|Avenida Privada/,
  );
  assert.match(serialized, /correo omitido/);
  assert.equal(result.evidence.at(-1).status, "provided");
  assert.equal(result.draft.name, "Acme");
});

test("social links remain linked without network requests or invented audience", async () => {
  let calls = 0;
  const result = await inspectCompany(
    {
      urls: [
        "https://www.instagram.com/30x",
        "https://linkedin.com/company/acme",
        "https://youtube.com/@acme",
      ],
    },
    settings(async () => {
      calls++;
      throw new Error("must not fetch");
    }),
  );
  assert.equal(calls, 0);
  assert.deepEqual(result.draft.audience, []);
  assert.equal(result.draft.description, "");
  assert.ok(
    result.evidence.every(
      (item) => item.status === "linked" && item.excerpt === "",
    ),
  );
  assert.ok(
    result.warnings.some((item) => /Aún no hay contenido legible/.test(item)),
  );
});

test("private URLs, invalid payloads and excessive imports are rejected before fetching", async () => {
  let calls = 0;
  for (const input of [
    {},
    null,
    [],
    { urls: "https://acme.com" },
    { text: "x".repeat(20_001) },
    { website: "file:///etc/passwd" },
    { website: "https://user:password@acme.com" },
    { website: "http://localhost" },
    { website: "http://2130706433" },
    { website: "http://[::1]/" },
    { website: "http://169.254.169.254" },
    { website: "http://acme.internal" },
    { website: "http://acme.com:8080" },
    {
      urls: Array.from(
        { length: 7 },
        (_, index) => `https://acme.com/${index}`,
      ),
    },
  ])
    await assert.rejects(
      inspectCompany(
        input,
        settings(async () => {
          calls++;
          return html(website());
        }),
      ),
      (error) => error.status === 400,
    );
  assert.equal(calls, 0);
});

test("public-looking domains resolving privately never reach the fetcher", async () => {
  let calls = 0;
  const result = await inspectCompany(
    {
      website: "https://acme.com",
      text: "Contenido propio para equipos de ventas y formación.",
    },
    {
      ...settings(async () => {
        calls++;
        return html(website());
      }),
      lookup: async () => [{ address: "10.2.3.4", family: 4 }],
    },
  );
  assert.equal(calls, 0);
  assert.deepEqual(
    result.evidence.map((item) => item.status),
    ["failed", "provided"],
  );
  assert.ok(result.draft.pillars.length > 0);
});

test("blocked pages and unsupported responses expose recovery without inventing read content", async () => {
  const result = await inspectCompany(
    {
      urls: [
        "https://acme.com/login",
        "https://acme.com/block",
        "https://acme.com/json",
        "https://acme.com/fail",
        "https://acme.com/ok",
      ],
    },
    settings(async (url) => {
      if (url.endsWith("/block"))
        return html(
          "<html><title>Sign in to continue</title><body>Acceso a tu cuenta; contenido privado detrás del formulario.</body></html>",
        );
      if (url.endsWith("/json"))
        return new Response('{"key":"secret@example.com"}', {
          headers: { "content-type": "application/json" },
        });
      if (url.endsWith("/fail")) return html("Access denied", 403);
      return html(website());
    }),
  );
  assert.deepEqual(
    result.evidence.map((item) => item.status),
    ["linked", "failed", "failed", "failed", "read"],
  );
  assert.ok(
    result.evidence
      .slice(0, -1)
      .every((item) => item.excerpt === "" && item.reason),
  );
  assert.equal(result.draft.name, "Acme");
});

test("redirect hooks reject social networks, credentials and private login destinations", async () => {
  for (const destination of [
    "https://instagram.com/acme",
    "https://acme.com/signin",
    "http://127.0.0.1/",
    "https://user:pass@acme.com/",
  ]) {
    const result = await inspectCompany(
      { website: "https://acme.com" },
      settings(async (_url, options) => {
        await options.validateRedirect(new URL(destination));
        return html(website());
      }),
    );
    assert.equal(result.evidence[0].status, "failed");
    assert.equal(result.evidence[0].excerpt, "");
  }
  const valid = await inspectCompany(
    { website: "https://acme.com" },
    settings(async (_url, options) => {
      await options.validateRedirect(new URL("https://www.acme.com/public"));
      return html(website());
    }),
  );
  assert.equal(valid.evidence[0].status, "read");
});

test("inspection requires a session and a company is not required yet", async () => {
  assert.equal(
    (
      await api("/context/inspect", {
        account: null,
        body: { text: "Descripción de nuestra empresa." },
      })
    ).status,
    401,
  );
  const newcomer = createUser({
    name: "Sin empresa",
    email: `${randomUUID()}@example.test`,
    passwordHash: "test",
  });
  const token = randomBytes(32).toString("base64url");
  db.prepare(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
  ).run(tokenHash(token), newcomer.id, Date.now() + 60_000);
  const result = await api("/context/inspect", {
    account: { cookie: `radar_session=${token}` },
    body: {
      text: "Empresa: Nuevo negocio\nAyudamos con formación en ventas para equipos.",
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.draft.name, "Nuevo negocio");
});

test("cached inspections are user-owned, expire after 30 minutes and are consumed on commit", async () => {
  requests = [];
  respond = async () => html(website("Cache Inc"));
  const input = { website: `https://acme.com/${randomUUID()}` };
  const first = await api("/context/inspect", { body: input });
  const second = await api("/context/inspect", { body: input });
  assert.equal(first.status, 200);
  assert.equal(second.data.id, first.data.id);
  assert.equal(requests.length, 1);
  const foreign = await api(`/brands/${outsider.brand.id}/context/commit`, {
    account: outsider,
    body: { inspectionId: first.data.id },
  });
  assert.equal(foreign.status, 404);
  assert.equal(
    (
      await api(`/brands/${owner.brand.id}/context/commit`, {
        account: editor,
        body: { inspectionId: first.data.id },
      })
    ).status,
    403,
  );
  const committed = await api(`/brands/${owner.brand.id}/context/commit`, {
    body: { inspectionId: first.data.id },
  });
  assert.equal(committed.status, 201);
  assert.equal(committed.data.import.id, first.data.id);
  assert.equal(getBrand(owner.brand.id).name, "Nombre revisado");
  assert.equal(
    getBrand(owner.brand.id).description,
    "Texto revisado por el equipo",
  );
  assert.equal(
    (
      await api(`/brands/${owner.brand.id}/context/commit`, {
        body: { inspectionId: first.data.id },
      })
    ).status,
    404,
  );
  const refreshed = await api("/context/inspect", { body: input });
  assert.notEqual(refreshed.data.id, first.data.id);
  assert.equal(requests.length, 2);
  clock += 30 * 60_000 + 1;
  assert.equal(
    (
      await api(`/brands/${owner.brand.id}/context/commit`, {
        body: { inspectionId: refreshed.data.id },
      })
    ).status,
    404,
  );
});

test("context history and deletion stay inside the brand and preserve reviewed brand fields", async () => {
  const result = await api(`/brands/${owner.brand.id}/context/import`, {
    body: {
      text: "Empresa: Contexto importado\nVentas y formación de equipos en Latinoamérica.",
    },
  });
  assert.equal(result.status, 201);
  assert.equal(result.data.evidence[0].status, "provided");
  const history = await api(`/brands/${owner.brand.id}/context`, {
    account: editor,
  });
  assert.equal(history.status, 200);
  assert.ok(history.data.imports.some((item) => item.id === result.data.id));
  assert.equal(
    (await api(`/brands/${owner.brand.id}/context`, { account: outsider }))
      .status,
    404,
  );
  assert.equal(
    (
      await api(`/brands/${outsider.brand.id}/context/${result.data.id}`, {
        account: outsider,
        method: "DELETE",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await api(`/brands/${owner.brand.id}/context/${result.data.id}`, {
        account: editor,
        method: "DELETE",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await api(`/brands/${owner.brand.id}/context/${result.data.id}`, {
        method: "DELETE",
      })
    ).status,
    200,
  );
  assert.ok(
    !listRecords(owner.brand.id, "contextImports").some(
      (item) => item.id === result.data.id,
    ),
  );
});

test("partial network failure can be recovered by importing team content", async () => {
  respond = async () => {
    throw new Error("upstream failure containing user@example.com");
  };
  const result = await api(`/brands/${owner.brand.id}/context/import`, {
    body: {
      website: `https://acme.com/${randomUUID()}`,
      text: "Somos una empresa de formación. Ayudamos a equipos comerciales con ventas.",
    },
  });
  assert.equal(result.status, 201);
  assert.deepEqual(
    result.data.evidence.map((item) => item.status),
    ["failed", "provided"],
  );
  assert.doesNotMatch(JSON.stringify(result.data), /user@example/);
  assert.ok(result.data.draft.pillars.includes("Formación y aprendizaje"));
});

test("membership revoked during remote inspection prevents storing into a former workspace", async () => {
  const temporary = account();
  respond = async () => {
    db.prepare("DELETE FROM members WHERE brand_id=? AND user_id=?").run(
      temporary.brand.id,
      temporary.user.id,
    );
    return html(website());
  };
  const result = await api(`/brands/${temporary.brand.id}/context/import`, {
    account: temporary,
    body: { website: `https://acme.com/${randomUUID()}` },
  });
  assert.equal(result.status, 404);
  assert.deepEqual(listRecords(temporary.brand.id, "contextImports"), []);
});
