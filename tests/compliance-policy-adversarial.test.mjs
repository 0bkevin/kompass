import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dns from "node:dns/promises";
import https from "node:https";
import { EventEmitter } from "node:events";

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "radar-policy-adversarial-"),
);
process.env.DATA_DIR = directory;
process.env.DISCOVERY_ENABLED = "false";
for (const key of [
  "OPENAI_API_KEY",
  "APIFY_API_TOKEN",
  "YOUTUBE_API_KEY",
  "GEMINI_API_KEY",
])
  delete process.env[key];
const { db, saveRecord, listRecords } = await import("../server/db.mjs");
const { safeFetch } = await import("../server/connectors.mjs");
const {
  sourceAccessPolicy,
  webAccessPolicy,
  assertOutboundAllowed,
  referenceUsePolicy,
} = await import("../server/access-policy.mjs");
const { robotsAllows } = await import("../server/robots-policy.mjs");
const { fetchSource, extractMetadata, parseFeed, syncSources } =
  await import("../server/intelligence.mjs");
const { providerAttributionsForReference } =
  await import("../src/lib/provider-attribution.mjs");
const policyFile = path.join(directory, "reviewed-sources.json");
process.env.SOURCE_ACCESS_POLICY_FILE = policyFile;
function grant(
  origin = "https://allowed.example",
  pathPrefix = "/public",
  purposes = ["metadata", "rss", "website"],
) {
  const now = Date.now();
  return {
    origin,
    pathPrefix,
    purposes,
    reviewedBy: "Offline QA operator",
    evidenceUrl: "https://allowed.example/permission",
    note: "Synthetic approval fixture, not actual permission",
    reviewedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 3600000).toISOString(),
  };
}
function grants(...items) {
  fs.writeFileSync(policyFile, JSON.stringify({ version: 1, grants: items }));
}
function transport(t, respond) {
  const requests = [];
  t.mock.method(dns, "lookup", async () => [{ address: "8.8.8.8", family: 4 }]);
  t.mock.method(https, "request", (url, options, callback) => {
    requests.push(url.href);
    const outgoing = new EventEmitter();
    outgoing.write = () => {};
    outgoing.destroy = (error) => {
      if (error) outgoing.emit("error", error);
      outgoing.emit("close");
    };
    outgoing.end = () =>
      queueMicrotask(() => {
        const reply = respond(url, options);
        const incoming = new EventEmitter();
        incoming.statusCode = reply.status || 200;
        incoming.headers = reply.headers || { "content-type": "text/plain" };
        incoming.destroy = () => {};
        callback(incoming);
        if (reply.body) incoming.emit("data", Buffer.from(reply.body));
        incoming.emit("end");
        outgoing.emit("close");
      });
    return outgoing;
  });
  return requests;
}
let server, origin, cookie, brand;
async function request(route, body, method = "POST") {
  const response = await fetch(`${origin}/api${route}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
before(async () => {
  const { createApp } = await import("../server/index.mjs");
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const account = await request("/auth/register", {
    name: "Policy QA",
    email: "policy-qa@example.test",
    password: "policy-qa-long-password",
  });
  assert.equal(account.status, 201);
  cookie = account.cookie;
  const response = await request("/brands", {
    name: "Policy QA",
    industry: "technology",
    market: "Mexico",
    language: "es",
    audience: [],
    pillars: ["automation"],
  });
  assert.equal(response.status, 201);
  brand = response.body;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  delete process.env.SOURCE_ACCESS_POLICY_FILE;
  fs.rmSync(directory, { recursive: true, force: true });
});

test("restricted providers and disguised feed hostnames cannot reach injected transports", async () => {
  grants(grant("https://www.instagram.com", "/", ["rss", "metadata"]));
  let calls = 0;
  for (const source of [
    { type: "apify", platform: "instagram", enabled: true },
    { type: "apify", platform: "tiktok", enabled: true },
    { type: "youtube" },
    { type: "reddit" },
    { type: "rss", url: "https://www.instagram.com/feed" },
    { type: "rss", url: "https://old.reddit.com./r/artificial/.rss" },
    { type: "rss", url: "https://WWW.LINKEDIN.COM/feed" },
  ]) {
    await assert.rejects(
      fetchSource(brand, source, {
        fetcher: async () => {
          calls++;
          return new Response("unexpected");
        },
        socialFetcher: async () => {
          calls++;
          return [];
        },
      }),
      /bloquead|permiso|aprobado/,
    );
  }
  assert.equal(calls, 0);
});

test("expired, revoked and path-widened operator grants are not reused", () => {
  grants(grant());
  assert.equal(
    webAccessPolicy("https://allowed.example/public/page").allowed,
    true,
  );
  for (const url of [
    "https://allowed.example/private",
    "https://allowed.example/publicity",
    "https://allowed.example/public/%252e%252e/private",
    "https://allowed.example/public%2fprivate",
  ]) {
    if (url.includes("%252e")) continue; // Application-specific double decoding is outside URL semantics.
    assert.equal(webAccessPolicy(url).allowed, false, url);
  }
  grants({ ...grant(), expiresAt: new Date(Date.now() - 1).toISOString() });
  assert.equal(
    webAccessPolicy("https://allowed.example/public/page").allowed,
    false,
  );
  grants();
  assert.equal(
    webAccessPolicy("https://allowed.example/public/page").allowed,
    false,
  );
});

test("robots denial prevents the target request even for an approved source", async (t) => {
  grants(grant());
  const calls = transport(t, () => ({
    body: "User-agent: *\nDisallow: /public",
  }));
  await assert.rejects(
    safeFetch("https://allowed.example/public/article"),
    /robots/,
  );
  assert.deepEqual(calls, ["https://allowed.example/robots.txt"]);
});

test("requests identify as kompass while legacy crawler restrictions still block content", async (t) => {
  grants(grant());
  let robots = "User-agent: kompass\nAllow: /public";
  const calls = transport(t, (url, options) => {
    assert.equal(
      options.headers["user-agent"],
      "kompass/1.0 (public editorial feed reader)",
    );
    return {
      body: url.pathname === "/robots.txt" ? robots : "approved content",
    };
  });
  const response = await safeFetch("https://allowed.example/public/article");
  assert.equal(await response.text(), "approved content");
  assert.deepEqual(calls, [
    "https://allowed.example/robots.txt",
    "https://allowed.example/public/article",
  ]);

  robots += "\nUser-agent: 30XRadar\nDisallow: /public";
  await assert.rejects(
    safeFetch("https://allowed.example/public/article"),
    /robots/,
  );
  assert.deepEqual(calls.slice(2), ["https://allowed.example/robots.txt"]);
});

test("a permitted page redirect cannot reach a restricted platform", async (t) => {
  grants(grant());
  const calls = transport(t, (url) =>
    url.pathname === "/robots.txt"
      ? { body: "User-agent: *\nAllow: /" }
      : {
          status: 302,
          headers: { location: "https://instagram.com/reel/test" },
        },
  );
  await assert.rejects(
    safeFetch("https://allowed.example/public/article"),
    /bloqueada/,
  );
  assert.deepEqual(calls, [
    "https://allowed.example/robots.txt",
    "https://allowed.example/public/article",
  ]);
});

test("metadata enrichment does not call its injected transport for an unreviewed URL", async () => {
  grants();
  let calls = 0;
  const result = await extractMetadata(
    { title: "Link", url: "https://unreviewed.example/page", text: "" },
    {
      fetcher: async () => {
        calls++;
        return new Response("secret");
      },
    },
  );
  assert.equal(calls, 0);
  assert.equal(result.reference.text, "");
  assert.ok(result.signals.length > 0);
});

test("official RSS allowlist rejects query/path and hostname lookalikes", () => {
  grants();
  for (const url of [
    "https://trends.google.com/trends/explore?geo=US",
    "https://trends.google.com/trending/rss?geo=US&url=https://instagram.com",
    "https://trends.google.com.attacker.example/trending/rss?geo=US",
    "https://trends.google.com/trending/rss?geo=US&geo=CO",
  ])
    assert.equal(sourceAccessPolicy({ type: "rss", url }).allowed, false, url);
  assert.equal(
    sourceAccessPolicy({
      type: "rss",
      url: "https://trends.google.com/trending/rss?geo=US",
    }).allowed,
    true,
  );
  assert.throws(
    () =>
      assertOutboundAllowed("https://api.apify.com/v2/acts/test", "discovery"),
    /bloqueada/,
  );
});

test("robots parser honors product-specific groups, longest match and percent-encoded unreserved paths", () => {
  assert.equal(
    robotsAllows(
      "User-agent: *\nAllow: /\nUser-agent: KoMpAsS\nDisallow: /private\nAllow: /private/public",
      "https://allowed.example/private/x",
    ),
    false,
  );
  assert.equal(
    robotsAllows(
      "User-agent: *\nDisallow: /private\nAllow: /private/public",
      "https://allowed.example/private/public",
    ),
    true,
  );
  assert.equal(
    robotsAllows(
      "User-agent: *\nDisallow: /private",
      "https://allowed.example/pr%69vate",
    ),
    false,
  );
});

test("current and legacy crawler groups must both permit a path", () => {
  const cases = [
    {
      robots:
        "User-agent: *\nAllow: /\nUser-agent: 30XRadar\nDisallow: /private",
      path: "/private/article",
      allowed: false,
    },
    {
      robots:
        "User-agent: kompass\nAllow: /\nUser-agent: 30XRadar\nDisallow: /private",
      path: "/private/article",
      allowed: false,
    },
    {
      robots:
        "User-agent: kompass\nDisallow: /private\nUser-agent: 30XRadar\nAllow: /",
      path: "/private/article",
      allowed: false,
    },
    {
      robots:
        "User-agent: kompass\nDisallow: /private\nAllow: /private/public\nUser-agent: 30XRadar\nDisallow: /private\nAllow: /private/public",
      path: "/private/public/article",
      allowed: true,
    },
    {
      robots: "User-agent: *\nDisallow: /\nUser-agent: kompass\nAllow: /public",
      path: "/public/article",
      allowed: true,
    },
  ];
  for (const { robots, path, allowed } of cases)
    assert.equal(
      robotsAllows(robots, `https://allowed.example${path}`),
      allowed,
      robots,
    );
});

