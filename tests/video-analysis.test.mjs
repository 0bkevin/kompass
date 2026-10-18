import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-video-analysis-"));
process.env.DATA_DIR = dataDir;
delete process.env.GEMINI_API_KEY;

const { db, UPLOAD_DIR, saveBrand, saveRecord, getRecord, setSecret } =
  await import("../server/db.mjs");
const { createUser, tokenHash } = await import("../server/auth.mjs");
const { createVideoAnalysisRouter } = await import(
  "../server/video-analysis.mjs"
);

let server;
let origin;
const json = (value, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

function validModelOutput(overrides = {}) {
  return {
    summary: "Una persona presenta un consejo breve frente a cámara.",
    hook: {
      visual: "Plano cercano desde el primer momento.",
      verbal: "Una pregunta abre el video.",
    },
    structure: ["Pregunta inicial", "Explicación", "Cierre"],
    onScreenText: ["Un consejo práctico"],
    audioNotes: "Voz clara, sin música perceptible.",
    adaptation:
      "Abrir con una pregunta del segmento y resolverla con un ejemplo.",
    observations: [
      {
        startSeconds: 0,
        endSeconds: 3.5,
        observation: "La persona mira a cámara y plantea una pregunta.",
      },
      {
        startSeconds: 4,
        endSeconds: 12,
        observation: "Aparece un rótulo breve mientras explica el consejo.",
      },
    ],
    audioAvailable: "yes",
    ...overrides,
  };
}

const completedInteraction = (value = validModelOutput()) =>
  json({
    id: "interaction-test",
    object: "interaction",
    status: "completed",
    steps: [
      {
        type: "model_output",
        content: [{ type: "text", text: JSON.stringify(value) }],
      },
    ],
  });

function fixtureMp4(seconds = 60) {
  const makeBox = (type, payload) => {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(8 + payload.length, 0);
    header.write(type, 4, 4, "ascii");
    return Buffer.concat([header, payload]);
  };
  const fileType = Buffer.alloc(16);
  fileType.write("isom", 0, 4, "ascii");
  fileType.writeUInt32BE(0x200, 4);
  fileType.write("isom", 8, 4, "ascii");
  fileType.write("mp42", 12, 4, "ascii");
  const movieHeader = Buffer.alloc(100);
  movieHeader.writeUInt32BE(1000, 12);
  movieHeader.writeUInt32BE(seconds * 1000, 16);
  return Buffer.concat([
    makeBox("ftyp", fileType),
    makeBox("moov", makeBox("mvhd", movieHeader)),
  ]);
}

async function account(role = "owner") {
  const user = createUser({
    name: `Tester ${role}`,
    email: `${role}-${crypto.randomUUID()}@example.test`,
    passwordHash: "test-only",
  });
  const brand = saveBrand({
    name: "Marca de prueba",
    industry: "Educación",
    description: "Contenido educativo para equipos de marketing.",
    language: "español",
    pillars: ["aprendizaje"],
    audience: [],
  });
  db.prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?)").run(
    brand.id,
    user.id,
    role,
  );
  const token = crypto.randomBytes(32).toString("base64url");
  db.prepare(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
  ).run(tokenHash(token), user.id, Date.now() + 60_000);
  return { user, brand, cookie: `radar_session=${token}` };
}

function addReference(brandId, fields = {}) {
  const baseUrl =
    fields.url === undefined
      ? "https://www.youtube.com/watch?v=abcdefghijk"
      : fields.url;
  const parsedId =
    typeof baseUrl === "string"
      ? new URL(baseUrl).searchParams.get("v") ||
        new URL(baseUrl).pathname.split("/").filter(Boolean).at(-1)
      : undefined;
  const connectorSourceId =
    fields.sourceId ||
    (fields.platform === "youtube"
      ? saveRecord(brandId, "sources", {
          type: "youtube",
          name: "YouTube Data API",
          enabled: true,
        }).id
      : ["instagram", "tiktok"].includes(fields.platform)
        ? saveRecord(brandId, "sources", {
            type: "apify",
            platform: fields.platform,
            name: "Apify social source",
            enabled: true,
          }).id
        : undefined);
  return saveRecord(brandId, "references", {
    title: "Referencia de prueba",
    url: "https://www.youtube.com/watch?v=abcdefghijk",
    source: "manual",
    status: "new",
    tags: [],
    ...(fields.platform === "youtube" && parsedId
      ? { videoId: parsedId, mediaAccess: "youtube_url" }
      : {}),
    ...(connectorSourceId ? { sourceId: connectorSourceId } : {}),
    ...fields,
  });
}

