import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildDiscoveryCoverage,
  DISCOVERY_COVERAGE_VERSION,
} from "../server/discovery-coverage.mjs";
import { REFERENCE_IDENTITY_VERSION } from "../server/reference-identity.mjs";

const now = "2026-10-18T12:00:00.000Z";
const brand = { id: "brand-coverage" };
const hn = {
  id: "hn",
  name: "LinkedIn — etiqueta editable",
  type: "hackernews",
  platform: "linkedin",
  enabled: true,
};
const gdelt = { id: "gdelt", type: "gdelt", enabled: true };
const feedUrl = "https://trends.google.com/trending/rss?geo=US";
const trends = { id: "trends", type: "rss", url: feedUrl, enabled: true };
const report = (input = {}) => buildDiscoveryCoverage(brand, { now, ...input });
const network = (result, id) =>
  result.networks.find((entry) => entry.id === id);
const reference = (id, extra = {}) => ({
  id,
  title: "Título sintético",
  url: `https://example.com/articles/${id}`,
  createdAt: "2026-10-18T09:00:00Z",
  ...extra,
});

function freeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

test("empty report is JSON-safe, deterministic, and explicit about unobserved networks", () => {
  const result = buildDiscoveryCoverage(brand, {});
  assert.equal(result.version, DISCOVERY_COVERAGE_VERSION);
  assert.equal(result.identityVersion, REFERENCE_IDENTITY_VERSION);
  assert.equal(result.asOf, null);
  assert.equal(result.summary.counts.publishedLast7Days, null);
  assert.equal(result.summary.counts.uniqueReferences, 0);
  for (const name of ["linkedin", "instagram", "tiktok", "youtube"]) {
    assert.equal(network(result, name).editorialAnalysisAllowed, false);
    assert.equal(network(result, name).counts.uniqueReferences, 0);
    assert.equal(network(result, name).officialConnection, null);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.deepEqual(buildDiscoveryCoverage(brand, {}), result);
});

test("configured, enabled, successful empty query and failed query are distinct", () => {
  const result = report({
    sources: [
      hn,
      {
        ...gdelt,
        lastSyncedAt: "2026-10-17T10:00:00Z",
        lastResultCount: 9,
        lastAttemptAt: now,
        lastError: "GDELT: HTTP 429",
      },
      { ...trends, lastSyncedAt: now, lastResultCount: 0 },
    ],
  });
  assert.equal(result.summary.configuredSources, 3);
  assert.equal(result.summary.enabledSources, 3);
  assert.equal(result.summary.verifiedSources, 1);
  assert.equal(result.summary.counts.uniqueReferences, 0);
  assert.equal(result.sources[0].verification.status, "not_verified");
  assert.equal(result.sources[1].verification.status, "error");
  assert.equal(
    result.sources[1].verification.lastSyncedAt,
    "2026-10-17T10:00:00.000Z",
  );
  assert.equal(result.sources[2].verification.status, "verified");
  assert.equal(result.sources[2].verification.lastResultCount, 0);
  assert.deepEqual(result.errors[0], {
    sourceId: "gdelt",
    stage: "collection",
    code: "RATE_LIMITED",
    httpStatus: 429,
    occurredAt: now,
    message: "La fuente limitó la consulta.",
  });
});

test("API titles and search interest never become LinkedIn reading through labels or publisher links", () => {
  const result = report({
    sources: [hn, gdelt, trends],
    references: [
      reference("hn-post", {
        sourceId: "hn",
        platform: "linkedin",
        source: "LinkedIn",
        url: "https://www.linkedin.com/posts/synthetic-post",
        text: "",
        metrics: { score: 100 },
      }),
      reference("news", { sourceId: "gdelt", text: "", firstSeenAt: now }),
      reference("trend", {
        sourceId: "trends",
        text: "",
        ingestionAccess: { url: feedUrl, purpose: "rss" },
      }),
    ],
  });
  assert.equal(network(result, "hackernews").counts.metadataOnly, 1);
  assert.equal(network(result, "gdelt").counts.metadataOnly, 1);
  assert.equal(network(result, "google_trends").counts.metadataOnly, 1);
  assert.equal(network(result, "google_trends").counts.feedReads, 1);
  assert.equal(network(result, "linkedin").counts.uniqueReferences, 0);
  assert.equal(result.summary.counts.pageReads, 0);
  assert.equal(result.summary.counts.linkedWithoutPageRead, 3);
  assert.equal(result.summary.counts.datedReferences, 0);
  assert.equal(result.summary.dates.firstSeen.to, now);
});

test("deduplicates publication URLs globally and per source without losing separate source coverage", () => {
  const result = report({
    sources: [hn, gdelt],
    references: [
      reference("one", {
        sourceId: "hn",
        url: "https://example.com/article?utm_source=hn#section",
      }),
      reference("two", { sourceId: "hn", url: "https://example.com/article" }),
      reference("three", {
        sourceId: "gdelt",
        url: "https://example.com/article?fbclid=synthetic",
      }),
      reference("four", {
        sourceId: "hn",
        url: "https://example.com/article?id=2",
      }),
    ],
  });
  assert.equal(result.summary.counts.records, 4);
  assert.equal(result.summary.counts.uniqueReferences, 2);
  assert.equal(result.summary.counts.duplicateRecords, 2);
  assert.equal(result.sources[0].counts.uniqueReferences, 2);
  assert.equal(result.sources[0].counts.duplicateRecords, 1);
  assert.equal(result.sources[1].counts.uniqueReferences, 1);
  assert.equal(network(result, "gdelt").counts.uniqueReferences, 1);
  assert.equal(network(result, "hackernews").counts.uniqueReferences, 2);
});

test("identity keeps distinct titles/text, provider IDs and fragment routes honest", () => {
  const result = report({
    sources: [hn],
    references: [
      reference("a", { url: null, sourceId: "hn", externalId: "42" }),
      reference("b", { url: null, sourceId: "hn", externalId: "42" }),
      reference("c", { url: null, text: "El mismo texto aportado." }),
      reference("d", { url: null, text: "El mismo texto aportado." }),
      reference("route-one", { url: "https://example.com/#/post/one" }),
      reference("route-two", { url: "https://example.com/#/post/two" }),
    ],
  });
  assert.equal(result.summary.counts.uniqueReferences, 5);
  assert.equal(result.summary.counts.providedText, 2);
});

test("page text, feed text, supplied text, metadata and citation-only references stay distinguishable", () => {
  const result = report({
    sources: [hn, trends],
    references: [
      reference("page", {
        text: "Descripción recuperada",
        ingestionAccess: {
          url: "https://example.com/articles/page",
          purpose: "metadata",
        },
        accessPolicy: { allowed: true },
      }),
      reference("feed", {
        sourceId: "trends",
        text: "Texto del feed",
        ingestionAccess: { url: feedUrl, urls: [feedUrl], purpose: "rss" },
      }),
      reference("own", {
        url: "https://www.linkedin.com/posts/synthetic",
        text: "Texto propio aportado",
      }),
      reference("api", {
        sourceId: "hn",
        text: "Texto legado sin prueba de lectura",
      }),
      reference("url"),
      reference("attachment", { url: null, assetId: "asset-1" }),
    ],
  });
  const counts = result.summary.counts;
  assert.equal(counts.retrievedText, 2);
  assert.equal(counts.providedText, 1);
  assert.equal(counts.metadataOnly, 1);
  assert.equal(counts.linkOnly, 1);
  assert.equal(counts.unavailable, 1);
  assert.equal(counts.pageReads, 1);
  assert.equal(counts.feedReads, 1);
  assert.equal(network(result, "linkedin").counts.pageReads, 0);
  assert.equal(network(result, "linkedin").counts.providedText, 1);
});

test("a better copy contributes available text once while metadata-only scopes cannot claim text reading", () => {
  const result = report({
    references: [
      reference("one", { url: "https://example.com/article" }),
      reference("two", {
        url: "https://example.com/article?utm_source=copy",
        text: "Texto propio",
      }),
      reference("three", {
        contentScope: "metadata_only",
        text: "Descripción, no transcripción",
      }),
    ],
  });
  assert.equal(result.summary.counts.uniqueReferences, 2);
  assert.equal(result.summary.counts.providedText, 1);
  assert.equal(result.summary.counts.retrievedText, 0);
});

test("blocked connectors and restricted redirect trails cannot be reopened by supplied policy snapshots", () => {
  const restricted = [
    { id: "yt", type: "youtube" },
    { id: "ig", type: "apify", platform: "instagram" },
    { id: "tk", type: "apify", platform: "tiktok" },
    { id: "rd", type: "reddit" },
    { id: "li", type: "rss", url: "https://www.linkedin.com/feed" },
  ].map((source) => ({
    ...source,
    enabled: true,
    accessPolicy: { allowed: true },
    lastSyncedAt: now,
  }));
  const result = report({
    sources: restricted,
    references: [
      ...restricted.map((source) =>
        reference(`ref-${source.id}`, {
          sourceId: source.id,
          text: "Cuerpo restringido",
        }),
      ),
      reference("redirect", {
        text: "Texto restringido",
        accessPolicy: { allowed: true },
        ingestionAccess: {
          url: "https://example.com/public",
          urls: [
            "https://example.com/public",
            "https://www.instagram.com/synthetic",
          ],
          purpose: "metadata",
        },
      }),
      reference("legacy", {
        text: "Texto restringido",
        ingestionProvider: "youtube",
        source: "Etiqueta inocente",
      }),
    ],
  });
  assert.equal(result.summary.enabledSources, 0);
  assert.equal(result.summary.verifiedSources, 0);
  assert.equal(result.summary.counts.restrictedReferences, 7);
  assert.equal(result.summary.counts.linkOnly, 7);
  assert.equal(result.summary.counts.retrievedText, 0);
  assert.ok(
    result.sources.every((source) => source.permission.state === "restricted"),
  );
});

test("review snapshots for additional feeds are required, expire, and are never read from the environment", (t) => {
  t.mock.method(fs, "readFileSync", () => {
    throw new Error("Unexpected file read");
  });
  t.mock.method(fs, "statSync", () => {
    throw new Error("Unexpected file stat");
  });
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("Unexpected network call");
  });
  const custom = {
    id: "custom",
    type: "rss",
    url: "https://example.com/feed.xml",
    enabled: true,
    lastSyncedAt: now,
  };
  assert.equal(
    report({ sources: [custom] }).sources[0].permission.state,
    "unverified",
  );
  const permitted = {
    ...custom,
    accessPolicy: {
      allowed: true,
      reviewedAt: "2026-10-17",
      expiresAt: "2026-10-19",
    },
  };
  assert.equal(
    report({ sources: [permitted, trends, hn, gdelt] }).summary.verifiedSources,
    1,
  );
  assert.equal(
    report({
      sources: [
        { ...permitted, accessPolicy: { allowed: true, expiresAt: now } },
      ],
    }).sources[0].permission.state,
    "expired",
  );
  assert.equal(
    buildDiscoveryCoverage(brand, { sources: [permitted] }).sources[0]
      .permission.state,
    "expired",
  );
  const item = reference("feed", {
    sourceId: "custom",
    text: "Texto autorizado del feed",
    ingestionAccess: { url: custom.url, purpose: "rss" },
  });
  assert.equal(
    report({ sources: [permitted], references: [item] }).summary.counts
      .retrievedText,
    0,
  );
  assert.equal(
    report({
      sources: [permitted],
      references: [{ ...item, accessPolicy: { allowed: true } }],
    }).summary.counts.retrievedText,
    1,
  );
});

