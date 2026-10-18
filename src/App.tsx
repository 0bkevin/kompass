import { useCallback, useEffect, useRef, useState } from "react";
import {
  Link,
  Outlet,
  useBlocker,
  useLocation,
  useRouter,
} from "@tanstack/react-router";
import {
  Radar as RadarIcon,
  Inbox,
  Clapperboard,
  CalendarDays,
  FolderOpen,
  Users,
  Palette,
  Settings,
  Search,
  Plus,
  ChevronDown,
  LogOut,
  ArrowUpRight,
  Menu,
  X,
  CheckCircle2,
  AlertCircle,
  Compass,
  ArrowRight,
  Radio,
  House,
  Lightbulb,
  BarChart3,
} from "lucide-react";
import { api, json } from "./lib/api";
import type { Brand, BrandState, Session, View } from "./lib/types";
import { WorkspaceProvider } from "./lib/workspace";
import { Button, Modal, Field } from "./components/ui";
import { CaptureModal } from "./features/Discovery";
import { CompanySetup } from "./features/CompanySetup";
import { workspaceLocation } from "./lib/legacy-navigation.mjs";

const views: {
  id: View;
  label: string;
  icon: typeof RadarIcon;
  group: string;
}[] = [
  { id: "home", label: "Inicio", icon: House, group: "Trabajo" },
  { id: "audience", label: "Audiencia", icon: Users, group: "Trabajo" },
  {
    id: "opportunities",
    label: "Oportunidades",
    icon: Lightbulb,
    group: "Trabajo",
  },
  { id: "studio", label: "Contenido", icon: Clapperboard, group: "Trabajo" },
  { id: "calendar", label: "Calendario", icon: CalendarDays, group: "Trabajo" },
  { id: "results", label: "Resultados", icon: BarChart3, group: "Trabajo" },
  {
    id: "brand",
    label: "Empresa y contenido",
    icon: Palette,
    group: "Empresa",
  },
  {
    id: "radar",
    label: "Explorar fuentes",
    icon: RadarIcon,
    group: "Herramientas",
  },
  { id: "inbox", label: "Referencias", icon: Inbox, group: "Herramientas" },
  { id: "assets", label: "Archivos", icon: FolderOpen, group: "Herramientas" },
];
type WorkspaceSearch = Record<string, unknown>;
const preserveWorkspaceSearch = (previous: WorkspaceSearch) => previous;
const clearInviteSearch = (previous: WorkspaceSearch) => {
  const next = { ...previous };
  delete next.invite;
  return next;
};

