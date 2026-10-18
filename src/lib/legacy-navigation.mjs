const legacyViewPaths = Object.freeze({
  radar: "/radar",
  inbox: "/inbox",
  studio: "/studio",
  calendar: "/calendar",
  assets: "/assets",
  audience: "/audience",
  brand: "/brand",
  settings: "/settings",
});

export function legacyHashTarget(hash) {
  if (typeof hash !== "string") return null;

  const value = hash.startsWith("#") ? hash.slice(1) : hash;
  const studioPiece = /^studio\/([^/]+)$/.exec(value);
  if (studioPiece) {
    try {
      const pieceId = decodeURIComponent(studioPiece[1]);
      if (!pieceId || pieceId.includes("/")) return null;
      return `/studio/${encodeURIComponent(pieceId)}`;
    } catch {
      return null;
    }
  }

  return Object.hasOwn(legacyViewPaths, value) ? legacyViewPaths[value] : null;
}

export function legacyUrlTarget({ hash, search = "" } = {}) {
  const target = legacyHashTarget(hash);
  return target ? `${target}${search}` : null;
}

export function workspaceLocation(pathname) {
  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0] ?? "radar";
  const view = Object.hasOwn(legacyViewPaths, first) ? first : "radar";
  let pieceId;
  if (view === "studio" && segments.length === 2) {
    try {
      pieceId = decodeURIComponent(segments[1]);
    } catch {
      pieceId = segments[1];
    }
  }
  return pieceId ? { view, pieceId } : { view };
}
