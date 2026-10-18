import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-draft-contract-"));
process.env.DATA_DIR = dataDir;
delete process.env.OPENAI_API_KEY;

let server;
let origin;
let dbModule;
let ownerCookie;
let workspace;
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

async function request(route, { method = "GET", body, cookie } = {}) {
  const response = await fetch(`${origin}/api${route}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    data: response.headers.get("content-type")?.includes("application/json")
      ? await response.json()
      : await response.text(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}

before(async () => {
  const { createApp } = await import("../server/index.mjs");
  dbModule = await import("../server/db.mjs");
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;

  const registration = await request("/auth/register", {
    method: "POST",
    body: {
      name: "Equipo de prueba",
      email: `draft-${randomUUID()}@example.com`,
      password: "secret-password-30x",
    },
  });
  assert.equal(registration.status, 201, JSON.stringify(registration.data));
  ownerCookie = registration.cookie;
  const brandResponse = await request("/brands", {
    method: "POST",
    cookie: ownerCookie,
    body: {
      name: "Marca de prueba",
      industry: "Marketing",
      audience: [
        {
          name: "Directores de marketing",
          role: "Director",
          needs: "Automatización con criterio",
          stage: "Explorar",
        },
      ],
    },
  });
  assert.equal(brandResponse.status, 201, JSON.stringify(brandResponse.data));
  workspace = brandResponse.data;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  dbModule?.db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("10,000-character accepted instructions produce a draft that the piece PATCH can save", async () => {
  const instructions = "I".repeat(10000);
  const generated = await request(`/brands/${workspace.id}/draft`, {
    method: "POST",
    cookie: ownerCookie,
    body: { instructions },
  });
  assert.equal(generated.status, 200, JSON.stringify(generated.data));
  assert.equal(generated.data.generationEngine, "heuristic");
  assert.equal(generated.data.editorialBrief.instructions, instructions);
  for (const field of ["title", "hook", "script", "caption", "cta"])
    assert.ok(!generated.data[field].includes(instructions), field);
  assert.ok(generated.data.title.length <= 200);
  assert.ok(generated.data.hook.length < 300);
  assert.ok(generated.data.hook.length <= 2000);
  assert.ok(generated.data.scenes.every((scene) => scene.text.length <= 4000));

  const saved = await request(
    `/brands/${workspace.id}/pieces/${generated.data.id}`,
    {
      method: "PATCH",
      cookie: ownerCookie,
      body: {
        title: generated.data.title,
        hook: generated.data.hook,
        script: generated.data.script,
        caption: generated.data.caption,
        cta: "CTA actualizado",
        scenes: generated.data.scenes,
      },
    },
  );
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.cta, "CTA actualizado");
  assert.equal(saved.data.script, generated.data.script);
  assert.deepEqual(saved.data.editorialBrief, generated.data.editorialBrief);
});

test("provider drafts are bounded to every editable piece limit before persistence", async () => {
  const { setSecret } = dbModule;
  const { createDraft } = await import("../server/intelligence.mjs");
  const { PIECE_LIMITS } = await import("../server/piece-contract.mjs");
  setSecret(workspace.id, "ai", {
    apiKey: "sk-test-only",
    model: "test-model",
    baseUrl: "https://provider.example/v1",
  });
  const generated = {
    title: "t".repeat(PIECE_LIMITS.title + 10),
    hook: "h".repeat(PIECE_LIMITS.hook + 10),
    script: "s".repeat(PIECE_LIMITS.script + 10),
    caption: "c".repeat(PIECE_LIMITS.caption + 10),
    cta: "a".repeat(PIECE_LIMITS.cta + 10),
    scenes: Array.from({ length: PIECE_LIMITS.scenes + 3 }, (_, index) => ({
      text: "x".repeat(PIECE_LIMITS.sceneText + 1),
      duration: index === 0 ? 0 : index === 1 ? 90 : 5,
    })),
  };
  const piece = await createDraft(
    dbModule.getBrand(workspace.id),
    { instructions: "Crear un guion educativo" },
    { fetcher: async () => json({ output_text: JSON.stringify(generated) }) },
  );

  assert.equal(piece.generationEngine, "ai");
  for (const field of ["title", "hook", "script", "caption", "cta"])
    assert.ok(piece[field].length <= PIECE_LIMITS[field], field);
  assert.equal(piece.scenes.length, PIECE_LIMITS.scenes);
  assert.ok(
    piece.scenes.every((scene) => scene.text.length <= PIECE_LIMITS.sceneText),
  );
  assert.equal(piece.scenes[0].duration, 1);
  assert.equal(piece.scenes[1].duration, 60);
  const saved = await request(`/brands/${workspace.id}/pieces/${piece.id}`, {
    method: "PATCH",
    cookie: ownerCookie,
    body: {
      title: piece.title,
      hook: piece.hook,
      script: piece.script,
      caption: piece.caption,
      cta: "CTA del roundtrip",
      scenes: piece.scenes,
    },
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.cta, "CTA del roundtrip");
  assert.equal(saved.data.scenes.length, PIECE_LIMITS.scenes);
  setSecret(workspace.id, "ai", null);
});

test("long reference analysis and maximum-size segment fields stay within the draft contract", async () => {
  const { getBrand, saveBrand, saveRecord } = dbModule;
  const { createDraft } = await import("../server/intelligence.mjs");
  const brand = getBrand(workspace.id);
  brand.audience = [
    {
      ...brand.audience[0],
      id: "long-context-segment",
      name: "A".repeat(150),
      needs: "N".repeat(3000),
    },
  ];
  saveBrand(brand);
  const reference = saveRecord(workspace.id, "references", {
    title: "R".repeat(300),
    text: "Contexto de referencia largo.",
    analysis: {
      adaptation: "E".repeat(5000),
      segmentIds: ["long-context-segment"],
    },
  });
  const piece = await createDraft(getBrand(workspace.id), {
    referenceId: reference.id,
    segmentId: "long-context-segment",
  });
  assert.equal(piece.generationEngine, "heuristic");
  assert.equal(piece.editorialBrief.angle, "E".repeat(5000));
  assert.equal(piece.editorialBrief.audienceNeeds, "N".repeat(3000));
  assert.ok(!piece.script.includes("E".repeat(5000)));
  assert.ok(!piece.script.includes("N".repeat(3000)));
  assert.ok(piece.script.includes("N".repeat(100)));
  assert.ok(piece.title.length <= 200);
  assert.ok(piece.hook.length <= 2000);
  assert.ok(piece.script.length <= 50000);
  assert.ok(piece.caption.length <= 10000);
  assert.ok(piece.cta.length <= 2000);
  assert.ok(piece.scenes.length <= 50);
  assert.ok(piece.scenes.every((scene) => scene.text.length <= 4000));
});

test("invalid provider field and scene types fail without persisting an AI draft", async () => {
  const { saveBrand, listRecords, setSecret } = dbModule;
  const { createDraft } = await import("../server/intelligence.mjs");
  const brand = saveBrand({
    name: "Marca inválida",
    industry: "Educación",
    audience: [{ id: "audience", name: "Docentes", needs: "Ahorrar tiempo" }],
  });
  setSecret(brand.id, "ai", {
    apiKey: "sk-test-only",
    model: "test-model",
    baseUrl: "https://provider.example/v1",
  });
  const valid = {
    title: "Título válido",
    hook: "Gancho válido",
    script: "Guion válido",
    caption: "Caption válido",
    cta: "CTA válido",
    scenes: [{ text: "Escena válida", duration: 5 }],
  };
  for (const malformed of [
    { ...valid, hook: 42 },
    { ...valid, scenes: [{ text: { unexpected: true }, duration: 5 }] },
    { ...valid, scenes: [{ text: "Escena válida", duration: "5" }] },
  ]) {
    await assert.rejects(
      createDraft(
        brand,
        { instructions: "Crear un guion educativo" },
        {
          fetcher: async () => json({ output_text: JSON.stringify(malformed) }),
        },
      ),
      (error) => error.status === 502 && /No se guardó/.test(error.message),
    );
  }
  assert.equal(listRecords(brand.id, "pieces").length, 0);
});
