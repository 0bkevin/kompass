import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "remediation-sources-1-"));
process.env.DATA_DIR = directory;
process.env.DISCOVERY_ENABLED = "false";
for (const key of ["OPENAI_API_KEY", "GEMINI_API_KEY", "YOUTUBE_API_KEY", "APIFY_API_TOKEN"])
  delete process.env[key];
const { db, saveBrand, saveRecord, getRecord, listRecords } = await import("../server/db.mjs");
const { createUser, tokenHash } = await import("../server/auth.mjs");
const { createCoreRouter } = await import("../server/core.mjs");

let server;
let origin;

function account() {
  const user = createUser({ name: "QA sources-1 sintético", email: `${randomUUID()}@example.test`, passwordHash: "test-only" });
  const brand = saveBrand({ name: "Fuentes sintéticas", audience: [] });
  db.prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,'owner')").run(brand.id, user.id);
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

function legacySource(session, input) {
  return saveRecord(session.brand.id, "sources", {
    name: "Fuente sintética con estado previo",
    enabled: false,
    lastResultCount: 17,
    lastSyncedAt: "2026-10-17T10:00:00.000Z",
    lastAttemptAt: "2026-10-17T11:00:00.000Z",
    lastError: "Fallo anterior sintético; no se ejecutó un proveedor.",
    ...input,
  });
}

