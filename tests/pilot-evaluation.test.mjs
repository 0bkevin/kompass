import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import express from "express";

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "kompass-pilot-evaluation-"),
);
process.env.DATA_DIR = directory;
const { db, saveBrand } = await import("../server/db.mjs");
const { createUser, tokenHash } = await import("../server/auth.mjs");
const {
  createPilotEvaluationRouter,
  createPilotEvaluationStore,
  getPilotEvaluationReport,
  listPilotEvaluations,
  normalizePilotEvaluationInput,
  summarizePilotEvaluation,
} = await import("../server/pilot-evaluation.mjs");

let server;
let origin;
let now = Date.UTC(2026, 9, 18, 12);

// All figures and accounts in this file are synthetic test fixtures.
function fixture(
  role = "owner",
  brand = saveBrand({ name: "Synthetic pilot QA" }),
) {
  const user = createUser({
    name: "Synthetic QA",
    email: `${randomUUID()}@example.test`,
    passwordHash: "test-only",
  });
  db.prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?)").run(
    brand.id,
    user.id,
    role,
  );
  const token = randomUUID();
  db.prepare(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
  ).run(tokenHash(token), user.id, Date.now() + 3_600_000);
  return { user, brand, cookie: `radar_session=${token}` };
}

function input(overrides = {}) {
  return {
    origin: "manual",
    period: { start: "2026-10-01", end: "2026-10-07" },
    editorialMinutes: 120,
    actualCost: { amount: 12.5, currency: "EUR" },
    results: { reviewed: 20, useful: 10, accepted: 5 },
    ...overrides,
  };
}

function baseline(overrides = {}) {
  const { origin: _origin, ...snapshot } = input({
    period: { start: "2026-09-01", end: "2026-09-07" },
    editorialMinutes: 180,
    results: { reviewed: 10, useful: 6, accepted: 2 },
    ...overrides,
  });
  return { sameScope: true, ...snapshot };
}

async function request(
  session,
  { method = "GET", body, brandId = session?.brand.id } = {},
) {
  const response = await fetch(
    `${origin}/api/brands/${brandId}/pilot-evaluation`,
    {
      method,
      headers: {
        ...(session ? { cookie: session.cookie } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    },
  );
  return {
    status: response.status,
    data: await response.json(),
    headers: response.headers,
  };
}
const post = (session, body, options = {}) =>
  request(session, { method: "POST", body, ...options });

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", createPilotEvaluationRouter({ clock: () => now }));
  app.use((error, _req, res, _next) =>
    res.status(error.status || 500).json({ error: error.message }),
  );
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  db.exec("DELETE FROM brands; DELETE FROM users;");
  now = Date.UTC(2026, 9, 18, 12);
});

after(async () => {
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  });
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("empty tenant has no fabricated measurements, samples, users or costs", async () => {
  const f = fixture();
  const response = await request(f);
  assert.equal(response.status, 200);
  assert.deepEqual(response.data.evaluations, []);
  assert.equal(response.data.summary.latestEvaluationId, null);
  assert.equal(response.data.summary.periodCount, 0);
  assert.deepEqual(response.data.summary.currencies, []);
  assert.equal(response.data.contract.origin, "manual");
  assert.equal(response.data.contract.unknown, null);
  assert.equal(response.data.contract.role, "editor");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal("users" in response.data.summary, false);
  assert.equal("cost" in response.data.summary, false);
});

test("GET and POST enforce sessions, tenant membership and editor role", async () => {
  const owner = fixture();
  const editor = fixture("editor", owner.brand);
  const reviewer = fixture("reviewer", owner.brand);
  const outsider = fixture();
  for (const method of ["GET", "POST"]) {
    const options = {
      method,
      ...(method === "POST" ? { body: input() } : {}),
      brandId: owner.brand.id,
    };
    assert.equal((await request(null, options)).status, 401);
    assert.equal((await request(outsider, options)).status, 404);
    assert.equal((await request(reviewer, options)).status, 403);
    assert.equal(
      (await request(owner, options)).status,
      method === "POST" ? 201 : 200,
    );
    assert.equal((await request(editor, options)).status, 200);
  }
  assert.equal(listPilotEvaluations(owner.brand.id).length, 1);
});

