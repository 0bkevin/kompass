import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveAiConfig } from "../server/integration-config.mjs";
import { installPermissionFixture } from "./permission-fixture.mjs";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "radar-ai-data-mode-"));
process.env.DATA_DIR = directory;
process.env.DISCOVERY_ENABLED = "false";
const baseUrl = "https://generativelanguage.googleapis.com/v1beta/openai";
const environment = {
  OPENAI_API_KEY: "SYNTHETIC_PLATFORM_MODE_KEY",
  OPENAI_MODEL: "synthetic-gemini-model",
  OPENAI_BASE_URL: baseUrl,
  AI_DATA_MODE: "public-test",
};
Object.assign(process.env, environment);
const storage = await import("../server/db.mjs");
const { platformReadiness } = await import("../server/platform-readiness.mjs");
const brand = () => storage.saveBrand({ name: "Empresa ficticia de prueba" });
function review() {
  installPermissionFixture(directory, [
    {
      origin: "https://generativelanguage.googleapis.com",
      pathPrefix: "/v1beta/openai",
      purposes: ["ai"],
    },
  ]);
}
after(() => {
  storage.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("the explicit Gemini platform test mode is inherited without copying its credential", () => {
  review();
  for (const company of [brand(), brand()]) {
    const config = resolveAiConfig(null, environment);
    assert.equal(config.dataMode, "public-test");
    assert.equal(config.managedBy, "platform");
    const state = storage.publicIntegrations(company.id).ai;
    assert.equal(state.dataMode, "public-test");
    assert.equal(state.ready, true);
    assert.equal(state.managedBy, "platform");
    assert.equal(storage.getSecret(company.id, "ai"), null);
    assert.doesNotMatch(JSON.stringify(state), /SYNTHETIC_PLATFORM|apiKey/);
  }
  const report = platformReadiness();
  assert.equal(report.ai.dataMode, "public-test");
  assert.equal(report.ai.ready, true);
  assert.doesNotMatch(JSON.stringify(report), /SYNTHETIC_PLATFORM|apiKey/);
  assert.equal(
    resolveAiConfig(null, {
      ...environment,
      OPENAI_BASE_URL: `${baseUrl}/`,
    }).dataMode,
    "public-test",
  );
});

test("workspace credentials do not inherit the platform's Gemini data terms", () => {
  review();
  const company = brand();
  for (const ownBase of [baseUrl, "https://api.openai.com/v1"]) {
    const own = {
      apiKey: "SYNTHETIC_WORKSPACE_MODE_KEY",
      baseUrl: ownBase,
      model: "workspace-model",
      dataMode: "public-test",
    };
    assert.equal(resolveAiConfig(own, environment).dataMode, undefined);
    storage.setSecret(company.id, "ai", own);
    const state = storage.publicIntegrations(company.id).ai;
    assert.equal(state.dataMode, undefined);
    assert.equal(state.managedBy, "workspace");
    assert.doesNotMatch(JSON.stringify(state), /SYNTHETIC_|apiKey/);
  }
  storage.setSecret(company.id, "ai", null);
  assert.equal(
    storage.publicIntegrations(company.id).ai.dataMode,
    "public-test",
  );
});

test("other providers, disabled AI and an absent test-mode choice get no Gemini test label", () => {
  for (const ownBase of [
    "https://api.openai.com/v1",
    "https://generativelanguage.googleapis.com.example.test/v1beta/openai",
    "https://generativelanguage.googleapis.com/v1beta/other",
  ])
    assert.equal(
      resolveAiConfig(null, { ...environment, OPENAI_BASE_URL: ownBase })
        .dataMode,
      undefined,
    );
  for (const mode of [undefined, "", "paid", "PUBLIC-TEST"])
    assert.equal(
      resolveAiConfig(null, { ...environment, AI_DATA_MODE: mode }).dataMode,
      undefined,
    );
  assert.equal(resolveAiConfig({ disabled: true }, environment), null);
  assert.equal(
    resolveAiConfig(null, { ...environment, OPENAI_API_KEY: "" }),
    null,
  );
  const company = brand();
  storage.setSecret(company.id, "ai", { disabled: true });
  const state = storage.publicIntegrations(company.id).ai;
  assert.equal(state.ready, false);
  assert.equal(state.dataMode, undefined);
  assert.equal(state.managedBy, "local");
});

test("declaring public-test mode cannot enable a provider without its current access review", () => {
  installPermissionFixture(directory, []);
  const state = storage.publicIntegrations(brand().id).ai;
  assert.equal(state.configured, true);
  assert.equal(state.dataMode, "public-test");
  assert.equal(state.ready, false);
  assert.equal(platformReadiness().ai.ready, false);
});
