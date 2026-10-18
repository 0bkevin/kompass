import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installPermissionFixture } from "./permission-fixture.mjs";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "radar-ai-controls-"));
process.env.DATA_DIR = directory;
process.env.DISCOVERY_ENABLED = "false";
const database = await import("../server/db.mjs");
const { createDraft } = await import("../server/intelligence.mjs");
installPermissionFixture(directory, [
  {
    origin: "https://provider.example.test",
    pathPrefix: "/v1",
    purposes: ["ai"],
  },
]);
const brand = database.saveBrand({
  name: "QA de formación ejecutiva",
  audience: [
    { id: "leaders", name: "Líderes", needs: "Evaluar un piloto de IA" },
  ],
});
database.setSecret(brand.id, "ai", {
  apiKey: "SYNTHETIC_DRAFT_CONTROLS_KEY",
  model: "synthetic-model",
  baseUrl: "https://provider.example.test/v1",
});
const cta = "Elige un proceso para conversar con tu equipo.";
const controls = {
  format: "carousel",
  unitCount: 4,
  includeExample: true,
  cta,
};
const valid = () => ({
  title: "Elegir un primer piloto",
  hook: "¿Qué proceso conviene probar primero?",
  script: "Resumen general que no debe sustituir las láminas.",
  caption: "Una guía para revisar en equipo.",
  cta,
  scenes: [
    { text: "Elige un proceso repetitivo y de bajo riesgo.", duration: 5 },
    {
      text: "Define qué vas a observar y quién revisará el resultado.",
      duration: 5,
    },
    {
      text: "Ejemplo hipotético: un equipo organiza una lista pública de preguntas; no representa un caso real.",
      duration: 5,
    },
    { text: cta, duration: 5 },
  ],
});
const transport = (output) => ({
  fetcher: async () => Response.json({ output_text: JSON.stringify(output) }),
});
after(() => {
  database.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

for (const [name, output] of [
  [
    "missing the requested hypothetical example",
    {
      ...valid(),
      scenes: valid().scenes.map((scene, index) =>
        index === 2
          ? { text: "Define una métrica para la prueba.", duration: 5 }
          : scene,
      ),
    },
  ],
  [
    "missing a requested panel",
    { ...valid(), scenes: valid().scenes.slice(0, 3) },
  ],
  [
    "rewriting the exact requested CTA",
    { ...valid(), cta: "Cuéntanos qué piensas." },
  ],
]) {
  test(`AI output ${name} is rejected before persistence`, async () => {
    const before = database.listRecords(brand.id, "pieces").length;
    await assert.rejects(
      createDraft(brand, controls, transport(output)),
      (error) => error.status === 502 && /No se guardó/.test(error.message),
    );
    assert.equal(database.listRecords(brand.id, "pieces").length, before);
  });
}

test("AI panels reach the editable script and stored brief with their requested controls", async () => {
  const output = valid();
  const piece = await createDraft(brand, controls, transport(output));
  assert.equal(piece.generationEngine, "ai");
  assert.equal(piece.scenes.length, 4);
  for (const [index, scene] of output.scenes.entries()) {
    assert.ok(piece.script.includes(`Lámina ${index + 1}: ${scene.text}`));
  }
  assert.ok(!piece.script.includes(output.script));
  assert.match(piece.script, /Ejemplo hipotético/);
  assert.equal(piece.cta, cta);
  assert.equal(piece.editorialBrief.applied.unitCount, 4);
  assert.equal(piece.editorialBrief.applied.includeExample, true);
  assert.ok(
    piece.editorialBrief.notes.every((note) => !/estructura local/.test(note)),
  );
  assert.equal(
    database.getRecord(brand.id, "pieces", piece.id).script,
    piece.script,
  );
});

test("an exact CTA extracted from opportunity notes is enforced without a separate CTA field", async () => {
  const output = { ...valid(), cta: "La IA cambió el llamado solicitado." };
  const before = database.listRecords(brand.id, "pieces").length;
  await assert.rejects(
    createDraft(
      brand,
      {
        format: "carousel",
        unitCount: 4,
        instructions: `CTA exacto: «${cta}»`,
      },
      transport(output),
    ),
    (error) => error.status === 502 && /No se guardó/.test(error.message),
  );
  assert.equal(database.listRecords(brand.id, "pieces").length, before);
});
