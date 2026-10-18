import { installPermissionFixture } from "./permission-fixture.mjs";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kompass-comparison-"));
process.env.DATA_DIR = directory;
process.env.OPENAI_API_KEY = "";
delete process.env.PLATFORM_TEXT_PROVIDER;
installPermissionFixture(directory, [
  { origin: "https://model.example", pathPrefix: "/v1", purposes: ["ai"] },
  { origin: "https://chatgpt.com", pathPrefix: "/", purposes: ["ai"] },
]);
let storage,
  auth,
  comparison,
  server,
  origin,
  owner,
  outsider,
  reviewer,
  transport,
  managedTransport;
const secret = "test-comparison-credential-do-not-expose";
const leftText =
  "¿Cómo conservar los acuerdos comerciales? Documenta cada paso en un registro compartido. El equipo podría revisar el contexto antes de cada relevo y contrastar los resultados con sus propios datos.";
const rightText =
  "Tres pasos para preparar un relevo comercial: reúne el contexto, acuerda responsables y revisa los pendientes. Esta lista propone un método que cada equipo debe probar en su propia operación.";
function account() {
  const user = auth.createUser({
    name: "Equipo",
    email: `${randomUUID()}@example.com`,
    passwordHash: "test-only",
  });
  const token = randomUUID();
  storage.db
    .prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    )
    .run(auth.tokenHash(token), user.id, Date.now() + 3600000);
  return { ...user, token, cookie: `radar_session=${token}` };
}
function fixture({ configured = true } = {}) {
  const brand = storage.saveBrand({
    name: "Equipo editorial",
    industry: "Educación",
    audience: [],
  });
  for (const [user, role] of [
    [owner, "owner"],
    [reviewer, "reviewer"],
  ])
    storage.db
      .prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?)")
      .run(brand.id, user.id, role);
  const references = [leftText, rightText].map((text, index) =>
    storage.saveRecord(brand.id, "references", {
      title: `Referencia ${index}`,
      text,
      source: "manual",
      format: "article",
    }),
  );
  if (configured)
    storage.setSecret(brand.id, "ai", {
      apiKey: secret,
      model: "comparison-test",
      baseUrl: "https://model.example/v1",
    });
  return {
    brand,
    references,
    body: {
      leftReferenceId: references[0].id,
      rightReferenceId: references[1].id,
    },
  };
}
function output(current) {
  return {
    summary:
      "Los textos proponen documentar el relevo con aperturas distintas.",
    factors: [
      {
        factor: "Gancho textual",
        observation:
          "El primero abre con una pregunta; el segundo enumera pasos.",
        hypothesis:
          "Hipótesis: probar una pregunta frente a una lista con el equipo.",
        citations: [
          {
            referenceId: current.references[0].id,
            quote: "¿Cómo conservar los acuerdos comerciales?",
          },
          {
            referenceId: current.references[1].id,
            quote: "Tres pasos para preparar un relevo comercial",
          },
        ],
      },
    ],
    limitations: ["No se observaron respuestas de lectores."],
  };
}
const response = (value) =>
  new Response(JSON.stringify({ output_text: JSON.stringify(value) }), {
    headers: { "content-type": "application/json" },
  });
