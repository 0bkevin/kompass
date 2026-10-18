import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createApp } from "./index.mjs";
import { startDiscoveryScheduler } from "./intelligence.mjs";
import { createStartMiddleware } from "./start-adapter.mjs";
import { recoverMediaJobs, stopMediaJobs } from "./media-generation.mjs";
import { startSocialSyncScheduler } from "./social-sync.mjs";
import { stopManagedText } from "./managed-text.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export async function loadStartBuild({ root = projectRoot } = {}) {
  const clientDirectory = path.join(root, "dist", "client");
  const serverEntryPath = path.join(root, "dist", "server", "server.js");

  try {
    await fs.access(clientDirectory);
    await fs.access(serverEntryPath);
  } catch {
    throw new Error(
      `TanStack Start production output is missing. Expected ${serverEntryPath} and ${clientDirectory}; run npm run build before npm start.`,
    );
  }

  let serverModule;
  try {
    serverModule = await import(pathToFileURL(serverEntryPath).href);
  } catch (cause) {
    throw new Error(
      `Could not load TanStack Start server output at ${serverEntryPath}. Run npm run build and check the build error.`,
      { cause },
    );
  }

  if (typeof serverModule.default?.fetch !== "function") {
    throw new Error(
      `TanStack Start server output at ${serverEntryPath} does not export a default fetch handler. Run npm run build with the configured Start Vite plugin.`,
    );
  }

  return { serverEntry: serverModule.default, clientDirectory };
}

export async function startProductionServer({
  port = Number(process.env.PORT || 3001),
  host = process.env.HOST || "0.0.0.0",
  root = projectRoot,
} = {}) {
  if (process.env.RADAR_API_ONLY === "1") {
    throw new Error(
      "RADAR_API_ONLY=1 is for the development API process; use npm start to serve the production Start build.",
    );
  }

  const { serverEntry, clientDirectory } = await loadStartBuild({ root });
  const app = createApp({
    webHandler: createStartMiddleware(serverEntry),
    staticDirectory: clientDirectory,
  });
  const server = http.createServer(app);

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const discovery = startDiscoveryScheduler();
  const socialSync = startSocialSyncScheduler();
  void Promise.resolve()
    .then(() => recoverMediaJobs())
    .catch(() => {
      console.error("No se pudo recuperar la cola de creación multimedia.");
    });
  console.log(`kompass escuchando en http://localhost:${port}`);

  let shuttingDown = false;
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      discovery.stop();
      socialSync.stop();
      stopManagedText();
      void stopMediaJobs().finally(() => {
        server.close(() => process.exit(0));
      });
    });
  }

  return { server, discovery, socialSync };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  startProductionServer().catch((error) => {
    console.error(`[kompass] ${error.message}`);
    process.exitCode = 1;
  });
}
