import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installPermissionFixture } from "./permission-fixture.mjs";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kompass-managed-ai-"));
process.env.DATA_DIR = directory;
process.env.OPENAI_API_KEY = "";
process.env.PLATFORM_TEXT_PROVIDER = "codex-chatgpt";
process.env.RADAR_CODEX_BINARY = "/missing/synthetic/codex";
const storage = await import("../server/db.mjs");
const { resolveAiConfig } = await import("../server/integration-config.mjs");
const { generateStructured } = await import("../server/connectors.mjs");
const brand = storage.saveBrand({ name: "Equipo QA", audience: [] });
after(() => {
  storage.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
const request = {
  name: "public_editorial",
  schema: {
    type: "object",
    properties: { summary: { type: "string" } },
    required: ["summary"],
    additionalProperties: false,
  },
  instructions: "Usa únicamente el material público proporcionado.",
  input: "Una pregunta de audiencia y una referencia pública.",
};
function permissions() {
  installPermissionFixture(directory, [
    { origin: "https://chatgpt.com", pathPrefix: "/", purposes: ["ai"] },
    { origin: "https://model.example", pathPrefix: "/v1", purposes: ["ai"] },
  ]);
}

test("managed configuration has no API key and preserves explicit workspace choices", () => {
  const managed = resolveAiConfig(null);
  assert.equal(managed.provider, "codex-chatgpt");
  assert.equal(managed.managedBy, "platform");
  assert.equal(managed.apiKey, undefined);
  assert.equal(resolveAiConfig({ disabled: true }), null);
  const own = resolveAiConfig({
    apiKey: "workspace-synthetic-key",
    baseUrl: "https://model.example/v1",
    model: "own-model",
  });
  assert.equal(own.managedBy, "workspace");
  assert.equal(own.baseUrl, "https://model.example/v1");
});

test("reviewed managed text uses its bounded worker without making an API request", async () => {
  permissions();
  let calls = 0;
  const result = await generateStructured(brand.id, request, {
    fetcher: () => {
      throw new Error("API billing must not be selected");
    },
    managedGenerator: async (input) => {
      calls++;
      assert.deepEqual(input.schema, request.schema);
      assert.equal(input.input, request.input);
      return { summary: "Lectura del texto público." };
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.summary, "Lectura del texto público.");
  const status = storage.publicIntegrations(brand.id).ai;
  assert.equal(status.configured, true);
  assert.equal(status.ready, false);
  assert.equal(status.managedBy, "platform");
  assert.equal(status.provider, "codex-chatgpt");
  assert.ok(!JSON.stringify(status).includes("/missing/"));
});

test("permissions, private content and image input stop before managed generation", async () => {
  let calls = 0;
  const options = {
    managedGenerator: async () => {
      calls++;
    },
  };
  delete process.env.SOURCE_ACCESS_POLICY_FILE;
  await assert.rejects(
    generateStructured(brand.id, request, options),
    (error) => error.status === 403,
  );
  permissions();
  await assert.rejects(
    generateStructured(
      brand.id,
      { ...request, input: "Email: private-person@example.test" },
      options,
    ),
    (error) => error.code === "PUBLIC_CONTENT_PRIVACY",
  );
  await assert.rejects(
    generateStructured(
      brand.id,
      { ...request, image: "data:image/png;base64,AAAA" },
      options,
    ),
    (error) => error.status === 400,
  );
  assert.equal(calls, 0);
});

test("an enabled worker failure never falls back to a paid API provider", async () => {
  permissions();
  let httpCalls = 0;
  await assert.rejects(
    generateStructured(brand.id, request, {
      fetcher: () => {
        httpCalls++;
      },
      managedGenerator: async () => {
        throw Object.assign(new Error("Límite de ChatGPT"), { status: 429 });
      },
    }),
    (error) => error.status === 429,
  );
  assert.equal(httpCalls, 0);
});
