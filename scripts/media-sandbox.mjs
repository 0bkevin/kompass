import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const BWRAP = "/usr/bin/bwrap";
const SYSTEM_DIRECTORIES = [
  "/usr/bin",
  "/usr/lib",
  "/usr/lib64",
  "/etc/ssl/certs",
  "/usr/share/ca-certificates",
];
const SYSTEM_FILES = [
  "/etc/resolv.conf",
  "/etc/hosts",
  "/etc/nsswitch.conf",
  "/etc/gai.conf",
];

function unavailable() {
  return Object.assign(
    new Error(
      "No se pudo aislar la creación visual de los archivos del servidor. El administrador debe habilitar Bubblewrap en Linux antes de generar imágenes.",
    ),
    { code: "MEDIA_SANDBOX_UNAVAILABLE", status: 503 },
  );
}
function regularFile(value) {
  try {
    return fs.statSync(value).isFile();
  } catch {
    return false;
  }
}
function executable(value, sourceEnv) {
  if (typeof value !== "string" || !value || value.includes("\0"))
    throw unavailable();
  const candidates = path.isAbsolute(value)
    ? [value]
    : value.includes(path.sep)
      ? []
      : (sourceEnv.PATH || "")
          .split(path.delimiter)
          .filter((entry) => path.isAbsolute(entry))
          .map((entry) => path.join(entry, value));
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (regularFile(candidate)) return fs.realpathSync(candidate);
    } catch {
      /* Try the next explicit PATH entry. */
    }
  }
  throw unavailable();
}

function runtimeArguments() {
  if (process.platform !== "linux" || !regularFile(BWRAP)) throw unavailable();
  const args = [
    "--unshare-user",
    "--unshare-pid",
    "--unshare-ipc",
    "--unshare-uts",
    "--new-session",
    "--die-with-parent",
    "--cap-drop",
    "ALL",
    "--clearenv",
  ];
  for (const directory of SYSTEM_DIRECTORIES) {
    if (fs.existsSync(directory))
      args.push("--ro-bind", fs.realpathSync(directory), directory);
  }
  for (const file of SYSTEM_FILES) {
    if (regularFile(file)) args.push("--ro-bind", fs.realpathSync(file), file);
  }
  for (const [link, target] of [
    ["/bin", "usr/bin"],
    ["/lib", "usr/lib"],
    ["/lib64", "usr/lib64"],
  ])
    args.push("--symlink", target, link);
  args.push(
    "--proc",
    "/proc",
    "--dev",
    "/dev",
    "--tmpfs",
    "/tmp",
    "--dir",
    "/home/radar",
    "--dir",
    "/runtime",
  );
  return args;
}

export function mediaSandboxAvailability() {
  try {
    const result = spawnSync(
      BWRAP,
      [...runtimeArguments(), "--", "/usr/bin/true"],
      { timeout: 5000, stdio: "ignore", env: { PATH: "/usr/bin:/bin" } },
    );
    return result.status === 0
      ? { ready: true }
      : { ready: false, reason: unavailable().message };
  } catch {
    return { ready: false, reason: unavailable().message };
  }
}

/** A private filesystem view, with no read of an authentication token in JS.
 * The caller must use the returned command and generated-image root together.
 * Networking remains available for the normal authenticated Codex transport.
 */
export function createMediaSandbox({
  workDir,
  commandArgs,
  binary = "codex",
  sourceEnv = process.env,
} = {}) {
  if (
    typeof workDir !== "string" ||
    !path.isAbsolute(workDir) ||
    workDir.includes("\0") ||
    path.resolve(workDir) !== workDir ||
    !Array.isArray(commandArgs) ||
    commandArgs.some(
      (value) => typeof value !== "string" || value.includes("\0"),
    )
  )
    throw unavailable();
  let info;
  try {
    info = fs.lstatSync(workDir);
  } catch {
    throw unavailable();
  }
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    fs.realpathSync(workDir) !== workDir ||
    ["/", "/tmp", "/home", "/workspace", os.homedir(), process.cwd()].includes(
      workDir,
    )
  )
    throw unavailable();
  const codexBinary = executable(binary, sourceEnv);
  const authRoot =
    sourceEnv.CODEX_HOME || path.join(sourceEnv.HOME || os.homedir(), ".codex");
  const authFile = path.join(authRoot, "auth.json");
  if (!regularFile(authFile))
    throw Object.assign(
      new Error(
        "El administrador debe iniciar sesión de nuevo en Codex con ChatGPT en este servidor.",
      ),
      { code: "MEDIA_AUTH_REQUIRED", status: 503 },
    );
  const codexHome = path.join(workDir, ".codex-runtime");
  fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  if (
    fs.lstatSync(codexHome).isSymbolicLink() ||
    fs.realpathSync(codexHome) !== codexHome
  )
    throw unavailable();
  const authTarget = path.join(codexHome, "auth.json");
  try {
    fs.writeFileSync(authTarget, "", { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (
      error.code !== "EEXIST" ||
      fs.lstatSync(authTarget).isSymbolicLink() ||
      !fs.statSync(authTarget).isFile() ||
      fs.statSync(authTarget).size !== 0
    )
      throw unavailable();
  }
  const generatedImagesRoot = path.join(codexHome, "generated_images");
  fs.mkdirSync(generatedImagesRoot, { recursive: true, mode: 0o700 });
  if (
    fs.lstatSync(generatedImagesRoot).isSymbolicLink() ||
    fs.realpathSync(generatedImagesRoot) !== generatedImagesRoot
  )
    throw unavailable();
  const env = {
    PATH: "/usr/bin:/bin:/runtime",
    HOME: "/home/radar",
    USER: "radar",
    LOGNAME: "radar",
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    TMPDIR: "/tmp",
    CODEX_HOME: codexHome,
    NO_COLOR: "1",
    TZ: "UTC",
    SSL_CERT_FILE: "/etc/ssl/certs/ca-certificates.crt",
    SSL_CERT_DIR: "/etc/ssl/certs",
  };
  const args = runtimeArguments();
  // Mount the private job directory first, then cover only the empty placeholder
  // with the host's normal CLI auth file. The parent directory contains no host
  // account configuration, browser files, previous images, or application data.
  args.push(
    "--bind",
    workDir,
    workDir,
    "--ro-bind",
    fs.realpathSync(authFile),
    authTarget,
    "--ro-bind",
    codexBinary,
    "/runtime/codex",
  );
  const codeModeHost = path.join(
    path.dirname(codexBinary),
    "codex-code-mode-host",
  );
  if (regularFile(codeModeHost))
    args.push(
      "--ro-bind",
      fs.realpathSync(codeModeHost),
      "/runtime/codex-code-mode-host",
    );
  for (const [name, value] of Object.entries(env))
    args.push("--setenv", name, value);
  args.push("--chdir", workDir, "--", "/runtime/codex", ...commandArgs);
  return { binary: BWRAP, args, env, generatedImagesRoot };
}
