import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "radar-integrated-flow-"),
);
process.env.DATA_DIR = dataDir;
for (const key of [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "YOUTUBE_API_KEY",
  "APIFY_API_TOKEN",
])
  process.env[key] = "";

let server;
let origin;
let storage;
const nativeFetch = globalThis.fetch;
const externalRequests = [];

async function request(
  route,
  { body, method = body ? "POST" : "GET", cookie, expected = 200 } = {},
) {
  const response = await fetch(`${origin}/api${route}`, {
    method,
    redirect: "error",
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  assert.equal(
    response.status,
    expected,
    `${method} ${route}: ${JSON.stringify(data)}`,
  );
  return {
    data,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}

async function api(route, options) {
  return (await request(route, options)).data;
}

async function register() {
  const account = await request("/auth/register", {
    body: {
      name: "Equipo de contenido",
      email: `workflow-${randomUUID()}@example.com`,
      password: "integration-password-30x",
    },
    expected: 201,
  });
  assert.ok(account.cookie);
  const session = await api("/session", { cookie: account.cookie });
  assert.equal(session.user.id, account.data.user.id);
  assert.deepEqual(session.brands, []);
  return account;
}

async function createCompany(account, name = "Nexo Lab") {
  const inspection = await api("/context/inspect", {
    cookie: account.cookie,
    body: {
      text: `Empresa: ${name}\nAyudamos a empresas de Latinoamérica con formación en IA, ventas y procesos comerciales.`,
    },
  });
  assert.equal(inspection.method, "heuristic");
  assert.equal(inspection.draft.name, name);
  assert.deepEqual(
    inspection.evidence.map((evidence) => evidence.status),
    ["provided"],
  );
  assert.match(
    inspection.warnings.join(" "),
    /no describen consumidores observados/,
  );
  assert.ok(inspection.draft.audience.length > 0);
  assert.ok(
    inspection.draft.audience.every((segment) =>
      /Hipótesis/.test(segment.description),
    ),
  );
  const brand = await api("/brands", {
    cookie: account.cookie,
    expected: 201,
    body: {
      ...inspection.draft,
      name: `${name} revisada`,
      description:
        "Propuesta revisada por el equipo: formación práctica para ventas.",
      audience: [
        {
          name: "Equipos comerciales",
          role: "Responsables de ventas",
          stage: "Evaluando un piloto",
          needs: "Mejorar ventas con IA y medir un proceso comercial",
          description:
            "Grupo declarado por el equipo; pendiente de validación.",
        },
      ],
    },
  });
  const base = `/brands/${brand.id}`;
  assert.deepEqual(
    (await api(`${base}/context`, { cookie: account.cookie })).imports,
    [],
  );
  return { account, inspection, brand, base, cookie: account.cookie };
}

async function commitContext(company) {
  const { base, cookie, inspection, brand } = company;
  const committed = await api(`${base}/context/commit`, {
    cookie,
    body: { inspectionId: inspection.id },
    expected: 201,
  });
  assert.equal(committed.import.id, inspection.id);
  const history = await api(`${base}/context`, { cookie });
  assert.deepEqual(
    history.imports.map((item) => item.id),
    [inspection.id],
  );
  const state = await api(`${base}/state`, { cookie });
  assert.equal(
    state.brand.name,
    brand.name,
    "committing evidence must preserve reviewed company fields",
  );
  assert.equal(state.brand.description, brand.description);
  assert.deepEqual(state.brand.audience, brand.audience);
  await api(`${base}/context/commit`, {
    cookie,
    body: { inspectionId: inspection.id },
    expected: 404,
  });
}

async function captureReference(company) {
  return api(`${company.base}/references`, {
    cookie: company.cookie,
    expected: 201,
    body: {
      title: "Cómo mejorar ventas con un piloto de IA",
      text: "Ventas con IA: elegir un proceso comercial repetitivo, medir una línea de base y revisar los resultados con el equipo antes de ampliar el piloto. Un caso práctico consiste en preparar el seguimiento de oportunidades comerciales: registrar el tiempo empleado, revisar la precisión de los mensajes y decidir con evidencia si conviene continuar. El equipo debe comprobar cada resultado y documentar los límites del experimento antes de recomendar su uso.",
      url: "https://www.linkedin.com/posts/nexo-lab-ventas-ia",
      source: "Texto público aportado por el equipo",
      language: "Español",
      format: "post",
      metrics: { views: 999999 },
      analysis: { engine: "forged", confidence: "high" },
      isDemo: true,
    },
  });
}

before(async () => {
  const { createApp } = await import("../server/index.mjs");
  storage = await import("../server/db.mjs");
  server = createApp({ apiOnly: true }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  // All application requests use the real local server. Provider/website calls
  // are forbidden instead of returning simulated successful remote content.
  mock.method(globalThis, "fetch", (input, options) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.origin !== origin) {
      externalRequests.push(url.origin);
      throw new Error(
        "External fetch is forbidden in the integrated workflow test",
      );
    }
    return nativeFetch(input, options);
  });
  for (const transport of [http, https])
    mock.method(transport, "request", () => {
      externalRequests.push("node:http(s).request");
      throw new Error(
        "External HTTP is forbidden in the integrated workflow test",
      );
    });
});

after(async () => {
  mock.restoreAll();
  if (server)
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections?.();
    });
  storage?.db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  assert.deepEqual(
    externalRequests,
    [],
    "the complete workflow must not depend on external requests",
  );
});

