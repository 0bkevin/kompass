import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFormatEvidence,
  FORMAT_EVIDENCE_MIN_SAMPLE_SIZE,
} from "../server/format-evidence.mjs";

// Synthetic records only; no transports, stored workspace data or credentials.
const NOW = Date.parse("2026-10-18T12:00:00Z");
const DAY = 86_400_000;
const BRAND = { id: "brand", audience: [{ id: "teams" }, { id: "editors" }] };
const report = (options = {}, brand = BRAND) =>
  buildFormatEvidence(brand, { now: NOW, ...options });
const reference = (id, values = {}) => ({
  id,
  title: "Synthetic reference",
  source: "Texto propio aportado",
  format: "article",
  ...values,
});
const sample = (id, pieceValues = {}, outcomeValues = {}) => ({
  piece: {
    id,
    status: "published",
    segmentId: "teams",
    channel: "linkedin",
    format: "post",
    ...pieceValues,
  },
  outcome: {
    id: `outcome-${id}`,
    pieceId: id,
    origin: "manual",
    segmentId: "teams",
    channel: "linkedin",
    publishedAt: new Date(NOW - 2 * DAY).toISOString(),
    measuredAt: new Date(NOW - DAY).toISOString(),
    createdAt: new Date(NOW - DAY).toISOString(),
    metrics: { views: 100, engagement: 10, leads: 1 },
    ...outcomeValues,
  },
});
const withSamples = (samples, values = {}) =>
  report({
    pieces: samples.map((item) => item.piece),
    outcomes: samples.map((item) => item.outcome),
    ...values,
  });
const reasonFor = (result, kind, id) =>
  result.exclusions[kind].find((item) => item.id === id)?.reason;

test("cold input produces insufficient evidence without a LinkedIn or post fallback", () => {
  const result = report();
  assert.equal(result.status, "insufficient");
  assert.equal(result.observed.sampleSize, 0);
  assert.deepEqual(result.observed.groups, []);
  assert.equal(result.manualPerformance.status, "insufficient");
  assert.equal(result.manualPerformance.minimumSampleSize, 3);
  assert.equal(FORMAT_EVIDENCE_MIN_SAMPLE_SIZE, 3);
  assert.deepEqual(result.recommendations, []);
  assert.match(result.manualPerformance.reason, /fecha explícita de medición/);
  assert.doesNotMatch(
    JSON.stringify(result),
    /"channel":"linkedin"|"format":"post"/,
  );
  for (const input of [null, false, {}, []]) {
    assert.equal(
      buildFormatEvidence(input, { now: NOW }).status,
      "insufficient",
    );
  }
  assert.equal(
    report({ references: null, pieces: false, outcomes: {}, sources: null })
      .status,
    "insufficient",
  );
});

test("observed distribution uses unique publications and does not reuse their native metrics", () => {
  const result = report({
    references: [
      reference("first", {
        url: "https://example.com/story",
        metrics: { views: 900_000 },
        createdAt: "2026-10-01",
      }),
      reference("copy", {
        url: "https://example.com/story?utm_source=fixture#section",
        createdAt: "2026-10-02",
      }),
      reference("unknown", {
        format: "trend",
        source: "LinkedIn suggested by text",
      }),
      reference("missing", { format: undefined }),
    ],
  });
  assert.equal(result.status, "observed");
  assert.equal(result.observed.sampleSize, 3);
  const article = result.observed.groups.find(
    (group) => group.format === "article",
  );
  assert.equal(article.sampleSize, 1);
  assert.deepEqual(article.referenceIds, ["first"]);
  assert.equal(article.channel, null);
  const unknown = result.observed.groups.find(
    (group) => group.format === "unknown",
  );
  assert.equal(unknown.sampleSize, 2);
  assert.equal(unknown.channel, null);
  assert.equal(
    reasonFor(result, "references", "copy"),
    "duplicate_publication",
  );
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0].basis, "observed_distribution");
  assert.match(
    result.recommendations[0].reason,
    /frecuencia no demuestra rendimiento/,
  );
  assert.equal(result.manualPerformance.status, "insufficient");
  assert.doesNotMatch(
    JSON.stringify(result),
    /900000|successRate|score|percentage/,
  );
});

