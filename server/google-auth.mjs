import express from "express";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { db } from "./db.mjs";
import {
  authRateLimit,
  clearSession,
  createUser,
  hashPassword,
  issueSession,
  readCookie,
  resolveUser,
  tokenHash,
  verifyPassword,
} from "./auth.mjs";

const COOKIE = "radar_google_transaction";
const COOKIE_PATH = "/api/auth/google";
const TRANSACTION_DURATION = 10 * 60_000;
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
  { timeoutDuration: 8000, cooldownDuration: 30_000, cacheMaxAge: 600_000 },
);
const randomToken = () => randomBytes(32).toString("base64url");

// Use an explicitly configured callback, never an incoming Host/Forwarded header.
export function googleAuthConfig(env = process.env) {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = env.GOOGLE_REDIRECT_URI?.trim();
  if (
    !clientId ||
    clientId.length > 256 ||
    !/^[a-zA-Z0-9_.-]+\.apps\.googleusercontent\.com$/.test(clientId) ||
    !clientSecret ||
    clientSecret.length > 4096 ||
    !redirectUri
  )
    return null;
  try {
    const parsed = new URL(redirectUri);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
      parsed.hostname,
    );
    if (
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== "/api/auth/google/callback" ||
      (parsed.protocol !== "https:" &&
        !(parsed.protocol === "http:" && loopback))
    )
      return null;
    return {
      clientId,
      clientSecret,
      redirectUri,
      origin: parsed.origin,
      host: parsed.host.toLowerCase(),
      secure: parsed.protocol === "https:",
    };
  } catch {
    return null;
  }
}

// Only known app paths and a syntactically valid invitation survive the round trip.
export function googleReturnTo(value) {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020\u007f]/.test(value)
  )
    return "/";
  try {
    const parsed = new URL(value, "https://radar.invalid");
    if (
      parsed.origin !== "https://radar.invalid" ||
      !/^\/(?:home|opportunities|results|radar|inbox|studio(?:\/[a-zA-Z0-9_-]+)?|calendar|assets|audience|brand|settings)?$/.test(
        parsed.pathname,
      )
    )
      return "/";
    const invite = parsed.searchParams.get("invite");
    const search =
      invite && /^[a-zA-Z0-9_-]{16,200}$/.test(invite)
        ? `?invite=${encodeURIComponent(invite)}`
        : "";
    return `${parsed.pathname}${search}`;
  } catch {
    return "/";
  }
}

