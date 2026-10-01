import { db } from "./database.mjs";

const insertJob = db.prepare(`
  INSERT INTO analysis_jobs (
    id, capture_id, status, created_at
  ) VALUES (?, ?, 'running', ?)
`);

const selectJob = db.prepare(`
  SELECT * FROM analysis_jobs WHERE id = ?
`);

const completeJob = db.prepare(`
  UPDATE analysis_jobs
  SET status = 'completed',
      finished_at = ?,
      result_json = ?,
      error = NULL
  WHERE id = ? AND status = 'running'
`);

const failJob = db.prepare(`
  UPDATE analysis_jobs
  SET status = 'failed',
      finished_at = ?,
      result_json = NULL,
      error = ?
  WHERE id = ? AND status = 'running'
`);

const recoverJobs = db.prepare(`
  UPDATE analysis_jobs
  SET status = 'failed',
      finished_at = ?,
      result_json = NULL,
      error = 'Analysis was interrupted by a server restart.'
  WHERE status = 'running'
`);

const selectRecentJobs = db.prepare(`
  SELECT
    id,
    capture_id AS captureId,
    status,
    created_at AS createdAt,
    finished_at AS finishedAt,
    error
  FROM analysis_jobs
  ORDER BY created_at DESC, id DESC
  LIMIT ? OFFSET ?
`);

export function listRecentAnalysisJobs(limit = 20, offset = 0) {
  return selectRecentJobs.all(limit, offset);
}

export function saveAnalysisJob(job) {
  insertJob.run(job.id, job.captureId, job.createdAt);
}

export function completeAnalysisJob(id, result) {
  completeJob.run(
    new Date().toISOString(),
    JSON.stringify(result),
    id
  );
}

export function failAnalysisJob(id, message) {
  failJob.run(new Date().toISOString(), message, id);
}

export function recoverInterruptedJobs() {
  return recoverJobs.run(new Date().toISOString()).changes;
}

export function findAnalysisJob(id) {
  const row = selectJob.get(id);

  if (row === undefined) {
    return null;
  }

  return {
    id: row.id,
    captureId: row.capture_id,
    status: row.status,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    result: row.result_json === null
      ? null
      : JSON.parse(row.result_json),
    error: row.error
  };
}