import test from "node:test";
import assert from "node:assert/strict";
import { opportunityDraftReferenceId } from "../src/lib/opportunity-draft-reference.ts";

const opportunity = {
  id: "ai-for-executives",
  referenceIds: ["ap-safety-news", "intel-operations"],
};
const references = [
  { id: "ap-safety-news", status: "new" },
  { id: "intel-operations", status: "analyzed" },
];
const analysis = {
  opportunityId: opportunity.id,
  citations: [
    { referenceId: "intel-operations", support: "Operations example" },
  ],
};

test("a draft keeps the Intel source actually cited by analysis instead of the first AP topic reference", () => {
  assert.equal(
    opportunityDraftReferenceId(opportunity, analysis, references),
    "intel-operations",
  );
});

test("without analysis the opportunity's first available reference remains the default", () => {
  assert.equal(
    opportunityDraftReferenceId(opportunity, null, references),
    "ap-safety-news",
  );
});

test("a citation from another opportunity cannot become the draft's primary source", () => {
  assert.equal(
    opportunityDraftReferenceId(
      opportunity,
      { ...analysis, opportunityId: "another-opportunity" },
      references,
    ),
    "ap-safety-news",
  );
  assert.equal(
    opportunityDraftReferenceId(
      opportunity,
      {
        ...analysis,
        citations: [
          { referenceId: "foreign-source", support: "Foreign source" },
        ],
      },
      [...references, { id: "foreign-source", status: "new" }],
    ),
    "ap-safety-news",
  );
});

test("a deleted, dismissed or denied citation falls back to an available opportunity source", () => {
  for (const available of [
    references.filter((reference) => reference.id !== "intel-operations"),
    references.map((reference) =>
      reference.id === "intel-operations"
        ? { ...reference, status: "dismissed" }
        : reference,
    ),
    references.map((reference) =>
      reference.id === "intel-operations"
        ? { ...reference, accessPolicy: { allowed: false } }
        : reference,
    ),
  ]) {
    assert.equal(
      opportunityDraftReferenceId(opportunity, analysis, available),
      "ap-safety-news",
    );
  }
});

test("the first valid current citation wins when an earlier citation is unavailable", () => {
  assert.equal(
    opportunityDraftReferenceId(
      opportunity,
      {
        ...analysis,
        citations: [
          { referenceId: "removed-source", support: "Unavailable" },
          ...analysis.citations,
        ],
      },
      references,
    ),
    "intel-operations",
  );
});

test("fallback skips unavailable references and an empty opportunity has no primary source", () => {
  assert.equal(
    opportunityDraftReferenceId(opportunity, null, references.slice(1)),
    "intel-operations",
  );
  assert.equal(
    opportunityDraftReferenceId(
      { ...opportunity, referenceIds: [] },
      analysis,
      references,
    ),
    undefined,
  );
  assert.equal(
    opportunityDraftReferenceId(opportunity, analysis, []),
    undefined,
  );
});
