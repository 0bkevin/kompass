import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  MessageCircle,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { api, json } from "../lib/api";
import type {
  AudienceEvidenceResource,
  CommunityPoll as Poll,
} from "../lib/audience-evidence";
import { useWorkspace } from "../lib/workspace";
import { Badge, Button, Field } from "../components/ui";
import "./community.css";

const notice =
  "Las respuestas son voluntarias y no verificadas. No representan personas únicas ni a toda tu audiencia. Los resultados por grupo aparecen a partir de 5 respuestas.";
function PollResults({ poll }: { poll: Poll }) {
  return poll.results.length ? (
    <div className="community-results">
      <table>
        <caption>Intereses expresados · muestra voluntaria</caption>
        <thead>
          <tr>
            <th>Grupo</th>
            <th>Tema</th>
            <th>Respuestas</th>
          </tr>
        </thead>
        <tbody>
          {poll.results.map((result) => (
            <tr key={`${result.segmentId}:${result.topic}`}>
              <td>
                {poll.groups.find((group) => group.id === result.segmentId)
                  ?.name || "Grupo"}
              </td>
              <td>{result.topic}</td>
              <td>
                {result.count} de {result.sampleSize}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="community-note">
      Aún no hay un grupo con 5 respuestas. Las señales se incorporarán
      automáticamente al reunir esa muestra.
    </p>
  );
}

export function CommunitySensor({
  resource,
}: {
  resource: AudienceEvidenceResource;
}) {
  const { state, refresh, notify, registerUnsavedChangesGuard } =
    useWorkspace();
  const brandId = state.brand.id;
  const polls = resource.data?.polls ?? [];
  const loading = resource.loading;
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(
    "¿Qué necesitas resolver esta semana?",
  );
  const [options, setOptions] = useState(
    state.brand.pillars.slice(0, 6).join("\n"),
  );
  const [busy, setBusy] = useState("");
  const current = useRef(brandId);
  current.current = brandId;
  const dirty = useRef(false);
  const pending = useRef(false);
  pending.current = !!busy;
  useEffect(() => {
    current.current = brandId;
    return () => {
      current.current = "";
    };
  }, [brandId]);
  useEffect(
    () =>
      registerUnsavedChangesGuard({
        isDirty: () => dirty.current || pending.current,
        confirmLeave: () =>
          !pending.current &&
          window.confirm("Hay una pregunta sin guardar. ¿Salir y descartarla?"),
      }),
    [registerUnsavedChangesGuard],
  );
  const canEdit = state.brand.role !== "reviewer";
  async function mutate(poll: Poll, method: "PATCH" | "DELETE") {
    if (
      method === "DELETE" &&
      !window.confirm(
        "¿Eliminar esta pregunta y sus señales agregadas? El enlace dejará de funcionar.",
      )
    )
      return;
    setBusy(poll.id);
    setError("");
    try {
      await api(`/api/brands/${brandId}/community-polls/${poll.id}`, {
        method,
        ...(method === "PATCH" ? { body: json({ active: !poll.active }) } : {}),
      });
      if (current.current !== brandId) return;
      await resource.reload();
      await refresh();
    } catch (cause) {
      if (current.current === brandId) setError((cause as Error).message);
    } finally {
      if (current.current === brandId) setBusy("");
    }
  }
  return (
    <section
      className="community-sensor"
      aria-labelledby="community-heading"
      aria-busy={loading}
    >
      <div className="community-heading">
        <div>
          <h2 id="community-heading">
            <MessageCircle size={20} />
            Escucha a tu comunidad
          </h2>
          <p>
            Contrasta lo que supones con lo que tu audiencia dice necesitar.
            Comparte una pregunta pública, sin pedir nombres ni correos.
          </p>
        </div>
        {canEdit && !editing && (
          <Button
            onClick={() => setEditing(true)}
            disabled={!state.brand.audience.length}
          >
            <Plus size={16} />
            Crear pregunta
          </Button>
        )}
      </div>
      <div className="community-actions">
        <Button
          busy={loading}
          disabled={!!busy}
          onClick={() => void resource.reload()}
        >
          <RefreshCw size={15} />
          Actualizar preguntas y señales
        </Button>
        {resource.refreshedAt && (
          <span className="community-note">
            Última consulta:{" "}
            <time dateTime={resource.refreshedAt}>
              {new Intl.DateTimeFormat("es", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }).format(new Date(resource.refreshedAt))}
            </time>
          </span>
        )}
      </div>
      {!state.brand.audience.length && (
        <p className="community-note">
          Define primero una audiencia para agrupar las respuestas.
        </p>
      )}
      {editing && (
        <form
          className="community-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy("new");
            setError("");
            try {
              await api<Poll>(
                `/api/brands/${brandId}/community-polls`,
                {
                  method: "POST",
                  body: json({
                    question,
                    options: options
                      .split("\n")
                      .map((value) => value.trim())
                      .filter(Boolean),
                    segmentIds: state.brand.audience.map(
                      (segment) => segment.id,
                    ),
                  }),
                },
              );
              if (current.current !== brandId) return;
              dirty.current = false;
              setEditing(false);
              notify("Pregunta creada. Comparte el enlace con tu comunidad.");
              await resource.reload();
            } catch (cause) {
              if (current.current === brandId)
                setError((cause as Error).message);
            } finally {
              if (current.current === brandId) setBusy("");
            }
          }}
          onChange={() => {
            dirty.current = true;
          }}
        >
          <Field
            label="Pregunta"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            required
            maxLength={300}
          />
          <Field label="Entre 2 y 6 temas, uno por línea">
            <textarea
              value={options}
              onChange={(event) => setOptions(event.target.value)}
              rows={4}
              required
              maxLength={1000}
              placeholder="Preparar conversaciones de venta\nAutomatizar tareas repetitivas\nFormar a mi equipo"
            />
          </Field>
          <p className="community-note">
            Cada participante elegirá un grupo y un tema. Guardamos conteos
            agregados; no guardamos respuestas individuales.
          </p>
          <div className="community-actions">
            <Button type="submit" variant="primary" busy={busy === "new"}>
              Crear enlace público
              <ArrowRight size={16} />
            </Button>
            <Button
              disabled={!!busy}
              onClick={() => {
                if (
                  !dirty.current ||
                  window.confirm("¿Descartar esta pregunta?")
                ) {
                  setEditing(false);
                  dirty.current = false;
                }
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
      {(error || resource.error) && (
        <div className="form-error" role="alert">
          {error && <p>{error}</p>}
          {resource.error && (
            <>
              <p>
                No se pudieron actualizar las preguntas y las señales.{" "}
                {resource.error}
                {resource.data && " Se conserva la última consulta."}
              </p>
              <Button busy={loading} onClick={() => void resource.reload()}>
                Reintentar carga
              </Button>
            </>
          )}
        </div>
      )}
      {loading && (
        <div className="community-loading" role="status">
          {resource.data
            ? "Actualizando preguntas y señales…"
            : "Cargando preguntas…"}
        </div>
      )}
      {!loading && !resource.error && !polls.length && !editing && (
        <div className="community-empty">
          <p>¿Qué tema te ayudaría más esta semana?</p>
          <span>
            Las respuestas públicas se convertirán en señales para priorizar
            oportunidades por grupo.
          </span>
        </div>
      )}
      {polls.map((poll) => (
        <article className="community-poll" key={poll.id}>
          <div className="community-poll-top">
            <h3>{poll.question}</h3>
            <Badge tone={poll.active ? "green" : "neutral"}>
              {poll.active ? "Abierta" : "Pausada"}
            </Badge>
          </div>
          <div className="community-share">
            <a href={poll.publicPath} target="_blank" rel="noreferrer">
              Abrir pregunta
              <ExternalLink size={14} />
            </a>
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    new URL(poll.publicPath, window.location.origin).href,
                  );
                  notify("Enlace copiado.");
                } catch {
                  notify(
                    "Puedes copiar el enlace que aparece en la pregunta.",
                    "error",
                  );
                }
              }}
            >
              <Copy size={14} />
              Copiar enlace
            </Button>
            <span>{poll.totalResponses} respuestas</span>
          </div>
          <PollResults poll={poll} />
          {canEdit && (
            <div className="community-actions">
              <Button
                disabled={!!busy}
                busy={busy === poll.id}
                onClick={() => void mutate(poll, "PATCH")}
              >
                {poll.active ? <Pause size={14} /> : <Play size={14} />}
                {poll.active ? "Pausar" : "Reabrir"}
              </Button>
              <Button
                variant="ghost"
                disabled={!!busy}
                onClick={() => void mutate(poll, "DELETE")}
              >
                <Trash2 size={14} />
                Eliminar
              </Button>
            </div>
          )}
        </article>
      ))}
      <p className="community-note">{notice}</p>
    </section>
  );
}

