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

async function inbox(body, workspaceId = brand.id, credential = secret) {
  const response = await fetch(
    `${origin}/api/inbox/telegram/${workspaceId}/${credential}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
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
    assert.equal(response.status, 403);
    assert.match(response.body.error, /Telegram.*deshabilitada/i);
    assert.deepEqual(storageSnapshot(), previous);
    assert.equal(
      networkAttempts,
      0,
      "No source, AI or Telegram request may occur",
    );
    assert.equal(database.getSecret(brand.id, "telegramUpdates"), null);
  });
}

test("the intake policy also rejects unknown credentials and empty updates without disclosing configuration", async () => {
  const previous = storageSnapshot();
  const configured = await inbox({});
  const unknown = await inbox({ message: {} }, "unknown-brand", "wrong-secret");
  assert.equal(configured.status, 403);
  assert.deepEqual(unknown, configured);
  assert.deepEqual(storageSnapshot(), previous);
  assert.equal(networkAttempts, 0);
});
