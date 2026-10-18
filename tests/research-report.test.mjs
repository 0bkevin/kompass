import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  outcomeLocalDateTime,
  outcomeMeasurementUpdate,
  outcomePublicationDate,
} from "../src/lib/outcome-dates.ts";

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "kompass-research-report-"),
);
process.env.DATA_DIR = directory;
process.env.OPENAI_API_KEY = "";
process.env.YOUTUBE_DATA_API_KEY = "";
process.env.DISCOVERY_ENABLED = "false";
let storage,
  auth,
  server,
  origin,
  brand,
  other,
  source,
  owner,
  reviewer,
  outsider;
let buildResearchReport, buildInsights;
function account(name) {
  const user = auth.createUser({
    name,
    email: `${randomUUID()}@example.test`,
    passwordHash: "fixture-only",
  });
  const token = randomUUID();
  storage.db
    .prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    )
    .run(auth.tokenHash(token), user.id, Date.now() + 3600000);
  return { ...user, cookie: `radar_session=${token}` };
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
  return {
    status: response.status,
    body: await response.json(),
    cache: response.headers.get("cache-control"),
  };
}
before(async () => {
  storage = await import("../server/db.mjs");
  auth = await import("../server/auth.mjs");
  ({ buildResearchReport } = await import("../server/research-report.mjs"));
  ({ buildInsights } = await import("../server/audience-insights.mjs"));
  const { createApp } = await import("../server/index.mjs");
  owner = account("Equipo QA");
  reviewer = account("Revisión QA");
  outsider = account("Otro equipo QA");
  brand = storage.saveBrand({
    name: "Equipo de contenido",
    industry: "Educación",
    market: "Latinoamérica",
    description: "IA práctica para equipos",
    pillars: ["IA"],
    audience: [
      {
        id: "leaders",
        name: "Directivos",
        role: "Dirección",
        needs: "Aplicar IA en equipos",
      },
    ],
  });
  other = storage.saveBrand({ name: "Empresa ajena", audience: [] });
  for (const [user, role] of [
    [owner, "owner"],
    [reviewer, "reviewer"],
  ])
    storage.db
      .prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?)")
      .run(brand.id, user.id, role);
  storage.db
    .prepare("INSERT INTO members(brand_id,user_id,role) VALUES(?,?,?)")
    .run(other.id, outsider.id, "owner");
  source = storage.saveRecord(brand.id, "sources", {
    name: "Hacker News",
    type: "hackernews",
    query: "IA",
    enabled: true,
    lastSyncedAt: new Date().toISOString(),
    lastResultCount: 12,
  });
  for (let index = 0; index < 12; index++)
    storage.saveRecord(brand.id, "references", {
      title: `IA para equipos ${index}`,
      text: "Una decisión práctica para aplicar IA en equipos.",
      url: `https://example.com/ai-${index}`,
      sourceId: source.id,
      source: source.name,
      ingestionProvider: "hackernews",
      format: "article",
      topic: `IA · decisión ${index}`,
      status: "saved",
      publishedAt: new Date(Date.now() - 86400000).toISOString(),
    });
  for (const extra of [
    { title: "Una publicación antigua", publishedAt: "2025-01-01T00:00:00Z" },
    { title: "Ejemplo ficticio", isDemo: true },
    {
      title: "YouTube aislado",
      platform: "youtube",
      metricsOrigin: "YouTube Data API",
    },
    {
      title: "Contacto privado",
      text: "Escribir a private-person@example.test",
    },
  ])
    storage.saveRecord(brand.id, "references", {
      text: "Material de prueba.",
      status: "saved",
      url: `https://example.com/${randomUUID()}`,
      ...extra,
    });
  server = createApp({ apiOnly: true }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  storage.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
const route = () => `/brands/${brand.id}/research-report`;

test("priority finds audience matches beyond forty candidates without narrowing corpus coverage", () => {
  const now = Date.now();
  const company = {
    ...brand,
    description: "Educación aprendizaje formación investigación universidad",
    pillars: ["IA aplicada"],
    audience: [
      {
        id: "directivos-qa",
        name: "Directivos",
        needs: "Elegir el primer proceso del negocio donde probar IA.",
      },
    ],
  };
  const references = [
    ...Array.from({ length: 44 }, (_, index) => ({
      id: `unrelated-${index}`,
      title: `Torneo ${index}`,
      topic: `Torneo ${index}`,
      text: "Educación aprendizaje formación investigación universidad",
    })),
    ...["Costos", "Inventario"].map((topic, index) => ({
      id: `matched-${index}`,
      title: `${topic} del negocio`,
      topic: `${topic} del negocio`,
      text: "Una decisión documentada.",
    })),
  ].map((reference) => ({
    ...reference,
    status: "saved",
    sourceId: source.id,
    ingestionProvider: "hackernews",
    url: `https://example.com/${reference.id}`,
    publishedAt: new Date(now - 86400000).toISOString(),
  }));
  const options = { references, sources: [source], now };
  const insights = buildInsights(company, options);
  assert.equal(insights.opportunities.length, 40);
  assert.ok(
    insights.opportunities
      .slice(0, 10)
      .every((item) => !item.segmentIds.length),
    "unrelated proposals rank above matches, exercising filtering before the cap",
  );
  assert.ok(insights.opportunities.every((item) => !item.segmentIds.length));
  const matched = buildInsights(company, {
    ...options,
    audienceOnly: true,
  }).opportunities.filter((item) => item.segmentIds.includes("directivos-qa"));
  assert.equal(matched.length, 2);
  const report = buildResearchReport(company, options);
  assert.deepEqual(
    report.opportunities.map((item) => item.id),
    matched.map((item) => item.id),
  );
  for (const [index, opportunity] of report.opportunities.entries()) {
    assert.deepEqual(opportunity.segmentIds, ["directivos-qa"]);
    assert.deepEqual(opportunity.referenceIds, matched[index].referenceIds);
    assert.deepEqual(
      opportunity.evidence.map(({ detail, ...citation }) => citation),
      matched[index].evidence.map(({ detail, ...citation }) => citation),
    );
    assert.deepEqual(opportunity.growth, matched[index].growth);
    assert.deepEqual(opportunity.factors, matched[index].factors);
  }
  assert.equal(report.scope.counts.selected, 46);
  assert.equal(report.scope.counts.publicationDated, 46);
  assert.equal(report.coverage.references, 46);
  assert.equal(report.evidence.coverage.summary.counts.uniqueReferences, 46);
  assert.equal(report.evidence.retrospective.status, "insufficient");
  assert.ok(report.trends.some((item) => /tres ventanas/.test(item.detail)));
  assert.deepEqual(report.evidence.formats.manualPerformance.comparisons, []);

  for (const audience of [[], [{ id: "new-audience", needs: "Astronomía" }]]) {
    const empty = buildResearchReport({ ...company, audience }, options);
    assert.deepEqual(empty.opportunities, []);
    assert.deepEqual(empty.scope.counts, report.scope.counts);
    assert.deepEqual(empty.coverage, report.coverage);
    assert.deepEqual(empty.evidence.coverage, report.evidence.coverage);
  }
});

test("report reads are private, company isolated and do not refresh or mutate sources", async () => {
  assert.equal((await request(route(), { user: null })).status, 401);
  assert.equal((await request(route(), { user: outsider })).status, 404);
  const before = storage.getRecord(brand.id, "sources", source.id);
  const count = storage.db.prepare("SELECT total_changes() AS n").get().n;
  const response = await request(route());
  assert.equal(response.status, 200);
  assert.equal(response.cache, "no-store");
  assert.equal(
    storage.db.prepare("SELECT total_changes() AS n").get().n,
    count,
  );
  assert.deepEqual(storage.getRecord(brand.id, "sources", source.id), before);
});

test("weekly report limits ten real opportunities and excludes old, demo, restricted and private material", async () => {
  const { body } = await request(route());
  assert.equal(body.scope.counts.selected, 12);
  assert.equal(body.scope.counts.publicationDated, 12);
  assert.equal(body.scope.counts.privacyExcluded, 1);
  assert.equal(body.opportunities.length, 10);
  assert.equal(body.scope.ordering, "editorial_relevance");
  assert.equal(body.evidence.trends.status, "insufficient");
  assert.equal(body.evidence.formats.observed.groups[0].channel, null);
  const output = JSON.stringify(body);
  assert.ok(!output.includes("private-person"));
  assert.ok(!output.includes("Una publicación antigua"));
  assert.ok(!output.includes("YouTube aislado"));
  assert.ok(!output.includes("Ejemplo ficticio"));
  assert.equal(body.opportunities[0].growth.label, "insufficient");
});

test("manual observations and editorial decisions feed the same report", async () => {
  const { body } = await request(route());
  const opportunity = body.opportunities[0];
  const reference = storage.getRecord(
    brand.id,
    "references",
    opportunity.referenceIds[0],
  );
  const evidenceRoute = `/brands/${brand.id}/references/${reference.id}/editorial-evidence`;
  const current = await request(evidenceRoute);
  const observation = await request(evidenceRoute, {
    method: "PUT",
    body: {
      expectedReferenceFingerprint: current.body.referenceFingerprint,
      expectedRevision: current.body.revision,
      observations: [
        {
          factor: "hook",
          observation: "Abre con una decisión concreta para el equipo.",
          uncertainty: "No conocemos su efecto en la retención.",
          observedAt: new Date().toISOString(),
          support: {
            kind: "text",
            field: "text",
            quote: "Una decisión práctica",
          },
        },
      ],
    },
  });
  assert.equal(observation.status, 200);
  const feedback = await request(`/brands/${brand.id}/opportunity-feedback`, {
    method: "POST",
    body: {
      opportunityId: opportunity.id,
      referenceIds: opportunity.referenceIds,
      segmentId: "leaders",
      decision: "accepted",
    },
  });
  assert.equal(feedback.status, 201);
  const updated = await request(route());
  assert.equal(updated.body.evidence.validation.decisions.accepted, 1);
  assert.match(
    updated.body.opportunities[0].factors[0].observation,
    /Observación manual del equipo/,
  );
  assert.match(
    updated.body.opportunities[0].factors[0].observation,
    /Una decisión práctica/,
  );
  assert.equal(
    (
      await request(`/brands/${brand.id}/opportunity-feedback`, {
        user: reviewer,
        method: "POST",
        body: {},
      })
    ).status,
    403,
  );
});

test("actual pilot measurements appear for editors and stay hidden from reviewers", async () => {
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const saved = await request(`/brands/${brand.id}/pilot-evaluation`, {
    method: "POST",
    body: {
      origin: "manual",
      period: { start, end },
      editorialMinutes: 30,
      actualCost: { amount: null, currency: "USD" },
      results: { reviewed: 12, useful: 5, accepted: 2 },
    },
  });
  assert.equal(saved.status, 201);
  const editor = await request(route());
  assert.match(editor.body.pilot[0].detail, /30 minutos/);
  assert.match(editor.body.pilot[0].detail, /Costo sin registrar/);
  assert.equal(
    editor.body.evidence.pilot.evaluations[0].summary.costPerReviewed,
    null,
  );
  const readOnly = await request(route(), { user: reviewer });
  assert.equal(readOnly.status, 200);
  assert.equal(readOnly.body.evidence.pilot, undefined);
});

test("explicit measurement dates reach comparable format evidence through the real outcome route", async () => {
  const publication = new Date(Date.now() - 2 * 86400000);
  publication.setUTCSeconds(30, 123);
  const publishedAt = publication.toISOString();
  const measuredAt = new Date(Date.parse(publishedAt) + 86400000).toISOString();
  let first;
  for (let index = 0; index < 3; index++) {
    const piece = storage.saveRecord(brand.id, "pieces", {
      title: `Una decisión de IA ${index}`,
      script: "Una pregunta y un ejemplo propio.",
      status: "approved",
      segmentId: "leaders",
      channel: "linkedin",
      format: "post",
      assetIds: [],
      scenes: [],
    });
    first ||= piece;
    const result = await request(
      `/brands/${brand.id}/pieces/${piece.id}/outcome`,
      {
        method: "POST",
        body: {
          publishedAt,
          measuredAt,
          publishedUrl: `https://www.linkedin.com/posts/company-piece-${index}`,
          metrics: { views: 100, engagement: 10, leads: 0 },
        },
      },
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.measuredAt, measuredAt);
  }
  const result = await request(route());
  assert.equal(
    result.body.evidence.formats.manualPerformance.status,
    "comparable",
  );
  assert.equal(
    result.body.evidence.formats.manualPerformance.groups[0].sampleSize,
    3,
  );
  const invalid = await request(
    `/brands/${brand.id}/pieces/${first.id}/outcome`,
    {
      method: "POST",
      body: {
        publishedAt,
        measuredAt: new Date(Date.parse(publishedAt) - 1000).toISOString(),
        metrics: { views: 2 },
      },
    },
  );
  assert.equal(invalid.status, 400);
  assert.equal(
    storage
      .listRecords(brand.id, "outcomes")
      .find((item) => item.pieceId === first.id).measuredAt,
    measuredAt,
  );
  const corrected = await request(
    `/brands/${brand.id}/pieces/${first.id}/outcome`,
    {
      method: "POST",
      body: {
        publishedAt: outcomePublicationDate(
          outcomeLocalDateTime(publishedAt),
          publishedAt,
        ),
        ...outcomeMeasurementUpdate(
          outcomeLocalDateTime(measuredAt),
          measuredAt,
        ),
        metrics: { views: 120, engagement: 12, leads: 0 },
      },
    },
  );
  assert.equal(corrected.status, 200);
  assert.equal(corrected.body.publishedAt, publishedAt);
  assert.equal(corrected.body.measuredAt, measuredAt);
  const preserved = await request(route());
  assert.equal(
    preserved.body.evidence.formats.manualPerformance.status,
    "comparable",
  );
  assert.equal(
    preserved.body.evidence.formats.manualPerformance.groups[0].sampleSize,
    3,
  );

  const cleared = await request(
    `/brands/${brand.id}/pieces/${first.id}/outcome`,
    {
      method: "POST",
      body: {
        ...outcomeMeasurementUpdate("", measuredAt),
        metrics: { views: 120, engagement: 12, leads: 0 },
      },
    },
  );
  assert.equal(cleared.status, 200);
  assert.equal(Object.hasOwn(cleared.body, "measuredAt"), false);
  const stored = storage
    .listRecords(brand.id, "outcomes")
    .find((item) => item.pieceId === first.id);
  assert.equal(Object.hasOwn(stored, "measuredAt"), false);
  const insufficient = await request(route());
  assert.equal(
    insufficient.body.evidence.formats.manualPerformance.status,
    "insufficient",
  );
  assert.equal(
    insufficient.body.evidence.formats.manualPerformance.groups.find(
      (group) => group.measurementWindow.kind === "measured_interval",
    ).sampleSize,
    2,
  );
});
