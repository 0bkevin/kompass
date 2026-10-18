import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isPieceEditorDirty,
  reconcilePieceEditor,
} from "../src/lib/piece-draft.ts";

function piece(overrides = {}) {
  return {
    id: "piece-1",
    title: "Título",
    hook: "Gancho",
    script: "Guion",
    caption: "Caption",
    cta: "CTA original",
    format: "post",
    channel: "linkedin",
    status: "draft",
    assetIds: [],
    scenes: [],
    createdAt: "2026-10-17T10:00:00.000Z",
    updatedAt: "2026-10-17T10:00:00.000Z",
    approvalVersion: "version-a",
    comments: [],
    ...overrides,
  };
}

test("piece editor ignores metadata and comment refreshes while preserving dirty text", () => {
  const baseline = piece();
  const draft = { ...baseline, cta: "CTA local sin guardar" };
  const current = { draft, baseline, conflict: false };
  const serverPiece = piece({
    updatedAt: "2026-10-17T10:01:00.000Z",
    comments: [{ id: "comment-1", author: "Ari", text: "Gracias" }],
  });

  const reconciled = reconcilePieceEditor(current, serverPiece);

  assert.equal(reconciled.conflict, false);
  assert.equal(reconciled.draft.cta, "CTA local sin guardar");
  assert.equal(reconciled.draft.comments?.length, 1);
  assert.equal(reconciled.baseline.updatedAt, serverPiece.updatedAt);
  assert.equal(isPieceEditorDirty(reconciled.draft, reconciled.baseline), true);
});

test("piece editor adopts new server content when the local draft is clean", () => {
  const original = piece();
  const serverPiece = piece({
    cta: "CTA editado por otra persona",
    approvalVersion: "version-b",
  });

  const reconciled = reconcilePieceEditor(
    { draft: original, baseline: original, conflict: false },
    serverPiece,
  );

  assert.equal(reconciled.draft.cta, serverPiece.cta);
  assert.equal(reconciled.baseline.approvalVersion, "version-b");
  assert.equal(reconciled.conflict, false);
  assert.equal(
    isPieceEditorDirty(reconciled.draft, reconciled.baseline),
    false,
  );
});

test("piece editor preserves local work and its old baseline on a content conflict", () => {
  const baseline = piece();
  const draft = { ...baseline, cta: "CTA local sin guardar" };
  const serverPiece = piece({
    hook: "Gancho nuevo del servidor",
    approvalVersion: "version-b",
  });

  const reconciled = reconcilePieceEditor(
    { draft, baseline, conflict: false },
    serverPiece,
  );

  assert.equal(reconciled.draft.cta, "CTA local sin guardar");
  assert.equal(reconciled.draft.hook, "Gancho");
  assert.equal(reconciled.baseline.approvalVersion, "version-a");
  assert.equal(reconciled.conflict, true);
});

test("piece editor detects changes to the assignee but ignores token-only metadata", () => {
  const baseline = piece({ assignee: "user-a" });
  assert.equal(
    isPieceEditorDirty(
      { ...baseline, approvalVersion: "version-metadata-only" },
      baseline,
    ),
    false,
  );
  assert.equal(
    isPieceEditorDirty({ ...baseline, assignee: "user-b" }, baseline),
    true,
  );
});
