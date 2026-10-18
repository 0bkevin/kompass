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
  ({ fetchSocialSource, mapApifyItem, getSocialSettings } = await import(
    "../server/social-providers.mjs"
  ));
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

test("social providers fail closed when credentials are not configured", async () => {
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
    /YouTube no está configurado/,
  );
  assert.equal(requests, 0);
});

test("public references redact signed provider media URLs but retain access provenance", () => {
  const publicValue = publicReference({
    id: "reference-1",
    platform: "tiktok",
    mediaUrl: "https://signed-cdn.example.test/video.mp4?token=secret",
    mediaAccess: "provider_url",
    mediaProvider: "apify",
    contentScope: "metadata_only",
  });
  assert.equal(publicValue.mediaUrl, undefined);
  assert.equal(publicValue.mediaAccess, "provider_url");
  assert.equal(publicValue.mediaProvider, "apify");
  assert.equal(publicValue.contentScope, "metadata_only");
});

test("YouTube uses official search and batched video metadata without exposing the API key", async () => {
  const apiKey = "youtube-secret-never-in-url";
  setSecret(brand.id, "youtube", { apiKey });
  const calls = [];
  const now = Date.parse("2026-10-17T12:00:00.000Z");
  const items = await fetchSocialSource(
    brand,
    {
      id: "yt-source",
      type: "youtube",
      query: "AI education",
      limit: 2,
    },
    {
      now,
      fetcher: async (requestUrl, options) => {
        calls.push({ url: new URL(requestUrl), options });
        assert.equal(requestUrl.includes(apiKey), false);
        assert.equal(options.headers["x-goog-api-key"], apiKey);
        if (new URL(requestUrl).pathname.endsWith("/search"))
          return jsonResponse({
            items: [
              {
                id: { videoId: "abcdefghijk" },
                snippet: { title: "Fallback title" },
              },
            ],
          });
        if (new URL(requestUrl).pathname.endsWith("/videos"))
          return jsonResponse({
            items: [
              {
                id: "abcdefghijk",
                snippet: {
                  title: "New AI lesson",
                  description: "A practical lesson.",
                  channelTitle: "Example channel",
                  channelId: "UCexample",
                  publishedAt: "2026-10-16T10:00:00Z",
                  thumbnails: {
                    high: { url: "https://i.ytimg.com/vi/abcdefghijk/hq.jpg" },
                  },
                },
                statistics: { viewCount: "1200", likeCount: "31" },
                contentDetails: { duration: "PT2M3S" },
              },
            ],
          });
        throw new Error(`Unexpected endpoint ${requestUrl}`);
      },
    },
  );
  assert.equal(calls.length, 2);
  const search = calls[0].url.searchParams;
  assert.equal(search.get("order"), "date");
  assert.equal(search.get("relevanceLanguage"), "en");
  assert.equal(search.get("regionCode"), null);
  assert.equal(search.get("q"), "AI education");
  assert.equal(search.get("maxResults"), "2");
  assert.equal(search.has("key"), false);
  assert.equal(
    calls[1].url.searchParams.get("part"),
    "snippet,statistics,contentDetails",
  );
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].metrics, { views: 1200, likes: 31 });
  assert.equal(items[0].duration, 123);
  assert.equal(items[0].durationSeconds, 123);
  assert.equal(items[0].videoId, "abcdefghijk");
  assert.equal(items[0].platform, "youtube");
  assert.equal(items[0].url, "https://www.youtube.com/watch?v=abcdefghijk");
  assert.equal(items[0].contentScope, "metadata_only");
  assert.equal(items[0].mediaAccess, "youtube_url");
  assert.equal(items[0].metricsOrigin, "YouTube Data API");
  assert.equal(items[0].mediaUrl, undefined);
  assert.equal(JSON.stringify(items).includes(apiKey), false);
});

test("YouTube channel sources follow the uploads playlist and keep only recent videos", async () => {
  setSecret(brand.id, "youtube", { apiKey: "youtube-channel-test-key" });
  const calls = [];
  const now = Date.parse("2026-10-17T12:00:00Z");
  const items = await fetchSocialSource(
    brand,
    {
      id: "youtube-channel",
      type: "youtube",
      url: "https://youtube.com/@samplechannel",
      limit: 5,
    },
    {
      now,
      fetcher: async (requestUrl) => {
        const url = new URL(requestUrl);
        calls.push(url);
        if (url.pathname.endsWith("/channels"))
          return jsonResponse({
            items: [
              {
                contentDetails: { relatedPlaylists: { uploads: "UUchannel" } },
              },
            ],
          });
        if (url.pathname.endsWith("/playlistItems"))
          return jsonResponse({
            items: [
              { contentDetails: { videoId: "abcdefghijk" } },
              { contentDetails: { videoId: "lmnopqrstuv" } },
            ],
          });
        if (url.pathname.endsWith("/videos"))
          return jsonResponse({
            items: [
              {
                id: "abcdefghijk",
                snippet: {
                  title: "Recent channel upload",
                  publishedAt: "2026-10-16T12:00:00Z",
                },
                statistics: { viewCount: "45" },
                contentDetails: { duration: "PT30S" },
              },
              {
                id: "lmnopqrstuv",
                snippet: {
                  title: "Old channel upload",
                  publishedAt: "2026-09-01T12:00:00Z",
                },
                statistics: { viewCount: "9000" },
                contentDetails: { duration: "PT1M" },
              },
            ],
          });
        throw new Error(`Unexpected endpoint ${requestUrl}`);
      },
    },
  );
  assert.deepEqual(
    calls.map((url) => url.pathname.split("/").at(-1)),
    ["channels", "playlistItems", "videos"],
  );
  assert.equal(calls[0].searchParams.get("forHandle"), "@samplechannel");
  assert.equal(calls[1].searchParams.get("playlistId"), "UUchannel");
  assert.equal(calls[2].searchParams.get("id"), "abcdefghijk,lmnopqrstuv");
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Recent channel upload");
  assert.equal(items[0].metrics.views, 45);
});

