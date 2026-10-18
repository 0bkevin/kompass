import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), ".radar-google-auth-"));
process.env.DATA_DIR = temp;
process.env.OPENAI_API_KEY = "";
const env = {
  GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "server-only-client-secret",
  GOOGLE_REDIRECT_URI: "http://localhost:3001/api/auth/google/callback",
};
let db,
  createApp,
  googleAuthConfig,
  googleReturnTo,
  privateKey,
  otherKey,
  keySet;
let origin,
  clock = Date.now(),
  exchangeCount = 0,
  codeCount = 0;
const servers = [],
  codes = new Map();

async function listen(options) {
  const server = createApp({ apiOnly: true, ...options }).listen(
    0,
    "127.0.0.1",
  );
  await new Promise((resolve) => server.once("listening", resolve));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}
async function request(
  route,
  { cookie, body, method = "GET", base = origin, headers = {} } = {},
) {
  // node:http deliberately preserves Host so these requests can represent a
  // reverse proxy while the isolated listener uses an arbitrary test port.
  const response = await new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      `${base}/api${route}`,
      {
        method,
        headers: {
          host: new URL(env.GOOGLE_REDIRECT_URI).host,
          ...(cookie ? { cookie } : {}),
          ...(body ? { "content-type": "application/json" } : {}),
          ...headers,
        },
      },
      (incoming) => {
        const chunks = [],
          responseHeaders = new Headers();
        for (let index = 0; index < incoming.rawHeaders.length; index += 2)
          responseHeaders.append(
            incoming.rawHeaders[index],
            incoming.rawHeaders[index + 1],
          );
        incoming.on("data", (chunk) => chunks.push(chunk));
        incoming.on("error", reject);
        incoming.on("end", () =>
          resolve(
            new Response(Buffer.concat(chunks), {
              status: incoming.statusCode,
              headers: responseHeaders,
            }),
          ),
        );
      },
    );
    outgoing.on("error", reject);
    outgoing.end(body ? JSON.stringify(body) : undefined);
  });
  const cookies = response.headers.getSetCookie();
  return {
    status: response.status,
    location: response.headers.get("location"),
    headers: response.headers,
    cookies,
    cookie: cookies
      .find(
        (value) =>
          value.startsWith("radar_session=") &&
          !value.startsWith("radar_session=;"),
      )
      ?.split(";")[0],
    transaction: cookies
      .find((value) => value.startsWith("radar_google_transaction="))
      ?.split(";")[0],
    data: response.headers.get("content-type")?.includes("application/json")
      ? await response.json()
      : await response.text(),
  };
}
async function tokenTransport(url, options) {
  exchangeCount++;
  assert.equal(url, "https://oauth2.googleapis.com/token");
  assert.equal(options.method, "POST");
  assert.equal(options.redirect, "error");
  assert.ok(options.signal instanceof AbortSignal);
  const params = new URLSearchParams(options.body);
  assert.equal(params.get("client_id"), env.GOOGLE_CLIENT_ID);
  assert.equal(params.get("client_secret"), env.GOOGLE_CLIENT_SECRET);
  assert.equal(params.get("redirect_uri"), env.GOOGLE_REDIRECT_URI);
  assert.equal(params.get("grant_type"), "authorization_code");
  const code = codes.get(params.get("code"));
  if (
    !code ||
    createHash("sha256")
      .update(params.get("code_verifier"))
      .digest("base64url") !== code.challenge
  )
    return new Response("invalid_grant", { status: 400 });
  if (code.fail)
    throw new Error("provider failure containing access-secret-and-code");
  const token = await new SignJWT({
    iss: "https://accounts.google.com",
    aud: env.GOOGLE_CLIENT_ID,
    sub: code.subject,
    email: code.email,
    email_verified: true,
    name: "Google User",
    iat: Math.floor(clock / 1000),
    exp: Math.floor(clock / 1000) + 3600,
    nonce: code.nonce,
    ...code.claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .sign(code.badSignature ? otherKey : privateKey);
  return Response.json({
    id_token: token,
    access_token: "never-persist-access-token",
    refresh_token: "never-persist-refresh-token",
  });
}
async function begin({
  subject = crypto.randomUUID(),
  email = `${subject}@example.com`,
  claims,
  returnTo,
  cookie,
  fail,
  badSignature,
} = {}) {
  const started = await request(
    `/auth/google/start${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`,
    { cookie },
  );
  assert.equal(started.status, 303);
  const url = new URL(started.location);
  const code = `code-${++codeCount}`;
  codes.set(code, {
    subject,
    email,
    claims,
    fail,
    badSignature,
    nonce: url.searchParams.get("nonce"),
    challenge: url.searchParams.get("code_challenge"),
  });
  return {
    ...started,
    url,
    state: url.searchParams.get("state"),
    code,
    subject,
    email,
  };
}
function callback(started, options = {}) {
  return request(
    `/auth/google/callback?state=${started.state}&code=${started.code}`,
    { cookie: started.transaction, ...options },
  );
}
async function localAccount(email = `${crypto.randomUUID()}@example.com`) {
  const registered = await request("/auth/register", {
    method: "POST",
    body: { name: "Local user", email, password: "local-password-30x" },
  });
  assert.equal(registered.status, 201);
  return registered;
}

before(async () => {
  ({ createApp } = await import("../server/index.mjs"));
  ({ db } = await import("../server/db.mjs"));
  ({ googleAuthConfig, googleReturnTo } =
    await import("../server/google-auth.mjs"));
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  otherKey = (await generateKeyPair("RS256")).privateKey;
  keySet = createLocalJWKSet({
    keys: [
      {
        ...(await exportJWK(pair.publicKey)),
        alg: "RS256",
        use: "sig",
        kid: "test-key",
      },
    ],
  });
  origin = await listen({
    googleAuth: { env, keySet, fetchImpl: tokenTransport, now: () => clock },
  });
});
after(async () => {
  await Promise.all(
    servers.map((server) => new Promise((resolve) => server.close(resolve))),
  );
  db.close();
  fs.rmSync(temp, { recursive: true, force: true });
});

test("unconfigured provider is disabled and OAuth routes safely return 503", async () => {
  const base = await listen({ googleAuth: { env: {} } });
  const providers = await request("/auth/providers", { base });
  assert.deepEqual(providers.data, {
    google: { enabled: false, startUrl: "/api/auth/google/start" },
  });
  for (const route of [
    "/auth/google/start",
    "/auth/google/callback?code=private-code",
  ]) {
    const result = await request(route, { base });
    assert.equal(result.status, 503);
    assert.equal(result.data.code, "google_unavailable");
    assert.ok(!JSON.stringify(result).includes("private-code"));
  }
});

test("callback config is explicit, secure and never inferred from request headers", async () => {
  for (const uri of [
    "http://example.com/api/auth/google/callback",
    "https://example.com/wrong",
    "https://example.com/api/auth/google/callback?x=1",
    "https://user:pass@example.com/api/auth/google/callback",
    "https://example.com/api/auth/google/callback#fragment",
  ]) {
    assert.equal(googleAuthConfig({ ...env, GOOGLE_REDIRECT_URI: uri }), null);
  }
  assert.ok(
    googleAuthConfig({
      ...env,
      GOOGLE_REDIRECT_URI: "http://[::1]:3001/api/auth/google/callback",
    }),
  );
  const started = await request("/auth/google/start", {
    headers: {
      "x-forwarded-host": "attacker.test",
      "x-forwarded-proto": "https",
    },
  });
  assert.equal(
    new URL(started.location).searchParams.get("redirect_uri"),
    env.GOOGLE_REDIRECT_URI,
  );
  const secureBase = await listen({
    googleAuth: {
      env: {
        ...env,
        GOOGLE_REDIRECT_URI: "https://radar.example/api/auth/google/callback",
      },
    },
  });
  const secure = await request("/auth/google/start", {
    base: secureBase,
    headers: { host: "radar.example" },
  });
  assert.equal(new URL(secure.location).origin, "https://accounts.google.com");
  assert.match(secure.cookies[0], /; Secure/);
});

test("a different Host reaches the configured origin before any OAuth cookie or transaction is created", async () => {
  const before = db
    .prepare("SELECT COUNT(*) AS n FROM google_auth_transactions")
    .get().n;
  const requestPath = `/auth/google/start?returnTo=${encodeURIComponent("/settings?invite=abcdefghijklmnop&code=private-code")}`;
  const result = await request(requestPath, {
    headers: { host: "127.0.0.1:3001", "x-forwarded-host": "evil.example" },
  });
  assert.equal(result.status, 303);
  const canonical = new URL(result.location);
  assert.equal(canonical.origin, "http://localhost:3001");
  assert.equal(canonical.pathname, "/api/auth/google/start");
  assert.equal(
    canonical.searchParams.get("returnTo"),
    "/settings?invite=abcdefghijklmnop",
  );
  assert.deepEqual(result.cookies, []);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM google_auth_transactions").get().n,
    before,
  );
  const unsafe = await request(
    `/auth/google/start?returnTo=${encodeURIComponent("https://evil.example/")}`,
    { headers: { host: "evil.example" } },
  );
  assert.equal(unsafe.location, "http://localhost:3001/api/auth/google/start");
  assert.deepEqual(unsafe.cookies, []);

  // Simulate the browser following that redirect with the canonical Host.
  const followed = await request(
    `${canonical.pathname.slice(4)}${canonical.search}`,
  );
  assert.equal(
    new URL(followed.location).origin,
    "https://accounts.google.com",
  );
  assert.ok(followed.transaction);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM google_auth_transactions").get().n,
    before + 1,
  );
});