test("unknown formats alone cannot create a recommendation", () => {
  const result = report({
    references: [reference("unknown", { format: "trend" })],
  });
  assert.equal(result.observed.sampleSize, 1);
  assert.equal(result.observed.groups[0].format, "unknown");
  assert.equal(result.status, "insufficient");
  assert.deepEqual(result.recommendations, []);
});

test("distribution preserves all established reference formats without converting them to post", () => {
  const formats = [
    "article",
    "discussion",
    "image",
    "link",
    "post",
    "carousel",
    "reel",
    "video",
    "newsletter",
  ];
  const result = report({
    references: formats.map((format) => reference(`ref-${format}`, { format })),
  });
  assert.equal(result.observed.sampleSize, formats.length);
  assert.deepEqual(
    new Set(result.observed.groups.map((group) => group.format)),
    new Set(formats),
  );
  assert.equal(result.recommendations.length, formats.length);
  assert.ok(result.recommendations.every((item) => item.channel === null));
});

test("HN, GDELT and Trends never become observations of a social channel", () => {
  const sources = [
    { id: "hn", type: "hackernews" },
    { id: "gdelt", type: "gdelt" },
    {
      id: "trends",
      type: "rss",
      url: "https://trends.google.com/trending/rss?geo=ES",
    },
  ];
  const result = report({
    sources,
    references: [
      reference("hn-story", { sourceId: "hn", platform: "linkedin" }),
      reference("news-story", { sourceId: "gdelt", platform: "linkedin" }),
      reference("search", {
        sourceId: "trends",
        format: "trend",
        ingestionAccess: { purpose: "rss", url: sources[2].url },
      }),
    ],
  });
  assert.equal(result.observed.sampleSize, 3);
  assert.ok(result.observed.groups.every((group) => group.channel === null));
  assert.deepEqual(
    new Set(result.observed.groups.map((group) => group.sourceType)),
    new Set(["hackernews", "gdelt", "rss"]),
  );
  assert.ok(result.recommendations.every((item) => item.channel === null));
  assert.match(
    result.limitations.join(" "),
    /No equivalen a observaciones de redes/,
  );
});

test("static restrictions win over approval snapshots and official YouTube counters", () => {
  const restricted = [
    { id: "demo", isDemo: true },
    { id: "youtube", platform: "youtube", metricsOrigin: "YouTube Data API" },
    { id: "youtube-url", url: "https://www.youtube.com/watch?v=fixture" },
    { id: "youtube-derivative", providerAttributions: [{ id: "youtube" }] },
    { id: "apify", ingestionProvider: "apify" },
    { id: "restricted-flag", ingestionRestricted: true },
    { id: "instagram-url", url: "https://www.instagram.com/p/fixture" },
    { id: "linkedin-url", url: "https://www.linkedin.com/posts/fixture" },
    { id: "reddit", source: "Reddit" },
    { id: "embedded", evidence: [{ metricsOrigin: "YouTube Data API" }] },
    {
      id: "ingestion-url",
      ingestionAccess: { url: "https://youtu.be/fixture" },
    },
    { id: "youtube-source", sourceId: "official-youtube" },
    { id: "instagram-provider", ingestionProvider: "instagram" },
    { id: "tiktok-source", sourceId: "official-tiktok" },
    { id: "instagram-mislabeled", platform: "instagram", sourceId: "hn" },
  ];
  const result = report({
    sources: [
      {
        id: "official-youtube",
        type: "youtube",
        accessPolicy: { allowed: true },
      },
      {
        id: "official-tiktok",
        type: "tiktok",
        accessPolicy: { allowed: true },
      },
      { id: "hn", type: "hackernews" },
    ],
    references: restricted.map((item) =>
      reference(item.id, { ...item, accessPolicy: { allowed: true } }),
    ),
  });
  assert.equal(result.observed.sampleSize, 0);
  assert.equal(result.recommendations.length, 0);
  assert.equal(reasonFor(result, "references", "demo"), "demo");
  for (const item of restricted.slice(1))
    assert.equal(
      reasonFor(result, "references", item.id),
      "restricted",
      item.id,
    );
  assert.equal(
    report({ references: [reference("real")] }, { ...BRAND, isDemo: true })
      .observed.sampleSize,
    0,
  );
});

