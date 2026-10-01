import { randomUUID } from "node:crypto";
import { analyzeCapture } from "./analyzeCapture.mjs";
import {
  saveAnalysisJob,
  completeAnalysisJob,
  failAnalysisJob,
  findAnalysisJob
} from "./analysisJobStore.mjs";

let activeJobId = null;
let activeCaptureId = null;

export function createAnalysisJob(capturePath, captureId) {
  if (activeJobId !== null) {
    return null;
  }

  const job = {
    id: randomUUID(),
    captureId,
    status: "running",
    createdAt: new Date().toISOString(),
    finishedAt: null,
    result: null,
    error: null
  };

  saveAnalysisJob(job);
  activeJobId = job.id;
  activeCaptureId = captureId;

  void runAnalysis(job.id, capturePath);

  return job;
}

async function runAnalysis(jobId, capturePath) {
  try {
    const result = await analyzeCapture(capturePath);

    if (result.diagnostics) {
      console.warn(`[Analysis ${jobId}]`, result.diagnostics);
    }

    completeAnalysisJob(jobId, {
      summary: result.summary,
      preview: result.preview,
      samples: result.samples
    });
  } catch (error) {
    console.error(`[Analysis ${jobId}]`, error);

    try {
      failAnalysisJob(
        jobId,
        "Analysis failed. Check the server logs for details."
      );
    } catch (storageError) {
      console.error(
        `[Analysis ${jobId}] Could not save failure status:`,
        storageError
      );
    }
  } finally {
    activeJobId = null;
    activeCaptureId = null;
  }
}

export function getAnalysisJob(id) {
  return findAnalysisJob(id);
}

export function isCaptureBeingAnalyzed(captureId) {
  return activeCaptureId === captureId;
}