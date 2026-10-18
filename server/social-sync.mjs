import express from "express";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  db,
  getBrand,
  getRecord,
  listRecords,
  getSecret,
  setSecret,
} from "./db.mjs";
import {
  publicPiece,
  requireAuth,
  requireBrand,
  requireEditor,
  requireOwner,
} from "./core.mjs";
import { readCookie, resolveUser, tokenHash } from "./auth.mjs";

// This connector deliberately does not enter the legacy scraping, reference
// analysis or learning pipelines. YouTube API data remains a separate, attributed
// catalogue and raw counters; it never becomes a derived editorial metric.
const DAY = 86_400_000;
const RETENTION = 30 * DAY;
const INTERVAL = 60 * 60_000;
const SECRET = "official:youtube";
const COOKIE = "radar_youtube_transaction";
const CALLBACK = "/api/social/youtube/callback";
const SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API_ROOT = "https://www.googleapis.com/youtube/v3/";
const randomToken = () => randomBytes(32).toString("base64url");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const locks = new Set();
const refreshes = new Map();
const safeError = Symbol("safeOfficialSocialError");

db.exec(`
  CREATE TABLE IF NOT EXISTS official_social_catalog (brand_id TEXT PRIMARY KEY REFERENCES brands(id) ON DELETE CASCADE, data TEXT NOT NULL, observed_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS official_social_metrics (brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE, piece_id TEXT NOT NULL, data TEXT NOT NULL, observed_at INTEGER NOT NULL, PRIMARY KEY(brand_id,piece_id));
  CREATE TABLE IF NOT EXISTS official_social_publications (brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE, piece_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(brand_id,piece_id));
  CREATE TABLE IF NOT EXISTS official_social_state (brand_id TEXT PRIMARY KEY REFERENCES brands(id) ON DELETE CASCADE, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS official_social_oauth (state_hash TEXT PRIMARY KEY, brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, session_hash TEXT NOT NULL, browser_hash TEXT NOT NULL, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS official_social_quota (day TEXT NOT NULL, kind TEXT NOT NULL, used INTEGER NOT NULL, PRIMARY KEY(day,kind));
`);

function fail(status, message) {
  throw Object.assign(new Error(message), { status, [safeError]: true });
}
function userFacingSyncError(error) {
  return error?.[safeError]
    ? error.message
    : "No se pudo actualizar YouTube. Revisa la conexión y vuelve a intentarlo.";
}
function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(400, "Envía un objeto JSON válido.");
  return value;
}
function settings(brandId) {
  const row = db
    .prepare("SELECT data FROM official_social_state WHERE brand_id=?")
    .get(brandId);
  return row ? JSON.parse(row.data) : {};
}
function saveSettings(brandId, patch) {
  const next = { ...settings(brandId), ...patch };
  db.prepare(
    "INSERT INTO official_social_state(brand_id,data) VALUES(?,?) ON CONFLICT(brand_id) DO UPDATE SET data=excluded.data",
  ).run(brandId, JSON.stringify(next));
  return next;
}
function clearOperationError(brandId, source) {
  const state = settings(brandId);
  return !state.lastErrorSource || state.lastErrorSource === source
    ? { lastError: null, lastErrorSource: null }
    : {};
}

export function youtubeConnectionConfig(env = process.env) {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = env.GOOGLE_YOUTUBE_REDIRECT_URI?.trim();
  if (
    !clientId ||
    !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId) ||
    !clientSecret ||
    !redirectUri
  )
    return null;
  try {
    const url = new URL(redirectUri);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      url.pathname !== CALLBACK ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
    )
      return null;
    return {
      clientId,
      clientSecret,
      redirectUri,
      origin: url.origin,
      secure: url.protocol === "https:",
    };
  } catch {
    return null;
  }
}

function configuredKey(env = process.env) {
  // Separate from YOUTUBE_API_KEY, whose legacy editorial use remains blocked.
  const value = env.YOUTUBE_DATA_API_KEY?.trim();
  return value && value.length <= 500 ? value : null;
}

function purgeBrandData(brandId) {
  db.prepare("DELETE FROM official_social_catalog WHERE brand_id=?").run(
    brandId,
  );
  db.prepare("DELETE FROM official_social_metrics WHERE brand_id=?").run(
    brandId,
  );
  db.prepare("DELETE FROM official_social_publications WHERE brand_id=?").run(
    brandId,
  );
  db.prepare("DELETE FROM official_social_state WHERE brand_id=?").run(brandId);
}

