import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kompass-feedback-"));
process.env.DATA_DIR = directory;
process.env.SOURCE_ACCESS_POLICY_FILE = path.join(
  directory,
  "no-permissions.json",
);
process.env.OPENAI_API_KEY = "";
process.env.YOUTUBE_DATA_API_KEY = "";
const storage = await import("../server/db.mjs");
const auth = await import("../server/auth.mjs");
const { buildInsights } = await import("../server/audience-insights.mjs");
const {
  createOpportunityFeedbackRouter,
  listOpportunityFeedback,
  summarizeOpportunityFeedback,
} = await import("../server/opportunity-feedback.mjs");
let server, origin, owner, editor, reviewer, outsider;

function account() {
  const user = auth.createUser({
    name: "Equipo editorial sintético",
    email: `${randomUUID()}@example.invalid`,
    passwordHash: "test-only",
  });
  const token = randomUUID();
  storage.db
    .prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    )
    .run(auth.tokenHash(token), user.id, Date.now() + 600_000);
  return { ...user, cookie: `radar_session=${token}` };
}

function fixture() {
  const brand = storage.saveBrand({
    name: "Empresa de prueba editorial",
    industry: "Educación",
    description: "Herramientas para equipos de formación",
    market: "Latinoamérica",
    pillars: ["Formación"],
    audience: [
      {
        id: randomUUID(),
        name: "Equipos de formación",
        needs: "Evaluar propuestas de formación",
      },
      {
        id: randomUUID(),
        name: "Equipos de operaciones",
        needs: "Documentar procesos",
      },
    ],
  });
  for (const [user, role] of [
    [owner, "owner"],
    [editor, "editor"],
    [reviewer, "reviewer"],
  ])
    storage.db
      .prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?)")
      .run(brand.id, user.id, role);
  const reference = storage.saveRecord(brand.id, "references", {
    title: "Una guía pública de formación",
    text: "Comparar propuestas de formación con criterios documentados.",
    url: "https://example.invalid/formacion",
    source: "Material público sintético",
    platform: "web",
    topic: "Formación",
    format: "article",
    status: "new",
    metrics: {},
    tags: [],
  });
  const opportunity = buildInsights(brand).opportunities[0];
  return {
    brand,
    reference,
    opportunity,
    route: `/brands/${brand.id}/opportunity-feedback`,
    input: {
      opportunityId: opportunity.id,
      referenceIds: [reference.id],
      segmentId: brand.audience[0].id,
      decision: "accepted",
    },
  };
}

async function request(
  route,
  { user = owner, method = "GET", body, headers = {}, rawBody } = {},
) {
  const response = await fetch(`${origin}/api${route}`, {
    method,
    headers: {
      ...(user ? { cookie: user.cookie } : {}),
      ...(body !== undefined || rawBody !== undefined
        ? { "content-type": "application/json" }
        : {}),
      ...headers,
    },
    ...(rawBody !== undefined
      ? { body: rawBody }
      : body !== undefined
        ? { body: JSON.stringify(body) }
        : {}),
  });
  return {
    status: response.status,
    headers: response.headers,
    data: await response.json(),
  };
}
const post = (f, body = f.input, extra = {}) =>
  request(f.route, { method: "POST", body, ...extra });

