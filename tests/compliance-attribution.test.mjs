import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  providerAttributionsForReference,
  formatProviderAttributions,
} from "../src/lib/provider-attribution.mjs";

const dataDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "radar-compliance-attribution-"),
);
process.env.DATA_DIR = dataDir;
delete process.env.OPENAI_API_KEY;
const { db, saveBrand, saveRecord, getRecord } =
  await import("../server/db.mjs");
const { parseFeed, fetchSource, createDraft } =
  await import("../server/intelligence.mjs");
const { buildInsights } = await import("../server/audience-insights.mjs");
after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
const brand = saveBrand({
  name: "Attribution QA",
  industry: "technology",
  description: "Automation",
  tone: "clear",
  market: "Mexico",
  language: "es",
  audience: [{ id: "teams", name: "Teams", needs: "automation" }],
  pillars: ["automation"],
  goals: [],
});
const json = (body) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });

test("official Google RSS credits the data provider independently of article links and removes author identifiers", () => {
  const xml =
    "<rss><channel><item><title>Automation</title><link>https://publisher.example/article</link><author>personal_user_123</author><ht:approx_traffic>2000+</ht:approx_traffic></item></channel></rss>";
  const [item] = parseFeed(xml, {
    url: "https://trends.google.com/trending/rss?geo=MX",
  });
  assert.equal(item.author, undefined);
  assert.equal(
    providerAttributionsForReference(item)[0].url,
    "https://trends.google.com/",
  );
  assert.match(formatProviderAttributions(item), /Google Trends/);
  const [untrusted] = parseFeed(xml, {
    url: "https://trends.google.com.attacker.example/trending/rss",
  });
  assert.deepEqual(providerAttributionsForReference(untrusted), []);
});

test("GDELT API items preserve provider citation separately from the publisher URL", async () => {
  let calls = 0;
  const [item] = await fetchSource(
    brand,
    { type: "gdelt", query: "automation" },
    {
      fetcher: async (url) => {
        calls++;
        assert.equal(new URL(url).hostname, "api.gdeltproject.org");
        return json({
          articles: [
            {
              title: "Automation grows",
              url: "https://publisher.example/one",
              domain: "publisher.example",
              seendate: "20261018T010000Z",
            },
          ],
        });
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(item.url, "https://publisher.example/one");
  assert.equal(item.author, undefined);
  assert.equal(item.text, "");
  assert.match(
    formatProviderAttributions(item),
    /GDELT Project \(https:\/\/www\.gdeltproject\.org\/\)/,
  );
});

test("HN official API collection drops individual author field and credits HN / Algolia", async () => {
  const items = await fetchSource(
    brand,
    { type: "hackernews", query: "automation" },
    {
      fetcher: async () =>
        json({
          hits: [
            {
              objectID: "1",
              title: "Automation",
              url: "https://publisher.example/hn",
              author: "individual_identifier",
              story_text:
                "Full copyrighted body with individual details must not be retained.",
              created_at: "2026-10-18T00:00:00Z",
              points: 3,
              num_comments: 1,
            },
          ],
        }),
    },
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].author, undefined);
  assert.equal(items[0].text, "");
  assert.equal(
    providerAttributionsForReference(items[0])[0].url,
    "https://hn.algolia.com/",
  );
});

test("merged evidence retains all required credits and ignores stored arbitrary attribution URLs", () => {
  const reference = {
    providerAttributions: [
      { id: "gdelt", name: "Wrong name", url: "javascript:alert(1)" },
    ],
    evidence: [
      { providerAttributions: [{ id: "google_trends" }] },
      {
        providerAttributions: [
          { id: "gdelt" },
          { id: "unapproved", url: "https://attacker.example" },
        ],
      },
    ],
  };
  const providers = providerAttributionsForReference(reference);
  assert.deepEqual(
    providers.map((provider) => provider.id),
    ["gdelt", "google_trends"],
  );
  const exported = formatProviderAttributions(reference, reference);
  assert.equal((exported.match(/GDELT Project/g) || []).length, 1);
  assert.ok(exported.includes("https://www.gdeltproject.org/"));
  assert.ok(exported.includes("https://trends.google.com/"));
  assert.doesNotMatch(exported, /attacker|javascript|Wrong name/);
});

test("legacy evidence recovers GDELT and Trends attribution without trusting editable source labels", () => {
  assert.equal(
    providerAttributionsForReference({
      trend: { signalType: "news-coverage" },
    })[0].id,
    "gdelt",
  );
  assert.equal(
    providerAttributionsForReference({
      trend: { signalType: "search-interest" },
    })[0].id,
    "google_trends",
  );
  assert.deepEqual(providerAttributionsForReference({ source: "GDELT" }), []);
});

test("draft snapshots retain the required data citation even if its reference is later removed", async () => {
  const reference = saveRecord(brand.id, "references", {
    title: "Automation signal",
    url: "https://publisher.example/ref",
    text: "",
    source: "News",
    language: "en",
    market: "US",
    format: "article",
    tags: [],
    status: "new",
    providerAttributions: [{ id: "gdelt" }],
  });
  const piece = await createDraft(brand, {
    referenceId: reference.id,
    format: "post",
  });
  assert.equal(piece.providerAttributions[0].id, "gdelt");
  const stored = getRecord(brand.id, "pieces", piece.id);
  assert.match(
    formatProviderAttributions(undefined, stored),
    /https:\/\/www\.gdeltproject\.org\//,
  );
});

test("opportunity evidence carries original provider credits despite a renamed source", () => {
  const result = buildInsights(brand, {
    references: [
      {
        id: "attributed-ref",
        title: "Automation for teams",
        topic: "Automation",
        url: "https://publisher.example/article",
        source: "Renamed company feed",
        text: "",
        status: "new",
        providerAttributions: [{ id: "gdelt" }],
        createdAt: "2026-10-18T01:00:00Z",
      },
    ],
    pieces: [],
    sources: [],
    signals: [],
    snapshots: [],
    outcomes: [],
  });
  assert.ok(result.opportunities.length > 0);
  assert.equal(
    result.opportunities[0].evidence[0].source,
    "Renamed company feed",
  );
  assert.match(
    formatProviderAttributions({ evidence: result.opportunities[0].evidence }),
    /GDELT Project/,
  );
});