function cookieOptions(req, config) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: config.secure || req.secure || process.env.COOKIE_SECURE === "true",
    path: COOKIE_PATH,
  };
}
function transactionCookie(req) {
  const values = req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${COOKIE}=`));
  if (values?.length !== 1) return null;
  const value = values[0].slice(COOKIE.length + 1);
  return /^[a-zA-Z0-9_-]{43}$/.test(value) ? value : null;
}
function sameString(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string") return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
function authError(res, code, returnTo = "/") {
  const invite = new URL(
    googleReturnTo(returnTo),
    "https://radar.invalid",
  ).searchParams.get("invite");
  const search = new URLSearchParams({ authError: code });
  if (invite) search.set("invite", invite);
  return res.redirect(303, `/?${search}`);
}
function unavailable(res) {
  return res.status(503).json({
    error:
      "El acceso con Google no está disponible. Puedes usar tu correo y contraseña.",
    code: "google_unavailable",
  });
}

async function exchangeCode(code, transaction, config, fetchImpl) {
  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(8000),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code_verifier: transaction.code_verifier,
    }),
  });
  if (!response.ok) throw new Error("Google exchange failed");
  const text = await response.text();
  if (text.length > 65_536) throw new Error("Google response too large");
  const result = JSON.parse(text);
  if (typeof result.id_token !== "string" || result.id_token.length > 16_384)
    throw new Error("Google ID token missing");
  // Access/refresh tokens are intentionally neither returned nor persisted.
  return result.id_token;
}

export async function verifyGoogleIdToken(
  idToken,
  { config, nonce, keySet = googleKeys, now = Date.now() },
) {
  const { payload } = await jwtVerify(idToken, keySet, {
    algorithms: ["RS256"],
    issuer: ISSUERS,
    audience: config.clientId,
    requiredClaims: [
      "iss",
      "aud",
      "exp",
      "iat",
      "sub",
      "nonce",
      "email",
      "email_verified",
    ],
    currentDate: new Date(now),
  });
  if (
    !sameString(payload.nonce, nonce) ||
    typeof payload.sub !== "string" ||
    !/^[\x21-\x7e]{1,255}$/.test(payload.sub) ||
    payload.email_verified !== true ||
    typeof payload.email !== "string" ||
    payload.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) ||
    !Number.isFinite(payload.iat) ||
    payload.iat > Math.floor(now / 1000) + 60 ||
    (payload.azp !== undefined && payload.azp !== config.clientId) ||
    (Array.isArray(payload.aud) &&
      payload.aud.length > 1 &&
      payload.azp !== config.clientId)
  )
    throw new Error("Google identity claims invalid");
  return {
    subject: payload.sub,
    email: payload.email.toLowerCase(),
    name:
      typeof payload.name === "string" && payload.name.trim()
        ? payload.name.trim().slice(0, 100)
        : payload.email.split("@")[0].slice(0, 100),
  };
}

function identityUser(subject) {
  return db
    .prepare(
      "SELECT u.* FROM users u JOIN auth_identities i ON i.user_id=u.id WHERE i.provider='google' AND i.subject=?",
    )
    .get(subject);
}
function linkRequired() {
  const error = new Error("Explicit account connection required");
  error.authCode = "google_link_required";
  throw error;
}
async function accountForIdentity(identity, transaction, req) {
  const linked = identityUser(identity.subject);
  if (transaction.link_user_id) {
    const user = resolveUser(req);
    if (
      !user ||
      user.id !== transaction.link_user_id ||
      !sameString(
        tokenHash(readCookie(req) || ""),
        transaction.link_session_hash,
      ) ||
      user.email.toLowerCase() !== identity.email ||
      (linked && linked.id !== user.id)
    )
      linkRequired();
    const other = db
      .prepare(
        "SELECT subject FROM auth_identities WHERE provider='google' AND user_id=?",
      )
      .get(user.id);
    if (other && other.subject !== identity.subject) linkRequired();
    if (!linked)
      db.prepare(
        "INSERT INTO auth_identities(provider,subject,user_id,created_at) VALUES('google',?,?,?)",
      ).run(identity.subject, user.id, new Date().toISOString());
    return user;
  }
  if (linked) return linked;
  if (
    db.prepare("SELECT id FROM users WHERE lower(email)=?").get(identity.email)
  )
    linkRequired();
  // A Google-only account has an unguessable password, compatible with the existing schema.
  const passwordHash = await hashPassword(randomToken());
  db.exec("BEGIN IMMEDIATE");
  try {
    const concurrent = identityUser(identity.subject);
    if (concurrent) {
      db.exec("COMMIT");
      return concurrent;
    }
    if (
      db
        .prepare("SELECT id FROM users WHERE lower(email)=?")
        .get(identity.email)
    )
      linkRequired();
    const user = createUser({
      name: identity.name,
      email: identity.email,
      passwordHash,
    });
    db.prepare(
      "INSERT INTO auth_identities(provider,subject,user_id,created_at) VALUES('google',?,?,?)",
    ).run(identity.subject, user.id, new Date().toISOString());
    db.exec("COMMIT");
    return user;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** Inject only transport/public verification keys and time in tests; routes still verify signed JWTs. */
export function createGoogleAuthRouter({
  env = process.env,
  fetchImpl = globalThis.fetch,
  keySet = googleKeys,
  now = Date.now,
} = {}) {
  const router = express.Router();
  const config = googleAuthConfig(env);
  router.use("/auth/google", (_req, res, next) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    next();
  });
  router.get("/auth/providers", (_req, res) =>
    res.json({
      google: { enabled: !!config, startUrl: "/api/auth/google/start" },
    }),
  );

  function start(req, res, { returnTo, user } = {}) {
    const state = randomToken();
    const browser = randomToken();
    const nonce = randomToken();
    const verifier = randomToken();
    db.prepare("DELETE FROM google_auth_transactions WHERE expires_at<=?").run(
      now(),
    );
    const previous = transactionCookie(req);
    if (previous)
      db.prepare(
        "DELETE FROM google_auth_transactions WHERE browser_hash=?",
      ).run(tokenHash(previous));
    db.prepare(
      "INSERT INTO google_auth_transactions(state_hash,browser_hash,nonce,code_verifier,return_to,expires_at,link_user_id,link_session_hash) VALUES(?,?,?,?,?,?,?,?)",
    ).run(
      tokenHash(state),
      tokenHash(browser),
      nonce,
      verifier,
      googleReturnTo(returnTo),
      now() + TRANSACTION_DURATION,
      user?.id || null,
      user ? tokenHash(readCookie(req)) : null,
    );
    res.cookie(COOKIE, browser, {
      ...cookieOptions(req, config),
      maxAge: TRANSACTION_DURATION,
    });
    const target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    target.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return target.href;
  }

  router.get("/auth/google/start", authRateLimit, (req, res) => {
    if (!config) return unavailable(res);
    // A cookie set on 127.0.0.1 cannot accompany a callback to localhost.
    // Compare Host only: HTTPS may terminate at a trusted reverse proxy.
    if (req.get("host")?.toLowerCase() !== config.host) {
      const canonical = new URL("/api/auth/google/start", config.origin);
      const returnTo = googleReturnTo(req.query.returnTo);
      if (returnTo !== "/") canonical.searchParams.set("returnTo", returnTo);
      return res.redirect(303, canonical.href);
    }
    res.redirect(303, start(req, res, { returnTo: req.query.returnTo }));
  });
  router.post("/auth/google/link", authRateLimit, async (req, res) => {
    if (!config) return unavailable(res);
    if (req.get("host")?.toLowerCase() !== config.host)
      return res.status(409).json({
        error: `Para conectar Google, abre ${config.origin} e inicia sesión allí con tu contraseña.`,
        code: "google_origin_mismatch",
      });
    const user = resolveUser(req);
    if (!user)
      return res.status(401).json({
        error: "Inicia sesión con tu contraseña para conectar Google.",
      });
    const password = req.body?.password;
    if (
      typeof password !== "string" ||
      !password.trim() ||
      password.length > 256 ||
      !(await verifyPassword(password.trim(), user.password_hash))
    )
      return res
        .status(401)
        .json({ error: "Confirma tu contraseña actual para conectar Google." });
    res.json({
      startUrl: start(req, res, { returnTo: req.body?.returnTo, user }),
    });
  });
  router.get("/auth/google/callback", async (req, res) => {
    if (!config) return unavailable(res);
    const browser = transactionCookie(req);
    res.clearCookie(COOKIE, cookieOptions(req, config));
    const state = req.query.state;
    if (
      !browser ||
      typeof state !== "string" ||
      !/^[a-zA-Z0-9_-]{43}$/.test(state)
    )
      return authError(res, "google_failed");
    // DELETE ... RETURNING atomically consumes the transaction before any outbound request.
    const transaction = db
      .prepare(
        "DELETE FROM google_auth_transactions WHERE state_hash=? AND browser_hash=? RETURNING *",
      )
      .get(tokenHash(state), tokenHash(browser));
    if (!transaction || transaction.expires_at <= now())
      return authError(res, "google_failed");
    if (req.query.error !== undefined)
      return authError(
        res,
        req.query.error === "access_denied"
          ? "google_cancelled"
          : "google_failed",
        transaction.return_to,
      );
    const code = req.query.code;
    if (typeof code !== "string" || !code || code.length > 4096)
      return authError(res, "google_failed", transaction.return_to);
    try {
      const idToken = await exchangeCode(code, transaction, config, fetchImpl);
      const identity = await verifyGoogleIdToken(idToken, {
        config,
        nonce: transaction.nonce,
        keySet,
        now: now(),
      });
      const user = await accountForIdentity(identity, transaction, req);
      clearSession(req, res);
      issueSession(req, res, user.id, {
        secure: cookieOptions(req, config).secure,
      });
      return res.redirect(303, transaction.return_to);
    } catch (error) {
      // Provider messages can contain authorization codes or tokens; never log/reflect them.
      return authError(
        res,
        error.authCode === "google_link_required"
          ? error.authCode
          : "google_failed",
        transaction.return_to,
      );
    }
  });
  return router;
}
