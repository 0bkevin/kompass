import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  MANAGED_TEXT_LIMITS,
  generateCodexText,
  codexTextReadiness,
  prepareTextRequest,
} from "../scripts/text-worker.mjs";
import { runBoundedProcess } from "../scripts/media-worker.mjs";

const schema = {
  type: "object",
  properties: {
    summary: { type: "string", minLength: 1, maxLength: 60 },
    quotes: {
      type: "array",
      minItems: 1,
      maxItems: 2,
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          rank: { type: "integer", minimum: 1, maximum: 3 },
        },
        required: ["text", "rank"],
        additionalProperties: false,
      },
    },
    tentative: { type: "boolean", enum: [true] },
  },
  required: ["summary", "quotes", "tentative"],
  additionalProperties: false,
};
const value = {
  summary: "Lectura preliminar",
  quotes: [{ text: "Texto público de prueba", rank: 1 }],
  tentative: true,
};
const request = () => ({
  name: "public_reading",
  schema: structuredClone(schema),
  instructions: "Resume el material proporcionado con citas verificables.",
  input: { text: "Texto público de prueba" },
});
const stream = (output = value, extra = []) =>
  [
    { type: "thread.started", thread_id: "synthetic-thread" },
    { type: "turn.started" },
    ...extra,
    {
      type: "item.completed",
      item: { type: "agent_message", text: JSON.stringify(output) },
    },
    { type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } },
  ]
    .map((event) => JSON.stringify(event))
    .join("\n");

function fixture({
  result = { code: 0, stdout: stream(), stderr: "" },
  login = { code: 0, stdout: "", stderr: "Logged in using ChatGPT" },
} = {}) {
  const calls = [];
  const directories = [];
  const options = {
    sourceEnv: {
      PATH: process.env.PATH,
      HOME: "/synthetic/operator",
      OPENAI_API_KEY: "synthetic-api-secret",
      CODEX_API_KEY: "synthetic-codex-secret",
      T3_SESSION: "synthetic-tenant-secret",
      CODEX_ACCESS_TOKEN: "synthetic-access-secret",
    },
    createSandbox({ workDir, commandArgs, sourceEnv }) {
      assert.equal(sourceEnv.OPENAI_API_KEY, undefined);
      assert.equal(sourceEnv.CODEX_API_KEY, undefined);
      assert.equal(sourceEnv.CODEX_ACCESS_TOKEN, undefined);
      assert.equal(sourceEnv.T3_SESSION, undefined);
      assert.equal(fs.statSync(workDir).mode & 0o777, 0o700);
      directories.push(workDir);
      return {
        binary: "synthetic-codex",
        args: commandArgs,
        env: {
          PATH: "/usr/bin",
          HOME: "/home/radar",
          CODEX_HOME: path.join(workDir, ".codex-runtime"),
        },
      };
    },
    async runProcess(binary, args, options) {
      calls.push({ binary, args, ...options });
      if (args[0] === "login") return login;
      const schemaPath = args[args.indexOf("--output-schema") + 1];
      assert.deepEqual(JSON.parse(fs.readFileSync(schemaPath, "utf8")), schema);
      assert.equal(fs.statSync(schemaPath).mode & 0o777, 0o600);
      return result;
    },
  };
  return { calls, options, directories };
}

test("worker uses normal login status, stdin and the caller schema with tools and retries disabled", async () => {
  const f = fixture();
  const output = await generateCodexText(request(), f.options);
  assert.deepEqual(output, value);
  assert.deepEqual(f.calls[0].args, ["login", "status"]);
  assert.equal(f.calls.length, 2);
  const execution = f.calls[1];
  assert.equal(execution.maxBytes, MANAGED_TEXT_LIMITS.processBytes);
  assert.ok(execution.timeoutMs <= MANAGED_TEXT_LIMITS.timeoutMs);
  assert.equal(execution.args.at(-1), "-");
  assert.ok(execution.args.includes('forced_login_method="chatgpt"'));
  for (const feature of [
    "shell_tool",
    "apps",
    "plugins",
    "hooks",
    "multi_agent",
    "code_mode_host",
    "image_generation",
    "browser_use",
    "computer_use",
    "view_image",
    "skill_search",
    "unbounded_connection_retries",
  ])
    assert.ok(execution.args.includes(`features.${feature}=false`));
  for (const arg of [
    'web_search="disabled"',
    "mcp_servers={}",
    "model_providers.openai.request_max_retries=0",
    "model_providers.openai.stream_max_retries=0",
    "--ignore-user-config",
    "--ignore-rules",
    "--ephemeral",
  ])
    assert.ok(execution.args.includes(arg));
  assert.equal(
    execution.args[execution.args.indexOf("--sandbox") + 1],
    "read-only",
  );
  assert.ok(execution.input.includes("Texto público de prueba"));
  assert.ok(!execution.args.join(" ").includes("Texto público de prueba"));
  assert.ok(!JSON.stringify(f.calls).includes("synthetic-api-secret"));
  for (const directory of f.directories) assert.ok(!fs.existsSync(directory));
});

