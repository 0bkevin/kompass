import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "30x-remediation-signals-2-"),
);
process.env.DATA_DIR = directory;
process.env.DISCOVERY_ENABLED = "false";
for (const name of [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "YOUTUBE_API_KEY",
  "APIFY_API_TOKEN",
])
  process.env[name] = "";

let server;
let origin;
let cookie;
let brand;
let storage;
let insights;

async function request(route, body, method = body ? "POST" : "GET") {
  const response = await fetch(`${origin}/api${route}`, {
    method,
    redirect: "error",
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}

function signalInput(sourceUrl, values = {}) {
  return {
    segmentId: brand.audience[0].id,
    topic: "Ventas agregadas · SINTÉTICO",
    note: "Tres artículos públicos describen necesidades de equipos comerciales.",
    sourceType: "public_content",
    sourceUrl,
    sampleSize: 3,
    ...values,
  };
}

// Fictitious values only: these cases never access their external URLs.
const email = "persona.sintetica@example.com";
const privateUrls = [
  ["the reported email in the path", `https://example.com/personas/${email}`],
  ["the reported email in contact=", `https://example.com/?contact=${email}`],
  [
    "an email in an unrelated query parameter",
    `https://example.com/?q=${email}`,
  ],
  [
    "a percent-encoded email in the path",
    "https://example.com/personas/persona.sintetica%40example.com",
  ],
  [
    "a fully encoded email",
    `https://example.com/?q=${[...email].map((character) => `%${character.charCodeAt(0).toString(16)}`).join("")}`,
  ],
  [
    "a twice-encoded email",
    "https://example.com/?q=persona.sintetica%2540example.com",
  ],
  [
    "a deeply encoded email",
    `https://example.com/personas/persona.sintetica%${"25".repeat(30)}40example.com`,
  ],
  [
    "an email beside a malformed percent escape",
    "https://example.com/?q=%ZZpersona.sintetica%40example.com%",
  ],
  [
    "an email beside an invalid UTF-8 escape",
    "https://example.com/?q=%FFpersona.sintetica%40example.com",
  ],
  [
    "an email in a fragment",
    "https://example.com/article#contact=persona.sintetica%40example.com",
  ],
  [
    "an email in a nested encoded link",
    "https://example.com/article?next=https%253A%252F%252Fexample.com%252F%253Fcontact%253Dpersona.sintetica%2540example.com",
  ],
  [
    "a phone in a labelled query value",
    "https://example.com/article?phone=%2B57%20310%20000%200000",
  ],
  ["a phone in a labelled path", "https://example.com/telefono/573100000000"],
  [
    "a contact phone in a fragment",
    "https://example.com/article#contacto=573100000000",
  ],
  [
    "a name combined with personal attributes",
    "https://example.com/article?name=Ana+Sint%C3%A9tica+Ejemplo&job_title=directora",
  ],
  [
    "an explicitly identified person in a path",
    "https://example.com/persona/Ana%20Sint%C3%A9tica%20Ejemplo",
  ],
  [
    "a contact name in a query",
    "https://example.com/article?contacto=Ana+Sint%C3%A9tica+Ejemplo",
  ],
  [
    "explicit personal identity fields",
    "https://example.com/article?full_name=Ana%20Sintetica&job_title=directora",
  ],
  [
    "a lowercase explicit contact name",
    "https://example.com/article?contact_name=ana+sintetica+ejemplo",
  ],
  [
    "an individual contact identifier",
    "https://example.com/article?contact_id=synthetic-person-123",
  ],
  [
    "encoded personal field names",
    "https://example.com/article?%2570%2568%256f%256e%2565=573100000000",
  ],
  [
    "a nested contact record",
    "https://example.com/article?data=name%253DAna%2520Sintetica%2526phone%253D573100000000",
  ],
];

const publicUrls = [
  "https://www.youtube.com/watch?v=12345678901&t=120",
  "https://youtu.be/12345678901",
  "https://news.ycombinator.com/item?id=123456789012",
  "https://www.linkedin.com/posts/equipo-sintetico_ventas-activity-1234567890123456789-abcd?utm_source=share&utm_medium=member_desktop",
  "https://www.linkedin.com/feed/update/urn:li:activity:1234567890123456789/",
  "https://www.youtube.com/@equipo.sintetico/videos",
  "https://example.com/@equipo.sintetico/1234567890123456789",
  "https://example.com/article?name=report.pdf&contact=form&phone=enabled&sort=name",
  "https://example.com/article?name=informe+anual&contact=public&phone=false",
  "https://example.com/article?name=Google%20Trends",
  "https://example.com/article?name=Ana%20Sintetica%20Ejemplo&author=public",
  "https://example.com/author/Ana-Sintetica-Ejemplo",
  "https://example.com/topics/contact/phone/name",
  "https://example.com/article?q=25%25&ref=%ZZ",
  "https://example.com/article?date=20261018&id=573100000000",
];

before(async () => {
  const { createApp } = await import("../server/index.mjs");
  storage = await import("../server/db.mjs");
  insights = await import("../server/audience-insights.mjs");
  server = createApp({ apiOnly: true }).listen(0, "127.0.1.15");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.1.15:${server.address().port}`;
  const registration = await request("/auth/register", {
    name: "Equipo sintético de privacidad URL",
    email: "signals-2-synthetic@example.com",
    password: "synthetic-fixture-password-30x",
  });
  assert.equal(registration.status, 201);
  cookie = registration.cookie;
  const created = await request("/brands", {
    name: "Marca sintética de privacidad URL",
    audience: [
      {
        name: "Equipos comerciales",
        role: "Dirección comercial",
        needs: "Preparar propuestas de ventas más rápido",
        stage: "Validación",
      },
    ],
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  brand = created.data;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  storage?.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

for (const [label, sourceUrl] of privateUrls) {
  test(`the UI POST rejects ${label}, without storing or echoing it`, async () => {
    const response = await request(
      `/brands/${brand.id}/audience-signals`,
      signalInput(sourceUrl),
    );
    assert.equal(
      response.status,
      400,
      `Expected rejection; got ${response.status}`,
    );
    assert.doesNotMatch(
      response.data.error,
      /persona\.sintetica|310|Ana|Sint[eé]tica/,
    );
    assert.equal(
      storage
        .listRecords(brand.id, "audienceSignals")
        .some((signal) => signal.sourceUrl === sourceUrl),
      false,
    );
  });
}

test("an optional editorial citation receives the same privacy validation", async () => {
  const response = await request(
    `/brands/${brand.id}/audience-signals`,
    signalInput(`https://example.com/?contact=${email}`, {
      sourceType: "editorial",
    }),
  );
  assert.equal(response.status, 400);
  const uncited = await request(
    `/brands/${brand.id}/audience-signals`,
    signalInput(undefined, { sourceType: "editorial" }),
  );
  assert.equal(uncited.status, 201);
});