test("orphan provenance and revoked input never become provided text or verified reading", () => {
  const result = report({
    sources: [hn],
    references: [
      reference("orphan", {
        sourceId: "deleted-source",
        text: "Texto almacenado",
      }),
      reference("revoked", {
        text: "Texto almacenado",
        accessPolicy: { allowed: false },
      }),
      reference("restricted", {
        text: "Texto almacenado",
        ingestionRestricted: true,
      }),
    ],
  });
  assert.equal(result.summary.counts.restrictedReferences, 3);
  assert.equal(result.summary.counts.providedText, 0);
  assert.equal(network(result, "unknown").counts.uniqueReferences, 1);
});

test("dates use publication timestamps only, exclude future dates, and retain observed/storage dates separately", () => {
  const result = report({
    sources: [{ ...hn, lastSyncedAt: "2026-10-20" }],
    references: [
      reference("recent", { publishedAt: "2026-10-17T08:00:00Z" }),
      reference("old", { publishedAt: "2026-09-01T08:00:00Z" }),
      reference("missing", { firstSeenAt: "2026-10-18T10:00:00Z" }),
      reference("invalid", { publishedAt: "not-a-date" }),
      reference("future", { publishedAt: "2026-10-19T00:00:00Z" }),
    ],
  });
  assert.equal(result.summary.counts.datedReferences, 2);
  assert.equal(result.summary.counts.undatedReferences, 3);
  assert.equal(result.summary.counts.invalidPublicationDates, 1);
  assert.equal(result.summary.counts.futurePublicationDates, 1);
  assert.equal(result.summary.counts.publishedLast7Days, 1);
  assert.deepEqual(result.summary.dates.published, {
    from: "2026-09-01T08:00:00.000Z",
    to: "2026-10-17T08:00:00.000Z",
  });
  assert.equal(result.summary.dates.stored.to, "2026-10-18T09:00:00.000Z");
  assert.equal(result.summary.dates.firstSeen.to, "2026-10-18T10:00:00.000Z");
  assert.equal(result.sources[0].verification.verified, false);
  assert.equal(result.sources[0].verification.lastSyncedAt, null);
});