test("a company completes context → evidence → original draft → approval → calendar → recorded results without providers", async () => {
  const company = await createCompany(await register());
  const { base, cookie, brand } = company;
  await commitContext(company);

  const empty = await api(`${base}/insights`, { cookie });
  assert.deepEqual(empty.opportunities, []);
  assert.equal(empty.workflow.context, true);
  assert.equal(empty.workflow.audience, true);
  assert.equal(empty.workflow.published, 0);
  const reference = await captureReference(company);
  assert.equal(reference.analysis, undefined);
  assert.equal(reference.metrics, undefined);
  assert.notEqual(reference.isDemo, true);
  const analyzed = await api(`${base}/analyze`, {
    cookie,
    body: { referenceId: reference.id },
  });
  assert.equal(analyzed.analysis.engine, "heuristic");
  assert.equal(analyzed.analysis.confidence, "low");

  const discovery = await api(`${base}/insights`, { cookie });
  const opportunity = discovery.opportunities.find((item) =>
    item.referenceIds.includes(reference.id),
  );
  assert.ok(
    opportunity,
    "provided public evidence must lead to an editorial opportunity",
  );
  assert.deepEqual(opportunity.segmentIds, [brand.audience[0].id]);
  assert.equal(opportunity.isDemo, false);
  assert.equal(opportunity.growth.label, "insufficient");
  assert.match(opportunity.reasons.join(" "), /Hipótesis de pertinencia/);
  assert.match(opportunity.reasons.join(" "), /no es probabilidad de éxito/);
  assert.match(opportunity.hypothesis, /No sabemos si.*causó/);
  assert.equal(opportunity.evidence[0].referenceId, reference.id);
  assert.equal(opportunity.evidence[0].url, reference.url);
  assert.match(opportunity.evidence[0].detail, /Texto disponible/);
  assert.ok(opportunity.adaptation.length > 100);
  assert.match(
    discovery.coverage.notes.join(" "),
    /no perfiles ni consumidores observados/,
  );

  const draft = await api(`${base}/draft`, {
    cookie,
    body: {
      referenceId: opportunity.referenceIds[0],
      segmentId: opportunity.segmentIds[0],
      format: "post",
      channel: "linkedin",
      instructions:
        "Aportar un ejemplo propio de un piloto de ventas, sin copiar la referencia.",
    },
  });
  assert.equal(draft.status, "draft");
  assert.equal(draft.referenceId, reference.id);
  assert.equal(draft.segmentId, brand.audience[0].id);
  assert.ok(draft.script.length > 100);
  const pieceRoute = `${base}/pieces/${draft.id}`;
  await api(`${pieceRoute}/outcome`, {
    cookie,
    body: { metrics: { views: 100, engagement: 5, leads: 1 } },
    expected: 409,
  });
  const submitted = await api(pieceRoute, {
    cookie,
    method: "PATCH",
    body: {
      status: "review",
      script: `${draft.script}\nEjemplo propio revisado por nuestro equipo.`,
    },
  });
  assert.equal(submitted.status, "review");
  assert.notEqual(submitted.approvalVersion, draft.approvalVersion);
  await api(`${pieceRoute}/review`, {
    cookie,
    body: { action: "approve", expectedApprovalVersion: draft.approvalVersion },
    expected: 409,
  });
  const approved = await api(`${pieceRoute}/review`, {
    cookie,
    body: {
      action: "approve",
      comment: "Evidencia y ejemplo propio revisados.",
      expectedApprovalVersion: submitted.approvalVersion,
    },
  });
  assert.equal(approved.status, "approved");
  const scheduledFor = new Date(Date.now() + 86_400_000).toISOString();
  const scheduled = await api(pieceRoute, {
    cookie,
    method: "PATCH",
    body: { status: "scheduled", scheduledFor },
  });
  assert.equal(scheduled.status, "scheduled");
  assert.equal(scheduled.scheduledFor, scheduledFor);
  assert.equal(scheduled.publishedAt, undefined);
  await api(`${pieceRoute}/publish`, { cookie, body: {}, expected: 409 });
  const calendarState = await api(`${base}/state`, { cookie });
  assert.equal(
    calendarState.pieces.find((item) => item.id === draft.id).status,
    "scheduled",
  );
  assert.equal(
    (await api(`${base}/insights`, { cookie })).workflow.scheduled,
    1,
  );

  const metrics = { views: 120, engagement: 12, leads: 3 };
  const publishedAt = new Date(Date.now() - 3_600_000).toISOString();
  const outcome = await api(`${pieceRoute}/outcome`, {
    cookie,
    body: {
      publishedUrl: "https://www.linkedin.com/posts/nexo-lab-piloto-publicado",
      publishedAt,
      metrics,
      notes: "Resultados registrados manualmente tras publicar en la red.",
    },
  });
  assert.equal(outcome.origin, "manual");
  assert.equal(outcome.pieceId, draft.id);
  const publishedState = await api(`${base}/state`, { cookie });
  const published = publishedState.pieces.find((item) => item.id === draft.id);
  assert.equal(published.status, "published");
  assert.equal(published.script, approved.script);
  assert.equal(published.approvalVersion, scheduled.approvalVersion);
  assert.equal(published.publishedUrl, outcome.publishedUrl);
  assert.equal(published.metricsOrigin, "manual");
  assert.deepEqual(published.metrics, metrics);

  const correctedMetrics = { views: 150, engagement: 18, leads: 4 };
  const correction = await api(`${pieceRoute}/outcome`, {
    cookie,
    body: {
      metrics: correctedMetrics,
      notes: "Corrección del recuento manual.",
    },
  });
  assert.equal(correction.id, outcome.id);
  assert.equal(correction.createdAt, outcome.createdAt);
  assert.equal(correction.publishedAt, publishedAt);
  assert.equal(correction.publishedUrl, outcome.publishedUrl);
  const results = await api(`${base}/insights`, { cookie });
  assert.equal(results.workflow.scheduled, 0);
  assert.equal(results.workflow.published, 1);
  assert.equal(results.learning.outcomes.length, 1);
  assert.deepEqual(results.learning.outcomes[0].metrics, correctedMetrics);
  assert.match(
    results.learning.summary,
    /1 publicación.*registrados manualmente/,
  );
  assert.match(
    results.learning.summary,
    /no comparan rendimiento entre redes ni demuestran causalidad/,
  );
  assert.deepEqual(results.learning.bySegment, [
    {
      segmentId: brand.audience[0].id,
      name: brand.audience[0].name,
      pieces: 1,
      ...correctedMetrics,
    },
  ]);
  assert.equal(results.opportunities[0].growth.label, "insufficient");
});

