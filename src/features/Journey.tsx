import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Globe2,
  Info,
  Plus,
  RefreshCw,
  Search,
  Target,
  Trash2,
  Users,
} from "lucide-react";
import { Badge, Button, EmptyState, Field } from "../components/ui";
import { api, json } from "../lib/api";
import type { AudienceEvidenceResource } from "../lib/audience-evidence";
import { formatNames, pieceStatusLabel, safeExternalUrl } from "../lib/format";
import { safeAudienceEvidenceUrl } from "../lib/evidence-url.mjs";
import { opportunityDraftReferenceId } from "../lib/opportunity-draft-reference";
import type {
  AudienceSignal,
  Insights,
  Inspection,
  Opportunity,
  OpportunityAnalysis,
  Outcome,
} from "../lib/journey-types";
import type { Brand, Piece, View } from "../lib/types";
import { useWorkspace } from "../lib/workspace";
import { ProviderCredits } from "../components/ProviderCredits";
import { AudiencePage, BrandPage } from "./Brand";
import "./journey.css";
import { WorkspacePreparation } from "./WorkspacePreparation";
import { AutomaticMetrics } from "./SocialConnections";

const channelNames: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};
const confidenceNames = { low: "Limitada", medium: "Media", high: "Alta" };
const growthStates: Record<
  Opportunity["growth"]["label"],
  { label: string; tone: string }
> = {
  observed: { label: "Crecimiento observado", tone: "green" },
  early_signal: { label: "Señal inicial", tone: "neutral" },
  stable: { label: "Frecuencia sin cambios", tone: "neutral" },
  declining: { label: "Descenso observado", tone: "amber" },
  insufficient: { label: "Sin historial suficiente", tone: "neutral" },
};
const evidenceNames = {
  read: "Contenido leído",
  linked: "Solo enlace",
  provided: "Texto aportado",
  failed: "No se pudo leer",
};
const number = (value: number) => new Intl.NumberFormat("es").format(value);
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Ocurrió un problema. Inténtalo de nuevo.";

function readableDate(value?: string, withTime = false) {
  if (!value || Number.isNaN(new Date(value).getTime()))
    return "Fecha no disponible";
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

function localDateTime(value?: string) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function useBrandScope(brandId: string) {
  const active = useRef<string | null>(brandId);
  active.current = brandId;
  useEffect(() => {
    active.current = brandId;
    return () => {
      active.current = null;
    };
  }, [brandId]);
  return active;
}

function handleTabKeys(event: KeyboardEvent<HTMLDivElement>) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  );
  const current = tabs.indexOf(event.target as HTMLButtonElement);
  if (current < 0 || tabs.length < 2) return;
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
          tabs.length;
  tabs[next].focus();
  tabs[next].click();
}

/** Never expose a previous company's response, including the render before an effect runs. */
function useBrandResource<T>(path: string) {
  const { state } = useWorkspace();
  const brandId = state.brand.id;
  const resourceKey = `${brandId}:${path}`;
  const currentKey = useRef(resourceKey);
  currentKey.current = resourceKey;
  const [revision, setRevision] = useState(0);
  const [resource, setResource] = useState<{
    key: string;
    data?: T;
    error: string;
    loading: boolean;
  }>({ key: resourceKey, error: "", loading: true });
  useEffect(() => {
    const controller = new AbortController();
    setResource((previous) => ({
      key: resourceKey,
      data: previous.key === resourceKey ? previous.data : undefined,
      error: "",
      loading: true,
    }));
    void api<T>(`/api/brands/${brandId}/${path}`, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted && currentKey.current === resourceKey)
          setResource({ key: resourceKey, data, error: "", loading: false });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && currentKey.current === resourceKey)
          setResource((previous) => ({
            key: resourceKey,
            data: previous.key === resourceKey ? previous.data : undefined,
            error: errorMessage(error),
            loading: false,
          }));
      });
    return () => controller.abort();
  }, [brandId, path, resourceKey, revision, state]);
  return {
    data: resource.key === resourceKey ? resource.data : undefined,
    error: resource.key === resourceKey ? resource.error : "",
    loading: resource.key !== resourceKey || resource.loading,
    reload: useCallback(() => setRevision((value) => value + 1), []),
  };
}

function useFormGuard(dirty: boolean, busy: boolean) {
  const { registerUnsavedChangesGuard, notify } = useWorkspace();
  const draftRef = useRef({ dirty, busy, notify });
  draftRef.current = { dirty, busy, notify };
  useEffect(
    () =>
      registerUnsavedChangesGuard({
        isDirty: () => draftRef.current.dirty || draftRef.current.busy,
        confirmLeave: () => {
          if (draftRef.current.busy) {
            draftRef.current.notify(
              "Espera a que termine el guardado antes de salir.",
              "error",
            );
            return false;
          }
          return window.confirm(
            "Hay cambios sin guardar. ¿Salir y descartarlos?",
          );
        },
      }),
    [registerUnsavedChangesGuard],
  );
  return () => {
    draftRef.current = { ...draftRef.current, dirty: false, busy: false };
  };
}

function JourneyHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading journey-heading">
      <div>
        <h1>{title}</h1>
      </div>
      {action}
    </div>
  );
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="journey-error" role="alert">
      <div>
        <strong>No pudimos actualizar esta información</strong>
        <p>{message}</p>
      </div>
      <Button onClick={retry}>
        <RefreshCw size={15} />
        Reintentar
      </Button>
    </div>
  );
}

function Skeleton({ label = "Cargando información…" }: { label?: string }) {
  return (
    <div className="journey-skeleton" role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div />
      <div />
      <div />
    </div>
  );
}

function Notice({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success";
}) {
  return (
    <div className={`journey-notice ${tone}`}>
      <Info size={17} />
      <div>{children}</div>
    </div>
  );
}

function ReviewerNotice() {
  return <Notice>Acceso de revisor: lectura y aprobación de piezas.</Notice>;
}

