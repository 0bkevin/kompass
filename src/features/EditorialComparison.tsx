import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Field } from "../components/ui";
import { api, json } from "../lib/api";
import { useWorkspace } from "../lib/workspace";
import type { Reference } from "../lib/types";

type Comparison = {
  summary: string;
  references: {
    id: string;
    title: string;
    contentScope: string;
    textLength: number;
  }[];
  factors: {
    factor: string;
    observation: string;
    hypothesis: string;
    citations: { referenceId: string; quote: string }[];
  }[];
  limitations: string[];
  outcomeComparison: {
    comparable: boolean;
    limitation: string;
    differences: {
      metric: string;
      left: number;
      right: number;
      difference: number;
    }[];
  };
};
function eligible(reference: Reference) {
  if (
    reference.accessPolicy?.allowed === false ||
    !reference.text ||
    reference.text.trim().length < 80 ||
    reference.text.length > 24000 ||
    reference.videoAnalysis
  )
    return false;
  const scope = String(reference.contentScope || "");
  if (
    ["metadata_only", "video_audio", "sampled_video"].includes(scope) ||
    (reference.sourceId && !["full_text", "provided_text"].includes(scope))
  )
    return false;
  if (
    /^(?:instagram|tiktok|youtube|reddit|telegram|linkedin|facebook|twitter|x)$/i.test(
      reference.platform || "",
    )
  )
    return false;
  try {
    if (
      reference.url &&
      /(^|\.)(?:youtube\.com|youtu\.be|reddit\.com|instagram\.com|tiktok\.com|linkedin\.com|facebook\.com|x\.com|twitter\.com|t\.me|telegram\.org)$/.test(
        new URL(reference.url).hostname,
      )
    )
      return false;
  } catch {
    return false;
  }
  return true;
}

export function EditorialComparison() {
  const { state, navigate } = useWorkspace();
  // A company change remounts all local selections, pending state and results.
  return (
    <ComparisonForm
      key={state.brand.id}
      references={state.references.filter(eligible)}
      brandId={state.brand.id}
      canEdit={state.brand.role !== "reviewer"}
      ready={state.integrations.ai.ready}
      openReferences={() => navigate("inbox")}
    />
  );
}
function ComparisonForm({
  references,
  brandId,
  canEdit,
  ready,
  openReferences,
}: {
  references: Reference[];
  brandId: string;
  canEdit: boolean;
  ready: boolean;
  openReferences: () => void;
}) {
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [result, setResult] = useState<Comparison | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const material = JSON.stringify(
    references.map((reference) => [
      reference.id,
      reference.title,
      reference.text,
      reference.contentScope,
    ]),
  );
  useEffect(() => {
    setResult(null);
    setError("");
    setBusy(false);
    return () => {
      pending.current?.abort();
      pending.current = null;
    };
  }, [brandId, material]);
  async function compare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !left || !right || left === right) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await api<Comparison>(
        `/api/brands/${brandId}/editorial-comparison`,
        {
          method: "POST",
          body: json({ leftReferenceId: left, rightReferenceId: right }),
          signal: controller.signal,
        },
      );
      if (!controller.signal.aborted) setResult(response);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudo comparar. Vuelve a intentar.",
        );
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null;
        setBusy(false);
      }
    }
  }
  if (references.length < 2)
    return (
      <div className="stack">
        <p className="report-muted">
          Añade dos referencias con texto propio o público permitido para
          comparar.
        </p>
        <Button onClick={openReferences}>Abrir referencias</Button>
      </div>
    );
  if (!canEdit)
    return (
      <p className="report-muted">
        Un editor de la empresa puede solicitar la comparación.
      </p>
    );
  if (!ready)
    return (
      <p className="report-muted">
        IA no disponible. Pide al administrador que revise la integración
        compartida.
      </p>
    );
  return (
    <div className="stack">
      <form className="stack" onSubmit={compare} aria-busy={busy}>
        <div className="form-grid">
          <Field label="Primera referencia">
            <select
              required
              value={left}
              disabled={busy}
              onChange={(event) => {
                setLeft(event.target.value);
                setResult(null);
              }}
            >
              <option value="">Elegir referencia</option>
              {references.map((reference) => (
                <option
                  key={reference.id}
                  value={reference.id}
                  disabled={reference.id === right}
                >
                  {reference.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Segunda referencia">
            <select
              required
              value={right}
              disabled={busy}
              onChange={(event) => {
                setRight(event.target.value);
                setResult(null);
              }}
            >
              <option value="">Elegir referencia</option>
              {references.map((reference) => (
                <option
                  key={reference.id}
                  value={reference.id}
                  disabled={reference.id === left}
                >
                  {reference.title}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="report-muted">
          Compara todo el texto disponible. Las hipótesis no demuestran por qué
          una pieza funcionó.
        </p>
        <Button
          type="submit"
          busy={busy}
          disabled={
            !left ||
            !right ||
            left === right ||
            !references.some((reference) => reference.id === left) ||
            !references.some((reference) => reference.id === right)
          }
        >
          Comparar textos con IA
        </Button>
        {busy && (
          <p role="status" className="report-muted">
            Analizando los dos textos…
          </p>
        )}
        {error && (
          <p role="alert" className="report-error">
            {error}
          </p>
        )}
      </form>
      {result && (
        <section className="stack" aria-label="Comparación editorial">
          <p role="status">Comparación completada con citas verificadas.</p>
          <p>{result.summary}</p>
          {result.references.map((reference) => (
            <p key={reference.id} className="report-muted">
              {reference.title}:{" "}
              {reference.contentScope === "full_text"
                ? "texto completo indicado"
                : "texto aportado"}
              , {reference.textLength.toLocaleString("es")} caracteres
              analizados.
            </p>
          ))}
          {result.factors.map((factor, index) => (
            <div className="stack" key={index}>
              <h3>{factor.factor}</h3>
              <p>{factor.observation}</p>
              {factor.citations.map((citation, citationIndex) => (
                <figure key={citationIndex}>
                  <blockquote>{citation.quote}</blockquote>
                  <figcaption className="report-muted">
                    {
                      result.references.find(
                        (reference) => reference.id === citation.referenceId,
                      )?.title
                    }{" "}
                    · Cita literal verificada
                  </figcaption>
                </figure>
              ))}
              <p>
                <strong>Hipótesis para probar: </strong>
                {factor.hypothesis.replace(
                  /^(?:hip[oó]tesis(?:\s+para\s+probar)?\s*:\s*)+/i,
                  "",
                )}
              </p>
            </div>
          ))}
          <h3>Resultados disponibles</h3>
          {result.outcomeComparison.comparable && (
            <ul>
              {result.outcomeComparison.differences.map((item) => (
                <li key={item.metric}>
                  {item.metric}: {item.left} frente a {item.right}.
                </li>
              ))}
            </ul>
          )}
          <p className="report-muted">{result.outcomeComparison.limitation}</p>
          <h3>Límites</h3>
          <ul>
            {result.limitations.map((limitation, index) => (
              <li key={index}>{limitation}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
export default EditorialComparison;