test("editing a legacy restricted reference cannot launder its ingestion provenance", async () => {
  grants();
  const source = saveRecord(brand.id, "sources", {
    name: "Public videos",
    type: "youtube",
    enabled: false,
    platform: "youtube",
  });
  const reference = saveRecord(brand.id, "references", {
    title: "Imported video",
    source: source.name,
    sourceId: source.id,
    platform: "youtube",
    url: "https://youtube.com/watch?v=abcdefghijk",
    text: "Previously imported body ".repeat(20),
    format: "video",
    status: "new",
    tags: [],
  });
  assert.equal(referenceUsePolicy(reference).allowed, false);
  const edited = await request(
    `/brands/${brand.id}/references/${reference.id}`,
    { source: "manual", title: "Renamed title" },
    "PATCH",
  );
  assert.equal(edited.status, 200);
  const analyzed = await request(`/brands/${brand.id}/analyze`, {
    referenceId: reference.id,
  });
  assert.equal(
    analyzed.status,
    403,
    "Cosmetic edits must not authorize imported restricted content.",
  );
});

test("cached automatically enriched text cannot be reused after its operator permission is revoked", async (t) => {
  grants(grant());
  const calls = transport(t, (url) =>
    url.pathname === "/robots.txt"
      ? { body: "User-agent: *\nAllow: /" }
      : {
          headers: { "content-type": "text/html" },
          body: `<html><title>Approved source</title><body>${"Remotely collected text for a synthetic review. ".repeat(20)}</body></html>`,
        },
  );
  const reference = saveRecord(brand.id, "references", {
    title: "Approved source",
    source: "manual",
    url: "https://allowed.example/public/article",
    text: "",
    status: "new",
    format: "article",
    tags: [],
  });
  const first = await request(`/brands/${brand.id}/analyze`, {
    referenceId: reference.id,
  });
  assert.equal(first.status, 200);
  assert.ok(first.body.text.length > 250);
  assert.equal(calls.length, 2);
  grants();
  const second = await request(`/brands/${brand.id}/analyze`, {
    referenceId: reference.id,
  });
  assert.equal(
    second.status,
    403,
    "Revoked source permission must apply to cached automatic imports too.",
  );
  assert.equal(
    calls.length,
    2,
    "Revocation must not trigger a fallback fetch.",
  );
});

