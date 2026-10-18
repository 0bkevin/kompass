import { test } from "node:test";
import assert from "node:assert/strict";
import { safeAudienceEvidenceUrl } from "../src/lib/evidence-url.mjs";

test("community audience evidence links back to its generated public question", () => {
  const path = "/community/abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE";
  assert.equal(safeAudienceEvidenceUrl(path), path);
});

test("audience evidence retains absolute HTTP and HTTPS citations", () => {
  assert.equal(
    safeAudienceEvidenceUrl("https://example.org/30x-fixture/ventas-edtech"),
    "https://example.org/30x-fixture/ventas-edtech",
  );
  assert.equal(
    safeAudienceEvidenceUrl("http://example.org/evidence?q=ventas#sample"),
    "http://example.org/evidence?q=ventas#sample",
  );
});

test("audience evidence rejects executable URLs and unapproved internal paths", () => {
  const token = "abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE";
  for (const unsafe of [
    undefined,
    "",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "//example.org/community/" + token,
    "\\\\example.org\\community\\" + token,
    "/audience",
    "/api/session",
    "/community/short",
    "/community/" + token + "extra",
    "/community/" + token + "/",
    "/community/" + token + "?next=https://example.org",
    "/community/" + token + "#results",
    " /community/" + token,
    "/community/" + token + "\n",
    "/community/../audience",
    "/community/" + token + "/../../audience",
    "/community/%2e%2e/audience",
    "/community/%2f" + token,
    "/community/" + token.slice(0, -1) + "%",
  ]) {
    assert.equal(safeAudienceEvidenceUrl(unsafe), undefined, String(unsafe));
  }
});