test("collected web references need current evaluated policy snapshots, not credentials", () => {
  const policy = {
    allowed: true,
    reviewedAt: "2026-10-01",
    expiresAt: "2026-10-19",
  };
  const refs = [
    reference("allowed", {
      sourceId: "rss",
      ingestionAccess: { url: "https://example.com/feed", purpose: "rss" },
      accessPolicy: policy,
    }),
    reference("unreviewed", {
      sourceId: "rss",
      ingestionAccess: { url: "https://example.com/feed", purpose: "rss" },
    }),
    reference("expired", {
      accessPolicy: { ...policy, expiresAt: new Date(NOW).toISOString() },
    }),
    reference("future-review", {
      accessPolicy: { ...policy, reviewedAt: "2026-10-19" },
    }),
    reference("malformed-review", {
      accessPolicy: { ...policy, expiresAt: "bad" },
    }),
    reference("explicit-deny", { accessPolicy: { allowed: false } }),
    reference("source-deny", { sourceId: "denied", accessPolicy: policy }),
    reference("missing-source", { sourceId: "unknown", accessPolicy: policy }),
    reference("credential-only", { sourceId: "key-only" }),
    reference("private-url-omitted", { originalUrlOmitted: true }),
  ];
  const result = report({
    references: refs,
    sources: [
      { id: "rss", type: "rss", accessPolicy: policy },
      { id: "denied", type: "gdelt", accessPolicy: { allowed: false } },
      { id: "key-only", type: "rss", apiKey: "synthetic-unused" },
    ],
  });
  assert.equal(result.observed.sampleSize, 1);
  assert.deepEqual(result.observed.groups[0].referenceIds, ["allowed"]);
  assert.equal(
    reasonFor(result, "references", "unreviewed"),
    "unverified_policy",
  );
  assert.equal(
    reasonFor(result, "references", "credential-only"),
    "unverified_policy",
  );
  assert.equal(reasonFor(result, "references", "source-deny"), "restricted");
  assert.equal(
    reasonFor(result, "references", "missing-source"),
    "missing_source",
  );
});

test("three independent manual pieces with exact measured intervals expose descriptive counts", () => {
  const samples = [
    sample("one", {}, { metrics: { views: 100, engagement: 0, leads: 1 } }),
    sample(
      "two",
      {},
      {
        publishedAt: new Date(NOW - 4 * DAY).toISOString(),
        measuredAt: new Date(NOW - 3 * DAY).toISOString(),
        metrics: { views: 300, engagement: 20, leads: 3 },
      },
    ),
    sample("three", {}, { metrics: { views: 200, engagement: 10, leads: 2 } }),
  ];
  const result = withSamples(samples);
  assert.equal(result.status, "comparable");
  assert.equal(result.observed.status, "insufficient");
  const [group] = result.manualPerformance.groups;
  assert.equal(group.status, "comparable");
  assert.equal(group.sampleSize, 3);
  assert.equal(group.minimumSampleSize, 3);
  assert.deepEqual(group.measurementWindow, {
    kind: "measured_interval",
    durationMs: DAY,
  });
  assert.deepEqual(group.metrics, {
    views: { median: 200, min: 100, max: 300 },
    engagement: { median: 10, min: 0, max: 20 },
    leads: { median: 2, min: 1, max: 3 },
  });
  assert.equal(result.recommendations[0].basis, "manual_comparable");
  assert.deepEqual(result.recommendations[0].pieceIds, ["one", "three", "two"]);
  assert.match(result.recommendations[0].reason, /No establece una ventaja/);
  assert.match(group.reason, /no acredita significación estadística/);
  assert.doesNotMatch(
    JSON.stringify(result),
    /%|successRate|"score"|uplift|probability/,
  );
});

test("two pieces remain insufficient and cannot be inflated by a reference count", () => {
  const result = withSamples([sample("one"), sample("two")], {
    references: Array.from({ length: 6 }, (_, i) =>
      reference(`reference-${i}`, { format: "post" }),
    ),
  });
  assert.equal(result.observed.sampleSize, 6);
  assert.equal(result.manualPerformance.status, "insufficient");
  assert.equal(result.manualPerformance.groups[0].sampleSize, 2);
  assert.equal(result.manualPerformance.groups[0].metrics, null);
  assert.ok(
    result.recommendations.every(
      (item) => item.basis === "observed_distribution",
    ),
  );
});

