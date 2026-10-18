import type { Opportunity } from "./journey-types";
import { formatProviderAttributions } from "./provider-attribution.mjs";

export type ReportMethod = "all" | "heuristic" | "ai";
export interface ReportFilters {
  segmentId: string;
  method: ReportMethod;
}
export interface ReportFinding {
  title: string;
  detail: string;
}
export interface ResearchReport {
  generatedAt: string;
  isDemo?: boolean;
  stale?: boolean;
  scope: {
    company?: string;
    market?: string;
    question?: string;
    period?: { from?: string; to?: string; days?: number };
    counts?: Record<string, number>;
  };
  coverage: {
    references?: number;
    sources?: number;
    activeSources?: number;
    errors: string[];
    notes: string[];
  };
  trends: ReportFinding[];
  formats: ReportFinding[];
  opportunities: Opportunity[];
  validation: ReportFinding[];
  pilot: ReportFinding[];
  costs?: { actualUsd?: number; reservedUsd?: number; note?: string };
}

export interface ReportFeedback {
  opportunityId: string;
  referenceIds: string[];
  segmentId: string;
  decision: "accepted" | "rejected" | "needs_evidence";
}
export interface ReportPilot {
  origin: "manual";
  period: { start: string; end: string };
  editorialMinutes: number | null;
  actualCost: { amount: number | null; currency: "USD" };
  results: {
    reviewed: number | null;
    useful: number | null;
    accepted: number | null;
  };
}
export interface ReportEndpoints {
  report: (brandId: string) => string;
  feedback: (brandId: string) => string;
  pilot: (brandId: string) => string;
}
const base = (brandId: string) =>
  `/api/brands/${encodeURIComponent(brandId)}/research-report`;
export const reportEndpoints: ReportEndpoints = {
  report: base,
  feedback: (brandId) =>
    `/api/brands/${encodeURIComponent(brandId)}/opportunity-feedback`,
  pilot: (brandId) =>
    `/api/brands/${encodeURIComponent(brandId)}/pilot-evaluation`,
};

export function reportPilotInput(
  fields: Record<string, string>,
  today = new Date().toISOString().slice(0, 10),
): ReportPilot {
  const { start, end } = fields;
  if (
    ![start, end].every(
      (date) =>
        /^\d{4}-\d{2}-\d{2}$/.test(date || "") &&
        Number.isFinite(Date.parse(date)) &&
        new Date(date).toISOString().slice(0, 10) === date,
    ) ||
    start > end ||
    end > today
  )
    throw new Error("Indica un período válido, ordenado y sin fechas futuras.");
  const measurement = (key: string, integer = false): number | null => {
    if (!fields[key]?.trim()) return null;
    const value = Number(fields[key]);
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > 1_000_000_000 ||
      (integer && !Number.isInteger(value))
    )
      throw new Error(
        "Las cifras deben ser no negativas; las referencias se cuentan con enteros.",
      );
    return value;
  };
  const results = {
    reviewed: measurement("reviewed", true),
    useful: measurement("useful", true),
    accepted: measurement("accepted", true),
  };
  for (const [subset, total] of [
    [results.useful, results.reviewed],
    [results.accepted, results.useful],
    [results.accepted, results.reviewed],
  ])
    if (subset !== null && total !== null && subset > total)
      throw new Error(
        "Las referencias deben cumplir aceptadas ≤ útiles ≤ revisadas.",
      );
  const amount = measurement("cost");
  if (amount !== null && Number(amount.toFixed(2)) !== amount)
    throw new Error("El costo en USD admite hasta dos decimales.");
  return {
    origin: "manual",
    period: { start, end },
    editorialMinutes: measurement("minutes"),
    actualCost: { amount, currency: "USD" },
    results,
  };
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown) => (typeof value === "string" ? value : "");
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
const stringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/** Adapter for helper summaries. Only explicit text/primitive fields are shown. */
export function normalizeReportFindings(value: unknown): ReportFinding[] {
  if (typeof value === "string") return [{ title: value, detail: "" }];
  if (Array.isArray(value))
    return value.flatMap((item) => {
      if (typeof item === "string") return [{ title: item, detail: "" }];
      if (!record(item)) return [];
      const title =
        text(item.title) ||
        text(item.label) ||
        text(item.topic) ||
        text(item.format) ||
        text(item.name);
      const detail =
        text(item.detail) ||
        text(item.summary) ||
        text(item.explanation) ||
        text(item.reason) ||
        text(item.note);
      return title || detail
        ? [{ title: title || detail, detail: title ? detail : "" }]
        : [];
    });
  if (!record(value)) return [];
  const nested = value.items ?? value.findings ?? value.summary;
  if (nested !== undefined) return normalizeReportFindings(nested);
  return Object.entries(value).flatMap(([key, item]) => {
    if (typeof item === "string") return [{ title: key, detail: item }];
    if (finite(item)) return [{ title: key, detail: String(item) }];
    return [];
  });
}

