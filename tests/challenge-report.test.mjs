import assert from "node:assert/strict";
import { test } from "node:test";
import {
  exportMarkdown,
  isResearchReportStale,
  normalizeReportFindings,
  normalizeResearchReport,
  reportCitationUrl,
  reportDate,
  reportEndpoints,
  reportPilotInput,
  selectReportOpportunities,
} from "../src/lib/challenge-report.ts";

// Entirely synthetic input. Nothing in this file is a live report or customer.
const now = Date.parse("2026-10-18T12:00:00Z");
const filters = { segmentId: "", method: "all" };
const opportunity = (id = "op-1", overrides = {}) => ({
  id,
  title: `Tema sintético ${id}`,
  topic: "Tema de prueba",
  referenceIds: ["ref-1"],
  segmentIds: ["segment-1"],
  relevance: 50,
  reasons: ["Prioridad editorial de prueba"],
  hypothesis: "Hipótesis por validar",
  adaptation: "Adaptación sintética",
  confidence: "low",
  suggestedFormat: "post",
  suggestedChannel: "linkedin",
  isDemo: true,
  evidence: [
    {
      referenceId: "ref-1",
      title: "Fuente sintética",
      url: "https://example.com/source",
      source: "Fuente de prueba",
      detail: "Solo metadatos",
      observedAt: "2026-10-17T10:00:00Z",
      providerAttributions: [{ id: "gdelt" }],
    },
  ],
  growth: { label: "insufficient", explanation: "Sin ventanas comparables" },
  ...overrides,
});
const report = (overrides = {}) =>
  normalizeResearchReport({
    generatedAt: "2026-10-18T12:00:00Z",
    isDemo: true,
    scope: {
      company: "Empresa sintética",
      period: {
        from: "2026-10-11T12:00:00Z",
        to: "2026-10-18T12:00:00Z",
        days: 7,
      },
      counts: { selected: 1, publicationDated: 0, observationDated: 1 },
    },
    coverage: {
      references: 1,
      sources: 1,
      errors: [],
      notes: ["Cobertura sintética limitada"],
    },
    opportunities: [opportunity()],
    ...overrides,
  });

test("normalizes optional helper arrays and objects without manufacturing measurements", () => {
  const value = report({
    trends: { items: [{ topic: "Tema", explanation: "Observación" }] },
    formats: ["Texto"],
    validation: { current: 0, notice: "Declaración editorial" },
    pilot: null,
    costs: { actualUsd: null, reservedUsd: -1 },
  });
  assert.deepEqual(value.trends, [{ title: "Tema", detail: "Observación" }]);
  assert.deepEqual(value.formats, [{ title: "Texto", detail: "" }]);
  assert.deepEqual(value.validation, [
    { title: "current", detail: "0" },
    { title: "notice", detail: "Declaración editorial" },
  ]);
  assert.deepEqual(value.pilot, []);
  assert.equal(value.costs.actualUsd, undefined);
  assert.equal(value.costs.reservedUsd, undefined);
  assert.deepEqual(
    normalizeReportFindings({
      privateRecords: [{ name: "must not be flattened" }],
    }),
    [],
  );
});

test("invalid envelopes and incomplete opportunities become an actionable error", () => {
  for (const input of [
    null,
    {},
    { generatedAt: "today", opportunities: "bad" },
    { generatedAt: "today", opportunities: [{ id: "broken" }] },
    {
      generatedAt: "today",
      opportunities: [opportunity("bad", { evidence: [null] })],
    },
    {
      generatedAt: "today",
      opportunities: [opportunity("bad", { analysis: { engine: "ai" } })],
    },
  ])
    assert.throws(() => normalizeResearchReport(input), /informe|oportunidad/);
});

test("editorial order uses relevance, caps at ten and leaves the original corpus intact", () => {
  const corpus = Array.from({ length: 12 }, (_, index) =>
    opportunity(`op-${index}`, {
      relevance: index,
      growth: {
        label: index === 0 ? "observed" : "insufficient",
        explanation: "Historial sintético",
      },
    }),
  );
  const value = report({ opportunities: corpus });
  const selected = selectReportOpportunities(value, filters);
  assert.equal(selected.length, 10);
  assert.equal(selected[0].id, "op-11");
  assert.equal(selected.at(-1).id, "op-2");
  assert.equal(corpus[0].id, "op-0");
  assert.equal(value.opportunities.length, 12);
});

test("segment and method filters intersect before the editorial limit", () => {
  const analysis = {
    engine: "ai",
    hookHypothesis: "Hipótesis IA",
    adaptation: "Adaptación IA",
    citations: [],
    limitations: [],
  };
  const value = report({
    opportunities: [
      opportunity("local"),
      opportunity("ai", { analysis, segmentIds: ["segment-2"] }),
    ],
  });
  assert.deepEqual(
    selectReportOpportunities(value, {
      segmentId: "segment-2",
      method: "ai",
    }).map((item) => item.id),
    ["ai"],
  );
  assert.equal(
    selectReportOpportunities(value, { segmentId: "segment-1", method: "ai" })
      .length,
    0,
  );
  assert.deepEqual(
    selectReportOpportunities(value, {
      segmentId: "",
      method: "heuristic",
    }).map((item) => item.id),
    ["local"],
  );
  assert.equal(selectReportOpportunities(report(), filters).length, 1);
});

