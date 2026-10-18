import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "radar-budget-"));
process.env.DATA_DIR = directory;
process.env.APIFY_API_TOKEN = "";
delete process.env.APIFY_DAILY_BUDGET_USD;
delete process.env.APIFY_MONTHLY_BUDGET_USD;
let createProviderBudget, getApifyBudgetStatus, storage, social, intelligence;
before(async () => {
  storage = await import("../server/db.mjs");
  ({ createProviderBudget, getApifyBudgetStatus } =
    await import("../server/provider-budget.mjs"));
  social = await import("../server/social-providers.mjs");
  intelligence = await import("../server/intelligence.mjs");
});
after(() => {
  storage.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
function fixture(t, { env = {}, ...options } = {}) {
  const file = path.join(directory, `${randomUUID()}.sqlite`);
  const database = new DatabaseSync(file);
  t.after(() => database.close());
  let now = Date.UTC(2026, 0, 10, 12);
  const budget = createProviderBudget({
    database,
    env,
    clock: () => now,
    ...options,
  });
  return {
    budget,
    database,
    file,
    env,
    setNow: (value) => {
      now = value;
    },
  };
}
function complete(budget, token) {
  const reservation = budget.reserve(token);
  budget.finish(reservation.id);
  return reservation;
}

test("defaults reserve USD1 per run, cap at USD3 daily and never store the plain credential", (t) => {
  const { budget, database } = fixture(t);
  const token = "plain-provider-key-never-store";
  for (let index = 0; index < 3; index++)
    assert.equal(complete(budget, token).reservedUsd, 1);
  assert.throws(() => budget.reserve(token), /presupuesto diario/);
  const status = budget.status(token);
  assert.equal(status.dailyBudgetUsd, 3);
  assert.equal(status.monthlyBudgetUsd, 30);
  assert.equal(status.dailyReservedUsd, 3);
  assert.equal(status.monthlyReservedUsd, 3);
  assert.equal(status.activeRuns, 0);
  assert.equal(status.origin, "conservative_reservation");
  assert.match(status.note, /no equivale al gasto facturado/);
  const rows = database.prepare("SELECT * FROM provider_spend").all();
  assert.ok(
    rows.every(
      (row) =>
        row.credential_hash ===
        createHash("sha256").update(token).digest("hex"),
    ),
  );
  assert.equal(JSON.stringify(rows).includes(token), false);
  assert.equal(JSON.stringify(status).includes(token), false);
  assert.equal(
    database.prepare("PRAGMA foreign_key_list(provider_spend)").all().length,
    0,
  );
});

test("the same credential shares a durable ledger across workspaces and database connections", (t) => {
  const { budget, file } = fixture(t, { env: { APIFY_DAILY_BUDGET_USD: "2" } });
  const secondDb = new DatabaseSync(file);
  t.after(() => secondDb.close());
  const second = createProviderBudget({
    database: secondDb,
    env: { APIFY_DAILY_BUDGET_USD: "2" },
    clock: () => Date.UTC(2026, 0, 10, 12),
  });
  complete(budget, "shared-workspace-token");
  complete(second, "shared-workspace-token");
  assert.throws(
    () => budget.reserve("shared-workspace-token"),
    /presupuesto diario/,
  );
  assert.equal(second.status("shared-workspace-token").dailyReservedUsd, 2);
  complete(second, "another-credential");
  assert.equal(second.status("another-credential").dailyReservedUsd, 1);
});

test("UTC day boundaries reset daily usage while the monthly cap survives until the next month", (t) => {
  const { budget, setNow } = fixture(t, {
    env: { APIFY_DAILY_BUDGET_USD: "3", APIFY_MONTHLY_BUDGET_USD: "2" },
  });
  setNow(Date.UTC(2026, 0, 10, 23, 59));
  complete(budget, "monthly-token");
  complete(budget, "monthly-token");
  setNow(Date.UTC(2026, 0, 11));
  assert.equal(budget.status("monthly-token").dailyReservedUsd, 0);
  assert.equal(budget.status("monthly-token").monthlyReservedUsd, 2);
  assert.throws(() => budget.reserve("monthly-token"), /presupuesto mensual/);
  setNow(Date.UTC(2026, 1, 1));
  complete(budget, "monthly-token");
  assert.equal(budget.status("monthly-token").monthlyReservedUsd, 1);
});

test("zero pauses Apify, fractional limits are conservative and invalid configuration fails closed", (t) => {
  const { budget, env } = fixture(t);
  for (const key of ["APIFY_DAILY_BUDGET_USD", "APIFY_MONTHLY_BUDGET_USD"]) {
    env[key] = "0";
    assert.equal(budget.status("paused-key").paused, true);
    assert.throws(() => budget.reserve("paused-key"), /está pausado/);
    delete env[key];
  }
  env.APIFY_DAILY_BUDGET_USD = "0.99";
  assert.throws(() => budget.reserve("paused-key"), /presupuesto diario/);
  for (const invalid of ["not-a-number", "-1", "Infinity"]) {
    env.APIFY_DAILY_BUDGET_USD = invalid;
    assert.throws(
      () => budget.reserve("paused-key"),
      /Configuración.*inválida/,
    );
  }
});

test("concurrent operations are limited per credential and across the provider", (t) => {
  const { budget, setNow } = fixture(t);
  const first = budget.reserve("one");
  budget.reserve("one");
  assert.throws(
    () => budget.reserve("one"),
    /2 ejecuciones pendientes para esta credencial/,
  );
  budget.reserve("two");
  budget.reserve("two");
  assert.throws(
    () => budget.reserve("three"),
    /4 ejecuciones pendientes en el servidor/,
  );
  budget.finish(first.id);
  const allowed = budget.reserve("three");
  assert.equal(budget.status("three").activeRuns, 1);
  budget.finish(allowed.id, { failed: true });
  assert.equal(
    budget.status("three").activeRuns,
    1,
    "ambiguous failures retain their concurrency lease",
  );
  setNow(Date.UTC(2026, 0, 10, 12) + 120001);
  assert.equal(budget.status("three").activeRuns, 0);
  assert.equal(
    budget.status("three").dailyReservedUsd,
    1,
    "lease expiry never refunds cost reservation",
  );
});

test("failed attempts consume budget and a repeated finish cannot refund or release uncertainty", (t) => {
  const { budget } = fixture(t);
  const run = budget.reserve("failed-key");
  budget.finish(run.id, { failed: true });
  budget.finish(run.id);
  assert.equal(budget.status("failed-key").dailyReservedUsd, 1);
  assert.equal(budget.status("failed-key").activeRuns, 1);
});

test("SQLite reservations stay atomic across simultaneous worker connections", async (t) => {
  const { file } = fixture(t);
  const moduleUrl = new URL("../server/provider-budget.mjs", import.meta.url)
    .href;
  const source = `
    import { parentPort, workerData } from 'node:worker_threads';
    import { DatabaseSync } from 'node:sqlite';
    import { createProviderBudget } from ${JSON.stringify(moduleUrl)};
    const database = new DatabaseSync(workerData.file);
    const budget = createProviderBudget({database,env:{},clock:()=>Date.UTC(2026,0,10,12),maxConcurrent:100,maxProviderConcurrent:100});
    try { const run = budget.reserve('worker-shared-key'); budget.finish(run.id); parentPort.postMessage({ok:true}); }
    catch(error) { parentPort.postMessage({ok:false,message:error.message}); }
    database.close();
  `;
  const messages = await Promise.all(
    Array.from(
      { length: 8 },
      () =>
        new Promise((resolve, reject) => {
          const worker = new Worker(
            new URL(`data:text/javascript,${encodeURIComponent(source)}`),
            {
              workerData: { file },
              env: { ...process.env, DATA_DIR: directory },
            },
          );
          let result;
          worker.once("message", (value) => {
            result = value;
          });
          worker.once("error", reject);
          worker.once("exit", (code) =>
            code === 0
              ? resolve(result)
              : reject(new Error(`Worker failed: ${code}`)),
          );
        }),
    ),
  );
  assert.equal(messages.filter((message) => message.ok).length, 3);
  assert.ok(
    messages
      .filter((message) => !message.ok)
      .every((message) => /presupuesto diario/.test(message.message)),
  );
});

test("Apify reserves before every POST even with a fake transport and shares limits between companies", async () => {
  const token = `integration-shared-${randomUUID()}`;
  const brands = [
    storage.saveBrand({ name: "Empresa uno", pillars: ["education"] }),
    storage.saveBrand({ name: "Empresa dos", pillars: ["education"] }),
  ];
  for (const brand of brands)
    storage.setSecret(brand.id, "apify", { apiToken: token });
  let calls = 0;
  const source = {
    id: "explicitly-enabled",
    type: "apify",
    platform: "tiktok",
    query: "education",
    limit: 1,
    enabled: true,
  };
  const options = {
    fetcher: async () => {
      calls++;
      assert.equal(
        getApifyBudgetStatus(token).dailyReservedUsd,
        calls,
        "reservation exists before network begins",
      );
      return new Response("[]", {
        headers: { "content-type": "application/json" },
      });
    },
  };
  for (let index = 0; index < 3; index++)
    await social.fetchSocialSource(brands[index % 2], source, options);
  await assert.rejects(
    social.fetchSocialSource(brands[1], source, options),
    /presupuesto diario/,
  );
  assert.equal(calls, 3);
  assert.equal(getApifyBudgetStatus(token).monthlyReservedUsd, 3);
  await assert.rejects(
    social.fetchSocialSource(brands[0], { ...source, enabled: false }, options),
    /fuente Apify está pausada/,
  );
  assert.equal(calls, 3);
});

test("budget pause propagates through discovery as a visible source error without any provider request", async () => {
  const previous = process.env.APIFY_DAILY_BUDGET_USD;
  process.env.APIFY_DAILY_BUDGET_USD = "0";
  try {
    const brand = storage.saveBrand({
      name: "Empresa pausada",
      pillars: ["education"],
    });
    storage.setSecret(brand.id, "apify", { apiToken: `pause-${randomUUID()}` });
    const source = storage.saveRecord(brand.id, "sources", {
      name: "TikTok habilitado",
      type: "apify",
      platform: "tiktok",
      query: "education",
      limit: 1,
      enabled: true,
    });
    let requests = 0;
    const result = await intelligence.syncSources(brand, {
      fetcher: async () => {
        requests++;
        throw new Error("must not reach network");
      },
    });
    assert.equal(requests, 0);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /presupuesto.*USD0/);
    assert.match(
      storage.getRecord(brand.id, "sources", source.id).lastError,
      /presupuesto.*USD0/,
    );
  } finally {
    if (previous === undefined) delete process.env.APIFY_DAILY_BUDGET_USD;
    else process.env.APIFY_DAILY_BUDGET_USD = previous;
  }
});
