import express from "express";
import { createHash } from "node:crypto";
import {
  db,
  getBrand,
  getRecord,
  listRecords,
  saveRecord,
  deleteRecord,
  getSecret,
  addActivity,
} from "./db.mjs";
import { requireAuth, requireBrand, requireEditor } from "./core.mjs";
import { publicCitationUrl } from "./public-citation-url.mjs";
import { explainEditorialFactors } from "./editorial-factors.mjs";
import { opportunityFingerprint } from "./opportunity-fingerprint.mjs";
import { assertAggregateAudienceText } from "./aggregate-privacy.mjs";
import { referenceUsePolicy, sourceAccessPolicy } from "./access-policy.mjs";
import { containsUrlContactDetails } from "./url-privacy.mjs";
import { providerAttributionsForReference } from "../src/lib/provider-attribution.mjs";
import {
  deduplicateReferences,
  REFERENCE_IDENTITY_VERSION,
} from "./reference-identity.mjs";

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const MAX_METRIC = 1_000_000_000_000;
const STOP_WORDS = new Set(
  "a al algo ante bajo como con contra cual cuando de del desde donde el ella ellas ellos en entre era es esa ese eso esta estas este esto estos ha hacia hasta hay la las lo los mas me mi mis mucho muy no nos o otra otro para pero por porque que quien se ser si sin sobre son su sus te tiene todo tu un una unas uno unos y ya how the with from your this that into more use are for what why can you their its our was were have has will not and".split(
    " ",
  ),
);

const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
const clean = (value) => (typeof value === "string" ? value.trim() : "");
function normalize(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
function terms(value) {
  const normalized = normalize(value);
  const words = [...new Set(normalized.match(/[a-z0-9]{2,}/g) || [])].filter(
    (word) => !STOP_WORDS.has(word),
  );
  const equivalents = [
    [
      /\b(?:ia|ai|llm|inteligencia artificial|artificial intelligence)\b/,
      "concept_ai",
    ],
    [/\b(?:ventas?|sales|selling|comercial(?:es)?)\b/, "concept_sales"],
    [/\b(?:automatiza\w*|automation|automate\w*)\b/, "concept_automation"],
    [
      /\b(?:educaci\w*|formacion|aprendizaje|education|learning|training)\b/,
      "concept_learning",
    ],
    [/\b(?:agentes?|agents?|agentic)\b/, "concept_agents"],
    [/\b(?:liderazgo|leadership)\b/, "concept_leadership"],
    [/\b(?:salud|healthcare|healthtech)\b/, "concept_health"],
    [/\b(?:finanzas?|finance|financial|fintech)\b/, "concept_finance"],
    [/\b(?:comercio|ecommerce|retail)\b/, "concept_commerce"],
  ];
  for (const [pattern, concept] of equivalents)
    if (pattern.test(normalized)) words.push(concept);
  return words;
}
function matches(left, right) {
  const rightTerms = new Set(terms(right));
  return terms(left).filter((word) => rightTerms.has(word));
}
function admissibleSignal(signal) {
  try {
    assertAggregateAudienceText(
      `${clean(signal.topic)}\n${clean(signal.note)}`,
      "Señal",
    );
  } catch (error) {
    if (error.status === 400) return false;
    throw error;
  }
  if (containsUrlContactDetails(signal.sourceUrl)) return false;
  if (["public_content", "editorial"].includes(signal.sourceType)) return true;
  return (
    signal.sourceType === "community" &&
    signal.aggregate === true &&
    Number.isSafeInteger(signal.sampleSize) &&
    signal.sampleSize >= 5 &&
    typeof signal.communityPollId === "string" &&
    !!signal.communityPollId
  );
}
function signalWeight(signal) {
  return signal.sourceType === "community"
    ? 4
    : signal.sourceType === "public_content"
      ? 3
      : 1;
}
function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(400, "Envía un objeto JSON válido.");
  return value;
}
function boundedText(value, label, max, required = false) {
  if (value === undefined && !required) return "";
  if (typeof value !== "string") fail(400, `${label} debe ser texto.`);
  const result = value.trim();
  if ((required && !result) || result.length > max)
    fail(400, `${label}: longitud inválida (máximo ${max}).`);
  return result;
}
function onlyFields(body, fields) {
  if (Object.keys(body).some((key) => !fields.includes(key)))
    fail(400, "La solicitud contiene campos no admitidos.");
}

