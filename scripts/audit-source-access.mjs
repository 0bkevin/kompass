import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import {
  sourceAccessPolicy,
  referenceUsePolicy,
  ACCESS_POLICY_VERSION,
} from "../server/access-policy.mjs";

// Read-only inventory. No provider calls, credential decryption, deletion or
// automatic assertion that existing data is lawful.
const directory = process.argv[2];
if (!directory)
  throw new Error("Usage: node scripts/audit-source-access.mjs DATA_DIRECTORY");
const database = new DatabaseSync(
  path.join(path.resolve(directory), "radar.sqlite"),
  { readOnly: true },
);
try {
  const rows = database
    .prepare(
      "SELECT brand_id,kind,data FROM records WHERE kind IN ('sources','references')",
    )
    .all();
  const sources = rows
    .filter((row) => row.kind === "sources")
    .map((row) => ({ brandId: row.brand_id, source: JSON.parse(row.data) }));
  const references = rows
    .filter((row) => row.kind === "references")
    .map((row) => ({ brandId: row.brand_id, reference: JSON.parse(row.data) }));
  const restricted = references.filter(
    ({ brandId, reference }) =>
      !referenceUsePolicy(
        reference,
        sources.find(
          (row) =>
            row.brandId === brandId && row.source.id === reference.sourceId,
        )?.source,
      ).allowed,
  );
  const expiredYouTube = references.filter(({ reference }) => {
    if (
      reference.isDemo ||
      ![reference.platform, reference.ingestionProvider].includes("youtube")
    )
      return false;
    const observed = Date.parse(
      reference.metricsObservedAt ||
        reference.trend?.observedAt ||
        reference.createdAt,
    );
    return !Number.isFinite(observed) || Date.now() - observed > 30 * 86400000;
  });
  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        policyVersion: ACCESS_POLICY_VERSION,
        readOnly: true,
        networkCalls: 0,
        sources: sources.length,
        storedEnabledSourcesWithoutCurrentPermission: sources.filter(
          ({ source }) => source.enabled && !sourceAccessPolicy(source).allowed,
        ).length,
        references: references.length,
        restrictedReferences: restricted.length,
        youtubeReferencesRequiringRetentionReview: expiredYouTube.length,
        note: "Counts are an inventory under the current policy, not a legal certification. Historical data is not deleted by this command.",
      },
      null,
      2,
    ),
  );
} finally {
  database.close();
}
