import test from "node:test";
import assert from "node:assert/strict";
import {
  createManagedTextService,
  MANAGED_TEXT_LIMITS,
} from "../server/managed-text.mjs";

const schema = {
  type: "object",
  properties: { title: { type: "string" } },
  required: ["title"],
  additionalProperties: false,
};
const request = () => ({
  name: "editorial_text",
  schema: structuredClone(schema),
  instructions: "Resume el texto público.",
  input: { text: "Ejemplo público sintético" },
});
const environment = () => ({ PLATFORM_TEXT_PROVIDER: "codex-chatgpt" });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("disabled service returns null without credentials or transport; readiness is honest", async () => {
  let calls = 0;
  const service = createManagedTextService({
    environment: () => ({}),
    transport() {
      calls++;
    },
    readiness() {
      calls++;
    },
  });
  assert.equal(await service.generateManagedText(request()), null);
  const state = await service.managedTextStatus();
  assert.equal(state.enabled, false);
  assert.equal(state.ready, false);
  assert.equal(state.code, "TEXT_DISABLED");
  assert.equal(calls, 0);
  service.stop();
});

test("enabled service preserves caller shape, serializes tenants and snapshots queued requests", async () => {
  const gates = [deferred(), deferred()];
  const calls = [];
  let concurrent = 0,
    peak = 0;
  const service = createManagedTextService({
    environment,
    readiness: async () => ({ ready: true }),
    transport: async (r) => {
      concurrent++;
      peak = Math.max(peak, concurrent);
      calls.push(r);
      const result = await gates[calls.length - 1].promise;
      concurrent--;
      return result;
    },
  });
  const first = service.generateManagedText(request());
  const queuedRequest = request();
  const second = service.generateManagedText(queuedRequest);
  queuedRequest.schema.properties.title.type = "number";
  queuedRequest.input.text = "synthetic-changed-after-enqueue";
  await tick();
  assert.equal(calls.length, 1);
  const state = await service.managedTextStatus();
  assert.equal(state.ready, true);
  assert.equal(state.inFlight, 1);
  assert.equal(state.pending, 1);
  gates[0].resolve({ title: "Primera" });
  assert.deepEqual(await first, { title: "Primera" });
  await tick();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].schema.properties.title.type, "string");
  assert.ok(!calls[1].input.includes("synthetic-changed-after-enqueue"));
  gates[1].resolve({ title: "Segunda" });
  assert.deepEqual(await second, { title: "Segunda" });
  assert.equal(peak, 1);
  service.stop();
});

test("pending cap rejects excess requests and queued abort never invokes transport", async () => {
  const gate = deferred();
  let calls = 0;
  const service = createManagedTextService({
    environment,
    maxPending: 1,
    transport: async () => {
      calls++;
      return gate.promise;
    },
  });
  const first = service.generateManagedText(request());
  const controller = new AbortController();
  const second = service.generateManagedText({
    ...request(),
    signal: controller.signal,
  });
  const interrupted = assert.rejects(second, { code: "TEXT_INTERRUPTED" });
  await assert.rejects(service.generateManagedText(request()), {
    code: "TEXT_QUEUE_FULL",
  });
  controller.abort();
  await interrupted;
  gate.resolve({ title: "Primera" });
  await first;
  await tick();
  assert.equal(calls, 1);
  service.stop();
});

test("execution deadline aborts transport, holds its lease, and does not retry", async () => {
  const gate = deferred();
  let calls = 0;
  let signal;
  const service = createManagedTextService({
    environment,
    timeoutMs: 30,
    transport: async (r) => {
      calls++;
      signal = r.signal;
      return gate.promise;
    },
  });
  await assert.rejects(service.generateManagedText(request()), {
    code: "TEXT_TIMEOUT",
  });
  assert.equal(signal.aborted, true);
  assert.equal(calls, 1);
  const controller = new AbortController();
  const pending = service.generateManagedText({
    ...request(),
    signal: controller.signal,
  });
  const interrupted = assert.rejects(pending, { code: "TEXT_INTERRUPTED" });
  await tick();
  assert.equal(
    calls,
    1,
    "a non-cooperative transport cannot release its concurrency lease",
  );
  controller.abort();
  await interrupted;
  gate.resolve({ title: "Ignored late result" });
  await tick();
  assert.equal(calls, 1);
  service.stop();
});