export function recoverSocialSync({ now = Date.now() } = {}) {
  db.prepare("DELETE FROM official_social_catalog WHERE observed_at<=?").run(
    now - RETENTION,
  );
  db.prepare("DELETE FROM official_social_metrics WHERE observed_at<=?").run(
    now - RETENTION,
  );
  const expired = db
    .prepare(
      "SELECT state_hash,brand_id FROM official_social_oauth WHERE expires_at<=?",
    )
    .all(now);
  for (const transaction of expired)
    setSecret(
      transaction.brand_id,
      `official:youtube:oauth:${transaction.state_hash}`,
      null,
    );
  db.prepare("DELETE FROM official_social_oauth WHERE expires_at<=?").run(now);
  db.prepare("DELETE FROM official_social_quota WHERE day<?").run(
    new Date(now - 2 * DAY).toISOString().slice(0, 10),
  );
  for (const row of db
    .prepare("SELECT brand_id,piece_id,data FROM official_social_publications")
    .all()) {
    const piece = getRecord(row.brand_id, "pieces", row.piece_id);
    const publication = JSON.parse(row.data);
    if (
      !piece ||
      (!publication.disabled &&
        (!approvedPiece(piece) ||
          publication.approvalVersion !== publicPiece(piece).approvalVersion))
    ) {
      db.prepare(
        "DELETE FROM official_social_publications WHERE brand_id=? AND piece_id=?",
      ).run(row.brand_id, row.piece_id);
      db.prepare(
        "DELETE FROM official_social_metrics WHERE brand_id=? AND piece_id=?",
      ).run(row.brand_id, row.piece_id);
    }
  }
  // A manual correction/removal of a link or approval must not leave counters
  // attached to the wrong publication, including after a server restart.
  for (const row of db
    .prepare("SELECT brand_id,piece_id,data FROM official_social_metrics")
    .all()) {
    const piece = getRecord(row.brand_id, "pieces", row.piece_id);
    const snapshot = JSON.parse(row.data);
    if (
      !approvedPiece(piece) ||
      snapshot.approvalVersion !== publicPiece(piece).approvalVersion ||
      publicationFor(row.brand_id, piece)?.externalId !== snapshot.externalId
    )
      db.prepare(
        "DELETE FROM official_social_metrics WHERE brand_id=? AND piece_id=?",
      ).run(row.brand_id, row.piece_id);
  }
}

function reserveQuota(kind, now) {
  const day = new Date(now).toISOString().slice(0, 10);
  const limit = kind === "search" ? 70 : 1000;
  const used =
    db
      .prepare("SELECT used FROM official_social_quota WHERE day=? AND kind=?")
      .get(day, kind)?.used || 0;
  if (used >= limit)
    fail(
      429,
      "Se alcanzó el presupuesto diario de consultas de YouTube. Se reanudará mañana.",
    );
  db.prepare(
    "INSERT INTO official_social_quota(day,kind,used) VALUES(?,?,1) ON CONFLICT(day,kind) DO UPDATE SET used=used+1",
  ).run(day, kind);
}

async function boundedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) fail(502, "YouTube devolvió una respuesta vacía.");
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) {
        await reader.cancel();
        fail(502, "YouTube devolvió demasiados datos.");
      }
      chunks.push(value);
    }
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid object");
    return value;
  } catch (error) {
    if (error.status) throw error;
    fail(502, "YouTube devolvió una respuesta inválida.");
  } finally {
    reader.releaseLock();
  }
}

async function requestJson(url, init, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    fail(502, "No se pudo contactar con YouTube. Intenta de nuevo.");
  }
  if (!response.ok) {
    if (response.status === 401)
      fail(401, "La conexión de YouTube venció. Vuelve a conectar la cuenta.");
    if (response.status === 403)
      fail(
        403,
        "YouTube rechazó el acceso. Comprueba que la API esté habilitada y que la conexión tenga permisos.",
      );
    if (response.status === 429)
      fail(429, "YouTube alcanzó su límite de consultas. Intenta más tarde.");
    if (response.status === 400 && String(url) === TOKEN_URL)
      fail(
        401,
        "La autorización de YouTube fue revocada. Conecta la cuenta de nuevo.",
      );
    fail(
      502,
      `YouTube no pudo completar la consulta (HTTP ${response.status}).`,
    );
  }
  return boundedJson(response);
}

function connectionContext(brandId, connection = getSecret(brandId, SECRET)) {
  return {
    generation: settings(brandId).generation || "initial",
    identity: connection
      ? digest(
          JSON.stringify([
            connection.connectedAt,
            connection.channelId,
            connection.ownerId,
            connection.accessToken,
            connection.refreshToken,
          ]),
        )
      : null,
  };
}
function sameConnection(brandId, expected) {
  if (!expected || !getBrand(brandId)) return false;
  const current = connectionContext(brandId);
  return (
    current.identity === expected.identity &&
    current.generation === expected.generation
  );
}
function revokeCurrentConnection(brandId, expected) {
  if (!sameConnection(brandId, expected)) return;
  setSecret(brandId, SECRET, null);
  purgeBrandData(brandId);
  saveSettings(brandId, { disabled: true, generation: randomUUID() });
}

async function accountToken(brandId, { env, fetchImpl, now }) {
  const connection = getSecret(brandId, SECRET);
  if (!connection?.accessToken) fail(409, "Conecta YouTube para continuar.");
  const context = connectionContext(brandId, connection);
  if (connection.expiresAt > now + 60_000)
    return { accessToken: connection.accessToken, context };
  const refreshKey = `${brandId}:${context.generation}:${context.identity}`;
  if (refreshes.has(refreshKey)) return refreshes.get(refreshKey);
  const run = (async () => {
    const config = youtubeConnectionConfig(env);
    if (!connection.refreshToken || !config) {
      revokeCurrentConnection(brandId, context);
      fail(409, "La conexión de YouTube venció. Vuelve a conectar la cuenta.");
    }
    try {
      const token = await requestJson(
        TOKEN_URL,
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            refresh_token: connection.refreshToken,
            grant_type: "refresh_token",
          }),
        },
        fetchImpl,
      );
      if (
        typeof token.access_token !== "string" ||
        !Number.isFinite(token.expires_in) ||
        token.expires_in <= 0
      )
        fail(502, "Google no devolvió una autorización válida.");
      const channels = await api(
        brandId,
        "channels",
        { part: "snippet", mine: true, fields: "items(id,snippet/title)" },
        { env, fetchImpl, now, token: token.access_token },
      );
      const channel = channels.items?.find(
        (item) => item.id === connection.channelId,
      );
      if (!channel)
        fail(
          401,
          "El canal conectado ya no está autorizado. Conecta YouTube de nuevo.",
        );
      if (!sameConnection(brandId, context))
        fail(409, "La conexión cambió durante la consulta.");
      setSecret(brandId, SECRET, {
        ...connection,
        accessToken: token.access_token,
        name: cleanText(channel.snippet?.title, 150) || "Canal de YouTube",
        expiresAt: now + Math.min(token.expires_in, 86400) * 1000,
        checkedAt: new Date(now).toISOString(),
      });
      saveSettings(brandId, clearOperationError(brandId, "connection"));
      return {
        accessToken: token.access_token,
        context: connectionContext(brandId),
      };
    } catch (error) {
      if (error.status === 401) revokeCurrentConnection(brandId, context);
      throw error;
    }
  })();
  refreshes.set(refreshKey, run);
  try {
    return await run;
  } finally {
    refreshes.delete(refreshKey);
  }
}

