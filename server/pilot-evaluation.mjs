import express from "express";
import { randomUUID } from "node:crypto";
import { db } from "./db.mjs";
import { requireAuth, requireBrand, requireEditor } from "./core.mjs";

const PATH = "/brands/:brandId/pilot-evaluation";
const NOTICE =
  "Registro agregado declarado manualmente, sin verificación automática. Las diferencias entre períodos no demuestran causalidad ni ahorro atribuible a kompass. No se suman monedas ni se infieren datos faltantes.";

// Mount with app.use('/api', createPilotEvaluationRouter()) before the API 404.
// POST replaces the complete record for the exact same period (201 new, 200
// correction). Omitted measurements become null, never zero. Other overlapping
// evaluation periods are rejected so the same work is not counted twice.
export const PILOT_EVALUATION_CONTRACT = Object.freeze({
  version: 1,
  path: PATH,
  methods: ["GET", "POST"],
  role: "editor",
  origin: "manual",
  fields: [
    "origin",
    "period",
    "editorialMinutes",
    "actualCost",
    "results",
    "baseline",
  ],
  period: "start/end: YYYY-MM-DD, inclusive, not in the future",
  editorialMinutes: "Nonnegative number or null; aggregate editorial work only",
  actualCost:
    "{ amount: nonnegative number|null, currency: uppercase ISO 4217 }; actual declared cost, never an estimate or conversion of minutes into money",
  results:
    "{ reviewed, useful, accepted }: nonnegative integer|null; references in the period; accepted is a subset of useful, useful of reviewed",
  baseline:
    "Optional/null: { period, editorialMinutes, actualCost, results, sameScope: true }; earlier nonoverlapping period, same currency and editorial scope explicitly declared by the editor",
  unknown: null,
  rates:
    "Fractions using reviewed as denominator; null for zero/unknown sample",
  comparison: "Descriptive current minus baseline; no causal or savings claim",
  storage: "pilot_evaluations, tenant-scoped with brand deletion cascade",
  notice: NOTICE,
});

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function object(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(400, `${label} debe ser un objeto JSON.`);
  if (Object.keys(value).some((key) => !keys.includes(key)))
    fail(
      400,
      `${label} contiene campos no admitidos. No envíes datos personales.`,
    );
  return value;
}

function measurement(
  value,
  label,
  { integer = false, max = 1_000_000_000 } = {},
) {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  )
    fail(
      400,
      `${label} debe ser un número no negativo${integer ? " entero" : ""} o null.`,
    );
  return value;
}

