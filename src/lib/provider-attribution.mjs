const PROVIDERS = Object.freeze({
  gdelt: Object.freeze({
    id: "gdelt",
    name: "GDELT Project",
    url: "https://www.gdeltproject.org/",
  }),
  google_trends: Object.freeze({
    id: "google_trends",
    name: "Google Trends",
    url: "https://trends.google.com/",
  }),
  hn_algolia: Object.freeze({
    id: "hn_algolia",
    name: "Hacker News / Algolia",
    url: "https://hn.algolia.com/",
  }),
});

// Attribution links are provider-owned constants, never arbitrary stored URLs.
export function providerAttributionsForReference(reference) {
  if (!reference || typeof reference !== "object") return [];
  const ids = new Set();
  const add = (item) => {
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item.providerAttributions)) {
      for (const provider of item.providerAttributions) {
        if (provider && Object.hasOwn(PROVIDERS, provider.id))
          ids.add(provider.id);
      }
    }
    // Recover provider citations for records created before attribution metadata.
    if (
      item.signalType === "news-coverage" ||
      item.trend?.signalType === "news-coverage"
    )
      ids.add("gdelt");
    if (
      item.signalType === "search-interest" ||
      item.trend?.signalType === "search-interest"
    )
      ids.add("google_trends");
    try {
      const url = new URL(item.sourceUrl || item.trend?.sourceUrl);
      if (url.hostname === "news.ycombinator.com") ids.add("hn_algolia");
    } catch {
      /* Missing source provenance does not imply a provider. */
    }
  };
  add(reference);
  for (const evidence of Array.isArray(reference.evidence)
    ? reference.evidence
    : [])
    add(evidence);
  return [...ids].map((id) => ({ ...PROVIDERS[id] }));
}

export function formatProviderAttributions(...references) {
  const unique = new Map(
    references
      .flatMap(providerAttributionsForReference)
      .map((provider) => [provider.id, provider]),
  );
  return [...unique.values()]
    .map((provider) => `Datos: ${provider.name} (${provider.url})`)
    .join("; ");
}
