import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api, json } from "../lib/api";
import { Button } from "../components/ui";
import { useWorkspace } from "../lib/workspace";

type Preparation = {
  status:
    "ready" | "partial" | "failed" | "existing" | "unavailable" | "example";
  added: number;
  errors: string[];
};

export function WorkspacePreparation({ enabled }: { enabled: boolean }) {
  const { state, refresh } = useWorkspace();
  const brandId = state.brand.id;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Preparation | null>(null);
  const requested = useRef("");
  const shouldPrepare = enabled && !state.brand.isDemo;
  const activeBrand = useRef(brandId);
  activeBrand.current = brandId;

  useEffect(() => {
    setResult(null);
    setError("");
    setBusy(false);
  }, [brandId]);

  useEffect(() => {
    if (!shouldPrepare || requested.current === brandId) return;
    requested.current = brandId;
    let active = true;
    setBusy(true);
    void api<Preparation>(`/api/brands/${brandId}/prepare`, {
      method: "POST",
      body: json({}),
    })
      .then(async (preparation) => {
        if (!active) return;
        setResult(preparation);
        await refresh();
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "No pudimos consultar las fuentes.",
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
      requested.current = "";
    };
  }, [brandId, shouldPrepare, refresh]);

  async function retry() {
    setBusy(true);
    setError("");
    try {
      const response = await api<{
        added: number;
        errors: string[];
        sources: { error?: string; skipped?: boolean }[];
      }>(`/api/brands/${brandId}/discover`, { method: "POST", body: json({}) });
      if (activeBrand.current !== brandId) return;
      setResult({
        status: response.sources.every(
          (source) => source.error || source.skipped,
        )
          ? "failed"
          : response.errors.length
            ? "partial"
            : "ready",
        added: response.added,
        errors: response.errors,
      });
      await refresh();
    } catch (cause) {
      if (activeBrand.current !== brandId) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos consultar las fuentes.",
      );
    } finally {
      if (activeBrand.current === brandId) setBusy(false);
    }
  }

  if (
    !enabled ||
    state.brand.isDemo ||
    (!busy &&
      !error &&
      (!result || result.status === "existing" || result.status === "example"))
  )
    return null;
  return (
    <div
      className="journey-notice"
      role="status"
      aria-live="polite"
      aria-busy={busy}
    >
      <RefreshCw size={18} aria-hidden="true" />
      <div>
        {busy ? (
          <p>Buscando referencias…</p>
        ) : (
          <>
            {error ? (
              <p>{error}</p>
            ) : (
              result && (
                <p>
                  {result.status === "failed" || result.status === "unavailable"
                    ? "Las fuentes no respondieron."
                    : result.status === "partial"
                      ? `${result.added} referencias nuevas. Algunas fuentes no respondieron.`
                      : result.added > 0
                        ? `${result.added} referencias nuevas.`
                        : "No se encontraron referencias nuevas."}
                </p>
              )
            )}
            {result?.errors.length ? (
              <details>
                <summary>Detalle de fuentes</summary>
                {result?.errors.map((message, index) => (
                  <p key={index}>{message}</p>
                ))}
              </details>
            ) : null}
            {error || result?.errors.length ? (
              <Button onClick={() => void retry()}>Reintentar búsqueda</Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
