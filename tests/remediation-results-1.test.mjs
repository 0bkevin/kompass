import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import express from "express";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "remediation-results-1-"));
process.env.DATA_DIR = directory;
const storage = await import("../server/db.mjs");
const auth = await import("../server/auth.mjs");
const { createAudienceInsightsRouter, buildInsights } = await import("../server/audience-insights.mjs");

const personalNote = "SINTÉTICO. Contacto individual: Persona QA, persona-qa@example.com, teléfono +52 55 1234 5678; pidió formación.";
const metrics = { views: 1500, engagement: 100, leads: 10 };
let server;
let origin;

function account() {
  const user = auth.createUser({
    name: "QA resultados sintéticos",
    email: `${randomUUID()}@example.test`,
    passwordHash: "fixture-only",
  });
  const token = randomUUID();
  storage.db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)")
    .run(auth.tokenHash(token), user.id, Date.now() + 60_000);
  return { ...user, cookie: `radar_session=${token}` };
}

function fixture() {
  const user = account();
  const brand = storage.saveBrand({
    name: "Empresa sintética de resultados",
    pillars: ["Ventas"],
    audience: [{ id: randomUUID(), name: "Equipos comerciales", role: "Dirección", needs: "Mejorar ventas", stage: "Validación" }],
  });
  storage.db.prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,'owner')")
    .run(brand.id, user.id);
  const piece = storage.saveRecord(brand.id, "pieces", {
    title: "Pieza sintética sobre ventas",
    script: "Aprendizaje comercial agregado.",
    channel: "linkedin", format: "post", status: "approved", segmentId: brand.audience[0].id,
  });
  return { user, brand, piece };
}

