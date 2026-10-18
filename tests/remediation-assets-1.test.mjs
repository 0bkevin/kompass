import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import express from "express";
import { setTimeout as delay } from "node:timers/promises";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-assets-1-"));
process.env.DATA_DIR = dataDir;
process.env.OPENAI_API_KEY = "";
process.env.GEMINI_API_KEY = "";
process.env.DISCOVERY_ENABLED = "false";

const { createApp } = await import("../server/index.mjs");
const { db, getRecord, UPLOAD_DIR } = await import("../server/db.mjs");
const { filenameAwareUpload } = await import("../server/upload-filenames.mjs");
let server, origin, cookie, brandId;
const bytes = Buffer.from(
  "DATOS SINTÉTICOS assets-1: contenido ñandú / 日本語.\n",
);

async function api(route, body) {
  const response = await fetch(`${origin}/api${route}`, {
    method: body ? "POST" : "GET",
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { response, data: await response.json() };
}

before(async () => {
  server = createApp({ apiOnly: true }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const registered = await api("/auth/register", {
    name: "Equipo sintético assets-1",
    email: "assets-1@example.test",
    password: "synthetic-assets-1-password",
  });
  assert.equal(registered.response.status, 201);
  cookie = registered.response.headers.get("set-cookie").split(";")[0];
  const brand = await api("/brands", { name: "Archivos sintéticos assets-1" });
  assert.equal(brand.response.status, 201);
  brandId = brand.data.id;
});

after(async () => {
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  });
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function upload(
  name,
  { extended, charset = "utf8", split = false, fields = [] } = {},
) {
  let body, headers;
  if (extended || charset !== "utf8" || split) {
    const boundary = "synthetic-assets-1-boundary";
    const filename = extended
      ? `filename*=${extended === "latin1" ? "ISO-8859-1" : "UTF-8"}''${extended === "latin1" ? Array.from(Buffer.from(name, "latin1"), (byte) => `%${byte.toString(16).padStart(2, "0")}`).join("") : encodeURIComponent(name)}`
      : `filename="${name}"`;
    body = Buffer.concat([
      ...fields.map(([key, value]) =>
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
        ),
      ),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; ${filename}\r\nContent-Type: text/plain\r\n\r\n`,
        charset,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    headers = { "content-type": `multipart/form-data; boundary=${boundary}` };
    if (split) {
      const raw = body;
      body = (async function* () {
        for (let i = 0; i < raw.length; i += 3) yield raw.subarray(i, i + 3);
      })();
    }
  } else {
    body = new FormData();
    for (const [key, value] of fields) body.append(key, value);
    body.append("file", new Blob([bytes], { type: "text/plain" }), name);
  }
  const response = await fetch(`${origin}/api/brands/${brandId}/assets`, {
    method: "POST",
    headers: { cookie, ...headers },
    body,
    ...(split ? { duplex: "half" } : {}),
  });
  const data = await response.json();
  assert.equal(response.status, 201, JSON.stringify(data));
  return data;
}

async function assertRoundTrip(asset, expected) {
  assert.equal(asset.name, expected);
  assert.equal(asset.type, "document");
  assert.equal(asset.mimeType, "text/plain");
  assert.equal(asset.size, bytes.length);
  const stored = getRecord(brandId, "assets", asset.id);
  assert.equal(stored.name, expected);
  assert.deepEqual(
    fs.readFileSync(path.join(UPLOAD_DIR, stored.storageName)),
    bytes,
  );
  const library = await api(`/brands/${brandId}/assets`);
  assert.equal(
    library.data.find((item) => item.id === asset.id).name,
    expected,
  );
  const state = await api(`/brands/${brandId}/state`);
  assert.ok(
    state.data.assets.some(
      (item) =>
        item.id === asset.id &&
        item.name.toLowerCase().includes(expected.toLowerCase()),
    ),
  );
  const download = await fetch(`${origin}${asset.url}?download=1`, {
    headers: { cookie },
  });
  assert.equal(download.status, 200);
  assert.match(download.headers.get("content-disposition"), /^attachment; /);
  assert.equal(
    decodeURIComponent(
      download.headers.get("content-disposition").split("filename*=UTF-8''")[1],
    ),
    expected,
  );
  assert.equal(
    download.headers.get("content-type"),
    "text/plain; charset=utf-8",
  );
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
}

test("assets-1 real multipart preserves browser UTF-8 names through storage, library and download", async () => {
  for (const name of [
    '03-ñandú & "prueba" #100%.txt',
    "04-acción-über-café.txt",
    "05-日本語-العربية-文档-🙂.txt",
    "06-literal-%C3%B1-100%.txt",
    "07-literal-Ã±-Ã©.txt",
    "08-d'Artagnan-(ñandú)!*.txt",
  ])
    await assertRoundTrip(await upload(name), name);
});

test("assets-1 accepts legacy Latin-1 and explicitly decoded Unicode without a second conversion", async () => {
  for (const [name, options] of [
    ["08-café-ñandú.txt", { charset: "latin1" }],
    ["09-ñandú-日本語.txt", { extended: true }],
    ["10-literal-Ã±-Ã©.txt", { extended: true }],
    [
      "11-ñandú-🙂.txt",
      { split: true, fields: [["note", "campo sintético previo"]] },
    ],
    ["12-À¯-ÿ.txt", { charset: "latin1" }],
    ["13-literal-Ã±-café.txt", { extended: "latin1" }],
  ])
    await assertRoundTrip(await upload(name, options), name);
});

test("assets-1 keeps safe bounded filenames, extensions and valid Unicode at the length boundary", async () => {
  const unsafe = await upload("../folder/..\\control-\r\n.txt");
  await assertRoundTrip(unsafe, "control-.txt");
  await assertRoundTrip(
    await upload("control-\u0000\u0001\u007f.txt", { extended: true }),
    "control-.txt",
  );
  const longName = `${"a".repeat(195)}🙂extra.txt`;
  const long = await upload(longName);
  assert.ok(long.name.length <= 200);
  assert.ok(long.name.endsWith(".txt"));
  assert.ok(long.name.isWellFormed());
  await assertRoundTrip(long, `${"a".repeat(195)}.txt`);
  const emoji = await upload(`${"🙂".repeat(120)}.txt`);
  assert.ok(emoji.name.length <= 200);
  assert.ok(emoji.name.isWellFormed());
  assert.ok(emoji.name.endsWith(".txt"));
  await assertRoundTrip(emoji, `${"🙂".repeat(98)}.txt`);
});

test("assets-1 keeps private downloads authenticated", async () => {
  const asset = await upload("12-privado-ñandú.txt");
  const response = await fetch(`${origin}${asset.url}?download=1`);
  assert.equal(response.status, 401);
});

test("assets-1 preserves multipart field and file-count rejections without orphan files", async () => {
  const before = fs.readdirSync(UPLOAD_DIR).sort();
  const forms = [
    (() => {
      const form = new FormData();
      form.append(
        "other",
        new Blob([bytes], { type: "text/plain" }),
        "otro-ñandú.txt",
      );
      return form;
    })(),
    (() => {
      const form = new FormData();
      for (let i = 0; i < 2; i++)
        form.append(
          "file",
          new Blob([bytes], { type: "text/plain" }),
          `dos-${i}-ñandú.txt`,
        );
      return form;
    })(),
    (() => {
      const form = new FormData();
      for (let i = 0; i < 6; i++) form.append(`field${i}`, "campo sintético");
      form.append(
        "file",
        new Blob([bytes], { type: "text/plain" }),
        "campos-ñandú.txt",
      );
      return form;
    })(),
    (() => {
      const form = new FormData();
      form.append("note", "a".repeat(4097));
      form.append(
        "file",
        new Blob([bytes], { type: "text/plain" }),
        "campo-largo-ñandú.txt",
      );
      return form;
    })(),
  ];
  for (const body of forms) {
    const response = await fetch(`${origin}/api/brands/${brandId}/assets`, {
      method: "POST",
      headers: { cookie },
      body,
    });
    assert.equal(response.status, 400, await response.text());
    assert.deepEqual(fs.readdirSync(UPLOAD_DIR).sort(), before);
  }
});

test("assets-1 stops filename readers and removes partial storage when an HTTP upload aborts", async () => {
  const before = fs.readdirSync(UPLOAD_DIR).sort();
  const boundary = "synthetic-assets-1-abort";
  const request = http.request(`${origin}/api/brands/${brandId}/assets`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
  });
  request.on("error", () => {});
  request.write(
    Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="aborto-ñandú.txt"\r\nContent-Type: text/plain\r\n\r\n`,
      ),
      Buffer.alloc(64 * 1024, 97),
    ]),
  );
  for (
    let i = 0;
    i < 100 && fs.readdirSync(UPLOAD_DIR).length === before.length;
    i++
  )
    await delay(5);
  assert.equal(
    fs.readdirSync(UPLOAD_DIR).length,
    before.length + 1,
    "the real upload reached disk before cancellation",
  );
  request.destroy();
  for (
    let i = 0;
    i < 100 && fs.readdirSync(UPLOAD_DIR).length !== before.length;
    i++
  )
    await delay(5);
  assert.deepEqual(fs.readdirSync(UPLOAD_DIR).sort(), before);
  const library = await api(`/brands/${brandId}/assets`);
  assert.ok(library.data.every((asset) => !asset.name.includes("aborto")));
});