export default function App() {
  const router = useRouter();
  const pathname = useLocation({ select: (location) => location.pathname });
  const { view, pieceId } = workspaceLocation(pathname);
  const navigateWorkspace = useCallback(
    (targetView: View, targetPieceId?: string, removeInvite = false) => {
      const search = removeInvite ? clearInviteSearch : preserveWorkspaceSearch;
      const options = { search, replace: removeInvite };
      if (targetView === "studio" && targetPieceId)
        return router.navigate({
          to: "/studio/$pieceId",
          params: { pieceId: targetPieceId },
          ...options,
        });

      switch (targetView) {
        case "home":
          return router.navigate({ to: "/home", ...options });
        case "opportunities":
          return router.navigate({ to: "/opportunities", ...options });
        case "results":
          return router.navigate({ to: "/results", ...options });
        case "radar":
          return router.navigate({ to: "/radar", ...options });
        case "inbox":
          return router.navigate({ to: "/inbox", ...options });
        case "studio":
          return router.navigate({ to: "/studio", ...options });
        case "calendar":
          return router.navigate({ to: "/calendar", ...options });
        case "assets":
          return router.navigate({ to: "/assets", ...options });
        case "audience":
          return router.navigate({ to: "/audience", ...options });
        case "brand":
          return router.navigate({ to: "/brand", ...options });
        case "settings":
          return router.navigate({ to: "/settings", ...options });
      }
    },
    [router],
  );
  const [session, setSession] = useState<Session | null>(null),
    [activeId, setActiveId] = useState(""),
    [state, setState] = useState<BrandState | null>(null),
    [error, setError] = useState("");
  const [search, setSearch] = useState(""),
    [capture, setCapture] = useState(false),
    [newBrand, setNewBrand] = useState(false),
    [mobile, setMobile] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(
    null,
  );
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!mobile) return;
    const sidebar = sidebarRef.current;
    const controls = () =>
      Array.from(
        sidebar?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a[href],select,summary",
        ) || [],
      ).filter((element) => element.getClientRects().length > 0);
    controls()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobile(false);
        event.preventDefault();
      }
      if (event.key === "Tab") {
        const items = controls();
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          last?.focus();
          event.preventDefault();
        } else if (!event.shiftKey && document.activeElement === last) {
          first?.focus();
          event.preventDefault();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      menuTrigger.current?.focus();
    };
  }, [mobile]);
  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  const refreshRequestRef = useRef(0);
  const mountedRef = useRef(true);
  const leaveGuardsRef = useRef(
    new Set<{
      isDirty: () => boolean;
      confirmLeave: () => boolean;
    }>(),
  );
  const registerUnsavedChangesGuard = useCallback(
    (guard: { isDirty: () => boolean; confirmLeave: () => boolean }) => {
      leaveGuardsRef.current.add(guard);
      return () => {
        leaveGuardsRef.current.delete(guard);
      };
    },
    [],
  );
  const confirmUnsavedChanges = useCallback(() => {
    return [...leaveGuardsRef.current].every(
      (guard) => !guard.isDirty() || guard.confirmLeave(),
    );
  }, []);
  useBlocker({
    shouldBlockFn: () => {
      return [...leaveGuardsRef.current].some(
        (guard) => guard.isDirty() && !guard.confirmLeave(),
      );
    },
    enableBeforeUnload: () =>
      [...leaveGuardsRef.current].some((guard) => guard.isDirty()),
  });
  const selectBrand = useCallback((id: string) => {
    activeRef.current = id;
    refreshRequestRef.current += 1;
    setActiveId(id);
  }, []);
  const changeBrand = useCallback(
    (id: string) => {
      if (id !== activeRef.current && confirmUnsavedChanges()) selectBrand(id);
    },
    [confirmUnsavedChanges, selectBrand],
  );
  const [joining, setJoining] = useState(false);
  const invitationAttempted = useRef(false);
  const notify = useCallback((message: string, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 6000);
  }, []);
  const loadSession = useCallback(async () => {
    try {
      const data = await api<Session>("/api/session");
      setSession(data);
      if (data.user)
        setActiveId(
          (current) =>
            current ||
            data.brands.find((b) => b.id === localStorage.getItem("30x-brand"))
              ?.id ||
            data.brands[0]?.id ||
            "",
        );
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void loadSession();
  }, [loadSession]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      refreshRequestRef.current += 1;
    };
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname, activeId]);
  useEffect(() => {
    setMobile(false);
    setSearch("");
  }, [pathname]);
  useEffect(() => {
    const token = new URL(location.href).searchParams.get("invite");
    if (!session?.user || !token || invitationAttempted.current) return;
    invitationAttempted.current = true;
    setJoining(true);
    void (async () => {
      try {
        const brand = await api<Brand>(
          `/api/invitations/${encodeURIComponent(token)}/accept`,
          { method: "POST", body: "{}" },
        );
        const next = await api<Session>("/api/session");
        setSession(next);
        selectBrand(brand.id);
        const current = workspaceLocation(router.state.location.pathname);
        await navigateWorkspace(current.view, current.pieceId, true);
        notify("Invitación aceptada. Ya formas parte del equipo.");
      } catch (e) {
        setError((e as Error).message);
        notify((e as Error).message, "error");
      } finally {
        setJoining(false);
      }
    })();
  }, [session?.user?.id, notify, navigateWorkspace, router, selectBrand]);
  const refresh = useCallback(
    async (options: { reportError?: boolean } = {}) => {
      const brandId = activeId;
      if (!brandId || activeRef.current !== brandId) return;

      const requestId = ++refreshRequestRef.current;
      const isCurrentRequest = () =>
        mountedRef.current &&
        requestId === refreshRequestRef.current &&
        activeRef.current === brandId;

      try {
        const data = await api<BrandState>(`/api/brands/${brandId}/state`);
        if (isCurrentRequest()) {
          setState(data);
          setError("");
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  brands: prev.brands.map((b) =>
                    b.id === data.brand.id ? data.brand : b,
                  ),
                }
              : prev,
          );
        }
      } catch (e) {
        if (options.reportError && isCurrentRequest()) {
          setError(e instanceof Error ? e.message : String(e));
        }
        throw e;
      }
    },
    [activeId],
  );
  useEffect(() => {
    if (!activeId || activeRef.current !== activeId) return;
    setState(null);
    setError("");
    localStorage.setItem("30x-brand", activeId);
    void refresh({ reportError: true }).catch(() => {});
  }, [activeId, refresh]);
  useEffect(() => {
    if (!activeId || view !== "radar") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible")
        void refresh().catch(() => {});
    }, 60000);
    return () => window.clearInterval(timer);
  }, [activeId, view, refresh]);
  const navigate = useCallback(
    (view: View, pieceId?: string) => {
      void navigateWorkspace(view, pieceId);
    },
    [navigateWorkspace],
  );
  const logout = useCallback(async () => {
    if (!confirmUnsavedChanges()) return;
    await api("/api/auth/logout", { method: "POST" });
    setSession({ user: null, brands: [] });
    setState(null);
    selectBrand("");
  }, [confirmUnsavedChanges, selectBrand]);
  const authenticated = (data: Session) => {
    setSession(data);
    selectBrand(data.brands[0]?.id || "");
    setError("");
  };
  const brandCreated = (brand: Brand) => {
    setSession((prev) =>
      prev ? { ...prev, brands: [...prev.brands, brand] } : prev,
    );
    selectBrand(brand.id);
    setNewBrand(false);
    navigate("home");
    notify("Tu empresa está lista. Empecemos con tu primera oportunidad.");
  };
  if (!session)
    return (
      <div className="initial-loader">
        <div className="brand-symbol">
          <Radio size={25} />
        </div>
        {error ? (
          <>
            <p>{error}</p>
            <Button onClick={() => void loadSession()}>Reintentar</Button>
          </>
        ) : (
          <p>Conectando con tu próximo hallazgo…</p>
        )}
      </div>
    );
  if (!session.user) return <Auth onSuccess={authenticated} />;
  if (joining)
    return (
      <div className="initial-loader">
        <div className="brand-symbol">
          <Users />
        </div>
        <p>Abriendo tu invitación…</p>
      </div>
    );
  if (!session.brands.length)
    return (
      <div className="onboarding">
        <div className="wordmark">
          30X <span>RADAR</span>
        </div>
        <div className="onboarding-panel">
          <CompanySetup onCreated={brandCreated} />
        </div>
        <button className="text-button" onClick={() => void logout()}>
          Cerrar sesión
        </button>
      </div>
    );
  const current = views.find((item) => item.id === view);
  const content = state ? (
    <WorkspaceProvider.Provider
      value={{
        state,
        refresh,
        notify,
        navigate,
        registerUnsavedChangesGuard,
        selectedPieceId: pieceId,
        search,
      }}
    >
      <Outlet key={state.brand.id} />
      {capture && <CaptureModal onClose={() => setCapture(false)} />}
    </WorkspaceProvider.Provider>
  ) : null;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace-main">
        Saltar al contenido
      </a>
      {mobile && (
        <div className="sidebar-overlay" onClick={() => setMobile(false)} />
      )}
      <aside
        ref={sidebarRef}
        id="workspace-navigation"
        className={`sidebar ${mobile ? "open" : ""}`}
        role={mobile ? "dialog" : undefined}
        aria-modal={mobile || undefined}
        aria-label="Menú de la empresa"
      >
        <button
          className="icon-button sidebar-close"
          aria-label="Cerrar menú"
          onClick={() => setMobile(false)}
        >
          <X size={20} />
        </button>
        <Link className="wordmark" to="/home" search={(previous) => previous}>
          <span className="wordmark-icon">
            <Radio size={23} />
          </span>
          30X <span>RADAR</span>
        </Link>
        <div className="workspace-switch">
          <div
            className="workspace-avatar"
            style={{ background: state?.brand.color || "#dcfce7" }}
          >
            {(state?.brand.name || session.brands[0].name).slice(0, 1)}
          </div>
          <label>
            <span className="sr-only">Cambiar de marca</span>
            <select
              value={activeId}
              onChange={(e) => changeBrand(e.target.value)}
            >
              {session.brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <small>Espacio de trabajo</small>
          </label>
          <ChevronDown size={14} />
        </div>
        <button
          className="new-workspace"
          onClick={() => {
            if (confirmUnsavedChanges()) setNewBrand(true);
          }}
        >
          <Plus size={13} /> Crear otra marca
        </button>
        <nav aria-label="Navegación principal">
          {views
            .filter((item) => item.group !== "Herramientas")
            .map((item) => (
              <div key={item.id}>
                <button
                  className={`nav-item ${view === item.id ? "active" : ""}`}
                  aria-current={view === item.id ? "page" : undefined}
                  onClick={() => navigate(item.id)}
                >
                  <item.icon size={18} />
                  <span>{item.label}</span>
                  {item.id === "inbox" &&
                  state?.references.filter((r) => r.status === "new").length ? (
                    <span className="nav-count">
                      {
                        state.references.filter((r) => r.status === "new")
                          .length
                      }
                    </span>
                  ) : null}
                </button>
              </div>
            ))}
          <details
            className="extra-navigation"
            open={views.some(
              (item) => item.id === view && item.group === "Herramientas",
            )}
          >
            <summary>
              Más herramientas <ChevronDown size={14} />
            </summary>
            {views
              .filter((item) => item.group === "Herramientas")
              .map((item) => (
                <button
                  key={item.id}
                  className={`nav-item ${view === item.id ? "active" : ""}`}
                  aria-current={view === item.id ? "page" : undefined}
                  onClick={() => navigate(item.id)}
                >
                  <item.icon size={18} />
                  <span>{item.label}</span>
                </button>
              ))}
          </details>
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${view === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <Settings size={18} />
            Fuentes y equipo
          </button>
          <div className="user-profile">
            <span className="user-avatar">{session.user.name.slice(0, 1)}</span>
            <div>
              <strong>{session.user.name}</strong>
              <small>
                {state?.brand.role === "owner"
                  ? "Administrador"
                  : state?.brand.role === "reviewer"
                    ? "Revisor"
                    : "Editor"}
              </small>
            </div>
            <button
              className="icon-button"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              onClick={() => void logout()}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            ref={menuTrigger}
            aria-label="Abrir menú"
            aria-expanded={mobile}
            aria-controls="workspace-navigation"
            onClick={() => setMobile(true)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumb">
            <span>{state?.brand.name || "Mi empresa"}</span>
            <span aria-hidden="true">/</span>
            <strong>{current?.label || "Fuentes y equipo"}</strong>
          </div>
          {["radar", "inbox", "studio", "calendar", "assets"].includes(view) && (
            <label className="global-search">
              <Search size={16} />
              <input
                ref={searchInput}
                aria-label="Buscar en esta sección"
                placeholder="Busca una idea, un tema…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && search) {
                    setSearch("");
                    event.preventDefault();
                  }
                }}
              />
              {search && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Borrar búsqueda"
                  onClick={() => {
                    setSearch("");
                    searchInput.current?.focus();
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </label>
          )}
          <Button
            aria-label="Agregar referencia"
            variant="primary"
            onClick={() => setCapture(true)}
            disabled={!state || state.brand.role === "reviewer"}
          >
            <Plus size={16} />
            <span>Agregar referencia</span>
          </Button>
        </header>
        <main className="main-content" id="workspace-main" tabIndex={-1}>
          {error ? (
            <div className="error-panel">
              <AlertCircle />
              <h2>No pudimos abrir este espacio</h2>
              <p>{error}</p>
              <Button
                onClick={() => {
                  void refresh({ reportError: true }).catch(() => {});
                }}
              >
                Reintentar
              </Button>
            </div>
          ) : !state ? (
            <div className="workspace-skeleton" role="status">
              <span className="sr-only">Preparando tu espacio…</span>
              <div />
              <div />
              <div />
            </div>
          ) : (
            content
          )}
        </main>
        <footer className="app-footer">
          <span>30X Radar · Hecho para encontrar tu próximo ángulo.</span>
          <span>Las señales tienen contexto. Las decisiones son tuyas.</span>
        </footer>
      </div>
      {newBrand && (
        <Modal
          title="Añadir una empresa"
          wide
          onClose={() => setNewBrand(false)}
        >
          <CompanySetup onCreated={brandCreated} />
        </Modal>
      )}
      {toast && (
        <div
          className={`toast ${toast.type}`}
          role={toast.type === "error" ? "alert" : "status"}
        >
          {toast.type === "error" ? (
            <AlertCircle size={19} />
          ) : (
            <CheckCircle2 size={19} />
          )}
          <span>{toast.message}</span>
          <button
            className="icon-button"
            aria-label="Cerrar notificación"
            onClick={() => setToast(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function Auth({ onSuccess }: { onSuccess: (value: Session) => void }) {
  const [signup, setSignup] = useState(true),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy("form");
    setError("");
    try {
      const data = await api<Session>(
        `/api/auth/${signup ? "register" : "login"}`,
        {
          method: "POST",
          body: json({
            name: form.get("name"),
            email: form.get("email"),
            password: form.get("password"),
          }),
        },
      );
      onSuccess(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-story">
        <div className="wordmark">
          30X <span>RADAR</span>
        </div>
        <div className="auth-intro">
          <h1>
            Tu audiencia cambia.
            <br />
            Tu contenido
            <br />
            <em>también puede.</em>
          </h1>
          <p>
            Conecta el contexto de tu empresa con señales públicas, crea
            contenido con criterio y aprende de cada publicación.
          </p>
          <div className="auth-radar">
            <div className="auth-orbit o1" />
            <div className="auth-orbit o2" />
            <div className="auth-orbit o3" />
            <div className="auth-radar-center">
              <Radio size={34} />
            </div>
            <span className="auth-signal s1">
              Conversaciones que crecen <ArrowUpRight size={15} />
            </span>
            <span className="auth-signal s2">
              Tu marca. Tu perspectiva. <Palette size={15} />
            </span>
            <span className="auth-signal s3">
              De referencia a guion <ArrowRight size={15} />
            </span>
          </div>
        </div>
        <p className="auth-footnote">
          Descubrimiento + criterio editorial + un espacio para crear.
        </p>
      </div>
      <div className="auth-form-wrap">
        <div className="auth-form">
          <h2>
            {signup
              ? "Dale contexto a tu contenido."
              : "Qué bueno tenerte de vuelta."}
          </h2>
          <p className="muted">
            {signup
              ? "Crea tu cuenta. Después, empieza por tu web o una publicación."
              : "Tu próxima oportunidad de contenido te espera."}
          </p>
          <form onSubmit={submit}>
            {signup && (
              <Field
                label="Tu nombre"
                name="name"
                placeholder="¿Cómo te llamas?"
                required
                autoComplete="name"
              />
            )}
            <Field
              label="Correo electrónico"
              name="email"
              type="email"
              placeholder="tu@empresa.com"
              required
              autoComplete="email"
            />
            <Field
              label="Contraseña"
              name="password"
              type="password"
              placeholder="Al menos 10 caracteres"
              minLength={signup ? 10 : 1}
              required
              autoComplete={signup ? "new-password" : "current-password"}
            />
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <Button
              type="submit"
              variant="primary"
              busy={busy === "form"}
              disabled={!!busy}
            >
              {signup ? "Crear mi cuenta" : "Entrar a mi radar"}
              <ArrowRight size={17} />
            </Button>
          </form>
          <p className="auth-toggle">
            {signup ? "¿Ya tienes una cuenta?" : "¿Primera vez por aquí?"}{" "}
            <button
              className="text-button"
              onClick={() => {
                setSignup(!signup);
                setError("");
              }}
            >
              {signup ? "Inicia sesión" : "Crea tu cuenta"}
            </button>
          </p>
          <div className="or-divider">
            <span />o explora primero
            <span />
          </div>
          <Button
            variant="secondary"
            busy={busy === "demo"}
            disabled={!!busy}
            onClick={async () => {
              setBusy("demo");
              setError("");
              try {
                onSuccess(
                  await api<Session>("/api/auth/demo", {
                    method: "POST",
                    body: "{}",
                  }),
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy("");
              }
            }}
          >
            <Compass size={17} />
            Explorar con datos de ejemplo
          </Button>
          <p className="auth-small">
            La demo usa ejemplos identificados. Puedes crear tu marca y
            descubrir contenido real en cualquier momento.
          </p>
        </div>
      </div>
    </div>
  );
}