test("fresh generation does not hide old corpus dates and invalid/future dates are stale", () => {
  assert.equal(isResearchReportStale(report(), now), false);
  assert.equal(isResearchReportStale(report({ stale: true }), now), true);
  assert.equal(
    isResearchReportStale(report({ generatedAt: "invalid" }), now),
    true,
  );
  assert.equal(
    isResearchReportStale(report({ generatedAt: "2026-10-19T12:00:00Z" }), now),
    true,
  );
  assert.equal(
    isResearchReportStale(
      report({ scope: { period: { to: "2026-10-01T12:00:00Z" } } }),
      now,
    ),
    true,
  );
  assert.equal(reportDate("bad"), "Fecha no disponible");
});

test("Markdown preserves evidence, provider attribution, hypothesis and observation limits", () => {
  const value = report({
    coverage: {
      errors: ["Fuente sintética no disponible"],
      notes: ["Muestra parcial"],
    },
    costs: { reservedUsd: 0 },
  });
  const output = exportMarkdown(value, {
    company: "Empresa sintética",
    filters,
    now,
  });
  assert.match(output, /Demostración|demostración/);
  assert.match(output, /Hipótesis editorial: Hipótesis por validar/);
  assert.match(output, /Adaptación: Adaptación sintética/);
  assert.match(output, /https:\/\/example.com\/source/);
  assert.match(output, /Datos: GDELT Project/);
  assert.match(output, /Observada:/);
  assert.match(output, /observación solo indica/);
  assert.match(output, /Costo real no informado/);
  assert.match(output, /USD 0.00; no equivale a gasto real/);
  assert.match(output, /Error de fuente: Fuente sintética no disponible/);
  assert.match(output, /YouTube permanecen en social-sync/);
  assert.match(output, /no es una clasificación de crecimiento/);
});

test("Markdown uses the same selection and exports no invented empty positions", () => {
  const output = exportMarkdown(report(), {
    company: "QA",
    filters: { segmentId: "missing", method: "all" },
    now,
  });
  assert.match(output, /Oportunidades priorizadas \(0\)/);
  assert.doesNotMatch(output, /### 1\./);
  assert.match(output, /No se completan posiciones sin evidencia/);
});

test("Markdown escapes public-source HTML and links; only linked AI citations are exported", () => {
  const value = report({
    opportunities: [
      opportunity("op-1", {
        title: "<script>alert(1)</script> [fake](javascript:alert(1))",
        evidence: [
          {
            referenceId: "ref-1",
            title: "[click]",
            url: "javascript:alert(1)",
            source: "Synthetic",
            detail: "<img onerror=alert(1)>",
            observedAt: "bad",
          },
        ],
        analysis: {
          engine: "ai",
          hookHypothesis: "Hipótesis",
          adaptation: "Adaptación",
          citations: [
            { referenceId: "ref-1", support: "Cita vinculada" },
            { referenceId: "missing", support: "Cita huérfana" },
          ],
          limitations: ["Solo metadatos"],
        },
      }),
    ],
  });
  const output = exportMarkdown(value, { company: "<b>QA</b>", filters, now });
  assert.doesNotMatch(output, /<script>|<b>|<img|Cita huérfana/);
  assert.match(output, /&lt;script&gt;/);
  assert.match(output, /sin enlace verificable/);
  assert.match(output, /Cita vinculada/);
  assert.match(output, /Límite del análisis: Solo metadatos/);
  assert.equal(
    reportCitationUrl("https://user:password@example.com"),
    undefined,
  );
  assert.equal(reportCitationUrl("data:text/html,test"), undefined);
});

test("endpoints match the separate feedback and pilot routers and encode brand ids", () => {
  assert.equal(
    reportEndpoints.report("a/b"),
    "/api/brands/a%2Fb/research-report",
  );
  assert.equal(
    reportEndpoints.feedback("a"),
    "/api/brands/a/opportunity-feedback",
  );
  assert.equal(reportEndpoints.pilot("a"), "/api/brands/a/pilot-evaluation");
});

test("manual pilot input keeps unknown values null and real zero distinct", () => {
  const empty = reportPilotInput(
    { start: "2026-10-11", end: "2026-10-17" },
    "2026-10-18",
  );
  assert.deepEqual(empty, {
    origin: "manual",
    period: { start: "2026-10-11", end: "2026-10-17" },
    editorialMinutes: null,
    actualCost: { amount: null, currency: "USD" },
    results: { reviewed: null, useful: null, accepted: null },
  });
  const zero = reportPilotInput(
    {
      start: "2026-10-11",
      end: "2026-10-17",
      minutes: "0",
      cost: "0",
      reviewed: "0",
    },
    "2026-10-18",
  );
  assert.equal(zero.editorialMinutes, 0);
  assert.equal(zero.actualCost.amount, 0);
  assert.equal(zero.results.reviewed, 0);
  assert.equal(zero.results.useful, null);
  assert.equal("baseline" in zero, false);
});

test("pilot input rejects impossible dates, future periods and inconsistent aggregates", () => {
  const base = { start: "2026-10-11", end: "2026-10-17" };
  for (const patch of [
    { start: "2026-02-30" },
    { start: "2026-10-18" },
    { end: "2026-10-19" },
    { minutes: "-1" },
    { minutes: "Infinity" },
    { cost: "0.001" },
    { reviewed: "1.5" },
    { reviewed: "1", useful: "2" },
    { accepted: "3", useful: "2" },
    { accepted: "3", reviewed: "2" },
  ])
    assert.throws(() => reportPilotInput({ ...base, ...patch }, "2026-10-18"));
});
