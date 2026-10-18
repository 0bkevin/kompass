import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "radar-interactive-company-"),
);
process.env.DATA_DIR = dataDir;
const { inspectCompany } = await import("../server/company-context.mjs");
const { db } = await import("../server/db.mjs");

after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("owned text preserves an explicit audience's role and industry before generic topic suggestions", async () => {
  let networkReads = 0;
  const result = await inspectCompany(
    {
      text: "Ayudamos a CEOs de empresas EdTech que necesitan mejorar procesos de ventas.",
    },
    {
      fetcher: async () => {
        networkReads += 1;
        throw new Error("Owned text must not trigger network reads");
      },
    },
  );
  assert.equal(networkReads, 0);
  assert.equal(result.draft.audience[0]?.name, "CEOs de empresas EdTech");
  assert.equal(result.draft.audience[0]?.role, "CEOs de empresas EdTech");
  assert.match(
    result.draft.audience[0]?.needs || "",
    /mejorar procesos de ventas/i,
  );
  assert.equal(result.draft.audience[0]?.stage, "Por confirmar");
});

test("the complete 30X onboarding text keeps its declared EdTech CEO audience without reading citation links", async () => {
  const result = await inspectCompany(
    {
      website: "https://example.com/30x-company-entry",
      urls: ["https://www.youtube.com/@30xSyntheticCitation"],
      text: "Empresa: 30X\n30X enseña inteligencia artificial práctica a líderes y equipos de América Latina. Ofrecemos talleres de IA aplicada y acompañamiento para mejorar procesos de ventas. Ayudamos a CEOs de empresas EdTech que necesitan mejorar su proceso comercial, dar seguimiento a oportunidades y convertir más ventas. Nuestra voz es clara, cercana y orientada a resultados. Trabajamos en español en Latinoamérica.",
    },
    {
      fetcher: async () => {
        assert.fail(
          "Unapproved website and social citations must remain unread",
        );
      },
    },
  );
  assert.equal(result.draft.name, "30X");
  assert.equal(result.draft.audience.length, 1);
  assert.equal(result.draft.audience[0].name, "CEOs de empresas EdTech");
  assert.equal(result.draft.audience[0].role, "CEOs de empresas EdTech");
  assert.equal(
    result.draft.audience[0].needs,
    "mejorar su proceso comercial, dar seguimiento a oportunidades y convertir más ventas",
  );
  assert.deepEqual(
    result.evidence.map((item) => item.status),
    ["linked", "linked", "provided"],
  );
});

test("generic topic suggestions remain the fallback when no affirmative audience is declared", async () => {
  const result = await inspectCompany({
    text: "No ayudamos a CEOs de empresas EdTech que necesitan mejorar procesos de ventas. Nuestro contenido cubre ventas y productividad.",
  });
  assert.equal(result.draft.audience[0]?.name, "Equipos comerciales");
  assert.doesNotMatch(result.draft.audience[0]?.role || "", /CEOs|EdTech/);
});
