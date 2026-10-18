import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronRight,
  Compass,
  Download,
  ExternalLink,
  Flame,
  Globe2,
  Layers3,
  Link,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  Upload,
  X,
  MessageSquare,
  Eye,
  FileText,
  Info,
  Video,
} from "lucide-react";
import { useWorkspace } from "../lib/workspace";
import { api, json, uploadAsset } from "../lib/api";
import { getOrUploadCaptureAsset } from "../lib/capture-retry.mjs";
import { createThenRefresh } from "../lib/workflow-recovery.mjs";
import type {
  Asset,
  Piece,
  Reference,
  SocialPlatform,
  SocialSettings,
  VideoAnalysis,
} from "../lib/types";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconButton,
  Modal,
} from "../components/ui";
import {
  formatNames,
  safeExternalUrl,
  saturationNames,
  timeAgo,
} from "../lib/format";

function SourceMark({
  source,
  platform,
}: {
  source: string;
  platform?: SocialPlatform;
}) {
  const s = source.toLowerCase();
  const social =
    platform ||
    (s.includes("youtube")
      ? "youtube"
      : s.includes("instagram")
        ? "instagram"
        : s.includes("tiktok")
          ? "tiktok"
          : s.includes("facebook")
            ? "facebook"
            : s === "x" || s.startsWith("x ")
              ? "x"
              : undefined);
  const socialMark: Partial<Record<SocialPlatform, string>> = {
    youtube: "YT",
    instagram: "IG",
    tiktok: "TK",
    facebook: "f",
    x: "X",
  };
  return (
    <span
      className={`source-mark ${social || (s.includes("hacker") ? "hn" : s.includes("reddit") ? "reddit" : s.includes("google") ? "google" : s.includes("equipo") || s.includes("team") ? "team" : "")}`}
    >
      {social ? (
        socialMark[social]
      ) : s.includes("hacker") ? (
        "Y"
      ) : s.includes("reddit") ? (
        "r/"
      ) : s.includes("google") ? (
        "G"
      ) : s.includes("equipo") || s.includes("team") ? (
        <UsersIcon />
      ) : (
        source.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
function UsersIcon() {
  return <Layers3 size={15} />;
}
function trendLabel(ref: Reference) {
  if (ref.platform === "youtube") {
    return ref.trend?.priorityMetric?.rank != null
      ? `YouTube · posición ${ref.trend.priorityMetric.rank} del lote`
      : ref.trend?.metrics?.views != null
        ? "YouTube · vistas observadas"
        : "YouTube · sin clasificar";
  }
  return ref.trend?.kind === "emerging"
    ? "En crecimiento"
    : ref.trend?.kind === "popular"
      ? "Popular ahora"
      : "Señal por explorar";
}
function platformLabel(platform?: SocialPlatform) {
  return platform
    ? {
        youtube: "YouTube",
        instagram: "Instagram",
        tiktok: "TikTok",
        facebook: "Facebook",
        x: "X",
      }[platform]
    : "";
}
function publicYoutubeVideoId(value?: string) {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  )
    return null;
  const hostname = url.hostname.toLowerCase();
  if (
    ![
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "youtu.be",
      "www.youtube-nocookie.com",
    ].includes(hostname)
  )
    return null;
  let id: string | null = null;
  if (hostname === "youtu.be") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 1) return null;
    id = parts[0];
    if ([...url.searchParams.keys()].some((key) => key !== "si")) return null;
  } else if (url.pathname === "/watch") {
    const values = url.searchParams.getAll("v");
    if (values.length !== 1) return null;
    id = values[0];
    const allowed = new Set(["v", "si", "feature", "t", "list", "index"]);
    if ([...url.searchParams.keys()].some((key) => !allowed.has(key)))
      return null;
  } else {
    const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)\/?$/);
    if (!match) return null;
    id = match[1];
    if ([...url.searchParams.keys()].some((key) => !["si", "t"].includes(key)))
      return null;
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}
function isVideoReference(reference: Reference, assets: Asset[]) {
  const attachedVideo = assets.some(
    (asset) => asset.id === reference.assetId && asset.type === "video",
  );
  return (
    attachedVideo ||
    ["youtube", "instagram", "tiktok"].includes(reference.platform || "") ||
    /video|reel|short/i.test(reference.format || "") ||
    !!publicYoutubeVideoId(reference.url)
  );
}
function canAccessVideo(reference: Reference, assets: Asset[]) {
  if (reference.mediaAccess === "unavailable") return false;
  if (
    reference.mediaAccess === "youtube_url" ||
    reference.mediaAccess === "provider_url" ||
    reference.mediaAccess === "uploaded_file"
  )
    return true;
  const attachedVideo = assets.some(
    (asset) => asset.id === reference.assetId && asset.type === "video",
  );
  return (
    attachedVideo ||
    !!safeExternalUrl(reference.mediaUrl) ||
    !!publicYoutubeVideoId(reference.url)
  );
}
function num(value?: number) {
  return value == null
    ? "—"
    : new Intl.NumberFormat("es", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value);
}

