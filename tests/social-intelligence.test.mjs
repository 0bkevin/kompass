import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-social-intel-"));
process.env.DATA_DIR = dataDir;
delete process.env.OPENAI_API_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.APIFY_API_TOKEN;
delete process.env.YOUTUBE_API_KEY;

const {
  db,
  saveBrand,
  saveRecord,
  getRecord,
  listRecords,
  deleteRecord,
  setSecret,
} = await import("../server/db.mjs");
const {
  computeTrend,
  createDraft,
  fetchSource,
  syncSources,
  analyzeReference,
} = await import("../server/intelligence.mjs");

after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const makeBrand = () =>
  saveBrand({
    name: "Marca de prueba",
    industry: "marketing",
    description: "Ideas de marketing para equipos pequeños",
    tone: "claro y práctico",
    market: "México",
    language: "es",
    audience: [
      {
        id: "owners",
        name: "Responsables de marketing",
        role: "Líderes de equipo",
        needs: "Aterrizar ideas en tareas concretas",
        stage: "Explorar",
      },
    ],
    pillars: ["marketing"],
    goals: ["Aprender"],
  });

const makeSource = (brand, { type = "apify", platform = "tiktok" } = {}) =>
  saveRecord(brand.id, "sources", {
    name: `${platform} mock`,
    type,
    platform,
    query: "marketing",
    limit: 10,
    enabled: true,
  });

const socialItem = (overrides = {}) => ({
  title: "Un ejemplo concreto de marketing para equipos pequeños",
  text: "Una publicación de referencia sobre marketing y revisión editorial.",
  url: "https://www.tiktok.com/@creator/video/123456789",
  sourceUrl: "https://www.tiktok.com/@creator/video/123456789",
  externalId: "123456789",
  videoId: "123456789",
  platform: "tiktok",
  duration: 24,
  durationSeconds: 24,
  contentScope: "metadata_only",
  mediaAccess: "provider_url",
  mediaProvider: "apify",
  mediaUrl: "https://media.example.test/videos/123.mp4?token=first",
  metrics: { views: 120, likes: 4 },
  metricsOrigin: "Apify",
  publishedAt: "2026-10-17T09:00:00.000Z",
  searchQuery: "marketing",
  ...overrides,
});

const validVideoAnalysis = (overrides = {}) => ({
  engine: "gemini",
  status: "completed",
  contentScope: "video_audio",
  summary: "Muestra cómo organizar una revisión semanal de campañas.",
  hook: {
    visual: "Una pizarra con tres columnas aparece al inicio.",
    verbal: "La voz plantea una pregunta sobre prioridades.",
  },
  structure: [
    "Plantea una pregunta",
    "Muestra tres pasos",
    "Cierra con una invitación",
  ],
  onScreenText: ["Texto que no debe copiarse"],
  audioNotes: "Narración clara, con música tenue de fondo.",
  adaptation:
    "Crear un ejemplo propio de revisión semanal para un equipo pequeño.",
  observations: [
    {
      startSeconds: 0,
      endSeconds: 0,
      observation: "Corte puntual al iniciar.",
    },
    {
      startSeconds: 2,
      endSeconds: 7,
      observation: "Señala la primera columna.",
    },
  ],
  coverage: {
    mode: "sampled_video",
    samplingFps: 1,
    notes: "Muestras a 1 fps.",
  },
  limitations: ["La muestra puede omitir transiciones breves."],
  analyzedAt: "2026-10-17T10:00:00.000Z",
  model: "gemini-3.8-flash",
  ...overrides,
});

