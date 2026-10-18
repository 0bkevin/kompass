import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-company-2-"));
process.env.DATA_DIR = dataDir;
const { db, saveBrand, getBrand, saveRecord, listRecords } =
  await import("../server/db.mjs");
const { createUser, tokenHash } = await import("../server/auth.mjs");
const { createCompanyContextRouter } =
  await import("../server/company-context.mjs");

const originalText =
  "PRUEBA SINTÉTICA: Nexo ofrece formación de procesos. Contacto ficticio Persona QA; el siguiente dato es su domicilio particular, no una sede de empresa. Dirección: Calle Inventada 456, Ciudad Sintética. Correo: persona.qa@example.com.";
const redactedOriginalText =
  "PRUEBA SINTÉTICA: Nexo ofrece formación de procesos. Contacto ficticio Persona QA; el siguiente dato es su domicilio particular, no una sede de empresa. [domicilio omitido]. Correo: [correo omitido].";

let server;
let origin;
let cookie;
let brand;
const pages = new Map();

async function api(route, body) {
  const response = await fetch(`${origin}/api${route}`, {
    method: body ? "POST" : "GET",
    headers: {
      cookie,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}

before(async () => {
  const user = createUser({
    name: "Equipo sintético company-2",
    email: `${randomUUID()}@example.test`,
    passwordHash: "synthetic-test-only",
  });
  brand = saveBrand({
    name: "Nexo sintético revisado",
    description: "Contexto empresarial confirmado por el equipo.",
    audience: [],
    pillars: [],
  });
  db.prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?)").run(
    brand.id,
    user.id,
    "owner",
  );
  const token = randomBytes(32).toString("base64url");
  db.prepare(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
  ).run(tokenHash(token), user.id, Date.now() + 3_600_000);
  cookie = `radar_session=${token}`;
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createCompanyContextRouter({
      lookup: async () => [{ address: "93.184.215.14", family: 4 }],
      fetcher: async (url) => {
        assert.ok(
          pages.has(url),
          "Only explicit synthetic extraction fixtures may be fetched",
        );
        return pages.get(url)();
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

function assertOriginalAddressRedacted(inspection) {
  assert.equal(inspection.method, "heuristic");
  assert.equal(inspection.evidence.length, 1);
  assert.equal(inspection.evidence[0].status, "provided");
  for (const text of [
    inspection.evidence[0].excerpt,
    inspection.draft.description,
  ]) {
    assert.doesNotMatch(
      text,
      /Calle Inventada 456|Ciudad Sintética|persona\.qa@example\.com/,
    );
    assert.match(text, /\[domicilio omitido\]/);
    assert.match(text, /Nexo ofrece formación de procesos\./);
    assert.match(text, /Correo: \[correo omitido\]/);
    assert.equal(text, redactedOriginalText);
  }
}

test("company-2 original inline address is redacted in the imported and persisted inspector result", async () => {
  const imported = await api(`/brands/${brand.id}/context/import`, {
    text: originalText,
  });
  assert.equal(imported.status, 201);
  assertOriginalAddressRedacted(imported.data);

  const history = await api(`/brands/${brand.id}/context`);
  assert.equal(history.status, 200);
  const persisted = history.data.imports.find(
    (item) => item.id === imported.data.id,
  );
  assert.ok(persisted);
  assertOriginalAddressRedacted(persisted);
  assertOriginalAddressRedacted(
    listRecords(brand.id, "contextImports").find(
      (item) => item.id === imported.data.id,
    ),
  );
  assert.equal(getBrand(brand.id).description, brand.description);
});

test("company-2 redaction survives inspection caching, explicit commit and history reload", async () => {
  const first = await api("/context/inspect", { text: originalText });
  assert.equal(first.status, 200);
  assertOriginalAddressRedacted(first.data);
  const cached = await api("/context/inspect", { text: originalText });
  assert.equal(cached.status, 200);
  assert.equal(cached.data.id, first.data.id);
  assertOriginalAddressRedacted(cached.data);
  const committed = await api(`/brands/${brand.id}/context/commit`, {
    inspectionId: first.data.id,
  });
  assert.equal(committed.status, 201);
  assertOriginalAddressRedacted(committed.data.import);
  const reloaded = await api(`/brands/${brand.id}/context`);
  assert.equal(reloaded.status, 200);
  assertOriginalAddressRedacted(
    reloaded.data.imports.find((item) => item.id === first.data.id),
  );
  assert.equal(getBrand(brand.id).description, brand.description);
});

test("company-2 labeled address variants preserve surrounding business prose", async (t) => {
  const prefix = "Nexo ofrece formación de procesos.";
  const suffix = "Ayudamos a equipos con ventas.";
  const variants = [
    ["Dirección:", "Calle Simulada 123, Ciudad Ficticia", ". "],
    ["DIRECCION：", "Calle Simulada 123, Ciudad Ficticia", "; "],
    ["Address:", "123 Fictional St., Suite 4, Synthetic City", " | "],
    ["Domicilio:", "Calle Simulada 123, Ciudad Ficticia", "\n"],
    ["Dirección postal:", "Av. Simulada 123, Dpto. 4, Ciudad Ficticia", ". "],
    ["Domicilio particular:", "Calle Simulada 123, Ciudad Ficticia", " — "],
    [
      "dirección de contacto:",
      "C/ Simulada 123, C. P. 00000, Ciudad Ficticia",
      ". ",
    ],
    ["Dirección:\n", "Calle Simulada 123,\nCiudad Ficticia", ". "],
    [
      "Dirección:",
      "Calle Simulada 123, Edif. Dos, Apt. 4, Ciudad Ficticia",
      "! ",
    ],
    ["Dirección:", "Calle Simulada 123, Ciudad Ficticia", "? "],
  ];
  for (const [label, address, separator] of variants) {
    await t.test(
      `${label.replaceAll("\n", " ")} ending ${JSON.stringify(separator)}`,
      async () => {
        const result = await api(`/brands/${brand.id}/context/import`, {
          text: `${prefix} ${label} ${address}${separator}${suffix}`,
        });
        assert.equal(result.status, 201);
        for (const text of [
          result.data.evidence[0].excerpt,
          result.data.draft.description,
        ]) {
          assert.doesNotMatch(
            text,
            /Simulada|Ficticia|Fictional|Synthetic City|Suite 4|Dpto\. 4|Apt\. 4/,
          );
          assert.ok(text.includes(prefix), text);
          assert.ok(text.includes(suffix), text);
          assert.equal(text.match(/\[domicilio omitido\]/g)?.length, 1);
        }
      },
    );
  }
});

test("company-2 adjacent labeled fields and repeated addresses remain redacted without losing business fields", async () => {
  const result = await api(`/brands/${brand.id}/context/import`, {
    text: "Empresa: Nexo sintético\nDirección: Calle Simulada 12, Ciudad Ficticia Correo: persona@example.test; Servicios: Formación de equipos. Domicilio: Av. Imaginaria 9, Ciudad de Prueba; Horario: Lunes a viernes.",
  });
  assert.equal(result.status, 201);
  assert.equal(result.data.draft.name, "Nexo sintético");
  for (const text of [
    result.data.evidence[0].excerpt,
    result.data.draft.description,
  ]) {
    assert.doesNotMatch(
      text,
      /Simulada|Ficticia|Imaginaria|Ciudad de Prueba|persona@example/,
    );
    assert.match(text, /Correo: \[correo omitido\]/);
    assert.match(text, /Servicios: Formación de equipos\./);
    assert.match(text, /Horario: Lunes a viernes\./);
    assert.equal(text.match(/\[domicilio omitido\]/g)?.length, 2);
  }
});

test("company-2 address fields end at input and CRLF boundaries", async (t) => {
  for (const [text, expected] of [
    ["Dirección: Calle Simulada 123, Ciudad Ficticia", "[domicilio omitido]"],
    [
      "Nexo ofrece formación. Dirección: Calle Simulada 123, Ciudad Ficticia\r\nAyudamos con ventas.",
      "Nexo ofrece formación. [domicilio omitido] Ayudamos con ventas.",
    ],
    [
      "Nexo ofrece formación. Dirección: Calle Simulada 123,\n\nServicios: Formación de equipos.",
      "Nexo ofrece formación. [domicilio omitido] Servicios: Formación de equipos.",
    ],
  ]) {
    await t.test(expected, async () => {
      const result = await api(`/brands/${brand.id}/context/import`, { text });
      assert.equal(result.status, 201);
      assert.equal(result.data.evidence[0].excerpt, expected);
      assert.equal(result.data.draft.description, expected);
    });
  }
});

test("company-2 inline contact labels do not erase management terminology or substring matches", async () => {
  const text =
    "Empresa: Nexo sintético\nLa dirección estratégica prepara equipos de ventas. Subdirección: formación y aprendizaje. Redirección: procesos digitales. Dirección comercial y domicilio fiscal son temas del curso.";
  const result = await api(`/brands/${brand.id}/context/import`, { text });
  assert.equal(result.status, 201);
  const expected = text.replaceAll("\n", " ");
  assert.equal(result.data.evidence[0].excerpt, expected);
  assert.equal(result.data.draft.description, expected);
  assert.ok(result.data.draft.pillars.includes("Formación y aprendizaje"));
});

test("company-2 HTML metadata, HTML paragraphs and plain text use the same persisted redaction", async (t) => {
  const business =
    "Nexo ofrece formación de procesos para equipos comerciales.";
  for (const type of ["html-metadata", "html-paragraph", "plain-text"]) {
    await t.test(type, async () => {
      const url = `https://example.com/synthetic-company-2-${type}`;
      const source = `${business} Dirección: Av. Simulada 123, Dpto. 4, Ciudad Ficticia. Ayudamos a equipos con ventas.`;
      const html =
        type === "html-metadata"
          ? `<html lang="es"><head><title>Nexo sintético</title><meta name="description" content="${source.replace("Dirección:", "Direcci&oacute;n&colon;")}"></head><body><p>${source}</p></body></html>`
          : `<html lang="es"><head><title>Nexo sintético</title></head><body><p>${source}</p></body></html>`;
      pages.set(
        url,
        () =>
          new Response(type === "plain-text" ? source : html, {
            headers: {
              "content-type":
                type === "plain-text" ? "text/plain" : "text/html",
            },
          }),
      );
      const result = await api(`/brands/${brand.id}/context/import`, {
        website: url,
      });
      assert.equal(result.status, 201);
      assert.equal(result.data.evidence[0].status, "read");
      assert.equal(result.data.evidence[0].url, url);
      const history = await api(`/brands/${brand.id}/context`);
      assert.equal(history.status, 200);
      const persisted = history.data.imports.find(
        (item) => item.id === result.data.id,
      );
      assert.ok(persisted);
      for (const inspection of [result.data, persisted]) {
        for (const text of [
          inspection.evidence[0].excerpt,
          inspection.draft.description,
        ]) {
          assert.doesNotMatch(text, /Simulada|Ficticia|Dpto\. 4/);
          assert.ok(text.includes(business), text);
          assert.match(text, /Ayudamos a equipos con ventas\./);
          assert.match(text, /\[domicilio omitido\]/);
        }
      }
    });
  }
});

test("company-2 address redaction precedes excerpt and description truncation", async () => {
  const prefix = "Nexo ofrece formación. " + "contexto empresarial ".repeat(93);
  const result = await api(`/brands/${brand.id}/context/import`, {
    text: `${prefix}Dirección: Calle Simulada 123, Ciudad Ficticia. Ayudamos con ventas.`,
  });
  assert.equal(result.status, 201);
  for (const text of [
    result.data.evidence[0].excerpt,
    result.data.draft.description,
  ]) {
    assert.ok(text.length <= 2_000);
    assert.doesNotMatch(text, /Calle|Simulada|Ficticia/);
    assert.match(text, /Nexo ofrece formación\./);
  }
});

test("company-2 pre-fix history is redacted on read without mutating original evidence or metadata", async () => {
  const legacy = saveRecord(brand.id, "contextImports", {
    id: randomUUID(),
    inspectedAt: "2026-10-18T00:00:00.000Z",
    method: "heuristic",
    draft: { name: "Empresa sintética histórica", description: originalText },
    evidence: [
      {
        id: "synthetic-legacy-evidence",
        url: "https://example.com/synthetic-history",
        title:
          "Fuente sintética. Dirección: Av. Simulada 123, Ciudad Ficticia.",
        excerpt: originalText,
        status: "provided",
        platform: "provided",
        reason:
          "Texto aportado. Domicilio: Calle Simulada 12, Ciudad Ficticia. Falta validación externa.",
        error:
          "Error sintético. Address: 123 Fictional St., Synthetic City. Reintenta con texto propio.",
      },
    ],
    warnings: [
      "Aviso sintético. Dirección: Calle Simulada 12, Ciudad Ficticia. Revisa la propuesta.",
    ],
  });
  const beforeRead = listRecords(brand.id, "contextImports").find(
    (item) => item.id === legacy.id,
  );
  const history = await api(`/brands/${brand.id}/context`);
  assert.equal(history.status, 200);
  const visible = history.data.imports.find((item) => item.id === legacy.id);
  assert.ok(visible);
  assertOriginalAddressRedacted(visible);
  assert.doesNotMatch(
    JSON.stringify(visible),
    /Simulada|Ficticia|Fictional|Synthetic City/,
  );
  assert.equal(visible.inspectedAt, legacy.inspectedAt);
  assert.equal(visible.draft.name, legacy.draft.name);
  for (const key of ["id", "url", "status", "platform"]) {
    assert.equal(visible.evidence[0][key], legacy.evidence[0][key]);
  }
  assert.match(visible.evidence[0].title, /Fuente sintética\./);
  assert.match(visible.evidence[0].reason, /Falta validación externa\./);
  assert.match(visible.evidence[0].error, /Reintenta con texto propio\./);
  assert.match(visible.warnings[0], /Revisa la propuesta\./);
  assert.deepEqual(
    listRecords(brand.id, "contextImports").find(
      (item) => item.id === legacy.id,
    ),
    beforeRead,
  );
});