test("public post URLs, handles, long content IDs and functional parameters stay usable", async () => {
  for (const sourceUrl of publicUrls) {
    const response = await request(
      `/brands/${brand.id}/audience-signals`,
      signalInput(`  ${sourceUrl}  `),
    );
    assert.equal(
      response.status,
      201,
      JSON.stringify({ sourceUrl, response: response.data }),
    );
    assert.equal(response.data.sourceUrl, new URL(sourceUrl).href);
  }
});

test("existing public-origin, credentials and session restrictions stay enforced", async () => {
  for (const sourceUrl of [
    "http://127.0.0.1/a",
    "http://[::1]/a",
    "http://localhost/a",
    "https://intranet.local/a",
    "https://example.com:8080/a",
    "https://user:synthetic@example.com/a",
    "javascript:alert(1)",
    "https://example.com/login",
    "https://example.com/article?token=synthetic",
  ]) {
    const response = await request(
      `/brands/${brand.id}/audience-signals`,
      signalInput(sourceUrl),
    );
    assert.equal(response.status, 400);
  }
});

test("legacy contact URLs are excluded from reads and the insights corpus, without deleting storage", async () => {
  const safe = storage.saveRecord(
    brand.id,
    "audienceSignals",
    signalInput("https://example.com/aggregate-observation"),
  );
  const legacy = privateUrls.map(([, sourceUrl]) =>
    storage.saveRecord(brand.id, "audienceSignals", signalInput(sourceUrl)),
  );
  for (const route of ["audience-signals", "insights"]) {
    const response = await request(`/brands/${brand.id}/${route}`);
    assert.equal(response.status, 200);
    for (const row of legacy)
      assert.equal(
        response.data.signals.some((signal) => signal.id === row.id),
        false,
        `${route} must not expose a legacy contact URL`,
      );
    assert.ok(response.data.signals.some((signal) => signal.id === safe.id));
    assert.doesNotMatch(
      JSON.stringify(response.data),
      /persona\.sintetica@example\.com|Ana\+Sint/,
    );
  }
  for (const row of legacy)
    assert.ok(storage.getRecord(brand.id, "audienceSignals", row.id));
});

