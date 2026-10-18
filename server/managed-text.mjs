import {
  MANAGED_TEXT_LIMITS,
  codexTextReadiness,
  generateCodexText,
  prepareTextRequest,
  validateTextResult,
  normalizeTextError,
  textFailure,
} from "../scripts/text-worker.mjs";

export { MANAGED_TEXT_LIMITS };

/** Process-local platform service; never pass tenant configuration as environment.
 * Returns the caller's JSON object, or null only when the provider is disabled.
 * An enabled provider failure rejects with a fixed code/message and no input/logs.
 */
export function createManagedTextService({
  environment = () => process.env,
  transport = generateCodexText,
  readiness = codexTextReadiness,
  maxPending = MANAGED_TEXT_LIMITS.maxPending,
  timeoutMs = MANAGED_TEXT_LIMITS.timeoutMs,
  queueTimeoutMs = MANAGED_TEXT_LIMITS.queueTimeoutMs,
} = {}) {
  for (const [value, maximum] of [
    [maxPending, MANAGED_TEXT_LIMITS.maxPending],
    [timeoutMs, MANAGED_TEXT_LIMITS.timeoutMs],
    [queueTimeoutMs, MANAGED_TEXT_LIMITS.queueTimeoutMs],
  ])
    if (!Number.isInteger(value) || value < 1 || value > maximum)
      throw textFailure("TEXT_INVALID_REQUEST");
  const queue = [];
  let active = null;
  let stopped = false;
  const enabled = () =>
    environment().PLATFORM_TEXT_PROVIDER === "codex-chatgpt";
  const workerOptions = () => ({
    sourceEnv: environment(),
    binary: environment().RADAR_CODEX_BINARY || "codex",
  });

  function drain() {
    if (active || stopped) return;
    const entry = queue.shift();
    if (!entry) return;
    active = entry;
    clearTimeout(entry.queueTimer);
    entry.started = true;
    const timer = setTimeout(() => entry.cancel("TEXT_TIMEOUT"), timeoutMs);
    // Keep the lease until the bounded transport actually settles after abort.
    Promise.resolve()
      .then(() => {
        if (entry.controller.signal.aborted)
          throw textFailure("TEXT_INTERRUPTED");
        if (!enabled()) throw textFailure("TEXT_DISABLED");
        return transport(
          { ...entry.request, signal: entry.controller.signal },
          workerOptions(),
        );
      })
      .then(
        (value) => {
          if (!entry.settled) {
            try {
              entry.resolve(validateTextResult(value, entry.request.schema));
            } catch (error) {
              entry.reject(normalizeTextError(error));
            }
          }
        },
        (error) => {
          if (!entry.settled) entry.reject(normalizeTextError(error));
        },
      )
      .finally(() => {
        clearTimeout(timer);
        entry.signal?.removeEventListener("abort", entry.abort);
        active = null;
        drain();
      });
  }

  function generateManagedText(request) {
    if (stopped) return Promise.reject(textFailure("TEXT_STOPPED"));
    if (!enabled()) return Promise.resolve(null);
    if (request?.signal?.aborted)
      return Promise.reject(textFailure("TEXT_INTERRUPTED"));
    let prepared;
    try {
      prepared = prepareTextRequest(request);
    } catch (error) {
      return Promise.reject(normalizeTextError(error));
    }
    if (active && queue.length >= maxPending)
      return Promise.reject(textFailure("TEXT_QUEUE_FULL"));
    return new Promise((resolve, reject) => {
      const entry = {
        request: prepared,
        signal: request.signal,
        controller: new AbortController(),
        settled: false,
        started: false,
        resolve(value) {
          entry.settled = true;
          resolve(value);
        },
        reject(error) {
          entry.settled = true;
          reject(error);
        },
        cancel(code) {
          if (entry.settled) return;
          entry.controller.abort();
          clearTimeout(entry.queueTimer);
          entry.signal?.removeEventListener("abort", entry.abort);
          if (!entry.started) {
            const index = queue.indexOf(entry);
            if (index >= 0) queue.splice(index, 1);
          }
          entry.reject(textFailure(code));
        },
      };
      entry.abort = () => entry.cancel("TEXT_INTERRUPTED");
      entry.signal?.addEventListener("abort", entry.abort, { once: true });
      entry.queueTimer = setTimeout(
        () => entry.cancel("TEXT_QUEUE_TIMEOUT"),
        queueTimeoutMs,
      );
      queue.push(entry);
      drain();
    });
  }

  async function managedTextStatus() {
    const state = {
      enabled: enabled(),
      provider: "codex-chatgpt",
      ready: false,
      inFlight: active ? 1 : 0,
      pending: queue.length,
      limits: { ...MANAGED_TEXT_LIMITS, maxPending, timeoutMs, queueTimeoutMs },
    };
    if (!state.enabled || stopped) {
      const error = textFailure(stopped ? "TEXT_STOPPED" : "TEXT_DISABLED");
      return { ...state, code: error.code, reason: error.message };
    }
    try {
      const result = await readiness(workerOptions());
      if (stopped) throw textFailure("TEXT_STOPPED");
      if (!enabled()) throw textFailure("TEXT_DISABLED");
      if (result?.ready === true) return { ...state, ready: true };
      throw textFailure(result?.code || "TEXT_WORKER_UNAVAILABLE");
    } catch (error) {
      const safe = normalizeTextError(error);
      return { ...state, code: safe.code, reason: safe.message };
    }
  }

  function stop() {
    stopped = true;
    for (const entry of [...queue]) entry.cancel("TEXT_STOPPED");
    active?.cancel("TEXT_INTERRUPTED");
  }
  return {
    generateManagedText,
    managedTextStatus,
    managedTextReadiness: managedTextStatus,
    stop,
  };
}

const platformTextService = createManagedTextService();
export const generateManagedText = platformTextService.generateManagedText;
export const managedTextStatus = platformTextService.managedTextStatus;
export const managedTextReadiness = platformTextService.managedTextReadiness;
export const stopManagedText = platformTextService.stop;
