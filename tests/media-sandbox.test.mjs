import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  createMediaSandbox,
  mediaSandboxAvailability,
} from "../scripts/media-sandbox.mjs";

const root = fs.mkdtempSync(
  path.join(os.tmpdir(), "radar-media-sandbox-tests-"),
);
const capability = mediaSandboxAvailability();
after(() => fs.rmSync(root, { recursive: true, force: true }));
function fixture() {
  const directory = fs.mkdtempSync(path.join(root, "case-"));
  const workDir = path.join(directory, "job");
  const privateDir = path.join(directory, "private-host-files");
  const codexHome = path.join(privateDir, "codex");
  fs.mkdirSync(workDir, { mode: 0o700 });
  fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(codexHome, "auth.json"),
    "synthetic-auth-fixture",
    { mode: 0o600 },
  );
  fs.writeFileSync(
    path.join(privateDir, "unrelated-image.png"),
    "synthetic-private-image",
    { mode: 0o600 },
  );
  fs.writeFileSync(
    path.join(codexHome, "config.toml"),
    "synthetic-private-config",
    { mode: 0o600 },
  );
  return {
    workDir,
    privateDir,
    codexHome,
    sourceEnv: {
      HOME: privateDir,
      CODEX_HOME: codexHome,
      PATH: process.env.PATH,
      OPENAI_API_KEY: "synthetic-secret-not-allowed",
    },
  };
}

test("media sandbox rejects relative, missing, symlinked, broad and invalid working directories", () => {
  const f = fixture();
  const symlink = path.join(path.dirname(f.workDir), "symlink-job");
  fs.symlinkSync(f.workDir, symlink);
  for (const workDir of [
    "relative-job",
    "/",
    "/tmp",
    process.cwd(),
    path.join(root, "missing"),
    symlink,
    f.workDir + "/../job",
  ]) {
    assert.throws(
      () =>
        createMediaSandbox({ ...f, workDir, commandArgs: ["login", "status"] }),
      { code: "MEDIA_SANDBOX_UNAVAILABLE" },
    );
  }
  for (const commandArgs of [undefined, "not-an-array", ["x\0y"], [123]])
    assert.throws(() => createMediaSandbox({ ...f, commandArgs }), {
      code: "MEDIA_SANDBOX_UNAVAILABLE",
    });
});

test(
  "credentials are bound as one read-only file and never copied into the job",
  { skip: !capability.ready },
  () => {
    const f = fixture();
    const command = createMediaSandbox({
      ...f,
      binary: process.execPath,
      commandArgs: ["--version"],
    });
    assert.equal(command.binary, "/usr/bin/bwrap");
    assert.equal(
      command.env.CODEX_HOME,
      path.join(f.workDir, ".codex-runtime"),
    );
    assert.equal(command.env.OPENAI_API_KEY, undefined);
    assert.equal(command.env.HOME, "/home/radar");
    assert.equal(
      fs.statSync(path.join(command.env.CODEX_HOME, "auth.json")).size,
      0,
    );
    assert.equal(
      command.generatedImagesRoot,
      path.join(f.workDir, ".codex-runtime/generated_images"),
    );
    for (const flag of [
      "--unshare-user",
      "--unshare-pid",
      "--unshare-ipc",
      "--unshare-uts",
      "--new-session",
      "--die-with-parent",
      "--clearenv",
    ])
      assert.ok(command.args.includes(flag));
    assert.ok(
      !command.args.includes("--share-net"),
      "network is retained explicitly by not creating a new network namespace",
    );
    const mounts = command.args.flatMap((value, index) =>
      ["--bind", "--ro-bind"].includes(value)
        ? [
            {
              kind: value,
              source: command.args[index + 1],
              destination: command.args[index + 2],
            },
          ]
        : [],
    );
    assert.deepEqual(
      mounts.filter((mount) => mount.kind === "--bind"),
      [{ kind: "--bind", source: f.workDir, destination: f.workDir }],
    );
    assert.ok(
      mounts.some(
        (mount) =>
          mount.kind === "--ro-bind" &&
          mount.source === path.join(f.codexHome, "auth.json"),
      ),
    );
    assert.ok(
      !mounts.some((mount) =>
        [
          f.codexHome,
          f.privateDir,
          "/home",
          "/workspace",
          "/etc",
          "/",
        ].includes(mount.source),
      ),
    );
  },
);

