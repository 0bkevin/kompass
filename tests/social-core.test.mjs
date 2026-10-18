import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-social-core-"));
process.env.DATA_DIR = dataDir;
process.env.OPENAI_API_KEY = "";
process.env.YOUTUBE_API_KEY = "";
process.env.APIFY_API_TOKEN = "";
process.env.GEMINI_API_KEY = "";
process.env.GEMINI_MODEL = "";

let server;
let origin;
let db;
let saveRecord;
let getRecord;
let setSecret;
let getSecret;
let owner;
let editor;
let brand;

async function request(route, { method = "GET", body, cookie } = {}) {
  const response = await fetch(`${origin}/api${route}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = response.headers
    .get("content-type")
    ?.includes("application/json")
    ? await response.json()
    : await response.text();
  return {
    status: response.status,
    data,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}

async function account(name) {
  const response = await request("/auth/register", {
    method: "POST",
    body: {
      name,
      email: `${name}-${crypto.randomUUID()}@example.test`,
      password: "test-password-social-core",
    },
  });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  const cookie = response.cookie;
  assert.ok(cookie, "registration should set the session cookie");
  return { cookie, user: response.data.user };
}

async function createBrand(cookie) {
  const response = await request("/brands", {
    method: "POST",
    cookie,
    body: {
      name: "Marca social de prueba",
      industry: "Educación",
      audience: [],
    },
  });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return response.data;
}

before(async () => {
  const dbModule = await import("../server/db.mjs");
  ({ db, saveRecord, getRecord, setSecret, getSecret } = dbModule);
  const { createApp } = await import("../server/index.mjs");
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  owner = await account("social-owner");
  brand = await createBrand(owner.cookie);
  editor = await account("social-editor");
  db.prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?)").run(
    brand.id,
    editor.user.id,
    "editor",
  );
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  db?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("social settings disclose restrictions and legacy credential presence without allowing activation", async () => {
  const route = `/brands/${brand.id}/social/settings`;
  const initial = await request(route, { cookie: owner.cookie });
  assert.equal(initial.status, 200, JSON.stringify(initial.data));
  const { policies, ...initialSettings } = initial.data;
  for (const key of ["youtube", "apify", "gemini"]) {
    assert.equal(policies[key].allowed, false);
    assert.ok(policies[key].reason);
  }
  assert.deepEqual(initialSettings, {
    youtube: { configured: false },
    apify: { configured: false },
    gemini: { configured: false },
  });

  const saved = await request(route, {
    method: "PUT",
    cookie: owner.cookie,
    body: {
      youtube: { apiKey: "youtube-secret-test" },
      apify: { apiToken: "apify-secret-test" },
      gemini: {
        apiKey: "gemini-secret-test",
        model: "gemini-test-model",
      },
    },
  });
  assert.equal(saved.status, 403, JSON.stringify(saved.data));
  assert.equal(getSecret(brand.id, "youtube"), null);
  assert.equal(getSecret(brand.id, "apify"), null);
  assert.equal(getSecret(brand.id, "gemini"), null);
  // Simulate pre-policy records: their presence is visible, never approval.
  setSecret(brand.id, "youtube", { apiKey: "youtube-secret-test" });
  setSecret(brand.id, "apify", { apiToken: "apify-secret-test" });
  setSecret(brand.id, "gemini", {
    apiKey: "gemini-secret-test",
    model: "gemini-test-model",
  });
  assert.equal(JSON.stringify(saved.data).includes("secret-test"), false);

  const configured = await request(route, { cookie: owner.cookie });
  assert.equal(configured.status, 200);
  const { policies: configuredPolicies, ...configuredSettings } =
    configured.data;
  assert.equal(configuredPolicies.youtube.allowed, false);
  assert.deepEqual(configuredSettings, {
    youtube: { configured: true },
    apify: { configured: true },
    gemini: { configured: true, model: "gemini-test-model" },
  });
  assert.equal(JSON.stringify(configured.data).includes("secret-test"), false);
});

test("only the owner can update brand social credentials", async () => {
  const route = `/brands/${brand.id}/social/settings`;
  const denied = await request(route, {
    method: "PUT",
    cookie: editor.cookie,
    body: { youtube: { apiKey: "editor-must-not-write" } },
  });
  assert.equal(denied.status, 403);

  const stillConfigured = await request(route, { cookie: owner.cookie });
  assert.equal(stillConfigured.data.youtube.configured, true);
  assert.equal(
    JSON.stringify(stillConfigured.data).includes("editor-must-not-write"),
    false,
  );
});

test("a mixed disconnect and forbidden activation does not partially change credentials", async () => {
  const before = getSecret(brand.id, "apify");
  const result = await request(`/brands/${brand.id}/social/settings`, {
    method: "PUT",
    cookie: owner.cookie,
    body: { apify: null, youtube: { apiKey: "cannot-reactivate" } },
  });
  assert.equal(result.status, 403);
  assert.deepEqual(getSecret(brand.id, "apify"), before);
  assert.equal(getSecret(brand.id, "youtube").apiKey, "youtube-secret-test");
});

test("disconnect overrides an environment key and blocked providers cannot reconnect", async () => {
  const previous = process.env.YOUTUBE_API_KEY;
  const route = `/brands/${brand.id}/social/settings`;
  try {
    process.env.YOUTUBE_API_KEY = "environment-youtube-secret";
    const disconnected = await request(route, {
      method: "PUT",
      cookie: owner.cookie,
      body: { youtube: null },
    });
    assert.equal(disconnected.status, 200, JSON.stringify(disconnected.data));
    const disabled = await request(route, { cookie: owner.cookie });
    assert.equal(disabled.status, 200);
    assert.equal(disabled.data.youtube.configured, false);
    assert.equal(
      JSON.stringify(disabled.data).includes("environment-youtube-secret"),
      false,
    );

    const reconnected = await request(route, {
      method: "PUT",
      cookie: owner.cookie,
      body: { youtube: { apiKey: "youtube-reconnected-secret" } },
    });
    assert.equal(reconnected.status, 403, JSON.stringify(reconnected.data));
    assert.deepEqual(getSecret(brand.id, "youtube"), { disabled: true });
    const configured = await request(route, { cookie: owner.cookie });
    assert.equal(configured.status, 200);
    assert.equal(configured.data.youtube.configured, false);
    assert.equal(
      JSON.stringify(configured.data).includes("youtube-reconnected-secret"),
      false,
    );
  } finally {
    if (previous === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = previous;
  }
});

test("social sources start paused and Apify rejects platforms without an adapter", async () => {
  const route = `/brands/${brand.id}/sources`;
  const youtube = await request(route, {
    method: "POST",
    cookie: owner.cookie,
    body: {
      name: "YouTube educativo",
      type: "youtube",
      query: "aprendizaje con IA",
    },
  });
  assert.equal(youtube.status, 201, JSON.stringify(youtube.data));
  assert.equal(youtube.data.enabled, false);
  assert.equal(youtube.data.platform, "youtube");

  const apify = await request(route, {
    method: "POST",
    cookie: owner.cookie,
    body: {
      name: "Instagram educativo",
      type: "apify",
      platform: "instagram",
      query: "#aprendizaje",
    },
  });
  assert.equal(apify.status, 201, JSON.stringify(apify.data));
  assert.equal(apify.data.enabled, false);
  assert.equal(apify.data.limit, 20);

  const rss = await request(route, {
    method: "POST",
    cookie: owner.cookie,
    body: {
      name: "Feed convertido a YouTube",
      type: "rss",
      url: "https://example.test/feed.xml",
      enabled: false,
    },
  });
  assert.equal(rss.status, 201, JSON.stringify(rss.data));
  assert.equal(rss.data.enabled, false);
  const converted = await request(`${route}/${rss.data.id}`, {
    method: "PATCH",
    cookie: owner.cookie,
    body: {
      type: "youtube",
      query: "tema de prueba",
      url: "https://www.youtube.com/@canal-publico",
    },
  });
  assert.equal(converted.status, 200, JSON.stringify(converted.data));
  assert.equal(converted.data.type, "youtube");
  assert.equal(converted.data.platform, "youtube");
  assert.equal(converted.data.enabled, false);

  for (const platform of ["facebook", "x"]) {
    const unsupported = await request(route, {
      method: "POST",
      cookie: owner.cookie,
      body: {
        name: `Sin adaptador ${platform}`,
        type: "apify",
        platform,
        query: "tendencias",
      },
    });
    assert.equal(unsupported.status, 400, JSON.stringify(unsupported.data));
  }
});

test("blocked social sources reject explicit activation and legacy enabled sources read back paused", async () => {
  for (const [type, platform] of [
    ["youtube", "youtube"],
    ["apify", "instagram"],
    ["apify", "tiktok"],
  ]) {
    const body = {
      name: "Must remain unavailable",
      type,
      platform,
      query: "public company",
      enabled: true,
    };
    const denied = await request(`/brands/${brand.id}/sources`, {
      method: "POST",
      cookie: owner.cookie,
      body,
    });
    assert.equal(denied.status, 403, JSON.stringify(denied.data));
    const legacy = saveRecord(brand.id, "sources", body);
    const enable = await request(`/brands/${brand.id}/sources/${legacy.id}`, {
      method: "PATCH",
      cookie: owner.cookie,
      body: { enabled: true },
    });
    assert.equal(enable.status, 403);
    const state = await request(`/brands/${brand.id}/state`, {
      cookie: owner.cookie,
    });
    assert.equal(state.status, 200, JSON.stringify(state.data));
    const displayed = state.data.sources.find(
      (source) => source.id === legacy.id,
    );
    assert.equal(displayed.enabled, false);
    assert.equal(displayed.accessPolicy.allowed, false);
  }
});

test("reference CRUD cannot forge video analysis or provider provenance", async () => {
  const route = `/brands/${brand.id}/references`;
  const created = await request(route, {
    method: "POST",
    cookie: owner.cookie,
    body: {
      title: "Referencia capturada manualmente",
      text: "Contenido de referencia",
      url: "https://example.com/original",
      source: "Equipo",
      sourceId: "forged-source-id",
      sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk",
      externalId: "forged-external-id",
      platform: "youtube",
      videoId: "abcdefghijk",
      thumbnailUrl: "https://images.example.test/thumb.jpg",
      mediaUrl: "https://cdn.example.test/private.mp4",
      mediaAccess: "provider_url",
      mediaProvider: "apify",
      contentScope: "video_audio",
      videoAnalysis: { summary: "Inventado por el cliente" },
      trend: { score: 100, metrics: { views: 1000000 } },
      metrics: { views: 1000000 },
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.source, "Equipo");
  for (const key of [
    "sourceId",
    "sourceUrl",
    "externalId",
    "platform",
    "videoId",
    "thumbnailUrl",
    "mediaUrl",
    "mediaAccess",
    "mediaProvider",
    "contentScope",
    "videoAnalysis",
    "trend",
    "metrics",
  ])
    assert.equal(
      created.data[key],
      undefined,
      `${key} must be server controlled`,
    );

  const forgedPatch = await request(`${route}/${created.data.id}`, {
    method: "PATCH",
    cookie: owner.cookie,
    body: {
      source: "Equipo",
      sourceId: "forged-source-id",
      platform: "tiktok",
      mediaUrl: "https://cdn.example.test/forged.mp4",
      mediaProvider: "apify",
      mediaAccess: "provider_url",
      videoAnalysis: { summary: "También inventado" },
    },
  });
  assert.equal(forgedPatch.status, 200, JSON.stringify(forgedPatch.data));
  assert.equal(forgedPatch.data.source, "Equipo");
  assert.equal(forgedPatch.data.sourceId, undefined);
  assert.equal(forgedPatch.data.platform, undefined);
  assert.equal(forgedPatch.data.mediaUrl, undefined);
  assert.equal(forgedPatch.data.mediaProvider, undefined);
  assert.equal(forgedPatch.data.mediaAccess, undefined);
  assert.equal(forgedPatch.data.videoAnalysis, undefined);

  const reservedCreate = await request(route, {
    method: "POST",
    cookie: owner.cookie,
    body: {
      title: "Intento de suplantar con un origen reservado",
      text: "Referencia editorial",
      source: "YouTube Data API",
    },
  });
  assert.equal(reservedCreate.status, 201, JSON.stringify(reservedCreate.data));
  assert.equal(reservedCreate.data.source, "manual");

  const reservedPatch = await request(`${route}/${created.data.id}`, {
    method: "PATCH",
    cookie: owner.cookie,
    body: { source: "Apify" },
  });
  assert.equal(reservedPatch.status, 200, JSON.stringify(reservedPatch.data));
  assert.equal(reservedPatch.data.source, "manual");
});

test("editing reference content or asset invalidates audiovisual analysis and media", async () => {
  const capture = await request(`/brands/${brand.id}/references`, {
    method: "POST",
    cookie: owner.cookie,
    body: {
      title: "Referencia original",
      text: "Texto inicial",
      url: "https://example.com/original-to-edit",
    },
  });
  assert.equal(capture.status, 201);
  const referenceId = capture.data.id;
  const asset = saveRecord(brand.id, "assets", {
    name: "video-prueba.mp4",
    type: "video",
    mimeType: "video/mp4",
    size: 100,
    storageName: "video-prueba.mp4",
  });
  const derived = {
    contentScope: "video_audio",
    platform: "youtube",
    videoId: "abcdefghijk",
    thumbnailUrl: "https://img.example.test/thumbnail.jpg",
    mediaUrl: "https://cdn.example.test/video.mp4",
    mediaAccess: "provider_url",
    mediaProvider: "apify",
    videoAnalysis: {
      engine: "gemini",
      status: "completed",
      summary: "Resultado sembrado para comprobar invalidación.",
    },
  };
  const refreshAnalysis = () => {
    const current = getRecord(brand.id, "references", referenceId);
    saveRecord(brand.id, "references", { ...current, ...derived });
  };
  const assertInvalidated = (record) => {
    for (const key of Object.keys(derived))
      assert.equal(record[key], undefined, `${key} should be invalidated`);
  };
  const patch = (body) =>
    request(`/brands/${brand.id}/references/${referenceId}`, {
      method: "PATCH",
      cookie: owner.cookie,
      body,
    });

  refreshAnalysis();
  let result = await patch({ text: "Texto editado" });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assertInvalidated(result.data);

  refreshAnalysis();
  result = await patch({ url: "https://example.com/otro-video" });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assertInvalidated(result.data);

  refreshAnalysis();
  result = await patch({ assetId: asset.id });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assertInvalidated(result.data);
});
