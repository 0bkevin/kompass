import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-community-"));
process.env.DATA_DIR = dataDir;
const { db, saveBrand, saveRecord, getRecord, getBrand, listRecords } =
  await import("../server/db.mjs");
const { createUser, tokenHash } = await import("../server/auth.mjs");
const { createCommunityRouter } = await import("../server/community.mjs");

let owner;
let editor;
let reviewer;
let outsider;
let server;
let origin;
let clock = 1_800_000_000_000;

function account(role = "owner", brand, audience) {
  const user = createUser({
    name: "Equipo",
    email: `${randomUUID()}@example.test`,
    passwordHash: "test-only",
  });
  brand ||= saveBrand({
    name: "Empresa del equipo",
    audience: audience ?? [
      { id: randomUUID(), name: "Equipos comerciales" },
      { id: randomUUID(), name: "Responsables de formación" },
    ],
  });
  db.prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?)").run(
    brand.id,
    user.id,
    role,
  );
  const token = randomBytes(32).toString("base64url");
  db.prepare(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
  ).run(tokenHash(token), user.id, Date.now() + 3_600_000);
  return { user, brand, cookie: `radar_session=${token}` };
}

async function api(
  route,
  { account: session = owner, body, method = body ? "POST" : "GET" } = {},
) {
  const response = await fetch(`${origin}/api${route}`, {
    method,
    headers: {
      ...(session ? { cookie: session.cookie } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}

async function createPoll(fields = {}, session = owner) {
  const result = await api(`/brands/${session.brand.id}/community-polls`, {
    account: session,
    body: {
      question: "¿Qué necesitas resolver con IA?",
      options: ["Mejorar ventas", "Formar al equipo"],
      ...fields,
    },
  });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return result.data;
}

const vote = (
  poll,
  option = poll.options[0],
  group = poll.groups[0],
  extra = {},
) =>
  api(`/community/${poll.token}/responses`, {
    account: null,
    body: { optionId: option.id, segmentId: group.id, ...extra },
  });

before(async () => {
  owner = account();
  editor = account("editor", owner.brand);
  reviewer = account("reviewer", owner.brand);
  outsider = account();
  const app = express();
  app.use(express.json());
  app.use("/api", createCommunityRouter({ now: () => clock }));
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
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("teams create public questions with random tokens and declared group snapshots", async () => {
  const poll = await createPoll({}, editor);
  assert.match(poll.token, /^[a-z\d_-]{43}$/i);
  assert.equal(poll.active, true);
  assert.equal(poll.totalResponses, 0);
  assert.deepEqual(poll.results, []);
  assert.deepEqual(poll.groups, owner.brand.audience);
  assert.equal(poll.publicPath, `/community/${poll.token}`);
  const publicResult = await api(`/community/${poll.token}`, { account: null });
  assert.equal(publicResult.status, 200);
  assert.equal(publicResult.data.companyName, owner.brand.name);
  assert.match(publicResult.data.notice, /No son personas únicas/);
  assert.equal(
    (
      await api(`/brands/${owner.brand.id}/community-polls`, {
        account: reviewer,
      })
    ).status,
    200,
  );
});

test("creation enforces membership, editing roles, audience and content bounds", async () => {
  const route = `/brands/${owner.brand.id}/community-polls`;
  const body = {
    question: "¿Qué necesitas?",
    options: ["Ventas", "Formación"],
  };
  assert.equal((await api(route, { account: null, body })).status, 401);
  assert.equal((await api(route, { account: outsider, body })).status, 404);
  assert.equal((await api(route, { account: reviewer, body })).status, 403);
  for (const invalid of [
    { question: "" },
    { question: "x".repeat(301) },
    { options: ["Ventas"] },
    { options: Array.from({ length: 7 }, (_, index) => `Tema ${index}`) },
    { options: ["Ventas", "ventas"] },
    { options: ["Ventas", "x".repeat(121)] },
    { options: ["Ventas", "contacto@example.com"] },
    { question: "Escribe al +58 412 1234567" },
    { segmentIds: [] },
    { segmentIds: [outsider.brand.audience[0].id] },
    { segmentIds: [owner.brand.audience[0].id, owner.brand.audience[0].id] },
    { email: "persona@example.com" },
  ])
    assert.equal(
      (await api(route, { body: { ...body, ...invalid } })).status,
      400,
    );
  const empty = account("owner", undefined, []);
  assert.equal(
    (
      await api(`/brands/${empty.brand.id}/community-polls`, {
        account: empty,
        body,
      })
    ).status,
    400,
  );
  const selected = await createPoll({
    segmentIds: [owner.brand.audience[1].id],
  });
  assert.deepEqual(selected.groups, [owner.brand.audience[1]]);
});

test("counts stay aggregate and group results remain hidden below five voluntary responses", async () => {
  const poll = await createPoll();
  for (let index = 0; index < 4; index++) {
    const result = await vote(poll);
    assert.equal(result.status, 200);
    assert.equal(result.data.totalResponses, index + 1);
    assert.deepEqual(result.data.results, []);
  }
  for (let index = 0; index < 4; index++)
    assert.equal(
      (await vote(poll, poll.options[1], poll.groups[1])).status,
      200,
    );
  const hidden = await api(`/community/${poll.token}`, { account: null });
  assert.equal(hidden.data.poll.totalResponses, 8);
  assert.deepEqual(hidden.data.poll.results, []);
  assert.deepEqual(
    listRecords(owner.brand.id, "audienceSignals").filter(
      (item) => item.communityPollId === poll.id,
    ),
    [],
  );
  const fifth = await vote(poll);
  assert.equal(fifth.data.totalResponses, 9);
  assert.equal(fifth.data.results.length, 2);
  assert.ok(
    fifth.data.results.every(
      (item) => item.segmentId === poll.groups[0].id && item.sampleSize === 5,
    ),
  );
  assert.deepEqual(
    fifth.data.results.map((item) => item.count),
    [5, 0],
  );
  const signals = listRecords(owner.brand.id, "audienceSignals").filter(
    (item) => item.communityPollId === poll.id,
  );
  assert.equal(signals.length, 1);
  assert.equal(signals[0].sampleSize, 5);
  assert.equal(signals[0].sourceType, "community");
  assert.equal(signals[0].aggregate, true);
  assert.equal(signals[0].sourceUrl, poll.publicPath);
  assert.match(signals[0].note, /5 respuestas de 5/);
  assert.match(signals[0].note, /no son personas únicas/);
  assert.match(signals[0].note, /no representa a toda la audiencia/);

  const sixth = await vote(poll, poll.options[1]);
  assert.equal(sixth.status, 200);
  const updated = listRecords(owner.brand.id, "audienceSignals").filter(
    (item) => item.communityPollId === poll.id,
  );
  assert.equal(updated.length, 2);
  assert.ok(updated.every((item) => item.sampleSize === 6));
  assert.equal(
    updated.find((item) => item.topic === poll.options[0].label).id,
    signals[0].id,
  );
  assert.match(
    updated.find((item) => item.topic === poll.options[1].label).note,
    /1 respuesta de 6/,
  );

  const record = getRecord(owner.brand.id, "communityPolls", poll.id);
  assert.ok(Array.isArray(record.counts));
  assert.ok(
    record.counts.every(
      (item) =>
        Object.keys(item).sort().join(",") === "count,optionId,segmentId",
    ),
  );
  assert.doesNotMatch(
    JSON.stringify(record),
    /(?:"(?:responses|email|ip|participantId|userAgent|fingerprint|respondentId)"|127\.0\.0\.1|radar_session)/i,
  );
});

test("anonymous payloads accept only known option and group identifiers", async () => {
  const poll = await createPoll();
  const foreign = await createPoll({}, outsider);
  for (const extra of [
    { email: "person@example.com" },
    { name: "Persona" },
    { ip: "127.0.0.1" },
    { userId: randomUUID() },
    { notes: "comentario" },
    { sourceType: "community" },
  ])
    assert.equal((await vote(poll, undefined, undefined, extra)).status, 400);
  assert.equal((await vote(poll, foreign.options[0])).status, 400);
  assert.equal(
    (await vote(poll, poll.options[0], foreign.groups[0])).status,
    400,
  );
  assert.equal(
    (
      await api(`/community/${poll.token}/responses`, {
        account: null,
        body: { optionId: poll.options[0].id },
      })
    ).status,
    400,
  );
  assert.equal(
    (await api("/community/not-a-token", { account: null })).status,
    404,
  );
  assert.equal(
    getRecord(owner.brand.id, "communityPolls", poll.id).counts.length,
    0,
  );
});

test("pause and reopen protect closed polls and preserve aggregated counts", async () => {
  const poll = await createPoll();
  assert.equal((await vote(poll)).status, 200);
  const route = `/brands/${owner.brand.id}/community-polls/${poll.id}`;
  assert.equal(
    (
      await api(route, {
        account: reviewer,
        method: "PATCH",
        body: { active: false },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await api(`/brands/${outsider.brand.id}/community-polls/${poll.id}`, {
        account: outsider,
        method: "PATCH",
        body: { active: false },
      })
    ).status,
    404,
  );
  assert.equal(
    (await api(route, { method: "PATCH", body: { active: "false" } })).status,
    400,
  );
  assert.equal(
    (
      await api(route, {
        method: "PATCH",
        body: { active: false, options: [] },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api(route, {
        account: editor,
        method: "PATCH",
        body: { active: false },
      })
    ).status,
    200,
  );
  assert.equal((await vote(poll)).status, 409);
  const paused = await api(`/community/${poll.token}`, { account: null });
  assert.equal(paused.data.poll.active, false);
  assert.equal(paused.data.poll.totalResponses, 1);
  assert.equal(
    (await api(route, { method: "PATCH", body: { active: true } })).status,
    200,
  );
  assert.equal((await vote(poll)).data.totalResponses, 2);
});

test("concurrent submissions increment counters without overwriting responses", async () => {
  const poll = await createPoll();
  const replies = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      vote(poll, poll.options[index % 2]),
    ),
  );
  assert.ok(replies.every((item) => item.status === 200));
  const record = getRecord(owner.brand.id, "communityPolls", poll.id);
  assert.equal(
    record.counts.reduce((sum, item) => sum + item.count, 0),
    10,
  );
  assert.deepEqual(
    record.counts.map((item) => item.count),
    [5, 5],
  );
  const signals = listRecords(owner.brand.id, "audienceSignals").filter(
    (item) => item.communityPollId === poll.id,
  );
  assert.equal(signals.length, 2);
  assert.ok(signals.every((item) => item.sampleSize === 10));
});

test("deletion removes derived signals without touching another workspace or editorial evidence", async () => {
  const poll = await createPoll();
  for (let index = 0; index < 5; index++)
    assert.equal((await vote(poll)).status, 200);
  const manual = saveRecord(owner.brand.id, "audienceSignals", {
    segmentId: owner.brand.audience[0].id,
    topic: "Necesidad editorial",
    note: "Evidencia de equipo",
    sourceType: "editorial",
  });
  const foreign = await createPoll({}, outsider);
  const route = `/brands/${owner.brand.id}/community-polls/${poll.id}`;
  assert.equal(
    (await api(route, { account: reviewer, method: "DELETE" })).status,
    403,
  );
  assert.equal(
    (
      await api(`/brands/${outsider.brand.id}/community-polls/${poll.id}`, {
        account: outsider,
        method: "DELETE",
      })
    ).status,
    404,
  );
  assert.equal(
    (await api(route, { account: editor, method: "DELETE" })).status,
    200,
  );
  assert.equal(getRecord(owner.brand.id, "communityPolls", poll.id), null);
  assert.ok(
    !listRecords(owner.brand.id, "audienceSignals").some(
      (item) => item.communityPollId === poll.id,
    ),
  );
  assert.ok(getRecord(owner.brand.id, "audienceSignals", manual.id));
  assert.ok(getRecord(outsider.brand.id, "communityPolls", foreign.id));
  assert.equal(
    (await api(`/community/${poll.token}`, { account: null })).status,
    404,
  );
  assert.equal((await vote(poll)).status, 404);
});

test("removed memberships and deleted groups cannot create new data", async () => {
  const temporary = account();
  const poll = await createPoll({}, temporary);
  db.prepare("DELETE FROM members WHERE brand_id=? AND user_id=?").run(
    temporary.brand.id,
    temporary.user.id,
  );
  assert.equal(
    (
      await api(`/brands/${temporary.brand.id}/community-polls`, {
        account: temporary,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await api(`/brands/${temporary.brand.id}/community-polls/${poll.id}`, {
        account: temporary,
        method: "PATCH",
        body: { active: false },
      })
    ).status,
    404,
  );
  saveBrand({ ...getBrand(temporary.brand.id), audience: [] });
  assert.equal((await vote(poll)).status, 409);
  assert.deepEqual(
    getRecord(temporary.brand.id, "communityPolls", poll.id).counts,
    [],
  );
});

test("anonymous rate limits recover after expiry without persisting participant identifiers", async () => {
  clock += 11 * 60_000;
  const poll = await createPoll();
  for (let index = 0; index < 60; index++)
    assert.equal((await vote(poll)).status, 200);
  assert.equal((await vote(poll)).status, 429);
  assert.equal(
    getRecord(owner.brand.id, "communityPolls", poll.id).counts[0].count,
    60,
  );
  clock += 11 * 60_000;
  assert.equal((await vote(poll)).status, 200);
  const rows = db
    .prepare("SELECT data FROM records WHERE brand_id=?")
    .all(owner.brand.id);
  assert.doesNotMatch(
    JSON.stringify(rows),
    /127\.0\.0\.1|"participantId"|"ip"|"respondentId"|"userAgent"/,
  );
});
