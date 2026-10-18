import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import express from "express";

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "official-social-sync-"),
);
process.env.DATA_DIR = directory;
const storage = await import("../server/db.mjs");
const auth = await import("../server/auth.mjs");
const social = await import("../server/social-sync.mjs");
const env = {
  YOUTUBE_DATA_API_KEY: "synthetic-public-data-key",
  GOOGLE_CLIENT_ID: "synthetic.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "synthetic-client-secret",
  GOOGLE_YOUTUBE_REDIRECT_URI: "http://localhost/api/social/youtube/callback",
};
const id = "abcdefghijk";
const otherId = "mnopqrstuvw";
const channelId = "UCabcdefghijklmnopqrstuv";
const fixedNow = Date.UTC(2026, 9, 18, 18);
let now = fixedNow;
let handler;
let calls = [];
let server;
let origin;
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const transport = async (url, init) => {
  calls.push({ url: String(url), init });
  return handler(new URL(url), init);
};

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    social.createSocialSyncRouter({
      env,
      fetchImpl: transport,
      clock: () => now,
    }),
  );
  app.use((error, _req, res, _next) =>
    res
      .status(error.status || 500)
      .json({ error: error.status ? error.message : "Internal test error" }),
  );
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  env.GOOGLE_YOUTUBE_REDIRECT_URI = `${origin}/api/social/youtube/callback`;
});
beforeEach(() => {
  storage.db.exec(
    "DELETE FROM official_social_oauth; DELETE FROM official_social_catalog; DELETE FROM official_social_metrics; DELETE FROM official_social_state; DELETE FROM official_social_quota; DELETE FROM brands; DELETE FROM users;",
  );
  now = fixedNow;
  calls = [];
  handler = () => {
    throw new Error("Unexpected real external request");
  };
});
after(async () => {
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections?.();
  });
  storage.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