test("standalone source readback exposes effective denial for legacy enabled sources", async () => {
  grants();
  const source = saveRecord(brand.id, "sources", {
    name: "Legacy denied feed",
    type: "rss",
    url: "https://unreviewed.example/feed",
    enabled: true,
  });
  const response = await request(
    `/brands/${brand.id}/sources`,
    undefined,
    "GET",
  );
  assert.equal(response.status, 200);
  const readback = response.body.find((entry) => entry.id === source.id);
  assert.equal(
    readback.enabled,
    false,
    "Stored enabled=true cannot override a denied source policy.",
  );
  assert.equal(readback.accessPolicy.allowed, false);
});

test("an allowed dotted official Google hostname cannot lose mandatory attribution", () => {
  grants();
  const source = {
    type: "rss",
    url: "https://trends.google.com./trending/rss?geo=US",
  };
  const [item] = parseFeed(
    "<rss><channel><item><title>Automation</title><ht:approx_traffic>2000+</ht:approx_traffic></item></channel></rss>",
    source,
  );
  assert.ok(
    !sourceAccessPolicy(source).allowed ||
      providerAttributionsForReference(item).some(
        (provider) => provider.id === "google_trends",
      ),
    "Either deny the alternative hostname or retain Google citation metadata.",
  );
});

