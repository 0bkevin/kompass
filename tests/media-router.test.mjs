import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-media-router-"));
process.env.DATA_DIR = dataDir;
process.env.MEDIA_GENERATION_ENABLED = "false";
process.env.DISCOVERY_ENABLED = "false";
for (const name of [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "YOUTUBE_API_KEY",
  "APIFY_API_TOKEN",
])
  process.env[name] = "";

const storage = await import("../server/db.mjs");
const auth = await import("../server/auth.mjs");
const { createApp } = await import("../server/index.mjs");
const { createMediaGenerationService } =
  await import("../server/media-generation.mjs");
const capabilities = {
  image: {
    ready: true,
    provider: "codex-chatgpt",
    label: "Imagen IA de prueba",
  },
  video: {
    ready: true,
    provider: "local-composition",
    label: "Video animado de prueba, sin audio",
  },
  ratios: ["1:1", "4:5", "9:16", "16:9"],
};
const generation = createMediaGenerationService({
  autoRun: false,
  capabilities: () => capabilities,
  generateImage: async () => {
    throw new Error("The router test must not call a live provider");
  },
});
const calls = [];
let simulateFailure = false,
  server,
  origin;
const service = {
  ...generation,
  mediaCapabilities: async () => capabilities,
  createMediaJob: async (brandId, user, body) => {
    calls.push({ brandId, userId: user.id, body });
    if (simulateFailure)
      throw new Error("private-worker-path-and-transcript-qa");
    return generation.createMediaJob(brandId, user, body);
  },
};

function account() {
  const user = auth.createUser({
    name: "Equipo QA de multimedia",
    email: `${randomUUID()}@example.invalid`,
    passwordHash: "fixture-only",
  });
  const token = randomUUID();
  storage.db
    .prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    )
    .run(auth.tokenHash(token), user.id, Date.now() + 600_000);
  return { ...user, cookie: `radar_session=${token}` };
}

function fixture() {
  const owner = account(),
    editor = account(),
    reviewer = account(),
    outsider = account();
  const brand = storage.saveBrand({
    name: "Empresa pública QA de multimedia",
    audience: [],
  });
  for (const [role, user] of Object.entries({ owner, editor, reviewer }))
    storage.db
      .prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?)")
      .run(brand.id, user.id, role);
  const foreignBrand = storage.saveBrand({
    name: "Otra empresa QA",
    audience: [],
  });
  storage.db
    .prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,'owner')")
    .run(foreignBrand.id, outsider.id);
  const piece = storage.saveRecord(brand.id, "pieces", {
    title: "Un piloto con revisión humana",
    script: "Contexto público de prueba.",
    assetIds: [],
    scenes: [],
    status: "draft",
  });
  const foreignPiece = storage.saveRecord(foreignBrand.id, "pieces", {
    title: "Pieza de otra empresa",
    script: "Otro contexto público.",
    assetIds: [],
    scenes: [],
  });
  return {
    owner,
    editor,
    reviewer,
    outsider,
    brand,
    foreignBrand,
    piece,
    foreignPiece,
    route: `/brands/${brand.id}/media`,
  };
}