test("demo and explicit foreign-tenant records do not inflate real coverage", () => {
  const result = report({
    sources: [hn, { ...gdelt, brandId: "another-brand" }],
    references: [
      reference("real", { sourceId: "hn" }),
      reference("example", { sourceId: "hn", isDemo: true }),
      reference("foreign", { sourceId: "hn", brandId: "another-brand" }),
    ],
  });
  assert.equal(result.summary.counts.uniqueReferences, 1);
  assert.equal(result.summary.excludedDemoReferences, 1);
  assert.equal(result.summary.excludedForeignReferences, 1);
  assert.equal(result.summary.excludedForeignSources, 1);
  assert.equal(result.summary.configuredSources, 1);
});

test("official YouTube connection readiness and past sync cannot masquerade as imported editorial evidence", () => {
  const result = report({
    sources: [{ id: "legacy-yt", type: "youtube", enabled: true }],
    socialConnections: {
      providers: [
        {
          id: "youtube",
          configured: true,
          ready: true,
          connection: {
            id: "private-channel-id",
            name: "Private channel name",
            connectedAt: "2026-10-17",
            lastSyncedAt: now,
          },
        },
      ],
      automaticSync: { enabled: true, lastSyncedAt: now },
    },
  });
  const youtube = network(result, "youtube");
  assert.equal(youtube.editorialAnalysisAllowed, false);
  assert.equal(youtube.officialConnection.ready, true);
  assert.equal(youtube.officialConnection.connected, true);
  assert.equal(youtube.officialConnection.contentVerified, false);
  assert.deepEqual(youtube.officialConnection.permittedPurposes, [
    "official_public_catalogue",
    "native_public_counters",
  ]);
  assert.equal(youtube.counts.uniqueReferences, 0);
  assert.equal(youtube.verifiedSources, 0);
  assert.ok(!JSON.stringify(result).includes("private-channel-id"));
  assert.ok(!JSON.stringify(result).includes("Private channel name"));
});

