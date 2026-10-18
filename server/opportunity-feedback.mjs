import express from "express";
import { createHash } from "node:crypto";
import { listRecords, saveRecord } from "./db.mjs";
import { requireAuth, requireBrand, requireEditor } from "./core.mjs";
import { buildInsights } from "./audience-insights.mjs";
import { ACCESS_POLICY_VERSION, referenceUsePolicy } from "./access-policy.mjs";
import { assertAggregateAudienceText } from "./aggregate-privacy.mjs";
import {
  isYouTubeReference,
  opportunityFingerprint,
} from "./opportunity-fingerprint.mjs";

const KIND = "opportunityFeedback";
const DECISIONS = ["accepted", "rejected", "needs_evidence"];
const NOTICE =
  "Validación editorial del equipo sobre necesidades declaradas y evidencia disponible. No representa respuestas de consumidores, resultados observados ni probabilidad de éxito.";

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function identifier(value, label) {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(value)
  )
    fail(400, `${label} no es válido.`);
  return value;
}

function aggregateNote(value) {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > 1000)
    fail(400, "La nota editorial debe tener hasta 1000 caracteres.");
  const note = value.normalize("NFKC").trim();
  if (
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]|<[^>]*>|https?:\/\/|www\.|mailto:|tel:|(?:^|\s)@[\w.-]+/i.test(
      note,
    ) ||
    /\b(?:direcci[oó]n|domicilio|dni|c[eé]dula|pasaporte|ssn|fecha de nacimiento)\s*[:=]|\b(?:sk-[\w-]{12,}|Bearer\s+\S+|(?:api[_ -]?key|token|password|contrase[nñ]a|secret|cookie|authorization)\s*[:=]\s*\S+)/i.test(
      note,
    )
  )
    fail(
      400,
      "La nota debe ser agregada, sin datos de personas, enlaces, credenciales ni HTML.",
    );
  return assertAggregateAudienceText(note, "Nota editorial");
}

function inputFor(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (key) =>
        ![
          "opportunityId",
          "referenceIds",
          "segmentId",
          "decision",
          "note",
        ].includes(key),
    )
  )
    fail(
      400,
      "Envía únicamente los campos del feedback editorial, sin datos personales.",
    );
  const opportunityId = identifier(body.opportunityId, "La oportunidad");
  const segmentId = identifier(body.segmentId, "El segmento");
  if (!DECISIONS.includes(body.decision))
    fail(400, "La decisión debe ser accepted, rejected o needs_evidence.");
  if (
    !Array.isArray(body.referenceIds) ||
    !body.referenceIds.length ||
    body.referenceIds.length > 100 ||
    new Set(body.referenceIds).size !== body.referenceIds.length
  )
    fail(
      400,
      "Selecciona entre 1 y 100 referencias distintas de la oportunidad.",
    );
  return {
    opportunityId,
    referenceIds: body.referenceIds
      .map((id) => identifier(id, "La referencia"))
      .sort(),
    segmentId,
    decision: body.decision,
    note: aggregateNote(body.note),
  };
}

function contextFor(brand, options = {}) {
  const references = options.references ?? listRecords(brand.id, "references");
  const sources = options.sources ?? listRecords(brand.id, "sources");
  const signals = options.signals ?? listRecords(brand.id, "audienceSignals");
  const state = buildInsights(brand, {
    references,
    sources,
    signals,
    // Resolve the same current opportunities as the report, including its
    // demo/real scope. None of these local reads starts a provider call.
    pieces: options.pieces ?? listRecords(brand.id, "pieces"),
    outcomes: options.outcomes ?? listRecords(brand.id, "outcomes"),
    snapshots: options.snapshots ?? listRecords(brand.id, "topicSnapshots"),
    analyses: [],
  });
  return {
    references,
    sources,
    signals: state.signals,
    opportunities: options.opportunities ?? state.opportunities,
  };
}

function allowedReference(reference, sources) {
  const source = sources.find((item) => item.id === reference.sourceId);
  return (
    !isYouTubeReference(reference) &&
    (!reference.sourceId || !!source) &&
    referenceUsePolicy(reference, source).allowed
  );
}

function fingerprintFor(brand, opportunity, item, context) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: 1,
        policyVersion: ACCESS_POLICY_VERSION,
        opportunity: opportunityFingerprint(brand, opportunity, context),
        segmentId: item.segmentId,
        referenceIds: [...item.referenceIds].sort(),
      }),
    )
    .digest("hex");
}

function statusFor(brand, item, context) {
  const reasons = [];
  const opportunity = context.opportunities.find(
    (candidate) => candidate.id === item.opportunityId,
  );
  if (!opportunity) reasons.push("opportunity_unavailable");
  if (!(brand.audience || []).some((segment) => segment.id === item.segmentId))
    reasons.push("segment_unavailable");
  for (const id of item.referenceIds) {
    const reference = context.references.find(
      (candidate) => candidate.id === id,
    );
    if (!reference) reasons.push("reference_unavailable");
    else if (!allowedReference(reference, context.sources))
      reasons.push("reference_restricted");
    if (opportunity && !opportunity.referenceIds.includes(id))
      reasons.push("reference_not_in_opportunity");
  }
  const currentFingerprint = reasons.length
    ? null
    : fingerprintFor(brand, opportunity, item, context);
  if (currentFingerprint && currentFingerprint !== item.fingerprint)
    reasons.push("evidence_or_context_changed");
  return {
    stale: reasons.length > 0,
    staleReasons: [...new Set(reasons)],
    currentFingerprint,
  };
}