test("segment, channel, format and exact interval each partition manual measurements", () => {
  const samples = [sample("base"), sample("same")];
  samples.push(
    sample("segment", { segmentId: "editors" }, { segmentId: "editors" }),
  );
  samples.push(
    sample("channel", { channel: "instagram" }, { channel: "instagram" }),
  );
  samples.push(sample("format", { format: "carousel" }));
  samples.push(
    sample("window", {}, { measuredAt: new Date(NOW - DAY + 1).toISOString() }),
  );
  const result = withSamples(samples);
  assert.equal(result.manualPerformance.groups.length, 5);
  assert.equal(result.manualPerformance.status, "insufficient");
  assert.deepEqual(
    result.manualPerformance.groups.map((group) => group.sampleSize).sort(),
    [1, 1, 1, 1, 2],
  );
  assert.deepEqual(result.recommendations, []);
});

test("sufficient measurements in two networks keep separate counts and recommendations", () => {
  const samples = [];
  for (const channel of ["linkedin", "instagram"])
    for (let i = 0; i < 3; i++)
      samples.push(
        sample(
          `${channel}-${i}`,
          { channel },
          {
            channel,
            metrics: {
              views: channel === "linkedin" ? 100 : 900,
              engagement: 0,
              leads: 0,
            },
          },
        ),
      );
  const result = withSamples(samples);
  assert.equal(result.manualPerformance.groups.length, 2);
  assert.deepEqual(
    new Set(
      result.manualPerformance.groups.map(
        (group) => group.metrics.views.median,
      ),
    ),
    new Set([100, 900]),
  );
  assert.ok(
    result.manualPerformance.groups.every((group) => group.sampleSize === 3),
  );
  assert.equal(result.recommendations.length, 2);
  assert.ok(
    result.recommendations.every(
      (item) => item.status === "editorial_hypothesis",
    ),
  );
  assert.equal(result.manualPerformance.metrics, undefined);
  assert.equal(result.manualPerformance.score, undefined);
});

test("manual LinkedIn, Instagram and TikTok publication URLs remain admissible without collection", () => {
  const samples = [
    sample(
      "linkedin",
      {},
      { publishedUrl: "https://www.linkedin.com/posts/company-example" },
    ),
    sample(
      "instagram",
      {
        channel: "instagram",
        publishedUrl: "https://www.instagram.com/p/fixture",
      },
      {
        channel: "instagram",
        publishedUrl: "https://www.instagram.com/p/fixture",
      },
    ),
    sample(
      "tiktok",
      { channel: "tiktok" },
      {
        channel: "tiktok",
        publishedUrl: "https://www.tiktok.com/@example/video/fixture",
      },
    ),
  ];
  const result = withSamples(samples);
  assert.equal(result.manualPerformance.groups.length, 3);
  assert.ok(
    result.manualPerformance.groups.every((group) => group.sampleSize === 1),
  );
  assert.deepEqual(result.exclusions.outcomes, []);
});

test("legacy save dates remain insufficient even with enough manual records", () => {
  const result = withSamples(
    ["one", "two", "three"].map((id) =>
      sample(id, {}, { measuredAt: undefined }),
    ),
  );
  assert.equal(result.manualPerformance.status, "insufficient");
  const [group] = result.manualPerformance.groups;
  assert.equal(group.sampleSize, 3);
  assert.equal(group.measurementWindow.kind, "recorded_interval");
  assert.equal(group.metrics, null);
  assert.match(group.reason, /fecha de guardado sólo aproxima/);
  assert.equal(result.recommendations.length, 0);
});

test("explicit and inferred measurement windows cannot be pooled", () => {
  const result = withSamples([
    sample("explicit-one"),
    sample("explicit-two"),
    sample("implicit", {}, { measuredAt: undefined }),
  ]);
  assert.equal(result.manualPerformance.groups.length, 2);
  assert.equal(result.manualPerformance.status, "insufficient");
});

