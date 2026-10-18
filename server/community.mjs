import express from "express";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { requireAuth, requireBrand, requireEditor } from "./core.mjs";
import {
  db,
  getBrand,
  getRecord,
  listRecords,
  saveRecord,
  deleteRecord,
  addActivity,
} from "./db.mjs";

const MIN_SAMPLE = 5;
const MAX_POLLS = 100;
const SAMPLE_NOTICE =
  "Respuestas voluntarias y no verificadas. No son personas únicas ni una muestra representativa de la audiencia.";

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function strictObject(input, keys) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail(400, "Envía un objeto JSON válido.");
  if (Object.keys(input).some((key) => !keys.includes(key)))
    fail(
      400,
      "Solo se admiten los campos indicados. No envíes datos personales.",
    );
  return input;
}

function text(value, label, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    fail(400, `${label} debe tener entre 1 y ${max} caracteres.`);
  const result = value.trim();
  if (/[\u0000-\u001f\u007f]/.test(result))
    fail(400, `${label} contiene caracteres no admitidos.`);
  return result;
}

function editorialText(value, label, max) {
  const result = text(value, label, max);
  if (
    /[^\s@]+@[^\s@]+\.[^\s@]+/u.test(result) ||
    /(?:\+?\d[\d\s().-]{5,}\d)/.test(result) ||
    /(?:https?:\/\/|mailto:|tel:|\b(?:direcci[oó]n|domicilio)\s*:)/iu.test(
      result,
    )
  )
    fail(
      400,
      `${label} debe describir una necesidad o tema, sin enlaces ni datos de contacto.`,
    );
  return result;
}

function createInput(body, brand) {
  strictObject(body, ["question", "options", "segmentIds"]);
  const question = editorialText(body.question, "La pregunta", 300);
  if (
    !Array.isArray(body.options) ||
    body.options.length < 2 ||
    body.options.length > 6
  )
    fail(400, "Añade entre 2 y 6 opciones de respuesta.");
  const options = body.options.map((label) => ({
    id: randomUUID(),
    label: editorialText(label, "Cada opción", 120),
  }));
  if (
    new Set(
      options.map((item) => item.label.normalize("NFKC").toLocaleLowerCase()),
    ).size !== options.length
  )
    fail(400, "Las opciones de respuesta deben ser distintas.");
  const audience = Array.isArray(brand.audience) ? brand.audience : [];
  if (!audience.length)
    fail(
      400,
      "Define al menos un grupo de audiencia antes de crear una pregunta.",
    );
  const ids = body.segmentIds ?? audience.map((segment) => segment.id);
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 30 ||
    new Set(ids).size !== ids.length
  )
    fail(400, "Selecciona entre 1 y 30 grupos distintos de tu audiencia.");
  const groups = ids.map((id) => {
    text(id, "El grupo", 100);
    const segment = audience.find((item) => item.id === id);
    if (!segment) fail(400, "El grupo no pertenece a esta empresa.");
    return { id: segment.id, name: segment.name };
  });
  return { question, options, groups };
}

function groupTotal(poll, segmentId) {
  return poll.counts
    .filter((item) => item.segmentId === segmentId)
    .reduce((sum, item) => sum + item.count, 0);
}

function resultsFor(poll) {
  return poll.groups.flatMap((group) => {
    const sampleSize = groupTotal(poll, group.id);
    if (sampleSize < MIN_SAMPLE) return [];
    return poll.options.map((option) => ({
      segmentId: group.id,
      topic: option.label,
      count:
        poll.counts.find(
          (item) => item.segmentId === group.id && item.optionId === option.id,
        )?.count || 0,
      sampleSize,
    }));
  });
}

function pollView(poll) {
  return {
    id: poll.id,
    token: poll.token,
    question: poll.question,
    options: poll.options,
    groups: poll.groups,
    active: poll.active,
    totalResponses: poll.counts.reduce((sum, item) => sum + item.count, 0),
    results: resultsFor(poll),
    publicPath: `/community/${poll.token}`,
    createdAt: poll.createdAt,
  };
}

function transaction(action) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = action();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function findPublic(token) {
  if (!/^[a-z\d_-]{43}$/i.test(token))
    fail(404, "No se encontró esta pregunta.");
  const row = db
    .prepare(
      "SELECT brand_id, data FROM records WHERE kind='communityPolls' AND json_extract(data,'$.token')=? LIMIT 1",
    )
    .get(token);
  if (!row) fail(404, "No se encontró esta pregunta.");
  const brand = getBrand(row.brand_id);
  if (!brand) fail(404, "No se encontró esta pregunta.");
  return { brand, poll: JSON.parse(row.data) };
}

function derivedSignals(brand, poll) {
  for (const group of poll.groups) {
    const sampleSize = groupTotal(poll, group.id);
    if (
      sampleSize < MIN_SAMPLE ||
      !brand.audience?.some((item) => item.id === group.id)
    )
      continue;
    for (const option of poll.options) {
      const count =
        poll.counts.find(
          (item) => item.segmentId === group.id && item.optionId === option.id,
        )?.count || 0;
      if (!count) continue;
      const id = `community_${createHash("sha256")
        .update(JSON.stringify([poll.id, group.id, option.id]))
        .digest("hex")
        .slice(0, 32)}`;
      saveRecord(brand.id, "audienceSignals", {
        id,
        segmentId: group.id,
        topic: option.label,
        note: `${count} ${count === 1 ? "respuesta" : "respuestas"} de ${sampleSize} en «${group.name}» seleccionaron este tema. Muestra voluntaria no verificada; no son personas únicas. Esta muestra no representa a toda la audiencia. Pregunta: ${poll.question}`,
        sampleSize,
        sourceType: "community",
        sourceUrl: `/community/${poll.token}`,
        communityPollId: poll.id,
        aggregate: true,
      });
    }
  }
}

