import assert from "node:assert/strict";
import { test } from "node:test";
import {
  readActiveWorkspace,
  rememberActiveWorkspace,
} from "../src/lib/active-workspace.mjs";

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("existing company selection survives the application rename", () => {
  const saved = storage({ "30x-brand": "existing-company" });
  assert.equal(readActiveWorkspace(saved), "existing-company");
  rememberActiveWorkspace(saved, readActiveWorkspace(saved));
  assert.equal(saved.getItem("kompass-brand"), "existing-company");
  assert.equal(saved.getItem("30x-brand"), null);
  assert.equal(readActiveWorkspace(saved), "existing-company");
});

test("current company selection takes precedence over a stale legacy value", () => {
  const saved = storage({
    "kompass-brand": "current",
    "30x-brand": "previous",
  });
  assert.equal(readActiveWorkspace(saved), "current");
  rememberActiveWorkspace(saved, "another-company");
  assert.equal(readActiveWorkspace(saved), "another-company");
  assert.equal(saved.getItem("30x-brand"), null);
});

test("blocked storage does not interrupt an authenticated workspace", () => {
  const unavailable = {
    getItem() {
      throw new Error("Storage unavailable");
    },
    setItem() {
      throw new Error("Storage unavailable");
    },
    removeItem() {
      throw new Error("Storage unavailable");
    },
  };
  assert.equal(readActiveWorkspace(unavailable), "");
  assert.doesNotThrow(() => rememberActiveWorkspace(unavailable, "company"));
});