async function api(brandId, endpoint, parameters, options) {
  if (!["search", "videos", "channels"].includes(endpoint))
    fail(400, "Consulta de YouTube no admitida.");
  const {
    env = process.env,
    fetchImpl = fetch,
    now = Date.now(),
    token,
  } = options;
  const key = configuredKey(env);
  const headers = { accept: "application/json" };
  let context;
  if (token) headers.authorization = `Bearer ${token}`;
  else if (key) headers["x-goog-api-key"] = key;
  else {
    const account = await accountToken(brandId, { env, fetchImpl, now });
    context = account.context;
    if (!sameConnection(brandId, context))
      fail(409, "La conexión cambió durante la consulta.");
    headers.authorization = `Bearer ${account.accessToken}`;
  }
  reserveQuota(endpoint === "search" ? "search" : "data", now);
  const url = new URL(endpoint, API_ROOT);
  for (const [name, value] of Object.entries(parameters))
    url.searchParams.set(name, String(value));
  try {
    return await requestJson(url.href, { headers }, fetchImpl);
  } catch (error) {
    if (error.status === 401 && !token && !key)
      revokeCurrentConnection(brandId, context);
    throw error;
  }
}

export function youtubeVideoId(value) {
  if (typeof value !== "string" || value.length > 3000) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    )
      return null;
    let id;
    if (
      ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)
    ) {
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      else id = url.pathname.match(/^\/(?:shorts|live)\/([\w-]{11})\/?$/)?.[1];
    } else if (url.hostname === "youtu.be")
      id = url.pathname.match(/^\/([\w-]{11})\/?$/)?.[1];
    return /^[\w-]{11}$/.test(id || "") ? id : null;
  } catch {
    return null;
  }
}

function counter(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (!/^\d+$/.test(String(value))) return null;
  const result = Number(value);
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}
function nativeMetrics(statistics) {
  return {
    views: counter(statistics?.viewCount),
    likes: counter(statistics?.likeCount),
    comments: counter(statistics?.commentCount),
  };
}
function cleanText(value, max) {
  return typeof value === "string"
    ? value
        .replace(/<[^>]*>/g, " ")
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";
}
function approvedPiece(piece) {
  return (
    piece &&
    !piece.isDemo &&
    ["approved", "scheduled", "published"].includes(piece.status) &&
    piece.channel === "youtube"
  );
}
function publicationFor(brandId, piece) {
  if (!approvedPiece(piece)) return null;
  const stored = db
    .prepare(
      "SELECT data FROM official_social_publications WHERE brand_id=? AND piece_id=?",
    )
    .get(brandId, piece.id);
  if (stored) {
    const publication = JSON.parse(stored.data);
    return !publication.disabled &&
      publication.approvalVersion === publicPiece(piece).approvalVersion
      ? publication
      : null;
  }
  const externalId = youtubeVideoId(piece.publishedUrl);
  return externalId
    ? {
        pieceId: piece.id,
        externalId,
        publishedUrl: `https://www.youtube.com/watch?v=${externalId}`,
      }
    : null;
}
function publicPublication(publication) {
  const { pieceId, externalId, publishedUrl, linkedAt } = publication;
  return { pieceId, externalId, publishedUrl, linkedAt };
}
export function linkSocialPublication(
  brandId,
  input,
  { now = Date.now() } = {},
) {
  const body = object(input);
  if (
    Object.keys(body).some(
      (key) => !["pieceId", "publishedUrl"].includes(key),
    ) ||
    typeof body.pieceId !== "string"
  )
    fail(400, "Envía una pieza y un enlace público de YouTube.");
  const piece = getRecord(brandId, "pieces", body.pieceId);
  if (!piece) fail(404, "No se encontró la pieza en esta empresa.");
  if (piece.channel !== "youtube")
    fail(400, "Elige una pieza creada para YouTube.");
  if (!approvedPiece(piece))
    fail(
      409,
      "Selecciona una pieza propia de YouTube que esté aprobada, programada o publicada.",
    );
  const externalId = youtubeVideoId(body.publishedUrl);
  if (!externalId)
    fail(400, "Usa el enlace público HTTPS de un video de YouTube.");
  const publication = {
    pieceId: piece.id,
    externalId,
    publishedUrl: `https://www.youtube.com/watch?v=${externalId}`,
    linkedAt: new Date(now).toISOString(),
    approvalVersion: publicPiece(piece).approvalVersion,
  };
  db.prepare(
    "INSERT INTO official_social_publications(brand_id,piece_id,data) VALUES(?,?,?) ON CONFLICT(brand_id,piece_id) DO UPDATE SET data=excluded.data",
  ).run(brandId, piece.id, JSON.stringify(publication));
  db.prepare(
    "DELETE FROM official_social_metrics WHERE brand_id=? AND piece_id=?",
  ).run(brandId, piece.id);
  saveSettings(brandId, { lastSyncedAt: null, generation: randomUUID() });
  return publicPublication(publication);
}
export function unlinkSocialPublication(brandId, pieceId) {
  if (!getRecord(brandId, "pieces", pieceId))
    fail(404, "No se encontró la pieza en esta empresa.");
  db.prepare(
    "INSERT INTO official_social_publications(brand_id,piece_id,data) VALUES(?,?,?) ON CONFLICT(brand_id,piece_id) DO UPDATE SET data=excluded.data",
  ).run(brandId, pieceId, JSON.stringify({ pieceId, disabled: true }));
  db.prepare(
    "DELETE FROM official_social_metrics WHERE brand_id=? AND piece_id=?",
  ).run(brandId, pieceId);
  saveSettings(brandId, { lastSyncedAt: null, generation: randomUUID() });
  return { ok: true };
}
function ready(brandId, env) {
  if (settings(brandId).disabled) return false;
  return !!configuredKey(env) || !!getSecret(brandId, SECRET)?.accessToken;
}