/** The envelope is validated at the boundary; Opportunity is buildInsights' contract. */
export function normalizeResearchReport(value: unknown): ResearchReport {
  if (
    !record(value) ||
    !Array.isArray(value.opportunities) ||
    typeof value.generatedAt !== "string"
  )
    throw new Error(
      "El informe tiene un formato inesperado. Vuelve a consultarlo.",
    );
  for (const item of value.opportunities) {
    if (
      !record(item) ||
      typeof item.id !== "string" ||
      typeof item.title !== "string" ||
      !stringArray(item.segmentIds) ||
      !stringArray(item.referenceIds) ||
      !stringArray(item.reasons) ||
      typeof item.hypothesis !== "string" ||
      typeof item.adaptation !== "string" ||
      !Array.isArray(item.evidence) ||
      !item.evidence.every(
        (source) =>
          record(source) &&
          [
            source.referenceId,
            source.title,
            source.source,
            source.detail,
          ].every((value) => typeof value === "string") &&
          (source.url === undefined || typeof source.url === "string") &&
          (source.observedAt === undefined ||
            typeof source.observedAt === "string"),
      ) ||
      (item.growth !== undefined &&
        (!record(item.growth) ||
          typeof item.growth.explanation !== "string")) ||
      (item.factors !== undefined &&
        (!Array.isArray(item.factors) ||
          !item.factors.every(
            (factor) =>
              record(factor) &&
              [factor.label, factor.observation, factor.limitation].every(
                (value) => typeof value === "string",
              ),
          ))) ||
      (item.analysis !== undefined &&
        (!record(item.analysis) ||
          item.analysis.engine !== "ai" ||
          ![item.analysis.hookHypothesis, item.analysis.adaptation].every(
            (value) => typeof value === "string",
          ) ||
          !stringArray(item.analysis.limitations) ||
          !Array.isArray(item.analysis.citations) ||
          !item.analysis.citations.every(
            (quote) =>
              record(quote) &&
              typeof quote.referenceId === "string" &&
              typeof quote.support === "string",
          )))
    )
      throw new Error(
        "Una oportunidad del informe está incompleta. Vuelve a consultarlo.",
      );
  }
  const scope = record(value.scope) ? value.scope : {};
  const coverage = record(value.coverage) ? value.coverage : {};
  const period = record(scope.period) ? scope.period : undefined;
  const counts = record(scope.counts)
    ? (Object.fromEntries(
        Object.entries(scope.counts).filter(([, n]) => finite(n)),
      ) as Record<string, number>)
    : undefined;
  const costs = record(value.costs) ? value.costs : undefined;
  return {
    generatedAt: value.generatedAt,
    isDemo: value.isDemo === true,
    stale: value.stale === true,
    scope: {
      company: text(scope.company) || undefined,
      market: text(scope.market) || undefined,
      question: text(scope.question) || undefined,
      period: period
        ? {
            from: text(period.from),
            to: text(period.to),
            days: finite(period.days) ? period.days : undefined,
          }
        : undefined,
      counts,
    },
    coverage: {
      references: finite(coverage.references) ? coverage.references : undefined,
      sources: finite(coverage.sources) ? coverage.sources : undefined,
      activeSources: finite(coverage.activeSources)
        ? coverage.activeSources
        : undefined,
      errors: strings(coverage.errors),
      notes: strings(coverage.notes),
    },
    trends: normalizeReportFindings(value.trends),
    formats: normalizeReportFindings(value.formats),
    opportunities: value.opportunities as Opportunity[],
    validation: normalizeReportFindings(value.validation),
    pilot: normalizeReportFindings(value.pilot),
    costs: costs
      ? {
          actualUsd: finite(costs.actualUsd) ? costs.actualUsd : undefined,
          reservedUsd: finite(costs.reservedUsd)
            ? costs.reservedUsd
            : undefined,
          note: text(costs.note) || undefined,
        }
      : undefined,
  };
}

