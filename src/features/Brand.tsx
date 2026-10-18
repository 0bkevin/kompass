import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Palette,
  Plus,
  Save,
  Target,
  Trash2,
  Users,
} from "lucide-react";
import { api, json } from "../lib/api";
import { useWorkspace } from "../lib/workspace";
import type { Brand, Segment } from "../lib/types";
import { Badge, Button, EmptyState, Field, Modal } from "../components/ui";
import "./journey.css";

const contentLanguages = [
  { value: "es", label: "Español" },
  { value: "en", label: "Inglés" },
  { value: "pt", label: "Portugués" },
];

function BrandFields({ brand }: { brand?: Brand }) {
  const fieldId = useId();
  return (
    <div className="brand-field-groups">
      <section className="brand-field-group" aria-label="Empresa y mercado">
        <h3>Tu empresa</h3>
        <div className="form-grid">
          <Field
            label="Nombre de la marca"
            name="name"
            defaultValue={brand?.name}
            placeholder="Tu marca o empresa"
            required
            maxLength={100}
          />
          <Field
            label="Sector o industria"
            name="industry"
            defaultValue={brand?.industry}
            placeholder="Tecnología, finanzas, salud…"
            required
            maxLength={150}
          />
        </div>
        <Field label="¿Qué hace tu marca y qué la diferencia?">
          <textarea
            name="description"
            defaultValue={brand?.description}
            placeholder="Qué ofreces, a quién ayudas y qué necesitas explicar."
            required
            rows={3}
            maxLength={4000}
          />
        </Field>
        <div className="form-grid">
          <Field label="Mercado principal">
            <input
              name="market"
              defaultValue={brand?.market ?? "Latinoamérica"}
              list={`${fieldId}-markets`}
              maxLength={150}
              aria-describedby={`${fieldId}-market-hint`}
            />
            <datalist id={`${fieldId}-markets`}>
              {[
                "Latinoamérica",
                "México",
                "Colombia",
                "Argentina",
                "Chile",
                "Perú",
                "Venezuela",
                "España",
                "Estados Unidos",
                "Global",
              ].map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <small className="small muted" id={`${fieldId}-market-hint`}>
              Escribe un país, una región o el mercado de tu empresa.
            </small>
          </Field>
          <Field label="Idioma del contenido">
            <input
              name="language"
              defaultValue={
                contentLanguages.find(
                  (option) => option.value === brand?.language,
                )?.label ||
                brand?.language ||
                "Español"
              }
              list={`${fieldId}-languages`}
              maxLength={100}
              aria-describedby={`${fieldId}-language-hint`}
            />
            <datalist id={`${fieldId}-languages`}>
              {contentLanguages.map((option) => (
                <option key={option.value} value={option.label} />
              ))}
            </datalist>
            <small className="small muted" id={`${fieldId}-language-hint`}>
              Elige una sugerencia o escribe otro idioma.
            </small>
          </Field>
        </div>
      </section>
      <section className="brand-field-group" aria-label="Dirección editorial">
        <h3>Tu dirección editorial</h3>
        <Field
          label="Temas a explorar · separados por comas"
          name="pillars"
          defaultValue={brand?.pillars.join(", ")}
          placeholder="artificial intelligence, leadership, automation"
          required
        />
        <p className="field-hint">
          Incluye palabras en inglés para descubrir conversaciones en otros
          mercados. Podrás afinar cada fuente.
        </p>
        <div className="form-grid">
          <Field
            label="Voz y tono"
            name="tone"
            defaultValue={brand?.tone || "Claro, cercano y práctico"}
            required
          />
          <Field
            label="Objetivo editorial"
            name="goals"
            defaultValue={
              brand?.goals.join(", ") || "Educar, generar conversación"
            }
            required
          />
        </div>
      </section>
      <section
        className="brand-field-group"
        aria-label="Identidad y ritmo de trabajo"
      >
        <h3>Identidad y ritmo de trabajo</h3>
        <div className="form-grid">
          <Field
            label="Color principal"
            name="color"
            type="color"
            defaultValue={brand?.color || "#bea5f5"}
          />
          <Field
            label="Piezas por semana"
            name="weeklyTarget"
            type="number"
            defaultValue={brand?.weeklyTarget || 4}
            min={1}
            max={50}
          />
        </div>
        <Field
          label="Sitio web (opcional)"
          name="website"
          type="url"
          defaultValue={brand?.website}
          placeholder="https://tumarca.com"
        />
      </section>
    </div>
  );
}

function languageOption(language?: string) {
  return (
    contentLanguages.find((option) => option.label === language)?.value ||
    language ||
    "es"
  );
}

type BrandInput = Pick<
  Brand,
  | "name"
  | "industry"
  | "description"
  | "market"
  | "language"
  | "tone"
  | "color"
  | "website"
  | "weeklyTarget"
  | "goals"
  | "pillars"
>;

function brandInput(form: HTMLFormElement): BrandInput {
  const d = new FormData(form);
  return {
    name: String(d.get("name") || ""),
    industry: String(d.get("industry") || ""),
    description: String(d.get("description") || ""),
    market: String(d.get("market") || ""),
    language: languageOption(String(d.get("language") || "")),
    tone: String(d.get("tone") || ""),
    color: String(d.get("color") || ""),
    website: String(d.get("website") || ""),
    weeklyTarget: Number(d.get("weeklyTarget")),
    goals: String(d.get("goals") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    pillars: String(d.get("pillars") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

function brandPatchInput(
  form: HTMLFormElement,
  baseline: Brand,
): Partial<BrandInput> {
  const input = brandInput(form);
  const keys: (keyof BrandInput)[] = [
    "name",
    "industry",
    "description",
    "market",
    "language",
    "tone",
    "color",
    "website",
    "weeklyTarget",
    "goals",
    "pillars",
  ];
  return Object.fromEntries(
    keys
      .filter(
        (key) =>
          JSON.stringify(input[key]) !==
          JSON.stringify(
            key === "language"
              ? languageOption(baseline.language)
              : baseline[key],
          ),
      )
      .map((key) => [key, input[key]]),
  ) as Partial<BrandInput>;
}

export function NewBrandForm({ onCreated }: { onCreated: (b: Brand) => void }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const input = brandInput(e.currentTarget);
        const f = new FormData(e.currentTarget);
        const audienceName = String(f.get("audienceName") || "").trim();
        setBusy(true);
        setError("");
        try {
          const b = await api<Brand>("/api/brands", {
            method: "POST",
            body: json({
              ...input,
              audience: audienceName
                ? [
                    {
                      id: crypto.randomUUID(),
                      name: audienceName,
                      role: audienceName,
                      stage: "Explorando",
                      needs: String(f.get("audienceNeeds") || ""),
                    },
                  ]
                : [],
            }),
          });
          onCreated(b);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <BrandFields />
      <div className="form-section">
        <h3>
          <Users size={17} />
          ¿Para quién creas?
        </h3>
        <Field
          label="Tu primera audiencia"
          name="audienceName"
          placeholder="Ej. Directivos de empresas medianas"
          required
        />
        <Field
          label="¿Qué necesita esa audiencia?"
          name="audienceNeeds"
          placeholder="Ej. Entender cómo aplicar IA en su negocio"
          required
        />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Button variant="primary" type="submit" busy={busy}>
        Crear espacio de marca
        <ArrowRight size={17} />
      </Button>
    </form>
  );
}

export function BrandPage() {
  const { state, refresh, notify, registerUnsavedChangesGuard } =
    useWorkspace();
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const brand = state.brand;
  const [baseline, setBaseline] = useState(brand);
  const [fieldRevision, setFieldRevision] = useState(0);
  const dirtyRef = useRef(false);
  const busyRef = useRef(false);
  const notifyRef = useRef(notify);
  const lastBrandRef = useRef(brand);
  notifyRef.current = notify;
  const guardRef = useRef({
    isDirty: () => dirtyRef.current,
    confirmLeave: () => {
      if (busyRef.current) {
        notifyRef.current(
          "Espera a que termine el guardado antes de salir.",
          "error",
        );
        return false;
      }
      return window.confirm(
        "Hay cambios sin guardar en el contexto de la marca. ¿Salir y descartarlos?",
      );
    },
  });
  useEffect(
    () => registerUnsavedChangesGuard(guardRef.current),
    [registerUnsavedChangesGuard],
  );
  useEffect(() => {
    if (lastBrandRef.current === brand) return;
    lastBrandRef.current = brand;
    if (dirtyRef.current || busyRef.current) return;
    setBaseline(brand);
    setFieldRevision((revision) => revision + 1);
  }, [brand]);
  return (
    <div className="page brand-page">
      <div className="page-heading">
        <div>
          <h1>El contexto de tu marca.</h1>
          <p>
            Define tus temas, objetivos y voz para evaluar qué contenido encaja
            con tu empresa.
          </p>
        </div>
        <Badge tone="green">
          <Check size={13} />
          Contexto activo
        </Badge>
      </div>
      <div className="brand-layout">
        <section className="card form-card">
          <div className="section-heading">
            <h2>Identidad y dirección editorial</h2>
            <Palette size={19} />
          </div>
          <form
            className="stack"
            key={brand.id}
            onChangeCapture={(event) => {
              const nextDirty =
                Object.keys(brandPatchInput(event.currentTarget, baseline))
                  .length > 0;
              dirtyRef.current = nextDirty;
              setDirty(nextDirty);
            }}
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const input = brandPatchInput(form, baseline);
              if (!Object.keys(input).length) return;
              setBusy(true);
              busyRef.current = true;
              try {
                const saved = await api<Brand>(`/api/brands/${brand.id}`, {
                  method: "PATCH",
                  body: json(input),
                });
                setBaseline(saved);
                setFieldRevision((revision) => revision + 1);
                dirtyRef.current = false;
                setDirty(false);
                try {
                  await refresh();
                  notify(
                    "Contexto actualizado. Tus próximos análisis usarán estos criterios.",
                  );
                } catch (refreshError) {
                  notify(
                    `El contexto se guardó, pero no se pudo actualizar el espacio: ${(refreshError as Error).message}`,
                    "error",
                  );
                }
              } catch (e) {
                notify((e as Error).message, "error");
              } finally {
                busyRef.current = false;
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={brand.role !== "owner" || busy}>
              <BrandFields key={fieldRevision} brand={baseline} />
            </fieldset>
            <Button
              type="submit"
              variant="primary"
              busy={busy}
              disabled={brand.role !== "owner" || busy || !dirty}
            >
              <Save size={16} />
              Guardar contexto
            </Button>
          </form>
        </section>
        <aside>
          <div className="brand-preview">
            <div className="brand-preview-identity">
              <div className="brand-monogram">{brand.name.slice(0, 1)}</div>
              <span
                className="brand-color-swatch"
                style={{ background: brand.color || "#bea5f5" }}
                role="img"
                aria-label={`Color de marca: ${brand.color || "#bea5f5"}`}
              />
            </div>
            <h2>{brand.name}</h2>
            <p>
              {brand.industry} · {brand.market}
            </p>
            <div className="brand-preview-topics">
              {brand.pillars.map((p) => (
                <span key={p}>{p}</span>
              ))}
            </div>
          </div>
          <div className="insight-card">
            <Target size={22} />
            <h3>Qué hace relevante una referencia</h3>
            <p className="muted">
              Cada análisis compara la referencia con tus temas, audiencia y
              objetivos. Si cambias el contexto, actualiza el análisis de las
              referencias que quieras volver a evaluar.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function AudiencePage() {
  const { state, refresh, notify, registerUnsavedChangesGuard } =
    useWorkspace();
  const [editing, setEditing] = useState<Segment | null | undefined>(undefined),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [invalidField, setInvalidField] = useState<string | null>(null);
  const audienceFormRef = useRef<HTMLFormElement | null>(null);
  const audienceBaselineRef = useRef("");
  const audienceBusyRef = useRef(false);
  const setAudienceForm = useCallback((form: HTMLFormElement | null) => {
    audienceFormRef.current = form;
    audienceBaselineRef.current = form
      ? JSON.stringify([...new FormData(form).entries()])
      : "";
  }, []);
  const audienceGuardRef = useRef({
    isDirty: () => {
      const form = audienceFormRef.current;
      return (
        !!form &&
        (audienceBusyRef.current ||
          JSON.stringify([...new FormData(form).entries()]) !==
            audienceBaselineRef.current)
      );
    },
    confirmLeave: () => {
      if (audienceBusyRef.current) return false;
      const form = audienceFormRef.current;
      if (
        form &&
        JSON.stringify([...new FormData(form).entries()]) !==
          audienceBaselineRef.current &&
        !window.confirm(
          "Hay cambios sin guardar. ¿Salir y descartar este perfil?",
        )
      )
        return false;
      audienceFormRef.current = null;
      audienceBaselineRef.current = "";
      setEditing(undefined);
      return true;
    },
  });
  useEffect(
    () => registerUnsavedChangesGuard(audienceGuardRef.current),
    [registerUnsavedChangesGuard],
  );
  function startEditing(segment: Segment | null) {
    if (audienceBusyRef.current) return;
    if (audienceFormRef.current && !audienceGuardRef.current.confirmLeave())
      return;
    setError("");
    setInvalidField(null);
    setEditing(segment);
  }
  function closeEditing() {
    audienceGuardRef.current.confirmLeave();
  }
  async function save(audience: Segment[]) {
    if (audienceBusyRef.current) return;
    audienceBusyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await api(`/api/brands/${state.brand.id}`, {
        method: "PATCH",
        body: json({ audience }),
      });
      audienceFormRef.current = null;
      audienceBaselineRef.current = "";
      setEditing(undefined);
    } catch (e) {
      setError((e as Error).message);
      audienceBusyRef.current = false;
      setBusy(false);
      return;
    }
    try {
      await refresh();
      notify("Audiencias actualizadas.");
    } catch (e) {
      notify(
        `Las audiencias se guardaron, pero no se pudo actualizar el espacio: ${(e as Error).message}`,
        "error",
      );
    } finally {
      audienceBusyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="page audience-page">
      <div className="page-heading">
        <div>
          <h1>¿A quién quieres llegar?</h1>
          <p>
            Define qué necesita cada grupo para elegir temas y escribir guiones
            que respondan a esa necesidad.
          </p>
        </div>
        <Button
          variant="primary"
          disabled={state.brand.role !== "owner"}
          onClick={() => startEditing(null)}
        >
          <Plus size={17} />
          Nueva audiencia
        </Button>
      </div>
      {state.brand.audience.length ? (
        <div className="audience-profile-list">
          {state.brand.audience.map((s) => (
            <article className="audience-profile" key={s.id}>
              <div className="audience-profile-identity">
                <span className="audience-profile-icon">
                  <Users size={20} />
                </span>
                <div>
                  <h2>{s.name}</h2>
                  <p className="audience-profile-role">{s.role}</p>
                  <Badge>{s.stage}</Badge>
                </div>
              </div>
              <div className="audience-profile-need">
                <h3>Qué necesita resolver</h3>
                <p>{s.needs}</p>
              </div>
              <div className="audience-profile-actions">
                <small>
                  {state.pieces.filter((p) => p.segmentId === s.id).length}{" "}
                  piezas dirigidas
                </small>
                <button
                  className="text-button"
                  disabled={state.brand.role !== "owner"}
                  onClick={() => startEditing(s)}
                >
                  Editar perfil <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Users />}
          title="Define a quién debe ayudar tu contenido"
          action={
            <Button
              onClick={() => startEditing(null)}
              disabled={state.brand.role !== "owner"}
            >
              Crear mi primera audiencia
            </Button>
          }
        >
          Describe qué decisiones toma ese grupo y qué necesita resolver.
          Usaremos ese contexto para evaluar referencias y proponer enfoques.
        </EmptyState>
      )}
      <div className="callout audience-note">
        <Users size={20} />
        <p>
          Estos perfiles representan grupos de audiencia. Puedes actualizarlos
          cuando cambien sus necesidades; no rastrean personas ni datos
          individuales.
        </p>
      </div>
      {editing !== undefined && (
        <Modal
          title={editing ? "Afinar audiencia" : "Una nueva audiencia"}
          onClose={closeEditing}
        >
          <form
            ref={setAudienceForm}
            className="stack"
            aria-busy={busy}
            onChangeCapture={() => {
              setError("");
              setInvalidField(null);
            }}
            onSubmit={(e) => {
              e.preventDefault();
              if (audienceBusyRef.current) return;
              const form = e.currentTarget,
                f = new FormData(form),
                segment = {
                  ...editing,
                  id: editing?.id || crypto.randomUUID(),
                  name: String(f.get("name") ?? "").trim(),
                  role: String(f.get("role") ?? "").trim(),
                  stage: String(f.get("stage") ?? "").trim(),
                  needs: String(f.get("needs") ?? "").trim(),
                };
              for (const [field, label, max] of [
                ["name", "Nombre del perfil", 150],
                ["role", "Rol o responsabilidad", 300],
                ["needs", "Necesidades e intereses", 3000],
              ] as const) {
                if (!segment[field] || segment[field].length > max) {
                  setError(
                    !segment[field]
                      ? `«${label}» es obligatorio. Escribe texto, no solo espacios.`
                      : `«${label}» admite hasta ${max} caracteres. Acorta el texto para guardar.`,
                  );
                  setInvalidField(field);
                  const input = form.elements.namedItem(field);
                  if (input instanceof HTMLElement) input.focus();
                  return;
                }
              }
              setInvalidField(null);
              void save(
                editing
                  ? state.brand.audience.map((s) =>
                      s.id === editing.id ? segment : s,
                    )
                  : [...state.brand.audience, segment],
              );
            }}
          >
            <fieldset disabled={busy} className="stack">
              <Field
                label="Nombre del perfil"
                name="name"
                defaultValue={editing?.name}
                placeholder="Ej. Líder de operaciones"
                aria-invalid={invalidField === "name" || undefined}
                aria-describedby={
                  invalidField === "name" ? "audience-profile-error" : undefined
                }
                required
              />
              <Field
                label="Rol o responsabilidad"
                name="role"
                defaultValue={editing?.role}
                placeholder="¿Qué decisiones toma?"
                aria-invalid={invalidField === "role" || undefined}
                aria-describedby={
                  invalidField === "role" ? "audience-profile-error" : undefined
                }
                required
              />
              <Field label="Momento o etapa">
                <select
                  name="stage"
                  defaultValue={editing?.stage || "Explorando"}
                >
                  {[
                    "Explorando",
                    "Aprendiendo",
                    "Probando",
                    "Implementando",
                    "Escalando",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label="Necesidades e intereses">
                <textarea
                  name="needs"
                  defaultValue={editing?.needs}
                  placeholder="¿Qué le ayudaría a avanzar?"
                  rows={4}
                  aria-invalid={invalidField === "needs" || undefined}
                  aria-describedby={
                    invalidField === "needs"
                      ? "audience-profile-error"
                      : undefined
                  }
                  required
                />
              </Field>
              {error && (
                <p
                  id="audience-profile-error"
                  className="form-error"
                  role="alert"
                >
                  {error}
                </p>
              )}
            </fieldset>
            <div className="modal-actions">
              {editing && (
                <Button
                  variant="danger"
                  type="button"
                  busy={busy}
                  onClick={() =>
                    void save(
                      state.brand.audience.filter((s) => s.id !== editing.id),
                    )
                  }
                >
                  <Trash2 size={15} />
                  Eliminar
                </Button>
              )}
              <Button type="button" onClick={closeEditing} disabled={busy}>
                Cancelar
              </Button>
              <Button variant="primary" type="submit" busy={busy}>
                Guardar perfil
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