function currentOperation(brandId, generation, env) {
  if (
    !getBrand(brandId) ||
    !ready(brandId, env) ||
    (settings(brandId).generation || "initial") !== generation
  )
    fail(
      409,
      "La conexión cambió durante la consulta. No se guardaron los datos.",
    );
}

export function socialConnections(brandId, { env = process.env } = {}) {
  const connection = getSecret(brandId, SECRET);
  const config = youtubeConnectionConfig(env);
  const available = ready(brandId, env);
  const state = settings(brandId);
  return {
    providers: [
      {
        id: "youtube",
        name: "YouTube",
        configured: !!configuredKey(env) || !!connection || !!config,
        ready: available,
        reason: state.disabled
          ? "La actualización de YouTube está pausada para esta empresa. Actívala para volver a consultar datos públicos."
          : available
            ? "Catálogo público y contadores acumulados de YouTube. No incluye métricas derivadas ni datos de espectadores."
            : config
              ? "Conecta un canal con permiso de lectura para buscar y actualizar sus publicaciones."
              : "Falta habilitar YouTube Data API en la plataforma para buscar y actualizar contadores públicos.",
        ...(state.disabled && configuredKey(env)
          ? {
              enableUrl: `/api/brands/${brandId}/social/connections/youtube/public`,
            }
          : {}),
        ...(config
          ? { connectUrl: `/api/brands/${brandId}/social/youtube/authorize` }
          : {}),
        ...(connection
          ? {
              connection: {
                id: connection.channelId,
                name: connection.name,
                connectedAt: connection.connectedAt,
                ...(state.lastSyncedAt
                  ? { lastSyncedAt: state.lastSyncedAt }
                  : {}),
                ...(state.lastError ? { lastError: state.lastError } : {}),
              },
            }
          : {}),
      },
      {
        id: "instagram",
        name: "Instagram",
        configured: false,
        ready: false,
        reason:
          "Requiere una aplicación de Meta aprobada y autorización de una cuenta profesional. Una URL pública no conecta sus métricas.",
      },
      {
        id: "linkedin",
        name: "LinkedIn",
        configured: false,
        ready: false,
        reason:
          "Requiere acceso aprobado a Community Management y autorización de la página de empresa.",
      },
      {
        id: "tiktok",
        name: "TikTok",
        configured: false,
        ready: false,
        reason:
          "Requiere una aplicación aprobada y autorización del creador mediante Display API. No se usa Research API para este producto comercial.",
      },
    ],
    automaticSync: {
      enabled: available && env.SOCIAL_SYNC_ENABLED !== "false",
      intervalMinutes: 60,
      ...(state.lastSyncedAt ? { lastSyncedAt: state.lastSyncedAt } : {}),
      ...(state.lastError ? { lastError: state.lastError } : {}),
      ...(state.lastSyncedAt ? { lastSyncedAt: state.lastSyncedAt } : {}),
    },
  };
}

export function socialMetricSnapshots(brandId, { now = Date.now() } = {}) {
  recoverSocialSync({ now });
  const snapshots = db
    .prepare(
      "SELECT data FROM official_social_metrics WHERE brand_id=? ORDER BY observed_at DESC",
    )
    .all(brandId)
    .map((row) => JSON.parse(row.data));
  return {
    snapshots,
    publications: db
      .prepare("SELECT data FROM official_social_publications WHERE brand_id=?")
      .all(brandId)
      .map((row) => JSON.parse(row.data))
      .filter((publication) => !publication.disabled)
      .map(publicPublication),
    ...(settings(brandId).lastSyncedAt
      ? { lastSyncedAt: settings(brandId).lastSyncedAt }
      : {}),
  };
}

export function socialDiscoveryCache(brandId, { now = Date.now() } = {}) {
  recoverSocialSync({ now });
  const row = db
    .prepare("SELECT data FROM official_social_catalog WHERE brand_id=?")
    .get(brandId);
  return row
    ? { ...JSON.parse(row.data), cached: true }
    : { items: [], query: "", cached: false };
}

async function exclusive(key, run) {
  if (locks.has(key))
    fail(409, "Ya hay una consulta de YouTube en curso. Espera a que termine.");
  locks.add(key);
  try {
    return await run();
  } finally {
    locks.delete(key);
  }
}

