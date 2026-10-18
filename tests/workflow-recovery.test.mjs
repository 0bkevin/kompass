import test from "node:test";
import assert from "node:assert/strict";
import {
  createThenRefresh,
  uploadFilesIndividually,
} from "../src/lib/workflow-recovery.mjs";

test("asset upload records per-file failures and continues through the batch", async () => {
  const uploaded = [];
  const files = [
    { name: "first.png" },
    { name: "bad.exe" },
    { name: "last.pdf" },
  ];
  const results = await uploadFilesIndividually(files, async (file) => {
    if (file.name === "bad.exe") throw new Error("Formato no admitido");
    uploaded.push(file.name);
  });

  assert.deepEqual(uploaded, ["first.png", "last.pdf"]);
  assert.deepEqual(results, [
    { fileName: "first.png", status: "uploaded" },
    { fileName: "bad.exe", status: "failed", message: "Formato no admitido" },
    { fileName: "last.pdf", status: "uploaded" },
  ]);
});

test("draft refresh retry reuses the created piece and never creates it twice", async () => {
  const piece = { id: "piece-1", title: "Created once" };
  let createCalls = 0;
  let refreshCalls = 0;
  const createPiece = async () => {
    createCalls += 1;
    return piece;
  };

  const first = await createThenRefresh(null, createPiece, async () => {
    refreshCalls += 1;
    throw new Error("503");
  });
  assert.equal(first.status, "refresh-failed");
  assert.equal(first.piece, piece);

  const retry = await createThenRefresh(first.piece, createPiece, async () => {
    refreshCalls += 1;
  });
  assert.deepEqual(retry, { status: "ready", piece });
  assert.equal(createCalls, 1);
  assert.equal(refreshCalls, 2);
});
