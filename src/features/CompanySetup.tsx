import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileText,
  Globe2,
  Link2,
  ShieldCheck,
} from "lucide-react";
import { api, json } from "../lib/api";
import type { Brand, Segment } from "../lib/types";
import type { Inspection } from "../lib/journey-types";
import { Button, Field } from "../components/ui";
import "./company-setup.css";

type CompanyDraft = {
  name: string;
  industry: string;
  description: string;
  website: string;
  market: string;
  language: string;
  tone: string;
  pillars: string[];
  audience: Segment[];
};
const initialDraft: CompanyDraft = {
  name: "",
  industry: "",
  description: "",
  website: "",
  market: "Latinoamérica",
  language: "es",
  tone: "Claro, cercano y práctico",
  pillars: [],
  audience: [],
};

export function CompanySetup({
  onCreated,
}: {
  onCreated: (brand: Brand) => void;
}) {
  const [step, setStep] = useState(0);
  const [website, setWebsite] = useState("");
  const [links, setLinks] = useState("");
  const [text, setText] = useState("");
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [inspectedInput, setInspectedInput] = useState("");
  const [draft, setDraft] = useState<CompanyDraft>(initialDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Brand | null>(null);
  const alive = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const description = useRef<HTMLTextAreaElement>(null);
  const input = JSON.stringify([website.trim(), links.trim(), text.trim()]);
  const needsDescription =
    inspection !== null &&
    !inspection.evidence.some((item) =>
      ["read", "provided"].includes(item.status),
    );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current
      ?.closest(".company-setup")
      ?.scrollIntoView({ block: "start" });
  }, [step]);
  useEffect(() => {
    if (step === 0 && needsDescription && !busy) description.current?.focus();
  }, [step, needsDescription, busy]);

  const update = <K extends keyof CompanyDraft>(
    key: K,
    value: CompanyDraft[K],
  ) => setDraft((previous) => ({ ...previous, [key]: value }));
  const updateAudience = (key: "name" | "needs", value: string) => {
    setDraft((previous) => {
      const first = previous.audience[0] || {
        id: crypto.randomUUID(),
        name: "",
        role: "",
        stage: "Explorando",
        needs: "",
      };
      return {
        ...previous,
        audience: [
          {
            ...first,
            [key]: value,
            ...(key === "name" ? { role: value } : {}),
          },
          ...previous.audience.slice(1),
        ],
      };
    });
  };

  async function inspect(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api<Inspection>("/api/context/inspect", {
        method: "POST",
        body: json({
          website: website.trim(),
          urls: links
            .split(/[\n,]+/)
            .map((value) => value.trim())
            .filter(Boolean),
          text: text.trim(),
        }),
      });
      if (!alive.current) return;
      setInspection(result);
      setInspectedInput(input);
      setDraft({
        ...initialDraft,
        ...result.draft,
        market: result.draft.market || initialDraft.market,
        language: result.draft.language || initialDraft.language,
        tone: result.draft.tone || initialDraft.tone,
        audience: result.draft.audience.slice(0, 1).map((segment) => ({
          ...segment,
          id: segment.id || crypto.randomUUID(),
        })),
      });
      if (
        result.evidence.some((item) =>
          ["read", "provided"].includes(item.status),
        )
      ) {
        setStep(1);
      }
    } catch (cause) {
      if (alive.current) setError((cause as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    let company = created;
    try {
      if (!company) {
        company = await api<Brand>("/api/brands", {
          method: "POST",
          body: json({
            ...draft,
            goals: ["Crear contenido útil para nuestra audiencia"],
            color: "#137c64",
            weeklyTarget: 3,
          }),
        });
        if (!alive.current) return;
        setCreated(company);
      }
      if (inspection) {
        await api(`/api/brands/${company.id}/context/commit`, {
          method: "POST",
          body: json({ inspectionId: inspection.id }),
        });
      }
      if (alive.current) onCreated(company);
    } catch (cause) {
      if (alive.current)
        setError(
          company
            ? `La empresa ya está creada. No pudimos guardar las fuentes iniciales: ${(cause as Error).message}`
            : (cause as Error).message,
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  return (
    <div className="company-setup">
      <ol className="setup-steps" aria-label="Configurar empresa">
        {["Tu contenido", "Tu empresa", "Tu audiencia"].map((label, index) => (
          <li
            key={label}
            aria-current={step === index ? "step" : undefined}
            className={step >= index ? "reached" : ""}
          >
            <span>{step > index ? <Check size={14} /> : index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      {step === 0 && (
        <form onSubmit={inspect} className="setup-stage">
          <h2 ref={heading} tabIndex={-1}>
            Empieza por lo que ya tienes.
          </h2>
          <p className="setup-description">
            Cuéntanos qué hace tu empresa. Si tienes una web o redes, puedes
            añadirlas para conservarlas como referencia.
          </p>
          <fieldset disabled={busy}>
            <Field
              label="Web de tu empresa (opcional)"
              name="companyWebsite"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              placeholder="tuempresa.com"
              maxLength={2000}
              autoComplete="url"
            />
            {needsDescription && (
              <div className="setup-recovery" role="status">
                <strong>No pudimos leer el contenido de tus enlaces.</strong>
                <p>
                  Los conservaremos como referencia. Pega una descripción o un
                  contenido propio para preparar tu empresa.
                </p>
              </div>
            )}
            <Field label="Descripción de tu empresa">
              <textarea
                ref={description}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Ej. Somos 30X. Ofrecemos formación en ventas e IA para líderes y equipos de Latinoamérica."
                rows={4}
                maxLength={20000}
                aria-describedby="setup-description-help"
              />
            </Field>
            <p id="setup-description-help" className="setup-field-help">
              Incluye el nombre, qué ofreces y a quién ayudas. También puedes
              pegar una publicación propia.
            </p>
            <details className="setup-more">
              <summary>
                <Link2 size={16} /> Añadir redes sociales (opcional)
              </summary>
              <div className="stack">
                <Field label="Instagram, YouTube u otros enlaces públicos">
                  <textarea
                    value={links}
                    onChange={(event) => setLinks(event.target.value)}
                    placeholder="https://instagram.com/tuempresa\nUn enlace por línea"
                    rows={2}
                    maxLength={12000}
                  />
                </Field>
              </div>
            </details>
          </fieldset>
          <p className="setup-note">
            <ShieldCheck size={16} /> Los enlaces se guardan como referencia.
            Solo se leen webs con permiso revisado. Pega contenido propio para
            empezar sin esperar una conexión.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="setup-actions">
            <Button
              variant="primary"
              type="submit"
              busy={busy}
              disabled={
                (!website.trim() && !links.trim() && !text.trim()) ||
                (needsDescription && input === inspectedInput)
              }
            >
              {busy ? "Leyendo tu contenido…" : "Preparar mi empresa"}
              <ArrowRight size={16} />
            </Button>
            <Button
              disabled={busy}
              variant="ghost"
              onClick={() => {
                if (!inspection || input !== inspectedInput) {
                  setInspection(null);
                  setDraft({ ...initialDraft, website: website.trim() });
                }
                setStep(1);
              }}
            >
              Prefiero completarlo a mano
            </Button>
          </div>
          {busy && (
            <div className="setup-loading" role="status">
              <span />
              <p>
                Buscando el contexto de tu empresa. Algunas páginas pueden
                tardar en responder.
              </p>
            </div>
          )}
        </form>
      )}
      {step === 1 && (
        <form
          className="setup-stage"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            setStep(2);
          }}
        >
          <h2 ref={heading} tabIndex={-1}>
            ¿Describe bien a tu empresa?
          </h2>
          <p className="setup-description">
            Esta es una propuesta inicial. Corrige lo que haga falta; tú conoces
            tu empresa.
          </p>
          <div className="form-grid">
            <Field
              label="Nombre de la empresa"
              name="companyName"
              value={draft.name}
              onChange={(event) => update("name", event.target.value)}
              required
              maxLength={120}
            />
            <Field
              label="Sector"
              name="companyIndustry"
              value={draft.industry}
              onChange={(event) => update("industry", event.target.value)}
              placeholder="Educación, salud, comercio…"
              required
              maxLength={150}
            />
          </div>
          <Field label="Qué hace y a quién ayuda">
            <textarea
              value={draft.description}
              onChange={(event) => update("description", event.target.value)}
              rows={3}
              required
              maxLength={4000}
            />
          </Field>
          <Field
            label="Temas de contenido, separados por comas"
            value={draft.pillars.join(", ")}
            onChange={(event) =>
              update(
                "pillars",
                event.target.value.split(",").map((value) => value.trim()),
              )
            }
            placeholder="Ventas, formación de equipos, automatización"
            required
            maxLength={1200}
          />
          <details
            className="setup-more setup-defaults"
            onInvalid={(event) => {
              event.currentTarget.open = true;
            }}
          >
            <summary>Mercado y voz de la marca (opcional)</summary>
            <p className="setup-field-help">
              Empezaremos con {draft.market} y la voz «{draft.tone}». Puedes
              ajustar estos valores ahora o más adelante.
            </p>
            <div className="form-grid">
              <Field
                label="Mercado"
                value={draft.market}
                onChange={(event) => update("market", event.target.value)}
                required
                maxLength={150}
              />
              <Field
                label="Voz de la marca"
                value={draft.tone}
                onChange={(event) => update("tone", event.target.value)}
                required
                maxLength={300}
              />
            </div>
          </details>
          {inspection && (
            <details className="setup-evidence">
              <summary>
                <FileText size={16} /> Ver qué pudimos leer (
                {inspection.evidence.length})
              </summary>
              <ul>
                {inspection.evidence.map((item) => (
                  <li key={item.id}>
                    <span>
                      {item.url ? <Globe2 size={14} /> : <FileText size={14} />}
                    </span>
                    <div>
                      <strong>{item.title}</strong>
                      <small>
                        {item.status === "read"
                          ? "Página leída"
                          : item.status === "provided"
                            ? "Texto que compartiste"
                            : item.status === "linked"
                              ? "Enlace guardado, contenido sin leer"
                              : "No pudimos leer esta página"}
                      </small>
                      {item.reason && <p>{item.reason}</p>}
                    </div>
                  </li>
                ))}
              </ul>
              {inspection.warnings.map((warning) => (
                <p className="setup-note" key={warning}>
                  {warning}
                </p>
              ))}
            </details>
          )}
          <div className="setup-actions">
            <Button variant="ghost" onClick={() => setStep(0)}>
              <ArrowLeft size={16} />
              Atrás
            </Button>
            <Button variant="primary" type="submit">
              Definir mi audiencia
              <ArrowRight size={16} />
            </Button>
          </div>
        </form>
      )}
      {step === 2 && (
        <form className="setup-stage" onSubmit={create}>
          <h2 ref={heading} tabIndex={-1}>
            ¿A quién quieres ayudar?
          </h2>
          <p className="setup-description">
            Comienza con un grupo y una necesidad. Después podrás añadir más y
            contrastarlos con señales públicas.
          </p>
          <fieldset disabled={busy || !!created}>
            <Field
              label="Tu primera audiencia"
              value={draft.audience[0]?.name || ""}
              onChange={(event) => updateAudience("name", event.target.value)}
              placeholder="Ej. Equipos de ventas de empresas medianas"
              required
              maxLength={150}
            />
            <Field label="Qué necesita resolver">
              <textarea
                value={draft.audience[0]?.needs || ""}
                onChange={(event) =>
                  updateAudience("needs", event.target.value)
                }
                placeholder="Ej. Identificar mejores prospectos y preparar conversaciones útiles"
                rows={4}
                required
                maxLength={3000}
              />
            </Field>
          </fieldset>
          <div className="setup-truth">
            <CheckCircle2 size={19} />
            <p>
              Este perfil es una hipótesis que tú confirmas. No hemos
              identificado ni rastreado a personas.
            </p>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="setup-actions">
            <Button
              disabled={busy || !!created}
              variant="ghost"
              onClick={() => setStep(1)}
            >
              <ArrowLeft size={16} />
              Atrás
            </Button>
            <Button variant="primary" type="submit" busy={busy}>
              {created ? "Reintentar guardar fuentes" : "Abrir mi espacio"}
              <ArrowRight size={16} />
            </Button>
          </div>
          {created && error && (
            <Button disabled={busy} onClick={() => onCreated(created)}>
              Continuar y añadir fuentes después
            </Button>
          )}
        </form>
      )}
    </div>
  );
}
