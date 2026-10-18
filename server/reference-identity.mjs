// Versioned because publication counts from different identity rules are not
// comparable. Keep stored URLs intact: this key is only used for equality.
export const REFERENCE_IDENTITY_VERSION = 1;

export function canonicalPublicationUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) return null;
    // Document sections and text highlights identify the same publication.
    // Fragment routes may identify different posts, so retain those routes.
    if (!/[!/?=]/.test(url.hash) || /^#:~:/.test(url.hash)) url.hash = "";
    const fields = url.search.slice(1).split("&");
    const retained = fields.filter((field) => {
      let key;
      try {
        key = decodeURIComponent(field.split("=", 1)[0].replace(/\+/g, " "));
      } catch {
        return true;
      }
      return !/^(?:utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|ttclid|twclid|li_fat_id)$/i.test(
        key,
      );
    });
    // Preserve business parameters, their order and encoding. In particular,
    // v, id, ref and source can distinguish real publications or queries.
    if (retained.length !== fields.length) url.search = retained.join("&");
    return url.href;
  } catch {
    return null;
  }
}

export function referenceIdentity(reference) {
  const url = canonicalPublicationUrl(reference.url);
  if (url) return JSON.stringify(["url", url]);
  if (reference.assetId) return JSON.stringify(["asset", reference.assetId]);
  if (reference.sourceId && reference.externalId)
    return JSON.stringify([
      "provider",
      reference.sourceId,
      reference.externalId,
    ]);
  // Similar titles or identical free text do not establish publication identity.
  return reference.id ? JSON.stringify(["record", reference.id]) : null;
}

function precedes(candidate, current) {
  if ((candidate.status === "dismissed") !== (current.status === "dismissed"))
    return candidate.status !== "dismissed";
  const candidateTime = Date.parse(candidate.createdAt);
  const currentTime = Date.parse(current.createdAt);
  const left = Number.isFinite(candidateTime) ? candidateTime : Infinity;
  const right = Number.isFinite(currentTime) ? currentTime : Infinity;
  if (left !== right) return left < right;
  return String(candidate.id || "").localeCompare(String(current.id || "")) < 0;
}

/** One stable, existing representative per publication. Never merge or delete
 * stored records: pieces, ideas, analysis and provider provenance keep their IDs.
 * Callers supply one brand and one real/demo scope at a time.
 */
export function deduplicateReferences(references) {
  const publications = new Map();
  for (const reference of references) {
    const identity = referenceIdentity(reference) || Symbol();
    const current = publications.get(identity);
    if (!current || precedes(reference, current))
      publications.set(identity, reference);
  }
  return [...publications.values()];
}
