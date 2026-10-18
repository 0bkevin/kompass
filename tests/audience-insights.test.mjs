import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import express from "express";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "radar-insights-"));
process.env.DATA_DIR = directory;
process.env.OPENAI_API_KEY = "";
let storage,
  insights,
  core,
  auth,
  server,
  origin,
  owner,
  editor,
  reviewer,
  outsider,
  workspace;
function account(role) {
  const user = auth.createUser({
    name: role,
    email: `${randomUUID()}@example.com`,
    passwordHash: "unused-for-fixture",
  });
  const token = randomUUID();
  storage.db
    .prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    )
    .run(auth.tokenHash(token), user.id, Date.now() + 60_000);
  return { ...user, cookie: `radar_session=${token}` };
}
function company(name = "Escuela de equipos") {
  const brand = storage.saveBrand({
    name,
    industry: "Educación",
    description: "Aprendizaje práctico para equipos",
    market: "Latinoamérica",
    tone: "Directo",
    pillars: ["Ventas", "Operaciones"],
    audience: [
      {
        id: randomUUID(),
        name: "Equipos comerciales",
        role: "Dirección",
        needs: "Mejorar ventas en educación",
        stage: "Validación",
      },
    ],
  });
  storage.db
    .prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?)")
    .run(brand.id, owner.id, "owner");
  return brand;
}
function piece(brand, values = {}) {
  return storage.saveRecord(brand.id, "pieces", {
    title: "Ventas para equipos",
    hook: "Una pregunta concreta",
    script: "Mejorar ventas con decisiones prácticas.",
    caption: "Texto editorial aprobado.",
    cta: "Probar",
    format: "post",
    channel: "linkedin",
    status: "approved",
    segmentId: brand.audience[0].id,
    comments: [
      {
        id: "comment",
        author: "Revisión",
        text: "Aprobada.",
        createdAt: new Date().toISOString(),
      },
    ],
    scenes: [],
    assetIds: [],
    ...values,
  });
}
function reference(brand, values = {}) {
  return storage.saveRecord(brand.id, "references", {
    title: "Ventas con ejemplos de educación",
    text: "Un caso de ventas para equipos comerciales.",
    url: `https://example.com/${randomUUID()}`,
    source: "Revista pública",
    platform: "linkedin",
    format: "post",
    topic: "Ventas",
    status: "new",
    tags: [],
    ...values,
  });
}
async function request(route, { user = owner, method = "GET", body } = {}) {
  const response = await fetch(`${origin}/api${route}`, {
    method,
    headers: {
      ...(user ? { cookie: user.cookie } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}
before(async () => {
  storage = await import("../server/db.mjs");
  auth = await import("../server/auth.mjs");
  core = await import("../server/core.mjs");
  insights = await import("../server/audience-insights.mjs");
  owner = account("owner");
  editor = account("editor");
  reviewer = account("reviewer");
  outsider = account("outsider");
  workspace = company();
  for (const [user, role] of [
    [editor, "editor"],
    [reviewer, "reviewer"],
  ])
    storage.db
      .prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?)")
      .run(workspace.id, user.id, role);
  const app = express();
  app.use(express.json());
  app.use("/api", core.createCoreRouter());
  app.use("/api", insights.createAudienceInsightsRouter());
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

test("cold-start opportunities cite actual records and treat audience fit as an editorial hypothesis", () => {
  const brand = company();
  const real = reference(brand, {
    metrics: { views: 100, likes: 4 },
    metricsOrigin: "Dato de la fuente",
  });
  reference(brand, {
    title: "Nunca mezclar demo",
    isDemo: true,
    topic: "Demo",
  });
  storage.saveRecord(brand.id, "sources", {
    name: "RSS sin respuesta",
    type: "rss",
    enabled: true,
    lastError: "HTTP 503",
  });
  const result = insights.buildInsights(brand);
  assert.equal(result.opportunities.length, 1);
  const opportunity = result.opportunities[0];
  assert.deepEqual(opportunity.referenceIds, [real.id]);
  assert.deepEqual(opportunity.segmentIds, [brand.audience[0].id]);
  assert.equal(opportunity.evidence[0].url, real.url);
  assert.match(opportunity.evidence[0].detail, /100 vistas/);
  assert.match(opportunity.reasons.join(" "), /necesidad declarada/);
  assert.match(opportunity.hypothesis, /No sabemos.*causó/);
  assert.equal(opportunity.growth.label, "insufficient");
  assert.equal(result.coverage.hasHistory, false);
  assert.equal(result.coverage.references, 1);
  assert.match(result.coverage.errors.join(" "), /HTTP 503/);
  assert.ok(
    result.coverage.notes.some((note) =>
      /demostración se excluyeron/.test(note),
    ),
  );
  const priority = opportunity.relevance;
  storage.saveRecord(brand.id, "references", {
    ...real,
    metrics: { views: 999999999999, likes: 99999999 },
    trend: { score: 100 },
  });
  assert.equal(
    insights.buildInsights(brand).opportunities[0].relevance,
    priority,
    "native platform metrics cannot change editorial priority",
  );
});

test("insights and audience signals enforce authentication, workspace isolation and editor permissions", async () => {
  const base = `/brands/${workspace.id}`;
  assert.equal((await request(`${base}/insights`, { user: null })).status, 401);
  assert.equal(
    (await request(`${base}/insights`, { user: outsider })).status,
    404,
  );
  assert.equal(
    (await request(`${base}/insights`, { user: reviewer })).status,
    200,
  );
  const body = {
    segmentId: workspace.audience[0].id,
    topic: "Ventas",
    note: "Hipótesis del equipo para este segmento.",
    sourceType: "editorial",
  };
  assert.equal(
    (
      await request(`${base}/audience-signals`, {
        user: reviewer,
        method: "POST",
        body,
      })
    ).status,
    403,
  );
  const created = await request(`${base}/audience-signals`, {
    user: editor,
    method: "POST",
    body,
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const list = await request(`${base}/audience-signals`, { user: reviewer });
  assert.equal(
    list.data.signals.find((signal) => signal.id === created.data.id).note,
    body.note,
  );
  const otherBrand = company("Otra empresa");
  assert.equal(
    (
      await request(
        `/brands/${otherBrand.id}/audience-signals/${created.data.id}`,
        { method: "DELETE" },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`${base}/audience-signals/${created.data.id}`, {
        method: "DELETE",
        user: reviewer,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`${base}/audience-signals/${created.data.id}`, {
        method: "DELETE",
        user: editor,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`${base}/audience-signals/${created.data.id}`, {
        method: "DELETE",
      })
    ).status,
    404,
  );
});

test("public observations need a citation and reject private links, person fields, contact data and invalid samples", async () => {
  const base = `/brands/${workspace.id}/audience-signals`;
  const valid = {
    segmentId: workspace.audience[0].id,
    topic: "Ventas",
    note: "Tres artículos públicos explican este problema.",
    sourceType: "public_content",
    sourceUrl: "https://example.com/sector",
    sampleSize: 3,
  };
  assert.equal(
    (await request(base, { method: "POST", body: valid })).status,
    201,
  );
  const invalidBodies = [
    { segmentId: "other-brand-segment" },
    { sourceUrl: "" },
    { sourceUrl: "javascript:alert(1)" },
    { sourceUrl: "http://127.0.0.1/a" },
    { sourceUrl: "http://[::1]/a" },
    { sourceUrl: "http://localhost/a" },
    { sourceUrl: "https://user:pass@example.com/a" },
    { sourceUrl: "https://example.com/login" },
    { sourceUrl: "https://example.com/a?email=user@example.com" },
    { sampleSize: 0 },
    { sampleSize: -1 },
    { sampleSize: 1.5 },
    { sampleSize: null },
    { sourceType: "enrollment" },
    { note: "Contactar a founder@example.com" },
    { note: "Llamar al +58 414 1234567" },
    { personName: "Individual" },
    { topic: "x".repeat(161) },
  ];
  for (const patch of invalidBodies) {
    const response = await request(base, {
      method: "POST",
      body: { ...valid, ...patch },
    });
    assert.equal(response.status, 400, JSON.stringify(patch));
  }
});

test("public evidence affects priority more than an editorial hypothesis without claiming audience observation", () => {
  const brand = company();
  const real = reference(brand);
  const common = {
    segmentId: brand.audience[0].id,
    topic: "Ventas",
    note: "Necesidad a contrastar",
  };
  const editorial = insights.buildInsights(brand, {
    signals: [{ ...common, sourceType: "editorial" }],
  });
  const publicEvidence = insights.buildInsights(brand, {
    signals: [{ ...common, sourceType: "public_content", sourceUrl: real.url }],
  });
  assert.ok(
    publicEvidence.opportunities[0].relevance >
      editorial.opportunities[0].relevance,
  );
  assert.match(
    publicEvidence.opportunities[0].reasons.join(" "),
    /evidencia pública tiene mayor peso/,
  );
  assert.match(
    publicEvidence.opportunities[0].reasons.join(" "),
    /No demuestra consumo ni afinidad de personas/,
  );
});

test("community aggregates require five voluntary responses and cannot be forged by the manual endpoint", async () => {
  const brand = company();
  reference(brand);
  const base = {
    segmentId: brand.audience[0].id,
    topic: "Ventas",
    note: "Necesidad declarada en un sondeo",
    sourceType: "community",
    aggregate: true,
    sampleSize: 5,
    communityPollId: "public-poll",
    sourceUrl: "/community/example-token",
  };
  const editorial = insights.buildInsights(brand, {
    signals: [{ ...base, sourceType: "editorial" }],
  });
  const community = insights.buildInsights(brand, { signals: [base] });
  assert.ok(
    community.opportunities[0].relevance > editorial.opportunities[0].relevance,
  );
  assert.match(
    community.opportunities[0].reasons.join(" "),
    /voluntarias y no verificadas/,
  );
  assert.match(
    community.opportunities[0].reasons.join(" "),
    /no equivalen a personas únicas ni a una muestra representativa/,
  );
  assert.ok(
    community.coverage.notes.some((note) =>
      /mínimo de 5 respuestas/.test(note),
    ),
  );
  for (const patch of [
    { sampleSize: 4 },
    { sampleSize: 5.5 },
    { aggregate: false },
    { communityPollId: "" },
  ]) {
    const ignored = insights.buildInsights(brand, {
      signals: [{ ...base, ...patch }],
    });
    assert.equal(ignored.signals.length, 0, JSON.stringify(patch));
  }
  storage.saveRecord(brand.id, "audienceSignals", base);
  storage.saveRecord(brand.id, "audienceSignals", { ...base, sampleSize: 4 });
  const list = await request(`/brands/${brand.id}/audience-signals`);
  assert.equal(list.data.signals.length, 1);
  assert.equal(list.data.signals[0].sourceType, "community");
  const forged = await request(`/brands/${brand.id}/audience-signals`, {
    method: "POST",
    body: {
      segmentId: brand.audience[0].id,
      topic: "Ventas",
      note: "Intento de inyección",
      sourceType: "community",
      sourceUrl: "https://example.com/public",
    },
  });
  assert.equal(forged.status, 400);
});

test("topic growth requires week-separated comparable observations, not repeated cold-start refreshes", () => {
  const brand = company();
  const firstTime = Date.UTC(2026, 0, 8, 12);
  const secondTime = firstTime + 7 * 86400000;
  let source = storage.saveRecord(brand.id, "sources", {
    name: "Fuente observada",
    type: "rss",
    enabled: true,
    query: "ventas educación",
    url: "https://example.com/feed",
    lastSyncedAt: new Date(firstTime).toISOString(),
  });
  reference(brand, {
    sourceId: source.id,
    publishedAt: new Date(firstTime - 86400000).toISOString(),
  });
  reference(brand, {
    sourceId: source.id,
    publishedAt: undefined,
    title: "Sin fecha no demuestra crecimiento",
  });
  const first = insights.recordTopicObservation(brand.id, {
    now: firstTime,
    sourceIds: [source.id],
  });
  assert.equal(first.counts.ventas, 1);
  const sameDay = insights.recordTopicObservation(brand.id, {
    now: firstTime + 3600000,
    sourceIds: [source.id],
  });
  assert.equal(
    first.id,
    sameDay.id,
    "refreshes in one day update one snapshot",
  );
  assert.equal(
    insights.buildInsights(brand, { now: firstTime + 3600000 }).coverage
      .hasHistory,
    false,
  );
  for (let index = 0; index < 3; index++)
    reference(brand, {
      sourceId: source.id,
      publishedAt: new Date(secondTime - 86400000).toISOString(),
    });
  source = storage.saveRecord(brand.id, "sources", {
    ...source,
    lastSyncedAt: new Date(secondTime).toISOString(),
  });
  insights.recordTopicObservation(brand.id, {
    now: secondTime,
    sourceIds: [source.id],
  });
  // The daily coalesced first snapshot is at 13:00, so the second comparable
  // observation must be at least a week after it.
  insights.recordTopicObservation(brand.id, {
    now: secondTime + 3600000,
    sourceIds: [source.id],
  });
  const observed = insights.buildInsights(brand, { now: secondTime + 3600000 });
  assert.equal(observed.coverage.hasHistory, true);
  assert.equal(observed.opportunities[0].growth.label, "observed");
  assert.match(
    observed.opportunities[0].growth.explanation,
    /3 publicaciones.*frente a 1/,
  );
  assert.match(
    observed.opportunities[0].growth.explanation,
    /No mide alcance, éxito/,
  );
  storage.saveRecord(brand.id, "sources", {
    ...source,
    query: "otra consulta",
  });
  assert.equal(
    insights.buildInsights(brand, { now: secondTime + 3600000 }).coverage
      .hasHistory,
    false,
    "changing source scope invalidates comparison",
  );
  storage.saveRecord(brand.id, "sources", {
    ...source,
    lastError: "Sin conexión",
  });
  assert.equal(
    insights.buildInsights(brand, { now: secondTime + 3600000 }).coverage
      .hasHistory,
    false,
  );
  assert.equal(
    insights.recordTopicObservation(brand.id, {
      now: secondTime,
      sourceIds: [],
    }),
    null,
  );
});

test("YouTube and demo records never synthesize performance growth or real audience claims", () => {
  const brand = company();
  const youtube = storage.saveRecord(brand.id, "sources", {
    name: "YouTube",
    type: "youtube",
    enabled: true,
    lastSyncedAt: new Date().toISOString(),
  });
  reference(brand, {
    sourceId: youtube.id,
    platform: "youtube",
    contentScope: "metadata_only",
    text: "",
    metrics: { views: 1000, likes: 50 },
    metricsOrigin: "YouTube Data API",
    format: "video",
  });
  assert.equal(
    insights.recordTopicObservation(brand.id, { sourceIds: [youtube.id] }),
    null,
  );
  const result = insights.buildInsights(brand);
  assert.equal(result.opportunities[0].growth.label, "insufficient");
  assert.match(
    result.opportunities[0].evidence[0].detail,
    /Solo título y metadatos/,
  );
  assert.match(
    result.opportunities[0].evidence[0].detail,
    /1000 vistas, 50 me gusta/,
  );
  assert.match(
    result.opportunities[0].growth.explanation,
    /no se convierten en una puntuación/,
  );
  const demoBrand = company("Demo explícita");
  demoBrand.isDemo = true;
  storage.saveBrand(demoBrand);
  reference(demoBrand, { isDemo: true });
  assert.equal(insights.buildInsights(demoBrand).opportunities[0].isDemo, true);
  assert.equal(insights.recordTopicObservation(demoBrand.id), null);
  reference(demoBrand, {
    title: "Contenido real",
    topic: "Real",
    isDemo: false,
  });
  assert.equal(
    insights
      .buildInsights(demoBrand)
      .opportunities.some((opportunity) => opportunity.isDemo),
    false,
  );
});

test("editors record and correct a real publication while preserving approved editorial content", async () => {
  const brand = workspace;
  const approved = piece(brand);
  const version = core.publicPiece(approved).approvalVersion;
  const url = `/brands/${brand.id}/pieces/${approved.id}/outcome`;
  const body = {
    publishedUrl: "https://www.linkedin.com/posts/company-example",
    publishedAt: new Date(Date.now() - 86400000).toISOString(),
    metrics: { views: 100, engagement: 8, leads: 2 },
    notes: "Lectura a las 24 horas.",
  };
  assert.equal(
    (await request(url, { user: reviewer, method: "POST", body })).status,
    403,
  );
  assert.equal(
    (await request(url, { user: outsider, method: "POST", body })).status,
    404,
  );
  const created = await request(url, { user: editor, method: "POST", body });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  assert.equal(created.data.origin, "manual");
  assert.equal(created.data.channel, "linkedin");
  const current = storage.getRecord(brand.id, "pieces", approved.id);
  assert.equal(current.status, "published");
  assert.equal(current.publishedUrl, body.publishedUrl);
  assert.equal(core.publicPiece(current).approvalVersion, version);
  assert.equal(current.script, approved.script);
  assert.deepEqual(current.comments, approved.comments);
  const corrected = await request(url, {
    user: editor,
    method: "POST",
    body: {
      metrics: { views: 120, engagement: 12, leads: 3 },
      notes: "Corrección manual.",
    },
  });
  assert.equal(corrected.status, 200);
  assert.equal(corrected.data.id, created.data.id);
  assert.equal(corrected.data.createdAt, created.data.createdAt);
  assert.equal(corrected.data.publishedAt, body.publishedAt);
  assert.equal(corrected.data.publishedUrl, body.publishedUrl);
  assert.equal(
    storage
      .listRecords(brand.id, "outcomes")
      .filter((outcome) => outcome.pieceId === approved.id).length,
    1,
  );
  const learning = (await request(`/brands/${brand.id}/insights`)).data
    .learning;
  assert.equal(
    learning.outcomes.find((outcome) => outcome.pieceId === approved.id).metrics
      .views,
    120,
  );
  assert.match(learning.summary, /manualmente.*no comparan rendimiento/);
  const group = learning.bySegment.find(
    (segment) => segment.segmentId === approved.segmentId,
  );
  assert.equal(group.views, 120);
  assert.equal(group.leads, 3);
});

test("results cannot bypass review, publication locks or workspace isolation", async () => {
  const metrics = { views: 1, engagement: 0, leads: 0 };
  for (const status of ["draft", "review"]) {
    const unapproved = piece(workspace, { status });
    assert.equal(
      (
        await request(
          `/brands/${workspace.id}/pieces/${unapproved.id}/outcome`,
          { method: "POST", user: editor, body: { metrics } },
        )
      ).status,
      409,
    );
    assert.equal(
      storage.getRecord(workspace.id, "pieces", unapproved.id).status,
      status,
    );
  }
  const approved = piece(workspace);
  const route = `/brands/${workspace.id}/pieces/${approved.id}/outcome`;
  assert.equal(
    (
      await request(route, {
        method: "POST",
        body: { metrics, title: "Alterar aprobación" },
      })
    ).status,
    400,
  );
  for (const status of ["sending", "uncertain"]) {
    storage.setSecret(workspace.id, `publication:${approved.id}`, { status });
    assert.equal(
      (await request(route, { method: "POST", body: { metrics } })).status,
      409,
    );
  }
  storage.setSecret(workspace.id, `publication:${approved.id}`, null);
  const other = company();
  assert.equal(
    (
      await request(`/brands/${other.id}/pieces/${approved.id}/outcome`, {
        method: "POST",
        body: { metrics },
      })
    ).status,
    404,
  );
  const demo = piece(workspace, { isDemo: true });
  assert.equal(
    (
      await request(`/brands/${workspace.id}/pieces/${demo.id}/outcome`, {
        method: "POST",
        body: { metrics },
      })
    ).status,
    409,
  );
  assert.equal(
    storage
      .listRecords(workspace.id, "outcomes")
      .some((outcome) => outcome.pieceId === approved.id),
    false,
  );
});

test("result validation rejects invalid metrics, private URLs and future publication times", async () => {
  const approved = piece(workspace);
  const route = `/brands/${workspace.id}/pieces/${approved.id}/outcome`;
  for (const views of [-1, null, "100", Infinity, 1e13]) {
    assert.equal(
      (
        await request(route, {
          method: "POST",
          body: { metrics: { views, engagement: 0, leads: 0 } },
        })
      ).status,
      400,
      String(views),
    );
  }
  for (const patch of [
    { metrics: null },
    { metrics: { views: 1, success: 100 } },
    { publishedUrl: "http://192.168.1.1/post" },
    { publishedUrl: "https://user:pass@example.com" },
    { publishedAt: "not-a-date" },
    { publishedAt: new Date(Date.now() + 86400000).toISOString() },
    { notes: "x".repeat(5001) },
  ]) {
    const response = await request(route, {
      method: "POST",
      body: { metrics: { views: 0, engagement: 0, leads: 0 }, ...patch },
    });
    assert.equal(response.status, 400, JSON.stringify(patch).slice(0, 120));
  }
  assert.equal(
    storage.getRecord(workspace.id, "pieces", approved.id).status,
    "approved",
  );
});

test("publication and result writes roll back together if persistence fails", async () => {
  const approved = piece(workspace, { id: "atomic-publication-fixture" });
  storage.db.exec(
    "CREATE TRIGGER reject_test_piece BEFORE UPDATE ON records WHEN NEW.kind='pieces' AND NEW.id='atomic-publication-fixture' BEGIN SELECT RAISE(ABORT, 'test failure'); END",
  );
  try {
    const response = await request(
      `/brands/${workspace.id}/pieces/${approved.id}/outcome`,
      {
        method: "POST",
        body: { metrics: { views: 2, engagement: 1, leads: 0 } },
      },
    );
    assert.equal(response.status, 500);
    assert.equal(
      storage.getRecord(workspace.id, "pieces", approved.id).status,
      "approved",
    );
    assert.equal(
      storage
        .listRecords(workspace.id, "outcomes")
        .some((outcome) => outcome.pieceId === approved.id),
      false,
    );
  } finally {
    storage.db.exec("DROP TRIGGER reject_test_piece");
  }
});

test("recorded outcomes adjust priority only with comparable own content and remain separate from growth", () => {
  const brand = company();
  const ref = reference(brand, { text: "Ventas prácticas", topic: "Ventas" });
  const before = insights.buildInsights(brand).opportunities[0];
  const outcomes = [];
  for (let index = 0; index < 6; index++) {
    const ownPiece = piece(brand, {
      title: index < 3 ? "Ventas prácticas" : "Operaciones y gestión",
      script: index < 3 ? "Ventas aplicadas" : "Operaciones con casos",
      referenceId: index < 3 ? ref.id : undefined,
      status: "published",
    });
    outcomes.push(
      storage.saveRecord(brand.id, "outcomes", {
        pieceId: ownPiece.id,
        title: ownPiece.title,
        channel: ownPiece.channel,
        segmentId: ownPiece.segmentId,
        publishedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        metrics: { views: 100, engagement: index < 3 ? 20 : 5, leads: 1 },
        origin: "manual",
      }),
    );
  }
  const after = insights.buildInsights(brand).opportunities[0];
  assert.equal(after.relevance, before.relevance + 8);
  assert.equal(after.growth.label, "insufficient");
  assert.match(after.reasons.join(" "), /Ajuste editorial.*\+8 puntos/);
  assert.match(after.reasons.join(" "), /20\.0% frente a 5\.0%/);
  assert.match(
    after.reasons.join(" "),
    /no hay atribución causal ni comparación entre redes/,
  );
  for (const outcome of outcomes.slice(0, 3))
    storage.saveRecord(brand.id, "outcomes", {
      ...outcome,
      metrics: { views: 100, engagement: 1, leads: 0 },
    });
  const reduced = insights.buildInsights(brand).opportunities[0];
  assert.equal(reduced.relevance, before.relevance - 8);
  for (const outcome of outcomes.slice(3)) {
    const otherChannel = storage.getRecord(brand.id, "pieces", outcome.pieceId);
    storage.saveRecord(brand.id, "pieces", {
      ...otherChannel,
      channel: "instagram",
    });
  }
  const mixed = insights.buildInsights(brand).opportunities[0];
  assert.equal(
    mixed.relevance,
    before.relevance,
    "another channel cannot supply the baseline",
  );
  assert.match(mixed.reasons.join(" "), /Aprendizaje editorial pendiente/);
});

test("Spanish audience needs find relevant English public content without assuming observed viewers", () => {
  const brand = company("Formación comercial bilingüe");
  brand.audience[0].needs =
    "Aplicar IA para mejorar ventas y automatizar tareas";
  const report = insights.buildInsights(brand, {
    references: [
      {
        id: "english-sales",
        title: "How AI agents automate sales follow-up",
        text: "Sales teams use artificial intelligence agents to automate repetitive work.",
        source: "Public source",
        status: "new",
        url: "https://example.com/ai-sales",
        createdAt: new Date().toISOString(),
      },
    ],
    pieces: [],
    signals: [],
    outcomes: [],
    snapshots: [],
    sources: [],
  });
  assert.ok(report.opportunities[0].segmentIds.includes(brand.audience[0].id));
  assert.match(report.opportunities[0].reasons.join(" "), /Hipótesis/);
  assert.match(
    report.opportunities[0].reasons.join(" "),
    /No demuestra consumo/,
  );
});
