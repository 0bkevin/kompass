import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "remediation-discovery-2-"),
);
process.env.DATA_DIR = dataDir;
process.env.DISCOVERY_ENABLED = "false";
for (const key of [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "YOUTUBE_API_KEY",
  "APIFY_API_TOKEN",
])
  delete process.env[key];
const { db, saveBrand, saveRecord, listRecords, getRecord } =
  await import("../server/db.mjs");
const { fetchSource, syncSources } = await import("../server/intelligence.mjs");
const { publicPiece } = await import("../server/core.mjs");
const { opportunityFingerprint } =
  await import("../server/opportunity-fingerprint.mjs");

after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const now = Date.parse("2026-10-18T05:00:00.000Z");
const cases = [
  {
    name: "original HN hexadecimal slash and apostrophe",
    input:
      "AdFection: https:&#x2F;&#x2F;example.com&#x2F;public — it&#x27;s readable",
    expected: "AdFection: https://example.com/public — it's readable",
  },
  {
    name: "decimal and hexadecimal Unicode scalar values",
    input: "Equipo &#241; &#xE9; &#128512; &#x1F680; &#X2f; &#00047;",
    expected: "Equipo ñ é 😀 🚀 / /",
  },
  {
    name: "named XML entities and ordinary typography",
    input:
      "&quot;IA&quot; &amp; equipos &apos;prácticos&apos; &lt;texto&gt; &nbsp; &copy; &ndash; &hellip; &euro;",
    expected: "\"IA\" & equipos 'prácticos' <texto> © – … €",
  },
  {
    name: "named Latin-1 entities used in Spanish and Portuguese",
    input:
      "Espa&ntilde;ol caf&eacute; &aacute; &Aacute; &uuml; &Uuml; &iquest; a&ccedil;&atilde;o",
    expected: "Español café á Á ü Ü ¿ ação",
  },
  {
    name: "encoded references decode exactly once",
    input: "&amp;lt;tag&amp;gt; &amp;#x27; &amp;quot; &amp;amp;",
    expected: "&lt;tag&gt; &#x27; &quot; &amp;",
  },
  {
    name: "unknown and malformed entities preserve original evidence",
    input: "&unknown; &#xNO; &#; &#x; &amp sin cierre",
    expected: "&unknown; &#xNO; &#; &#x; &amp sin cierre",
  },
  {
    name: "invalid scalar values cannot abort discovery",
    input: "Invalid &#x110000; &#999999999999999999999999; &#xD800; &#0; tail",
    expected: "Invalid � � � � tail",
  },
  {
    name: "encoded markup stays literal text while raw script/style are removed",
    input:
      "<p>Texto</p><script>globalThis.discoveryInjected = true</script><style>.bad{display:none}</style>&lt;img src=x onerror=&quot;globalThis.discoveryInjected=true&quot;&gt; &lt;tag&gt;fin&lt;/tag&gt;",
    expected:
      'Texto <img src=x onerror="globalThis.discoveryInjected=true"> <tag>fin</tag>',
  },
];

function hit(input, id = "900000001") {
  return {
    objectID: id,
    title: input,
    story_text: input,
    url: `https://example.com/discovery-2/${id}`,
    points: 47,
    num_comments: 8,
    author: "synthetic-public-author",
    created_at: "2026-10-18T04:00:00.000Z",
  };
}

function transport(hits) {
  const calls = [];
  return {
    calls,
    fetcher: async (value) => {
      const url = new URL(value);
      assert.equal(url.origin, "https://hn.algolia.com");
      assert.ok(
        ["/api/v1/search_by_date", "/api/v1/search"].includes(url.pathname),
      );
      assert.equal(url.searchParams.get("query"), "synthetic fixture");
      calls.push(url.pathname);
      return new Response(JSON.stringify({ hits }), {
        headers: { "content-type": "application/json" },
      });
    },
  };
}

for (const entry of cases) {
  test(`fetchSource HN: ${entry.name}`, async () => {
    const fixture = transport([hit(entry.input)]);
    const result = await fetchSource(
      {},
      { type: "hackernews", query: "synthetic fixture" },
      { fetcher: fixture.fetcher, now },
    );
    assert.equal(
      result.length,
      1,
      "The two HN retrieval modes deduplicate the same public object.",
    );
    assert.equal(result[0].title, entry.expected);
    assert.equal(result[0].text, entry.expected);
    assert.deepEqual(result[0].metrics, { score: 47, comments: 8 });
    assert.equal(result[0].url, "https://example.com/discovery-2/900000001");
    assert.equal(
      result[0].sourceUrl,
      "https://news.ycombinator.com/item?id=900000001",
    );
    assert.deepEqual(fixture.calls.sort(), [
      "/api/v1/search",
      "/api/v1/search_by_date",
    ]);
  });
}

