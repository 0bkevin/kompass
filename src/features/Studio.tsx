import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clapperboard,
  Download,
  FileText,
  MessageSquare,
  Plus,
  Save,
  Send,
  Sparkles,
  SquarePen,
  Bookmark,
  MoreHorizontal,
  Eye,
  Heart,
} from "lucide-react";
import { useWorkspace } from "../lib/workspace";
import { ApiError, api, json } from "../lib/api";
import { createThenRefresh } from "../lib/workflow-recovery.mjs";
import { formatProviderAttributions } from "../lib/provider-attribution.mjs";
import { ProviderCredits } from "../components/ProviderCredits";
import type { Piece } from "../lib/types";
import {
  isPieceEditorDirty,
  reconcilePieceEditor,
  type PieceEditorState,
} from "../lib/piece-draft";
import { Badge, Button, EmptyState, Field, Modal } from "../components/ui";
import {
  download,
  formatNames,
  pieceStatusLabel,
  timeAgo,
} from "../lib/format";
import PublishPiece from "./PublishPiece";

export default function Studio() {
  const { state, refresh, notify, navigate, selectedPieceId, search } =
    useWorkspace();
  const [newPiece, setNewPiece] = useState(false),
    [filter, setFilter] = useState("all");
  const selected = state.pieces.find((p) => p.id === selectedPieceId);
  const pieces = state.pieces
    .filter((p) => filter === "all" || p.status === filter)
    .filter((p) =>
      `${p.title} ${p.script}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (selected) return <PieceEditor key={selected.id} piece={selected} />;
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>Las ideas toman forma aquí.</h1>
          <p>
            Guiones editables, contexto de audiencia y un espacio para revisar
            en equipo.
          </p>
        </div>
        <Button
          variant="primary"
          disabled={state.brand.role === "reviewer"}
          onClick={() => setNewPiece(true)}
        >
          <Plus size={17} />
          Crear contenido
        </Button>
      </div>
      <div className="tabs studio-tabs">
        {[
          ["all", "Todas las piezas"],
          ["draft", "Borradores"],
          ["review", "En revisión"],
          ["approved", "Aprobadas"],
          ["scheduled", "Programadas"],
        ].map(([v, l]) => (
          <button
            key={v}
            className={filter === v ? "active" : ""}
            onClick={() => setFilter(v)}
          >
            {l}
          </button>
        ))}
      </div>
      {pieces.length ? (
        <div className="piece-grid">
          {pieces.map((p) => (
            <article className="card piece-card" key={p.id}>
              <div className="piece-card-top">
                <span className={`format-icon ${p.format}`}>
                  <FileText size={21} />
                </span>
                <Badge
                  tone={
                    p.status === "approved" || p.status === "published"
                      ? "green"
                      : p.status === "review"
                        ? "amber"
                        : "neutral"
                  }
                >
                  {pieceStatusLabel(p)}
                </Badge>
              </div>
              <button
                className="piece-open"
                onClick={() => navigate("studio", p.id)}
              >
                <h2>{p.title}</h2>
                <span className="piece-format">
                  {formatNames[p.format]} · {p.channel}
                </span>
                <p>{p.hook || p.script.slice(0, 150)}</p>
              </button>
              <div className="piece-footer">
                <span>
                  {p.segmentId
                    ? state.brand.audience.find((s) => s.id === p.segmentId)
                        ?.name || "Audiencia no disponible"
                    : "Audiencia general"}
                </span>
                <button
                  className="text-button"
                  onClick={() => navigate("studio", p.id)}
                >
                  Abrir guion
                  <ArrowRight size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Clapperboard size={28} />}
          title="Tu siguiente pieza empieza con un ángulo"
          action={
            <Button
              variant="primary"
              disabled={state.brand.role === "reviewer"}
              onClick={() => setNewPiece(true)}
            >
              Crear mi primer guion
            </Button>
          }
        >
          Convierte una referencia en una estructura editable, o comienza con
          una idea propia.
        </EmptyState>
      )}
      {newPiece && <NewDraft onClose={() => setNewPiece(false)} />}
    </div>
  );
}

function NewDraft({ onClose }: { onClose: () => void }) {
  const { state, refresh, notify, navigate } = useWorkspace();
  const controlStyle = { fontSize: 16 };
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [format, setFormat] = useState<Piece["format"]>("post"),
    [createdPiece, setCreatedPiece] = useState<Piece | null>(null);
  function closeWhenIdle() {
    if (!busy) onClose();
  }
  return (
    <Modal title="Démosle forma a tu próxima pieza" onClose={closeWhenIdle}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            const result = await createThenRefresh(
              createdPiece,
              () =>
                api<Piece>(`/api/brands/${state.brand.id}/draft`, {
                  method: "POST",
                  body: json({
                    referenceId: f.get("referenceId") || undefined,
                    segmentId: f.get("segmentId") || undefined,
                    format: f.get("format"),
                    channel: f.get("channel"),
                    topic: f.get("topic") || undefined,
                    cta: f.get("cta") || undefined,
                    ...(f.get("unitCount")
                      ? { unitCount: Number(f.get("unitCount")) }
                      : {}),
                    ...(f.get("includeExample")
                      ? { includeExample: f.get("includeExample") === "yes" }
                      : {}),
                    instructions: f.get("instructions"),
                  }),
                }),
              refresh,
            );
            if (result.status === "refresh-failed") {
              setCreatedPiece(result.piece);
              setError(
                `El guion “${result.piece.title}” ya se creó, pero no pudimos actualizar la lista. Reintenta la actualización para abrir el guion; no se generará otro guion.`,
              );
              return;
            }
            onClose();
            navigate("studio", result.piece.id);
            notify("Primer guion listo. Hazlo tuyo.");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Referencia de origen (opcional)">
          <select
            name="referenceId"
            style={controlStyle}
            disabled={busy || !!createdPiece}
          >
            <option value="">Partir de una idea propia</option>
            {state.references
              .filter((r) => r.status !== "dismissed")
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Tema (opcional)">
          <input
            name="topic"
            style={controlStyle}
            maxLength={200}
            placeholder="Por ejemplo: una bitácora de faltantes de inventario"
            disabled={busy || !!createdPiece}
          />
        </Field>
        <Field label="Tu dirección editorial">
          <textarea
            name="instructions"
            style={controlStyle}
            placeholder="¿Qué quieres contar, desde qué ángulo y qué debería llevarse la audiencia?"
            aria-describedby={
              state.integrations.ai.configured
                ? undefined
                : "draft-directions-help"
            }
            rows={4}
            disabled={busy || !!createdPiece}
          />
        </Field>
        {!state.integrations.ai.configured && (
          <p className="small muted" id="draft-directions-help">
            Las notas libres se conservan en un brief para revisión manual. Usa
            los controles de abajo para aplicar el CTA y la estructura.
          </p>
        )}
        <div className="form-grid">
          <Field label="Formato">
            <select
              name="format"
              style={controlStyle}
              value={format}
              onChange={(event) =>
                setFormat(event.target.value as Piece["format"])
              }
              disabled={busy || !!createdPiece}
            >
              <option value="post">Post</option>
              <option value="carousel">Carrusel</option>
              <option value="reel">Guion de reel</option>
              <option value="video">Guion de video</option>
              <option value="newsletter">Newsletter</option>
            </select>
          </Field>
          <Field label="Canal">
            <select
              name="channel"
              style={controlStyle}
              disabled={busy || !!createdPiece}
            >
              <option value="linkedin">LinkedIn</option>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="youtube">YouTube</option>
            </select>
          </Field>
        </div>
        <Field label="Llamado a la acción exacto (opcional)">
          <input
            name="cta"
            style={controlStyle}
            maxLength={2000}
            placeholder="Por ejemplo: Descarga la plantilla de inventario."
            disabled={busy || !!createdPiece}
          />
        </Field>
        {["carousel", "reel", "video"].includes(format) && (
          <Field
            label={
              format === "carousel"
                ? "Cantidad de láminas"
                : "Cantidad de escenas"
            }
          >
            <select
              name="unitCount"
              style={controlStyle}
              disabled={busy || !!createdPiece}
            >
              <option value="">Automática (5 por defecto)</option>
              {[3, 4, 5, 6, 7, 8].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Ejemplo hipotético">
          <select
            name="includeExample"
            style={controlStyle}
            disabled={busy || !!createdPiece}
          >
            <option value="">Según las notas</option>
            <option value="yes">Incluir</option>
            <option value="no">Omitir</option>
          </select>
        </Field>
        <Field label="Audiencia">
          <select
            name="segmentId"
            style={controlStyle}
            disabled={busy || !!createdPiece}
          >
            <option value="">Audiencia general de la marca</option>
            {state.brand.audience.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="callout">
          <Sparkles size={18} />
          <p>
            {state.integrations.ai.configured
              ? "Usará tu proveedor de IA configurado."
              : "Usará una estructura local con tu audiencia, formato y controles elegidos. El resto del brief requiere revisión manual. Puedes conectar IA desde Configuración."}
          </p>
        </div>
        {!state.integrations.ai.configured && (
          <details className="small">
            <summary>
              Indicaciones simples que también reconoce en las notas
            </summary>
            <p>
              «4 láminas» o «3 escenas» (de 3 a 8), «ejemplo hipotético» y «CTA
              final exacto: “Tu texto.”». Para newsletter: «secciones: Registrar
              y Revisar» (de 2 a 8 títulos cortos). Los controles elegidos
              tienen prioridad y el formato siempre es el del selector.
            </p>
          </details>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button variant="primary" type="submit" busy={busy}>
          {createdPiece ? <ArrowRight size={16} /> : <Sparkles size={16} />}
          {createdPiece ? "Reintentar actualización" : "Preparar primer guion"}
        </Button>
      </form>
    </Modal>
  );
}

function PieceEditor({ piece }: { piece: Piece }) {
  const { state, refresh, notify, navigate, registerUnsavedChangesGuard } =
    useWorkspace();
  const [editor, setEditor] = useState<PieceEditorState>(() => ({
    draft: piece,
    baseline: piece,
    conflict: false,
  }));
  const { draft, baseline, conflict: editorConflict } = editor;
  const [busy, setBusy] = useState(""),
    [comment, setComment] = useState(""),
    [approvalConflict, setApprovalConflict] = useState(""),
    [conflictLoadFailed, setConflictLoadFailed] = useState(false),
    [schedule, setSchedule] = useState(false),
    [tab, setTab] = useState("script");
  const dirty = isPieceEditorDirty(draft, baseline);
  const missingAudience =
    !!draft.segmentId &&
    !state.brand.audience.some((segment) => segment.id === draft.segmentId);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const leaveGuardRef = useRef({
    isDirty: () => dirtyRef.current,
    confirmLeave: () =>
      !dirtyRef.current ||
      window.confirm(
        "Hay cambios sin guardar. ¿Salir y descartar tus cambios locales?",
      ),
  });
  useEffect(
    () => registerUnsavedChangesGuard(leaveGuardRef.current),
    [registerUnsavedChangesGuard],
  );
  useEffect(() => {
    setEditor((current) => reconcilePieceEditor(current, piece));
  }, [piece]);
  function setDraft(next: Piece) {
    setEditor((current) => ({ ...current, draft: next }));
  }
  function acceptSavedPiece(saved: Piece) {
    setEditor({ draft: saved, baseline: saved, conflict: false });
    setConflictLoadFailed(false);
    setApprovalConflict("");
  }
  const readonly =
      state.brand.role === "reviewer" || piece.status === "published",
    blockedByConflict = editorConflict;
  const approvalBlocked =
    blockedByConflict || (!!approvalConflict && conflictLoadFailed);
  async function persist() {
    const {
      title,
      hook,
      script,
      caption,
      cta,
      segmentId,
      channel,
      format,
      assetIds,
      assignee,
    } = draft;
    const saved = await api<Piece>(
      `/api/brands/${state.brand.id}/pieces/${piece.id}`,
      {
        method: "PATCH",
        body: json({
          title,
          hook,
          script,
          caption,
          cta,
          segmentId: segmentId || null,
          channel,
          format,
          assetIds,
          assignee: assignee || "",
          expectedEditVersion: baseline.approvalVersion,
          ...(["approved", "scheduled"].includes(piece.status)
            ? { status: "draft", scheduledFor: null }
            : {}),
        }),
      },
    );
    return saved;
  }
  async function handleEditConflict() {
    setEditor((current) => ({ ...current, conflict: true }));
    let refreshed = false;
    try {
      await refresh();
      refreshed = true;
    } catch {
      // Keep the local draft and make the failed refresh explicit.
    }
    setConflictLoadFailed(!refreshed);
    notify(
      refreshed
        ? "La pieza cambió en el servidor. Conservamos tus cambios locales; revísalos antes de guardarlos."
        : "La pieza cambió en el servidor y no pudimos cargar la versión actual. Tus cambios locales siguen abiertos.",
      "error",
    );
  }
  async function reloadConflict() {
    setBusy("reload-conflict");
    try {
      await refresh();
      setConflictLoadFailed(false);
      setApprovalConflict((current) =>
        current
          ? "La pieza cambió desde que la abriste. Cargamos la versión actual; revísala antes de volver a aprobar."
          : current,
      );
    } catch {
      setConflictLoadFailed(true);
      notify(
        "No pudimos cargar la versión actual. Inténtalo de nuevo.",
        "error",
      );
    } finally {
      setBusy("");
    }
  }
  function discardLocalDraft() {
    if (
      !window.confirm(
        "Se descartarán tus cambios locales y se cargará la versión actual. ¿Continuar?",
      )
    )
      return;
    setEditor({ draft: piece, baseline: piece, conflict: false });
    setConflictLoadFailed(false);
    setApprovalConflict("");
  }
  async function save() {
    if (blockedByConflict) return;
    setBusy("save");
    try {
      const saved = await persist();
      acceptSavedPiece(saved);
      await refresh();
      notify("Cambios guardados.");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) await handleEditConflict();
      else notify((e as Error).message, "error");
    } finally {
      setBusy("");
    }
  }
  async function review(action: string) {
    if (blockedByConflict) {
      notify(
        "Tus cambios locales están en conflicto. Expórtalos o carga la versión actual antes de continuar.",
        "error",
      );
      return;
    }
    setBusy(action);
    setApprovalConflict("");
    let dirtyWriteInProgress = false;
    try {
      let expectedApprovalVersion = baseline.approvalVersion;
      if (dirty && !readonly) {
        dirtyWriteInProgress = true;
        const saved = await persist();
        dirtyWriteInProgress = false;
        expectedApprovalVersion = saved.approvalVersion;
        acceptSavedPiece(saved);
      }
      if (action === "submit")
        await api(`/api/brands/${state.brand.id}/pieces/${piece.id}`, {
          method: "PATCH",
          body: json({ status: "review" }),
        });
      else
        await api(`/api/brands/${state.brand.id}/pieces/${piece.id}/review`, {
          method: "POST",
          body: json({
            action,
            comment: comment || undefined,
            ...(action === "approve" ? { expectedApprovalVersion } : {}),
          }),
        });
      await refresh();
      setConflictLoadFailed(false);
      setComment("");
      notify(
        action === "approve"
          ? "Pieza aprobada. Lista para la grilla."
          : action === "submit"
            ? "Pieza enviada a revisión."
            : "Cambios solicitados.",
      );
    } catch (e) {
      if (dirtyWriteInProgress && e instanceof ApiError && e.status === 409) {
        await handleEditConflict();
      } else if (
        action === "approve" &&
        e instanceof ApiError &&
        e.status === 409
      ) {
        let refreshed = false;
        try {
          await refresh();
          refreshed = true;
        } catch {
          // Keep the conflict visible even if the follow-up load also fails.
        }
        setApprovalConflict(
          refreshed
            ? "La pieza cambió desde que la abriste. Cargamos la versión actual; revísala antes de volver a aprobar."
            : "La pieza cambió desde que la abriste y no pudimos cargar la versión actual. Recarga el espacio antes de volver a aprobar.",
        );
        setConflictLoadFailed(!refreshed);
      } else if (e instanceof ApiError && e.status === 409 && dirty)
        await handleEditConflict();
      else notify((e as Error).message, "error");
    } finally {
      setBusy("");
    }
  }
  function exportPiece() {
    const reference = state.references.find((r) => r.id === draft.referenceId);
    const attribution = formatProviderAttributions(
      reference,
      piece,
      piece.editorialBrief,
    );
    download(
      `${draft.title.slice(0, 60)}.md`,
      `# ${draft.title}\n\n${formatNames[draft.format]} · ${draft.channel}\n\n## Gancho\n${draft.hook}\n\n## Guion\n${draft.script}\n\n## Caption\n${draft.caption}\n\n## Llamado a la acción\n${draft.cta}\n\nFuente: ${reference?.url || piece.editorialBrief?.referenceUrl || "Idea propia"}\n${attribution ? `${attribution}\n` : ""}`,
      "text/markdown",
    );
  }
  return (
    <div className="page editor-page">
      <button className="back-link" onClick={() => navigate("studio")}>
        <ArrowLeft size={15} />
        Todas las piezas
      </button>
      <div className="page-heading editor-heading">
        <div>
          <h1>{draft.title}</h1>
          <div className="row">
            <Badge
              tone={
                piece.status === "approved"
                  ? "green"
                  : piece.status === "review"
                    ? "amber"
                    : "neutral"
              }
            >
              {pieceStatusLabel(piece)}
            </Badge>
            <span className="small muted">
              {dirty
                ? "Cambios sin guardar"
                : `Actualizado ${timeAgo(piece.updatedAt)}`}
            </span>
            <Badge>
              {piece.generationEngine === "ai"
                ? "Asistencia IA"
                : "Estructura local"}
            </Badge>
          </div>
        </div>
        <div className="row">
          <Button onClick={exportPiece}>
            <Download size={16} />
            Exportar
          </Button>
          <Button
            variant="primary"
            busy={busy === "save"}
            disabled={readonly || !dirty || !!busy || blockedByConflict}
            onClick={() => void save()}
          >
            <Save size={16} />
            Guardar cambios
          </Button>
        </div>
      </div>
      {editorConflict && (
        <section
          className="card editor-conflict"
          aria-label="Conflicto de edición"
        >
          <p className="form-error" role="alert">
            Otra persona guardó una versión nueva mientras tenías cambios sin
            guardar. Conservamos tu borrador local y bloqueamos el guardado y la
            aprobación para no sobrescribir la versión actual. Puedes exportar
            tus cambios o revisar la versión del servidor y cargarla después de
            confirmar que quieres descartar tu borrador.
          </p>
          {conflictLoadFailed ? (
            <p className="small muted">
              No pudimos cargar la versión actual. Tus cambios siguen aquí.
            </p>
          ) : (
            <details>
              <summary>Ver la versión actual del servidor</summary>
              <div className="stack small">
                <p>
                  <strong>{piece.title}</strong>
                </p>
                <p>
                  <strong>Gancho:</strong> {piece.hook}
                </p>
                <p>
                  <strong>Guion:</strong> {piece.script}
                </p>
                <p>
                  <strong>Caption:</strong> {piece.caption}
                </p>
                <p>
                  <strong>Llamado a la acción:</strong> {piece.cta}
                </p>
              </div>
            </details>
          )}
          <div className="row">
            <Button onClick={exportPiece}>Exportar mis cambios</Button>
            <Button
              busy={busy === "reload-conflict"}
              disabled={!!busy}
              onClick={() => void reloadConflict()}
            >
              Recargar versión actual
            </Button>
            <Button
              disabled={conflictLoadFailed || !!busy}
              onClick={discardLocalDraft}
            >
              Descartar mis cambios y cargar la versión actual
            </Button>
          </div>
        </section>
      )}
      {missingAudience && (
        <p className="callout" role="alert">
          La audiencia asociada ya no está disponible. El contenido de esta
          pieza se conserva; elige Audiencia general u otra audiencia para poder
          guardar.
        </p>
      )}
      {piece.editorialBrief && (
        <details
          className="callout"
          style={{ display: "block", overflowWrap: "anywhere" }}
        >
          <summary>
            Brief y revisión pendiente (fuera del texto publicable)
          </summary>
          <div className="stack small" style={{ maxWidth: "75ch" }}>
            {piece.editorialBrief.notes.map((note, index) => (
              <p key={index}>{note}</p>
            ))}
            <p>
              <strong>Controles aplicados:</strong>{" "}
              {formatNames[piece.editorialBrief.applied.format]}
              {piece.editorialBrief.applied.unitCount
                ? ` · ${piece.editorialBrief.applied.unitCount} ${piece.editorialBrief.applied.format === "carousel" ? "láminas" : "escenas"}`
                : ""}
              {piece.editorialBrief.applied.includeExample
                ? " · ejemplo hipotético"
                : ""}
              {piece.editorialBrief.applied.sectionTitles
                ? ` · ${piece.editorialBrief.applied.sectionTitles.join(", ")}`
                : ""}
            </p>
            <p>
              <strong>CTA aplicado al crear:</strong>{" "}
              {piece.editorialBrief.applied.cta}
            </p>
            <p>
              <strong>Necesidad de audiencia:</strong>{" "}
              {piece.editorialBrief.audienceNeeds}
            </p>
            {piece.editorialBrief.instructions && (
              <div>
                <strong>Dirección editorial original:</strong>
                <p style={{ whiteSpace: "pre-wrap" }}>
                  {piece.editorialBrief.instructions}
                </p>
              </div>
            )}
            {piece.editorialBrief.angle && (
              <p>
                <strong>Ángulo de partida para revisar:</strong>{" "}
                {piece.editorialBrief.angle}
              </p>
            )}
            {piece.editorialBrief.referenceUrl && (
              <p>
                <strong>Procedencia:</strong>{" "}
                {piece.editorialBrief.referenceUrl}
              </p>
            )}
          </div>
        </details>
      )}
      <ProviderCredits reference={piece} />
      <div className="editor-layout">
        <section className="card script-editor">
          <div className="editor-tabs tabs">
            <button
              className={tab === "script" ? "active" : ""}
              onClick={() => setTab("script")}
            >
              <SquarePen size={15} />
              Guion y enfoque
            </button>
            <button
              className={tab === "resources" ? "active" : ""}
              onClick={() => setTab("resources")}
            >
              Recursos
            </button>
            <button
              className={tab === "comments" ? "active" : ""}
              onClick={() => setTab("comments")}
            >
              <MessageSquare size={15} />
              Comentarios ({piece.comments?.length || 0})
            </button>
          </div>
          {tab === "script" ? (
            <div className="stack editor-fields">
              <fieldset disabled={readonly || !!busy}>
                <Field
                  label="Título de trabajo"
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
                <div className="form-grid">
                  <Field label="Canal">
                    <select
                      value={draft.channel}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          channel: e.target.value as Piece["channel"],
                        })
                      }
                    >
                      {["linkedin", "instagram", "tiktok", "youtube"].map(
                        (v) => (
                          <option key={v}>{v}</option>
                        ),
                      )}
                    </select>
                  </Field>
                  <Field label="Audiencia">
                    <select
                      value={draft.segmentId || ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          segmentId: e.target.value || undefined,
                        })
                      }
                    >
                      {missingAudience && (
                        <option value={draft.segmentId}>
                          Audiencia no disponible — reasigna
                        </option>
                      )}
                      <option value="">General</option>
                      {state.brand.audience.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Gancho · la primera razón para quedarse">
                  <textarea
                    rows={2}
                    value={draft.hook}
                    onChange={(e) =>
                      setDraft({ ...draft, hook: e.target.value })
                    }
                  />
                </Field>
                <Field label="Guion o cuerpo del contenido">
                  <textarea
                    className="script-textarea"
                    rows={15}
                    value={draft.script}
                    onChange={(e) =>
                      setDraft({ ...draft, script: e.target.value })
                    }
                  />
                </Field>
                <Field label="Caption o texto de acompañamiento">
                  <textarea
                    rows={4}
                    value={draft.caption}
                    onChange={(e) =>
                      setDraft({ ...draft, caption: e.target.value })
                    }
                  />
                </Field>
                <Field
                  label="Llamado a la acción"
                  value={draft.cta}
                  onChange={(e) => setDraft({ ...draft, cta: e.target.value })}
                />
                <Field label="Responsable">
                  <select
                    value={draft.assignee || ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        assignee: e.target.value || undefined,
                      })
                    }
                  >
                    <option value="">Sin asignar</option>
                    {state.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </fieldset>
            </div>
          ) : tab === "resources" ? (
            <div className="editor-fields">
              <h3>Material asociado a esta pieza</h3>
              <p className="muted">
                Selecciona recursos de tu biblioteca y guarda los cambios.
              </p>
              {state.assets.length ? (
                <div className="asset-picker">
                  {state.assets.map((a) => (
                    <label key={a.id}>
                      <input
                        type="checkbox"
                        disabled={readonly || !!busy}
                        checked={draft.assetIds.includes(a.id)}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            assetIds: e.target.checked
                              ? [...draft.assetIds, a.id]
                              : draft.assetIds.filter((id) => id !== a.id),
                          })
                        }
                      />
                      {a.type === "image" ? (
                        <img src={a.url} alt="" />
                      ) : (
                        <FileText size={20} />
                      )}
                      <span>{a.name}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Primero, un poco de material"
                  action={
                    <Button onClick={() => navigate("assets")}>
                      Ir a la biblioteca
                    </Button>
                  }
                >
                  Sube tus recursos de marca para asociarlos a esta pieza.
                </EmptyState>
              )}
              <p className="small muted">
                Asocia los archivos que usarás al producir y publicar esta
                pieza.
              </p>
            </div>
          ) : (
            <div className="editor-fields">
              <div className="comments-list">
                {piece.comments?.length ? (
                  piece.comments.map((c) => (
                    <div className="comment" key={c.id}>
                      <span className="user-avatar">
                        {c.author.slice(0, 1)}
                      </span>
                      <div>
                        <strong>{c.author}</strong>
                        <small>{timeAgo(c.createdAt)}</small>
                        <p>{c.text}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="muted">
                    Deja el primer comentario para tu equipo.
                  </p>
                )}
              </div>
              <form
                className="stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!comment.trim()) return;
                  if (blockedByConflict) return;
                  setBusy("comment");
                  try {
                    if (dirty && !readonly) {
                      const saved = await persist();
                      acceptSavedPiece(saved);
                    }
                    await api(
                      `/api/brands/${state.brand.id}/pieces/${piece.id}/comments`,
                      { method: "POST", body: json({ text: comment }) },
                    );
                    await refresh();
                    setComment("");
                  } catch (e) {
                    if (e instanceof ApiError && e.status === 409 && dirty)
                      await handleEditConflict();
                    else notify((e as Error).message, "error");
                  } finally {
                    setBusy("");
                  }
                }}
              >
                <textarea
                  aria-label="Comentario para el equipo"
                  disabled={!!busy}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="¿Qué mejorarías de esta pieza?"
                  rows={3}
                  required
                />
                <Button
                  type="submit"
                  busy={busy === "comment"}
                  disabled={!comment.trim() || !!busy || blockedByConflict}
                >
                  Agregar comentario
                </Button>
              </form>
            </div>
          )}
        </section>
        <aside className="editor-sidebar">
          <div className="card post-preview">
            <div className="preview-title">
              <EyeIcon />
              VISTA PREVIA DEL TEXTO
            </div>
            <div className="post-author">
              <span style={{ background: state.brand.color }}>
                {state.brand.name.slice(0, 1)}
              </span>
              <div>
                <strong>{state.brand.name}</strong>
                <small>
                  {draft.channel} · {pieceStatusLabel(piece)}
                </small>
              </div>
              <MoreHorizontal size={18} />
            </div>
            <div className="post-copy">
              <strong>{draft.hook}</strong>
              <p>{draft.script}</p>
              <p>{draft.cta}</p>
            </div>
            <div className="post-preview-bottom">
              <Heart size={17} />
              <MessageSquare size={17} />
              <Send size={17} />
              <Bookmark size={17} />
            </div>
          </div>
          <div
            className={`insight-card review-card ${["approved", "scheduled", "published"].includes(piece.status) ? "publication-review" : ""}`}
          >
            {approvalConflict && (
              <div className="stack">
                <p className="form-error" role="alert">
                  {approvalConflict}
                </p>
                {conflictLoadFailed && (
                  <Button
                    disabled={!!busy}
                    onClick={() => void reloadConflict()}
                  >
                    Reintentar carga de la versión actual
                  </Button>
                )}
              </div>
            )}
            <h3>El siguiente paso</h3>
            {piece.status === "draft" ? (
              <>
                <p>
                  Revisa hechos, enfoque y voz de marca antes de pedir
                  aprobación.
                </p>
                <Button
                  variant="primary"
                  disabled={readonly || !!busy}
                  busy={busy === "submit"}
                  onClick={() => void review("submit")}
                >
                  <Send size={16} />
                  Enviar a revisión
                </Button>
              </>
            ) : piece.status === "review" ? (
              <>
                <p>
                  Confirma que la pieza está lista para sumarse al plan
                  editorial.
                </p>
                <Button
                  variant="primary"
                  disabled={
                    state.brand.role === "editor" || !!busy || approvalBlocked
                  }
                  busy={busy === "approve"}
                  onClick={() => void review("approve")}
                >
                  <CheckCircle2 size={16} />
                  Aprobar pieza
                </Button>
                <Button
                  disabled={
                    state.brand.role === "editor" || !!busy || approvalBlocked
                  }
                  busy={busy === "request_changes"}
                  onClick={() => void review("request_changes")}
                >
                  Solicitar cambios
                </Button>
              </>
            ) : piece.status === "approved" ? (
              <>
                <p>
                  Ya tiene aprobación. Puedes enviarla ahora o elegir un espacio
                  en tu grilla.
                </p>
                <Button
                  disabled={readonly || !!busy}
                  onClick={() => setSchedule(true)}
                >
                  Planificar publicación
                </Button>
              </>
            ) : (
              <>
                <p>
                  {piece.status === "scheduled"
                    ? "Esta pieza está incluida en la grilla. El calendario organiza; no publica automáticamente."
                    : "El envío mediante conector quedó registrado. Consulta el recibo."}
                </p>
                <Button onClick={() => navigate("calendar")}>
                  Ver en la grilla
                </Button>
              </>
            )}
            {["approved", "scheduled", "published"].includes(piece.status) && (
              <PublishPiece
                piece={piece}
                disabled={!!busy || dirty || approvalBlocked}
                onBusyChange={(sending) => setBusy(sending ? "publish" : "")}
                onPublished={acceptSavedPiece}
              />
            )}
          </div>
        </aside>
      </div>
      {schedule && (
        <ScheduleModal piece={piece} onClose={() => setSchedule(false)} />
      )}
    </div>
  );
}
function EyeIcon() {
  return <Eye size={16} />;
}

