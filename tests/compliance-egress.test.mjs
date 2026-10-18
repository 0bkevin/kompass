import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dns from "node:dns/promises";
import { installPermissionFixture } from "./permission-fixture.mjs";

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "radar-compliance-egress-"),
);
process.env.DATA_DIR = directory;
delete process.env.OPENAI_API_KEY;
const { db, saveBrand, saveRecord, setSecret, getSecret, getRecord } =
  await import("../server/db.mjs");
const {
  generateStructured,
  configureIntegrations,
  publishPiece,
  getPublicationState,
  safeFetch,
} = await import("../server/connectors.mjs");
const { sourceAccessPolicy, webAccessPolicy, assertAiProviderAllowed } =
  await import("../server/access-policy.mjs");
const brand = saveBrand({ name: "Synthetic permissions QA" });
const aiUrl = "https://ai.example.test/v1";
const hookUrl = "https://publish.example.test/deliver";
const aiGrant = {
  origin: "https://ai.example.test",
  pathPrefix: "/v1",
  purposes: ["ai"],
};
const hookGrant = {
  origin: "https://publish.example.test",
  pathPrefix: "/deliver",
  purposes: ["webhook"],
};
const permissionFile = (grants = []) =>
  installPermissionFixture(directory, grants);
const request = {
  name: "synthetic",
  schema: { type: "object" },
  instructions: "Use only supplied test material",
  input: "Synthetic company-owned text",
};
const response = () =>
  new Response(JSON.stringify({ output_text: '{"ok":true}' }), {
    headers: { "content-type": "application/json" },
  });
