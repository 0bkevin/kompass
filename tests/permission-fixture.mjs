import fs from "node:fs";
import path from "node:path";
import { isRestrictedCollectionUrl } from "../server/access-policy.mjs";

// Exercise the production policy reader with explicit, expiring operator
// records. This grants fixture transports only; it never authorizes a live site.
export function installPermissionFixture(directory, grants) {
  const now = Date.now();
  const purposes = new Set(["website", "metadata", "rss", "ai", "webhook"]);
  const policy = {
    version: 1,
    grants: grants.map(({ origin, pathPrefix, purposes: scopes }) => {
      const parsed = new URL(origin);
      if (
        parsed.protocol !== "https:" ||
        parsed.origin !== origin ||
        isRestrictedCollectionUrl(`${origin}${pathPrefix}`) ||
        typeof pathPrefix !== "string" ||
        !pathPrefix.startsWith("/") ||
        /[?#\\\r\n]|\.\./.test(pathPrefix) ||
        !Array.isArray(scopes) ||
        !scopes.length ||
        scopes.some((scope) => !purposes.has(scope))
      )
        throw new Error(
          "Fixture grants require an explicit permitted origin, path and purpose",
        );
      return {
        origin,
        pathPrefix,
        purposes: scopes,
        evidenceUrl:
          "https://permission.example.test/synthetic-fixture-agreement",
        reviewedAt: new Date(now - 60_000).toISOString(),
        expiresAt: new Date(now + 30 * 86_400_000).toISOString(),
        reviewedBy: "Synthetic test fixture operator",
        note: "Synthetic permission record for an explicitly mocked fixture transport; not evidence of live-site permission.",
      };
    }),
  };
  const filename = path.join(directory, "synthetic-source-access-policy.json");
  fs.writeFileSync(filename, JSON.stringify(policy));
  process.env.SOURCE_ACCESS_POLICY_FILE = filename;
  return filename;
}
