import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installPermissionFixture } from "./permission-fixture.mjs";

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "kompass-content-privacy-"),
);
process.env.DATA_DIR = directory;
process.env.OPENAI_API_KEY = "";
installPermissionFixture(directory, [
  { origin: "https://model.example", pathPrefix: "/v1", purposes: ["ai"] },
]);
let storage,
  auth,
  connectors,
  intelligence,
  server,
  origin,
  user,
  cookie,
  brand;

before(async () => {
  storage = await import("../server/db.mjs");
  auth = await import("../server/auth.mjs");
  connectors = await import("../server/connectors.mjs");
  intelligence = await import("../server/intelligence.mjs");
  const { createApp } = await import("../server/index.mjs");
  user = auth.createUser({
    name: "QA editorial",
    email: `${randomUUID()}@example.test`,
    passwordHash: "fixture-only",
  });
  const token = randomUUID();
  storage.db
    .prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    )
    .run(auth.tokenHash(token), user.id, Date.now() + 3600000);
  cookie = `radar_session=${token}`;
  brand = storage.saveBrand({
    name: "Equipo editorial",
    industry: "Educación",
    description: "Contenido público sobre IA",
    pillars: ["IA"],
    audience: [],
  });
  storage.db
    .prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?)")
    .run(brand.id, user.id, "owner");
  server = createApp({ apiOnly: true }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  storage.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
async function post(kind, body) {
  const response = await fetch(`${origin}/api/brands/${brand.id}/${kind}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("corpus writes reject contact details without affecting operator authentication", async () => {
  const privateText = "Pedir información a private-person@example.test";
  const reference = await post("references", {
    title: "Referencia pública",
    text: privateText,
  });
  const piece = await post("pieces", {
    title: "Una pieza",
    script: privateText,
  });
  assert.equal(reference.status, 400);
  assert.equal(piece.status, 400);
  assert.ok(!JSON.stringify(reference.body).includes("private-person"));
  assert.equal(storage.listRecords(brand.id, "references").length, 0);
  assert.equal(storage.listRecords(brand.id, "pieces").length, 0);
  const session = await fetch(`${origin}/api/session`, { headers: { cookie } });
  assert.equal(session.status, 200);
});

test("a rejected text upload is removed and accepted text never claims complete privacy review", async () => {
  const send = async (text, name) => {
    const body = new FormData();
    body.append("file", new Blob([text], { type: "text/plain" }), name);
    const response = await fetch(`${origin}/api/brands/${brand.id}/assets`, {
      method: "POST",
      headers: { cookie },
      body,
    });
    return { status: response.status, body: await response.json() };
  };
  const beforeFiles = fs.readdirSync(storage.UPLOAD_DIR).length;
  const rejected = await send(
    "X".repeat(65530) + "\nCorreo: contact@example.test",
    "notes.txt",
  );
  assert.equal(rejected.status, 400);
  assert.equal(fs.readdirSync(storage.UPLOAD_DIR).length, beforeFiles);
  const accepted = await send(
    "Tres preguntas sobre IA para equipos de contenido.",
    "public-notes.txt",
  );
  assert.equal(accepted.status, 201);
  assert.equal(accepted.body.privacyReview.mode, "text-patterns");
  assert.equal(accepted.body.privacyReview.complete, false);
});

test("legacy private text cannot reach an AI provider", async () => {
  storage.setSecret(brand.id, "ai", {
    apiKey: "synthetic-provider-key",
    baseUrl: "https://model.example/v1",
    model: "fixture-model",
  });
  let calls = 0;
  await assert.rejects(
    connectors.generateStructured(
      brand.id,
      {
        name: "privacy_test",
        schema: { type: "object" },
        instructions: "Resumir texto público.",
        input: "Email: private-person@example.test",
      },
      {
        fetcher: async () => {
          calls++;
          throw new Error("The provider must not be called");
        },
      },
    ),
    (error) => error.code === "PUBLIC_CONTENT_PRIVACY",
  );
  assert.equal(calls, 0);
});

test("discovery skips private feed items before storing and reports the exclusions", async () => {
  const source = storage.saveRecord(brand.id, "sources", {
    name: "Hacker News",
    type: "hackernews",
    query: "IA",
    enabled: true,
  });
  const result = await intelligence.syncSources(brand, {
    fetcher: async () =>
      new Response(
        JSON.stringify({
          hits: [
            {
              objectID: "safe-item",
              title: "IA para equipos de contenido",
              url: "https://example.com/public-ai",
              points: 12,
              created_at: new Date().toISOString(),
            },
            {
              objectID: "private-item",
              title: "Contactar a private-person@example.test",
              url: "https://example.com/private",
              points: 50,
              created_at: new Date().toISOString(),
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      ),
  });
  const records = storage.listRecords(brand.id, "references");
  assert.equal(records.length, 1);
  assert.equal(records[0].externalId, "safe-item");
  assert.equal(result.sources[0].privacySkipped, 1);
  assert.equal(
    storage.getRecord(brand.id, "sources", source.id).lastPrivacySkipped,
    1,
  );
});
