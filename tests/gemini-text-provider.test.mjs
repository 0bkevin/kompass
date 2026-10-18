import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installPermissionFixture } from "./permission-fixture.mjs";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "radar-gemini-text-"));
process.env.DATA_DIR = directory;
process.env.DISCOVERY_ENABLED = "false";
const baseUrl = "https://generativelanguage.googleapis.com/v1beta/openai";
process.env.OPENAI_API_KEY = "SYNTHETIC_GEMINI_TRANSPORT_KEY";
process.env.OPENAI_MODEL = "synthetic-gemini-model";
process.env.OPENAI_BASE_URL = baseUrl;
const database = await import("../server/db.mjs");
const { generateStructured } = await import("../server/connectors.mjs");
const { createDraft } = await import("../server/intelligence.mjs");
const { providerAccessPolicy } = await import("../server/access-policy.mjs");
const brand = database.saveBrand({
  name: "Empresa ficticia para pruebas",
  industry: "Educación",
  market: "México",
  audience: [{ id: "leaders", name: "Líderes", needs: "Organizar el equipo" }],
});
function allow(
  origin = "https://generativelanguage.googleapis.com",
  pathPrefix = "/v1beta/openai",
) {
  installPermissionFixture(directory, [
    { origin, pathPrefix, purposes: ["ai"] },
  ]);
}
const input = {
  name: "synthetic_result",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["ok"],
    properties: { ok: { type: "boolean" } },
  },
  instructions: "Synthetic test instruction.",
  input: "Synthetic test data.",
};
const completion = (content = '{"ok":true}', extra = {}) =>
  Response.json({
    choices: [
      {
        finish_reason: "stop",
        message: { role: "assistant", content },
        ...extra,
      },
    ],
  });
