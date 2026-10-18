import test from "node:test";
import assert from "node:assert/strict";
import { createSourceDraftGuard } from "../src/lib/source-draft-guard.mjs";

const emptySource = () => ({
  name: "", type: "rss", query: "", url: "", platform: "instagram",
  limit: "20", enabled: true,
});

function fixture() {
  let draft = null;
  let answer = false;
  let confirmations = 0;
  let discards = 0;
  const guard = createSourceDraftGuard({
    confirmDiscard: () => { confirmations++; return answer; },
    onDiscard: () => { discards++; draft = null; },
  });
  return {
    guard,
    open(value) { if (guard.open(value)) draft = value; },
    edit(change) { draft = { ...draft, ...change }; guard.sync(draft, false); },
    answer(value) { answer = value; },
    get draft() { return draft; },
    get confirmations() { return confirmations; },
    get discards() { return discards; },
  };
}

test("Escape/close and workspace leave share a cancellable discard decision", () => {
  const f = fixture();
  f.open(emptySource());
  f.edit({ name: "Fuente sintética sin guardar", url: "https://example.com/feed" });
  const before = structuredClone(f.draft);
  assert.equal(f.guard.isDirty(), true);
  for (let attempt = 0; attempt < 3; attempt++) {
    assert.equal(f.guard.confirmLeave(), false);
    assert.deepEqual(f.draft, before, "Declining must preserve every form field.");
    assert.equal(f.guard.isDirty(), true);
    assert.equal(f.discards, 0);
  }
  f.answer(true);
  assert.equal(f.guard.confirmLeave(), true);
  assert.equal(f.draft, null);
  assert.equal(f.guard.isDirty(), false);
  assert.equal(f.confirmations, 4);
  assert.equal(f.guard.confirmLeave(), true);
  assert.equal(f.confirmations, 4, "Accepted discard must not leave a stale warning.");
});

test("opening or reverting a normalized new/existing source needs no warning", () => {
  for (const source of [emptySource(), {
    ...emptySource(), id: "synthetic-youtube", name: "YouTube sintético",
    type: "youtube", query: "science", platform: "youtube", enabled: false,
  }]) {
    const f = fixture();
    f.open(source);
    assert.equal(f.guard.isDirty(), false);
    f.edit({ name: `${source.name} cambiado` });
    assert.equal(f.guard.isDirty(), true);
    f.edit({ name: source.name });
    assert.equal(f.guard.isDirty(), false);
    f.guard.sync(Object.fromEntries(Object.entries(source).reverse()), false);
    assert.equal(f.guard.isDirty(), false, "Property order is not a form change.");
    assert.equal(f.guard.confirmLeave(), true);
    assert.equal(f.confirmations, 0);
  }
});

test("every source field participates in the saved baseline", () => {
  for (const change of [
    { name: "Fuente" }, { type: "hackernews" }, { query: "science" },
    { url: "https://example.com/feed" }, { platform: "tiktok" },
    { limit: "5" }, { enabled: false },
  ]) {
    const f = fixture();
    f.open(emptySource());
    f.edit(change);
    assert.equal(f.guard.isDirty(), true, JSON.stringify(change));
    assert.equal(f.guard.confirmLeave(), false);
    assert.deepEqual(f.draft, { ...emptySource(), ...change });
  }
});

test("a pending save prevents duplicate submissions and all discard paths", () => {
  const f = fixture();
  f.open(emptySource());
  f.edit({ name: "Guardado sintético" });
  assert.equal(f.guard.beginSave(), true);
  assert.equal(f.guard.beginSave(), false, "The lock is synchronous, before a rerender.");
  f.answer(true);
  assert.equal(f.guard.confirmLeave(), false);
  assert.equal(f.guard.open(emptySource()), false);
  assert.equal(f.confirmations, 0);
  assert.equal(f.draft.name, "Guardado sintético");
  f.guard.endSave();
  assert.equal(f.guard.isDirty(), true, "A failed save retains unsaved changes.");
  assert.equal(f.guard.beginSave(), true, "The user can retry after failure.");
  f.guard.discard(); // Successful API save closes the form without another question.
  f.guard.endSave();
  assert.equal(f.draft, null);
  assert.equal(f.guard.isDirty(), false);
  assert.equal(f.guard.confirmLeave(), true);
  assert.equal(f.confirmations, 0);
  f.open(emptySource());
  assert.equal(f.guard.isDirty(), false);
  assert.equal(f.guard.confirmLeave(), true);
  assert.equal(f.confirmations, 0);
});

test("global busy state protects a pristine open form, but not a closed source form", () => {
  const f = fixture();
  f.open(emptySource());
  f.guard.sync(f.draft, true);
  assert.equal(f.guard.isDirty(), true);
  assert.equal(f.guard.confirmLeave(), false);
  assert.equal(f.guard.beginSave(), false);
  assert.equal(f.confirmations, 0);
  f.guard.sync(f.draft, false);
  assert.equal(f.guard.isDirty(), false);
  f.guard.discard();
  f.guard.sync(null, true);
  assert.equal(f.guard.isDirty(), false);
  assert.equal(f.guard.confirmLeave(), true);
  assert.equal(f.guard.open(emptySource()), false);
});
