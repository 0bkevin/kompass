import express from "express";
import { createHash } from "node:crypto";
import { db, getRecord } from "./db.mjs";
import { requireAuth, requireBrand, requireEditor } from "./core.mjs";
import { checkOrigin } from "./auth.mjs";
import {
  assertReferenceUseAllowed,
  isRestrictedCollectionUrl,
} from "./access-policy.mjs";
import { assertAggregateAudienceText } from "./aggregate-privacy.mjs";
import { containsUrlContactDetails } from "./url-privacy.mjs";
import { publicCitationUrl } from "./public-citation-url.mjs";

export const EDITORIAL_EVIDENCE_FACTORS = Object.freeze([
  "hook",
  "format",
  "topic",
  "timing",
  "publisher",
  "performance",
]);
export const EDITORIAL_EVIDENCE_LIMITS = Object.freeze({
  observations: 6,
  observation: 1000,
  uncertainty: 600,
  possibleHypothesis: 600,
  quote: 1000,
  seconds: 86400,
});

// Own storage keeps the reference's lifecycle without changing the shared
// records-kind registry. No reference bodies, credentials or user IDs are copied.
db.exec(`CREATE TABLE IF NOT EXISTS editorial_evidence (
  brand_id TEXT NOT NULL,
  reference_kind TEXT NOT NULL DEFAULT 'references' CHECK(reference_kind='references'),
  reference_id TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY(brand_id, reference_id),
  FOREIGN KEY(brand_id, reference_kind, reference_id)
    REFERENCES records(brand_id, kind, id) ON DELETE CASCADE
);`);

function fail(status, message, code = "INVALID_EDITORIAL_EVIDENCE") {
  throw Object.assign(new Error(message), { status, code });
}
function object(value, keys, label) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    fail(400, `${label}: envía un objeto con los campos previstos.`);
  return value;
}
function text(value, label, max, required = true) {
  if (value === undefined && !required) return undefined;
  if (
    typeof value !== "string" ||
    value.length > max ||
    !value.trim() ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
    fail(400, `${label}: escribe texto de hasta ${max} caracteres.`);
  const result = value.trim();
  assertAggregateAudienceText(result.normalize("NFKC"), label);
  if (containsUrlContactDetails(result))
    fail(400, `${label}: elimina datos personales y de contacto.`);
  return result;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, stable(value[key])]),
    );
  return value;
}

/** Material/version hash, including metrics and media identity. Workflow state
 * and generated analyses do not change the material an editor observed.
 */
export function editorialEvidenceFingerprint(reference, { asset } = {}) {
  const {
    updatedAt,
    status,
    analysis,
    videoAnalysis,
    brandRelevance,
    analysisCoverage,
    editorialEvidence,
    ...material
  } = reference;
  return createHash("sha256")
    .update(
      JSON.stringify(stable({ version: 1, material, asset: asset || null })),
    )
    .digest("hex");
}

function context(brandId, referenceId) {
  const reference = getRecord(brandId, "references", referenceId);
  if (!reference)
    fail(
      404,
      "No se encontró la referencia en esta empresa.",
      "REFERENCE_NOT_FOUND",
    );
  const source = reference.sourceId
    ? getRecord(brandId, "sources", reference.sourceId)
    : undefined;
  if (reference.sourceId && !source)
    fail(
      403,
      "No se puede comprobar el permiso de la fuente de esta referencia.",
      "SOURCE_ACCESS_RESTRICTED",
    );
  assertReferenceUseAllowed(reference, source);
  for (const url of [reference.url, reference.sourceUrl].filter(Boolean)) {
    if (isRestrictedCollectionUrl(url))
      fail(
        403,
        "Esta plataforma está restringida para el análisis editorial, incluidas las observaciones manuales.",
        "SOURCE_ACCESS_RESTRICTED",
      );
    try {
      publicCitationUrl(url);
    } catch {
      fail(
        403,
        "La referencia necesita un enlace público sin sesión ni datos personales.",
        "SOURCE_ACCESS_RESTRICTED",
      );
    }
  }
  const asset = reference.assetId
    ? getRecord(brandId, "assets", reference.assetId)
    : undefined;
  if (reference.assetId && !asset)
    fail(
      403,
      "El material adjunto ya no está disponible en esta empresa.",
      "SOURCE_ACCESS_RESTRICTED",
    );
  return {
    reference,
    asset,
    referenceFingerprint: editorialEvidenceFingerprint(reference, { asset }),
  };
}

