import express from "express";
import {
  createAnalysisJob,
  getAnalysisJob
} from "./analysisJobs.mjs";
import { capturesRouter, getCapture } from "./captures.mjs";
import { listRecentAnalysisJobs } from "./analysisJobStore.mjs";
import { validatePagination } from "./pagination.mjs";

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "network-traffic-analyzer"
  });
});

app.post("/api/analyses", (req, res) => {
  const captureId = req.body?.captureId;

  if (typeof captureId !== "string" || captureId.trim() === "") {
    return res.status(400).json({
      error: "Provide a captureId returned by the upload API."
    });
  }

  const capture = getCapture(captureId);

  if (capture === null) {
    return res.status(404).json({
      error: "Capture not found. Upload the file again."
    });
  }

  const job = createAnalysisJob(capture.filePath, capture.id);

  if (job === null) {
    res.set("Retry-After", "5");

    return res.status(503).json({
      error: "An analysis is already running. Try again shortly."
    });
  }

  const statusUrl = `/api/analyses/${job.id}`;

  res.location(statusUrl);

  return res.status(202).json({
    jobId: job.id,
    status: job.status,
    statusUrl
  });
});

app.get("/api/analyses", validatePagination, (req, res) => {
  const { limit, offset } = res.locals.pagination;

  return res.json({
    jobs: listRecentAnalysisJobs(limit, offset),
    pagination: { limit, offset }
  });
});

app.get("/api/analyses/:id", (req, res) => {
  const job = getAnalysisJob(req.params.id);

  if (job === null) {
    return res.status(404).json({
      error: "Analysis job not found"
    });
  }

  return res.json(job);
});

app.use("/api/captures", capturesRouter);

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found"
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      error: "Invalid JSON request body."
    });
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({
      error: "Request body is too large."
    });
  }

  console.error("Request failed:", error);

  return res.status(500).json({
    error: "An unexpected server error occurred."
  });
});

export default app;