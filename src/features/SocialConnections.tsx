import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Link2,
  RefreshCw,
  Search,
  Unplug,
  Youtube,
} from "lucide-react";
import { Badge, Button, Field } from "../components/ui";
import { api, json } from "../lib/api";
import { safeExternalUrl } from "../lib/format";
import { useWorkspace } from "../lib/workspace";
import "./social-connections.css";

type ConnectionProvider = {
  id: "youtube" | "instagram" | "linkedin" | "tiktok";
  name: string;
  configured: boolean;
  ready: boolean;
  reason?: string;
  connectUrl?: string;
  enableUrl?: string;
  connection?: {
    id: string;
    name: string;
    connectedAt: string;
    lastSyncedAt?: string;
    lastError?: string;
  };
};
type Connections = {
  providers: ConnectionProvider[];
  automaticSync: {
    enabled: boolean;
    intervalMinutes: number;
    lastSyncedAt?: string;
    lastError?: string;
  };
};
type SyncResult = {
  synced: number;
  skipped: number;
  errors: { pieceId: string; error: string }[];
  observedAt: string;
  cached?: boolean;
};
type PublicCounts = {
  views: number | null;
  likes: number | null;
  comments: number | null;
};
type SocialSnapshot = {
  id: string;
  pieceId: string;
  platform: "youtube";
  externalId: string;
  publishedUrl: string;
  observedAt: string;
  window: "lifetime";
  metrics: PublicCounts;
  origin: "official_api";
  attribution: string;
  leads: null;
};
type PublicationLink = {
  pieceId: string;
  publishedUrl: string;
  externalId: string;
  linkedAt: string;
};
type MetricsResult = {
  snapshots: SocialSnapshot[];
  publications?: PublicationLink[];
  lastSyncedAt?: string;
};
type CatalogItem = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  platform: "youtube";
  metrics: PublicCounts;
  observedAt: string;
  attribution: string;
};
type CatalogResult = {
  items: CatalogItem[];
  query: string;
  observedAt: string;
  cached: boolean;
};

const dateTime = (value?: string) => {
  if (!value || !Number.isFinite(Date.parse(value))) return "Sin consultar";
  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};
const count = (value: number | null | undefined) =>
  value == null ? "No disponible" : new Intl.NumberFormat("es").format(value);
const failure = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback;

function useConnections() {
  const { state } = useWorkspace();
  const base = `/api/brands/${state.brand.id}/social`;
  const [data, setData] = useState<Connections | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const activeBase = useRef(base);
  activeBase.current = base;
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const result = await api<Connections>(`${base}/connections`, { signal });
      if (signal?.aborted || activeBase.current !== base) return;
      setData(result);
      setError("");
    },
    [base],
  );
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    setLoading(true);
    void load(controller.signal)
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            failure(
              cause,
              "No pudimos consultar las conexiones. Pulsa Actualizar.",
            ),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [load]);
  return { base, data, error, setError, loading, setLoading, load, activeBase };
}