export async function discoverOfficialContent(
  brandId,
  input = {},
  options = {},
) {
  const { env = process.env, fetchImpl = fetch, now = Date.now() } = options;
  const body = object(input);
  if (Object.keys(body).some((key) => !["query", "limit"].includes(key)))
    fail(400, "La búsqueda contiene campos no admitidos.");
  if (body.query !== undefined && typeof body.query !== "string")
    fail(400, "La búsqueda debe ser texto.");
  const brand = getBrand(brandId);
  if (!brand) fail(404, "No se encontró la empresa.");
  if (brand.isDemo)
    fail(409, "Crea una empresa propia para buscar contenido real.");
  const query = cleanText(
    body.query ??
      settings(brandId).query ??
      (brand.pillars || []).slice(0, 3).join(" "),
    200,
  );
  if (!query) fail(400, "Escribe un tema para buscar en YouTube.");
  const limit = body.limit ?? 12;
  if (!Number.isInteger(limit) || limit < 1 || limit > 25)
    fail(400, "El límite debe estar entre 1 y 25.");
  if (!ready(brandId, env))
    fail(409, "YouTube todavía no está conectado en esta empresa.");
  return exclusive(`discover:${brandId}`, async () => {
    const generation = settings(brandId).generation || "initial";
    const previous = socialDiscoveryCache(brandId, { now });
    if (
      previous.observedAt &&
      now - Date.parse(previous.observedAt) < 15 * 60_000 &&
      previous.query === query &&
      previous.limit === limit
    )
      return previous;
    const result = await api(
      brandId,
      "search",
      {
        part: "snippet",
        type: "video",
        q: query,
        maxResults: limit,
        order: "date",
        publishedAfter: new Date(now - 7 * DAY).toISOString(),
        safeSearch: "moderate",
        relevanceLanguage: "es",
        fields: "items(id/videoId)",
      },
      { env, fetchImpl, now },
    );
    if (!Array.isArray(result.items))
      fail(502, "YouTube no devolvió una lista de publicaciones válida.");
    const ids = [
      ...new Set(
        result.items
          .map((item) => item.id?.videoId)
          .filter((id) => /^[\w-]{11}$/.test(id || "")),
      ),
    ].slice(0, limit);
    let items = [];
    if (ids.length) {
      const videos = await api(
        brandId,
        "videos",
        {
          part: "snippet,statistics",
          id: ids.join(","),
          fields:
            "items(id,snippet(title,publishedAt),statistics(viewCount,likeCount,commentCount))",
        },
        { env, fetchImpl, now },
      );
      if (!Array.isArray(videos.items))
        fail(502, "YouTube no devolvió los detalles solicitados.");
      items = videos.items
        .filter((item) => ids.includes(item.id))
        .map((item) => ({
          id: item.id,
          title:
            cleanText(item.snippet?.title, 500) || "Publicación sin título",
          url: `https://www.youtube.com/watch?v=${item.id}`,
          ...(Number.isFinite(Date.parse(item.snippet?.publishedAt))
            ? { publishedAt: item.snippet.publishedAt }
            : {}),
          platform: "youtube",
          metrics: nativeMetrics(item.statistics),
          observedAt: new Date(now).toISOString(),
          attribution: "YouTube Data API",
          access: "official_public_api",
          window: "lifetime",
        }));
    }
    const data = {
      items,
      query,
      limit,
      observedAt: new Date(now).toISOString(),
      cached: false,
      note: "Publicaciones recientes por fecha. Sus contadores son acumulados; esta lista no demuestra crecimiento ni afinidad de audiencia.",
    };
    currentOperation(brandId, generation, env);
    db.prepare(
      "INSERT INTO official_social_catalog(brand_id,data,observed_at) VALUES(?,?,?) ON CONFLICT(brand_id) DO UPDATE SET data=excluded.data,observed_at=excluded.observed_at",
    ).run(brandId, JSON.stringify(data), now);
    saveSettings(brandId, {
      query,
      limit,
      lastDiscoveryAt: data.observedAt,
      ...clearOperationError(brandId, "discovery"),
    });
    return data;
  });
}

