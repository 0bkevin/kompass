import type { View } from "./types";

export function legacyHashTarget(hash: string): string | null;
export function legacyUrlTarget(value: {
  hash: string;
  search?: string;
}): string | null;
export function workspaceLocation(pathname: string): {
  view: View;
  pieceId?: string;
};