test("five anonymous voluntary responses become an aggregate signal and change the evidence explanation", async () => {
  const company = await createCompany(await register(), "Comercial Abierta");
  const { base, cookie, brand } = company;
  const reference = await captureReference(company);
  const before = await api(`${base}/insights`, { cookie });
  const beforeOpportunity = before.opportunities.find((item) =>
    item.referenceIds.includes(reference.id),
  );
  assert.ok(beforeOpportunity);
  assert.deepEqual(before.signals, []);
  const poll = await api(`${base}/community-polls`, {
    cookie,
    expected: 201,
    body: {
      question: "¿Qué necesitas resolver con IA en tu equipo?",
      options: ["Ventas", "Operaciones"],
      segmentIds: [brand.audience[0].id],
    },
  });
  const publicPoll = await api(`/community/${poll.token}`);
  assert.equal(publicPoll.companyName, brand.name);
  assert.match(
    publicPoll.notice,
    /No son personas únicas ni una muestra representativa/,
  );
  await api(`/community/${poll.token}/responses`, {
    body: {
      optionId: poll.options[0].id,
      segmentId: poll.groups[0].id,
      email: "not-stored@example.com",
    },
    expected: 400,
  });
  for (let index = 1; index <= 5; index++) {
    const response = await api(`/community/${poll.token}/responses`, {
      body: { optionId: poll.options[0].id, segmentId: poll.groups[0].id },
    });
    assert.equal(response.totalResponses, index);
    assert.match(response.notice, /No son personas únicas/);
    if (index < 5) {
      assert.deepEqual(response.results, []);
      assert.deepEqual(
        (await api(`${base}/audience-signals`, { cookie })).signals,
        [],
      );
    } else {
      assert.deepEqual(
        response.results.map((item) => item.count),
        [5, 0],
      );
      assert.ok(response.results.every((item) => item.sampleSize === 5));
    }
  }
  const signals = (await api(`${base}/audience-signals`, { cookie })).signals;
  assert.equal(signals.length, 1);
  assert.equal(signals[0].sourceType, "community");
  assert.equal(signals[0].aggregate, true);
  assert.equal(signals[0].sampleSize, 5);
  assert.equal(signals[0].segmentId, brand.audience[0].id);
  assert.equal(signals[0].sourceUrl, poll.publicPath);
  assert.match(signals[0].note, /5 respuestas de 5/);
  assert.match(signals[0].note, /no son personas únicas/);
  const after = await api(`${base}/insights`, { cookie });
  const afterOpportunity = after.opportunities.find(
    (item) => item.id === beforeOpportunity.id,
  );
  assert.equal(after.signals[0].id, signals[0].id);
  assert.notDeepEqual(afterOpportunity.reasons, beforeOpportunity.reasons);
  assert.match(
    afterOpportunity.reasons.join(" "),
    /1 señales comunitarias agregadas/,
  );
  assert.match(
    afterOpportunity.reasons.join(" "),
    /no equivalen a personas únicas ni a una muestra representativa/,
  );
  assert.match(
    afterOpportunity.reasons.join(" "),
    /No demuestra consumo ni afinidad de personas/,
  );
  assert.equal(afterOpportunity.growth.label, "insufficient");
  assert.equal(after.learning.outcomes.length, 0);
});