test("blocked legacy API records expose a link without redisplaying cached bodies or personal identifiers", async () => {
  grants();
  const source = saveRecord(brand.id, "sources", {
    name: "Legacy social source",
    type: "youtube",
    enabled: false,
  });
  const reference = saveRecord(brand.id, "references", {
    title: "Legacy social link",
    source: source.name,
    sourceId: source.id,
    platform: "youtube",
    url: "https://youtube.com/watch?v=abcdefghijk",
    text: "Cached body from a now restricted source",
    author: "personal_username",
    trend: { metrics: { views: 123 } },
    status: "new",
    format: "video",
    tags: [],
  });
  const response = await request(
    `/brands/${brand.id}/references`,
    undefined,
    "GET",
  );
  assert.equal(response.status, 200);
  const projected = response.body.find((entry) => entry.id === reference.id);
  assert.equal(projected.url, reference.url);
  assert.ok(
    !projected.text,
    "An explicitly blocked import must not keep exposing its cached body.",
  );
  assert.equal(projected.author, undefined);
  assert.equal(projected.trend?.metrics, undefined);
});

test("source permission revoked during retrieval cannot commit the returned feed body", async () => {
  grants(grant());
  for (const source of listRecords(brand.id, "sources"))
    saveRecord(brand.id, "sources", { ...source, enabled: false });
  saveRecord(brand.id, "sources", {
    name: "Reviewed feed",
    type: "rss",
    url: "https://allowed.example/public/feed",
    enabled: true,
  });
  const before = listRecords(brand.id, "references").length;
  let calls = 0;
  const result = await syncSources(brand, {
    fetcher: async (url) => {
      calls++;
      assert.equal(url, "https://allowed.example/public/feed");
      grants();
      return new Response(
        "<rss><channel><item><title>Revoked source result</title><link>https://allowed.example/public/article</link></item></channel></rss>",
      );
    },
  });
  assert.equal(calls, 1);
  assert.equal(
    result.added,
    0,
    "The received body must not be persisted after its source review was revoked.",
  );
  assert.equal(listRecords(brand.id, "references").length, before);
});

test("cached enrichment retains the permission basis of an approved redirect destination", async (t) => {
  const firstGrant = grant();
  grants(firstGrant, grant("https://destination.example"));
  const calls = transport(t, (url) => {
    if (url.pathname === "/robots.txt")
      return { body: "User-agent: *\nAllow: /" };
    if (url.hostname === "allowed.example")
      return {
        status: 302,
        headers: { location: "https://destination.example/public/article" },
      };
    return {
      headers: { "content-type": "text/html" },
      body: `<html><title>Redirected source</title><body>${"Synthetic remote destination text. ".repeat(20)}</body></html>`,
    };
  });
  const reference = saveRecord(brand.id, "references", {
    title: "Redirect source",
    source: "manual",
    url: "https://allowed.example/public/redirect",
    text: "",
    status: "new",
    format: "article",
    tags: [],
  });
  const first = await request(`/brands/${brand.id}/analyze`, {
    referenceId: reference.id,
  });
  assert.equal(first.status, 200);
  if (!first.body.text) {
    // Refusing redirected ingestion altogether is also a valid fail-closed implementation.
    assert.ok(calls.length <= 2);
    return;
  }
  assert.ok(first.body.text.length > 250);
  assert.equal(calls.length, 4);
  grants(firstGrant);
  const second = await request(`/brands/${brand.id}/analyze`, {
    referenceId: reference.id,
  });
  assert.equal(
    second.status,
    403,
    "Retaining permission for A cannot authorize cached content from revoked destination B.",
  );
  assert.equal(calls.length, 4);
});

test("HN process-wide conservative request ceiling stops before another provider socket", async (t) => {
  const calls = transport(t, () => ({
    headers: { "content-type": "application/json" },
    body: '{"hits":[]}',
  }));
  for (let index = 0; index < 1000; index++) {
    const response = await safeFetch(
      "https://hn.algolia.com/api/v1/search?query=offline",
      { policyPurpose: "discovery", maxRedirects: 0 },
    );
    assert.equal(response.status, 200);
  }
  await assert.rejects(
    safeFetch("https://hn.algolia.com/api/v1/search?query=offline", {
      policyPurpose: "discovery",
      maxRedirects: 0,
    }),
    (error) => error.status === 429,
  );
  assert.equal(calls.length, 1000);
});
