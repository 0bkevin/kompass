import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { spawnSync } from "node:child_process";

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "radar-media-tests-"));
process.env.DATA_DIR = path.join(testRoot, "database");
process.env.MEDIA_GENERATION_ENABLED = "false";
fs.mkdirSync(process.env.DATA_DIR, { mode: 0o700 });
const { createMediaGenerationService, publicMediaJob } =
  await import("../server/media-generation.mjs");
const { db } = await import("../server/db.mjs");
const {
  mediaWorkerEnvironment,
  codexImageArguments,
  resolveGeneratedImage,
  inspectPng,
  renderAnimatedVideo,
  videoCaptions,
  buildVideoSubtitles,
  runBoundedProcess,
  localMediaCapabilities,
} = await import("../scripts/media-worker.mjs");

after(() => {
  db.close();
  fs.rmSync(testRoot, { recursive: true, force: true });
});

function fixturePng(file, width = 64, height = 64) {
  const crc32 = (bytes) => {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, bytes) => {
    const name = Buffer.from(type),
      result = Buffer.alloc(12 + bytes.length);
    result.writeUInt32BE(bytes.length);
    name.copy(result, 4);
    bytes.copy(result, 8);
    result.writeUInt32BE(crc32(Buffer.concat([name, bytes])), 8 + bytes.length);
    return result;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const pixels = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = y * (width * 3 + 1) + 1 + x * 3;
      pixels[at] = Math.floor((x * 255) / width);
      pixels[at + 1] = 90;
      pixels[at + 2] = Math.floor((y * 255) / height);
    }
  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(pixels)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
    { mode: 0o600 },
  );
  return file;
}

function fixtureStore() {
  const records = new Map(),
    brands = new Map([
      ["company-a", { id: "company-a", name: "Educación pública QA" }],
      ["company-b", { id: "company-b", name: "Empresa B QA" }],
    ]);
  const storage = {
    getBrand: (id) => brands.get(id),
    getRecord: (brand, kind, id) =>
      structuredClone(records.get(`${brand}:${kind}:${id}`)),
    listRecords: (brand, kind) =>
      [...records.entries()]
        .filter(([key]) => key.startsWith(`${brand}:${kind}:`))
        .map(([, value]) => structuredClone(value)),
    saveRecord: (brand, kind, value) => {
      const record = {
        createdAt: "2026-10-18T12:00:00.000Z",
        ...value,
        id: value.id || randomUUID(),
      };
      records.set(`${brand}:${kind}:${record.id}`, structuredClone(record));
      return structuredClone(record);
    },
    allJobs: () =>
      [...records.entries()]
        .filter(([key]) => key.includes(":mediaJobs:"))
        .map(([key, job]) => ({
          brandId: key.split(":")[0],
          job: structuredClone(job),
        })),
    addActivity: () => {},
  };
  storage.saveRecord("company-a", "pieces", {
    id: "piece-a",
    title: "Un piloto de IA con revisión humana",
    hook: "Define criterios de evaluación.",
    script:
      "Comienza por un proceso acotado.\n\nRevisa los resultados con una persona responsable.",
    scenes: [],
    assetIds: [],
    status: "approved",
    reviews: [{ action: "approve" }],
  });
  storage.saveRecord("company-b", "pieces", {
    id: "piece-b",
    title: "Solo de la empresa B",
    script: "Contenido público QA.",
    assetIds: [],
  });
  return storage;
}

function harness(options = {}) {
  const root = fs.mkdtempSync(path.join(testRoot, "case-"));
  const storage = fixtureStore(),
    uploadDir = path.join(root, "uploads");
  fs.mkdirSync(uploadDir);
  let calls = 0;
  const service = createMediaGenerationService({
    storage,
    uploadDir,
    workRoot: path.join(root, "jobs"),
    autoRun: false,
    now: () => new Date("2026-10-18T12:00:00.000Z"),
    capabilities: () => ({ image: { ready: true }, video: { ready: true } }),
    generateImage: async ({ workDir }) => {
      calls++;
      const filePath = fixturePng(path.join(workDir, "fixture.png"));
      return {
        filePath,
        ...inspectPng(filePath),
        provider: "codex-chatgpt",
        model: "gpt-image-2",
      };
    },
    renderVideo: async ({ workDir }) => {
      const filePath = path.join(workDir, "fixture.mp4");
      fs.writeFileSync(filePath, Buffer.from("0000ftypisom-video-fixture"));
      return {
        filePath,
        width: 720,
        height: 1280,
        duration: 8,
        provider: "local-composition",
      };
    },
    ...options,
  });
  return { service, storage, uploadDir, root, calls: () => calls };
}