// Abuse control is transient and never written into poll records, signals or logs.
// This limits request volume; it does not identify or deduplicate respondents.
function publicRateLimit({ now }) {
  const buckets = new Map();
  const salt = randomBytes(16).toString("hex");
  return (req, res, next) => {
    const current = now();
    for (const [key, value] of buckets)
      if (value.expiresAt <= current) buckets.delete(key);
    const address = req.ip || req.socket?.remoteAddress || "unknown";
    const operation = req.method === "POST" ? "write" : "read";
    const key = createHash("sha256")
      .update(`${salt}:${operation}:${address}`)
      .digest("hex");
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= 5_000)
        return res
          .status(429)
          .json({
            error:
              "Hay muchas solicitudes. Vuelve a intentarlo en unos minutos.",
          });
      bucket = { expiresAt: current + 10 * 60_000, count: 0 };
      buckets.set(key, bucket);
    }
    if (++bucket.count > (operation === "write" ? 60 : 300)) {
      res.set(
        "Retry-After",
        String(Math.max(1, Math.ceil((bucket.expiresAt - current) / 1_000))),
      );
      return res
        .status(429)
        .json({
          error:
            "Se alcanzó el límite de solicitudes. Vuelve a intentarlo en unos minutos.",
        });
    }
    next();
  };
}

export function createCommunityRouter({ now = Date.now } = {}) {
  const router = express.Router();
  router.use("/community/:token", publicRateLimit({ now }));
  router.get("/community/:token", (req, res) => {
    const { brand, poll } = findPublic(req.params.token);
    res.json({
      companyName: brand.name,
      poll: pollView(poll),
      notice: SAMPLE_NOTICE,
    });
  });
  router.post("/community/:token/responses", (req, res) => {
    strictObject(req.body, ["optionId", "segmentId"]);
    const optionId = text(req.body.optionId, "La opción", 100);
    const segmentId = text(req.body.segmentId, "El grupo", 100);
    const view = transaction(() => {
      const { brand, poll } = findPublic(req.params.token);
      if (!poll.active)
        fail(409, "Esta pregunta está cerrada y ya no admite respuestas.");
      if (
        !poll.options.some((item) => item.id === optionId) ||
        !poll.groups.some((item) => item.id === segmentId)
      )
        fail(400, "La opción o el grupo no pertenecen a esta pregunta.");
      if (!brand.audience?.some((item) => item.id === segmentId))
        fail(
          409,
          "Este grupo ya no forma parte de la audiencia de la empresa.",
        );
      const counter = poll.counts.find(
        (item) => item.segmentId === segmentId && item.optionId === optionId,
      );
      if (counter) counter.count++;
      else poll.counts.push({ segmentId, optionId, count: 1 });
      const total = poll.counts.reduce((sum, item) => sum + item.count, 0);
      if (!Number.isSafeInteger(total) || total > 1_000_000)
        fail(409, "Esta pregunta alcanzó su límite de respuestas.");
      const saved = saveRecord(brand.id, "communityPolls", poll);
      derivedSignals(brand, saved);
      return pollView(saved);
    });
    res.json({
      ok: true,
      totalResponses: view.totalResponses,
      results: view.results,
      notice: SAMPLE_NOTICE,
    });
  });

  router.use("/brands/:brandId/community-polls", requireAuth, requireBrand);
  router.get("/brands/:brandId/community-polls", (req, res) =>
    res.json({
      polls: listRecords(req.params.brandId, "communityPolls").map(pollView),
    }),
  );
  router.post("/brands/:brandId/community-polls", requireEditor, (req, res) => {
    const input = createInput(req.body, req.brand);
    if (listRecords(req.params.brandId, "communityPolls").length >= MAX_POLLS)
      fail(
        400,
        `Puedes conservar hasta ${MAX_POLLS} preguntas. Elimina alguna antes de crear otra.`,
      );
    const poll = saveRecord(req.params.brandId, "communityPolls", {
      ...input,
      token: randomBytes(32).toString("base64url"),
      active: true,
      counts: [],
    });
    addActivity(
      req.params.brandId,
      "Se creó una pregunta pública de audiencia con respuestas agregadas.",
    );
    res.status(201).json(pollView(poll));
  });
  router.patch(
    "/brands/:brandId/community-polls/:pollId",
    requireEditor,
    (req, res) => {
      strictObject(req.body, ["active"]);
      if (typeof req.body.active !== "boolean")
        fail(400, "Indica si la pregunta está activa.");
      const poll = getRecord(
        req.params.brandId,
        "communityPolls",
        req.params.pollId,
      );
      if (!poll) fail(404, "No se encontró esta pregunta en la empresa.");
      res.json(
        pollView(
          saveRecord(req.params.brandId, "communityPolls", {
            ...poll,
            active: req.body.active,
          }),
        ),
      );
    },
  );
  router.delete(
    "/brands/:brandId/community-polls/:pollId",
    requireEditor,
    (req, res) => {
      transaction(() => {
        const poll = getRecord(
          req.params.brandId,
          "communityPolls",
          req.params.pollId,
        );
        if (!poll) fail(404, "No se encontró esta pregunta en la empresa.");
        for (const signal of listRecords(req.params.brandId, "audienceSignals"))
          if (signal.communityPollId === poll.id)
            deleteRecord(req.params.brandId, "audienceSignals", signal.id);
        deleteRecord(req.params.brandId, "communityPolls", poll.id);
        addActivity(
          req.params.brandId,
          "Se eliminó una pregunta pública y sus señales agregadas de audiencia.",
        );
      });
      res.json({ ok: true });
    },
  );
  return router;
}