function publicLink(value, label = "Enlace") {
  return publicCitationUrl(boundedText(value, label, 3000), label);
}
function citationUrl(value) {
  try {
    return publicLink(value);
  } catch {
    return undefined;
  }
}
function timestamp(value, fallback = Date.now()) {
  const result =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : Date.parse(value);
  return Number.isFinite(result) ? result : fallback;
}
function selectedRecords(brand, kind, options, key = kind) {
  return options[key] || listRecords(brand.id, kind);
}
function realScope(brand, references, pieces) {
  return (
    brand.isDemo === true &&
    references.every((item) => item.isDemo === true) &&
    pieces.every((item) => item.isDemo === true)
  );
}
function topicFor(reference, brand) {
  if (clean(reference.topic)) return clean(reference.topic).slice(0, 160);
  const content = `${reference.title || ""} ${reference.text || ""} ${(reference.tags || []).join(" ")}`;
  const pillar = (brand.pillars || [])
    .map((name) => ({ name, count: matches(name, content).length }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))[0];
  return (
    pillar?.name ||
    clean(reference.title).slice(0, 160) ||
    "Contenido pendiente de clasificar"
  );
}
const topicKey = (topic) =>
  normalize(topic)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
function sourceFingerprint(source) {
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
  return digest(
    Object.fromEntries(
      Object.keys(source)
        .sort()
        .filter((key) => !transient.has(key))
        .map((key) => [key, source[key]]),
    ),
  );
}
function observationScope(brand, sources) {
  return digest({
    version: 1,
    publicationIdentityVersion: REFERENCE_IDENTITY_VERSION,
    pillars: brand.pillars || [],
    sources: sources
      .map((source) => [source.id, sourceFingerprint(source)])
      .sort((a, b) => a[0].localeCompare(b[0])),
  });
}

/** Save a bounded, daily observation after a successful provider refresh.
 * Growth compares publication counts in equal windows from the same configured
 * sources. Native platform engagement never enters this calculation.
 */
export function recordTopicObservation(brandId, options = {}) {
  const brand = getBrand(brandId);
  if (!brand || brand.isDemo) return null;
  const now = timestamp(options.now);
  const sources = listRecords(brandId, "sources").filter(
    (source) =>
      source.enabled &&
      sourceAccessPolicy(source).allowed &&
      source.type !== "youtube" &&
      source.platform !== "youtube" &&
      !source.lastError &&
      (Array.isArray(options.sourceIds)
        ? options.sourceIds.includes(source.id)
        : source.lastSyncedAt &&
          Math.abs(timestamp(source.lastSyncedAt, 0) - now) <= DAY),
  );
  if (!sources.length) return null;
  const ids = new Set(sources.map((source) => source.id));
  const references = deduplicateReferences(
    listRecords(brandId, "references").filter(
      (reference) =>
        !reference.isDemo &&
        referenceUsePolicy(
          reference,
          sources.find((source) => source.id === reference.sourceId),
        ).allowed &&
        reference.platform !== "youtube" &&
        ids.has(reference.sourceId),
    ),
  );
  const counts = {};
  let sampleSize = 0;
  for (const reference of references) {
    const published = timestamp(reference.publishedAt, 0);
    if (!published || published <= now - WEEK || published > now) continue;
    sampleSize++;
    const key = topicKey(topicFor(reference, brand));
    counts[key] = (counts[key] || 0) + 1;
  }
  const scope = observationScope(brand, sources);
  const day = new Date(now).toISOString().slice(0, 10);
  const snapshot = saveRecord(brandId, "topicSnapshots", {
    id: digest([scope, day]),
    scope,
    observedAt: new Date(now).toISOString(),
    windowStart: new Date(now - WEEK).toISOString(),
    windowMs: WEEK,
    sourceIds: [...ids].sort(),
    counts,
    sampleSize,
    origin: "public_source_observation",
  });
  for (const old of listRecords(brandId, "topicSnapshots"))
    if (timestamp(old.observedAt, 0) < now - 100 * DAY)
      deleteRecord(brandId, "topicSnapshots", old.id);
  return snapshot;
}

