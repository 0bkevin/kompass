import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  FileText,
  Focus,
  Globe2,
  Layers3,
  LoaderCircle,
  MessageSquare,
  Play,
  Users,
} from "lucide-react";
import { api } from "../../lib/api";
import type { Session } from "../../lib/types";
import "../../landing.css";

const stages = [
  {
    label: "Audiencia",
    icon: Users,
    title: "Elige a quién va dirigido el contenido.",
    description:
      "Un equipo pequeño quiere empezar a usar IA, pero no sabe qué tarea elegir ni qué debe revisar.",
    detail:
      "Necesidad propuesta por el equipo, pendiente de contrastar con fuentes.",
    output: "Ayudar al equipo a elegir su primera tarea con IA.",
    outputLabel: "Objetivo editorial",
  },
  {
    label: "Evidencia",
    icon: Globe2,
    title: "Una referencia que puedes contrastar.",
    description:
      "La guía de alfabetización en IA de la Comisión Europea propone considerar el contexto, los conocimientos y los riesgos de cada equipo.",
    detail:
      "Una fuente aporta contexto. Por sí sola no demuestra demanda ni anticipa resultados.",
    output: "Comisión Europea · Alfabetización en IA",
    outputLabel: "Fuente pública real",
  },
  {
    label: "Enfoque",
    icon: Focus,
    title: "Prepara una guía para elegir esa primera tarea.",
    description:
      "“Tu primera tarea con IA: elige algo pequeño, define qué revisar y prueba con un ejemplo.”",
    detail:
      "Hipótesis editorial para una empresa de formación. El equipo decide si merece producirse.",
    output: "Una guía para elegir y probar una tarea con IA.",
    outputLabel: "Enfoque original propuesto",
  },
  {
    label: "Guion",
    icon: FileText,
    title: "Revisa el guion con tu equipo.",
    description:
      "“Antes de elegir una herramienta, elige una tarea. Prueba con material de ejemplo y acuerda qué revisará una persona antes de usar el resultado.”",
    detail:
      "Borrador de ejemplo. El equipo comenta y aprueba la versión que va a programar.",
    output: "Guion → revisión del equipo → calendario",
    outputLabel: "Siguiente paso",
  },
];

const faqs = [
  {
    question: "¿Con qué puede empezar mi equipo?",
    answer:
      "Crea tu cuenta y añade la web de tu empresa, enlaces públicos o un texto propio. Revisa la información y define a quién va dirigido tu contenido y qué necesita resolver.",
  },
  {
    question: "¿Necesito conectar mis redes sociales?",
    answer:
      "Puedes escribir, revisar, planificar y exportar sin conectar redes. YouTube dispone de descubrimiento público y contadores oficiales que se actualizan cada hora mientras el servidor está activo. Instagram, LinkedIn y TikTok todavía no tienen conexión oficial; sus resultados se pueden registrar manualmente.",
  },
  {
    question: "¿El calendario publica por mí?",
    answer:
      "El calendario organiza fechas y permite exportar el plan. Para publicar el contenido en una red social debes hacerlo aparte.",
  },
  {
    question: "¿Puedo crear imágenes y videos?",
    answer:
      "Studio permite crear imágenes y componer videos MP4 con ilustración, movimiento y subtítulos cuando el servicio está habilitado. Los videos no incluyen audio ni metraje de movimiento generado. Tu equipo revisa los recursos antes de añadirlos a una pieza.",
  },
  {
    question: "¿Qué voy a encontrar en la demo?",
    answer:
      "Un espacio con datos de ejemplo identificados para recorrer la plataforma. No son clientes, audiencias ni resultados reales. Si ya tienes sesión, el botón de demo abre tu espacio actual para que puedas continuar sin cambiar de cuenta.",
  },
];

