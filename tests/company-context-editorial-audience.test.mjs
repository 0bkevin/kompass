import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installPermissionFixture } from "./permission-fixture.mjs";

const dataDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "radar-company-editorial-audience-"),
);
process.env.DATA_DIR = dataDir;
installPermissionFixture(dataDir, [
  {
    origin: "https://company-audience-fixture.com",
    pathPrefix: "/",
    purposes: ["website"],
  },
]);
const { inspectCompany } = await import("../server/company-context.mjs");
const { db } = await import("../server/db.mjs");

after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("actual 30X context keeps the explicitly proposed editorial audience before broad commercial topics", async () => {
  const result = await inspectCompany(
    {
      website: "https://30x.com/",
      urls: ["https://www.instagram.com/crece30x/"],
      text: "30X ofrece formación ejecutiva para founders, líderes y equipos de Latinoamérica. Sus áreas incluyen ventas, crecimiento y aplicación estratégica de inteligencia artificial por directores y equipos. Audiencia editorial propuesta: líderes y equipos latinoamericanos interesados en aplicar IA con criterio en su trabajo. Es una hipótesis editorial, no una medición de alumnos o seguidores. Contenido educativo propio, claro y accionable; sin promesas de resultados, estadísticas inventadas ni casos de clientes. Contexto manual de prueba: paráfrasis original de hechos públicos verificados en https://30x.com/; no importación automática ni publicación de 30X.",
    },
    {
      fetcher: async () => {
        assert.fail(
          "Unapproved company and Instagram links must remain unread",
        );
      },
    },
  );
  assert.equal(result.draft.audience.length, 1);
  const [audience] = result.draft.audience;
  assert.equal(audience.name, "líderes y equipos latinoamericanos");
  assert.equal(audience.role, "líderes y equipos latinoamericanos");
  assert.equal(audience.needs, "aplicar IA con criterio en su trabajo");
  assert.equal(audience.stage, "Por confirmar");
  assert.match(audience.description, /Hipótesis/);
  assert.match(audience.description, /no procede de perfiles de consumidores/);
  assert.ok(!result.draft.pillars.includes("Innovación en salud"));
  assert.deepEqual(
    result.evidence.map((item) => item.status),
    ["linked", "linked", "provided"],
  );
});

test("a plain proposed audience is preserved without inventing its interests", async () => {
  const { draft } = await inspectCompany({
    text: "Audiencia editorial propuesta: directoras de operaciones. Compartimos formación de ventas.",
  });
  assert.equal(draft.audience.length, 1);
  assert.equal(draft.audience[0].name, "directoras de operaciones");
  assert.equal(draft.audience[0].stage, "Por confirmar");
  assert.match(draft.audience[0].needs, /Validar/);
  assert.doesNotMatch(draft.audience[0].needs, /ventas|seguidores|alumnos/);
});

test("negated and empty editorial labels do not override topic suggestions", async () => {
  for (const text of [
    "No usar audiencia editorial propuesta: compradores. Compartimos contenidos de ventas.",
    "Audiencia editorial propuesta: . Compartimos contenidos de ventas.",
  ]) {
    const { draft } = await inspectCompany({ text });
    assert.equal(draft.audience[0]?.name, "Equipos comerciales");
  }
});

test("an audience label inside website content is never treated as a team declaration", async () => {
  const result = await inspectCompany(
    { website: "https://company-audience-fixture.com/" },
    {
      lookup: async () => [{ address: "93.184.215.14", family: 4 }],
      fetcher: async () =>
        new Response(
          "<html><head><title>Example company</title></head><body><p>Audiencia editorial propuesta: compradores interesados en contratar más ventas. Publicamos formación comercial para equipos.</p></body></html>",
          { headers: { "content-type": "text/html" } },
        ),
    },
  );
  assert.equal(result.evidence[0].status, "read");
  assert.equal(result.draft.audience[0]?.name, "Equipos comerciales");
  assert.ok(
    result.draft.audience.every((audience) => audience.name !== "compradores"),
  );
});
