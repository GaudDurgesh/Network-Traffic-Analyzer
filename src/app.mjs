import express from "express";
import path from "node:path";
import {
  createAnalysisJob,
  getAnalysisJob
} from "./analysisJobs.mjs";
import { capturesRouter } from "./captures.mjs";



const app = express();

app.disable("x-powered-by");

const sampleCapturePath = path.join(
  import.meta.dirname,
  "..",
  "captures",
  "first-capture.pcapng"
);

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "network-traffic-analyzer"
  });
});

app.post("/api/analyses", (req, res) => {
  const job = createAnalysisJob(sampleCapturePath);

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

export default app;