import { isRestrictedCollectionUrl } from "./access-policy.mjs";
import {
  canonicalPublicationUrl,
  deduplicateReferences,
} from "./reference-identity.mjs";

export const FORMAT_EVIDENCE_MIN_SAMPLE_SIZE = 3;
const FORMAT_NAMES = Object.freeze({
  post: "Post",
  carousel: "Carrusel",
  reel: "Reel",
  video: "Video",
  newsletter: "Newsletter",
  article: "Artículo",
  discussion: "Conversación",
  link: "Enlace",
  image: "Imagen",
});
const REFERENCE_FORMATS = new Set(Object.keys(FORMAT_NAMES));
const PIECE_FORMATS = new Set([
  "post",
  "carousel",
  "reel",
  "video",
  "newsletter",
]);
const CHANNELS = new Set(["linkedin", "instagram", "tiktok"]);
const METRICS = ["views", "engagement", "leads"];
const RESTRICTED = /\b(?:youtube|apify|reddit|telegram)\b/i;
const RESTRICTED_COLLECTION_PROVIDERS = new Set([
  "youtube",
  "apify",
  "reddit",
  "telegram",
  "instagram",
  "tiktok",
  "linkedin",
  "facebook",
  "threads",
  "twitter",
  "x",
  "pinterest",
  "snapchat",
  "discord",
]);
const MAX_METRIC = 1_000_000_000_000;
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
const id = (value) =>
  typeof value === "string" && /^[\w:-]{1,200}$/.test(value) ? value : null;
const time = (value) => {
  const result =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : typeof value === "string" && value.trim()
          ? Date.parse(value)
          : NaN;
  return Number.isFinite(result) ? result : null;
};
const keyFor = (...parts) => JSON.stringify(parts);
const compare = (a, b) =>
  String(JSON.stringify(a)).localeCompare(String(JSON.stringify(b)));
const scopeMismatch = (record, brand) =>
  record.brandId !== undefined && record.brandId !== brand.id;

function policyDenied(policy, now) {
  return (
    policy &&
    (policy.allowed !== true ||
      (policy.expiresAt !== undefined &&
        (time(policy.expiresAt) === null || time(policy.expiresAt) <= now)) ||
      (policy.reviewedAt !== undefined &&
        (time(policy.reviewedAt) === null || time(policy.reviewedAt) > now)))
  );
}

function youtubeUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    return (
      /(?:^|\.)(?:youtube\.com|youtu\.be|googlevideo\.com|ytimg\.com|youtube\.googleapis\.com)$/.test(
        host,
      ) ||
      (host === "www.googleapis.com" && url.pathname.startsWith("/youtube/"))
    );
  } catch {
    return false;
  }
}

function restricted(record, manualPublication = false) {
  if (!object(record)) return false;
  const providers = [
    record.ingestionProvider,
    record.metricsOrigin,
    record.mediaProvider,
    record.source,
    record.type,
    record.platform,
    record.channel,
    ...list(record.providerAttributions).flatMap((item) => [
      item?.id,
      item?.name,
    ]),
    ...list(record.editorialBrief?.providerAttributions).flatMap((item) => [
      item?.id,
      item?.name,
    ]),
  ];
  const urls = [
    record.url,
    record.sourceUrl,
    record.mediaUrl,
    record.editorialBrief?.referenceUrl,
    record.ingestionAccess?.url,
    ...list(record.ingestionAccess?.urls),
  ];
  return (
    record.ingestionRestricted === true ||
    [record.type, record.ingestionProvider].some(
      (provider) =>
        typeof provider === "string" &&
        RESTRICTED_COLLECTION_PROVIDERS.has(provider.toLowerCase()),
    ) ||
    (record.sourceId &&
      ["instagram", "tiktok", "reddit", "telegram"].includes(
        record.platform,
      )) ||
    (manualPublication
      ? youtubeUrl(record.publishedUrl)
      : isRestrictedCollectionUrl(record.publishedUrl)) ||
    providers.some((provider) =>
      typeof provider === "string" ? RESTRICTED.test(provider) : false,
    ) ||
    urls.some(isRestrictedCollectionUrl)
  );
}

function officialTrends(source) {
  try {
    const url = new URL(source.url);
    return (
      source.type === "rss" &&
      url.protocol === "https:" &&
      url.hostname === "trends.google.com" &&
      !url.port &&
      !url.username &&
      !url.password &&
      url.pathname === "/trending/rss" &&
      [...url.searchParams.keys()].every((key) => key === "geo") &&
      url.searchParams.getAll("geo").length === 1 &&
      /^[A-Z]{2}$/.test(url.searchParams.get("geo"))
    );
  } catch {
    return false;
  }
}

