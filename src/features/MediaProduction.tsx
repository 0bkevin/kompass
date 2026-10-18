import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Download,
  ImagePlus,
  RefreshCw,
  Sparkles,
  Video,
} from "lucide-react";
import { Badge, Button, Field } from "../components/ui";
import { api, json } from "../lib/api";
import type { Piece } from "../lib/types";
import { useWorkspace } from "../lib/workspace";
import "./media-production.css";

type MediaKind = "image" | "video";
type MediaRatio = "1:1" | "4:5" | "9:16" | "16:9";
type MediaJob = {
  id: string;
  pieceId: string;
  kind: MediaKind;
  status: "queued" | "running" | "completed" | "failed";
  stage: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
  assetIds: string[];
  label?: string;
  idempotencyKey: string;
};
type MediaStatus = {
  capabilities: Record<
    MediaKind,
    {
      ready: boolean;
      provider: string;
      label: string;
      reason?: string;
    }
  >;
  jobs: MediaJob[];
};

function initialPrompt(piece: Piece, brandName: string) {
  return `Crea una imagen editorial original para ${brandName}.\nTema: ${piece.title}.\n${piece.hook ? `Idea principal: ${piece.hook}\n` : ""}Estilo claro y profesional. No inventes resultados, cifras ni logotipos.`;
}

