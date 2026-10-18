import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "30x-remediation-signals-1-"),
);
process.env.DATA_DIR = directory;
process.env.DISCOVERY_ENABLED = "false";
for (const name of [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "YOUTUBE_API_KEY",
  "APIFY_API_TOKEN",
])
  process.env[name] = "";

let server;
let origin;
let cookie;
let brand;
let storage;

async function request(route, body, method = body ? "POST" : "GET") {
  const response = await fetch(`${origin}/api${route}`, {
    method,
    redirect: "error",
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}

function signalInput(values = {}) {
  return {
    segmentId: brand.audience[0].id,
    topic: "Necesidades comerciales · SINTÉTICO",
    note: "Los equipos comerciales necesitan preparar propuestas más rápido.",
    sourceType: "editorial",
    ...values,
  };
}

before(async () => {
  const { createApp } = await import("../server/index.mjs");
  storage = await import("../server/db.mjs");
  server = createApp({ apiOnly: true }).listen(0, "127.0.1.14");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.1.14:${server.address().port}`;
  const registration = await request("/auth/register", {
    name: "Equipo sintético de señales",
    email: "signals-1-synthetic@example.com",
    password: "synthetic-fixture-password-30x",
  });
  assert.equal(registration.status, 201);
  cookie = registration.cookie;
  const created = await request("/brands", {
    name: "Marca sintética de señales",
    audience: [
      {
        name: "Equipos comerciales",
        role: "Dirección comercial",
        needs: "Preparar propuestas de ventas más rápido",
        stage: "Validación",
      },
    ],
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  brand = created.data;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  storage?.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("the real UI POST rejects the reported individual audience sheet and does not return it after reload", async () => {
  const input = signalInput({
    topic: "Ficha individual · SINTÉTICO",
    note: "FICHA INDIVIDUAL SINTÉTICA. Nombre: Ana Sintética Ejemplo. Cargo: directora comercial. Necesidad individual: preparar propuestas más rápido.",
  });
  const response = await request(`/brands/${brand.id}/audience-signals`, input);
  assert.equal(
    response.status,
    400,
    `The individual sheet submitted by the UI must be rejected, got ${response.status}`,
  );
  assert.match(response.data.error, /agregad/i);
  const reloaded = await request(`/brands/${brand.id}/audience-signals`);
  assert.equal(reloaded.status, 200);
  assert.equal(
    reloaded.data.signals.some((signal) => signal.note === input.note),
    false,
  );
});

test("individual audience fields and rows remain private even without the reported sheet heading", async () => {
  const notes = [
    "Nombre: Ana Sintética Ejemplo. Cargo: directora comercial. Necesidad: preparar propuestas más rápido.",
    "Persona: Ana Sintética Ejemplo; Necesidad: preparar propuestas más rápido.",
    "Contacto sintético: Ana Sintética Ejemplo. Empresa: Laboratorio Ficticio. Interés: formación comercial.",
    "Nombre completo: Ana Sintética Ejemplo.",
    "FICHA INDIVIDUAL SINTÉTICA. Necesidad individual: preparar propuestas más rápido.",
    "Nombre completo | Cargo | Necesidad\nAna Sintética Ejemplo | Directora comercial | Preparar propuestas más rápido",
    "nombre,cargo,necesidad\nAna Sintética Ejemplo,directora comercial,preparar propuestas más rápido",
  ];
  for (const note of notes) {
    const response = await request(
      `/brands/${brand.id}/audience-signals`,
      signalInput({ note }),
    );
    assert.equal(
      response.status,
      400,
      `Individual audience record must be rejected: ${note}`,
    );
    assert.match(response.data.error, /agregad/i);
  }
});

test("aggregate observations preserve public authors, companies and cohort names", async () => {
  const notes = [
    "En 12 piezas revisadas, los equipos de Empresa Sintética Ejemplo priorizan preparar propuestas. Es una observación editorial del grupo.",
    "Nombre de empresa: Laboratorio Sintético. Necesidad: mejorar propuestas comerciales del equipo.",
    "Nombre: Laboratorio Sintético. Necesidad: mejorar propuestas comerciales del equipo.",
    "Nombre: Cohorte Sintética Octubre. Necesidad: aprender a preparar propuestas. Muestra agregada de 24 respuestas.",
    "El artículo público de Ana Sintética Ejemplo sobre ventas aporta evidencia para una hipótesis del grupo; no describe a una participante.",
    "Autora pública: Ana Sintética Ejemplo. Artículo citado: ventas para equipos. Necesidad del grupo: preparar propuestas.",
    "Nombre del autor: Ana Sintética Ejemplo. Cargo del autor: periodista. La cita trata necesidades de equipos comerciales.",
    "Cargo | Necesidad | Respuestas\nDirección comercial | Preparar propuestas | 24\nOperaciones | Reducir tareas | 18",
  ];
  for (const note of notes) {
    const input = signalInput({
      note,
      sourceType: "public_content",
      sourceUrl: "https://example.com/evidencia-sintetica-agregada",
      sampleSize: 12,
    });
    const created = await request(
      `/brands/${brand.id}/audience-signals`,
      input,
    );
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const reloaded = await request(`/brands/${brand.id}/audience-signals`);
    const saved = reloaded.data.signals.find(
      (signal) => signal.id === created.data.id,
    );
    assert.equal(saved.note, note);
    assert.equal(saved.sourceType, "public_content");
    assert.equal(saved.sourceUrl, input.sourceUrl);
  }
});

test("emails and phones remain rejected in both text fields without echoing personal details", async () => {
  const cases = [
    { note: "Contacto: persona.sintetica@example.com" },
    { topic: "persona.sintetica@example.com" },
    { note: "Teléfono sintético de contacto: +57 310 000 0000" },
    { topic: "Contacto sintético +58 414 1234567" },
  ];
  for (const fields of cases) {
    const response = await request(
      `/brands/${brand.id}/audience-signals`,
      signalInput(fields),
    );
    assert.equal(response.status, 400);
    assert.match(response.data.error, /agregad/i);
    assert.doesNotMatch(response.data.error, /persona\.sintetica|310|414/);
  }
});

test("previously stored individual sheets and contact notes are excluded from HTTP reads and the insights corpus", async () => {
  const accepted = await request(
    `/brands/${brand.id}/audience-signals`,
    signalInput({
      note: "Necesidad agregada para contrastar en equipos comerciales.",
    }),
  );
  assert.equal(accepted.status, 201);
  // Upgrade fixture only: these rows represent data saved before validation.
  // All observations about their visibility use the actual HTTP API.
  const legacy = [
    storage.saveRecord(
      brand.id,
      "audienceSignals",
      signalInput({
        topic: "Ficha individual antigua · SINTÉTICO",
        note: "FICHA INDIVIDUAL SINTÉTICA. Nombre: Ana Sintética Ejemplo. Cargo: directora comercial. Necesidad individual: preparar propuestas más rápido.",
      }),
    ),
    storage.saveRecord(
      brand.id,
      "audienceSignals",
      signalInput({
        note: "Necesidad identificada: contactar a persona.sintetica@example.com",
      }),
    ),
    storage.saveRecord(
      brand.id,
      "audienceSignals",
      signalInput({
        note: "Teléfono sintético de contacto: +57 310 000 0000",
      }),
    ),
  ];
  for (const route of ["audience-signals", "insights"]) {
    const response = await request(`/brands/${brand.id}/${route}`);
    assert.equal(response.status, 200);
    for (const row of legacy) {
      assert.equal(
        response.data.signals.some((signal) => signal.id === row.id),
        false,
        `${route} must exclude a previously saved individual record`,
      );
    }
    assert.ok(
      response.data.signals.some((signal) => signal.id === accepted.data.id),
    );
  }
  // Filtering leaves historical storage untouched and preserves scoped delete.
  for (const row of legacy) {
    const deleted = await request(
      `/brands/${brand.id}/audience-signals/${row.id}`,
      undefined,
      "DELETE",
    );
    assert.equal(deleted.status, 200);
  }
});