export async function syncOfficialMetrics(brandId, options = {}) {
  const {
    env = process.env,
    fetchImpl = fetch,
    now = Date.now(),
    pieceId,
  } = options;
  if (!getBrand(brandId)) fail(404, "No se encontró la empresa.");
  if (!ready(brandId, env))
    fail(409, "YouTube todavía no está conectado en esta empresa.");
  return exclusive(`metrics:${brandId}`, async () => {
    const generation = settings(brandId).generation || "initial";
    recoverSocialSync({ now });
    let pieces = pieceId
      ? [getRecord(brandId, "pieces", pieceId)]
      : listRecords(brandId, "pieces");
    if (pieceId && !pieces[0])
      fail(404, "No se encontró la pieza en esta empresa.");
    if (pieceId && !publicationFor(brandId, pieces[0]))
      fail(
        409,
        "La pieza necesita aprobación, canal YouTube y un enlace público válido de su publicación.",
      );
    const last = settings(brandId).lastSyncedAt;
    if (last && now - Date.parse(last) < 60_000)
      return {
        synced: 0,
        skipped: 0,
        errors: [],
        observedAt: last,
        cached: true,
      };
    const observations = new Map(
      db
        .prepare(
          "SELECT piece_id,observed_at FROM official_social_metrics WHERE brand_id=?",
        )
        .all(brandId)
        .map((row) => [row.piece_id, row.observed_at]),
    );
    pieces = pieces
      .filter((piece) => !!publicationFor(brandId, piece))
      .sort(
        (left, right) =>
          (observations.get(left.id) || 0) - (observations.get(right.id) || 0),
      )
      .slice(0, 50);
    if (!pieces.length)
      return {
        synced: 0,
        skipped: 0,
        errors: [],
        observedAt: new Date(now).toISOString(),
      };
    const ids = [
      ...new Set(
        pieces.map((piece) => publicationFor(brandId, piece).externalId),
      ),
    ];
    try {
      const result = await api(
        brandId,
        "videos",
        {
          part: "snippet,statistics",
          id: ids.join(","),
          fields:
            "items(id,snippet(publishedAt),statistics(viewCount,likeCount,commentCount))",
        },
        { env, fetchImpl, now },
      );
      if (!Array.isArray(result.items))
        fail(502, "YouTube no devolvió una lista de métricas válida.");
      currentOperation(brandId, generation, env);
      const byId = new Map(
        result.items
          .filter((item) => ids.includes(item.id))
          .map((item) => [item.id, item]),
      );
      let synced = 0;
      const errors = [];
      for (const previous of pieces) {
        // Re-read after network I/O so a revoked approval or edited URL is never
        // overwritten by a stale request. Manual outcomes remain untouched.
        const piece = getRecord(brandId, "pieces", previous.id);
        const id = publicationFor(brandId, previous)?.externalId;
        if (
          !id ||
          !approvedPiece(piece) ||
          publicPiece(piece).approvalVersion !==
            publicPiece(previous).approvalVersion ||
          publicationFor(brandId, piece)?.externalId !== id
        )
          continue;
        const video = byId.get(id);
        if (!video) {
          db.prepare(
            "DELETE FROM official_social_metrics WHERE brand_id=? AND piece_id=?",
          ).run(brandId, piece.id);
          errors.push({
            pieceId: piece.id,
            error:
              "YouTube no devolvió esta publicación: puede haberse eliminado o ser privada.",
          });
          continue;
        }
        const snapshot = {
          id: `youtube:${piece.id}`,
          pieceId: piece.id,
          title: piece.title,
          platform: "youtube",
          externalId: id,
          publishedUrl: `https://www.youtube.com/watch?v=${id}`,
          observedAt: new Date(now).toISOString(),
          window: "lifetime",
          metrics: nativeMetrics(video.statistics),
          leads: null,
          origin: "official_api",
          approvalVersion: publicPiece(piece).approvalVersion,
          attribution: "YouTube Data API",
          note: "Contadores públicos acumulados. No verifican propiedad del canal, conversiones ni personas únicas.",
        };
        db.prepare(
          "INSERT INTO official_social_metrics(brand_id,piece_id,data,observed_at) VALUES(?,?,?,?) ON CONFLICT(brand_id,piece_id) DO UPDATE SET data=excluded.data,observed_at=excluded.observed_at",
        ).run(brandId, piece.id, JSON.stringify(snapshot), now);
        synced++;
      }
      const observedAt = new Date(now).toISOString();
      saveSettings(brandId, {
        lastSyncedAt: observedAt,
        ...(errors.length
          ? { lastError: errors[0].error, lastErrorSource: "metrics" }
          : clearOperationError(brandId, "metrics")),
      });
      return { synced, skipped: pieces.length - synced, errors, observedAt };
    } catch (error) {
      if (
        getBrand(brandId) &&
        (settings(brandId).generation || "initial") === generation
      )
        saveSettings(brandId, {
          lastError: userFacingSyncError(error),
          lastErrorSource: "metrics",
        });
      throw error;
    }
  });
}

