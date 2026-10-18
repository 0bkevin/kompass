import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("required media fails deployment checks when disabled rather than reporting configuration success", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/check-integrations.mjs", "--require-media"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        MEDIA_GENERATION_ENABLED: "false",
        SOURCE_ACCESS_POLICY_FILE: "",
      },
    },
  );
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.media.runtime.image.ready, false);
  assert.equal(report.media.runtime.video.ready, false);
  assert.equal(report.media.verification, "runtime-prerequisites-only");
  assert.equal(report.media.liveGenerationVerified, false);
});

test("a missing Codex installation fails the media gate without a generation request", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/check-integrations.mjs", "--require-media"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        MEDIA_GENERATION_ENABLED: "true",
        RADAR_CODEX_BINARY: "/nonexistent/kompass-codex-qa",
      },
    },
  );
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.media.runtime.image.ready, false);
  assert.equal(report.media.liveGenerationVerified, false);
});
