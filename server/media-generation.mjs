import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import {
  DATA_DIR,
  UPLOAD_DIR,
  db,
  getBrand,
  getRecord,
  listRecords,
  saveRecord,
  addActivity,
} from "./db.mjs";
import {
  MEDIA_RATIOS,
  localMediaCapabilities,
  generateCodexImage,
  renderAnimatedVideo,
  inspectPng,
  mediaFailure,
  videoCaptions,
} from "../scripts/media-worker.mjs";

const disclosure = {
  image:
    "Imagen creada con IA mediante la suscripción de ChatGPT del servidor.",
  video:
    "Video MP4 compuesto localmente con una ilustración y el guion de la pieza. Incluye movimiento de cámara y subtítulos, sin audio. No es video de movimiento generado por Sora.",
};

export function publicMediaJob(job) {
  if (!job) return null;
  const fields = [
    "id",
    "pieceId",
    "kind",
    "status",
    "stage",
    "aspectRatio",
    "prompt",
    "assetIds",
    "createdAt",
    "updatedAt",
    "startedAt",
    "finishedAt",
    "error",
    "code",
    "provider",
    "outputType",
    "label",
    "idempotencyKey",
    "disclosure",
    "duration",
    "width",
    "height",
  ];
  return Object.fromEntries(
    fields
      .filter((key) => job[key] !== undefined)
      .map((key) => [key, job[key]]),
  );
}

const defaultStorage = {
  getBrand,
  getRecord,
  listRecords,
  saveRecord,
  addActivity,
  allJobs: () =>
    db
      .prepare(
        "SELECT brand_id, data FROM records WHERE kind='mediaJobs' ORDER BY rowid",
      )
      .all()
      .map((row) => ({ brandId: row.brand_id, job: JSON.parse(row.data) })),
};