export default function Radar() {
  const { state, refresh, notify, search, navigate } = useWorkspace();
  const [tab, setTab] = useState("all"),
    [contextOnly, setContextOnly] = useState(true),
    [source, setSource] = useState("all"),
    [period, setPeriod] = useState("week"),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Reference | null>(null),
    [layout, setLayout] = useState<"cards" | "radar">("cards"),
    [shownCount, setShownCount] = useState(12),
    [syncReport, setSyncReport] = useState<{
      added: number;
      updated?: number;
      errors: string[];
    } | null>(null);
  const visible = useMemo(
    () =>
      state.references
        .filter((r) => r.status !== "dismissed")
        .filter(
          (r) =>
            !contextOnly ||
            r.isDemo ||
            !r.brandRelevance ||
            r.brandRelevance.matchedTerms.length > 0 ||
            (r.analysis?.relevance || 0) >= 70,
        )
        .filter(
          (r) =>
            !search ||
            `${r.title} ${r.text || ""} ${(r.tags || []).join(" ")}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .filter((r) => source === "all" || r.source === source)
        .filter(
          (r) =>
            tab === "all" ||
            (tab === "saved" && r.status === "saved") ||
            (tab === "emerging" && r.trend?.kind === "emerging") ||
            (tab === "relevant" &&
              (r.analysis?.relevance ?? r.brandRelevance?.score ?? 0) >= 70),
        )
        .filter(
          (r) =>
            period === "all" ||
            new Date(r.publishedAt || r.createdAt).getTime() >
              Date.now() - (period === "day" ? 1 : 7) * 86400000,
        )
        .sort((a, b) => {
          const demoOrder = Number(!!a.isDemo) - Number(!!b.isDemo);
          if (demoOrder) return demoOrder;

          if (
            source !== "all" &&
            a.platform === "youtube" &&
            b.platform === "youtube"
          ) {
            const aViews =
              a.trend?.metrics?.views ??
              (a.trend?.priorityMetric?.name === "views"
                ? a.trend.priorityMetric.value
                : undefined);
            const bViews =
              b.trend?.metrics?.views ??
              (b.trend?.priorityMetric?.name === "views"
                ? b.trend.priorityMetric.value
                : undefined);
            if (aViews == null && bViews != null) return 1;
            if (bViews == null && aViews != null) return -1;
            if (aViews != null && bViews != null && aViews !== bViews)
              return bViews - aViews;

            const aRank = a.trend?.priorityMetric?.rank;
            const bRank = b.trend?.priorityMetric?.rank;
            if (aRank == null && bRank != null) return 1;
            if (bRank == null && aRank != null) return -1;
            if (aRank != null && bRank != null && aRank !== bRank)
              return aRank - bRank;
          }

          return (
            (b.trend?.score || b.analysis?.relevance || 0) -
            (a.trend?.score || a.analysis?.relevance || 0)
          );
        }),
    [state.references, search, source, tab, period, contextOnly],
  );
  const real = state.references.filter(
    (r) => !r.isDemo && r.status !== "dismissed",
  );
  const clusters = useMemo(() => {
    const map = new Map<string, Reference[]>();
    for (const ref of visible) {
      const key =
        ref.topic || (ref.tags || []).slice(0, 2).join(" ") || ref.source;
      map.set(key, [...(map.get(key) || []), ref]);
    }
    return [...map.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 8);
  }, [visible]);
  async function discover() {
    setBusy(true);
    try {
      const result = await api<{
        added: number;
        updated?: number;
        errors: string[];
      }>(`/api/brands/${state.brand.id}/discover`, {
        method: "POST",
        body: "{}",
      });
      setSyncReport(result);
      await refresh();
      notify(
        `${result.added} hallazgos nuevos${result.updated ? ` · ${result.updated} actualizados` : ""}.${result.errors?.length ? " Algunas fuentes requieren atención." : ""}`,
      );
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  const latest = state.sources
    .map((s) => s.lastSyncedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  return (
    <div className="page radar-page">
      <div className="page-heading">
        <div>
          <h1>
            El mundo se mueve.
            <br className="small-break" /> Encuentra tu próximo ángulo.
          </h1>
          <p>
            Conversaciones que crecen, filtradas por lo que importa para{" "}
            <strong>{state.brand.name}</strong>.
          </p>
        </div>
        <Button
          variant="primary"
          busy={busy}
          disabled={state.brand.role === "reviewer"}
          onClick={() => void discover()}
        >
          <RefreshCw size={16} />
          Buscar tendencias
        </Button>
      </div>
      {state.references.some((r) => r.isDemo) && !real.length && (
        <div className="demo-banner">
          <Info size={16} />
          <span>
            Estás viendo datos de ejemplo. Pulsa{" "}
            <strong>Buscar tendencias</strong> para traer señales reales de tus
            fuentes.
          </span>
          <Badge tone="amber">DEMO</Badge>
        </div>
      )}
      <div className="stats-grid">
        <Metric
          icon={<Radio />}
          label="Señales en tu radar"
          value={String(real.length)}
          detail="Hallazgos reales captados"
        />
        <Metric
          icon={<TrendingUp />}
          label="En crecimiento"
          value={String(
            real.filter((r) => r.trend?.kind === "emerging").length,
          )}
          detail="Con crecimiento observado"
        />
        <Metric
          icon={<Compass />}
          label="Dentro de tu contexto"
          value={String(
            real.filter(
              (r) =>
                (r.brandRelevance?.matchedTerms.length || 0) > 0 ||
                (r.analysis?.relevance || 0) >= 70,
            ).length,
          )}
          detail="Coincidencias con tus temas"
        />
        <Metric
          icon={<Globe2 />}
          label="Fuentes conectadas"
          value={String(state.sources.filter((s) => s.enabled).length)}
          detail={
            latest
              ? `Última búsqueda: ${timeAgo(latest)}`
              : "Listas para explorar"
          }
        />
      </div>
      <div className="radar-body">
        <section className="opportunities">
          <div className="section-heading">
            <div>
              <h2>
                Oportunidades de contenido{" "}
                <span className="count-pill">{visible.length}</span>
              </h2>
              <p>De lo que está pasando a lo que vale la pena contar.</p>
            </div>
            <div className="view-toggle" aria-label="Vista de resultados">
              <button
                className={layout === "cards" ? "active" : ""}
                onClick={() => setLayout("cards")}
                title="Ver tarjetas"
              >
                <Layers3 size={16} />
              </button>
              <button
                className={layout === "radar" ? "active" : ""}
                onClick={() => setLayout("radar")}
                title="Ver radar"
              >
                <Radio size={16} />
              </button>
            </div>
          </div>
          <div className="filter-bar">
            <div className="tabs">
              <button
                className={tab === "all" ? "active" : ""}
                onClick={() => setTab("all")}
              >
                Para ti
              </button>
              <button
                className={tab === "emerging" ? "active" : ""}
                onClick={() => setTab("emerging")}
              >
                <TrendingUp size={14} />
                Emergentes
              </button>
              <button
                className={tab === "relevant" ? "active" : ""}
                onClick={() => setTab("relevant")}
              >
                Alta afinidad
              </button>
              <button
                className={tab === "saved" ? "active" : ""}
                onClick={() => setTab("saved")}
              >
                Guardados
              </button>
            </div>
            <div className="select-filters">
              <label className="context-toggle">
                <input
                  type="checkbox"
                  checked={contextOnly}
                  onChange={(e) => setContextOnly(e.target.checked)}
                />
                Solo mi contexto
              </label>
              <select
                aria-label="Filtrar fuente"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="all">Todas las fuentes</option>
                {[...new Set(state.references.map((r) => r.source))].map(
                  (s) => (
                    <option key={s}>{s}</option>
                  ),
                )}
              </select>
              <select
                aria-label="Periodo"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                <option value="day">Últimas 24 h</option>
                <option value="week">Esta semana</option>
                <option value="all">Todo el historial</option>
              </select>
            </div>
          </div>
          {syncReport?.errors?.length ? (
            <div className="source-warning">
              <Info size={16} />
              <div>
                <strong>La búsqueda terminó con cobertura parcial.</strong>
                {syncReport.errors.map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
                <button
                  className="text-button"
                  onClick={() => navigate("settings")}
                >
                  Revisar fuentes
                </button>
              </div>
              <IconButton
                label="Cerrar informe"
                onClick={() => setSyncReport(null)}
              >
                <X size={15} />
              </IconButton>
            </div>
          ) : null}
          {!visible.length ? (
            <EmptyState
              icon={<Compass size={28} />}
              title={
                state.references.length
                  ? "Todavía no hay señales con estos filtros"
                  : "Tu próxima gran idea está por aparecer"
              }
              action={
                <Button
                  variant="primary"
                  busy={busy}
                  disabled={state.brand.role === "reviewer"}
                  onClick={() => void discover()}
                >
                  <Search size={16} />
                  Explorar mis fuentes
                </Button>
              }
            >
              {tab === "emerging"
                ? "Necesitamos al menos dos observaciones separadas con métricas crecientes para señalar una tendencia emergente."
                : "Busca en tus fuentes públicas o agrega una referencia. Cada hallazgo conserva su origen y evidencia."}
            </EmptyState>
          ) : layout === "cards" ? (
            <div className="reference-grid">
              {visible.slice(0, shownCount).map((ref) => (
                <ReferenceCard
                  key={ref.id}
                  reference={ref}
                  onOpen={() => setSelected(ref)}
                />
              ))}
            </div>
          ) : (
            <RadarPlot clusters={clusters} onOpen={setSelected} />
          )}
          {layout === "cards" && visible.length > shownCount && (
            <div className="load-more">
              <Button onClick={() => setShownCount((n) => n + 12)}>
                Ver {Math.min(12, visible.length - shownCount)} señales más
              </Button>
              <span className="small muted">
                Mostrando {Math.min(shownCount, visible.length)} de{" "}
                {visible.length}
              </span>
            </div>
          )}
        </section>
        <aside className="radar-insights">
          <div className="insight-card dark">
            <div className="row">
              <Sparkles size={18} />
            </div>
            <h3>
              Una tendencia.
              <br />
              Tu propia perspectiva.
            </h3>
            <p>
              Elige una señal y encuentra un enfoque que tu audiencia todavía
              necesite escuchar.
            </p>
            <button onClick={() => navigate("brand")}>
              Afinar mi contexto
              <ArrowUpRight size={16} />
            </button>
            <div className="insight-orbit" />
          </div>
          <div className="insight-card">
            <div className="section-title">
              <h3>Conversaciones detectadas</h3>
              <Layers3 size={16} />
            </div>
            {clusters.length ? (
              clusters.slice(0, 5).map(([label, refs], index) => (
                <button
                  className="topic-row"
                  key={label}
                  onClick={() => setSelected(refs[0])}
                >
                  <span className="topic-index">0{index + 1}</span>
                  <span>
                    <strong>{label}</strong>
                    <small>
                      {new Set(refs.map((r) => r.source)).size} fuente(s) ·{" "}
                      {refs.length} referencias
                    </small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))
            ) : (
              <p className="muted small">
                Los grupos aparecerán a medida que encuentres referencias.
              </p>
            )}
            <p className="insight-caption">
              Volumen dentro de tu radar; no representa todo el mercado.
            </p>
          </div>
          <div className="insight-card source-list">
            <div className="section-title">
              <h3>Tus fuentes</h3>
              <button
                className="text-button"
                onClick={() => navigate("settings")}
              >
                Gestionar
              </button>
            </div>
            {state.sources.slice(0, 4).map((s) => (
              <div className="source-row" key={s.id}>
                <SourceMark source={s.name} platform={s.platform} />
                <span>
                  <strong>{s.name}</strong>
                  <small>
                    {s.lastError
                      ? "Requiere atención"
                      : s.lastSyncedAt
                        ? timeAgo(s.lastSyncedAt)
                        : s.enabled
                          ? "Lista para buscar"
                          : "Pausada"}
                  </small>
                </span>
                <i
                  className={`status-dot ${s.lastError ? "amber" : s.enabled ? "green" : ""}`}
                />
              </div>
            ))}
            <div className="free-note">
              <Check size={14} />
              Fuentes abiertas · sin scraping privado
            </div>
          </div>
        </aside>
      </div>
      {selected && (
        <ReferenceDetail
          reference={
            state.references.find((r) => r.id === selected.id) || selected
          }
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="metric-card">
      <div>
        <span className="metric-label">{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function ReferenceCard({
  reference: r,
  onOpen,
}: {
  reference: Reference;
  onOpen: () => void;
}) {
  const { state, refresh, notify } = useWorkspace();
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api(`/api/brands/${state.brand.id}/references/${r.id}`, {
        method: "PATCH",
        body: json({
          status:
            r.status === "saved" ? (r.analysis ? "analyzed" : "new") : "saved",
        }),
      });
      await refresh();
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="reference-card">
      <div className="reference-meta">
        <SourceMark source={r.source} platform={r.platform} />
        <span>{r.source}</span>
        <span className="meta-dot">·</span>
        <span
          title={
            r.publishedAt
              ? "Fecha de publicación en la fuente"
              : "Momento en que entró al radar"
          }
        >
          {timeAgo(r.publishedAt || r.createdAt)}
        </span>
        <IconButton
          label={
            r.status === "saved" ? "Quitar de guardados" : "Guardar referencia"
          }
          disabled={busy || state.brand.role === "reviewer"}
          onClick={() => void save()}
        >
          <Bookmark
            size={17}
            fill={r.status === "saved" ? "currentColor" : "none"}
          />
        </IconButton>
      </div>
      <button className="reference-body" onClick={onOpen}>
        {safeExternalUrl(r.thumbnailUrl) && (
          <img
            className="reference-thumbnail"
            src={safeExternalUrl(r.thumbnailUrl)}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        )}
        <div className="reference-badges">
          <Badge
            tone={
              r.trend?.kind === "emerging"
                ? "green"
                : r.trend?.kind === "popular"
                  ? "amber"
                  : "neutral"
            }
          >
            {r.trend?.kind === "emerging" ? (
              <TrendingUp size={12} />
            ) : r.trend?.kind === "popular" ? (
              <Flame size={12} />
            ) : (
              <Radio size={12} />
            )}{" "}
            {trendLabel(r)}
          </Badge>
          {r.platform && <Badge>{platformLabel(r.platform)}</Badge>}
          {isVideoReference(r, state.assets) && (
            <Badge tone={canAccessVideo(r, state.assets) ? "green" : "neutral"}>
              {canAccessVideo(r, state.assets)
                ? "Video accesible"
                : "Solo metadatos"}
            </Badge>
          )}
          {r.isDemo && <Badge tone="amber">Ejemplo</Badge>}
        </div>
        <h3>{r.title}</h3>
        <p>
          {r.analysis?.adaptation ||
            r.text ||
            "Abre esta referencia para revisar su origen y encontrar un ángulo para tu marca."}
        </p>
        <div className="reference-tags">
          {(r.tags || []).slice(0, 2).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
          <span>
            {r.language === "en"
              ? "EN → ES"
              : r.language?.toUpperCase() || "Sin idioma"}
          </span>
        </div>
      </button>
      <div className="reference-bottom">
        <div className="reference-metrics">
          {r.trend?.metrics?.score != null ? (
            <span title="Puntos en su fuente">
              <Flame size={13} />
              {num(r.trend.metrics.score)}
            </span>
          ) : null}
          {r.trend?.metrics?.comments != null ? (
            <span title="Comentarios">
              <MessageSquare size={13} />
              {num(r.trend.metrics.comments)}
            </span>
          ) : null}
          {(r.trend?.metrics?.views ??
            (r.trend?.priorityMetric?.name === "views"
              ? r.trend.priorityMetric.value
              : undefined)) != null ? (
            <span
              title={
                r.platform === "youtube"
                  ? "Vistas públicas observadas en YouTube"
                  : "Visualizaciones reportadas por la fuente"
              }
            >
              <Eye size={13} />
              {num(
                r.trend?.metrics?.views ??
                  r.trend?.priorityMetric?.value ??
                  undefined,
              )}
            </span>
          ) : null}
          {r.analysis ? (
            <span className="affinity">
              <i />
              Afinidad {r.analysis.relevance}/100
            </span>
          ) : r.brandRelevance ? (
            <span title={r.brandRelevance.matchedTerms.join(", ")}>
              Afinidad preliminar {r.brandRelevance.score}/100
            </span>
          ) : (
            <span className="muted">Pendiente de análisis</span>
          )}
        </div>
        <button className="card-open" onClick={onOpen}>
          Explorar
          <ArrowUpRight size={14} />
        </button>
      </div>
    </article>
  );
}

function RadarPlot({
  clusters,
  onOpen,
}: {
  clusters: [string, Reference[]][];
  onOpen: (r: Reference) => void;
}) {
  const positions = [
    [50, 24],
    [28, 40],
    [71, 47],
    [45, 66],
    [19, 68],
    [78, 73],
    [58, 44],
    [40, 36],
  ];
  return (
    <div className="radar-visual">
      <div className="radar-grid">
        <svg viewBox="0 0 600 400" aria-hidden="true">
          <line x1="0" y1="200" x2="600" y2="200" />
          <line x1="300" y1="0" x2="300" y2="400" />
          {[65, 125, 185].map((r) => (
            <circle key={r} cx="300" cy="200" r={r} />
          ))}
        </svg>
        {clusters.map(([name, refs], i) => (
          <button
            className={`radar-bubble saturation-${refs[0].analysis?.saturation || "unknown"}`}
            key={name}
            style={{
              left: `${positions[i][0]}%`,
              top: `${positions[i][1]}%`,
              width: Math.min(120, 50 + refs.length * 9),
              height: Math.min(120, 50 + refs.length * 9),
            }}
            title={`${name}: ${refs.length} referencias`}
            onClick={() => onOpen(refs[0])}
          >
            <strong>{refs.length}</strong>
            <span>{name}</span>
          </button>
        ))}
      </div>
      <div className="radar-legend">
        <span>Tamaño: referencias agrupadas</span>
        <span>
          <i className="legend-dot green" />
          Poca repetición
        </span>
        <span>
          <i className="legend-dot amber" />
          Media
        </span>
        <span>
          <i className="legend-dot red" />
          Alta
        </span>
        <span>
          <i className="legend-dot neutral" />
          Sin estimación
        </span>
      </div>
      <p className="small muted">
        La posición organiza la lectura. La repetición se estima dentro del
        corpus observado.
      </p>
    </div>
  );
}

export function ReferenceDetail({
  reference: r,
  onClose,
}: {
  reference: Reference;
  onClose: () => void;
}) {
  const { state, refresh, notify, navigate } = useWorkspace();
  const [busy, setBusy] = useState(""),
    [draftError, setDraftError] = useState(""),
    [committedDraft, setCommittedDraft] = useState<Piece | null>(null),
    [format, setFormat] = useState("post"),
    [segmentId, setSegmentId] = useState(""),
    [videoFocus, setVideoFocus] = useState(""),
    [videoError, setVideoError] = useState(""),
    [geminiStatus, setGeminiStatus] = useState<
      "loading" | "configured" | "missing" | "error"
    >("loading");
  const busyRef = useRef(false);
  const committedDraftRef = useRef<Piece | null>(null);
  const attachment = state.assets.find((asset) => asset.id === r.assetId);
  const attachmentUrl = attachment
    ? `/api/brands/${encodeURIComponent(state.brand.id)}/assets/${encodeURIComponent(attachment.id)}/file?download=1`
    : "";
  const [attachmentCheck, setAttachmentCheck] = useState<{
    url: string;
    status: "checking" | "available" | "missing" | "unauthorized" | "error";
  }>({ url: "", status: "checking" });
  const [attachmentRetry, setAttachmentRetry] = useState(0);
  const attachmentStatus =
    attachmentCheck.url === attachmentUrl
      ? attachmentCheck.status
      : "checking";
  useEffect(() => {
    if (!attachmentUrl) return;
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    setAttachmentCheck({ url: attachmentUrl, status: "checking" });
    void fetch(attachmentUrl, {
      method: "HEAD",
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => {
        if (!active) return;
        setAttachmentCheck({
          url: attachmentUrl,
          status: response.ok
            ? "available"
            : response.status === 404 || response.status === 410
              ? "missing"
              : response.status === 401 || response.status === 403
                ? "unauthorized"
                : "error",
        });
      })
      .catch(() => {
        if (active)
          setAttachmentCheck({ url: attachmentUrl, status: "error" });
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [attachmentUrl, attachmentRetry]);
  const close = useCallback(() => {
    if (!busyRef.current) onClose();
  }, [onClose]);
  useEffect(() => {
    let active = true;
    void api<SocialSettings>(`/api/brands/${state.brand.id}/social/settings`)
      .then((settings) => {
        if (active)
          setGeminiStatus(
            settings.gemini.configured ? "configured" : "missing",
          );
      })
      .catch(() => {
        if (active) setGeminiStatus("error");
      });
    return () => {
      active = false;
    };
  }, [state.brand.id]);
  const videoCandidate = isVideoReference(r, state.assets);
  const videoAccessible = canAccessVideo(r, state.assets);
  const mayAnalyzeVideo =
    state.brand.role !== "reviewer" &&
    videoAccessible &&
    !r.isDemo &&
    geminiStatus === "configured";
  const youtubeViews =
    r.trend?.metrics?.views ??
    (r.trend?.priorityMetric?.name === "views"
      ? r.trend.priorityMetric.value
      : undefined);
  async function analyze() {
    setBusy("analyze");
    try {
      await api(`/api/brands/${state.brand.id}/analyze`, {
        method: "POST",
        body: json({ referenceId: r.id }),
      });
      await refresh();
      notify("Análisis listo. Revisa la evidencia y la hipótesis.");
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy("");
    }
  }
  async function analyzeVideo() {
    setBusy("video-analysis");
    setVideoError("");
    try {
      const result = await api<Reference>(
        `/api/brands/${state.brand.id}/references/${r.id}/analyze-video`,
        {
          method: "POST",
          body: json(videoFocus.trim() ? { focus: videoFocus.trim() } : {}),
        },
      );
      if (!result.videoAnalysis?.summary)
        throw new Error(
          "La solicitud terminó sin devolver un análisis de video. No se guardó ningún resultado.",
        );
      await refresh();
      notify("Análisis audiovisual listo. Revisa su cobertura y limitaciones.");
    } catch (error) {
      setVideoError(
        error instanceof Error
          ? error.message
          : "No se pudo examinar este video.",
      );
    } finally {
      setBusy("");
    }
  }
  async function draft() {
    if (busyRef.current || state.brand.role === "reviewer") return;
    busyRef.current = true;
    setBusy("draft");
    setDraftError("");
    try {
      const result = await createThenRefresh(
        committedDraftRef.current,
        async () => {
          const piece = await api<Piece>(
            `/api/brands/${state.brand.id}/draft`,
            {
              method: "POST",
              body: json({
                referenceId: r.id,
                format,
                segmentId: segmentId || undefined,
                channel: format === "post" ? "linkedin" : "instagram",
              }),
            },
          );
          committedDraftRef.current = piece;
          setCommittedDraft(piece);
          return piece;
        },
        refresh,
      );
      if (result.status === "refresh-failed") {
        setDraftError("Guion guardado, no se pudo actualizar el estudio.");
        return;
      }
      onClose();
      navigate("studio", result.piece.id);
      notify("Tu primer guion está listo para editar.");
    } catch (e) {
      setDraftError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }
  return (
    <Modal wide title="De señal a oportunidad" onClose={close}>
      <div className="detail-source">
        <SourceMark source={r.source} platform={r.platform} />
        <span>
          {r.source} · {timeAgo(r.createdAt)}
        </span>
        {r.platform && <Badge>{platformLabel(r.platform)}</Badge>}
        {r.isDemo && <Badge tone="amber">Datos de ejemplo</Badge>}
        {safeExternalUrl(r.url) && (
          <a href={safeExternalUrl(r.url)} target="_blank" rel="noreferrer">
            Ver original
            <ExternalLink size={14} />
          </a>
        )}
      </div>
      {r.originalUrlOmitted && (
        <p className="small muted">
          El enlace original se omitió porque no cumple las reglas de citas
          públicas. El contexto aportado sigue disponible.
        </p>
      )}
      <h2 className="detail-title">{r.title}</h2>
      {r.text && <p className="detail-text">{r.text}</p>}
      {(r.assetId || r.format === "document") && (
        <section className="reference-attachment" aria-label="Archivo adjunto">
          <div className="reference-attachment-info">
            <strong>Archivo adjunto</strong>
            {attachment && (
              <>
                <span className="reference-attachment-name">
                  {attachment.name}
                </span>
                <span className="small muted">
                  {attachment.mimeType} ·{" "}
                  {new Intl.NumberFormat("es").format(attachment.size)} bytes
                </span>
              </>
            )}
            <p className="small muted">
              Archivo aportado por el equipo. Su descarga requiere acceso a esta
              empresa; no es un enlace público.
            </p>
          </div>
          <div className="reference-attachment-action" aria-live="polite">
            {!attachment ? (
              <p role="status">
                No hay un archivo adjunto disponible. Pide al equipo que vuelva a
                adjuntar el original desde Agregar referencia.
              </p>
            ) : attachmentStatus === "available" ? (
              <a
                className="button secondary"
                href={attachmentUrl}
                download={attachment.name}
              >
                <Download size={16} aria-hidden="true" />
                Descargar original adjunto
              </a>
            ) : attachmentStatus === "checking" ? (
              <p role="status">Comprobando el archivo adjunto…</p>
            ) : (
              <>
                <p role="status">
                  {attachmentStatus === "missing"
                    ? "El archivo adjunto ya no está disponible. Pide al equipo que vuelva a adjuntar el original."
                    : attachmentStatus === "unauthorized"
                      ? "No se pudo autorizar la descarga. Comprueba tu sesión y tu acceso a esta empresa."
                      : "No se pudo comprobar el archivo. Vuelve a intentarlo para habilitar la descarga."}
                </p>
                <Button onClick={() => setAttachmentRetry((value) => value + 1)}>
                  Volver a comprobar
                </Button>
              </>
            )}
          </div>
        </section>
      )}
      {attachment?.type === "image" && (
        <img
          className="reference-image"
          src={attachment.url}
          alt={r.title}
        />
      )}
      {r.trend && (
        <div className="evidence-box">
          <div className="row">
            <TrendingUp size={17} />
            <strong>
              {r.platform === "youtube"
                ? "Métricas observadas · YouTube"
                : trendLabel(r)}
            </strong>
            {r.platform === "youtube" ? (
              r.trend.priorityMetric?.rank != null && (
                <Badge>
                  Posición {r.trend.priorityMetric.rank} dentro de esta consulta
                </Badge>
              )
            ) : (
              <Badge>Prioridad {Math.round(r.trend.score)}/100</Badge>
            )}
          </div>
          {r.platform === "youtube" && (
            <p className="small muted">
              {youtubeViews != null
                ? `${num(youtubeViews)} vistas públicas reportadas por YouTube.`
                : "Esta referencia no incluye un contador público de vistas."}
              {r.trend.priorityMetric?.origin
                ? ` Fuente de la métrica: ${r.trend.priorityMetric.origin}.`
                : " No se calcula un ranking global entre redes."}
            </p>
          )}
          <ul>
            {(r.trend.scoreReasons || []).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <p className="small muted">
            Observado {timeAgo(r.trend.observedAt)}
            {r.trend.previousObservedAt
              ? ` · Observación anterior: ${timeAgo(r.trend.previousObservedAt)}`
              : " · Primera observación; el crecimiento todavía no está demostrado."}
          </p>
        </div>
      )}
      {videoCandidate && (
        <section
          className="video-analysis-section"
          aria-labelledby="video-analysis-title"
        >
          <div className="video-analysis-heading">
            <div>
              <h3 id="video-analysis-title">Lectura audiovisual</h3>
            </div>
            {r.videoAnalysis && (
              <Badge tone="green">
                {r.videoAnalysis.contentScope === "sampled_video"
                  ? "Video por muestras"
                  : "Video y audio"}
              </Badge>
            )}
          </div>
          <p className="small muted">
            Al iniciar, el video accesible se envía a Gemini para examinar sus
            imágenes y audio. Esta acción puede tener coste. El archivo debe
            cumplir los límites de esta implementación: hasta 20 minutos y 50
            MB.
          </p>
          <div className="video-access-note">
            <span className="signal-dot" />
            {videoAccessLabel(r, state.assets)}
          </div>
          {r.thumbnailUrl && safeExternalUrl(r.thumbnailUrl) && (
            <img
              className="video-detail-thumbnail"
              src={safeExternalUrl(r.thumbnailUrl)}
              alt={`Miniatura de ${r.title}`}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          )}
          {!videoAccessible && (
            <p className="small muted">
              Solo hay metadatos disponibles. No se puede examinar el contenido
              audiovisual de esta referencia.
            </p>
          )}
          {r.isDemo && (
            <p className="small muted">
              Las referencias de ejemplo no se envían al proveedor de análisis.
            </p>
          )}
          {geminiStatus === "loading" && (
            <p className="small muted">Consultando la conexión de Gemini…</p>
          )}
          {geminiStatus === "missing" && (
            <p className="small muted">
              Gemini no está configurado para esta marca. Un propietario puede
              conectarlo en{" "}
              <button
                className="text-button"
                type="button"
                onClick={() => navigate("settings")}
              >
                Fuentes y equipo
              </button>
              .
            </p>
          )}
          {geminiStatus === "error" && (
            <p className="small muted" role="status">
              No se pudo consultar el estado de Gemini. Revisa la configuración
              de la marca antes de analizar.
            </p>
          )}
          {state.brand.role === "reviewer" && (
            <p className="small muted">
              Tu rol de revisor no permite iniciar análisis.
            </p>
          )}
          {!r.isDemo && videoAccessible && geminiStatus === "configured" && (
            <div className="video-analysis-controls">
              <Field
                label="Foco de análisis (opcional)"
                value={videoFocus}
                maxLength={500}
                onChange={(event) => setVideoFocus(event.target.value)}
                placeholder="Ej. ritmo del montaje y texto en pantalla"
                disabled={
                  !!busy || !!committedDraft || state.brand.role === "reviewer"
                }
              />
              <Button
                variant="primary"
                busy={busy === "video-analysis"}
                disabled={!mayAnalyzeVideo || !!busy || !!committedDraft}
                onClick={() => void analyzeVideo()}
              >
                <Video size={16} />
                {r.videoAnalysis ? "Volver a examinar video" : "Examinar video"}
              </Button>
            </div>
          )}
          {videoError && (
            <p className="form-error" role="alert">
              {videoError}
            </p>
          )}
          {r.videoAnalysis && (
            <VideoAnalysisResult analysis={r.videoAnalysis} />
          )}
        </section>
      )}
      {r.analysis ? (
        <>
          <p className="small muted analysis-scope-note">
            Análisis editorial de texto y metadatos. No describe el audio ni las
            imágenes del video.
          </p>
          <div className="analysis-grid">
            <div className="analysis-block">
              <h4 className="analysis-label">El gancho</h4>
              <p>{r.analysis.hook}</p>
            </div>
            <div className="analysis-block">
              <h4 className="analysis-label">Relevancia para tu marca</h4>
              <h3>{r.analysis.relevance}/100</h3>
              <p>{r.analysis.adaptation}</p>
            </div>
            <div className="analysis-block full">
              <div className="row">
                <h4 className="analysis-label">Por qué pudo funcionar</h4>
                <Badge tone="amber">
                  Hipótesis ·{" "}
                  {r.analysis.confidence === "high"
                    ? "confianza alta"
                    : r.analysis.confidence === "medium"
                      ? "confianza media"
                      : "confianza baja"}
                </Badge>
              </div>
              <p>{r.analysis.hypothesis}</p>
            </div>
            <div className="analysis-block full">
              <h4 className="analysis-label">Repetición en lo observado</h4>
              <Badge
                tone={
                  r.analysis.saturation === "low"
                    ? "green"
                    : r.analysis.saturation === "high"
                      ? "red"
                      : "neutral"
                }
              >
                {saturationNames[r.analysis.saturation]}
              </Badge>
              <p>{r.analysis.saturationReason}</p>
              <div className="small muted">
                {r.analysis.engine === "ai"
                  ? "Análisis con IA configurada"
                  : "Análisis orientativo por reglas locales"}{" "}
                · No demuestra causalidad ni saturación global.
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="callout">
          <Sparkles size={20} />
          <div>
            <strong>¿Qué oportunidad editorial hay detrás?</strong>
            <p>
              El análisis de referencia usa texto y metadatos disponibles. Para
              describir el audio y las imágenes, usa Examinar video cuando el
              medio sea accesible.
            </p>
          </div>
        </div>
      )}
      <div className="detail-actions">
        <Button
          busy={busy === "analyze"}
          disabled={
            !!busy || !!committedDraft || state.brand.role === "reviewer"
          }
          onClick={() => void analyze()}
        >
          <Sparkles size={16} />
          {r.analysis ? "Actualizar análisis" : "Analizar referencia"}
        </Button>
        <label className="sr-only" htmlFor="draft-format">
          Formato del guion
        </label>
        <select
          id="draft-format"
          value={format}
          disabled={!!busy || !!committedDraft}
          onChange={(e) => setFormat(e.target.value)}
        >
          <option value="post">Post</option>
          <option value="carousel">Carrusel</option>
          <option value="reel">Guion de reel</option>
          <option value="newsletter">Newsletter</option>
        </select>
        <select
          aria-label="Audiencia del guion"
          value={segmentId}
          disabled={!!busy || !!committedDraft}
          onChange={(e) => setSegmentId(e.target.value)}
        >
          <option value="">Audiencia general</option>
          {state.brand.audience.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <Button
          variant="primary"
          busy={busy === "draft"}
          disabled={!!busy || state.brand.role === "reviewer"}
          onClick={() => void draft()}
        >
          <FileText size={16} />
          {committedDraft ? "Reintentar actualización" : "Crear guion"}
        </Button>
      </div>
      {draftError && (
        <p className="form-error" role="alert">
          {draftError}
        </p>
      )}
      <p className="small muted">
        La adaptación y el guion siempre quedan disponibles para revisión
        humana.
      </p>
    </Modal>
  );
}

function videoAccessLabel(reference: Reference, assets: Asset[]) {
  if (reference.mediaAccess === "youtube_url")
    return "Origen: enlace público de YouTube disponible para análisis.";
  if (reference.mediaAccess === "provider_url")
    return "Origen: el proveedor expone una URL de medio para análisis.";
  if (reference.mediaAccess === "uploaded_file")
    return "Origen: archivo de video privado adjunto a esta referencia.";
  if (reference.mediaAccess === "unavailable")
    return "El proveedor entregó metadatos, pero no un archivo de video accesible.";
  if (
    assets.some(
      (asset) => asset.id === reference.assetId && asset.type === "video",
    )
  )
    return "Origen: archivo de video subido a la biblioteca privada de esta marca.";
  if (publicYoutubeVideoId(reference.url))
    return "Origen: enlace público de YouTube; el acceso se confirmará al procesar.";
  if (safeExternalUrl(reference.mediaUrl))
    return "Origen: URL de medio facilitada por la fuente.";
  return "No hay un archivo audiovisual accesible; solo se conservan metadatos.";
}

function timecode(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function VideoAnalysisResult({ analysis }: { analysis: VideoAnalysis }) {
  return (
    <div className="video-analysis-result">
      <div className="video-result-meta">
        <Badge tone="green">
          {analysis.contentScope === "sampled_video"
            ? "Video por muestras"
            : "Audio y video"}
        </Badge>
        <span>
          {analysis.model} · {timeAgo(analysis.analyzedAt)}
        </span>
      </div>
      <div className="video-result-block">
        <h4 className="analysis-label">Resumen</h4>
        <p>{analysis.summary}</p>
      </div>
      <div className="video-result-grid">
        <div className="video-result-block">
          <h4 className="analysis-label">Gancho visual</h4>
          <p>{analysis.hook.visual}</p>
        </div>
        <div className="video-result-block">
          <h4 className="analysis-label">Gancho verbal</h4>
          <p>{analysis.hook.verbal}</p>
        </div>
      </div>
      <div className="video-result-block">
        <h4 className="analysis-label">Estructura</h4>
        {analysis.structure.length ? (
          <ol>
            {analysis.structure.map((part, index) => (
              <li key={`${index}-${part}`}>{part}</li>
            ))}
          </ol>
        ) : (
          <p>Sin estructura reportada.</p>
        )}
      </div>
      <div className="video-result-block">
        <h4 className="analysis-label">Texto en pantalla</h4>
        {analysis.onScreenText.length ? (
          <ul>
            {analysis.onScreenText.map((item, index) => (
              <li key={`${index}-${item}`}>{item}</li>
            ))}
          </ul>
        ) : (
          <p>Sin texto en pantalla reportado.</p>
        )}
      </div>
      <div className="video-result-block">
        <h4 className="analysis-label">Audio</h4>
        <p>{analysis.audioNotes}</p>
      </div>
      {analysis.observations.length > 0 && (
        <div className="video-result-block">
          <h4 className="analysis-label">Observaciones por momento</h4>
          <ol className="video-observations">
            {analysis.observations.map((item, index) => (
              <li key={`${item.startSeconds}-${index}`}>
                <span>
                  {timecode(item.startSeconds)}–{timecode(item.endSeconds)}
                </span>
                <p>{item.observation}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="video-result-block">
        <h4 className="analysis-label">Cobertura del análisis</h4>
        <p>
          {analysis.coverage.mode}
          {analysis.coverage.samplingFps != null
            ? ` · muestreo ${analysis.coverage.samplingFps} fps`
            : ""}
          {analysis.coverage.notes ? ` · ${analysis.coverage.notes}` : ""}
        </p>
      </div>
      <div className="video-result-block video-adaptation">
        <h4 className="analysis-label">Adaptación editorial</h4>
        <p>{analysis.adaptation}</p>
      </div>
      {analysis.limitations.length > 0 && (
        <div className="video-limitations">
          <h4 className="analysis-label">Limitaciones reportadas</h4>
          <ul>
            {analysis.limitations.map((item, index) => (
              <li key={`${index}-${item}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="small muted">
        El análisis describe señales observadas en el contenido disponible; no
        demuestra por qué tuvo su rendimiento ni equivale a generar o editar
        video.
      </p>
    </div>
  );
}

export function InboxPage() {
  const { state, search, notify, refresh } = useWorkspace();
  const [capture, setCapture] = useState(false),
    [selected, setSelected] = useState<Reference | null>(null),
    [filter, setFilter] = useState("all");
  const refs = state.references
    .filter((r) => filter === "all" || r.status === filter)
    .filter((r) =>
      `${r.title} ${r.text || ""}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>Las referencias, en un solo lugar.</h1>
          <p>
            Lo que viste, lo que te enviaron y lo que vale la pena volver a
            mirar.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setCapture(true)}
          disabled={state.brand.role === "reviewer"}
        >
          <Plus size={17} />
          Agregar referencia
        </Button>
      </div>
      <div className="inbox-toolbar">
        <div className="tabs">
          {[
            ["all", "Todas"],
            ["new", "Sin analizar"],
            ["analyzed", "Analizadas"],
            ["saved", "Guardadas"],
            ["dismissed", "Descartadas"],
          ].map(([v, l]) => (
            <button
              key={v}
              className={filter === v ? "active" : ""}
              onClick={() => setFilter(v)}
            >
              {l}
            </button>
          ))}
        </div>
        <span className="small muted">{refs.length} referencias</span>
      </div>
      {refs.length ? (
        <div className="inbox-list">
          {refs.map((r) => (
            <div className="inbox-item" key={r.id}>
              <SourceMark source={r.source} platform={r.platform} />
              <button className="inbox-title" onClick={() => setSelected(r)}>
                <strong>{r.title}</strong>
                <span>
                  {r.source} · {timeAgo(r.createdAt)}
                  {r.isDemo ? " · Ejemplo" : ""}
                </span>
              </button>
              <Badge tone={r.analysis ? "green" : "neutral"}>
                {r.status === "saved"
                  ? "Guardada"
                  : r.status === "dismissed"
                    ? "Descartada"
                    : r.analysis
                      ? "Analizada"
                      : "Sin analizar"}
              </Badge>
              <IconButton
                label={
                  r.status === "dismissed"
                    ? "Restaurar referencia"
                    : "Descartar referencia"
                }
                disabled={state.brand.role === "reviewer"}
                onClick={async () => {
                  try {
                    await api(
                      `/api/brands/${state.brand.id}/references/${r.id}`,
                      {
                        method: "PATCH",
                        body: json({
                          status:
                            r.status === "dismissed" ? "new" : "dismissed",
                        }),
                      },
                    );
                    await refresh();
                  } catch (e) {
                    notify((e as Error).message, "error");
                  }
                }}
              >
                {r.status === "dismissed" ? (
                  <RefreshCw size={16} />
                ) : (
                  <X size={16} />
                )}
              </IconButton>
              <IconButton
                label="Abrir referencia"
                onClick={() => setSelected(r)}
              >
                <ArrowUpRight size={18} />
              </IconButton>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Link />}
          title={
            state.references.length
              ? "No hay referencias que coincidan"
              : "Nada se pierde si tiene su lugar"
          }
          action={
            !state.references.length ? (
              <Button onClick={() => setCapture(true)}>
                Agregar mi primera referencia
              </Button>
            ) : undefined
          }
        >
          {state.references.length
            ? "Prueba otra palabra, borra la búsqueda o revisa el filtro de estado."
            : "Guarda enlaces, texto y capturas para que todo el equipo pueda convertirlos en oportunidades."}
        </EmptyState>
      )}
      {capture && <CaptureModal onClose={() => setCapture(false)} />}
      {selected && (
        <ReferenceDetail
          reference={
            state.references.find((r) => r.id === selected.id) || selected
          }
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

export function CaptureModal({ onClose }: { onClose: () => void }) {
  const { state, refresh, notify } = useWorkspace();
  const [busy, setBusy] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [error, setError] = useState(""),
    [committedReference, setCommittedReference] = useState<Reference | null>(
      null,
    );
  const busyRef = useRef(false);
  const assetCache = useRef<{ file: File; asset: Asset } | null>(null);
  const committedReferenceRef = useRef<Reference | null>(null);
  const close = useCallback(() => {
    if (!busyRef.current) onClose();
  }, [onClose]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busyRef.current) return;
    const f = new FormData(e.currentTarget);
    const url = String(f.get("url") || "").trim(),
      text = String(f.get("text") || "").trim();
    if (!committedReferenceRef.current && !url && !text && !file) {
      setError("Agrega un enlace, un texto o un archivo.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await createThenRefresh(
        committedReferenceRef.current,
        async () => {
          const asset = await getOrUploadCaptureAsset(
            file,
            assetCache,
            (selectedFile) => uploadAsset(state.brand.id, selectedFile),
          );
          const title =
            String(f.get("title") || "").trim() ||
            text.slice(0, 130) ||
            file?.name ||
            new URL(url).hostname;
          const reference = await api<Reference>(
            `/api/brands/${state.brand.id}/references`,
            {
              method: "POST",
              body: json({
                title,
                url: url || undefined,
                text,
                source: "Equipo",
                language: String(f.get("language") || "en"),
                market: "Referencia del equipo",
                format: asset?.type || "link",
                status: "new",
                tags: [],
                assetId: asset?.id,
              }),
            },
          );
          committedReferenceRef.current = reference;
          setCommittedReference(reference);
          return reference;
        },
        refresh,
      );
      if (result.status === "refresh-failed") {
        setError("Referencia guardada, no se pudo actualizar.");
        return;
      }
      onClose();
      notify("Referencia guardada. Ya forma parte de tu radar.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal title="Una buena referencia merece quedarse" onClose={close}>
      <p className="muted">
        Comparte lo que te llamó la atención. Añade contexto para que el
        análisis tenga mejores señales.
      </p>
      <form className="stack" onSubmit={submit}>
        <Field
          label="Enlace original"
          name="url"
          type="url"
          placeholder="https://…"
          aria-describedby="capture-url-hint"
          disabled={busy || !!committedReference}
        />
        <p id="capture-url-hint" className="small muted">
          Usa un enlace público sin credenciales. Guardarlo como cita no
          confirma que se haya leído la página.
        </p>
        <Field
          label="Título o idea"
          name="title"
          placeholder="¿Qué te llamó la atención?"
          maxLength={300}
          disabled={busy || !!committedReference}
        />
        <Field label="Texto o contexto">
          <textarea
            name="text"
            placeholder="Pega el texto del post o explica qué te gustaría adaptar…"
            rows={4}
            disabled={busy || !!committedReference}
          />
        </Field>
        <Field label="Idioma original">
          <select
            name="language"
            defaultValue="en"
            disabled={busy || !!committedReference}
          >
            <option value="en">Inglés</option>
            <option value="es">Español</option>
            <option value="pt">Portugués</option>
            <option value="other">Otro</option>
          </select>
        </Field>
        <label className="upload-zone">
          <Upload size={21} />
          <span>
            {file ? file.name : "Adjuntar captura, video o documento"}
          </span>
          <small>
            Hasta 25 MiB · Un archivo por referencia. TXT, Markdown y CSV en
            UTF-8.
          </small>
          <input
            type="file"
            accept="image/*,video/*,audio/*,.pdf,.txt,.md,.csv"
            disabled={busy || !!committedReference}
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              assetCache.current = null;
              setError("");
              if (f && f.size > 25 * 1024 * 1024) {
                setFile(null);
                e.target.value = "";
                setError(
                  "El archivo supera el máximo de 25 MiB. Selecciona uno más pequeño.",
                );
                return;
              }
              setFile(f);
            }}
          />
        </label>
        <p className="small muted">
          Las capturas e imágenes se guardan como contexto; no bastan para
          examinar un video. Un video se procesa con Gemini solo cuando alguien
          elige Examinar video y hay acceso al archivo. La carga desde este
          formulario admite hasta 25 MiB; el análisis audiovisual también está
          limitado a 20 minutos.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button type="button" disabled={busy} onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" busy={busy}>
            <Plus size={16} />
            {committedReference ? "Recargar bandeja" : "Guardar referencia"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
