import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Plus,
  Rss,
  Search,
  Sparkles,
  Users,
  Copy,
  Trash2,
  Pencil,
  Link,
  Check,
  KeyRound,
  Globe,
  ToggleLeft,
  ToggleRight,
  Youtube,
  Instagram,
  Video,
} from "lucide-react";
import { useWorkspace } from "../lib/workspace";
import { api, json } from "../lib/api";
import { createSourceDraftGuard } from "../lib/source-draft-guard.mjs";
import { ProviderBudget } from "./ProviderBudget";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconButton,
  Modal,
} from "../components/ui";
import type {
  Integrations,
  Role,
  Session,
  SocialPlatform,
  SocialSettings,
  Source,
} from "../lib/types";

const sourceHasUrl = (type: Source["type"]) =>
  ["rss", "reddit", "youtube", "apify"].includes(type);
const sourceQueryKind = (type: Source["type"]) =>
  type === "rss" ? null : type === "reddit" ? "community" : "topic";
const sourcePlatform = (type: Source["type"], platform?: SocialPlatform) =>
  type === "youtube"
    ? "youtube"
    : platform === "tiktok"
      ? "tiktok"
      : "instagram";

type SourceDraft = {
  id?: string;
  name: string;
  type: Source["type"];
  query: string;
  url: string;
  platform: SocialPlatform;
  limit: string;
  enabled: boolean;
};
const newSource: SourceDraft = {
  name: "",
  type: "rss",
  query: "",
  url: "",
  platform: "instagram",
  limit: "20",
  enabled: false,
};
const sourceTypes = [
  {
    value: "rss",
    label: "RSS / Atom",
    description: "Google Trends oficial o un feed con permiso de uso revisado.",
  },
  {
    value: "hackernews",
    label: "Hacker News",
    description: "Conversaciones de tecnología y startups en inglés.",
  },
  {
    value: "gdelt",
    label: "GDELT · noticias globales",
    description: "Cobertura de medios en inglés sobre el tema de tu marca.",
  },
  {
    value: "reddit",
    label: "Reddit · requiere autorización",
    description:
      "Recopilación desactivada hasta verificar un acuerdo para este uso.",
  },
  {
    value: "youtube",
    label: "YouTube · API oficial",
    description:
      "Análisis editorial desactivado hasta completar la revisión de uso de datos.",
  },
  {
    value: "apify",
    label: "Instagram / TikTok · Apify",
    description:
      "Instagram y TikTok desactivados hasta verificar autorización de la red.",
  },
];
const roleLabel: Record<Role, string> = {
  owner: "Propietario",
  editor: "Editor",
  reviewer: "Revisor",
};
const formatDate = (date?: string) =>
  date
    ? new Intl.DateTimeFormat("es", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(date))
    : "Todavía sin sincronizar";

