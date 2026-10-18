import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-references-3-"));
process.env.DATA_DIR = dataDir;
for (const key of [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "YOUTUBE_API_KEY",
  "APIFY_API_TOKEN",
])
  delete process.env[key];
process.env.DISCOVERY_ENABLED = "false";
const { createApp } = await import("../server/index.mjs");
const { db, getRecord, UPLOAD_DIR } = await import("../server/db.mjs");
const bytes = Buffer.from(
  "DOCUMENTO FICTICIO references-3: ñandú, 日本語, 🙂.\n",
);
const name = "original-ficticio-ñandú.txt";
let server,
  origin,
  owner,
  editor,
  reviewer,
  outsider,
  brand,
  otherBrand,
  asset,
  reference;

async function request(route, { cookie, method = "GET", body } = {}) {
  return fetch(`${origin}/api${route}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body && !(body instanceof FormData)
        ? { "content-type": "application/json" }
        : {}),
    },
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
}
async function account(label) {
  const response = await request("/auth/register", {
    method: "POST",
    body: {
      name: label,
      email: `${randomUUID()}@example.test`,
      password: randomUUID(),
    },
  });
  assert.equal(response.status, 201);
  return {
    cookie: response.headers.get("set-cookie").split(";")[0],
    user: (await response.json()).user,
  };
}
async function createBrand(label) {
  const response = await request("/brands", {
    cookie: owner.cookie,
    method: "POST",
    body: { name: label },
  });
  assert.equal(response.status, 201);
  return response.json();
}
before(async () => {
  server = createApp({ apiOnly: true }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  owner = await account("Propietario ficticio references-3");
  editor = await account("Editor ficticio references-3");
  reviewer = await account("Revisor ficticio references-3");
  outsider = await account("Otra cuenta ficticia references-3");
  brand = await createBrand("Empresa ficticia con documento");
  otherBrand = await createBrand("Otra empresa ficticia sin documento");
  for (const [member, role] of [
    [editor, "editor"],
    [reviewer, "reviewer"],
  ])
    db.prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?)").run(
      brand.id,
      member.user.id,
      role,
    );
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "text/plain" }), name);
  const uploaded = await request(`/brands/${brand.id}/assets`, {
    cookie: owner.cookie,
    method: "POST",
    body: form,
  });
  assert.equal(uploaded.status, 201);
  asset = await uploaded.json();
  const captured = await request(`/brands/${brand.id}/references`, {
    cookie: owner.cookie,
    method: "POST",
    body: {
      title: "Referencia documental ficticia",
      format: "document",
      assetId: asset.id,
      url: "https://example.com/documento-publico-ficticio",
    },
  });
  assert.equal(captured.status, 201);
  reference = await captured.json();
});
after(async () => {
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  });
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("reference attachment HEAD and download preserve original bytes, name and public provenance separately", async () => {
  const stateResponse = await request(`/brands/${brand.id}/state`, {
    cookie: owner.cookie,
  });
  const state = await stateResponse.json();
  const saved = state.references.find((item) => item.id === reference.id);
  const attached = state.assets.find((item) => item.id === saved.assetId);
  assert.equal(saved.url, "https://example.com/documento-publico-ficticio");
  assert.equal(attached.name, name);
  const route = `/brands/${brand.id}/assets/${attached.id}/file?download=1`;
  const head = await request(route, { cookie: owner.cookie, method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), String(bytes.length));
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.match(head.headers.get("cache-control"), /private/);
  assert.match(
    head.headers.get("content-disposition"),
    new RegExp(encodeURIComponent(name)),
  );
  const download = await request(route, { cookie: owner.cookie });
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
});

test("attachment reads allow reviewers but preserve authentication and company boundaries", async () => {
  const route = `/brands/${brand.id}/assets/${asset.id}/file?download=1`;
  for (const member of [owner, editor, reviewer]) {
    for (const method of ["HEAD", "GET"]) {
      const response = await request(route, { cookie: member.cookie, method });
      assert.equal(response.status, 200);
      await response.arrayBuffer();
    }
  }
  for (const method of ["HEAD", "GET"]) {
    assert.equal((await request(route, { method })).status, 401);
    assert.equal(
      (await request(route, { cookie: outsider.cookie, method })).status,
      404,
    );
    assert.equal(
      (
        await request(
          `/brands/${otherBrand.id}/assets/${asset.id}/file?download=1`,
          { cookie: owner.cookie, method },
        )
      ).status,
      404,
    );
  }
  const modified = await request(
    `/brands/${brand.id}/references/${reference.id}`,
    {
      cookie: reviewer.cookie,
      method: "PATCH",
      body: { title: "No debe cambiar" },
    },
  );
  assert.equal(modified.status, 403);
});

test("HEAD distinguishes missing physical file and deleted metadata without changing the reference original", async () => {
  const stored = getRecord(brand.id, "assets", asset.id);
  const file = path.join(UPLOAD_DIR, stored.storageName);
  const temporary = `${file}.temporarily-unavailable`;
  fs.renameSync(file, temporary);
  try {
    const missing = await request(
      `/brands/${brand.id}/assets/${asset.id}/file?download=1`,
      { cookie: owner.cookie, method: "HEAD" },
    );
    assert.equal(missing.status, 404);
    assert.equal((await missing.arrayBuffer()).byteLength, 0);
    assert.equal(
      getRecord(brand.id, "references", reference.id).assetId,
      asset.id,
    );
  } finally {
    fs.renameSync(temporary, file);
  }
  const deleted = await request(`/brands/${brand.id}/assets/${asset.id}`, {
    cookie: owner.cookie,
    method: "DELETE",
  });
  assert.equal(deleted.status, 200);
  const saved = getRecord(brand.id, "references", reference.id);
  assert.equal(saved.assetId, undefined);
  assert.equal(saved.url, "https://example.com/documento-publico-ficticio");
  assert.equal(saved.format, "document");
});
