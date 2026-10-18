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
import SocialConnections from "./SocialConnections";
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
import "./discovery-settings.css";

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
  },
  {
    value: "hackernews",
    label: "Hacker News",
  },
  {
    value: "gdelt",
    label: "GDELT · noticias globales",
  },
  {
    value: "reddit",
    label: "Reddit · requiere autorización",
    description: "Recopilación bloqueada: falta autorización de Reddit.",
  },
  {
    value: "youtube",
    label: "YouTube · API oficial",
    description:
      "Análisis editorial bloqueado: falta revisión de uso de datos.",
  },
  {
    value: "apify",
    label: "Instagram / TikTok · Apify",
    description: "Recopilación bloqueada: falta autorización de la red.",
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
        "Fuente guardada.",
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
      notify("Invitación aceptada.");
      window.location.reload();
    });
  }
  const invitationUrl = invitation
    ? `${window.location.origin}/?invite=${invitation.token}`
    : "";
  const selectedSourceSocial =
    source?.type === "youtube" || source?.type === "apify";
  function focusSocialSettings() {
    const details = document.getElementById(
      "additional-integrations",
    ) as HTMLDetailsElement | null;
    if (details) details.open = true;
    document.getElementById("social-provider-settings")?.scrollIntoView({
      behavior: "instant",
      block: "start",
    });
  }

  return (
    <div className="stack settings-page">
      <div className="page-heading">
        <div>
          <h1>Fuentes y equipo</h1>
        </div>
        <Badge tone={owner ? "green" : "neutral"}>
          {roleLabel[state.brand.role]}
        </Badge>
      </div>
      <nav className="settings-index" aria-label="Secciones de configuración">
        <a href="#social-connections">Redes</a>
        <a href="#discovery-sources">Fuentes</a>
        <a href="#workspace-integrations">Servicios</a>
        <a href="#workspace-team">Equipo</a>
      </nav>
      <SocialConnections />
      <section id="discovery-sources" className="card settings-section">
        <div className="section-heading">
          <div>
            <h2>
              <Rss size={20} /> Fuentes de descubrimiento
            </h2>
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
        </div>
        {state.sources.length === 0 ? (
          <EmptyState icon={<Search />} title="Sin fuentes" />
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
                          "Consulta del contexto de empresa"}
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
                            color: "var(--negative)",
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
      </section>

      <details id="additional-integrations" className="card settings-section">
        <summary>Integraciones restringidas</summary>
        <ProviderBudget />
        <section
          id="social-provider-settings"
          className="social-settings-section"
        >
          <div className="section-heading">
            <div>
              <h2>
                <Globe size={20} /> Exploración social y video
              </h2>
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
                      "Integración bloqueada: faltan permisos de uso."}
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
          {!owner && (
            <p className="muted social-owner-note">
              <KeyRound size={14} /> Solo el propietario puede cambiar
              credenciales.
            </p>
          )}
        </section>
      </details>
      <div className="settings-grid">
        <section id="workspace-integrations" className="card settings-section">
          <div className="section-heading">
            <div>
              <h2>
                <Sparkles size={20} /> Servicios de creación y publicación
              </h2>
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
                  ? "IA de prueba"
                  : state.integrations.ai.ready
                    ? state.integrations.ai.managedBy === "platform"
                      ? "IA de la plataforma disponible"
                      : "IA de esta empresa disponible"
                    : "Motor editorial local disponible"}
              </Badge>
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
                    El proveedor recibirá contenido de la empresa y puede cobrar
                    por consulta. Requiere revisión de derechos y tratamiento de
                    datos.
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
                Solo envía piezas aprobadas a una URL autorizada. El calendario
                no publica automáticamente.
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
              <KeyRound size={14} /> Solo el propietario puede cambiar
              conectores.
            </p>
          )}
        </section>

        <section id="workspace-team" className="card settings-section">
          <div className="section-heading">
            <div>
              <h2>
                <Users size={20} /> Tu equipo
              </h2>
            </div>
            <Badge>{state.members.length}</Badge>
          </div>
          <p className="small muted">
            Editor: crea y edita. Revisor: comenta y aprueba. Propietario:
            administra.
          </p>
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
          {owner && (
            <div
              className="stack"
              style={{
                borderTop: "1px solid var(--border)",
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
                      "Invitación creada.",
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
                    Cualquier persona con el enlace podrá aceptar este rol.
                  </small>
                </div>
              )}
            </div>
          )}
          <form
            className="stack"
            style={{
              borderTop: "1px solid var(--border)",
              paddingTop: 20,
              marginTop: 22,
            }}
            onSubmit={acceptInvitation}
          >
            <h3>Aceptar invitación</h3>
            <Field
              label="Token o enlace de invitación"
              value={acceptToken}
              onChange={(event) => setAcceptToken(event.target.value)}
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
              {sourceTypes.find((type) => type.value === source.type)
                ?.description && (
                <p className="muted" style={{ fontSize: 13 }}>
                  {
                    sourceTypes.find((type) => type.value === source.type)
                      ?.description
                  }
                </p>
              )}
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
                    Completa la consulta o el canal.
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
                    La consulta tiene prioridad sobre la URL. Apify puede cobrar
                    por ejecución.
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
                />
              )}
              {source.type === "gdelt" && (
                <small className="muted">
                  Sin consulta, se usa el contexto de la empresa.
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
              {source.type === "rss" && (
                <p className="small muted">
                  El operador debe autorizar el feed antes de activarlo.
                </p>
              )}
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
