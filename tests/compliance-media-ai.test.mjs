import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "radar-media-policy-"));
process.env.DATA_DIR = directory;
process.env.YOUTUBE_API_KEY = "environment-youtube-secret";
process.env.APIFY_API_TOKEN = "environment-apify-secret";
process.env.GEMINI_API_KEY = "environment-gemini-secret";

const { db, saveBrand, setSecret } = await import("../server/db.mjs");
const { fetchSocialSource } = await import("../server/social-providers.mjs");
const { getApifyBudgetStatus } = await import("../server/provider-budget.mjs");
const { assertVideoAnalysisAllowed } =
  await import("../server/access-policy.mjs");

after(() => {
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

for (const [provider, platform] of [
  ["youtube", "youtube"],
  ["apify", "instagram"],
  ["apify", "tiktok"],
]) {
  test(`${platform} stays blocked for environment and tenant keys, including spoofed grants`, async () => {
    const brand = saveBrand({ name: "Own account is not a platform grant" });
    let calls = 0;
    const fetcher = async () => {
      calls++;
      throw new Error("never call an unapproved provider");
    };
    const budgetBefore = getApifyBudgetStatus("environment-apify-secret");
    const source = {
      type: provider,
      platform,
      enabled: true,
      query: "our company",
      limit: 1,
      ownAccount: true,
      authorized: true,
      permission: true,
      termsAccepted: true,
      analyticsApproved: true,
      providerPermission: "user-entered-not-a-platform-grant",
      rights: { owner: true, processing: true },
    };
    await assert.rejects(
      fetchSocialSource(brand, source, { fetcher }),
      (error) => error.status === 403,
    );
    setSecret(
      brand.id,
      provider,
      provider === "apify"
        ? { apiToken: "tenant-secret" }
        : { apiKey: "tenant-secret" },
    );
    await assert.rejects(
      fetchSocialSource(brand, source, { fetcher }),
      (error) => error.status === 403,
    );
    assert.equal(calls, 0);
    assert.equal(
      getApifyBudgetStatus("environment-apify-secret").monthlyReservedUsd,
      budgetBefore.monthlyReservedUsd,
    );
    assert.equal(getApifyBudgetStatus("tenant-secret").monthlyReservedUsd, 0);
  });
}

test("video authorization metadata cannot bypass the server policy", () => {
  for (const reference of [
    { platform: "youtube", url: "https://youtube.com/watch?v=abcdefghijk" },
    {
      platform: "instagram",
      mediaProvider: "apify",
      mediaAccess: "provider_url",
    },
    { platform: "tiktok", mediaProvider: "apify", mediaAccess: "provider_url" },
    { assetId: "brand-upload", origin: "upload", rightsApproved: true },
    {
      authorized: true,
      rightsApproved: true,
      providerReviewed: true,
      paidService: true,
    },
  ]) {
    assert.throws(
      () => assertVideoAnalysisAllowed(reference),
      (error) => error.status === 403,
    );
  }
});
