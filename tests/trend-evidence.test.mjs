import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildTrendEvidence,
  trendObservationScope,
  TREND_EVIDENCE_WINDOW_MS,
  TREND_EVIDENCE_FRESHNESS_MS,
} from "../server/trend-evidence.mjs";

const DAY = 86_400_000;
const WEEK = TREND_EVIDENCE_WINDOW_MS;
const NOW = Date.UTC(2026, 9, 18, 12);
const iso = (time) => new Date(time).toISOString();
const brand = { id: "synthetic-brand", pillars: ["Ventas", "Operaciones"] };
const source = {
  id: "public-hn",
  type: "hackernews",
  name: "Hacker News",
  enabled: true,
  query: "sales education",
  lastSyncedAt: iso(NOW),
};
function reference(id, patch = {}) {
  return {
    id,
    sourceId: source.id,
    title: "Ventas con ejemplos",
    topic: "Ventas",
    url: `https://example.com/public/${id}`,
    publishedAt: iso(NOW - DAY),
    ...patch,
  };
}
function snapshot(
  time,
  counts,
  patch = {},
  snapshotBrand = brand,
  sources = [source],
) {
  return {
    id: `snapshot-${time}`,
    origin: "public_source_observation",
    scope: trendObservationScope(snapshotBrand, sources),
    sourceIds: sources.map((item) => item.id).sort(),
    observedAt: iso(time),
    windowStart: iso(time - WEEK),
    windowMs: WEEK,
    counts,
    sampleSize: Object.values(counts).reduce((sum, count) => sum + count, 0),
    ...patch,
  };
}
function report(patch = {}, currentBrand = brand) {
  return buildTrendEvidence(currentBrand, {
    sources: [source],
    references: [],
    snapshots: [],
    now: NOW,
    ...patch,
  });
}
const row = (result, key = "ventas") =>
  result.topics.find((item) => item.topicKey === key);
const pair = (before = { ventas: 3 }, current = { ventas: 5 }) => [
  snapshot(NOW - WEEK, before),
  snapshot(NOW, current),
];
function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

test("a first corpus reports unique dated references without inventing a historical baseline", () => {
  const result = report({
    references: [
      reference("one"),
      reference("duplicate", {
        url: "https://example.com/public/one?utm_source=hn#excerpt",
      }),
      reference("old", { publishedAt: iso(NOW - WEEK) }),
      reference("undated", {
        publishedAt: undefined,
        firstSeenAt: iso(NOW - DAY),
      }),
      reference("invalid", { publishedAt: "not-a-date" }),
      reference("future", { publishedAt: iso(NOW + 1) }),
      reference("metrics", {
        metrics: { views: 1_000_000 },
        trendHistory: [{ observedAt: iso(NOW - WEEK), views: 10 }],
      }),
    ],
  });
  assert.equal(result.status, "insufficient");
  assert.deepEqual(result.flags, ["insufficient"]);
  assert.equal(result.countOrigin, "current_corpus");
  assert.equal(result.comparison, null);
  assert.equal(result.currentWindow.observedAt, null);
  assert.equal(result.currentWindow.sampleSize, 2);
  assert.equal(row(result).currentCount, 2);
  assert.equal(row(result).absoluteChange, null);
  assert.equal(row(result).previousCount, null);
  assert.equal(row(result).novelty, "insufficient");
  assert.equal(result.coverage.duplicateReferences, 1);
  assert.equal(result.coverage.undatedReferences, 1);
  assert.equal(result.coverage.invalidDateReferences, 1);
  assert.equal(result.coverage.futureDatedReferences, 1);
  assert.match(
    result.limitations.join(" "),
    /no mide alcance, rendimiento, causalidad/,
  );
});