export function createMediaGenerationService({
  storage = defaultStorage,
  uploadDir = UPLOAD_DIR,
  workRoot = path.join(DATA_DIR, "media-jobs"),
  capabilities = localMediaCapabilities,
  generateImage = generateCodexImage,
  renderVideo = renderAnimatedVideo,
  autoRun = true,
  now = () => new Date(),
} = {}) {
  let draining = null,
    stopped = false,
    controller = null;
  const queue = [];
  const queued = new Set();
  const stamp = () => now().toISOString();
  const list = (brandId) =>
    storage.listRecords(brandId, "mediaJobs").map(publicMediaJob);
  const get = (brandId, id) =>
    publicMediaJob(storage.getRecord(brandId, "mediaJobs", id));
  function save(brandId, job, patch) {
    return storage.saveRecord(brandId, "mediaJobs", {
      ...job,
      ...patch,
      updatedAt: stamp(),
    });
  }
  function enqueue(brandId, id) {
    const key = `${brandId}:${id}`;
    if (!queued.has(key)) {
      queue.push({ brandId, id, key });
      queued.add(key);
    }
    if (autoRun && !stopped)
      queueMicrotask(() => processJobs().catch(() => {}));
  }
  function create(brandId, user, body) {
    if (stopped)
      throw mediaFailure(
        "MEDIA_WORKER_STOPPED",
        "El servicio está reiniciándose. Vuelve a intentarlo en unos segundos.",
        503,
      );
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw mediaFailure(
        "INVALID_MEDIA_REQUEST",
        "Envía los datos de la creación visual.",
      );
    const allowed = new Set([
      "pieceId",
      "kind",
      "prompt",
      "aspectRatio",
      "idempotencyKey",
    ]);
    if (Object.keys(body).some((key) => !allowed.has(key)))
      throw mediaFailure(
        "INVALID_MEDIA_REQUEST",
        "La solicitud contiene opciones de creación no admitidas.",
      );
    for (const key of ["pieceId", "kind", "aspectRatio", "idempotencyKey"])
      if (
        typeof body[key] !== "string" ||
        !body[key].trim() ||
        body[key].length > 100
      )
        throw mediaFailure(
          "INVALID_MEDIA_REQUEST",
          "Selecciona una pieza, tipo, proporción e identificador de solicitud válidos.",
        );
    if (!["image", "video"].includes(body.kind))
      throw mediaFailure("INVALID_MEDIA_KIND", "Selecciona imagen o video.");
    if (!MEDIA_RATIOS.includes(body.aspectRatio))
      throw mediaFailure(
        "INVALID_ASPECT_RATIO",
        "Selecciona una proporción válida.",
      );
    if (
      body.prompt !== undefined &&
      (typeof body.prompt !== "string" || body.prompt.length > 4000)
    )
      throw mediaFailure(
        "INVALID_MEDIA_PROMPT",
        "Las instrucciones visuales admiten hasta 4000 caracteres.",
      );
    const input = {
      pieceId: body.pieceId,
      kind: body.kind,
      prompt: (body.prompt || "").trim(),
      aspectRatio: body.aspectRatio,
    };
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    const existing = storage
      .listRecords(brandId, "mediaJobs")
      .find((job) => job.idempotencyKey === body.idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw mediaFailure(
          "MEDIA_REQUEST_CONFLICT",
          "Esta solicitud ya se usó con otras instrucciones. Inicia una nueva creación.",
          409,
        );
      return publicMediaJob(existing);
    }
    const piece = storage.getRecord(brandId, "pieces", input.pieceId);
    const brand = storage.getBrand(brandId);
    if (!brand || !piece)
      throw mediaFailure(
        "MEDIA_PIECE_NOT_FOUND",
        "La pieza no existe en esta empresa.",
        404,
      );
    const available = capabilities();
    if (!available[input.kind]?.ready)
      throw mediaFailure(
        "MEDIA_NOT_READY",
        available[input.kind]?.reason ||
          "La creación visual aún no está disponible.",
        503,
      );
    if (input.kind === "video") videoCaptions(piece);
    const allJobs = storage.allJobs();
    const daily = allJobs.filter(
      ({ job }) => job.createdAt?.slice(0, 10) === stamp().slice(0, 10),
    );
    if (
      daily.length >= 20 ||
      daily.filter((entry) => entry.brandId === brandId).length >= 10
    )
      throw mediaFailure(
        "MEDIA_DAILY_LIMIT",
        "Se alcanzó el límite diario de creaciones visuales. Vuelve mañana.",
        429,
      );
    if (
      allJobs.filter(
        (entry) =>
          entry.brandId === brandId &&
          ["queued", "running"].includes(entry.job.status),
      ).length >= 3
    )
      throw mediaFailure(
        "MEDIA_QUEUE_FULL",
        "Ya tienes tres creaciones pendientes. Espera a que terminen antes de añadir otra.",
        429,
      );
    const job = storage.saveRecord(brandId, "mediaJobs", {
      ...input,
      id: randomUUID(),
      idempotencyKey: body.idempotencyKey,
      fingerprint,
      createdBy: user.id,
      status: "queued",
      stage: "queued",
      assetIds: [],
      provider: "codex-chatgpt",
      outputType: input.kind === "image" ? "imagecodex" : "videoanimated",
      label:
        input.kind === "image"
          ? "Imagen creada con IA"
          : "Video animado con ilustración IA, sin audio",
      disclosure: disclosure[input.kind],
      createdAt: stamp(),
      updatedAt: stamp(),
      pieceSnapshot: {
        title: piece.title,
        hook: piece.hook,
        script: piece.script,
        cta: piece.cta,
        scenes: (piece.scenes || []).map(({ text }) => ({ text })),
      },
      sourceAssetIds: piece.assetIds || [],
      brandName: brand.name,
    });
    enqueue(brandId, job.id);
    return publicMediaJob(job);
  }
  function persistAsset(brandId, job, result, type) {
    const id = randomUUID(),
      extension = type === "image" ? ".png" : ".mp4";
    const storageName = id + extension;
    const target = path.join(uploadDir, storageName);
    fs.mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
    fs.copyFileSync(result.filePath, target, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(target, 0o600);
    try {
      return storage.saveRecord(brandId, "assets", {
        id,
        name: `${type === "image" ? "Imagen IA" : "Video animado IA"} · ${String(job.pieceSnapshot.title || "Pieza").slice(0, 100)}${extension}`,
        type,
        mimeType: type === "image" ? "image/png" : "video/mp4",
        size: fs.statSync(target).size,
        storageName,
        pieceId: job.pieceId,
        url: `/api/brands/${brandId}/assets/${id}/file`,
        origin: "ai",
        width: result.width,
        height: result.height,
        ...(type === "video" ? { duration: result.duration } : {}),
        generation: {
          jobId: job.id,
          provider: result.provider,
          model: result.model,
          outputType: type === "image" ? "imagecodex" : "videoanimated",
          disclosure: disclosure[type],
        },
      });
    } catch (error) {
      fs.rmSync(target, { force: true });
      throw error;
    }
  }
  function reusableImage(brandId, job) {
    for (const id of job.sourceAssetIds) {
      const asset = storage.getRecord(brandId, "assets", id);
      if (
        asset?.type !== "image" ||
        !["image/png", "image/jpeg", "image/webp"].includes(asset.mimeType) ||
        !asset.storageName ||
        path.basename(asset.storageName) !== asset.storageName
      )
        continue;
      const target = path.join(uploadDir, asset.storageName);
      if (
        !fs.existsSync(target) ||
        fs.lstatSync(target).isSymbolicLink() ||
        !fs.lstatSync(target).isFile()
      )
        continue;
      if (
        !fs
          .realpathSync(target)
          .startsWith(fs.realpathSync(uploadDir) + path.sep)
      )
        continue;
      return target;
    }
    return null;
  }
  async function runJob(brandId, job) {
    if (!storage.getRecord(brandId, "pieces", job.pieceId)) {
      save(brandId, job, {
        status: "failed",
        stage: "failed",
        code: "MEDIA_PIECE_NOT_FOUND",
        error: "La pieza se eliminó antes de iniciar la creación.",
        finishedAt: stamp(),
      });
      return;
    }
    const workDir = path.join(workRoot, job.id);
    controller = new AbortController();
    try {
      const available = capabilities();
      if (!available[job.kind]?.ready)
        throw mediaFailure(
          "MEDIA_NOT_READY",
          available[job.kind]?.reason ||
            "La creación visual ya no está disponible en este servidor.",
          503,
        );
      fs.mkdirSync(workDir, { recursive: true, mode: 0o700 });
      job = save(brandId, job, {
        status: "running",
        stage: "preparing",
        startedAt: stamp(),
      });
      let imagePath = job.kind === "video" ? reusableImage(brandId, job) : null;
      if (!imagePath) {
        job = save(brandId, job, { stage: "generating" });
        const prompt = [
          "Crea una ilustración editorial original para contenido educativo empresarial. No inventes logotipos, testimonios, porcentajes o resultados reales ni representes personas identificables.",
          `Marca: ${job.brandName}. Título: ${job.pieceSnapshot.title || ""}.`,
          `Contexto editorial: ${(job.pieceSnapshot.script || job.pieceSnapshot.hook || "").slice(0, 6000)}`,
          job.prompt ||
            "Estilo claro, sobrio y actual; composición limpia. Evita texto salvo que se pida explícitamente.",
        ].join("\n");
        const image = await generateImage({
          prompt,
          aspectRatio: job.aspectRatio,
          workDir,
          signal: controller.signal,
        });
        if (controller.signal.aborted)
          throw mediaFailure(
            "MEDIA_INTERRUPTED",
            "La creación se interrumpió al detener el servidor.",
            503,
          );
        inspectPng(image.filePath);
        const asset = persistAsset(brandId, job, image, "image");
        imagePath = image.filePath;
        job = save(brandId, job, {
          assetIds: [...job.assetIds, asset.id],
          width: image.width,
          height: image.height,
        });
      }
      if (job.kind === "video") {
        job = save(brandId, job, { stage: "rendering" });
        const video = await renderVideo({
          imagePath,
          piece: job.pieceSnapshot,
          aspectRatio: job.aspectRatio,
          workDir,
          signal: controller.signal,
        });
        if (controller.signal.aborted)
          throw mediaFailure(
            "MEDIA_INTERRUPTED",
            "La creación se interrumpió al detener el servidor.",
            503,
          );
        const asset = persistAsset(brandId, job, video, "video");
        job = save(brandId, job, {
          assetIds: [...job.assetIds, asset.id],
          duration: video.duration,
          width: video.width,
          height: video.height,
        });
      }
      save(brandId, job, {
        status: "completed",
        stage: "completed",
        finishedAt: stamp(),
      });
      storage.addActivity(
        brandId,
        `Se creó ${job.kind === "image" ? "una imagen con IA" : "un video animado"} para «${job.pieceSnapshot.title}». Disponible en la biblioteca para añadir y revisar.`,
      );
    } catch (error) {
      const known =
        error.code?.startsWith("MEDIA_") ||
        [
          "INVALID_IMAGE",
          "INVALID_IMAGE_RESULT",
          "VIDEO_RENDER_FAILED",
          "INVALID_VIDEO_RESULT",
          "VIDEO_SCRIPT_TOO_LONG",
          "VIDEO_SCRIPT_REQUIRED",
        ].includes(error.code);
      save(brandId, job, {
        status: "failed",
        stage: "failed",
        code: known ? error.code : "MEDIA_GENERATION_FAILED",
        error: known
          ? error.message
          : "No se pudo completar la creación visual. Los archivos ya creados se conservan en la biblioteca.",
        finishedAt: stamp(),
      });
    } finally {
      controller = null;
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {
        /* A missing/unavailable work volume must not strand the remaining queue. */
      }
    }
  }
  async function processJobs() {
    if (draining) return draining;
    if (stopped) return;
    draining = (async () => {
      while (queue.length && !stopped) {
        const entry = queue.shift();
        queued.delete(entry.key);
        const job = storage.getRecord(entry.brandId, "mediaJobs", entry.id);
        if (job?.status === "queued") await runJob(entry.brandId, job);
      }
    })();
    try {
      await draining;
    } finally {
      draining = null;
    }
  }
  async function recover() {
    stopped = false;
    for (const { brandId, job } of storage.allJobs()) {
      if (job.status === "running") {
        save(brandId, job, {
          status: "failed",
          stage: "failed",
          code: "MEDIA_INTERRUPTED",
          error:
            "La creación se interrumpió al reiniciar el servidor. No se reintenta automáticamente para evitar consumir créditos dos veces.",
          finishedAt: stamp(),
        });
        if (/^[a-f0-9-]{36}$/i.test(job.id))
          fs.rmSync(path.join(workRoot, job.id), {
            recursive: true,
            force: true,
          });
      } else if (job.status === "queued") enqueue(brandId, job.id);
    }
    if (autoRun) await processJobs();
  }
  async function stop() {
    stopped = true;
    controller?.abort();
    await draining;
  }
  return {
    mediaCapabilities: capabilities,
    createMediaJob: create,
    listMediaJobs: list,
    getMediaJob: get,
    recoverMediaJobs: recover,
    processMediaJobs: processJobs,
    stopMediaJobs: stop,
  };
}

const service = createMediaGenerationService();
export const {
  mediaCapabilities,
  createMediaJob,
  listMediaJobs,
  getMediaJob,
  recoverMediaJobs,
  processMediaJobs,
  stopMediaJobs,
} = service;