export function ScheduleModal({
  piece,
  onClose,
}: {
  piece: Piece;
  onClose: () => void;
}) {
  const { state, refresh, notify } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const target = piece.scheduledFor
    ? new Date(piece.scheduledFor)
    : new Date(Date.now() + 86400000);
  const defaultDate = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}T${String(target.getHours()).padStart(2, "0")}:${String(target.getMinutes()).padStart(2, "0")}`;
  return (
    <Modal title="Dale un lugar en la grilla" onClose={onClose}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await api(`/api/brands/${state.brand.id}/pieces/${piece.id}`, {
              method: "PATCH",
              body: json({
                status: "scheduled",
                scheduledFor: new Date(String(f.get("date"))).toISOString(),
              }),
            });
            await refresh();
            onClose();
            notify("Pieza añadida a tu grilla editorial.");
          } catch (e) {
            notify((e as Error).message, "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h3>{piece.title}</h3>
        <Field
          label={`Fecha y hora · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`}
          name="date"
          type="datetime-local"
          required
          defaultValue={defaultDate}
        />
        <p className="muted small">
          La grilla no publica automáticamente. Usa Enviar ahora desde la pieza
          para un conector, o publica desde tu canal y registra el enlace en
          Resultados.
        </p>
        <Button variant="primary" type="submit" busy={busy}>
          Guardar en la grilla
        </Button>
      </form>
    </Modal>
  );
}