export function CommunityQuestion({ token }: { token: string }) {
  const [data, setData] = useState<{ companyName: string; poll: Poll } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [segmentId, setSegment] = useState("");
  const [optionId, setOption] = useState("");
  const request = useRef(0);
  const load = useCallback(async () => {
    const version = ++request.current;
    setLoading(true);
    setError("");
    try {
      const result = await api<{ companyName: string; poll: Poll }>(
        `/api/community/${encodeURIComponent(token)}`,
      );
      if (version !== request.current) return;
      setData(result);
      if (result.poll.groups.length === 1) setSegment(result.poll.groups[0].id);
    } catch (cause) {
      if (version === request.current) setError((cause as Error).message);
    } finally {
      if (version === request.current) setLoading(false);
    }
  }, [token]);
  useEffect(() => {
    void load();
    return () => {
      request.current++;
    };
  }, [load]);
  return (
    <main className="public-community">
      <div className="public-community-brand">
        <MessageCircle size={24} />
        <span>{data?.companyName || "Tu comunidad"}</span>
      </div>
      {loading ? (
        <p role="status">Abriendo la pregunta…</p>
      ) : !data ? (
        <div role="alert">
          <h1>No pudimos abrir esta pregunta.</h1>
          <p>{error}</p>
          <Button onClick={() => void load()}>Reintentar</Button>
        </div>
      ) : (
        <>
          {done ? (
            <div className="community-thanks" role="status">
              <CheckCircle2 size={34} />
              <h1>Gracias por compartir tu interés.</h1>
              <p>
                Tu respuesta se agregó al conteo de tu grupo. No creamos un
                perfil sobre ti.
              </p>
            </div>
          ) : (
            <>
              <h1>{data.poll.question}</h1>
              <p className="public-community-intro">
                Ayuda a {data.companyName} a crear contenido que te resulte
                útil. No necesitas registrarte.
              </p>
              {!data.poll.active ? (
                <p className="community-paused">
                  Esta pregunta está pausada. Puedes consultar los resultados
                  agregados disponibles.
                </p>
              ) : (
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const version = request.current;
                    setBusy(true);
                    setError("");
                    try {
                      const result = await api<{
                        totalResponses: number;
                        results: Poll["results"];
                      }>(
                        `/api/community/${encodeURIComponent(token)}/responses`,
                        { method: "POST", body: json({ segmentId, optionId }) },
                      );
                      if (request.current !== version) return;
                      setData(
                        (previous) =>
                          previous && {
                            ...previous,
                            poll: {
                              ...previous.poll,
                              totalResponses: result.totalResponses,
                              results: result.results,
                            },
                          },
                      );
                      setDone(true);
                    } catch (cause) {
                      if (request.current === version)
                        setError((cause as Error).message);
                    } finally {
                      if (request.current === version) setBusy(false);
                    }
                  }}
                >
                  <Field label="¿Qué grupo se acerca más a tu situación?">
                    <select
                      value={segmentId}
                      onChange={(event) => setSegment(event.target.value)}
                      required
                    >
                      <option value="" disabled>
                        Elige un grupo
                      </option>
                      {data.poll.groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <fieldset className="community-choices">
                    <legend>Elige el tema que más te ayudaría</legend>
                    {data.poll.options.map((option) => (
                      <label
                        key={option.id}
                        className={optionId === option.id ? "chosen" : ""}
                      >
                        <input
                          type="radio"
                          name="topic"
                          value={option.id}
                          checked={optionId === option.id}
                          onChange={() => setOption(option.id)}
                          required
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </fieldset>
                  {error && (
                    <p className="form-error" role="alert">
                      {error}
                    </p>
                  )}
                  <Button
                    variant="primary"
                    type="submit"
                    busy={busy}
                    disabled={!segmentId || !optionId}
                  >
                    Compartir mi interés
                    <ArrowRight size={16} />
                  </Button>
                </form>
              )}
            </>
          )}
          {(done || !data.poll.active) && <PollResults poll={data.poll} />}
          <p className="community-note">{notice}</p>
          <p className="public-community-privacy">
            Sólo guardamos conteos por grupo y tema. No envíes datos personales.
          </p>
        </>
      )}
      <footer>
        Una pregunta de {data?.companyName || "tu comunidad"} · 30X Radar
      </footer>
    </main>
  );
}
