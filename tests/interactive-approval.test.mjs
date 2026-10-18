import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "interactive-approval-"),
);
process.env.DATA_DIR = directory;
for (const key of [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "YOUTUBE_API_KEY",
  "APIFY_API_TOKEN",
])
  process.env[key] = "";
process.env.DISCOVERY_ENABLED = "false";
const storage = await import("../server/db.mjs");
const auth = await import("../server/auth.mjs");
const { createApp } = await import("../server/index.mjs");
let server, origin;

async function request(route, cookie, method = "GET", body) {
  const response = await fetch(`${origin}/api${route}`, {
    method,
    headers: { cookie, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json() };
}

function account() {
  const user = auth.createUser({
    name: "Equipo aprobación sintética",
    email: `${randomUUID()}@example.invalid`,
    passwordHash: "fixture-only",
  });
  const token = randomUUID();
  storage.db
    .prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    )
    .run(auth.tokenHash(token), user.id, Date.now() + 600_000);
  return { ...user, cookie: `radar_session=${token}` };
}

async function fixture(status) {
  const owner = account(),
    editor = account(),
    reviewer = account();
  const brand = storage.saveBrand({ name: "QA aprobación", audience: [] });
  for (const [role, user] of Object.entries({ owner, editor, reviewer }))
    storage.db
      .prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?)")
      .run(brand.id, user.id, role);
  const created = await request(
    `/brands/${brand.id}/pieces`,
    owner.cookie,
    "POST",
    {
      title: "Pieza sintética aprobada",
      script: "Contenido revisado por el equipo.",
    },
  );
  assert.equal(created.status, 201);
  const route = `/brands/${brand.id}/pieces/${created.data.id}`;
  const review = await request(route, editor.cookie, "PATCH", {
    status: "review",
  });
  assert.equal(review.status, 200);
  const approved = await request(`${route}/review`, reviewer.cookie, "POST", {
    action: "approve",
    expectedApprovalVersion: review.data.approvalVersion,
  });
  assert.equal(approved.status, 200);
  const scheduledFor = new Date(Date.now() + 48 * 3600_000).toISOString();
  const current =
    status === "scheduled"
      ? await request(route, editor.cookie, "PATCH", { status, scheduledFor })
      : approved;
  assert.equal(current.status, 200);
  return {
    brand,
    route,
    owner,
    editor,
    reviewer,
    current: current.data,
    scheduledFor,
  };
}

before(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
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

for (const status of ["approved", "scheduled"]) {
  test(`${status}: changing assignee cannot retain approval or mutate storage`, async () => {
    const f = await fixture(status);
    const before = storage.getRecord(f.brand.id, "pieces", f.current.id);
    const response = await request(f.route, f.editor.cookie, "PATCH", {
      assignee: f.editor.id,
      expectedEditVersion: f.current.approvalVersion,
    });
    assert.equal(
      response.status,
      409,
      "An unreviewed assignment must not retain approved/scheduled status.",
    );
    assert.deepEqual(
      storage.getRecord(f.brand.id, "pieces", f.current.id),
      before,
    );
    const state = await request(
      `/brands/${f.brand.id}/state`,
      f.reviewer.cookie,
    );
    assert.equal(state.status, 200);
    assert.deepEqual(
      state.data.pieces.find((piece) => piece.id === f.current.id),
      f.current,
    );
    const noChange = await request(f.route, f.editor.cookie, "PATCH", {
      assignee: "",
      expectedEditVersion: f.current.approvalVersion,
    });
    assert.equal(
      noChange.status,
      200,
      "Keeping an unassigned piece unassigned does not change approved content.",
    );
    assert.equal(noChange.data.status, status);
    assert.equal(noChange.data.approvalVersion, f.current.approvalVersion);
  });

  for (const nextStatus of ["draft", "review"]) {
    test(`${status} to ${nextStatus}: reassignment cancels the plan and requires approval of the new version`, async () => {
      const f = await fixture(status);
      const changed = await request(f.route, f.editor.cookie, "PATCH", {
        assignee: f.editor.id,
        status: nextStatus,
        expectedEditVersion: f.current.approvalVersion,
      });
      assert.equal(changed.status, 200);
      assert.equal(changed.data.id, f.current.id);
      assert.equal(changed.data.assignee, f.editor.id);
      assert.equal(changed.data.status, nextStatus);
      assert.equal(changed.data.scheduledFor, undefined);
      assert.notEqual(changed.data.approvalVersion, f.current.approvalVersion);
      assert.equal(changed.data.script, f.current.script);
      assert.deepEqual(changed.data.comments, f.current.comments);
      const unsanctionedPlan = await request(
        f.route,
        f.editor.cookie,
        "PATCH",
        {
          status: "scheduled",
          scheduledFor: f.scheduledFor,
        },
      );
      assert.equal(unsanctionedPlan.status, 409);
      if (nextStatus === "draft") {
        const review = await request(f.route, f.editor.cookie, "PATCH", {
          status: "review",
        });
        assert.equal(review.status, 200);
      }
      const beforeStale = storage.getRecord(f.brand.id, "pieces", f.current.id);
      const stale = await request(
        `${f.route}/review`,
        f.reviewer.cookie,
        "POST",
        {
          action: "approve",
          expectedApprovalVersion: f.current.approvalVersion,
        },
      );
      assert.equal(stale.status, 409);
      assert.deepEqual(
        storage.getRecord(f.brand.id, "pieces", f.current.id),
        beforeStale,
      );
      const fresh = await request(
        `${f.route}/review`,
        f.reviewer.cookie,
        "POST",
        {
          action: "approve",
          expectedApprovalVersion: changed.data.approvalVersion,
        },
      );
      assert.equal(fresh.status, 200);
      assert.equal(fresh.data.status, "approved");
      assert.equal(fresh.data.assignee, f.editor.id);
      assert.equal(fresh.data.approvalVersion, changed.data.approvalVersion);
      const planned = await request(f.route, f.editor.cookie, "PATCH", {
        status: "scheduled",
        scheduledFor: f.scheduledFor,
      });
      assert.equal(planned.status, 200);
      assert.equal(planned.data.approvalVersion, fresh.data.approvalVersion);
    });
  }
}