after(() => {
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("an AI key cannot send content to an unreviewed custom provider", async () => {
  permissionFile();
  setSecret(brand.id, "ai", {
    apiKey: "synthetic-no-real-key",
    baseUrl: aiUrl,
  });
  let calls = 0;
  await assert.rejects(
    generateStructured(brand.id, request, {
      fetcher: async () => {
        calls++;
        return response();
      },
    }),
    { status: 403 },
  );
  assert.equal(calls, 0);
});

test("an AI review is limited by origin, path and purpose", async () => {
  permissionFile([aiGrant]);
  assert.doesNotThrow(() => assertAiProviderAllowed(aiUrl));
  for (const url of [
    "https://ai.example.test/v10",
    "https://ai.example.test/other",
    "https://other.example.test/v1",
  ])
    assert.throws(() => assertAiProviderAllowed(url), { status: 403 });
  assert.equal(webAccessPolicy(`${aiUrl}/content`, "metadata").allowed, false);
  let payload;
  assert.deepEqual(
    await generateStructured(brand.id, request, {
      fetcher: async (url, options) => {
        assert.equal(url, `${aiUrl}/responses`);
        payload = JSON.parse(options.body);
        return response();
      },
    }),
    { ok: true },
  );
  assert.equal(payload.store, false);
  assert.equal(payload.input[0].content[0].text, request.input);
});

test("revoking an AI review stops an existing credential before transport", async () => {
  permissionFile([aiGrant]);
  assert.doesNotThrow(() => assertAiProviderAllowed(aiUrl));
  permissionFile();
  await assert.rejects(
    generateStructured(brand.id, request, {
      fetcher: async () => {
        assert.fail("No provider call after revocation");
      },
    }),
    { status: 403 },
  );
});

test("remote image URLs cannot make the model fetch an unapproved media source", async () => {
  permissionFile([aiGrant]);
  await assert.rejects(
    generateStructured(
      brand.id,
      { ...request, image: "https://www.instagram.com/synthetic.jpg" },
      { fetcher: async () => assert.fail("No image/provider fetch") },
    ),
    { status: 403 },
  );
});

test("missing, malformed, oversized, future and overlong permission reviews fail closed", () => {
  const filename = permissionFile([aiGrant]);
  const valid = JSON.parse(fs.readFileSync(filename, "utf8"));
  for (const content of [
    "{",
    " ".repeat(65537),
    JSON.stringify({ ...valid, version: 2 }),
    JSON.stringify({
      ...valid,
      grants: [
        {
          ...valid.grants[0],
          reviewedAt: new Date(Date.now() + 86400000).toISOString(),
        },
      ],
    }),
    JSON.stringify({
      ...valid,
      grants: [
        {
          ...valid.grants[0],
          expiresAt: new Date(Date.now() + 100 * 86400000).toISOString(),
        },
      ],
    }),
  ]) {
    fs.writeFileSync(filename, content);
    assert.throws(() => assertAiProviderAllowed(aiUrl), { status: 403 });
  }
  fs.unlinkSync(filename);
  assert.throws(() => assertAiProviderAllowed(aiUrl), { status: 403 });
});

test("an unreviewed webhook cannot change publication state or open a socket", async () => {
  permissionFile();
  setSecret(brand.id, "webhook", { url: hookUrl });
  const piece = saveRecord(brand.id, "pieces", {
    title: "Synthetic original draft",
    caption: "Synthetic owned text",
    status: "approved",
    channel: "linkedin",
  });
  const before = getRecord(brand.id, "pieces", piece.id);
  await assert.rejects(
    publishPiece(brand, piece, {
      fetcher: async () => assert.fail("No unreviewed publication"),
    }),
    { status: 403 },
  );
  assert.deepEqual(getRecord(brand.id, "pieces", piece.id), before);
  assert.equal(getSecret(brand.id, `publication:${piece.id}`), null);
  assert.equal(getPublicationState(brand, piece).status, "ready");
});

test("a reviewed webhook receives approved original content and required attribution", async () => {
  permissionFile([hookGrant]);
  const piece = saveRecord(brand.id, "pieces", {
    title: "Synthetic approved draft",
    caption: "Synthetic owned text",
    status: "approved",
    channel: "linkedin",
    providerAttributions: [
      {
        id: "gdelt",
        name: "GDELT Project",
        url: "https://www.gdeltproject.org/",
      },
    ],
  });
  let sent;
  const published = await publishPiece(brand, piece, {
    fetcher: async (url, options) => {
      assert.equal(url, hookUrl);
      sent = JSON.parse(options.body);
      return new Response(null, { status: 204 });
    },
  });
  assert.equal(published.status, "published");
  assert.equal(
    sent.piece.providerAttributions[0].url,
    "https://www.gdeltproject.org/",
  );
});

test("unreviewed integration changes fail atomically before DNS or secret writes", async (t) => {
  permissionFile();
  const existingAi = getSecret(brand.id, "ai"),
    existingHook = getSecret(brand.id, "webhook");
  const lookup = t.mock.method(dns, "lookup", async () => {
    assert.fail("Permission must be checked before DNS");
  });
  await assert.rejects(
    configureIntegrations(brand.id, {
      ai: {
        apiKey: "new-synthetic-key",
        baseUrl: "https://new.example.test/v1",
      },
      webhook: null,
    }),
    { status: 403 },
  );
  assert.deepEqual(getSecret(brand.id, "ai"), existingAi);
  assert.deepEqual(getSecret(brand.id, "webhook"), existingHook);
  assert.equal(lookup.mock.callCount(), 0);
});

test("Telegram truncation preserves mandatory source credits in preview and actual approved send", async () => {
  permissionFile();
  setSecret(brand.id, "telegram", {
    botToken: "12345:synthetic_bot_not_real_credential",
    chatId: "-1001234567890",
  });
  const piece = saveRecord(brand.id, "pieces", {
    title: "Synthetic approved original",
    caption: "Owned text. ".repeat(500),
    status: "approved",
    channel: "telegram",
    providerAttributions: [{ id: "gdelt" }],
  });
  const preview = getPublicationState(brand, piece);
  assert.equal(preview.textTruncated, true);
  assert.ok(preview.previewText.length <= 4096);
  assert.ok(
    preview.previewText.endsWith(
      "Datos: GDELT Project (https://www.gdeltproject.org/)",
    ),
  );
  let sent;
  await publishPiece(brand, piece, {
    fetcher: async (_url, options) => {
      sent = JSON.parse(options.body);
      return new Response(
        JSON.stringify({
          ok: true,
          result: { message_id: 1, chat: { id: -1001234567890 } },
        }),
        { headers: { "content-type": "application/json" } },
      );
    },
  });
  assert.equal(sent.text, preview.previewText);
});

test("known restricted platforms cannot be reopened by an operator web grant", async () => {
  const filename = permissionFile();
  const now = Date.now();
  fs.writeFileSync(
    filename,
    JSON.stringify({
      version: 1,
      grants: [
        {
          origin: "https://www.instagram.com",
          pathPrefix: "/",
          purposes: ["metadata", "rss", "ai", "webhook"],
          evidenceUrl: "https://www.instagram.com/legal/terms/",
          reviewedBy: "Synthetic operator",
          note: "A fabricated grant is not Meta permission",
          reviewedAt: new Date(now - 1000).toISOString(),
          expiresAt: new Date(now + 86400000).toISOString(),
        },
      ],
    }),
  );
  assert.equal(
    sourceAccessPolicy({
      type: "rss",
      url: "https://www.instagram.com/example/feed",
    }).allowed,
    false,
  );
  await assert.rejects(safeFetch("https://www.instagram.com/example"), {
    status: 403,
  });
  assert.throws(() => assertAiProviderAllowed("https://www.instagram.com"), {
    status: 403,
  });
});

test("a reviewed web origin cannot expose token-bearing, private-route or personal URLs", () => {
  permissionFile([
    {
      origin: "https://owned.example.test",
      pathPrefix: "/",
      purposes: ["metadata", "rss"],
    },
  ]);
  for (const suffix of [
    "/feed?access_token=synthetic",
    "/feed?apiKey=synthetic",
    "/login",
    "/dashboard/data",
    "/feed?contact=synthetic%40example.com",
  ])
    assert.equal(
      webAccessPolicy(`https://owned.example.test${suffix}`, "rss").allowed,
      false,
    );
  assert.equal(
    webAccessPolicy("https://owned.example.test/feed?category=sales", "rss")
      .allowed,
    true,
  );
});

test("Telegram publishing permission never permits message collection", async () => {
  permissionFile();
  await assert.rejects(
    safeFetch("https://api.telegram.org/bot12345:synthetic/getUpdates"),
    { status: 403 },
  );
});