function CoverNote({
  insights,
  navigate,
}: {
  insights: Insights;
  navigate: (view: View) => void;
}) {
  return (
    <details className="journey-coverage">
      <summary>
        <Info size={15} />
        <span>
          {insights.coverage.references} referencias ·{" "}
          {insights.coverage.activeSources} fuentes activas
        </span>
        <ChevronDown size={15} />
      </summary>
      <div>
        {!insights.coverage.hasHistory && <p>Sin historial comparable.</p>}
        {insights.coverage.errors.length > 0 && (
          <>
            <strong>Fuentes que necesitan atención</strong>
            <ul>
              {insights.coverage.errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
            <Button onClick={() => navigate("settings")}>
              Revisar fuentes
            </Button>
          </>
        )}
        <small>Actualizado {readableDate(insights.generatedAt, true)}</small>
      </div>
    </details>
  );
}

export function Home() {
  const { state, navigate } = useWorkspace();
  const insights = useBrandResource<Insights>("insights");
  const { brand, pieces } = state;
  const references = state.references.filter(
    (reference) => reference.status !== "dismissed",
  );
  const drafts = pieces.filter((piece) => piece.status === "draft");
  const review = pieces.filter((piece) => piece.status === "review");
  const approved = pieces.filter((piece) => piece.status === "approved");
  const scheduled = pieces.filter((piece) => piece.status === "scheduled");
  const published = pieces.filter((piece) => piece.status === "published");
  const hasContext =
    insights.data?.workflow.context ??
    Boolean(brand.description && brand.pillars.length);
  const hasAudience = brand.audience.length > 0;
  const outcomes = insights.data?.learning.outcomes || [];
  const relevantOpportunities = (insights.data?.opportunities || []).filter(
    (item) => item.segmentIds.length || item.analysis?.segmentIds.length,
  );
  const reviewer = brand.role === "reviewer";
  type Next = {
    title: string;
    action: string;
    view: View;
    pieceId?: string;
  };
  const next: Next = reviewer
    ? review[0]
      ? {
          title: "Pendiente de revisión",
          action: "Revisar contenido",
          view: "studio",
          pieceId: review[0].id,
        }
      : {
          title: "Sin piezas por revisar",
          action: "Ver oportunidades",
          view: "opportunities",
        }
    : !hasContext
      ? {
          title: "Contexto incompleto",
          action: "Completar contexto",
          view: "brand",
        }
      : !hasAudience
        ? {
            title: "Sin audiencia",
            action: "Definir audiencia",
            view: "audience",
          }
        : !references.length
          ? {
              title: "Sin referencias",
              action: "Descubrir contenido",
              view: "radar",
            }
          : drafts[0]
            ? {
                title: drafts[0].title,
                action: "Continuar borrador",
                view: "studio",
                pieceId: drafts[0].id,
              }
            : review[0]
              ? {
                  title: "Pendiente de aprobación",
                  action: "Abrir revisión",
                  view: "studio",
                  pieceId: review[0].id,
                }
              : approved[0]
                ? {
                    title: "Pieza aprobada sin fecha",
                    action: "Planificar publicación",
                    view: "calendar",
                  }
                : scheduled.length && !outcomes.length
                  ? {
                      title: "Piezas programadas",
                      action: "Abrir calendario",
                      view: "calendar",
                    }
                  : published.length && !outcomes.length
                    ? {
                        title: "Sin resultados registrados",
                        action: "Registrar resultados",
                        view: "results",
                      }
                    : {
                        title: "Oportunidades disponibles",
                        action: "Explorar oportunidades",
                        view: "opportunities",
                      };
  const steps: { title: string; detail: string; view: View; done: boolean }[] =
    [
      {
        title: "Contexto",
        detail: hasContext ? "Completo" : "Incompleto",
        view: "brand",
        done: hasContext,
      },
      {
        title: "Audiencia",
        detail: `${brand.audience.length} ${brand.audience.length === 1 ? "perfil definido" : "perfiles definidos"}`,
        view: "audience",
        done: hasAudience,
      },
      {
        title: "Descubrimiento",
        detail: `${references.length} referencias disponibles`,
        view: "opportunities",
        done: references.length > 0,
      },
      {
        title: "Creación y revisión",
        detail: `${drafts.length} ${drafts.length === 1 ? "borrador" : "borradores"} · ${review.length} en revisión`,
        view: "studio",
        done: approved.length + scheduled.length + published.length > 0,
      },
      {
        title: "Calendario",
        detail: `${scheduled.length} ${scheduled.length === 1 ? "programada" : "programadas"} · ${published.length} ${published.length === 1 ? "envío registrado" : "envíos registrados"}`,
        view: "calendar",
        done: scheduled.length + published.length > 0,
      },
      {
        title: "Resultados",
        detail: `${outcomes.length} ${outcomes.length === 1 ? "registro manual" : "registros manuales"}`,
        view: "results",
        done: outcomes.length > 0,
      },
    ];
  return (
    <div className="page journey-page">
      <JourneyHeader title="Inicio" />
      <section className="journey-next" aria-labelledby="next-action-heading">
        <div className="journey-next-action">
          <h2 id="next-action-heading">{next.title}</h2>
          <Button
            variant="primary"
            onClick={() => navigate(next.view, next.pieceId)}
          >
            {next.action}
            <ArrowRight size={17} />
          </Button>
        </div>
        <dl
          className="journey-editorial-context"
          aria-label="Criterios de tu contenido"
        >
          <div>
            <dt>Audiencia</dt>
            <dd>{brand.audience[0]?.name || "Sin definir"}</dd>
          </div>
          <div>
            <dt>Temas</dt>
            <dd>{brand.pillars.slice(0, 3).join(" · ") || "Sin definir"}</dd>
          </div>
          <div>
            <dt>Referencias</dt>
            <dd>{references.length ? number(references.length) : "0"}</dd>
          </div>
        </dl>
      </section>
      <WorkspacePreparation enabled={!reviewer && hasContext && hasAudience} />
      <section className="journey-section" aria-labelledby="workflow-heading">
        <div className="section-heading">
          <h2 id="workflow-heading">Estado del contenido</h2>
          <span className="journey-muted">
            {steps.filter((step) => step.done).length} de {steps.length} etapas
            con actividad
          </span>
        </div>
        <ol className="journey-steps">
          {steps.map((step, index) => (
            <li key={step.title}>
              <button
                onClick={() => navigate(step.view)}
                data-complete={step.done || undefined}
                data-current={next.view === step.view || undefined}
              >
                <span
                  className="journey-step-state"
                  aria-label={
                    step.done ? "Con actividad" : `Etapa ${index + 1}`
                  }
                >
                  {step.done ? (
                    <Check size={14} aria-hidden="true" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span>
                  <strong>{step.title}</strong>
                  <small>{step.detail}</small>
                </span>
                <ArrowRight size={16} />
              </button>
            </li>
          ))}
        </ol>
      </section>
      <div className="journey-home-columns">
        <section className="journey-section" aria-labelledby="desk-heading">
          <div className="section-heading">
            <h2 id="desk-heading">Piezas</h2>
            <Button variant="ghost" onClick={() => navigate("studio")}>
              Abrir estudio
              <ArrowUpRight size={15} />
            </Button>
          </div>
          {pieces.length ? (
            <div className="journey-work-list">
              {[...review, ...drafts, ...approved, ...scheduled, ...published]
                .slice(0, 5)
                .map((piece) => (
                  <button
                    key={piece.id}
                    onClick={() => navigate("studio", piece.id)}
                  >
                    <FileText size={18} />
                    <span>
                      <strong>{piece.title}</strong>
                      <small>
                        {formatNames[piece.format]} ·{" "}
                        {channelNames[piece.channel]}
                      </small>
                    </span>
                    <Badge
                      tone={piece.status === "review" ? "amber" : "neutral"}
                    >
                      {pieceStatusLabel(piece)}
                    </Badge>
                  </button>
                ))}
            </div>
          ) : (
            <div className="journey-quiet-empty">
              <FileText size={25} />
              <h3>No hay piezas</h3>
              <Button onClick={() => navigate("opportunities")}>
                Ver oportunidades
                <ArrowRight size={15} />
              </Button>
            </div>
          )}
        </section>
        <section
          className="journey-section"
          aria-labelledby="priorities-heading"
        >
          <div className="section-heading">
            <h2 id="priorities-heading">Oportunidades</h2>
          </div>
          {insights.error && (
            <LoadError message={insights.error} retry={insights.reload} />
          )}
          {insights.loading && !insights.data ? (
            <Skeleton />
          ) : relevantOpportunities.length ? (
            <div className="journey-shortlist">
              {relevantOpportunities.slice(0, 3).map((opportunity) => (
                <button
                  key={opportunity.id}
                  onClick={() => navigate("opportunities")}
                >
                  <strong>{opportunity.title}</strong>
                  <small>
                    {growthStates[opportunity.growth.label].label}
                    <ArrowRight size={15} />
                  </small>
                </button>
              ))}
              <ProviderCredits
                reference={{
                  evidence: relevantOpportunities
                    .slice(0, 3)
                    .flatMap((opportunity) => opportunity.evidence),
                }}
              />
            </div>
          ) : !insights.error ? (
            <div className="journey-quiet-empty">
              <Search size={25} />
              <h3>No hay oportunidades</h3>
              <Button onClick={() => navigate("radar")}>
                Explorar referencias
              </Button>
            </div>
          ) : null}
        </section>
      </div>
      {insights.data && (
        <CoverNote insights={insights.data} navigate={navigate} />
      )}
    </div>
  );
}

export function Opportunities() {
  const { state, navigate } = useWorkspace();
  const insights = useBrandResource<Insights>("insights");
  const [segment, setSegment] = useState("");
  const [query, setQuery] = useState("");
  const [includeUnmatched, setIncludeUnmatched] = useState(false);
  const [expanded, setExpanded] = useState("");
  useEffect(() => {
    setSegment("");
    setQuery("");
    setExpanded("");
    setIncludeUnmatched(false);
  }, [state.brand.id]);
  const terms = query.trim().toLocaleLowerCase();
  const opportunities = (insights.data?.opportunities || []).filter(
    (opportunity) =>
      (includeUnmatched ||
        opportunity.segmentIds.length > 0 ||
        !!opportunity.analysis?.segmentIds.length) &&
      (!segment ||
        opportunity.segmentIds.includes(segment) ||
        opportunity.analysis?.segmentIds.includes(segment)) &&
      (!terms ||
        `${opportunity.title} ${opportunity.topic} ${opportunity.adaptation} ${opportunity.reasons.join(" ")}`
          .toLocaleLowerCase()
          .includes(terms)),
  );
  return (
    <div className="page journey-page">
      <JourneyHeader
        title="Oportunidades"
        action={
          <Button onClick={() => navigate("radar")}>
            <Search size={16} />
            Descubrir referencias
          </Button>
        }
      />
      {state.brand.role === "reviewer" && <ReviewerNotice />}
      <details className="journey-opportunity-filters">
        <summary>
          <ChevronDown size={16} aria-hidden="true" />
          Filtros
          {(segment || query.trim() || includeUnmatched) && (
            <span>Activos</span>
          )}
        </summary>
        <div className="journey-filters">
          <Field label="Audiencia">
            <select
              value={segment}
              onChange={(event) => setSegment(event.target.value)}
            >
              <option value="">Todas las audiencias</option>
              {state.brand.audience.map((audience) => (
                <option key={audience.id} value={audience.id}>
                  {audience.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Buscar oportunidad">
            <div className="journey-search">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tema, necesidad o enfoque"
              />
            </div>
          </Field>
          <Button busy={insights.loading} onClick={insights.reload}>
            <RefreshCw size={15} />
            Actualizar
          </Button>
        </div>
        <label className="journey-unmatched">
          <input
            type="checkbox"
            checked={includeUnmatched}
            onChange={(event) => setIncludeUnmatched(event.target.checked)}
          />
          Mostrar también temas sin coincidencia con mi audiencia
        </label>
      </details>
      {insights.error && (
        <LoadError message={insights.error} retry={insights.reload} />
      )}
      {insights.loading && !insights.data ? (
        <Skeleton label="Buscando oportunidades con evidencia…" />
      ) : insights.data && !opportunities.length ? (
        <EmptyState
          icon={<Target />}
          title={
            insights.data.opportunities.length
              ? "Sin coincidencias"
              : "No hay oportunidades"
          }
          action={
            insights.data.opportunities.length ? (
              <Button
                onClick={() => {
                  setSegment("");
                  setQuery("");
                  setIncludeUnmatched(true);
                }}
              >
                Quitar filtros
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() =>
                  navigate(!state.brand.audience.length ? "audience" : "radar")
                }
              >
                {!state.brand.audience.length
                  ? "Definir audiencia"
                  : "Descubrir contenido"}
                <ArrowRight size={16} />
              </Button>
            )
          }
        />
      ) : (
        <div className="journey-opportunity-list">
          {opportunities.map((opportunity) => (
            <OpportunityRow
              key={`${state.brand.id}:${opportunity.id}`}
              opportunity={opportunity}
              expanded={expanded === opportunity.id}
              onToggle={() =>
                setExpanded(expanded === opportunity.id ? "" : opportunity.id)
              }
              selectedSegment={segment}
            />
          ))}
        </div>
      )}
      {insights.data && (
        <CoverNote insights={insights.data} navigate={navigate} />
      )}
    </div>
  );
}

function OpportunityRow({
  opportunity,
  expanded,
  onToggle,
  selectedSegment,
}: {
  opportunity: Opportunity;
  expanded: boolean;
  onToggle: () => void;
  selectedSegment: string;
}) {
  const { state, refresh, notify, navigate } = useWorkspace();
  const [segmentId, setSegmentId] = useState(
    selectedSegment ||
      opportunity.segmentIds[0] ||
      state.brand.audience[0]?.id ||
      "",
  );
  const [format, setFormat] = useState<Piece["format"]>(
    opportunity.suggestedFormat,
  );
  const [channel, setChannel] = useState(opportunity.suggestedChannel);
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Piece | null>(null);
  const [analysis, setAnalysis] = useState<OpportunityAnalysis | null>(
    opportunity.analysis || null,
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const lock = useRef(false);
  const brandId = state.brand.id;
  const active = useBrandScope(brandId);
  const canCreate = state.brand.role !== "reviewer";
  const releaseGuard = useFormGuard(!!instructions.trim(), busy || analyzing);
  useEffect(() => {
    setAnalysis(opportunity.analysis || null);
  }, [opportunity.analysis]);
  async function analyze() {
    if (analyzing || busy) return;
    setAnalyzing(true);
    setAnalysisError("");
    try {
      const result = await api<OpportunityAnalysis>(
        `/api/brands/${brandId}/opportunities/${opportunity.id}/analyze`,
        { method: "POST", body: "{}" },
      );
      if (active.current !== brandId) return;
      setAnalysis(result);
      if (result.segmentIds[0]) setSegmentId(result.segmentIds[0]);
    } catch (cause) {
      if (active.current === brandId) setAnalysisError(errorMessage(cause));
    } finally {
      if (active.current === brandId) setAnalyzing(false);
    }
  }
  const detailId = `opportunity-${opportunity.id}`;
  useEffect(() => {
    if (selectedSegment) setSegmentId(selectedSegment);
  }, [selectedSegment]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !canCreate || created) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const piece = await api<Piece>(`/api/brands/${brandId}/draft`, {
        method: "POST",
        body: json({
          referenceId: opportunityDraftReferenceId(
            opportunity,
            analysis,
            state.references,
          ),
          segmentId,
          format,
          channel,
          instructions: [
            analysis?.adaptation || opportunity.adaptation,
            instructions.trim(),
          ]
            .filter(Boolean)
            .join("\n\n"),
        }),
      });
      if (active.current !== brandId) return;
      setCreated(piece);
      try {
        await refresh();
      } catch (refreshError) {
        if (active.current === brandId)
          setError(
            `El borrador se guardó. No pudimos actualizar el estudio: ${errorMessage(refreshError)}. Puedes abrirlo sin volver a generarlo.`,
          );
        return;
      }
      if (active.current !== brandId) return;
      setBusy(false);
      releaseGuard();
      notify("Borrador guardado.");
      navigate("studio", piece.id);
    } catch (createError) {
      if (active.current === brandId) setError(errorMessage(createError));
    } finally {
      lock.current = false;
      if (active.current === brandId) setBusy(false);
    }
  }
  return (
    <article className={`journey-opportunity ${expanded ? "is-open" : ""}`}>
      <div className="journey-opportunity-main">
        <div className="journey-badges">
          <Badge tone={growthStates[opportunity.growth.label].tone}>
            {growthStates[opportunity.growth.label].label}
          </Badge>
          {opportunity.isDemo && (
            <Badge tone="amber">Ejemplo ilustrativo</Badge>
          )}
          <span>
            {formatNames[opportunity.suggestedFormat]} ·{" "}
            {channelNames[opportunity.suggestedChannel]}
          </span>
        </div>
        <h2>{opportunity.title}</h2>
        <p>{opportunity.adaptation}</p>
        <ProviderCredits reference={{ evidence: opportunity.evidence }} />
        <div className="journey-segment-tags">
          {opportunity.segmentIds
            .map(
              (id) =>
                state.brand.audience.find((audience) => audience.id === id)
                  ?.name,
            )
            .filter(Boolean)
            .map((name) => (
              <span key={name}>
                <Users size={13} />
                {name}
              </span>
            ))}
        </div>
        <div className="journey-opportunity-proof">
          <span>
            <FileText size={14} aria-hidden="true" />
            {opportunity.evidence.length}{" "}
            {opportunity.evidence.length === 1 ? "referencia" : "referencias"}
          </span>
          <span>
            Confianza del análisis:{" "}
            {confidenceNames[opportunity.confidence].toLocaleLowerCase()}
          </span>
        </div>
      </div>
      <Button
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={detailId}
      >
        {expanded ? "Cerrar detalle" : "Ver detalle"}
        <ChevronDown size={16} className={expanded ? "journey-rotated" : ""} />
      </Button>
      <div
        id={detailId}
        className="journey-opportunity-details"
        hidden={!expanded}
      >
        {canCreate ? (
          created ? (
            <div className="journey-created" role="status">
              <CheckCircle2 size={21} />
              <div>
                <strong>Borrador guardado</strong>
                <p>{created.title}</p>
              </div>
              <Button
                variant="primary"
                onClick={() => navigate("studio", created.id)}
              >
                Abrir borrador
                <ArrowRight size={16} />
              </Button>
            </div>
          ) : state.brand.audience.length ? (
            <form
              className="journey-draft-form"
              onSubmit={(event) => void create(event)}
            >
              <h3>Nuevo borrador</h3>
              <fieldset disabled={busy}>
                <div className="journey-draft-fields">
                  <Field label="Audiencia">
                    <select
                      value={segmentId}
                      onChange={(event) => setSegmentId(event.target.value)}
                      required
                    >
                      <option value="" disabled>
                        Selecciona una audiencia
                      </option>
                      {state.brand.audience.map((audience) => (
                        <option key={audience.id} value={audience.id}>
                          {audience.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Formato">
                    <select
                      value={format}
                      onChange={(event) =>
                        setFormat(event.target.value as Piece["format"])
                      }
                    >
                      {Object.entries(formatNames)
                        .filter(([key]) =>
                          [
                            "post",
                            "carousel",
                            "reel",
                            "video",
                            "newsletter",
                          ].includes(key),
                        )
                        .map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Canal">
                    <select
                      value={channel}
                      onChange={(event) =>
                        setChannel(
                          event.target.value as Opportunity["suggestedChannel"],
                        )
                      }
                    >
                      {["linkedin", "instagram", "tiktok", "youtube"].map(
                        (key) => (
                          <option key={key} value={key}>
                            {channelNames[key]}
                          </option>
                        ),
                      )}
                    </select>
                  </Field>
                </div>
                <details className="journey-draft-options">
                  <summary>
                    <ChevronDown size={16} aria-hidden="true" />
                    Indicaciones (opcional)
                  </summary>
                  <Field label="Indicaciones para el borrador">
                    <textarea
                      rows={2}
                      maxLength={3000}
                      value={instructions}
                      onChange={(event) => setInstructions(event.target.value)}
                      placeholder="Caso de uso o enfoque"
                    />
                  </Field>
                </details>
              </fieldset>
              <div className="journey-form-actions">
                <span>
                  {state.integrations.ai.ready
                    ? "Con IA"
                    : "Sin IA: estructura inicial"}
                </span>
                <Button
                  type="submit"
                  variant="primary"
                  busy={busy}
                  disabled={!opportunity.referenceIds.length || !segmentId}
                >
                  Crear borrador
                  <ArrowRight size={16} />
                </Button>
              </div>
            </form>
          ) : (
            <Notice>
              Se requiere una audiencia.
              <Button onClick={() => navigate("audience")}>
                Definir audiencia
                <ArrowRight size={15} />
              </Button>
            </Notice>
          )
        ) : null}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <details className="journey-semantic">
          <summary>
            <ChevronDown size={16} aria-hidden="true" />
            Análisis de audiencia
            <span>{analysis ? "Ver análisis con IA" : "Analizar con IA"}</span>
          </summary>
          <div>
            <div className="section-heading">
              <h3>
                {analysis
                  ? "Relación con la audiencia · IA"
                  : "Relación con la audiencia"}
              </h3>
              {canCreate && (
                <Button
                  disabled={busy || !state.integrations.ai.ready}
                  busy={analyzing}
                  onClick={() => void analyze()}
                >
                  {analysis ? "Actualizar análisis con IA" : "Analizar con IA"}
                </Button>
              )}
            </div>
            {analysis ? (
              <>
                <strong>{analysis.need}</strong>
                <p>{analysis.rationale}</p>
                <h3>Hipótesis de gancho · IA</h3>
                <p>{analysis.hookHypothesis}</p>
                <h3>Enfoque propuesto</h3>
                <p>{analysis.adaptation}</p>
                <details>
                  <summary>Citas y límites</summary>
                  <ul>
                    {analysis.citations.map((citation) => (
                      <li key={citation.referenceId}>
                        <q>{citation.support}</q>
                        <small>
                          {
                            opportunity.evidence.find(
                              (item) =>
                                item.referenceId === citation.referenceId,
                            )?.title
                          }
                        </small>
                      </li>
                    ))}
                  </ul>
                  <ul>
                    {analysis.limitations.map((limitation, index) => (
                      <li key={index}>{limitation}</li>
                    ))}
                  </ul>
                  <small>
                    {analysis.model} · {readableDate(analysis.analyzedAt, true)}
                  </small>
                </details>
              </>
            ) : (
              <p>
                {state.integrations.ai.ready
                  ? "Consulta al proveedor de IA conectado; puede tener costo."
                  : "IA no conectada. Análisis inicial por coincidencias de texto."}
              </p>
            )}
            {analysisError && (
              <p role="alert" className="form-error">
                {analysisError}
              </p>
            )}
          </div>
        </details>
        <details className="journey-rationale">
          <summary>
            <ChevronDown size={16} aria-hidden="true" />
            Evidencia y crecimiento
            <span>{opportunity.evidence.length} referencias</span>
          </summary>
          <div className="journey-evidence-layout">
            <div>
              <h3>Coincidencias</h3>
              <ul>
                {opportunity.reasons.map((reason, index) => (
                  <li key={index}>{reason}</li>
                ))}
              </ul>
              <h3>Crecimiento</h3>
              <p>{opportunity.growth.explanation}</p>
              <h3>Hipótesis editorial</h3>
              <p>{opportunity.hypothesis}</p>
              {opportunity.factors && (
                <details className="journey-factor-disclosure">
                  <summary>Gancho, formato, tema y momento</summary>
                  <dl>
                    {opportunity.factors.map((factor) => (
                      <div key={factor.factor}>
                        <dt>{factor.label}</dt>
                        <dd>
                          <p>{factor.observation}</p>
                          <small>{factor.limitation}</small>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </div>
            <div>
              <h3>Referencias</h3>
              {opportunity.evidence.length ? (
                <details className="journey-source-disclosure">
                  <summary>
                    Consultar {opportunity.evidence.length} referencias
                  </summary>
                  <ul className="journey-evidence-list">
                    {opportunity.evidence.map((evidence, index) => (
                      <li key={`${evidence.referenceId}:${index}`}>
                        <strong>{evidence.title}</strong>
                        <small>
                          {evidence.source}
                          {evidence.observedAt
                            ? ` · ${readableDate(evidence.observedAt, true)}`
                            : ""}
                        </small>
                        <p>{evidence.detail}</p>
                        <ProviderCredits reference={evidence} />
                        {safeExternalUrl(evidence.url) && (
                          <a
                            href={safeExternalUrl(evidence.url)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Consultar original
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : (
                <p>No hay referencias comprobables para esta oportunidad.</p>
              )}
            </div>
          </div>
        </details>
      </div>
    </article>
  );
}

export function CompanyContext() {
  const { state, navigate } = useWorkspace();
  const imports = useBrandResource<{ imports: Inspection[] }>("context");
  const [tab, setTab] = useState<"imports" | "profile">("imports");
  useEffect(() => setTab("imports"), [state.brand.id]);
  return (
    <div className="page journey-page">
      <JourneyHeader
        title="Empresa"
        action={
          <Button onClick={() => navigate("audience")}>
            Audiencia
            <ArrowRight size={16} />
          </Button>
        }
      />
      <div
        className="journey-tabs"
        role="tablist"
        onKeyDown={handleTabKeys}
        aria-label="Contexto de empresa"
      >
        <button
          id="context-imports-tab"
          role="tab"
          tabIndex={tab === "imports" ? 0 : -1}
          aria-selected={tab === "imports"}
          aria-controls="context-imports-panel"
          onClick={() => setTab("imports")}
        >
          Fuentes y contenido
        </button>
        <button
          id="context-profile-tab"
          role="tab"
          tabIndex={tab === "profile" ? 0 : -1}
          aria-selected={tab === "profile"}
          aria-controls="context-profile-panel"
          onClick={() => setTab("profile")}
        >
          Perfil de empresa
        </button>
      </div>
      <div
        id="context-imports-panel"
        role="tabpanel"
        aria-labelledby="context-imports-tab"
        hidden={tab !== "imports"}
      >
        {state.brand.role === "owner" ? (
          <ContextImportForm key={state.brand.id} onSaved={imports.reload} />
        ) : (
          <Notice>Solo un administrador puede modificar el contexto.</Notice>
        )}
        <section className="journey-section" aria-labelledby="imports-heading">
          <div className="section-heading">
            <h2 id="imports-heading">Importaciones</h2>
            <Button
              variant="ghost"
              busy={imports.loading}
              onClick={imports.reload}
            >
              <RefreshCw size={15} />
              Actualizar
            </Button>
          </div>
          {imports.error && (
            <LoadError message={imports.error} retry={imports.reload} />
          )}
          {imports.loading && !imports.data ? (
            <Skeleton />
          ) : imports.data?.imports.length ? (
            <div className="journey-import-list">
              {imports.data.imports.map((inspection) => (
                <InspectionRecord
                  key={`${state.brand.id}:${inspection.id}`}
                  inspection={inspection}
                  onDeleted={imports.reload}
                />
              ))}
            </div>
          ) : !imports.error ? (
            <div className="journey-quiet-empty">
              <Globe2 size={26} />
              <h3>No hay importaciones</h3>
            </div>
          ) : null}
        </section>
      </div>
      <div
        id="context-profile-panel"
        role="tabpanel"
        aria-labelledby="context-profile-tab"
        hidden={tab !== "profile"}
        className="journey-embedded-profile"
      >
        <BrandPage key={state.brand.id} />
      </div>
    </div>
  );
}

function ContextImportForm({ onSaved }: { onSaved: () => void }) {
  const { state, notify } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Inspection | null>(null);
  const lock = useRef(false);
  const brandId = state.brand.id;
  const active = useBrandScope(brandId);
  useFormGuard(dirty, busy);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget;
    const input = new FormData(form);
    const website = String(input.get("website") || "").trim();
    const urls = String(input.get("urls") || "")
      .split(/\r?\n/)
      .map((url) => url.trim())
      .filter(Boolean);
    const text = String(input.get("text") || "").trim();
    if (!website && !urls.length && !text) {
      setError("Agrega una web, un enlace o un texto para empezar.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const inspection = await api<Inspection>(
        `/api/brands/${brandId}/context/import`,
        { method: "POST", body: json({ website, urls, text }) },
      );
      if (active.current !== brandId) return;
      setResult(inspection);
      setDirty(false);
      form.reset();
      onSaved();
      notify("Importación guardada.");
    } catch (importError) {
      if (active.current === brandId) setError(errorMessage(importError));
    } finally {
      lock.current = false;
      if (active.current === brandId) setBusy(false);
    }
  }
  return (
    <section className="journey-import-form">
      <h2>Importar contexto</h2>
      <form
        onSubmit={(event) => void submit(event)}
        onChangeCapture={() => {
          setDirty(true);
          setError("");
        }}
      >
        <fieldset disabled={busy}>
          <Field
            label="Sitio web de tu empresa"
            name="website"
            placeholder="tuempresa.com"
            autoComplete="url"
            maxLength={2000}
            defaultValue={state.brand.website}
          />
          <details className="journey-extra-inputs">
            <summary>
              Agregar redes, enlaces o texto propio
              <Plus size={15} />
            </summary>
            <Field label="Enlaces públicos · uno por línea">
              <textarea
                name="urls"
                rows={3}
                maxLength={14000}
                placeholder={
                  "https://www.instagram.com/tuempresa\nhttps://tuempresa.com/blog"
                }
              />
            </Field>
            <Field label="Texto o contenido de tu empresa">
              <textarea
                name="text"
                rows={5}
                maxLength={30000}
                placeholder="Presentación, descripción de producto o publicación propia"
              />
            </Field>
          </details>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="journey-form-actions">
          <Button variant="primary" type="submit" busy={busy}>
            <Globe2 size={16} />
            Importar
          </Button>
        </div>
      </form>
      {result && (
        <div className="journey-inline-success" role="status">
          <CheckCircle2 size={18} />
          <span>
            Guardado:{" "}
            {
              result.evidence.filter(
                (item) => item.status === "read" || item.status === "provided",
              ).length
            }{" "}
            fuentes con contenido ·{" "}
            {result.evidence.filter((item) => item.status === "linked").length}{" "}
            solo enlazadas ·{" "}
            {result.evidence.filter((item) => item.status === "failed").length}{" "}
            sin lectura.
          </span>
        </div>
      )}
    </section>
  );
}

function InspectionRecord({
  inspection,
  onDeleted,
}: {
  inspection: Inspection;
  onDeleted: () => void;
}) {
  const { state, notify } = useWorkspace();
  const [review, setReview] = useState(false);
  const proposalState = useRef({ dirty: false, busy: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const brandId = state.brand.id;
  const active = useBrandScope(brandId);
  const canEdit = state.brand.role === "owner";
  async function remove() {
    if (
      busy ||
      proposalState.current.busy ||
      !window.confirm(
        "¿Eliminar esta importación? El perfil de empresa conservará los cambios que ya aplicaste.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/brands/${brandId}/context/${inspection.id}`, {
        method: "DELETE",
      });
      if (active.current !== brandId) return;
      onDeleted();
      notify("Importación eliminada.");
    } catch (removeError) {
      if (active.current === brandId) setError(errorMessage(removeError));
    } finally {
      if (active.current === brandId) setBusy(false);
    }
  }
  return (
    <article className="journey-import-record">
      <div className="journey-import-heading">
        <div>
          <h3>{inspection.draft.name || "Contexto importado"}</h3>
          <p>
            {readableDate(inspection.inspectedAt, true)} ·{" "}
            {inspection.method === "ai"
              ? "Propuesta con IA"
              : "Propuesta por coincidencias de texto"}
          </p>
        </div>
        {canEdit && (
          <Button
            variant="ghost"
            busy={busy}
            aria-label="Eliminar esta importación"
            onClick={() => void remove()}
          >
            <Trash2 size={15} />
          </Button>
        )}
      </div>
      <div className="journey-context-evidence">
        {inspection.evidence.map((evidence) => (
          <div key={evidence.id}>
            <div>
              <Badge
                tone={
                  evidence.status === "read" || evidence.status === "provided"
                    ? "green"
                    : evidence.status === "failed"
                      ? "amber"
                      : "neutral"
                }
              >
                {evidenceNames[evidence.status]}
              </Badge>
              <strong>
                {evidence.title || evidence.platform || "Contenido"}
              </strong>
            </div>
            {evidence.excerpt && <p>{evidence.excerpt}</p>}
            {evidence.reason && (
              <p className="journey-muted">{evidence.reason}</p>
            )}
            {safeExternalUrl(evidence.url) && (
              <a
                href={safeExternalUrl(evidence.url)}
                target="_blank"
                rel="noreferrer"
              >
                Ver fuente
                <ExternalLink size={13} />
              </a>
            )}
          </div>
        ))}
      </div>
      {inspection.warnings.length > 0 && (
        <details className="journey-warnings">
          <summary>
            Limitaciones de esta importación ({inspection.warnings.length})
          </summary>
          <ul>
            {inspection.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      {canEdit && (
        <Button
          onClick={() => {
            if (review && proposalState.current.busy) return;
            if (
              review &&
              proposalState.current.dirty &&
              !window.confirm(
                "Hay cambios sin aplicar. ¿Cerrar la propuesta y descartarlos?",
              )
            )
              return;
            setReview(!review);
          }}
          aria-expanded={review}
        >
          {review ? "Cerrar propuesta" : "Revisar propuesta"}
          <ChevronDown size={15} />
        </Button>
      )}
      {review && (
        <ContextProposal
          inspection={inspection}
          brand={state.brand}
          onStateChange={(next) => {
            proposalState.current = next;
          }}
        />
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

function ContextProposal({
  inspection,
  brand,
  onStateChange,
}: {
  inspection: Inspection;
  brand: Brand;
  onStateChange: (state: { dirty: boolean; busy: boolean }) => void;
}) {
  const { refresh, notify } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const active = useBrandScope(brand.id);
  useFormGuard(dirty, busy);
  useEffect(() => onStateChange({ dirty, busy }), [dirty, busy, onStateChange]);
  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const input = new FormData(event.currentTarget);
    const patch = {
      name: String(input.get("name") || "").trim(),
      industry: String(input.get("industry") || "").trim(),
      description: String(input.get("description") || "").trim(),
      website: String(input.get("website") || "").trim(),
      market: String(input.get("market") || "").trim(),
      language: String(input.get("language") || "").trim(),
      tone: String(input.get("tone") || "").trim(),
      pillars: String(input.get("pillars") || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    };
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api(`/api/brands/${brand.id}`, {
        method: "PATCH",
        body: json(patch),
      });
      if (active.current !== brand.id) return;
      setApplied(true);
      setDirty(false);
      try {
        await refresh();
        if (active.current === brand.id) notify("Contexto guardado.");
      } catch (refreshError) {
        if (active.current === brand.id)
          setError(
            `El contexto se guardó. No pudimos actualizar el espacio: ${errorMessage(refreshError)}`,
          );
      }
    } catch (applyError) {
      if (active.current === brand.id) setError(errorMessage(applyError));
    } finally {
      lock.current = false;
      if (active.current === brand.id) setBusy(false);
    }
  }
  const draft = inspection.draft;
  return (
    <form
      className="journey-proposal stack"
      onSubmit={(event) => void apply(event)}
      onChangeCapture={() => {
        setDirty(true);
        setApplied(false);
      }}
    >
      <h3>Propuesta de contexto</h3>
      <p>
        Reemplazará el contexto de <strong>{brand.name}</strong>.
      </p>
      <fieldset disabled={busy} className="stack">
        <div className="form-grid">
          <Field
            label="Nombre"
            name="name"
            defaultValue={draft.name || brand.name}
            required
            maxLength={100}
          />
          <Field
            label="Sector"
            name="industry"
            defaultValue={draft.industry || brand.industry}
            required
            maxLength={150}
          />
        </div>
        <Field label="Descripción">
          <textarea
            name="description"
            rows={3}
            defaultValue={draft.description || brand.description}
            required
            maxLength={4000}
          />
        </Field>
        <Field
          label="Temas · separados por comas"
          name="pillars"
          defaultValue={(draft.pillars.length
            ? draft.pillars
            : brand.pillars
          ).join(", ")}
          required
          maxLength={3000}
        />
        <Field
          label="Voz y tono"
          name="tone"
          defaultValue={draft.tone || brand.tone}
          required
          maxLength={500}
        />
        <div className="form-grid">
          <Field
            label="Mercado"
            name="market"
            defaultValue={draft.market || brand.market}
            required
            maxLength={100}
          />
          <Field label="Idioma">
            <select
              name="language"
              defaultValue={
                (
                  { Español: "es", Inglés: "en", Portugués: "pt" } as Record<
                    string,
                    string
                  >
                )[draft.language || brand.language] ||
                draft.language ||
                brand.language ||
                "es"
              }
            >
              <option value="es">Español</option>
              <option value="en">Inglés</option>
              <option value="pt">Portugués</option>
            </select>
          </Field>
        </div>
        <Field
          label="Web"
          name="website"
          type="url"
          defaultValue={draft.website || brand.website}
          maxLength={2000}
        />
      </fieldset>
      {draft.audience.length > 0 && (
        <Notice>
          <strong>Audiencia propuesta · sin aplicar:</strong>{" "}
          {draft.audience
            .map((audience) => `${audience.name}: ${audience.needs}`)
            .join(" · ")}
        </Notice>
      )}
      {applied && (
        <p className="journey-success" role="status">
          <Check size={16} />
          Contexto guardado.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="journey-form-actions">
        <Button
          variant="primary"
          type="submit"
          busy={busy}
          disabled={applied && !dirty}
        >
          <Check size={16} />
          Aplicar contexto
        </Button>
      </div>
    </form>
  );
}

export function AudienceIntelligence({
  resource,
}: {
  resource: AudienceEvidenceResource;
}) {
  const { state, navigate } = useWorkspace();
  const [tab, setTab] = useState<"profiles" | "signals">("profiles");
  useEffect(() => setTab("profiles"), [state.brand.id]);
  return (
    <div className="page journey-page">
      <JourneyHeader
        title="Audiencia"
        action={
          <Button onClick={() => navigate("opportunities")}>
            Ver oportunidades
            <ArrowRight size={16} />
          </Button>
        }
      />
      <div
        className="journey-tabs"
        role="tablist"
        aria-label="Audiencia"
        onKeyDown={handleTabKeys}
      >
        <button
          id="audience-profiles-tab"
          role="tab"
          tabIndex={tab === "profiles" ? 0 : -1}
          aria-selected={tab === "profiles"}
          aria-controls="audience-profiles-panel"
          onClick={() => setTab("profiles")}
        >
          Perfiles del equipo
        </button>
        <button
          id="audience-signals-tab"
          role="tab"
          tabIndex={tab === "signals" ? 0 : -1}
          aria-selected={tab === "signals"}
          aria-controls="audience-signals-panel"
          onClick={() => setTab("signals")}
        >
          Señales
          {resource.data?.signals.length ? (
            <span>{resource.data.signals.length}</span>
          ) : null}
        </button>
      </div>
      <div
        role="tabpanel"
        id="audience-profiles-panel"
        aria-labelledby="audience-profiles-tab"
        hidden={tab !== "profiles"}
      >
        <div className="journey-embedded-profile">
          <AudiencePage key={state.brand.id} />
        </div>
        <div className="journey-form-actions">
          <Button onClick={() => setTab("signals")}>
            Registrar una señal
            <ArrowRight size={16} />
          </Button>
        </div>
      </div>
      <div
        role="tabpanel"
        id="audience-signals-panel"
        aria-labelledby="audience-signals-tab"
        hidden={tab !== "signals"}
      >
        {state.brand.role === "reviewer" ? (
          <ReviewerNotice />
        ) : state.brand.audience.length ? (
          <AudienceSignalForm key={state.brand.id} onSaved={resource.reload} />
        ) : (
          <EmptyState
            icon={<Users />}
            title="Se requiere una audiencia"
            action={
              <Button onClick={() => setTab("profiles")}>
                Crear un perfil
                <ArrowRight size={15} />
              </Button>
            }
          />
        )}
        <section className="journey-section">
          <div className="section-heading">
            <h2>Señales registradas</h2>
            <Button
              variant="ghost"
              busy={resource.loading}
              onClick={resource.reload}
            >
              <RefreshCw size={15} />
              Actualizar
            </Button>
          </div>
          {resource.error && (
            <LoadError message={resource.error} retry={resource.reload} />
          )}
          {resource.loading && !resource.data ? (
            <Skeleton />
          ) : resource.data?.signals.length ? (
            <div className="journey-signal-list">
              {resource.data.signals.map((signal) => (
                <SignalRow
                  key={`${state.brand.id}:${signal.id}`}
                  signal={signal}
                  onDeleted={resource.reload}
                />
              ))}
            </div>
          ) : !resource.error ? (
            <div className="journey-quiet-empty">
              <Target size={25} />
              <h3>No hay señales</h3>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function AudienceSignalForm({ onSaved }: { onSaved: () => void }) {
  const { state, notify } = useWorkspace();
  const [sourceType, setSourceType] = useState<"public_content" | "editorial">(
    "public_content",
  );
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const brandId = state.brand.id;
  const active = useBrandScope(brandId);
  useFormGuard(dirty, busy);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget;
    const input = new FormData(form);
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api<AudienceSignal>(`/api/brands/${brandId}/audience-signals`, {
        method: "POST",
        body: json({
          segmentId: String(input.get("segmentId")),
          topic: String(input.get("topic") || "").trim(),
          note: String(input.get("note") || "").trim(),
          sourceType,
          sourceUrl: String(input.get("sourceUrl") || "").trim() || undefined,
          sampleSize: input.get("sampleSize")
            ? Number(input.get("sampleSize"))
            : undefined,
        }),
      });
      if (active.current !== brandId) return;
      form.reset();
      setSourceType("public_content");
      setDirty(false);
      onSaved();
      notify("Señal guardada.");
    } catch (saveError) {
      if (active.current === brandId) setError(errorMessage(saveError));
    } finally {
      lock.current = false;
      if (active.current === brandId) setBusy(false);
    }
  }
  return (
    <section className="journey-signal-form">
      <h2>Nueva señal</h2>
      <form
        className="stack"
        onSubmit={(event) => void submit(event)}
        onChangeCapture={() => {
          setDirty(true);
          setError("");
        }}
      >
        <fieldset disabled={busy} className="stack">
          <div className="form-grid">
            <Field label="Audiencia">
              <select name="segmentId" required>
                {state.brand.audience.map((segment) => (
                  <option key={segment.id} value={segment.id}>
                    {segment.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Origen">
              <select
                value={sourceType}
                onChange={(event) =>
                  setSourceType(
                    event.target.value as "public_content" | "editorial",
                  )
                }
              >
                <option value="public_content">Contenido público</option>
                <option value="editorial">Hipótesis del equipo</option>
              </select>
            </Field>
          </div>
          <div>
            <Field
              label="Tema o necesidad"
              name="topic"
              required
              maxLength={160}
              aria-describedby="audience-signal-topic-limit"
              placeholder="Ej. Reducir el tiempo dedicado a preparar propuestas"
            />
            <small id="audience-signal-topic-limit">
              Máximo 160 caracteres.
            </small>
          </div>
          <Field
            label={
              sourceType === "public_content"
                ? "Qué observaste y qué queda por comprobar"
                : "Qué creemos y cómo podríamos comprobarlo"
            }
          >
            <textarea name="note" rows={3} required maxLength={4000} />
          </Field>
          <div className="form-grid">
            <Field
              label={
                sourceType === "public_content"
                  ? "Enlace público de la evidencia"
                  : "Enlace de apoyo (opcional)"
              }
              name="sourceUrl"
              type="url"
              required={sourceType === "public_content"}
              placeholder="https://…"
              maxLength={2000}
            />
            <Field
              label="Piezas revisadas (opcional)"
              name="sampleSize"
              type="number"
              min={1}
              max={1000000}
              step={1}
              placeholder="Tamaño de la muestra de contenido"
            />
          </div>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="journey-form-actions">
          <Button variant="primary" type="submit" busy={busy}>
            <Plus size={16} />
            Guardar señal
          </Button>
        </div>
      </form>
    </section>
  );
}

function SignalRow({
  signal,
  onDeleted,
}: {
  signal: AudienceSignal;
  onDeleted: () => void;
}) {
  const { state, notify } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const brandId = state.brand.id;
  const active = useBrandScope(brandId);
  const evidenceUrl = safeAudienceEvidenceUrl(signal.sourceUrl);
  async function remove() {
    if (busy || !window.confirm("¿Eliminar esta señal de audiencia?")) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/brands/${brandId}/audience-signals/${signal.id}`, {
        method: "DELETE",
      });
      if (active.current === brandId) {
        onDeleted();
        notify("Señal eliminada.");
      }
    } catch (removeError) {
      if (active.current === brandId) setError(errorMessage(removeError));
    } finally {
      if (active.current === brandId) setBusy(false);
    }
  }
  return (
    <article className="journey-signal">
      <div className="journey-signal-heading">
        <div className="journey-badges">
          <Badge tone={signal.sourceType === "editorial" ? "amber" : "green"}>
            {signal.sourceType === "public_content"
              ? "Señal pública"
              : signal.sourceType === "community"
                ? "Comunidad · muestra voluntaria"
                : "Hipótesis del equipo"}
          </Badge>
          <span>
            {state.brand.audience.find(
              (segment) => segment.id === signal.segmentId,
            )?.name || "Perfil eliminado"}
          </span>
        </div>
        {state.brand.role !== "reviewer" && (
          <Button
            variant="ghost"
            busy={busy}
            aria-label={`Eliminar señal: ${signal.topic}`}
            onClick={() => void remove()}
          >
            <Trash2 size={15} />
          </Button>
        )}
      </div>
      <h3>{signal.topic}</h3>
      <p>{signal.note}</p>
      <div className="journey-signal-meta">
        <small>
          {readableDate(signal.createdAt)}
          {signal.sampleSize
            ? signal.sourceType === "community"
              ? ` · ${number(signal.sampleSize)} respuestas agregadas`
              : ` · ${number(signal.sampleSize)} piezas revisadas`
            : " · Muestra no indicada"}
        </small>
        {evidenceUrl && (
          <a href={evidenceUrl} target="_blank" rel="noreferrer">
            Consultar evidencia
            <ExternalLink size={13} />
          </a>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

export function Results() {
  const { state, navigate, notify } = useWorkspace();
  const insights = useBrandResource<Insights>("insights");
  const [saved, setSaved] = useState<{
    brandId: string;
    outcome: Outcome;
  } | null>(null);
  const eligible = state.pieces.filter(
    (piece) =>
      ["approved", "scheduled", "published"].includes(piece.status) &&
      !(piece as Piece & { isDemo?: boolean }).isDemo,
  );
  const outcomes = [...(insights.data?.learning.outcomes || [])];
  if (saved?.brandId === state.brand.id) {
    const index = outcomes.findIndex(
      (outcome) => outcome.pieceId === saved.outcome.pieceId,
    );
    if (index >= 0) outcomes[index] = saved.outcome;
    else outcomes.unshift(saved.outcome);
  }
  const [selected, setSelected] = useState("");
  const outcomeFormState = useRef({ dirty: false, busy: false });
  function selectPiece(id: string) {
    if (id === selected) return true;
    if (outcomeFormState.current.busy) {
      notify(
        "Espera a que se guarde el registro antes de cambiar de pieza.",
        "error",
      );
      return false;
    }
    if (
      outcomeFormState.current.dirty &&
      !window.confirm(
        "Hay métricas sin guardar. ¿Cambiar de pieza y descartarlas?",
      )
    )
      return false;
    outcomeFormState.current = { dirty: false, busy: false };
    setSelected(id);
    return true;
  }
  useEffect(() => {
    setSelected("");
    setSaved(null);
    outcomeFormState.current = { dirty: false, busy: false };
  }, [state.brand.id]);
  const piece = eligible.find((item) => item.id === selected);
  const outcome = outcomes.find((item) => item.pieceId === selected);
  return (
    <div className="page journey-page">
      <JourneyHeader
        title="Resultados"
        action={
          <Button onClick={() => navigate("calendar")}>
            <CalendarDays size={16} />
            Abrir calendario
          </Button>
        }
      />
      <section
        className="journey-automatic-results"
        aria-label="Cifras oficiales de YouTube"
      >
        <AutomaticMetrics />
      </section>
      {state.brand.role === "reviewer" ? (
        <ReviewerNotice />
      ) : (
        <section className="journey-results-form">
          <div className="section-heading">
            <h2>Registrar resultados</h2>
            <Badge>Registro manual</Badge>
          </div>
          {eligible.length ? (
            <>
              <Field label="Pieza">
                <select
                  value={selected}
                  disabled={insights.loading && !insights.data}
                  onChange={(event) => selectPiece(event.target.value)}
                >
                  <option value="">Selecciona una pieza aprobada</option>
                  {eligible.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} ·{" "}
                      {outcomes.some((record) => record.pieceId === item.id)
                        ? "Corregir registro"
                        : pieceStatusLabel(item)}
                    </option>
                  ))}
                </select>
              </Field>
              {piece ? (
                <OutcomeForm
                  key={`${state.brand.id}:${piece.id}`}
                  piece={piece}
                  outcome={outcome}
                  onStateChange={(next) => {
                    outcomeFormState.current = next;
                  }}
                  onSaved={(record) => {
                    setSaved({ brandId: state.brand.id, outcome: record });
                    insights.reload();
                  }}
                />
              ) : null}
            </>
          ) : (
            <div className="journey-quiet-empty">
              <ClipboardCheck size={25} />
              <h3>No hay piezas aprobadas</h3>
              <Button onClick={() => navigate("studio")}>
                Abrir estudio
                <ArrowRight size={15} />
              </Button>
            </div>
          )}
        </section>
      )}
      {insights.error && (
        <LoadError message={insights.error} retry={insights.reload} />
      )}
      {insights.loading && !insights.data ? (
        <Skeleton label="Cargando resultados registrados…" />
      ) : (
        <>
          <section className="journey-section">
            <div className="section-heading">
              <h2>Resultados por audiencia</h2>
              <Button
                variant="ghost"
                busy={insights.loading}
                onClick={insights.reload}
              >
                <RefreshCw size={15} />
                Actualizar
              </Button>
            </div>
            {outcomes.length ? (
              <>
                <SegmentResults outcomes={outcomes} />
              </>
            ) : (
              <div className="journey-quiet-empty">
                <Target size={25} />
                <h3>No hay resultados manuales</h3>
              </div>
            )}
          </section>
          {outcomes.length > 0 && (
            <section className="journey-section">
              <div className="section-heading">
                <h2>Publicaciones registradas</h2>
                <Badge>{outcomes.length} registros manuales</Badge>
              </div>
              <div className="journey-outcomes">
                {outcomes.map((record) => (
                  <article key={record.id}>
                    <div>
                      <h3>{record.title}</h3>
                      <p>
                        {readableDate(record.publishedAt)} ·{" "}
                        {state.brand.audience.find(
                          (segment) => segment.id === record.segmentId,
                        )?.name || "Sin audiencia asignada"}
                      </p>
                      {record.notes && <p>{record.notes}</p>}
                      <div className="journey-outcome-counts">
                        <span>
                          {number(record.metrics.views)} visualizaciones
                        </span>
                        <span>
                          {number(record.metrics.engagement)} interacciones
                        </span>
                        <span>{number(record.metrics.leads)} contactos</span>
                      </div>
                    </div>
                    <div className="journey-outcome-actions">
                      {safeExternalUrl(record.publishedUrl) && (
                        <a
                          href={safeExternalUrl(record.publishedUrl)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ver publicación
                          <ExternalLink size={14} />
                        </a>
                      )}
                      {state.brand.role !== "reviewer" &&
                        eligible.some((item) => item.id === record.pieceId) && (
                          <Button
                            onClick={() => {
                              if (!selectPiece(record.pieceId)) return;
                              document
                                .querySelector(".journey-results-form")
                                ?.scrollIntoView({
                                  behavior: "instant",
                                  block: "start",
                                });
                            }}
                          >
                            Corregir registro
                          </Button>
                        )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function SegmentResults({ outcomes }: { outcomes: Outcome[] }) {
  const { state } = useWorkspace();
  const grouped = new Map<
    string,
    {
      name: string;
      channel: string;
      pieces: number;
      views: number;
      engagement: number;
      leads: number;
    }
  >();
  for (const outcome of outcomes) {
    const channel =
      outcome.channel ||
      state.pieces.find((piece) => piece.id === outcome.pieceId)?.channel ||
      "unknown";
    const key = `${outcome.segmentId || "unassigned"}:${channel}`;
    const current = grouped.get(key) || {
      name:
        state.brand.audience.find((segment) => segment.id === outcome.segmentId)
          ?.name || "Sin audiencia vigente",
      channel: channelNames[channel] || "Sin canal registrado",
      pieces: 0,
      views: 0,
      engagement: 0,
      leads: 0,
    };
    current.pieces += 1;
    current.views += outcome.metrics.views;
    current.engagement += outcome.metrics.engagement;
    current.leads += outcome.metrics.leads;
    grouped.set(key, current);
  }
  return (
    <div
      className="journey-table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Tabla de métricas manuales por audiencia"
    >
      <table className="journey-table">
        <caption className="sr-only">
          Totales registrados manualmente por audiencia y canal. Las métricas de
          canales distintos se mantienen separadas.
        </caption>
        <thead>
          <tr>
            <th scope="col">Audiencia</th>
            <th scope="col">Canal</th>
            <th scope="col">Piezas</th>
            <th scope="col">Visualizaciones</th>
            <th scope="col">Interacciones (total)</th>
            <th scope="col">Contactos</th>
          </tr>
        </thead>
        <tbody>
          {Array.from(grouped.entries()).map(([key, item]) => (
            <tr key={key}>
              <th scope="row">{item.name}</th>
              <td>{item.channel}</td>
              <td>{number(item.pieces)}</td>
              <td>{number(item.views)}</td>
              <td>{number(item.engagement)}</td>
              <td>{number(item.leads)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OutcomeForm({
  piece,
  outcome,
  onSaved,
  onStateChange,
}: {
  piece: Piece;
  outcome?: Outcome;
  onSaved: (outcome: Outcome) => void;
  onStateChange: (state: { dirty: boolean; busy: boolean }) => void;
}) {
  const { state, refresh, notify } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const brandId = state.brand.id;
  const active = useBrandScope(brandId);
  useFormGuard(dirty, busy);
  useEffect(() => onStateChange({ dirty, busy }), [dirty, busy, onStateChange]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const input = new FormData(event.currentTarget);
    const date = String(input.get("publishedAt") || "");
    if (!date || Number.isNaN(new Date(date).getTime())) {
      setError("Indica la fecha de publicación.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const record = await api<Outcome>(
        `/api/brands/${brandId}/pieces/${piece.id}/outcome`,
        {
          method: "POST",
          body: json({
            publishedUrl: String(input.get("publishedUrl") || "").trim(),
            publishedAt: new Date(date).toISOString(),
            metrics: {
              views: Number(input.get("views")),
              engagement: Number(input.get("engagement")),
              leads: Number(input.get("leads")),
            },
            notes: String(input.get("notes") || "").trim(),
          }),
        },
      );
      if (active.current !== brandId) return;
      setDirty(false);
      onSaved(record);
      notify("Registro manual guardado.");
      try {
        await refresh();
      } catch (refreshError) {
        if (active.current === brandId)
          setError(
            `El registro se guardó. No pudimos actualizar el espacio: ${errorMessage(refreshError)}`,
          );
      }
    } catch (saveError) {
      if (active.current === brandId) setError(errorMessage(saveError));
    } finally {
      lock.current = false;
      if (active.current === brandId) setBusy(false);
    }
  }
  return (
    <form
      className="journey-outcome-form stack"
      onSubmit={(event) => void submit(event)}
      onChangeCapture={() => {
        setDirty(true);
        setError("");
      }}
    >
      <p>
        <strong>{channelNames[piece.channel]}</strong> ·{" "}
        {formatNames[piece.format]} ·{" "}
        {state.brand.audience.find((segment) => segment.id === piece.segmentId)
          ?.name || "Sin audiencia asignada"}
      </p>
      <fieldset disabled={busy} className="stack">
        <div className="form-grid">
          <Field
            label="Enlace público de la publicación (opcional)"
            name="publishedUrl"
            type="url"
            defaultValue={outcome?.publishedUrl}
            placeholder="https://…"
            maxLength={2000}
          />
          <Field
            label="Fecha y hora de publicación"
            name="publishedAt"
            type="datetime-local"
            required
            defaultValue={localDateTime(
              outcome?.publishedAt || piece.publishedAt,
            )}
            max={localDateTime()}
          />
        </div>
        <div className="journey-metric-fields">
          <Field
            label="Visualizaciones"
            name="views"
            type="number"
            required
            min={0}
            max={1000000000000}
            step="any"
            defaultValue={outcome?.metrics.views}
            placeholder="0"
          />
          <Field
            label="Interacciones (total)"
            name="engagement"
            type="number"
            required
            min={0}
            max={1000000000000}
            step="any"
            defaultValue={outcome?.metrics.engagement}
            placeholder="0"
          />
          <Field
            label="Contactos generados"
            name="leads"
            type="number"
            required
            min={0}
            max={1000000000000}
            step="any"
            defaultValue={outcome?.metrics.leads}
            placeholder="0"
          />
        </div>
        <Field label="Periodo y notas (opcional)">
          <textarea
            name="notes"
            rows={3}
            maxLength={4000}
            defaultValue={outcome?.notes}
            placeholder="Ej. Métricas a los 7 días"
          />
        </Field>
      </fieldset>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="journey-form-actions">
        <span>
          Confirma una publicación manual. No envía contenido a redes.
        </span>
        <Button variant="primary" type="submit" busy={busy}>
          <Check size={16} />
          {outcome ? "Actualizar registro" : "Guardar publicación y resultados"}
        </Button>
      </div>
    </form>
  );
}