export default function SocialConnections() {
  const { state } = useWorkspace();
  const { base, data, error, setError, loading, setLoading, load, activeBase } =
    useConnections();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const callbackBrand = useRef(base);
  const [callbackNotice] = useState(() => {
    if (typeof window === "undefined") return "";
    const search = new URLSearchParams(window.location.search);
    if (search.get("socialConnected") === "youtube")
      return "YouTube conectado con permiso de lectura.";
    const messages: Record<string, string> = {
      unavailable: "Conexión con Google no habilitada.",
      invalid_state:
        "La solicitud caducó o cambió la sesión. Vuelve a conectar YouTube.",
      cancelled: "Autorización cancelada. El canal no se conectó.",
      connection_failed:
        "No se pudo conectar el canal. Reintenta y concede acceso de lectura a YouTube.",
      no_channel:
        "La cuenta de Google no tiene un canal de YouTube disponible.",
      missing_scope:
        "Falta permiso de lectura de YouTube. Vuelve a conectar y acéptalo.",
    };
    return messages[search.get("socialError") || ""] || "";
  });
  const owner = state.brand.role === "owner";
  useEffect(() => {
    setBusy("");
    setMessage("");
  }, [base]);
  async function reload() {
    setLoading(true);
    try {
      await load();
    } catch (cause) {
      if (activeBase.current === base)
        setError(failure(cause, "No pudimos actualizar las conexiones."));
    } finally {
      if (activeBase.current === base) setLoading(false);
    }
  }
  async function disconnect(provider: ConnectionProvider) {
    if (
      busy ||
      !owner ||
      !window.confirm(
        `¿${provider.connection ? "Desconectar" : "Pausar"} ${provider.connection?.name || provider.name}? Se eliminarán de este espacio sus datos sincronizados y se detendrán las consultas automáticas.`,
      )
    )
      return;
    setBusy(provider.id);
    setError("");
    setMessage("");
    try {
      const result = await api<{
        ok: boolean;
        revoked: boolean;
        reason?: string;
      }>(`${base}/connections/${provider.id}`, { method: "DELETE" });
      if (activeBase.current !== base) return;
      await load();
      setMessage(
        result.revoked
          ? "Cuenta desconectada y acceso revocado."
          : result.reason ||
              "Cuenta desconectada. Revisa el acceso restante en tu cuenta de Google.",
      );
    } catch (cause) {
      if (activeBase.current === base)
        setError(
          failure(
            cause,
            "No pudimos desconectar la cuenta. Inténtalo de nuevo.",
          ),
        );
    } finally {
      if (activeBase.current === base) setBusy("");
    }
  }
  async function enable(provider: ConnectionProvider) {
    if (busy || !owner || !provider.enableUrl?.startsWith(`${base}/`)) return;
    setBusy(provider.id);
    setError("");
    setMessage("");
    try {
      await api(provider.enableUrl, { method: "POST", body: json({}) });
      if (activeBase.current !== base) return;
      await load();
      setMessage("Consulta pública de YouTube activada.");
    } catch (cause) {
      if (activeBase.current === base)
        setError(
          failure(cause, "No pudimos activar la consulta. Inténtalo de nuevo."),
        );
    } finally {
      if (activeBase.current === base) setBusy("");
    }
  }
  return (
    <section
      id="social-connections"
      className="card settings-section social-connections"
      aria-labelledby="social-connections-heading"
    >
      <div className="section-heading">
        <div>
          <h2 id="social-connections-heading">
            <Link2 size={20} /> Cuentas de redes
          </h2>
        </div>
        <Button onClick={() => void reload()} busy={loading}>
          <RefreshCw size={16} /> Actualizar
        </Button>
      </div>
      {callbackNotice && callbackBrand.current === base && (
        <p className="social-scope-note" role="status">
          {callbackNotice}
        </p>
      )}
      {loading && !data && (
        <p className="muted" role="status">
          Consultando conexiones…
        </p>
      )}
      {data && (
        <div className="social-provider-list">
          {data.providers.map((provider) => (
            <div className="social-provider-row" key={provider.id}>
              <div className="social-provider-copy">
                <div className="social-provider-title">
                  <strong>{provider.name}</strong>
                  <Badge
                    tone={
                      provider.id === "youtube" && data.automaticSync.lastError
                        ? "amber"
                        : provider.ready
                          ? "green"
                          : "neutral"
                    }
                  >
                    {provider.id === "youtube" && data.automaticSync.lastError
                      ? "Revisar sincronización"
                      : provider.connection
                        ? "Cuenta conectada"
                        : provider.ready
                          ? "Consulta pública disponible"
                          : "No disponible"}
                  </Badge>
                </div>
                {provider.connection ? (
                  <>
                    <p>{provider.connection.name}</p>
                    <p className="small muted">
                      Solo lectura · Última sincronización:{" "}
                      {dateTime(provider.connection.lastSyncedAt)}.
                    </p>
                    {provider.connection.lastError && (
                      <p className="form-error">
                        {provider.connection.lastError}
                      </p>
                    )}
                  </>
                ) : !provider.ready ? (
                  <p className="small muted">
                    {provider.reason ||
                      "El administrador debe habilitar la conexión."}
                  </p>
                ) : null}
              </div>
              {owner && (
                <div className="social-provider-actions">
                  {!provider.connection &&
                    provider.connectUrl?.startsWith(`${base}/`) && (
                      <a
                        className="button secondary"
                        href={provider.connectUrl}
                      >
                        <Link2 size={15} /> Conectar {provider.name}
                      </a>
                    )}
                  {provider.connection || provider.ready ? (
                    <Button
                      disabled={!!busy}
                      busy={busy === provider.id}
                      onClick={() => void disconnect(provider)}
                    >
                      <Unplug size={15} />{" "}
                      {provider.connection
                        ? "Desconectar"
                        : "Pausar y borrar datos"}
                    </Button>
                  ) : provider.enableUrl?.startsWith(`${base}/`) ? (
                    <Button
                      busy={busy === provider.id}
                      disabled={!!busy}
                      onClick={() => void enable(provider)}
                    >
                      Activar {provider.name}
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {data && (
        <p className="social-scope-note">
          {data.automaticSync.enabled
            ? `Actualización automática cada ${data.automaticSync.intervalMinutes} minutos.`
            : "Actualización automática desactivada."}
        </p>
      )}
      <SyncHealth sync={data?.automaticSync} />
      {!owner && (
        <p className="small muted">
          Solo el propietario puede conectar o desconectar cuentas.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

function SyncHealth({ sync }: { sync?: Connections["automaticSync"] }) {
  if (!sync?.lastError) return null;
  return (
    <div className="social-sync-result">
      <p className="form-error" role="alert">
        La actualización automática no se completó. {sync.lastError}
      </p>
      <p className="small muted">
        {sync.lastSyncedAt
          ? `Última actualización: ${dateTime(sync.lastSyncedAt)}.`
          : "Sin actualizaciones completadas."}
      </p>
    </div>
  );
}

export function SocialDiscovery() {
  const { state } = useWorkspace();
  return <SocialDiscoveryPanel key={state.brand.id} />;
}

function SocialDiscoveryPanel() {
  const { state } = useWorkspace();
  const { base, data: connections, error: connectionError } = useConnections();
  const [query, setQuery] = useState(state.brand.name);
  const [data, setData] = useState<CatalogResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const canEdit = state.brand.role !== "reviewer";
  const ready = connections?.providers.some(
    (provider) => provider.id === "youtube" && provider.ready,
  );
  useEffect(() => {
    const controller = new AbortController();
    void api<CatalogResult>(`${base}/discover`, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          if (result.query) setQuery(result.query);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            failure(
              cause,
              "No pudimos cargar la última búsqueda. Inténtalo de nuevo.",
            ),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [base]);
  async function search() {
    if (busy || !canEdit || !ready || !query.trim()) return;
    setBusy(true);
    setError("");
    try {
      setData(
        await api<CatalogResult>(`${base}/discover`, {
          method: "POST",
          body: json({ query: query.trim(), limit: 10 }),
        }),
      );
    } catch (cause) {
      setError(
        failure(
          cause,
          "No pudimos buscar videos. Prueba otra consulta o revisa la conexión en Fuentes y equipo.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="card social-discovery"
      aria-labelledby="social-discovery-heading"
    >
      <div className="social-panel-heading">
        <div>
          <h2 id="social-discovery-heading">
            <Youtube size={20} /> YouTube · últimos 7 días
          </h2>
        </div>
        {ready && <Badge tone="green">API oficial disponible</Badge>}
      </div>
      <form
        className="social-discovery-search"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <Field label="Tema o empresa">
          <input
            value={query}
            maxLength={200}
            onChange={(event) => setQuery(event.target.value)}
            disabled={busy || !canEdit}
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          busy={busy}
          disabled={!ready || !canEdit || !query.trim()}
        >
          <Search size={16} /> Buscar videos
        </Button>
      </form>
      {!ready && connections && (
        <p className="social-scope-note">
          {connections.providers.find((provider) => provider.id === "youtube")
            ?.reason ||
            "YouTube no está disponible. Revisa la conexión en Fuentes y equipo."}
        </p>
      )}
      {(error || connectionError) && (
        <p className="form-error" role="alert">
          {error || connectionError}
        </p>
      )}
      {loading && (
        <p className="muted" role="status">
          Cargando la última búsqueda…
        </p>
      )}
      {data && (
        <>
          {!!data.observedAt && (
            <p className="small muted">
              {data.cached ? "Última búsqueda guardada" : "Consulta realizada"}:{" "}
              {dateTime(data.observedAt)} · YouTube Data API
            </p>
          )}
          {!data.items.length ? (
            <p className="social-empty">
              {data.query
                ? "Sin videos de los últimos 7 días para esta búsqueda."
                : "Sin búsquedas."}
            </p>
          ) : (
            <div className="social-catalog-list">
              {data.items.map((item) => (
                <article className="social-catalog-item" key={item.id}>
                  <div>
                    <h3>{item.title}</h3>
                    <p className="small muted">
                      Publicado: {dateTime(item.publishedAt)} · Consultado:{" "}
                      {dateTime(item.observedAt)}
                    </p>
                  </div>
                  <PublicMetrics metrics={item.metrics} />
                  <a
                    href={safeExternalUrl(item.url)}
                    className="text-button"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ver en YouTube <ExternalLink size={14} />
                  </a>
                  <span className="small muted">
                    {item.attribution || "YouTube Data API"}
                  </span>
                </article>
              ))}
            </div>
          )}
          {!!data.items.length && (
            <p className="small muted">
              Contadores acumulados · Resultados excluidos del análisis con IA.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function PublicMetrics({ metrics }: { metrics: PublicCounts }) {
  return (
    <dl className="social-public-counts">
      <div>
        <dt>Visualizaciones</dt>
        <dd>{count(metrics.views)}</dd>
      </div>
      <div>
        <dt>Me gusta</dt>
        <dd>{count(metrics.likes)}</dd>
      </div>
      <div>
        <dt>Comentarios</dt>
        <dd>{count(metrics.comments)}</dd>
      </div>
    </dl>
  );
}

export function AutomaticMetrics() {
  const { state } = useWorkspace();
  return <AutomaticMetricsPanel key={state.brand.id} />;
}

function AutomaticMetricsPanel() {
  const { state, navigate } = useWorkspace();
  const {
    base,
    data: connections,
    error: connectionError,
    load: loadConnections,
  } = useConnections();
  const [data, setData] = useState<MetricsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [linkForm, setLinkForm] = useState(false);
  const [linkBusy, setLinkBusy] = useState("");
  const [linkMessage, setLinkMessage] = useState("");
  const [linkedPublication, setLinkedPublication] =
    useState<PublicationLink | null>(null);
  const pieceSelect = useRef<HTMLSelectElement>(null);
  const canEdit = state.brand.role !== "reviewer";
  const canLink = canEdit && !state.brand.isDemo;
  const eligiblePieces = state.pieces.filter(
    (piece) =>
      piece.channel === "youtube" &&
      ["approved", "scheduled", "published"].includes(piece.status),
  );
  useEffect(() => {
    if (linkForm) pieceSelect.current?.focus();
  }, [linkForm]);
  const ready = connections?.providers.some((provider) => provider.ready);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const result = await api<MetricsResult>(`${base}/metrics`, { signal });
      if (!signal?.aborted) setData(result);
    },
    [base],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal)
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(failure(cause, "No pudimos cargar las cifras automáticas."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [load]);
  async function sync() {
    if (busy || linkBusy || !canEdit || !ready) return;
    setBusy(true);
    setError("");
    setSyncResult(null);
    try {
      const result = await api<SyncResult>(`${base}/sync`, {
        method: "POST",
        body: json({}),
      });
      setSyncResult(result);
      await Promise.all([load(), loadConnections()]);
    } catch (cause) {
      setError(
        failure(
          cause,
          "No pudimos actualizar las cifras. Revisa la conexión y vuelve a intentarlo.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function linkVideo(form: HTMLFormElement) {
    if (busy || linkBusy || !canLink) return;
    const values = new FormData(form);
    setLinkBusy("link");
    setError("");
    setLinkMessage("");
    let savedLink = linkedPublication;
    try {
      if (!savedLink) {
        savedLink = await api<PublicationLink>(`${base}/publications`, {
          method: "POST",
          body: json({
            pieceId: values.get("pieceId"),
            publishedUrl: String(values.get("publishedUrl") || "").trim(),
          }),
        });
        setLinkedPublication(savedLink);
      }
      await load();
      setLinkForm(false);
      setLinkedPublication(null);
      setLinkMessage("Video vinculado.");
    } catch (cause) {
      setError(
        savedLink
          ? "El video ya se vinculó, pero no pudimos actualizar la lista. Pulsa Recuperar vínculo para consultarlo sin volver a guardarlo."
          : failure(
              cause,
              "No pudimos vincular el video. Comprueba que la pieza esté aprobada y que el enlace sea de YouTube.",
            ),
      );
    } finally {
      setLinkBusy("");
    }
  }
  async function unlinkVideo(publication: PublicationLink) {
    if (busy || linkBusy || !canLink) return;
    setLinkBusy(publication.pieceId);
    setError("");
    setLinkMessage("");
    try {
      await api(`${base}/publications/${publication.pieceId}`, {
        method: "DELETE",
      });
      await load();
      setLinkMessage(
        "Vínculo y cifras eliminados. Estado editorial sin cambios.",
      );
    } catch (cause) {
      setError(
        failure(
          cause,
          "No pudimos actualizar el vínculo. Vuelve a cargar las cifras antes de reintentar.",
        ),
      );
    } finally {
      setLinkBusy("");
    }
  }
  const latestByPiece = new Map<string, SocialSnapshot>();
  for (const snapshot of data?.snapshots || []) {
    const previous = latestByPiece.get(snapshot.pieceId);
    if (!previous || snapshot.observedAt > previous.observedAt)
      latestByPiece.set(snapshot.pieceId, snapshot);
  }
  const snapshots = [...latestByPiece.values()].sort((a, b) =>
    b.observedAt.localeCompare(a.observedAt),
  );
  return (
    <section
      className="card automatic-metrics"
      aria-labelledby="automatic-metrics-heading"
    >
      <div className="social-panel-heading">
        <div>
          <h2 id="automatic-metrics-heading">Cifras automáticas de YouTube</h2>
        </div>
        <div className="social-metric-actions">
          {canLink && (
            <Button
              variant={
                !linkForm && !data?.publications?.length && !snapshots.length
                  ? "primary"
                  : "secondary"
              }
              disabled={busy || !!linkBusy}
              aria-expanded={linkForm}
              onClick={() => {
                setLinkForm((open) => !open);
                setLinkMessage("");
              }}
            >
              <Link2 size={16} />{" "}
              {linkForm ? "Cerrar formulario" : "Vincular video"}
            </Button>
          )}
          <Button
            variant={
              !linkForm && (!!data?.publications?.length || !!snapshots.length)
                ? "primary"
                : "secondary"
            }
            onClick={() => void sync()}
            busy={busy}
            disabled={!canEdit || !ready || !!linkBusy}
          >
            <RefreshCw size={16} /> Actualizar cifras
          </Button>
        </div>
      </div>
      {linkForm && (
        <form
          className="social-publication-form"
          onSubmit={(event) => {
            event.preventDefault();
            void linkVideo(event.currentTarget);
          }}
        >
          {eligiblePieces.length ? (
            <>
              <Field label="Pieza de YouTube">
                <select
                  ref={pieceSelect}
                  name="pieceId"
                  required
                  disabled={!!linkBusy || !!linkedPublication}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Selecciona una pieza aprobada
                  </option>
                  {eligiblePieces.map((piece) => (
                    <option key={piece.id} value={piece.id}>
                      {piece.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Enlace público del video">
                <input
                  name="publishedUrl"
                  type="url"
                  required
                  maxLength={2000}
                  placeholder="https://www.youtube.com/watch?v=…"
                  disabled={!!linkBusy || !!linkedPublication}
                />
              </Field>
              <Button
                type="submit"
                variant="primary"
                busy={linkBusy === "link"}
                disabled={busy || (!!linkBusy && linkBusy !== "link")}
              >
                <Link2 size={16} />{" "}
                {linkedPublication ? "Recuperar vínculo" : "Vincular video"}
              </Button>
            </>
          ) : (
            <>
              <p className="small muted">
                No hay piezas de YouTube aprobadas, programadas o publicadas.
              </p>
              <Button onClick={() => navigate("studio")}>Ir a contenido</Button>
            </>
          )}
        </form>
      )}
      {connections && (
        <p className="social-scope-note">
          {!ready
            ? connections.providers.find(
                (provider) => provider.id === "youtube",
              )?.reason ||
              "YouTube no está disponible. Revisa la conexión en Fuentes y equipo."
            : connections.automaticSync.enabled
              ? `Actualización automática cada ${connections.automaticSync.intervalMinutes} minutos.`
              : "Actualización automática desactivada."}
        </p>
      )}
      <SyncHealth sync={connections?.automaticSync} />
      {state.brand.isDemo && (
        <p className="small muted">
          Demostración: no permite vincular videos reales.
        </p>
      )}
      {linkMessage && (
        <p role="status" className="social-link-message">
          {linkMessage}
        </p>
      )}
      {loading && (
        <p className="muted" role="status">
          Cargando las cifras disponibles…
        </p>
      )}
      {(error || connectionError) && (
        <p className="form-error" role="alert">
          {error || connectionError}
        </p>
      )}
      {syncResult && (
        <div className="social-sync-result" role="status">
          <p>
            {syncResult.cached
              ? connections?.automaticSync.lastError
                ? `Se mantienen las últimas cifras guardadas: ${dateTime(syncResult.observedAt)}.`
                : `Cifras al día. Última consulta: ${dateTime(syncResult.observedAt)}.`
              : !syncResult.synced &&
                  !syncResult.skipped &&
                  !syncResult.errors.length
                ? "Sin videos vinculados listos para consultar."
                : `${syncResult.synced} publicaciones actualizadas · ${syncResult.skipped} sin actualizar.`}
          </p>
          {syncResult.errors.map((item) => (
            <p className="form-error" key={item.pieceId}>
              {state.pieces.find((piece) => piece.id === item.pieceId)?.title ||
                "Publicación"}
              : {item.error}
            </p>
          ))}
        </div>
      )}
      {!!data?.publications?.length && (
        <div className="social-linked-publications">
          <h3>Videos vinculados</h3>
          {data.publications.map((publication) => (
            <div
              className="social-linked-publication"
              key={publication.pieceId}
            >
              <div>
                <strong>
                  {state.pieces.find(
                    (piece) => piece.id === publication.pieceId,
                  )?.title || "Pieza de YouTube"}
                </strong>
                <a
                  className="text-button"
                  href={safeExternalUrl(publication.publishedUrl)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver video <ExternalLink size={14} />
                </a>
              </div>
              {canLink && (
                <Button
                  disabled={busy || !!linkBusy}
                  busy={linkBusy === publication.pieceId}
                  onClick={() => void unlinkVideo(publication)}
                >
                  Quitar vínculo
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {!loading && !snapshots.length && (
        <p className="social-empty">Sin cifras automáticas.</p>
      )}
      {!!snapshots.length && (
        <div className="social-catalog-list">
          {snapshots.map((snapshot) => (
            <article key={snapshot.id} className="social-catalog-item">
              <h3>
                {state.pieces.find((piece) => piece.id === snapshot.pieceId)
                  ?.title || "Publicación de YouTube"}
              </h3>
              <PublicMetrics metrics={snapshot.metrics} />
              <p className="small muted">
                Acumuladas desde la publicación · Observadas el{" "}
                {dateTime(snapshot.observedAt)} · {snapshot.attribution}
              </p>
              <a
                className="text-button"
                href={safeExternalUrl(snapshot.publishedUrl)}
                target="_blank"
                rel="noreferrer"
              >
                Ver publicación <ExternalLink size={14} />
              </a>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
