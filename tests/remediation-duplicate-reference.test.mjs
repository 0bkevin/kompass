import { installPermissionFixture } from "./permission-fixture.mjs";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import express from "express";

const root = "/tmp/30x-remediation-duplicate-reference";
fs.mkdirSync(root, { recursive: true });
const directory = fs.mkdtempSync(path.join(root, "test-"));
process.env.DATA_DIR = directory;
installPermissionFixture(directory, [
  {
    origin: "https://example.com",
    pathPrefix: "/one.xml",
    purposes: ["rss"],
  },
  {
    origin: "https://example.com",
    pathPrefix: "/two.xml",
    purposes: ["rss"],
  },
  {
    origin: "https://example.com",
    pathPrefix: "/feed.xml",
    purposes: ["rss"],
  },
]);
process.env.DISCOVERY_ENABLED = "false";
for (const key of [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "YOUTUBE_API_KEY",
  "APIFY_API_TOKEN",
])
  delete process.env[key];

let storage, insights, server, origin, cookie, owner;
function company() {
  const brand = storage.saveBrand({
    name: "Laboratorio sintético de referencias",
    industry: "Educación",
    audience: [
      {
        id: randomUUID(),
        name: "Equipos comerciales",
        role: "Dirección de ventas",
        needs: "Diagnosticar el embudo comercial EdTech y cerrar demos",
      },
    ],
  });
  storage.db
    .prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?)")
    .run(brand.id, owner.id, "owner");
  return brand;
}
async function request(brand, route, { method = "GET", body } = {}) {
  const response = await fetch(`${origin}/api/brands/${brand.id}/${route}`, {
    method,
    headers: {
      cookie,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json() };
}
const capture = {
  title: "Cerrar demos EdTech con diagnóstico comercial",
  url: "https://example.com/edtech/funnel",
  text: "Diagnosticar el embudo comercial para mejorar las demos en educación.",
  topic: "Ventas EdTech",
  language: "es",
};

before(async () => {
  storage = await import("../server/db.mjs");
  insights = await import("../server/audience-insights.mjs");
  const auth = await import("../server/auth.mjs");
  const core = await import("../server/core.mjs");
  owner = auth.createUser({
    name: "Equipo sintético",
    email: `${randomUUID()}@example.com`,
    passwordHash: "unused-for-fixture",
  });
  const token = randomUUID();
  cookie = `radar_session=${token}`;
  storage.db
    .prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    )
    .run(auth.tokenHash(token), owner.id, Date.now() + 60_000);
  const app = express();
  app.use(express.json());
  app.use("/api", core.createCoreRouter());
  app.use("/api", insights.createAudienceInsightsRouter());
  app.use((error, _req, res, _next) =>
    res.status(error.status || 500).json({ error: error.message }),
  );
  server = app.listen(4508, "127.0.1.18");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = "http://127.0.1.18:4508";
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (storage) storage.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("repeated manual HTTP capture keeps one reference and one independent opportunity evidence", async (t) => {
  const brand = company();
  const first = await request(brand, "references", {
    method: "POST",
    body: capture,
  });
  const second = await request(brand, "references", {
    method: "POST",
    body: { ...capture, language: "en" },
  });
  const references = await request(brand, "references");
  const result = await request(brand, "insights");
  assert.equal(first.status, 201, JSON.stringify(first.data));
  assert.equal(references.status, 200);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  t.diagnostic(
    JSON.stringify({
      firstId: first.data.id,
      repeatedId: second.data.id,
      referenceCount: references.data.length,
      evidenceCount: result.data.opportunities.reduce(
        (sum, opportunity) => sum + opportunity.referenceIds.length,
        0,
      ),
    }),
  );
  assert.equal(
    references.data.length,
    1,
    "a repeated publication must remain one row",
  );
  assert.equal(second.data.id, first.data.id);
  assert.equal(second.status, 200);
  assert.equal(result.data.coverage.references, 1);
  assert.equal(result.data.opportunities.length, 1);
  assert.deepEqual(result.data.opportunities[0].referenceIds, [first.data.id]);
  assert.equal(result.data.opportunities[0].evidence.length, 1);
});

test("section fragments and known tracking do not create new publications or overwrite saved provenance", async () => {
  const brand = company();
  const original = storage.saveRecord(brand.id, "references", {
    ...capture,
    url: "https://example.com/edtech/funnel?edition=es&utm_source=fixture#intro",
    status: "saved",
    sourceId: "synthetic-rss",
    source: "RSS sintético",
    analysis: { summary: "Análisis sintético conservado" },
    evidence: [{ sourceId: "other-feed", url: capture.url }],
  });
  const result = await request(brand, "references", {
    method: "POST",
    body: {
      ...capture,
      url: "https://EXAMPLE.com:443/edtech/funnel?edition=es&fbclid=fixture#comments",
      status: "new",
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.id, original.id);
  assert.deepEqual(
    storage.getRecord(brand.id, "references", original.id),
    original,
  );
  assert.equal(storage.listRecords(brand.id, "references").length, 1);
});

test("distinct publication parameters, origins, paths and fragment routes remain distinct", async () => {
  const brand = company();
  const urls = [
    "https://news.ycombinator.com/item?id=100",
    "https://news.ycombinator.com/item?id=101",
    "https://www.youtube.com/watch?v=synthetic001",
    "https://www.youtube.com/watch?v=synthetic002",
    "https://example.com/article?edition=es&source=one&ref=100",
    "https://example.com/article?edition=es&source=one&ref=101",
    "https://example.com/article?edition=en&source=one&ref=101",
    "https://example.com/app#/post/1",
    "https://example.com/app#/post/2",
    "https://example.com/app#post=3",
    "https://example.com/app#post=4",
    "https://example.com/article",
    "https://example.com/article/",
    "http://example.com/article",
    "https://www.example.com/article",
  ];
  for (const url of urls) {
    const response = await request(brand, "references", {
      method: "POST",
      body: { ...capture, url },
    });
    assert.equal(response.status, 201, url);
  }
  const result = await request(brand, "insights");
  assert.equal(storage.listRecords(brand.id, "references").length, urls.length);
  assert.equal(result.data.coverage.references, urls.length);
  assert.equal(
    result.data.opportunities.reduce(
      (sum, item) => sum + item.referenceIds.length,
      0,
    ),
    urls.length,
  );
});

test("concurrent HTTP retries create one publication and one activity", async () => {
  const brand = company();
  const results = await Promise.all(
    Array.from({ length: 16 }, (_, index) =>
      request(brand, "references", {
        method: "POST",
        body: {
          ...capture,
          url: `${capture.url}?utm_campaign=retry-${index}#section-${index}`,
        },
      }),
    ),
  );
  assert.equal(results.filter((item) => item.status === 201).length, 1);
  assert.equal(results.filter((item) => item.status === 200).length, 15);
  assert.equal(new Set(results.map((item) => item.data.id)).size, 1);
  assert.equal(storage.listRecords(brand.id, "references").length, 1);
  assert.equal(
    storage.db
      .prepare("SELECT COUNT(*) AS total FROM activity WHERE brand_id=?")
      .get(brand.id).total,
    1,
  );
});

test("legacy copies across topics count once while linked records and provenance remain untouched", async () => {
  const brand = company();
  const original = storage.saveRecord(brand.id, "references", {
    ...capture,
    topic: "Embudo EdTech",
    status: "saved",
    source: "RSS sintético original",
    evidence: [{ sourceId: "fixture-feed", url: capture.url }],
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const copies = ["Otro grupo", "Un tercer grupo"].map((topic, index) =>
    storage.saveRecord(brand.id, "references", {
      ...capture,
      topic,
      url: `${capture.url}?utm_source=copy-${index}#comments`,
      source: "Equipo",
      createdAt: `2026-01-0${index + 2}T00:00:00.000Z`,
    }),
  );
  const piece = storage.saveRecord(brand.id, "pieces", {
    title: "Borrador sintético enlazado",
    referenceId: copies[0].id,
    status: "draft",
  });
  const idea = storage.saveRecord(brand.id, "ideas", {
    title: "Idea sintética enlazada",
    referenceIds: [copies[1].id],
  });
  const before = storage.listRecords(brand.id, "references");
  const response = await request(brand, "insights");
  const result = response.data;
  assert.equal(result.coverage.references, 1);
  assert.equal(result.workflow.references, 1);
  assert.equal(result.opportunities.length, 1);
  assert.deepEqual(result.opportunities[0].referenceIds, [original.id]);
  assert.equal(result.opportunities[0].evidence.length, 1);
  assert.equal(result.opportunities[0].evidence[0].source, original.source);
  assert.equal(
    insights.buildInsights(brand, { references: [...before].reverse() })
      .opportunities[0].referenceIds[0],
    original.id,
  );
  assert.deepEqual(storage.listRecords(brand.id, "references"), before);
  assert.deepEqual(storage.getRecord(brand.id, "pieces", piece.id), piece);
  assert.deepEqual(storage.getRecord(brand.id, "ideas", idea.id), idea);
  const repeated = await request(brand, "references", {
    method: "POST",
    body: capture,
  });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.id, original.id);
  assert.deepEqual(storage.listRecords(brand.id, "references"), before);
});

test("attachments without URL remain distinct, while retries of the same asset reuse its reference", async () => {
  const brand = company();
  const assets = ["one", "two"].map((name) =>
    storage.saveRecord(brand.id, "assets", {
      name: `${name}.txt`,
      type: "document",
      mimeType: "text/plain",
    }),
  );
  const body = { ...capture, url: undefined, format: "document" };
  const first = await request(brand, "references", {
    method: "POST",
    body: { ...body, assetId: assets[0].id },
  });
  const second = await request(brand, "references", {
    method: "POST",
    body: { ...body, assetId: assets[1].id },
  });
  const repeated = await request(brand, "references", {
    method: "POST",
    body: { ...body, assetId: assets[0].id },
  });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.notEqual(first.data.id, second.data.id);
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.id, first.data.id);
  // Identical free text has no publication identity and must not merge sources.
  await request(brand, "references", { method: "POST", body });
  await request(brand, "references", { method: "POST", body });
  assert.equal(storage.listRecords(brand.id, "references").length, 4);
  assert.equal(insights.buildInsights(brand).coverage.references, 4);
});

test("brands and real/demo scopes never share a captured reference", async () => {
  const firstBrand = company();
  const secondBrand = company();
  const demo = storage.saveRecord(firstBrand.id, "references", {
    ...capture,
    isDemo: true,
  });
  const first = await request(firstBrand, "references", {
    method: "POST",
    body: capture,
  });
  const second = await request(secondBrand, "references", {
    method: "POST",
    body: capture,
  });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.notEqual(first.data.id, demo.id);
  assert.notEqual(first.data.id, second.data.id);
  assert.equal(insights.buildInsights(firstBrand).coverage.references, 1);
  assert.equal(insights.buildInsights(secondBrand).coverage.references, 1);
});

test("snapshots of persisted copies count canonical publications once across source and topic groups", () => {
  const brand = company();
  const now = Date.UTC(2026, 9, 18, 12);
  const sources = ["one", "two"].map((name) =>
    storage.saveRecord(brand.id, "sources", {
      name: `RSS sintético ${name}`,
      type: "rss",
      enabled: true,
      url: `https://example.com/${name}.xml`,
    }),
  );
  const original = storage.saveRecord(brand.id, "references", {
    ...capture,
    topic: "Ventas EdTech",
    sourceId: sources[0].id,
    publishedAt: new Date(now - 86_400_000).toISOString(),
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  storage.saveRecord(brand.id, "references", {
    ...original,
    id: randomUUID(),
    sourceId: sources[1].id,
    topic: "Otro tema duplicado",
    url: `${capture.url}?utm_source=two#comments`,
    createdAt: "2026-01-02T00:00:00.000Z",
  });
  for (const id of [100, 101])
    storage.saveRecord(brand.id, "references", {
      ...original,
      id: randomUUID(),
      url: `https://news.ycombinator.com/item?id=${id}`,
    });
  const snapshot = insights.recordTopicObservation(brand.id, {
    now,
    sourceIds: sources.map((source) => source.id),
  });
  assert.equal(snapshot.sampleSize, 3);
  assert.deepEqual(snapshot.counts, { "ventas edtech": 3 });
  assert.equal(storage.listRecords(brand.id, "references").length, 4);
  const sameDay = insights.recordTopicObservation(brand.id, {
    now: now + 3_600_000,
    sourceIds: sources.map((source) => source.id),
  });
  assert.equal(sameDay.id, snapshot.id);
  assert.deepEqual(sameDay.counts, snapshot.counts);
});

test("legacy snapshots with unverified duplicate counts are preserved but excluded from new comparisons", () => {
  const brand = company();
  const now = Date.UTC(2026, 9, 18, 12);
  const source = storage.saveRecord(brand.id, "sources", {
    name: "RSS sintético",
    type: "rss",
    enabled: true,
    url: "https://example.com/feed.xml",
  });
  storage.saveRecord(brand.id, "references", {
    ...capture,
    sourceId: source.id,
    topic: "Ventas EdTech",
    publishedAt: new Date(now - 86_400_000).toISOString(),
  });
  const digest = (value) =>
    createHash("sha256")
      .update(JSON.stringify(value))
      .digest("hex")
      .slice(0, 24);
  const transient = new Set([
    "id",
    "name",
    "enabled",
    "createdAt",
    "updatedAt",
    "lastSyncedAt",
    "lastAttemptAt",
    "lastError",
    "lastResultCount",
  ]);
  const sourceScope = digest(
    Object.fromEntries(
      Object.keys(source)
        .sort()
        .filter((key) => !transient.has(key))
        .map((key) => [key, source[key]]),
    ),
  );
  const oldScope = digest({
    version: 1,
    pillars: brand.pillars || [],
    sources: [[source.id, sourceScope]],
  });
  const legacy = storage.saveRecord(brand.id, "topicSnapshots", {
    scope: oldScope,
    observedAt: new Date(now - 8 * 86_400_000).toISOString(),
    windowMs: 7 * 86_400_000,
    sourceIds: [source.id],
    counts: { "ventas edtech": 8 },
    sampleSize: 8,
    origin: "public_source_observation",
  });
  const current = insights.recordTopicObservation(brand.id, {
    now,
    sourceIds: [source.id],
  });
  assert.notEqual(current.scope, oldScope);
  const result = insights.buildInsights(brand, { now });
  assert.equal(result.coverage.hasHistory, false);
  assert.equal(result.opportunities[0].growth.label, "insufficient");
  assert.deepEqual(
    storage.getRecord(brand.id, "topicSnapshots", legacy.id),
    legacy,
  );
});

test("pieces linked to a legacy copy retain their topic context for historical learning", () => {
  const brand = company();
  storage.saveRecord(brand.id, "references", {
    ...capture,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const copy = storage.saveRecord(brand.id, "references", {
    ...capture,
    createdAt: "2026-01-02T00:00:00.000Z",
  });
  const before = insights.buildInsights(brand).opportunities[0];
  for (let index = 0; index < 6; index++) {
    const piece = storage.saveRecord(brand.id, "pieces", {
      title: "Ejemplo sintético propio",
      script: "Contenido registrado para contraste.",
      referenceId: index < 3 ? copy.id : undefined,
      status: "published",
      segmentId: brand.audience[0].id,
      channel: "linkedin",
      format: "post",
    });
    storage.saveRecord(brand.id, "outcomes", {
      pieceId: piece.id,
      publishedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      metrics: { views: 100, engagement: index < 3 ? 20 : 5, leads: 0 },
      origin: "manual",
    });
  }
  const after = insights.buildInsights(brand).opportunities[0];
  assert.equal(after.referenceIds.length, 1);
  assert.equal(after.relevance, before.relevance + 8);
  assert.match(after.reasons.join(" "), /20\.0% frente a 5\.0%/);
});