export function KompassMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="30"
      height="30"
      viewBox="0 0 30 30"
      fill="none"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="11" height="11" rx="2" fill="currentColor" />
      <rect
        x="18"
        y="1"
        width="11"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="1"
        y="18"
        width="11"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect x="18" y="18" width="11" height="11" rx="2" fill="currentColor" />
      <path
        d="m10 10 10 10M10 20l10-10"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function SignalAperture() {
  return (
    <svg
      className="lp-aperture"
      viewBox="0 0 1440 650"
      fill="none"
      aria-hidden="true"
    >
      <g stroke="#3d315b" strokeWidth="1">
        <path d="M0 110h112v112h112v112h112M1440 110h-112v112h-112v112h-112" />
        <path d="M0 222h112v112h112v112h112M1440 222h-112v112h-112v112h-112" />
        <path d="M0 334h112v112h112v112h112M1440 334h-112v112h-112v112h-112" />
      </g>
      {[0, 1, 2, 3].map((row) => (
        <g key={row} className={`lp-aperture-row lp-aperture-row-${row}`}>
          <rect
            x={row % 2 ? 36 : -20}
            y={52 + row * 112}
            width="104"
            height="104"
            rx="4"
            fill={row === 1 ? "#6e46bc" : "#20192f"}
          />
          <rect
            x={row % 2 ? 1320 : 1376}
            y={52 + row * 112}
            width="104"
            height="104"
            rx="4"
            fill={row === 2 ? "#513189" : "#20192f"}
          />
          <path
            d={`M${row % 2 ? 50 : -6} ${78 + row * 112}h76m-76 12h76m-76 12h76m-76 12h76m-76 12h76`}
            stroke="#9c79d9"
            strokeOpacity=".24"
          />
          <path
            d={`M${row % 2 ? 1334 : 1390} ${78 + row * 112}h76m-76 12h76m-76 12h76m-76 12h76m-76 12h76`}
            stroke="#9c79d9"
            strokeOpacity=".24"
          />
        </g>
      ))}
      <g stroke="#b99ae9" strokeOpacity=".5">
        <rect x="100" y="48" width="24" height="24" rx="3" />
        <rect x="1316" y="384" width="24" height="24" rx="3" />
        <path d="M210 109h12m-6-6v12M1230 221h12m-6-6v12" />
      </g>
    </svg>
  );
}

function EditorialExample() {
  const [selected, setSelected] = useState(1);
  const [pointerMotion, setPointerMotion] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const stage = stages[selected];

  function selectStage(index: number, animate: boolean) {
    if (index === selected) return;
    setPointerMotion(animate);
    setSelected(index);
  }

  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % stages.length;
    else if (event.key === "ArrowLeft")
      next = (index + stages.length - 1) % stages.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = stages.length - 1;
    else return;
    event.preventDefault();
    selectStage(next, false);
    tabs.current[next]?.focus();
  }

  return (
    <figure className="lp-example" id="ejemplo">
      <figcaption className="lp-example-heading">
        <span>
          <KompassMark /> De una pregunta al guion
        </span>
        <span className="lp-example-label">Ejemplo ilustrativo</span>
      </figcaption>
      <div
        className="lp-stage-tabs"
        role="tablist"
        aria-label="Pasos de un ejemplo editorial"
        data-pointer-motion={pointerMotion}
      >
        {stages.map(({ label, icon: Icon }, index) => (
          <button
            key={label}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            id={`lp-tab-${index}`}
            role="tab"
            type="button"
            aria-selected={selected === index}
            aria-controls="lp-example-panel"
            tabIndex={selected === index ? 0 : -1}
            onKeyDown={(event) => moveTab(event, index)}
            onClick={(event) => selectStage(index, event.detail > 0)}
          >
            <span className="lp-stage-number">{index + 1}</span>
            <Icon size={16} />
            {label}
            {index < stages.length - 1 && (
              <ArrowRight className="lp-stage-arrow" size={14} />
            )}
          </button>
        ))}
      </div>
      <div className="lp-example-body">
        <div className="lp-need">
          <span className="lp-small-label">
            <Users size={15} /> Necesidad propuesta
          </span>
          <p>“Queremos empezar con IA. ¿Por dónde empezamos?”</p>
          <span className="lp-need-caption">
            Equipo de una empresa de formación · Ejemplo
          </span>
          <div className="lp-need-connector" aria-hidden="true">
            <span />
            <ArrowRight size={18} />
          </div>
        </div>
        <div
          className="lp-stage-content"
          id="lp-example-panel"
          role="tabpanel"
          aria-labelledby={`lp-tab-${selected}`}
          tabIndex={0}
        >
          <h2>{stage.title}</h2>
          <p>{stage.description}</p>
          <div className="lp-example-output">
            <span className="lp-small-label">{stage.outputLabel}</span>
            {selected === 1 ? (
              <a
                href="https://digital-strategy.ec.europa.eu/en/faqs/ai-literacy-questions-answers"
                target="_blank"
                rel="noreferrer"
              >
                {stage.output} <ArrowUpRight size={16} />
                <span className="lp-sr-only"> (abre en otra pestaña)</span>
              </a>
            ) : (
              <strong>{stage.output}</strong>
            )}
          </div>
          <p className="lp-example-detail">{stage.detail}</p>
        </div>
      </div>
      <div className="lp-example-foot">
        <Check size={14} />
        <span>Tu equipo revisa la fuente y decide qué escribir.</span>
        <a href="#como-funciona">
          Sigue el recorrido <ArrowDown size={14} />
        </a>
      </div>
    </figure>
  );
}

