import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installPermissionFixture } from "./permission-fixture.mjs";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-social-intel-"));
process.env.DATA_DIR = dataDir;
delete process.env.OPENAI_API_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.APIFY_API_TOKEN;
delete process.env.YOUTUBE_API_KEY;

const { db, saveBrand, saveRecord, getRecord, listRecords, setSecret } =
  await import("../server/db.mjs");
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

test("social collection fails before injected transports for every restricted provider", async () => {
  for (const [type, platform] of [
    ["youtube", "youtube"],
    ["apify", "instagram"],
    ["apify", "tiktok"],
  ]) {
    const brand = makeBrand();
    const source = makeSource(brand, { type, platform });
    let calls = 0;
    await assert.rejects(
      fetchSource(brand, source, {
        socialFetcher: async () => {
          calls++;
          return [socialItem()];
        },
      }),
      (error) => error.status === 403,
    );
    assert.equal(calls, 0);
    assert.deepEqual(listRecords(brand.id, "references"), []);
  }
});

for (const [type, platform] of [
  ["youtube", "youtube"],
  ["apify", "instagram"],
  ["apify", "tiktok"],
]) {
  test(`${platform} sync reports permission restriction and cannot mutate previously captured references`, async () => {
    const brand = makeBrand();
    const source = makeSource(brand, { type, platform });
    const reference = saveRecord(
      brand.id,
      "references",
      socialItem({
        platform,
        sourceId: source.id,
        metricsOrigin: type === "youtube" ? "YouTube Data API" : "Apify",
        videoAnalysis: validVideoAnalysis(),
      }),
    );
    let calls = 0;
    const before = getRecord(brand.id, "references", reference.id);
    const result = await syncSources(brand, {
      socialFetcher: async () => {
        calls++;
        return [
          socialItem({
            videoId: "replacement",
            mediaUrl: "https://cdn.example.test/replacement.mp4",
            metrics: { views: 9999 },
          }),
        ];
      },
    });
    assert.equal(calls, 0);
    assert.equal(result.added, 0);
    assert.equal(result.updated, 0);
    assert.equal(result.errors.length, 1);
    assert.ok(getRecord(brand.id, "sources", source.id).lastError);
    assert.deepEqual(getRecord(brand.id, "references", reference.id), before);
    assert.equal(listRecords(brand.id, "references").length, 1);
  });
}