async function request(f, body, { user = f.user, route = "outcome" } = {}) {
  const response = await fetch(`${origin}/api/brands/${f.brand.id}/${route === "insights" ? "insights" : `pieces/${f.piece.id}/outcome`}`, {
    method: route === "insights" ? "GET" : "POST",
    headers: { ...(user ? { cookie: user.cookie } : {}), "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json() };
}

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", createAudienceInsightsRouter());
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => { server.close(resolve); server.closeAllConnections?.(); });
  storage.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("original HTTP repro: the literal contact note cannot be saved or exposed by insights", async () => {
  const f = fixture();
  const before = storage.getRecord(f.brand.id, "pieces", f.piece.id);
  const result = await request(f, { metrics, notes: personalNote });
  const outcomes = storage.listRecords(f.brand.id, "outcomes");
  const insights = await request(f, undefined, { route: "insights" });
  assert.equal(result.status, 400, `Observed ${result.status}; persisted contact note: ${outcomes.some((item) => item.notes === personalNote)}; exposed by insights: ${JSON.stringify(insights.data).includes("persona-qa@example.com")}`);
  assert.match(result.data.error, /agregad.*elimina emails, teléfonos y fichas/);
  assert.ok(!JSON.stringify(result.data).includes("persona-qa@example.com"));
  assert.deepEqual(outcomes, []);
  assert.deepEqual(storage.getRecord(f.brand.id, "pieces", f.piece.id), before);
  assert.ok(!JSON.stringify(insights.data).includes("persona-qa@example.com"));
});

test("contact details and individual records are rejected atomically on a correction", async () => {
  const f = fixture();
  const saved = await request(f, { metrics, notes: "Medición a 7 días; el grupo pide ejemplos prácticos." });
  assert.equal(saved.status, 200);
  const beforePiece = storage.getRecord(f.brand.id, "pieces", f.piece.id);
  const beforeOutcome = storage.getRecord(f.brand.id, "outcomes", saved.data.id);
  const beforeActivity = storage.db.prepare("SELECT COUNT(*) AS n FROM activity WHERE brand_id=?").get(f.brand.id).n;
  for (const notes of [
    personalNote,
    "Escribir a persona-qa@example.com para la formación.",
    "Llamar al +52 55 1234 5678 para seguimiento.",
    "SINTÉTICO. Nombre: Persona QA; cargo: Directora; necesidad: formación.",
    "SINTÉTICO. Contacto: Persona QA; interés: formación.",
    "Nombre,Cargo,Necesidad\nPersona QA,Directora,formación",
  ]) {
    const result = await request(f, { metrics: { views: 999, engagement: 20, leads: 1 }, notes });
    assert.equal(result.status, 400);
    assert.match(result.data.error, /^Notas:/);
    assert.ok(!JSON.stringify(result.data).includes("Persona QA"));
    assert.deepEqual(storage.getRecord(f.brand.id, "outcomes", saved.data.id), beforeOutcome);
    assert.deepEqual(storage.getRecord(f.brand.id, "pieces", f.piece.id), beforePiece);
  }
  assert.equal(storage.db.prepare("SELECT COUNT(*) AS n FROM activity WHERE brand_id=?").get(f.brand.id).n, beforeActivity);
});

test("aggregate notes retain the 5000 character limit, metrics, piece identity and idempotent correction", async () => {
  const f = fixture();
  const notes = "7 días: 100 interacciones y 10 contactos en el grupo. Probar más ejemplos de formación.";
  const first = await request(f, { metrics, notes, publishedAt: "2026-01-01T12:00:00.000Z" });
  assert.equal(first.status, 200);
  const correctedMetrics = { views: 1700, engagement: 120, leads: 12 };
  const second = await request(f, { metrics: correctedMetrics, notes: "a".repeat(5000) });
  assert.equal(second.status, 200);
  assert.equal(second.data.id, first.data.id);
  assert.equal(second.data.createdAt, first.data.createdAt);
  assert.equal(second.data.publishedAt, first.data.publishedAt);
  assert.equal(second.data.pieceId, f.piece.id);
  assert.equal(second.data.notes.length, 5000);
  assert.deepEqual(second.data.metrics, correctedMetrics);
  const tooLong = await request(f, { metrics, notes: "a".repeat(5001) });
  assert.equal(tooLong.status, 400);
  assert.match(tooLong.data.error, /máximo 5000/);
  const omitted = await request(f, { metrics: correctedMetrics });
  assert.equal(omitted.status, 200);
  assert.equal(omitted.data.notes, second.data.notes);
  const cleared = await request(f, { metrics: correctedMetrics, notes: "" });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.data.notes, "");
  assert.equal(storage.listRecords(f.brand.id, "outcomes").length, 1);
});

test("legacy personal notes are omitted from reads without mutating rows or dropping metrics", async () => {
  const f = fixture();
  storage.saveRecord(f.brand.id, "pieces", { ...f.piece, status: "published" });
  const legacy = storage.saveRecord(f.brand.id, "outcomes", {
    pieceId: f.piece.id, title: f.piece.title, channel: f.piece.channel,
    segmentId: f.piece.segmentId, origin: "manual", metrics,
    publishedAt: "2026-01-01T12:00:00.000Z", notes: personalNote,
  });
  const result = await request(f, undefined, { route: "insights" });
  assert.equal(result.status, 200);
  assert.equal(result.data.learning.outcomes.length, 1);
  const projected = result.data.learning.outcomes[0];
  assert.equal(projected.notes, undefined);
  assert.deepEqual(projected, Object.fromEntries(Object.entries(legacy).filter(([key]) => key !== "notes")));
  assert.deepEqual(result.data.learning.bySegment[0], {
    segmentId: f.piece.segmentId, name: f.brand.audience[0].name, pieces: 1, ...metrics,
  });
  assert.deepEqual(storage.getRecord(f.brand.id, "outcomes", legacy.id), legacy);
  const correctedMetrics = { views: 1800, engagement: 150, leads: 15 };
  const corrected = await request(f, { metrics: correctedMetrics });
  assert.equal(corrected.status, 200);
  assert.equal(corrected.data.id, legacy.id);
  assert.equal(corrected.data.createdAt, legacy.createdAt);
  assert.equal(corrected.data.publishedAt, legacy.publishedAt);
  assert.equal(corrected.data.notes, undefined);
  assert.deepEqual(corrected.data.metrics, correctedMetrics);
  assert.ok(!JSON.stringify(corrected.data).includes("persona-qa@example.com"));
  assert.equal(storage.listRecords(f.brand.id, "outcomes").length, 1);
  assert.equal(storage.getRecord(f.brand.id, "outcomes", legacy.id).notes, undefined);
});

test("omitting legacy notes does not change a comparable 3+3 editorial learning", () => {
  const f = fixture();
  storage.deleteRecord(f.brand.id, "pieces", f.piece.id);
  const ref = storage.saveRecord(f.brand.id, "references", {
    title: "Ventas prácticas", text: "Ventas con ejemplos para equipos comerciales.",
    url: "https://example.com/synthetic-reference", source: "Publicación sintética", platform: "linkedin",
    format: "post", topic: "Ventas", status: "new", tags: [],
  });
  for (let index = 0; index < 6; index++) {
    const piece = storage.saveRecord(f.brand.id, "pieces", {
      ...f.piece, id: randomUUID(), status: "published",
      title: index < 3 ? "Ventas prácticas" : "Operaciones y gestión",
      script: index < 3 ? "Ventas aplicadas" : "Operaciones con casos",
      ...(index < 3 ? { referenceId: ref.id } : {}),
    });
    storage.saveRecord(f.brand.id, "outcomes", {
      pieceId: piece.id, title: piece.title, channel: piece.channel, segmentId: piece.segmentId,
      publishedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      metrics: { views: 100, engagement: index < 3 ? 20 : 5, leads: 1 },
      origin: "manual", notes: index === 0 ? personalNote : "Medición del grupo a 2 días.",
    });
  }
  const before = storage.listRecords(f.brand.id, "outcomes");
  const result = buildInsights(f.brand);
  const withoutPersonalNotes = buildInsights(f.brand, { outcomes: before.map((item) => ({ ...item, notes: "Medición del grupo a 2 días." })) });
  assert.equal(result.learning.outcomes.length, 6);
  assert.equal(result.learning.outcomes.filter((item) => item.notes === undefined).length, 1);
  assert.deepEqual(result.learning.bySegment, withoutPersonalNotes.learning.bySegment);
  assert.deepEqual(result.opportunities, withoutPersonalNotes.opportunities);
  assert.match(result.opportunities[0].reasons.join(" "), /Ajuste editorial.*\+8 puntos.*20\.0% frente a 5\.0%/);
  assert.deepEqual(storage.listRecords(f.brand.id, "outcomes"), before);
});

test("reviewers and other brands retain their read and write boundaries", async () => {
  const f = fixture();
  const reviewer = account();
  const outsider = account();
  storage.db.prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,'reviewer')").run(f.brand.id, reviewer.id);
  assert.equal((await request(f, { metrics, notes: "Resumen agregado." })).status, 200);
  assert.equal((await request(f, { metrics, notes: "Resumen agregado." }, { user: reviewer })).status, 403);
  assert.equal((await request(f, { metrics, notes: "Resumen agregado." }, { user: outsider })).status, 404);
  assert.equal((await request(f, undefined, { user: reviewer, route: "insights" })).status, 200);
  assert.equal((await request(f, undefined, { user: outsider, route: "insights" })).status, 404);
  assert.equal((await request(f, undefined, { user: null, route: "insights" })).status, 401);
});
