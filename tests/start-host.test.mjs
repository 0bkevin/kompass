import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "30x-start-host-"));
const dataDirectory = path.join(tempRoot, "data");
const staticDirectory = path.join(tempRoot, "client");
const assetsDirectory = path.join(staticDirectory, "assets");
fs.mkdirSync(staticDirectory, { recursive: true });
fs.mkdirSync(assetsDirectory, { recursive: true });
fs.writeFileSync(path.join(staticDirectory, "app.css"), "body{color:teal}");
fs.writeFileSync(path.join(assetsDirectory, "app.js"), "console.log('client')");
process.env.DATA_DIR = dataDirectory;

const { createApp } = await import("../server/index.mjs");
const { createStartMiddleware } = await import("../server/start-adapter.mjs");
const { loadStartBuild } = await import("../server/start-host.mjs");
const { db } = await import("../server/db.mjs");

let server;
let origin;
let startCalls = [];

before(async () => {
  const middleware = createStartMiddleware(async (request) => {
    const url = new URL(request.url);
    startCalls.push({ method: request.method, pathname: url.pathname });

    if (url.pathname === "/dispatch") {
      return Response.json({
        method: request.method,
        url: request.url,
        body: await request.text(),
      });
    }
    if (url.pathname === "/cookies") {
      const headers = new Headers();
      headers.append("Set-Cookie", "first=one; Path=/; HttpOnly");
      headers.append("Set-Cookie", "second=two; Path=/; SameSite=Lax");
      return new Response("cookies", { headers });
    }
    if (url.pathname === "/stream") {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("stream "));
          controller.enqueue(new TextEncoder().encode("response"));
          controller.close();
        },
      });
      return new Response(body);
    }
    if (url.pathname === "/failure") {
      const error = new Error("render failed");
      error.status = 503;
      throw error;
    }
    if (url.pathname === "/assets/missing.js") {
      return new Response("Start route miss", { status: 404 });
    }
    return new Response("SSR page", {
      headers: { "Content-Type": "text/html" },
    });
  });
  server = createApp({ webHandler: middleware, staticDirectory }).listen(
    0,
    "127.0.0.1",
  );
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("Start middleware forwards request method, URL, and streaming body", async () => {
  const response = await fetch(`${origin}/dispatch?mode=inspect`, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "request payload",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    method: "POST",
    url: `${origin}/dispatch?mode=inspect`,
    body: "request payload",
  });
});

test("Start middleware preserves HEAD semantics and multiple Set-Cookie headers", async () => {
  const head = await fetch(`${origin}/radar`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");

  const cookies = await fetch(`${origin}/cookies`);
  assert.deepEqual(cookies.headers.getSetCookie(), [
    "first=one; Path=/; HttpOnly",
    "second=two; Path=/; SameSite=Lax",
  ]);
});

test("Start middleware streams response chunks to the client", async () => {
  const response = await fetch(`${origin}/stream`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "stream response");
});

test("Start render errors enter the existing Express error handler", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await fetch(`${origin}/failure`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "render failed" });
  } finally {
    console.error = originalError;
  }
});

test("client assets are served statically and missing assets reach Start", async () => {
  const asset = await fetch(`${origin}/app.css`);
  assert.equal(asset.status, 200);
  assert.equal(await asset.text(), "body{color:teal}");
  assert.equal(
    startCalls.some((call) => call.pathname === "/app.css"),
    false,
  );

  const missingAsset = await fetch(`${origin}/assets/missing.js`);
  assert.equal(missingAsset.status, 404);
  assert.equal(await missingAsset.text(), "Start route miss");
  assert.ok(startCalls.some((call) => call.pathname === "/assets/missing.js"));
});

test("client asset directories fall through to Start while nested files stay static", async () => {
  const callsBefore = startCalls.length;
  const directory = await fetch(`${origin}/assets`, { redirect: "manual" });
  assert.equal(directory.status, 200);
  assert.equal(await directory.text(), "SSR page");
  assert.ok(
    startCalls.slice(callsBefore).some((call) => call.pathname === "/assets"),
  );

  const callsAfterDirectory = startCalls.length;
  const asset = await fetch(`${origin}/assets/app.js`);
  assert.equal(asset.status, 200);
  assert.equal(await asset.text(), "console.log('client')");
  assert.equal(startCalls.length, callsAfterDirectory);
});

test("unknown API paths stay JSON 404s and never enter Start", async () => {
  const callsBefore = startCalls.length;
  const response = await fetch(`${origin}/api/no-such-route`);
  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.deepEqual(await response.json(), {
    error: "La ruta de API no existe.",
  });
  assert.equal(startCalls.length, callsBefore);
});

test("API-only mode bypasses any stale web build", async () => {
  const middleware = createStartMiddleware(() => {
    throw new Error("API-only mode must not call Start");
  });
  const apiOnlyServer = createApp({
    apiOnly: true,
    webHandler: middleware,
    staticDirectory,
  }).listen(0, "127.0.0.1");
  await new Promise((resolve) => apiOnlyServer.once("listening", resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${apiOnlyServer.address().port}/`,
    );
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Inicia la interfaz con npm run dev/);
  } finally {
    await new Promise((resolve) => apiOnlyServer.close(resolve));
  }
});

test("production startup reports missing Start output with a build instruction", async () => {
  await assert.rejects(
    loadStartBuild({ root: path.join(tempRoot, "no-build") }),
    /TanStack Start production output is missing.*run npm run build/,
  );
});
