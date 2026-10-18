import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import dns from "node:dns/promises";
import express from "express";

const root = "/tmp/30x-remediation-references-2";
fs.mkdirSync(root, { recursive: true });
const directory = fs.mkdtempSync(path.join(root, "test-"));
process.env.DATA_DIR = directory;
process.env.DISCOVERY_ENABLED = "false";
for (const key of [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "YOUTUBE_API_KEY",
  "APIFY_API_TOKEN",
])
  delete process.env[key];

const storage = await import("../server/db.mjs");
const auth = await import("../server/auth.mjs");
const { createCoreRouter } = await import("../server/core.mjs");
let server;
let origin;

function account(role = "owner") {
  const user = auth.createUser({
    name: "Equipo sintético references-2",
    email: `${randomUUID()}@example.com`,
    passwordHash: "unused-for-fixture",
  });
  const brand = storage.saveBrand({
    name: "Referencias sintéticas públicas",
    audience: [],
  });
  storage.db
    .prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?)")
    .run(brand.id, user.id, role);
  const token = randomUUID();
  storage.db
    .prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    )
    .run(auth.tokenHash(token), user.id, Date.now() + 3_600_000);
  return { brand, cookie: `radar_session=${token}` };
}

async function request(
  session,
  {
    method = "GET",
    body,
    id,
    brandId = session.brand.id,
    route = "references",
  } = {},
) {
  const response = await fetch(
    `${origin}/api/brands/${brandId}/${route}${id ? `/${id}` : ""}`,
    {
      method,
      headers: {
        cookie: session.cookie,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  return { status: response.status, data: await response.json() };
}

const capture = {
  title: "QA URL privada loopback",
  url: "http://127.0.0.1:9/qa-private-reference",
  text: "Referencia sintética aportada por el equipo; no se visitó el destino.",
  language: "es",
};

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", createCoreRouter());
  app.use((error, _req, res, _next) =>
    res.status(error.status || 500).json({ error: error.message }),
  );
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.1.19", resolve);
  });
  origin = `http://127.0.1.19:${server.address().port}`;
});

after(async () => {
  if (server)
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections?.();
    });
  storage.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("original HTTP repro: manual capture rejects loopback and leaves no stored reference or activity", async (t) => {
  const session = account();
  const result = await request(session, { method: "POST", body: capture });
  const readback = await request(session);
  t.diagnostic(
    JSON.stringify({
      status: result.status,
      error: result.data.error,
      persisted: readback.data.length,
    }),
  );
  assert.equal(
    result.status,
    400,
    "loopback cannot be the original source of a public reference",
  );
  assert.match(result.data.error, /URL.*públic/i);
  assert.deepEqual(readback.data, []);
  assert.equal(
    storage.db
      .prepare("SELECT COUNT(*) AS total FROM activity WHERE brand_id=?")
      .get(session.brand.id).total,
    0,
  );
});

const privateUrls = [
  "http://127.0.0.1/original",
  "http://127.1/original",
  "http://2130706433/original",
  "http://0x7f000001/original",
  "http://0177.0.0.1/original",
  "http://%31%32%37.0.0.1/original",
  "http://127.0.0.1./original",
  "http://[::1]/original",
  "http://[0:0:0:0:0:0:0:1]/original",
  "http://[::ffff:127.0.0.1]/original",
  "http://[::ffff:7f00:1]/original",
  "http://[::]/original",
  "http://[fc00::1]/original",
  "http://[fe80::1]/original",
  "http://[ff02::1]/original",
  "http://[2001:db8::1]/original",
  "http://[2001:0db8::1]/original",
  "http://[2001::1]/original",
  "http://[2002:7f00:1::1]/original",
  "http://[3fff::1]/original",
  ...[
    "0.0.0.0",
    "10.1.2.3",
    "100.64.1.2",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "192.0.0.1",
    "192.0.2.1",
    "192.88.99.1",
    "198.18.0.1",
    "198.19.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "255.255.255.255",
  ].map((host) => `http://${host}/original`),
  ...[
    "localhost",
    "LOCALHOST.",
    "localhost..",
    "service.localhost",
    "service.localhost.",
    "%6cocalhost",
    "intranet",
    "printer",
    "service.local",
    "service.local.",
    "service.internal",
    "metadata.google.internal",
    "service.test",
    "service.invalid",
    "service.example",
    "service.lan",
    "service.home",
    "service.corp",
    "service.home.arpa",
    "service.onion",
  ].map((host) => `http://${host}/original`),
  "ftp://example.com/public",
  "file:///etc/passwd",
  "javascript:alert(1)",
  "data:text/plain,synthetic",
  "//example.com/public",
  "/relative-public",
  "not-a-url",
  "https://user:password@example.com/public",
  "https://user@example.com/public",
  "https://example.com:8443/public",
];

