import express from "express";
import { listRecords } from "./db.mjs";
import { requireAuth, requireBrand } from "./core.mjs";
import { referenceUsePolicy, sourceAccessPolicy } from "./access-policy.mjs";
import { inspectPublicContentText } from "./content-privacy.mjs";
import { buildInsights } from "./audience-insights.mjs";
import { selectResearchCorpus } from "./research-corpus.mjs";
import { buildDiscoveryCoverage } from "./discovery-coverage.mjs";
import { buildTrendEvidence } from "./trend-evidence.mjs";
import { buildFormatEvidence } from "./format-evidence.mjs";
import { socialConnections } from "./social-sync.mjs";
import { listCurrentEditorialEvidence } from "./editorial-evidence.mjs";
import {
  listOpportunityFeedback,
  summarizeOpportunityFeedback,
} from "./opportunity-feedback.mjs";
import { getPilotEvaluationReport } from "./pilot-evaluation.mjs";

const formatNames = {
  post: "Post",
  carousel: "Carrusel",
  reel: "Reel",
  video: "Video",
  newsletter: "Boletín",
  article: "Artículo",
  unknown: "Sin formato indicado",
};
const networkNames = {
  hackernews: "Hacker News",
  gdelt: "GDELT",
  google_trends: "Google Trends",
  supplied: "Material del equipo",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
};
const finding = (title, detail) => ({ title, detail });
const publicText = (value) =>
  inspectPublicContentText(JSON.stringify(value)).allowed;

function annotatedOpportunity(opportunity, evidence) {
  const primary = evidence.find(
    (item) => item.referenceId === opportunity.referenceIds[0],
  );
  if (!primary) return opportunity;
  return {
    ...opportunity,
    factors: opportunity.factors.map((factor) => {
      const observation = primary.observations.find(
        (item) => item.factor === factor.factor,
      );
      if (!observation) return factor;
      const support =
        observation.support.kind === "text"
          ? `Cita literal: «${observation.support.quote}».`
          : `Intervalo indicado por el equipo: ${observation.support.startSeconds}–${observation.support.endSeconds ?? observation.support.startSeconds} s.`;
      return {
        ...factor,
        observation: `Observación manual del equipo: ${observation.observation} ${support}`,
        limitation: `${observation.uncertainty}${observation.possibleHypothesis ? ` Hipótesis para probar: ${observation.possibleHypothesis}.` : ""} No establece causalidad.`,
      };
    }),
  };
}

/** Company-scoped, read-only composition. Opening a report never starts an
 * external search, model request, publication or paid generation. */
