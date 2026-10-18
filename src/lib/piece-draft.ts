import type { Piece } from "./types";

const EDITABLE_FIELDS = [
  "title",
  "hook",
  "script",
  "caption",
  "cta",
  "format",
  "channel",
  "segmentId",
  "assetIds",
  "scenes",
  "referenceId",
  "ideaId",
  "assignee",
] as const satisfies readonly (keyof Piece)[];

export interface PieceEditorState {
  draft: Piece;
  baseline: Piece;
  conflict: boolean;
}

function editableValues(piece: Piece) {
  return Object.fromEntries(
    EDITABLE_FIELDS.map((field) => [field, piece[field]]),
  );
}

export function isPieceEditorDirty(draft: Piece, baseline: Piece) {
  return (
    JSON.stringify(editableValues(draft)) !==
    JSON.stringify(editableValues(baseline))
  );
}

export function reconcilePieceEditor(
  current: PieceEditorState,
  serverPiece: Piece,
): PieceEditorState {
  if (!isPieceEditorDirty(current.draft, current.baseline))
    return { draft: serverPiece, baseline: serverPiece, conflict: false };

  if (serverPiece.approvalVersion !== current.baseline.approvalVersion)
    return { ...current, conflict: true };

  return {
    draft: { ...serverPiece, ...editableValues(current.draft) },
    baseline: serverPiece,
    conflict: false,
  };
}