test("POST and PATCH reject private, reserved, normalized local, intranet and non-public URLs without mutation", async (t) => {
  const session = account();
  const current = storage.saveRecord(session.brand.id, "references", {
    ...capture,
    title: "Cita pública sintética existente",
    url: "https://www.nasa.gov/news/",
    status: "saved",
    analysis: { summary: "Análisis sintético previo" },
  });
  for (const url of privateUrls) {
    const posted = await request(session, {
      method: "POST",
      body: { ...capture, url },
    });
    assert.equal(posted.status, 400, `POST ${url}`);
    const patched = await request(session, {
      method: "PATCH",
      id: current.id,
      body: { url, title: "No debe guardarse" },
    });
    assert.equal(patched.status, 400, `PATCH ${url}`);
    assert.deepEqual(
      storage.getRecord(session.brand.id, "references", current.id),
      current,
      url,
    );
  }
  assert.deepEqual((await request(session)).data, [current]);
  assert.equal(
    storage.db
      .prepare("SELECT COUNT(*) AS total FROM activity WHERE brand_id=?")
      .get(session.brand.id).total,
    0,
  );
  t.diagnostic(
    `${privateUrls.length} inadmissible URL cases rejected on both HTTP write routes`,
  );
});

test("ordinary public citations and literal public addresses save without DNS, page access or fabricated reading", async (t) => {
  const session = account();
  const urls = [
    "https://www.linkedin.com/posts/qa-references_ia-sintetica-123",
    "https://www.youtube.com/watch?v=synthetic001",
    "https://www.youtube.com/@publiccreator",
    "https://www.instagram.com/p/synthetic001/",
    "https://www.tiktok.com/@publiccreator/video/100001",
    "https://news.ycombinator.com/item?id=100",
    "https://www.nasa.gov/feed/",
    "http://192.0.66.108/public-citation",
    "http://192.0.0.9/public-citation",
    "https://1.1.1.1/public-citation",
    "https://[2606:4700:4700::1111]/public-citation",
    "https://example.com/article?edition=es&source=one&ref=100#intro",
    "https://example.com/search?name=Ana+Silva",
    "https://EXAMPLE.com:443/app#/post/1",
    "https://example.com./public-citation",
  ];
  const originalLookup = dns.lookup;
  const originalFetch = globalThis.fetch;
  let lookups = 0;
  let externalFetches = 0;
  dns.lookup = async () => {
    lookups++;
    throw new Error("Unexpected DNS during citation storage");
  };
  globalThis.fetch = (value, options) => {
    if (!String(value).startsWith(`${origin}/`)) {
      externalFetches++;
      throw new Error("Unexpected external fetch during citation storage");
    }
    return originalFetch(value, options);
  };
  try {
    for (const url of urls) {
      const result = await request(session, {
        method: "POST",
        body: { ...capture, title: "Cita pública sintética", url },
      });
      assert.equal(
        result.status,
        201,
        `${url}: ${JSON.stringify(result.data)}`,
      );
      assert.equal(result.data.url, new URL(url).href);
      assert.equal(result.data.source, "manual");
      assert.equal(result.data.analysis, undefined);
      assert.equal(result.data.contentScope, undefined);
      assert.equal(result.data.originalUrlOmitted, undefined);
    }
    const readback = await request(session, { route: "state" });
    assert.deepEqual(
      readback.data.references.map((item) => item.url).sort(),
      urls.map((url) => new URL(url).href).sort(),
    );
    assert.equal(lookups, 0);
    assert.equal(externalFetches, 0);
    t.diagnostic(
      `${urls.length} admissible citations stored; DNS lookups=${lookups}, external fetches=${externalFetches}`,
    );
  } finally {
    dns.lookup = originalLookup;
    globalThis.fetch = originalFetch;
  }
});

test("citation privacy and session rules reject embedded contact or credential data without echoing it", async () => {
  const session = account();
  for (const url of [
    "https://example.com/login/private",
    "https://example.com/article?access_token=synthetic-secret",
    "https://example.com/article?session=synthetic-secret",
    "https://example.com/article?email=ana%40example.com",
    "https://example.com/article#contact=Ana%20Silva",
    "https://example.com/article?record[phone]=%252B56912345678",
    "https://example.com/contacto/Ana%20Silva",
  ]) {
    for (const method of ["POST", "PATCH"]) {
      const current =
        method === "PATCH"
          ? storage.saveRecord(session.brand.id, "references", {
              ...capture,
              url: "https://example.com/public",
            })
          : undefined;
      const result = await request(session, {
        method,
        id: current?.id,
        body: { ...capture, url },
      });
      assert.equal(result.status, 400, `${method} ${url}`);
      assert.match(result.data.error, /sesión|datos personales/);
      assert.doesNotMatch(
        result.data.error,
        /Ana|Silva|56912345678|synthetic-secret|ana@/,
      );
      if (current)
        assert.deepEqual(
          storage.getRecord(session.brand.id, "references", current.id),
          current,
        );
    }
  }
});