function storedEvidence(brandId, referenceId) {
  const row = db
    .prepare(
      "SELECT data FROM editorial_evidence WHERE brand_id=? AND reference_id=?",
    )
    .get(brandId, referenceId);
  return row ? JSON.parse(row.data) : null;
}
function view(reference, referenceFingerprint, saved) {
  const status = !saved
    ? "empty"
    : saved.referenceFingerprint === referenceFingerprint
      ? saved.observations.length
        ? "current"
        : "empty"
      : "stale";
  return {
    schemaVersion: 1,
    referenceId: reference.id,
    referenceFingerprint,
    revision: saved?.revision || 0,
    status,
    origin: "manual",
    causality: "not_established",
    isDemo: reference.isDemo === true,
    observations: status === "current" ? saved.observations : [],
    updatedAt: saved?.updatedAt || null,
  };
}

/** Internal reader; callers must authorize brand access. Policy is checked on
 * every read; invalidated observations are never returned as usable evidence.
 */
export function getEditorialEvidence(brandId, referenceId) {
  const { reference, referenceFingerprint } = context(brandId, referenceId);
  return view(
    reference,
    referenceFingerprint,
    storedEvidence(brandId, referenceId),
  );
}

/** Report integration: only current, permitted, non-demo manual evidence.
 * Restricted/stale records are omitted without exposing their cached contents.
 */
export function listCurrentEditorialEvidence(brandId) {
  const rows = db
    .prepare(
      "SELECT reference_id FROM editorial_evidence WHERE brand_id=? ORDER BY reference_id",
    )
    .all(brandId);
  const result = [];
  for (const row of rows) {
    try {
      const evidence = getEditorialEvidence(brandId, row.reference_id);
      if (evidence.status === "current" && !evidence.isDemo)
        result.push(evidence);
    } catch (error) {
      if (![403, 404].includes(error.status)) throw error;
    }
  }
  return result;
}