test("manual roundtrip and exported reader preserve actual declared cost without imputing labor cost", async () => {
  const f = fixture("editor");
  const saved = await post(f, input());
  assert.equal(saved.status, 201);
  const value = saved.data.evaluation;
  assert.equal(value.origin, "manual");
  assert.deepEqual(value.actualCost, { amount: 12.5, currency: "EUR" });
  assert.deepEqual(value.results, { reviewed: 20, useful: 10, accepted: 5 });
  assert.equal(value.baseline, null);
  assert.equal(value.summary.minutesPerReviewed, 6);
  assert.equal(value.summary.costPerReviewed, 0.625);
  assert.equal(value.summary.usefulPerReviewed, 0.5);
  assert.equal(value.summary.acceptedPerReviewed, 0.25);
  assert.equal(value.summary.comparison.status, "baseline_missing");
  assert.equal("savings" in value.summary, false);
  const report = getPilotEvaluationReport(f.brand.id);
  assert.deepEqual(report, {
    evaluations: [value],
    summary: (await request(f)).data.summary,
  });
  assert.deepEqual(
    listPilotEvaluations(f.brand.id)[0].actualCost,
    value.actualCost,
  );
  const row = db
    .prepare("SELECT data FROM pilot_evaluations WHERE brand_id=?")
    .get(f.brand.id);
  assert.equal(row.data.includes(f.user.email), false);
  assert.equal(row.data.includes(f.user.id), false);
  assert.equal(row.data.includes("createdBy"), false);
});

test("unknown values remain null while explicit zero counts and zero actual cost survive", async () => {
  const f = fixture();
  const unknown = await post(f, {
    origin: "manual",
    period: input().period,
    actualCost: { currency: "EUR" },
  });
  assert.equal(unknown.status, 201);
  const value = unknown.data.evaluation;
  assert.equal(value.editorialMinutes, null);
  assert.equal(value.actualCost.amount, null);
  assert.deepEqual(value.results, {
    reviewed: null,
    useful: null,
    accepted: null,
  });
  assert.equal(value.summary.usefulPerReviewed, null);
  assert.equal(value.summary.minutesPerReviewed, null);
  assert.equal(
    getPilotEvaluationReport(f.brand.id).summary.unknownCostPeriods,
    1,
  );
  assert.deepEqual(value.summary.unknownFields, [
    "editorialMinutes",
    "actualCost.amount",
    "results.reviewed",
    "results.useful",
    "results.accepted",
  ]);
  const zeros = await post(
    f,
    input({
      editorialMinutes: 0,
      actualCost: { amount: 0, currency: "EUR" },
      results: { reviewed: 0, useful: 0, accepted: 0 },
    }),
  );
  assert.equal(zeros.status, 200);
  assert.equal(zeros.data.evaluation.actualCost.amount, 0);
  assert.deepEqual(zeros.data.evaluation.summary.sample, {
    reviewed: 0,
    useful: 0,
    accepted: 0,
  });
  assert.equal(zeros.data.evaluation.summary.costPerReviewed, null);
  assert.equal(zeros.data.evaluation.summary.acceptedPerReviewed, null);
  assert.deepEqual(zeros.data.evaluation.summary.unknownFields, []);
});

test("closed schema rejects identities, narrative notes, fabricated automatic origins and nested extra fields", async () => {
  const f = fixture();
  for (const invalid of [
    input({ origin: "automatic" }),
    input({ origin: undefined }),
    input({ userId: f.user.id }),
    input({ notes: "Synthetic contact qa@example.test" }),
    input({ brandId: f.brand.id }),
    input({
      actualCost: {
        amount: 10,
        currency: "EUR",
        provider: "not-a-cost-import",
      },
    }),
    input({ results: { reviewed: 20, users: ["synthetic-person"] } }),
    input({ period: { ...input().period, label: "private label" } }),
    input({ baseline: baseline({ notes: "private label" }) }),
  ]) {
    assert.equal((await post(f, invalid)).status, 400, JSON.stringify(invalid));
  }
  assert.equal(listPilotEvaluations(f.brand.id).length, 0);
});

