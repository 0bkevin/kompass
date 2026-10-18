import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-video-policy-"));
process.env.DATA_DIR = dataDir;
delete process.env.GEMINI_API_KEY;
const { db, saveBrand, saveRecord, getRecord, setSecret } =
  await import("../server/db.mjs");
const { createUser, tokenHash } = await import("../server/auth.mjs");
const { createVideoAnalysisRouter, youtubeVideoId, parseMp4Duration } =
  await import("../server/video-analysis.mjs");
let server;
let origin;
let providerRequests = 0;

function fixtureMp4(seconds = 60) {
  const makeBox = (type, payload) => {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(8 + payload.length, 0);
    header.write(type, 4, 4, "ascii");
    return Buffer.concat([header, payload]);
  };
  const fileType = Buffer.alloc(16);
  fileType.write("isom", 0, 4, "ascii");
  fileType.writeUInt32BE(0x200, 4);
  fileType.write("isom", 8, 4, "ascii");
  fileType.write("mp42", 12, 4, "ascii");
  const movieHeader = Buffer.alloc(100);
  movieHeader.writeUInt32BE(1000, 12);
  movieHeader.writeUInt32BE(seconds * 1000, 16);
  return Buffer.concat([
    makeBox("ftyp", fileType),
    makeBox("moov", makeBox("mvhd", movieHeader)),
  ]);
}

async function account(role = "owner") {
  const user = createUser({
    name: `Tester ${role}`,
    email: `${role}-${crypto.randomUUID()}@example.test`,
    passwordHash: "test-only",
  });
  const brand = saveBrand({
    name: "Marca de prueba",
    industry: "Educación",
    description: "Contenido educativo para equipos de marketing.",
    language: "español",
    pillars: ["aprendizaje"],
    audience: [],
  });
  db.prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?)").run(
    brand.id,
    user.id,
    role,
  );
  const token = crypto.randomBytes(32).toString("base64url");
  db.prepare(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
  ).run(tokenHash(token), user.id, Date.now() + 60_000);
  return { user, brand, cookie: `radar_session=${token}` };
}

function addReference(brandId, fields = {}) {
  return saveRecord(brandId, "references", {
    title: "Referencia pública",
    url: "https://www.youtube.com/watch?v=abcdefghijk",
    source: "manual",
    status: "new",
    tags: [],
    ...fields,
  });
}
async function request(brandId, referenceId, { cookie, body = {} } = {}) {
  const response = await fetch(
    `${origin}/api/brands/${brandId}/references/${referenceId}/analyze-video`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    },
  );
  return { status: response.status, data: await response.json() };
}
before(async () => {
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createVideoAnalysisRouter({
      fetcher: async () => {
        providerRequests++;
        throw new Error(
          "policy must precede duration lookup, media download and Gemini",
        );
      },
    }),
  );
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server)
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections?.();
    });
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("authentication, membership and editor permission still protect the blocked route", async () => {
  const owner = await account();
  const reference = addReference(owner.brand.id);
  assert.equal((await request(owner.brand.id, reference.id)).status, 401);
  const outsider = await account();
  assert.equal(
    (await request(owner.brand.id, reference.id, { cookie: outsider.cookie }))
      .status,
    404,
  );
  const reviewer = await account("reviewer");
  assert.equal(
    (
      await request(reviewer.brand.id, addReference(reviewer.brand.id).id, {
        cookie: reviewer.cookie,
      })
    ).status,
    403,
  );
  assert.equal(providerRequests, 0);
});