function referenceExclusion(reference, brand, sourceMap, now) {
  if (!object(reference) || !id(reference.id)) return "invalid_record";
  if (brand.isDemo || reference.isDemo) return "demo";
  if (scopeMismatch(reference, brand)) return "different_brand";
  if (
    restricted(reference) ||
    list(reference.evidence).some((item) => restricted(item))
  )
    return "restricted";
  if (policyDenied(reference.accessPolicy, now)) return "restricted";
  if (reference.originalUrlOmitted) return "unverified_provenance";
  const source = sourceMap.get(reference.sourceId);
  if (reference.sourceId && !source) return "missing_source";
  if (source) {
    if (source.isDemo) return "demo";
    if (scopeMismatch(source, brand)) return "different_brand";
    if (restricted(source) || policyDenied(source.accessPolicy, now))
      return "restricted";
    const approved =
      ["hackernews", "gdelt"].includes(source.type) ||
      officialTrends(source) ||
      (source.type === "rss" &&
        (source.accessPolicy?.allowed === true ||
          reference.accessPolicy?.allowed === true));
    if (!approved) return "unverified_policy";
  }
  // The caller supplies evaluated policy snapshots for collected web content.
  // No environment, permission file, DB, fetcher or AI is consulted here.
  if (
    reference.ingestionAccess &&
    reference.accessPolicy?.allowed !== true &&
    !officialTrends(source || {})
  )
    return "unverified_policy";
  if (reference.status === "dismissed") return "dismissed";
  return null;
}

function distribution(references, sourceMap) {
  const groups = new Map();
  for (const reference of references) {
    const source = sourceMap.get(reference.sourceId);
    const sourceType = source
      ? ["rss", "gdelt", "hackernews"].includes(source.type)
        ? source.type
        : "unknown"
      : reference.sourceId || reference.ingestionProvider
        ? "unknown"
        : "manual";
    // News coverage and search interest do not establish a social channel.
    const channel =
      sourceType === "manual" && CHANNELS.has(reference.platform)
        ? reference.platform
        : null;
    const format = REFERENCE_FORMATS.has(reference.format)
      ? reference.format
      : "unknown";
    const key = keyFor(sourceType, channel, format);
    const group = groups.get(key) || {
      sourceType,
      channel,
      format,
      sampleSize: 0,
      referenceIds: [],
    };
    group.sampleSize++;
    group.referenceIds.push(reference.id);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, referenceIds: group.referenceIds.sort() }))
    .sort(compare);
}

function measurement(outcome, now) {
  const published = time(outcome.publishedAt);
  const explicit = outcome.measuredAt !== undefined;
  const measured = time(
    explicit ? outcome.measuredAt : outcome.updatedAt || outcome.createdAt,
  );
  if (
    published === null ||
    measured === null ||
    measured <= published ||
    measured > now
  )
    return null;
  return {
    kind: explicit ? "measured_interval" : "recorded_interval",
    durationMs: measured - published,
  };
}

function outcomeExclusion(outcome, piece, brand, references, eligibleIds, now) {
  if (!object(outcome) || !id(outcome.id)) return "invalid_record";
  if (brand.isDemo || outcome.isDemo || piece?.isDemo) return "demo";
  if (scopeMismatch(outcome, brand) || (piece && scopeMismatch(piece, brand)))
    return "different_brand";
  if (outcome.origin !== "manual") return "not_manual";
  if (!piece || piece.status !== "published")
    return "unpublished_or_missing_piece";
  // A manually entered publication link never reads that network. YouTube is
  // still excluded entirely, including manually entered official counters.
  if (restricted(outcome, true) || restricted(piece, true)) return "restricted";
  const linkedIds = new Set([
    ...(piece.referenceId ? [piece.referenceId] : []),
    ...list(piece.referenceIds),
  ]);
  if (
    [...linkedIds].some(
      (referenceId) =>
        !references.has(referenceId) || !eligibleIds.has(referenceId),
    )
  )
    return "unverified_reference";
  if (
    !id(piece.segmentId) ||
    !list(brand.audience).some((segment) => segment?.id === piece.segmentId) ||
    outcome.segmentId !== piece.segmentId ||
    outcome.channel !== piece.channel ||
    !CHANNELS.has(piece.channel) ||
    !PIECE_FORMATS.has(piece.format) ||
    (outcome.format !== undefined && outcome.format !== piece.format) ||
    (piece.publishedAt !== undefined &&
      time(piece.publishedAt) !== time(outcome.publishedAt))
  )
    return "mismatched_dimensions";
  if (
    !METRICS.every(
      (metric) =>
        typeof outcome.metrics?.[metric] === "number" &&
        Number.isFinite(outcome.metrics[metric]) &&
        outcome.metrics[metric] >= 0 &&
        outcome.metrics[metric] <= MAX_METRIC,
    )
  )
    return "invalid_metrics";
  // The manual outcome schema stores counts. Never interpret an explicitly
  // supplied rate, percentage or other unit as one of those counts.
  if (
    METRICS.some((metric) =>
      [
        outcome.metricUnits?.[metric],
        outcome.metricsUnits?.[metric],
        outcome.metrics?.[metric + "Unit"],
      ].some((unit) => unit !== undefined && unit !== "count"),
    )
  )
    return "incompatible_metric_units";
  return measurement(outcome, now) ? null : "invalid_measurement_window";
}

