import { spawnSync } from "node:child_process";
import { mediaWorkerEnvironment } from "../scripts/media-worker.mjs";
import { mediaSandboxAvailability } from "../scripts/media-sandbox.mjs";

let cache;
// Synchronous, bounded prerequisite check for the existing synchronous public
// integration descriptor. This never requests inference or reads auth contents.
export function managedTextAvailability({
  env = process.env,
  refresh = false,
} = {}) {
  if (env.PLATFORM_TEXT_PROVIDER !== "codex-chatgpt")
    return {
      ready: false,
      reason: "El servicio de texto administrado está desactivado.",
    };
  const binary = env.RADAR_CODEX_BINARY || "codex";
  const key = JSON.stringify([binary, env.HOME, env.CODEX_HOME, env.PATH]);
  if (!refresh && cache?.key === key && Date.now() - cache.at < 30000)
    return cache.value;
  let ready = false;
  let reason = "El operador debe revisar el acceso de ChatGPT en el servidor.";
  try {
    const result = spawnSync(binary, ["login", "status"], {
      env: mediaWorkerEnvironment(env),
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 65536,
    });
    if (
      result.status === 0 &&
      /Logged in using ChatGPT/i.test(
        `${result.stdout || ""}${result.stderr || ""}`,
      )
    ) {
      const sandbox = mediaSandboxAvailability();
      ready = sandbox.ready === true;
      reason = ready
        ? undefined
        : "El aislamiento del servicio de texto no está disponible.";
    }
  } catch {
    /* Keep provider diagnostics and private paths out of public state. */
  }
  const value = { ready, ...(reason ? { reason } : {}) };
  cache = { key, at: Date.now(), value };
  return value;
}
