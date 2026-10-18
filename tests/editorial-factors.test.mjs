import test from "node:test";
import assert from "node:assert/strict";
import { explainEditorialFactors } from "../server/editorial-factors.mjs";

const NOW = Date.parse("2026-10-18T12:00:00Z");
const explain = (reference, options = {}) =>
  explainEditorialFactors(reference, { now: NOW, ...options });
const factor = (factors, name) => factors.find((item) => item.factor === name);

test("cold metadata keeps all six factors explicit without claiming creative or audience observations", () => {
  const factors = explain({
    title: "Cómo aplicar IA a ventas",
    format: "video",
    platform: "youtube",
    contentScope: "metadata_only",
    analysis: { hook: "El primer segundo retiene al público" },
    tags: ["educación"],
  });
  assert.deepEqual(
    factors.map((item) => item.factor),
    ["hook", "format", "topic", "timing", "publisher", "performance"],
  );
  assert.ok(
    factors.every(
      (item) =>
        typeof item.label === "string" && item.observation && item.limitation,
    ),
  );
  assert.match(factor(factors, "hook").observation, /Título disponible/);
  assert.doesNotMatch(
    factor(factors, "hook").observation,
    /primer segundo|retiene|vimos|escuchamos/,
  );
  assert.match(
    factor(factors, "hook").limitation,
    /no hay una observación registrada de la apertura/,
  );
  assert.match(factor(factors, "format").observation, /metadatos: video/);
  assert.match(
    factor(factors, "format").limitation,
    /no confirma la estructura creativa/,
  );
  assert.match(factor(factors, "topic").observation, /No se ha definido/);
  assert.match(
    factor(factors, "performance").observation,
    /No hay métricas nativas/,
  );
  assert.match(
    factor(factors, "publisher").observation,
    /no incluye atribución/,
  );
});

test("missing input and supplied text remain bounded and unknown where evidence is absent", () => {
  for (const input of [undefined, null, false, [], {}]) {
    const factors = explain(input);
    assert.equal(factors.length, 6);
    assert.match(factor(factors, "hook").observation, /No hay título/);
  }
  const input = { text: `Texto aportado ${"a".repeat(10_000)}` };
  const original = structuredClone(input);
  const factors = explain(input);
  assert.match(factor(factors, "hook").observation, /Texto disponible/);
  assert.ok(factor(factors, "hook").observation.length < 250);
  assert.deepEqual(input, original);
});

test("audiovisual factors cite stored observations, timestamps and limited sampling", () => {
  const factors = explain({
    format: "reel",
    videoAnalysis: {
      status: "completed",
      contentScope: "video_audio",
      hook: {
        visual: "Plano cercano con un rótulo legible.",
        verbal: "Plantea una pregunta sobre ventas.",
      },
      structure: ["Pregunta", "Ejemplo", "Cierre"],
      observations: [
        { startSeconds: 3.5, endSeconds: 8, observation: "Expone un caso." },
      ],
      coverage: {
        mode: "static",
        samplingFps: 1,
        notes: "Los cambios rápidos pueden pasar inadvertidos.",
      },
    },
  });
  const hook = factor(factors, "hook");
  assert.match(hook.observation, /Análisis visual: Plano cercano/);
  assert.match(hook.observation, /audio disponible/);
  assert.match(hook.observation, /3\.5–8 s/);
  assert.doesNotMatch(hook.observation, /primer segundo|vimos/);
  assert.match(hook.limitation, /1 fotogramas\/s/);
  assert.match(hook.limitation, /tiempos son aproximados/);
  assert.match(hook.limitation, /puede haber momentos no observados/);
  assert.match(
    factor(factors, "format").observation,
    /Pregunta → Ejemplo → Cierre/,
  );
  assert.match(factor(factors, "format").limitation, /cobertura limitada/);
});

test("sampled video without confirmed audio never repeats a verbal hook as heard speech", () => {
  const factors = explain({
    videoAnalysis: {
      status: "completed",
      contentScope: "sampled_video",
      hook: {
        visual: "Aparece texto sobre una tabla.",
        verbal: "Esta voz no fue confirmada",
      },
      coverage: {},
    },
  });
  const hook = factor(factors, "hook");
  assert.match(hook.observation, /Aparece texto/);
  assert.doesNotMatch(
    hook.observation,
    /voz no fue confirmada|Análisis verbal/,
  );
  assert.match(hook.limitation, /No hay audio confirmado/);
  assert.match(hook.limitation, /cobertura temporal no está especificada/);
  const incomplete = explain({
    title: "Título real",
    videoAnalysis: {
      status: "pending",
      contentScope: "video_audio",
      hook: { visual: "No debe aparecer" },
    },
  });
  assert.doesNotMatch(
    factor(incomplete, "hook").observation,
    /No debe aparecer/,
  );
});