test("dates, monetary precision, numeric types and known funnel subsets are validated", async () => {
  const f = fixture();
  for (const invalid of [
    input({ period: { start: "2026-02-29", end: "2026-03-01" } }),
    input({ period: { start: "2026-10-07", end: "2026-10-01" } }),
    input({ period: { start: "2026-10-18", end: "2026-10-19" } }),
    input({ period: { start: "2026-10-01T00:00:00Z", end: "2026-10-07" } }),
    input({ editorialMinutes: -1 }),
    input({ editorialMinutes: "120" }),
    input({ editorialMinutes: false }),
    input({ actualCost: { amount: -1, currency: "EUR" } }),
    input({ actualCost: { amount: "10", currency: "EUR" } }),
    input({ actualCost: { amount: 1.001, currency: "EUR" } }),
    input({ actualCost: { amount: 1.5, currency: "JPY" } }),
    input({ actualCost: { amount: 10, currency: "eur" } }),
    input({ actualCost: { amount: 10, currency: "ZZZ" } }),
    input({ results: { reviewed: 2.5 } }),
    input({ results: { reviewed: -1 } }),
    input({ results: { reviewed: 2, useful: 3 } }),
    input({ results: { reviewed: null, useful: 2, accepted: 3 } }),
    input({ results: { reviewed: 2, useful: null, accepted: 3 } }),
  ])
    assert.equal((await post(f, invalid)).status, 400, JSON.stringify(invalid));
  for (const value of [NaN, Infinity, -Infinity])
    assert.throws(
      () => normalizePilotEvaluationInput(input({ editorialMinutes: value })),
      { status: 400 },
    );
  const valid = await post(
    f,
    input({
      results: { reviewed: null, useful: 3 },
      actualCost: { amount: 1.234, currency: "KWD" },
    }),
  );
  assert.equal(valid.status, 201);
  assert.equal(valid.data.evaluation.results.reviewed, null);
  assert.equal(valid.data.evaluation.summary.usefulPerReviewed, null);
});

test("optional baseline requires earlier dates, an explicit same-scope declaration and matching currency", async () => {
  const f = fixture();
  for (const value of [
    baseline({ sameScope: undefined }),
    baseline({ sameScope: false }),
    baseline({ actualCost: { amount: 10, currency: "USD" } }),
    baseline({ period: { start: "2026-09-30", end: "2026-10-01" } }),
    baseline({ period: { start: "2026-10-08", end: "2026-10-14" } }),
  ])
    assert.equal((await post(f, input({ baseline: value }))).status, 400);
  assert.equal(listPilotEvaluations(f.brand.id).length, 0);
});

test("baseline comparison is descriptive current minus baseline, keeps both samples and never claims savings", async () => {
  const f = fixture();
  const saved = await post(
    f,
    input({
      actualCost: { amount: 0.3, currency: "EUR" },
      baseline: baseline({ actualCost: { amount: 0.2, currency: "EUR" } }),
    }),
  );
  assert.equal(saved.status, 201);
  const summary = saved.data.evaluation.summary;
  assert.equal(summary.comparison.status, "descriptive_only");
  assert.equal(summary.comparison.direction, "current_minus_baseline");
  assert.equal(summary.comparison.sameScope, "manually_declared");
  assert.equal(summary.sample.reviewed, 20);
  assert.equal(summary.comparison.baseline.sample.reviewed, 10);
  assert.equal(summary.comparison.delta.editorialMinutes, -60);
  assert.equal(summary.comparison.delta.actualCost, 0.1);
  assert.equal(summary.comparison.delta.minutesPerReviewed, -12);
  assert.match(summary.comparison.notice, /No establece causalidad ni ahorro/);
  assert.equal("roi" in summary.comparison, false);
  assert.equal("savings" in summary.comparison, false);
  const missing = summarizePilotEvaluation(
    normalizePilotEvaluationInput(
      input({ editorialMinutes: null, baseline: baseline({ results: {} }) }),
    ),
  );
  assert.equal(missing.comparison.delta.editorialMinutes, null);
  assert.equal(missing.comparison.delta.reviewed, null);
  assert.equal(missing.comparison.delta.minutesPerReviewed, null);
});