test("fetchSource dispatches social providers and sync preserves provider provenance without filling absent metrics", async () => {
  const brand = makeBrand();
  const source = makeSource(brand);
  let dispatched;
  const fetched = await fetchSource(brand, source, {
    now: Date.parse("2026-10-17T12:00:00.000Z"),
    socialFetcher: async (...args) => {
      dispatched = args;
      return [
        socialItem({
          metrics: undefined,
          mediaUrl: undefined,
          mediaProvider: undefined,
        }),
      ];
    },
  });
  assert.equal(dispatched[1].id, source.id);
  assert.equal(dispatched[2].now, Date.parse("2026-10-17T12:00:00.000Z"));
  assert.equal(fetched[0].platform, "tiktok");
  const youtubeSource = makeSource(brand, {
    type: "youtube",
    platform: "youtube",
  });
  const youtube = await fetchSource(brand, youtubeSource, {
    socialFetcher: async (_brand, receivedSource) => {
      assert.equal(receivedSource.id, youtubeSource.id);
      return [{ platform: "youtube", videoId: "yt-1" }];
    },
  });
  assert.equal(youtube[0].platform, "youtube");
  deleteRecord(brand.id, "sources", youtubeSource.id);

  const result = await syncSources(brand, {
    now: Date.parse("2026-10-17T12:00:00.000Z"),
    socialFetcher: async () => [
      socialItem({
        metrics: undefined,
        mediaUrl: undefined,
        mediaProvider: undefined,
      }),
    ],
  });
  assert.equal(result.added, 1);
  const [reference] = listRecords(brand.id, "references");
  assert.equal(reference.sourceId, source.id);
  assert.equal(reference.platform, "tiktok");
  assert.equal(reference.videoId, "123456789");
  assert.equal(reference.metrics, undefined);
  assert.equal(reference.trend.metrics, undefined);
  assert.ok(reference.trend.score >= 0 && reference.trend.score <= 35);
  assert.equal(reference.trend.kind, "unclassified");
});

test("YouTube priority is query-local and history compares only the same video", () => {
  const now = Date.parse("2026-10-17T12:00:00.000Z");
  const item = {
    platform: "youtube",
    url: "https://www.youtube.com/watch?v=video-a",
    videoId: "video-a",
    externalId: "video-a",
    title: "Video A",
    metrics: { views: 900, likes: 30 },
    metricsOrigin: "YouTube Data API",
    officialRank: 2,
    publishedAt: "2026-10-16T12:00:00.000Z",
  };
  const sample = [
    item,
    {
      platform: "youtube",
      videoId: "video-b",
      metrics: { views: 1200 },
    },
    { platform: "tiktok", metrics: { views: 9000000 } },
  ];
  const first = computeTrend(item, null, sample, [], now).trend;
  assert.equal(first.score, 0);
  assert.equal(first.kind, "unclassified");
  assert.deepEqual(first.priorityMetric, {
    name: "views",
    value: 900,
    rank: 2,
    origin: "YouTube Data API",
  });
  assert.equal(first.metrics.comments, undefined);
  assert.equal(first.relatedSourceCount, 1);
  assert.match(first.scoreReasons.join(" "), /esta consulta de YouTube/);
  assert.match(first.scoreReasons.join(" "), /no representa el ranking global/);

  const previousAt = new Date(now - 3600000).toISOString();
  const existing = {
    trendHistory: [
      {
        observedAt: previousAt,
        platform: "youtube",
        url: "youtube.com/watch?v=video-b",
        videoId: "video-b",
        metrics: { views: 900000 },
      },
      {
        observedAt: previousAt,
        platform: "youtube",
        url: "youtube.com/watch?v=video-a",
        videoId: "video-a",
        metrics: { views: 10 },
      },
    ],
  };
  const refreshed = computeTrend(
    { ...item, metrics: { views: 15 } },
    existing,
    sample,
    [],
    now,
  ).trend;
  assert.equal(refreshed.velocity, 5);
  assert.equal(refreshed.previousObservedAt, previousAt);
});

test("Apify metrics remain provider-reported and small view changes do not label a general trend", () => {
  const now = Date.parse("2026-10-17T12:00:00.000Z");
  const item = {
    platform: "instagram",
    url: "https://www.instagram.com/reel/abc123/",
    videoId: "abc123",
    externalId: "abc123",
    metrics: { views: 105 },
    metricsOrigin: "Apify",
  };
  const existing = {
    trendHistory: [
      {
        observedAt: new Date(now - 3600000).toISOString(),
        platform: "instagram",
        url: "instagram.com/reel/abc123",
        videoId: "abc123",
        metrics: { views: 100 },
      },
    ],
  };
  const result = computeTrend(item, existing, [item], [], now).trend;
  assert.equal(result.kind, "unclassified");
  assert.equal(result.metricsOrigin, "Apify");
  assert.equal(result.metricScope, "provider_reported");
  assert.equal(result.velocity, 5);
  assert.match(result.scoreReasons.join(" "), /no son métricas oficiales/);
  assert.match(
    result.scoreReasons.join(" "),
    /no demuestra una tendencia general/,
  );

  const withoutMetrics = computeTrend(
    { ...item, metrics: undefined },
    null,
    [{ ...item, metrics: undefined }],
    [],
    now,
  ).trend;
  assert.equal(withoutMetrics.metrics, undefined);
  assert.doesNotMatch(withoutMetrics.scoreReasons.join(" "), /0 vistas/);
});