test("community aggregate URLs remain relative and retain their existing admission rules", async () => {
  const community = storage.saveRecord(brand.id, "audienceSignals", {
    ...signalInput("/community/synthetic-public-poll"),
    sourceType: "community",
    aggregate: true,
    sampleSize: 5,
    communityPollId: "synthetic-public-poll",
  });
  const unsafeCommunity = storage.saveRecord(brand.id, "audienceSignals", {
    ...community,
    id: undefined,
    sourceUrl: `/community/synthetic-public-poll?contact=${email}`,
  });
  const response = await request(`/brands/${brand.id}/audience-signals`);
  assert.equal(response.status, 200);
  assert.equal(
    response.data.signals.find((signal) => signal.id === community.id)
      ?.sourceUrl,
    community.sourceUrl,
  );
  assert.equal(
    response.data.signals.some((signal) => signal.id === unsafeCommunity.id),
    false,
  );
});

test("the shared citation helper omits contact URLs and keeps public evidence IDs", () => {
  const reference = (id, url) => ({
    id,
    url,
    title: "Ventas de equipos · SINTÉTICO",
    text: "Necesidad agregada de preparar propuestas comerciales.",
    topic: "Ventas",
    platform: "linkedin",
    status: "new",
    tags: [],
  });
  const result = insights.buildInsights(brand, {
    references: [
      reference(
        "synthetic-private-reference",
        `https://example.com/?contact=${email}`,
      ),
      reference("synthetic-public-reference", publicUrls[2]),
    ],
    pieces: [],
    signals: [],
    sources: [],
    outcomes: [],
    snapshots: [],
    analyses: [],
  });
  const evidence = result.opportunities.flatMap(
    (opportunity) => opportunity.evidence,
  );
  const privateEvidence = evidence.find(
    (item) => item.referenceId === "synthetic-private-reference",
  );
  assert.ok(privateEvidence);
  assert.equal(privateEvidence.url, undefined);
  assert.ok(evidence.some((item) => item.url === publicUrls[2]));
  assert.doesNotMatch(
    JSON.stringify(result.opportunities),
    /persona\.sintetica/,
  );
});