test("Apify TikTok search uses the verified actor schema, a hard limit and safe token handling", async () => {
  const apiToken = "apify-secret-never-in-url";
  setSecret(brand.id, "apify", { apiToken });
  let request;
  const items = await fetchSocialSource(
    brand,
    {
      id: "tt-source",
      type: "apify",
      platform: "tiktok",
      query: "AI education",
      limit: 3,
    },
    {
      now: Date.parse("2026-10-17T12:00:00Z"),
      fetcher: async (requestUrl, options) => {
        request = { url: new URL(requestUrl), options };
        assert.equal(requestUrl.includes(apiToken), false);
        assert.equal(options.headers.authorization, `Bearer ${apiToken}`);
        return jsonResponse([
          {
            id: "7451234567890123456",
            webVideoUrl:
              "https://www.tiktok.com/@creator/video/7451234567890123456?lang=en",
            text: "AI lesson for teachers",
            authorMeta: { name: "creator" },
            createTimeISO: "2026-10-16T10:00:00Z",
            playCount: 501,
            diggCount: 27,
            commentCount: 8,
            shareCount: 4,
            videoMeta: {
              duration: 32,
              coverUrl: "https://p16-sign.tiktokcdn.com/cover.jpg",
              downloadAddr: "https://v16-webapp.tiktokcdn.com/video.mp4",
            },
            musicMeta: { playUrl: "https://example.test/music.mp3" },
          },
        ]);
      },
    },
  );
  assert.equal(request.url.hostname, "api.apify.com");
  assert.match(request.url.pathname, /clockworks~tiktok-scraper/);
  assert.equal(request.url.searchParams.get("timeout"), "60");
  assert.equal(request.url.searchParams.get("maxItems"), "3");
  assert.equal(request.url.searchParams.get("maxTotalChargeUsd"), "1");
  assert.equal(request.url.searchParams.get("restartOnError"), "false");
  assert.deepEqual(JSON.parse(request.options.body), {
    searchQueries: ["AI education"],
    searchSection: "/video",
    resultsPerPage: 3,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
    scrapeRelatedVideos: false,
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].platform, "tiktok");
  assert.equal(
    items[0].url,
    "https://tiktok.com/@creator/video/7451234567890123456",
  );
  assert.deepEqual(items[0].metrics, {
    views: 501,
    likes: 27,
    comments: 8,
    shares: 4,
  });
  assert.equal(items[0].metricsOrigin, "Apify");
  assert.equal(items[0].durationSeconds, 32);
  assert.equal(items[0].mediaAccess, "provider_url");
  assert.equal(items[0].mediaProvider, "apify");
  assert.equal(items[0].mediaUrl, "https://v16-webapp.tiktokcdn.com/video.mp4");
  assert.equal(
    items[0].thumbnailUrl,
    "https://p16-sign.tiktokcdn.com/cover.jpg",
  );
  assert.equal(items[0].mediaUrl.includes("music"), false);
  assert.equal(JSON.stringify(items).includes(apiToken), false);
});

test("Apify Instagram uses reel search and maps only video results", async () => {
  setSecret(brand.id, "apify", { apiToken: "instagram-test-token" });
  let input;
  const items = await fetchSocialSource(
    brand,
    {
      id: "ig-source",
      type: "apify",
      platform: "instagram",
      query: "#teachers",
      limit: 5,
    },
    {
      fetcher: async (_url, options) => {
        input = JSON.parse(options.body);
        return jsonResponse([
          {
            id: "CkExample",
            url: "https://www.instagram.com/reel/CkExample/?utm_source=test",
            type: "Video",
            caption: "Teacher creates a useful classroom routine",
            username: "teacher.creator",
            takenAt: 1781517600,
            videoDuration: 25,
            videoViewCount: 901,
            likesCount: 44,
            commentsCount: 5,
            displayUrl: "https://images.example.test/reel.jpg",
            videoUrl: "https://cdn.example.test/instagram-reel.mp4",
          },
          {
            id: "static-post",
            url: "https://www.instagram.com/p/StaticPost/",
            type: "Image",
            caption: "A static picture must not become a video result",
          },
        ]);
      },
    },
  );
  assert.deepEqual(input, {
    search: "#teachers",
    searchType: "hashtag",
    searchLimit: 1,
    resultsType: "reels",
    resultsLimit: 5,
    addParentData: true,
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].platform, "instagram");
  assert.equal(items[0].publishedAt, "2026-06-15T10:00:00.000Z");
  assert.deepEqual(items[0].metrics, {
    views: 901,
    likes: 44,
    comments: 5,
  });
  assert.equal(items[0].mediaProvider, "apify");
  assert.equal(items[0].mediaAccess, "provider_url");
  assert.equal(items[0].contentScope, "metadata_only");
});

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

test("provider rate failures return safe errors without echoing credentials", async () => {
  const token = "token-that-must-not-leak";
  setSecret(brand.id, "apify", { apiToken: token });
  await assert.rejects(
    fetchSocialSource(
      brand,
      {
        id: "tt-rate-limit",
        type: "apify",
        platform: "tiktok",
        query: "education",
        limit: 1,
      },
      {
        fetcher: async () => jsonResponse({ error: token }, 429),
      },
    ),
    (error) => {
      assert.match(error.message, /límite de solicitudes/);
      assert.equal(error.message.includes(token), false);
      return true;
    },
  );
});