test("legacy inadmissible originals are omitted on readback without rewriting history, and can be corrected or removed", async () => {
  const session = account();
  const legacy = storage.saveRecord(session.brand.id, "references", {
    ...capture,
    source: "Equipo",
    status: "new",
  });
  const listed = (await request(session)).data[0];
  assert.equal(listed.url, undefined);
  assert.equal(listed.originalUrlOmitted, true);
  assert.equal(listed.text, legacy.text);
  const state = await request(session, { route: "state" });
  assert.deepEqual(state.data.references, [listed]);
  assert.deepEqual(
    storage.getRecord(session.brand.id, "references", legacy.id),
    legacy,
  );
  const dismissed = await request(session, {
    method: "PATCH",
    id: legacy.id,
    body: { status: "dismissed" },
  });
  assert.equal(dismissed.status, 200);
  assert.equal(dismissed.data.url, undefined);
  assert.equal(dismissed.data.originalUrlOmitted, true);
  assert.equal(
    storage.getRecord(session.brand.id, "references", legacy.id).url,
    capture.url,
  );
  const corrected = await request(session, {
    method: "PATCH",
    id: legacy.id,
    body: { url: "https://www.nasa.gov/news/" },
  });
  assert.equal(corrected.status, 200);
  assert.equal(corrected.data.url, "https://www.nasa.gov/news/");
  assert.equal(corrected.data.originalUrlOmitted, undefined);
  const cleared = await request(session, {
    method: "PATCH",
    id: legacy.id,
    body: { url: "" },
  });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.data.url, "");
  assert.equal(cleared.data.originalUrlOmitted, undefined);
  assert.equal(cleared.data.text, legacy.text);
});

test("URL-free documents and text still work, and deduplicating a public citation retains its original record", async () => {
  const session = account();
  const asset = storage.saveRecord(session.brand.id, "assets", {
    name: "Documento sintético.txt",
    type: "document",
    mimeType: "text/plain",
  });
  const document = await request(session, {
    method: "POST",
    body: {
      title: "Documento propio sintético",
      assetId: asset.id,
      format: "document",
    },
  });
  assert.equal(document.status, 201);
  assert.equal(document.data.assetId, asset.id);
  assert.equal(document.data.url, undefined);
  const textOnly = await request(session, {
    method: "POST",
    body: { text: "Contexto propio sintético sin enlace." },
  });
  assert.equal(textOnly.status, 201);
  const body = {
    ...capture,
    title: "Cita pública sintética",
    url: "https://example.com/article?edition=es",
  };
  const original = await request(session, { method: "POST", body });
  const repeated = await request(session, {
    method: "POST",
    body: { ...body, url: `${body.url}&utm_source=retry#intro` },
  });
  assert.equal(original.status, 201);
  assert.equal(repeated.status, 200);
  assert.deepEqual(repeated.data, original.data);
  assert.equal((await request(session)).data.length, 3);
});

test("authentication, editor/reviewer permissions, brands and attached assets remain isolated", async () => {
  const owner = account();
  const editor = account("editor");
  const reviewer = account("reviewer");
  const publicCapture = { ...capture, url: "https://example.com/public" };
  const created = await request(editor, {
    method: "POST",
    body: publicCapture,
  });
  assert.equal(created.status, 201);
  assert.equal(
    (
      await request(editor, {
        method: "PATCH",
        id: created.data.id,
        body: { url: "https://example.com/updated" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(reviewer, { method: "POST", body: publicCapture })).status,
    403,
  );
  assert.equal(
    (
      await request(owner, {
        method: "POST",
        brandId: editor.brand.id,
        body: publicCapture,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(owner, {
        method: "PATCH",
        id: created.data.id,
        body: { url: capture.url },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        { ...owner, cookie: "" },
        { method: "POST", body: publicCapture },
      )
    ).status,
    401,
  );
  const asset = storage.saveRecord(editor.brand.id, "assets", {
    name: "Otro documento.txt",
    type: "document",
  });
  assert.equal(
    (await request(owner, { method: "POST", body: { assetId: asset.id } }))
      .status,
    400,
  );
  const ownReference = storage.saveRecord(reviewer.brand.id, "references", {
    ...publicCapture,
  });
  assert.equal(
    (
      await request(reviewer, {
        method: "PATCH",
        id: ownReference.id,
        body: { url: "https://example.com/updated" },
      })
    ).status,
    403,
  );
  assert.deepEqual(
    storage.getRecord(reviewer.brand.id, "references", ownReference.id),
    ownReference,
  );
});