export const methodLabels: Record<ReportMethod, string> = {
  all: "Todos los métodos",
  heuristic: "Lectura local",
  ai: "Con análisis IA",
};

export function selectReportOpportunities(
  report: ResearchReport,
  filters: ReportFilters,
): Opportunity[] {
  return report.opportunities
    .filter(
      (item) =>
        !filters.segmentId || item.segmentIds.includes(filters.segmentId),
    )
    .filter(
      (item) =>
        filters.method === "all" ||
        (filters.method === "ai"
          ? item.analysis?.engine === "ai"
          : item.analysis?.engine !== "ai"),
    )
    .sort(
      (a, b) =>
        (Number.isFinite(b.relevance) ? b.relevance : -1) -
          (Number.isFinite(a.relevance) ? a.relevance : -1) ||
        a.title.localeCompare(b.title, "es"),
    )
    .slice(0, 10);
}

export function isResearchReportStale(
  report: ResearchReport,
  now = Date.now(),
): boolean {
  const generated = Date.parse(report.generatedAt);
  const periodEnd = report.scope.period?.to
    ? Date.parse(report.scope.period.to)
    : generated;
  return (
    report.stale === true ||
    !Number.isFinite(generated) ||
    !Number.isFinite(periodEnd) ||
    generated > now + 300_000 ||
    now - Math.min(generated, periodEnd) > 7 * 86_400_000
  );
}

