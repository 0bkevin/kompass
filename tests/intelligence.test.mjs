import { installPermissionFixture } from "./permission-fixture.mjs";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-intelligence-"));
process.env.DATA_DIR = dataDir;
installPermissionFixture(dataDir, [
  {
    origin: "https://example.com",
    pathPrefix: "/feed",
    purposes: ["rss"],
  },
  {
    origin: "https://example.com",
    pathPrefix: "/rss",
    purposes: ["rss"],
  },
  {
    origin: "https://example.com",
    pathPrefix: "/article",
    purposes: ["metadata"],
  },
  {
    origin: "https://feed.example.com",
    pathPrefix: "/feed",
    purposes: ["rss"],
  },
  {
    origin: "https://ai.example.test",
    pathPrefix: "/v1",
    purposes: ["ai"],
  },
  {
    origin: "https://publisher.example.com",
    pathPrefix: "/hook",
    purposes: ["webhook"],
  },
]);
delete process.env.OPENAI_API_KEY;
const {
  db,
  saveBrand,
  saveRecord,
  listRecords,
  getRecord,
  getSecret,
  setSecret,
} = await import("../server/db.mjs");
const {
  canonicalUrl,
  findDuplicate,
  parseFeed,
  computeTrend,
  fetchSource,
  syncSources,
  startDiscoveryScheduler,
  brandRelevance,
  localAnalysis,
  analyzeReference,
  createDraft,
} = await import("../server/intelligence.mjs");
const {
  isPublicAddress,
  validatePublicUrl,
  safeFetch,
  generateStructured,
  publishPiece,
} = await import("../server/connectors.mjs");
after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
const makeBrand = () =>
  saveBrand({
    name: "Prueba editorial",
    industry: "marketing",
    description: "Marketing y automatización para empresas",
    tone: "práctico",
    market: "México",
    language: "es",
    audience: [
      {
        id: "directors",
        name: "Directores de marketing",
        role: "Director",
        needs: "Automatización marketing",
        stage: "Explorar",
      },
    ],
    pillars: ["marketing"],
    goals: ["Aprender"],
  });

test("canonical dedup removes tracking but preserves content query and unrelated topics", () => {
  assert.equal(
    canonicalUrl("https://www.Example.com/post/?utm_source=feed&id=2#title"),
    canonicalUrl("http://example.com/post?id=2"),
  );
  assert.notEqual(
    canonicalUrl("https://example.com/post?id=2"),
    canonicalUrl("https://example.com/post?id=3"),
  );
  const existing = {
    id: "1",
    title: "Open models improve scientific protein design",
    url: "https://example.com/a",
  };
  assert.equal(
    findDuplicate(
      {
        title: "Different headline",
        url: "https://www.example.com/a?utm_medium=feed",
      },
      [existing],
    ),
    existing,
  );
  assert.equal(
    findDuplicate({ title: "Open models improve scientific protein design" }, [
      existing,
    ]),
    existing,
  );
  assert.equal(
    findDuplicate({ title: "Open models lower manufacturing energy usage" }, [
      existing,
    ]),
    undefined,
  );
});

test("RSS and Atom preserve real titles, dates, source URLs and Google approximate traffic", () => {
  const rss =
    '<rss xmlns:ht="https://trends.google.com/trending/rss"><channel><item><title>Marketing automation</title><link>https://google.com/search?q=marketing</link><pubDate>Fri, 16 Oct 2026 10:00:00 GMT</pubDate><ht:approx_traffic>20,000+</ht:approx_traffic></item></channel></rss>';
  const [result] = parseFeed(rss, {
    url: "https://trends.google.com/trending/rss?geo=MX",
  });
  assert.equal(result.officialTraffic, "20,000+");
  assert.equal(result.market, "MX");
  assert.equal(result.metrics, undefined);
  assert.equal(result.signalType, "search-interest");
  const [impostor] = parseFeed(rss, {
    url: "https://trends.google.attacker.com/trending/rss?geo=MX",
  });
  assert.equal(impostor.officialTraffic, undefined);
  const [unspecified] = parseFeed(rss, {
    url: "https://trends.google.com/trending/rss",
  });
  assert.equal(unspecified.market, "Sin especificar");
  const [atom] = parseFeed(
    '<feed><entry><title>One</title><link rel="alternate" href="https://example.com/post"/><summary>A useful story</summary></entry></feed>',
    {},
  );
  assert.equal(atom.url, "https://example.com/post");
  assert.equal(atom.text, "A useful story");
  assert.throws(
    () =>
      parseFeed(
        '<!DOCTYPE rss [<!ENTITY secret SYSTEM "file:///etc/passwd">]><rss/>',
        {},
      ),
    /entidades/,
  );
  assert.throws(() => parseFeed("<html>Forbidden</html>", {}), /RSS o Atom/);
});