for (const [name, fields] of [
  [
    "public YouTube URL",
    { platform: "youtube", mediaAccess: "youtube_url", durationSeconds: 40 },
  ],
  ["manual YouTube URL", {}],
  [
    "Apify Instagram MP4",
    {
      platform: "instagram",
      mediaProvider: "apify",
      mediaAccess: "provider_url",
      mediaUrl: "https://cdn.example.test/video.mp4?token=secret",
      durationSeconds: 30,
    },
  ],
  [
    "Apify TikTok MP4",
    {
      platform: "tiktok",
      mediaProvider: "apify",
      mediaAccess: "provider_url",
      mediaUrl: "https://cdn.example.test/video.mp4",
      durationSeconds: 30,
    },
  ],
  [
    "owned uploaded asset",
    { assetId: "owned-asset", platform: "upload", url: "" },
  ],
  [
    "forged authorization metadata",
    {
      rightsApproved: true,
      consent: true,
      authorized: true,
      policyAccepted: true,
    },
  ],
]) {
  test(`${name} analysis is blocked before any provider or file processing`, async () => {
    const owner = await account();
    setSecret(owner.brand.id, "gemini", { apiKey: "gemini-secret" });
    setSecret(owner.brand.id, "youtube", { apiKey: "youtube-secret" });
    const reference = addReference(owner.brand.id, fields);
    const before = getRecord(owner.brand.id, "references", reference.id);
    const result = await request(owner.brand.id, reference.id, {
      cookie: owner.cookie,
    });
    assert.equal(result.status, 403);
    assert.equal(result.data.error.includes("gemini-secret"), false);
    assert.equal(result.data.error.includes("?token="), false);
    assert.deepEqual(
      getRecord(owner.brand.id, "references", reference.id),
      before,
    );
    assert.equal(providerRequests, 0);
    // A rejection must also release the in-flight lock, not make retries return409.
    assert.equal(
      (await request(owner.brand.id, reference.id, { cookie: owner.cookie }))
        .status,
      403,
    );
  });
}

test("missing credentials cannot turn policy rejection into a setup instruction", async () => {
  const owner = await account();
  const ref = addReference(owner.brand.id);
  assert.equal(
    (await request(owner.brand.id, ref.id, { cookie: owner.cookie })).status,
    403,
  );
  assert.equal(providerRequests, 0);
});

test("invalid request fields and missing references preserve their validation errors", async () => {
  const owner = await account();
  const ref = addReference(owner.brand.id);
  assert.equal(
    (
      await request(owner.brand.id, ref.id, {
        cookie: owner.cookie,
        body: { authorized: true },
      })
    ).status,
    400,
  );
  assert.equal(
    (await request(owner.brand.id, "nonexistent", { cookie: owner.cookie }))
      .status,
    404,
  );
  assert.equal(providerRequests, 0);
});

test("YouTube URL parser recognizes supported public forms without making requests", () => {
  for (const url of [
    "https://www.youtube.com/watch?v=abcdefghijk",
    "https://youtu.be/abcdefghijk",
    "https://youtube.com/shorts/abcdefghijk",
    "https://www.youtube-nocookie.com/embed/abcdefghijk",
  ])
    assert.equal(youtubeVideoId(url), "abcdefghijk");
  for (const url of [
    "http://youtube.com/watch?v=abcdefghijk",
    "https://youtube.com.evil.test/watch?v=abcdefghijk",
    "https://user:pass@youtube.com/watch?v=abcdefghijk",
    "https://youtube.com/watch?v=abcdefghijk&v=lmnopqrstuv",
    "https://youtube.com/watch?v=abcdefghijk&token=secret",
    "https://youtu.be/abcdefghijk/extra",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/watch?v=abcdefghijk#fragment",
  ])
    assert.equal(youtubeVideoId(url), null);
  assert.equal(providerRequests, 0);
});

test("MP4 duration parser keeps bounded-container validation without processing media externally", () => {
  assert.equal(parseMp4Duration(fixtureMp4(60)), 60);
  assert.equal(parseMp4Duration(fixtureMp4(0)), 0);
  assert.equal(parseMp4Duration(Buffer.alloc(8)), null);
  const broken = fixtureMp4(30);
  broken.writeUInt32BE(0xffffffff, 28);
  assert.equal(parseMp4Duration(broken), null);
  assert.equal(providerRequests, 0);
});
