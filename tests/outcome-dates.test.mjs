import assert from "node:assert/strict";
import { test } from "node:test";
import {
  outcomeLocalDateTime,
  outcomeMeasurementUpdate,
  outcomePublicationDate,
} from "../src/lib/outcome-dates.ts";

test("outcome dates display seconds and preserve unchanged milliseconds", () => {
  const original = "2026-10-16T12:00:30.123Z";
  const displayed = outcomeLocalDateTime(original);
  assert.match(displayed, /T\d{2}:\d{2}:30$/);
  assert.equal(outcomePublicationDate(displayed, original), original);
  assert.deepEqual(outcomeMeasurementUpdate(displayed, original), {});
  assert.deepEqual(outcomeMeasurementUpdate("", original), {
    measuredAt: null,
  });
});

test("edited outcome dates serialize the newly selected local second", () => {
  const selected = "2026-10-16T12:01:45";
  const expected = new Date(selected).toISOString();
  const original = "2026-10-16T12:00:30.123Z";
  assert.equal(outcomePublicationDate(selected, original), expected);
  assert.deepEqual(outcomeMeasurementUpdate(selected, original), {
    measuredAt: expected,
  });
});
