import { createContext, useContext } from "react";
import type { BrandState, View } from "./types";
export interface WorkspaceContext {
  state: BrandState;
  refresh: () => Promise<void>;
  notify: (message: string, type?: "success" | "error") => void;
  navigate: (view: View, pieceId?: string) => void;
  registerUnsavedChangesGuard: (guard: {
    isDirty: () => boolean;
    confirmLeave: () => boolean;
  }) => () => void;
  selectedPieceId?: string;
  search: string;
}
export const WorkspaceProvider = createContext<WorkspaceContext | null>(null);
export function useWorkspace() {
  const value = useContext(WorkspaceProvider);
  if (!value) throw new Error("Workspace required");
  return value;
}
