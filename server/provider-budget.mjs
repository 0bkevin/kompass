import { createHash, randomUUID } from "node:crypto";
import { db } from "./db.mjs";

const RUN_CENTS = 100;
const LEASE_MS = 120_000;

function fail(message, status = 429) {
  throw Object.assign(new Error(message), { status });
}
function budgetCents(value, fallback, label) {
  const amount = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000)
    fail(
      `Configuración de presupuesto Apify inválida: ${label} debe ser un importe no negativo en USD.`,
      503,
    );
  return Math.floor(amount * 100 + 1e-7);
}
function credentialHash(credential) {
  if (typeof credential !== "string" || !credential.trim())
    fail("Apify necesita una credencial para reservar presupuesto.", 400);
  return createHash("sha256").update(credential.trim()).digest("hex");
}
function periods(now) {
  const date = new Date(now);
  return {
    dayStart: Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
    ),
    monthStart: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
    nextDay: Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + 1,
    ),
    nextMonth: Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1),
  };
}

/** Conservative reservations, never a statement of provider billing.
 * One ledger covers every workspace using the same credential. Reservations
 * remain consumed after errors because a remote actor may already be running.
 */
export function createProviderBudget({
  database = db,
  clock = Date.now,
  env = process.env,
  maxConcurrent = 2,
  maxProviderConcurrent = 4,
} = {}) {
  if (
    ![maxConcurrent, maxProviderConcurrent].every(
      (limit) => Number.isInteger(limit) && limit >= 1 && limit <= 100,
    )
  )
    throw new Error(
      "Los límites de concurrencia deben ser enteros entre 1 y 100.",
    );
  database.exec(`
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS provider_spend (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      credential_hash TEXT NOT NULL,
      reserved_cents INTEGER NOT NULL CHECK(reserved_cents>0),
      reserved_at INTEGER NOT NULL,
      lease_expires_at INTEGER NOT NULL,
      released_at INTEGER,
      state TEXT NOT NULL CHECK(state IN ('reserved','completed','failed'))
    );
    CREATE INDEX IF NOT EXISTS provider_spend_credential ON provider_spend(provider,credential_hash,reserved_at);
    CREATE INDEX IF NOT EXISTS provider_spend_active ON provider_spend(provider,released_at,lease_expires_at);
  `);
  function limits() {
    return {
      daily: budgetCents(
        env.APIFY_DAILY_BUDGET_USD,
        3,
        "APIFY_DAILY_BUDGET_USD",
      ),
      monthly: budgetCents(
        env.APIFY_MONTHLY_BUDGET_USD,
        30,
        "APIFY_MONTHLY_BUDGET_USD",
      ),
    };
  }
  function currentTime() {
    const now = Number(clock());
    if (!Number.isFinite(now) || now < 0 || now > 8_640_000_000_000_000)
      throw new Error("Reloj de presupuesto inválido.");
    return now;
  }
  function usage(hash, now) {
    const { dayStart, monthStart, nextDay, nextMonth } = periods(now);
    const spend = database
      .prepare(
        `
      SELECT
        COALESCE(SUM(CASE WHEN reserved_at>=? AND reserved_at<? THEN reserved_cents ELSE 0 END),0) AS daily,
        COALESCE(SUM(CASE WHEN reserved_at>=? AND reserved_at<? THEN reserved_cents ELSE 0 END),0) AS monthly
      FROM provider_spend WHERE provider='apify' AND credential_hash=? AND reserved_at>=?
    `,
      )
      .get(dayStart, nextDay, monthStart, nextMonth, hash, monthStart);
    const active = database
      .prepare(
        `
      SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN credential_hash=? THEN 1 ELSE 0 END),0) AS credential
      FROM provider_spend WHERE provider='apify' AND released_at IS NULL AND lease_expires_at>?
    `,
      )
      .get(hash, now);
    return {
      ...spend,
      active: active.credential,
      providerActive: active.total,
    };
  }
  function status(credential) {
    const { daily, monthly } = limits();
    const now = currentTime();
    const used = usage(credentialHash(credential), now);
    const { nextDay, nextMonth } = periods(now);
    return {
      dailyBudgetUsd: daily / 100,
      monthlyBudgetUsd: monthly / 100,
      dailyReservedUsd: used.daily / 100,
      monthlyReservedUsd: used.monthly / 100,
      dailyRemainingUsd: Math.max(0, daily - used.daily) / 100,
      monthlyRemainingUsd: Math.max(0, monthly - used.monthly) / 100,
      reservationPerRunUsd: RUN_CENTS / 100,
      activeRuns: used.active,
      maxConcurrent,
      providerActiveRuns: used.providerActive,
      maxProviderConcurrent,
      paused: daily === 0 || monthly === 0,
      resetsDailyAt: new Date(nextDay).toISOString(),
      resetsMonthlyAt: new Date(nextMonth).toISOString(),
      origin: "conservative_reservation",
      note: "Reserva conservadora de USD1 por ejecución, compartida por credencial entre empresas. Incluye intentos fallidos y no equivale al gasto facturado por Apify. El proveedor aplica sus propias condiciones y cargos.",
    };
  }
  function reserve(credential) {
    const hash = credentialHash(credential);
    const { daily, monthly } = limits();
    const now = currentTime();
    database.exec("BEGIN IMMEDIATE");
    try {
      const used = usage(hash, now);
      if (daily === 0 || monthly === 0)
        fail(
          "Apify está pausado: el presupuesto diario o mensual del servidor es USD0. El propietario del servidor puede revisar APIFY_DAILY_BUDGET_USD y APIFY_MONTHLY_BUDGET_USD.",
          402,
        );
      if (used.daily + RUN_CENTS > daily)
        fail(
          `Apify alcanzó su presupuesto diario de reservas (USD${(daily / 100).toFixed(2)}) para esta credencial, compartido entre empresas. No se inició otra ejecución.`,
          402,
        );
      if (used.monthly + RUN_CENTS > monthly)
        fail(
          `Apify alcanzó su presupuesto mensual de reservas (USD${(monthly / 100).toFixed(2)}) para esta credencial, compartido entre empresas. No se inició otra ejecución.`,
          402,
        );
      if (used.active >= maxConcurrent)
        fail(
          `Apify ya tiene ${maxConcurrent} ejecuciones pendientes para esta credencial. Espera hasta 2 minutos antes de reintentar.`,
        );
      if (used.providerActive >= maxProviderConcurrent)
        fail(
          `Apify ya tiene ${maxProviderConcurrent} ejecuciones pendientes en el servidor. Espera antes de reintentar.`,
        );
      const id = randomUUID();
      database
        .prepare(
          `
        INSERT INTO provider_spend(id,provider,credential_hash,reserved_cents,reserved_at,lease_expires_at,state)
        VALUES(?,'apify',?,?,?,?, 'reserved')
      `,
        )
        .run(id, hash, RUN_CENTS, now, now + LEASE_MS);
      database.exec("COMMIT");
      return { id, reservedUsd: RUN_CENTS / 100 };
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
  function finish(id, { failed = false } = {}) {
    // Ambiguous failures keep their short concurrency lease. Successful calls
    // release their slot immediately; neither case refunds reserved budget.
    database
      .prepare(
        `
      UPDATE provider_spend SET state=?,released_at=?
      WHERE id=? AND provider='apify' AND state='reserved'
    `,
      )
      .run(failed ? "failed" : "completed", failed ? null : currentTime(), id);
  }
  return { reserve, finish, status };
}

let sharedBudget;
const shared = () => (sharedBudget ||= createProviderBudget());
export const reserveApifyRun = (credential) => shared().reserve(credential);
export const finishProviderRun = (id, options) => shared().finish(id, options);
export const getApifyBudgetStatus = (credential) => shared().status(credential);
