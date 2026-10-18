import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "remediation-sources-2-"));
process.env.DATA_DIR = directory;
process.env.DISCOVERY_ENABLED = "false";
for (const key of ["OPENAI_API_KEY", "GEMINI_API_KEY", "YOUTUBE_API_KEY", "APIFY_API_TOKEN"])
  delete process.env[key];
const { db, saveBrand, saveRecord, getRecord, listRecords } = await import("../server/db.mjs");
const { createUser, tokenHash } = await import("../server/auth.mjs");
const { createCoreRouter } = await import("../server/core.mjs");

let server;
let origin;
let externalRequests = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  if (!String(input).startsWith(`${origin}/api/`)) {
    externalRequests++;
    throw new Error("External transport is forbidden in the synthetic source fixture.");
  }
  return originalFetch(input, options);
};

function account(role = "owner") {
  const user = createUser({ name: "QA sources-2 sintético", email: `${randomUUID()}@example.test`, passwordHash: "test-only" });
  const brand = saveBrand({ name: "Fuentes sociales sintéticas", audience: [] });
  db.prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?)").run(brand.id, user.id, role);
  const token = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").run(tokenHash(token), user.id, Date.now() + 3_600_000);
  return { brand, cookie: `radar_session=${token}` };
}

async function request(session, body, id) {
  const response = await fetch(`${origin}/api/brands/${session.brand.id}/sources${id ? `/${id}` : ""}`, {
    method: body ? (id ? "PATCH" : "POST") : "GET",
    headers: { cookie: session.cookie, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json() };
}

function assertPreserved(before, after) {
  for (const key of ["id", "createdAt", "name", "limit", "lastResultCount", "lastSyncedAt", "lastAttemptAt", "lastError"])
    assert.equal(after[key], before[key], key);
}

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", createCoreRouter());
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  globalThis.fetch = originalFetch;
  await new Promise((resolve) => { server.close(resolve); server.closeAllConnections?.(); });
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
  assert.equal(externalRequests, 0, "Saving a paused source must not contact a provider.");
});

test("changing YouTube→Apify→YouTube with omitted platform initializes the target platform on the same paused source", async () => {
  const session = account();
  const added = await request(session, {
    name: "Conversión social sintética", type: "youtube", platform: "youtube",
    query: "responsible AI", url: "https://www.youtube.com/@publicqa", limit: 7,
  });
  assert.equal(added.status, 201, JSON.stringify(added.data));
  assert.equal(added.data.enabled, false);
  const current = saveRecord(session.brand.id, "sources", {
    ...added.data,
    lastResultCount: 17,
    lastSyncedAt: "2026-10-17T10:00:00.000Z",
    lastAttemptAt: "2026-10-17T11:00:00.000Z",
    lastError: "Fallo sintético previo; no se ejecutó proveedor.",
  });
  for (const [type, platform] of [["apify", "instagram"], ["youtube", "youtube"]]) {
    const saved = await request(session, { type }, current.id);
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.type, type);
    assert.equal(saved.data.platform, platform);
    assert.equal(saved.data.enabled, false);
    assert.equal(saved.data.query, "responsible AI");
    assert.equal(saved.data.url, undefined, "The previous connector URL must not cross the type change.");
    assertPreserved(current, saved.data);
    assert.deepEqual(getRecord(session.brand.id, "sources", current.id), saved.data);
    const readback = await request(session);
    assert.equal(readback.status, 200);
    assert.deepEqual(readback.data, [saved.data]);
  }
});

test("Apify→YouTube without platform discards inherited TikTok platform and URL", async () => {
  const session = account();
  const added = await request(session, { name: "TikTok sintético", type: "apify", platform: "tiktok", query: "#publicqa", url: "https://tiktok.com/@publicqa", limit: 7 });
  assert.equal(added.status, 201, JSON.stringify(added.data));
  const saved = await request(session, { type: "youtube" }, added.data.id);
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.platform, "youtube");
  assert.equal(saved.data.query, "#publicqa");
  assert.equal(saved.data.url, undefined);
  assert.equal(saved.data.enabled, false);
  assertPreserved(added.data, saved.data);
});

test("explicit incompatible platforms are rejected atomically even during type changes", async () => {
  const session = account();
  const added = await request(session, { name: "Plataforma válida sintética", type: "youtube", query: "responsible AI", enabled: false });
  assert.equal(added.status, 201, JSON.stringify(added.data));
  for (const platform of ["youtube", "facebook", "x", "unknown", ""]) {
    const rejected = await request(session, { type: "apify", platform }, added.data.id);
    assert.equal(rejected.status, 400, platform);
    assert.deepEqual(getRecord(session.brand.id, "sources", added.data.id), added.data);
  }
  const apify = await request(session, { type: "apify", platform: "tiktok", url: "" }, added.data.id);
  assert.equal(apify.status, 200, JSON.stringify(apify.data));
  for (const platform of ["instagram", "tiktok", "facebook", "x"]) {
    const rejected = await request(session, { type: "youtube", platform }, added.data.id);
    assert.equal(rejected.status, 400, platform);
    assert.deepEqual(getRecord(session.brand.id, "sources", added.data.id), apify.data);
  }
  for (const platform of [undefined, "youtube", "facebook"]) {
    const rejected = await request(session, { name: "Alta inválida sintética", type: "apify", query: "#publicqa", ...(platform ? { platform } : {}) });
    assert.equal(rejected.status, 400);
  }
  assert.equal(listRecords(session.brand.id, "sources").length, 1);
});

test("same-type PATCH keeps valid platform and configuration while Instagram↔TikTok uses explicit current URLs", async () => {
  const session = account();
  const added = await request(session, { name: "Redes sintéticas", type: "apify", platform: "instagram", query: "#publicqa", url: "https://instagram.com/publicqa", limit: 7 });
  assert.equal(added.status, 201, JSON.stringify(added.data));
  let current = added.data;
  for (const [platform, url] of [["tiktok", "https://tiktok.com/@publicqa"], ["instagram", "https://instagram.com/publicqa"]]) {
    const saved = await request(session, { platform, url }, current.id);
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.platform, platform);
    assert.equal(saved.data.url, url);
    assert.equal(saved.data.type, "apify");
    assert.equal(saved.data.query, "#publicqa");
    assert.equal(saved.data.enabled, false);
    assertPreserved(current, saved.data);
    current = saved.data;
    for (const type of [undefined, "apify"]) {
      const unchanged = await request(session, { ...(type ? { type } : {}), name: current.name }, current.id);
      assert.equal(unchanged.status, 200, JSON.stringify(unchanged.data));
      for (const key of ["platform", "url", "query", "limit", "enabled"])
        assert.equal(unchanged.data[key], current[key], key);
    }
    const invalidUrl = await request(session, { url: platform === "tiktok" ? "https://instagram.com/publicqa" : "https://tiktok.com/@publicqa" }, current.id);
    assert.equal(invalidUrl.status, 400);
    assert.equal(getRecord(session.brand.id, "sources", current.id).url, url);
  }
});

test("social type changes remain restricted to editors in the source brand", async () => {
  const reviewer = account("reviewer");
  const current = saveRecord(reviewer.brand.id, "sources", { name: "Sólo lectura sintética", type: "youtube", platform: "youtube", query: "responsible AI", enabled: false });
  const rejected = await request(reviewer, { type: "apify" }, current.id);
  assert.equal(rejected.status, 403);
  assert.deepEqual(getRecord(reviewer.brand.id, "sources", current.id), current);
});