/** Read this brand's append-only audit history. No user, IP or participant data
 * is stored. Mount the router, or authorize the brand before calling directly.
 * The records kind must be registered in db.mjs as `opportunityFeedback`.
 */
export function listOpportunityFeedback(brandId) {
  return listRecords(brandId, KIND);
}

function feedbackViews(brand, feedback, context) {
  const latest = new Set();
  return [...feedback]
    .sort(
      (a, b) =>
        b.audit.revision - a.audit.revision ||
        b.createdAt.localeCompare(a.createdAt) ||
        b.id.localeCompare(a.id),
    )
    .map((item) => {
      const key = JSON.stringify([item.opportunityId, item.segmentId]);
      const superseded = latest.has(key);
      latest.add(key);
      return { ...item, ...statusFor(brand, item, context), superseded };
    });
}

const emptyDecisions = () => ({ accepted: 0, rejected: 0, needs_evidence: 0 });
function summaryFor(feedback) {
  const latest = feedback.filter((item) => !item.superseded);
  const current = latest.filter((item) => !item.stale);
  const decisions = emptyDecisions();
  const segments = new Map();
  for (const item of current) {
    decisions[item.decision]++;
    const group = segments.get(item.segmentId) || {
      segmentId: item.segmentId,
      decisions: emptyDecisions(),
    };
    group.decisions[item.decision]++;
    segments.set(item.segmentId, group);
  }
  return {
    total: feedback.length,
    current: current.length,
    stale: latest.length - current.length,
    superseded: feedback.length - latest.length,
    decisions,
    bySegment: [...segments.values()].sort((a, b) =>
      a.segmentId.localeCompare(b.segmentId),
    ),
    notice: NOTICE,
  };
}

/** Summary of the latest current editorial decision per opportunity/segment.
 * options: { feedback, references, sources, signals, opportunities? }.
 * Pass all evidence arrays for a self-contained report; omitted arrays read
 * this brand's records. `opportunities` may come from the current buildInsights.
 * Returns {total,current,stale,superseded,decisions,bySegment,notice}; counts
 * describe editorial decisions only, never people, performance or success.
 */
export function summarizeOpportunityFeedback(
  brand,
  { feedback = [], ...options } = {},
) {
  return summaryFor(feedbackViews(brand, feedback, contextFor(brand, options)));
}

/** Mount under /api after the application's JSON parser and origin guard.
 * GET: {feedback: [...history with stale/currentFingerprint/superseded],summary}.
 * POST: {opportunityId,referenceIds,segmentId,decision,note?}; returns 201 record.
 * Every write appends a revision; audit stores role and prior revision ID only.
 */
export function createOpportunityFeedbackRouter() {
  const router = express.Router();
  const route = "/brands/:brandId/opportunity-feedback";
  router.get(route, requireAuth, requireBrand, (req, res) => {
    const context = contextFor(req.brand);
    const feedback = feedbackViews(
      req.brand,
      listOpportunityFeedback(req.brand.id),
      context,
    );
    res
      .set("Cache-Control", "no-store")
      .json({ feedback, summary: summaryFor(feedback) });
  });
  router.post(route, requireAuth, requireBrand, requireEditor, (req, res) => {
    const input = inputFor(req.body);
    const context = contextFor(req.brand);
    const opportunity = context.opportunities.find(
      (item) => item.id === input.opportunityId,
    );
    if (!opportunity)
      fail(
        404,
        "La oportunidad ya no está disponible en esta empresa. Actualiza las oportunidades.",
      );
    if (
      !(req.brand.audience || []).some(
        (segment) => segment.id === input.segmentId,
      )
    )
      fail(
        400,
        "El segmento no pertenece a la audiencia actual de esta empresa.",
      );
    for (const id of input.referenceIds) {
      const reference = context.references.find((item) => item.id === id);
      if (!reference)
        fail(
          400,
          "La referencia no pertenece a esta empresa o ya no está disponible.",
        );
      if (!allowedReference(reference, context.sources))
        fail(
          403,
          "La política vigente no permite usar esta referencia para validación editorial.",
        );
      if (!opportunity.referenceIds.includes(id))
        fail(400, "La referencia no pertenece a la oportunidad actual.");
    }
    const previous = listOpportunityFeedback(req.brand.id)
      .filter(
        (item) =>
          item.opportunityId === input.opportunityId &&
          item.segmentId === input.segmentId,
      )
      .sort((a, b) => b.audit.revision - a.audit.revision)[0];
    const record = saveRecord(req.brand.id, KIND, {
      ...input,
      fingerprint: fingerprintFor(req.brand, opportunity, input, context),
      isDemo: opportunity.isDemo === true,
      audit: {
        version: 1,
        basis: "editorial_validation",
        actorRole: req.membership.role,
        revision: (previous?.audit.revision || 0) + 1,
        supersedesId: previous?.id || null,
      },
    });
    res
      .set("Cache-Control", "no-store")
      .status(201)
      .json({
        ...record,
        ...statusFor(req.brand, record, context),
        superseded: false,
      });
  });
  return router;
}