test("corrections replace a piece measurement rather than increasing sample size", () => {
  const samples = [sample("one"), sample("two"), sample("three")];
  const updated = {
    ...samples[0].outcome,
    id: "correction",
    updatedAt: new Date(NOW).toISOString(),
    metrics: { views: 700, engagement: 70, leads: 7 },
  };
  const result = withSamples(samples, {
    outcomes: [...samples.map((item) => item.outcome), updated],
  });
  const [group] = result.manualPerformance.groups;
  assert.equal(group.sampleSize, 3);
  assert.deepEqual(group.metrics.views, { median: 100, min: 100, max: 700 });
  assert.ok(group.outcomeIds.includes("correction"));
  assert.ok(!group.outcomeIds.includes("outcome-one"));
  assert.equal(reasonFor(result, "outcomes", "outcome-one"), "duplicate_piece");
  const invalidCorrection = withSamples(samples, {
    outcomes: [
      ...samples.map((item) => item.outcome),
      { ...updated, metrics: { views: -1 } },
    ],
  });
  assert.equal(invalidCorrection.manualPerformance.status, "insufficient");
  assert.equal(invalidCorrection.manualPerformance.groups[0].sampleSize, 2);
  assert.equal(
    reasonFor(invalidCorrection, "outcomes", "correction"),
    "invalid_metrics",
  );
});

test("multiple pieces pointing at the same publication do not inflate the manual sample", () => {
  const result = withSamples([
    sample(
      "one",
      {},
      { publishedUrl: "https://www.linkedin.com/posts/fixture" },
    ),
    sample(
      "copy",
      {},
      {
        publishedUrl:
          "https://www.linkedin.com/posts/fixture?utm_source=copy#section",
      },
    ),
    sample(
      "other",
      {},
      { publishedUrl: "https://www.linkedin.com/posts/other" },
    ),
  ]);
  assert.equal(result.manualPerformance.status, "insufficient");
  assert.equal(result.manualPerformance.groups[0].sampleSize, 2);
  assert.equal(
    result.exclusions.outcomes.filter(
      (item) => item.reason === "duplicate_publication",
    ).length,
    1,
  );
});

test("invalid metrics, future dates and incomplete or mismatched dimensions are excluded", () => {
  const cases = [
    [
      "string-metric",
      {},
      { metrics: { views: "100", engagement: 0, leads: 0 } },
      "invalid_metrics",
    ],
    [
      "negative",
      {},
      { metrics: { views: -1, engagement: 0, leads: 0 } },
      "invalid_metrics",
    ],
    [
      "infinite",
      {},
      { metrics: { views: Infinity, engagement: 0, leads: 0 } },
      "invalid_metrics",
    ],
    [
      "too-large",
      {},
      { metrics: { views: 1e12 + 1, engagement: 0, leads: 0 } },
      "invalid_metrics",
    ],
    [
      "future",
      {},
      { measuredAt: new Date(NOW + 1).toISOString() },
      "invalid_measurement_window",
    ],
    [
      "before-publication",
      {},
      { measuredAt: new Date(NOW - 3 * DAY).toISOString() },
      "invalid_measurement_window",
    ],
    [
      "bad-measurement",
      {},
      { measuredAt: "bad" },
      "invalid_measurement_window",
    ],
    [
      "no-publication",
      {},
      { publishedAt: undefined },
      "invalid_measurement_window",
    ],
    ["no-channel", { channel: undefined }, {}, "mismatched_dimensions"],
    ["channel-conflict", {}, { channel: "instagram" }, "mismatched_dimensions"],
    ["no-segment", { segmentId: undefined }, {}, "mismatched_dimensions"],
    [
      "old-segment",
      { segmentId: "deleted" },
      { segmentId: "deleted" },
      "mismatched_dimensions",
    ],
    ["format-conflict", {}, { format: "video" }, "mismatched_dimensions"],
    ["unknown-format", { format: "unknown" }, {}, "mismatched_dimensions"],
    [
      "publication-conflict",
      { publishedAt: new Date(NOW - 3 * DAY).toISOString() },
      {},
      "mismatched_dimensions",
    ],
    ["draft", { status: "draft" }, {}, "unpublished_or_missing_piece"],
    ["automated", {}, { origin: "official_api" }, "not_manual"],
    ["demo", { isDemo: true }, {}, "demo"],
  ];
  const result = withSamples(
    cases.map(([id, piece, outcome]) => sample(id, piece, outcome)),
  );
  assert.equal(result.manualPerformance.groups.length, 0);
  for (const [id, , , expected] of cases)
    assert.equal(reasonFor(result, "outcomes", `outcome-${id}`), expected, id);
});

