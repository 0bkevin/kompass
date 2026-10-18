import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { uploadFilesIndividually } from "../src/lib/workflow-recovery.mjs";

const MiB = 1024 * 1024;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-assets-2-"));
process.env.DATA_DIR = dataDir;
process.env.OPENAI_API_KEY = "";
process.env.GEMINI_API_KEY = "";
process.env.YOUTUBE_API_KEY = "";
process.env.APIFY_API_TOKEN = "";
process.env.DISCOVERY_ENABLED = "false";

const { createApp } = await import("../server/index.mjs");
const { db, UPLOAD_DIR } = await import("../server/db.mjs");
let server, origin, cookie, brandId;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

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
    name: "Equipo sintético assets-2",
    email: "assets-2@example.test",
    password: "synthetic-assets-2-password",
  });
  assert.equal(registered.response.status, 201);
  cookie = registered.response.headers.get("set-cookie").split(";")[0];
  const brand = await api("/brands", { name: "Archivos sintéticos assets-2" });
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

async function upload(bytes, name, mimeType = "text/plain") {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mimeType }), name);
  const response = await fetch(`${origin}/api/brands/${brandId}/assets`, {
    method: "POST",
    headers: { cookie },
    body: form,
  });
  return { response, data: await response.json() };
}

async function roundTrip(
  bytes,
  name,
  mimeType = "text/plain",
  type = "document",
) {
  const { response, data } = await upload(bytes, name, mimeType);
  assert.equal(response.status, 201, JSON.stringify(data));
  assert.equal(data.name, name);
  assert.equal(data.size, bytes.length);
  assert.equal(data.type, type);
  assert.equal(data.mimeType, mimeType);
  const library = await api(`/brands/${brandId}/assets`);
  assert.ok(library.data.some((asset) => asset.id === data.id));
  const download = await fetch(`${origin}${data.url}?download=1`, {
    headers: { cookie },
  });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("x-content-type-options"), "nosniff");
  assert.match(download.headers.get("content-disposition"), /^attachment; /);
  const downloaded = Buffer.from(await download.arrayBuffer());
  assert.equal(downloaded.length, bytes.length);
  assert.deepEqual(downloaded, bytes);
  return { asset: data, sha256: sha256(downloaded) };
}

test("assets-2 original 11 MiB ASCII TXT uploads and downloads the same bytes", async () => {
  const bytes = Buffer.alloc(11 * MiB, 97);
  const result = await roundTrip(bytes, "15-texto-11MiB.txt");
  assert.equal(result.sha256, sha256(bytes));
});

test("assets-2 accepts the 10 MiB and inclusive 25 MiB text boundaries", async () => {
  for (const size of [10 * MiB, 25 * MiB])
    await roundTrip(Buffer.alloc(size, 97), `texto-${size / MiB}MiB.txt`);
});

test("assets-2 25 MiB plus one byte gets a specific size error without storage or library residue", async () => {
  const filesBefore = fs.readdirSync(UPLOAD_DIR).sort();
  const libraryBefore = await api(`/brands/${brandId}/assets`);
  for (const [name, mimeType] of [
    ["texto-25MiB-mas-1.txt", "text/plain"],
    ["imagen-25MiB-mas-1.png", "image/png"],
  ]) {
    const bytes = Buffer.alloc(25 * MiB + 1, 97);
    if (mimeType === "image/png")
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
    const { response, data } = await upload(bytes, name, mimeType);
    assert.equal(response.status, 413, JSON.stringify(data));
    assert.match(data.error, /25 MiB/);
    assert.match(data.error, /tamaño|máximo|límite/);
    assert.doesNotMatch(data.error, /formato/i);
    assert.deepEqual(fs.readdirSync(UPLOAD_DIR).sort(), filesBefore);
    const library = await api(`/brands/${brandId}/assets`);
    assert.equal(library.data.length, libraryBefore.data.length);
  }
});

test("assets-2 validates multibyte UTF-8 across inspection chunks and at EOF", async () => {
  const bytes = Buffer.alloc(11 * MiB, 97);
  Buffer.from("ñ").copy(bytes, 65535);
  Buffer.from("日本語 العربية 🙂").copy(bytes, 128 * 1024 - 1);
  Buffer.from("🙂").copy(bytes, bytes.length - 4);
  await roundTrip(bytes, "texto-UTF8-ñ-日本語-11MiB.md", "text/markdown");
  await roundTrip(
    Buffer.from("nombre,valor\nacción,5\n"),
    "datos.csv",
    "text/csv",
  );
});