async function request(
  route,
  { cookie, method = "GET", body, headers = {}, rawBody } = {},
) {
  const response = await fetch(`${origin}/api${route}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body !== undefined || rawBody !== undefined
        ? { "content-type": "application/json" }
        : {}),
      ...headers,
    },
    ...(rawBody !== undefined
      ? { body: rawBody }
      : body !== undefined
        ? { body: JSON.stringify(body) }
        : {}),
  });
  return {
    status: response.status,
    headers: response.headers,
    data: await response.json(),
  };
}

const input = (pieceId, extra = {}) => ({
  pieceId,
  kind: "image",
  prompt: "Ilustración original para una prueba pública.",
  aspectRatio: "1:1",
  idempotencyKey: randomUUID(),
  ...extra,
});

before(async () => {
  server = createApp({ apiOnly: true, mediaGeneration: service }).listen(
    0,
    "127.0.0.1",
  );
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await generation.stopMediaJobs();
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  });
  storage.db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("every media endpoint requires an authenticated session", async () => {
  const f = fixture(),
    count = calls.length;
  for (const suffix of ["", "/jobs", "/jobs/unknown"])
    assert.equal((await request(f.route + suffix)).status, 401);
  assert.equal(
    (
      await request(f.route + "/jobs", {
        method: "POST",
        body: input(f.piece.id),
      })
    ).status,
    401,
  );
  assert.equal(calls.length, count);
});

test("another company's member cannot read or create jobs across tenants", async () => {
  const f = fixture(),
    count = calls.length;
  for (const suffix of ["", "/jobs", "/jobs/unknown"])
    assert.equal(
      (await request(f.route + suffix, { cookie: f.outsider.cookie })).status,
      404,
    );
  assert.equal(
    (
      await request(f.route + "/jobs", {
        cookie: f.outsider.cookie,
        method: "POST",
        body: input(f.piece.id),
      })
    ).status,
    404,
  );
  assert.equal(
    calls.length,
    count,
    "authorization rejects the request before invoking the provider service",
  );
});

test("reviewers can see capabilities and jobs but cannot consume generation credits", async () => {
  const f = fixture(),
    count = calls.length;
  const home = await request(f.route, { cookie: f.reviewer.cookie });
  assert.equal(home.status, 200);
  assert.deepEqual(home.data, { capabilities, jobs: [] });
  assert.equal(home.headers.get("cache-control"), "no-store");
  assert.deepEqual(
    (await request(f.route + "/jobs", { cookie: f.reviewer.cookie })).data,
    { jobs: [] },
  );
  const rejected = await request(f.route + "/jobs", {
    cookie: f.reviewer.cookie,
    method: "POST",
    body: input(f.piece.id),
  });
  assert.equal(rejected.status, 403);
  assert.match(rejected.data.error, /permisos de edición/);
  assert.equal(calls.length, count);
});

test("editors receive a persisted 202 job under their authenticated identity", async () => {
  const f = fixture(),
    body = input(f.piece.id);
  const response = await request(f.route + "/jobs", {
    cookie: f.editor.cookie,
    method: "POST",
    body,
  });
  assert.equal(response.status, 202);
  assert.equal(response.data.status, "queued");
  assert.equal(response.data.pieceId, f.piece.id);
  assert.equal(response.data.kind, "image");
  assert.deepEqual(response.data.assetIds, []);
  assert.deepEqual(calls.at(-1), {
    brandId: f.brand.id,
    userId: f.editor.id,
    body,
  });
  const internal = storage.getRecord(f.brand.id, "mediaJobs", response.data.id);
  assert.equal(internal.createdBy, f.editor.id);
  assert.equal(internal.pieceSnapshot.script, f.piece.script);
  assert.equal(
    (
      await request(f.route + `/jobs/${response.data.id}`, {
        cookie: f.owner.cookie,
      })
    ).data.id,
    response.data.id,
  );
});

test("owners can create, repeat an idempotent request, and inspect the same job from the combined endpoint", async () => {
  const f = fixture(),
    body = input(f.piece.id, { kind: "video", aspectRatio: "9:16" });
  const first = await request(f.route + "/jobs", {
    cookie: f.owner.cookie,
    method: "POST",
    body,
  });
  const repeat = await request(f.route + "/jobs", {
    cookie: f.owner.cookie,
    method: "POST",
    body,
  });
  assert.equal(first.status, 202);
  assert.equal(repeat.status, 202);
  assert.equal(first.data.id, repeat.data.id);
  const home = await request(f.route, { cookie: f.owner.cookie });
  assert.equal(home.data.jobs.length, 1);
  assert.equal(home.data.jobs[0].outputType, "videoanimated");
  assert.match(home.data.jobs[0].label, /sin audio/);
  const conflict = await request(f.route + "/jobs", {
    cookie: f.owner.cookie,
    method: "POST",
    body: { ...body, prompt: "Instrucciones distintas." },
  });
  assert.equal(conflict.status, 409);
});

test("job read responses omit internal snapshots, transcripts, paths and user identifiers", async () => {
  const f = fixture();
  const created = await request(f.route + "/jobs", {
    cookie: f.owner.cookie,
    method: "POST",
    body: input(f.piece.id),
  });
  const record = storage.getRecord(f.brand.id, "mediaJobs", created.data.id);
  storage.saveRecord(f.brand.id, "mediaJobs", {
    ...record,
    status: "completed",
    assetIds: ["asset-qa"],
    workerTranscript: "private-transcript-marker",
    filePath: "/private/auth.json",
    workingDir: "/private/media",
    pieceSnapshot: { script: "private-snapshot-marker" },
  });
  for (const suffix of ["", "/jobs", `/jobs/${record.id}`]) {
    const response = await request(f.route + suffix, {
      cookie: f.reviewer.cookie,
    });
    assert.equal(response.status, 200);
    const json = JSON.stringify(response.data);
    assert.doesNotMatch(
      json,
      /pieceSnapshot|createdBy|fingerprint|workerTranscript|workingDir|filePath|private-transcript-marker|private-snapshot-marker|private\/auth/,
    );
    assert.ok(json.includes("asset-qa"));
  }
});

test("foreign piece and job identifiers stay inaccessible even to company editors", async () => {
  const f = fixture();
  const foreignJob = generation.createMediaJob(
    f.foreignBrand.id,
    f.outsider,
    input(f.foreignPiece.id),
  );
  const read = await request(f.route + `/jobs/${foreignJob.id}`, {
    cookie: f.editor.cookie,
  });
  assert.equal(read.status, 404);
  const create = await request(f.route + "/jobs", {
    cookie: f.editor.cookie,
    method: "POST",
    body: input(f.foreignPiece.id),
  });
  assert.equal(create.status, 404);
  assert.equal(storage.listRecords(f.brand.id, "mediaJobs").length, 0);
});

test("invalid input and cross-origin mutations fail without producing jobs", async () => {
  const f = fixture();
  for (const body of [
    input(f.piece.id, { command: "unsafe" }),
    input(f.piece.id, { aspectRatio: "invalid" }),
    {},
    input(f.piece.id, { prompt: "x".repeat(4001) }),
  ])
    assert.equal(
      (
        await request(f.route + "/jobs", {
          cookie: f.owner.cookie,
          method: "POST",
          body,
        })
      ).status,
      400,
    );
  const malformed = await request(f.route + "/jobs", {
    cookie: f.owner.cookie,
    method: "POST",
    rawBody: "{",
  });
  assert.equal(malformed.status, 400);
  const forged = await request(f.route + "/jobs", {
    cookie: f.owner.cookie,
    method: "POST",
    body: input(f.piece.id),
    headers: { origin: "https://untrusted.example.invalid" },
  });
  assert.equal(forged.status, 403);
  assert.match(forged.data.error, /Origen/);
  assert.equal(storage.listRecords(f.brand.id, "mediaJobs").length, 0);
});

test("unexpected service exceptions return a generic error without private worker diagnostics", async () => {
  const f = fixture();
  simulateFailure = true;
  try {
    const response = await request(f.route + "/jobs", {
      cookie: f.owner.cookie,
      method: "POST",
      body: input(f.piece.id),
    });
    assert.equal(response.status, 500);
    assert.doesNotMatch(
      JSON.stringify(response.data),
      /private-worker|transcript/,
    );
    assert.match(response.data.error, /error interno/);
  } finally {
    simulateFailure = false;
  }
});