const sharedLinkGoogleFeed = (traffic = "20,000+") => `
  <rss xmlns:ht="https://trends.google.com/trending/rss"><channel>
    <item><title>AI education for executives</title><link>https://trends.google.com/trending/rss?geo=US</link><ht:approx_traffic>${traffic}</ht:approx_traffic><ht:news_item><ht:news_item_url>https://example.com/ai-news</ht:news_item_url></ht:news_item></item>
    <item><title>The Guardian</title><link>https://trends.google.com/trending/rss?geo=US</link><ht:approx_traffic>10,000+</ht:approx_traffic></item>
  </channel></rss>`;

test("Google Trends identifies queries and countries rather than the shared feed link", async () => {
  const brand = makeBrand();
  const source = saveRecord(brand.id, "sources", {
    name: "Trends US",
    type: "rss",
    url: "https://trends.google.com/trending/rss?geo=US",
    enabled: true,
  });
  const parsed = parseFeed(sharedLinkGoogleFeed(), source);
  assert.equal(parsed.length, 2);
  assert.notEqual(parsed[0].externalId, parsed[1].externalId);
  assert.notEqual(canonicalUrl(parsed[0].url), canonicalUrl(parsed[1].url));
  assert.equal(
    new URL(parsed[0].url).searchParams.get("q"),
    "ai education for executives",
  );
  assert.equal(new URL(parsed[0].url).searchParams.get("geo"), "US");
  assert.equal(parsed[0].sourceUrl, source.url);
  assert.deepEqual(parsed[0].relatedUrls, ["https://example.com/ai-news"]);
  assert.equal(parsed[0].format, "trend");
  const [mexican] = parseFeed(sharedLinkGoogleFeed(), {
    url: "https://trends.google.com/trending/rss?geo=MX",
  });
  assert.equal(
    findDuplicate(mexican, parsed),
    undefined,
    "same query in another market is a separate observation",
  );
  assert.equal(
    findDuplicate(
      { title: parsed[0].title, url: "https://example.com/ai-news" },
      parsed,
    ),
    undefined,
    "a trend query is not its related article",
  );
  let traffic = "20,000+";
  const fetcher = async () => new Response(sharedLinkGoogleFeed(traffic));
  const first = await syncSources(brand, { fetcher });
  assert.equal(first.added, 2);
  const ids = listRecords(brand.id, "references")
    .map((reference) => reference.id)
    .sort();
  traffic = "50,000+";
  const second = await syncSources(brand, { fetcher });
  assert.equal(second.added, 0);
  assert.equal(second.updated, 2);
  const refreshed = listRecords(brand.id, "references");
  assert.equal(refreshed.length, 2);
  assert.deepEqual(refreshed.map((reference) => reference.id).sort(), ids);
  assert.equal(
    refreshed.find(
      (reference) => reference.title === "AI education for executives",
    ).officialTraffic,
    "50,000+",
  );
});

