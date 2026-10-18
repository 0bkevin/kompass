import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installPermissionFixture } from "./permission-fixture.mjs";

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "radar-managed-integrations-"),
);
process.env.DATA_DIR = directory;
process.env.DISCOVERY_ENABLED = "false";
for (const name of [
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_BASE_URL",
  "SOURCE_ACCESS_POLICY_FILE",
])
  delete process.env[name];
const database = await import("../server/db.mjs");
const { resolveAiConfig } = await import("../server/integration-config.mjs");
const { getAiConfig, configureIntegrations, generateStructured } =
  await import("../server/connectors.mjs");
const { prepareWorkspace, createDraft, syncSources } =
  await import("../server/intelligence.mjs");
const { platformReadiness } = await import("../server/platform-readiness.mjs");
const { createApp } = await import("../server/index.mjs");
const { sourceAccessPolicy } = await import("../server/access-policy.mjs");
const makeBrand = (extra = {}) =>
  database.saveBrand({
    name: "Synthetic company",
    market: "México",
    industry: "educación",
    pillars: ["education"],
    audience: [{ id: "leaders", name: "Líderes", needs: "Mejorar equipos" }],
    ...extra,
  });
const sourceFor = (brand) =>
  database.saveRecord(brand.id, "sources", {
    name: "Hacker News",
    type: "hackernews",
    enabled: true,
  });