test("assets-1 filename selection preserves the caller's file-size limit and backpressure", async () => {
  const probe = express();
  const upload = filenameAwareUpload({
    limits: { fileSize: 256 * 1024, files: 1 },
  });
  probe.post("/upload", upload.single("file"), (req, res) =>
    res.json({ name: req.file.originalname, size: req.file.size }),
  );
  probe.use((error, _req, res, _next) =>
    res
      .status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400)
      .json({ code: error.code }),
  );
  const probeServer = probe.listen(0, "127.0.0.1");
  await new Promise((resolve) => probeServer.once("listening", resolve));
  try {
    for (const [size, expected] of [
      [256 * 1024, 200],
      [256 * 1024 + 1, 413],
    ]) {
      const form = new FormData();
      form.append(
        "file",
        new Blob([Buffer.alloc(size, 97)]),
        "límite-ñandú.txt",
      );
      const response = await fetch(
        `http://127.0.0.1:${probeServer.address().port}/upload`,
        { method: "POST", body: form },
      );
      assert.equal(response.status, expected);
      const result = await response.json();
      if (expected === 200)
        assert.deepEqual(result, { name: "límite-ñandú.txt", size });
      else assert.equal(result.code, "LIMIT_FILE_SIZE");
    }
  } finally {
    await new Promise((resolve) => {
      probeServer.close(resolve);
      probeServer.closeAllConnections();
    });
  }
});
