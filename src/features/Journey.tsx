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
  Circle,
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
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading journey-heading">
      <div>
        <h1>{title}</h1>
        <p>{children}</p>
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
  return (
    <Notice>
      Tu acceso de revisor permite consultar la información y aprobar piezas en
      el estudio. Un editor o administrador puede incorporar fuentes, señales y
      resultados.
    </Notice>
  );
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
        <p>
          Las oportunidades priorizan coincidencias con el contexto y las
          necesidades declaradas. La prioridad editorial no predice resultados.
        </p>
        {!insights.coverage.hasHistory && (
          <p>
            Aún falta historial comparable para afirmar que un tema está
            creciendo.
          </p>
        )}
        {insights.coverage.notes.map((note, index) => (
          <p key={index}>{note}</p>
        ))}
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
  const reviewer = brand.role === "reviewer";
  type Next = {
    title: string;
    body: string;
    action: string;
    view: View;
    pieceId?: string;
  };
  const next: Next = reviewer
    ? review[0]
      ? {
          title: "Hay contenido listo para tu revisión",
          body: "Comprueba el enfoque, deja comentarios y aprueba la versión que está lista para salir.",
          action: "Revisar contenido",
          view: "studio",
          pieceId: review[0].id,
        }
      : {
          title: "Conoce el criterio detrás del contenido",
          body: "Explora las oportunidades y su evidencia. El equipo enviará sus piezas al estudio para que puedas revisarlas.",
          action: "Ver oportunidades",
          view: "opportunities",
        }
    : !hasContext
      ? {
          title: "Empieza por lo que tu empresa ya cuenta",
          body: "Importa tu web, enlaces públicos o contenido propio. Revisa la propuesta antes de aplicarla a tu contexto.",
          action: "Completar contexto",
          view: "brand",
        }
      : !hasAudience
        ? {
            title: "Define a quién debe ayudar tu contenido",
            body: "Elige un grupo y la necesidad que quieres resolver. Lo contrastaremos con señales públicas y observaciones del equipo.",
            action: "Definir audiencia",
            view: "audience",
          }
        : !references.length
          ? {
              title: "Encuentra las primeras señales",
              body: "Busca contenido público o agrega una referencia que tu equipo haya encontrado. Cada recomendación necesita evidencia.",
              action: "Descubrir contenido",
              view: "radar",
            }
          : drafts[0]
            ? {
                title: "Tu siguiente pieza ya está en marcha",
                body: `Continúa «${drafts[0].title}», ajusta el guion y envíalo a revisión.`,
                action: "Continuar borrador",
                view: "studio",
                pieceId: drafts[0].id,
              }
            : review[0]
              ? {
                  title: "Cierra la revisión antes de planificar",
                  body: "Revisa el guion y sus comentarios. La aprobación protege la versión que llegará al calendario.",
                  action: "Abrir revisión",
                  view: "studio",
                  pieceId: review[0].id,
                }
              : approved[0]
                ? {
                    title: "Dale una fecha al contenido aprobado",
                    body: "Organiza tu calendario, prepara los archivos y publica desde tu canal. Programar aquí organiza el trabajo del equipo.",
                    action: "Planificar publicación",
                    view: "calendar",
                  }
                : scheduled.length && !outcomes.length
                  ? {
                      title: "Consulta tu próxima publicación",
                      body: "El calendario tiene contenido programado. Cuando lo publiques, registra su enlace y resultados para comparar lo que ocurrió.",
                      action: "Abrir calendario",
                      view: "calendar",
                    }
                  : published.length && !outcomes.length
                    ? {
                        title: "Completa el ciclo con resultados",
                        body: "Confirma la publicación en su destino y registra sus métricas. Podrás comparar resultados por audiencia y ajustar tus siguientes decisiones.",
                        action: "Registrar resultados",
                        view: "results",
                      }
                    : {
                        title: "Elige qué vale la pena contar ahora",
                        body: "Revisa oportunidades que conectan referencias públicas con las necesidades de tu audiencia y convierte una en contenido propio.",
                        action: "Explorar oportunidades",
                        view: "opportunities",
                      };
  const steps: { title: string; detail: string; view: View; done: boolean }[] =
    [
      {
        title: "Contexto",
        detail: hasContext
          ? "Dirección editorial definida"
          : "Importa y revisa tu empresa",
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
        detail: `${drafts.length} borradores · ${review.length} en revisión`,
        view: "studio",
        done: approved.length + scheduled.length + published.length > 0,
      },
      {
        title: "Calendario",
        detail: `${scheduled.length} programadas · ${published.length} envíos registrados`,
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
      <JourneyHeader title={`El contenido de ${brand.name}, con dirección.`}>
        Del contexto de tu empresa a una publicación que puedas evaluar.
      </JourneyHeader>
      <WorkspacePreparation enabled={!reviewer && hasContext && hasAudience} />
      <section className="journey-next" aria-labelledby="next-action-heading">
        <div>
          <h2 id="next-action-heading">{next.title}</h2>
          <p>{next.body}</p>
          <Button
            variant="primary"
            onClick={() => navigate(next.view, next.pieceId)}
          >
            {next.action}
            <ArrowRight size={17} />
          </Button>
        </div>
        <div className="journey-next-aside">
          <Target size={25} />
          <span>Tu siguiente paso</span>
          <strong>{brand.name}</strong>
          <small>{brand.market || "Mercado por definir"}</small>
        </div>
      </section>
      <section className="journey-section" aria-labelledby="workflow-heading">
        <div className="section-heading">
          <h2 id="workflow-heading">Un flujo, de principio a fin</h2>
          <span className="journey-muted">
            {steps.filter((step) => step.done).length} de {steps.length} etapas
            con actividad
          </span>
        </div>
        <ol className="journey-steps">
          {steps.map((step) => (
            <li key={step.title}>
              <button onClick={() => navigate(step.view)}>
                {step.done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
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
            <h2 id="desk-heading">En la mesa del equipo</h2>
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
              <h3>La primera pieza empieza con una buena referencia</h3>
              <p>
                Encuentra una oportunidad y crea un borrador para editar,
                revisar y planificar.
              </p>
              <Button onClick={() => navigate("opportunities")}>
                Buscar una oportunidad
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
            <h2 id="priorities-heading">Oportunidades para revisar</h2>
          </div>
          {insights.error && (
            <LoadError message={insights.error} retry={insights.reload} />
          )}
          {insights.loading && !insights.data ? (
            <Skeleton />
          ) : insights.data?.opportunities.length ? (
            <div className="journey-shortlist">
              {insights.data.opportunities
                .filter(
                  (item) =>
                    item.segmentIds.length || item.analysis?.segmentIds.length,
                )
                .slice(0, 3)
                .map((opportunity) => (
                  <button
                    key={opportunity.id}
                    onClick={() => navigate("opportunities")}
                  >
                    <strong>{opportunity.title}</strong>
                    <span>{opportunity.adaptation}</span>
                    <small>
                      {growthStates[opportunity.growth.label].label}
                      <ArrowRight size={15} />
                    </small>
                  </button>
                ))}
              <ProviderCredits
                reference={{
                  evidence: insights.data.opportunities
                    .slice(0, 3)
                    .flatMap((opportunity) => opportunity.evidence),
                }}
              />
            </div>
          ) : !insights.error ? (
            <div className="journey-quiet-empty">
              <Search size={25} />
              <h3>Construye una base de evidencia</h3>
              <p>
                Las oportunidades aparecerán al incorporar referencias que se
                relacionen con tu contexto y audiencia.
              </p>
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
        title="Oportunidades que tienen sentido para tu audiencia."
        action={
          <Button onClick={() => navigate("radar")}>
            <Search size={16} />
            Descubrir referencias
          </Button>
        }
      >
        Entiende la señal, comprueba la evidencia y decide qué convertir en
        contenido propio.
      </JourneyHeader>
      {state.brand.role === "reviewer" && <ReviewerNotice />}
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
        Incluir señales sin relación identificada con mi audiencia
      </label>
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
              ? "Ninguna oportunidad coincide con tus filtros"
              : "Primero necesitamos referencias y contexto"
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
                Ampliar exploración
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
        >
          {insights.data.opportunities.length
            ? "Prueba otro tema o elige todas las audiencias. Si usaste la búsqueda superior, límpiala también."
            : "Incorpora contenido público o referencias del equipo. Verás qué encaja, qué evidencia existe y qué sigue siendo una hipótesis."}
        </EmptyState>
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
          referenceId: opportunity.referenceIds[0],
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
      notify("Borrador guardado. Revísalo y hazlo tuyo en el estudio.");
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
      </div>
      <Button
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={detailId}
      >
        {expanded ? "Cerrar detalle" : "Entender y crear"}
        <ChevronDown size={16} className={expanded ? "journey-rotated" : ""} />
      </Button>
      <div
        id={detailId}
        className="journey-opportunity-details"
        hidden={!expanded}
      >
        <details className="journey-semantic" open={!!analysis}>
          <summary>
            Análisis contextual con IA <span>Opcional</span>
          </summary>
          <div>
            <div className="section-heading">
              <h3>
                {analysis
                  ? "Lectura contextual con IA"
                  : "Comprueba la relación con tu audiencia"}
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
                <h3>Hipótesis de gancho con IA</h3>
                <p>{analysis.hookHypothesis}</p>
                <p className="journey-muted">
                  Es una propuesta editorial para validar, no una explicación
                  del rendimiento de las referencias.
                </p>
                <h3>Adaptación propuesta con IA</h3>
                <p>{analysis.adaptation}</p>
                <details>
                  <summary>Ver citas y límites del análisis</summary>
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
                  ? "La IA puede contrastar las necesidades declaradas con el texto de las referencias. Esta consulta usa el proveedor configurado y puede tener costo."
                  : "La lectura inicial usa reglas de texto. La IA contextual estará disponible cuando la plataforma complete su conexión; puedes seguir creando y revisando contenido."}
              </p>
            )}
            {analysisError && (
              <p role="alert" className="form-error">
                {analysisError}
              </p>
            )}
          </div>
        </details>
        <div className="journey-evidence-layout">
          <div>
            <h3>Por qué podría encajar</h3>
            <ul>
              {opportunity.reasons.map((reason, index) => (
                <li key={index}>{reason}</li>
              ))}
            </ul>
            <h3>Qué sabemos del crecimiento</h3>
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
            <p className="journey-muted">
              Confianza en la interpretación:{" "}
              {confidenceNames[opportunity.confidence].toLocaleLowerCase()}. No
              demuestra qué causó el desempeño.
            </p>
          </div>
          <div>
            <h3>Evidencia para comprobar</h3>
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
        {canCreate ? (
          created ? (
            <div className="journey-created" role="status">
              <CheckCircle2 size={21} />
              <div>
                <strong>Tu borrador está guardado</strong>
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
              <h3>Dale un enfoque propio</h3>
              <p>
                Se creará un borrador editable a partir de la referencia y tu
                contexto. Revísalo antes de enviarlo a aprobación.
              </p>
              <fieldset disabled={busy}>
                <div className="journey-draft-fields">
                  <Field label="¿Para quién?">
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
                <Field label="Algo que deba tener en cuenta (opcional)">
                  <textarea
                    rows={2}
                    maxLength={3000}
                    value={instructions}
                    onChange={(event) => setInstructions(event.target.value)}
                    placeholder="Un caso de uso, una pregunta frecuente o un enfoque que quieres evitar"
                  />
                </Field>
              </fieldset>
              <div className="journey-form-actions">
                <span>
                  {state.integrations.ai.ready
                    ? "Usará la IA conectada a este espacio."
                    : "Se creará una estructura inicial sin IA conectada."}
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
              Define una audiencia antes de crear contenido.
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
        title="Tu empresa es el punto de partida."
        action={
          <Button onClick={() => navigate("audience")}>
            Continuar a audiencia
            <ArrowRight size={16} />
          </Button>
        }
      >
        Reúne tu web y contenido propio. Tú decides qué se incorpora a la
        dirección editorial.
      </JourneyHeader>
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
          <Notice>
            Un administrador puede importar contenido y actualizar el contexto.
            Puedes consultar las fuentes y el perfil de la empresa.
          </Notice>
        )}
        <section className="journey-section" aria-labelledby="imports-heading">
          <div className="section-heading">
            <h2 id="imports-heading">Lo que ya incorporaste</h2>
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
              <h3>El contexto aún no tiene fuentes importadas</h3>
              <p>
                Empieza por tu sitio web o pega un texto de tu empresa. Un
                enlace a una red social quedará identificado como enlace cuando
                su contenido no sea accesible.
              </p>
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
      notify(
        "Importación guardada. Revisa lo que pudo leerse antes de aplicar la propuesta.",
      );
    } catch (importError) {
      if (active.current === brandId) setError(errorMessage(importError));
    } finally {
      lock.current = false;
      if (active.current === brandId) setBusy(false);
    }
  }
  return (
    <section className="journey-import-form">
      <h2>Trae lo que ya tienes</h2>
      <p>
        Con una sola fuente puedes empezar. Las sugerencias son una
        interpretación del contenido, no una medición de tus consumidores.
      </p>
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
                placeholder="Pega una presentación, una descripción de producto o contenido que ya hayas publicado. Evita datos personales."
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
          <span>Solo contenido público o proporcionado por tu equipo.</span>
          <Button variant="primary" type="submit" busy={busy}>
            <Globe2 size={16} />
            Importar y preparar contexto
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
            sin lectura. Revisa el detalle abajo.
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
              ? "Propuesta asistida por IA"
              : "Propuesta a partir del texto disponible"}
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
            {evidence.status === "failed" && canEdit && (
              <small>
                Puedes pegar el texto de esta fuente en una nueva importación.
              </small>
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
          {review ? "Cerrar propuesta" : "Revisar propuesta de contexto"}
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
        if (active.current === brand.id)
          notify(
            "Contexto aplicado. Las próximas recomendaciones usarán estos criterios.",
          );
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
      <h3>Revisa antes de aplicar</h3>
      <p>
        Estos campos reemplazarán el contexto actual de{" "}
        <strong>{brand.name}</strong>. Corrige lo que no represente a la
        empresa; los perfiles de audiencia se revisan por separado.
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
          <strong>Hipótesis de audiencia para revisar:</strong>{" "}
          {draft.audience
            .map((audience) => `${audience.name}: ${audience.needs}`)
            .join(" · ")}
          . Puedes definir estos perfiles en Audiencia; no se han agregado
          automáticamente.
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
        <span>La propuesta solo se aplica con tu confirmación.</span>
        <Button
          variant="primary"
          type="submit"
          busy={busy}
          disabled={applied && !dirty}
        >
          <Check size={16} />
          Aplicar al contexto de empresa
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
        title="Entiende la necesidad antes de elegir el tema."
        action={
          <Button onClick={() => navigate("opportunities")}>
            Ver oportunidades
            <ArrowRight size={16} />
          </Button>
        }
      >
        Define grupos, recoge señales y distingue lo observado de lo que aún
        necesitas comprobar.
      </JourneyHeader>
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
          Perfiles y necesidades
        </button>
        <button
          id="audience-signals-tab"
          role="tab"
          tabIndex={tab === "signals" ? 0 : -1}
          aria-selected={tab === "signals"}
          aria-controls="audience-signals-panel"
          onClick={() => setTab("signals")}
        >
          Señales y validación
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
        <Notice>
          Estos perfiles son <strong>hipótesis editoriales del equipo</strong>.
          La actividad de una página, un sector o una inscripción no demuestra
          quién consume tu contenido. Contrasta las necesidades con señales
          públicas y resultados.
        </Notice>
        <div className="journey-embedded-profile">
          <AudiencePage key={state.brand.id} />
        </div>
        <div className="journey-form-actions">
          <span>¿Ya tienes una necesidad que contrastar?</span>
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
            title="Define primero un grupo de audiencia"
            action={
              <Button onClick={() => setTab("profiles")}>
                Crear un perfil
                <ArrowRight size={15} />
              </Button>
            }
          >
            Cada señal debe ayudar a comprobar una necesidad concreta de un
            grupo. Los perfiles se definen sin datos de personas.
          </EmptyState>
        )}
        <section className="journey-section">
          <div className="section-heading">
            <h2>Qué respalda tus decisiones</h2>
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
              <h3>Todavía no hay señales registradas</h3>
              <p>
                Guarda un contenido público relevante con su enlace o una
                hipótesis del equipo. Describe qué sugiere y qué falta por
                comprobar.
              </p>
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
      notify("Señal guardada con su origen y contexto.");
    } catch (saveError) {
      if (active.current === brandId) setError(errorMessage(saveError));
    } finally {
      lock.current = false;
      if (active.current === brandId) setBusy(false);
    }
  }
  return (
    <section className="journey-signal-form">
      <h2>Registra una señal, con contexto</h2>
      <p>
        Guarda observaciones sobre contenido y necesidades del grupo. Evita
        nombres, correos y datos de personas.
      </p>
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
            <textarea
              name="note"
              rows={3}
              required
              maxLength={4000}
              placeholder="Describe la señal sin asumir que representa a toda tu audiencia."
            />
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
          <span>
            {sourceType === "public_content"
              ? "Un enlace documenta la señal; no prueba representatividad."
              : "Quedará etiquetada como hipótesis, pendiente de validar."}
          </span>
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
          <a
            href={evidenceUrl}
            target="_blank"
            rel="noreferrer"
          >
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
        title="Publica, registra y aprende."
        action={
          <Button onClick={() => navigate("calendar")}>
            <CalendarDays size={16} />
            Abrir calendario
          </Button>
        }
      >
        Compara lo que ocurrió con cada grupo de audiencia y usa esa evidencia
        en tu próxima decisión.
      </JourneyHeader>
      <Notice>
        Las métricas se registran manualmente. Programar en el calendario no
        publica en redes. Si usaste un webhook, comprueba la publicación final
        en tu servicio. Guarda aquí el enlace y los datos después de confirmar
        la publicación.
      </Notice>
      {state.brand.role === "reviewer" ? (
        <ReviewerNotice />
      ) : (
        <section className="journey-results-form">
          <div className="section-heading">
            <h2>Registrar o corregir una publicación</h2>
            <Badge>Registro manual</Badge>
          </div>
          {eligible.length ? (
            <>
              <Field label="Pieza para registrar resultados">
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
              ) : (
                <p className="journey-muted">
                  Una pieza debe pasar por aprobación antes de registrar su
                  publicación.
                </p>
              )}
            </>
          ) : (
            <div className="journey-quiet-empty">
              <ClipboardCheck size={25} />
              <h3>Primero aprueba una pieza en el estudio</h3>
              <p>
                Cuando esté aprobada o programada, podrás registrar su
                publicación y sus métricas aquí.
              </p>
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
                <p className="journey-table-caption">
                  {insights.data?.learning.summary ||
                    "Resultados registrados por el equipo."}{" "}
                  Las diferencias pueden depender del canal, la distribución y
                  el momento. No demuestran causalidad ni predicen éxito.
                </p>
                <SegmentResults outcomes={outcomes} />
                <p className="journey-muted">
                  Interacciones = cantidad de acciones registradas por el
                  equipo, no una tasa. Compara piezas y periodos equivalentes.
                </p>
              </>
            ) : (
              <div className="journey-quiet-empty">
                <Target size={25} />
                <h3>Los resultados empiezan con una publicación real</h3>
                <p>
                  Aún no hay métricas registradas. Al guardar la primera pieza
                  verás su audiencia, visualizaciones, interacciones y
                  contactos.
                </p>
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
                                  behavior: "smooth",
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
            <th scope="col">Interacciones</th>
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
            publishedUrl:
              String(input.get("publishedUrl") || "").trim() || undefined,
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
      notify("Publicación y métricas guardadas como registro manual.");
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
            label="Interacciones"
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
        <Field label="Periodo de medición y aprendizajes (opcional)">
          <textarea
            name="notes"
            rows={3}
            maxLength={4000}
            defaultValue={outcome?.notes}
            aria-describedby="outcome-notes-privacy"
            placeholder="Ej. Métricas a los 7 días. Qué preguntas generó y qué probarías en la próxima pieza."
          />
          <small id="outcome-notes-privacy" className="field-hint">
            Registra aprendizajes del grupo, sin nombres, emails, teléfonos ni
            fichas de personas.
          </small>
        </Field>
      </fieldset>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="journey-form-actions">
        <span>
          Al guardar confirmarás que la pieza se publicó. No se enviará nada a
          redes.
        </span>
        <Button variant="primary" type="submit" busy={busy}>
          <Check size={16} />
          {outcome ? "Actualizar registro" : "Guardar publicación y resultados"}
        </Button>
      </div>
    </form>
  );
}