test("assets-2 rejects binary tails and malformed UTF-8 despite a TXT name and MIME", async () => {
  const binaryTail = Buffer.alloc(2 * MiB, 97);
  binaryTail[binaryTail.length - 1] = 0;
  const invalidUtf8 = Buffer.alloc(2 * MiB, 97);
  invalidUtf8[65535] = 0xc3;
  invalidUtf8[65536] = 0x28;
  const truncatedUtf8 = Buffer.concat([
    Buffer.alloc(65535, 97),
    Buffer.from([0xc3]),
  ]);
  const controls = Buffer.concat([
    Buffer.alloc(2048, 97),
    Buffer.from([1, 2, 3]),
  ]);
  for (const [label, bytes] of [
    ["binario", binaryTail],
    ["UTF8-invalido", invalidUtf8],
    ["UTF8-incompleto", truncatedUtf8],
    ["controles-binarios", controls],
    ["otra-codificacion", Buffer.from("café", "latin1")],
  ]) {
    const before = fs.readdirSync(UPLOAD_DIR).sort();
    const { response, data } = await upload(bytes, `${label}.txt`);
    assert.equal(response.status, 400, JSON.stringify(data));
    assert.match(data.error, /texto.*UTF-8/i);
    assert.doesNotMatch(data.error, /supera|máximo|límite/i);
    assert.deepEqual(fs.readdirSync(UPLOAD_DIR).sort(), before);
  }
});

test("assets-2 retains supported binary signatures and safe text document downloads", async () => {
  for (const [name, mimeType, type, bytes] of [
    [
      "imagen.png",
      "image/png",
      "image",
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ],
    ["imagen.jpg", "image/jpeg", "image", Buffer.from([255, 216, 255])],
    ["imagen.gif", "image/gif", "image", Buffer.from("GIF89a")],
    ["imagen.webp", "image/webp", "image", Buffer.from("RIFF0000WEBP")],
    ["documento.pdf", "application/pdf", "document", Buffer.from("%PDF-1.4\n")],
    ["sonido.wav", "audio/wav", "audio", Buffer.from("RIFF0000WAVE")],
    ["sonido.ogg", "audio/ogg", "audio", Buffer.from("OggS")],
    ["sonido.mp3", "audio/mpeg", "audio", Buffer.from("ID3")],
    ["video.mp4", "video/mp4", "video", Buffer.from("0000ftyp")],
    ["sonido.m4a", "audio/mp4", "audio", Buffer.from("0000ftyp")],
    ["video.webm", "video/webm", "video", Buffer.from([26, 69, 223, 163])],
    ["sonido.webm", "audio/webm", "audio", Buffer.from([26, 69, 223, 163])],
    [
      "marcado-inerte.txt",
      "text/plain",
      "document",
      Buffer.from("<p>Texto sintético inerte</p>\n"),
    ],
  ])
    await roundTrip(bytes, name, mimeType, type);
  const renamedImage = await upload(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    "imagen-renombrada.txt",
    "text/plain",
  );
  assert.equal(renamedImage.response.status, 201);
  assert.equal(renamedImage.data.type, "image");
  assert.equal(renamedImage.data.mimeType, "image/png");
  const { response, data } = await upload(
    Buffer.from("texto"),
    "no-admitido.html",
    "text/html",
  );
  assert.equal(response.status, 400);
  assert.match(data.error, /Formato no admitido/);
});

test("assets-2 per-file recovery keeps valid files when a TXT is invalid", async () => {
  const good = Buffer.alloc(11 * MiB, 97);
  const files = [
    { name: "lote-valido-11MiB.txt", bytes: good },
    { name: "lote-binario.txt", bytes: Buffer.from([0, 1, 2, 3]) },
    {
      name: "lote-recuperado.txt",
      bytes: Buffer.from("Contenido sintético recuperado\n"),
    },
  ];
  const results = await uploadFilesIndividually(files, async (file) => {
    const { response, data } = await upload(file.bytes, file.name);
    if (!response.ok) throw new Error(data.error);
  });
  assert.deepEqual(
    results.map((result) => result.status),
    ["uploaded", "failed", "uploaded"],
  );
  assert.match(results[1].message, /texto.*UTF-8/i);
  const library = await api(`/brands/${brandId}/assets`);
  for (const name of [files[0].name, files[2].name])
    assert.equal(library.data.filter((asset) => asset.name === name).length, 1);
  assert.ok(library.data.every((asset) => asset.name !== files[1].name));
});
