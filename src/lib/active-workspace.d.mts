type WorkspaceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function readActiveWorkspace(storage: WorkspaceStorage): string;
export function rememberActiveWorkspace(
  storage: WorkspaceStorage,
  workspaceId: string,
): void;
