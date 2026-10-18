import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import express from "express";

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "interactive-results-"),
);
process.env.DATA_DIR = directory;
const storage = await import("../server/db.mjs");
const auth = await import("../server/auth.mjs");
const { createAudienceInsightsRouter } =
  await import("../server/audience-insights.mjs");
let server;
let origin;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", createAudienceInsightsRouter());
  app.use((error, _req, res, _next) =>
    res.status(error.status || 500).json({ error: error.message }),
  );
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections?.();
  });
  storage.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const user = auth.createUser({
    name: "Synthetic results QA",
    email: `${randomUUID()}@example.test`,
    passwordHash: "fixture-only",
  });
  const token = randomUUID();
  storage.db
    .prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    )
    .run(auth.tokenHash(token), user.id, Date.now() + 60_000);
  const brand = storage.saveBrand({ name: "Synthetic Results", audience: [] });
  storage.db
    .prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,'owner')")
    .run(brand.id, user.id);
  const piece = storage.saveRecord(brand.id, "pieces", {
    title: "Synthetic practical AI",
    channel: "linkedin",
    format: "post",
    status: "approved",
  });
  return { brand, piece, cookie: `radar_session=${token}` };
}
async function post(f, body) {
  const response = await fetch(
    `${origin}/api/brands/${f.brand.id}/pieces/${f.piece.id}/outcome`,
    {
      method: "POST",
      headers: { cookie: f.cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return { status: response.status, data: await response.json() };
}

test("clearing a manual publication URL removes the outcome and piece link, while omitted corrections preserve it", async () => {
  const f = fixture();
  const metrics = { views: 1200.5, engagement: 80.25, leads: 0 };
  const first = await post(f, {
    metrics,
    publishedAt: "2026-01-01T12:00:00.000Z",
    publishedUrl: "https://example.org/synthetic-post",
  });
  assert.equal(first.status, 200);
  const omitted = await post(f, {
    metrics,
    notes: "Synthetic aggregate correction at 7 days.",
  });
  assert.equal(omitted.status, 200);
  assert.equal(omitted.data.publishedUrl, first.data.publishedUrl);
  const invalid = await post(f, {
    metrics,
    publishedUrl: "http://127.0.0.1/private",
  });
  assert.equal(invalid.status, 400);
  assert.equal(
    storage.getRecord(f.brand.id, "outcomes", first.data.id).publishedUrl,
    first.data.publishedUrl,
  );
  const cleared = await post(f, { metrics, publishedUrl: "" });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.data.id, first.data.id);
  assert.equal(cleared.data.createdAt, first.data.createdAt);
  assert.equal(
    cleared.data.publishedUrl,
    undefined,
    "explicit blank must remove the stale outcome URL",
  );
  assert.equal(
    storage.getRecord(f.brand.id, "pieces", f.piece.id).publishedUrl,
    undefined,
    "piece URL must be cleared too",
  );
  assert.deepEqual(cleared.data.metrics, metrics);
  assert.equal(storage.listRecords(f.brand.id, "outcomes").length, 1);
  const reloaded = await post(f, { metrics });
  assert.equal(
    reloaded.data.publishedUrl,
    undefined,
    "an omitted later correction must not revive the link",
  );
});