function statistics(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    median:
      sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2,
    min: sorted[0],
    max: sorted.at(-1),
  };
}

const METRIC_NAMES = {
  views: "visualizaciones",
  engagement: "interacciones",
  leads: "leads",
};

// Input is the already validated, deduplicated manual groups from this module.
// Pairwise comparisons retain their exact audience, channel and elapsed window.
function compareFormatGroups(groups) {
  const buckets = new Map();
  for (const group of groups) {
    const key = keyFor(group.segmentId, group.channel, group.measurementWindow);
    const bucket = buckets.get(key) || [];
    bucket.push(group);
    buckets.set(key, bucket);
  }
  const comparisons = [];
  const findings = [];
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => a.format.localeCompare(b.format));
    const pairs = bucket.flatMap((a, index) =>
      bucket.slice(index + 1).map((b) => [a, b]),
    );
    if (!pairs.length) pairs.push([bucket[0]]);
    for (const pair of pairs) {
      const first = pair[0];
      const sufficient =
        pair.length === 2 &&
        pair.every((group) => group.status === "comparable");
      const warnings = [
        "Conteos manuales descriptivos; no acreditan significación estadística, causalidad ni resultados futuros.",
        "Las piezas pueden diferir en tema, distribución y fecha de publicación; no es un experimento controlado.",
      ];
      if (!sufficient)
        warnings.push(
          "Se requieren dos formatos con al menos 3 piezas distintas cada uno y fecha explícita de medición en el mismo segmento, canal e intervalo exacto.",
        );
      const metrics = Object.fromEntries(
        METRICS.map((metric) => {
          const samples = pair.map((group) => ({
            format: group.format,
            sampleSize: group.sampleSize,
            ...(group.metrics?.[metric] || {
              median: null,
              min: null,
              max: null,
            }),
          }));
          let status = "inconclusive";
          let winnerFormat = null;
          let medianDifference = null;
          if (sufficient) {
            const difference = samples[0].median - samples[1].median;
            medianDifference = Math.abs(difference);
            status = difference === 0 ? "neutral" : "winner";
            if (difference !== 0)
              winnerFormat = samples[difference > 0 ? 0 : 1].format;
            if (
              Math.max(samples[0].min, samples[1].min) <=
              Math.min(samples[0].max, samples[1].max)
            )
              warnings.push(
                `Los rangos observados de ${METRIC_NAMES[metric]} se solapan; la mediana no describe todas las piezas.`,
              );
          }
          return [
            metric,
            { status, winnerFormat, unit: "count", medianDifference, samples },
          ];
        }),
      );
      const comparison = {
        segmentId: first.segmentId,
        channel: first.channel,
        measurementWindow: first.measurementWindow,
        formats: pair.map((group) => group.format),
        status: sufficient ? "compared" : "inconclusive",
        metrics,
        warnings,
      };
      comparisons.push(comparison);
      for (const [metric, result] of Object.entries(metrics)) {
        if (result.status === "inconclusive") continue;
        const values = result.samples
          .map(
            (item) =>
              `${FORMAT_NAMES[item.format]}: mediana ${item.median}, rango ${item.min}–${item.max}, n=${item.sampleSize}`,
          )
          .join("; ");
        findings.push({
          title:
            result.status === "neutral"
              ? `Medianas iguales de ${METRIC_NAMES[metric]}`
              : `${FORMAT_NAMES[result.winnerFormat]}: mayor mediana de ${METRIC_NAMES[metric]}`,
          detail: `${first.channel}, segmento ${first.segmentId}, intervalo ${first.measurementWindow.durationMs / 3_600_000} h. ${values}. Comparación descriptiva de conteos manuales; no implica significación, causalidad ni predice resultados.`,
        });
      }
    }
  }
  return {
    comparisons: comparisons.sort(compare),
    findings: findings.sort(compare),
  };
}

