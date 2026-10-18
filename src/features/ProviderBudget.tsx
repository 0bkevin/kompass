import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useWorkspace } from "../lib/workspace";
import { Button } from "../components/ui";

interface BudgetState {
  configured: boolean;
  budget: null | {
    dailyBudgetUsd: number;
    monthlyBudgetUsd: number;
    dailyReservedUsd: number;
    monthlyReservedUsd: number;
    paused: boolean;
    note: string;
  };
}
export function ProviderBudget() {
  const { state } = useWorkspace();
  const [data, setData] = useState<BudgetState | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void api<BudgetState>(`/api/brands/${state.brand.id}/social/budget`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError((cause as Error).message);
      });
    return () => controller.abort();
  }, [state.brand.id, revision]);
  return (
    <details
      className="provider-budget"
      aria-label="Reservas y límites de Apify"
    >
      <summary>Reservas de Apify</summary>
      <div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : !data ? (
          <p role="status">Consultando límites…</p>
        ) : data.budget ? (
          <>
            <p>
              <strong>Recopilación bloqueada</strong>
            </p>
            <dl>
              <div>
                <dt>Hoy</dt>
                <dd>
                  USD {data.budget.dailyReservedUsd.toFixed(2)} reservados de{" "}
                  {data.budget.dailyBudgetUsd.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt>Este mes</dt>
                <dd>
                  USD {data.budget.monthlyReservedUsd.toFixed(2)} reservados de{" "}
                  {data.budget.monthlyBudgetUsd.toFixed(2)}
                </dd>
              </div>
            </dl>
            <p>{data.budget.note}</p>
          </>
        ) : (
          <p>Apify no configurado.</p>
        )}
        <Button onClick={() => setRevision((value) => value + 1)}>
          Actualizar límites
        </Button>
      </div>
    </details>
  );
}