export default function MediaProduction({
  piece,
  disabled = false,
  unsaved = false,
  disabledReason,
  onSelectAssets,
}: {
  piece: Piece;
  disabled?: boolean;
  unsaved?: boolean;
  disabledReason?: string;
  onSelectAssets: (assetIds: string[]) => void;
}) {
  const { state, refresh } = useWorkspace();
  const base = `/api/brands/${state.brand.id}/media`;
  const [status, setStatus] = useState<MediaStatus | null>(null);
  const [kind, setKind] = useState<MediaKind>("image");
  const [ratio, setRatio] = useState<MediaRatio>(
    piece.channel === "youtube" ? "16:9" : "4:5",
  );
  const [prompt, setPrompt] = useState(() =>
    initialPrompt(piece, state.brand.name),
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [libraryError, setLibraryError] = useState("");
  const requestKey = useRef<string | null>(null);
  const completed = useRef(new Set<string>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const result = await api<MediaStatus>(base, { signal });
      if (!mounted.current || signal?.aborted) return;
      setStatus(result);
      setError("");
      if (
        requestKey.current &&
        result.jobs.some((job) => job.idempotencyKey === requestKey.current)
      )
        requestKey.current = null;
      const newlyCompleted = result.jobs.filter(
        (job) =>
          job.pieceId === piece.id &&
          job.status === "completed" &&
          !completed.current.has(job.id),
      );
      if (newlyCompleted.length) {
        newlyCompleted.forEach((job) => completed.current.add(job.id));
        try {
          await refresh();
          if (mounted.current) setLibraryError("");
        } catch {
          if (mounted.current)
            setLibraryError(
              "El archivo ya se creó, pero no pudimos actualizar la biblioteca. Pulsa Actualizar para recuperarlo; no necesitas generarlo otra vez.",
            );
        }
      }
    },
    [base, piece.id, refresh],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void load(controller.signal)
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "No pudimos consultar la creación de archivos.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [load]);

  const jobs = (status?.jobs || [])
    .filter((job) => job.pieceId === piece.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pending = jobs.some(
    (job) => job.status === "queued" || job.status === "running",
  );
  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const poll = async () => {
      try {
        await load(controller.signal);
      } catch (cause) {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "Se interrumpió la consulta. La creación puede seguir en curso; pulsa Actualizar.",
          );
      }
      if (!cancelled) timer = setTimeout(poll, 3000);
    };
    timer = setTimeout(poll, 3000);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [load, pending]);

  const capability = status?.capabilities[kind];
  const attachedImage = state.assets.find(
    (asset) => asset.type === "image" && piece.assetIds.includes(asset.id),
  );
  const reusesImage = kind === "video" && !!attachedImage;
  useEffect(() => {
    requestKey.current = null;
  }, [piece.approvalVersion]);
  function editPrompt(next: string) {
    setPrompt(next);
    requestKey.current = null;
  }
  async function create() {
    if (
      busy ||
      disabled ||
      unsaved ||
      pending ||
      !capability?.ready ||
      (!reusesImage && !prompt.trim())
    )
      return;
    setBusy(true);
    setError("");
    requestKey.current ||= crypto.randomUUID();
    try {
      const job = await api<MediaJob>(`${base}/jobs`, {
        method: "POST",
        body: json({
          pieceId: piece.id,
          kind,
          prompt: reusesImage ? "" : prompt.trim(),
          aspectRatio: ratio,
          idempotencyKey: requestKey.current,
        }),
      });
      if (!mounted.current) return;
      setStatus((current) =>
        current
          ? {
              ...current,
              jobs: [job, ...current.jobs.filter((item) => item.id !== job.id)],
            }
          : current,
      );
      requestKey.current = null;
      await load();
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "No pudimos iniciar la creación. Puedes reintentar sin duplicar la solicitud.",
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function reload() {
    setLoading(true);
    try {
      await load();
      if (libraryError) {
        await refresh();
        setLibraryError("");
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos actualizar. Inténtalo de nuevo.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="media-production"
      aria-labelledby="media-production-heading"
    >
      <div className="media-production-heading">
        <div>
          <h3 id="media-production-heading">Crea el material de esta pieza</h3>
          <p>Genera, revisa el archivo y añádelo a tu contenido.</p>
        </div>
        <Button
          onClick={() => void reload()}
          busy={loading}
          aria-label="Actualizar archivos generados"
        >
          <RefreshCw size={15} /> Actualizar
        </Button>
      </div>
      <div className="media-kind" role="group" aria-label="Tipo de archivo">
        <Button
          variant={kind === "image" ? "primary" : "secondary"}
          aria-pressed={kind === "image"}
          disabled={busy}
          onClick={() => {
            setKind("image");
            requestKey.current = null;
          }}
        >
          <ImagePlus size={17} /> Crear imagen
        </Button>
        <Button
          variant={kind === "video" ? "primary" : "secondary"}
          aria-pressed={kind === "video"}
          disabled={busy}
          onClick={() => {
            setKind("video");
            requestKey.current = null;
          }}
        >
          <Video size={17} /> Crear video
        </Button>
      </div>
      {loading && !status ? (
        <div className="media-loading" role="status">
          <span>Consultando la creación de archivos…</span>
          <div aria-hidden="true" />
          <div aria-hidden="true" />
        </div>
      ) : (
        status && (
          <>
            <p className="media-mode-note">
              {capability?.label ||
                (kind === "image"
                  ? "Imagen generada con IA"
                  : "Video con imágenes y texto")}
              {kind === "video" &&
                " · Una ilustración con movimiento y subtítulos del guion, sin audio."}
            </p>
            {!capability?.ready && (
              <p className="media-unavailable" role="status">
                {capability?.reason ||
                  "La creación de este tipo de archivo aún no está disponible. Tu administrador debe habilitar el servicio."}
              </p>
            )}
            <form
              className="media-production-form"
              onSubmit={(event) => {
                event.preventDefault();
                void create();
              }}
            >
              {reusesImage ? (
                <p className="media-unavailable">
                  Este video usará la imagen «{attachedImage.name}» ya asociada
                  y los subtítulos del guion guardado. Para crear otra
                  ilustración, quita esa imagen de los recursos y guarda la
                  pieza.
                </p>
              ) : (
                <Field
                  label={
                    kind === "image"
                      ? "¿Cómo quieres que se vea?"
                      : "Dirección visual del video"
                  }
                >
                  <textarea
                    value={prompt}
                    rows={4}
                    maxLength={4000}
                    onChange={(event) => editPrompt(event.target.value)}
                    disabled={disabled || busy || !capability?.ready}
                  />
                </Field>
              )}
              <div className="media-create-controls">
                <Field label="Formato">
                  <select
                    value={ratio}
                    onChange={(event) => {
                      setRatio(event.target.value as MediaRatio);
                      requestKey.current = null;
                    }}
                    disabled={disabled || busy || !capability?.ready}
                  >
                    <option value="4:5">Vertical · 4:5</option>
                    <option value="9:16">Historia o reel · 9:16</option>
                    <option value="1:1">Cuadrado · 1:1</option>
                    <option value="16:9">Horizontal · 16:9</option>
                  </select>
                </Field>
                <Button
                  type="submit"
                  variant="primary"
                  busy={busy}
                  disabled={
                    disabled ||
                    unsaved ||
                    pending ||
                    !capability?.ready ||
                    (!reusesImage && !prompt.trim())
                  }
                >
                  <Sparkles size={16} />{" "}
                  {kind === "image" ? "Generar imagen" : "Generar video"}
                </Button>
              </div>
              {disabledReason && (
                <p className="small muted">{disabledReason}</p>
              )}
              {unsaved && !disabled && (
                <p className="small muted">
                  Guarda los cambios de la pieza antes de generar un archivo con
                  la versión actual del guion.
                </p>
              )}
              <p className="small muted">
                La creación usa el servicio disponible en este equipo y puede
                consumir sus créditos. Revisa el resultado antes de añadirlo o
                publicarlo.
              </p>
            </form>
          </>
        )
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {libraryError && (
        <p className="form-error" role="alert">
          {libraryError}
        </p>
      )}
      {!!jobs.length && (
        <div
          className="media-jobs"
          aria-live="polite"
          aria-relevant="additions text"
        >
          {jobs.map((job) => {
            const outputs = state.assets.filter((asset) =>
              job.assetIds?.includes(asset.id),
            );
            const added =
              !!job.assetIds?.length &&
              job.assetIds.every((id) => piece.assetIds.includes(id));
            return (
              <article className="media-job" key={job.id}>
                <div className="media-job-heading">
                  <strong>
                    {job.kind === "image" ? "Imagen IA" : "Video animado"}
                  </strong>
                  <Badge
                    tone={
                      job.status === "completed"
                        ? "green"
                        : job.status === "failed"
                          ? "red"
                          : "neutral"
                    }
                  >
                    {
                      {
                        queued: "En cola",
                        running: "Creando…",
                        completed: "Archivo listo",
                        failed: "No se pudo crear",
                      }[job.status]
                    }
                  </Badge>
                </div>
                {(job.status === "queued" || job.status === "running") && (
                  <p className="muted" role="status">
                    {job.stage === "generating"
                      ? "Generando la ilustración con IA. "
                      : job.stage === "rendering"
                        ? "Montando el video y sus subtítulos. "
                        : "Preparando el archivo. "}
                    Puede tardar unos minutos. Puedes continuar trabajando; el
                    resultado quedará aquí y en tu biblioteca.
                  </p>
                )}
                {job.error && <p className="form-error">{job.error}</p>}
                {outputs.map((asset) => (
                  <div className="media-output" key={asset.id}>
                    {asset.type === "video" ? (
                      <video
                        controls
                        preload="metadata"
                        src={asset.url}
                        aria-label={asset.name}
                      />
                    ) : asset.type === "image" ? (
                      <img src={asset.url} alt={asset.name} />
                    ) : null}
                    <span className="media-output-name">{asset.name}</span>
                    <a
                      className="button secondary"
                      href={asset.url}
                      download={asset.name}
                    >
                      <Download size={15} /> Descargar
                    </a>
                  </div>
                ))}
                {job.status === "completed" && !!outputs.length && (
                  <Button
                    disabled={disabled || added}
                    onClick={() => onSelectAssets(job.assetIds)}
                  >
                    <Check size={16} />{" "}
                    {added ? "Añadido a esta pieza" : "Añadir a esta pieza"}
                  </Button>
                )}
                {job.status === "completed" && !outputs.length && (
                  <p className="small muted">
                    El archivo está creado. Pulsa Actualizar para cargarlo desde
                    la biblioteca.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