function fixture(role = "owner") {
  const user = auth.createUser({
    name: "Synthetic Social QA",
    email: `${randomUUID()}@example.test`,
    passwordHash: "synthetic-only",
  });
  const brand = storage.saveBrand({
    name: "Synthetic 30X",
    pillars: ["inteligencia artificial"],
  });
  storage.db
    .prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?)")
    .run(brand.id, user.id, role);
  const token = randomUUID();
  storage.db
    .prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    )
    .run(auth.tokenHash(token), user.id, Date.now() + 60_000);
  return { user, brand, cookie: `radar_session=${token}` };
}
function piece(f, extra = {}) {
  return storage.saveRecord(f.brand.id, "pieces", {
    title: "Synthetic QA piece",
    channel: "youtube",
    format: "video",
    status: "published",
    publishedUrl: `https://www.youtube.com/watch?v=${id}`,
    metrics: { views: 15, engagement: 2, leads: 1 },
    metricsOrigin: "manual",
    ...extra,
  });
}
async function request(f, pathName, method = "GET", body, extraCookie = "") {
  return fetch(`${origin}/api${pathName}`, {
    method,
    redirect: "manual",
    headers: {
      ...(f ? { cookie: f.cookie + extraCookie } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
function pathFor(f, suffix) {
  return `/brands/${f.brand.id}/social/${suffix}`;
}

test("public data setup is separate from legacy credentials and never exposes secrets", () => {
  const f = fixture();
  const ready = social.socialConnections(f.brand.id, { env });
  assert.equal(ready.providers[0].ready, true);
  assert.equal(ready.providers[0].connection, undefined);
  assert.equal(ready.automaticSync.enabled, true);
  assert.equal(
    ready.providers.slice(1).every((item) => item.ready === false),
    true,
  );
  const serialized = JSON.stringify(ready);
  assert.equal(serialized.includes(env.YOUTUBE_DATA_API_KEY), false);
  assert.equal(serialized.includes(env.GOOGLE_CLIENT_SECRET), false);
  const legacyOnly = social.socialConnections(f.brand.id, {
    env: { YOUTUBE_API_KEY: "legacy-unreviewed" },
  });
  assert.equal(legacyOnly.providers[0].ready, false);
  assert.equal(legacyOnly.providers[0].configured, false);
});

test("read endpoints require same-company membership; mutations enforce editor or owner", async () => {
  const f = fixture("reviewer");
  const outsider = fixture();
  assert.equal((await request(null, pathFor(f, "connections"))).status, 401);
  assert.equal((await request(outsider, pathFor(f, "metrics"))).status, 404);
  assert.equal((await request(f, pathFor(f, "discover"))).status, 200);
  assert.equal(
    (await request(f, pathFor(f, "discover"), "POST", { query: "AI" })).status,
    403,
  );
  assert.equal((await request(f, pathFor(f, "sync"), "POST", {})).status, 403);
  assert.equal((await request(f, pathFor(f, "youtube/authorize"))).status, 403);
  assert.equal(
    (await request(f, pathFor(f, "connections/youtube"), "DELETE")).status,
    403,
  );
  assert.equal(calls.length, 0);
});

test("discovery uses only fixed official endpoints and raw attributed counters, without derived ranking", async () => {
  const f = fixture();
  handler = (url, init) => {
    assert.equal(url.origin, "https://www.googleapis.com");
    assert.equal(url.searchParams.has("key"), false);
    assert.equal(init.headers["x-goog-api-key"], env.YOUTUBE_DATA_API_KEY);
    assert.equal(init.redirect, "error");
    if (url.pathname.endsWith("/search")) {
      assert.equal(url.searchParams.get("order"), "date");
      assert.equal(url.searchParams.get("maxResults"), "12");
      assert.equal(url.searchParams.get("q"), "inteligencia artificial");
      return json({
        items: [
          { id: { videoId: id } },
          { id: { videoId: "malformed" } },
          { id: { videoId: id } },
        ],
      });
    }
    return json({
      items: [
        {
          id,
          snippet: {
            title: "Official public <b>headline</b>",
            publishedAt: "2026-10-17T12:00:00Z",
            channelTitle: "Unrequested personal author field",
          },
          statistics: { viewCount: "123", likeCount: "0" },
        },
        { id: otherId, statistics: { viewCount: "9999" } },
      ],
    });
  };
  const response = await request(f, pathFor(f, "discover"), "POST", {});
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0].metrics, {
    views: 123,
    likes: 0,
    comments: null,
  });
  assert.equal(result.items[0].attribution, "YouTube Data API");
  assert.match(result.note, /no demuestra crecimiento/);
  assert.equal(JSON.stringify(result).includes("Unrequested personal"), false);
  assert.equal("score" in result.items[0], false);
  assert.equal("engagement" in result.items[0].metrics, false);
  assert.equal(
    storage.listRecords(f.brand.id, "references").length,
    0,
    "API catalogue must not silently enter the blocked AI reference pipeline",
  );
  assert.equal(calls.length, 2);
});

test("discovery cache deduplicates matching searches, permits a new topic and expires at 30 days", async () => {
  const f = fixture();
  handler = () => json({ items: [] });
  const first = await social.discoverOfficialContent(
    f.brand.id,
    { query: "AI", limit: 2 },
    { env, fetchImpl: transport, now },
  );
  const second = await social.discoverOfficialContent(
    f.brand.id,
    { query: "AI", limit: 2 },
    { env, fetchImpl: transport, now: now + 1000 },
  );
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(calls.length, 1);
  const changed = await social.discoverOfficialContent(
    f.brand.id,
    { query: "sales" },
    { env, fetchImpl: transport, now },
  );
  assert.equal(changed.query, "sales");
  assert.equal(calls.length, 2);
  assert.equal(
    social.socialDiscoveryCache(f.brand.id, { now: now + 30 * 86_400_000 })
      .items.length,
    0,
  );
  assert.equal(
    social.socialDiscoveryCache(f.brand.id, { now: now + 30 * 86_400_000 })
      .observedAt,
    undefined,
  );
});

test("cumulative metric refresh replaces one snapshot, preserves manual data and unknown counters", async () => {
  const f = fixture();
  const p = piece(f);
  const manual = storage.saveRecord(f.brand.id, "outcomes", {
    pieceId: p.id,
    origin: "manual",
    metrics: { views: 15, engagement: 2, leads: 1 },
  });
  let views = "100";
  handler = () =>
    json({
      items: [
        {
          id,
          statistics: { viewCount: views, likeCount: "0", commentCount: "3" },
        },
      ],
    });
  assert.equal(
    (
      await social.syncOfficialMetrics(f.brand.id, {
        env,
        fetchImpl: transport,
        now,
      })
    ).synced,
    1,
  );
  views = "120";
  assert.equal(
    (
      await social.syncOfficialMetrics(f.brand.id, {
        env,
        fetchImpl: transport,
        now: now + 61_000,
      })
    ).synced,
    1,
  );
  const result = social.socialMetricSnapshots(f.brand.id, {
    now: now + 61_000,
  });
  assert.equal(result.snapshots.length, 1);
  assert.deepEqual(result.snapshots[0].metrics, {
    views: 120,
    likes: 0,
    comments: 3,
  });
  assert.equal(result.snapshots[0].leads, null);
  assert.equal(result.snapshots[0].window, "lifetime");
  assert.match(result.snapshots[0].note, /No verifican propiedad/);
  assert.deepEqual(
    storage.getRecord(f.brand.id, "outcomes", manual.id),
    manual,
  );
  assert.deepEqual(storage.getRecord(f.brand.id, "pieces", p.id), p);
  const cached = await social.syncOfficialMetrics(f.brand.id, {
    env,
    fetchImpl: transport,
    now: now + 61_001,
  });
  assert.equal(cached.cached, true);
  assert.equal(calls.length, 2);
});

test("metrics cannot attach to drafts, other companies, demo pieces or unsafe video links", async () => {
  const f = fixture();
  const outsider = fixture();
  const p = piece(outsider);
  const draft = piece(f, { status: "draft" });
  for (const pieceId of [p.id, draft.id]) {
    const response = await request(
      f,
      `/brands/${f.brand.id}/pieces/${pieceId}/metrics/sync`,
      "POST",
      {},
    );
    assert.equal(response.status, pieceId === p.id ? 404 : 409);
  }
  for (const url of [
    "http://youtube.com/watch?v=abcdefghijk",
    "https://youtube.com.evil.test/watch?v=abcdefghijk",
    "https://www.youtube.com@127.0.0.1/watch?v=abcdefghijk",
    "https://youtube.com:444/watch?v=abcdefghijk",
    "https://youtube.com/watch?v=abcdefghijk#private",
    "https://youtube.com/watch?v=short",
  ])
    assert.equal(social.youtubeVideoId(url), null, url);
  assert.equal(social.youtubeVideoId(`https://youtu.be/${id}?t=20`), id);
  assert.equal(
    social.youtubeVideoId(`https://www.youtube.com/shorts/${id}`),
    id,
  );
  assert.equal(calls.length, 0);
});

test("deleted or changed publications purge old snapshots rather than showing stale counters", async () => {
  const f = fixture();
  const p = piece(f);
  handler = () => json({ items: [{ id, statistics: { viewCount: "7" } }] });
  await social.syncOfficialMetrics(f.brand.id, {
    env,
    fetchImpl: transport,
    now,
  });
  storage.saveRecord(f.brand.id, "pieces", {
    ...p,
    publishedUrl: `https://youtu.be/${otherId}`,
  });
  assert.equal(
    social.socialMetricSnapshots(f.brand.id, { now }).snapshots.length,
    0,
  );
  handler = () => json({ items: [] });
  const result = await social.syncOfficialMetrics(f.brand.id, {
    env,
    fetchImpl: transport,
    now: now + 61_000,
  });
  assert.equal(result.synced, 0);
  assert.match(result.errors[0].error, /eliminado o ser privada/);
});

test("in-flight metrics discard results if the linked publication changes", async () => {
  const f = fixture();
  const p = piece(f);
  handler = () => {
    storage.saveRecord(f.brand.id, "pieces", {
      ...p,
      publishedUrl: `https://youtu.be/${otherId}`,
    });
    return json({ items: [{ id, statistics: { viewCount: "100" } }] });
  };
  assert.equal(
    (
      await social.syncOfficialMetrics(f.brand.id, {
        env,
        fetchImpl: transport,
        now,
      })
    ).synced,
    0,
  );
  assert.equal(
    social.socialMetricSnapshots(f.brand.id, { now }).snapshots.length,
    0,
  );
});

test("disconnect purges data, stops automatic use and prevents in-flight cache resurrection", async () => {
  const f = fixture();
  piece(f);
  storage.setSecret(f.brand.id, "official:youtube", {
    accessToken: "synthetic-old-token",
    refreshToken: "synthetic-refresh-token",
    expiresAt: now + 3600_000,
    channelId,
    name: "Synthetic QA channel",
    connectedAt: new Date(now).toISOString(),
  });
  handler = async (url) => {
    if (url.pathname.endsWith("/videos")) {
      const disconnected = await request(
        f,
        pathFor(f, "connections/youtube"),
        "DELETE",
      );
      assert.equal(disconnected.status, 200);
      return json({ items: [{ id, statistics: { viewCount: "99" } }] });
    }
    if (url.href === "https://oauth2.googleapis.com/revoke")
      return new Response(null, { status: 200 });
    throw new Error("Unexpected endpoint");
  };
  await assert.rejects(
    social.syncOfficialMetrics(f.brand.id, { env, fetchImpl: transport, now }),
    { status: 409 },
  );
  assert.equal(
    social.socialMetricSnapshots(f.brand.id, { now }).snapshots.length,
    0,
  );
  assert.equal(storage.getSecret(f.brand.id, "official:youtube"), null);
  assert.equal(
    social.socialConnections(f.brand.id, { env }).automaticSync.enabled,
    false,
  );
  const enabled = await request(
    f,
    pathFor(f, "connections/youtube/public"),
    "POST",
    {},
  );
  assert.equal(enabled.status, 200);
  assert.equal((await enabled.json()).providers[0].ready, true);
});

async function oauthStart(f) {
  const response = await request(f, pathFor(f, "youtube/authorize"));
  assert.equal(response.status, 303);
  const redirect = new URL(response.headers.get("location"));
  const transactionCookie = response.headers.get("set-cookie").split(";", 1)[0];
  return { redirect, transactionCookie };
}

test("channel OAuth is separate, least-scope, PKCE-bound, session-bound, single-use and encrypted at rest", async () => {
  const f = fixture();
  const { redirect, transactionCookie } = await oauthStart(f);
  assert.equal(redirect.origin, "https://accounts.google.com");
  assert.equal(
    redirect.searchParams.get("scope"),
    "https://www.googleapis.com/auth/youtube.readonly",
  );
  assert.equal(redirect.searchParams.get("code_challenge_method"), "S256");
  const state = redirect.searchParams.get("state");
  const callback = `/social/youtube/callback?state=${state}&code=synthetic-auth-code`;
  assert.match(
    (await request(f, callback)).headers.get("location"),
    /invalid_state/,
  );
  assert.equal(calls.length, 0);
  const stateHash = createHash("sha256").update(state).digest("hex");
  const verifier = storage.getSecret(
    f.brand.id,
    `official:youtube:oauth:${stateHash}`,
  ).verifier;
  assert.equal(
    redirect.searchParams.get("code_challenge"),
    createHash("sha256").update(verifier).digest("base64url"),
  );
  handler = (url, init) => {
    if (url.href === "https://oauth2.googleapis.com/token") {
      assert.equal(init.body.get("code_verifier"), verifier);
      return json({
        access_token: "synthetic-new-access",
        refresh_token: "synthetic-new-refresh",
        expires_in: 3600,
        scope: "https://www.googleapis.com/auth/youtube.readonly",
      });
    }
    assert.equal(init.headers.authorization, "Bearer synthetic-new-access");
    assert.equal(url.searchParams.get("mine"), "true");
    return json({
      items: [{ id: channelId, snippet: { title: "Synthetic QA channel" } }],
    });
  };
  const response = await request(
    f,
    callback,
    "GET",
    undefined,
    `; ${transactionCookie}`,
  );
  assert.match(response.headers.get("location"), /socialConnected=youtube/);
  const encrypted = storage.db
    .prepare(
      "SELECT value FROM secrets WHERE brand_id=? AND key='official:youtube'",
    )
    .get(f.brand.id).value;
  assert.equal(encrypted.includes("synthetic-new-access"), false);
  assert.equal(
    storage.getSecret(f.brand.id, "official:youtube").refreshToken,
    "synthetic-new-refresh",
  );
  assert.equal(
    storage.getSecret(f.brand.id, `official:youtube:oauth:${stateHash}`),
    null,
  );
  assert.match(
    (
      await request(f, callback, "GET", undefined, `; ${transactionCookie}`)
    ).headers.get("location"),
    /invalid_state/,
  );
  assert.equal(calls.length, 2);
  assert.equal(
    JSON.stringify(social.socialConnections(f.brand.id, { env })).includes(
      "synthetic-new",
    ),
    false,
  );
});

test("OAuth rejects cancelled consent, missing scope and accounts without channels", async () => {
  const f = fixture();
  let started = await oauthStart(f);
  let callback = `/social/youtube/callback?state=${started.redirect.searchParams.get("state")}&error=access_denied`;
  assert.match(
    (
      await request(
        f,
        callback,
        "GET",
        undefined,
        `; ${started.transactionCookie}`,
      )
    ).headers.get("location"),
    /cancelled/,
  );
  started = await oauthStart(f);
  callback = `/social/youtube/callback?state=${started.redirect.searchParams.get("state")}&code=synthetic-code`;
  handler = () =>
    json({
      access_token: "synthetic-token",
      expires_in: 3600,
      scope: "openid email",
    });
  assert.match(
    (
      await request(
        f,
        callback,
        "GET",
        undefined,
        `; ${started.transactionCookie}`,
      )
    ).headers.get("location"),
    /connection_failed/,
  );
  assert.equal(storage.getSecret(f.brand.id, "official:youtube"), null);
  started = await oauthStart(f);
  callback = `/social/youtube/callback?state=${started.redirect.searchParams.get("state")}&code=synthetic-code`;
  handler = (url) =>
    url.href === "https://oauth2.googleapis.com/token"
      ? json({
          access_token: "synthetic-token",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/youtube.readonly",
        })
      : json({ items: [] });
  assert.match(
    (
      await request(
        f,
        callback,
        "GET",
        undefined,
        `; ${started.transactionCookie}`,
      )
    ).headers.get("location"),
    /connection_failed/,
  );
});

test("network failures and quota limits do not leak credentials or fabricate empty live results", async () => {
  const f = fixture();
  handler = () => {
    throw new Error(`secret ${env.YOUTUBE_DATA_API_KEY}`);
  };
  const failed = await request(f, pathFor(f, "discover"), "POST", {
    query: "AI",
  });
  assert.equal(failed.status, 502);
  assert.equal((await failed.text()).includes(env.YOUTUBE_DATA_API_KEY), false);
  assert.equal(
    social.socialDiscoveryCache(f.brand.id, { now }).observedAt,
    undefined,
  );
  storage.db
    .prepare(
      "INSERT INTO official_social_quota(day,kind,used) VALUES(?,'search',70) ON CONFLICT(day,kind) DO UPDATE SET used=70",
    )
    .run(new Date(now).toISOString().slice(0, 10));
  const before = calls.length;
  const limited = await request(f, pathFor(f, "discover"), "POST", {
    query: "AI",
  });
  assert.equal(limited.status, 429);
  assert.equal(calls.length, before);
});

test("scheduler refreshes configured catalogues and raw piece metrics, never starts discovery by guessing a topic", async () => {
  const f = fixture();
  const p = piece(f);
  handler = () => json({ items: [{ id, statistics: { viewCount: "25" } }] });
  const scheduler = social.startSocialSyncScheduler({
    env,
    fetchImpl: transport,
    clock: () => now,
    intervalMs: 3600_000,
  });
  try {
    await scheduler.tick();
    assert.equal(calls.length, 1);
    assert.equal(
      social.socialMetricSnapshots(f.brand.id, { now }).snapshots[0].pieceId,
      p.id,
    );
    assert.equal(
      social.socialDiscoveryCache(f.brand.id, { now }).observedAt,
      undefined,
    );
    await scheduler.tick();
    assert.equal(calls.length, 1);
  } finally {
    scheduler.stop();
  }
});

test("revoked channel authorization deletes cached API data and its credentials", async () => {
  const f = fixture();
  piece(f);
  handler = () => json({ items: [{ id, statistics: { viewCount: "15" } }] });
  await social.syncOfficialMetrics(f.brand.id, {
    env,
    fetchImpl: transport,
    now,
  });
  storage.setSecret(f.brand.id, "official:youtube", {
    accessToken: "synthetic-expired-access",
    refreshToken: "synthetic-revoked-refresh",
    expiresAt: now - 1,
    channelId,
    name: "Synthetic QA channel",
    connectedAt: new Date(now - 1000).toISOString(),
    checkedAt: new Date(now - 2 * 86_400_000).toISOString(),
  });
  handler = (url) => {
    assert.equal(url.href, "https://oauth2.googleapis.com/token");
    return json(
      { error: "invalid_grant", error_description: "synthetic revoked token" },
      400,
    );
  };
  const scheduler = social.startSocialSyncScheduler({
    env,
    fetchImpl: transport,
    clock: () => now + 61_000,
    intervalMs: 3600_000,
  });
  try {
    await scheduler.tick();
  } finally {
    scheduler.stop();
  }
  assert.equal(storage.getSecret(f.brand.id, "official:youtube"), null);
  assert.equal(
    social.socialMetricSnapshots(f.brand.id, { now: now + 61_000 }).snapshots
      .length,
    0,
  );
});

test("channel token refresh revalidates native channel metadata before reading counters", async () => {
  const f = fixture();
  piece(f);
  storage.setSecret(f.brand.id, "official:youtube", {
    accessToken: "synthetic-expired-access",
    refreshToken: "synthetic-refresh",
    expiresAt: now - 1,
    channelId,
    name: "Old synthetic channel title",
    connectedAt: new Date(now - 1000).toISOString(),
  });
  const oauthOnly = { ...env, YOUTUBE_DATA_API_KEY: "" };
  handler = (url, init) => {
    if (url.href === "https://oauth2.googleapis.com/token")
      return json({
        access_token: "synthetic-refreshed-access",
        expires_in: 3600,
      });
    assert.equal(
      init.headers.authorization,
      "Bearer synthetic-refreshed-access",
    );
    if (url.pathname.endsWith("/channels"))
      return json({
        items: [
          {
            id: channelId,
            snippet: { title: "Updated synthetic channel title" },
          },
        ],
      });
    return json({ items: [{ id, statistics: { viewCount: "10" } }] });
  };
  const result = await social.syncOfficialMetrics(f.brand.id, {
    env: oauthOnly,
    fetchImpl: transport,
    now,
  });
  assert.equal(result.synced, 1);
  assert.equal(calls.length, 3);
  assert.equal(
    storage.getSecret(f.brand.id, "official:youtube").name,
    "Updated synthetic channel title",
  );
});

test("disconnect during OAuth exchange prevents an old consent attempt from reconnecting", async () => {
  const f = fixture();
  const started = await oauthStart(f);
  const callback = `/social/youtube/callback?state=${started.redirect.searchParams.get("state")}&code=synthetic-code`;
  handler = async (url) => {
    if (url.href === "https://oauth2.googleapis.com/token") {
      assert.equal(
        (await request(f, pathFor(f, "connections/youtube"), "DELETE")).status,
        200,
      );
      return json({
        access_token: "synthetic-token",
        expires_in: 3600,
        scope: "https://www.googleapis.com/auth/youtube.readonly",
      });
    }
    return json({
      items: [{ id: channelId, snippet: { title: "Synthetic QA channel" } }],
    });
  };
  const response = await request(
    f,
    callback,
    "GET",
    undefined,
    `; ${started.transactionCookie}`,
  );
  assert.match(response.headers.get("location"), /connection_failed/);
  assert.equal(storage.getSecret(f.brand.id, "official:youtube"), null);
  assert.equal(
    social.socialConnections(f.brand.id, { env }).providers[0].ready,
    false,
  );
});

test("URL-only publication linking records no manual counters and does not mark a piece published", async () => {
  const f = fixture();
  const p = piece(f, {
    status: "approved",
    publishedUrl: undefined,
    metrics: undefined,
  });
  const beforeLink = storage.getRecord(f.brand.id, "pieces", p.id);
  const response = await request(f, pathFor(f, "publications"), "POST", {
    pieceId: p.id,
    publishedUrl: `https://youtu.be/${id}?t=20`,
  });
  assert.equal(response.status, 201);
  const linked = await response.json();
  assert.deepEqual(linked, {
    pieceId: p.id,
    publishedUrl: `https://www.youtube.com/watch?v=${id}`,
    externalId: id,
    linkedAt: new Date(now).toISOString(),
  });
  assert.deepEqual(storage.getRecord(f.brand.id, "pieces", p.id), beforeLink);
  assert.equal(storage.listRecords(f.brand.id, "outcomes").length, 0);
  assert.equal(calls.length, 0);
  handler = () => json({ items: [{ id, statistics: { viewCount: "56" } }] });
  assert.equal(
    (
      await social.syncOfficialMetrics(f.brand.id, {
        env,
        fetchImpl: transport,
        now,
      })
    ).synced,
    1,
  );
  const metrics = social.socialMetricSnapshots(f.brand.id, { now });
  assert.equal(metrics.snapshots[0].metrics.views, 56);
  assert.equal(metrics.publications.length, 1);
  assert.equal(metrics.publications[0].approvalVersion, undefined);
  assert.equal(
    storage.getRecord(f.brand.id, "pieces", p.id).status,
    "approved",
  );
});

test("publication links cannot target foreign, wrong-channel, unapproved or demo content", async () => {
  const f = fixture();
  const outsider = fixture();
  const cases = [
    [piece(outsider), 404],
    [piece(f, { channel: "instagram" }), 400],
    [piece(f, { status: "draft" }), 409],
    [piece(f, { isDemo: true }), 409],
  ];
  for (const [p, status] of cases) {
    assert.equal(
      (
        await request(f, pathFor(f, "publications"), "POST", {
          pieceId: p.id,
          publishedUrl: `https://youtu.be/${id}`,
        })
      ).status,
      status,
    );
  }
  const p = piece(f);
  assert.equal(
    (
      await request(f, pathFor(f, "publications"), "POST", {
        pieceId: p.id,
        publishedUrl: "https://evil.test/watch?v=abcdefghijk",
      })
    ).status,
    400,
  );
  const reviewer = fixture("reviewer");
  const rp = piece(reviewer);
  assert.equal(
    (
      await request(reviewer, pathFor(reviewer, "publications"), "POST", {
        pieceId: rp.id,
        publishedUrl: `https://youtu.be/${id}`,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        reviewer,
        pathFor(reviewer, `publications/${rp.id}`),
        "DELETE",
      )
    ).status,
    403,
  );
  assert.equal(calls.length, 0);
});

test("approval changes invalidate explicit links and unlink prevents legacy fallback resync", async () => {
  const f = fixture();
  const p = piece(f);
  social.linkSocialPublication(
    f.brand.id,
    { pieceId: p.id, publishedUrl: `https://youtu.be/${id}` },
    { now },
  );
  handler = () => json({ items: [{ id, statistics: { viewCount: "12" } }] });
  await social.syncOfficialMetrics(f.brand.id, {
    env,
    fetchImpl: transport,
    now,
  });
  storage.saveRecord(f.brand.id, "pieces", {
    ...p,
    title: "Changed approved content version",
  });
  const invalidated = social.socialMetricSnapshots(f.brand.id, { now });
  assert.equal(invalidated.publications.length, 0);
  assert.equal(invalidated.snapshots.length, 0);
  assert.equal(
    (await request(f, pathFor(f, `publications/${p.id}`), "DELETE")).status,
    200,
  );
  const before = calls.length;
  assert.equal(
    (
      await social.syncOfficialMetrics(f.brand.id, {
        env,
        fetchImpl: transport,
        now: now + 61_000,
      })
    ).synced,
    0,
  );
  assert.equal(
    calls.length,
    before,
    "removing the explicit link must not revive a legacy piece URL",
  );
  social.linkSocialPublication(
    f.brand.id,
    { pieceId: p.id, publishedUrl: `https://youtu.be/${id}` },
    { now: now + 62_000 },
  );
  assert.equal(
    (
      await social.syncOfficialMetrics(f.brand.id, {
        env,
        fetchImpl: transport,
        now: now + 62_000,
      })
    ).synced,
    1,
  );
});

test("in-flight counter reads cannot attach to a newly approved content version", async () => {
  const f = fixture();
  const p = piece(f);
  handler = () => {
    storage.saveRecord(f.brand.id, "pieces", {
      ...p,
      title: "A different reviewed content version",
    });
    return json({ items: [{ id, statistics: { viewCount: "999" } }] });
  };
  const result = await social.syncOfficialMetrics(f.brand.id, {
    env,
    fetchImpl: transport,
    now,
  });
  assert.equal(result.synced, 0);
  assert.equal(
    social.socialMetricSnapshots(f.brand.id, { now }).snapshots.length,
    0,
  );
});