test("account connection on a different Host returns an actionable error without creating a flow", async () => {
  const local = await localAccount();
  const before = db
    .prepare("SELECT COUNT(*) AS n FROM google_auth_transactions")
    .get().n;
  const result = await request("/auth/google/link", {
    method: "POST",
    cookie: local.cookie,
    body: { password: "local-password-30x" },
    headers: { host: "127.0.0.1:3001" },
  });
  assert.equal(result.status, 409);
  assert.equal(result.data.code, "google_origin_mismatch");
  assert.match(result.data.error, /http:\/\/localhost:3001/);
  assert.equal(result.location, null);
  assert.deepEqual(result.cookies, []);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM google_auth_transactions").get().n,
    before,
  );
});

test("start uses independent random state, nonce, browser cookie and S256 PKCE", async () => {
  const providers = await request("/auth/providers");
  assert.equal(providers.data.google.enabled, true);
  const start = await begin();
  assert.equal(start.url.origin, "https://accounts.google.com");
  assert.equal(start.url.searchParams.get("scope"), "openid email profile");
  assert.equal(start.url.searchParams.get("response_type"), "code");
  assert.equal(start.url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(start.url.searchParams.get("access_type"), null);
  assert.equal(start.url.searchParams.get("client_secret"), null);
  assert.match(start.state, /^[\w-]{43}$/);
  assert.notEqual(start.state, start.url.searchParams.get("nonce"));
  assert.notEqual(start.transaction.split("=")[1], start.state);
  assert.match(start.cookies[0], /HttpOnly/);
  assert.match(start.cookies[0], /SameSite=Lax/);
  assert.match(start.cookies[0], /Max-Age=600/);
  assert.match(start.cookies[0], /Path=\/api\/auth\/google/);
  assert.equal(start.headers.get("cache-control"), "no-store");
  assert.equal(start.headers.get("referrer-policy"), "no-referrer");
});

test("valid callback creates a session and Google identity with existing empty-workspace onboarding", async () => {
  const start = await begin({ returnTo: "/?invite=abcdefghijklmnop123456" });
  const result = await callback(start);
  assert.equal(result.status, 303);
  assert.equal(result.location, "/?invite=abcdefghijklmnop123456");
  assert.match(
    result.cookies.find(
      (value) =>
        value.startsWith("radar_session=") && value.includes("Max-Age"),
    ),
    /HttpOnly/,
  );
  const session = await request("/session", { cookie: result.cookie });
  assert.equal(session.data.user.email, start.email);
  assert.deepEqual(session.data.brands, []);
  assert.equal(session.data.user.password_hash, undefined);
  const identity = db
    .prepare("SELECT * FROM auth_identities WHERE subject=?")
    .get(start.subject);
  assert.equal(identity.user_id, session.data.user.id);
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM google_auth_transactions WHERE state_hash=?",
      )
      .get(createHash("sha256").update(start.state).digest("hex")).n,
    0,
  );
  assert.ok(
    !JSON.stringify(db.prepare("SELECT * FROM auth_identities").all()).includes(
      "never-persist",
    ),
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM secrets").get().n, 0);
});