test("legacy Google feed identities are repaired without losing editorial decisions or linked pieces", async () => {
  const brand = makeBrand();
  const source = saveRecord(brand.id, "sources", {
    name: "Trends US",
    type: "rss",
    url: "https://trends.google.com/trending/rss?geo=US",
    enabled: true,
  });
  const oldAnalysis = { hook: "A previous mixed topic", engine: "heuristic" };
  const legacy = saveRecord(brand.id, "references", {
    title: "The Guardian",
    url: source.url,
    externalId: source.url,
    sourceId: source.id,
    source: source.name,
    status: "saved",
    analysis: oldAnalysis,
    trendHistory: [
      { observedAt: new Date().toISOString(), metrics: { score: 999 } },
    ],
    tags: ["mi decisión editorial"],
  });
  const linked = saveRecord(brand.id, "pieces", {
    title: "Borrador enlazado",
    referenceId: legacy.id,
    status: "draft",
  });
  const result = await syncSources(brand, {
    fetcher: async () => new Response(sharedLinkGoogleFeed()),
  });
  assert.equal(result.added, 1);
  const references = listRecords(brand.id, "references");
  assert.equal(references.length, 2);
  const repaired = getRecord(brand.id, "references", legacy.id);
  assert.equal(repaired.status, "saved");
  assert.equal(repaired.analysis, undefined);
  assert.match(repaired.analysisInvalidationReason, /agrupaba varios temas/);
  assert.deepEqual(repaired.analysisHistory[0].analysis, oldAnalysis);
  assert.deepEqual(repaired.tags, ["mi decisión editorial"]);
  assert.equal(repaired.legacyGoogleTrend.externalId, source.url);
  assert.equal(new URL(repaired.url).searchParams.get("q"), "the guardian");
  assert.ok(
    !repaired.trendHistory.some(
      (observation) => observation.metrics?.score === 999,
    ),
  );
  assert.equal(getRecord(brand.id, "pieces", linked.id).referenceId, legacy.id);
  await syncSources(brand, {
    fetcher: async () => new Response(sharedLinkGoogleFeed()),
  });
  assert.equal(listRecords(brand.id, "references").length, 2);
});

test("first snapshot never claims growth; separate observations support actual velocity only", () => {
  const now = Date.parse("2026-10-17T10:00:00Z");
  const item = {
    title: "New marketing automation tools",
    sourceId: "hn",
    publishedAt: "2026-10-17T08:00:00Z",
    metrics: { score: 20, comments: 3 },
  };
  const first = computeTrend(item, null, [item], [], now);
  assert.equal(first.trend.velocity, undefined);
  assert.notEqual(first.trend.kind, "emerging");
  assert.ok(first.trend.scoreReasons.some((x) => x.includes("Sin historial")));
  const later = computeTrend(
    { ...item, metrics: { score: 35, comments: 5 } },
    first,
    [item],
    [],
    now + 3600000,
  );
  assert.equal(later.trend.velocity, 15);
  assert.equal(later.trend.kind, "emerging");
  assert.equal(later.trend.previousObservedAt, first.trend.observedAt);
  const tooSoon = computeTrend(
    { ...item, metrics: { score: 21 } },
    first,
    [item],
    [],
    now + 1000,
  );
  assert.equal(tooSoon.trend.velocity, undefined);
  const plainRss = computeTrend(
    { title: "A post", publishedAt: item.publishedAt },
    null,
    [],
    [],
    now,
  );
  assert.equal(plainRss.trend.kind, "unclassified");
  assert.equal(plainRss.trend.metrics, undefined);
});

test("GDELT discovery uses detection date without claiming popularity or publication date", async () => {
  const items = await fetchSource(
    makeBrand(),
    { type: "gdelt", query: '"marketing automation"' },
    {
      fetcher: async (url) => {
        assert.match(url, /sourcelang/);
        return json({
          articles: [
            {
              title: "Marketing automation in practice",
              url: "https://example.com/news",
              seendate: "20261017T100000Z",
              language: "English",
              sourcecountry: "United States",
              domain: "example.com",
            },
          ],
        });
      },
    },
  );
  assert.equal(items[0].publishedAt, undefined);
  assert.equal(items[0].firstSeenAt, "2026-10-17T10:00:00.000Z");
  assert.equal(items[0].metrics, undefined);
  const { trend } = computeTrend(
    items[0],
    null,
    items,
    [],
    Date.parse("2026-10-17T11:00:00Z"),
  );
  assert.equal(trend.kind, "unclassified");
  assert.ok(
    trend.scoreReasons.some((reason) => reason.includes("no confirma")),
  );
  await assert.rejects(
    fetchSource(
      makeBrand(),
      { type: "gdelt" },
      { fetcher: async () => new Response("Rate limited", { status: 429 }) },
    ),
    /429/,
  );
});