function assertPreserved(before, after) {
  for (const key of ["id", "createdAt", "enabled", "lastResultCount", "lastSyncedAt", "lastAttemptAt", "lastError"])
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
  await new Promise((resolve) => { server.close(resolve); server.closeAllConnections?.(); });
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("original HTTP repro: HN→RSS removes the hidden query and persists the submitted feed on the same source", async () => {
  const session = account();
  const hn = await request(session, { name: "HN→RSS sintético", type: "hackernews", query: "agent reliability", enabled: false });
  assert.equal(hn.status, 201, JSON.stringify(hn.data));
  for (const includeStaleQuery of [false, true]) {
    const existing = legacySource(session, { ...hn.data, query: "agent reliability" });
    const converted = await request(session, {
      type: "rss",
      url: "https://www.nasa.gov/feed/",
      ...(includeStaleQuery ? { query: "agent reliability" } : {}),
    }, existing.id);
    assert.equal(converted.status, 200, JSON.stringify(converted.data));
    assert.equal(converted.data.type, "rss");
    assert.equal(converted.data.url, "https://www.nasa.gov/feed/");
    assert.equal(converted.data.query, undefined, "RSS must not retain an invisible HN query");
    assertPreserved(existing, converted.data);
    assert.deepEqual(getRecord(session.brand.id, "sources", existing.id), converted.data);
    const readback = await request(session);
    assert.equal(readback.data.length, 1);
    assert.deepEqual(readback.data[0], converted.data);
  }
});

test("POST requires a supported type and keeps only applicable query/URL fields for all six connectors", async () => {
  const session = account();
  for (const type of [undefined, "unknown"]) {
    const rejected = await request(session, { name: "Tipo inválido sintético", ...(type ? { type } : {}), url: "https://example.test/feed" });
    assert.equal(rejected.status, 400);
  }
  assert.equal(listRecords(session.brand.id, "sources").length, 0);
  const cases = [
    { type: "rss", url: "https://example.test/feed", query: "query incompatible", expectedQuery: undefined },
    { type: "hackernews", url: "https://example.test/old-feed", query: "agent reliability", expectedUrl: undefined },
    { type: "gdelt", url: "https://example.test/old-feed", query: '"artificial intelligence" sourcelang:spanish', expectedUrl: undefined },
    { type: "reddit", url: "https://www.reddit.com/r/artificial/.rss", query: "artificial" },
    { type: "youtube", platform: "youtube", url: "https://www.youtube.com/@GoogleDevelopers", query: "responsible AI" },
    { type: "apify", platform: "instagram", url: "https://instagram.com/publicqa", query: "#publicqa", limit: 7 },
  ];
  for (const item of cases) {
    const { expectedQuery = item.query, expectedUrl = item.url, ...input } = item;
    const saved = await request(session, { name: `Alta ${item.type} sintética`, ...input });
    assert.equal(saved.status, 201, JSON.stringify(saved.data));
    assert.equal(saved.data.query, Object.hasOwn(item, "expectedQuery") ? item.expectedQuery : expectedQuery, item.type);
    assert.equal(saved.data.url, Object.hasOwn(item, "expectedUrl") ? item.expectedUrl : expectedUrl, item.type);
    assert.equal(saved.data.enabled, !["youtube", "apify"].includes(item.type));
    if (item.type === "apify") assert.equal(saved.data.limit, 7);
    assert.deepEqual(getRecord(session.brand.id, "sources", saved.data.id), saved.data);
  }
});

test("PATCH with omitted or repeated type preserves valid input, removes legacy incompatible fields and retains status/counts", async () => {
  for (const explicitType of [false, true]) {
    const session = account();
    const rss = legacySource(session, { type: "rss", url: "https://example.test/old-feed", query: "legacy hidden query" });
    const hn = legacySource(session, { type: "hackernews", query: "old query", url: "https://example.test/unused-feed" });
    for (const [existing, changes, incompatible] of [
      [rss, { url: "https://www.nasa.gov/feed/" }, "query"],
      [hn, { query: "new query supplied by the editor" }, "url"],
    ]) {
      const result = await request(session, { ...(explicitType ? { type: existing.type } : {}), ...changes }, existing.id);
      assert.equal(result.status, 200, JSON.stringify(result.data));
      for (const [key, value] of Object.entries(changes)) assert.equal(result.data[key], value);
      assert.equal(result.data[incompatible], undefined);
      assertPreserved(existing, result.data);
      assert.equal(listRecords(session.brand.id, "sources").length, 2);
      const unchanged = await request(session, { name: "Renombrada sintética" }, existing.id);
      assert.equal(unchanged.status, 200, JSON.stringify(unchanged.data));
      for (const [key, value] of Object.entries(changes)) assert.equal(unchanged.data[key], value);
      assertPreserved(existing, unchanged.data);
    }
  }
});

test("type changes discard inherited URLs before applying fresh values and reject an RSS conversion without a feed atomically", async () => {
  const session = account();
  const hn = legacySource(session, { type: "hackernews", query: "agent reliability", url: "https://example.test/stale-hidden-feed" });
  const rejected = await request(session, { type: "rss" }, hn.id);
  assert.equal(rejected.status, 400);
  assert.match(rejected.data.error, /RSS requiere una URL/);
  assert.deepEqual(getRecord(session.brand.id, "sources", hn.id), hn);
  const rss = await request(session, { type: "rss", url: "https://example.test/new-feed" }, hn.id);
  assert.equal(rss.status, 200, JSON.stringify(rss.data));
  assert.equal(rss.data.url, "https://example.test/new-feed");
  assert.equal(rss.data.query, undefined);
  const youtube = await request(session, { type: "youtube", platform: "youtube", query: "new video topic", url: "https://www.youtube.com/@GoogleDevelopers" }, hn.id);
  assert.equal(youtube.status, 200, JSON.stringify(youtube.data));
  assert.equal(youtube.data.url, "https://www.youtube.com/@GoogleDevelopers");
  assert.equal(youtube.data.query, "new video topic");
  assertPreserved(hn, youtube.data);
});

test("a type change cannot revive a hidden legacy RSS query, but supplied queries take precedence", async () => {
  for (const query of [undefined, "new topic supplied by the editor"]) {
    const session = account();
    const rss = legacySource(session, { type: "rss", url: "https://example.test/feed", query: "invisible legacy filter" });
    const result = await request(session, { type: "hackernews", ...(query ? { query } : {}) }, rss.id);
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.equal(result.data.query, query);
    assert.equal(result.data.url, undefined);
    assertPreserved(rss, result.data);
  }
});

test("compatible topic queries survive HN→GDELT while subreddit selectors and feed URLs do not cross types", async () => {
  const session = account();
  const hn = legacySource(session, { type: "hackernews", query: "agent reliability" });
  const gdelt = await request(session, { type: "gdelt" }, hn.id);
  assert.equal(gdelt.status, 200, JSON.stringify(gdelt.data));
  assert.equal(gdelt.data.query, "agent reliability");
  const reddit = await request(session, { type: "reddit", query: "artificial", url: "https://www.reddit.com/r/artificial/.rss" }, hn.id);
  assert.equal(reddit.status, 200, JSON.stringify(reddit.data));
  assert.equal(reddit.data.query, "artificial");
  assert.equal(reddit.data.url, "https://www.reddit.com/r/artificial/.rss");
  const back = await request(session, { type: "gdelt" }, hn.id);
  assert.equal(back.status, 200, JSON.stringify(back.data));
  assert.equal(back.data.query, undefined);
  assert.equal(back.data.url, undefined);
});

test("same-type social partial PATCH keeps platform, URL, query, limits and pause state", async () => {
  const session = account();
  for (const input of [
    { type: "youtube", platform: "youtube", url: "https://www.youtube.com/@GoogleDevelopers", query: "responsible AI", limit: 20 },
    { type: "apify", platform: "tiktok", url: "https://tiktok.com/@publicqa", query: "#publicqa", limit: 7 },
  ]) {
    const current = legacySource(session, input);
    const renamed = await request(session, { name: "Sólo cambia el nombre sintético" }, current.id);
    assert.equal(renamed.status, 200, JSON.stringify(renamed.data));
    for (const [key, value] of Object.entries(input)) assert.equal(renamed.data[key], value, key);
    assertPreserved(current, renamed.data);
  }
});
