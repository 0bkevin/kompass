import test from "node:test";
import assert from "node:assert/strict";
import { selectResearchCorpus } from "../server/research-corpus.mjs";

const now = Date.parse("2026-10-18T12:00:00Z");
const recent = "2026-10-17T12:00:00Z";
const ref = (id, changes = {}) => ({
  id,
  title: `Tema ${id}`,
  text: "Material público aportado para el análisis.",
  url: `https://example.com/${id}`,
  source: "Material propio",
  createdAt: recent,
  status: "saved",
  ...changes,
});

test("a new observation cannot make an old publication part of this week", () => {
  const result = selectResearchCorpus(
    {},
    {
      now,
      references: [
        ref("old", { publishedAt: "2025-01-01T00:00:00Z" }),
        ref("new", { publishedAt: recent }),
        ref("undated-publication", { firstSeenAt: recent }),
      ],
    },
  );
  assert.deepEqual(
    result.references.map((item) => item.id),
    ["new", "undated-publication"],
  );
  assert.equal(result.references[1].reportTiming.basis, "observation");
  assert.equal(result.counts.publicationDated, 1);
  assert.equal(result.counts.observationDated, 1);
  assert.equal(result.counts.excluded.outsideWindow, 1);
});

test("weekly evidence excludes restricted, demo, future, dismissed and dateless records", () => {
  const result = selectResearchCorpus(
    {},
    {
      now,
      references: [
        ref("youtube", {
          platform: "youtube",
          metricsOrigin: "YouTube Data API",
        }),
        ref("demo", { isDemo: true }),
        ref("future", { publishedAt: "2026-10-19T00:00:00Z" }),
        ref("dismissed", { status: "dismissed" }),
        ref("dateless", { createdAt: undefined }),
        ref("ok"),
        ref("copy", { url: "https://example.com/ok?utm_source=duplicate" }),
      ],
    },
  );
  assert.equal(result.references.length, 1);
  assert.equal(result.counts.duplicates, 1);
  assert.deepEqual(result.counts.excluded, {
    demo: 1,
    restricted: 1,
    dismissed: 1,
    outsideWindow: 0,
    undated: 1,
    future: 1,
  });
});

test("demonstration evidence stays separate and dates and inputs remain immutable", () => {
  const input = ref("sample", { isDemo: true });
  const result = selectResearchCorpus(
    { isDemo: true },
    { now, references: [input, ref("real")] },
  );
  assert.equal(result.isDemo, true);
  assert.equal(result.references.length, 1);
  assert.equal(result.counts.excluded.demo, 1);
  assert.equal(input.reportTiming, undefined);
  assert.throws(
    () => selectResearchCorpus({}, { now: "not-a-date" }),
    /inválida/,
  );
});