test("readiness never starts login or inference and sanitizes errors", async () => {
  const f = fixture();
  assert.deepEqual(await codexTextReadiness(f.options), {
    ready: true,
    provider: "codex-chatgpt",
  });
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].args, ["login", "status"]);
  const failed = await codexTextReadiness({
    ...f.options,
    createSandbox() {
      throw new Error("synthetic-private-host-path");
    },
  });
  assert.equal(failed.ready, false);
  assert.ok(!JSON.stringify(failed).includes("synthetic-private-host-path"));
});

test("API authentication, missing authentication and sandbox failure stop before inference", async () => {
  for (const login of [
    {
      code: 0,
      stdout: "Logged in using an API key: synthetic-private-key",
      stderr: "",
    },
    { code: 1, stdout: "", stderr: "Not logged in" },
  ]) {
    const f = fixture({ login });
    await assert.rejects(generateCodexText(request(), f.options), {
      code: "TEXT_AUTH_REQUIRED",
    });
    assert.equal(f.calls.length, 1);
    assert.ok(f.directories.every((directory) => !fs.existsSync(directory)));
  }
  const f = fixture();
  f.options.createSandbox = () => {
    throw Object.assign(new Error("synthetic-host-secret"), {
      code: "MEDIA_SANDBOX_UNAVAILABLE",
    });
  };
  await assert.rejects(
    generateCodexText(request(), f.options),
    (error) =>
      error.code === "TEXT_SANDBOX_UNAVAILABLE" &&
      !error.message.includes("synthetic-host-secret"),
  );
  assert.equal(f.calls.length, 0);
});

test("schema violations, forbidden tool events and incomplete turns reject without reflecting JSON values", async () => {
  const invalid = [
    { ...value, summary: 3 },
    { ...value, private: "synthetic-confidential-value" },
    { ...value, quotes: [] },
    { ...value, quotes: [{ text: "public", rank: 0 }] },
    { ...value, tentative: false },
    { ...value, summary: "x".repeat(61) },
  ];
  for (const output of invalid) {
    const f = fixture({
      result: {
        code: 0,
        stdout: stream(output),
        stderr: "synthetic-private-stderr",
      },
    });
    await assert.rejects(
      generateCodexText(request(), f.options),
      (error) =>
        error.code === "TEXT_INVALID_RESULT" &&
        !JSON.stringify({ message: error.message, ...error }).includes(
          "synthetic-",
        ),
    );
  }
  for (const stdout of [
    stream(value, [
      {
        type: "item.completed",
        item: {
          type: "command_execution",
          command: "synthetic-private-command",
        },
      },
    ]),
    stream(value).split("\n").slice(0, -1).join("\n"),
    stream(value, [
      {
        type: "turn.failed",
        error: { message: "synthetic-confidential-value" },
      },
    ]),
    '{"type":"error","message":"synthetic-confidential-value"}',
    "synthetic-invalid-json",
  ]) {
    const f = fixture({ result: { code: 0, stdout, stderr: "" } });
    await assert.rejects(
      generateCodexText(request(), f.options),
      (error) =>
        /^TEXT_(INVALID_RESULT|PROVIDER_ERROR)$/.test(error.code) &&
        !error.message.includes("synthetic-"),
    );
  }
});