test("Google subject survives email changes and preserves workspace membership", async () => {
  const first = await begin();
  const signedIn = await callback(first);
  const created = await request("/brands", {
    method: "POST",
    cookie: signedIn.cookie,
    body: { name: "Preserved workspace" },
  });
  assert.equal(created.status, 201);
  const previous = await request("/session", { cookie: signedIn.cookie });
  const repeated = await callback(
    await begin({
      subject: first.subject,
      email: "changed-google-email@example.com",
    }),
  );
  const session = await request("/session", { cookie: repeated.cookie });
  assert.equal(session.data.user.id, previous.data.user.id);
  assert.equal(session.data.brands[0].id, created.data.id);
  assert.equal(
    db
      .prepare("SELECT COUNT(*) AS n FROM auth_identities WHERE subject=?")
      .get(first.subject).n,
    1,
  );
});

test("state and browser binding reject missing or wrong cookies without exchanging a code", async () => {
  for (const badCookie of [
    undefined,
    "radar_google_transaction=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  ]) {
    const start = await begin();
    const before = exchangeCount;
    const result = await callback(start, { cookie: badCookie });
    assert.equal(result.location, "/?authError=google_failed");
    assert.equal(result.cookie, undefined);
    assert.equal(exchangeCount, before);
  }
  const start = await begin();
  const before = exchangeCount;
  const result = await request(
    `/auth/google/callback?state=${"a".repeat(43)}&code=${start.code}`,
    { cookie: start.transaction },
  );
  assert.equal(result.location, "/?authError=google_failed");
  assert.equal(exchangeCount, before);
});

test("expired transaction and replay cannot issue sessions or exchange a second code", async () => {
  const expired = await begin();
  clock += 10 * 60_000 + 1;
  const before = exchangeCount;
  assert.equal((await callback(expired)).location, "/?authError=google_failed");
  assert.equal(exchangeCount, before);
  clock = Date.now();
  const start = await begin();
  assert.ok((await callback(start)).cookie);
  const after = exchangeCount;
  const replay = await callback(start);
  assert.equal(replay.location, "/?authError=google_failed");
  assert.equal(replay.cookie, undefined);
  assert.equal(exchangeCount, after);
});

test("PKCE verifier is enforced and a failed exchange consumes its transaction", async () => {
  const start = await begin();
  db.prepare(
    "UPDATE google_auth_transactions SET code_verifier=? WHERE state_hash=?",
  ).run("a".repeat(43), createHash("sha256").update(start.state).digest("hex"));
  assert.equal((await callback(start)).location, "/?authError=google_failed");
  const after = exchangeCount;
  assert.equal((await callback(start)).location, "/?authError=google_failed");
  assert.equal(exchangeCount, after);
});

for (const [name, claims] of [
  ["issuer", { iss: "https://attacker.example" }],
  ["audience", { aud: "another.apps.googleusercontent.com" }],
  ["authorized presenter", { azp: "another.apps.googleusercontent.com" }],
  ["nonce", { nonce: "wrong-nonce" }],
  ["expired token", { exp: 1 }],
  ["missing subject", { sub: "" }],
  ["missing expiry", { exp: undefined }],
  ["unverified email", { email_verified: false }],
  ["nonboolean verification", { email_verified: "true" }],
  ["invalid email", { email: "not-an-email" }],
  ["future issue time", { iat: Math.floor(Date.now() / 1000) + 3600 }],
]) {
  test(`invalid Google ${name} is rejected after signature verification`, async () => {
    const start = await begin({ claims });
    const result = await callback(start);
    assert.equal(result.location, "/?authError=google_failed");
    assert.equal(result.cookie, undefined);
    assert.equal(
      db
        .prepare("SELECT * FROM auth_identities WHERE subject=?")
        .get(start.subject),
      undefined,
    );
  });
}

test("untrusted JWT signature is rejected", async () => {
  const result = await callback(await begin({ badSignature: true }));
  assert.equal(result.location, "/?authError=google_failed");
  assert.equal(result.cookie, undefined);
});

test("cancellation consumes state and errors never expose Google details", async () => {
  const start = await begin({ returnTo: "/?invite=abcdefghijklmnop" });
  const before = exchangeCount;
  const cancelled = await request(
    `/auth/google/callback?state=${start.state}&error=access_denied&error_description=private-provider-error`,
    { cookie: start.transaction },
  );
  assert.equal(
    cancelled.location,
    "/?authError=google_cancelled&invite=abcdefghijklmnop",
  );
  assert.equal(exchangeCount, before);
  const failure = await callback(await begin({ fail: true }));
  assert.equal(failure.location, "/?authError=google_failed");
  assert.ok(!JSON.stringify(failure).includes("access-secret"));
  assert.ok(!JSON.stringify(cancelled).includes("private-provider-error"));
});

test("return targets preserve valid app/invite paths and cannot redirect externally or to an API", async () => {
  for (const value of [
    "https://evil.example/",
    "//evil.example/",
    "/\\evil.example/",
    "/api/auth/google/start",
    "/%2f%2fevil.example/",
    "/settings\n",
    "/unknown",
  ])
    assert.equal(googleReturnTo(value), "/");
  assert.equal(
    googleReturnTo("/settings?invite=abcdefghijklmnop&code=private-code#token"),
    "/settings?invite=abcdefghijklmnop",
  );
  assert.equal(googleReturnTo("/?invite=invalid"), "/");
  const result = await callback(
    await begin({ returnTo: "https://evil.example/" }),
  );
  assert.equal(result.location, "/");
});

test("landing account entry intents return Google sessions to the workspace and retain invitations", async () => {
  for (const mode of ["login", "signup"]) {
    const start = await begin({
      returnTo: `/home?auth=${mode}&invite=abcdefghijklmnop123456&ref=landing`,
    });
    const result = await callback(start);
    assert.equal(result.status, 303);
    assert.equal(result.location, "/home?invite=abcdefghijklmnop123456");
    const session = await request("/session", { cookie: result.cookie });
    assert.equal(session.data.user.email, start.email);
    assert.deepEqual(session.data.brands, []);
  }
});

test("matching local email never implicitly links, even when Google marks it verified", async () => {
  const local = await localAccount();
  const start = await begin({ email: local.data.user.email });
  const result = await callback(start);
  assert.equal(result.location, "/?authError=google_link_required");
  assert.equal(result.cookie, undefined);
  assert.equal(
    db
      .prepare("SELECT * FROM auth_identities WHERE subject=?")
      .get(start.subject),
    undefined,
  );
  const login = await request("/auth/login", {
    method: "POST",
    body: { email: local.data.user.email, password: "local-password-30x" },
  });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.id, local.data.user.id);
});

