import { referenceUsePolicy } from "./access-policy.mjs";
import { deduplicateReferences } from "./reference-identity.mjs";

const WEEK = 7 * 86400000;
const date = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
};

// A recent discovery of an old publication is not a new publication. When the
// source has no publication date, retain its observation as such, never as one.
export function selectResearchCorpus(
  brand,
  { references = [], sources = [], now = Date.now() } = {},
) {
  const time = typeof now === "number" ? now : Date.parse(now);
  if (!Number.isFinite(time)) throw new TypeError("Fecha de informe inválida.");
  const from = time - WEEK;
  const excluded = {
    demo: 0,
    restricted: 0,
    dismissed: 0,
    outsideWindow: 0,
    undated: 0,
    future: 0,
  };
  const eligible = [];
  for (const reference of references) {
    if (!!reference.isDemo !== !!brand.isDemo) {
      excluded.demo++;
      continue;
    }
    if (reference.status === "dismissed") {
      excluded.dismissed++;
      continue;
    }
    if (
      !referenceUsePolicy(
        reference,
        sources.find((source) => source.id === reference.sourceId),
      ).allowed
    ) {
      excluded.restricted++;
      continue;
    }
    const published = date(reference.publishedAt);
    const observed =
      date(reference.firstSeenAt) ??
      date(reference.trend?.observedAt) ??
      date(reference.createdAt);
    const selected = published ?? observed;
    if (selected === null) {
      excluded.undated++;
      continue;
    }
    if (selected > time) {
      excluded.future++;
      continue;
    }
    if (selected <= from) {
      excluded.outsideWindow++;
      continue;
    }
    eligible.push({
      ...reference,
      reportTiming: {
        basis: published === null ? "observation" : "publication",
        at: new Date(selected).toISOString(),
      },
    });
  }
  const selected = deduplicateReferences(eligible);
  return {
    references: selected,
    period: {
      from: new Date(from).toISOString(),
      to: new Date(time).toISOString(),
      days: 7,
    },
    counts: {
      available: references.length,
      selected: selected.length,
      duplicates: eligible.length - selected.length,
      publicationDated: selected.filter(
        (item) => item.reportTiming.basis === "publication",
      ).length,
      observationDated: selected.filter(
        (item) => item.reportTiming.basis === "observation",
      ).length,
      excluded,
    },
    isDemo: !!brand.isDemo,
  };
}
