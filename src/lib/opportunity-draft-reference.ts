import type { Opportunity, OpportunityAnalysis } from "./journey-types";
import type { Reference } from "./types";

/** Select the primary source passed from an opportunity into the draft. */
export function opportunityDraftReferenceId(
  opportunity: Pick<Opportunity, "id" | "referenceIds">,
  analysis: Pick<OpportunityAnalysis, "opportunityId" | "citations"> | null,
  references: ReadonlyArray<Pick<Reference, "id" | "status" | "accessPolicy">>,
): string | undefined {
  const available = new Set(
    references
      .filter(
        (reference) =>
          reference.status !== "dismissed" &&
          reference.accessPolicy?.allowed !== false,
      )
      .map((reference) => reference.id),
  );
  const candidates = opportunity.referenceIds.filter((id) => available.has(id));
  if (analysis?.opportunityId === opportunity.id) {
    const citation = analysis.citations.find(({ referenceId }) =>
      candidates.includes(referenceId),
    );
    if (citation) return citation.referenceId;
  }
  return candidates[0];
}
