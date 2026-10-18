import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "radar-company-health-topics-"),
);
process.env.DATA_DIR = dataDir;
const { inspectCompany } = await import("../server/company-context.mjs");
const { db } = await import("../server/db.mjs");

after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const actualCompanyInput =
  "30X ofrece formación ejecutiva para founders, líderes y equipos de Latinoamérica. Sus áreas incluyen ventas, crecimiento y aplicación estratégica de inteligencia artificial por directores y equipos. Audiencia editorial propuesta: líderes y equipos latinoamericanos interesados en aplicar IA con criterio en su trabajo. Es una hipótesis editorial, no una medición de alumnos o seguidores. Contenido educativo propio, claro y accionable; sin promesas de resultados, estadísticas inventadas ni casos de clientes. Contexto manual de prueba: paráfrasis original de hechos públicos verificados en https://30x.com/; no importación automática ni publicación de 30X.";

async function inspect(text) {
  return inspectCompany(
    { text },
    {
      fetcher: async () => {
        assert.fail("Provided text must not trigger a network request");
      },
    },
  );
}

test("actual 30X public-fact context does not mistake measurement for healthcare", async () => {
  const { draft } = await inspect(actualCompanyInput);
  assert.ok(!draft.pillars.includes("Innovación en salud"));
  assert.ok(draft.audience.every((segment) => !/salud/i.test(segment.name)));
  assert.ok(draft.pillars.includes("Aplicación de inteligencia artificial"));
  assert.equal(draft.industry, "Educación y formación");
});

test("Spanish measurement words do not introduce a medical audience or topic", async () => {
  for (const word of ["medición", "medicion", "mediciones"]) {
    const { draft } = await inspect(`Analizamos la ${word} del contenido.`);
    assert.ok(!draft.pillars.includes("Innovación en salud"), word);
    assert.ok(
      draft.audience.every((segment) => !/salud/i.test(segment.name)),
      word,
    );
  }
});

test("actual medical context still suggests the healthcare topic and audience", async () => {
  for (const text of [
    "Formación para médicos y médicas de Latinoamérica.",
    "Actualizaciones de medicina para equipos profesionales.",
    "Innovación y seguridad de medicamentos para profesionales.",
    "Medical operations and professional education.",
    "Gestión de medicación y uso seguro de tratamientos.",
  ]) {
    const { draft } = await inspect(text);
    assert.ok(draft.pillars.includes("Innovación en salud"), text);
    assert.ok(
      draft.audience.some((segment) => /salud/i.test(segment.name)),
      text,
    );
  }
});
