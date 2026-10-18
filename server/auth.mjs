import {
  scrypt as scryptCallback,
  randomBytes,
  timingSafeEqual,
  createHash,
  randomUUID,
} from "node:crypto";
import { promisify } from "node:util";
import { db } from "./db.mjs";
const scrypt = promisify(scryptCallback);
const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000;
const COOKIE = "radar_session";
export const tokenHash = (token) =>
  createHash("sha256").update(token).digest("hex");
export const publicUser = (user) =>
  user ? { id: user.id, name: user.name, email: user.email } : null;
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await scrypt(password, salt, 64)).toString("hex")}`;
}
export async function verifyPassword(password, stored) {
  if (typeof stored !== "string") return false;
  const [salt, hash] = stored.split(":");
  const expected = Buffer.from(hash || "", "hex");
  if (expected.length !== 64) return false;
  const actual = await scrypt(password, salt, 64);
  return timingSafeEqual(expected, actual);
}
export function createUser({ name, email, passwordHash }) {
  const user = {
    id: randomUUID(),
    name,
    email,
    password_hash: passwordHash,
    created_at: new Date().toISOString(),
  };
  db.prepare(
    "INSERT INTO users(id,name,email,password_hash,created_at) VALUES(?,?,?,?,?)",
  ).run(user.id, user.name, user.email, user.password_hash, user.created_at);
  return user;
}
export function issueSession(req, res, userId) {
  const token = randomBytes(32).toString("base64url");
  db.prepare(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
  ).run(tokenHash(token), userId, Date.now() + SESSION_DURATION);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure || process.env.COOKIE_SECURE === "true",
    maxAge: SESSION_DURATION,
    path: "/",
  });
  return token;
}
export function readCookie(req) {
  const raw = req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${COOKIE}=`));
  if (!raw) return null;
  try {
    return decodeURIComponent(raw.slice(COOKIE.length + 1));
  } catch {
    return null;
  }
}
export function resolveUser(req) {
  const token = readCookie(req);
  if (!token || token.length > 200) return null;
  return (
    db
      .prepare(
        "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?",
      )
      .get(tokenHash(token), Date.now()) || null
  );
}
export function clearSession(req, res) {
  const token = readCookie(req);
  if (token)
    db.prepare("DELETE FROM sessions WHERE token_hash=?").run(tokenHash(token));
  res.clearCookie(COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure || process.env.COOKIE_SECURE === "true",
    path: "/",
  });
}
const attempts = new Map();
export function authRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || "unknown";
  let entry = attempts.get(key);
  if (!entry || entry.reset < now) {
    entry = { count: 0, reset: now + 15 * 60_000 };
    attempts.set(key, entry);
  }
  if (attempts.size > 10000)
    for (const [id, value] of attempts)
      if (value.reset < now) attempts.delete(id);
  if (++entry.count > 60)
    return res
      .status(429)
      .json({ error: "Demasiados intentos. Intenta de nuevo en 15 minutos." });
  next();
}
export function checkOrigin(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (!origin) return next();
  const expected = `${req.protocol}://${req.get("host")}`;
  const configured = (process.env.TRUSTED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const localDevelopment =
    process.env.NODE_ENV !== "production" &&
    ["http://localhost:5173", "http://127.0.0.1:5173"].includes(origin);
  if (origin !== expected && !configured.includes(origin) && !localDevelopment)
    return res.status(403).json({ error: "Origen de solicitud no permitido." });
  next();
}
