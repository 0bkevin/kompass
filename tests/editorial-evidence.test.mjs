import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "kompass-editorial-evidence-"),
);
process.env.DATA_DIR = directory;
process.env.SOURCE_ACCESS_POLICY_FILE = path.join(directory, "policy.json");
process.env.OPENAI_API_KEY = "";
process.env.GEMINI_API_KEY = "";
const storage = await import("../server/db.mjs");
const auth = await import("../server/auth.mjs");
const {
  createEditorialEvidenceRouter,
  editorialEvidenceFingerprint,
  getEditorialEvidence,
  listCurrentEditorialEvidence,
  EDITORIAL_EVIDENCE_FACTORS,
} = await import("../server/editorial-evidence.mjs");
const actualFetch = globalThis.fetch;
let server, origin;

function account() {
  const user = auth.createUser({
    name: "Equipo de prueba",
    email: `${randomUUID()}@example.com`,
    passwordHash: "synthetic-session-only",
  });
  const token = randomUUID();
  storage.db
    .prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    )
    .run(auth.tokenHash(token), user.id, Date.now() + 3600000);
  return { ...user, cookie: `radar_session=${token}` };
}
function fixture(referenceFields = {}) {
  const owner = account(),
    editor = account(),
    reviewer = account(),
    outsider = account();
  const brand = storage.saveBrand({
    name: "Editorial sintética",
    audience: [],
  });
  const foreignBrand = storage.saveBrand({
    name: "Otra empresa sintética",
    audience: [],
  });
  for (const [role, user] of Object.entries({ owner, editor, reviewer }))
    storage.db
      .prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?)")
      .run(brand.id, user.id, role);
  storage.db
    .prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,'owner')")
    .run(foreignBrand.id, outsider.id);
  const reference = storage.saveRecord(brand.id, "references", {
    title: "Antes de automatizar, documenta una decisión",
    text: "Una pregunta abre el texto. La guía presenta tres pasos y cierra con sus límites.",
    source: "Texto propio aportado",
    format: "article",
    status: "new",
    ...referenceFields,
  });
  const foreignReference = storage.saveRecord(foreignBrand.id, "references", {
    title: "Material de otra empresa",
    text: "Texto privado de otro espacio de trabajo.",
    source: "manual",
  });
  return {
    brand,
    foreignBrand,
    reference,
    foreignReference,
    owner,
    editor,
    reviewer,
    outsider,
    route: `/brands/${brand.id}/references/${reference.id}/editorial-evidence`,
  };
}
function observation(factor = "hook", extra = {}) {
  return {
    factor,
    observation: "La apertura utiliza una pregunta concreta.",
    uncertainty:
      "Describe el texto; no se ha observado la reacción de la audiencia.",
    possibleHypothesis:
      "La pregunta podría ayudar a reconocer una necesidad; requiere contraste.",
    observedAt: "2026-01-01T10:00:00Z",
    support: {
      kind: "text",
      field: "text",
      quote: "Una pregunta abre el texto.",
    },
    ...extra,
  };
}
function input(state, observations = [observation()]) {
  return {
    expectedReferenceFingerprint: state.referenceFingerprint,
    expectedRevision: state.revision,
    observations,
  };
}
async function request(
  f,
  {
    method = "GET",
    cookie = f.owner.cookie,
    body,
    headers = {},
    route = f.route,
  } = {},
) {
  const response = await actualFetch(`${origin}/api${route}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      "content-type": "application/json",
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    data: await response.json(),
    headers: response.headers,
  };
}
async function save(f, observations = [observation()]) {
  const state = await request(f);
  assert.equal(state.status, 200);
  return request(f, { method: "PUT", body: input(state.data, observations) });
}
before(async () => {
  const app = express();
  app.use(express.json({ limit: "32kb" }));
  app.use("/api", createEditorialEvidenceRouter());
  app.use((error, _req, res, _next) =>
    res.status(error.status || 500).json({
      error: error.status ? error.message : "Error interno",
      code: error.code,
    }),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  });
  storage.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("both endpoints require a current session and do not expose another company's records", async () => {
  const f = fixture();
  const state = getEditorialEvidence(f.brand.id, f.reference.id);
  for (const method of ["GET", "PUT"]) {
    const options = {
      method,
      ...(method === "PUT" ? { body: input(state) } : {}),
    };
    assert.equal((await request(f, { ...options, cookie: null })).status, 401);
    assert.equal(
      (await request(f, { ...options, cookie: f.outsider.cookie })).status,
      404,
    );
    assert.equal(
      (
        await request(f, {
          ...options,
          route: `/brands/${f.brand.id}/references/${f.foreignReference.id}/editorial-evidence`,
        })
      ).status,
      404,
    );
  }
  storage.db
    .prepare("UPDATE sessions SET expires_at=0 WHERE user_id=?")
    .run(f.owner.id);
  assert.equal((await request(f)).status, 401);
});

test("reviewers can read; editors and owners can replace observations without modifying the reference", async () => {
  const f = fixture();
  const initial = await request(f, { cookie: f.reviewer.cookie });
  assert.equal(initial.status, 200);
  assert.equal(initial.data.status, "empty");
  assert.equal(initial.data.revision, 0);
  assert.equal(initial.headers.get("cache-control"), "no-store");
  const body = input(initial.data);
  assert.equal(
    (await request(f, { cookie: f.reviewer.cookie, method: "PUT", body }))
      .status,
    403,
  );
  const saved = await request(f, {
    cookie: f.editor.cookie,
    method: "PUT",
    body,
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.status, "current");
  assert.equal(saved.data.origin, "manual");
  assert.equal(saved.data.causality, "not_established");
  assert.equal(saved.data.revision, 1);
  assert.equal(saved.data.observations[0].origin, "manual");
  assert.equal(
    saved.data.observations[0].support.verification,
    "literal_reference",
  );
  assert.equal(
    saved.data.observations[0].observedAt,
    "2026-01-01T10:00:00.000Z",
  );
  assert.deepEqual(
    (await request(f, { cookie: f.reviewer.cookie })).data,
    saved.data,
  );
  assert.deepEqual(
    storage.getRecord(f.brand.id, "references", f.reference.id),
    f.reference,
  );
  assert.doesNotMatch(
    JSON.stringify(saved.data),
    /createdBy|userId|password_hash|@example\.com/,
  );
  const cleared = await request(f, {
    method: "PUT",
    body: input(saved.data, []),
  });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.data.status, "empty");
  assert.equal(cleared.data.revision, 2);
  assert.deepEqual(listCurrentEditorialEvidence(f.brand.id), []);
});

test("all six factors remain manual observations with uncertainty, not calculated performance or causality", async () => {
  const f = fixture();
  const response = await save(
    f,
    EDITORIAL_EVIDENCE_FACTORS.map((factor) => observation(factor)),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(
    response.data.observations.map((item) => item.factor),
    EDITORIAL_EVIDENCE_FACTORS,
  );
  assert.ok(
    response.data.observations.every(
      (item) => item.uncertainty && item.origin === "manual",
    ),
  );
  assert.equal(response.data.causality, "not_established");
  assert.doesNotMatch(
    JSON.stringify(response.data),
    /score|velocity|growth|success|derivedMetrics/,
  );
});

test("fingerprints invalidate changed material and protect against stale editors", async () => {
  const f = fixture();
  const first = await save(f);
  assert.equal(first.status, 200);
  const oldInput = input(first.data);
  storage.saveRecord(f.brand.id, "references", {
    ...f.reference,
    text: "Texto nuevo que ya no contiene la cita.",
  });
  const stale = await request(f);
  assert.equal(stale.data.status, "stale");
  assert.notEqual(
    stale.data.referenceFingerprint,
    first.data.referenceFingerprint,
  );
  assert.deepEqual(stale.data.observations, []);
  assert.deepEqual(listCurrentEditorialEvidence(f.brand.id), []);
  const conflict = await request(f, { method: "PUT", body: oldInput });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.data.code, "EDITORIAL_EVIDENCE_CONFLICT");
  const revalidated = await request(f, {
    method: "PUT",
    body: input(stale.data, [
      observation("hook", {
        support: { kind: "text", field: "text", quote: "Texto nuevo" },
      }),
    ]),
  });
  assert.equal(revalidated.status, 200);
  assert.equal(revalidated.data.status, "current");
  assert.equal(revalidated.data.revision, 2);
});

test("concurrent editors cannot silently overwrite a later revision", async () => {
  const f = fixture();
  const initial = (await request(f)).data;
  const responses = await Promise.all([
    request(f, { method: "PUT", body: input(initial) }),
    request(f, {
      method: "PUT",
      cookie: f.editor.cookie,
      body: input(initial, [observation("format")]),
    }),
  ]);
  assert.deepEqual(responses.map((item) => item.status).sort(), [200, 409]);
  assert.equal((await request(f)).data.revision, 1);
});

test("literal text citations cannot be invented, borrowed from other fields or replaced by hypotheses", async () => {
  const f = fixture();
  for (const support of [
    { kind: "text", field: "text", quote: "Una cita inexistente" },
    { kind: "text", field: "title", quote: "Una pregunta abre el texto." },
    { kind: "text", field: "analysis", quote: "Una pregunta abre el texto." },
    { kind: "text", field: "text", quote: "" },
    {
      kind: "text",
      field: "text",
      quote: "Una pregunta abre el texto.",
      url: "https://example.com",
    },
    { kind: "unknown" },
    {},
    null,
  ]) {
    const result = await save(f, [observation("hook", { support })]);
    assert.equal(result.status, 400, JSON.stringify(support));
  }
  assert.equal(
    (
      await save(f, [
        observation("hook", {
          support: {
            kind: "text",
            field: "title",
            quote: "Antes de automatizar",
          },
        }),
      ])
    ).status,
    200,
  );
});

test("timestamps refer only to an audiovisual asset in this company and are never downloaded or analyzed", async (t) => {
  let remoteCalls = 0;
  t.mock.method(globalThis, "fetch", () => {
    remoteCalls++;
    throw new Error("No remote requests allowed");
  });
  const f = fixture();
  const timed = observation("format", {
    support: { kind: "time", startSeconds: 0, endSeconds: 4.5 },
  });
  assert.equal((await save(f, [timed])).status, 400);
  const asset = storage.saveRecord(f.brand.id, "assets", {
    mimeType: "video/mp4",
    storageName: "not-read.mp4",
    size: 1024,
  });
  const reference = storage.saveRecord(f.brand.id, "references", {
    ...f.reference,
    assetId: asset.id,
    format: "video",
    durationSeconds: 10,
  });
  const result = await save(f, [timed]);
  assert.equal(result.status, 200);
  assert.equal(
    result.data.observations[0].support.verification,
    "manual_timestamp",
  );
  assert.equal(
    storage.getRecord(f.brand.id, "references", reference.id).videoAnalysis,
    undefined,
  );
  for (const support of [
    { kind: "time", startSeconds: -1 },
    { kind: "time", startSeconds: "1" },
    { kind: "time", startSeconds: 5, endSeconds: 4 },
    { kind: "time", startSeconds: 0, endSeconds: null },
    { kind: "time", startSeconds: 0, endSeconds: 11 },
    { kind: "time", startSeconds: 86401 },
    { kind: "time", startSeconds: 0, quote: "Una pregunta abre el texto." },
  ])
    assert.equal(
      (await save(f, [observation("format", { support })])).status,
      400,
    );
  const foreignAsset = storage.saveRecord(f.foreignBrand.id, "assets", {
    mimeType: "video/mp4",
  });
  storage.saveRecord(f.brand.id, "references", {
    ...reference,
    assetId: foreignAsset.id,
  });
  assert.equal((await request(f)).status, 403);
  assert.equal(remoteCalls, 0);
});

test("remote media URLs and metadata-only videos cannot become timestamp evidence", async () => {
  const f = fixture({
    format: "video",
    url: "https://example.com/public.mp4",
    contentScope: "metadata_only",
  });
  assert.equal(
    (
      await save(f, [
        observation("hook", { support: { kind: "time", startSeconds: 0 } }),
      ])
    ).status,
    400,
  );
});

test("PII is rejected in observations, uncertainty, hypotheses and citation text without persisting a partial update", async () => {
  const f = fixture({
    text: "Contacto: ventas@example.com. Teléfono +34 600 123 456.\nNombre completo: Persona Sintética.\nUna pregunta abre el texto.",
  });
  const first = await save(f);
  assert.equal(first.status, 200);
  for (const extra of [
    { observation: "Escribir a ventas@example.com" },
    { uncertainty: "Teléfono +34 600 123 456" },
    { possibleHypothesis: "Nombre completo: Persona Sintética" },
    {
      observation: "https://example.com/contact?personName=Persona%20Sintetica",
    },
    { observation: "ventas%2540example.com" },
    { support: { kind: "text", field: "text", quote: "ventas@example.com" } },
  ]) {
    const result = await request(f, {
      method: "PUT",
      body: input(first.data, [observation("hook", extra)]),
    });
    assert.equal(result.status, 400, JSON.stringify(extra));
  }
  assert.deepEqual((await request(f)).data, first.data);
});

test("unknown fields, duplicate factors, missing uncertainty and invalid dates fail the finite contract", async () => {
  const f = fixture();
  const state = (await request(f)).data;
  const invalid = [
    {},
    [],
    null,
    { ...input(state), brandId: f.foreignBrand.id },
    { ...input(state), origin: "ai" },
    { ...input(state), expectedRevision: -1 },
    { ...input(state), expectedRevision: 0.5 },
    { ...input(state), expectedReferenceFingerprint: "invalid" },
    input(
      state,
      Array.from({ length: 7 }, () => observation()),
    ),
    input(state, [observation(), observation()]),
    input(state, [observation("unknown")]),
    input(state, [observation("hook", { uncertainty: "" })]),
    input(state, [observation("hook", { observation: "x".repeat(1001) })]),
    input(state, [observation("hook", { uncertainty: "x".repeat(601) })]),
    input(state, [
      observation("hook", { possibleHypothesis: "x".repeat(601) }),
    ]),
    input(state, [observation("hook", { observedAt: "2099-01-01T00:00:00Z" })]),
    input(state, [observation("hook", { observedAt: "2026-02-30T00:00:00Z" })]),
    input(state, [observation("hook", { observedAt: "2026-01-01" })]),
    input(state, [observation("hook", { observedAt: undefined })]),
    input(state, [observation("hook", { confidence: 1 })]),
    input(state, [observation("hook", { causalConclusion: true })]),
  ];
  for (const body of invalid)
    assert.equal(
      (await request(f, { method: "PUT", body })).status,
      400,
      JSON.stringify(body),
    );
  assert.equal((await request(f)).data.revision, 0);
});

test("restricted and official YouTube material cannot enter the editorial evidence store even as manual text", async () => {
  for (const fields of [
    { url: "https://www.youtube.com/watch?v=abcdefghijk" },
    { url: "https://youtu.be/abcdefghijk" },
    { sourceUrl: "https://www.instagram.com/p/synthetic" },
    { url: "https://www.linkedin.com/posts/synthetic" },
    { platform: "youtube", metricsOrigin: "YouTube Data API" },
    { ingestionProvider: "youtube" },
    { ingestionProvider: "apify" },
    { ingestionRestricted: true },
    { url: "https://example.com/login" },
    { url: "https://example.com/?email=persona%40example.com" },
  ]) {
    const f = fixture(fields);
    assert.equal((await request(f)).status, 403, JSON.stringify(fields));
    const response = await request(f, {
      method: "PUT",
      body: {
        expectedReferenceFingerprint: "a".repeat(64),
        expectedRevision: 0,
        observations: [observation()],
      },
    });
    assert.equal(response.status, 403);
    assert.deepEqual(listCurrentEditorialEvidence(f.brand.id), []);
  }
});

test("revoked permission hides previously saved observations from GET and report readers", async () => {
  const now = Date.now();
  const grant = {
    origin: "https://example.com",
    pathPrefix: "/public",
    purposes: ["metadata"],
    evidenceUrl: "https://example.com/permission",
    reviewedBy: "Synthetic QA operator",
    note: "Fixture only; no live access",
    reviewedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 3600000).toISOString(),
  };
  fs.writeFileSync(
    process.env.SOURCE_ACCESS_POLICY_FILE,
    JSON.stringify({ version: 1, grants: [grant] }),
  );
  const f = fixture({
    url: "https://example.com/public/guide",
    ingestionAccess: {
      url: "https://example.com/public/guide",
      purpose: "metadata",
    },
  });
  const saved = await save(f);
  assert.equal(saved.status, 200);
  assert.equal(listCurrentEditorialEvidence(f.brand.id).length, 1);
  fs.writeFileSync(
    process.env.SOURCE_ACCESS_POLICY_FILE,
    JSON.stringify({ version: 1, grants: [] }),
  );
  const result = await request(f);
  assert.equal(result.status, 403);
  assert.doesNotMatch(JSON.stringify(result.data), /La apertura utiliza/);
  assert.equal(
    (await request(f, { method: "PUT", body: input(saved.data) })).status,
    403,
  );
  assert.deepEqual(listCurrentEditorialEvidence(f.brand.id), []);
});

test("source policies and missing provenance remain enforced on every read", async () => {
  const f = fixture();
  const source = storage.saveRecord(f.brand.id, "sources", {
    type: "hackernews",
    enabled: true,
  });
  const reference = storage.saveRecord(f.brand.id, "references", {
    ...f.reference,
    sourceId: source.id,
  });
  assert.equal((await save(f)).status, 200);
  storage.saveRecord(f.brand.id, "sources", { ...source, type: "youtube" });
  assert.equal((await request(f)).status, 403);
  storage.deleteRecord(f.brand.id, "sources", source.id);
  assert.equal((await request(f)).status, 403);
  assert.deepEqual(listCurrentEditorialEvidence(f.brand.id), []);
  assert.equal(
    storage.getRecord(f.brand.id, "references", reference.id).text,
    f.reference.text,
  );
});

test("fingerprints are stable across object key order and workflow updates but follow material, attribution and metrics", () => {
  const base = {
    id: "reference",
    title: "Título",
    text: "Texto",
    status: "new",
    metrics: { likes: 3, views: 4 },
    updatedAt: "before",
  };
  const fingerprint = editorialEvidenceFingerprint(base);
  assert.equal(
    editorialEvidenceFingerprint({
      updatedAt: "after",
      metrics: { views: 4, likes: 3 },
      status: "saved",
      text: "Texto",
      title: "Título",
      id: "reference",
      analysis: { hook: "Derived" },
    }),
    fingerprint,
  );
  for (const change of [
    { title: "Otra apertura" },
    { text: "Otro texto" },
    { format: "video" },
    { publisher: "Otro medio" },
    { publishedAt: "2026-01-02" },
    { metrics: { likes: 4, views: 4 } },
    { url: "https://example.com/other" },
    { assetId: "another-asset" },
    { tags: ["otro tema"] },
  ])
    assert.notEqual(
      editorialEvidenceFingerprint({ ...base, ...change }),
      fingerprint,
    );
});

test("asset changes invalidate timestamps and attachment deletion removes access", async () => {
  const f = fixture();
  const asset = storage.saveRecord(f.brand.id, "assets", {
    mimeType: "video/mp4",
    size: 10,
    storageName: "original.mp4",
  });
  storage.saveRecord(f.brand.id, "references", {
    ...f.reference,
    assetId: asset.id,
  });
  assert.equal(
    (
      await save(f, [
        observation("hook", { support: { kind: "time", startSeconds: 0 } }),
      ])
    ).status,
    200,
  );
  storage.saveRecord(f.brand.id, "assets", {
    ...asset,
    storageName: "replacement.mp4",
    size: 20,
  });
  assert.equal((await request(f)).data.status, "stale");
  storage.deleteRecord(f.brand.id, "assets", asset.id);
  assert.equal((await request(f)).status, 403);
});

test("report reader scopes by company, excludes demos and stale evidence, and reference deletion cascades", async () => {
  const f = fixture();
  const demo = fixture({ isDemo: true });
  assert.equal((await save(f)).status, 200);
  assert.equal((await save(demo)).status, 200);
  assert.equal((await request(demo)).data.isDemo, true);
  assert.deepEqual(listCurrentEditorialEvidence(demo.brand.id), []);
  assert.deepEqual(listCurrentEditorialEvidence(f.foreignBrand.id), []);
  assert.deepEqual(
    listCurrentEditorialEvidence(f.brand.id).map((item) => item.referenceId),
    [f.reference.id],
  );
  storage.deleteRecord(f.brand.id, "references", f.reference.id);
  assert.equal(
    storage.db
      .prepare(
        "SELECT COUNT(*) AS count FROM editorial_evidence WHERE brand_id=?",
      )
      .get(f.brand.id).count,
    0,
  );
  assert.deepEqual(listCurrentEditorialEvidence(f.brand.id), []);
  assert.equal((await request(f)).status, 404);
});

test("cross-origin updates are denied without changing a saved observation", async () => {
  const f = fixture();
  const initial = (await request(f)).data;
  const result = await request(f, {
    method: "PUT",
    body: input(initial),
    headers: { origin: "https://untrusted.example.com" },
  });
  assert.equal(result.status, 403);
  assert.equal((await request(f)).data.revision, 0);
});
