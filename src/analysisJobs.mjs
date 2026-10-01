import { randomUUID } from "node:crypto";
import { analyzeCapture } from "./analyzeCapture.mjs";

const jobs = new Map();
const maxStoredJobs = 20;

let activeJobId = null;

export function createAnalysisJob(capturePath) {
  if (activeJobId !== null) {
    return null;
  }

  while (jobs.size >= maxStoredJobs) {
    const oldestId = jobs.keys().next().value;
    jobs.delete(oldestId);
  }

  const job = {
    id: randomUUID(),
    status: "running",
    createdAt: new Date().toISOString(),
    finishedAt: null,
    result: null,
    error: null
  };

  jobs.set(job.id, job);
  activeJobId = job.id;

  analyzeCapture(capturePath)
    .then((result) => {
      // Keep process diagnostics in server logs.
      if (result.diagnostics) {
        console.warn(`[Analysis ${job.id}]`, result.diagnostics);
      }

      job.result = {
        summary: result.summary,
        preview: result.preview,
        samples: result.samples
      };

      job.status = "completed";
    })
    .catch((error) => {
      console.error(`[Analysis ${job.id}]`, error.message);

      job.status = "failed";
      job.error = "Analysis failed. Check the server logs for details.";
    })
    .finally(() => {
      job.finishedAt = new Date().toISOString();
      activeJobId = null;
    });

  return job;
}

export function getAnalysisJob(id) {
  return jobs.get(id) ?? null;
}