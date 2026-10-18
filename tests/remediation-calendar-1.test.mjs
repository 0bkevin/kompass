import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "remediation-calendar-1-"));
process.env.DATA_DIR = directory;
process.env.OPENAI_API_KEY = "";
process.env.GEMINI_API_KEY = "";
process.env.YOUTUBE_API_KEY = "";
process.env.APIFY_API_TOKEN = "";
process.env.DISCOVERY_ENABLED = "false";
const storage = await import("../server/db.mjs");
const auth = await import("../server/auth.mjs");
const { createApp } = await import("../server/index.mjs");
let server, origin;

async function request(route, { cookie, method = "GET", body } = {}) {
  const response = await fetch(`${origin}/api${route}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json() };
}
function account() {
  const user = auth.createUser({ name: "Equipo calendario sintético", email: `${randomUUID()}@example.com`, passwordHash: "fixture-only" });
  const token = randomUUID();
  storage.db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").run(auth.tokenHash(token), user.id, Date.now() + 600_000);
  return { ...user, cookie: `radar_session=${token}` };
}
async function fixture() {
  const owner = account();
  const brand = storage.saveBrand({ name: "QA calendario sintético", audience: [], pillars: ["Ventas"] });
  storage.db.prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,'owner')").run(brand.id, owner.id);
  const base = `/brands/${brand.id}`;
  const created = await request(`${base}/pieces`, { cookie: owner.cookie, method: "POST", body: { title: "Contenido sintético", script: "Versión aprobada de prueba.", channel: "linkedin", format: "post" } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const route = `${base}/pieces/${created.data.id}`;
  const review = await request(route, { cookie: owner.cookie, method: "PATCH", body: { status: "review" } });
  assert.equal(review.status, 200);
  const approved = await request(`${route}/review`, { cookie: owner.cookie, method: "POST", body: { action: "approve", comment: "Revisión sintética.", expectedApprovalVersion: review.data.approvalVersion } });
  assert.equal(approved.status, 200, JSON.stringify(approved.data));
  const scheduledFor = new Date(Date.now() + 48 * 3600_000).toISOString();
  const scheduled = await request(route, { cookie: owner.cookie, method: "PATCH", body: { status: "scheduled", scheduledFor } });
  assert.equal(scheduled.status, 200, JSON.stringify(scheduled.data));
  return { owner, brand, base, route, scheduledFor, scheduled: scheduled.data };
}

before(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => { server.close(resolve); server.closeAllConnections?.(); });
  storage.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("original HTTP repro: editorial scheduled→draft omitting scheduledFor clears the plan, preserving the piece and review history", async () => {
  const f = await fixture();
  const edited = await request(f.route, { cookie: f.owner.cookie, method: "PATCH", body: { status: "draft", title: "QA corregida pendiente de aprobación", script: "Nueva versión sintética que requiere otra revisión." } });
  assert.equal(edited.status, 200, JSON.stringify(edited.data));
  assert.equal(edited.data.status, "draft");
  assert.equal(edited.data.scheduledFor, undefined, "The unapproved draft must not retain the scheduled date omitted by this PATCH.");
  assert.equal(edited.data.id, f.scheduled.id);
  assert.equal(edited.data.createdAt, f.scheduled.createdAt);
  assert.deepEqual(edited.data.comments, f.scheduled.comments);
  assert.notEqual(edited.data.approvalVersion, f.scheduled.approvalVersion);
  const stored = storage.getRecord(f.brand.id, "pieces", f.scheduled.id);
  assert.equal(stored.scheduledFor, undefined);
  const state = await request(`${f.base}/state`, { cookie: f.owner.cookie });
  assert.equal(state.data.pieces.find((piece) => piece.id === f.scheduled.id).scheduledFor, undefined);
  const bypass = await request(f.route, { cookie: f.owner.cookie, method: "PATCH", body: { status: "scheduled", scheduledFor: f.scheduledFor } });
  assert.equal(bypass.status, 409);
});

test("leaving scheduled for draft, review or approved clears dates even when explicitly supplied again", async () => {
  for (const status of ["draft", "review", "approved"]) {
    const f = await fixture();
    const changed = await request(f.route, { cookie: f.owner.cookie, method: "PATCH", body: { status, scheduledFor: f.scheduledFor } });
    assert.equal(changed.status, 200, `${status}: ${JSON.stringify(changed.data)}`);
    assert.equal(changed.data.status, status);
    assert.equal(changed.data.scheduledFor, undefined, `${status} is not scheduled.`);
    assert.equal(changed.data.approvalVersion, f.scheduled.approvalVersion);
    assert.deepEqual(changed.data.comments, f.scheduled.comments);
    if (status !== "approved") {
      const invalid = await request(f.route, { cookie: f.owner.cookie, method: "PATCH", body: { status: "scheduled", scheduledFor: f.scheduledFor } });
      assert.equal(invalid.status, 409);
    } else {
      const valid = await request(f.route, { cookie: f.owner.cookie, method: "PATCH", body: { status: "scheduled", scheduledFor: f.scheduledFor } });
      assert.equal(valid.status, 200);
      assert.equal(valid.data.scheduledFor, f.scheduledFor);
    }
  }
});

test("draft creation cannot establish a plan; future-date validation and atomic rescheduling remain intact", async () => {
  const f = await fixture();
  const created = await request(`${f.base}/pieces`, { cookie: f.owner.cookie, method: "POST", body: { title: "Borrador con fecha solicitada", scheduledFor: f.scheduledFor } });
  assert.equal(created.status, 201);
  assert.equal(created.data.status, "draft");
  assert.equal(created.data.scheduledFor, undefined);
  for (const scheduledFor of [null, "invalid-date", "2020-01-01T00:00:00.000Z"]) {
    const invalid = await request(f.route, { cookie: f.owner.cookie, method: "PATCH", body: { status: "scheduled", scheduledFor } });
    assert.equal(invalid.status, 400);
    assert.equal(storage.getRecord(f.brand.id, "pieces", f.scheduled.id).scheduledFor, f.scheduledFor);
  }
  const nextDate = new Date(Date.now() + 72 * 3600_000).toISOString();
  const valid = await request(f.route, { cookie: f.owner.cookie, method: "PATCH", body: { scheduledFor: nextDate } });
  assert.equal(valid.status, 200);
  assert.equal(valid.data.id, f.scheduled.id);
  assert.equal(valid.data.status, "scheduled");
  assert.equal(valid.data.scheduledFor, nextDate);
  assert.equal(valid.data.approvalVersion, f.scheduled.approvalVersion);
});

test("published history retains its scheduled date, publication metadata and protection against editorial edits", async () => {
  const f = await fixture();
  const publishedAt = new Date(Date.now() - 3600_000).toISOString();
  const receipt = { provider: "webhook", publishedAt, result: "accepted", statusCode: 202 };
  storage.saveRecord(f.brand.id, "pieces", { ...storage.getRecord(f.brand.id, "pieces", f.scheduled.id), status: "published", publishedAt, publicationReceipt: receipt });
  const result = await request(f.route, { cookie: f.owner.cookie, method: "PATCH", body: { metrics: { views: 200, engagement: 20, leads: 2 } } });
  assert.equal(result.status, 200);
  assert.equal(result.data.status, "published");
  assert.equal(result.data.scheduledFor, f.scheduledFor);
  assert.equal(result.data.publishedAt, publishedAt);
  assert.deepEqual(result.data.publicationReceipt, receipt);
  const blocked = await request(f.route, { cookie: f.owner.cookie, method: "PATCH", body: { status: "draft", script: "Cambio no autorizado." } });
  assert.equal(blocked.status, 409);
  assert.deepEqual(storage.getRecord(f.brand.id, "pieces", f.scheduled.id).publicationReceipt, receipt);
});

test("reviewers and other workspaces cannot cancel a plan; editorial corrections still require the current edit version", async () => {
  const f = await fixture();
  const reviewer = account();
  storage.db.prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,'reviewer')").run(f.brand.id, reviewer.id);
  const outsider = account();
  for (const [user, expected] of [[reviewer, 403], [outsider, 404]]) {
    const denied = await request(f.route, { cookie: user.cookie, method: "PATCH", body: { status: "draft" } });
    assert.equal(denied.status, expected);
  }
  const invalidated = await request(f.route, { cookie: f.owner.cookie, method: "PATCH", body: { status: "draft", script: "Corrección editorial legítima.", expectedEditVersion: f.scheduled.approvalVersion } });
  assert.equal(invalidated.status, 200);
  assert.equal(invalidated.data.scheduledFor, undefined);
  const stale = await request(f.route, { cookie: f.owner.cookie, method: "PATCH", body: { title: "Cambio obsoleto", expectedEditVersion: f.scheduled.approvalVersion } });
  assert.equal(stale.status, 409);
  assert.equal(storage.getRecord(f.brand.id, "pieces", f.scheduled.id).script, "Corrección editorial legítima.");
});

test("calendar eligibility ignores dated legacy drafts, reviews and approvals without deleting their records", async () => {
  const { calendarPlanDate } = await import("../src/lib/calendar-plan.mjs");
  const f = await fixture();
  const dated = ["draft", "review", "approved", "scheduled", "published"].map((status) => storage.saveRecord(f.brand.id, "pieces", {
    ...storage.getRecord(f.brand.id, "pieces", f.scheduled.id), id: randomUUID(), title: `Legacy ${status}`, status,
  }));
  const before = storage.listRecords(f.brand.id, "pieces");
  const state = await request(`${f.base}/state`, { cookie: f.owner.cookie });
  const eligible = state.data.pieces.filter((piece) => calendarPlanDate(piece));
  assert.deepEqual(new Set(eligible.map((piece) => piece.id)), new Set([f.scheduled.id, ...dated.filter((piece) => ["scheduled", "published"].includes(piece.status)).map((piece) => piece.id)]));
  for (const piece of dated) assert.equal(state.data.pieces.find((item) => item.id === piece.id).scheduledFor, f.scheduledFor);
  assert.deepEqual(storage.listRecords(f.brand.id, "pieces"), before, "Reading the calendar must not mutate or discard legacy records.");
});

test("calendar dates require scheduled/published status and a finite date, and preserve old legitimate publications", async () => {
  const { calendarPlanDate } = await import("../src/lib/calendar-plan.mjs");
  for (const status of ["draft", "review", "approved", "unknown", undefined]) {
    assert.equal(calendarPlanDate({ status, scheduledFor: "2030-01-01T10:30:00.000Z" }), null);
  }
  for (const status of ["scheduled", "published"]) {
    for (const scheduledFor of [undefined, "", "invalid", "999999-01-01"]) {
      assert.equal(calendarPlanDate({ status, scheduledFor }), null);
    }
    for (const scheduledFor of ["2020-01-01T10:30:00.000Z", "2030-01-01T10:30:00-06:00"]) {
      assert.equal(calendarPlanDate({ status, scheduledFor }).toISOString(), new Date(scheduledFor).toISOString());
    }
  }
});