test("social source changes, pauses, and deletion during fetch are skipped without telemetry or references", async (t) => {
  const cases = [
    [
      "pause",
      (brand, source) =>
        saveRecord(brand.id, "sources", { ...source, enabled: false }),
    ],
    [
      "query change",
      (brand, source) =>
        saveRecord(brand.id, "sources", { ...source, query: "new query" }),
    ],
    [
      "URL change",
      (brand, source) =>
        saveRecord(brand.id, "sources", {
          ...source,
          url: "https://www.tiktok.com/@new-creator",
        }),
    ],
    [
      "type change",
      (brand, source) =>
        saveRecord(brand.id, "sources", { ...source, type: "youtube" }),
    ],
    ["delete", (brand, source) => deleteRecord(brand.id, "sources", source.id)],
  ];
  for (const [label, mutate] of cases) {
    await t.test(label, async () => {
      const brand = makeBrand();
      const source = makeSource(brand);
      let begin;
      let release;
      const started = new Promise((resolve) => (begin = resolve));
      const waiting = new Promise((resolve) => (release = resolve));
      const sync = syncSources(brand, {
        socialFetcher: async () => {
          begin();
          await waiting;
          return [socialItem()];
        },
      });
      await started;
      mutate(brand, getRecord(brand.id, "sources", source.id));
      release();
      const result = await sync;
      assert.equal(result.sources[0].skipped, true);
      assert.deepEqual(listRecords(brand.id, "references"), []);
      const current = getRecord(brand.id, "sources", source.id);
      if (label === "delete") assert.equal(current, null);
      else {
        assert.equal(current.enabled, label !== "pause");
        assert.equal(current.lastSyncedAt, undefined);
        assert.equal(current.lastAttemptAt, undefined);
      }
    });
  }
});

test("same social video refresh keeps valid analysis but changed media or identity invalidates it", async () => {
  const brand = makeBrand();
  const source = makeSource(brand);
  let item = socialItem();
  const sync = () => syncSources(brand, { socialFetcher: async () => [item] });
  await sync();
  let reference = listRecords(brand.id, "references")[0];
  reference = saveRecord(brand.id, "references", {
    ...reference,
    videoAnalysis: validVideoAnalysis(),
    contentScope: "video_audio",
  });

  item = socialItem();
  await sync();
  reference = getRecord(brand.id, "references", reference.id);
  assert.equal(reference.videoAnalysis.status, "completed");
  assert.equal(reference.contentScope, "video_audio");

  reference = saveRecord(brand.id, "references", {
    ...reference,
    videoAnalysis: validVideoAnalysis(),
    contentScope: "video_audio",
  });
  item = socialItem({
    mediaUrl: "https://media.example.test/other/123.mp4?token=rotated",
  });
  await sync();
  reference = getRecord(brand.id, "references", reference.id);
  assert.equal(reference.videoAnalysis, undefined);
  assert.equal(reference.contentScope, "metadata_only");
  assert.match(reference.mediaUrl, /other\/123\.mp4/);

  reference = saveRecord(brand.id, "references", {
    ...reference,
    videoAnalysis: validVideoAnalysis(),
    contentScope: "video_audio",
  });
  item = socialItem({ videoId: "other-id", externalId: "other-id" });
  await sync();
  reference = getRecord(brand.id, "references", reference.id);
  assert.equal(reference.videoId, "other-id");
  assert.equal(reference.videoAnalysis, undefined);
});

test("cross-source promotion cannot replace the identity or media behind saved video analysis", async () => {
  const brand = makeBrand();
  const firstSource = makeSource(brand);
  const firstItem = socialItem({ metrics: undefined });
  await syncSources(brand, { socialFetcher: async () => [firstItem] });
  let reference = listRecords(brand.id, "references")[0];
  reference = saveRecord(brand.id, "references", {
    ...reference,
    videoAnalysis: validVideoAnalysis(),
    contentScope: "video_audio",
  });
  const secondSource = makeSource(brand, {
    type: "apify",
    platform: "instagram",
  });
  const secondItem = socialItem({
    platform: "instagram",
    url: firstItem.url,
    externalId: "different-video",
    videoId: "different-video",
    mediaUrl: "https://media.example.test/videos/replacement.mp4",
    metrics: { views: 9999 },
  });
  await syncSources(brand, {
    socialFetcher: async (_brand, currentSource) =>
      currentSource.id === secondSource.id ? [secondItem] : [],
  });
  const stored = getRecord(brand.id, "references", reference.id);
  assert.equal(stored.sourceId, firstSource.id);
  assert.equal(stored.videoId, firstItem.videoId);
  assert.equal(stored.mediaUrl, firstItem.mediaUrl);
  assert.equal(stored.metrics, undefined);
  assert.equal(stored.videoAnalysis.summary, validVideoAnalysis().summary);
  assert.equal(stored.evidence.at(-1).sourceId, secondSource.id);
});