test("manual YouTube results and pieces derived from restricted or missing references stay excluded", () => {
  const samples = [
    sample("youtube", { channel: "youtube" }, { channel: "youtube" }),
    sample("linked-youtube", { referenceId: "youtube-ref" }),
    sample("linked-restricted", { referenceId: "blocked-ref" }),
    sample("missing", { referenceId: "missing-ref" }),
    sample("attributed", { providerAttributions: [{ id: "youtube" }] }),
    sample("brief", {
      editorialBrief: { providerAttributions: [{ id: "youtube" }] },
    }),
    sample("published-url", {}, { publishedUrl: "https://youtu.be/fixture" }),
  ];
  const result = withSamples(samples, {
    references: [
      reference("youtube-ref", { platform: "youtube" }),
      reference("blocked-ref", { accessPolicy: { allowed: false } }),
    ],
  });
  assert.equal(result.observed.sampleSize, 0);
  assert.equal(result.manualPerformance.groups.length, 0);
  assert.equal(result.recommendations.length, 0);
  for (const id of ["linked-youtube", "linked-restricted", "missing"])
    assert.equal(
      reasonFor(result, "outcomes", `outcome-${id}`),
      "unverified_reference",
    );
});

test("zero views and zero results remain measured counts, with no denominator or success rate", () => {
  const result = withSamples(
    ["one", "two", "three", "four"].map((id) =>
      sample(id, {}, { metrics: { views: 0, engagement: 0, leads: 0 } }),
    ),
  );
  assert.equal(result.manualPerformance.status, "comparable");
  assert.deepEqual(result.manualPerformance.groups[0].metrics.views, {
    median: 0,
    min: 0,
    max: 0,
  });
  assert.doesNotMatch(JSON.stringify(result), /NaN|Infinity|%/);
});

test("brand boundaries exclude references, sources, pieces and outcomes from another workspace", () => {
  const samples = [
    sample("foreign-piece", { brandId: "other" }),
    sample("foreign-outcome", {}, { brandId: "other" }),
  ];
  const result = withSamples(samples, {
    references: [
      reference("foreign-ref", { brandId: "other" }),
      reference("foreign-source", { sourceId: "other-source" }),
    ],
    sources: [{ id: "other-source", type: "hackernews", brandId: "other" }],
  });
  assert.equal(result.status, "insufficient");
  assert.equal(result.observed.sampleSize, 0);
  assert.equal(result.manualPerformance.groups.length, 0);
  assert.ok(
    [...result.exclusions.references, ...result.exclusions.outcomes].every(
      (item) => item.reason === "different_brand",
    ),
  );
});

test("report is immutable, deterministic and excludes free text, audience names and URLs", () => {
  const samples = [sample("one"), sample("two"), sample("three")];
  const options = {
    references: [
      reference("ref", {
        title: "PRIVATE TITLE",
        text: "PRIVATE TEXT",
        url: "https://example.com/story",
      }),
    ],
    pieces: samples.map((item) => ({
      ...item.piece,
      title: "PRIVATE PIECE",
      script: "PRIVATE SCRIPT",
    })),
    outcomes: samples.map((item) => ({
      ...item.outcome,
      notes: "PRIVATE NOTE",
    })),
    sources: [],
  };
  const copy = structuredClone(options);
  const brand = {
    ...BRAND,
    name: "PRIVATE BRAND",
    audience: [{ id: "teams", name: "PRIVATE AUDIENCE" }],
  };
  const result = report(options, brand);
  assert.deepEqual(options, copy);
  assert.deepEqual(
    result,
    report(
      {
        ...options,
        outcomes: [...options.outcomes].reverse(),
        pieces: [...options.pieces].reverse(),
      },
      brand,
    ),
  );
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|https:\/\/example/);
  assert.equal(
    report({ now: new Date(NOW) }).generatedAt,
    new Date(NOW).toISOString(),
  );
  assert.equal(
    report({ now: new Date(NOW).toISOString() }).generatedAt,
    new Date(NOW).toISOString(),
  );
  for (const now of [null, "bad", Infinity, 1e17])
    assert.throws(() => report({ now }), /now debe ser una fecha válida/);
});