test("provider quota, process limits and cancellation are safe failures with no retries", async () => {
  const limited = fixture({
    result: {
      code: 1,
      stdout: "",
      stderr: "quota exceeded synthetic-private-JSON",
    },
  });
  await assert.rejects(generateCodexText(request(), limited.options), {
    code: "TEXT_USAGE_LIMIT",
  });
  assert.equal(limited.calls.length, 2);
  for (const [workerCode, textCode] of [
    ["MEDIA_OUTPUT_LIMIT", "TEXT_OUTPUT_LIMIT"],
    ["MEDIA_TIMEOUT", "TEXT_TIMEOUT"],
    ["MEDIA_INTERRUPTED", "TEXT_INTERRUPTED"],
  ]) {
    const f = fixture();
    f.options.runProcess = async () => {
      throw Object.assign(new Error("synthetic-confidential-value"), {
        code: workerCode,
      });
    };
    await assert.rejects(
      generateCodexText(request(), f.options),
      (error) =>
        error.code === textCode && !error.message.includes("synthetic-"),
    );
    assert.ok(f.directories.every((directory) => !fs.existsSync(directory)));
  }
  const f = fixture();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    generateCodexText({ ...request(), signal: controller.signal }, f.options),
    { code: "TEXT_INTERRUPTED" },
  );
  assert.equal(f.calls.length, 0);
});

test("request byte limits, sensitive values and unsupported schemas fail before any subprocess", async () => {
  for (const input of [
    { apiKey: "synthetic-secret" },
    '{"refresh_token":"synthetic-secret"}',
    "Bearer synthetic-secret",
    { classification: "confidential", text: "synthetic-private-value" },
  ])
    assert.throws(() => prepareTextRequest({ ...request(), input }), {
      code: "TEXT_SENSITIVE_INPUT",
    });
  assert.throws(
    () => prepareTextRequest({ ...request(), input: "é".repeat(30_001) }),
    { code: "TEXT_INPUT_LIMIT" },
  );
  assert.throws(
    () =>
      prepareTextRequest({ ...request(), instructions: "x".repeat(12_001) }),
    { code: "TEXT_INPUT_LIMIT" },
  );
  for (const changed of [
    null,
    { ...schema, $ref: "https://example.test/schema" },
    { ...schema, additionalProperties: true },
    { ...schema, required: ["synthetic-secret-field"] },
    {
      ...schema,
      properties: {
        ...schema.properties,
        summary: { type: "string", pattern: ".*" },
      },
    },
  ])
    assert.throws(() => prepareTextRequest({ ...request(), schema: changed }), {
      code: "TEXT_INVALID_SCHEMA",
    });
  const f = fixture();
  await assert.rejects(
    generateCodexText(
      { ...request(), input: { password: "synthetic-password" } },
      f.options,
    ),
    { code: "TEXT_SENSITIVE_INPUT" },
  );
  assert.equal(f.calls.length, 0);
});

test("worker reuses the actual bounded process transport for interrupt, deadline and output caps", async () => {
  for (const expected of [
    "TEXT_INTERRUPTED",
    "TEXT_TIMEOUT",
    "TEXT_OUTPUT_LIMIT",
  ]) {
    const controller = new AbortController();
    const directories = [];
    const options = {
      createSandbox({ commandArgs, workDir }) {
        directories.push(workDir);
        const script =
          commandArgs[0] === "login"
            ? 'process.stdout.write("Logged in using ChatGPT")'
            : expected === "TEXT_OUTPUT_LIMIT"
              ? 'process.stdout.write("x".repeat(1200000))'
              : "setTimeout(() => {}, 10000)";
        return { binary: process.execPath, args: ["-e", script], env: {} };
      },
      runProcess(binary, args, settings) {
        return runBoundedProcess(binary, args, {
          ...settings,
          timeoutMs: expected === "TEXT_TIMEOUT" ? 150 : 1500,
        });
      },
    };
    const generation = generateCodexText(
      { ...request(), signal: controller.signal },
      options,
    );
    const assertion = assert.rejects(generation, { code: expected });
    if (expected === "TEXT_INTERRUPTED")
      setTimeout(() => controller.abort(), 100);
    await assertion;
    assert.ok(directories.every((directory) => !fs.existsSync(directory)));
  }
});
