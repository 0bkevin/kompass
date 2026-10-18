import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ChevronDown,
  Download,
  ExternalLink,
  FileText,
  RefreshCw,
} from "lucide-react";
import { Badge, Button, EmptyState, Field } from "../components/ui";
import { ProviderCredits } from "../components/ProviderCredits";
import { api, ApiError, json } from "../lib/api";
import { download, formatNames } from "../lib/format";
import type { Opportunity } from "../lib/journey-types";
import type { Brand } from "../lib/types";
import { useWorkspace } from "../lib/workspace";
import { ReportDraft } from "./ReportDraft";
import {
  exportMarkdown,
  isResearchReportStale,
  methodLabels,
  normalizeResearchReport,
  reportCitationUrl,
  reportDate,
  reportEndpoints,
  reportLimits,
  reportPilotInput,
  selectReportOpportunities,
  type ReportEndpoints,
  type ReportFeedback,
  type ReportFilters,
  type ReportFinding,
  type ReportMethod,
  type ResearchReport,
} from "../lib/challenge-report";
import "./challenge-report.css";

const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "No se pudo completar la solicitud. Inténtalo de nuevo.";

/** Uses the authenticated workspace. A new company always gets a fresh session. */
export default function ChallengeReport({
  endpoints = reportEndpoints,
}: {
  endpoints?: ReportEndpoints;
}) {
  const { state } = useWorkspace();
  return (
    <ReportSession
      key={state.brand.id}
      brand={state.brand}
      endpoints={endpoints}
    />
  );
}