function periodInput(value, today) {
  object(value, ["start", "end"], "El período");
  for (const key of ["start", "end"]) {
    const date = value[key];
    if (
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      fail(400, "El período requiere fechas válidas YYYY-MM-DD.");
  }
  if (value.start > value.end || value.end > today)
    fail(
      400,
      "El período debe estar ordenado y no puede incluir fechas futuras.",
    );
  return { start: value.start, end: value.end };
}

const currencies = new Set(Intl.supportedValuesOf("currency"));
const currencyDecimals = (currency) =>
  new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
    .maximumFractionDigits;

function snapshotInput(value, today) {
  const period = periodInput(value.period, today);
  const editorialMinutes = measurement(
    value.editorialMinutes,
    "Los minutos editoriales",
  );
  const cost = object(
    value.actualCost,
    ["amount", "currency"],
    "El costo real",
  );
  if (typeof cost.currency !== "string" || !currencies.has(cost.currency))
    fail(400, "Indica una moneda ISO 4217 vigente en mayúsculas.");
  const amount = measurement(cost.amount, "El costo real");
  const decimals = currencyDecimals(cost.currency);
  if (amount !== null && Number(amount.toFixed(decimals)) !== amount)
    fail(400, "El importe tiene más decimales de los admitidos por su moneda.");
  const results = object(
    value.results ?? {},
    ["reviewed", "useful", "accepted"],
    "Los resultados",
  );
  const counts = Object.fromEntries(
    ["reviewed", "useful", "accepted"].map((key) => [
      key,
      measurement(results[key], `El resultado ${key}`, { integer: true }),
    ]),
  );
  for (const [subset, total] of [
    ["useful", "reviewed"],
    ["accepted", "useful"],
    ["accepted", "reviewed"],
  ])
    if (
      counts[subset] !== null &&
      counts[total] !== null &&
      counts[subset] > counts[total]
    )
      fail(
        400,
        "Los resultados deben cumplir aceptadas ≤ útiles ≤ revisadas cuando se conocen.",
      );
  return {
    period,
    editorialMinutes,
    actualCost: { amount, currency: cost.currency },
    results: counts,
  };
}

/** Validate only aggregate, closed-schema manual data; no notes or identities. */
export function normalizePilotEvaluationInput(
  input,
  { now = Date.now() } = {},
) {
  object(input, PILOT_EVALUATION_CONTRACT.fields, "La evaluación");
  if (input.origin !== "manual")
    fail(
      400,
      "Confirma origin: manual para registrar cifras declaradas por el equipo.",
    );
  const today = new Date(now).toISOString().slice(0, 10);
  const current = snapshotInput(input, today);
  let baseline = null;
  if (input.baseline !== undefined && input.baseline !== null) {
    object(
      input.baseline,
      ["period", "editorialMinutes", "actualCost", "results", "sameScope"],
      "La línea base",
    );
    if (input.baseline.sameScope !== true)
      fail(
        400,
        "Confirma sameScope: true sólo para una línea base del mismo alcance editorial.",
      );
    baseline = { ...snapshotInput(input.baseline, today), sameScope: true };
    if (baseline.period.end >= current.period.start)
      fail(400, "La línea base debe terminar antes del período evaluado.");
    if (baseline.actualCost.currency !== current.actualCost.currency)
      fail(
        400,
        "La evaluación y su línea base deben declarar la misma moneda; no se convierten divisas.",
      );
  }
  return { origin: "manual", ...current, baseline };
}

const divide = (value, sample) =>
  value === null || sample === null || sample === 0 ? null : value / sample;
const delta = (current, baseline) =>
  current === null || baseline === null ? null : current - baseline;

function snapshotSummary(value) {
  const { period, editorialMinutes, actualCost, results } = value;
  return {
    period,
    sample: { ...results },
    editorialMinutes,
    actualCost: { ...actualCost },
    usefulPerReviewed: divide(results.useful, results.reviewed),
    acceptedPerReviewed: divide(results.accepted, results.reviewed),
    minutesPerReviewed: divide(editorialMinutes, results.reviewed),
    costPerReviewed: divide(actualCost.amount, results.reviewed),
    unknownFields: [
      ...(editorialMinutes === null ? ["editorialMinutes"] : []),
      ...(actualCost.amount === null ? ["actualCost.amount"] : []),
      ...Object.keys(results)
        .filter((key) => results[key] === null)
        .map((key) => `results.${key}`),
    ],
  };
}

/** Summaries keep samples and missing values; rates are fractions, not percentages. */
export function summarizePilotEvaluation(evaluation) {
  const current = snapshotSummary(evaluation);
  let comparison = {
    status: "baseline_missing",
    notice: "No se ha declarado una línea base. No se calcula ahorro.",
  };
  if (evaluation.baseline) {
    const baseline = snapshotSummary(evaluation.baseline);
    const costDifference = delta(
      current.actualCost.amount,
      baseline.actualCost.amount,
    );
    comparison = {
      status: "descriptive_only",
      sameScope: "manually_declared",
      direction: "current_minus_baseline",
      baseline,
      delta: {
        editorialMinutes: delta(
          current.editorialMinutes,
          baseline.editorialMinutes,
        ),
        actualCost:
          costDifference === null
            ? null
            : Number(
                costDifference.toFixed(
                  currencyDecimals(current.actualCost.currency),
                ),
              ),
        reviewed: delta(current.sample.reviewed, baseline.sample.reviewed),
        useful: delta(current.sample.useful, baseline.sample.useful),
        accepted: delta(current.sample.accepted, baseline.sample.accepted),
        minutesPerReviewed: delta(
          current.minutesPerReviewed,
          baseline.minutesPerReviewed,
        ),
        costPerReviewed: delta(
          current.costPerReviewed,
          baseline.costPerReviewed,
        ),
      },
      notice:
        "Diferencia descriptiva entre períodos y muestras declaradas, que pueden tener distinta duración o volumen. No establece causalidad ni ahorro atribuible a kompass.",
    };
  }
  return { origin: "manual", ...current, comparison, notice: NOTICE };
}

export function createPilotEvaluationStore({
  database = db,
  clock = Date.now,
} = {}) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS pilot_evaluations (
      id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(brand_id, period_start, period_end)
    );
    CREATE INDEX IF NOT EXISTS pilot_evaluations_brand_period
      ON pilot_evaluations(brand_id, period_end, period_start);
  `);
  const view = (row) => ({
    ...JSON.parse(row.data),
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  function list(brandId) {
    return database
      .prepare(
        "SELECT * FROM pilot_evaluations WHERE brand_id=? ORDER BY period_end DESC, period_start DESC",
      )
      .all(brandId)
      .map(view);
  }
  function report(brandId) {
    const evaluations = list(brandId).map((value) => ({
      ...value,
      summary: summarizePilotEvaluation(value),
    }));
    return {
      evaluations,
      summary: {
        origin: "manual",
        periodCount: evaluations.length,
        latestEvaluationId: evaluations[0]?.id ?? null,
        currencies: [
          ...new Set(evaluations.map((value) => value.actualCost.currency)),
        ].sort(),
        knownCostPeriods: evaluations.filter(
          (value) => value.actualCost.amount !== null,
        ).length,
        unknownCostPeriods: evaluations.filter(
          (value) => value.actualCost.amount === null,
        ).length,
        notice: NOTICE,
      },
    };
  }
  function save(brandId, body) {
    const now = clock();
    const input = normalizePilotEvaluationInput(body, { now });
    const stamp = new Date(now).toISOString();
    database.exec("BEGIN IMMEDIATE");
    try {
      const existing = database
        .prepare(
          "SELECT * FROM pilot_evaluations WHERE brand_id=? AND period_start=? AND period_end=?",
        )
        .get(brandId, input.period.start, input.period.end);
      const overlap = database
        .prepare(
          "SELECT id FROM pilot_evaluations WHERE brand_id=? AND period_start<=? AND period_end>=? AND id<>? LIMIT 1",
        )
        .get(brandId, input.period.end, input.period.start, existing?.id ?? "");
      if (overlap)
        fail(
          409,
          "El período se solapa con una evaluación existente. Corrige su período exacto o elige otro intervalo.",
        );
      const count = database
        .prepare(
          "SELECT COUNT(*) AS total FROM pilot_evaluations WHERE brand_id=?",
        )
        .get(brandId).total;
      if (!existing && count >= 1_000)
        fail(
          409,
          "Esta empresa alcanzó el límite de 1000 períodos de evaluación.",
        );
      const id = existing?.id ?? randomUUID();
      const createdAt = existing?.created_at ?? stamp;
      database
        .prepare(
          `INSERT INTO pilot_evaluations(id,brand_id,period_start,period_end,data,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?) ON CONFLICT(brand_id,period_start,period_end) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at`,
        )
        .run(
          id,
          brandId,
          input.period.start,
          input.period.end,
          JSON.stringify(input),
          createdAt,
          stamp,
        );
      database.exec("COMMIT");
      const evaluation = { ...input, id, createdAt, updatedAt: stamp };
      return {
        created: !existing,
        evaluation: {
          ...evaluation,
          summary: summarizePilotEvaluation(evaluation),
        },
      };
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
  return { list, report, save };
}

let sharedStore;
const store = () => (sharedStore ||= createPilotEvaluationStore());

// Internal tenant reader for research-report. Its caller must authorize access;
// the HTTP router below enforces authentication, membership and editor role.
export const listPilotEvaluations = (brandId) => store().list(brandId);
export const getPilotEvaluationReport = (brandId) => store().report(brandId);

export function createPilotEvaluationRouter({ clock = Date.now } = {}) {
  const service = createPilotEvaluationStore({ clock });
  const router = express.Router();
  router.use(
    PATH,
    requireAuth,
    requireBrand,
    requireEditor,
    (_req, res, next) => {
      res.set("Cache-Control", "no-store");
      next();
    },
  );
  router.get(PATH, (req, res) =>
    res.json({
      ...service.report(req.brand.id),
      contract: PILOT_EVALUATION_CONTRACT,
    }),
  );
  router.post(PATH, (req, res) => {
    const { created, evaluation } = service.save(req.brand.id, req.body);
    res.status(created ? 201 : 200).json({ evaluation });
  });
  return router;
}