test("discovery persists source failures, does not duplicate URLs, and refreshes official metrics", async () => {
  const brand = makeBrand();
  const hn = saveRecord(brand.id, "sources", {
    name: "HN",
    type: "hackernews",
    query: "marketing",
    enabled: true,
  });
  const broken = saveRecord(brand.id, "sources", {
    name: "Feed sin acceso",
    type: "rss",
    url: "https://example.com/feed",
    enabled: true,
  });
  let points = 20;
  const fetcher = async (url) =>
    url.startsWith("https://hn.algolia.com/")
      ? json({
          hits: [
            {
              objectID: "101",
              title: "Marketing automation for teams",
              url: "https://example.org/article?utm_source=hn",
              points,
              num_comments: 3,
              author: "real-author",
              created_at: "2026-10-17T09:00:00Z",
            },
          ],
        })
      : new Response("Forbidden", { status: 403 });
  const first = await syncSources(brand, {
    fetcher,
    now: Date.parse("2026-10-17T10:00:00Z"),
  });
  assert.equal(first.added, 1);
  assert.equal(first.errors.length, 1);
  assert.match(getRecord(brand.id, "sources", broken.id).lastError, /403/);
  points = 40;
  const second = await syncSources(brand, {
    fetcher,
    now: Date.parse("2026-10-17T11:00:00Z"),
  });
  assert.equal(second.added, 0);
  assert.equal(second.updated, 1);
  const references = listRecords(brand.id, "references");
  assert.equal(references.length, 1);
  assert.equal(references[0].trend.metrics.score, 40);
  assert.equal(references[0].trend.velocity, 20);
  assert.equal(
    references[0].author,
    undefined,
    "Discovery must omit individual author identity from research records",
  );
  assert.ok(getRecord(brand.id, "sources", hn.id).lastSyncedAt);
});

test("topic-specific sources use brand context and RSS query filters unrelated content", async () => {
  const brand = {
    ...makeBrand(),
    industry: "Gastronomía",
    pillars: ["Restaurantes"],
  };
  const requested = [];
  await fetchSource(
    brand,
    { type: "hackernews" },
    {
      fetcher: async (url) => {
        requested.push(url);
        return json({ hits: [] });
      },
    },
  );
  assert.equal(new URL(requested[0]).searchParams.get("query"), "restaurants");
  const rss =
    "<rss><channel><item><title>Restaurant delivery patterns</title><link>https://example.com/food</link></item><item><title>Movie awards ceremony</title><link>https://example.com/movies</link></item></channel></rss>";
  const filtered = await fetchSource(
    brand,
    { type: "rss", url: "https://example.com/rss", query: "restaurant" },
    { fetcher: async () => new Response(rss) },
  );
  assert.equal(filtered.length, 1);
  assert.match(filtered[0].title, /Restaurant/);
  assert.equal(
    computeTrend(filtered[0], null, filtered, []).trend.kind,
    "unclassified",
  );
});

test("preliminary brand relevance matches Spanish sectors to English terms without AI", () => {
  const brand = {
    industry: "Educación",
    description: "Liderazgo para ejecutivos que aprenden IA",
    pillars: ["Inteligencia artificial"],
  };
  const relevant = brandRelevance(brand, {
    title: "AI leadership education for executives",
  });
  assert.equal(relevant.method, "lexical");
  assert.ok(relevant.matchedTerms.includes("ai"));
  assert.ok(relevant.matchedTerms.includes("leadership"));
  assert.ok(relevant.matchedTerms.includes("education"));
  assert.ok(relevant.score > 0);
  const irrelevant = brandRelevance(brand, {
    title: "Celebrity wedding makes newspaper front page",
  });
  assert.equal(irrelevant.score, 0);
  assert.deepEqual(irrelevant.matchedTerms, []);
});

test("discovery recalculates lexical relevance without modifying editorial status or analysis", async () => {
  const brand = makeBrand();
  const reference = saveRecord(brand.id, "references", {
    title: "Marketing automation handbook",
    text: "A guide for marketers",
    status: "dismissed",
    analysis: { engine: "heuristic", relevance: 71 },
  });
  await syncSources(brand);
  const refreshed = getRecord(brand.id, "references", reference.id);
  assert.equal(refreshed.brandRelevance.method, "lexical");
  assert.ok(refreshed.brandRelevance.matchedTerms.includes("marketing"));
  assert.equal(refreshed.status, "dismissed");
  assert.equal(refreshed.analysis.relevance, 71);
});

