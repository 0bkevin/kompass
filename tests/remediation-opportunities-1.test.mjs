import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Synthetic publication counts only. No external provider or real data is used.
const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "radar-opportunities-1-"),
);
process.env.DATA_DIR = directory;
for (const key of [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "YOUTUBE_API_KEY",
  "APIFY_API_TOKEN",
])
  process.env[key] = "";
process.env.DISCOVERY_ENABLED = "false";

const DAY = 86_400_000;
const firstTime = Date.UTC(2026, 9, 10, 12);
const latestTime = firstTime + 8 * DAY;
const topic = "Turnos clínicos";
const topicKey = "turnos clinicos";
let storage, insights;

before(async () => {
  storage = await import("../server/db.mjs");
  insights = await import("../server/audience-insights.mjs");
});
after(() => {
  storage.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

function addReference(brand, source, values = {}) {
  return storage.saveRecord(brand.id, "references", {
    title: "Organizar turnos clínicos con evidencia sintética",
    text: "Una decisión de operaciones de salud para organizar turnos clínicos.",
    url: `https://example.com/synthetic/${randomUUID()}`,
    sourceId: source.id,
    source: source.name,
    platform: "rss",
    format: "post",
    topic,
    status: "new",
    isDemo: false,
    ...values,
  });
}

function scenario(
  beforeCount,
  currentCount,
  { recordFirst = true, recordLatest = true } = {},
) {
  const brand = storage.saveBrand({
    name: "Laboratorio sintético opportunities-1",
    industry: "Salud",
    market: "Latinoamérica",
    pillars: [topic],
    audience: [
      {
        id: "health-ops",
        name: "Operaciones de salud",
        needs: "Organizar turnos clínicos",
      },
    ],
  });
  const source = storage.saveRecord(brand.id, "sources", {
    name: "RSS sintético",
    type: "rss",
    enabled: true,
    query: "turnos clínicos",
    url: "https://example.com/synthetic/feed",
  });
  // Retain an opportunity even when both observed windows contain zero posts.
  addReference(brand, source);
  for (let index = 0; index < beforeCount; index++)
    addReference(brand, source, {
      publishedAt: new Date(firstTime - DAY).toISOString(),
    });
  const previous = recordFirst
    ? insights.recordTopicObservation(brand.id, {
        now: firstTime,
        sourceIds: [source.id],
      })
    : null;
  for (let index = 0; index < currentCount; index++)
    addReference(brand, source, {
      publishedAt: new Date(latestTime - DAY).toISOString(),
    });
  const latest = recordLatest
    ? insights.recordTopicObservation(brand.id, {
        now: latestTime,
        sourceIds: [source.id],
      })
    : null;
  return { brand, source, previous, latest };
}

function resultFor(fixture, options = {}) {
  const result = insights.buildInsights(fixture.brand, {
    now: latestTime + 3_600_000,
    ...options,
  });
  assert.equal(result.opportunities.length, 1);
  return { ...result, growth: result.opportunities[0].growth };
}

for (const [name, options] of [
  ["cold start", { recordFirst: false, recordLatest: false }],
  ["one observation", { recordFirst: false }],
]) {
  test(`${name} does not claim observed growth`, () => {
    const result = resultFor(scenario(0, 1, options));
    assert.equal(result.coverage.hasHistory, false);
    assert.equal(result.growth.label, "insufficient");
    assert.match(
      result.growth.explanation,
      /Faltan dos observaciones comparables/,
    );
  });
}

for (const [beforeCount, currentCount, label, direction] of [
  [0, 0, "stable", /se mantuvo igual/i],
  [1, 1, "stable", /se mantuvo igual/i],
  [3, 1, "declining", /Disminuyó la frecuencia/i],
  [3, 0, "declining", /Disminuyó la frecuencia/i],
  [1, 4, "observed", /Aumentó la frecuencia en esta muestra/],
  [0, 2, "early_signal", /Aumento con una muestra pequeña/],
]) {
  test(`comparable windows ${beforeCount} → ${currentCount} report their actual direction`, () => {
    const fixture = scenario(beforeCount, currentCount);
    assert.equal(fixture.previous.counts[topicKey] || 0, beforeCount);
    assert.equal(fixture.latest.counts[topicKey] || 0, currentCount);
    const result = resultFor(fixture);
    assert.equal(result.coverage.hasHistory, true);
    assert.equal(result.growth.label, label);
    assert.match(
      result.growth.explanation,
      new RegExp(
        `${currentCount} publicaciones fechadas.*frente a ${beforeCount} en la terminada`,
      ),
    );
    assert.match(result.growth.explanation, direction);
    assert.match(
      result.growth.explanation,
      /No mide alcance, éxito ni una tendencia global/,
    );
    if (currentCount <= beforeCount)
      assert.doesNotMatch(result.growth.label, /^(observed|early_signal)$/);
  });
}

test("different source queries cannot establish a direction", () => {
  const fixture = scenario(1, 4);
  storage.saveRecord(fixture.brand.id, "sources", {
    ...fixture.source,
    query: "otra consulta",
  });
  const result = resultFor(fixture);
  assert.equal(result.coverage.hasHistory, false);
  assert.equal(result.growth.label, "insufficient");
});

test("different configured sources cannot establish a direction", () => {
  const fixture = scenario(1, 4);
  storage.saveRecord(fixture.brand.id, "sources", {
    name: "Segunda fuente sintética",
    type: "rss",
    enabled: true,
    url: "https://example.com/synthetic/second-feed",
  });
  const result = resultFor(fixture);
  assert.equal(result.coverage.hasHistory, false);
  assert.equal(result.growth.label, "insufficient");
});

test("unequal or stale observation windows cannot establish a direction", () => {
  const fixture = scenario(1, 4);
  const wrongWindow = resultFor(fixture, {
    snapshots: [fixture.previous, { ...fixture.latest, windowMs: DAY }],
  });
  assert.equal(wrongWindow.coverage.hasHistory, false);
  assert.equal(wrongWindow.growth.label, "insufficient");
  const stale = resultFor(fixture, { now: latestTime + 4 * DAY });
  assert.equal(stale.coverage.hasHistory, false);
  assert.equal(stale.growth.label, "insufficient");
});

test("native YouTube metrics remain native even with comparable RSS history", () => {
  const fixture = scenario(1, 4);
  const youtube = storage.saveRecord(fixture.brand.id, "sources", {
    name: "YouTube sintético",
    type: "youtube",
    enabled: true,
  });
  const reference = addReference(fixture.brand, youtube, {
    platform: "youtube",
    contentScope: "metadata_only",
    text: "",
    metrics: { views: 123, likes: 7, comments: 1 },
    metricsOrigin: "YouTube Data API",
  });
  const result = resultFor(fixture, { references: [reference] });
  assert.equal(result.coverage.hasHistory, true);
  assert.equal(result.growth.label, "insufficient");
  assert.match(result.growth.explanation, /métricas nativas de YouTube/);
  assert.match(
    result.opportunities[0].evidence[0].detail,
    /123 vistas, 7 me gusta, 1 comentarios/,
  );
});

test("demonstration evidence cannot become an observed direction", () => {
  const fixture = scenario(1, 4);
  const demo = { ...fixture.brand, isDemo: true };
  const references = storage
    .listRecords(demo.id, "references")
    .map((reference) => ({ ...reference, isDemo: true }));
  const result = resultFor({ ...fixture, brand: demo }, { references });
  assert.equal(result.growth.label, "insufficient");
  assert.match(result.growth.explanation, /Ejemplo ilustrativo/);
});