test("explicit connection requires the current password and binds callback to the original session", async () => {
  const local = await localAccount();
  assert.equal(
    (
      await request("/auth/google/link", {
        method: "POST",
        body: { password: "local-password-30x" },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("/auth/google/link", {
        method: "POST",
        cookie: local.cookie,
        body: { password: "wrong" },
      })
    ).status,
    401,
  );
  const connect = await request("/auth/google/link", {
    method: "POST",
    cookie: local.cookie,
    body: { password: "local-password-30x", returnTo: "/settings" },
  });
  assert.equal(connect.status, 200);
  const url = new URL(connect.data.startUrl);
  const subject = crypto.randomUUID(),
    code = `code-${++codeCount}`;
  codes.set(code, {
    subject,
    email: local.data.user.email,
    nonce: url.searchParams.get("nonce"),
    challenge: url.searchParams.get("code_challenge"),
  });
  const result = await request(
    `/auth/google/callback?state=${url.searchParams.get("state")}&code=${code}`,
    { cookie: `${connect.transaction}; ${local.cookie}` },
  );
  assert.equal(result.location, "/settings");
  const linked = await request("/session", { cookie: result.cookie });
  assert.equal(linked.data.user.id, local.data.user.id);
  const repeat = await callback(
    await begin({ subject, email: local.data.user.email }),
  );
  assert.equal(
    (await request("/session", { cookie: repeat.cookie })).data.user.id,
    local.data.user.id,
  );

  const second = await localAccount();
  const pending = await request("/auth/google/link", {
    method: "POST",
    cookie: second.cookie,
    body: { password: "local-password-30x" },
  });
  const pendingUrl = new URL(pending.data.startUrl),
    secondCode = `code-${++codeCount}`;
  codes.set(secondCode, {
    subject: crypto.randomUUID(),
    email: second.data.user.email,
    nonce: pendingUrl.searchParams.get("nonce"),
    challenge: pendingUrl.searchParams.get("code_challenge"),
  });
  const missingSession = await request(
    `/auth/google/callback?state=${pendingUrl.searchParams.get("state")}&code=${secondCode}`,
    { cookie: pending.transaction },
  );
  assert.equal(missingSession.location, "/?authError=google_link_required");
  assert.equal(missingSession.cookie, undefined);
});