test("topic labels are editorial grouping and never audience affinities or inferred YouTube categories", () => {
  const factors = explain(
    { id: "one", platform: "youtube", title: "IA en ventas" },
    {
      topic: "Mejorar ventas con IA",
      relatedReferences: [
        { id: "one", metrics: { views: 100 } },
        { id: "two", platform: "instagram", metrics: { views: 900 } },
        { id: "demo", isDemo: true },
      ],
    },
  );
  const topic = factor(factors, "topic");
  assert.match(
    topic.observation,
    /Agrupación editorial propuesta: «Mejorar ventas con IA»/,
  );
  assert.match(topic.observation, /2 referencias/);
  assert.match(topic.limitation, /no identifica intereses individuales/);
  assert.match(topic.limitation, /categoría inferida de YouTube/);
  assert.doesNotMatch(JSON.stringify(factors), /100 vistas|900 vistas|1000/);
});

test("GDELT firstSeen is detection and never substituted for publication time", () => {
  const factors = explain({
    source: "gdelt",
    firstSeenAt: "2026-10-18T08:00:00Z",
    publisher: "diario.com",
  });
  const timing = factor(factors, "timing");
  assert.match(timing.observation, /Primera detección registrada por GDELT/);
  assert.match(timing.observation, /no es una fecha de publicación/);
  assert.doesNotMatch(
    timing.observation,
    /Publicada hace|Fecha de publicación reportada/,
  );
  assert.match(timing.limitation, /no demuestra que el horario/);
  assert.match(
    factor(factors, "publisher").observation,
    /Medio atribuido: diario\.com/,
  );
});

test("publication dates and publisher names remain source attribution, without influence claims", () => {
  const factors = explain({
    publishedAt: "2026-10-19T08:00:00Z",
    author: "Canal educativo",
    publisher: "Medio original",
    followers: 500_000,
    source: "youtube",
  });
  assert.match(
    factor(factors, "timing").observation,
    /Fecha de publicación reportada por la fuente/,
  );
  assert.match(
    factor(factors, "timing").limitation,
    /fecha reportada es futura/,
  );
  assert.match(factor(factors, "publisher").observation, /Canal educativo/);
  assert.match(
    factor(factors, "publisher").limitation,
    /no informa sobre seguidores/,
  );
  assert.doesNotMatch(
    factor(factors, "publisher").observation,
    /500000|500\.000|influencia/,
  );
});

test("native metrics keep official and provider-reported origins distinct", () => {
  const official = factor(
    explain({
      platform: "youtube",
      metrics: { views: 1234, likes: 0, comments: 4 },
      metricsOrigin: "YouTube Data API",
      metricsObservedAt: "2026-10-18T10:00:00Z",
    }),
    "performance",
  );
  assert.match(official.observation, /1234 vistas, 0 likes, 4 comentarios/);
  assert.match(
    official.observation,
    /YouTube Data API \(métricas oficiales del video\)/,
  );
  assert.match(official.observation, /2026-10-18T10:00:00\.000Z/);
  assert.doesNotMatch(official.observation, /funcionó|éxito|viral|afinidad/);
  assert.match(
    official.limitation,
    /no demuestran éxito, afinidad ni causalidad/,
  );
  const reported = factor(
    explain({
      platform: "instagram",
      metrics: { views: 800 },
      metricsOrigin: "Apify",
    }),
    "performance",
  );
  assert.match(reported.observation, /Apify \(valores reportados/);
  assert.doesNotMatch(reported.observation, /métricas oficiales/);
  const unknown = factor(explain({ metrics: { likes: 15 } }), "performance");
  assert.match(unknown.observation, /origen no especificado/);
  const invalid = factor(
    explain({
      metrics: { views: "200", likes: -1, comments: Infinity },
      trend: { score: 88 },
    }),
    "performance",
  );
  assert.match(invalid.observation, /No hay métricas nativas/);
});

test("velocity is scoped to two dated observations of the same platform, without topic growth claims", () => {
  const reference = {
    platform: "youtube",
    trend: {
      platform: "youtube",
      metrics: { views: 150 },
      priorityMetric: { origin: "YouTube Data API" },
      previousObservedAt: "2026-10-18T10:00:00Z",
      observedAt: "2026-10-18T11:00:00Z",
      velocity: 50,
      velocityUnit: "views/hour",
    },
  };
  const performance = factor(explain(reference), "performance");
  assert.match(performance.observation, /cambio de 50 vistas\/h/);
  assert.match(
    performance.observation,
    /10:00:00\.000Z y 2026-10-18T11:00:00\.000Z/,
  );
  assert.match(performance.limitation, /no es crecimiento de todo el tema/);
  for (const patch of [
    { previousObservedAt: undefined },
    { observedAt: "2026-10-18T09:00:00Z" },
    { observedAt: "2026-10-19T09:00:00Z" },
    { platform: "instagram" },
    { velocityUnit: "mixed social score" },
  ]) {
    const ignored = factor(
      explain({ ...reference, trend: { ...reference.trend, ...patch } }),
      "performance",
    );
    assert.doesNotMatch(ignored.observation, /cambio de 50/);
    assert.match(ignored.limitation, /Sin dos observaciones comparables/);
  }
});

test("demo factors explicitly mark every observation as illustrative", () => {
  const factors = explain({
    isDemo: true,
    title: "Ejemplo",
    metrics: { views: 2000 },
    metricsOrigin: "YouTube Data API",
  });
  assert.ok(
    factors.every((item) =>
      item.observation.startsWith("Ejemplo ilustrativo:"),
    ),
  );
  assert.ok(
    factors.every((item) =>
      item.limitation.startsWith("No es evidencia real."),
    ),
  );
});