test("paused restricted sources neither call transports nor generate successful collection telemetry", async () => {
  const brand = makeBrand();
  const source = makeSource(brand);
  saveRecord(brand.id, "sources", { ...source, enabled: false });
  let calls = 0;
  const result = await syncSources(brand, {
    socialFetcher: async () => {
      calls++;
      return [socialItem()];
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.added, 0);
  assert.equal(
    getRecord(brand.id, "sources", source.id).lastSyncedAt,
    undefined,
  );
});

for (const item of [
  socialItem(),
  socialItem({ platform: "instagram", sourceId: "legacy-social-source" }),
  socialItem({
    platform: "youtube",
    metricsOrigin: "YouTube Data API",
    mediaProvider: undefined,
  }),
]) {
  test(`derived trend computation rejects old ${item.platform} provider data`, () => {
    const before = JSON.stringify(item);
    assert.throws(
      () => computeTrend(item, null, [item], [], Date.now()),
      (error) => error.status === 403,
    );
    assert.equal(JSON.stringify(item), before);
  });
}

test("permitted public news trend computation still distinguishes observation windows", () => {
  const now = Date.parse("2026-10-17T12:00:00.000Z");
  const item = {
    title: "A sample news item",
    source: "Hacker News",
    url: "https://news.ycombinator.com/item?id=123",
    publishedAt: new Date(now - 3600000).toISOString(),
    metrics: { score: 50 },
    metricsOrigin: "Hacker News API",
  };
  const first = computeTrend(item, null, [item], [], now);
  assert.equal(first.trend.velocity, undefined);
  assert.equal(first.trendHistory.length, 1);
  const later = computeTrend(
    { ...item, metrics: { score: 65 } },
    first,
    [item],
    [],
    now + 3600000,
  );
  assert.equal(later.trend.velocity, 15);
  assert.equal(later.trend.velocityUnit, "points/hour");
  assert.equal(later.trendHistory.length, 2);
});

for (const platform of ["youtube", "tiktok", "instagram"]) {
  test(`${platform} legacy content cannot enter analysis or AI drafting`, async () => {
    const brand = makeBrand();
    const reference = saveRecord(
      brand.id,
      "references",
      socialItem({
        platform,
        metricsOrigin: platform === "youtube" ? "YouTube Data API" : "Apify",
        videoAnalysis: validVideoAnalysis(),
        sourceId: "legacy-source",
      }),
    );
    setSecret(brand.id, "ai", {
      apiKey: "test-key",
      model: "test-model",
      baseUrl: "https://example.test/v1",
    });
    let requests = 0;
    const options = {
      fetcher: async () => {
        requests++;
        throw new Error("must not contact AI");
      },
    };
    const before = getRecord(brand.id, "references", reference.id);
    await assert.rejects(
      analyzeReference(brand, reference, options),
      (error) => error.status === 403,
    );
    await assert.rejects(
      createDraft(
        brand,
        { referenceId: reference.id, format: "reel", channel: "instagram" },
        options,
      ),
      (error) => error.status === 403,
    );
    assert.equal(requests, 0);
    assert.deepEqual(getRecord(brand.id, "references", reference.id), before);
    assert.deepEqual(listRecords(brand.id, "pieces"), []);
  });
}

test("an idea cannot launder a restricted reference into a draft", async () => {
  const brand = makeBrand();
  const reference = saveRecord(brand.id, "references", socialItem());
  const idea = saveRecord(brand.id, "ideas", {
    title: "An idea",
    angle: "An angle",
    referenceIds: [reference.id],
  });
  await assert.rejects(
    createDraft(brand, { ideaId: idea.id, channel: "instagram" }),
    (error) => error.status === 403,
  );
  assert.deepEqual(listRecords(brand.id, "pieces"), []);
});

test("own editorial draft keeps instructions separate from publishable copy", async () => {
  const brand = makeBrand();
  const reference = saveRecord(brand.id, "references", {
    title: "Revisión semanal de campañas",
    text: "Un ejemplo original del equipo de la empresa. ".repeat(8),
    source: "Equipo",
    format: "video",
    videoAnalysis: validVideoAnalysis(),
  });
  const piece = await createDraft(brand, {
    referenceId: reference.id,
    format: "reel",
    channel: "instagram",
  });
  assert.equal(piece.generationEngine, "heuristic");
  assert.equal(
    piece.editorialBrief.angle,
    "Crear un ejemplo propio de revisión semanal para un equipo pequeño.",
  );
  assert.doesNotMatch(
    piece.script,
    /Crear un ejemplo propio de revisión semanal|video_audio|Apuntes observacionales/,
  );
  assert.doesNotMatch(
    piece.script,
    /no copies frases ni deduzcas causalidad|Texto que no debe copiarse/,
  );
});

test("a reviewed synthetic AI provider receives own editorial context with storage disabled", async () => {
  installPermissionFixture(dataDir, [
    { origin: "https://example.test", pathPrefix: "/v1", purposes: ["ai"] },
  ]);
  const brand = makeBrand();
  const analysis = validVideoAnalysis();
  const reference = saveRecord(brand.id, "references", {
    title: "Video propio",
    text: "Contexto editorial propio suficiente.",
    source: "Equipo",
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
    scenes: Array.from({ length: 5 }, (_, index) => ({
      text: `Escena propia ${index + 1}`,
      duration: 5,
    })),
  };
  await createDraft(
    brand,
    { referenceId: reference.id, format: "reel", channel: "instagram" },
    {
      fetcher: async (_url, options) => {
        request = JSON.parse(options.body);
        return new Response(
          JSON.stringify({ output_text: JSON.stringify(output) }),
          { headers: { "content-type": "application/json" } },
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