export function reportDate(value?: string): string {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("es", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(date)
    : "Fecha no disponible";
}

export function reportCitationUrl(value?: string): string | undefined {
  try {
    const url = new URL(value || "");
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export const reportLimits = [
  "Prioridad editorial; no es una clasificación de crecimiento ni una predicción de éxito.",
  "HN, GDELT y Trends aportan señales de fuentes distintas; no representan cobertura de redes sociales.",
  "Sin fecha de publicación, la fecha de observación solo indica cuándo se capturó la referencia.",
  "Los datos oficiales de YouTube permanecen en social-sync, separados del análisis editorial.",
];

// Escape Markdown and raw HTML from public titles, excerpts and company input.
const md = (value: unknown) =>
  text(value)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_[\]{}()#!|])/g, "\\$1");
const citation = (title: string, url?: string) => {
  const safe = reportCitationUrl(url);
  return safe
    ? `[${md(title)}](<${safe.replace(/[<>]/g, (c) => encodeURIComponent(c))}>)`
    : `${md(title)} (sin enlace verificable)`;
};

export function exportMarkdown(
  report: ResearchReport,
  options: {
    company: string;
    filters: ReportFilters;
    segmentName?: string;
    now?: number;
  },
): string {
  const opportunities = selectReportOpportunities(report, options.filters);
  const lines = [
    `# Informe semanal · ${md(options.company)}`,
    report.isDemo
      ? "Material de demostración. No representa resultados reales."
      : "",
    `Generado: ${md(report.generatedAt)}. Fechas en UTC.`,
    isResearchReportStale(report, options.now)
      ? "Aviso: informe desactualizado o sin fecha válida. Vuelve a consultarlo antes de decidir."
      : "",
    `Período del corpus: ${reportDate(report.scope.period?.from)} a ${reportDate(report.scope.period?.to)}.`,
    `Mercado: ${md(report.scope.market) || "No indicado"}.`,
    `Segmento: ${md(options.segmentName) || (options.filters.segmentId ? md(options.filters.segmentId) : "Todos")}. Método: ${methodLabels[options.filters.method]}.`,
    "Los filtros afectan las oportunidades; cobertura y resúmenes corresponden al corpus completo.",
    report.scope.question ? `Pregunta: ${md(report.scope.question)}` : "",
    "",
    "## Cobertura",
    `Referencias: ${report.coverage.references ?? "No informado"}. Fuentes: ${report.coverage.sources ?? "No informado"}.`,
    ...Object.entries(report.scope.counts || {}).map(
      ([key, n]) => `- ${md(key)}: ${n}`,
    ),
    ...report.coverage.notes.map((note) => `- ${md(note)}`),
    ...report.coverage.errors.map((error) => `- Error de fuente: ${md(error)}`),
  ];
  const findings = (title: string, items: ReportFinding[]) =>
    lines.push(
      "",
      `## ${title}`,
      ...(items.length
        ? items.map(
            (item) =>
              `- ${md(item.title)}${item.detail ? `: ${md(item.detail)}` : ""}`,
          )
        : ["Sin datos informados."]),
    );
  findings("Tendencias en las fuentes", report.trends);
  findings("Formatos", report.formats);
  lines.push("", `## Oportunidades priorizadas (${opportunities.length})`);
  if (!opportunities.length)
    lines.push(
      "No hay oportunidades con estos filtros. No se completan posiciones sin evidencia.",
    );
  for (const [index, item] of opportunities.entries()) {
    lines.push(
      "",
      `### ${index + 1}. ${md(item.title)}`,
      item.isDemo ? "Ejemplo de demostración." : "",
      `Método: ${item.analysis?.engine === "ai" ? "Análisis IA" : "Lectura local"}.`,
      `Hipótesis editorial: ${md(item.analysis?.hookHypothesis || item.hypothesis) || "No informada"}`,
      `Adaptación: ${md(item.analysis?.adaptation || item.adaptation) || "Pendiente de revisión"}`,
      `Historia comparable: ${md(item.growth?.explanation) || "Sin historial informado"}`,
      ...(item.reasons || []).map((reason) => `- Prioridad: ${md(reason)}`),
      ...(item.factors || []).map(
        (factor) =>
          `- ${md(factor.label)}: ${md(factor.observation)}. Límite: ${md(factor.limitation)}`,
      ),
      "",
      "Fuentes:",
      ...(item.evidence.length
        ? item.evidence.map(
            (source) =>
              `- ${citation(source.title || source.referenceId, source.url)} · ${md(source.source)} · Observada: ${reportDate(source.observedAt)}. ${md(source.detail)}`,
          )
        : ["- Sin fuentes citadas."]),
    );
    for (const quote of item.analysis?.citations || []) {
      if (
        item.evidence.some((source) => source.referenceId === quote.referenceId)
      )
        lines.push(
          `- Cita vinculada a ${md(quote.referenceId)}: «${md(quote.support)}»`,
        );
    }
    const credits = formatProviderAttributions(item);
    if (credits) lines.push(credits);
    for (const limitation of item.analysis?.limitations || [])
      lines.push(`- Límite del análisis: ${md(limitation)}`);
  }
  findings("Validación", report.validation);
  findings("Piloto", report.pilot);
  lines.push(
    "",
    "## Costos",
    report.costs?.actualUsd !== undefined
      ? `Costo informado: USD ${report.costs.actualUsd.toFixed(2)}.`
      : "Costo real no informado.",
    report.costs?.reservedUsd !== undefined
      ? `Reserva informada: USD ${report.costs.reservedUsd.toFixed(2)}; no equivale a gasto real.`
      : "",
    md(report.costs?.note),
    "",
    "## Limitaciones",
    ...reportLimits.map((limit) => `- ${limit}`),
  );
  return (
    lines.filter((line, index) => line || lines[index - 1]).join("\n") + "\n"
  );
}