test("two comparable persisted windows expose dates, counts and absolute changes for increases and declines", () => {
  const result = report({
    snapshots: pair(
      { ventas: 1, operaciones: 5, anterior: 2 },
      { ventas: 4, operaciones: 2, nuevo: 1 },
    ),
  });
  assert.equal(result.status, "comparable");
  assert.deepEqual(result.flags, []);
  assert.equal(result.countOrigin, "topic_snapshot");
  assert.equal(result.comparison.current.sampleSize, 7);
  assert.equal(result.comparison.previous.sampleSize, 8);
  assert.equal(result.comparison.current.windowStart, iso(NOW - WEEK));
  assert.equal(result.comparison.previous.windowEnd, iso(NOW - WEEK));
  assert.equal(result.comparison.separationMs, WEEK);
  assert.equal(result.comparison.gapMs, 0);
  assert.equal(row(result).absoluteChange, 3);
  assert.equal(row(result).direction, "increased");
  assert.equal(row(result).topic, "Ventas");
  assert.deepEqual(
    row(result).flags,
    ["small-sample"],
    "a small baseline remains a caveat even when the current count is larger",
  );
  assert.equal(row(result, "operaciones").absoluteChange, -3);
  assert.equal(row(result, "anterior").absoluteChange, -2);
  assert.equal(row(result, "anterior").novelty, "absent_in_current_window");
  assert.equal(row(result, "nuevo").novelty, "first_in_comparable_history");
  assert.deepEqual(row(result, "nuevo").flags, ["zero-base", "small-sample"]);
  assert.match(row(result, "nuevo").explanation, /no se calcula un porcentaje/);
  assert.equal(result.coverage.noveltyHistoryWindows, 1);
  assert.ok(!Object.hasOwn(row(result), "score"));
  assert.ok(!Object.hasOwn(row(result), "percentageChange"));
});

test("novelty is limited to prior nonoverlapping history and distinguishes a reappearance", () => {
  const result = report({
    snapshots: [
      snapshot(NOW - 3 * WEEK, { ventas: 1 }),
      snapshot(NOW - WEEK, { operaciones: 2 }),
      snapshot(NOW - DAY, { ventas: 1, nuevo: 1 }),
      snapshot(NOW, { ventas: 2, nuevo: 2 }),
    ],
  });
  assert.equal(row(result).novelty, "reappeared");
  assert.equal(row(result, "nuevo").novelty, "first_in_comparable_history");
  assert.equal(
    result.coverage.noveltyHistoryWindows,
    2,
    "overlapping refreshes are not prior independent windows",
  );
  assert.match(
    row(result, "nuevo").explanation,
    /no demuestra novedad fuera de este historial/,
  );
});

test("equal counts are stable; a zero observation remains a bounded sample", () => {
  const stable = report({ snapshots: pair({ ventas: 3 }, { ventas: 3 }) });
  assert.equal(row(stable).direction, "stable");
  assert.equal(row(stable).absoluteChange, 0);
  assert.deepEqual(row(stable).flags, []);
  const absent = report({ snapshots: pair({ ventas: 1 }, {}) });
  assert.equal(row(absent).currentCount, 0);
  assert.equal(row(absent).absoluteChange, -1);
  assert.match(
    absent.limitations.join(" "),
    /Un cero observado no prueba ausencia/,
  );
});

test("daily refreshes and duplicate snapshots do not provide independent historical windows", () => {
  const result = report({
    snapshots: [
      snapshot(NOW - 3_600_000, { ventas: 1 }),
      snapshot(NOW, { ventas: 2 }),
      snapshot(NOW, { ventas: 2 }),
    ],
  });
  assert.equal(result.status, "insufficient");
  assert.equal(result.coverage.validSnapshots, 1);
  assert.equal(result.coverage.duplicateSnapshots, 2);
  assert.equal(row(result).currentCount, 2);
  assert.equal(row(result).absoluteChange, null);
});

test("comparison boundaries require nonoverlapping 7-day windows and a baseline at most 9 days away", () => {
  for (const [separation, expected] of [
    [WEEK - 1, false],
    [WEEK, true],
    [WEEK + 2 * DAY, true],
    [WEEK + 2 * DAY + 1, false],
  ]) {
    const result = report({
      snapshots: [
        snapshot(NOW - separation, { ventas: 1 }),
        snapshot(NOW, { ventas: 3 }),
      ],
    });
    assert.equal(!!result.comparison, expected, `separation=${separation}`);
  }
  const tooOld = report({
    snapshots: [
      snapshot(NOW - 10 * DAY, { ventas: 1 }),
      snapshot(NOW, { ventas: 3 }),
    ],
  });
  assert.deepEqual(tooOld.flags, ["insufficient", "stale"]);
});

test("stale observations retain dated counts but cannot claim a current increase", () => {
  const freshBoundary = report({
    snapshots: [
      snapshot(NOW - WEEK - TREND_EVIDENCE_FRESHNESS_MS, { ventas: 1 }),
      snapshot(NOW - TREND_EVIDENCE_FRESHNESS_MS, { ventas: 4 }),
    ],
  });
  assert.equal(freshBoundary.status, "comparable");
  const result = report({
    snapshots: [
      snapshot(NOW - WEEK - 2 * DAY - 1, { ventas: 1 }),
      snapshot(NOW - 2 * DAY - 1, { ventas: 4 }),
    ],
  });
  assert.equal(result.status, "stale");
  assert.deepEqual(result.flags, ["insufficient", "stale"]);
  assert.equal(row(result).currentCount, 4);
  assert.equal(row(result).absoluteChange, null);
  assert.equal(result.comparison, null);
  assert.equal(result.currentWindow.windowEnd, iso(NOW - 2 * DAY - 1));
});