test("the real AI analysis route receives no legacy contact signals (isolated simulated provider)", async () => {
  const express = (await import("express")).default;
  const { createOpportunityAnalysisRouter } =
    await import("../server/opportunity-analysis.mjs");
  const reference = storage.saveRecord(brand.id, "references", {
    title: "Propuestas comerciales · REFERENCIA SINTÉTICA",
    text: "Los equipos necesitan preparar propuestas claras y verificables.",
    topic: "Ventas agregadas · SINTÉTICO",
    url: "https://example.com/synthetic-public-article",
    platform: "linkedin",
    status: "new",
    tags: [],
  });
  const opportunity = insights
    .buildInsights(brand)
    .opportunities.find((item) => item.referenceIds.includes(reference.id));
  assert.ok(opportunity);
  storage.setSecret(brand.id, "ai", {
    apiKey: "synthetic-test-only-provider-credential",
    model: "synthetic-model",
    baseUrl: "https://model.example/v1",
  });
  const legacyContactIds = new Set(
    storage
      .listRecords(brand.id, "audienceSignals")
      .filter((signal) =>
        privateUrls.some(([, url]) => signal.sourceUrl === url),
      )
      .map((signal) => signal.id),
  );
  assert.ok(legacyContactIds.size > 0);
  let providerInput;
  let providerCalls = 0;
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createOpportunityAnalysisRouter({
      fetcher: async (_url, options) => {
        providerCalls++;
        const payload = JSON.parse(options.body);
        providerInput = JSON.parse(payload.input[0].content[0].text);
        assert.equal(
          providerInput.signals.some((signal) =>
            legacyContactIds.has(signal.id),
          ),
          false,
        );
        return new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              need: "Preparar propuestas claras para los equipos comerciales.",
              rationale:
                "La referencia sintética describe una necesidad del grupo; la relación es una hipótesis editorial.",
              hookHypothesis:
                "Hipótesis editorial: presentar una decisión concreta sobre propuestas puede facilitar su comprensión.",
              adaptation:
                "Desarrollar un ejemplo sintético de una propuesta comercial y explicar cómo contrastar sus afirmaciones antes de usarla.",
              segmentIds: [brand.audience[0].id],
              citations: [
                { referenceId: reference.id, support: reference.text },
              ],
              limitations: [
                "La referencia sintética no demuestra consumo ni representatividad de la audiencia.",
              ],
            }),
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    }),
  );
  app.use((error, _req, res, _next) =>
    res.status(error.status || 500).json({ error: error.message }),
  );
  const analysisServer = app.listen(0, "127.0.1.15");
  await new Promise((resolve) => analysisServer.once("listening", resolve));
  try {
    const response = await fetch(
      `http://127.0.1.15:${analysisServer.address().port}/api/brands/${brand.id}/opportunities/${opportunity.id}/analyze`,
      {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: "{}",
      },
    );
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.equal(providerCalls, 1);
    assert.ok(providerInput.signals.length > 0);
    assert.equal(
      providerInput.coverage.availableSignals,
      insights.buildInsights(brand).signals.length,
    );
    assert.doesNotMatch(
      JSON.stringify(providerInput),
      /persona\.sintetica|%2540example/,
    );
  } finally {
    await new Promise((resolve) => analysisServer.close(resolve));
  }
});

test("publication URLs reuse the same validation and preserve valid long IDs", async () => {
  const piece = storage.saveRecord(brand.id, "pieces", {
    title: "Publicación sintética aprobada",
    hook: "Ejemplo",
    script: "Contenido sintético de ventas para equipos.",
    caption: "Ejemplo sintético.",
    cta: "Aprender",
    format: "post",
    channel: "linkedin",
    status: "approved",
  });
  const route = `/brands/${brand.id}/pieces/${piece.id}/outcome`;
  const rejected = await request(route, {
    metrics: { views: 3 },
    publishedUrl: `https://example.com/?contact=${email}`,
  });
  assert.equal(rejected.status, 400);
  assert.doesNotMatch(rejected.data.error, /persona\.sintetica/);
  assert.equal(
    storage
      .listRecords(brand.id, "outcomes")
      .some((item) => item.pieceId === piece.id),
    false,
  );
  const accepted = await request(route, {
    metrics: { views: 3 },
    publishedUrl: publicUrls[3],
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  assert.equal(accepted.data.publishedUrl, new URL(publicUrls[3]).href);
});