export default function Settings() {
  const { state, refresh, notify, registerUnsavedChangesGuard } =
    useWorkspace();
  const brandId = state.brand.id;
  const brandIdRef = useRef(brandId);
  brandIdRef.current = brandId;
  const base = `/api/brands/${brandId}`;
  const owner = state.brand.role === "owner";
  const canEdit = owner || state.brand.role === "editor";
  const publicTestAi =
    state.integrations.ai.ready &&
    state.integrations.ai.dataMode === "public-test";
  const [source, setSource] = useState<SourceDraft | null>(null);
  const [busy, setBusy] = useState("");
  const sourceGuardRef = useRef(
    createSourceDraftGuard<SourceDraft>({
      confirmDiscard: () =>
        window.confirm(
          "Hay cambios sin guardar. ¿Salir y descartar esta fuente?",
        ),
      onDiscard: () => setSource(null),
    }),
  );
  sourceGuardRef.current.sync(source, !!busy);
  useEffect(
    () => registerUnsavedChangesGuard(sourceGuardRef.current),
    [registerUnsavedChangesGuard],
  );
  function openSource(draft: SourceDraft) {
    if (sourceGuardRef.current.open(draft)) setSource(draft);
  }
  function closeSource() {
    sourceGuardRef.current.confirmLeave();
  }
  const [userId, setUserId] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("editor");
  const [invitation, setInvitation] = useState<{
    token: string;
    expiresAt: string;
  } | null>(null);
  const [acceptToken, setAcceptToken] = useState("");
  const [socialSettings, setSocialSettings] = useState<SocialSettings | null>(
    null,
  );
  const [socialSettingsError, setSocialSettingsError] = useState("");
  const [aiKey, setAiKey] = useState("");
  const [aiModel, setAiModel] = useState(
    state.integrations.ai.model || "gpt-4.1-mini",
  );
  const [webhookUrl, setWebhookUrl] = useState(
    state.integrations.webhook.url || "",
  );
  const [webhookSecret, setWebhookSecret] = useState("");
  const [integrationTab, setIntegrationTab] = useState<"ai" | "webhook">("ai");

  const loadSocialSettings = useCallback(async () => {
    const requestedBrandId = brandId;
    try {
      const value = await api<SocialSettings>(`${base}/social/settings`);
      if (brandIdRef.current === requestedBrandId) {
        setSocialSettings(value);
        setSocialSettingsError("");
      }
      return value;
    } catch (error) {
      if (brandIdRef.current === requestedBrandId)
        setSocialSettingsError(
          error instanceof Error
            ? error.message
            : "No se pudo consultar la configuración social.",
        );
      throw error;
    }
  }, [base, brandId]);

  useEffect(() => {
    setSocialSettings(null);
    setSocialSettingsError("");
    void loadSocialSettings().catch(() => {});
  }, [loadSocialSettings]);

  useEffect(() => {
    let active = true;
    api<Session>("/api/session")
      .then((value) => {
        if (active) setUserId(value.user?.id || "");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    sourceGuardRef.current.discard();
    setInvitation(null);
    setAcceptToken("");
    setSocialSettings(null);
    setAiKey("");
    setWebhookSecret("");
    setAiModel(state.integrations.ai.model || "gpt-4.1-mini");
    setWebhookUrl(state.integrations.webhook.url || "");
  }, [brandId]);

  async function perform(
    key: string,
    action: () => Promise<void>,
    success?: string,
  ) {
    if (busy) return;
    setBusy(key);
    try {
      await action();
      if (success) notify(success);
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el cambio.",
        "error",
      );
    } finally {
      setBusy("");
    }
  }
  async function saveSource(event: FormEvent) {
    event.preventDefault();
    if (!source || busy) return;
    const socialType = source.type === "youtube" || source.type === "apify";
    const isConfigured =
      source.type === "youtube"
        ? socialSettings?.youtube.configured === true
        : source.type === "apify"
          ? socialSettings?.apify.configured === true
          : true;
    if (socialType && !source.query.trim() && !source.url.trim()) {
      notify("Indica una consulta o una URL para esta fuente.", "error");
      return;
    }
    if (source.type === "apify") {
      const limit = Number(source.limit || 20);
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
        notify("El límite debe ser un número entero entre 1 y 50.", "error");
        return;
      }
    }
    if (!sourceGuardRef.current.beginSave()) return;
    try {
      await perform(
        "source-save",
        async () => {
          await api(`${base}/sources${source.id ? `/${source.id}` : ""}`, {
            method: source.id ? "PATCH" : "POST",
            body: json({
              name: source.name,
              type: source.type,
              ...(sourceQueryKind(source.type) ? { query: source.query } : {}),
              ...(sourceHasUrl(source.type) ? { url: source.url } : {}),
              enabled:
                source.enabled &&
                !["youtube", "apify", "reddit"].includes(source.type) &&
                (!socialType || isConfigured),
              ...(source.type === "youtube"
                ? { platform: "youtube" }
                : source.type === "apify"
                  ? {
                      platform: source.platform,
                      limit: Number(source.limit || 20),
                    }
                  : {}),
            }),
          });
          sourceGuardRef.current.discard();
          await refresh();
        },
        "Fuente guardada. Solo las fuentes con permiso revisado pueden activarse.",
      );
    } finally {
      sourceGuardRef.current.endSave();
    }
  }
  async function integration(input: unknown, clear: () => void) {
    await perform(
      "integration",
      async () => {
        await api<Integrations>(`${base}/integrations`, {
          method: "PUT",
          body: json(input),
        });
        clear();
        await refresh();
      },
      "Conector guardado.",
    );
  }
  async function socialIntegration(input: unknown, clear: () => void) {
    await perform(
      "social-integration",
      async () => {
        await api(`${base}/social/settings`, {
          method: "PUT",
          body: json(input),
        });
        clear();
        void loadSocialSettings().catch(() => {});
      },
      "Configuración guardada.",
    );
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify("Enlace copiado.");
    } catch {
      notify(
        "El navegador no permitió copiar. Selecciona el enlace y cópialo manualmente.",
        "error",
      );
    }
  }
  async function acceptInvitation(event: FormEvent) {
    event.preventDefault();
    await perform("accept-invite", async () => {
      const raw = acceptToken.trim();
      let token = raw;
      try {
        const parsed = new URL(raw);
        token =
          parsed.searchParams.get("invite") ||
          parsed.pathname.split("/").filter(Boolean).at(-1) ||
          raw;
      } catch {
        /* Raw invitation token. */
      }
      if (!/^[A-Za-z0-9_-]{20,100}$/.test(token))
        throw new Error("Pega un token o enlace de invitación válido.");
      await api(`/api/invitations/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        body: json({}),
      });
      setAcceptToken("");
      notify("Invitación aceptada. La marca estará disponible al recargar.");
      window.location.reload();
    });
  }
  const invitationUrl = invitation
    ? `${window.location.origin}/?invite=${invitation.token}`
    : "";
  const selectedSourceSocial =
    source?.type === "youtube" || source?.type === "apify";
  const selectedSourceConfigured =
    source?.type === "youtube"
      ? socialSettings?.youtube.configured === true
      : source?.type === "apify"
        ? socialSettings?.apify.configured === true
        : false;
  function focusSocialSettings() {
    const details = document.getElementById(
      "additional-integrations",
    ) as HTMLDetailsElement | null;
    if (details) details.open = true;
    document
      .getElementById("social-provider-settings")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="stack settings-page">
      <div className="page-heading">
        <div>
          <h1>Fuentes y equipo</h1>
          <p className="muted">
            Define de dónde vienen las señales y quién las convierte en
            contenido.
          </p>
        </div>
        <Badge tone={owner ? "green" : "neutral"}>
          {roleLabel[state.brand.role]}
        </Badge>
      </div>

      <section
        className="card settings-section"
        aria-labelledby="workspace-services-heading"
      >
        <div className="section-heading">
          <div>
            <h2 id="workspace-services-heading">
              Tu espacio, listo para trabajar
            </h2>
            <p className="muted">
              Las fuentes disponibles vienen incluidas. Añade el contexto de tu
              empresa y empieza a descubrir, crear y revisar contenido.
            </p>
          </div>
        </div>
        <dl className="workspace-services">
          <div>
            <dt>Descubrimiento</dt>
            <dd>
              {state.sources.some(
                (source) =>
                  source.enabled && source.accessPolicy?.allowed === true,
              )
                ? "Fuentes disponibles incluidas"
                : "Sin fuentes activas; puedes aportar contenido propio"}
            </dd>
          </div>
          <div>
            <dt>Análisis y creación</dt>
            <dd>
              {publicTestAi
                ? "IA de prueba gratuita"
                : state.integrations.ai.ready
                  ? state.integrations.ai.managedBy === "platform"
                    ? "IA gestionada por la plataforma"
                    : "IA de esta empresa disponible"
                  : "Motor editorial local disponible"}
            </dd>
          </div>
          <div>
            <dt>Revisión, calendario y exportación</dt>
            <dd>Incluidos, sin conexiones adicionales</dd>
          </div>
        </dl>
        {!state.integrations.ai.ready && (
          <p className="small muted">
            La IA contextual aún no está disponible en este espacio. La
            configuración del servicio corresponde al administrador de la
            plataforma.
          </p>
        )}
      </section>
      <section className="card settings-section">
        <div className="section-heading">
          <div>
            <h2>
              <Rss size={20} /> Fuentes de descubrimiento
            </h2>
            <p className="muted">
              Cada resultado conserva su origen y el momento de consulta. Las
              redes sociales requieren las credenciales y permisos de su
              proveedor.
            </p>
          </div>
          {canEdit && (
            <Button
              variant="primary"
              disabled={!!busy}
              onClick={() => openSource({ ...newSource })}
            >
              <Plus size={17} /> Añadir fuente
            </Button>
          )}
        </div>
        <div className="row" style={{ flexWrap: "wrap", marginBottom: 20 }}>
          <Badge tone="green">
            {state.sources.filter((item) => item.enabled).length} activas
          </Badge>
          <span className="muted" style={{ fontSize: 13 }}>
            La búsqueda se ejecuta desde el radar. La cobertura depende de cada
            fuente.
          </span>
        </div>
        {state.sources.length === 0 ? (
          <EmptyState icon={<Search />} title="Conecta tu primera fuente">
            Añade un feed RSS, noticias de tu sector o una comunidad que tu
            audiencia ya siga.
          </EmptyState>
        ) : (
          <div className="stack" style={{ gap: 0 }}>
            {state.sources.map((item) => {
              const provider =
                item.type === "youtube"
                  ? "YouTube"
                  : item.type === "apify"
                    ? "Apify"
                    : "";
              const providerConfigured =
                item.type === "youtube"
                  ? socialSettings?.youtube.configured === true
                  : item.type === "apify"
                    ? socialSettings?.apify.configured === true
                    : true;
              const accessRestricted = item.accessPolicy?.allowed === false;
              const needsProviderSetup =
                !!provider && !providerConfigured && !accessRestricted;
              return (
                <div className="source-row" key={item.id}>
                  <div
                    className="row"
                    style={{ alignItems: "flex-start", flex: 1, minWidth: 0 }}
                  >
                    <div className="source-icon">
                      <Rss size={18} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                        <strong>{item.name}</strong>
                        <Badge tone={item.enabled ? "green" : "neutral"}>
                          {accessRestricted
                            ? "Requiere revisión"
                            : item.enabled
                              ? "Activa"
                              : "Pausada"}
                        </Badge>
                        <span className="muted" style={{ fontSize: 12 }}>
                          {sourceTypes.find((type) => type.value === item.type)
                            ?.label || item.type}
                        </span>
                      </div>
                      <p
                        className="muted"
                        style={{
                          fontSize: 13,
                          margin: "6px 0",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {(sourceQueryKind(item.type) && item.query) ||
                          (sourceHasUrl(item.type) && item.url) ||
                          "Consulta según el contexto de tu marca"}
                      </p>
                      <small className="muted">
                        {formatDate(item.lastSyncedAt)}
                      </small>
                      {accessRestricted && (
                        <p className="small muted" role="status">
                          {item.accessPolicy?.reason}
                        </p>
                      )}
                      {item.lastError && (
                        <p
                          role="status"
                          style={{
                            color: "var(--danger, #b33d40)",
                            fontSize: 13,
                            marginBottom: 0,
                          }}
                        >
                          {item.lastError}
                        </p>
                      )}
                      {needsProviderSetup && (
                        <p className="small muted" role="status">
                          {socialSettings
                            ? `${provider} no está configurado para esta marca.`
                            : socialSettingsError
                              ? "No se pudo verificar la conexión del proveedor."
                              : `Verificando la conexión de ${provider}…`}{" "}
                          {canEdit && (
                            <button
                              type="button"
                              className="text-button"
                              onClick={focusSocialSettings}
                            >
                              Configurar proveedor
                            </button>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="row" style={{ flexShrink: 0, gap: 2 }}>
                      <IconButton
                        disabled={
                          !!busy ||
                          accessRestricted ||
                          (needsProviderSetup && !item.enabled)
                        }
                        label={
                          item.enabled
                            ? `Pausar ${item.name}`
                            : `Activar ${item.name}`
                        }
                        onClick={() =>
                          perform(`source-${item.id}`, async () => {
                            await api(`${base}/sources/${item.id}`, {
                              method: "PATCH",
                              body: json({ enabled: !item.enabled }),
                            });
                            await refresh();
                          })
                        }
                      >
                        {item.enabled ? (
                          <ToggleRight size={23} />
                        ) : (
                          <ToggleLeft size={23} />
                        )}
                      </IconButton>
                      <IconButton
                        label={`Editar ${item.name}`}
                        disabled={!!busy}
                        onClick={() =>
                          openSource({
                            id: item.id,
                            name: item.name,
                            type: item.type,
                            query: sourceQueryKind(item.type)
                              ? item.query || ""
                              : "",
                            url: sourceHasUrl(item.type) ? item.url || "" : "",
                            platform: sourcePlatform(item.type, item.platform),
                            limit: String(item.limit || 20),
                            enabled: item.enabled,
                          })
                        }
                      >
                        <Pencil size={16} />
                      </IconButton>
                      <IconButton
                        disabled={!!busy}
                        label={`Eliminar ${item.name}`}
                        onClick={() =>
                          perform(
                            `source-${item.id}`,
                            async () => {
                              await api(`${base}/sources/${item.id}`, {
                                method: "DELETE",
                              });
                              await refresh();
                            },
                            "Fuente eliminada.",
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 18 }}>
          La popularidad de una fuente no demuestra una tendencia global. El
          radar distingue señales observadas, hipótesis editoriales y datos de
          ejemplo.
        </p>
      </section>

      <details id="additional-integrations" className="card settings-section">
        <summary>Integraciones adicionales y alcance</summary>
        <ProviderBudget />
        <section
          id="social-provider-settings"
          className="card settings-section social-settings-section"
        >
          <div className="section-heading">
            <div>
              <h2>
                <Globe size={20} /> Exploración social y video
              </h2>
              <p className="muted">
                Estas integraciones están restringidas por las condiciones de
                uso. Puedes guardar enlaces y aportar contenido propio. No se
                ejecutan consultas ni se generan cargos de estos conectores.
              </p>
            </div>
          </div>
          {socialSettingsError && (
            <p className="form-error" role="alert">
              No se pudo consultar el estado de estas conexiones:{" "}
              {socialSettingsError}
            </p>
          )}
          <div className="social-settings-grid">
            {(
              [
                { id: "youtube", label: "YouTube Data API", icon: Youtube },
                {
                  id: "apify",
                  label: "Apify · Instagram y TikTok",
                  icon: Instagram,
                },
                {
                  id: "gemini",
                  label: "Gemini · análisis de video",
                  icon: Video,
                },
              ] as const
            ).map(({ id, label, icon: Icon }) => {
              const policy =
                socialSettings?.policies?.[id] || state.accessPolicies?.[id];
              return (
                <section className="social-connector-card" key={id}>
                  <div className="social-connector-title">
                    <span className={`social-connector-icon ${id}`}>
                      <Icon size={17} />
                    </span>
                    <div>
                      <h3>{label}</h3>
                      <Badge>Requiere autorización</Badge>
                    </div>
                  </div>
                  <p className="muted">
                    {policy?.reason ||
                      "Esta integración está bloqueada hasta revisar los permisos para el uso previsto. Una credencial no la activa."}
                  </p>
                  {owner && socialSettings?.[id].configured && (
                    <Button
                      disabled={!!busy}
                      onClick={() =>
                        socialIntegration({ [id]: null }, () => {})
                      }
                    >
                      Retirar credencial guardada
                    </Button>
                  )}
                </section>
              );
            })}
          </div>
          <div className="social-unsupported-note">
            Facebook y X aparecen como pendientes: este radar todavía no tiene
            adaptadores disponibles para esas redes. No se ejecutarán consultas
            globales ni se presentarán resultados como cobertura completa.
          </div>
          {!owner && (
            <p className="muted social-owner-note">
              <KeyRound size={14} /> Solo el propietario de la marca puede
              configurar o retirar estas credenciales.
            </p>
          )}
        </section>
      </details>
      <div className="settings-grid">
        <section className="card settings-section">
          <div className="section-heading">
            <div>
              <h2>
                <Sparkles size={20} /> Servicios de creación y publicación
              </h2>
              <p className="muted">
                La IA de la plataforma se aplica automáticamente cuando está
                disponible. No necesitas una clave propia para empezar.
              </p>
            </div>
          </div>
          <div
            className="row"
            role="tablist"
            aria-label="Conectores"
            style={{ flexWrap: "wrap", marginBottom: 20, gap: 6 }}
          >
            {(
              [
                { id: "ai", label: "IA", icon: Sparkles },
                { id: "webhook", label: "Publicación", icon: Globe },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={integrationTab === tab.id}
                className={`button ${integrationTab === tab.id ? "primary" : "ghost"}`}
                onClick={() => setIntegrationTab(tab.id)}
              >
                <tab.icon size={15} />
                {tab.label}
              </button>
            ))}
          </div>
          {integrationTab === "ai" && (
            <div className="stack">
              <Badge tone={state.integrations.ai.ready ? "green" : "neutral"}>
                {publicTestAi
                  ? "IA de prueba gratuita"
                  : state.integrations.ai.ready
                    ? state.integrations.ai.managedBy === "platform"
                      ? "IA de la plataforma disponible"
                      : "IA de esta empresa disponible"
                    : "Motor editorial local disponible"}
              </Badge>
              <p className="muted">
                {state.integrations.ai.ready
                  ? "Los análisis y borradores usan el servicio disponible en tu espacio. Las claves se conservan en el servidor."
                  : "Puedes preparar borradores y completar el flujo editorial con el motor local. El administrador de la plataforma gestiona la disponibilidad de IA contextual."}
              </p>
              <details>
                <summary>Personalizar IA para esta empresa</summary>
                <form
                  className="stack"
                  onSubmit={(event) => {
                    event.preventDefault();
                    integration(
                      {
                        ai: {
                          ...(aiKey ? { apiKey: aiKey } : {}),
                          model: aiModel,
                        },
                      },
                      () => setAiKey(""),
                    );
                  }}
                >
                  <div className="row">
                    <Badge
                      tone={
                        state.integrations.ai.configured ? "green" : "neutral"
                      }
                    >
                      {state.integrations.ai.ready
                        ? "IA disponible"
                        : state.integrations.ai.configured
                          ? "Credencial guardada · servicio no disponible"
                          : "Sin credencial propia"}
                    </Badge>
                  </div>
                  <p className="muted" style={{ fontSize: 13 }}>
                    Una API key habilita análisis y guiones con IA. Sin ella se
                    usa una heurística identificada, con evidencia limitada. El
                    proveedor necesita una revisión del operador sobre derechos
                    de entrada y tratamiento de datos antes de recibir
                    contenido. Las consultas pueden tener costo.
                  </p>
                  <Field
                    label={
                      state.integrations.ai.configured
                        ? "Nueva API key (deja vacío para conservar)"
                        : "API key"
                    }
                    type="password"
                    autoComplete="new-password"
                    value={aiKey}
                    onChange={(event) => setAiKey(event.target.value)}
                    placeholder="sk-…"
                    disabled={!owner}
                  />
                  <Field
                    label="Modelo"
                    value={aiModel}
                    onChange={(event) => setAiModel(event.target.value)}
                    maxLength={100}
                    disabled={!owner}
                  />
                  {owner && (
                    <div className="row" style={{ flexWrap: "wrap" }}>
                      <Button
                        type="submit"
                        variant="primary"
                        busy={busy === "integration"}
                        disabled={
                          !!busy ||
                          (!aiKey &&
                            state.integrations.ai.managedBy !== "workspace")
                        }
                      >
                        <Check size={16} /> Guardar IA
                      </Button>
                      {state.integrations.ai.configured && (
                        <Button
                          disabled={!!busy}
                          onClick={() =>
                            integration({ ai: { disabled: true } }, () =>
                              setAiKey(""),
                            )
                          }
                        >
                          Usar motor local
                        </Button>
                      )}
                    </div>
                  )}
                </form>
              </details>
              {owner && state.integrations.ai.hasOverride && (
                <Button
                  disabled={!!busy}
                  onClick={() =>
                    integration({ ai: { usePlatform: true } }, () =>
                      setAiKey(""),
                    )
                  }
                >
                  Usar servicio de la plataforma
                </Button>
              )}
            </div>
          )}
          {integrationTab === "webhook" && (
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                integration(
                  { webhook: { url: webhookUrl, secret: webhookSecret } },
                  () => setWebhookSecret(""),
                );
              }}
            >
              <Badge
                tone={
                  state.integrations.webhook.configured ? "green" : "neutral"
                }
              >
                {state.integrations.webhook.configured
                  ? "Webhook configurado"
                  : "Sin conexión de publicación"}
              </Badge>
              <p className="muted" style={{ fontSize: 13 }}>
                Envía contenido aprobado a un endpoint HTTPS público. El destino
                debe tener permiso para publicarlo y una revisión del operador
                para esa URL. Sin conector puedes exportar tus piezas. La grilla
                organiza fechas; esta entrega no ejecuta publicaciones
                automáticas.
              </p>
              <Field
                label="URL HTTPS del webhook"
                type="url"
                value={webhookUrl}
                onChange={(event) => setWebhookUrl(event.target.value)}
                disabled={!owner}
                placeholder="https://tu-servicio.com/publicar"
              />
              <Field
                label="Secreto (vacío para conservar)"
                type="password"
                autoComplete="new-password"
                value={webhookSecret}
                onChange={(event) => setWebhookSecret(event.target.value)}
                disabled={!owner}
              />
              {owner && (
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!!busy || !webhookUrl}
                    busy={busy === "integration"}
                  >
                    Guardar webhook
                  </Button>
                  {state.integrations.webhook.configured && (
                    <Button
                      disabled={!!busy}
                      onClick={() =>
                        integration({ webhook: null }, () => {
                          setWebhookSecret("");
                          setWebhookUrl("");
                        })
                      }
                    >
                      Desconectar
                    </Button>
                  )}
                </div>
              )}
            </form>
          )}
          {!owner && (
            <p className="muted" style={{ marginTop: 18, fontSize: 13 }}>
              <KeyRound size={14} /> Solo un propietario puede cambiar
              conectores.
            </p>
          )}
        </section>

        <section className="card settings-section">
          <div className="section-heading">
            <div>
              <h2>
                <Users size={20} /> Tu equipo
              </h2>
              <p className="muted">
                Un mismo contexto editorial, con permisos claros.
              </p>
            </div>
            <Badge>{state.members.length}</Badge>
          </div>
          <div className="stack">
            {state.members.map((member) => (
              <div className="source-row" key={member.id}>
                <div style={{ minWidth: 0 }}>
                  <strong>
                    {member.name}
                    {member.id === userId ? " · tú" : ""}
                  </strong>
                  <p
                    className="muted"
                    style={{
                      fontSize: 13,
                      margin: "4px 0",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {member.email}
                  </p>
                </div>
                <div className="row">
                  {owner && userId && member.id !== userId ? (
                    <>
                      <select
                        aria-label={`Rol de ${member.name}`}
                        value={member.role}
                        disabled={!!busy}
                        onChange={(event) =>
                          perform(
                            `member-${member.id}`,
                            async () => {
                              await api(`${base}/members/${member.id}`, {
                                method: "PATCH",
                                body: json({ role: event.target.value }),
                              });
                              await refresh();
                            },
                            "Permisos actualizados.",
                          )
                        }
                      >
                        <option value="owner">Propietario</option>
                        <option value="editor">Editor</option>
                        <option value="reviewer">Revisor</option>
                      </select>
                      <IconButton
                        label={`Retirar a ${member.name}`}
                        disabled={!!busy}
                        onClick={() =>
                          perform(
                            `member-${member.id}`,
                            async () => {
                              await api(`${base}/members/${member.id}`, {
                                method: "DELETE",
                              });
                              await refresh();
                            },
                            "Miembro retirado.",
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </>
                  ) : (
                    <Badge tone={member.role === "owner" ? "green" : "neutral"}>
                      {roleLabel[member.role]}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12, margin: "20px 0" }}>
            El editor capta referencias y prepara piezas. El revisor comenta y
            aprueba. El propietario administra la marca y sus conexiones.
          </p>
          {owner && (
            <div
              className="stack"
              style={{
                borderTop: "1px solid var(--border, #e5e7de)",
                paddingTop: 20,
              }}
            >
              <h3>Invitar a colaborar</h3>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <select
                  aria-label="Rol de la invitación"
                  value={inviteRole}
                  onChange={(event) =>
                    setInviteRole(event.target.value as Role)
                  }
                >
                  <option value="editor">Editor</option>
                  <option value="reviewer">Revisor</option>
                </select>
                <Button
                  variant="secondary"
                  busy={busy === "invite"}
                  disabled={!!busy}
                  onClick={() =>
                    perform(
                      "invite",
                      async () => {
                        const created = await api<{
                          token: string;
                          expiresAt: string;
                        }>(`${base}/invitations`, {
                          method: "POST",
                          body: json({ role: inviteRole }),
                        });
                        setInvitation(created);
                      },
                      "Invitación creada. Comparte el enlace con tu equipo.",
                    )
                  }
                >
                  <Plus size={16} /> Crear invitación
                </Button>
              </div>
              {invitation && (
                <div className="stack" style={{ gap: 10 }}>
                  <Field
                    label="Enlace de invitación (un solo uso)"
                    value={invitationUrl}
                    readOnly
                    onFocus={(event) => event.target.select()}
                  />
                  <div className="row">
                    <Button onClick={() => copy(invitationUrl)}>
                      <Copy size={15} />
                      Copiar enlace
                    </Button>
                    <small className="muted">
                      Vence {formatDate(invitation.expiresAt)}
                    </small>
                  </div>
                  <small className="muted">
                    Cualquier persona con este enlace podrá aceptar el rol
                    elegido. No se envió ningún mensaje.
                  </small>
                </div>
              )}
            </div>
          )}
          <form
            className="stack"
            style={{
              borderTop: "1px solid var(--border, #e5e7de)",
              paddingTop: 20,
              marginTop: 22,
            }}
            onSubmit={acceptInvitation}
          >
            <h3>¿Te invitaron a otra marca?</h3>
            <Field
              label="Token o enlace de invitación"
              value={acceptToken}
              onChange={(event) => setAcceptToken(event.target.value)}
              placeholder="Pega aquí tu invitación"
            />
            <Button
              type="submit"
              disabled={!!busy || !acceptToken.trim()}
              busy={busy === "accept-invite"}
            >
              <Link size={15} /> Aceptar invitación
            </Button>
          </form>
        </section>
      </div>
      {source && (
        <Modal
          title={source.id ? "Editar fuente" : "Añadir fuente"}
          onClose={closeSource}
        >
          <form onSubmit={saveSource} aria-busy={busy === "source-save"}>
            <fieldset
              className="stack"
              disabled={!!busy}
              style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
            >
              <Field
                label="Nombre de la fuente"
                required
                value={source.name}
                maxLength={200}
                onChange={(event) =>
                  setSource({ ...source, name: event.target.value })
                }
                placeholder="Ej. Innovación en mi industria"
              />
              <Field label="Tipo de fuente">
                <select
                  value={source.type}
                  onChange={(event) => {
                    const type = event.target.value as Source["type"];
                    setSource({
                      ...source,
                      type,
                      query:
                        sourceQueryKind(type) &&
                        sourceQueryKind(type) === sourceQueryKind(source.type)
                          ? source.query
                          : "",
                      url: type === source.type ? source.url : "",
                      enabled:
                        type === "youtube" || type === "apify"
                          ? false
                          : source.enabled,
                      platform: sourcePlatform(type, source.platform),
                    });
                  }}
                >
                  {sourceTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="muted" style={{ fontSize: 13 }}>
                {
                  sourceTypes.find((type) => type.value === source.type)
                    ?.description
                }
              </p>
              {source.type === "rss" && (
                <Field
                  label="URL del feed RSS / Atom"
                  required
                  type="url"
                  value={source.url}
                  onChange={(event) =>
                    setSource({ ...source, url: event.target.value })
                  }
                  placeholder="https://sitio.com/feed"
                />
              )}
              {source.type === "youtube" && (
                <>
                  <Field
                    label="Tema o consulta de YouTube"
                    value={source.query}
                    maxLength={300}
                    onChange={(event) =>
                      setSource({ ...source, query: event.target.value })
                    }
                    placeholder="rutina de cuidado de la piel"
                  />
                  <Field
                    label="Canal de YouTube (opcional)"
                    type="url"
                    value={source.url}
                    onChange={(event) =>
                      setSource({ ...source, url: event.target.value })
                    }
                    placeholder="https://www.youtube.com/@canal"
                  />
                  <small className="muted">
                    Indica una consulta temática o una URL de canal. Se conserva
                    la URL del video original y las vistas oficiales
                    disponibles.
                  </small>
                </>
              )}
              {source.type === "apify" && (
                <>
                  <Field label="Red social">
                    <select
                      value={source.platform}
                      onChange={(event) =>
                        setSource({
                          ...source,
                          platform: event.target.value as SocialPlatform,
                          url:
                            event.target.value === source.platform
                              ? source.url
                              : "",
                        })
                      }
                    >
                      <option value="instagram">Instagram</option>
                      <option value="tiktok">TikTok</option>
                    </select>
                  </Field>
                  <Field
                    label="Tema, hashtag o consulta"
                    value={source.query}
                    maxLength={300}
                    onChange={(event) =>
                      setSource({ ...source, query: event.target.value })
                    }
                    placeholder="#rutinafacial"
                  />
                  <Field
                    label={`URL de ${source.platform === "instagram" ? "Instagram" : "TikTok"} (opcional)`}
                    type="url"
                    value={source.url}
                    onChange={(event) =>
                      setSource({ ...source, url: event.target.value })
                    }
                    placeholder={
                      source.platform === "instagram"
                        ? "https://www.instagram.com/…"
                        : "https://www.tiktok.com/@…"
                    }
                  />
                  <Field
                    label="Máximo de resultados por consulta (1–50)"
                    type="number"
                    min={1}
                    max={50}
                    step={1}
                    value={source.limit}
                    onChange={(event) =>
                      setSource({ ...source, limit: event.target.value })
                    }
                  />
                  <small className="muted">
                    Si completas consulta y URL, el backend prioriza la
                    consulta. El actor puede tener límites o cargos propios.
                  </small>
                </>
              )}
              {source.type !== "rss" && !selectedSourceSocial && (
                <Field
                  label={
                    source.type === "reddit"
                      ? "Comunidad (subreddit)"
                      : "Tema o consulta en inglés (opcional)"
                  }
                  value={source.query}
                  maxLength={300}
                  onChange={(event) =>
                    setSource({ ...source, query: event.target.value })
                  }
                  placeholder={
                    source.type === "reddit"
                      ? "artificial"
                      : "artificial intelligence"
                  }
                />
              )}
              {source.type === "gdelt" && (
                <small className="muted">
                  Si dejas la consulta vacía, se utiliza el contexto de tu
                  marca. Prueba términos concretos en inglés para ampliar
                  cobertura.
                </small>
              )}
              <label className="row">
                <input
                  type="checkbox"
                  checked={source.enabled}
                  disabled={["youtube", "apify", "reddit"].includes(
                    source.type,
                  )}
                  onChange={(event) =>
                    setSource({ ...source, enabled: event.target.checked })
                  }
                />{" "}
                {["youtube", "apify", "reddit"].includes(source.type)
                  ? "Recopilación no autorizada en este despliegue"
                  : "Activar para la próxima búsqueda"}
              </label>
              <p className="small muted">
                Los feeds adicionales requieren revisión del operador antes de
                activarse. Guardar una credencial no concede permiso de acceso a
                una red social.
              </p>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <Button disabled={!!busy} onClick={closeSource}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  busy={busy === "source-save"}
                  disabled={!!busy}
                >
                  Guardar fuente
                </Button>
              </div>
            </fieldset>
          </form>
        </Modal>
      )}
    </div>
  );
}