test("queue timeout removes pending request without running it", async () => {
  const gate = deferred();
  let calls = 0;
  const service = createManagedTextService({
    environment,
    queueTimeoutMs: 25,
    transport: async () => {
      calls++;
      return gate.promise;
    },
  });
  const first = service.generateManagedText(request());
  await assert.rejects(service.generateManagedText(request()), {
    code: "TEXT_QUEUE_TIMEOUT",
  });
  gate.resolve({ title: "Primera" });
  await first;
  await tick();
  assert.equal(calls, 1);
  service.stop();
});

test("shutdown interrupts running and queued work and rejects new requests", async () => {
  const service = createManagedTextService({
    environment,
    transport: (r) =>
      new Promise((resolve, reject) => {
        r.signal.addEventListener(
          "abort",
          () => reject(new Error("synthetic-private-value")),
          { once: true },
        );
      }),
  });
  const first = assert.rejects(service.generateManagedText(request()), {
    code: "TEXT_INTERRUPTED",
  });
  const second = assert.rejects(service.generateManagedText(request()), {
    code: "TEXT_STOPPED",
  });
  await tick();
  service.stop();
  await Promise.all([first, second]);
  await assert.rejects(service.generateManagedText(request()), {
    code: "TEXT_STOPPED",
  });
  assert.equal((await service.managedTextStatus()).code, "TEXT_STOPPED");
});

test("status and failures never reflect confidential JSON fields, input or provider diagnostics", async () => {
  const confidential = '{"clientSecret":"synthetic-confidential-value"}';
  const service = createManagedTextService({
    environment,
    readiness: async () => ({
      ready: false,
      code: "TEXT_AUTH_REQUIRED",
      reason: confidential,
      private: confidential,
    }),
    transport: async () => {
      throw Object.assign(new Error(confidential), {
        code: "TEXT_USAGE_LIMIT",
        payload: confidential,
      });
    },
  });
  const state = await service.managedTextStatus();
  assert.equal(state.code, "TEXT_AUTH_REQUIRED");
  assert.ok(!JSON.stringify(state).includes("synthetic-confidential-value"));
  await assert.rejects(
    service.generateManagedText(request()),
    (error) =>
      error.code === "TEXT_USAGE_LIMIT" &&
      !JSON.stringify({ message: error.message, ...error }).includes(
        "synthetic-confidential-value",
      ) &&
      !Object.hasOwn(error, "payload"),
  );
  service.stop();
});

test("service validates transport results and bounded configuration", async () => {
  for (const result of [
    null,
    { title: 5 },
    { title: "Bearer synthetic-private-credential" },
    { title: "public", secret: "synthetic-confidential-value" },
  ]) {
    const service = createManagedTextService({
      environment,
      transport: async () => result,
    });
    await assert.rejects(service.generateManagedText(request()), {
      code: "TEXT_INVALID_RESULT",
    });
    service.stop();
  }
  const invalidRequestService = createManagedTextService({ environment });
  await assert.rejects(
    invalidRequestService.generateManagedText({ ...request(), signal: {} }),
    { code: "TEXT_INVALID_REQUEST" },
  );
  invalidRequestService.stop();
  const service = createManagedTextService({
    environment,
    transport: async () => ({
      title: "x".repeat(MANAGED_TEXT_LIMITS.outputBytes + 1),
    }),
  });
  await assert.rejects(service.generateManagedText(request()), {
    code: "TEXT_OUTPUT_LIMIT",
  });
  service.stop();
  for (const options of [
    { maxPending: 0 },
    { maxPending: 100 },
    { timeoutMs: Infinity },
    { timeoutMs: 60_001 },
    { queueTimeoutMs: -1 },
  ])
    assert.throws(() => createManagedTextService(options), {
      code: "TEXT_INVALID_REQUEST",
    });
});
