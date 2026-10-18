import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, FilePlus2 } from "lucide-react";
import { Button, Field } from "../components/ui";
import { api, json } from "../lib/api";
import { formatNames } from "../lib/format";
import type { Opportunity } from "../lib/journey-types";
import { opportunityDraftReferenceId } from "../lib/opportunity-draft-reference";
import type { Piece } from "../lib/types";
import { useWorkspace } from "../lib/workspace";

const channelNames: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

export function ReportDraft({
  opportunity,
  selectedSegment,
}: {
  opportunity: Opportunity;
  selectedSegment: string;
}) {
  const { state, refresh, navigate, registerUnsavedChangesGuard } =
    useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Piece | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(
    () =>
      registerUnsavedChangesGuard({
        isDirty: () => pending.current,
        confirmLeave: () => !pending.current,
      }),
    [registerUnsavedChangesGuard],
  );
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || created) return;
    const form = new FormData(event.currentTarget);
    const referenceId = opportunityDraftReferenceId(
      opportunity,
      opportunity.analysis || null,
      state.references,
    );
    if (!referenceId) {
      setError("Añade una referencia utilizable antes de crear el borrador.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const piece = await api<Piece>(`/api/brands/${state.brand.id}/draft`, {
        method: "POST",
        body: json({
          referenceId,
          segmentId: String(form.get("segmentId") || ""),
          format: String(form.get("format")),
          channel: String(form.get("channel")),
          instructions:
            opportunity.analysis?.adaptation || opportunity.adaptation,
        }),
      });
      if (!mounted.current) return;
      setCreated(piece);
      try {
        await refresh();
      } catch {
        if (mounted.current)
          setError(
            "El borrador está guardado. Puedes abrirlo; la lista no pudo actualizarse.",
          );
        return;
      }
      pending.current = false;
      if (mounted.current) navigate("studio", piece.id);
    } catch (reason) {
      if (mounted.current) setError((reason as Error).message);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const initialSegment =
    selectedSegment ||
    opportunity.segmentIds.find((id) =>
      state.brand.audience.some((segment) => segment.id === id),
    ) ||
    "";
  return (
    <details className="report-create-piece">
      <summary>Crear una pieza a partir de esta propuesta</summary>
      {created ? (
        <Button onClick={() => navigate("studio", created.id)}>
          <ArrowUpRight size={16} />
          Abrir borrador guardado
        </Button>
      ) : (
        <form onSubmit={(event) => void create(event)}>
          <fieldset disabled={busy} className="form-grid">
            <Field label="Audiencia">
              <select
                name="segmentId"
                defaultValue={initialSegment}
                key={initialSegment}
                required
              >
                <option value="" disabled>
                  Elegir audiencia
                </option>
                {state.brand.audience.map((segment) => (
                  <option key={segment.id} value={segment.id}>
                    {segment.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Formato">
              <select name="format" defaultValue={opportunity.suggestedFormat}>
                {["post", "carousel", "reel", "video", "newsletter"].map(
                  (format) => (
                    <option value={format} key={format}>
                      {formatNames[format]}
                    </option>
                  ),
                )}
              </select>
            </Field>
            <Field label="Canal">
              <select
                name="channel"
                defaultValue={opportunity.suggestedChannel}
              >
                {["linkedin", "instagram", "tiktok", "youtube"].map(
                  (channel) => (
                    <option value={channel} key={channel}>
                      {channelNames[channel]}
                    </option>
                  ),
                )}
              </select>
            </Field>
          </fieldset>
          <div className="report-draft-action">
            <Button type="submit" variant="primary" busy={busy}>
              <FilePlus2 size={16} />
              Crear borrador
            </Button>
            <span className="small muted">
              {state.integrations.ai.ready
                ? "Con el contexto y las fuentes de esta propuesta"
                : "Borrador local · IA no disponible"}
            </span>
          </div>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
