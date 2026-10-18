import { useEffect, useRef, useState } from "react";
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

function BrandFields({ brand }: { brand?: Brand }) {
  return (
    <>
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
          placeholder="Ayudamos a… con una perspectiva…"
          required
          rows={3}
          maxLength={4000}
        />
      </Field>
      <div className="form-grid">
        <Field label="Mercado principal">
          <select name="market" defaultValue={brand?.market || "Latinoamérica"}>
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
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="Idioma del contenido">
          <select
            name="language"
            defaultValue={languageOption(brand?.language)}
          >
            <option value="es">Español</option>
            <option value="en">Inglés</option>
            <option value="pt">Portugués</option>
          </select>
        </Field>
      </div>
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
      <div className="form-grid">
        <Field
          label="Color principal"
          name="color"
          type="color"
          defaultValue={brand?.color || "#147d65"}
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
    </>
  );
}

function languageOption(language?: string) {
  const options: Record<string, string> = {
    Español: "es",
    Inglés: "en",
    Portugués: "pt",
  };
  return options[language || ""] || language || "es";
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
    language: String(d.get("language") || ""),
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
        notifyRef.current("Espera a que termine el guardado antes de salir.", "error");
        return false;
      }
      return window.confirm(
        "Hay cambios sin guardar en el ADN de la marca. ¿Salir y descartarlos?",
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
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ANTES DEL CONTENIDO, TU CRITERIO</p>
          <h1>El ADN de tu marca.</h1>
          <p>
            El contexto que convierte tendencias genéricas en oportunidades
            propias.
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
          <div
            className="brand-preview"
            style={{ background: brand.color || "#147d65" }}
          >
            <span className="eyebrow">ASÍ TE VE EL RADAR</span>
            <div className="brand-monogram">{brand.name.slice(0, 1)}</div>
            <h2>{brand.name}</h2>
            <p>
              {brand.industry} · {brand.market}
            </p>
            <div>
              {brand.pillars.map((p) => (
                <span key={p}>{p}</span>
              ))}
            </div>
          </div>
          <div className="insight-card">
            <Target size={22} />
            <h3>
              Un contexto más preciso.
              <br />
              Mejores oportunidades.
            </h3>
            <p className="muted">
              La relevancia se compara con tus temas, audiencia y objetivos.
              Cambiar tu contexto no reescribe análisis anteriores: puedes
              actualizarlos desde cada referencia.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function AudiencePage() {
  const { state, refresh, notify } = useWorkspace();
  const [editing, setEditing] = useState<Segment | null | undefined>(undefined),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const audienceDirtyRef = useRef(false);
  function startEditing(segment: Segment | null) {
    audienceDirtyRef.current = false;
    setError("");
    setEditing(segment);
  }
  function closeEditing() {
    if (busy) return;
    if (
      audienceDirtyRef.current &&
      !window.confirm("Hay cambios sin guardar. ¿Cerrar y descartarlos?")
    )
      return;
    audienceDirtyRef.current = false;
    setEditing(undefined);
  }
  async function save(audience: Segment[]) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/brands/${state.brand.id}`, {
        method: "PATCH",
        body: json({ audience }),
      });
      audienceDirtyRef.current = false;
      setEditing(undefined);
    } catch (e) {
      setError((e as Error).message);
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
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">LA MISMA TENDENCIA, DIFERENTES NECESIDADES</p>
          <h1>¿A quién quieres llegar?</h1>
          <p>
            Perfiles editoriales que dan dirección a tus referencias, enfoques y
            guiones.
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
        <div className="audience-grid">
          {state.brand.audience.map((s, i) => (
            <article className="card audience-card" key={s.id}>
              <div className="row">
                <span className={`audience-avatar av-${i % 3}`}>
                  <Users size={25} />
                </span>
                <Badge>{s.stage}</Badge>
              </div>
              <h2>{s.name}</h2>
              <p className="audience-role">{s.role}</p>
              <p>{s.needs}</p>
              <div className="audience-card-footer">
                <small>
                  {state.pieces.filter((p) => p.segmentId === s.id).length}{" "}
                  piezas dirigidas
                </small>
                <button
                  className="text-button"
                  disabled={state.brand.role !== "owner"}
                  onClick={() => startEditing(s)}
                >
                  Editar perfil →
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Users />}
          title="Una audiencia concreta cambia el contenido"
          action={
            <Button
              onClick={() => startEditing(null)}
              disabled={state.brand.role !== "owner"}
            >
              Crear mi primera audiencia
            </Button>
          }
        >
          Define roles, momento de adopción y necesidades. El análisis podrá
          recomendar enfoques más cercanos.
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
            className="stack"
            onChangeCapture={() => {
              audienceDirtyRef.current = true;
              setError("");
            }}
            onSubmit={(e) => {
              e.preventDefault();
              if (busy) return;
              const f = new FormData(e.currentTarget),
                segment = {
                  id: editing?.id || crypto.randomUUID(),
                  name: String(f.get("name")),
                  role: String(f.get("role")),
                  stage: String(f.get("stage")),
                  needs: String(f.get("needs")),
                };
              void save(
                editing
                  ? state.brand.audience.map((s) =>
                      s.id === editing.id ? segment : s,
                    )
                  : [...state.brand.audience, segment],
              );
            }}
          >
            <fieldset
              disabled={busy}
              className="stack"
              style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}
            >
              <Field
                label="Nombre del perfil"
                name="name"
                defaultValue={editing?.name}
                placeholder="Ej. Líder de operaciones"
                required
              />
              <Field
                label="Rol o responsabilidad"
                name="role"
                defaultValue={editing?.role}
                placeholder="¿Qué decisiones toma?"
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
                  required
                />
              </Field>
              {error && (
                <p className="form-error" role="alert">
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
