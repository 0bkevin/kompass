import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "radar-social-provider-"),
);
process.env.DATA_DIR = dataDir;
process.env.YOUTUBE_API_KEY = "";
process.env.APIFY_API_TOKEN = "";
process.env.GEMINI_API_KEY = "";
process.env.GEMINI_MODEL = "";

let brand;
let fetchSocialSource;
let mapApifyItem;
let getSocialSettings;
let setSecret;
let publicReference;

before(async () => {
  const db = await import("../server/db.mjs");
  ({ setSecret } = db);
  brand = db.saveBrand({
    name: "Marca de pruebas",
    industry: "Education",
    market: "Latinoamérica",
    pillars: ["education", "artificial intelligence", "finance"],
  });
  ({ fetchSocialSource, mapApifyItem, getSocialSettings } =
    await import("../server/social-providers.mjs"));
  ({ publicReference } = await import("../server/core.mjs"));
});

after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("social policy fails closed before missing-credential checks", async () => {
  assert.deepEqual(getSocialSettings(brand.id), {
    youtube: { configured: false },
    apify: { configured: false },
    gemini: { configured: false },
  });
  let requests = 0;
  await assert.rejects(
    fetchSocialSource(
      brand,
      { id: "yt", type: "youtube", query: "education", limit: 20 },
      {
        fetcher: async () => {
          requests++;
          return jsonResponse({});
        },
      },
    ),
    (error) => error.status === 403,
  );
  assert.equal(requests, 0);
});

test("restricted legacy references expose only their link and access notice", () => {
  const publicValue = publicReference({
    id: "reference-1",
    title: "Legacy provider title must remain hidden",
    text: "Legacy provider body must remain hidden",
    url: "https://www.tiktok.com/@creator/video/7451234567890123456",
    platform: "tiktok",
    metrics: { views: 901 },
    mediaUrl: "https://signed-cdn.example.test/video.mp4?token=secret",
    mediaAccess: "provider_url",
    mediaProvider: "apify",
    contentScope: "metadata_only",
  });
  assert.equal(publicValue.id, "reference-1");
  assert.equal(
    publicValue.url,
    "https://www.tiktok.com/@creator/video/7451234567890123456",
  );
  assert.equal(publicValue.title, "Referencia con acceso restringido");
  assert.equal(publicValue.accessPolicy.allowed, false);
  assert.ok(publicValue.accessPolicy.reason);
  for (const field of [
    "text",
    "platform",
    "metrics",
    "mediaUrl",
    "mediaAccess",
    "mediaProvider",
    "contentScope",
  ])
    assert.equal(
      publicValue[field],
      undefined,
      `${field} must not be disclosed`,
    );
  assert.equal(JSON.stringify(publicValue).includes("token=secret"), false);
});

for (const source of [
  { type: "youtube", query: "AI education" },
  { type: "youtube", url: "https://youtube.com/@samplechannel" },
  { type: "apify", platform: "tiktok", query: "AI education" },
  { type: "apify", platform: "instagram", query: "#teachers" },
]) {
  test(`${source.type}/${source.platform || "youtube"} collection stays blocked with valid credentials`, async () => {
    const secret = "provider-secret-never-forwarded";
    setSecret(brand.id, "youtube", { apiKey: secret });
    setSecret(brand.id, "apify", { apiToken: secret });
    let requests = 0;
    await assert.rejects(
      fetchSocialSource(
        brand,
        { id: "policy-blocked", enabled: true, limit: 5, ...source },
        {
          fetcher: async () => {
            requests++;
            throw new Error("must not contact provider");
          },
        },
      ),
      (error) => {
        assert.equal(error.status, 403);
        assert.equal(error.message.includes(secret), false);
        return true;
      },
    );
    assert.equal(requests, 0);
  });
}

test("Apify maps missing counts as absent and rejects unknown/unsafe media URLs", () => {
  const unsafe = mapApifyItem(
    {
      url: "https://www.tiktok.com/@creator/video/7451234567890123456",
      text: "A test video",
      videoMeta: {
        duration: 10,
        downloadAddr: "https://127.0.0.1/private.mp4",
        coverUrl: "https://localhost/private.jpg",
      },
    },
    "tiktok",
    Date.parse("2026-10-17T12:00:00Z"),
  );
  assert.equal(unsafe.metrics, undefined);
  assert.equal(unsafe.mediaUrl, undefined);
  assert.equal(unsafe.thumbnailUrl, undefined);
  assert.equal(unsafe.mediaAccess, "unavailable");
  assert.equal(
    mapApifyItem(
      {
        url: "https://www.instagram.com/p/Static/",
        type: "Image",
        caption: "static post",
      },
      "instagram",
    ),
    null,
  );
});

test("legacy TikTok parsing preserves reported counts and provenance without authorizing collection", () => {
  const item = mapApifyItem(
    {
      id: "7451234567890123456",
      webVideoUrl:
        "https://www.tiktok.com/@creator/video/7451234567890123456?lang=en",
      text: "A sample lesson",
      playCount: 501,
      diggCount: 27,
      commentCount: 8,
      shareCount: 4,
      videoMeta: {
        duration: 32,
        downloadAddr: "https://cdn.example.test/video.mp4",
      },
    },
    "tiktok",
  );
  assert.deepEqual(item.metrics, {
    views: 501,
    likes: 27,
    comments: 8,
    shares: 4,
  });
  assert.equal(item.metricsOrigin, "Apify");
  assert.equal(item.durationSeconds, 32);
  assert.equal(
    item.url,
    "https://tiktok.com/@creator/video/7451234567890123456",
  );
  assert.equal(item.mediaProvider, "apify");
});

test("legacy Instagram parsing distinguishes video records and preserves reported provenance", () => {
  const item = mapApifyItem(
    {
      id: "CkExample",
      url: "https://www.instagram.com/reel/CkExample/?utm_source=test",
      type: "Video",
      caption: "A sample reel",
      takenAt: 1781517600,
      videoDuration: 25,
      videoViewCount: 901,
      likesCount: 44,
      commentsCount: 5,
      videoUrl: "https://cdn.example.test/reel.mp4",
    },
    "instagram",
  );
  assert.equal(item.publishedAt, "2026-06-15T10:00:00.000Z");
  assert.deepEqual(item.metrics, { views: 901, likes: 44, comments: 5 });
  assert.equal(item.metricsOrigin, "Apify");
  assert.equal(item.durationSeconds, 25);
  assert.equal(item.contentScope, "metadata_only");
});
