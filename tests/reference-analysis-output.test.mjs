import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installPermissionFixture } from "./permission-fixture.mjs";

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "radar-reference-output-"),
);
process.env.DATA_DIR = directory;
process.env.DISCOVERY_ENABLED = "false";
process.env.OPENAI_API_KEY = "SYNTHETIC_REFERENCE_OUTPUT_KEY";
process.env.OPENAI_MODEL = "synthetic-model";
installPermissionFixture(directory, [
  {
    origin: "https://model.example.test",
    pathPrefix: "/v1",
    purposes: ["ai"],
  },
  {
    origin: "https://generativelanguage.googleapis.com",
    pathPrefix: "/v1beta/openai",
    purposes: ["ai"],
  },
]);
const storage = await import("../server/db.mjs");
const { analyzeReference } = await import("../server/intelligence.mjs");
const validOutput = {
  hook: "Una decisión concreta antes de automatizar",
  hypothesis: "Una pregunta inicial podría ayudar a identificar la necesidad.",
  adaptation: "Proponer un caso propio que el equipo pueda contrastar.",
};
const transports = [
  {
    name: "Responses",
    baseUrl: "https://model.example.test/v1",
    response: (value) => Response.json({ output_text: JSON.stringify(value) }),
  },
  {
    name: "Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    response: (value) =>
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: { role: "assistant", content: JSON.stringify(value) },
          },
        ],
      }),
  },
];
function fixture() {
  const brand = storage.saveBrand({
    name: "Empresa ficticia para validar resultados",
    industry: "Educación",
    market: "México",
    audience: [
      { id: "leaders", name: "Líderes", needs: "Organizar el equipo" },
    ],
  });
  const reference = storage.saveRecord(brand.id, "references", {
    title: "Una tarea repetida para revisar",
    text: "Texto propio sintético que el equipo compartió para analizar.",
    format: "article",
    source: "manual",
    status: "saved",
    analysis: {
      ...validOutput,
      engine: "heuristic",
      confidence: "low",
    },
  });
  return { brand, reference };
}
after(() => {
  storage.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

for (const transport of transports) {
  test(`${transport.name}: malformed analysis fields reject without changing the saved reference`, async () => {
    process.env.OPENAI_BASE_URL = transport.baseUrl;
    const { brand, reference } = fixture();
    for (const field of Object.keys(validOutput)) {
      for (const invalid of [undefined, null, 7, true, [], {}, "", " \n\t "]) {
        let calls = 0;
        await assert.rejects(
          analyzeReference(brand, reference, {
            fetcher: async () => {
              calls++;
              return transport.response({ ...validOutput, [field]: invalid });
            },
          }),
          (error) =>
            error.status === 502 &&
            /campos inválidos/.test(error.message) &&
            /No se guardó/.test(error.message),
          `${field} must reject ${JSON.stringify(invalid)}`,
        );
        assert.equal(calls, 1);
        assert.deepEqual(
          storage.getRecord(brand.id, "references", reference.id),
          reference,
          "the prior analysis, reference fields and timestamps must survive",
        );
      }
    }
  });

  test(`${transport.name}: valid analysis is trimmed, bounded and saved as AI`, async () => {
    process.env.OPENAI_BASE_URL = transport.baseUrl;
    const { brand, reference } = fixture();
    const result = await analyzeReference(brand, reference, {
      fetcher: async () =>
        transport.response({
          hook: `  ${"g".repeat(1100)}  `,
          hypothesis: `  ${"h".repeat(5100)}  `,
          adaptation: `  ${"a".repeat(5100)}  `,
        }),
    });
    assert.equal(result.analysis.hook, "g".repeat(1000));
    assert.equal(result.analysis.hypothesis, "h".repeat(5000));
    assert.equal(result.analysis.adaptation, "a".repeat(5000));
    assert.equal(result.analysis.engine, "ai");
    assert.equal(result.status, "saved");
    assert.equal(
      storage.getRecord(brand.id, "references", reference.id).analysis.hook,
      result.analysis.hook,
    );
  });
}

test("local reference analysis still works when the external provider is disabled", async () => {
  const { brand, reference } = fixture();
  storage.setSecret(brand.id, "ai", { disabled: true });
  const result = await analyzeReference(brand, reference, {
    fetcher: async () => {
      assert.fail("the local engine must not contact an AI provider");
    },
  });
  assert.equal(result.analysis.engine, "heuristic");
  assert.equal(result.status, "saved");
  for (const field of Object.keys(validOutput))
    assert.equal(typeof result.analysis[field], "string");
});