const request = (patch = {}) => ({
  pieceId: "piece-a",
  kind: "image",
  aspectRatio: "1:1",
  prompt: "Ilustración original sin personas ni marcas.",
  idempotencyKey: randomUUID(),
  ...patch,
});
const user = { id: "user-qa" };

test("the subprocess environment strips application API keys, browser sessions and orchestration access", () => {
  const env = mediaWorkerEnvironment({
    HOME: "/home/qa",
    PATH: "/usr/bin",
    CODEX_HOME: "/private/codex",
    OPENAI_API_KEY: "secret-qa",
    GEMINI_API_KEY: "secret-gemini",
    T3_ACP_MCP_NODE: "/private/t3",
    COOKIE: "private-cookie",
    NODE_OPTIONS: "--require malicious.mjs",
  });
  assert.deepEqual(env, {
    HOME: "/home/qa",
    PATH: "/usr/bin",
    CODEX_HOME: "/private/codex",
    NO_COLOR: "1",
  });
  const args = codexImageArguments("/tmp/fixed-workdir");
  for (const value of [
    "--ignore-user-config",
    "--ephemeral",
    "features.shell_tool=false",
    "features.apps=false",
    "features.plugins=false",
    "features.multi_agent=false",
    'web_search="disabled"',
  ])
    assert.ok(args.includes(value));
  assert.equal(args.at(-1), "-");
  assert.ok(!args.some((value) => value.includes("secret-qa")));
});

test("public capabilities are disabled until explicitly enabled; jobs never disclose private snapshots or paths", () => {
  const capability = localMediaCapabilities({ refresh: true });
  assert.equal(capability.image.ready, false);
  assert.equal(capability.video.ready, false);
  const job = publicMediaJob({
    id: "job",
    pieceId: "piece-a",
    status: "queued",
    createdBy: "private-user",
    pieceSnapshot: { script: "private snapshot" },
    fingerprint: "private",
    storageName: "/private/file",
    assetIds: [],
  });
  assert.deepEqual(job, {
    id: "job",
    pieceId: "piece-a",
    status: "queued",
    assetIds: [],
  });
});

test("image results must belong to the exact newly generated Codex thread and cannot be symlinks", () => {
  const root = fs.mkdtempSync(path.join(testRoot, "generated-")),
    thread = randomUUID(),
    other = randomUUID();
  fs.mkdirSync(path.join(root, thread));
  fs.mkdirSync(path.join(root, other));
  const png = fixturePng(path.join(root, thread, "image.png"));
  const events = (candidate) => [
    { type: "thread.started", thread_id: thread },
    {
      type: "item.completed",
      item: { type: "agent_message", text: candidate },
    },
  ];
  assert.equal(resolveGeneratedImage(events(png), root), png);
  const foreign = fixturePng(path.join(root, other, "foreign.png"));
  for (const candidate of [
    foreign,
    path.join(root, thread, "..", other, "foreign.png"),
    "/etc/passwd",
    png + "\nextra",
  ])
    assert.throws(() => resolveGeneratedImage(events(candidate), root), {
      code: "INVALID_IMAGE_RESULT",
    });
  const link = path.join(root, thread, "linked.png");
  fs.symlinkSync(foreign, link);
  assert.throws(() => resolveGeneratedImage(events(link), root), {
    code: "INVALID_IMAGE_RESULT",
  });
});

test("requests are company scoped and cannot supply shell commands, API URLs or worker environment", () => {
  const { service } = harness();
  assert.throws(
    () =>
      service.createMediaJob(
        "company-a",
        user,
        request({ pieceId: "piece-b" }),
      ),
    { status: 404 },
  );
  for (const patch of [
    { command: "touch /tmp/unsafe" },
    { sourceAssetIds: ["foreign"] },
    { env: { OPENAI_API_KEY: "private" } },
    { aspectRatio: "bad" },
    { prompt: "x".repeat(4001) },
  ])
    assert.throws(
      () => service.createMediaJob("company-a", user, request(patch)),
      { status: 400 },
    );
  const blocked = harness({
    capabilities: () => ({
      image: { ready: false, reason: "Inicia sesión en Codex." },
    }),
  });
  assert.throws(
    () => blocked.service.createMediaJob("company-a", user, request()),
    { status: 503, code: "MEDIA_NOT_READY" },
  );
});

