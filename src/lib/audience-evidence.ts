import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { AudienceSignal } from "./journey-types";
import { useWorkspace } from "./workspace";

export interface CommunityPoll {
  id: string;
  token: string;
  question: string;
  active: boolean;
  totalResponses: number;
  options: { id: string; label: string }[];
  groups: { id: string; name: string }[];
  results: {
    segmentId: string;
    topic: string;
    count: number;
    sampleSize: number;
  }[];
  publicPath: string;
  createdAt: string;
}

interface Evidence {
  polls: CommunityPoll[];
  signals: AudienceSignal[];
}

export interface AudienceEvidenceResource {
  data?: Evidence;
  loading: boolean;
  error: string;
  refreshedAt?: string;
  reload: () => Promise<void>;
}

/** Questions and their derived signals share a refresh and an error boundary. */
export function useAudienceEvidence(): AudienceEvidenceResource {
  const { state } = useWorkspace();
  const brandId = state.brand.id;
  const currentBrand = useRef(brandId);
  currentBrand.current = brandId;
  const mounted = useRef(false);
  const request = useRef<AbortController | null>(null);
  const lastRequestedAt = useRef(0);
  const [resource, setResource] = useState<{
    brandId: string;
    data?: Evidence;
    loading: boolean;
    error: string;
    refreshedAt?: string;
  }>({ brandId, loading: true, error: "" });

  const reload = useCallback(async () => {
    if (!mounted.current || currentBrand.current !== brandId) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    lastRequestedAt.current = Date.now();
    const isCurrent = () =>
      mounted.current &&
      !controller.signal.aborted &&
      request.current === controller &&
      currentBrand.current === brandId;
    setResource((previous) => ({
      ...(previous.brandId === brandId ? previous : { brandId }),
      loading: true,
      error: "",
    }));
    try {
      const [polls, signals] = await Promise.all([
        api<{ polls: CommunityPoll[] }>(
          `/api/brands/${brandId}/community-polls`,
          { signal: controller.signal },
        ),
        api<{ signals: AudienceSignal[] }>(
          `/api/brands/${brandId}/audience-signals`,
          { signal: controller.signal },
        ),
      ]);
      if (isCurrent())
        setResource({
          brandId,
          data: { polls: polls.polls, signals: signals.signals },
          loading: false,
          error: "",
          refreshedAt: new Date().toISOString(),
        });
    } catch (cause) {
      if (isCurrent())
        setResource((previous) => ({
          ...(previous.brandId === brandId ? previous : { brandId }),
          loading: false,
          error:
            cause instanceof Error
              ? cause.message
              : "No pudimos consultar la evidencia. Inténtalo de nuevo.",
        }));
      controller.abort();
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, [brandId]);

  useEffect(() => {
    mounted.current = true;
    void reload();
    const refreshOnReturn = () => {
      if (
        document.visibilityState === "visible" &&
        !request.current &&
        Date.now() - lastRequestedAt.current >= 30_000
      )
        void reload();
    };
    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      mounted.current = false;
      request.current?.abort();
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [reload]);

  return resource.brandId === brandId
    ? { ...resource, reload }
    : { loading: true, error: "", reload };
}