test("query, source configuration, source membership and editorial topic scopes must match", () => {
  for (const changed of [
    { sources: [{ ...source, query: "different query" }] },
    { sources: [{ ...source, language: "es" }] },
    { sources: [{ ...source, id: "new-source" }] },
    { sources: [] },
  ]) {
    const result = report({ snapshots: pair(), ...changed });
    assert.equal(result.status, "source-change", JSON.stringify(changed));
    assert.equal(result.comparison, null);
    assert.deepEqual(result.flags, ["insufficient", "source-change"]);
  }
  const result = report(
    { snapshots: pair() },
    { ...brand, pillars: ["Otro tema"] },
  );
  assert.equal(result.status, "source-change");
  const mixed = report({
    snapshots: [
      snapshot(NOW - WEEK, { ventas: 1 }, { scope: "a".repeat(24) }),
      snapshot(NOW, { ventas: 4 }),
    ],
  });
  assert.equal(mixed.comparison, null);
  assert.equal(mixed.status, "source-change");
});

test("staleness and scope changes remain separate diagnostic flags", () => {
  const result = report({
    sources: [{ ...source, query: "changed" }],
    snapshots: [
      snapshot(NOW - 3 * WEEK, { ventas: 1 }),
      snapshot(NOW - 2 * WEEK, { ventas: 3 }),
    ],
  });
  assert.equal(result.status, "source-change");
  assert.deepEqual(result.flags, ["insufficient", "stale", "source-change"]);
  assert.equal(result.comparison, null);
});

test("transient source metadata and input order do not change a persisted scope", () => {
  const changed = {
    ...source,
    name: "Renamed",
    lastError: undefined,
    lastResultCount: 8,
    updatedAt: iso(NOW),
    lastAttemptAt: iso(NOW),
    lastSyncedAt: iso(NOW + DAY),
  };
  assert.equal(
    trendObservationScope(brand, [source]),
    trendObservationScope(brand, [changed]),
  );
  const second = { id: "gdelt", type: "gdelt", enabled: true };
  assert.equal(
    trendObservationScope(brand, [source, second]),
    trendObservationScope(brand, [second, source]),
  );
  assert.equal(
    report({ snapshots: pair(), sources: [changed] }).status,
    "comparable",
  );
});

test("legacy scopes cannot verify implicit industry queries when no pillar was recorded", () => {
  const implicit = { ...source, query: "" };
  const oldBrand = { ...brand, pillars: [], industry: "Educación" };
  const currentBrand = { ...oldBrand, industry: "Finanzas" };
  assert.equal(
    trendObservationScope(oldBrand, [implicit]),
    trendObservationScope(currentBrand, [implicit]),
    "v1 does not fingerprint industry",
  );
  const result = report(
    {
      sources: [implicit],
      snapshots: [
        snapshot(NOW - WEEK, { ventas: 1 }, {}, oldBrand, [implicit]),
        snapshot(NOW, { ventas: 5 }, {}, currentBrand, [implicit]),
      ],
    },
    currentBrand,
  );
  assert.equal(result.comparison, null);
  assert.equal(result.scope.queryVerifiable, false);
  assert.deepEqual(result.flags, ["insufficient", "query-unverifiable"]);
  assert.match(result.summary, /consulta implícita basada en el sector/);
  const withPillar = report({
    sources: [implicit],
    snapshots: [
      snapshot(NOW - WEEK, { ventas: 1 }, {}, brand, [implicit]),
      snapshot(NOW, { ventas: 5 }, {}, brand, [implicit]),
    ],
  });
  assert.equal(withPillar.status, "comparable");
  const rss = { ...implicit, type: "rss", url: "https://example.com/feed" };
  const feedResult = report(
    {
      sources: [rss],
      snapshots: [
        snapshot(NOW - WEEK, { ventas: 1 }, {}, currentBrand, [rss]),
        snapshot(NOW, { ventas: 5 }, {}, currentBrand, [rss]),
      ],
    },
    currentBrand,
  );
  assert.equal(
    feedResult.status,
    "comparable",
    "an RSS URL does not use the industry query fallback",
  );
});