before(async () => {
  owner = account();
  editor = account();
  reviewer = account();
  outsider = account();
  const app = express();
  app.use("/api", auth.checkOrigin, express.json());
  app.use("/api", createOpportunityFeedbackRouter());
  app.use((error, _req, res, _next) => {
    const status = error.status || 500;
    res
      .status(status)
      .json({ error: status === 500 ? "Error interno" : error.message });
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((done) => {
    server.close(done);
    server.closeAllConnections();
  });
  storage.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("feedback requires a session and company membership; only owner/editor can write", async () => {
  const f = fixture();
  for (const [user, status] of [
    [null, 401],
    [outsider, 404],
  ]) {
    assert.equal((await request(f.route, { user })).status, status);
    assert.equal((await post(f, f.input, { user })).status, status);
  }
  assert.equal((await post(f, f.input, { user: reviewer })).status, 403);
  const read = await request(f.route, { user: reviewer });
  assert.equal(read.status, 200);
  assert.deepEqual(read.data.feedback, []);
  assert.equal(read.data.summary.current, 0);
  assert.equal(read.headers.get("cache-control"), "no-store");
  assert.equal(listOpportunityFeedback(f.brand.id).length, 0);
  assert.equal((await post(f, f.input, { user: editor })).status, 201);
  assert.equal((await post(f)).status, 201);
});

test("persists an auditable editorial decision with no actor identity or contact fields", async () => {
  const f = fixture();
  const response = await post(f, {
    ...f.input,
    note: "El tema aborda la necesidad declarada del grupo; revisar el ejemplo.",
  });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  const record = listOpportunityFeedback(f.brand.id)[0];
  assert.equal(response.data.id, record.id);
  assert.equal(record.decision, "accepted");
  assert.deepEqual(record.referenceIds, [f.reference.id]);
  assert.match(record.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(record.audit.actorRole, "owner");
  assert.equal(record.audit.revision, 1);
  assert.equal(record.audit.basis, "editorial_validation");
  assert.equal(record.audit.supersedesId, null);
  assert.equal(response.data.currentFingerprint, record.fingerprint);
  assert.equal(response.data.stale, false);
  assert.ok(record.createdAt && record.updatedAt);
  const stored = JSON.stringify(record);
  assert.equal(stored.includes(owner.id), false);
  assert.equal(stored.includes(owner.name), false);
  assert.equal(stored.includes(owner.email), false);
  assert.doesNotMatch(
    stored,
    /createdBy|userId|email|userAgent|probability|successRate|views|consumers/,
  );
  const read = await request(f.route, { user: reviewer });
  assert.equal(read.data.feedback[0].id, record.id);
  assert.deepEqual(read.data.summary.decisions, {
    accepted: 1,
    rejected: 0,
    needs_evidence: 0,
  });
  assert.match(read.data.summary.notice, /Validación editorial/);
  assert.match(
    read.data.summary.notice,
    /No representa.*probabilidad de éxito/,
  );
});

test("all three decisions remain editable through append-only revisions; summary uses the latest per segment", async () => {
  const f = fixture();
  const accepted = await post(f);
  const rejected = await post(
    f,
    { ...f.input, decision: "rejected" },
    { user: editor },
  );
  const needs = await post(f, {
    ...f.input,
    decision: "needs_evidence",
    note: "Falta contrastar la propuesta con otra referencia pública.",
  });
  const secondSegment = await post(f, {
    ...f.input,
    segmentId: f.brand.audience[1].id,
  });
  assert.equal(accepted.status, 201);
  assert.equal(rejected.status, 201);
  assert.equal(needs.status, 201);
  assert.equal(secondSegment.status, 201);
  const history = listOpportunityFeedback(f.brand.id);
  assert.equal(history.length, 4);
  assert.equal(rejected.data.audit.supersedesId, accepted.data.id);
  assert.equal(rejected.data.audit.actorRole, "editor");
  assert.equal(needs.data.audit.supersedesId, rejected.data.id);
  assert.equal(needs.data.audit.revision, 3);
  assert.equal(secondSegment.data.audit.revision, 1);
  const read = (await request(f.route)).data;
  assert.equal(read.summary.total, 4);
  assert.equal(read.summary.current, 2);
  assert.equal(read.summary.superseded, 2);
  assert.equal(read.summary.stale, 0);
  assert.deepEqual(read.summary.decisions, {
    accepted: 1,
    rejected: 0,
    needs_evidence: 1,
  });
  assert.equal(read.summary.bySegment.length, 2);
  assert.equal(
    read.feedback.find((item) => item.id === accepted.data.id).superseded,
    true,
  );
  const summary = summarizeOpportunityFeedback(f.brand, {
    feedback: [...history].reverse(),
    references: [f.reference],
    sources: [],
    signals: [],
    opportunities: [f.opportunity],
  });
  assert.deepEqual(
    summary,
    read.summary,
    "report summary and HTTP view use the same contract independent of input order",
  );
});

test("rejects missing, malformed or extra input without recording data", async () => {
  const f = fixture();
  for (const body of [
    {},
    [],
    null,
    { ...f.input, decision: "successful" },
    { ...f.input, decision: 1 },
    { ...f.input, opportunityId: "" },
    { ...f.input, segmentId: "" },
    { ...f.input, referenceIds: [] },
    { ...f.input, referenceIds: [f.reference.id, f.reference.id] },
    { ...f.input, referenceIds: [123] },
    { ...f.input, referenceIds: ["bad id"] },
    {
      ...f.input,
      referenceIds: Array.from({ length: 101 }, () => randomUUID()),
    },
    { ...f.input, note: 5 },
    { ...f.input, note: "x".repeat(1001) },
    { ...f.input, userId: owner.id },
    { ...f.input, fingerprint: "forged" },
    { ...f.input, results: { views: 1000 } },
  ]) {
    const response = await post(f, body);
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  assert.equal(
    (await request(f.route, { method: "POST", rawBody: "{" })).status,
    400,
  );
  assert.equal(listOpportunityFeedback(f.brand.id).length, 0);
});

test("notes reject contact information, individual records and credentials before persistence", async () => {
  const f = fixture();
  for (const note of [
    "Contacto: qa@example.invalid",
    "Teléfono: +34 600 123 456",
    "Nombre completo: Persona Sintética; necesidad: formación",
    "Nombre,edad,necesidad\nPersona Sintética,30,formación",
    "DNI: 12345678X",
    "Dirección: Calle sintética 3",
    "https://example.invalid/persona",
    "@persona_sintetica prefiere el tema",
    "Token: fake-test-only-credential",
    "Bearer test-only-credential",
    "sk-testcredentialonly1234567",
    "Contacto: ｑａ＠ｅｘａｍｐｌｅ．ｉｎｖａｌｉｄ",
    "<script>private()</script>",
    "Nota\u202eoculta",
  ]) {
    const response = await post(f, { ...f.input, note });
    assert.equal(response.status, 400, note);
    assert.equal(
      JSON.stringify(response.data).includes(note),
      false,
      "errors never echo rejected personal text",
    );
  }
  assert.equal(listOpportunityFeedback(f.brand.id).length, 0);
  assert.equal(
    (
      await post(f, {
        ...f.input,
        note: "El grupo necesita comparar opciones; falta evidencia del tema.",
      })
    ).status,
    201,
  );
});

test("requires a current opportunity, owned references within it, and a current segment", async () => {
  const f = fixture();
  const foreign = fixture();
  const otherReference = storage.saveRecord(f.brand.id, "references", {
    ...f.reference,
    id: randomUUID(),
    url: "https://example.invalid/otro-tema",
    topic: "Operaciones",
  });
  for (const [body, status] of [
    [{ ...f.input, opportunityId: "opportunity-removed" }, 404],
    [{ ...f.input, referenceIds: [foreign.reference.id] }, 400],
    [{ ...f.input, referenceIds: [otherReference.id] }, 400],
    [{ ...f.input, referenceIds: [randomUUID()] }, 400],
    [{ ...f.input, segmentId: foreign.brand.audience[0].id }, 400],
  ])
    assert.equal((await post(f, body)).status, status);
  storage.saveBrand({ ...f.brand, audience: [f.brand.audience[1]] });
  assert.equal((await post(f)).status, 400);
  assert.equal(listOpportunityFeedback(f.brand.id).length, 0);
  assert.equal(listOpportunityFeedback(foreign.brand.id).length, 0);
});

test("policy blocks restricted and YouTube API references, even when a public reference keeps the opportunity available", async () => {
  const f = fixture();
  for (const restricted of [
    {
      platform: "youtube",
      source: "YouTube",
      metricsOrigin: "YouTube Data API",
      url: "https://youtube.com/watch?v=abcdefghijk",
    },
    {
      platform: "web",
      source: "Otra fuente",
      url: "https://youtu.be/abcdefghijk",
    },
    { platform: "web", ingestionRestricted: true },
    { platform: "reddit", ingestionProvider: "reddit" },
    {
      platform: "web",
      ingestionAccess: {
        url: "https://unreviewed.invalid/documento",
        purpose: "metadata",
      },
    },
    { platform: "web", sourceId: randomUUID() },
  ]) {
    const reference = storage.saveRecord(f.brand.id, "references", {
      ...f.reference,
      id: randomUUID(),
      ...restricted,
    });
    const response = await post(f, {
      ...f.input,
      referenceIds: [reference.id],
    });
    assert.equal(response.status, 403, JSON.stringify(restricted));
    storage.deleteRecord(f.brand.id, "references", reference.id);
  }
  assert.equal(listOpportunityFeedback(f.brand.id).length, 0);
  storage.saveRecord(f.brand.id, "references", {
    ...f.reference,
    platform: "youtube",
    metricsOrigin: "YouTube Data API",
  });
  assert.equal((await post(f)).status, 404);
});

test("source policy revocation makes saved feedback stale without rewriting its audit history", async () => {
  const f = fixture();
  const source = storage.saveRecord(f.brand.id, "sources", {
    type: "hackernews",
    name: "HN sintético",
    enabled: true,
  });
  storage.saveRecord(f.brand.id, "references", {
    ...f.reference,
    sourceId: source.id,
  });
  const created = await post(f);
  assert.equal(created.status, 201);
  const auditBefore = listOpportunityFeedback(f.brand.id);
  storage.saveRecord(f.brand.id, "sources", { ...source, type: "youtube" });
  const read = (await request(f.route)).data;
  assert.equal(read.feedback[0].stale, true);
  assert.ok(read.feedback[0].staleReasons.includes("reference_restricted"));
  assert.equal(read.feedback[0].currentFingerprint, null);
  assert.equal(read.summary.current, 0);
  assert.equal(read.summary.stale, 1);
  assert.deepEqual(listOpportunityFeedback(f.brand.id), auditBefore);
});

test("fingerprint changes with evidence, company context, audience and admissible signals; provider metrics do not manufacture new validation", async () => {
  const f = fixture();
  const created = await post(f);
  const saved = created.data.fingerprint;
  storage.saveRecord(f.brand.id, "references", {
    ...f.reference,
    metrics: { views: 900000, likes: 50000 },
    metricsObservedAt: new Date().toISOString(),
  });
  let read = (await request(f.route)).data;
  assert.equal(read.feedback[0].stale, false);
  assert.equal(read.feedback[0].currentFingerprint, saved);
  storage.saveRecord(f.brand.id, "references", {
    ...f.reference,
    text: "La fuente corrigió su explicación.",
  });
  read = (await request(f.route)).data;
  assert.equal(read.feedback[0].stale, true);
  assert.ok(
    read.feedback[0].staleReasons.includes("evidence_or_context_changed"),
  );
  assert.notEqual(read.feedback[0].currentFingerprint, saved);
  assert.equal(read.summary.decisions.accepted, 0);
  storage.saveRecord(f.brand.id, "references", f.reference);
  for (const change of [
    { description: "Ahora la empresa se centra en otro contexto" },
    {
      audience: f.brand.audience.map((s, index) =>
        index ? s : { ...s, needs: "Otra necesidad" },
      ),
    },
  ]) {
    storage.saveBrand({ ...f.brand, ...change });
    assert.equal((await request(f.route)).data.feedback[0].stale, true);
  }
  storage.saveBrand(f.brand);
  const signal = storage.saveRecord(f.brand.id, "audienceSignals", {
    segmentId: f.input.segmentId,
    sourceType: "editorial",
    topic: "Formación",
    note: "Revisar ejemplos agregados del tema",
  });
  assert.equal((await request(f.route)).data.feedback[0].stale, true);
  storage.deleteRecord(f.brand.id, "audienceSignals", signal.id);
  assert.equal((await request(f.route)).data.feedback[0].stale, false);
  assert.equal(listOpportunityFeedback(f.brand.id)[0].fingerprint, saved);
});

test("new evidence invalidates an earlier decision; a new decision supersedes stale feedback without reviving older accepted decisions", async () => {
  const f = fixture();
  const accepted = await post(f);
  const second = storage.saveRecord(f.brand.id, "references", {
    ...f.reference,
    id: randomUUID(),
    title: "Otra perspectiva pública sobre formación",
    url: "https://example.invalid/segunda",
  });
  let read = (await request(f.route)).data;
  assert.equal(read.feedback[0].stale, true);
  const rejected = await post(f, {
    ...f.input,
    referenceIds: [second.id, f.reference.id],
    decision: "rejected",
  });
  assert.equal(rejected.status, 201);
  assert.deepEqual(
    rejected.data.referenceIds,
    [f.reference.id, second.id].sort(),
  );
  read = (await request(f.route)).data;
  assert.equal(read.summary.current, 1);
  assert.equal(read.summary.stale, 0);
  assert.equal(read.summary.superseded, 1);
  assert.deepEqual(read.summary.decisions, {
    accepted: 0,
    rejected: 1,
    needs_evidence: 0,
  });
  storage.deleteRecord(f.brand.id, "references", second.id);
  read = (await request(f.route)).data;
  assert.equal(read.summary.current, 0);
  assert.equal(read.summary.stale, 1);
  assert.equal(read.summary.decisions.accepted, 0);
  assert.equal(
    read.feedback.find((item) => item.id === accepted.data.id).superseded,
    true,
  );
  assert.ok(
    read.feedback
      .find((item) => item.id === rejected.data.id)
      .staleReasons.includes("reference_unavailable"),
  );
});

test("deleting a segment or opportunity marks feedback stale on read and never deletes its evidence IDs", async () => {
  const f = fixture();
  await post(f);
  storage.saveBrand({ ...f.brand, audience: [] });
  let read = (await request(f.route)).data;
  assert.ok(read.feedback[0].staleReasons.includes("segment_unavailable"));
  storage.saveBrand(f.brand);
  storage.deleteRecord(f.brand.id, "references", f.reference.id);
  read = (await request(f.route)).data;
  assert.ok(read.feedback[0].staleReasons.includes("opportunity_unavailable"));
  assert.ok(read.feedback[0].staleReasons.includes("reference_unavailable"));
  assert.deepEqual(read.feedback[0].referenceIds, [f.reference.id]);
  assert.equal(read.summary.current, 0);
  assert.equal(listOpportunityFeedback(f.brand.id).length, 1);
});

test("feedback has no effect on editorial priority, growth, analysis or audience hypotheses", async () => {
  const f = fixture();
  const before = buildInsights(f.brand);
  await post(f);
  await post(f, { ...f.input, decision: "rejected" });
  const after = buildInsights(f.brand);
  assert.deepEqual(after.opportunities, before.opportunities);
  assert.deepEqual(after.signals, before.signals);
  assert.deepEqual(storage.getBrand(f.brand.id), f.brand);
  assert.deepEqual(storage.listRecords(f.brand.id, "opportunityAnalyses"), []);
  assert.deepEqual(storage.listRecords(f.brand.id, "outcomes"), []);
});

test("foreign origin and expired sessions cannot append feedback", async () => {
  const f = fixture();
  const forbidden = await post(f, f.input, {
    headers: { origin: "https://foreign.invalid" },
  });
  assert.equal(forbidden.status, 403);
  const expired = account();
  storage.db
    .prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,'editor')")
    .run(f.brand.id, expired.id);
  storage.db
    .prepare("UPDATE sessions SET expires_at=? WHERE user_id=?")
    .run(Date.now() - 1, expired.id);
  assert.equal((await post(f, f.input, { user: expired })).status, 401);
  assert.equal(listOpportunityFeedback(f.brand.id).length, 0);
});