test("continuous discovery obeys cadence and persists exponential backoff without overlapping runs", async () => {
  const brand = makeBrand();
  saveRecord(brand.id, "sources", {
    name: "Scheduled HN",
    type: "hackernews",
    enabled: true,
  });
  let now = Date.now(),
    calls = 0,
    fail = true;
  let release;
  const scheduler = startDiscoveryScheduler({
    intervalMs: 10 * 60000,
    tickMs: 3600000,
    clock: () => now,
    listBrands: () => [brand],
    discover: async () => {
      calls++;
      await new Promise((resolve) => {
        release = resolve;
      });
      return { sources: [fail ? { error: "HTTP 429" } : { fetched: 1 }] };
    },
  });
  const first = scheduler.runOnce();
  await scheduler.runOnce();
  assert.equal(calls, 1);
  release();
  await first;
  assert.equal(getSecret(brand.id, "discoveryScheduler").failures, 1);
  now += 10 * 60000;
  await scheduler.runOnce();
  assert.equal(calls, 1, "failed refresh waits twice the configured cadence");
  now += 10 * 60000;
  const second = scheduler.runOnce();
  assert.equal(calls, 2);
  fail = false;
  release();
  await second;
  assert.equal(getSecret(brand.id, "discoveryScheduler").failures, 0);
  scheduler.stop();
  now += 30 * 60000;
  await scheduler.runOnce();
  assert.equal(calls, 2);
});

test("continuous discovery never duplicates an active manual refresh", async () => {
  const brand = makeBrand();
  saveRecord(brand.id, "sources", {
    name: "Manual HN",
    type: "hackernews",
    enabled: true,
  });
  const releases = [];
  const manual = syncSources(brand, {
    fetcher: async () => {
      await new Promise((resolve) => releases.push(resolve));
      return json({ hits: [] });
    },
  });
  let scheduledCalls = 0;
  const scheduler = startDiscoveryScheduler({
    tickMs: 3600000,
    listBrands: () => [brand],
    discover: async () => {
      scheduledCalls++;
    },
  });
  await scheduler.runOnce();
  assert.equal(scheduledCalls, 0);
  for (const release of releases) release();
  await manual;
  scheduler.stop();
});

test("the same article across sources keeps platform metrics separate and adds evidence", async () => {
  const brand = makeBrand();
  saveRecord(brand.id, "sources", {
    name: "HN",
    type: "hackernews",
    enabled: true,
  });
  saveRecord(brand.id, "sources", {
    name: "RSS",
    type: "rss",
    url: "https://feed.example.com/feed",
    enabled: true,
  });
  const fetcher = async (url) =>
    url.includes("hn.algolia.com")
      ? json({
          hits: [
            {
              objectID: "42",
              title: "Marketing automation experiments for small teams",
              url: "https://example.com/article",
              points: 123,
              num_comments: 9,
            },
          ],
        })
      : new Response(
          "<rss><channel><item><title>Marketing automation experiments for small teams</title><link>https://example.com/article</link></item></channel></rss>",
        );
  await syncSources(brand, { fetcher });
  const references = listRecords(brand.id, "references");
  assert.equal(references.length, 1);
  assert.equal(references[0].evidence.length, 1);
  assert.equal(references[0].trend.relatedSourceCount, 2);
  assert.equal(references[0].trend.metrics.score, 123);
});

test("real discovery never merges into a similarly named demo reference", async () => {
  const brand = makeBrand();
  const demo = saveRecord(brand.id, "references", {
    title: "Marketing automation experiments for small teams",
    url: "https://example.com/article",
    isDemo: true,
    status: "analyzed",
    text: "Contenido ficticio de demostración",
  });
  saveRecord(brand.id, "sources", {
    name: "HN",
    type: "hackernews",
    enabled: true,
  });
  const result = await syncSources(brand, {
    fetcher: async () =>
      json({
        hits: [
          {
            objectID: "999",
            title: demo.title,
            url: demo.url,
            points: 120,
            num_comments: 10,
          },
        ],
      }),
  });
  assert.equal(result.added, 1);
  assert.equal(listRecords(brand.id, "references").length, 2);
  assert.equal(
    getRecord(brand.id, "references", demo.id).text,
    "Contenido ficticio de demostración",
  );
  assert.equal(getRecord(brand.id, "references", demo.id).trend, undefined);
});