test("a topic key matching an object prototype property still has a numeric zero baseline", () => {
  const result = report({ snapshots: pair({ ventas: 1 }, { constructor: 2 }) });
  const topic = row(result, "constructor");
  assert.equal(topic.previousCount, 0);
  assert.equal(topic.absoluteChange, 2);
  assert.equal(topic.novelty, "first_in_comparable_history");
  assert.match(topic.explanation, /Base anterior cero/);
});

test("partial failures expose reduced coverage and never compare a full set with a subset", () => {
  const second = {
    id: "gdelt",
    type: "gdelt",
    enabled: true,
    lastError: "HTTP 429",
  };
  const previousSources = [source, { ...second, lastError: undefined }];
  const result = report({
    sources: [source, second],
    snapshots: [
      snapshot(NOW - WEEK, { ventas: 1 }, {}, brand, previousSources),
      snapshot(NOW, { ventas: 2 }),
    ],
  });
  assert.equal(result.status, "source-change");
  assert.deepEqual(result.scope.sourceIds, [source.id]);
  assert.deepEqual(result.coverage.erroredSourceIds, ["gdelt"]);
  assert.equal(result.coverage.configuredSources, 2);
  assert.equal(result.coverage.observedSources, 1);
});

test("disabled, demo, foreign-brand and restricted material including YouTube never enters the corpus", () => {
  const extraSources = [
    { id: "yt", type: "youtube", enabled: true },
    { id: "disabled", type: "hackernews", enabled: false },
    { id: "foreign", type: "gdelt", enabled: true, brandId: "other-brand" },
    {
      id: "yt-rss",
      type: "rss",
      url: "https://www.youtube.com/feeds/videos.xml",
      enabled: true,
    },
    { id: "demo-source", type: "hackernews", enabled: true, isDemo: true },
    { id: "apify", type: "apify", enabled: true },
  ];
  const result = report({
    sources: [source, ...extraSources],
    references: [
      reference("allowed"),
      ...extraSources.map((item) => reference(item.id, { sourceId: item.id })),
      reference("demo", { isDemo: true }),
      reference("foreign", { brandId: "other-brand" }),
      reference("restricted", { ingestionRestricted: true }),
      reference("youtube-platform", {
        platform: "youtube",
        metrics: { views: 500_000 },
      }),
      reference("youtube-url", { url: "https://youtu.be/synthetic" }),
      reference("youtube-origin", { metricsOrigin: "YouTube Data API" }),
      reference("youtube-ingestion", {
        ingestionAccess: { urls: ["https://youtube.com/watch?v=synthetic"] },
      }),
      reference("reddit", { ingestionProvider: "reddit" }),
    ],
  });
  assert.equal(result.coverage.uniqueReferences, 1);
  assert.equal(row(result).currentCount, 1);
  assert.deepEqual(result.scope.sourceIds, [source.id]);
  const demo = report(
    { references: [reference("one")], snapshots: pair() },
    { ...brand, isDemo: true },
  );
  assert.equal(demo.comparison, null);
  assert.deepEqual(demo.topics, []);
  assert.equal(demo.coverage.isDemo, true);
});

test("malformed or inconsistent snapshots are rejected instead of turning missing counts into zero", () => {
  const malformed = [
    { observedAt: "invalid" },
    { observedAt: iso(NOW + 1), windowStart: iso(NOW + 1 - WEEK) },
    { windowStart: iso(NOW - WEEK - 1) },
    { windowMs: DAY },
    { origin: "manual" },
    { sampleSize: 4 },
    { counts: { ventas: -1 }, sampleSize: -1 },
    { counts: { ventas: 1.5 }, sampleSize: 1.5 },
    { counts: { ventas: "1" }, sampleSize: 1 },
    {
      counts: { ventas: Number.MAX_SAFE_INTEGER, operaciones: 1 },
      sampleSize: Number.MAX_SAFE_INTEGER,
    },
    { counts: [] },
    { counts: { Ventas: 1 } },
    { sourceIds: [source.id, source.id] },
    { sourceIds: [] },
    { sourceIds: [null] },
    { brandId: "other-brand" },
    { isDemo: true },
    { scope: "unversioned" },
  ];
  for (const patch of malformed) {
    const result = report({
      snapshots: [
        snapshot(NOW - WEEK, { ventas: 1 }),
        snapshot(NOW, { ventas: 1 }, patch),
      ],
    });
    assert.equal(result.comparison, null, JSON.stringify(patch));
    assert.equal(result.coverage.rejectedSnapshots, 1, JSON.stringify(patch));
  }
});