test("official public-key sync errors are visible without an OAuth channel and never dated from the last success", () => {
  const result = report({
    socialConnections: {
      providers: [{ id: "youtube", configured: true, ready: true }],
      automaticSync: {
        enabled: true,
        lastSyncedAt: "2026-10-17T10:00:00Z",
        lastError: "HTTP 429",
      },
    },
  });
  const youtube = network(result, "youtube");
  assert.equal(youtube.officialConnection.connected, false);
  assert.equal(
    youtube.officialConnection.lastSyncedAt,
    "2026-10-17T10:00:00.000Z",
  );
  assert.equal(youtube.errors[0].code, "RATE_LIMITED");
  assert.equal(youtube.errors[0].occurredAt, null);
  assert.deepEqual(youtube.errors, result.errors);
  assert.equal(result.summary.counts.uniqueReferences, 0);
});

test("future connection dates, expired reference reviews and unsupported adapters do not verify access", () => {
  const result = report({
    sources: [
      {
        id: "unimplemented",
        type: "invented-network",
        enabled: true,
        accessPolicy: { allowed: true },
        lastSyncedAt: now,
      },
    ],
    references: [
      reference("expired", {
        text: "Texto previo",
        accessPolicy: { allowed: true, expiresAt: "2026-10-17" },
      }),
    ],
    socialConnections: {
      providers: [
        {
          id: "youtube",
          ready: true,
          connection: { connectedAt: "2026-10-20", lastSyncedAt: "2026-10-20" },
        },
      ],
    },
  });
  assert.equal(result.summary.verifiedSources, 0);
  assert.equal(result.sources[0].permission.state, "unverified");
  assert.equal(result.summary.counts.restrictedReferences, 1);
  assert.equal(network(result, "youtube").officialConnection.connected, false);
  assert.equal(
    network(result, "youtube").officialConnection.lastSyncedAt,
    null,
  );
});