test("repeated submissions consume only one generation and conflicting reuse returns 409", async () => {
  const { service, storage, calls, uploadDir } = harness();
  const before = storage.getRecord("company-a", "pieces", "piece-a");
  const input = request();
  const job = service.createMediaJob("company-a", user, input);
  assert.equal(service.createMediaJob("company-a", user, input).id, job.id);
  assert.throws(
    () =>
      service.createMediaJob("company-a", user, {
        ...input,
        prompt: "Other brief",
      }),
    { status: 409 },
  );
  await service.processMediaJobs();
  const completed = service.getMediaJob("company-a", job.id);
  assert.equal(completed.status, "completed");
  assert.equal(calls(), 1);
  assert.equal(completed.assetIds.length, 1);
  assert.equal(service.getMediaJob("company-b", job.id), null);
  const asset = storage.getRecord("company-a", "assets", completed.assetIds[0]);
  assert.equal(asset.mimeType, "image/png");
  assert.equal(asset.origin, "ai");
  assert.equal(asset.generation.outputType, "imagecodex");
  assert.equal(inspectPng(path.join(uploadDir, asset.storageName)).width, 64);
  assert.equal(
    fs.statSync(path.join(uploadDir, asset.storageName)).mode & 0o777,
    0o600,
  );
  assert.deepEqual(
    storage.getRecord("company-a", "pieces", "piece-a"),
    before,
    "generation does not silently attach to or invalidate an approved piece",
  );
});

test("the queue runs sequentially and limits each company to three pending generations", async () => {
  let active = 0,
    maxActive = 0;
  const { service } = harness({
    generateImage: async ({ workDir }) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const filePath = fixturePng(path.join(workDir, "fixture.png"));
      active--;
      return { filePath, ...inspectPng(filePath), provider: "codex-chatgpt" };
    },
  });
  for (let i = 0; i < 3; i++)
    service.createMediaJob("company-a", user, request());
  assert.throws(() => service.createMediaJob("company-a", user, request()), {
    status: 429,
    code: "MEDIA_QUEUE_FULL",
  });
  await Promise.all([service.processMediaJobs(), service.processMediaJobs()]);
  assert.equal(maxActive, 1);
  assert.equal(
    service
      .listMediaJobs("company-a")
      .filter((job) => job.status === "completed").length,
    3,
  );
});

test("daily limits count failed requests as well, preventing unlimited credit-consuming retries", () => {
  const { service, storage } = harness();
  for (let i = 0; i < 10; i++)
    storage.saveRecord("company-a", "mediaJobs", {
      id: `past-${i}`,
      status: "failed",
      createdAt: "2026-10-18T01:00:00.000Z",
    });
  assert.throws(() => service.createMediaJob("company-a", user, request()), {
    status: 429,
    code: "MEDIA_DAILY_LIMIT",
  });
});

test("disabling generation before a queued job starts prevents provider usage", async () => {
  let ready = true;
  const { service, calls } = harness({
    capabilities: () => ({
      image: { ready, reason: "La creación se desactivó." },
    }),
  });
  const job = service.createMediaJob("company-a", user, request());
  ready = false;
  await service.processMediaJobs();
  assert.equal(calls(), 0);
  assert.equal(
    service.getMediaJob("company-a", job.id).code,
    "MEDIA_NOT_READY",
  );
});

test("work volume failures become visible job failures without stranding the queue", async () => {
  const file = path.join(testRoot, `unavailable-volume-${randomUUID()}`);
  fs.writeFileSync(file, "not a directory");
  const { service, calls } = harness({ workRoot: file });
  const jobs = [
    service.createMediaJob("company-a", user, request()),
    service.createMediaJob("company-a", user, request()),
  ];
  await service.processMediaJobs();
  assert.equal(calls(), 0);
  for (const job of jobs)
    assert.equal(service.getMediaJob("company-a", job.id).status, "failed");
});

test("a video reuses a piece's uploaded image without another ChatGPT generation", async () => {
  const { service, storage, uploadDir, calls } = harness();
  fixturePng(path.join(uploadDir, "existing.png"));
  storage.saveRecord("company-a", "assets", {
    id: "existing-image",
    type: "image",
    mimeType: "image/png",
    storageName: "existing.png",
  });
  const piece = storage.getRecord("company-a", "pieces", "piece-a");
  storage.saveRecord("company-a", "pieces", {
    ...piece,
    assetIds: ["existing-image"],
  });
  const job = service.createMediaJob(
    "company-a",
    user,
    request({ kind: "video", aspectRatio: "9:16" }),
  );
  await service.processMediaJobs();
  const completed = service.getMediaJob("company-a", job.id);
  assert.equal(completed.status, "completed");
  assert.equal(calls(), 0);
  assert.match(completed.disclosure, /compuesto localmente/);
  assert.match(completed.label, /sin audio/);
  assert.equal(completed.outputType, "videoanimated");
  assert.equal(
    storage.getRecord("company-a", "assets", completed.assetIds[0]).mimeType,
    "video/mp4",
  );
});