test("conflicting copies at the same timestamp cannot select a convenient growth count", () => {
  const snapshots = [
    snapshot(NOW - WEEK, { ventas: 1 }),
    snapshot(NOW, { ventas: 2 }),
    snapshot(NOW, { ventas: 200 }),
  ];
  for (const input of [snapshots, [...snapshots].reverse()]) {
    const result = report({ snapshots: input });
    assert.equal(result.comparison, null);
    assert.equal(result.coverage.rejectedSnapshots, 2);
  }
});

test("topic labels do not copy contact details, authors, queries, content or native metrics to the report", () => {
  const result = report({
    references: [
      reference("contact", {
        topic: "contact@example.com",
        author: "Synthetic individual",
        text: "Private example body",
        metrics: { views: 999_999 },
      }),
    ],
  });
  const json = JSON.stringify(result);
  for (const text of [
    "contact@example.com",
    "Synthetic individual",
    "Private example body",
    "sales education",
    "999999",
  ])
    assert.ok(!json.includes(text), text);
});

test("the builder is deterministic with explicit time and leaves frozen inputs untouched", () => {
  const input = deepFreeze({
    sources: [source],
    references: [reference("one")],
    snapshots: pair(),
    now: NOW,
  });
  const currentBrand = deepFreeze({ ...brand, pillars: [...brand.pillars] });
  const first = buildTrendEvidence(currentBrand, input);
  assert.deepEqual(first, buildTrendEvidence(currentBrand, input));
  assert.deepEqual(
    first,
    buildTrendEvidence(currentBrand, { ...input, now: new Date(NOW) }),
  );
  assert.deepEqual(
    first,
    buildTrendEvidence(currentBrand, { ...input, now: iso(NOW) }),
  );
  assert.throws(() => report({ now: "invalid" }), TypeError);
  assert.throws(() => report({ now: Infinity }), TypeError);
  assert.throws(() => report({ now: null }), TypeError);
  assert.equal(buildTrendEvidence({}).status, "insufficient");
});

test("the scope and counts accept real recordTopicObservation snapshots without adapting stored data", async () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), "kompass-trend-evidence-"),
  );
  const oldDirectory = process.env.DATA_DIR;
  process.env.DATA_DIR = directory;
  let storage;
  try {
    storage = await import("../server/db.mjs");
    const { recordTopicObservation } =
      await import("../server/audience-insights.mjs");
    const actualBrand = storage.saveBrand({
      ...brand,
      id: "real-writer-synthetic-brand",
    });
    const actualSource = storage.saveRecord(actualBrand.id, "sources", {
      ...source,
      id: "real-source",
    });
    const before = NOW - WEEK;
    storage.saveRecord(
      actualBrand.id,
      "references",
      reference("first", {
        sourceId: actualSource.id,
        publishedAt: iso(before - DAY),
        topic: undefined,
        title: "Sales education for teams",
      }),
    );
    const first = recordTopicObservation(actualBrand.id, {
      now: before,
      sourceIds: [actualSource.id],
    });
    for (let index = 0; index < 3; index++)
      storage.saveRecord(
        actualBrand.id,
        "references",
        reference(`current-${index}`, { sourceId: actualSource.id }),
      );
    storage.saveRecord(
      actualBrand.id,
      "references",
      reference("duplicate", {
        sourceId: actualSource.id,
        url: "https://example.com/public/current-0?utm_campaign=hn#section",
      }),
    );
    storage.saveRecord(
      actualBrand.id,
      "references",
      reference("first-seen-only", {
        sourceId: actualSource.id,
        publishedAt: undefined,
        firstSeenAt: iso(NOW - DAY),
      }),
    );
    const second = recordTopicObservation(actualBrand.id, {
      now: NOW,
      sourceIds: [actualSource.id],
    });
    assert.equal(
      first.scope,
      trendObservationScope(actualBrand, [actualSource]),
    );
    assert.equal(first.counts.ventas, 1);
    assert.equal(second.counts.ventas, 3);
    const result = buildTrendEvidence(actualBrand, {
      references: storage.listRecords(actualBrand.id, "references"),
      sources: storage.listRecords(actualBrand.id, "sources"),
      snapshots: storage.listRecords(actualBrand.id, "topicSnapshots"),
      now: NOW,
    });
    assert.equal(result.status, "comparable");
    assert.equal(row(result).currentCount, 3);
    assert.equal(row(result).previousCount, 1);
    assert.equal(row(result).absoluteChange, 2);
    assert.equal(result.coverage.currentWindowReferences, 3);
    assert.equal(result.coverage.duplicateReferences, 1);
    assert.equal(result.coverage.undatedReferences, 1);
  } finally {
    storage?.db.close();
    if (oldDirectory === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = oldDirectory;
    rmSync(directory, { recursive: true, force: true });
  }
});