after(() => {
  database.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("official Gemini base sends its documented chat schema and reads a completed JSON object", async () => {
  allow();
  let calls = 0;
  const result = await generateStructured(brand.id, input, {
    fetcher: async (url, options) => {
      calls++;
      assert.equal(url, `${baseUrl}/chat/completions`);
      assert.equal(options.requireHttps, true);
      assert.equal(options.policyPurpose, "ai");
      assert.equal(options.maxRedirects, 0);
      assert.equal(options.method, "POST");
      assert.equal(
        options.headers.authorization,
        "Bearer SYNTHETIC_GEMINI_TRANSPORT_KEY",
      );
      const body = JSON.parse(options.body);
      assert.deepEqual(body, {
        model: "synthetic-gemini-model",
        reasoning_effort: "low",
        messages: [
          { role: "system", content: input.instructions },
          { role: "user", content: [{ type: "text", text: input.input }] },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: input.name, strict: true, schema: input.schema },
        },
      });
      // store:false is an OpenAI option, not a privacy promise for Gemini.
      assert.equal("store" in body, false);
      return completion();
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { ok: true });
});

test("the official trailing slash is accepted and text remains bounded", async () => {
  process.env.OPENAI_BASE_URL = `${baseUrl}/`;
  try {
    await generateStructured(
      brand.id,
      { ...input, input: "a".repeat(70000) },
      {
        fetcher: async (url, options) => {
          assert.equal(url, `${baseUrl}/chat/completions`);
          assert.equal(
            JSON.parse(options.body).messages[1].content[0].text.length,
            60000,
          );
          return completion();
        },
      },
    );
  } finally {
    process.env.OPENAI_BASE_URL = baseUrl;
  }
});

test("own image data uses Gemini's image shape while third-party image URLs fail before transport", async () => {
  const image = "data:image/png;base64,aGVsbG8=";
  await generateStructured(
    brand.id,
    { ...input, image },
    {
      fetcher: async (_url, options) => {
        assert.deepEqual(JSON.parse(options.body).messages[1].content[1], {
          type: "image_url",
          image_url: { url: image },
        });
        return completion();
      },
    },
  );
  let calls = 0;
  await assert.rejects(
    generateStructured(
      brand.id,
      { ...input, image: "https://example.test/image.png" },
      {
        fetcher: async () => {
          calls++;
          return completion();
        },
      },
    ),
    { status: 403 },
  );
  assert.equal(calls, 0);
});

test("a valid Gemini key does not bypass an absent or incorrectly scoped access review", async () => {
  let calls = 0;
  for (const pathPrefix of ["/v1beta/openai/chat", "/v1beta/other"]) {
    allow("https://generativelanguage.googleapis.com", pathPrefix);
    await assert.rejects(
      generateStructured(brand.id, input, {
        fetcher: async () => {
          calls++;
          return completion();
        },
      }),
      { status: 403, code: "SOURCE_ACCESS_RESTRICTED" },
    );
  }
  assert.equal(calls, 0);
  assert.equal(providerAccessPolicy("gemini").allowed, false);
  allow();
});

test("Gemini refusals, safety blocks, truncated content and invalid JSON never become results", async () => {
  for (const response of [
    () => completion('{"ok":true}', { finish_reason: "length" }),
    () => completion('{"ok":true}', { finish_reason: "content_filter" }),
    () =>
      completion('{"ok":true}', {
        message: { content: '{"ok":true}', refusal: "Blocked" },
      }),
    () =>
      completion('{"ok":true}', {
        message: { content: '{"ok":true}', tool_calls: [{ id: "call" }] },
      }),
    () => completion(null),
    () => completion("[]"),
    () => completion("null"),
    () => completion("not JSON"),
    () => Response.json({ choices: [] }),
    () => Response.json(null),
    () =>
      new Response("not JSON", {
        headers: { "content-type": "application/json" },
      }),
  ]) {
    await assert.rejects(
      generateStructured(brand.id, input, { fetcher: async () => response() }),
      {
        status: 502,
      },
    );
  }
});

test("provider HTTP errors are actionable and do not disclose remote bodies or credentials", async () => {
  for (const status of [400, 401, 403, 429, 503]) {
    await assert.rejects(
      generateStructured(brand.id, input, {
        fetcher: async () =>
          new Response("SENSITIVE_REMOTE_DETAIL", { status }),
      }),
      (error) =>
        error.status === 502 &&
        error.message.includes(`HTTP ${status}`) &&
        !/SENSITIVE|TRANSPORT_KEY/.test(error.message),
    );
  }
});

test("a lookalike reviewed hostname retains the Responses transport", async () => {
  const origin = "https://generativelanguage.googleapis.com.example.test";
  allow(origin, "/v1beta/openai");
  process.env.OPENAI_BASE_URL = `${origin}/v1beta/openai`;
  try {
    await generateStructured(brand.id, input, {
      fetcher: async (url, options) => {
        assert.equal(url, `${origin}/v1beta/openai/responses`);
        const body = JSON.parse(options.body);
        assert.equal(body.store, false);
        assert.equal(body.instructions, input.instructions);
        assert.deepEqual(body.text.format.schema, input.schema);
        assert.equal("messages" in body, false);
        assert.equal("reasoning_effort" in body, false);
        return Response.json({ output_text: '{"ok":true}' });
      },
    });
  } finally {
    process.env.OPENAI_BASE_URL = baseUrl;
    allow();
  }
});

test("a draft traverses the real Gemini adapter, validates and persists its nested scene schema", async () => {
  const generated = {
    title: "Una pregunta antes de automatizar",
    hook: "¿Qué tarea repetida consume más tiempo?",
    script:
      "Elige una tarea, registra el proceso y valida el resultado con tu equipo.",
    caption: "Una propuesta práctica para el equipo.",
    cta: "Elige una tarea para revisar.",
    scenes: [
      { text: "Empieza con una tarea concreta.", duration: 5 },
      { text: "Anota el punto de partida.", duration: 5 },
      { text: "Prueba una alternativa.", duration: 5 },
      { text: "Revisa el resultado con tu equipo.", duration: 5 },
      { text: "Elige una tarea para revisar.", duration: 5 },
    ],
  };
  let calls = 0;
  const draft = await createDraft(
    brand,
    { topic: "Organización del equipo", format: "reel", channel: "instagram" },
    {
      fetcher: async (url, options) => {
        calls++;
        assert.equal(url, `${baseUrl}/chat/completions`);
        const body = JSON.parse(options.body);
        assert.equal(body.response_format.json_schema.name, "content_draft");
        assert.equal(
          body.response_format.json_schema.schema.properties.scenes.items
            .properties.duration.type,
          "number",
        );
        assert.match(
          body.messages[1].content[0].text,
          /Empresa ficticia para pruebas/,
        );
        return completion(JSON.stringify(generated));
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(draft.generationEngine, "ai");
  assert.equal(draft.title, generated.title);
  assert.deepEqual(
    draft.scenes.map(({ text, duration }) => ({ text, duration })),
    generated.scenes,
  );
  assert.equal(
    database.getRecord(brand.id, "pieces", draft.id).script,
    generated.scenes
      .map((scene, index) => `Escena ${index + 1}: ${scene.text}`)
      .join("\n\n"),
  );
  assert.equal(database.getSecret(brand.id, "ai"), null);
});
