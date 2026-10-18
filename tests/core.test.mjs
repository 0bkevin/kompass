import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), ".radar-core-"));
process.env.DATA_DIR = temp;
process.env.OPENAI_API_KEY = "";
let server, origin, dbModule;
async function request(
  route,
  { method = "GET", body, cookie, headers = {} } = {},
) {
  const result = await fetch(`${origin}/api${route}`, {
    method,
    headers: {
      ...(body && !(body instanceof FormData)
        ? { "content-type": "application/json" }
        : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body
      ? body instanceof FormData
        ? body
        : JSON.stringify(body)
      : undefined,
  });
  const data = result.headers.get("content-type")?.includes("application/json")
    ? await result.json()
    : await result.text();
  return {
    status: result.status,
    data,
    headers: result.headers,
    cookie: result.headers.get("set-cookie")?.split(";")[0],
  };
}
async function account(prefix = "owner") {
  const reply = await request("/auth/register", {
    method: "POST",
    body: {
      name: "Equipo " + prefix,
      email: `${prefix}-${crypto.randomUUID()}@example.com`,
      password: "secret-password-30x",
    },
  });
  assert.equal(reply.status, 201, JSON.stringify(reply.data));
  return reply;
}
async function brand(cookie, name = "Marca de prueba") {
  const reply = await request("/brands", {
    method: "POST",
    cookie,
    body: {
      name,
      industry: "Educación",
      audience: [
        {
          name: "Gerentes",
          role: "Dirección",
          stage: "Exploración",
          needs: "Aplicar IA con criterio",
        },
      ],
    },
  });
  assert.equal(reply.status, 201, JSON.stringify(reply.data));
  return reply.data;
}
let owner, outsider, workspace;
before(async () => {
  const { createApp } = await import("../server/index.mjs");
  dbModule = await import("../server/db.mjs");
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  owner = await account("owner");
  outsider = await account("outsider");
  workspace = await brand(owner.cookie);
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  dbModule.db.close();
  fs.rmSync(temp, { recursive: true, force: true });
});

test("registration, session, password validation, login and logout persist safely", async () => {
  const registration = await request("/auth/register", {
    method: "POST",
    body: {
      name: "Ana",
      email: "ana@example.com",
      password: "a-long-password-30x",
    },
  });
  assert.equal(registration.status, 201);
  assert.match(registration.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(registration.headers.get("set-cookie"), /SameSite=Lax/i);
  assert.equal(registration.data.user.email, "ana@example.com");
  assert.equal(registration.data.user.password_hash, undefined);
  const session = await request("/session", { cookie: registration.cookie });
  assert.equal(session.data.user.id, registration.data.user.id);
  assert.equal(
    (
      await request("/auth/login", {
        method: "POST",
        body: { email: "ana@example.com", password: "wrong" },
      })
    ).status,
    401,
  );
  const stored = dbModule.db
    .prepare("SELECT password_hash FROM users WHERE id=?")
    .get(registration.data.user.id).password_hash;
  assert.ok(!stored.includes("a-long-password-30x"));
  assert.equal(
    (
      await request("/auth/register", {
        method: "POST",
        body: { name: "Ana", email: "invalid", password: "123" },
      })
    ).status,
    400,
  );
  await request("/auth/logout", {
    method: "POST",
    cookie: registration.cookie,
  });
  assert.equal(
    (await request("/session", { cookie: registration.cookie })).data.user,
    null,
  );
  const login = await request("/auth/login", {
    method: "POST",
    body: { email: "ana@example.com", password: "a-long-password-30x" },
  });
  assert.equal(login.status, 200);
  assert.equal(
    (await request("/session", { cookie: login.cookie })).data.user.id,
    registration.data.user.id,
  );
});

test("brands start empty and users cannot read or mutate other brands", async () => {
  const state = await request(`/brands/${workspace.id}/state`, {
    cookie: owner.cookie,
  });
  assert.equal(state.status, 200);
  assert.equal(state.data.references.length, 0);
  assert.equal(state.data.pieces.length, 0);
  assert.ok(
    state.data.sources.some((source) =>
      source.url?.includes("trends.google.com"),
    ),
  );
  assert.equal(
    state.data.sources.some((source) => source.url?.includes("geo=MX")),
    false,
    "Latinoamérica does not imply Mexico",
  );
  const mxBrand = await request("/brands", {
    method: "POST",
    cookie: owner.cookie,
    body: { name: "Marca mexicana", market: "México" },
  });
  const mxState = await request(`/brands/${mxBrand.data.id}/state`, {
    cookie: owner.cookie,
  });
  assert.ok(
    mxState.data.sources.some((source) => source.url?.includes("geo=MX")),
  );
  assert.equal((await request(`/brands/${workspace.id}/state`)).status, 401);
  assert.equal(
    (
      await request(`/brands/${workspace.id}/state`, {
        cookie: outsider.cookie,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`/brands/${workspace.id}/references`, {
        method: "POST",
        cookie: outsider.cookie,
        body: { text: "Intrusión" },
      })
    ).status,
    404,
  );
  const second = await brand(owner.cookie, "Segunda marca");
  const captured = await request(`/brands/${workspace.id}/references`, {
    method: "POST",
    cookie: owner.cookie,
    body: {
      text: "Referencia propia",
      brandId: second.id,
      id: "forged",
      analysis: { fake: true },
      trend: { metrics: { score: 9000 } },
    },
  });
  assert.equal(captured.status, 201);
  assert.notEqual(captured.data.id, "forged");
  assert.equal(captured.data.analysis, undefined);
  assert.equal(captured.data.trend, undefined);
  assert.equal(
    (
      await request(`/brands/${second.id}/references/${captured.data.id}`, {
        method: "PATCH",
        cookie: owner.cookie,
        body: { title: "Cruzar marcas" },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`/brands/${second.id}/pieces`, {
        method: "POST",
        cookie: owner.cookie,
        body: { title: "Pieza", referenceId: captured.data.id },
      })
    ).status,
    400,
  );
});

test("deleting an audience used by approved or published content preserves its links and version", async () => {
  const target = await brand(owner.cookie, "Segmentos protegidos");
  const originalAudience = target.audience[0];
  const usedAudience = {
    id: crypto.randomUUID(),
    name: "Audiencia vinculada",
    role: "Dirección",
    stage: "Implementando",
    needs: "Comparar resultados",
  };
  const unusedAudience = {
    id: crypto.randomUUID(),
    name: "Audiencia libre",
    role: "Operaciones",
    stage: "Explorando",
    needs: "Entender opciones",
  };
  const configured = await request(`/brands/${target.id}`, {
    method: "PATCH",
    cookie: owner.cookie,
    body: { audience: [originalAudience, usedAudience, unusedAudience] },
  });
  assert.equal(configured.status, 200, JSON.stringify(configured.data));

  const idea = await request(`/brands/${target.id}/ideas`, {
    method: "POST",
    cookie: owner.cookie,
    body: {
      title: "Idea vinculada",
      angle: "Probar una mejora con el equipo",
      segmentId: usedAudience.id,
      status: "approved",
    },
  });
  assert.equal(idea.status, 201, JSON.stringify(idea.data));

  const piece = await request(`/brands/${target.id}/pieces`, {
    method: "POST",
    cookie: owner.cookie,
    body: { title: "Pieza vinculada", segmentId: usedAudience.id },
  });
  assert.equal(piece.status, 201, JSON.stringify(piece.data));
  const submitted = await request(
    `/brands/${target.id}/pieces/${piece.data.id}`,
    {
      method: "PATCH",
      cookie: owner.cookie,
      body: { status: "review" },
    },
  );
  assert.equal(submitted.status, 200, JSON.stringify(submitted.data));
  const approved = await request(
    `/brands/${target.id}/pieces/${piece.data.id}/review`,
    {
      method: "POST",
      cookie: owner.cookie,
      body: {
        action: "approve",
        comment: "Aprobada para probar retención del segmento.",
        expectedApprovalVersion: submitted.data.approvalVersion,
      },
    },
  );
  assert.equal(approved.status, 200, JSON.stringify(approved.data));
  assert.equal(approved.data.status, "approved");

  const audienceWithoutUsed = [originalAudience, unusedAudience];
  const blocked = await request(`/brands/${target.id}`, {
    method: "PATCH",
    cookie: owner.cookie,
    body: { audience: audienceWithoutUsed },
  });
  assert.equal(blocked.status, 409, JSON.stringify(blocked.data));
  assert.match(blocked.data.error, /Reasigna.*antes de eliminarla/);
  let state = await request(`/brands/${target.id}/state`, {
    cookie: owner.cookie,
  });
  assert.equal(state.status, 200);
  assert.ok(state.data.brand.audience.some((segment) => segment.id === usedAudience.id));
  const approvedAfterBlock = state.data.pieces.find(
    (item) => item.id === piece.data.id,
  );
  assert.equal(approvedAfterBlock.status, "approved");
  assert.equal(approvedAfterBlock.segmentId, usedAudience.id);
  assert.equal(
    approvedAfterBlock.approvalVersion,
    approved.data.approvalVersion,
  );
  assert.equal(
    state.data.ideas.find((item) => item.id === idea.data.id).segmentId,
    usedAudience.id,
  );

  // A persisted published record is a local fixture; this test does not call a provider.
  const storedPiece = dbModule.getRecord(target.id, "pieces", piece.data.id);
  dbModule.saveRecord(target.id, "pieces", {
    ...storedPiece,
    status: "published",
    publishedAt: new Date().toISOString(),
  });
  const blockedPublished = await request(`/brands/${target.id}`, {
    method: "PATCH",
    cookie: owner.cookie,
    body: { audience: audienceWithoutUsed },
  });
  assert.equal(blockedPublished.status, 409, JSON.stringify(blockedPublished.data));
  state = await request(`/brands/${target.id}/state`, {
    cookie: owner.cookie,
  });
  const publishedAfterBlock = state.data.pieces.find(
    (item) => item.id === piece.data.id,
  );
  assert.equal(publishedAfterBlock.status, "published");
  assert.equal(publishedAfterBlock.segmentId, usedAudience.id);
  assert.equal(
    publishedAfterBlock.approvalVersion,
    approved.data.approvalVersion,
  );

  const deleteUnused = await request(`/brands/${target.id}`, {
    method: "PATCH",
    cookie: owner.cookie,
    body: { audience: [originalAudience, usedAudience] },
  });
  assert.equal(deleteUnused.status, 200, JSON.stringify(deleteUnused.data));
  assert.equal(
    deleteUnused.data.audience.some(
      (segment) => segment.id === unusedAudience.id,
    ),
    false,
  );
});

test("deleting an audience used only by an idea is rejected", async () => {
  const target = await brand(owner.cookie, "Idea con segmento");
  const audience = target.audience[0];
  const idea = await request(`/brands/${target.id}/ideas`, {
    method: "POST",
    cookie: owner.cookie,
    body: {
      title: "Idea protegida",
      angle: "Una idea sin pieza",
      segmentId: audience.id,
      status: "approved",
    },
  });
  assert.equal(idea.status, 201, JSON.stringify(idea.data));

  const blocked = await request(`/brands/${target.id}`, {
    method: "PATCH",
    cookie: owner.cookie,
    body: { audience: [] },
  });
  assert.equal(blocked.status, 409, JSON.stringify(blocked.data));
  assert.match(blocked.data.error, /1 idea/);
  const state = await request(`/brands/${target.id}/state`, {
    cookie: owner.cookie,
  });
  assert.equal(state.status, 200);
  assert.ok(state.data.brand.audience.some((segment) => segment.id === audience.id));
  assert.equal(state.data.ideas.length, 1);
  assert.equal(state.data.ideas[0].id, idea.data.id);
  assert.equal(state.data.ideas[0].segmentId, audience.id);
});

test("capture → analysis → draft → review → approval → schedule with no fabricated publication", async () => {
  const base = `/brands/${workspace.id}`;
  const capture = await request(`${base}/references`, {
    method: "POST",
    cookie: owner.cookie,
    body: {
      title: "How small teams can use AI",
      text: "How small teams can use AI to improve their operations. Start with one recurring task and measure quality.",
      source: "Manual",
      language: "Inglés",
    },
  });
  assert.equal(capture.status, 201);
  const analyzed = await request(`${base}/analyze`, {
    method: "POST",
    cookie: owner.cookie,
    body: { referenceId: capture.data.id },
  });
  assert.equal(analyzed.status, 200, JSON.stringify(analyzed.data));
  assert.equal(analyzed.data.status, "analyzed");
  assert.equal(analyzed.data.analysis.engine, "heuristic");
  assert.equal(analyzed.data.analysis.confidence, "low");
  const draft = await request(`${base}/draft`, {
    method: "POST",
    cookie: owner.cookie,
    body: {
      referenceId: capture.data.id,
      format: "post",
      channel: "linkedin",
      segmentId: workspace.audience[0].id,
    },
  });
  assert.equal(draft.status, 200, JSON.stringify(draft.data));
  assert.equal(draft.data.status, "draft");
  assert.ok(
    draft.data.script.includes("Exploración") || draft.data.script.length > 100,
  );
  const pieceRoute = `${base}/pieces/${draft.data.id}`;
  assert.equal(
    (
      await request(pieceRoute, {
        method: "PATCH",
        cookie: owner.cookie,
        body: { status: "published" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(pieceRoute, {
        method: "PATCH",
        cookie: owner.cookie,
        body: { status: "approved" },
      })
    ).status,
    409,
  );
  const submitted = await request(pieceRoute, {
    method: "PATCH",
    cookie: owner.cookie,
    body: { status: "review", script: "Guion revisado por un humano." },
  });
  assert.equal(submitted.status, 200);
  const approved = await request(`${pieceRoute}/review`, {
    method: "POST",
    cookie: owner.cookie,
    body: {
      action: "approve",
      comment: "Revisado y aprobado.",
      expectedApprovalVersion: submitted.data.approvalVersion,
    },
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.data.status, "approved");
  assert.equal(
    (
      await request(pieceRoute, {
        method: "PATCH",
        cookie: owner.cookie,
        body: { script: "Cambiar contenido ya aprobado" },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(pieceRoute, {
        method: "PATCH",
        cookie: owner.cookie,
        body: { status: "scheduled", scheduledFor: "2020-01-01" },
      })
    ).status,
    400,
  );
  const scheduled = await request(pieceRoute, {
    method: "PATCH",
    cookie: owner.cookie,
    body: {
      status: "scheduled",
      scheduledFor: new Date(Date.now() + 86400000).toISOString(),
    },
  });
  assert.equal(scheduled.status, 200);
  const published = await request(`${pieceRoute}/publish`, {
    method: "POST",
    cookie: owner.cookie,
    body: {},
  });
  assert.equal(published.status, 409, JSON.stringify(published.data));
  const stored = dbModule.getRecord(workspace.id, "pieces", draft.data.id);
  assert.equal(stored.status, "scheduled");
  assert.equal(stored.publishedAt, undefined);
  for (const status of ["sending", "uncertain"]) {
    dbModule.setSecret(workspace.id, `publication:${draft.data.id}`, {
      status,
    });
    assert.equal(
      (
        await request(pieceRoute, {
          method: "PATCH",
          cookie: owner.cookie,
          body: { status: "draft", script: "Cambio durante envío" },
        })
      ).status,
      409,
    );
    assert.equal(
      (await request(pieceRoute, { method: "DELETE", cookie: owner.cookie }))
        .status,
      409,
    );
  }
  dbModule.setSecret(workspace.id, `publication:${draft.data.id}`, null);
  const changedReference = await request(
    `${base}/references/${capture.data.id}`,
    {
      method: "PATCH",
      cookie: owner.cookie,
      body: { text: "Un contenido completamente diferente." },
    },
  );
  assert.equal(changedReference.status, 200);
  assert.equal(changedReference.data.status, "new");
  assert.equal(changedReference.data.analysis, undefined);
});

test("private uploads validate formats, hide storage paths and enforce brand isolation", async () => {
  const file = new FormData();
  file.append(
    "file",
    new Blob(
      [
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0WQAAAAASUVORK5CYII=",
          "base64",
        ),
      ],
      { type: "image/png" },
    ),
    "pixel.png",
  );
  const uploaded = await request(`/brands/${workspace.id}/assets`, {
    method: "POST",
    cookie: owner.cookie,
    body: file,
  });
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
  assert.equal(uploaded.data.mimeType, "image/png");
  assert.equal(uploaded.data.storageName, undefined);
  assert.equal(uploaded.data.filePath, undefined);
  assert.equal((await fetch(origin + uploaded.data.url)).status, 401);
  assert.equal(
    (
      await fetch(origin + uploaded.data.url, {
        headers: { cookie: outsider.cookie },
      })
    ).status,
    404,
  );
  const read = await fetch(origin + uploaded.data.url, {
    headers: { cookie: owner.cookie },
  });
  assert.equal(read.status, 200);
  assert.equal(read.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await read.arrayBuffer()).byteLength, uploaded.data.size);
  const malicious = new FormData();
  malicious.append(
    "file",
    new Blob(["<script>alert(1)</script>"], { type: "image/png" }),
    "fake.png",
  );
  assert.equal(
    (
      await request(`/brands/${workspace.id}/assets`, {
        method: "POST",
        cookie: owner.cookie,
        body: malicious,
      })
    ).status,
    400,
  );
  const capture = await request(`/brands/${workspace.id}/references`, {
    method: "POST",
    cookie: owner.cookie,
    body: { title: "Captura", assetId: uploaded.data.id },
  });
  assert.equal(capture.status, 201);
  const deleted = await request(
    `/brands/${workspace.id}/assets/${uploaded.data.id}`,
    { method: "DELETE", cookie: owner.cookie },
  );
  assert.equal(deleted.status, 200);
  assert.equal(
    (
      await fetch(origin + uploaded.data.url, {
        headers: { cookie: owner.cookie },
      })
    ).status,
    404,
  );
});

test("invitation acceptance is single-use; reviewer can review/comment but cannot edit", async () => {
  const reviewer = await account("reviewer");
  const invitation = await request(`/brands/${workspace.id}/invitations`, {
    method: "POST",
    cookie: owner.cookie,
    body: { role: "reviewer" },
  });
  assert.equal(invitation.status, 201);
  const accepted = await request(
    `/invitations/${invitation.data.token}/accept`,
    { method: "POST", cookie: reviewer.cookie, body: {} },
  );
  assert.equal(accepted.status, 200);
  assert.equal(accepted.data.role, "reviewer");
  assert.equal(
    (
      await request(`/invitations/${invitation.data.token}/accept`, {
        method: "POST",
        cookie: outsider.cookie,
        body: {},
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`/brands/${workspace.id}/state`, {
        cookie: reviewer.cookie,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/brands/${workspace.id}/references`, {
        method: "POST",
        cookie: reviewer.cookie,
        body: { text: "No autorizado" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/brands/${workspace.id}/analyze`, {
        method: "POST",
        cookie: reviewer.cookie,
        body: {},
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/brands/${workspace.id}/draft`, {
        method: "POST",
        cookie: reviewer.cookie,
        body: {},
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/brands/${workspace.id}/integrations`, {
        cookie: reviewer.cookie,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/brands/${workspace.id}/integrations`, {
        method: "PUT",
        cookie: reviewer.cookie,
        body: {},
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/brands/${workspace.id}/assets`, {
        method: "POST",
        cookie: reviewer.cookie,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/brands/${workspace.id}/invitations`, {
        method: "POST",
        cookie: reviewer.cookie,
        body: { role: "owner" },
      })
    ).status,
    403,
  );
  const piece = await request(`/brands/${workspace.id}/pieces`, {
    method: "POST",
    cookie: owner.cookie,
    body: {
      title: "Pieza para revisión",
      script: "Contenido de prueba.",
      status: "review",
    },
  });
  assert.equal(piece.status, 201);
  assert.equal(typeof piece.data.approvalVersion, "string");
  assert.equal(
    (
      await request(`/brands/${workspace.id}/pieces/${piece.data.id}`, {
        method: "PATCH",
        cookie: reviewer.cookie,
        body: { title: "Suplantación" },
      })
    ).status,
    403,
  );
  const comment = await request(
    `/brands/${workspace.id}/pieces/${piece.data.id}/comments`,
    {
      method: "POST",
      cookie: reviewer.cookie,
      body: { text: "Buen enfoque.", author: "Falso" },
    },
  );
  assert.equal(comment.status, 200);
  assert.equal(comment.data.comments[0].author, reviewer.data.user.name);
  assert.equal(comment.data.approvalVersion, piece.data.approvalVersion);
  const review = await request(
    `/brands/${workspace.id}/pieces/${piece.data.id}/review`,
    {
      method: "POST",
      cookie: reviewer.cookie,
      body: {
        action: "approve",
        expectedApprovalVersion: piece.data.approvalVersion,
      },
    },
  );
  assert.equal(review.status, 200);
  assert.equal(review.data.status, "approved");
  assert.equal(
    (
      await request(`/brands/${workspace.id}/members/${owner.data.user.id}`, {
        method: "DELETE",
        cookie: owner.cookie,
      })
    ).status,
    409,
  );
});

test("approval is bound to the displayed content version across review interleavings", async () => {
  const base = `/brands/${workspace.id}`;
  const reviewer = await account("version-reviewer");
  const invitation = await request(`${base}/invitations`, {
    method: "POST",
    cookie: owner.cookie,
    body: { role: "reviewer" },
  });
  const accepted = await request(
    `/invitations/${invitation.data.token}/accept`,
    {
      method: "POST",
      cookie: reviewer.cookie,
      body: {},
    },
  );
  assert.equal(accepted.status, 200);
  const piece = await request(`${base}/pieces`, {
    method: "POST",
    cookie: owner.cookie,
    body: {
      title: "Versión A",
      hook: "Gancho A",
      script: "Guion A visible para la persona revisora.",
      status: "review",
    },
  });
  assert.equal(piece.status, 201);
  assert.equal(typeof piece.data.approvalVersion, "string");

  const reviewerState = await request(`${base}/state`, {
    cookie: reviewer.cookie,
  });
  const displayed = reviewerState.data.pieces.find(
    (item) => item.id === piece.data.id,
  );
  assert.equal(displayed.approvalVersion, piece.data.approvalVersion);

  const edit = await request(`${base}/pieces/${piece.data.id}`, {
    method: "PATCH",
    cookie: owner.cookie,
    body: {
      title: "Versión B",
      hook: "Gancho B",
      script: "Guion B que la persona revisora no ha visto.",
    },
  });
  assert.equal(edit.status, 200);
  assert.notEqual(edit.data.approvalVersion, displayed.approvalVersion);

  const missingReviewVersion = await request(
    `${base}/pieces/${piece.data.id}/review`,
    {
      method: "POST",
      cookie: reviewer.cookie,
      body: { action: "approve" },
    },
  );
  assert.equal(missingReviewVersion.status, 409);

  const staleReview = await request(`${base}/pieces/${piece.data.id}/review`, {
    method: "POST",
    cookie: reviewer.cookie,
    body: {
      action: "approve",
      expectedApprovalVersion: displayed.approvalVersion,
    },
  });
  assert.equal(staleReview.status, 409);

  const forgedReview = await request(`${base}/pieces/${piece.data.id}/review`, {
    method: "POST",
    cookie: reviewer.cookie,
    body: { action: "approve", expectedApprovalVersion: "forged-version" },
  });
  assert.equal(forgedReview.status, 409);

  const missingGenericVersion = await request(
    `${base}/pieces/${piece.data.id}`,
    {
      method: "PATCH",
      cookie: owner.cookie,
      body: { status: "approved" },
    },
  );
  assert.equal(missingGenericVersion.status, 409);

  const staleGenericVersion = await request(`${base}/pieces/${piece.data.id}`, {
    method: "PATCH",
    cookie: owner.cookie,
    body: {
      status: "approved",
      expectedApprovalVersion: displayed.approvalVersion,
    },
  });
  assert.equal(staleGenericVersion.status, 409);
  const combinedEditAndApproval = await request(
    `${base}/pieces/${piece.data.id}`,
    {
      method: "PATCH",
      cookie: owner.cookie,
      body: {
        title: "Versión C enviada junto con aprobar",
        status: "approved",
        expectedApprovalVersion: edit.data.approvalVersion,
      },
    },
  );
  assert.equal(combinedEditAndApproval.status, 409);
  assert.equal(
    dbModule.getRecord(workspace.id, "pieces", piece.data.id).status,
    "review",
  );
  assert.equal(
    dbModule.getRecord(workspace.id, "pieces", piece.data.id).title,
    "Versión B",
  );

  const freshView = await request(`${base}/pieces`, {
    cookie: reviewer.cookie,
  });
  const fresh = freshView.data.find((item) => item.id === piece.data.id);
  const comment = await request(`${base}/pieces/${piece.data.id}/comments`, {
    method: "POST",
    cookie: reviewer.cookie,
    body: { text: "Comentario de actividad." },
  });
  assert.equal(comment.status, 200);
  assert.equal(comment.data.approvalVersion, fresh.approvalVersion);

  const freshApproval = await request(
    `${base}/pieces/${piece.data.id}/review`,
    {
      method: "POST",
      cookie: reviewer.cookie,
      body: {
        action: "approve",
        expectedApprovalVersion: fresh.approvalVersion,
        comment: "Revisado después de ver la versión actual.",
      },
    },
  );
  assert.equal(freshApproval.status, 200, JSON.stringify(freshApproval.data));
  assert.equal(freshApproval.data.status, "approved");

  const genericPiece = await request(`${base}/pieces`, {
    method: "POST",
    cookie: owner.cookie,
    body: { title: "Aprobación genérica", status: "review" },
  });
  const genericApproval = await request(
    `${base}/pieces/${genericPiece.data.id}`,
    {
      method: "PATCH",
      cookie: owner.cookie,
      body: {
        status: "approved",
        expectedApprovalVersion: genericPiece.data.approvalVersion,
      },
    },
  );
  assert.equal(
    genericApproval.status,
    200,
    JSON.stringify(genericApproval.data),
  );
  assert.equal(genericApproval.data.status, "approved");
});

test("unchanged oversized legacy piece text can be saved with an unrelated edit", async () => {
  const created = await request(`/brands/${workspace.id}/pieces`, {
    method: "POST",
    cookie: owner.cookie,
    body: { title: "Registro legado" },
  });
  const legacyHook = "H".repeat(2300);
  dbModule.saveRecord(workspace.id, "pieces", {
    ...created.data,
    hook: legacyHook,
  });
  const view = await request(`/brands/${workspace.id}/pieces`, {
    cookie: owner.cookie,
  });
  const legacyPiece = view.data.find((item) => item.id === created.data.id);
  const saved = await request(
    `/brands/${workspace.id}/pieces/${created.data.id}`,
    {
      method: "PATCH",
      cookie: owner.cookie,
      body: { hook: legacyPiece.hook, cta: "Nueva llamada a la acción" },
    },
  );
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.hook, legacyHook);
  assert.equal(saved.data.cta, "Nueva llamada a la acción");

  const changedOversized = await request(
    `/brands/${workspace.id}/pieces/${created.data.id}`,
    {
      method: "PATCH",
      cookie: owner.cookie,
      body: { hook: `${legacyHook}x` },
    },
  );
  assert.equal(changedOversized.status, 400);
  const newOversized = await request(`/brands/${workspace.id}/pieces`, {
    method: "POST",
    cookie: owner.cookie,
    body: { title: "Texto nuevo largo", hook: legacyHook },
  });
  assert.equal(newOversized.status, 400);
});

test("optional edit preconditions reject stale HTTP writes without breaking older clients", async () => {
  const base = `/brands/${workspace.id}`;
  const created = await request(`${base}/pieces`, {
    method: "POST",
    cookie: owner.cookie,
    body: {
      title: "Edición concurrente",
      cta: "CTA original",
      status: "draft",
    },
  });
  assert.equal(created.status, 201);

  const otherEditor = await request(`${base}/pieces/${created.data.id}`, {
    method: "PATCH",
    cookie: owner.cookie,
    body: { hook: "Gancho cambiado por otra sesión" },
  });
  assert.equal(otherEditor.status, 200);
  assert.notEqual(
    otherEditor.data.approvalVersion,
    created.data.approvalVersion,
  );

  const staleEdit = await request(`${base}/pieces/${created.data.id}`, {
    method: "PATCH",
    cookie: owner.cookie,
    body: {
      cta: "CTA local que no debe sobrescribir",
      expectedEditVersion: created.data.approvalVersion,
    },
  });
  assert.equal(staleEdit.status, 409);
  assert.equal(
    dbModule.getRecord(workspace.id, "pieces", created.data.id).cta,
    "CTA original",
  );

  const invalidVersion = await request(`${base}/pieces/${created.data.id}`, {
    method: "PATCH",
    cookie: owner.cookie,
    body: { cta: "Tampoco debe guardarse", expectedEditVersion: 123 },
  });
  assert.equal(invalidVersion.status, 409);

  const comment = await request(`${base}/pieces/${created.data.id}/comments`, {
    method: "POST",
    cookie: owner.cookie,
    body: { text: "Solo actividad" },
  });
  assert.equal(comment.status, 200);
  assert.equal(comment.data.approvalVersion, otherEditor.data.approvalVersion);

  const freshEdit = await request(`${base}/pieces/${created.data.id}`, {
    method: "PATCH",
    cookie: owner.cookie,
    body: {
      cta: "CTA guardado con versión actual",
      expectedEditVersion: otherEditor.data.approvalVersion,
    },
  });
  assert.equal(freshEdit.status, 200);
  assert.equal(freshEdit.data.cta, "CTA guardado con versión actual");

  const assigned = await request(`${base}/pieces/${created.data.id}`, {
    method: "PATCH",
    cookie: owner.cookie,
    body: {
      assignee: owner.data.user.id,
      expectedEditVersion: freshEdit.data.approvalVersion,
    },
  });
  assert.equal(assigned.status, 200);
  assert.notEqual(
    assigned.data.approvalVersion,
    freshEdit.data.approvalVersion,
  );
});

test("editor may produce content but cannot configure integrations or approve their work", async () => {
  const editor = await account("editor");
  const invitation = await request(`/brands/${workspace.id}/invitations`, {
    method: "POST",
    cookie: owner.cookie,
    body: { role: "editor" },
  });
  await request(`/invitations/${invitation.data.token}/accept`, {
    method: "POST",
    cookie: editor.cookie,
    body: {},
  });
  assert.equal(
    (
      await request(`/brands/${workspace.id}/integrations`, {
        method: "PUT",
        cookie: editor.cookie,
        body: {},
      })
    ).status,
    403,
  );
  const piece = await request(`/brands/${workspace.id}/pieces`, {
    method: "POST",
    cookie: editor.cookie,
    body: { title: "Guion de editor", status: "review" },
  });
  assert.equal(piece.status, 201);
  assert.equal(
    (
      await request(`/brands/${workspace.id}/pieces/${piece.data.id}/review`, {
        method: "POST",
        cookie: editor.cookie,
        body: { action: "approve" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/brands/${workspace.id}/pieces/${piece.data.id}`, {
        method: "PATCH",
        cookie: editor.cookie,
        body: { status: "approved" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await request(`/brands/${workspace.id}/state`, { cookie: editor.cookie }))
      .status,
    200,
  );
});

test("changing a source URL removes old metrics and snapshot history rather than reusing evidence", async () => {
  const reference = dbModule.saveRecord(workspace.id, "references", {
    title: "Real source",
    url: "https://example.com/old",
    text: "Content",
    source: "Hacker News",
    status: "analyzed",
    tags: [],
    analysis: { engine: "heuristic" },
    brandRelevance: { score: 85, matchedTerms: ["ai"], method: "lexical" },
    trend: { score: 90 },
    metrics: { score: 1000 },
    trendHistory: [
      { observedAt: new Date().toISOString(), metrics: { score: 1000 } },
    ],
    sourceId: "old-source",
    sourceUrl: "https://news.ycombinator.com/item?id=1",
    officialTraffic: "10,000+",
    firstSeenAt: new Date().toISOString(),
  });
  const response = await request(
    `/brands/${workspace.id}/references/${reference.id}`,
    {
      method: "PATCH",
      cookie: owner.cookie,
      body: { url: "https://example.com/new" },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(response.data.source, "manual");
  assert.equal(response.data.status, "new");
  for (const key of [
    "trend",
    "metrics",
    "trendHistory",
    "sourceId",
    "sourceUrl",
    "officialTraffic",
    "firstSeenAt",
    "analysis",
    "brandRelevance",
  ])
    assert.equal(response.data[key], undefined, key);
});

test("demo data is explicitly labeled; secret values are encrypted and absent from state", async () => {
  const demo = await request("/auth/demo", { method: "POST", body: {} });
  assert.equal(demo.status, 201);
  assert.equal(demo.data.user.name, "Explorador de kompass");
  const state = await request(`/brands/${demo.data.brands[0].id}/state`, {
    cookie: demo.cookie,
  });
  assert.ok(state.data.references.length >= 6);
  assert.ok(state.data.references.every((reference) => reference.isDemo));
  assert.ok(state.data.pieces.every((piece) => piece.isDemo));
  assert.equal(state.data.brand.name, "Empresa de ejemplo");
  assert.equal(state.data.assets[0].name, "kompass · tarjeta de ejemplo.svg");
  const demoAsset = await request(
    `/brands/${state.data.brand.id}/assets/${state.data.assets[0].id}/file`,
    { cookie: demo.cookie },
  );
  assert.equal(demoAsset.status, 200);
  assert.match(demoAsset.data, /kompass · EJEMPLO/);
  assert.doesNotMatch(demoAsset.data, /30X/);
  assert.ok(state.data.assets.every((asset) => !("storageName" in asset)));
  dbModule.setSecret(workspace.id, "ai", {
    apiKey: "private-credential-DO-NOT-EXPOSE",
    model: "test-model",
  });
  assert.equal(
    dbModule.getSecret(workspace.id, "ai").apiKey,
    "private-credential-DO-NOT-EXPOSE",
  );
  const stored = dbModule.db
    .prepare("SELECT value FROM secrets WHERE brand_id=? AND key=?")
    .get(workspace.id, "ai").value;
  assert.ok(!stored.includes("private-credential"));
  const response = await request(`/brands/${workspace.id}/state`, {
    cookie: owner.cookie,
  });
  assert.equal(response.data.integrations.ai.configured, true);
  assert.ok(!JSON.stringify(response.data).includes("private-credential"));
  dbModule.setSecret(workspace.id, "ai", null);
});

test("invalid requests and foreign Origin mutations fail with safe JSON errors", async () => {
  const denied = await request(`/brands/${workspace.id}/references`, {
    method: "POST",
    cookie: owner.cookie,
    body: { text: "CSRF" },
    headers: { origin: "https://attacker.example" },
  });
  assert.equal(denied.status, 403);
  assert.equal(
    (
      await request(`/brands/${workspace.id}/references`, {
        method: "POST",
        cookie: owner.cookie,
        body: { url: "javascript:alert(1)" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/brands/${workspace.id}/pieces`, {
        method: "POST",
        cookie: owner.cookie,
        body: { title: "Error", scenes: [{ duration: -1 }] },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/brands/${workspace.id}`, {
        method: "PATCH",
        cookie: owner.cookie,
        body: { weeklyTarget: -10 },
      })
    ).status,
    400,
  );
  const unknown = await request("/missing");
  assert.equal(unknown.status, 404);
  assert.equal(typeof unknown.data.error, "string");
});