function supportInput(value, { reference, asset }) {
  object(
    value,
    ["kind", "field", "quote", "startSeconds", "endSeconds"],
    "Apoyo",
  );
  if (value.kind === "text") {
    object(value, ["kind", "field", "quote"], "Cita textual");
    if (!["title", "text"].includes(value.field))
      fail(400, "La cita debe señalar title o text de la referencia.");
    const quote = text(value.quote, "Cita", EDITORIAL_EVIDENCE_LIMITS.quote);
    if (
      typeof reference[value.field] !== "string" ||
      !reference[value.field].includes(quote)
    )
      fail(
        400,
        "La cita debe aparecer literalmente en el campo indicado de la referencia.",
      );
    return {
      kind: "text",
      field: value.field,
      quote,
      verification: "literal_reference",
    };
  }
  if (value.kind !== "time")
    fail(400, "El apoyo debe ser una cita textual o un tiempo observado.");
  object(value, ["kind", "startSeconds", "endSeconds"], "Tiempo observado");
  // Temporal notes refer to an uploaded audiovisual asset. Metadata-only links
  // cannot be presented as footage observed by this application. No bytes are read.
  if (!asset || !/^(?:video|audio)\//.test(asset.mimeType || ""))
    fail(
      400,
      "Los tiempos requieren un archivo de video o audio adjunto de esta empresa.",
    );
  const start = value.startSeconds;
  const end = value.endSeconds === undefined ? start : value.endSeconds;
  const duration =
    reference.durationSeconds ?? reference.duration ?? asset.durationSeconds;
  if (
    typeof start !== "number" ||
    !Number.isFinite(start) ||
    start < 0 ||
    typeof end !== "number" ||
    !Number.isFinite(end) ||
    end < start ||
    end > EDITORIAL_EVIDENCE_LIMITS.seconds ||
    (typeof duration === "number" &&
      Number.isFinite(duration) &&
      end > duration)
  )
    fail(
      400,
      "El tiempo observado debe ser un intervalo válido dentro del material disponible.",
    );
  return {
    kind: "time",
    startSeconds: start,
    ...(value.endSeconds !== undefined ? { endSeconds: end } : {}),
    verification: "manual_timestamp",
  };
}
function observationInput(value, current) {
  object(
    value,
    [
      "factor",
      "observation",
      "uncertainty",
      "possibleHypothesis",
      "observedAt",
      "support",
    ],
    "Observación",
  );
  if (!EDITORIAL_EVIDENCE_FACTORS.includes(value.factor))
    fail(400, "El factor editorial no es válido.");
  if (
    typeof value.observedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(
      value.observedAt,
    ) ||
    !Number.isFinite(Date.parse(value.observedAt)) ||
    Date.parse(value.observedAt) > Date.now() ||
    new Date(value.observedAt).toISOString().slice(0, 19) !==
      value.observedAt.slice(0, 19)
  )
    fail(
      400,
      "Indica cuándo observaste el material, en fecha ISO UTC y sin fechas futuras.",
    );
  const hypothesis = text(
    value.possibleHypothesis,
    "Posible hipótesis",
    EDITORIAL_EVIDENCE_LIMITS.possibleHypothesis,
    false,
  );
  return {
    factor: value.factor,
    observation: text(
      value.observation,
      "Observación",
      EDITORIAL_EVIDENCE_LIMITS.observation,
    ),
    uncertainty: text(
      value.uncertainty,
      "Incertidumbre",
      EDITORIAL_EVIDENCE_LIMITS.uncertainty,
    ),
    ...(hypothesis !== undefined ? { possibleHypothesis: hypothesis } : {}),
    observedAt: new Date(value.observedAt).toISOString(),
    support: supportInput(value.support, current),
    origin: "manual",
  };
}

/** Replace the finite observation set; internal callers must authorize editing.
 * Version checks and save share a write lock across API processes.
 */
export function putEditorialEvidence(brandId, referenceId, body) {
  object(
    body,
    ["expectedReferenceFingerprint", "expectedRevision", "observations"],
    "Evidencia editorial",
  );
  if (
    !Array.isArray(body.observations) ||
    body.observations.length > EDITORIAL_EVIDENCE_LIMITS.observations
  )
    fail(400, "Envía hasta seis observaciones, una por factor editorial.");
  if (
    typeof body.expectedReferenceFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(body.expectedReferenceFingerprint) ||
    !Number.isSafeInteger(body.expectedRevision) ||
    body.expectedRevision < 0
  )
    fail(
      400,
      "Envía la versión de referencia y revisión obtenidas al consultar la evidencia.",
    );
  db.exec("BEGIN IMMEDIATE");
  try {
    const current = context(brandId, referenceId);
    const saved = storedEvidence(brandId, referenceId);
    if (
      body.expectedReferenceFingerprint !== current.referenceFingerprint ||
      body.expectedRevision !== (saved?.revision || 0)
    )
      fail(
        409,
        "La referencia o sus observaciones cambiaron. Consulta la versión actual antes de guardar.",
        "EDITORIAL_EVIDENCE_CONFLICT",
      );
    const observations = body.observations.map((item) =>
      observationInput(item, current),
    );
    if (
      new Set(observations.map((item) => item.factor)).size !==
      observations.length
    )
      fail(400, "Registra una sola observación por factor editorial.");
    const document = {
      referenceFingerprint: current.referenceFingerprint,
      revision: (saved?.revision || 0) + 1,
      observations,
      updatedAt: new Date().toISOString(),
    };
    db.prepare(
      "INSERT INTO editorial_evidence(brand_id,reference_id,data) VALUES(?,?,?) ON CONFLICT(brand_id,reference_id) DO UPDATE SET data=excluded.data",
    ).run(brandId, referenceId, JSON.stringify(document));
    db.exec("COMMIT");
    return view(current.reference, current.referenceFingerprint, document);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function createEditorialEvidenceRouter() {
  const router = express.Router();
  const path = "/brands/:brandId/references/:referenceId/editorial-evidence";
  const noCache = (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  };
  router.get(path, noCache, requireAuth, requireBrand, (req, res) => {
    res.json(getEditorialEvidence(req.brand.id, req.params.referenceId));
  });
  router.put(
    path,
    noCache,
    requireAuth,
    requireBrand,
    requireEditor,
    checkOrigin,
    (req, res) => {
      res.json(
        putEditorialEvidence(req.brand.id, req.params.referenceId, req.body),
      );
    },
  );
  return router;
}
