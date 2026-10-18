import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { installPermissionFixture } from "./permission-fixture.mjs";

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "kompass-publication-assets-"),
);
process.env.DATA_DIR = directory;
installPermissionFixture(directory, [
  {
    origin: "https://publisher.example.test",
    pathPrefix: "/hook",
    purposes: ["webhook"],
  },
]);
const {
  db,
  UPLOAD_DIR,
  saveBrand,
  saveRecord,
  setSecret,
  getSecret,
  getRecord,
} = await import("../server/db.mjs");
const { publishPiece } = await import("../server/connectors.mjs");
const { MAX_PUBLICATION_ASSET_BYTES } =
  await import("../server/publication-assets.mjs");
after(() => {
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const brand = saveBrand({ name: "Empresa QA" });
  setSecret(brand.id, "webhook", {
    url: "https://publisher.example.test/hook",
  });
  const piece = saveRecord(brand.id, "pieces", {
    title: "Pieza aprobada",
    status: "approved",
    channel: "linkedin",
    script: "Texto revisado",
    scenes: [{ text: "Primera escena" }],
    assetIds: [],
  });
  return { brand, piece };
}
function asset(brand, overrides = {}) {
  const id = randomUUID();
  fs.writeFileSync(
    path.join(UPLOAD_DIR, id),
    Buffer.from("archivo sintético de prueba"),
  );
  return saveRecord(brand.id, "assets", {
    id,
    storageName: id,
    name: "Ilustración.png",
    type: "image",
    mimeType: "image/png",
    width: 720,
    height: 900,
    ...overrides,
  });
}
function attach(brand, piece, ids) {
  return saveRecord(brand.id, "pieces", { ...piece, assetIds: ids });
}

test("webhook receives exact attached file bytes, never session URLs or storage paths, and repeats remain idempotent", async () => {
  const { brand, piece } = fixture();
  const image = asset(brand),
    video = asset(brand, {
      name: "Video.mp4",
      type: "video",
      mimeType: "video/mp4",
      duration: 12,
    });
  asset(brand, { name: "No asociado.png" });
  const approved = attach(brand, piece, [image.id, video.id, image.id]);
  let calls = 0;
  const fetcher = async (_url, options) => {
    calls++;
    const payload = JSON.parse(options.body);
    assert.equal(payload.event, "piece.publish");
    assert.deepEqual(payload.piece.scenes, piece.scenes);
    assert.deepEqual(
      payload.assets.map((x) => x.id),
      [image.id, video.id],
    );
    for (const item of payload.assets) {
      const bytes = Buffer.from(item.data, item.encoding);
      assert.deepEqual(bytes, fs.readFileSync(path.join(UPLOAD_DIR, item.id)));
      assert.equal(item.size, bytes.length);
      assert.equal(item.storageName, undefined);
      assert.equal(item.url, undefined);
      assert.equal(item.filePath, undefined);
    }
    assert.equal(payload.assets[1].duration, 12);
    return new Response(null, { status: 204 });
  };
  await publishPiece(brand, approved, { fetcher });
  await publishPiece(brand, approved, { fetcher });
  assert.equal(calls, 1);
});

test("a foreign-company or missing asset blocks delivery before a send journal or network request", async () => {
  const { brand, piece } = fixture(),
    foreign = saveBrand({ name: "Otra empresa" });
  const other = asset(foreign);
  for (const id of [other.id, "missing"]) {
    const approved = attach(brand, piece, [id]);
    await assert.rejects(
      publishPiece(brand, approved, {
        fetcher: () => assert.fail("Must not send"),
      }),
      { status: 409 },
    );
    assert.equal(getSecret(brand.id, `publication:${piece.id}`), null);
    assert.equal(getRecord(brand.id, "pieces", piece.id).status, "approved");
  }
});

test("traversal, external legacy paths and symlinks cannot become publication attachments", async () => {
  const { brand, piece } = fixture();
  const outside = path.join(directory, "private.txt");
  fs.writeFileSync(outside, "private fixture");
  const link = randomUUID();
  fs.symlinkSync(outside, path.join(UPLOAD_DIR, link));
  for (const overrides of [
    { storageName: "../private.txt" },
    { storageName: undefined, filePath: outside },
    { storageName: link },
  ]) {
    const invalid = asset(brand, overrides);
    await assert.rejects(
      publishPiece(brand, attach(brand, piece, [invalid.id]), {
        fetcher: () => assert.fail("Must not send"),
      }),
      { status: 409 },
    );
  }
});

test("resource limits use actual disk size and apply to the complete delivery", async () => {
  const { brand, piece } = fixture(),
    a = asset(brand, { size: 1 }),
    b = asset(brand, { size: 1 });
  fs.truncateSync(path.join(UPLOAD_DIR, a.storageName), 13 * 1024 * 1024);
  fs.truncateSync(path.join(UPLOAD_DIR, b.storageName), 13 * 1024 * 1024);
  await assert.rejects(
    publishPiece(brand, attach(brand, piece, [a.id, b.id]), {
      fetcher: () => assert.fail("Must not send"),
    }),
    { status: 413 },
  );
  fs.truncateSync(
    path.join(UPLOAD_DIR, a.storageName),
    MAX_PUBLICATION_ASSET_BYTES + 1,
  );
  await assert.rejects(
    publishPiece(brand, attach(brand, piece, [a.id]), {
      fetcher: () => assert.fail("Must not send"),
    }),
    { status: 413 },
  );
  assert.equal(getSecret(brand.id, `publication:${piece.id}`), null);
});

test("a piece edited while files are loading must be approved again before delivery", async () => {
  const { brand, piece } = fixture(),
    image = asset(brand);
  const approved = attach(brand, piece, [image.id]);
  const sending = publishPiece(brand, approved, {
    fetcher: () => assert.fail("Must not send stale approval"),
  });
  saveRecord(brand.id, "pieces", {
    ...approved,
    status: "draft",
    script: "Texto modificado",
  });
  await assert.rejects(sending, { status: 409 });
  assert.equal(getSecret(brand.id, `publication:${piece.id}`), null);
});

test("changing the connector while files are loading requires a fresh confirmation", async () => {
  const { brand, piece } = fixture(),
    image = asset(brand);
  const approved = attach(brand, piece, [image.id]);
  const sending = publishPiece(brand, approved, {
    fetcher: () => assert.fail("Must not send to a changed connector"),
  });
  setSecret(brand.id, "webhook", {
    url: "https://publisher.example.test/hook",
    secret: "changed-fixture",
  });
  await assert.rejects(sending, { status: 409 });
  assert.equal(getSecret(brand.id, `publication:${piece.id}`), null);
});