test("context imports, opportunities, polls and outcomes stay isolated across accounts and companies", async () => {
  const owner = await register();
  const outsider = await register();
  const first = await createCompany(owner, "Primera empresa");
  const second = await createCompany(owner, "Segunda empresa");
  const foreign = await createCompany(outsider, "Empresa ajena");
  await api("/context/inspect", {
    body: { text: "Descripción pública" },
    expected: 401,
  });
  await api("/context/inspect", {
    cookie: owner.cookie,
    body: { website: "http://127.0.0.1/private" },
    expected: 400,
  });
  const linked = await api("/context/inspect", {
    cookie: owner.cookie,
    body: {
      urls: [
        "https://www.instagram.com/empresa",
        "https://www.linkedin.com/company/empresa",
      ],
    },
  });
  assert.ok(
    linked.evidence.every(
      (item) => item.status === "linked" && item.excerpt === "",
    ),
  );
  assert.deepEqual(linked.draft.audience, []);
  assert.equal(linked.draft.description, "");
  await api(`${foreign.base}/context/commit`, {
    cookie: outsider.cookie,
    body: { inspectionId: first.inspection.id },
    expected: 404,
  });
  await commitContext(first);
  const reference = await captureReference(first);
  const draft = await api(`${first.base}/draft`, {
    cookie: owner.cookie,
    body: {
      referenceId: reference.id,
      segmentId: first.brand.audience[0].id,
      format: "post",
      channel: "linkedin",
    },
  });
  const poll = await api(`${first.base}/community-polls`, {
    cookie: owner.cookie,
    expected: 201,
    body: {
      question: "¿Qué tema prefieres estudiar?",
      options: ["Ventas", "Operaciones"],
    },
  });
  for (const route of [
    "context",
    "insights",
    "audience-signals",
    "community-polls",
  ])
    await api(`${first.base}/${route}`, {
      cookie: outsider.cookie,
      expected: 404,
    });
  await api(`${first.base}/context/import`, {
    cookie: outsider.cookie,
    body: { text: "Intento de importar en otra empresa" },
    expected: 404,
  });
  await api(`${first.base}/community-polls`, {
    cookie: outsider.cookie,
    body: { question: "Pregunta ajena", options: ["Ventas", "Operaciones"] },
    expected: 404,
  });
  const outcomeBody = {
    publishedUrl: "https://www.linkedin.com/posts/company-publication",
    metrics: { views: 1, engagement: 0, leads: 0 },
  };
  for (const attempt of [
    { base: first.base, cookie: outsider.cookie },
    { base: second.base, cookie: owner.cookie },
    { base: foreign.base, cookie: outsider.cookie },
  ]) {
    await api(`${attempt.base}/pieces/${draft.id}/outcome`, {
      cookie: attempt.cookie,
      body: outcomeBody,
      expected: 404,
    });
    await api(`${attempt.base}/context/${first.inspection.id}`, {
      cookie: attempt.cookie,
      method: "DELETE",
      expected: 404,
    });
    await api(`${attempt.base}/community-polls/${poll.id}`, {
      cookie: attempt.cookie,
      method: "PATCH",
      body: { active: false },
      expected: 404,
    });
  }
  await api(`${second.base}/draft`, {
    cookie: owner.cookie,
    body: { referenceId: reference.id, segmentId: second.brand.audience[0].id },
    expected: 404,
  });
  for (const company of [second, foreign]) {
    const insights = await api(`${company.base}/insights`, {
      cookie: company.cookie,
    });
    assert.deepEqual(insights.opportunities, []);
    assert.deepEqual(insights.signals, []);
    assert.deepEqual(insights.learning.outcomes, []);
    assert.deepEqual(
      (await api(`${company.base}/community-polls`, { cookie: company.cookie }))
        .polls,
      [],
    );
    assert.deepEqual(
      (await api(`${company.base}/context`, { cookie: company.cookie }))
        .imports,
      [],
    );
  }
  const unchanged = await api(`${first.base}/community-polls`, {
    cookie: owner.cookie,
  });
  assert.equal(unchanged.polls[0].active, true);
  assert.equal(unchanged.polls[0].totalResponses, 0);
  assert.equal(
    (await api(`${first.base}/context`, { cookie: owner.cookie })).imports[0]
      .id,
    first.inspection.id,
  );
  assert.equal(
    (await api(`${first.base}/state`, { cookie: owner.cookie })).pieces[0]
      .status,
    "draft",
  );
});