async function startServer(fetcher, lookup) {
  if (server)
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections?.();
    });
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use("/api", createVideoAnalysisRouter({ fetcher, lookup }));
  return new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      origin = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
}

async function request(route, { method = "POST", cookie, body = {} } = {}) {
  const response = await fetch(`${origin}/api${route}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    data: await response.json(),
  };
}

before(async () => {
  await startServer(async () => completedInteraction());
});
after(async () => {
  if (server)
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections?.();
    });
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("requires authentication, brand membership, and editor permissions", async () => {
  const owner = await account();
  const reference = addReference(owner.brand.id, {
    duration: 30,
    platform: "youtube",
  });
  const missingSession = await request(
    `/brands/${owner.brand.id}/references/${reference.id}/analyze-video`,
  );
  assert.equal(missingSession.status, 401);

  const other = await account();
  const otherReference = addReference(other.brand.id, {
    duration: 30,
    platform: "youtube",
  });
  const crossBrand = await request(
    `/brands/${other.brand.id}/references/${otherReference.id}/analyze-video`,
    { cookie: owner.cookie },
  );
  assert.equal(crossBrand.status, 404);

  const reviewer = await account("reviewer");
  db.prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?)").run(
    owner.brand.id,
    reviewer.user.id,
    "reviewer",
  );
  setSecret(owner.brand.id, "gemini", { apiKey: "server-secret" });
  const denied = await request(
    `/brands/${owner.brand.id}/references/${reference.id}/analyze-video`,
    { cookie: reviewer.cookie },
  );
  assert.equal(denied.status, 403);
});

test("missing Gemini key returns a clear conflict without changing the reference", async () => {
  const owner = await account();
  const reference = addReference(owner.brand.id, {
    duration: 45,
    platform: "youtube",
  });
  const before = getRecord(owner.brand.id, "references", reference.id);
  const result = await request(
    `/brands/${owner.brand.id}/references/${reference.id}/analyze-video`,
    { cookie: owner.cookie },
  );
  assert.equal(result.status, 409);
  assert.match(result.data.error, /Configura Gemini/);
  assert.equal(
    getRecord(owner.brand.id, "references", reference.id).videoAnalysis,
    undefined,
  );
  assert.equal(
    getRecord(owner.brand.id, "references", reference.id).status,
    before.status,
  );
});

test("normalizes only exact public YouTube hosts and persists honest structured coverage", async () => {
  const owner = await account();
  setSecret(owner.brand.id, "gemini", {
    apiKey: "gemini-secret-do-not-return",
    model: "gemini-3.8-flash",
  });
  const reference = addReference(owner.brand.id, {
    url: "https://m.youtube.com/watch?v=abcdefghijk&t=12s",
    platform: "youtube",
    videoId: "abcdefghijk",
    mediaAccess: "youtube_url",
    duration: 90,
    trendHistory: [{ observedAt: "before", metrics: { views: 35 } }],
    comments: [{ author: "Luz", text: "revisar", createdAt: "before" }],
  });
  let interaction;
  await startServer(async (url, options) => {
    assert.equal(
      url,
      "https://generativelanguage.googleapis.com/v1beta/interactions",
    );
    assert.equal(
      options.headers["x-goog-api-key"],
      "gemini-secret-do-not-return",
    );
    interaction = JSON.parse(options.body);
    // Concurrent metric/comment updates must survive the eventual save.
    const current = getRecord(owner.brand.id, "references", reference.id);
    saveRecord(owner.brand.id, "references", {
      ...current,
      trendHistory: [
        ...current.trendHistory,
        { observedAt: "during", metrics: { views: 70 } },
      ],
      comments: [
        ...current.comments,
        { author: "Ana", text: "otro comentario", createdAt: "during" },
      ],
    });
    return completedInteraction();
  });
  const result = await request(
    `/brands/${owner.brand.id}/references/${reference.id}/analyze-video`,
    { cookie: owner.cookie, body: { focus: "el gancho" } },
  );
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(
    interaction.input[0].uri,
    "https://www.youtube.com/watch?v=abcdefghijk",
  );
  assert.equal(interaction.model, "gemini-3.8-flash");
  assert.equal(interaction.response_format.type, "text");
  assert.equal(interaction.response_format.mime_type, "application/json");
  assert.ok(interaction.response_format.schema.properties.observations);
  assert.match(interaction.system_instruction, /untrusted data/i);
  assert.equal(result.data.videoAnalysis.engine, "gemini");
  assert.equal(result.data.videoAnalysis.status, "completed");
  assert.equal(result.data.videoAnalysis.contentScope, "video_audio");
  assert.equal(result.data.contentScope, "video_audio");
  assert.equal(result.data.videoAnalysis.coverage.samplingFps, 1);
  assert.match(
    result.data.videoAnalysis.coverage.notes,
    /1 fotograma por segundo/,
  );
  assert.deepEqual(result.data.trendHistory.at(-1).metrics, { views: 70 });
  assert.equal(result.data.comments.length, 2);
  assert.equal(
    JSON.stringify(result.data).includes("gemini-secret-do-not-return"),
    false,
  );
});

test("uses the brand YouTube API secret to bound a manually added public video", async () => {
  const owner = await account();
  setSecret(owner.brand.id, "gemini", { apiKey: "gemini-key" });
  setSecret(owner.brand.id, "youtube", { apiKey: "youtube-metadata-key" });
  const reference = addReference(owner.brand.id, {
    url: "https://youtu.be/abcdefghijk",
    platform: undefined,
    duration: undefined,
    videoId: undefined,
    mediaAccess: undefined,
  });
  const requests = [];
  await startServer(
    async (url, options) => {
      requests.push({ url, options });
      if (url.startsWith("https://www.googleapis.com/youtube/v3/videos"))
        return json({
          items: [
            { id: "abcdefghijk", contentDetails: { duration: "PT1M30S" } },
          ],
        });
      return completedInteraction();
    },
    async () => [{ address: "8.8.8.8", family: 4 }],
  );
  const result = await request(
    `/brands/${owner.brand.id}/references/${reference.id}/analyze-video`,
    { cookie: owner.cookie },
  );
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const durationLookup = requests.find((item) =>
    item.url.includes("youtube/v3/videos"),
  );
  const lookupUrl = new URL(durationLookup.url);
  assert.equal(lookupUrl.searchParams.get("part"), "contentDetails");
  assert.equal(lookupUrl.searchParams.get("id"), "abcdefghijk");
  assert.equal(
    durationLookup.options.headers["x-goog-api-key"],
    "youtube-metadata-key",
  );
  assert.equal(lookupUrl.searchParams.has("key"), false);
});

test("rejects text-only and arbitrary URLs without calling Gemini", async () => {
  const owner = await account();
  setSecret(owner.brand.id, "gemini", { apiKey: "server-key" });
  let calls = 0;
  await startServer(async () => {
    calls++;
    return completedInteraction();
  });
  const arbitrary = addReference(owner.brand.id, {
    url: "https://youtube.com.attacker.example/watch?v=abcdefghijk",
    text: "solo metadatos",
  });
  const rejected = await request(
    `/brands/${owner.brand.id}/references/${arbitrary.id}/analyze-video`,
    { cookie: owner.cookie },
  );
  assert.equal(rejected.status, 422);
  assert.match(
    rejected.data.error,
    /Solo se pueden analizar URLs públicas de YouTube/,
  );
  assert.equal(
    getRecord(owner.brand.id, "references", arbitrary.id).videoAnalysis,
    undefined,
  );

  const metadata = addReference(owner.brand.id, {
    url: undefined,
    text: "Un post sin medio de video",
  });
  const noVideo = await request(
    `/brands/${owner.brand.id}/references/${metadata.id}/analyze-video`,
    { cookie: owner.cookie },
  );
  assert.equal(noVideo.status, 422);
  assert.match(noVideo.data.error, /solo tiene texto o metadatos/);
  assert.equal(calls, 0);
});

test("rejects stale YouTube duration metadata rather than trusting a client body field", async () => {
  const owner = await account();
  setSecret(owner.brand.id, "gemini", { apiKey: "server-key" });
  const reference = addReference(owner.brand.id, {
    platform: "youtube",
    mediaAccess: "youtube_url",
    duration: 30,
  });
  let calls = 0;
  await startServer(async () => {
    calls++;
    return completedInteraction();
  });
  const result = await request(
    `/brands/${owner.brand.id}/references/${reference.id}/analyze-video`,
    { cookie: owner.cookie, body: { focus: "revisa todo", duration: 30 } },
  );
  assert.equal(result.status, 400);
  assert.equal(calls, 0);
  const missing = addReference(owner.brand.id, {
    platform: "youtube",
    mediaAccess: "youtube_url",
    duration: undefined,
  });
  const noDuration = await request(
    `/brands/${owner.brand.id}/references/${missing.id}/analyze-video`,
    { cookie: owner.cookie },
  );
  assert.equal(noDuration.status, 422);
  assert.match(noDuration.data.error, /comprobar la duración/);
  assert.equal(calls, 0);
});

test("private uploaded MP4 uses resumable Files API, accepts files.get plain resources, then deletes upload", async () => {
  const owner = await account();
  setSecret(owner.brand.id, "gemini", { apiKey: "private-gemini-key" });
  const name = crypto.randomUUID();
  fs.writeFileSync(path.join(UPLOAD_DIR, name), fixtureMp4(90));
  const asset = saveRecord(owner.brand.id, "assets", {
    name: "privado.mp4",
    type: "video",
    mimeType: "video/mp4",
    size: fs.statSync(path.join(UPLOAD_DIR, name)).size,
    storageName: name,
    origin: "upload",
  });
  const reference = addReference(owner.brand.id, {
    url: undefined,
    assetId: asset.id,
  });
  const calls = [];
  await startServer(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/upload/v1beta/files"))
      return new Response(null, {
        status: 200,
        headers: {
          "x-goog-upload-url":
            "https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=private-upload-token",
        },
      });
    if (url.includes("upload_id="))
      return json({
        file: {
          name: "files/video-123",
          uri: "https://generativelanguage.googleapis.com/v1beta/files/video-123",
          mimeType: "video/mp4",
          state: "PROCESSING",
        },
      });
    if (url.endsWith("/v1beta/files/video-123") && options.method === "DELETE")
      return json({});
    if (url.endsWith("/v1beta/files/video-123"))
      return json({
        name: "files/video-123",
        uri: "https://generativelanguage.googleapis.com/v1beta/files/video-123",
        mimeType: "video/mp4",
        state: "ACTIVE",
      });
    if (url.endsWith("/v1beta/interactions")) return completedInteraction();
    throw new Error("Unexpected mocked Gemini call");
  });
  const result = await request(
    `/brands/${owner.brand.id}/references/${reference.id}/analyze-video`,
    { cookie: owner.cookie },
  );
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const interactionCall = calls.find((call) =>
    call.url.endsWith("/v1beta/interactions"),
  );
  const interaction = JSON.parse(interactionCall.options.body);
  assert.equal(
    interaction.input[0].uri,
    "https://generativelanguage.googleapis.com/v1beta/files/video-123",
  );
  assert.equal(interaction.input[0].mime_type, "video/mp4");
  assert.equal(
    calls.some((call) => call.options.method === "DELETE"),
    true,
  );
  assert.equal(JSON.stringify(result.data).includes(name), false);
  assert.equal(
    JSON.stringify(result.data).includes("private-upload-token"),
    false,
  );
});

test("analyzes recognized Apify MP4 without duration metadata and hides its signed URL", async () => {
  const owner = await account();
  setSecret(owner.brand.id, "gemini", { apiKey: "server-key" });
  const reference = addReference(owner.brand.id, {
    title: "Reel de referencia",
    url: "https://www.instagram.com/reel/abc123/",
    platform: "instagram",
    mediaUrl: "https://media.apify.example/video.mp4?token=private-media-token",
    mediaAccess: "provider_url",
    mediaProvider: "apify",
  });
  const bytes = fixtureMp4(30);
  const requests = [];
  await startServer(
    async (url, options) => {
      requests.push({ url, options });
      if (url === reference.mediaUrl)
        return new Response(bytes, {
          headers: { "content-type": "video/mp4" },
        });
      if (url.endsWith("/upload/v1beta/files"))
        return new Response(null, {
          status: 200,
          headers: {
            "x-goog-upload-url":
              "https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=apify-file-upload",
          },
        });
      if (url.includes("upload_id="))
        return json({
          file: {
            name: "files/creator-video",
            uri: "https://generativelanguage.googleapis.com/v1beta/files/creator-video",
            mimeType: "video/mp4",
            state: "ACTIVE",
          },
        });
      if (url.endsWith("/v1beta/interactions")) return completedInteraction();
      if (
        url.endsWith("/v1beta/files/creator-video") &&
        options.method === "DELETE"
      )
        return json({});
      throw new Error("Unexpected mocked provider/Gemini call");
    },
    async () => [{ address: "8.8.8.8", family: 4 }],
  );
  const result = await request(
    `/brands/${owner.brand.id}/references/${reference.id}/analyze-video`,
    { cookie: owner.cookie },
  );
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(requests[0].url, reference.mediaUrl);
  assert.equal(result.data.videoAnalysis.coverage.mode, "static");
  assert.equal(result.data.mediaUrl, undefined);
  assert.equal(
    JSON.stringify(result.data).includes("private-media-token"),
    false,
  );
});

test("rejects an invalid private path and a zero-duration MP4 before external processing", async () => {
  const owner = await account();
  setSecret(owner.brand.id, "gemini", { apiKey: "server-key" });
  let calls = 0;
  await startServer(async () => {
    calls++;
    return completedInteraction();
  });
  const tamperedAsset = saveRecord(owner.brand.id, "assets", {
    name: "tampered.mp4",
    type: "video",
    mimeType: "video/mp4",
    size: 16,
    storageName: "../../outside.mp4",
    origin: "upload",
  });
  const tampered = addReference(owner.brand.id, {
    url: undefined,
    assetId: tamperedAsset.id,
  });
  const pathReply = await request(
    `/brands/${owner.brand.id}/references/${tampered.id}/analyze-video`,
    { cookie: owner.cookie },
  );
  assert.equal(pathReply.status, 422);
  assert.match(pathReply.data.error, /ubicación privada/);

  const name = crypto.randomUUID();
  fs.writeFileSync(path.join(UPLOAD_DIR, name), fixtureMp4(0));
  const zeroAsset = saveRecord(owner.brand.id, "assets", {
    name: "zero.mp4",
    type: "video",
    mimeType: "video/mp4",
    size: fs.statSync(path.join(UPLOAD_DIR, name)).size,
    storageName: name,
    origin: "upload",
  });
  const zero = addReference(owner.brand.id, {
    url: undefined,
    assetId: zeroAsset.id,
  });
  const zeroReply = await request(
    `/brands/${owner.brand.id}/references/${zero.id}/analyze-video`,
    { cookie: owner.cookie },
  );
  assert.equal(zeroReply.status, 422);
  assert.match(zeroReply.data.error, /comprobar la duración/);
  assert.equal(calls, 0);
});

test("bad model schema and provider authorization errors never save or leak secrets", async () => {
  const owner = await account();
  setSecret(owner.brand.id, "gemini", { apiKey: "do-not-leak-this-key" });
  const invalid = addReference(owner.brand.id, {
    platform: "youtube",
    mediaAccess: "youtube_url",
    duration: 40,
  });
  await startServer(async () =>
    completedInteraction(
      validModelOutput({
        observations: [
          {
            startSeconds: 0,
            endSeconds: 500,
            observation: "fuera de duración",
          },
        ],
      }),
    ),
  );
  const invalidReply = await request(
    `/brands/${owner.brand.id}/references/${invalid.id}/analyze-video`,
    { cookie: owner.cookie },
  );
  assert.equal(invalidReply.status, 502);
  assert.match(invalidReply.data.error, /marcas de tiempo inválidas/);
  assert.equal(
    getRecord(owner.brand.id, "references", invalid.id).videoAnalysis,
    undefined,
  );

  const unauthorized = addReference(owner.brand.id, {
    platform: "youtube",
    mediaAccess: "youtube_url",
    duration: 40,
  });
  await startServer(
    async () =>
      new Response(JSON.stringify({ error: "do-not-leak-this-key" }), {
        status: 403,
      }),
  );
  const denied = await request(
    `/brands/${owner.brand.id}/references/${unauthorized.id}/analyze-video`,
    { cookie: owner.cookie },
  );
  assert.equal(denied.status, 403);
  assert.doesNotMatch(denied.data.error, /do-not-leak-this-key/);
  assert.equal(
    getRecord(owner.brand.id, "references", unauthorized.id).videoAnalysis,
    undefined,
  );
});

test("rejects a provider URL resolving to a reserved address before fetching it", async () => {
  const owner = await account();
  setSecret(owner.brand.id, "gemini", { apiKey: "server-key" });
  const reference = addReference(owner.brand.id, {
    url: "https://www.instagram.com/reel/abc123/",
    platform: "instagram",
    mediaUrl: "https://media.apify.example/video.mp4",
    mediaAccess: "provider_url",
    mediaProvider: "apify",
    duration: 25,
  });
  let fetches = 0;
  await startServer(
    async () => {
      fetches++;
      return completedInteraction();
    },
    async () => [{ address: "127.0.0.1", family: 4 }],
  );
  const result = await request(
    `/brands/${owner.brand.id}/references/${reference.id}/analyze-video`,
    { cookie: owner.cookie },
  );
  assert.equal(result.status, 400);
  assert.match(result.data.error, /direcciones privadas o reservadas/);
  assert.equal(fetches, 0);
});

test("rejects concurrent analysis and guards against reference changes before save", async () => {
  const owner = await account();
  setSecret(owner.brand.id, "gemini", { apiKey: "server-key" });
  const reference = addReference(owner.brand.id, {
    platform: "youtube",
    mediaAccess: "youtube_url",
    duration: 50,
  });
  let started;
  const requestStarted = new Promise((resolve) => (started = resolve));
  let finish;
  const providerGate = new Promise((resolve) => (finish = resolve));
  await startServer(async () => {
    started();
    await providerGate;
    return completedInteraction();
  });
  const first = request(
    `/brands/${owner.brand.id}/references/${reference.id}/analyze-video`,
    { cookie: owner.cookie },
  );
  await requestStarted;
  const concurrent = await request(
    `/brands/${owner.brand.id}/references/${reference.id}/analyze-video`,
    { cookie: owner.cookie },
  );
  assert.equal(concurrent.status, 409);
  finish();
  const done = await first;
  assert.equal(done.status, 200);

  const stale = addReference(owner.brand.id, {
    platform: "youtube",
    mediaAccess: "youtube_url",
    duration: 80,
    trendHistory: [{ observedAt: "before", metrics: { views: 1 } }],
    comments: [{ author: "Luis", text: "nota inicial", createdAt: "before" }],
  });
  await startServer(async () => {
    const current = getRecord(owner.brand.id, "references", stale.id);
    saveRecord(owner.brand.id, "references", {
      ...current,
      url: "https://www.youtube.com/watch?v=zyxwvutsrqp",
      trendHistory: [{ observedAt: "during", metrics: { views: 9 } }],
      comments: [{ author: "Ana", text: "nota nueva", createdAt: "during" }],
    });
    return completedInteraction();
  });
  const changed = await request(
    `/brands/${owner.brand.id}/references/${stale.id}/analyze-video`,
    { cookie: owner.cookie },
  );
  assert.equal(changed.status, 409);
  const current = getRecord(owner.brand.id, "references", stale.id);
  assert.equal(current.url, "https://www.youtube.com/watch?v=zyxwvutsrqp");
  assert.deepEqual(current.trendHistory[0].metrics, { views: 9 });
  assert.equal(current.comments[0].text, "nota nueva");
  assert.equal(current.videoAnalysis, undefined);
});
