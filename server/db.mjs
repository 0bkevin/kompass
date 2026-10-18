import { resolveAiConfig } from "./integration-config.mjs";
import { managedTextAvailability } from "./managed-text-readiness.mjs";
import { DatabaseSync } from "node:sqlite";
import {
  randomUUID,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  aiProviderAccessPolicy,
  webhookAccessPolicy,
} from "./access-policy.mjs";

export const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true, mode: 0o700 });
export const db = new DatabaseSync(path.join(DATA_DIR, "radar.sqlite"));
let secretKey;
const kinds = new Set([
  "references",
  "ideas",
  "pieces",
  "assets",
  "sources",
  "contextImports",
  "audienceSignals",
  "outcomes",
  "topicSnapshots",
  "communityPolls",
  "opportunityAnalyses",
  "opportunityFeedback",
  "mediaJobs",
]);
export function initDb() {
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_identities (provider TEXT NOT NULL CHECK(provider='google'), subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL, PRIMARY KEY(provider,subject), UNIQUE(provider,user_id));
    CREATE TABLE IF NOT EXISTS google_auth_transactions (state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, nonce TEXT NOT NULL, code_verifier TEXT NOT NULL, return_to TEXT NOT NULL, expires_at INTEGER NOT NULL, link_user_id TEXT REFERENCES users(id) ON DELETE CASCADE, link_session_hash TEXT);
    CREATE TABLE IF NOT EXISTS brands (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS members (brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('owner','editor','reviewer')), PRIMARY KEY(brand_id,user_id));
    CREATE TABLE IF NOT EXISTS records (brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE, kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(brand_id,kind,id));
    CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY, brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE, text TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS secrets (brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(brand_id,key));
    CREATE TABLE IF NOT EXISTS invitations (token_hash TEXT PRIMARY KEY, brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE, role TEXT NOT NULL, expires_at INTEGER NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), used_at INTEGER);
    CREATE INDEX IF NOT EXISTS records_kind ON records(brand_id,kind);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);`);
  db.exec(
    "CREATE INDEX IF NOT EXISTS google_auth_transactions_expiry ON google_auth_transactions(expires_at)",
  );
  // Retired connector: discard credentials and intake cursors, preserve work/history.
  db.exec("DELETE FROM secrets WHERE key IN ('telegram', 'telegramUpdates')");
  const keyPath = path.join(DATA_DIR, ".encryption-key");
  try {
    fs.writeFileSync(keyPath, randomBytes(32), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  secretKey = fs.readFileSync(keyPath);
  if (secretKey.length !== 32)
    throw new Error(
      "Clave de cifrado inválida. Conserva DATA_DIR completo al restaurar copias.",
    );
}
initDb();

export function getBrand(id) {
  if (typeof id !== "string" || !id) return null;
  const row = db.prepare("SELECT data FROM brands WHERE id=?").get(id);
  return row ? JSON.parse(row.data) : null;
}
export function saveBrand(value) {
  const brand = {
    ...value,
    id: value.id || randomUUID(),
    createdAt: value.createdAt || new Date().toISOString(),
  };
  delete brand.role;
  db.prepare(
    "INSERT INTO brands(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
  ).run(brand.id, JSON.stringify(brand));
  return brand;
}
function assertKind(kind) {
  if (!kinds.has(kind)) throw new Error("Tipo de registro desconocido");
}
export function listRecords(brandId, kind) {
  assertKind(kind);
  return db
    .prepare(
      "SELECT data FROM records WHERE brand_id=? AND kind=? ORDER BY rowid DESC",
    )
    .all(brandId, kind)
    .map((row) => JSON.parse(row.data));
}
export function getRecord(brandId, kind, id) {
  assertKind(kind);
  if (typeof id !== "string" || !id) return null;
  const row = db
    .prepare("SELECT data FROM records WHERE brand_id=? AND kind=? AND id=?")
    .get(brandId, kind, id);
  return row ? JSON.parse(row.data) : null;
}
export function saveRecord(brandId, kind, value) {
  assertKind(kind);
  const existing = value.id ? getRecord(brandId, kind, value.id) : null;
  const record = {
    ...value,
    id: value.id || randomUUID(),
    createdAt:
      existing?.createdAt || value.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  delete record.brandId;
  db.prepare(
    "INSERT INTO records(brand_id,kind,id,data) VALUES(?,?,?,?) ON CONFLICT(brand_id,kind,id) DO UPDATE SET data=excluded.data",
  ).run(brandId, kind, record.id, JSON.stringify(record));
  return record;
}
export function deleteRecord(brandId, kind, id) {
  assertKind(kind);
  return (
    db
      .prepare("DELETE FROM records WHERE brand_id=? AND kind=? AND id=?")
      .run(brandId, kind, id).changes > 0
  );
}
export function addActivity(brandId, text) {
  const activity = {
    id: randomUUID(),
    text: String(text).slice(0, 2000),
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    "INSERT INTO activity(id,brand_id,text,created_at) VALUES(?,?,?,?)",
  ).run(activity.id, brandId, activity.text, activity.createdAt);
  return activity;
}
export function getSecret(brandId, key) {
  const row = db
    .prepare("SELECT value FROM secrets WHERE brand_id=? AND key=?")
    .get(brandId, key);
  if (!row) return null;
  const [iv, tag, encrypted] = row.value
    .split(".")
    .map((value) => Buffer.from(value, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", secretKey, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
      "utf8",
    ),
  );
}
export function setSecret(brandId, key, value) {
  if (value === null || value === undefined) {
    db.prepare("DELETE FROM secrets WHERE brand_id=? AND key=?").run(
      brandId,
      key,
    );
    return;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  const stored = [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString("base64"))
    .join(".");
  db.prepare(
    "INSERT INTO secrets(brand_id,key,value) VALUES(?,?,?) ON CONFLICT(brand_id,key) DO UPDATE SET value=excluded.value",
  ).run(brandId, key, stored);
}
export function publicIntegrations(brandId) {
  const stored = getSecret(brandId, "ai");
  const ai = resolveAiConfig(stored);
  const policy = aiProviderAccessPolicy(
    ai?.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  );
  const webhook = getSecret(brandId, "webhook");
  const runtime =
    ai?.provider === "codex-chatgpt"
      ? managedTextAvailability()
      : { ready: true };
  return {
    ai: {
      accessPolicy: policy,
      configured: !!ai,
      ready: !!ai && policy.allowed && runtime.ready,
      provider: ai?.provider || "api",
      ...(runtime.reason ? { reason: runtime.reason } : {}),
      managedBy: ai?.managedBy || "local",
      hasOverride: !!stored,
      ...(ai ? { model: ai.model } : {}),
      ...(ai?.dataMode ? { dataMode: ai.dataMode } : {}),
    },
    webhook: {
      accessPolicy: webhookAccessPolicy(webhook?.url),
      configured: !!webhook?.url,
      ...(webhook?.url ? { url: webhook.url } : {}),
    },
  };
}