test("saturation is unknown for small samples and qualified as observed brand corpus", () => {
  const brand = makeBrand();
  const reference = {
    id: "r",
    title: "Marketing automation experiments",
    text: "Marketing automation for your business",
  };
  const small = localAnalysis(brand, reference, [reference]);
  assert.equal(small.saturation, "unknown");
  assert.equal(small.engine, "heuristic");
  assert.match(small.saturationReason, /corpus observado/);
  assert.match(small.hypothesis, /No hay evidencia causal/);
  assert.equal(small.confidence, "low");
  const corpus = Array.from({ length: 8 }, (_, i) => ({
    id: `${i}`,
    title: "Marketing automation experiments",
    text: "Marketing automation for your business",
  }));
  const larger = localAnalysis(brand, reference, corpus);
  assert.equal(larger.saturation, "high");
  assert.match(larger.saturationReason, /no de saturación global/);
  const preferred = localAnalysis(
    brand,
    reference,
    corpus.map((item) => ({ ...item, status: "saved" })),
  );
  const dismissed = localAnalysis(
    brand,
    reference,
    corpus.map((item) => ({ ...item, status: "dismissed" })),
  );
  assert.ok(preferred.relevance > dismissed.relevance);
  assert.ok(dismissed.signals.some((signal) => signal.includes("descartadas")));
});

test("URL fetch blocks private, mapped, reserved and DNS-rebinding destinations", async () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.2",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.3",
    "192.0.2.1",
    "100.64.1.2",
    "0.0.0.0",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "2001:0db8::1",
    "2001::1",
    "3fff::1",
  ])
    assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress("1.1.1.1"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  for (const url of [
    "http://127.1",
    "http://2130706433",
    "http://[::1]",
    "file:///etc/passwd",
    "https://localhost",
    "https://user:password@example.com",
    "http://10.0.0.1:80",
  ])
    await assert.rejects(validatePublicUrl(url));
  await assert.rejects(
    validatePublicUrl("https://example.com", {
      lookup: async () => [
        { address: "1.1.1.1", family: 4 },
        { address: "10.1.1.1", family: 4 },
      ],
    }),
    /privadas/,
  );
  await assert.rejects(
    safeFetch("http://169.254.169.254/latest/meta-data"),
    (error) =>
      error.status === 403 && error.code === "SOURCE_ACCESS_RESTRICTED",
  );
});

test("AI provider failures are explicit and secret never appears in errors", async () => {
  const brand = makeBrand();
  setSecret(brand.id, "ai", {
    apiKey: "sk-private-test",
    model: "test-model",
    baseUrl: "https://ai.example.test/v1",
  });
  await assert.rejects(
    generateStructured(
      brand.id,
      { name: "test", schema: {}, instructions: "test", input: "test" },
      {
        fetcher: async () =>
          json({ error: { message: "sk-private-test" } }, 401),
      },
    ),
    (error) =>
      error.status === 502 &&
      error.message.includes("401") &&
      !error.message.includes("sk-private-test"),
  );
  await assert.rejects(
    generateStructured(
      brand.id,
      { name: "test", schema: {}, instructions: "test", input: "test" },
      { fetcher: async () => json({ output: [] }) },
    ),
    /estructurado/,
  );
});

test("local analysis and drafts persist useful editable output without API keys", async () => {
  const brand = makeBrand();
  const reference = saveRecord(brand.id, "references", {
    title: "Marketing automation experiments for growing teams",
    text: "A practical look at marketing automation experiments for growing teams and human review before implementation.".repeat(
      4,
    ),
    status: "new",
    source: "Manual",
  });
  const analyzed = await analyzeReference(brand, reference);
  assert.equal(analyzed.analysis.engine, "heuristic");
  assert.equal(analyzed.status, "analyzed");
  const piece = await createDraft(brand, {
    referenceId: reference.id,
    format: "carousel",
    channel: "linkedin",
    instructions: "Enfoque de pequeñas empresas",
  });
  assert.equal(piece.status, "draft");
  assert.equal(piece.generationEngine, "heuristic");
  assert.equal(piece.format, "carousel");
  assert.equal(
    piece.editorialBrief.instructions,
    "Enfoque de pequeñas empresas",
  );
  assert.ok(!piece.script.includes("Enfoque de pequeñas empresas"));
  assert.equal(piece.scenes.length, 5);
  assert.equal(piece.segmentId, "directors");
  await assert.rejects(
    createDraft(brand, { referenceId: "other-brand-id" }),
    /no encontrada/,
  );
});