test("correcting the exact period replaces its data and baseline without duplicating a measurement", async () => {
  const f = fixture();
  const first = await post(f, input({ baseline: baseline() }));
  now += 60_000;
  const second = await post(
    f,
    input({ editorialMinutes: null, results: { reviewed: 30 } }),
  );
  assert.equal(second.status, 200);
  assert.equal(second.data.evaluation.id, first.data.evaluation.id);
  assert.equal(
    second.data.evaluation.createdAt,
    first.data.evaluation.createdAt,
  );
  assert.notEqual(
    second.data.evaluation.updatedAt,
    first.data.evaluation.updatedAt,
  );
  assert.equal(second.data.evaluation.baseline, null);
  assert.equal(second.data.evaluation.editorialMinutes, null);
  assert.deepEqual(second.data.evaluation.results, {
    reviewed: 30,
    useful: null,
    accepted: null,
  });
  assert.equal(getPilotEvaluationReport(f.brand.id).summary.periodCount, 1);
});

test("inclusive overlap is rejected atomically; separate periods keep currencies separate", async () => {
  const f = fixture();
  await post(f, input());
  assert.equal(
    (
      await post(
        f,
        input({ period: { start: "2026-09-30", end: "2026-10-01" } }),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await post(
        f,
        input({ period: { start: "2026-10-07", end: "2026-10-08" } }),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await post(
        f,
        input({ period: { start: "2026-10-02", end: "2026-10-03" } }),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await post(
        f,
        input({
          period: { start: "2026-10-08", end: "2026-10-14" },
          actualCost: { amount: 15, currency: "USD" },
        }),
      )
    ).status,
    201,
  );
  const report = getPilotEvaluationReport(f.brand.id);
  assert.equal(report.summary.periodCount, 2);
  assert.deepEqual(report.summary.currencies, ["EUR", "USD"]);
  assert.deepEqual(
    report.evaluations.map((value) => value.period.start),
    ["2026-10-08", "2026-10-01"],
  );
  assert.equal(report.summary.latestEvaluationId, report.evaluations[0].id);
  assert.equal("totalCost" in report.summary, false);
});

test("tenants can use the same period independently; stored records persist and cascade on brand deletion", async () => {
  const first = fixture();
  const second = fixture();
  const saved = await post(first, input());
  assert.equal(
    (await post(second, input({ editorialMinutes: 450 }))).status,
    201,
  );
  assert.equal(
    (await post(first, input({ editorialMinutes: 60 }))).status,
    200,
  );
  assert.equal(
    getPilotEvaluationReport(first.brand.id).evaluations[0].editorialMinutes,
    60,
  );
  assert.equal(
    getPilotEvaluationReport(second.brand.id).evaluations[0].editorialMinutes,
    450,
  );
  assert.equal(
    (await post(second, input(), { brandId: first.brand.id })).status,
    404,
  );
  assert.notEqual(
    getPilotEvaluationReport(second.brand.id).evaluations[0].id,
    saved.data.evaluation.id,
  );
  const reopened = new DatabaseSync(path.join(directory, "radar.sqlite"));
  try {
    assert.deepEqual(
      createPilotEvaluationStore({ database: reopened }).report(first.brand.id),
      getPilotEvaluationReport(first.brand.id),
    );
  } finally {
    reopened.close();
  }
  db.prepare("DELETE FROM brands WHERE id=?").run(first.brand.id);
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS total FROM pilot_evaluations WHERE brand_id=?",
      )
      .get(first.brand.id).total,
    0,
  );
  assert.equal(
    getPilotEvaluationReport(second.brand.id).summary.periodCount,
    1,
  );
});
