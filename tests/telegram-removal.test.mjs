import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "radar-telegram-policy-"),
);
process.env.DATA_DIR = directory;
process.env.DISCOVERY_ENABLED = "false";
for (const key of [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "YOUTUBE_API_KEY",
  "APIFY_API_TOKEN",
])
  delete process.env[key];

const database = await import("../server/db.mjs");
const { createApp } = await import("../server/index.mjs");
const secret = "SIMULATED_LEGACY_INBOX_SECRET";
let server,
  origin,
  brand,
  networkAttempts = 0;

function storageSnapshot() {
  return Object.fromEntries(
    ["records", "activity", "secrets"].map((table) => [
      table,
      database.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    ]),
  );
}

async function inbox(
  body,
  workspaceId = brand.id,
  credential = secret,
  extraHeaders = {},
) {
  const response = await fetch(
    `${origin}/api/inbox/telegram/${workspaceId}/${credential}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...extraHeaders },
      body: JSON.stringify(body),
    },
  );
  return { status: response.status, body: await response.json() };
}

before(async () => {
  brand = database.saveBrand({
    name: "Synthetic Telegram compliance workspace",
    market: "Latinoamérica",
  });
  database.setSecret(brand.id, "telegram", {
    botToken: "123456:SIMULATED_NO_NETWORK_BOT_TOKEN",
    chatId: "-1001234567890",
    inboxSecret: secret,
  });
  // A legacy configured AI provider must not turn a rejected intake into work.
  database.setSecret(brand.id, "ai", {
    apiKey: "SIMULATED_NO_NETWORK_AI_KEY",
    baseUrl: "https://api.example.test/v1",
    model: "synthetic-model",
  });
  database.saveRecord(brand.id, "references", {
    title: "Preserved authorized reference",
    text: "Synthetic pre-existing reference",
    status: "new",
  });
  const rejectNetwork = () => {
    networkAttempts++;
    throw new Error("Provider network is forbidden in this test");
  };
  mock.method(http, "request", rejectNetwork);
  mock.method(https, "request", rejectNetwork);
  mock.method(dns, "lookup", rejectNetwork);
  server = createApp({ apiOnly: true }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  mock.restoreAll();
  await new Promise((resolve) => server.close(resolve));
  database.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

for (const kind of ["message", "channel_post"]) {
  test(`a legacy valid Telegram ${kind} cannot be stored, analyzed or acknowledged remotely`, async () => {
    const previous = storageSnapshot();
    const response = await inbox({
      update_id: kind === "message" ? 7101 : 7102,
      [kind]: {
        message_id: 71,
        chat: {
          id: -1001234567890,
          type: kind === "message" ? "private" : "channel",
        },
        text: "SIMULATED unconsented message https://example.com/source",
        from: { id: 123, first_name: "SIMULATED participant" },
      },
    });
    assert.equal(response.status, 404);
    assert.match(response.body.error, /ruta.*no existe/i);
    assert.deepEqual(storageSnapshot(), previous);
    assert.equal(
      networkAttempts,
      0,
      "No source, AI or Telegram request may occur",
    );
    assert.equal(database.getSecret(brand.id, "telegramUpdates"), null);
  });
}

test("removed inbox URLs return the same 404 for configured and unknown credentials", async () => {
  const previous = storageSnapshot();
  const configured = await inbox({});
  const unknown = await inbox({ message: {} }, "unknown-brand", "wrong-secret");
  assert.equal(configured.status, 404);
  assert.deepEqual(unknown, configured);
  assert.deepEqual(storageSnapshot(), previous);
  assert.equal(networkAttempts, 0);
});

test("removed inbox paths have no cross-origin exemption", async () => {
  const previous = storageSnapshot();
  const result = await inbox({}, brand.id, secret, {
    origin: "https://untrusted.example.test",
  });
  assert.equal(result.status, 403);
  assert.deepEqual(storageSnapshot(), previous);
});

test("public integration state omits the retired connector even with legacy secrets", () => {
  const state = database.publicIntegrations(brand.id);
  assert.equal(Object.hasOwn(state, "telegram"), false);
  assert.doesNotMatch(JSON.stringify(state), /inbox|botToken|chatId/);
});

test("legacy connector configuration is rejected atomically", async () => {
  const { configureIntegrations } = await import("../server/connectors.mjs");
  const previous = storageSnapshot();
  await assert.rejects(
    configureIntegrations(brand.id, { ai: null, telegram: null }),
    { status: 400 },
  );
  assert.deepEqual(storageSnapshot(), previous);
  assert.equal(networkAttempts, 0);
});

test("retired channel cannot create generated drafts", async () => {
  const { createDraft } = await import("../server/intelligence.mjs");
  const previous = storageSnapshot();
  await assert.rejects(createDraft(brand, { channel: "telegram" }), {
    status: 400,
  });
  assert.deepEqual(storageSnapshot(), previous);
  assert.equal(networkAttempts, 0);
});

test("saved retired-channel pieces never fall back to a webhook or create delivery journals", async () => {
  const { getPublicationState, publishPiece } =
    await import("../server/connectors.mjs");
  database.setSecret(brand.id, "webhook", {
    url: "https://publish.example.test/deliver",
    secret: "SIMULATED_WEBHOOK_SECRET",
  });
  const piece = database.saveRecord(brand.id, "pieces", {
    title: "Saved old piece",
    channel: "telegram",
    status: "approved",
  });
  const previous = storageSnapshot();
  const state = getPublicationState(brand, piece);
  assert.equal(state.destination, null);
  assert.equal(state.destinationKey, null);
  assert.match(state.unavailableReason, /canal.*no está disponible/i);
  await assert.rejects(publishPiece(brand, piece), { status: 409 });
  assert.deepEqual(storageSnapshot(), previous);
  assert.equal(networkAttempts, 0);
});

test("startup cleanup discards retired credentials and preserves content, receipts and other connectors", async () => {
  const { publicPiece } = await import("../server/core.mjs");
  const { getPublicationState } = await import("../server/connectors.mjs");
  const receipt = {
    provider: "telegram",
    messageId: 123,
    chatId: "-1001234567890",
    destination: { provider: "telegram", chatId: "-1001234567890" },
    publishedAt: "2026-10-01T12:00:00Z",
  };
  const piece = database.saveRecord(brand.id, "pieces", {
    title: "Historical published work",
    channel: "telegram",
    status: "published",
    publicationReceipt: receipt,
  });
  database.setSecret(brand.id, "telegramUpdates", { lastUpdate: 123 });
  database.setSecret(brand.id, `publication:${piece.id}`, {
    status: "delivered",
    receipt,
    destination: receipt.destination,
  });
  const ai = database.getSecret(brand.id, "ai");
  const webhook = database.getSecret(brand.id, "webhook");
  const records = database.listRecords(brand.id, "pieces");
  database.initDb();
  assert.equal(database.getSecret(brand.id, "telegram"), null);
  assert.equal(database.getSecret(brand.id, "telegramUpdates"), null);
  assert.deepEqual(database.getSecret(brand.id, "ai"), ai);
  assert.deepEqual(database.getSecret(brand.id, "webhook"), webhook);
  assert.deepEqual(database.listRecords(brand.id, "pieces"), records);
  assert.deepEqual(publicPiece(piece).publicationReceipt, {
    provider: "legacy",
    publishedAt: receipt.publishedAt,
  });
  const state = getPublicationState(brand, piece);
  assert.equal(state.status, "delivered");
  assert.equal(state.destination, null);
  assert.equal(state.receipt.provider, "legacy");
  assert.equal(networkAttempts, 0);
});