test("malformed redirect provenance does not count as retrieved text", () => {
  const result = report({
    references: [
      reference("bad-trail", {
        text: "Texto almacenado",
        accessPolicy: { allowed: true },
        ingestionAccess: {
          url: "https://example.com/public",
          urls: "https://example.com/public",
          purpose: "metadata",
        },
      }),
    ],
  });
  assert.equal(result.summary.counts.pageReads, 0);
  assert.equal(result.summary.counts.retrievedText, 0);
  assert.equal(result.summary.counts.restrictedReferences, 1);
});

test("errors retain safe categories without leaking provider messages, URLs, personal records or credentials", () => {
  const result = report({
    sources: [
      {
        ...hn,
        lastError:
          "HTTP 403 https://provider.com/?token=SUPERSECRET user@example.com",
      },
      {
        ...gdelt,
        lastError: "Timeout https://provider.com/?apiKey=SUPERSECRET",
      },
    ],
    references: [
      reference("private", {
        title: "user@example.com",
        text: "SUPERSECRET",
        author: "Personal name",
        metrics: { views: 100 },
      }),
    ],
    socialConnections: {
      providers: [
        {
          id: "youtube",
          connection: {
            lastError: "HTTP 401 Bearer SUPERSECRET user@example.com",
          },
        },
      ],
    },
  });
  assert.deepEqual(
    result.errors.map((entry) => entry.code),
    ["ACCESS_DENIED", "TIMEOUT", "ACCESS_DENIED"],
  );
  const json = JSON.stringify(result);
  for (const secret of [
    "SUPERSECRET",
    "user@example.com",
    "provider.com",
    "Personal name",
    '"views"',
  ])
    assert.ok(!json.includes(secret));
});

test("the function does not mutate records, count evidence attachments as extra publications, or depend on input ordering for totals", () => {
  const input = freeze({
    now,
    sources: [hn, gdelt],
    references: [
      reference("a", {
        sourceId: "hn",
        evidence: [
          {
            sourceId: "gdelt",
            url: "https://example.com/other",
            metrics: { views: 100 },
          },
        ],
      }),
      reference("b", { sourceId: "gdelt" }),
    ],
  });
  const result = buildDiscoveryCoverage(freeze(brand), input);
  assert.equal(result.summary.counts.uniqueReferences, 2);
  assert.equal(result.sources[1].counts.uniqueReferences, 1);
  const reversed = buildDiscoveryCoverage(brand, {
    ...input,
    references: [...input.references].reverse(),
  });
  assert.deepEqual(result.summary, reversed.summary);
  assert.deepEqual(result.networks, reversed.networks);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});
