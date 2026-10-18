import test from "node:test";
import assert from "node:assert/strict";
import { getOrUploadCaptureAsset } from "../src/lib/capture-retry.mjs";

test("reuses an uploaded capture asset when reference creation is retried", async () => {
  const firstFile = { name: "one.png" };
  const secondFile = { name: "two.png" };
  const cache = { current: null };
  const uploaded = [];
  const upload = async (file) => {
    const asset = { id: `asset-${uploaded.length + 1}` };
    uploaded.push({ file, asset });
    return asset;
  };

  const firstAttemptAsset = await getOrUploadCaptureAsset(
    firstFile,
    cache,
    upload,
  );
  const retryAsset = await getOrUploadCaptureAsset(firstFile, cache, upload);

  assert.equal(retryAsset, firstAttemptAsset);
  assert.deepEqual(
    uploaded.map(({ file }) => file.name),
    ["one.png"],
  );

  const changedFileAsset = await getOrUploadCaptureAsset(
    secondFile,
    cache,
    upload,
  );
  assert.equal(changedFileAsset.id, "asset-2");
  assert.deepEqual(
    uploaded.map(({ file }) => file.name),
    ["one.png", "two.png"],
  );
});