function ReviewVisual() {
  return (
    <div
      className="lp-review-visual"
      aria-label="Ejemplo ilustrativo de revisión de un guion"
    >
      <div className="lp-visual-top">
        <FileText size={16} />
        <span>Tu primera tarea con IA</span>
        <span className="lp-status">En revisión</span>
      </div>
      <div className="lp-manuscript">
        <span>Guion · Ejemplo ilustrativo</span>
        <p>
          Antes de elegir una herramienta,
          <br />
          elige una tarea.
        </p>
        <div className="lp-script-line" />
        <div className="lp-script-line lp-script-line-short" />
        <div className="lp-review-note">
          <MessageSquare size={17} />
          <p>¿Sumamos un ejemplo que el equipo pueda probar?</p>
        </div>
      </div>
      <div className="lp-review-footer">
        <span className="lp-review-check">
          <Check size={14} /> Contexto y fuente conservados
        </span>
        <Layers3 size={18} />
      </div>
    </div>
  );
}

function CalendarVisual() {
  const days = ["Lun", "Mar", "Mié", "Jue", "Vie"];
  return (
    <div
      className="lp-calendar-visual"
      aria-label="Ejemplo ilustrativo de un plan editorial semanal"
    >
      <div className="lp-visual-top">
        <span>Plan de contenido</span>
        <span className="lp-calendar-period">Semana de ejemplo</span>
      </div>
      <div className="lp-calendar-days">
        {days.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="lp-calendar-grid">
        <div className="lp-calendar-entry lp-entry-one">
          <FileText size={15} />
          <span>Tu primera tarea con IA</span>
          <small>
            <Check size={12} /> Aprobado
          </small>
        </div>
        <div className="lp-calendar-entry lp-entry-two">
          <Play size={15} />
          <span>Un ejemplo, paso a paso</span>
          <small>En revisión</small>
        </div>
      </div>
      <div className="lp-calendar-bottom">
        <ArrowRight size={16} />
        <span>Fechas y estado de cada contenido</span>
      </div>
    </div>
  );
}

export function LandingPage() {
  const router = useRouter();
  const demoInFlight = useRef(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState("");
  const [activeFaq, setActiveFaq] = useState<number | null>(0);

  async function openDemo() {
    if (demoInFlight.current) return;
    demoInFlight.current = true;
    setDemoBusy(true);
    setDemoError("");
    try {
      // Keep returning members in their own workspace; only anonymous visitors create a demo session.
      const session = await api<Session>("/api/session");
      if (!session.user)
        await api<Session>("/api/auth/demo", { method: "POST", body: "{}" });
      await router.navigate({ to: "/home" });
    } catch {
      setDemoError(
        "No pudimos abrir la demo. Inténtalo de nuevo o entra con tu cuenta.",
      );
      demoInFlight.current = false;
      setDemoBusy(false);
    }
  }

  const signup = (
    <Link
      to="/home"
      search={{ auth: "signup" }}
      className="lp-button lp-button-primary"
    >
      Crear mi cuenta <ArrowRight size={16} />
    </Link>
  );

  return (
    <div className="lp-page">
      <a className="lp-skip" href="#contenido">
        Saltar al contenido
      </a>
      <header className="lp-header">
        <div className="lp-container lp-header-inner">
          <a className="lp-brand" href="/" aria-label="kompass, inicio">
            <KompassMark />
            <span>kompass</span>
          </a>
          <nav className="lp-nav" aria-label="Navegación principal">
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#para-tu-equipo">Para tu equipo</a>
            <a href="#preguntas">Preguntas</a>
          </nav>
          <div className="lp-header-actions">
            <Link className="lp-login" to="/home" search={{ auth: "login" }}>
              Iniciar sesión
            </Link>
            <Link
              to="/home"
              search={{ auth: "signup" }}
              className="lp-button lp-button-small"
            >
              Crear cuenta <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>
      </header>
      <main id="contenido">
        <section className="lp-hero" aria-labelledby="lp-hero-title">
          <div className="lp-container lp-hero-copy">
            <h1 id="lp-hero-title">
              Le damos dirección
              <br />
              <span>a tu contenido.</span>
            </h1>
            <p>
              Entre tantas ideas, cuesta elegir qué publicar. Parte de las
              preguntas de tu audiencia, revisa las fuentes y prepara un guion
              con tu equipo.
            </p>
            <div className="lp-actions">
              {signup}
              <button
                className="lp-button lp-button-secondary"
                type="button"
                onClick={openDemo}
                disabled={demoBusy}
                aria-busy={demoBusy}
                aria-describedby="lp-demo-description"
              >
                {demoBusy ? (
                  <LoaderCircle className="lp-spinner" size={16} />
                ) : (
                  <Play size={14} />
                )}{" "}
                {demoBusy ? "Abriendo la demo…" : "Explorar la demo"}
              </button>
            </div>
            <p className="lp-demo-description" id="lp-demo-description">
              Recorre la plataforma con datos de ejemplo.
            </p>
            {demoError && (
              <p className="lp-demo-error" role="alert">
                {demoError}{" "}
                <Link to="/home" search={{ auth: "login" }}>
                  Iniciar sesión <ArrowRight size={14} />
                </Link>
              </p>
            )}
          </div>
          <div className="lp-example-wrap">
            <SignalAperture />
            <div className="lp-container">
              <EditorialExample />
            </div>
          </div>
          <p className="lp-audience-line">
            Para equipos de contenido de <span>empresas</span>,{" "}
            <span>medios</span> y <span>creadores</span>.
          </p>
        </section>
        <section
          className="lp-workflow lp-container"
          id="como-funciona"
          aria-labelledby="lp-workflow-title"
        >
          <div className="lp-section-intro">
            <h2 id="lp-workflow-title">
              Elige el tema.
              <br />
              <span>Dale forma al guion.</span>
            </h2>
            <p>
              Antes de escribir, revisa a quién le sirve el tema y qué fuentes
              tienes. Con esa información, tu equipo puede elegir el enfoque y
              preparar la pieza.
            </p>
          </div>
          <div className="lp-context-row">
            <div className="lp-context-statement">
              <span className="lp-context-symbol" aria-hidden="true">
                <Focus size={34} strokeWidth={1.2} />
              </span>
              <h3>
                Contrasta la idea
                <br />
                con fuentes públicas.
              </h3>
            </div>
            <div className="lp-context-copy">
              <p>
                Compara una necesidad de tu audiencia con referencias públicas.
                Distingue lo observado de las hipótesis para decidir si merece
                la pena trabajar el tema.
              </p>
              <div className="lp-inline-points">
                <span>
                  <Check size={15} /> Enlaces a las fuentes
                </span>
                <span>
                  <Check size={15} /> Hipótesis identificadas
                </span>
              </div>
            </div>
          </div>
          <div className="lp-feature-row">
            <div className="lp-feature-copy">
              <h3>
                Revisa el guion
                <br />
                <span>con tu equipo.</span>
              </h3>
              <p>
                Escribe un guion a partir de la propuesta y recoge los
                comentarios del equipo en el mismo espacio. Aprueba la versión
                que vas a usar antes de programarla.
              </p>
              <a
                className="lp-text-link"
                href="#ejemplo"
                onClick={() => {
                  document.getElementById("lp-tab-3")?.click();
                }}
              >
                Recorre el ejemplo <ArrowUpRight size={16} />
              </a>
            </div>
            <ReviewVisual />
          </div>
          <div className="lp-feature-row lp-feature-row-reverse">
            <CalendarVisual />
            <div className="lp-feature-copy">
              <h3>
                Organiza las fechas
                <br />
                <span>y revisa los resultados.</span>
              </h3>
              <p>
                Pon fecha a las piezas y exporta el plan. Después de publicar,
                consulta los contadores de YouTube o registra los resultados de
                otros canales para decidir qué temas seguir trabajando.
              </p>
              <p className="lp-feature-note">
                El calendario no publica automáticamente.
              </p>
            </div>
          </div>
        </section>
        <section
          className="lp-teams"
          id="para-tu-equipo"
          aria-labelledby="lp-teams-title"
        >
          <div className="lp-container lp-teams-inner">
            <div className="lp-teams-heading">
              <h2 id="lp-teams-title">
                Para empresas,
                <br />
                <span>medios y creadores.</span>
              </h2>
              <p>
                Cada empresa tiene su propio espacio para reunir sus fuentes y
                decidir qué contar con su equipo.
              </p>
              <a className="lp-text-link" href="#como-funciona">
                Ver cómo funciona <ArrowUpRight size={16} />
              </a>
            </div>
            <div className="lp-team-list">
              <article>
                <span className="lp-team-mark" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
                <div>
                  <h3>Empresas</h3>
                  <p>
                    Usa lo que sabe tu empresa para responder preguntas de su
                    audiencia. Decide qué temas trabajar y prepara las piezas
                    con tu equipo.
                  </p>
                </div>
              </article>
              <article>
                <span className="lp-team-mark lp-mark-media" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
                <div>
                  <h3>Medios</h3>
                  <p>
                    Elige un enfoque para cada historia, conserva las fuentes y
                    revisa el guion con la redacción.
                  </p>
                </div>
              </article>
              <article>
                <span
                  className="lp-team-mark lp-mark-creator"
                  aria-hidden="true"
                >
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
                <div>
                  <h3>Creadores</h3>
                  <p>
                    Elige qué pregunta de tu audiencia vas a responder. Reúne
                    las referencias, escribe el guion y ponle fecha.
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>
        <section
          className="lp-faq lp-container"
          id="preguntas"
          aria-labelledby="lp-faq-title"
        >
          <div>
            <h2 id="lp-faq-title">
              Preguntas
              <br />
              <span>antes de empezar.</span>
            </h2>
          </div>
          <div className="lp-faq-list">
            {faqs.map(({ question, answer }, index) => (
              <div className="lp-faq-item" key={question}>
                <h3>
                  <button
                    type="button"
                    aria-expanded={activeFaq === index}
                    aria-controls={`lp-answer-${index}`}
                    id={`lp-question-${index}`}
                    onClick={() =>
                      setActiveFaq(activeFaq === index ? null : index)
                    }
                  >
                    {question}
                    <ChevronDown size={18} />
                  </button>
                </h3>
                <div
                  id={`lp-answer-${index}`}
                  role="region"
                  aria-labelledby={`lp-question-${index}`}
                  hidden={activeFaq !== index}
                >
                  <p>{answer}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="lp-close" aria-labelledby="lp-close-title">
          <div className="lp-container">
            <KompassMark className="lp-close-mark" />
            <h2 id="lp-close-title">
              Crea tu cuenta
              <br />
              <span>y añade tu empresa.</span>
            </h2>
            <p>
              Empieza por tu web, una publicación o un texto propio.
              <br />
              Define a quién quieres dirigirte y qué necesita resolver.
            </p>
            {signup}
          </div>
        </section>
      </main>
      <footer className="lp-footer lp-container">
        <a className="lp-brand" href="/" aria-label="kompass, inicio">
          <KompassMark />
          <span>kompass</span>
        </a>
        <p>Decide qué contar y llévalo a un guion.</p>
        <a href="#contenido">
          Volver arriba <ArrowUpRight size={14} />
        </a>
      </footer>
    </div>
  );
}