function cookieValue(req) {
  const values = (req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${COOKIE}=`));
  return values.length === 1 &&
    /^[\w-]{43}$/.test(values[0].slice(COOKIE.length + 1))
    ? values[0].slice(COOKIE.length + 1)
    : null;
}

export function createSocialSyncRouter({
  env = process.env,
  fetchImpl = fetch,
  clock = Date.now,
} = {}) {
  const router = express.Router();
  router.get("/social/youtube/callback", async (req, res) => {
    const config = youtubeConnectionConfig(env);
    if (!config) return res.redirect(303, "/settings?socialError=unavailable");
    if (
      req.get("host")?.toLowerCase() !==
      new URL(config.redirectUri).host.toLowerCase()
    )
      return res.redirect(303, "/settings?socialError=invalid_state");
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const browser = cookieValue(req);
    const transaction = /^[\w-]{43}$/.test(state)
      ? db
          .prepare("SELECT * FROM official_social_oauth WHERE state_hash=?")
          .get(digest(state))
      : null;
    const user = resolveUser(req);
    const membership =
      transaction && user
        ? db
            .prepare("SELECT role FROM members WHERE brand_id=? AND user_id=?")
            .get(transaction.brand_id, user.id)
        : null;
    if (
      !transaction ||
      !browser ||
      transaction.browser_hash !== digest(browser) ||
      transaction.expires_at <= clock() ||
      user?.id !== transaction.user_id ||
      tokenHash(readCookie(req) || "") !== transaction.session_hash ||
      membership?.role !== "owner"
    )
      return res.redirect(303, "/settings?socialError=invalid_state");
    const transactionSecret = getSecret(
      transaction.brand_id,
      `official:youtube:oauth:${transaction.state_hash}`,
    );
    db.prepare("DELETE FROM official_social_oauth WHERE state_hash=?").run(
      transaction.state_hash,
    );
    setSecret(
      transaction.brand_id,
      `official:youtube:oauth:${transaction.state_hash}`,
      null,
    );
    res.clearCookie(COOKIE, {
      path: CALLBACK,
      httpOnly: true,
      sameSite: "lax",
      secure: config.secure,
    });
    if (req.query.error)
      return res.redirect(303, "/settings?socialError=cancelled");
    try {
      if (
        typeof req.query.code !== "string" ||
        req.query.code.length > 4096 ||
        !transactionSecret?.verifier ||
        (settings(transaction.brand_id).generation || "initial") !==
          transactionSecret.generation
      )
        fail(400, "Código inválido.");
      const token = await requestJson(
        TOKEN_URL,
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code: req.query.code,
            code_verifier: transactionSecret.verifier,
            redirect_uri: config.redirectUri,
            grant_type: "authorization_code",
          }),
        },
        fetchImpl,
      );
      if (
        typeof token.access_token !== "string" ||
        !Number.isFinite(token.expires_in) ||
        token.expires_in <= 0
      )
        fail(400, "Google no autorizó la lectura de YouTube.");
      if (
        !String(token.scope || "")
          .split(/\s+/)
          .includes(SCOPE)
      )
        throw Object.assign(new Error("YouTube read permission missing"), {
          socialError: "missing_scope",
        });
      const channels = await api(
        transaction.brand_id,
        "channels",
        {
          part: "snippet",
          mine: true,
          fields: "items(id,snippet/title),pageInfo/totalResults",
        },
        { env, fetchImpl, now: clock(), token: token.access_token },
      );
      if (
        (Array.isArray(channels.items) && channels.items.length === 0) ||
        (channels.items === undefined && channels.pageInfo?.totalResults === 0)
      )
        throw Object.assign(new Error("No authorized YouTube channel"), {
          socialError: "no_channel",
        });
      if (!Array.isArray(channels.items))
        fail(502, "YouTube no devolvió una lista de canales válida.");
      const channel = channels.items?.[0];
      if (!channel || !/^UC[\w-]{22}$/.test(channel.id))
        fail(
          409,
          "Esta cuenta de Google no tiene un canal de YouTube disponible.",
        );
      // Confirm the original owner still exists after the external round trip.
      if (
        resolveUser(req)?.id !== user.id ||
        (settings(transaction.brand_id).generation || "initial") !==
          transactionSecret.generation ||
        db
          .prepare("SELECT role FROM members WHERE brand_id=? AND user_id=?")
          .get(transaction.brand_id, user.id)?.role !== "owner"
      )
        fail(403, "La autorización de la empresa cambió.");
      const previous = getSecret(transaction.brand_id, SECRET);
      purgeBrandData(transaction.brand_id);
      saveSettings(transaction.brand_id, {
        generation: randomUUID(),
        disabled: false,
      });
      setSecret(transaction.brand_id, SECRET, {
        accessToken: token.access_token,
        ...(typeof token.refresh_token === "string"
          ? { refreshToken: token.refresh_token }
          : previous?.channelId === channel.id && previous.refreshToken
            ? { refreshToken: previous.refreshToken }
            : {}),
        expiresAt: clock() + Math.min(token.expires_in, 86400) * 1000,
        channelId: channel.id,
        name: cleanText(channel.snippet?.title, 150) || "Canal de YouTube",
        connectedAt: new Date(clock()).toISOString(),
        checkedAt: new Date(clock()).toISOString(),
        ownerId: user.id,
        scope: SCOPE,
      });
      return res.redirect(303, "/settings?socialConnected=youtube");
    } catch (error) {
      // Only these locally assigned enums reach the browser. Never serialize
      // provider diagnostics, authorization codes, tokens or account details.
      const code = ["no_channel", "missing_scope"].includes(error.socialError)
        ? error.socialError
        : "connection_failed";
      return res.redirect(303, `/settings?socialError=${code}`);
    }
  });
  router.use("/brands/:brandId/social", requireAuth, requireBrand);
  router.get("/brands/:brandId/social/connections", (req, res) =>
    res.json(socialConnections(req.brand.id, { env })),
  );
  router.get("/brands/:brandId/social/metrics", (req, res) =>
    res.json(socialMetricSnapshots(req.brand.id, { now: clock() })),
  );
  router.get("/brands/:brandId/social/discover", (req, res) =>
    res.json(socialDiscoveryCache(req.brand.id, { now: clock() })),
  );
  router.post(
    "/brands/:brandId/social/publications",
    requireEditor,
    (req, res) =>
      res
        .status(201)
        .json(linkSocialPublication(req.brand.id, req.body, { now: clock() })),
  );
  router.delete(
    "/brands/:brandId/social/publications/:pieceId",
    requireEditor,
    (req, res) =>
      res.json(unlinkSocialPublication(req.brand.id, req.params.pieceId)),
  );
  router.post(
    "/brands/:brandId/social/discover",
    requireEditor,
    async (req, res) =>
      res.json(
        await discoverOfficialContent(req.brand.id, req.body, {
          env,
          fetchImpl,
          now: clock(),
        }),
      ),
  );
  router.post(
    "/brands/:brandId/social/sync",
    requireEditor,
    async (req, res) => {
      if (req.body && Object.keys(object(req.body)).length)
        fail(400, "La sincronización no admite opciones adicionales.");
      res.json(
        await syncOfficialMetrics(req.brand.id, {
          env,
          fetchImpl,
          now: clock(),
        }),
      );
    },
  );
  router.post(
    "/brands/:brandId/pieces/:pieceId/metrics/sync",
    requireAuth,
    requireBrand,
    requireEditor,
    async (req, res) =>
      res.json(
        await syncOfficialMetrics(req.brand.id, {
          env,
          fetchImpl,
          now: clock(),
          pieceId: req.params.pieceId,
        }),
      ),
  );
  router.get(
    "/brands/:brandId/social/youtube/authorize",
    requireOwner,
    (req, res) => {
      const config = youtubeConnectionConfig(env);
      if (!config)
        fail(
          503,
          "La conexión de canal YouTube aún no está configurada por la plataforma.",
        );
      recoverSocialSync({ now: clock() });
      const state = randomToken(),
        browser = randomToken(),
        verifier = randomToken();
      const stateHash = digest(state);
      // Bound pending transactions per owner, including abandoned attempts.
      const pending = db
        .prepare(
          "SELECT state_hash,brand_id FROM official_social_oauth WHERE user_id=?",
        )
        .all(req.user.id);
      for (const item of pending) {
        db.prepare("DELETE FROM official_social_oauth WHERE state_hash=?").run(
          item.state_hash,
        );
        setSecret(
          item.brand_id,
          `official:youtube:oauth:${item.state_hash}`,
          null,
        );
      }
      db.prepare(
        "INSERT INTO official_social_oauth(state_hash,brand_id,user_id,session_hash,browser_hash,expires_at) VALUES(?,?,?,?,?,?)",
      ).run(
        stateHash,
        req.brand.id,
        req.user.id,
        tokenHash(readCookie(req) || ""),
        digest(browser),
        clock() + 10 * 60_000,
      );
      setSecret(req.brand.id, `official:youtube:oauth:${stateHash}`, {
        verifier,
        generation: settings(req.brand.id).generation || "initial",
      });
      res.cookie(COOKIE, browser, {
        path: CALLBACK,
        httpOnly: true,
        sameSite: "lax",
        secure: config.secure,
        maxAge: 10 * 60_000,
      });
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      for (const [key, value] of Object.entries({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: "code",
        scope: SCOPE,
        state,
        access_type: "offline",
        prompt: "consent",
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
      }))
        url.searchParams.set(key, value);
      res.redirect(303, url.href);
    },
  );
  router.post(
    "/brands/:brandId/social/connections/youtube/public",
    requireOwner,
    (req, res) => {
      if (!configuredKey(env))
        fail(
          409,
          "La plataforma todavía no tiene acceso al catálogo público de YouTube.",
        );
      saveSettings(req.brand.id, { disabled: false, generation: randomUUID() });
      res.json(socialConnections(req.brand.id, { env }));
    },
  );
  router.delete(
    "/brands/:brandId/social/connections/youtube",
    requireOwner,
    async (req, res) => {
      const connection = getSecret(req.brand.id, SECRET);
      // Stop local use immediately, even if Google's revocation endpoint is down.
      setSecret(req.brand.id, SECRET, null);
      purgeBrandData(req.brand.id);
      saveSettings(req.brand.id, { disabled: true, generation: randomUUID() });
      let revoked = !connection;
      if (connection)
        try {
          const response = await fetchImpl(REVOKE_URL, {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(8000),
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              token: connection.refreshToken || connection.accessToken,
            }),
          });
          revoked = response.ok;
        } catch {
          /* Local deletion remains authoritative for this application. */
        }
      res.json({
        ok: true,
        revoked,
        ...(!revoked
          ? {
              reason:
                "Se borraron la conexión y sus datos locales. Google no confirmó la revocación; puedes retirarla también en los permisos de tu cuenta.",
              permissionsUrl: "https://myaccount.google.com/permissions",
            }
          : {}),
      });
    },
  );
  return router;
}

export function startSocialSyncScheduler({
  env = process.env,
  fetchImpl = fetch,
  clock = Date.now,
  intervalMs = 60_000,
} = {}) {
  let running = false;
  let offset = 0;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      recoverSocialSync({ now: clock() });
      if (env.SOCIAL_SYNC_ENABLED === "false") return;
      const rows = db
        .prepare("SELECT id FROM brands ORDER BY id LIMIT 25 OFFSET ?")
        .all(offset);
      offset = rows.length === 25 ? offset + 25 : 0;
      for (const { id } of rows) {
        if (!ready(id, env) || getBrand(id)?.isDemo) continue;
        const state = settings(id);
        let operation = "connection";
        try {
          const connection = getSecret(id, SECRET);
          if (
            connection &&
            (!connection.checkedAt ||
              clock() - Date.parse(connection.checkedAt) > DAY)
          )
            await accountToken(id, { env, fetchImpl, now: clock() });
          operation = "metrics";
          if (
            !state.lastSyncedAt ||
            clock() - Date.parse(state.lastSyncedAt) >= INTERVAL
          )
            await syncOfficialMetrics(id, { env, fetchImpl, now: clock() });
          operation = "discovery";
          if (
            state.query &&
            (!state.lastDiscoveryAt ||
              clock() - Date.parse(state.lastDiscoveryAt) >= INTERVAL)
          )
            await discoverOfficialContent(
              id,
              { query: state.query, limit: state.limit || 12 },
              { env, fetchImpl, now: clock() },
            );
        } catch (error) {
          if (
            getBrand(id) &&
            (settings(id).generation || "initial") ===
              (state.generation || "initial")
          )
            saveSettings(id, {
              lastError: userFacingSyncError(error),
              lastErrorSource: operation,
            });
        }
      }
    } finally {
      running = false;
    }
  };
  const timer = setInterval(
    () => void tick().catch(() => {}),
    Math.max(intervalMs, 1000),
  );
  timer.unref();
  recoverSocialSync({ now: clock() });
  return {
    tick,
    stop() {
      clearInterval(timer);
    },
  };
}
