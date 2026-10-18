import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCoreRouter } from "./core.mjs";
import { createSocialRouter } from "./social.mjs";
import { createVideoAnalysisRouter } from "./video-analysis.mjs";
import {
  createIntelligenceRouter,
  startDiscoveryScheduler,
} from "./intelligence.mjs";
import { checkOrigin } from "./auth.mjs";
import { createCompanyContextRouter } from "./company-context.mjs";
import { createAudienceInsightsRouter } from "./audience-insights.mjs";
import { createCommunityRouter } from "./community.mjs";
import { createOpportunityAnalysisRouter } from "./opportunity-analysis.mjs";
import { createGoogleAuthRouter } from "./google-auth.mjs";
import { createMediaRouter } from "./media-router.mjs";
import { createEditorialEvidenceRouter } from "./editorial-evidence.mjs";
import { createOpportunityFeedbackRouter } from "./opportunity-feedback.mjs";
import { createPilotEvaluationRouter } from "./pilot-evaluation.mjs";
import { createResearchReportRouter } from "./research-report.mjs";
import { recoverMediaJobs, stopMediaJobs } from "./media-generation.mjs";
import {
  createSocialSyncRouter,
  startSocialSyncScheduler,
} from "./social-sync.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export function createApp({
  webHandler,
  staticDirectory,
  apiOnly = process.env.RADAR_API_ONLY === "1",
  googleAuth,
  mediaGeneration,
} = {}) {
  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.use((_req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "DENY",
    });
    next();
  });
  app.use("/api", checkOrigin, express.json({ limit: "2mb" }));
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api", createGoogleAuthRouter(googleAuth));
  app.use("/api", createMediaRouter(mediaGeneration));
  app.use("/api", createSocialSyncRouter());
  app.use("/api", createCoreRouter());
  app.use("/api", createIntelligenceRouter());
  app.use("/api", createSocialRouter());
  app.use("/api", createVideoAnalysisRouter());
  app.use("/api", createCompanyContextRouter());
  app.use("/api", createAudienceInsightsRouter());
  app.use("/api", createCommunityRouter());
  app.use("/api", createOpportunityAnalysisRouter());
  app.use("/api", createEditorialEvidenceRouter());
  app.use("/api", createOpportunityFeedbackRouter());
  app.use("/api", createPilotEvaluationRouter());
  app.use("/api", createResearchReportRouter());
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "La ruta de API no existe." }),
  );
  const dist = path.join(projectRoot, "dist");
  if (apiOnly) {
    app.get("/{*splat}", (_req, res) =>
      res
        .status(200)
        .send("kompass API está activa. Inicia la interfaz con npm run dev."),
    );
  } else if (webHandler) {
    if (staticDirectory) {
      // Let Start handle directory paths so its trailing-slash normalization
      // cannot loop with express.static's directory redirect.
      app.use(
        express.static(staticDirectory, { index: false, redirect: false }),
      );
    }
    app.use(webHandler);
  } else if (fs.existsSync(path.join(dist, "index.html"))) {
    // Keep the legacy static fallback available to callers that still use
    // createApp() directly. Production Start serving is mounted explicitly by
    // server/start-host.mjs, while the dev API process opts out with
    // RADAR_API_ONLY=1 above so it cannot serve an old build.
    app.use(express.static(dist, { index: false }));
    app.get("/{*splat}", (_req, res) =>
      res.sendFile("index.html", { root: dist }),
    );
  } else {
    app.get("/{*splat}", (_req, res) =>
      res
        .status(200)
        .send("kompass API está activa. Inicia la interfaz con npm run dev."),
    );
  }
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    if (error.name === "MulterError")
      return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
        error:
          error.code === "LIMIT_FILE_SIZE"
            ? "El archivo supera el máximo de 50 MB."
            : "No se pudo subir el archivo. Usa un único campo file.",
      });
    if (error.type === "entity.too.large")
      return res
        .status(413)
        .json({ error: "La solicitud supera el tamaño permitido." });
    if (error.type === "entity.parse.failed")
      return res.status(400).json({ error: "El JSON enviado no es válido." });
    if (error.code === "ENOSPC")
      return res.status(507).json({
        error: "El servidor no dispone de espacio para guardar el archivo.",
      });
    const status =
      Number.isInteger(error.status) &&
      error.status >= 400 &&
      error.status <= 599
        ? error.status
        : 500;
    if (status >= 500) console.error("[kompass]", error.message);
    res.status(status).json({
      error:
        status === 500
          ? "Ocurrió un error interno. Intenta de nuevo."
          : error.message,
    });
  });
  return app;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT || 3001);
  const server = createApp().listen(port, process.env.HOST || "0.0.0.0");
  const discovery = startDiscoveryScheduler();
  const socialSync = startSocialSyncScheduler();
  void Promise.resolve()
    .then(() => recoverMediaJobs())
    .catch(() => {
      console.error("No se pudo recuperar la cola de creación multimedia.");
    });
  server.once("listening", () =>
    console.log(`kompass API escuchando en http://localhost:${port}`),
  );
  server.once("error", (error) => {
    discovery.stop();
    socialSync.stop();
    console.error(
      `No se pudo abrir el puerto ${port} (${error.code || "error"}). Configura PORT y RADAR_API_PORT con un puerto disponible.`,
    );
    process.exitCode = 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      discovery.stop();
      socialSync.stop();
      void stopMediaJobs().finally(() => {
        server.close(() => process.exit(0));
      });
    });
}
