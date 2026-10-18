import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-studio-1-"));
process.env.DATA_DIR = dataDir;
delete process.env.OPENAI_API_KEY;
let server, origin, dbModule, cookie, brand, reference;

async function request(route, { method = "GET", body } = {}) {
  const response = await fetch(`${origin}/api${route}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  return {
    status: response.status,
    data,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
const publishable = (piece) =>
  [
    piece.title,
    piece.hook,
    piece.script,
    piece.caption,
    piece.cta,
    ...piece.scenes.map((scene) => scene.text),
  ].join("\n");
async function draft(input) {
  const response = await request(`/brands/${brand.id}/draft`, {
    method: "POST",
    body: input,
  });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  assert.equal(response.data.generationEngine, "heuristic");
  assert.equal(response.data.status, "draft");
  return response.data;
}

before(async () => {
  const { createApp } = await import("../server/index.mjs");
  dbModule = await import("../server/db.mjs");
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const registration = await request("/auth/register", {
    method: "POST",
    body: {
      name: "QA sintético Studio",
      email: `studio-${randomUUID()}@example.com`,
      password: "secret-password-30x",
    },
  });
  assert.equal(registration.status, 201);
  cookie = registration.cookie;
  const response = await request("/brands", {
    method: "POST",
    body: {
      name: "Faro · fixture sintética",
      industry: "Formación operativa",
      market: "Chile",
      pillars: ["Inventario sin reuniones"],
      audience: [
        {
          id: "ops",
          name: "Jefas de operaciones de librerías",
          role: "Operaciones",
          needs: "Reducir quiebres de inventario sin añadir reuniones",
          stage: "Explorar",
        },
        {
          id: "teachers",
          name: "Docentes rurales",
          role: "Docencia",
          needs: "Preparar clases sin conexión con poco tiempo",
          stage: "Explorar",
        },
      ],
    },
  });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  brand = response.data;
  reference = dbModule.saveRecord(brand.id, "references", {
    title: "Bitácora de faltantes",
    url: "https://example.com/qa-studio-inventario",
    text: "El ornitorrinco violeta domina las estanterías",
    status: "analyzed",
    analysis: {
      adaptation: "Crear un post original con una decisión verificable.",
      segmentIds: [brand.audience[0].id],
    },
  });
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  dbModule?.db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("idea propia: cuatro láminas, CTA exacto y dirección libre fuera del texto publicable", async () => {
  const instructions =
    "Haz un carrusel de 4 láminas. Incluye un ejemplo hipotético, sin cifras ni testimonios. Revisión pendiente: CANARIO_EDITORIAL. CTA final exacto: «Descarga la plantilla de inventario.»";
  const piece = await draft({
    format: "carousel",
    channel: "instagram",
    segmentId: brand.audience[0].id,
    instructions,
  });
  assert.doesNotMatch(
    publishable(piece),
    /Dirección editorial:|CANARIO_EDITORIAL|Haz un carrusel/,
  );
  assert.equal(piece.cta, "Descarga la plantilla de inventario.");
  assert.equal((piece.script.match(/^Lámina \d+:/gm) || []).length, 4);
  assert.equal(piece.scenes.length, 4);
  assert.match(piece.script, /Jefas de operaciones de librerías/);
  assert.match(
    piece.script,
    /Reducir quiebres de inventario sin añadir reuniones/,
  );
  assert.match(piece.script, /[Ee]jemplo hipotético/);
  assert.equal(piece.editorialBrief.instructions, instructions);
  assert.ok(piece.editorialBrief.notes.length);
});

test("referencia: Reel de tres escenas adapta la necesidad y conserva procedencia sin copiar la fuente", async () => {
  const instructions =
    "Reel en español con 3 escenas para clases sin conexión. No copies frases de la fuente. CTA final exacto: Guarda esta guía para tu próxima clase.";
  const piece = await draft({
    referenceId: reference.id,
    format: "reel",
    channel: "tiktok",
    segmentId: brand.audience[1].id,
    instructions,
  });
  assert.doesNotMatch(
    publishable(piece),
    /Dirección editorial:|Reel en español con|ornitorrinco violeta|Crear un post original/,
  );
  assert.equal(piece.cta, "Guarda esta guía para tu próxima clase.");
  assert.equal((piece.script.match(/^Escena \d+:/gm) || []).length, 3);
  assert.equal(piece.scenes.length, 3);
  assert.match(piece.script, /Docentes rurales/);
  assert.match(piece.script, /Preparar clases sin conexión con poco tiempo/);
  assert.equal(piece.referenceId, reference.id);
  assert.equal(piece.editorialBrief.referenceUrl, reference.url);
  assert.equal(piece.editorialBrief.instructions, instructions);
});

test("oportunidad: Newsletter con asunto, saludo y secciones, sin mandato residual de post", async () => {
  // Same payload composition as OpportunityDetail.create: adaptation + team directions.
  const instructions =
    "Crear un post original para Jefas de operaciones de librerías.\n\nNewsletter en español con asunto, saludo y dos secciones: Registrar y Revisar. Usa ejemplo hipotético y ninguna cifra ni testimonio. CTA final exacto: Responde FICHA para recibir la plantilla.";
  const piece = await draft({
    referenceId: reference.id,
    format: "newsletter",
    channel: "linkedin",
    segmentId: brand.audience[0].id,
    instructions,
  });
  assert.doesNotMatch(
    publishable(piece),
    /Dirección editorial:|Crear un post original|Newsletter en español con/,
  );
  assert.match(piece.script, /^Asunto: /);
  assert.match(piece.script, /Hola, Jefas de operaciones de librerías/);
  assert.match(piece.script, /^Registrar\n/m);
  assert.match(piece.script, /^Revisar\n/m);
  assert.equal(piece.cta, "Responde FICHA para recibir la plantilla.");
  assert.equal(piece.editorialBrief.instructions, instructions);
  assert.equal(piece.format, "newsletter");
  assert.equal(piece.channel, "linkedin");
});

test("10k instructions and long context remain complete in the brief and survive the piece save roundtrip", async () => {
  const { PIECE_LIMITS } = await import("../server/piece-contract.mjs");
  const instructions = "I".repeat(10000),
    angle = "E".repeat(5000),
    needs = "N".repeat(3000);
  const current = dbModule.getBrand(brand.id);
  current.audience[0].needs = needs;
  dbModule.saveBrand(current);
  const longReference = dbModule.saveRecord(brand.id, "references", {
    title: "R".repeat(300),
    analysis: { adaptation: angle, segmentIds: [brand.audience[0].id] },
  });
  const piece = await draft({
    referenceId: longReference.id,
    segmentId: brand.audience[0].id,
    format: "video",
    instructions,
  });
  assert.equal(piece.editorialBrief.instructions, instructions);
  assert.equal(piece.editorialBrief.angle, angle);
  assert.equal(piece.editorialBrief.audienceNeeds, needs);
  assert.ok(!publishable(piece).includes(instructions));
  assert.ok(!piece.script.includes(angle));
  assert.ok(piece.title.length <= 200);
  for (const field of ["title", "hook", "script", "caption", "cta"])
    assert.ok(piece[field].length <= PIECE_LIMITS[field], field);
  assert.ok(piece.scenes.length <= PIECE_LIMITS.scenes);
  assert.ok(
    piece.scenes.every((scene) => scene.text.length <= PIECE_LIMITS.sceneText),
  );
  const saved = await request(`/brands/${brand.id}/pieces/${piece.id}`, {
    method: "PATCH",
    body: {
      title: piece.title,
      hook: piece.hook,
      script: piece.script,
      caption: piece.caption,
      cta: "CTA editado",
      scenes: piece.scenes,
    },
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.script, piece.script);
  assert.equal(saved.data.cta, "CTA editado");
  assert.deepEqual(saved.data.editorialBrief, piece.editorialBrief);
  const reloaded = dbModule.getRecord(brand.id, "pieces", piece.id);
  assert.deepEqual(reloaded.editorialBrief, piece.editorialBrief);
});

test("explicit controls override recognised directions without losing them in the brief", async () => {
  const instructions =
    "Haz un carrusel de 3 láminas con ejemplo hipotético. CTA final exacto: «CTA anterior.»";
  const piece = await draft({
    topic: "Tema definido por el equipo",
    format: "carousel",
    channel: "instagram",
    segmentId: brand.audience[1].id,
    instructions,
    unitCount: 8,
    cta: "CTA elegido 😀.",
    includeExample: false,
  });
  assert.equal(piece.title, "Tema definido por el equipo");
  assert.equal(piece.scenes.length, 8);
  assert.equal(piece.cta, "CTA elegido 😀.");
  assert.equal(piece.editorialBrief.applied.unitCount, 8);
  assert.equal(piece.editorialBrief.applied.includeExample, false);
  assert.equal(piece.editorialBrief.instructions, instructions);
  assert.doesNotMatch(
    publishable(piece),
    /CTA anterior|[Ee]jemplo hipotético|Haz un carrusel/,
  );
  assert.match(piece.script, /Preparar clases sin conexión con poco tiempo/);
});

test("plain CTA stops before another direction; unsupported counts stay visible for review", async () => {
  const instructions =
    "Haz un video de 12 escenas. CTA final exacto: Guarda esta guía. No incluyas cifras ni testimonios.";
  const piece = await draft({
    format: "video",
    segmentId: brand.audience[1].id,
    instructions,
  });
  assert.equal(piece.cta, "Guarda esta guía.");
  assert.equal(piece.scenes.length, 5);
  assert.match(piece.editorialBrief.notes.join("\n"), /12.*no está admitida/);
  assert.doesNotMatch(publishable(piece), /No incluyas cifras|12 escenas/);
});

test("post is readable prose and only interpreted CTA is copied from the brief", async () => {
  const piece = await draft({
    format: "post",
    segmentId: brand.audience[1].id,
    instructions:
      "DIRECTRIZ_LIBRE_SIN_INTERPRETAR. No añadas un ejemplo hipotético. CTA final exacto: «Comparte tu pregunta.»",
  });
  assert.equal(piece.cta, "Comparte tu pregunta.");
  assert.match(piece.script, /Registrar el punto de partida/);
  assert.match(piece.script, /Revisar lo ocurrido/);
  assert.equal(piece.editorialBrief.applied.includeExample, false);
  assert.doesNotMatch(
    publishable(piece),
    /DIRECTRIZ_LIBRE_SIN_INTERPRETAR|Escena \d|Lámina \d/,
  );
});

test("invalid structured controls and 10001 instructions do not persist a draft", async () => {
  const count = dbModule.listRecords(brand.id, "pieces").length;
  for (const body of [
    { topic: "T".repeat(201) },
    { topic: 4 },
    { cta: "C".repeat(2001) },
    { cta: {} },
    { unitCount: 2 },
    { unitCount: 9 },
    { unitCount: 3.5 },
    { unitCount: "4" },
    { includeExample: "yes" },
    { instructions: "I".repeat(10001) },
  ]) {
    const response = await request(`/brands/${brand.id}/draft`, {
      method: "POST",
      body,
    });
    assert.equal(response.status, 400, JSON.stringify(body).slice(0, 80));
  }
  assert.equal(dbModule.listRecords(brand.id, "pieces").length, count);
});