test("syncSources persists the decoded HN title and detail, preserves provenance and metrics, and repeated discovery keeps the same reference", async () => {
  const brand = saveBrand({
    name: "Decodificación QA — datos ficticios",
    industry: "technology",
    audience: [],
    pillars: ["technology"],
  });
  const source = saveRecord(brand.id, "sources", {
    name: "HN — transporte simulado",
    type: "hackernews",
    query: "synthetic fixture",
    enabled: true,
  });
  const fixture = transport([hit(cases[0].input)]);
  const first = await syncSources(brand, { fetcher: fixture.fetcher, now });
  assert.equal(first.added, 1);
  assert.deepEqual(first.errors, []);
  const [reference] = listRecords(brand.id, "references");
  assert.equal(reference.title, cases[0].expected);
  assert.equal(reference.text, cases[0].expected);
  assert.equal(reference.sourceId, source.id);
  assert.equal(reference.source, source.name);
  assert.equal(reference.author, "synthetic-public-author");
  assert.deepEqual(reference.trend.metrics, { score: 47, comments: 8 });
  const second = await syncSources(brand, {
    fetcher: fixture.fetcher,
    now: now + 600_000,
  });
  assert.equal(second.added, 0);
  assert.equal(second.updated, 1);
  assert.deepEqual(second.errors, []);
  const readback = listRecords(brand.id, "references");
  assert.equal(readback.length, 1);
  assert.equal(readback[0].id, reference.id);
  assert.equal(readback[0].title, cases[0].expected);
  assert.equal(readback[0].text, cases[0].expected);
});

for (const customized of [false, true]) {
  test(`HN legacy refresh ${customized ? "preserves changed editorial notes verbatim" : "repairs only an exact old-normalizer match"} without rewriting an approved piece`, async () => {
    const brand = saveBrand({
      name: "Legacy HN QA — ficticia",
      audience: [],
      pillars: ["technology"],
    });
    const source = saveRecord(brand.id, "sources", {
      name: "HN fixture legacy",
      type: "hackernews",
      query: "synthetic fixture",
      enabled: true,
    });
    const raw =
      "Ruta https:&#x2F;&#x2F;example.com&#x2F;public y apóstrofo &#x27;.";
    const body = customized ? `Nota editorial modificada: ${raw}` : raw;
    const current = saveRecord(brand.id, "references", {
      ...hit("Legacy QA title"),
      externalId: "900000001",
      sourceId: source.id,
      source: source.name,
      sourceUrl: "https://news.ycombinator.com/item?id=900000001",
      title: "Legacy QA title",
      text: body,
      status: "saved",
      tags: ["editorial"],
      language: "en",
      market: "Internacional",
      format: "article",
      analysis: { summary: "Análisis editorial conservado" },
    });
    const piece = saveRecord(brand.id, "pieces", {
      title: "Guion aprobado sintético",
      referenceId: current.id,
      status: "approved",
      caption: "Contenido revisado",
      format: "post",
      channel: "linkedin",
      review: { decision: "approved", note: "Decisión ficticia de QA" },
    });
    const opportunity = {
      id: "legacy-hn",
      referenceIds: [current.id],
      segmentIds: [],
    };
    const beforeFingerprint = opportunityFingerprint(brand, opportunity, {
      references: [current],
    });
    const fixture = transport([
      { ...hit("Legacy QA title"), story_text: `<p>${raw}</p>` },
    ]);
    const result = await syncSources(brand, { fetcher: fixture.fetcher, now });
    assert.equal(result.added, 0);
    assert.equal(result.updated, 1);
    const repaired = getRecord(brand.id, "references", current.id);
    assert.equal(
      repaired.text,
      customized ? body : "Ruta https://example.com/public y apóstrofo '.",
    );
    for (const key of [
      "id",
      "createdAt",
      "url",
      "sourceId",
      "source",
      "sourceUrl",
      "externalId",
      "status",
      "tags",
      "analysis",
    ])
      assert.deepEqual(repaired[key], current[key], key);
    const afterFingerprint = opportunityFingerprint(brand, opportunity, {
      references: [repaired],
    });
    assert.equal(
      beforeFingerprint === afterFingerprint,
      customized,
      "The opportunity fingerprint changes only when its actual evidence text changes.",
    );
    assert.deepEqual(getRecord(brand.id, "pieces", piece.id), piece);
    assert.equal(
      publicPiece(getRecord(brand.id, "pieces", piece.id)).approvalVersion,
      publicPiece(piece).approvalVersion,
    );
    await syncSources(brand, { fetcher: fixture.fetcher, now: now + 600_000 });
    const repeated = getRecord(brand.id, "references", current.id);
    assert.equal(
      repeated.text,
      repaired.text,
      "A second sync cannot decode the saved value again.",
    );
    assert.equal(
      opportunityFingerprint(brand, opportunity, { references: [repeated] }),
      afterFingerprint,
    );
    assert.deepEqual(getRecord(brand.id, "pieces", piece.id), piece);
  });
}