test("different social videos with similar captions do not fuzzy merge", async () => {
  const brand = makeBrand();
  makeSource(brand);
  const base = socialItem();
  await syncSources(brand, { socialFetcher: async () => [base] });
  await syncSources(brand, {
    socialFetcher: async () => [
      socialItem({
        url: "https://www.tiktok.com/@another/video/987654321",
        sourceUrl: "https://www.tiktok.com/@another/video/987654321",
        externalId: "987654321",
        videoId: "987654321",
      }),
    ],
  });
  assert.equal(listRecords(brand.id, "references").length, 2);
});

test("draft fallback uses validated audiovisual observations without copying on-screen text", async () => {
  const brand = makeBrand();
  const reference = saveRecord(brand.id, "references", {
    title: "Revisión semanal de campañas",
    text: "Descripción disponible para la referencia. ".repeat(8),
    url: "https://www.youtube.com/watch?v=weekly-review",
    platform: "youtube",
    videoId: "weekly-review",
    format: "video",
    videoAnalysis: validVideoAnalysis(),
  });
  const piece = await createDraft(brand, {
    referenceId: reference.id,
    format: "reel",
    channel: "instagram",
  });
  assert.equal(piece.generationEngine, "heuristic");
  assert.match(piece.script, /Crear un ejemplo propio de revisión semanal/);
  assert.doesNotMatch(piece.script, /video_audio|Apuntes observacionales/);
  assert.doesNotMatch(piece.script, /no copies frases ni deduzcas causalidad/);
  assert.doesNotMatch(piece.script, /Texto que no debe copiarse/);
});

test("AI draft receives the complete validated audiovisual context as reference data", async () => {
  const brand = makeBrand();
  const analysis = validVideoAnalysis();
  const reference = saveRecord(brand.id, "references", {
    title: "Referencia de video",
    text: "Contexto editorial suficiente.",
    url: "https://www.youtube.com/watch?v=weekly-review",
    platform: "youtube",
    videoId: "weekly-review",
    format: "video",
    videoAnalysis: analysis,
  });
  setSecret(brand.id, "ai", {
    apiKey: "test-key",
    model: "test-model",
    baseUrl: "https://example.test/v1",
  });
  let request;
  const output = {
    title: "Idea original",
    hook: "Una pregunta propia",
    script: "Guion breve",
    caption: "Texto original",
    cta: "Cuéntanos",
    scenes: [{ text: "Escena propia", duration: 5 }],
  };
  await createDraft(
    brand,
    { referenceId: reference.id, format: "reel", channel: "instagram" },
    {
      fetcher: async (_url, options) => {
        request = JSON.parse(options.body);
        return new Response(
          JSON.stringify({ output_text: JSON.stringify(output) }),
          {
            headers: { "content-type": "application/json" },
          },
        );
      },
    },
  );
  const promptInput = JSON.parse(request.input[0].content[0].text);
  assert.deepEqual(promptInput.reference.videoAnalysis, analysis);
  assert.equal(request.store, false);
  assert.match(request.instructions, /no infieras causalidad ni rendimiento/);
  assert.match(request.instructions, /ni copies la referencia ni sus frases/);
});

test("analysis API response redacts provider media URL while retaining the private value in storage", async () => {
  const brand = makeBrand();
  const reference = saveRecord(brand.id, "references", {
    title: "Referencia social con contexto suficiente",
    text: "Texto compartido suficiente para evitar una lectura de URL. ".repeat(
      7,
    ),
    url: "https://www.tiktok.com/@creator/video/123456789",
    source: "TikTok mock",
    platform: "tiktok",
    videoId: "123456789",
    mediaProvider: "apify",
    mediaUrl: "https://media.example.test/private/clip.mp4?token=secret",
  });
  const response = await analyzeReference(brand, reference);
  assert.equal(response.mediaUrl, undefined);
  assert.match(
    getRecord(brand.id, "references", reference.id).mediaUrl,
    /token=secret/,
  );
});
