import express from "express";
import { requireAuth, requireBrand, requireEditor } from "./core.mjs";
import * as generation from "./media-generation.mjs";

export function createMediaRouter(service = generation) {
  const router = express.Router();
  router.use("/brands/:brandId/media", requireAuth, requireBrand);

  router.get("/brands/:brandId/media", async (req, res) => {
    const capabilities = await service.mediaCapabilities();
    res.json({ capabilities, jobs: service.listMediaJobs(req.brand.id) });
  });

  router.get("/brands/:brandId/media/jobs", (req, res) => {
    res.json({ jobs: service.listMediaJobs(req.brand.id) });
  });

  router.get("/brands/:brandId/media/jobs/:jobId", (req, res) => {
    const job = service.getMediaJob(req.brand.id, req.params.jobId);
    if (!job)
      return res.status(404).json({ error: "No se encontró la creación." });
    res.json(job);
  });

  router.post(
    "/brands/:brandId/media/jobs",
    requireEditor,
    async (req, res) => {
      const job = await service.createMediaJob(
        req.brand.id,
        req.user,
        req.body,
      );
      res.status(202).json(job);
    },
  );

  return router;
}