function comparableHistory(brand, sources, snapshots, now) {
  const usable = sources.filter(
    (source) =>
      source.enabled &&
      source.type !== "youtube" &&
      source.platform !== "youtube" &&
      !source.lastError,
  );
  if (!usable.length) return null;
  const scope = observationScope(brand, usable);
  const history = snapshots
    .filter(
      (snapshot) =>
        snapshot.scope === scope &&
        snapshot.windowMs === WEEK &&
        timestamp(snapshot.observedAt, 0) <= now &&
        snapshot.origin === "public_source_observation",
    )
    .sort((a, b) => timestamp(b.observedAt, 0) - timestamp(a.observedAt, 0));
  const latest = history[0];
  if (!latest || now - timestamp(latest.observedAt, 0) > 2 * DAY) return null;
  const previous = history.find((snapshot) => {
    const distance =
      timestamp(latest.observedAt, 0) - timestamp(snapshot.observedAt, 0);
    return distance >= WEEK && distance <= WEEK + 2 * DAY;
  });
  return previous ? { latest, previous } : null;
}
function growthFor(topic, history, isDemo, youtubeOnly) {
  if (isDemo)
    return {
      label: "insufficient",
      explanation: "Ejemplo ilustrativo: no representa crecimiento observado.",
    };
  if (youtubeOnly)
    return {
      label: "insufficient",
      explanation:
        "Las métricas nativas de YouTube se muestran por video; no se convierten en una puntuación ni una tendencia de rendimiento.",
    };
  if (!history)
    return {
      label: "insufficient",
      explanation:
        "Faltan dos observaciones comparables: ventanas de 7 días, mismas fuentes y consultas, separadas por al menos una semana. Una sola consulta no demuestra crecimiento.",
    };
  const key = topicKey(topic);
  const before = history.previous.counts?.[key] || 0;
  const current = history.latest.counts?.[key] || 0;
  const increase = current > before;
  const decline = current < before;
  return {
    label: increase
      ? current < 3
        ? "early_signal"
        : "observed"
      : decline
        ? "declining"
        : "stable",
    explanation: `${current} publicaciones fechadas en la ventana terminada el ${history.latest.observedAt.slice(0, 10)}, frente a ${before} en la terminada el ${history.previous.observedAt.slice(0, 10)}; mismas ${history.latest.sourceIds.length} fuentes configuradas. ${increase ? (current < 3 ? "Aumento con una muestra pequeña; verificar en próximas observaciones." : "Aumentó la frecuencia en esta muestra.") : decline ? "Disminuyó la frecuencia en esta muestra; no se observó crecimiento." : "La frecuencia se mantuvo igual en estas ventanas; no se observó crecimiento."} No mide alcance, éxito ni una tendencia global.`,
  };
}
function nativeMetricDetail(reference) {
  const values = [
    ["views", "vistas"],
    ["likes", "me gusta"],
    ["comments", "comentarios"],
    ["score", "puntos"],
  ]
    .filter(
      ([key]) =>
        !(reference.platform === "youtube" && key === "score") &&
        typeof reference.metrics?.[key] === "number" &&
        Number.isFinite(reference.metrics[key]) &&
        reference.metrics[key] >= 0,
    )
    .map(([key, label]) => `${reference.metrics[key]} ${label}`);
  return values.length
    ? ` ${reference.metricsOrigin || reference.source || "La fuente"} reporta ${values.join(", ")} para esta publicación; no se comparan ni suman con otras redes.`
    : " Sin métricas verificadas de rendimiento.";
}
function formatSuggestion(references) {
  const counts = new Map();
  for (const reference of references) {
    const channel = ["linkedin", "instagram", "tiktok", "youtube"].includes(
      reference.platform,
    )
      ? reference.platform
      : /linkedin/i.test(reference.source || "")
        ? "linkedin"
        : "linkedin";
    const format = ["post", "carousel", "reel", "video", "newsletter"].includes(
      reference.format,
    )
      ? reference.format
      : channel === "youtube"
        ? "video"
        : "post";
    const key = `${channel}:${format}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const [channel, format] = [...counts]
    .sort((a, b) => b[1] - a[1])[0][0]
    .split(":");
  return { channel, format };
}
function measurementWindow(outcome) {
  const published = timestamp(outcome.publishedAt, 0);
  const measured = timestamp(outcome.updatedAt || outcome.createdAt, 0);
  if (!published || !measured || measured < published) return null;
  const days = (measured - published) / DAY;
  return days <= 1
    ? "hasta 1 día"
    : days <= 3
      ? "1–3 días"
      : days <= 7
        ? "3–7 días"
        : days <= 14
          ? "7–14 días"
          : days <= 30
            ? "14–30 días"
            : "más de 30 días";
}
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}
function editorialLearning(
  topic,
  segmentIds,
  channel,
  format,
  outcomes,
  pieces,
  references,
) {
  const pieceMap = new Map(pieces.map((piece) => [piece.id, piece]));
  const referenceTopics = new Map(
    references.map((reference) => [
      reference.id,
      topicKey(reference.topic || ""),
    ]),
  );
  const topicTerms = terms(topic);
  const groups = new Map();
  for (const outcome of outcomes) {
    const piece = pieceMap.get(outcome.pieceId);
    if (
      !piece ||
      !segmentIds.includes(piece.segmentId) ||
      piece.channel !== channel ||
      piece.format !== format ||
      outcome.metrics.views <= 0
    )
      continue;
    const window = measurementWindow(outcome);
    if (!window || window === "más de 30 días") continue;
    const key = `${piece.segmentId}:${window}`;
    const group = groups.get(key) || { window, topicRates: [], otherRates: [] };
    const related =
      referenceTopics.get(piece.referenceId) === topicKey(topic) ||
      (topicTerms.length > 0 &&
        matches(topic, `${piece.title || ""} ${piece.script || ""}`).length >=
          Math.min(2, topicTerms.length));
    const rate = outcome.metrics.engagement / outcome.metrics.views;
    (related ? group.topicRates : group.otherRates).push(rate);
    groups.set(key, group);
  }
  const comparison = [...groups.values()]
    .filter(
      (group) => group.topicRates.length >= 3 && group.otherRates.length >= 3,
    )
    .sort(
      (a, b) =>
        b.topicRates.length +
        b.otherRates.length -
        a.topicRates.length -
        a.otherRates.length,
    )[0];
  if (!comparison)
    return {
      delta: 0,
      reason:
        "Aprendizaje editorial pendiente: hacen falta al menos 3 publicaciones propias de este tema y 3 de otros temas del mismo segmento, canal, formato y ventana aproximada de medición. Sin esa muestra no se ajusta la prioridad por resultados.",
    };
  const topicMedian = median(comparison.topicRates);
  const baseline = median(comparison.otherRates);
  const delta =
    baseline > 0
      ? topicMedian > baseline * 1.15
        ? 8
        : topicMedian < baseline * 0.85
          ? -8
          : 0
      : 0;
  return {
    delta,
    reason: `Ajuste editorial por resultados propios: ${delta > 0 ? "+" : ""}${delta} puntos de prioridad. En ${comparison.topicRates.length} publicaciones de este tema y ${comparison.otherRates.length} de otros temas del mismo segmento en ${channel}, formato ${format} y medición de ${comparison.window}, la mediana de interacciones/vistas aportadas manualmente es ${(topicMedian * 100).toFixed(1)}% frente a ${(baseline * 100).toFixed(1)}%. ${baseline === 0 ? "La referencia es cero; no se calcula mejora ni se ajusta la prioridad." : "El ajuste usa una diferencia descriptiva superior al 15% y está acotado a 8 puntos."} Las ventanas se aproximan con la fecha de registro; no hay atribución causal ni comparación entre redes.`,
  };
}
function buildOpportunities(
  brand,
  references,
  signals,
  history,
  isDemo,
  outcomes,
  pieces,
) {
  const groups = new Map();
  for (const reference of deduplicateReferences(
    references.filter((item) => item.status !== "dismissed"),
  )) {
    const topic = topicFor(reference, brand);
    const key = topicKey(topic);
    const group = groups.get(key) || { topic, references: [] };
    group.references.push(reference);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ topic, references: items }) => {
      const content = `${topic} ${items.map((item) => `${item.title || ""} ${item.text || ""}`).join(" ")}`;
      const segments = (brand.audience || [])
        .map((segment) => {
          const matchedNeeds = matches(segment.needs || "", content);
          const matchedContext = matches(
            `${segment.name || ""} ${segment.role || ""} ${segment.description || ""}`,
            content,
          );
          const relatedSignals = signals.filter(
            (signal) =>
              signal.segmentId === segment.id &&
              matches(signal.topic, content).length > 0,
          );
          return {
            segment,
            matchedNeeds,
            matchedContext,
            relatedSignals,
            weight:
              Math.min(5, matchedNeeds.length) * 3 +
              Math.min(3, matchedContext.length) +
              Math.min(
                6,
                relatedSignals.reduce(
                  (sum, signal) => sum + signalWeight(signal),
                  0,
                ),
              ),
          };
        })
        .filter((item) => item.weight > 0)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 3);
      const contextMatches = matches(
        `${brand.industry || ""} ${brand.description || ""} ${(brand.pillars || []).join(" ")}`,
        content,
      );
      // Editorial text overlap only. No platform metrics, views, trend scores or
      // inferred viewer affinities influence priority or segment assignment.
      const { channel, format } = formatSuggestion(items);
      const learning = editorialLearning(
        topic,
        segments.map((item) => item.segment.id),
        channel,
        format,
        outcomes,
        pieces,
        references,
      );
      const basePriority = Math.min(
        87,
        10 +
          Math.min(20, contextMatches.length * 3) +
          Math.min(
            35,
            (segments[0]?.matchedNeeds.length || 0) * 5 +
              Math.min(10, (segments[0]?.matchedContext.length || 0) * 2),
          ) +
          Math.min(
            22,
            [
              ...new Map(
                segments
                  .flatMap((item) => item.relatedSignals)
                  .map((signal) => [signal.id, signal]),
              ).values(),
            ].reduce((total, signal) => total + signalWeight(signal) * 3, 0),
          ),
      );
      const relevance = Math.max(
        0,
        Math.min(95, basePriority + learning.delta),
      );
      const reasons = [
        `${items.length} referencia${items.length === 1 ? " disponible" : "s disponibles"} sobre este tema en el material de esta empresa.`,
        ...segments.map(
          ({ segment, matchedNeeds, relatedSignals }) =>
            `Hipótesis de pertinencia para ${segment.name}: ${matchedNeeds.length ? `coincide con la necesidad declarada «${clean(segment.needs).slice(0, 200)}» (${matchedNeeds.join(", ")})` : "coincide con el contexto que el equipo declaró para el segmento"}${relatedSignals.length ? `; hay ${relatedSignals.filter((signal) => signal.sourceType === "public_content").length} observaciones públicas y ${relatedSignals.filter((signal) => signal.sourceType === "editorial").length} hipótesis editoriales de contraste; la evidencia pública tiene mayor peso` : ""}.${relatedSignals.some((signal) => signal.sourceType === "community") ? ` Se consideran ${relatedSignals.filter((signal) => signal.sourceType === "community").length} señales comunitarias agregadas, con al menos 5 respuestas cada una, por encima de una nota editorial. Son respuestas voluntarias y no verificadas; no equivalen a personas únicas ni a una muestra representativa.` : ""} No demuestra consumo ni afinidad de personas.`,
        ),
        ...(!segments.length
          ? [
              "No hay coincidencias suficientes con necesidades de un segmento. Revisa la pertinencia antes de producir.",
            ]
          : []),
        `Prioridad editorial por coincidencias de texto; no es probabilidad de éxito ni una clasificación de rendimiento.`,
        learning.reason,
      ];
      const evidence = items.slice(0, 12).map((reference) => ({
        referenceId: reference.id,
        providerAttributions: providerAttributionsForReference(reference),
        title: clean(reference.title) || topic,
        ...(citationUrl(reference.url)
          ? { url: citationUrl(reference.url) }
          : {}),
        source: clean(reference.source) || "Material aportado por el equipo",
        observedAt:
          reference.metricsObservedAt ||
          reference.trend?.observedAt ||
          reference.createdAt,
        detail: `${reference.isDemo ? "Material de demostración. " : ""}${reference.contentScope === "metadata_only" || !clean(reference.text) ? "Solo título y metadatos disponibles; el contenido completo no fue observado." : "Texto disponible para comparación editorial."}${nativeMetricDetail(reference)}`,
      }));
      const target =
        segments.map((item) => item.segment.name).join(", ") ||
        "el segmento que el equipo valide";
      const title = clean(items[0]?.title) || topic;
      const hookObservation = /[?¿]/.test(title)
        ? "el título plantea una pregunta"
        : /\d/.test(title)
          ? "el título presenta una cifra o lista"
          : /\b(?:how|como|cómo)\b/i.test(title)
            ? "el título promete una explicación práctica"
            : "el título enuncia el tema de forma directa";
      return {
        id: `opportunity-${digest(topicKey(topic))}`,
        title: topic,
        topic,
        referenceIds: items.map((item) => item.id),
        segmentIds: segments.map((item) => item.segment.id),
        relevance,
        reasons,
        evidence,
        factors: explainEditorialFactors(items[0], {
          topic,
          relatedReferences: items,
        }),
        growth: growthFor(
          topic,
          history,
          isDemo,
          items.every((item) => item.platform === "youtube"),
        ),
        hypothesis: `Observación: ${hookObservation}. Hipótesis editorial: desarrollar «${topic}» como una decisión práctica para ${target} podría facilitar su comprensión. No sabemos si ese recurso causó el rendimiento de la referencia; requiere validación con contenido propio.`,
        adaptation: `Crear un ${format === "carousel" ? "carrusel" : format === "reel" ? "reel" : format === "video" ? "video" : format === "newsletter" ? "boletín" : "post"} original para ${target}: explicar una decisión sobre «${topic}», mostrar un ejemplo verificable de ${brand.industry || "su sector"} en ${brand.market || "su mercado"} y cerrar con un paso aplicable. Usar el tono ${brand.tone || "claro"}; contrastar los hechos y aportar un ángulo propio antes de aprobar. El formato es una sugerencia editable, no una predicción.`,
        confidence:
          segments.some((item) => item.matchedNeeds.length > 0) &&
          items.length >= 3 &&
          items.filter((item) => clean(item.text).length >= 100).length >= 2
            ? "medium"
            : "low",
        suggestedFormat: format,
        suggestedChannel: channel,
        isDemo,
      };
    })
    .sort((a, b) => b.relevance - a.relevance || a.title.localeCompare(b.title))
    .slice(0, 40);
}
function validMetrics(metrics) {
  return (
    metrics &&
    ["views", "engagement", "leads"].every(
      (key) =>
        typeof metrics[key] === "number" &&
        Number.isFinite(metrics[key]) &&
        metrics[key] >= 0 &&
        metrics[key] <= MAX_METRIC,
    )
  );
}
function aggregateOutcomeNotes(notes) {
  if (typeof notes !== "string") return undefined;
  try {
    return assertAggregateAudienceText(notes, "Notas");
  } catch (error) {
    if (error.status !== 400) throw error;
    // Keep legacy results and their measurement window; omit only the note.
    return undefined;
  }
}
function learningFor(brand, outcomes, pieces) {
  const realPieces = new Map(
    pieces
      .filter((piece) => !piece.isDemo && piece.status === "published")
      .map((piece) => [piece.id, piece]),
  );
  const eligible = outcomes
    .filter(
      (outcome) =>
        outcome.origin === "manual" &&
        !outcome.isDemo &&
        realPieces.has(outcome.pieceId) &&
        validMetrics(outcome.metrics),
    )
    .map((outcome) => ({
      ...outcome,
      notes: aggregateOutcomeNotes(outcome.notes),
    }));
  const groups = new Map();
  for (const outcome of eligible) {
    const segmentId = outcome.segmentId || "unassigned";
    const group = groups.get(segmentId) || {
      segmentId,
      name:
        (brand.audience || []).find((segment) => segment.id === segmentId)
          ?.name ||
        (segmentId === "unassigned" ? "Sin segmento" : "Segmento anterior"),
      pieces: 0,
      views: 0,
      engagement: 0,
      leads: 0,
    };
    group.pieces++;
    for (const key of ["views", "engagement", "leads"])
      group[key] += outcome.metrics[key];
    groups.set(segmentId, group);
  }
  return {
    outcomes: eligible,
    summary: eligible.length
      ? `${eligible.length} publicación${eligible.length === 1 ? "" : "es"} con resultados registrados manualmente por el equipo. Los totales son conteos aportados, pueden tener ventanas distintas y no comparan rendimiento entre redes ni demuestran causalidad, preferencias de consumidores o aprendizaje automático. Revisa piezas, canal y tiempo de medición antes de decidir.`
      : "Registra los resultados de una publicación aprobada para empezar a contrastar tus hipótesis. Aún no hay resultados reales registrados.",
    bySegment: [...groups.values()].sort(
      (a, b) => b.pieces - a.pieces || a.name.localeCompare(b.name),
    ),
  };
}

export function buildInsights(brand, options = {}) {
  const now = timestamp(options.now);
  const allReferences = selectedRecords(brand, "references", options);
  const allPieces = selectedRecords(brand, "pieces", options);
  const sources = selectedRecords(brand, "sources", options);
  const isDemo = realScope(brand, allReferences, allPieces);
  const scopedReferences = allReferences.filter(
    (item) =>
      referenceUsePolicy(
        item,
        sources.find((source) => source.id === item.sourceId),
      ).allowed && (isDemo ? item.isDemo === true : !item.isDemo),
  );
  // Deduplicate globally before assigning topics so legacy copies cannot count
  // again in a second opportunity merely because their editorial topic differs.
  const references = deduplicateReferences(scopedReferences);
  const pieces = allPieces.filter((item) =>
    isDemo ? item.isDemo === true : !item.isDemo,
  );
  const segmentIds = new Set(
    (brand.audience || []).map((segment) => segment.id),
  );
  const signals = selectedRecords(
    brand,
    "audienceSignals",
    options,
    "signals",
  ).filter(
    (signal) => segmentIds.has(signal.segmentId) && admissibleSignal(signal),
  );
  const snapshots = selectedRecords(
    brand,
    "topicSnapshots",
    options,
    "snapshots",
  );
  const history = isDemo
    ? null
    : comparableHistory(brand, sources, snapshots, now);
  const errors = sources
    .filter((source) => source.lastError)
    .map((source) =>
      source.lastError.startsWith(source.name)
        ? source.lastError
        : `${source.name}: ${source.lastError}`,
    );
  const activeSources = sources.filter((source) => source.enabled);
  const learning = learningFor(
    brand,
    selectedRecords(brand, "outcomes", options),
    allPieces,
  );
  const analyses = selectedRecords(
    brand,
    "opportunityAnalyses",
    options,
    "analyses",
  );
  return {
    generatedAt: new Date(now).toISOString(),
    opportunities: buildOpportunities(
      brand,
      // Keep every historical ID available for pieces linked to legacy copies.
      scopedReferences,
      signals,
      history,
      isDemo,
      learning.outcomes,
      allPieces,
    ).map((opportunity) => {
      const analysis = analyses.find(
        (item) =>
          item.opportunityId === opportunity.id &&
          item.fingerprint ===
            opportunityFingerprint(brand, opportunity, { references, signals }),
      );
      return analysis ? { ...opportunity, analysis } : opportunity;
    }),
    coverage: {
      references: references.length,
      sources: sources.length,
      activeSources: activeSources.length,
      errors,
      hasHistory: !!history,
      notes: [
        "Cobertura limitada a las fuentes configuradas y el material que el equipo aportó. No representa todas las redes ni toda la audiencia.",
        "Los segmentos y necesidades son declarados por la empresa; las coincidencias son hipótesis editoriales, no perfiles ni consumidores observados.",
        ...(references.length < scopedReferences.length
          ? [
              "Las capturas de una misma publicación cuentan como una sola evidencia. Los registros originales y sus vínculos se conservan en Referencias.",
            ]
          : []),
        ...(signals.some((signal) => signal.sourceType === "community")
          ? [
              "Las señales comunitarias agrupan un mínimo de 5 respuestas voluntarias por señal. No se verifican identidades, no son personas únicas y no demuestran representatividad de la audiencia.",
            ]
          : []),
        ...(!activeSources.length
          ? [
              "No hay fuentes activas. Configura una fuente o añade referencias públicas para comenzar.",
            ]
          : []),
        ...(!history
          ? [
              "Todavía no hay dos ventanas históricas comparables. Las oportunidades no se presentan como tendencias crecientes.",
            ]
          : []),
        ...(allReferences.some((item) => item.isDemo)
          ? [
              isDemo
                ? "Todas las oportunidades de este espacio son ejemplos de demostración."
                : "Las referencias de demostración se excluyeron de los resultados reales.",
            ]
          : []),
        ...(references.some((item) => item.platform === "youtube")
          ? [
              "YouTube aporta metadatos y métricas nativas por video. No se derivan afinidades de audiencia ni puntuaciones de rendimiento.",
            ]
          : []),
        ...(errors.length
          ? [
              "Algunas fuentes fallaron. Revisa sus errores antes de interpretar la cobertura.",
            ]
          : []),
      ],
    },
    signals,
    learning,
    workflow: {
      context: !!(
        clean(brand.name) &&
        (clean(brand.description) ||
          clean(brand.industry) ||
          brand.pillars?.length)
      ),
      audience: !!brand.audience?.length,
      references: references.length,
      drafts: pieces.filter((piece) => piece.status === "draft").length,
      review: pieces.filter((piece) => piece.status === "review").length,
      scheduled: pieces.filter((piece) => piece.status === "scheduled").length,
      published: pieces.filter((piece) => piece.status === "published").length,
    },
  };
}

function audienceSignalInput(brand, input) {
  const body = object(input);
  onlyFields(body, [
    "segmentId",
    "topic",
    "note",
    "sourceUrl",
    "sampleSize",
    "sourceType",
  ]);
  const segmentId = boundedText(body.segmentId, "Segmento", 100, true);
  if (!(brand.audience || []).some((segment) => segment.id === segmentId))
    fail(400, "El segmento no pertenece a esta empresa.");
  if (!["public_content", "editorial"].includes(body.sourceType))
    fail(400, "Indica si es contenido público o una nota editorial.");
  const topic = boundedText(body.topic, "Tema", 160, true);
  const note = boundedText(body.note, "Observación", 3000, true);
  assertAggregateAudienceText(`${topic}\n${note}`, "Señal");
  const sourceUrl = publicLink(body.sourceUrl, "Fuente");
  if (body.sourceType === "public_content" && !sourceUrl)
    fail(400, "Una observación pública necesita el enlace de su fuente.");
  const sampleSize = body.sampleSize;
  if (
    sampleSize !== undefined &&
    (!Number.isSafeInteger(sampleSize) ||
      sampleSize < 1 ||
      sampleSize > 10_000_000)
  )
    fail(400, "El tamaño de muestra debe ser un entero entre 1 y 10.000.000.");
  return {
    segmentId,
    topic,
    note,
    sourceType: body.sourceType,
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(sampleSize !== undefined ? { sampleSize } : {}),
  };
}
function outcomeInput(input) {
  const body = object(input);
  onlyFields(body, ["publishedUrl", "publishedAt", "metrics", "notes"]);
  const supplied = object(body.metrics);
  onlyFields(supplied, ["views", "engagement", "leads"]);
  const metrics = Object.fromEntries(
    ["views", "engagement", "leads"].map((key) => [
      key,
      supplied[key] === undefined ? 0 : supplied[key],
    ]),
  );
  if (!validMetrics(metrics))
    fail(
      400,
      `Las métricas deben ser números finitos entre 0 y ${MAX_METRIC}.`,
    );
  const publishedUrl = publicLink(body.publishedUrl, "Enlace de publicación");
  let publishedAt;
  if (body.publishedAt !== undefined && body.publishedAt !== "") {
    if (
      typeof body.publishedAt !== "string" ||
      !Number.isFinite(Date.parse(body.publishedAt))
    )
      fail(400, "La fecha de publicación no es válida.");
    const time = Date.parse(body.publishedAt);
    if (time > Date.now() + 5 * 60_000 || time < Date.UTC(2000, 0, 1))
      fail(400, "Indica una publicación real con fecha pasada o actual.");
    publishedAt = new Date(time).toISOString();
  }
  return {
    metrics,
    ...(publishedUrl ? { publishedUrl } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    ...(body.notes !== undefined
      ? {
          notes: assertAggregateAudienceText(
            boundedText(body.notes, "Notas", 5000),
            "Notas",
          ),
        }
      : {}),
  };
}

export function createAudienceInsightsRouter() {
  const router = express.Router();
  router.use("/brands/:brandId", requireAuth, requireBrand);
  router.get("/brands/:brandId/insights", (req, res) =>
    res.json(buildInsights(req.brand)),
  );
  router.get("/brands/:brandId/audience-signals", (req, res) => {
    const valid = new Set(
      (req.brand.audience || []).map((segment) => segment.id),
    );
    res.json({
      signals: listRecords(req.brand.id, "audienceSignals").filter(
        (signal) => valid.has(signal.segmentId) && admissibleSignal(signal),
      ),
    });
  });
  router.post(
    "/brands/:brandId/audience-signals",
    requireEditor,
    (req, res) => {
      const signal = audienceSignalInput(req.brand, req.body);
      if (listRecords(req.brand.id, "audienceSignals").length >= 2000)
        fail(
          400,
          "Se alcanzó el límite de notas de audiencia de esta empresa.",
        );
      const saved = saveRecord(req.brand.id, "audienceSignals", signal);
      addActivity(
        req.brand.id,
        `${req.user.name} registró una ${signal.sourceType === "editorial" ? "hipótesis editorial" : "observación pública"} de audiencia sobre «${signal.topic}».`,
      );
      res.status(201).json(saved);
    },
  );
  router.delete(
    "/brands/:brandId/audience-signals/:id",
    requireEditor,
    (req, res) => {
      if (!deleteRecord(req.brand.id, "audienceSignals", req.params.id))
        fail(404, "No se encontró la nota de audiencia.");
      res.json({ ok: true });
    },
  );
  router.post(
    "/brands/:brandId/pieces/:pieceId/outcome",
    requireEditor,
    (req, res) => {
      const input = outcomeInput(req.body);
      db.exec("BEGIN IMMEDIATE");
      let saved;
      try {
        // Read the current piece inside the transaction; never use a cached/UI
        // version to revive an approval or overwrite editorial content.
        const piece = getRecord(req.brand.id, "pieces", req.params.pieceId);
        if (!piece) fail(404, "No se encontró la pieza en esta empresa.");
        if (!["approved", "scheduled", "published"].includes(piece.status))
          fail(
            409,
            "La pieza necesita estar aprobada antes de registrar su publicación.",
          );
        if (piece.isDemo)
          fail(
            409,
            "Una pieza de demostración no admite resultados reales. Crea y aprueba una pieza propia.",
          );
        const delivery = getSecret(req.brand.id, `publication:${piece.id}`);
        if (["sending", "uncertain"].includes(delivery?.status))
          fail(
            409,
            "Hay un envío pendiente de confirmar. Comprueba su estado antes de registrar resultados.",
          );
        const existing = listRecords(req.brand.id, "outcomes").find(
          (outcome) => outcome.pieceId === piece.id,
        );
        const publishedAt =
          input.publishedAt ||
          existing?.publishedAt ||
          piece.publishedAt ||
          new Date().toISOString();
        const publishedUrl =
          input.publishedUrl ||
          existing?.publishedUrl ||
          citationUrl(piece.publishedUrl);
        const notes = input.notes ?? aggregateOutcomeNotes(existing?.notes);
        saved = saveRecord(req.brand.id, "outcomes", {
          ...(existing ? { id: existing.id } : {}),
          pieceId: piece.id,
          channel: piece.channel,
          ...(piece.segmentId ? { segmentId: piece.segmentId } : {}),
          title: piece.title,
          ...(publishedUrl ? { publishedUrl } : {}),
          publishedAt,
          metrics: input.metrics,
          ...(notes !== undefined ? { notes } : {}),
          origin: "manual",
        });
        saveRecord(req.brand.id, "pieces", {
          ...piece,
          status: "published",
          publishedAt,
          ...(publishedUrl ? { publishedUrl } : {}),
          metrics: input.metrics,
          metricsOrigin: "manual",
          publicationOrigin: piece.publicationOrigin || "manual_record",
        });
        addActivity(
          req.brand.id,
          `${req.user.name} ${existing ? "corrigió" : "registró"} resultados manuales de «${piece.title}». No se envió contenido a una red.`,
        );
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      res.json(saved);
    },
  );
  return router;
}