function ReportSession({
  brand,
  endpoints,
}: {
  brand: Brand;
  endpoints: ReportEndpoints;
}) {
  const [report, setReport] = useState<ResearchReport>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [filters, setFilters] = useState<ReportFilters>({
    segmentId: "",
    method: "all",
  });
  const [exportError, setExportError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void api<unknown>(endpoints.report(brand.id), { signal: controller.signal })
      .then(normalizeResearchReport)
      .then((result) => {
        if (!controller.signal.aborted) setReport(result);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof ApiError && cause.status === 404
              ? "El informe todavía no está disponible para esta empresa. Vuelve a consultarlo más tarde."
              : message(cause),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [brand.id, endpoints, revision]);
  const selected = report ? selectReportOpportunities(report, filters) : [];
  const segmentName = brand.audience.find(
    (item) => item.id === filters.segmentId,
  )?.name;
  const stale = report ? isResearchReportStale(report) : false;
  const reload = () => setRevision((value) => value + 1);
  function exportReport() {
    if (!report) return;
    setExportError("");
    try {
      download(
        "kompass-informe-semanal.md",
        exportMarkdown(report, { company: brand.name, filters, segmentName }),
        "text/markdown;charset=utf-8",
      );
    } catch {
      setExportError("No se pudo descargar el informe. Inténtalo de nuevo.");
    }
  }
  return (
    <div className="challenge-report">
      <header className="report-header">
        <div>
          <h1>Informe semanal</h1>
          <p className="report-muted">
            {brand.name}
            {brand.market ? ` · ${brand.market}` : ""}
          </p>
        </div>
        <div className="report-actions">
          <Button onClick={reload} disabled={loading}>
            <RefreshCw size={16} aria-hidden="true" />
            {loading && report ? "Consultando…" : "Volver a consultar"}
          </Button>
          <Button
            variant="primary"
            disabled={!report || loading}
            onClick={exportReport}
          >
            <Download size={16} aria-hidden="true" />
            Exportar informe
          </Button>
        </div>
      </header>
      {(error || exportError) && (
        <p className="report-notice report-error" role="alert">
          {error || exportError}
          {report && error
            ? " Se conserva la última consulta de esta empresa."
            : ""}
        </p>
      )}
      {loading && !report ? (
        <div className="report-loading" role="status">
          <p>Consultando el informe…</p>
          <span />
          <span />
          <span />
        </div>
      ) : null}
      {!loading && !report && error ? (
        <EmptyState
          icon={<FileText />}
          title="Informe no disponible"
          action={<Button onClick={reload}>Reintentar</Button>}
        >
          Puedes volver a consultar sin cambiar la empresa.
        </EmptyState>
      ) : null}
      {report && (
        <>
          <div className="report-meta">
            <span>Generado: {reportDate(report.generatedAt)} · UTC</span>
            {report.isDemo && <Badge>Demostración</Badge>}
            {stale && <Badge tone="amber">Desactualizado</Badge>}
            {report.coverage.errors.length > 0 && (
              <Badge tone="amber">Cobertura parcial</Badge>
            )}
          </div>
          {stale && (
            <p className="report-notice" role="status">
              La fecha o el período del informe requiere una actualización.
              Vuelve a consultarlo antes de decidir.
            </p>
          )}
          {report.isDemo && (
            <p className="report-notice">
              Los ejemplos de demostración no representan resultados reales.
            </p>
          )}
          <section className="report-scope" aria-label="Alcance del informe">
            {report.scope.question && (
              <p className="report-question">{report.scope.question}</p>
            )}
            <dl>
              <div>
                <dt>Período del corpus</dt>
                <dd>
                  {reportDate(report.scope.period?.from)} a{" "}
                  {reportDate(report.scope.period?.to)}
                </dd>
              </div>
              <div>
                <dt>Referencias</dt>
                <dd>
                  {report.scope.counts?.selected ??
                    report.coverage.references ??
                    "No informado"}
                </dd>
              </div>
              <div>
                <dt>Con fecha de publicación</dt>
                <dd>
                  {report.scope.counts?.publicationDated ?? "No informado"}
                </dd>
              </div>
              <div>
                <dt>Solo fecha de observación</dt>
                <dd>
                  {report.scope.counts?.observationDated ?? "No informado"}
                </dd>
              </div>
            </dl>
            <details>
              <summary>Fuentes y límites de cobertura</summary>
              <div className="report-detail-content">
                <p>
                  Fuentes: {report.coverage.sources ?? "No informado"} ·
                  Activas: {report.coverage.activeSources ?? "No informado"}
                </p>
                <ul>
                  {[...report.coverage.notes, ...reportLimits].map(
                    (note, index) => (
                      <li key={index}>{note}</li>
                    ),
                  )}
                </ul>
                {report.coverage.errors.length > 0 && (
                  <div className="report-source-errors">
                    <h3>Fuentes con errores</h3>
                    <ul>
                      {report.coverage.errors.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </details>
          </section>
          <details className="report-evidence-disclosure">
            <summary>Historial y formatos observados</summary>
            <div className="report-findings-pair">
              <FindingSection
                title="Tendencias en las fuentes"
                items={report.trends}
                empty="Sin tendencias informadas para este período."
              />
              <FindingSection
                title="Formatos"
                items={report.formats}
                empty="Sin patrones de formato informados."
              />
            </div>
          </details>
          <section
            className="report-opportunities"
            aria-labelledby="report-opportunities-title"
          >
            <div className="report-section-heading">
              <h2 id="report-opportunities-title">Oportunidades priorizadas</h2>
              <span className="report-muted">
                {selected.length} de hasta 10
              </span>
            </div>
            <div className="report-filters">
              <Field label="Segmento">
                <select
                  value={filters.segmentId}
                  onChange={(event) =>
                    setFilters((previous) => ({
                      ...previous,
                      segmentId: event.target.value,
                    }))
                  }
                >
                  <option value="">Todos los segmentos</option>
                  {brand.audience.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Método">
                <select
                  value={filters.method}
                  onChange={(event) =>
                    setFilters((previous) => ({
                      ...previous,
                      method: event.target.value as ReportMethod,
                    }))
                  }
                >
                  {Object.entries(methodLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="report-muted report-filter-note">
              Prioridad editorial. Los filtros afectan esta lista; la cobertura
              corresponde al corpus completo.
            </p>
            <p className="report-sr-only" role="status">
              {selected.length} oportunidades con los filtros seleccionados.
            </p>
            {selected.length ? (
              <ol className="report-opportunity-list">
                {selected.map((item, index) => (
                  <li key={item.id}>
                    <OpportunityRow
                      opportunity={item}
                      rank={index + 1}
                      brand={brand}
                      segmentId={filters.segmentId}
                      endpoints={endpoints}
                      onSaved={reload}
                    />
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState
                icon={<FileText />}
                title={
                  report.opportunities.length
                    ? "Sin oportunidades para estos filtros"
                    : "Aún no hay oportunidades en este período"
                }
                action={
                  report.opportunities.length ? (
                    <Button
                      onClick={() =>
                        setFilters({ segmentId: "", method: "all" })
                      }
                    >
                      Restablecer filtros
                    </Button>
                  ) : undefined
                }
              >
                {report.opportunities.length
                  ? "Prueba otro segmento o método."
                  : "Revisa las fuentes y añade referencias públicas antes de volver a consultar. La lista no se completa sin evidencia."}
              </EmptyState>
            )}
          </section>
          <details className="report-evaluation-disclosure">
            <summary>Decisiones y evaluación del piloto</summary>
            <section
              className="report-review"
              aria-label="Validación, costos y piloto"
            >
              <FindingSection
                title="Validación editorial"
                items={report.validation}
                empty="Sin decisiones editoriales registradas."
              />
              <div className="report-costs">
                <h2>Costos</h2>
                <p>
                  {report.costs?.actualUsd !== undefined
                    ? `Costo informado: USD ${report.costs.actualUsd.toFixed(2)}.`
                    : "Costo real no informado."}
                </p>
                {report.costs?.reservedUsd !== undefined && (
                  <p className="report-muted">
                    Reserva: USD {report.costs.reservedUsd.toFixed(2)}. No
                    equivale a gasto real.
                  </p>
                )}
                {report.costs?.note && (
                  <p className="report-muted">{report.costs.note}</p>
                )}
              </div>
              <FindingSection
                title="Piloto"
                items={report.pilot}
                empty="Sin evaluación del piloto registrada."
              />
              {brand.role !== "reviewer" && (
                <PilotForm
                  key={brand.id}
                  brandId={brand.id}
                  endpoints={endpoints}
                  onSaved={reload}
                />
              )}
            </section>
          </details>
        </>
      )}
    </div>
  );
}

function FindingSection({
  title,
  items,
  empty,
}: {
  title: string;
  items: ReportFinding[];
  empty: string;
}) {
  return (
    <section className="report-findings">
      <h2>{title}</h2>
      {items.length ? (
        <ul>
          {items.map((item, index) => (
            <li key={index}>
              <strong>{item.title}</strong>
              {item.detail && <p className="report-muted">{item.detail}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="report-muted">{empty}</p>
      )}
    </section>
  );
}

function OpportunityRow({
  opportunity: item,
  rank,
  brand,
  segmentId,
  endpoints,
  onSaved,
}: {
  opportunity: Opportunity;
  rank: number;
  brand: Brand;
  segmentId: string;
  endpoints: ReportEndpoints;
  onSaved: () => void;
}) {
  const analysis = item.analysis;
  return (
    <details className="report-opportunity">
      <summary>
        <span className="report-rank" aria-hidden="true">
          {rank}
        </span>
        <span className="report-opportunity-heading">
          <strong>{item.title}</strong>
          <span className="report-muted">
            {item.suggestedFormat
              ? formatNames[item.suggestedFormat] || item.suggestedFormat
              : "Formato por definir"}
            {item.suggestedChannel ? ` · ${item.suggestedChannel}` : ""} ·{" "}
            {analysis ? "Análisis IA" : "Lectura local"}
            {item.isDemo ? " · Demostración" : ""}
          </span>
        </span>
        <ChevronDown className="report-chevron" size={18} aria-hidden="true" />
      </summary>
      <div className="report-opportunity-body">
        <div className="report-opportunity-copy">
          <h3>Hipótesis editorial</h3>
          <p>
            {analysis?.hookHypothesis ||
              item.hypothesis ||
              "Hipótesis pendiente de revisión."}
          </p>
          <h3>Adaptación para la empresa</h3>
          <p>
            {analysis?.adaptation ||
              item.adaptation ||
              "Adaptación pendiente de revisión."}
          </p>
          {analysis?.need && (
            <>
              <h3>Necesidad declarada</h3>
              <p>{analysis.need}</p>
            </>
          )}
          <h3>Historia comparable</h3>
          <p className="report-muted">
            {item.growth?.explanation || "Sin historial comparable informado."}
          </p>
          {item.reasons?.length > 0 && (
            <>
              <h3>Por qué se prioriza</h3>
              <ul>
                {item.reasons.map((reason, index) => (
                  <li key={index}>{reason}</li>
                ))}
              </ul>
            </>
          )}
          {(item.factors || []).length > 0 && (
            <>
              <h3>Factores observados</h3>
              <dl className="report-factors">
                {item.factors?.map((factor, index) => (
                  <div key={index}>
                    <dt>{factor.label}</dt>
                    <dd>
                      {factor.observation}
                      <p className="report-muted">{factor.limitation}</p>
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
        <div className="report-sources">
          <h3>Fuentes</h3>
          {item.evidence.length ? (
            <ul>
              {item.evidence.map((source, index) => {
                const url = reportCitationUrl(source.url);
                const quotes =
                  analysis?.citations.filter(
                    (quote) => quote.referenceId === source.referenceId,
                  ) || [];
                return (
                  <li key={`${source.referenceId}:${index}`}>
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer">
                        {source.title || source.referenceId}
                        <ExternalLink size={13} aria-hidden="true" />
                        <span className="report-sr-only">
                          {" "}
                          (abre en otra pestaña)
                        </span>
                      </a>
                    ) : (
                      <strong>{source.title || source.referenceId}</strong>
                    )}
                    <p className="report-muted">
                      {source.source || "Material aportado"} · Observada:{" "}
                      {reportDate(source.observedAt)}
                    </p>
                    <p>{source.detail}</p>
                    {quotes.map((quote, quoteIndex) => (
                      <blockquote key={quoteIndex}>{quote.support}</blockquote>
                    ))}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="report-muted">
              Sin fuentes citadas. Requiere evidencia antes de producir.
            </p>
          )}
          <ProviderCredits reference={item} />
          {analysis?.limitations?.length ? (
            <>
              <h3>Límites del análisis</h3>
              <ul>
                {analysis.limitations.map((limit, index) => (
                  <li key={index}>{limit}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
        {brand.role === "reviewer" ? (
          <p className="report-muted">
            Las decisiones editoriales las registra un editor de la empresa.
          </p>
        ) : (
          <FeedbackForm
            opportunity={item}
            brand={brand}
            segmentId={segmentId}
            endpoints={endpoints}
            onSaved={onSaved}
          />
        )}
        {brand.role !== "reviewer" && (
          <ReportDraft opportunity={item} selectedSegment={segmentId} />
        )}
      </div>
    </details>
  );
}

function useMutation() {
  const pending = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => () => pending.current?.abort(), []);
  async function save(
    path: string,
    body: unknown,
    onSaved: () => void,
  ): Promise<boolean> {
    if (pending.current) return false;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await api(path, {
        method: "POST",
        body: json(body),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return false;
      setSaved(true);
      onSaved();
      return true;
    } catch (cause) {
      if (!controller.signal.aborted) setError(message(cause));
      return false;
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null;
        setBusy(false);
      }
    }
  }
  return { busy, error, saved, save, setError };
}

function FeedbackForm({
  opportunity,
  brand,
  segmentId,
  endpoints,
  onSaved,
}: {
  opportunity: Opportunity;
  brand: Brand;
  segmentId: string;
  endpoints: ReportEndpoints;
  onSaved: () => void;
}) {
  const mutation = useMutation();
  const initialSegment =
    segmentId ||
    opportunity.segmentIds.find((id) =>
      brand.audience.some((item) => item.id === id),
    ) ||
    "";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body: ReportFeedback = {
      opportunityId: opportunity.id,
      referenceIds: opportunity.referenceIds,
      segmentId: String(form.get("segmentId") || ""),
      decision: String(form.get("decision")) as ReportFeedback["decision"],
    };
    await mutation.save(endpoints.feedback(brand.id), body, onSaved);
  }
  return (
    <form className="report-feedback" onSubmit={submit}>
      <h3>Decisión editorial</h3>
      <p className="report-muted">
        Evaluación del equipo sobre esta propuesta; no mide respuestas de
        consumidores.
      </p>
      <fieldset disabled={mutation.busy}>
        <legend className="report-sr-only">Registrar decisión editorial</legend>
        <Field label="Segmento de la decisión">
          <select
            key={initialSegment}
            name="segmentId"
            defaultValue={initialSegment}
            required
          >
            <option value="" disabled>
              Elegir segmento
            </option>
            {brand.audience.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Decisión">
          <select name="decision" required defaultValue="">
            <option value="" disabled>
              Elegir decisión
            </option>
            <option value="accepted">Aceptar propuesta</option>
            <option value="rejected">Descartar propuesta</option>
            <option value="needs_evidence">Pedir más evidencia</option>
          </select>
        </Field>
        <Button
          type="submit"
          busy={mutation.busy}
          disabled={!brand.audience.length || !opportunity.referenceIds?.length}
        >
          Guardar decisión
        </Button>
      </fieldset>
      {mutation.error && (
        <p className="report-error" role="alert">
          {mutation.error}
        </p>
      )}
      {mutation.saved && <p role="status">Decisión guardada.</p>}
    </form>
  );
}

function PilotForm({
  brandId,
  endpoints,
  onSaved,
}: {
  brandId: string;
  endpoints: ReportEndpoints;
  onSaved: () => void;
}) {
  const mutation = useMutation();
  const [dirty, setDirty] = useState(false);
  const { registerUnsavedChangesGuard } = useWorkspace();
  const guard = useRef({ dirty, busy: mutation.busy });
  guard.current = { dirty, busy: mutation.busy };
  useEffect(
    () =>
      registerUnsavedChangesGuard({
        isDirty: () => guard.current.dirty || guard.current.busy,
        confirmLeave: () =>
          !guard.current.busy &&
          (!guard.current.dirty ||
            window.confirm(
              "Hay cifras del piloto sin guardar. ¿Salir sin guardarlas?",
            )),
      }),
    [registerUnsavedChangesGuard],
  );
  const today = new Date().toISOString().slice(0, 10);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const fields = Object.fromEntries(
      [...new FormData(element)].map(([key, value]) => [key, String(value)]),
    );
    try {
      const body = reportPilotInput(fields);
      if (await mutation.save(endpoints.pilot(brandId), body, onSaved)) {
        setDirty(false);
        element.reset();
      }
    } catch (cause) {
      mutation.setError(message(cause));
    }
  }
  return (
    <details className="report-pilot-form">
      <summary>Registrar evaluación del piloto</summary>
      <form onSubmit={submit} onChange={() => setDirty(true)}>
        <p className="report-muted">
          Cifras agregadas declaradas manualmente. Los campos vacíos se guardan
          como desconocidos. Guardar el mismo período sustituye todas sus
          cifras.
        </p>
        <fieldset disabled={mutation.busy}>
          <legend className="report-sr-only">Cifras manuales del piloto</legend>
          <Field label="Desde">
            <input name="start" type="date" required max={today} />
          </Field>
          <Field label="Hasta">
            <input name="end" type="date" required max={today} />
          </Field>
          <Field label="Trabajo editorial (min)">
            <input
              name="minutes"
              type="number"
              min="0"
              max="1000000000"
              step="any"
              inputMode="decimal"
            />
          </Field>
          <Field label="Costo real (USD)">
            <input
              name="cost"
              type="number"
              min="0"
              max="1000000000"
              step="0.01"
              inputMode="decimal"
            />
          </Field>
          {[
            ["reviewed", "Referencias revisadas"],
            ["useful", "Referencias útiles"],
            ["accepted", "Referencias aceptadas"],
          ].map(([name, label]) => (
            <Field key={name} label={label}>
              <input
                name={name}
                type="number"
                min="0"
                max="1000000000"
                step="1"
                inputMode="numeric"
              />
            </Field>
          ))}
        </fieldset>
        <p className="report-muted">
          Aceptadas ≤ útiles ≤ revisadas. Sin línea base no se calcula ahorro.
        </p>
        <Button type="submit" busy={mutation.busy} disabled={!dirty}>
          Guardar evaluación manual
        </Button>
        {mutation.error && (
          <p className="report-error" role="alert">
            {mutation.error}
          </p>
        )}
        {mutation.saved && <p role="status">Evaluación guardada.</p>}
      </form>
    </details>
  );
}
