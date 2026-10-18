import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTrendRetrospective } from "../server/trend-retrospective.mjs";
import { trendObservationScope } from "../server/trend-evidence.mjs";

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const NOW = Date.UTC(2026, 9, 18, 12);
const brand = { id: "synthetic", pillars: ["Ventas"] };
const source = { id: "hn", type: "hackernews", enabled: true, query: "sales" };
function snapshot(time, ventas, other = 10, patch = {}) {
  return {
    brandId: brand.id,
    origin: "public_source_observation",
    scope: trendObservationScope(brand, [source]),
    sourceIds: [source.id],
    windowMs: WEEK,
    observedAt: new Date(time).toISOString(),
    windowStart: new Date(time - WEEK).toISOString(),
    counts: { ventas, otro: other },
    sampleSize: ventas + other,
    ...patch,
  };
}
const series = (later = 9) => [
  snapshot(NOW - 2 * WEEK, 3),
  snapshot(NOW - WEEK, 6),
  snapshot(NOW, later),
];
const run = (snapshots = [], options = {}, currentBrand = brand) =>
  buildTrendRetrospective(currentBrand, {
    snapshots,
    sources: [source],
    now: NOW,
    ...options,
  });

test("a real compatible three-window rise is evaluated against its first independent follow-up", () => {
  const result = run(series());
  assert.equal(result.status, "evaluated");
  assert.equal(result.counts.sustained, 1);
  assert.equal(result.evaluations[0].baseline.count, 3);
  assert.equal(result.evaluations[0].signal.count, 6);
  assert.equal(result.evaluations[0].followUp.count, 9);
  assert.equal(result.counts.awaitingFollowUp, 1);
  assert.match(result.limitations.join(" "), /no mide atención social/);
});

test("a later fall in both count and corpus share is a reversal", () => {
  const result = run(series(2));
  assert.equal(result.counts.reversal, 1);
  assert.equal(result.evaluations[0].outcome, "reversal");
});

test("mixed count/share movement and inadequate later corpus stay uncertain", () => {
  const mixed = series();
  mixed[2] = snapshot(NOW, 9, 100);
  assert.equal(run(mixed).counts.uncertain, 1);
  const tiny = series();
  tiny[2] = snapshot(NOW, 0, 1);
  assert.equal(run(tiny).counts.uncertain, 1);
});

test("no history or only two windows never fabricate an evaluation", () => {
  for (const snapshots of [[], series().slice(0, 2), series().slice(1)]) {
    const result = run(snapshots);
    assert.equal(result.status, "insufficient");
    assert.equal(result.counts.evaluated, 0);
    assert.match(result.findings[0].detail, /tres ventanas/);
  }
});

test("future observations cannot leak into an as-of report or manufacture a signal", () => {
  const history = series();
  const asOf = NOW - WEEK;
  const baseline = run(history.slice(0, 2), { now: asOf });
  const withFuture = run([...history, snapshot(NOW + WEEK, 1000)], {
    now: asOf,
  });
  assert.deepEqual(withFuture.evaluations, baseline.evaluations);
  assert.equal(withFuture.counts.risingSignals, baseline.counts.risingSignals);
  assert.equal(withFuture.counts.evaluated, 0);
  assert.equal(withFuture.counts.awaitingFollowUp, 1);
});

test("cross-brand, cross-query, restricted, demo and malformed observations cannot complete a trial", () => {
  const patches = [
    { brandId: "other-brand" },
    { scope: trendObservationScope(brand, [{ ...source, query: "other" }]) },
    { sourceIds: ["other-source"] },
    { ingestionRestricted: true },
    { platform: "youtube" },
    { sourceUrl: "https://www.youtube.com/watch?v=abc" },
    { isDemo: true },
    { sampleSize: 999 },
    { windowMs: DAY },
  ];
  for (const patch of patches) {
    const history = series();
    history[1] = { ...history[1], ...patch };
    assert.equal(run(history).counts.evaluated, 0, JSON.stringify(patch));
  }
  assert.equal(
    run(series(), {}, { ...brand, isDemo: true }).counts.evaluated,
    0,
  );
  assert.equal(
    run(series(), { sources: [{ ...source, type: "youtube" }] }).counts
      .evaluated,
    0,
  );
});

test("overlapping or stale windows cannot supply an independent outcome", () => {
  const overlap = [
    snapshot(NOW - 2 * WEEK, 3),
    snapshot(NOW - WEEK, 6),
    snapshot(NOW - DAY, 9),
  ];
  assert.equal(run(overlap).counts.evaluated, 0);
  assert.equal(run(series(), { now: NOW + 3 * DAY }).counts.evaluated, 0);
});

test("chooses earliest follow-up rather than a later favorable result", () => {
  const history = [...series(2), snapshot(NOW + DAY, 12)];
  const result = run(history, { now: NOW + DAY });
  assert.equal(result.evaluations[0].outcome, "reversal");
  assert.equal(result.evaluations[0].followUp.count, 2);
});

test("zero-base and low-count rises are not retrospectively validated", () => {
  for (const before of [0, 2]) {
    const history = series();
    history[0] = snapshot(NOW - 2 * WEEK, before);
    assert.equal(run(history).counts.evaluated, 0);
  }
});

test("daily refreshes do not multiply one topic signal and inputs stay unchanged", () => {
  const history = [
    ...series(),
    snapshot(NOW - WEEK + DAY, 7),
    snapshot(NOW + DAY, 10),
  ];
  const input = JSON.stringify(history);
  const result = run(history, { now: NOW + DAY });
  assert.equal(result.counts.evaluated, 1);
  assert.equal(JSON.stringify(history), input);
});