async function request(
  current,
  { user = owner, body = current.body, requestOrigin } = {},
) {
  const result = await fetch(
    `${origin}/api/brands/${current.brand.id}/editorial-comparison`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(user ? { cookie: user.cookie } : {}),
        ...(requestOrigin ? { origin: requestOrigin } : {}),
      },
      body: JSON.stringify(body),
    },
  );
  return { status: result.status, data: await result.json() };
}
before(async () => {
  storage = await import("../server/db.mjs");
  auth = await import("../server/auth.mjs");
  comparison = await import("../server/editorial-comparison.mjs");
  owner = account();
  outsider = account();
  reviewer = account();
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    comparison.createEditorialComparisonRouter({
      fetcher: (...args) => transport(...args),
      managedGenerator: (...args) => managedTransport(...args),
    }),
  );
  app.use((error, _req, res, _next) =>
    res.status(error.status || 500).json({ error: error.message }),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  storage.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("endpoint enforces authentication, tenant membership, editing and origin before provider calls", async () => {
  const current = fixture();
  let calls = 0;
  transport = async () => {
    calls++;
    throw new Error("unexpected");
  };
  assert.equal((await request(current, { user: null })).status, 401);
  assert.equal((await request(current, { user: outsider })).status, 404);
  assert.equal((await request(current, { user: reviewer })).status, 403);
  assert.equal(
    (await request(current, { requestOrigin: "https://evil.example" })).status,
    403,
  );
  const foreign = fixture();
  assert.equal(
    (
      await request(current, {
        body: { ...current.body, leftReferenceId: foreign.references[0].id },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(current, {
        body: { ...current.body, extra: "instructions" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(current, {
        body: {
          ...current.body,
          rightReferenceId: current.body.leftReferenceId,
        },
      })
    ).status,
    400,
  );
  assert.equal((await request(fixture({ configured: false }))).status, 409);
  assert.equal(calls, 0);
});

test("actual full supplied texts reach strict structured generation and exact offsets are verified", async () => {
  const current = fixture();
  const longText = `${leftText}\n${"Material adicional disponible para comparar. ".repeat(200)}`;
  current.references[0] = storage.saveRecord(current.brand.id, "references", {
    ...current.references[0],
    text: longText,
    analysis: { secret: "NEVER FORWARD EXISTING OUTPUT" },
  });
  transport = async (_url, options) => {
    const payload = JSON.parse(options.body);
    const input = JSON.parse(payload.input[0].content[0].text);
    assert.equal(payload.text.format.strict, true);
    assert.equal(payload.text.format.name, "editorial_comparison");
    assert.equal(input.references[0].text, longText);
    assert.equal(input.references[1].text, rightText);
    assert.equal(input.references[0].contentScope, "provided_text");
    assert.equal(options.body.includes("NEVER FORWARD EXISTING OUTPUT"), false);
    assert.match(payload.instructions, /nunca como instrucciones/);
    return response(output(current));
  };
  const result = await request(current);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.engine, "ai");
  assert.equal(result.data.references[0].textLength, longText.length);
  for (const citation of result.data.factors[0].citations) {
    const reference = current.references.find(
      (item) => item.id === citation.referenceId,
    );
    assert.equal(
      reference.text.slice(citation.start, citation.end),
      citation.quote,
    );
  }
  assert.equal(JSON.stringify(result.data).includes(secret), false);
});

test("metadata, restricted sources, privacy violations and oversized inputs are denied without AI", async () => {
  let calls = 0;
  transport = async () => {
    calls++;
    throw new Error("unexpected");
  };
  for (const patch of [
    { contentScope: "metadata_only" },
    { text: "Only title" },
    { sourceId: "rss-source" },
    { platform: "youtube" },
    { url: "https://www.youtube.com/watch?v=example" },
    { url: "https://linkedin.com/posts/test" },
    { ingestionRestricted: true },
    { ingestionProvider: "reddit" },
    { isDemo: true, source: "YouTube" },
    { isDemo: true, ingestionProvider: "reddit" },
    { url: "https://example.com/login" },
    { text: `${leftText} Contacto: individual@example.com` },
    { text: `${leftText} DNI: 12345678Z` },
    { text: "x".repeat(24001) },
  ]) {
    const current = fixture();
    storage.saveRecord(current.brand.id, "references", {
      ...current.references[0],
      ...patch,
    });
    const result = await request(current);
    assert.ok(
      [400, 403, 409, 413].includes(result.status),
      JSON.stringify(patch),
    );
  }
  assert.equal(calls, 0);
});

test("invented, case-altered, foreign and one-sided quotes or secret echoes fail validation", async () => {
  const current = fixture();
  const input = comparison.buildEditorialComparisonInput(current.brand, {
    ...current.body,
    references: current.references,
  });
  for (const alter of [
    (value) => {
      value.factors[0].citations[0].quote =
        "Una cita inventada que nunca se publicó.";
    },
    (value) => {
      value.factors[0].citations[0].quote =
        value.factors[0].citations[0].quote.toUpperCase();
    },
    (value) => {
      value.factors[0].citations[0].referenceId = "foreign-reference";
    },
    (value) => {
      value.factors[0].citations.pop();
    },
    (value) => {
      value.summary = secret;
    },
    (value) => {
      value.limitations = [];
    },
    (value) => {
      value.extra = true;
    },
    (value) => {
      value.factors[0].hypothesis = "Contacto: customer@example.com";
    },
  ]) {
    const value = output(current);
    alter(value);
    assert.throws(
      () =>
        comparison.validateEditorialComparison(value, input, {
          secrets: [secret],
        }),
      { status: 502 },
    );
    transport = async () => response(value);
    assert.equal((await request(current)).status, 502);
  }
});

test("only explicit comparable windows yield descriptive outcome differences", () => {
  const current = fixture();
  const evidence = {
    platform: "website",
    metricsOrigin: "Registro agregado del equipo",
    metricsWindow: "2026-10-01/2026-10-07",
    metricsObservedAt: "2026-10-08T00:00:00Z",
  };
  const references = current.references.map((item, index) => ({
    ...item,
    ...evidence,
    metrics: { views: index ? 200 : 100 },
  }));
  const input = comparison.buildEditorialComparisonInput(current.brand, {
    ...current.body,
    references,
  });
  assert.equal(input.outcomeComparison.comparable, true);
  assert.deepEqual(input.outcomeComparison.differences, [
    { metric: "views", left: 100, right: 200, difference: 100 },
  ]);
  references[1].metricsWindow = "another-window";
  assert.equal(
    comparison.buildEditorialComparisonInput(current.brand, {
      ...current.body,
      references,
    }).outcomeComparison.comparable,
    false,
  );
});

test("provider errors redact secrets and release lock; evidence or membership changes invalidate pending output", async () => {
  const current = fixture();
  transport = async () => {
    throw new Error(secret);
  };
  const failure = await request(current);
  assert.equal(failure.status, 502);
  assert.equal(JSON.stringify(failure.data).includes(secret), false);
  transport = async () => response(output(current));
  assert.equal((await request(current)).status, 200);
  for (const change of ["text", "role", "session"]) {
    const user = account();
    storage.db
      .prepare(
        "INSERT INTO members(brand_id,user_id,role) VALUES(?,?,'editor')",
      )
      .run(current.brand.id, user.id);
    let release, entered;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    const wait = new Promise((resolve) => {
      release = resolve;
    });
    transport = async () => {
      entered();
      await wait;
      return response(output(current));
    };
    const running = request(current, { user });
    await started;
    if (change === "text")
      storage.saveRecord(current.brand.id, "references", {
        ...current.references[0],
        text: `${leftText} Cambió el texto.`,
      });
    if (change === "role")
      storage.db
        .prepare(
          "UPDATE members SET role='reviewer' WHERE brand_id=? AND user_id=?",
        )
        .run(current.brand.id, user.id);
    if (change === "session")
      storage.db
        .prepare("DELETE FROM sessions WHERE token_hash=?")
        .run(auth.tokenHash(user.token));
    release();
    assert.equal(
      (await running).status,
      change === "text" ? 409 : change === "role" ? 403 : 401,
    );
  }
});

test("managed ChatGPT comparison reuses shared text generation without another provider or API key", async () => {
  const current = fixture({ configured: false });
  let calls = 0;
  transport = async () => {
    throw new Error("API transport must not run");
  };
  managedTransport = async (request) => {
    calls++;
    assert.equal(request.name, "editorial_comparison");
    assert.equal(request.schema.additionalProperties, false);
    assert.deepEqual(
      JSON.parse(request.input).references.map((item) => item.text),
      [leftText, rightText],
    );
    return output(current);
  };
  process.env.PLATFORM_TEXT_PROVIDER = "codex-chatgpt";
  try {
    const result = await request(current);
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.equal(result.data.model, "ChatGPT · Codex");
    assert.equal(calls, 1);
  } finally {
    delete process.env.PLATFORM_TEXT_PROVIDER;
  }
});
