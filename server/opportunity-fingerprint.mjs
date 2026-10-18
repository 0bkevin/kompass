import { createHash } from "node:crypto";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, stable(value[key])]),
    );
  return value;
}
function byId(items) {
  return [...items].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}
export function isYouTubeReference(reference) {
  if (
    reference.platform === "youtube" ||
    /youtube\s*data\s*api/i.test(reference.metricsOrigin || "")
  )
    return true;
  for (const value of [reference.url, reference.sourceUrl]) {
    try {
      if (
        /(^|\.)(?:youtube\.com|youtu\.be)$/.test(
          new URL(value).hostname.toLowerCase(),
        )
      )
        return true;
    } catch {
      /* A missing URL does not change a reference's platform. */
    }
  }
  return false;
}
export function usableOpportunitySignals(brand, signals) {
  const ids = new Set((brand.audience || []).map((segment) => segment.id));
  return signals.filter(
    (signal) =>
      ids.has(signal.segmentId) &&
      (["public_content", "editorial"].includes(signal.sourceType) ||
        (signal.sourceType === "community" &&
          signal.aggregate === true &&
          Number.isSafeInteger(signal.sampleSize) &&
          signal.sampleSize >= 5 &&
          typeof signal.communityPollId === "string" &&
          !!signal.communityPollId)),
  );
}

/** Stable business inputs only. Provider metrics and volatile timestamps cannot
 * turn an audience hypothesis into new semantic evidence or invalidate it.
 */
export function opportunityFingerprint(
  brand,
  opportunity,
  { references = [], signals = [] } = {},
) {
  const ids = new Set(opportunity.referenceIds || []);
  const referenceInputs = byId(
    references.filter(
      (reference) => ids.has(reference.id) && !isYouTubeReference(reference),
    ),
  ).map((reference) => ({
    id: reference.id,
    title: reference.title,
    text: reference.text,
    url: reference.url,
    source: reference.source,
    sourceId: reference.sourceId,
    platform: reference.platform,
    topic: reference.topic,
    tags: reference.tags,
    format: reference.format,
    language: reference.language,
    market: reference.market,
    contentScope: reference.contentScope,
    status: reference.status,
    isDemo: reference.isDemo,
  }));
  const signalInputs = byId(usableOpportunitySignals(brand, signals)).map(
    (signal) => ({
      id: signal.id,
      segmentId: signal.segmentId,
      topic: signal.topic,
      note: signal.note,
      sourceType: signal.sourceType,
      sourceUrl: signal.sourceUrl,
      sampleSize: signal.sampleSize,
      aggregate: signal.aggregate,
      communityPollId: signal.communityPollId,
    }),
  );
  const context = {
    id: brand.id,
    name: brand.name,
    industry: brand.industry,
    description: brand.description,
    website: brand.website,
    market: brand.market,
    language: brand.language,
    tone: brand.tone,
    pillars: [...(brand.pillars || [])].sort(),
    goals: [...(brand.goals || [])].sort(),
    audience: byId(brand.audience || []).map((segment) => ({
      id: segment.id,
      name: segment.name,
      role: segment.role,
      stage: segment.stage,
      needs: segment.needs,
      description: segment.description,
    })),
    isDemo: brand.isDemo,
  };
  const subject = {
    id: opportunity.id,
    title: opportunity.title,
    topic: opportunity.topic,
    referenceIds: [...ids].sort(),
    segmentIds: [...(opportunity.segmentIds || [])].sort(),
    suggestedChannel: opportunity.suggestedChannel,
    suggestedFormat: opportunity.suggestedFormat,
    isDemo: opportunity.isDemo,
  };
  return createHash("sha256")
    .update(
      JSON.stringify(
        stable({
          context,
          subject,
          references: referenceInputs,
          signals: signalInputs,
        }),
      ),
    )
    .digest("hex");
}