test("analysis protects simultaneous reference edits and preserves dismissal decisions", async () => {
  const brand = makeBrand();
  const reference = saveRecord(brand.id, "references", {
    title: "Marketing automation",
    text: "",
    url: "https://example.com/article",
    status: "new",
  });
  await assert.rejects(
    analyzeReference(brand, reference, {
      fetcher: async () => {
        saveRecord(brand.id, "references", {
          ...getRecord(brand.id, "references", reference.id),
          text: "Texto corregido por el editor",
        });
        return new Response(
          "<html><title>Marketing automation</title><p>Details</p></html>",
          { headers: { "content-type": "text/html" } },
        );
      },
    }),
    (error) => error.status === 409,
  );
  assert.equal(
    getRecord(brand.id, "references", reference.id).text,
    "Texto corregido por el editor",
  );
  const current = getRecord(brand.id, "references", reference.id);
  const analyzed = await analyzeReference(brand, current, {
    fetcher: async () => {
      saveRecord(brand.id, "references", {
        ...getRecord(brand.id, "references", reference.id),
        status: "dismissed",
      });
      return new Response("<p>Useful article description</p>", {
        headers: { "content-type": "text/html" },
      });
    },
  });
  assert.equal(analyzed.status, "dismissed");
  assert.ok(analyzed.analysis);
});

test("publishing requires approval and real connector; webhook delivery is idempotent", async () => {
  const brand = makeBrand();
  const piece = saveRecord(brand.id, "pieces", {
    title: "Pieza para publicar",
    status: "draft",
    channel: "linkedin",
    script: "Texto",
    assetIds: [],
  });
  await assert.rejects(publishPiece(brand, piece), /Aprueba/);
  const approved = saveRecord(brand.id, "pieces", {
    ...piece,
    status: "approved",
  });
  await assert.rejects(publishPiece(brand, approved), /Conecta/);
  assert.equal(getRecord(brand.id, "pieces", piece.id).status, "approved");
  setSecret(brand.id, "webhook", {
    url: "https://publisher.example.com/hook",
    secret: "private-secret",
  });
  let sent = 0;
  const fetcher = async (_url, options) => {
    sent++;
    assert.ok(options.headers["idempotency-key"]);
    saveRecord(brand.id, "pieces", {
      ...getRecord(brand.id, "pieces", piece.id),
      comments: [{ id: "during-delivery", text: "Comentario simultáneo" }],
      metrics: { views: 12 },
    });
    return new Response(null, { status: 204 });
  };
  const published = await publishPiece(brand, approved, { fetcher });
  assert.equal(published.status, "published");
  assert.equal(published.publicationReceipt.provider, "webhook");
  assert.equal(published.comments[0].id, "during-delivery");
  assert.equal(published.metrics.views, 12);
  await publishPiece(brand, approved, { fetcher });
  assert.equal(sent, 1);
  assert.equal(
    getSecret(brand.id, `publication:${piece.id}`).status,
    "delivered",
  );
});

test("uncertain network delivery cannot silently duplicate a publication", async () => {
  const brand = makeBrand();
  setSecret(brand.id, "webhook", { url: "https://publisher.example.com/hook" });
  const piece = saveRecord(brand.id, "pieces", {
    title: "Prueba timeout",
    status: "approved",
    channel: "linkedin",
  });
  let attempts = 0;
  const fetcher = async () => {
    attempts++;
    throw new Error("Timeout del proveedor");
  };
  await assert.rejects(publishPiece(brand, piece, { fetcher }), /Timeout/);
  await assert.rejects(
    publishPiece(brand, piece, { fetcher }),
    /no está confirmado/,
  );
  assert.equal(attempts, 1);
  assert.equal(getRecord(brand.id, "pieces", piece.id).status, "approved");
});