function platformAi() {
  process.env.OPENAI_API_KEY = "SIMULATED_PLATFORM_NOT_A_REAL_KEY";
  process.env.OPENAI_BASE_URL = "https://ai.example.test/v1";
  process.env.OPENAI_MODEL = "synthetic-platform-model";
  installPermissionFixture(directory, [
    { origin: "https://ai.example.test", pathPrefix: "/v1", purposes: ["ai"] },
  ]);
}
after(() => {
  database.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("platform AI is inherited across company spaces without storing or exposing its credential", async () => {
  platformAi();
  const brands = [makeBrand(), makeBrand()];
  for (const brand of brands) {
    const state = database.publicIntegrations(brand.id);
    assert.equal(state.ai.ready, true);
    assert.equal(state.ai.managedBy, "platform");
    assert.equal(state.ai.model, "synthetic-platform-model");
    assert.equal(database.getSecret(brand.id, "ai"), null);
    assert.doesNotMatch(JSON.stringify(state), /SIMULATED_PLATFORM|apiKey/);
    let calls = 0;
    const result = await generateStructured(
      brand.id,
      {
        name: "synthetic",
        schema: { type: "object" },
        instructions: "Synthetic",
        input: "Company-owned test input",
      },
      {
        fetcher: async (url, options) => {
          calls++;
          assert.equal(url, "https://ai.example.test/v1/responses");
          assert.equal(
            options.headers.authorization,
            "Bearer SIMULATED_PLATFORM_NOT_A_REAL_KEY",
          );
          assert.equal(
            JSON.parse(options.body).model,
            "synthetic-platform-model",
          );
          return Response.json({ output_text: '{"ok":true}' });
        },
      },
    );
    assert.equal(calls, 1);
    assert.deepEqual(result, { ok: true });
  }
});

test("workspace endpoint or model settings cannot redirect or upgrade the shared platform key", () => {
  platformAi();
  const brand = makeBrand();
  database.setSecret(brand.id, "ai", {
    baseUrl: "https://other-provider.example.test/v1",
    model: "expensive-other-model",
  });
  const config = getAiConfig(brand.id);
  assert.equal(config.baseUrl, process.env.OPENAI_BASE_URL);
  assert.equal(config.model, process.env.OPENAI_MODEL);
  assert.equal(config.managedBy, "platform");
  assert.equal(resolveAiConfig({ disabled: true }), null);
});

test("company overrides stay isolated and can return to platform defaults without copying secrets", async () => {
  platformAi();
  const a = makeBrand(),
    b = makeBrand();
  const own = {
    apiKey: "SIMULATED_WORKSPACE_ONLY",
    baseUrl: "https://own.example.test/v1",
    model: "own-model",
  };
  database.setSecret(a.id, "ai", own);
  database.setSecret(a.id, "webhook", {
    url: "https://own.example.test/publish",
  });
  assert.equal(getAiConfig(a.id).managedBy, "workspace");
  assert.equal(getAiConfig(b.id).managedBy, "platform");
  const webhook = database.getSecret(a.id, "webhook");
  await assert.rejects(
    configureIntegrations(a.id, {
      ai: { usePlatform: true, apiKey: "invalid-mix" },
      webhook: null,
    }),
    { status: 400 },
  );
  assert.deepEqual(database.getSecret(a.id, "ai"), own);
  assert.deepEqual(database.getSecret(a.id, "webhook"), webhook);
  const state = await configureIntegrations(a.id, {
    ai: { usePlatform: true },
  });
  assert.equal(state.ai.ready, true);
  assert.equal(database.getSecret(a.id, "ai"), null);
  assert.deepEqual(database.getSecret(a.id, "webhook"), webhook);
});

test("AI readiness is revoked immediately while the local drafting workflow remains usable", async () => {
  platformAi();
  const brand = makeBrand();
  assert.equal(database.publicIntegrations(brand.id).ai.ready, true);
  installPermissionFixture(directory, []);
  const state = database.publicIntegrations(brand.id);
  assert.equal(state.ai.configured, true);
  assert.equal(state.ai.ready, false);
  let calls = 0;
  const draft = await createDraft(
    brand,
    { topic: "Organizar un equipo", channel: "linkedin" },
    {
      fetcher: async () => {
        calls++;
        throw Error("Must not reach a provider");
      },
    },
  );
  assert.equal(draft.generationEngine, "heuristic");
  assert.equal(calls, 0);
});

test("first discovery is shared across concurrent entries and remembered after completion", async () => {
  const brand = makeBrand();
  sourceFor(brand);
  let release,
    calls = 0;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  const discover = async () => {
    calls++;
    await waiting;
    return { added: 3, sources: [{ id: "synthetic-source" }], errors: [] };
  };
  const a = prepareWorkspace(brand, { discover }),
    b = prepareWorkspace(brand, { discover });
  assert.equal(calls, 1);
  release();
  const [first, second] = await Promise.all([a, b]);
  assert.deepEqual(first, second);
  assert.equal(first.status, "ready");
  assert.equal(first.added, 3);
  assert.deepEqual(await prepareWorkspace(brand, { discover }), first);
  assert.equal(calls, 1);
});

test("discovery partial failures remain visible without automatic repeated calls", async () => {
  const brand = makeBrand();
  sourceFor(brand);
  let calls = 0;
  const discover = async () => {
    calls++;
    return {
      added: 2,
      sources: [{ id: "ok" }, { id: "down", error: "Synthetic failure" }],
      errors: ["Synthetic failure"],
    };
  };
  const result = await prepareWorkspace(brand, { discover });
  assert.equal(result.status, "partial");
  assert.deepEqual(result.errors, ["Synthetic failure"]);
  await prepareWorkspace(brand, { discover });
  assert.equal(calls, 1);
});

test("failed discovery does not pretend that a service connected and is not retried on every entry", async () => {
  const brand = makeBrand();
  sourceFor(brand);
  let calls = 0;
  const discover = async () => {
    calls++;
    throw Error("Synthetic network unavailable");
  };
  const result = await prepareWorkspace(brand, { discover });
  assert.equal(result.status, "failed");
  assert.match(result.errors[0], /network unavailable/);
  assert.deepEqual(await prepareWorkspace(brand, { discover }), result);
  assert.equal(calls, 1);
});

test("demo spaces, disabled sources and an existing discovery never trigger first-use transport", async () => {
  let calls = 0;
  const discover = async () => {
    calls++;
    throw Error("Unexpected discovery");
  };
  const demo = makeBrand({ isDemo: true });
  sourceFor(demo);
  assert.equal((await prepareWorkspace(demo, { discover })).status, "example");
  const disabled = makeBrand();
  database.saveRecord(disabled.id, "sources", {
    name: "Off",
    type: "hackernews",
    enabled: false,
  });
  assert.equal(
    (await prepareWorkspace(disabled, { discover })).status,
    "unavailable",
  );
  const existing = makeBrand();
  database.saveRecord(existing.id, "sources", {
    name: "Existing",
    type: "hackernews",
    enabled: true,
    lastSyncedAt: new Date().toISOString(),
  });
  assert.equal(
    (await prepareWorkspace(existing, { discover })).status,
    "existing",
  );
  assert.equal(calls, 0);
});

test("deployment check reports actual readiness without disclosing secrets or claiming social access", () => {
  platformAi();
  let report = platformReadiness();
  assert.equal(report.ai.ready, true);
  assert.equal(report.coreReady, true);
  assert.ok(
    report.restricted.every((provider) => provider.available === false),
  );
  assert.doesNotMatch(
    JSON.stringify(report),
    /SIMULATED_PLATFORM_NOT_A_REAL_KEY/,
  );
  delete process.env.OPENAI_API_KEY;
  report = platformReadiness();
  assert.equal(report.ai.ready, false);
  assert.equal(report.ai.configured, false);
  assert.equal(report.coreReady, true);
});

test("deployment check reports media and official social configuration without claiming runtime access", () => {
  const names = [
    "MEDIA_GENERATION_ENABLED",
    "YOUTUBE_DATA_API_KEY",
    "YOUTUBE_API_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_YOUTUBE_REDIRECT_URI",
    "SOCIAL_SYNC_ENABLED",
  ];
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  try {
    for (const name of names) delete process.env[name];
    process.env.YOUTUBE_API_KEY = "LEGACY_NOT_OFFICIAL_DATA_KEY";
    let report = platformReadiness();
    assert.equal(report.media.enabled, false);
    assert.equal(report.media.provider, "codex-chatgpt");
    assert.equal(report.media.execution, "local-worker");
    assert.equal(report.media.verification, "configuration-only");
    assert.equal(report.media.runtimeVerificationRequired, true);
    assert.deepEqual(report.media.video, {
      mode: "local-composition",
      audio: false,
    });
    assert.equal("ready" in report.media, false);
    assert.deepEqual(report.officialSocial.youtube, {
      publicDataConfigured: false,
      accountOAuthConfigured: false,
    });
    assert.equal(
      report.officialSocial.automaticSyncEnabled,
      true,
      "the scheduler is enabled by default, independently of credential/connection readiness",
    );
    assert.equal(report.officialSocial.runtimeVerificationRequired, true);
    assert.equal("ready" in report.officialSocial.youtube, false);
    process.env.MEDIA_GENERATION_ENABLED = "true";
    process.env.YOUTUBE_DATA_API_KEY = "SIMULATED_OFFICIAL_PUBLIC_DATA_KEY";
    process.env.GOOGLE_CLIENT_ID =
      "synthetic-client.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "SIMULATED_OFFICIAL_CLIENT_SECRET";
    process.env.GOOGLE_YOUTUBE_REDIRECT_URI =
      "http://localhost:3026/api/social/youtube/callback";
    process.env.SOCIAL_SYNC_ENABLED = "false";
    report = platformReadiness();
    assert.equal(report.media.enabled, true);
    assert.deepEqual(report.officialSocial.youtube, {
      publicDataConfigured: true,
      accountOAuthConfigured: true,
    });
    assert.equal(report.officialSocial.automaticSyncEnabled, false);
    assert.ok(
      report.restricted.every((provider) => provider.available === false),
      "new official configuration does not unlock legacy provider policy gates",
    );
    assert.equal(report.publishing.automaticSocialPublishing, false);
    assert.doesNotMatch(
      JSON.stringify(report),
      /SIMULATED_OFFICIAL|LEGACY_NOT_OFFICIAL|synthetic-client\.apps/,
    );
  } finally {
    for (const name of names)
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
  }
});

test("official YouTube readiness rejects incomplete OAuth and unsafe or mismatched callbacks", () => {
  const names = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_YOUTUBE_REDIRECT_URI",
    "YOUTUBE_DATA_API_KEY",
  ];
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  try {
    process.env.GOOGLE_CLIENT_ID =
      "synthetic-client.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "SIMULATED_OFFICIAL_CLIENT_SECRET";
    process.env.GOOGLE_YOUTUBE_REDIRECT_URI =
      "https://example.invalid/api/social/youtube/callback";
    assert.equal(
      platformReadiness().officialSocial.youtube.accountOAuthConfigured,
      true,
    );
    for (const callback of [
      "not a URL",
      "http://example.invalid/api/social/youtube/callback",
      "https://example.invalid/api/auth/google/callback",
      "https://example.invalid/api/social/youtube/callback?state=private",
      "https://example.invalid/api/social/youtube/callback#private",
      "https://user:password@example.invalid/api/social/youtube/callback",
    ]) {
      process.env.GOOGLE_YOUTUBE_REDIRECT_URI = callback;
      assert.equal(
        platformReadiness().officialSocial.youtube.accountOAuthConfigured,
        false,
        callback,
      );
    }
    process.env.GOOGLE_YOUTUBE_REDIRECT_URI =
      "http://127.0.0.1:3026/api/social/youtube/callback";
    assert.equal(
      platformReadiness().officialSocial.youtube.accountOAuthConfigured,
      true,
    );
    process.env.GOOGLE_CLIENT_ID = "invalid-client";
    assert.equal(
      platformReadiness().officialSocial.youtube.accountOAuthConfigured,
      false,
    );
    process.env.GOOGLE_CLIENT_ID =
      "synthetic-client.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "   ";
    assert.equal(
      platformReadiness().officialSocial.youtube.accountOAuthConfigured,
      false,
    );
    process.env.YOUTUBE_DATA_API_KEY = "   ";
    assert.equal(
      platformReadiness().officialSocial.youtube.publicDataConfigured,
      false,
    );
    process.env.YOUTUBE_DATA_API_KEY = "x".repeat(501);
    assert.equal(
      platformReadiness().officialSocial.youtube.publicDataConfigured,
      false,
    );
  } finally {
    for (const name of names)
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
  }
});

test("new spaces need no provider settings and first-use endpoints preserve tenant and role permissions", async () => {
  const server = createApp({ apiOnly: true }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function request(route, { method = "GET", body, cookie } = {}) {
    const response = await fetch(`${origin}/api${route}`, {
      method,
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
  try {
    const owner = await request("/auth/register", {
      method: "POST",
      body: {
        name: "Synthetic operator",
        email: "managed-owner@example.test",
        password: "synthetic-password-for-tests",
      },
    });
    const outsider = await request("/auth/register", {
      method: "POST",
      body: {
        name: "Synthetic outsider",
        email: "managed-outsider@example.test",
        password: "synthetic-password-for-tests",
      },
    });
    const company = await request("/brands", {
      method: "POST",
      cookie: owner.cookie,
      body: { name: "Ready company", industry: "educación", market: "México" },
    });
    assert.equal(company.status, 201);
    const id = company.data.id;
    const sources = database.listRecords(id, "sources");
    assert.equal(sources.length, 4);
    assert.ok(
      sources.every(
        (source) => source.enabled && sourceAccessPolicy(source).allowed,
      ),
    );
    assert.ok(sources.some((source) => source.url?.endsWith("geo=MX")));
    database.setSecret(id, "workspacePreparation", {
      status: "ready",
      added: 0,
      errors: [],
    });
    const route = `/brands/${id}/prepare`;
    assert.equal(
      (await request(route, { method: "POST", body: {} })).status,
      401,
    );
    assert.equal(
      (
        await request(route, {
          method: "POST",
          cookie: outsider.cookie,
          body: {},
        })
      ).status,
      404,
    );
    database.db
      .prepare(
        "UPDATE members SET role='reviewer' WHERE brand_id=? AND user_id=?",
      )
      .run(id, owner.data.user.id);
    assert.equal(
      (await request(route, { method: "POST", cookie: owner.cookie, body: {} }))
        .status,
      403,
    );
    database.db
      .prepare("UPDATE members SET role='owner' WHERE brand_id=? AND user_id=?")
      .run(id, owner.data.user.id);
    assert.equal(
      (await request(route, { method: "POST", cookie: owner.cookie, body: {} }))
        .status,
      200,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("a company that disabled AI can explicitly return to the platform service", async () => {
  platformAi();
  const brand = makeBrand();
  database.setSecret(brand.id, "ai", { disabled: true });
  const before = database.publicIntegrations(brand.id).ai;
  assert.equal(before.ready, false);
  assert.equal(before.hasOverride, true);
  const reset = await configureIntegrations(brand.id, {
    ai: { usePlatform: true },
  });
  assert.equal(reset.ai.ready, true);
  assert.equal(reset.ai.hasOverride, false);
  assert.equal(reset.ai.managedBy, "platform");
});

test("a successful manual discovery replaces a stale first-entry failure", async () => {
  const brand = makeBrand();
  sourceFor(brand);
  await prepareWorkspace(brand, {
    discover: async () => {
      throw Error("Synthetic initial failure");
    },
  });
  assert.equal(
    database.getSecret(brand.id, "workspacePreparation").status,
    "failed",
  );
  await syncSources(brand, {
    fetcher: async () =>
      Response.json({
        hits: [
          {
            objectID: "synthetic-recovery-story",
            title: "A synthetic education story",
            url: "https://example.com/education",
            created_at: new Date().toISOString(),
            points: 10,
            num_comments: 2,
          },
        ],
      }),
  });
  const after = await prepareWorkspace(brand, {
    discover: async () => {
      throw Error("Must reuse refreshed state");
    },
  });
  assert.equal(after.status, "ready");
  assert.deepEqual(after.errors, []);
  assert.equal(database.listRecords(brand.id, "references").length, 1);
});
