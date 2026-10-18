import { createHash } from "node:crypto";
import { isRestrictedCollectionUrl } from "./access-policy.mjs";
import { assertAggregateAudienceText } from "./aggregate-privacy.mjs";
import {
  deduplicateReferences,
  REFERENCE_IDENTITY_VERSION,
} from "./reference-identity.mjs";

const DAY = 86_400_000;
export const TREND_EVIDENCE_WINDOW_MS = 7 * DAY;
export const TREND_EVIDENCE_FRESHNESS_MS = 2 * DAY;
const WEEK = TREND_EVIDENCE_WINDOW_MS;
const FRESHNESS = TREND_EVIDENCE_FRESHNESS_MS;
const MIN_TOPIC_SAMPLE = 3;
const SOURCE_TYPES = new Set(["hackernews", "gdelt", "rss"]);
const RESTRICTED_PROVIDERS =
  /\b(?:youtube|apify|instagram|tiktok|reddit|telegram|linkedin|twitter)\b/i;
const TRANSIENT_SOURCE_FIELDS = new Set([
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
const STOP_WORDS = new Set(
  "a al algo ante bajo como con contra cual cuando de del desde donde el ella ellas ellos en entre era es esa ese eso esta estas este esto estos ha hacia hasta hay la las lo los mas me mi mis mucho muy no nos o otra otro para pero por porque que quien se ser si sin sobre son su sus te tiene todo tu un una unas uno unos y ya how the with from your this that into more use are for what why can you their its our was were have has will not and".split(
    " ",
  ),
);
const EQUIVALENTS = [
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
const clean = (value) => (typeof value === "string" ? value.trim() : "");
const normalize = (value) =>
  clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const topicKey = (value) =>
  normalize(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
const iso = (value) => new Date(value).toISOString();
function timestamp(value) {
  const time =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : typeof value === "string" && value
          ? Date.parse(value)
          : NaN;
  return Number.isFinite(time) && Math.abs(time) <= 8.64e15 ? time : null;
}
const list = (value) =>
  Array.isArray(value)
    ? value.filter((item) => item && typeof item === "object")
    : [];
const belongsTo = (item, brand) => !item.brandId || item.brandId === brand.id;
function safeTopic(value) {
  const topic = clean(value);
  try {
    assertAggregateAudienceText(topic);
    return topic.slice(0, 160);
  } catch {
    return "";
  }
}
function terms(value) {
  const normalized = normalize(value);
  const words = [...new Set(normalized.match(/[a-z0-9]{2,}/g) || [])].filter(
    (word) => !STOP_WORDS.has(word),
  );
  for (const [pattern, concept] of EQUIVALENTS)
    if (pattern.test(normalized)) words.push(concept);
  return words;
}
function topicFor(reference, brand) {
  if (clean(reference.topic)) return safeTopic(reference.topic);
  const content = new Set(
    terms(
      `${clean(reference.title)} ${clean(reference.text)} ${(Array.isArray(reference.tags) ? reference.tags : []).join(" ")}`,
    ),
  );
  const pillar = (brand.pillars || [])
    .map((name) => ({
      name,
      count: terms(name).filter((word) => content.has(word)).length,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))[0];
  return safeTopic(
    pillar?.name || reference.title || "Contenido pendiente de clasificar",
  );
}

/** Compatible with recordTopicObservation's persisted v1 scope. Keep the
 * source fingerprint and identity version aligned with audience-insights.mjs.
 * Sources must be the successful, enabled sources for this observation.
 */
export function trendObservationScope(brand, sources) {
  return digest({
    version: 1,
    publicationIdentityVersion: REFERENCE_IDENTITY_VERSION,
    pillars: brand.pillars || [],
    sources: sources
      .map((source) => [
        source.id,
        digest(
          Object.fromEntries(
            Object.keys(source)
              .sort()
              .filter((key) => !TRANSIENT_SOURCE_FIELDS.has(key))
              .map((key) => [key, source[key]]),
          ),
        ),
      ])
      .sort((a, b) => a[0].localeCompare(b[0])),
  });
}

function admissibleSource(source, brand) {
  return (
    belongsTo(source, brand) &&
    !source.isDemo &&
    source.enabled === true &&
    clean(source.id) &&
    SOURCE_TYPES.has(source.type) &&
    !RESTRICTED_PROVIDERS.test(clean(source.platform)) &&
    !isRestrictedCollectionUrl(source.url)
  );
}
function admissibleReference(reference, brand, ids) {
  return (
    belongsTo(reference, brand) &&
    !reference.isDemo &&
    !reference.ingestionRestricted &&
    ids.has(reference.sourceId) &&
    !RESTRICTED_PROVIDERS.test(
      [
        reference.platform,
        reference.ingestionProvider,
        reference.mediaProvider,
        reference.metricsOrigin,
        reference.source,
      ].join(" "),
    ) &&
    ![
      reference.url,
      reference.sourceUrl,
      reference.ingestionAccess?.url,
      ...(Array.isArray(reference.ingestionAccess?.urls)
        ? reference.ingestionAccess.urls
        : []),
    ].some(isRestrictedCollectionUrl)
  );
}
function validSnapshot(snapshot, brand, now) {
  const end = timestamp(snapshot.observedAt);
  const start = timestamp(snapshot.windowStart);
  if (
    !belongsTo(snapshot, brand) ||
    snapshot.isDemo ||
    snapshot.origin !== "public_source_observation" ||
    !/^[a-f0-9]{24}$/.test(snapshot.scope) ||
    snapshot.windowMs !== WEEK ||
    end === null ||
    start === null ||
    start !== end - WEEK ||
    end > now ||
    !Array.isArray(snapshot.sourceIds) ||
    !snapshot.sourceIds.length ||
    snapshot.sourceIds.some((id) => typeof id !== "string" || !id.trim()) ||
    new Set(snapshot.sourceIds).size !== snapshot.sourceIds.length ||
    !snapshot.counts ||
    typeof snapshot.counts !== "object" ||
    Array.isArray(snapshot.counts) ||
    !Number.isSafeInteger(snapshot.sampleSize) ||
    snapshot.sampleSize < 0
  )
    return false;
  const entries = Object.entries(snapshot.counts);
  if (
    entries.some(
      ([key, count]) =>
        topicKey(key) !== key ||
        (!safeTopic(key) && key !== "") ||
        !Number.isSafeInteger(count) ||
        count < 0,
    )
  )
    return false;
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  return Number.isSafeInteger(total) && total === snapshot.sampleSize;
}
function snapshotHistory(snapshots, brand, now) {
  const days = new Map();
  let rejected = 0;
  for (const snapshot of snapshots) {
    if (!validSnapshot(snapshot, brand, now)) {
      rejected++;
      continue;
    }
    const key = `${snapshot.scope}:${iso(timestamp(snapshot.observedAt)).slice(0, 10)}`;
    const group = days.get(key) || [];
    group.push(snapshot);
    days.set(key, group);
  }
  const history = [];
  let duplicates = 0;
  for (const group of days.values()) {
    group.sort((a, b) => timestamp(b.observedAt) - timestamp(a.observedAt));
    const latest = group[0];
    const signature = (item) =>
      digest([
        [...item.sourceIds].sort(),
        Object.entries(item.counts).sort(),
        item.sampleSize,
      ]);
    if (
      group.some(
        (item) =>
          timestamp(item.observedAt) === timestamp(latest.observedAt) &&
          signature(item) !== signature(latest),
      )
    ) {
      rejected += group.length;
      continue;
    }
    duplicates += group.length - 1;
    history.push(latest);
  }
  history.sort(
    (a, b) =>
      timestamp(b.observedAt) - timestamp(a.observedAt) ||
      a.scope.localeCompare(b.scope),
  );
  return { history, rejected, duplicates };
}
function windowMetadata(snapshot) {
  return {
    observedAt: iso(timestamp(snapshot.observedAt)),
    windowStart: iso(timestamp(snapshot.windowStart)),
    windowEnd: iso(timestamp(snapshot.observedAt)),
    windowMs: WEEK,
    sourceIds: [...snapshot.sourceIds].sort(),
    sampleSize: snapshot.sampleSize,
  };
}
const countFor = (snapshot, key) =>
  Object.hasOwn(snapshot.counts, key) ? snapshot.counts[key] : 0;

/**
 * Pure report builder: no database, network, provider calls, credentials or
 * permission-file reads. `now` accepts milliseconds, a Date or an ISO string;
 * passing it makes the result deterministic. Invalid explicit dates throw.
 *
 * The caller supplies one brand's permission-filtered public references and
 * sources (apply referenceUsePolicy/sourceAccessPolicy before calling). This
 * module additionally excludes demo, restricted and YouTube material. RSS
 * permissions cannot be inferred from a URL or from a stored snapshot.
 *
 * Returns { version, kind, generatedAt, status, flags, summary, scope,
 * currentWindow, comparison, topics, coverage, limitations }. `status` is
 * comparable | insufficient | stale | source-change; flags may contain several
 * blockers. `comparison` and topic absoluteChange/previousCount are null until
 * two equal-scope, seven-day windows are 7–9 days apart and the latest is at
 * most two days old. Topic novelty
 * is bounded to the supplied comparable history, never a global trend.
 */
export function buildTrendEvidence(
  brand,
  { references = [], sources = [], snapshots = [], now = Date.now() } = {},
) {
  const time = timestamp(now);
  if (time === null) throw new TypeError("now debe ser una fecha válida.");
  const configured = list(sources).filter((source) =>
    admissibleSource(source, brand),
  );
  const usable = [
    ...new Map(
      configured
        .filter((source) => !source.lastError)
        .map((source) => [source.id, source]),
    ).values(),
  ];
  const sourceIds = usable.map((source) => source.id).sort();
  const ids = new Set(sourceIds);
  const scope = trendObservationScope(brand, usable);
  // discoveryQuery falls back to brand.industry without a first pillar. The
  // persisted v1 scope does not include that field, so it cannot prove that
  // such historical queries match the current query.
  const queryVerifiable = usable.every(
    (source) =>
      source.type === "rss" || clean(source.query) || clean(brand.pillars?.[0]),
  );
  const eligible = brand.isDemo
    ? []
    : list(references).filter((reference) =>
        admissibleReference(reference, brand, ids),
      );
  const corpus = deduplicateReferences(eligible);
  const { history, rejected, duplicates } = snapshotHistory(
    brand.isDemo ? [] : list(snapshots),
    brand,
    time,
  );
  const matching = sourceIds.length
    ? history.filter(
        (snapshot) =>
          snapshot.scope === scope &&
          JSON.stringify([...snapshot.sourceIds].sort()) ===
            JSON.stringify(sourceIds),
      )
    : [];
  const latest = matching[0];
  const previous =
    latest &&
    matching.find((snapshot) => {
      const gap = timestamp(latest.observedAt) - timestamp(snapshot.observedAt);
      return gap >= WEEK && gap <= WEEK + FRESHNESS;
    });
  const lastKnown = latest || history[0];
  const stale =
    !!lastKnown &&
    (time - timestamp(lastKnown.observedAt) > FRESHNESS ||
      (!!latest &&
        !previous &&
        matching.some(
          (snapshot) =>
            timestamp(latest.observedAt) - timestamp(snapshot.observedAt) >
            WEEK + FRESHNESS,
        )));
  const comparable = !!previous && !stale && queryVerifiable;
  const sourceChanged =
    !comparable &&
    history.some(
      (snapshot) =>
        snapshot.scope !== scope ||
        JSON.stringify([...snapshot.sourceIds].sort()) !==
          JSON.stringify(sourceIds),
    );
  const flags = [
    ...(!comparable ? ["insufficient"] : []),
    ...(stale ? ["stale"] : []),
    ...(sourceChanged ? ["source-change"] : []),
    ...(!queryVerifiable ? ["query-unverifiable"] : []),
  ];
  const windowEnd = latest ? timestamp(latest.observedAt) : time;
  const counts = new Map();
  const labels = new Map(
    (brand.pillars || []).map((topic) => [topicKey(topic), safeTopic(topic)]),
  );
  let undated = 0,
    invalidDates = 0,
    futureDates = 0,
    inWindow = 0;
  for (const reference of corpus) {
    const topic = topicFor(reference, brand);
    const key = topicKey(topic);
    if (topic && !labels.get(key)) labels.set(key, topic);
    const published = timestamp(reference.publishedAt);
    if (!reference.publishedAt) undated++;
    else if (published === null) invalidDates++;
    else if (published > time) futureDates++;
    if (
      published === null ||
      published <= windowEnd - WEEK ||
      published > windowEnd
    )
      continue;
    inWindow++;
    if (topic) counts.set(key, (counts.get(key) || 0) + 1);
  }
  const currentCounts = latest
    ? new Map(Object.entries(latest.counts))
    : counts;
  const priorHistory = comparable
    ? matching.filter(
        (snapshot) =>
          timestamp(snapshot.observedAt) <= timestamp(previous.observedAt),
      )
    : [];
  const keys = new Set([
    ...currentCounts.keys(),
    ...(comparable ? Object.keys(previous.counts) : []),
  ]);
  const topics = [...keys].sort().map((key) => {
    const current = currentCounts.get(key) || 0;
    const before = comparable ? countFor(previous, key) : null;
    const change = comparable ? current - before : null;
    const seenBefore = priorHistory.some(
      (snapshot) => countFor(snapshot, key) > 0,
    );
    const novelty = !comparable
      ? "insufficient"
      : current === 0
        ? "absent_in_current_window"
        : before > 0
          ? "previously_observed"
          : seenBefore
            ? "reappeared"
            : "first_in_comparable_history";
    const topicFlags = comparable
      ? [
          ...(before === 0 ? ["zero-base"] : []),
          ...(current < MIN_TOPIC_SAMPLE || before < MIN_TOPIC_SAMPLE
            ? ["small-sample"]
            : []),
        ]
      : ["insufficient"];
    return {
      topicKey: key,
      topic: labels.get(key) || key || "Contenido pendiente de clasificar",
      currentCount: current,
      previousCount: before,
      absoluteChange: change,
      direction: !comparable
        ? "insufficient"
        : change > 0
          ? "increased"
          : change < 0
            ? "decreased"
            : "stable",
      novelty,
      flags: topicFlags,
      explanation: !comparable
        ? `${current} referencias fechadas en la ventana observada; falta historial comparable para estimar cambio o novedad.`
        : `${current} referencias frente a ${before}; cambio absoluto ${change > 0 ? "+" : ""}${change} en este corpus.${before === 0 ? " Base anterior cero: no se calcula un porcentaje de crecimiento." : ""}${topicFlags.includes("small-sample") ? " Muestra pequeña: alguna ventana tiene menos de 3 referencias del tema; verificar en próximas observaciones." : ""}${novelty === "first_in_comparable_history" ? ` Primera aparición en las ${priorHistory.length} observaciones previas comparables aportadas; no demuestra novedad fuera de este historial.` : novelty === "reappeared" ? " El tema ya apareció en ventanas anteriores de este corpus." : ""}`,
    };
  });
  const currentWindow = latest
    ? windowMetadata(latest)
    : {
        observedAt: null,
        windowStart: iso(time - WEEK),
        windowEnd: iso(time),
        windowMs: WEEK,
        sourceIds,
        sampleSize: inWindow,
      };
  const status = comparable
    ? "comparable"
    : sourceChanged
      ? "source-change"
      : stale
        ? "stale"
        : "insufficient";
  return {
    version: 1,
    kind: "observed_corpus_frequency",
    generatedAt: iso(time),
    status,
    flags,
    summary: comparable
      ? `Se comparan dos ventanas de 7 días de las mismas ${sourceIds.length} fuentes y consultas; cambios de frecuencia dentro del corpus observado.`
      : `${sourceChanged ? "El historial contiene otro alcance de consultas o fuentes. " : ""}${stale ? "El historial está desactualizado. " : ""}${!queryVerifiable ? "El alcance guardado no permite verificar la consulta implícita basada en el sector. " : ""}Faltan dos ventanas comparables de 7 días, separadas entre 7 y 9 días, con la última observación de hace 2 días o menos.`,
    scope: {
      fingerprint: scope,
      sourceIds,
      identityVersion: REFERENCE_IDENTITY_VERSION,
      windowMs: WEEK,
      queryVerifiable,
    },
    countOrigin: latest ? "topic_snapshot" : "current_corpus",
    currentWindow,
    comparison: comparable
      ? {
          current: currentWindow,
          previous: windowMetadata(previous),
          separationMs: windowEnd - timestamp(previous.observedAt),
          gapMs: windowEnd - timestamp(previous.observedAt) - WEEK,
        }
      : null,
    topics,
    coverage: {
      inputReferences: list(references).length,
      eligibleReferences: eligible.length,
      uniqueReferences: corpus.length,
      duplicateReferences: eligible.length - corpus.length,
      datedReferences: corpus.length - undated - invalidDates - futureDates,
      undatedReferences: undated,
      invalidDateReferences: invalidDates,
      futureDatedReferences: futureDates,
      currentWindowReferences: inWindow,
      configuredSources: configured.length,
      observedSources: sourceIds.length,
      erroredSourceIds: [
        ...new Set(
          configured
            .filter((source) => source.lastError)
            .map((source) => source.id),
        ),
      ].sort(),
      inputSnapshots: list(snapshots).length,
      validSnapshots: history.length,
      matchingSnapshots: matching.length,
      duplicateSnapshots: duplicates,
      rejectedSnapshots: rejected,
      noveltyHistoryWindows: priorHistory.length,
      isDemo: brand.isDemo === true,
    },
    limitations: [
      "Frecuencia de referencias únicas y fechadas en las fuentes consultadas; no mide alcance, rendimiento, causalidad ni tendencias globales o de redes sociales.",
      "HN, GDELT y Google Trends aportan señales distintas; su presencia en el corpus no equivale a crecimiento en una red ni a volumen de interés de búsqueda.",
      "Las ventanas usan fechas de publicación; firstSeenAt, createdAt y los contadores nativos no sustituyen esa fecha. Un cero observado no prueba ausencia fuera de la muestra.",
      "La novedad se limita al historial comparable aportado. Los fallos, límites de consulta y cambios de clasificación pueden alterar la muestra.",
      ...(!queryVerifiable
        ? [
            "El alcance v1 no guarda el sector usado en consultas implícitas sin pilares. Configura una consulta explícita o un pilar y reúne nuevas ventanas comparables.",
          ]
        : []),
      ...(brand.isDemo
        ? ["Los ejemplos de demostración no constituyen evidencia real."]
        : []),
    ],
  };
}
