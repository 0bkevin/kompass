const ACTIVE_WORKSPACE_KEY = "kompass-brand";
// Read the previous key once so a renamed app retains the selected company.
const LEGACY_WORKSPACE_KEY = "30x-brand";

export function readActiveWorkspace(storage) {
  try {
    return (
      storage.getItem(ACTIVE_WORKSPACE_KEY) ||
      storage.getItem(LEGACY_WORKSPACE_KEY) ||
      ""
    );
  } catch {
    return "";
  }
}

export function rememberActiveWorkspace(storage, workspaceId) {
  try {
    storage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId);
    storage.removeItem(LEGACY_WORKSPACE_KEY);
  } catch {
    // Browsers that block storage can still keep the selection in React state.
  }
}