test("foreign or traversal image storage cannot be reused for a video", async () => {
  const { service, storage, calls } = harness();
  storage.saveRecord("company-b", "assets", {
    id: "foreign",
    type: "image",
    mimeType: "image/png",
    storageName: "private.png",
  });
  storage.saveRecord("company-a", "assets", {
    id: "bad",
    type: "image",
    mimeType: "image/png",
    storageName: "../../private.png",
  });
  const piece = storage.getRecord("company-a", "pieces", "piece-a");
  storage.saveRecord("company-a", "pieces", {
    ...piece,
    assetIds: ["foreign", "bad"],
  });
  const job = service.createMediaJob(
    "company-a",
    user,
    request({ kind: "video" }),
  );
  await service.processMediaJobs();
  assert.equal(calls(), 1);
  assert.equal(service.getMediaJob("company-a", job.id).status, "completed");
});

test("provider failures do not expose stderr, private paths or tokens to the user", async () => {
  const { service } = harness({
    generateImage: async () => {
      throw new Error("/home/private/auth.json api-key-private-qa");
    },
  });
  const job = service.createMediaJob("company-a", user, request());
  await service.processMediaJobs();
  const failed = service.getMediaJob("company-a", job.id);
  assert.equal(failed.status, "failed");
  assert.equal(failed.code, "MEDIA_GENERATION_FAILED");
  assert.doesNotMatch(
    JSON.stringify(failed),
    /auth.json|api-key-private|home\/private/,
  );
});

test("restart recovery fails interrupted jobs and resumes only requests that had not started", async () => {
  const { service, storage, calls } = harness();
  const interrupted = service.createMediaJob("company-a", user, request());
  const record = storage.getRecord("company-a", "mediaJobs", interrupted.id);
  storage.saveRecord("company-a", "mediaJobs", {
    ...record,
    status: "running",
    stage: "generating",
  });
  const queued = service.createMediaJob("company-a", user, request());
  await service.recoverMediaJobs();
  await service.processMediaJobs();
  assert.equal(
    service.getMediaJob("company-a", interrupted.id).code,
    "MEDIA_INTERRUPTED",
  );
  assert.equal(service.getMediaJob("company-a", queued.id).status, "completed");
  assert.equal(calls(), 1);
});

test("subprocess cancellation and timeout terminate work instead of leaving an orphan", async () => {
  const controller = new AbortController();
  const running = runBoundedProcess(
    process.execPath,
    ["-e", "setTimeout(() => {}, 60000)"],
    { signal: controller.signal, timeoutMs: 5000 },
  );
  setTimeout(() => controller.abort(), 40);
  await assert.rejects(running, { code: "MEDIA_INTERRUPTED" });
  await assert.rejects(
    runBoundedProcess(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], {
      timeoutMs: 40,
    }),
    { code: "MEDIA_TIMEOUT" },
  );
});

test("captions preserve the script, reject overlong text and escape subtitle formatting", () => {
  const caption = buildVideoSubtitles(
    { script: "{\\pos(1,1)} Texto original.\n\nSegunda parte." },
    720,
    1280,
  );
  assert.match(caption.text, /Texto original/);
  assert.match(caption.text, /Segunda parte/);
  assert.ok(caption.text.includes("\\{\\\\pos(1,1)\\}"));
  assert.throws(() => videoCaptions({ script: "x".repeat(3201) }), {
    code: "VIDEO_SCRIPT_TOO_LONG",
  });
});

test(
  "FFmpeg produces validated H.264 MP4 files in every supported aspect ratio",
  { skip: spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0 },
  async () => {
    const root = fs.mkdtempSync(path.join(testRoot, "real-video-"));
    const imagePath = fixturePng(path.join(root, "fixture.png"));
    const sizes = {
      "1:1": [720, 720],
      "4:5": [720, 900],
      "9:16": [720, 1280],
      "16:9": [1280, 720],
    };
    for (const [aspectRatio, [width, height]] of Object.entries(sizes)) {
      const workDir = path.join(root, aspectRatio.replace(":", "-"));
      fs.mkdirSync(workDir);
      const output = await renderAnimatedVideo({
        imagePath,
        piece: {
          script: "Prueba pública: define un piloto con revisión humana.",
        },
        workDir,
        aspectRatio,
      });
      assert.equal(output.width, width);
      assert.equal(output.height, height);
      assert.equal(output.audio, false);
      assert.ok(output.duration >= 8 && output.duration <= 8.1);
      assert.ok(output.size > 1000);
      assert.equal(
        fs.readFileSync(output.filePath).toString("ascii", 4, 8),
        "ftyp",
      );
    }
  },
);
