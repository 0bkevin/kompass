import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import dns from "node:dns/promises";
import { EventEmitter } from "node:events";
import { installPermissionFixture } from "./permission-fixture.mjs";

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "radar-fetch-timeout-"),
);
process.env.DATA_DIR = directory;
process.env.DISCOVERY_ENABLED = "false";
const storage = await import("../server/db.mjs");
const { safeFetch } = await import("../server/connectors.mjs");
const target = "https://model.example.test/v1/responses";
function review() {
  installPermissionFixture(directory, [
    {
      origin: "https://model.example.test",
      pathPrefix: "/v1",
      purposes: ["ai"],
    },
  ]);
}
after(() => {
  storage.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("a stalled upstream request is destroyed and reports 504 with the existing message", async (t) => {
  review();
  t.mock.method(dns, "lookup", async () => [
    { address: "93.184.216.34", family: 4 },
  ]);
  let destroyed = 0;
  const transport = t.mock.method(https, "request", (url, options) => {
    assert.equal(url.href, target);
    assert.equal(options.method, "POST");
    const request = new EventEmitter();
    request.write = () => {};
    // The synthetic upstream never responds; the real safeFetch timer fires.
    request.end = () => {};
    request.destroy = (error) => {
      destroyed++;
      request.emit("error", error);
      request.emit("close");
    };
    return request;
  });
  await assert.rejects(
    safeFetch(target, {
      policyPurpose: "ai",
      method: "POST",
      body: "{}",
      timeout: 5,
      requireHttps: true,
    }),
    { status: 504, message: "El proveedor agotó el tiempo de espera." },
  );
  assert.equal(transport.mock.callCount(), 1);
  assert.equal(destroyed, 1);
});

test("invalid resolved destinations retain 400 and never open a socket", async (t) => {
  review();
  t.mock.method(dns, "lookup", async () => [
    { address: "127.0.0.1", family: 4 },
  ]);
  const transport = t.mock.method(https, "request", () => {
    assert.fail("a private address must fail before transport");
  });
  await assert.rejects(safeFetch(target, { policyPurpose: "ai" }), {
    status: 400,
  });
  assert.equal(transport.mock.callCount(), 0);
});

test("unreviewed destinations retain 403 before DNS or transport", async (t) => {
  installPermissionFixture(directory, []);
  const lookup = t.mock.method(dns, "lookup", async () => {
    assert.fail("policy must fail before DNS");
  });
  const transport = t.mock.method(https, "request", () => {
    assert.fail("policy must fail before transport");
  });
  await assert.rejects(safeFetch(target, { policyPurpose: "ai" }), {
    status: 403,
    code: "SOURCE_ACCESS_RESTRICTED",
  });
  assert.equal(lookup.mock.callCount(), 0);
  assert.equal(transport.mock.callCount(), 0);
});