test(
  "actual namespaces hide host files and host proc roots while denying writes to bound auth",
  { skip: !capability.ready },
  () => {
    const f = fixture();
    const privateFile = path.join(f.privateDir, "unrelated-image.png");
    const authSource = path.join(f.codexHome, "auth.json");
    const probe = `
    const fs = require('node:fs');
    let authWriteDenied = false;
    try { fs.writeFileSync(process.env.CODEX_HOME + '/auth.json', 'must-not-replace-synthetic-auth'); }
    catch { authWriteDenied = true; }
    fs.writeFileSync(${JSON.stringify(path.join(f.workDir, "allowed-output.txt"))}, 'synthetic-safe-output');
    console.log(JSON.stringify({
      privateImageVisible: fs.existsSync(${JSON.stringify(privateFile)}),
      hostConfigVisible: fs.existsSync(${JSON.stringify(path.join(f.codexHome, "config.toml"))}),
      hostProcessRootVisible: fs.existsSync(${JSON.stringify(`/proc/${process.pid}/root`)}),
      parentEnvironmentVisible: fs.existsSync(${JSON.stringify(`/proc/${process.pid}/environ`)}),
      authExists: fs.existsSync(process.env.CODEX_HOME + '/auth.json'), authWriteDenied,
      apiKeyVisible: Boolean(process.env.OPENAI_API_KEY), cwd: process.cwd()
    }));`;
    const command = createMediaSandbox({
      ...f,
      binary: process.execPath,
      commandArgs: ["-e", probe],
    });
    const result = spawnSync(command.binary, command.args, {
      env: command.env,
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 64 * 1024,
    });
    assert.equal(
      result.status,
      0,
      "the public synthetic sandbox probe must execute successfully",
    );
    assert.deepEqual(JSON.parse(result.stdout), {
      privateImageVisible: false,
      hostConfigVisible: false,
      hostProcessRootVisible: false,
      parentEnvironmentVisible: false,
      authExists: true,
      authWriteDenied: true,
      apiKeyVisible: false,
      cwd: f.workDir,
    });
    assert.equal(
      fs.readFileSync(authSource, "utf8"),
      "synthetic-auth-fixture",
      "only a synthetic credential fixture is inspected here",
    );
    assert.equal(
      fs.statSync(path.join(command.env.CODEX_HOME, "auth.json")).size,
      0,
      "the host destination remains an empty mount placeholder",
    );
    assert.equal(
      fs.readFileSync(path.join(f.workDir, "allowed-output.txt"), "utf8"),
      "synthetic-safe-output",
    );
  },
);

test(
  "missing normal authentication and credential destination symlinks fail closed",
  { skip: !capability.ready },
  () => {
    const f = fixture();
    assert.throws(
      () =>
        createMediaSandbox({
          ...f,
          binary: process.execPath,
          sourceEnv: {
            ...f.sourceEnv,
            CODEX_HOME: path.join(root, "no-credentials"),
          },
          commandArgs: ["--version"],
        }),
      { code: "MEDIA_AUTH_REQUIRED" },
    );
    const codexDir = path.join(f.workDir, ".codex-runtime");
    fs.mkdirSync(codexDir);
    fs.symlinkSync(
      path.join(f.codexHome, "auth.json"),
      path.join(codexDir, "auth.json"),
    );
    assert.throws(
      () =>
        createMediaSandbox({
          ...f,
          binary: process.execPath,
          commandArgs: ["--version"],
        }),
      { code: "MEDIA_SANDBOX_UNAVAILABLE" },
    );
  },
);

test(
  "generated-image output stays within one job and repeat setup never imports host image history",
  { skip: !capability.ready },
  () => {
    const f = fixture();
    fs.mkdirSync(path.join(f.codexHome, "generated_images"));
    fs.writeFileSync(
      path.join(f.codexHome, "generated_images", "previous-private.png"),
      "synthetic-old-image",
    );
    const first = createMediaSandbox({
      ...f,
      binary: process.execPath,
      commandArgs: ["--version"],
    });
    const second = createMediaSandbox({
      ...f,
      binary: process.execPath,
      commandArgs: ["--version"],
    });
    assert.equal(first.generatedImagesRoot, second.generatedImagesRoot);
    assert.deepEqual(fs.readdirSync(first.generatedImagesRoot), []);
  },
);
