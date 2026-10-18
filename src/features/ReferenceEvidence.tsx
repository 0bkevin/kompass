import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronDown, Save } from "lucide-react";
import { api, json } from "../lib/api";
import { useWorkspace } from "../lib/workspace";
import { Button, Field } from "../components/ui";
import type { Reference } from "../lib/types";
import "./editorial-evidence.css";

const factors = {
  hook: "Gancho",
  format: "Formato",
  topic: "Tema",
  timing: "Momento",
  publisher: "Publicador",
  performance: "Rendimiento",
};
type Factor = keyof typeof factors;
interface Observation {
  factor: Factor;
  observation: string;
  uncertainty: string;
  possibleHypothesis?: string;
  observedAt: string;
  origin: "manual";
  support:
    | { kind: "text"; field: "title" | "text"; quote: string }
    | { kind: "time"; startSeconds: number; endSeconds?: number };
}
interface Evidence {
  referenceFingerprint: string;
  revision: number;
  status: "empty" | "current" | "stale";
  observations: Observation[];
}

export function ReferenceEvidence({
  reference,
  onDirtyChange,
}: {
  reference: Reference;
  onDirtyChange: (value: boolean) => void;
}) {
  const { state, notify, registerUnsavedChangesGuard } = useWorkspace();
  const [opened, setOpened] = useState(false);
  const [data, setData] = useState<Evidence | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [factor, setFactor] = useState<Factor>("hook");
  const [observation, setObservation] = useState("");
  const [uncertainty, setUncertainty] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [support, setSupport] = useState("title");
  const [quote, setQuote] = useState(reference.title.slice(0, 1000));
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState("");
  const requestLock = useRef(false);
  const live = useRef({ dirty, busy });
  live.current = { dirty, busy };
  const path = `/api/brands/${encodeURIComponent(state.brand.id)}/references/${encodeURIComponent(reference.id)}/editorial-evidence`;
  const writable = state.brand.role !== "reviewer";
  const asset = state.assets.find((item) => item.id === reference.assetId);
  const timed = /^(video|audio)\//.test(asset?.mimeType || "");
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(
    () =>
      registerUnsavedChangesGuard({
        isDirty: () => live.current.dirty || live.current.busy,
        confirmLeave: () =>
          !live.current.busy &&
          (!live.current.dirty ||
            window.confirm("Hay observaciones sin guardar. ¿Descartarlas?")),
      }),
    [registerUnsavedChangesGuard],
  );
  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController();
    void api<Evidence>(path, { signal: controller.signal })
      .then(setData)
      .catch((reason: Error) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => controller.abort();
  }, [opened, path]);
  async function reload() {
    if (
      dirty &&
      !window.confirm(
        "¿Descartar las observaciones sin guardar y consultar la versión actual?",
      )
    )
      return;
    setError("");
    try {
      setData(await api<Evidence>(path));
      setDirty(false);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || requestLock.current) return;
    requestLock.current = true;
    setBusy(true);
    setError("");
    try {
      const next: Observation = {
        factor,
        observation,
        uncertainty,
        ...(hypothesis.trim() ? { possibleHypothesis: hypothesis.trim() } : {}),
        observedAt: new Date().toISOString(),
        origin: "manual",
        support:
          support === "time"
            ? {
                kind: "time",
                startSeconds: Number(start),
                ...(end ? { endSeconds: Number(end) } : {}),
              }
            : {
                kind: "text",
                field: support === "text" ? "text" : "title",
                quote,
              },
      };
      // The API owns provenance; only its documented fields are submitted.
      const observations = [
        ...data.observations.filter((item) => item.factor !== factor),
        next,
      ].map(({ origin: _origin, support: backing, ...item }) => ({
        ...item,
        support:
          backing.kind === "text"
            ? { kind: backing.kind, field: backing.field, quote: backing.quote }
            : {
                kind: backing.kind,
                startSeconds: backing.startSeconds,
                ...(backing.endSeconds !== undefined
                  ? { endSeconds: backing.endSeconds }
                  : {}),
              },
      }));
      const saved = await api<Evidence>(path, {
        method: "PUT",
        body: json({
          expectedReferenceFingerprint: data.referenceFingerprint,
          expectedRevision: data.revision,
          observations,
        }),
      });
      setData(saved);
      setDirty(false);
      setObservation("");
      setUncertainty("");
      setHypothesis("");
      notify("Observación guardada.");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      requestLock.current = false;
      setBusy(false);
    }
  }
  return (
    <details
      className="editorial-evidence"
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
    >
      <summary>
        Observaciones del equipo <ChevronDown size={16} aria-hidden="true" />
      </summary>
      {opened && (
        <div className="editorial-evidence-content">
          {error && (
            <div role="alert" className="form-error">
              <p>{error}</p>
              <Button onClick={() => void reload()} disabled={busy}>
                Consultar versión actual
              </Button>
            </div>
          )}
          {!data && !error && <p role="status">Consultando observaciones…</p>}
          {data?.status === "stale" && (
            <p role="status" className="small muted">
              La referencia cambió. Registra de nuevo las observaciones sobre
              esta versión.
            </p>
          )}
          {!!data?.observations.length && (
            <dl className="editorial-evidence-list">
              {data.observations.map((item) => (
                <div key={item.factor}>
                  <dt>{factors[item.factor]} · registro manual</dt>
                  <dd>
                    <p>{item.observation}</p>
                    <p className="small muted">
                      {item.support.kind === "text"
                        ? `«${item.support.quote}»`
                        : `${item.support.startSeconds}–${item.support.endSeconds ?? item.support.startSeconds} s`}
                    </p>
                    <p className="small muted">{item.uncertainty}</p>
                    {item.possibleHypothesis && (
                      <p>Hipótesis: {item.possibleHypothesis}</p>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {data && writable && (
            <form
              onSubmit={(event) => void save(event)}
              onChange={() => setDirty(true)}
            >
              <fieldset disabled={busy} className="stack">
                <div className="form-grid">
                  <Field label="Factor">
                    <select
                      value={factor}
                      onChange={(event) =>
                        setFactor(event.target.value as Factor)
                      }
                    >
                      {Object.entries(factors).map(([key, name]) => (
                        <option key={key} value={key}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Apoyo">
                    <select
                      value={support}
                      onChange={(event) => {
                        const value = event.target.value;
                        setSupport(value);
                        if (value !== "time")
                          setQuote(
                            (value === "text"
                              ? reference.text || ""
                              : reference.title
                            ).slice(0, 1000),
                          );
                      }}
                    >
                      <option value="title">Cita del título</option>
                      {reference.text && (
                        <option value="text">Cita del texto</option>
                      )}
                      {timed && (
                        <option value="time">Tiempo en el archivo</option>
                      )}
                    </select>
                  </Field>
                </div>
                {support === "time" ? (
                  <div className="form-grid">
                    <Field
                      label="Inicio (segundos)"
                      type="number"
                      min={0}
                      max={86400}
                      step="any"
                      value={start}
                      onChange={(event) => setStart(event.target.value)}
                      required
                    />
                    <Field
                      label="Fin (segundos, opcional)"
                      type="number"
                      min={0}
                      max={86400}
                      step="any"
                      value={end}
                      onChange={(event) => setEnd(event.target.value)}
                    />
                  </div>
                ) : (
                  <Field label="Cita literal">
                    <textarea
                      value={quote}
                      onChange={(event) => setQuote(event.target.value)}
                      maxLength={1000}
                      required
                      rows={2}
                    />
                  </Field>
                )}
                <Field label="Qué observaste">
                  <textarea
                    value={observation}
                    onChange={(event) => setObservation(event.target.value)}
                    maxLength={1000}
                    required
                    rows={2}
                  />
                </Field>
                <Field label="Qué no se puede concluir">
                  <textarea
                    value={uncertainty}
                    onChange={(event) => setUncertainty(event.target.value)}
                    maxLength={600}
                    required
                    rows={2}
                  />
                </Field>
                <Field label="Hipótesis para probar (opcional)">
                  <textarea
                    value={hypothesis}
                    onChange={(event) => setHypothesis(event.target.value)}
                    maxLength={600}
                    rows={2}
                  />
                </Field>
                <div className="row">
                  <Button type="submit" busy={busy} disabled={!dirty}>
                    <Save size={15} />
                    Guardar observación
                  </Button>
                  {dirty && (
                    <span className="small muted" role="status">
                      Sin guardar
                    </span>
                  )}
                </div>
              </fieldset>
            </form>
          )}
        </div>
      )}
    </details>
  );
}