export function buildResearchReport(
  brand,
  {
    references = [],
    sources = [],
    pieces = [],
    outcomes = [],
    snapshots = [],
    signals = [],
    analyses = [],
    feedback = [],
    editorialEvidence = [],
    pilotReport = null,
    connections = {},
    now = Date.now(),
  } = {},
) {
  const permitted = references.filter(
    (reference) =>
      referenceUsePolicy(
        reference,
        sources.find((source) => source.id === reference.sourceId),
      ).allowed,
  );
  // Old records are preserved in storage, but excluded from this public
  // editorial report when supported contact/credential patterns are present.
  const safeReferences = permitted.filter(publicText);
  const corpus = selectResearchCorpus(brand, {
    references: safeReferences,
    sources,
    now,
  });
  const policySources = sources.map((source) => ({
    ...source,
    accessPolicy: sourceAccessPolicy(source),
  }));
  const policyReferences = corpus.references.map((reference) => ({
    ...reference,
    accessPolicy: referenceUsePolicy(
      reference,
      sources.find((source) => source.id === reference.sourceId),
    ),
  }));
  const insights = buildInsights(brand, {
    references: corpus.references,
    sources,
    pieces,
    outcomes,
    snapshots,
    signals,
    analyses,
    now,
  });
  const coverage = buildDiscoveryCoverage(brand, {
    references: references.map((reference) => ({
      ...reference,
      accessPolicy: referenceUsePolicy(
        reference,
        sources.find((source) => source.id === reference.sourceId),
      ),
    })),
    sources: policySources,
    socialConnections: connections,
    now,
  });
  // Pass original source objects into the historical scope hash: evaluated
  // permission metadata is not part of the persisted query configuration.
  const trendSources = sources.filter(
    (source) =>
      sourceAccessPolicy(source).allowed && !source.lastPrivacySkipped,
  );
  const trends = buildTrendEvidence(brand, {
    references: safeReferences,
    sources: trendSources,
    snapshots,
    now,
  });
  const formats = buildFormatEvidence(brand, {
    references: policyReferences,
    sources: policySources,
    pieces: pieces.filter(publicText),
    outcomes,
    now,
  });
  const validation = summarizeOpportunityFeedback(brand, {
    feedback,
    references: safeReferences,
    sources,
    signals,
    pieces,
    outcomes,
    snapshots,
  });
  const safeEvidence = editorialEvidence.filter(publicText);
  const audienceIds = new Set(
    (brand.audience || []).map((segment) => segment.id).filter(Boolean),
  );
  // Corpus coverage includes all available material; priority requires a
  // match to a currently declared audience before applying the report limit.
  const opportunities = insights.opportunities
    .filter((opportunity) =>
      opportunity.segmentIds.some((id) => audienceIds.has(id)),
    )
    .slice(0, 10)
    .map((opportunity) => {
      const result = annotatedOpportunity(opportunity, safeEvidence);
      return {
        ...result,
        evidence: result.evidence.map((item) => {
          const reference = corpus.references.find(
            (candidate) => candidate.id === item.referenceId,
          );
          return {
            ...item,
            detail: `${item.detail} ${reference?.reportTiming.basis === "publication" ? "Fecha de publicación" : "Fecha de observación; publicación no fechada"}: ${reference?.reportTiming.at || "no disponible"}.`,
          };
        }),
      };
    });
  const networks = coverage.networks.filter(
    (network) =>
      network.configuredSources ||
      network.counts.uniqueReferences ||
      network.kind === "social",
  );
  const latestPilot = pilotReport?.evaluations?.[0];
  const pilotFindings = latestPilot
    ? [
        finding(
          "Registro manual del piloto",
          `${latestPilot.period.start} a ${latestPilot.period.end}. ${latestPilot.editorialMinutes === null ? "Tiempo sin registrar" : `${latestPilot.editorialMinutes} minutos editoriales`}. ${latestPilot.actualCost.amount === null ? "Costo sin registrar" : `Costo declarado: ${latestPilot.actualCost.amount} ${latestPilot.actualCost.currency}`}.`,
        ),
        finding(
          "Utilidad declarada",
          `${latestPilot.results.reviewed ?? "Sin dato"} referencias revisadas; ${latestPilot.results.useful ?? "sin dato"} útiles; ${latestPilot.results.accepted ?? "sin dato"} aceptadas.`,
        ),
        finding("Comparación", latestPilot.summary.comparison.notice),
      ]
    : [
        finding(
          "Piloto pendiente",
          "No hay una medición de costo, tiempo y utilidad registrada para esta empresa.",
        ),
      ];
  return {
    version: 1,
    generatedAt: new Date(now).toISOString(),
    isDemo: corpus.isDemo,
    stale: false,
    scope: {
      company: brand.name,
      market: brand.market,
      period: corpus.period,
      counts: {
        selected: corpus.counts.selected,
        publicationDated: corpus.counts.publicationDated,
        observationDated: corpus.counts.observationDated,
        duplicates: corpus.counts.duplicates,
        privacyExcluded: permitted.length - safeReferences.length,
      },
      question:
        "¿Qué temas del material público disponible conviene adaptar para nuestra audiencia?",
      excluded: corpus.counts.excluded,
      ordering: "editorial_relevance",
    },
    coverage: {
      references: corpus.references.length,
      sources: coverage.summary.configuredSources,
      activeSources: coverage.summary.enabledSources,
      errors: coverage.errors.map((item) => item.message),
      notes: [
        ...networks.map(
          (network) =>
            `${network.name}: ${network.kind === "social" ? (network.officialConnection?.ready && network.id === "youtube" ? "catálogo y contadores oficiales disponibles por separado; análisis editorial no habilitado" : "sin acceso editorial conectado") : `${network.counts.uniqueReferences} referencias únicas guardadas; ${network.verifiedSources} fuentes con sincronización verificada`}.`,
        ),
        ...(corpus.counts.observationDated
          ? [
              `${corpus.counts.observationDated} referencias tienen fecha de observación; no fecha de publicación.`,
            ]
          : []),
        ...(permitted.length !== safeReferences.length
          ? [
              "Se excluyó material con posibles contactos, identificadores o credenciales.",
            ]
          : []),
      ],
    },
    trends: [
      finding("Historial comparable", trends.summary),
      ...trends.topics
        .slice(0, 10)
        .map((topic) => finding(topic.topic, topic.explanation)),
    ],
    formats: [
      finding("Formatos observados", formats.observed.reason),
      ...formats.observed.groups.map((group) =>
        finding(
          `${formatNames[group.format] || "Sin formato indicado"} · ${group.channel ? networkNames[group.channel] : group.sourceType === "manual" ? "material del equipo" : networkNames[group.sourceType] || "fuente pública"}`,
          `${group.sampleSize} referencias. Es distribución de etiquetas, no rendimiento.`,
        ),
      ),
      finding(
        "Resultados propios comparables",
        formats.manualPerformance.reason,
      ),
      ...formats.recommendations
        .slice(0, 5)
        .map((recommendation) =>
          finding(
            formatNames[recommendation.format] || "Recomendación editorial",
            recommendation.reason,
          ),
        ),
    ],
    opportunities,
    validation: [
      finding(
        "Decisiones del equipo",
        `${validation.decisions.accepted} aceptadas; ${validation.decisions.rejected} descartadas; ${validation.decisions.needs_evidence} necesitan evidencia. ${validation.stale} decisiones requieren revisión por cambios de contexto o fuentes.`,
      ),
      finding("Alcance de la validación", validation.notice),
    ],
    pilot: pilotFindings,
    // Stable machine-readable evidence accompanies the concise UI/export.
    evidence: {
      coverage,
      trends,
      formats,
      validation,
      ...(pilotReport ? { pilot: pilotReport } : {}),
      editorial: safeEvidence.filter((item) =>
        corpus.references.some(
          (reference) => reference.id === item.referenceId,
        ),
      ),
    },
  };
}

export function createResearchReportRouter({ clock = Date.now } = {}) {
  const router = express.Router();
  router.get(
    "/brands/:brandId/research-report",
    requireAuth,
    requireBrand,
    (req, res) => {
      const brandId = req.brand.id;
      const records = (kind) => listRecords(brandId, kind);
      const report = buildResearchReport(req.brand, {
        references: records("references"),
        sources: records("sources"),
        pieces: records("pieces"),
        outcomes: records("outcomes"),
        snapshots: records("topicSnapshots"),
        signals: records("audienceSignals"),
        analyses: records("opportunityAnalyses"),
        feedback: listOpportunityFeedback(brandId),
        editorialEvidence: listCurrentEditorialEvidence(brandId),
        connections: socialConnections(brandId),
        pilotReport:
          req.membership.role === "reviewer"
            ? null
            : getPilotEvaluationReport(brandId),
        now: clock(),
      });
      res.set("Cache-Control", "no-store").json(report);
    },
  );
  return router;
}
