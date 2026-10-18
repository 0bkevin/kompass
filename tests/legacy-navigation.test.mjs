import assert from "node:assert/strict";
import test from "node:test";
import {
  legacyHashTarget,
  legacyUrlTarget,
  workspaceLocation,
} from "../src/lib/legacy-navigation.mjs";

test("maps known legacy hash bookmarks to clean route paths", () => {
  for (const view of [
    "radar",
    "inbox",
    "studio",
    "calendar",
    "assets",
    "audience",
    "brand",
    "settings",
  ]) {
    assert.equal(legacyHashTarget(`#${view}`), `/${view}`);
  }
});

test("maps a legacy Studio piece bookmark and safely encodes its id", () => {
  assert.equal(legacyHashTarget("#studio/piece-42"), "/studio/piece-42");
  assert.equal(legacyHashTarget("#studio/piece%2042"), "/studio/piece%2042");
  assert.equal(legacyHashTarget("#studio/"), null);
  assert.equal(legacyHashTarget("#studio/one/two"), null);
  assert.equal(legacyHashTarget("#studio/%2F"), null);
});

test("leaves unknown hashes unmapped", () => {
  assert.equal(legacyHashTarget("#unknown"), null);
  assert.equal(legacyHashTarget("#settings/extra"), null);
  assert.equal(legacyHashTarget(null), null);
});

test("leaves inherited object property names unmapped", () => {
  for (const name of ["constructor", "toString", "__proto__"]) {
    assert.equal(legacyHashTarget(`#${name}`), null);
    assert.equal(legacyUrlTarget({ hash: `#${name}` }), null);
  }
});

test("migrates a legacy URL to a clean path and preserves its query", () => {
  assert.equal(
    legacyUrlTarget({
      hash: "#studio/piece-42",
      search: "?invite=one&ref=two",
    }),
    "/studio/piece-42?invite=one&ref=two",
  );
  assert.equal(
    legacyUrlTarget({ hash: "#unsupported", search: "?invite=one" }),
    null,
  );
});

test("resolves workspace paths and selected Studio ids", () => {
  assert.deepEqual(workspaceLocation("/studio/piece-42"), {
    view: "studio",
    pieceId: "piece-42",
  });
  assert.deepEqual(workspaceLocation("/studio/piece%2042"), {
    view: "studio",
    pieceId: "piece 42",
  });
  assert.deepEqual(workspaceLocation("/brand"), { view: "brand" });
});