/** Same input contract and policy checks as buildFormatEvidence. */
export function buildFormatComparison(brand, options = {}) {
  const evidence = buildFormatEvidence(brand, options);
  return {
    status: evidence.manualPerformance.comparisons.some(
      (item) => item.status === "compared",
    )
      ? "compared"
      : "inconclusive",
    comparisons: evidence.manualPerformance.comparisons,
    findings: evidence.findings,
    exclusions: evidence.exclusions,
  };
}

/**
 * Pure report for one brand; all arrays are supplied, never loaded implicitly.
 * Pass RAW references (including restricted records) and current, server-evaluated
 * `accessPolicy` snapshots on collected references/sources. Static restrictions
 * still win over supplied approvals. No network access is enabled by this report.
 *
 * Manual outcomes use the existing record fields plus optional `measuredAt`
 * (ISO/date/ms). Only explicit, equal elapsed publication-to-measurement intervals
 * qualify for comparison. updatedAt/createdAt intervals remain insufficient.
 * Three distinct published pieces per segment/channel/format/exact interval are
 * required for descriptive metrics; this threshold does not imply significance.
 * The result contains IDs/counts, never titles, URLs, free text or audience names.
 */
export function buildFormatEvidence(
  brand,
  {
    references = [],
    pieces = [],
    outcomes = [],
    sources = [],
    now = Date.now(),
  } = {},
) {
  const current = time(now);
  if (current === null || Math.abs(current) > 8.64e15)
    throw new TypeError("now debe ser una fecha válida.");
  const workspace = object(brand) ? brand : {};
  const sourceMap = new Map(
    list(sources)
      .filter(object)
      .map((item) => [item.id, item]),
  );
  const referenceMap = new Map(
    list(references)
      .filter(object)
      .map((item) => [item.id, item]),
  );
  const pieceMap = new Map(
    list(pieces)
      .filter(object)
      .map((item) => [item.id, item]),
  );
  const exclusions = { references: [], outcomes: [] };
  const admissible = [];
  for (const reference of list(references)) {
    const reason = referenceExclusion(reference, workspace, sourceMap, current);
    if (reason) exclusions.references.push({ id: id(reference?.id), reason });
    else admissible.push(reference);
  }
  const eligibleIds = new Set(admissible.map((reference) => reference.id));
  const unique = deduplicateReferences(admissible);
  const retained = new Set(unique);
  for (const reference of admissible)
    if (!retained.has(reference))
      exclusions.references.push({
        id: reference.id,
        reason: "duplicate_publication",
      });
  const observedGroups = distribution(unique, sourceMap);

  // A corrected record replaces the old measurement; versions are not samples.
  const latest = new Map();
  const ordered = list(outcomes)
    .filter(object)
    .slice()
    .sort(
      (a, b) =>
        (time(b.updatedAt || b.createdAt) ?? -Infinity) -
          (time(a.updatedAt || a.createdAt) ?? -Infinity) ||
        compare(a.id, b.id),
    );
  for (const outcome of ordered) {
    if (!id(outcome.pieceId)) {
      exclusions.outcomes.push({
        id: id(outcome.id),
        reason: "invalid_record",
      });
    } else if (latest.has(outcome.pieceId)) {
      exclusions.outcomes.push({
        id: id(outcome.id),
        reason: "duplicate_piece",
      });
    } else latest.set(outcome.pieceId, outcome);
  }
  const groups = new Map();
  const publications = new Set();
  for (const outcome of latest.values()) {
    const piece = pieceMap.get(outcome.pieceId);
    const reason = outcomeExclusion(
      outcome,
      piece,
      workspace,
      referenceMap,
      eligibleIds,
      current,
    );
    if (reason) {
      exclusions.outcomes.push({ id: id(outcome.id), reason });
      continue;
    }
    const publication = canonicalPublicationUrl(
      outcome.publishedUrl || piece.publishedUrl,
    );
    if (publication && publications.has(publication)) {
      exclusions.outcomes.push({
        id: outcome.id,
        reason: "duplicate_publication",
      });
      continue;
    }
    if (publication) publications.add(publication);
    const window = measurement(outcome, current);
    const key = keyFor(piece.segmentId, piece.channel, piece.format, window);
    const group = groups.get(key) || {
      segmentId: piece.segmentId,
      channel: piece.channel,
      format: piece.format,
      measurementWindow: window,
      records: [],
    };
    group.records.push(outcome);
    groups.set(key, group);
  }
  const manualGroups = [...groups.values()]
    .map(({ records, ...group }) => {
      const sampleSize = records.length;
      const comparable =
        sampleSize >= FORMAT_EVIDENCE_MIN_SAMPLE_SIZE &&
        group.measurementWindow.kind === "measured_interval";
      return {
        ...group,
        status: comparable ? "comparable" : "insufficient",
        sampleSize,
        minimumSampleSize: FORMAT_EVIDENCE_MIN_SAMPLE_SIZE,
        pieceIds: records.map((record) => record.pieceId).sort(),
        outcomeIds: records.map((record) => record.id).sort(),
        metrics: comparable
          ? Object.fromEntries(
              METRICS.map((metric) => [
                metric,
                statistics(records.map((record) => record.metrics[metric])),
              ]),
            )
          : null,
        reason:
          group.measurementWindow.kind === "recorded_interval"
            ? "La fecha de guardado sólo aproxima la ventana; falta una fecha explícita de medición."
            : comparable
              ? "Conteos manuales descriptivos de piezas del mismo segmento, canal, formato e intervalo exacto. La muestra mínima no acredita significación estadística."
              : `Hacen falta al menos ${FORMAT_EVIDENCE_MIN_SAMPLE_SIZE} piezas distintas del mismo segmento, canal, formato e intervalo exacto de medición.`,
      };
    })
    .sort(compare);
  const comparable = manualGroups.filter(
    (group) => group.status === "comparable",
  );
  const { comparisons, findings } = compareFormatGroups(manualGroups);
  const knownFormats = observedGroups.filter(
    (group) => group.format !== "unknown",
  );
  const recommendations = [
    ...knownFormats.map((group) => ({
      basis: "observed_distribution",
      status: "editorial_hypothesis",
      format: group.format,
      channel: group.channel,
      sourceType: group.sourceType,
      referenceIds: group.referenceIds,
      reason: `Formato ${FORMAT_NAMES[group.format]} registrado en ${group.sampleSize} referencias de esta muestra. Puede revisarse como opción editorial; su frecuencia no demuestra rendimiento.${group.channel === null ? " No se ha observado un canal social para estas referencias." : ""}`,
    })),
    ...comparable.map((group) => ({
      basis: "manual_comparable",
      status: "editorial_hypothesis",
      segmentId: group.segmentId,
      channel: group.channel,
      format: group.format,
      measurementWindow: group.measurementWindow,
      pieceIds: group.pieceIds,
      outcomeIds: group.outcomeIds,
      reason: `Revisar el formato ${FORMAT_NAMES[group.format]} para este segmento en ${group.channel}: hay ${group.sampleSize} piezas propias con conteos manuales y el mismo intervalo de medición. No establece una ventaja frente a otros formatos ni predice resultados.`,
    })),
  ];
  return {
    version: 1,
    generatedAt: new Date(current).toISOString(),
    status: comparable.length
      ? "comparable"
      : knownFormats.length
        ? "observed"
        : "insufficient",
    observed: {
      status: unique.length ? "observed" : "insufficient",
      sampleSize: unique.length,
      groups: observedGroups,
      reason: unique.length
        ? "Distribución de etiquetas de formato en referencias únicas. Los formatos no especificados se conservan; no equivale a éxito ni cobertura de una red."
        : "No hay referencias admisibles para observar formatos.",
    },
    manualPerformance: {
      status: comparable.length ? "comparable" : "insufficient",
      minimumSampleSize: FORMAT_EVIDENCE_MIN_SAMPLE_SIZE,
      groups: manualGroups,
      comparisons,
      reason: comparable.length
        ? "Comparaciones descriptivas por métrica entre formatos del mismo segmento, canal e intervalo exacto. Cada grupo conserva sus conteos; no se combinan redes ni se predicen resultados."
        : `Sin comparación manual suficiente: se requieren ${FORMAT_EVIDENCE_MIN_SAMPLE_SIZE} piezas distintas por segmento, canal, formato e intervalo exacto, con fecha explícita de medición.`,
    },
    findings,
    recommendations,
    exclusions: {
      references: exclusions.references.sort(compare),
      outcomes: exclusions.outcomes.sort(compare),
    },
    limitations: [
      "Las recomendaciones son hipótesis editoriales con su fundamento, no porcentajes de éxito, causalidad ni generalizaciones.",
      "HN y GDELT aportan referencias; Trends aporta interés de búsqueda. No equivalen a observaciones de redes sociales.",
      "Los datos de YouTube y sus derivados quedan fuera de este informe; su consulta oficial pertenece a social-sync.",
    ],
  };
}
