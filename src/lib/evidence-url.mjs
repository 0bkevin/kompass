/** Links used to inspect the source of an audience signal. */
export function safeAudienceEvidenceUrl(value) {
  if (typeof value !== "string") return undefined;
  // Community evidence is generated locally; keep only the exact public route.
  if (/^\/community\/[a-z\d_-]{43}$/i.test(value)) return value;
  try {
    const url = new URL(value || "");
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
