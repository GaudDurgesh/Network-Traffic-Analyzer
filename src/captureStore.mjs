import path from "node:path";
import { db } from "./database.mjs";
import { uploadDirectory } from "./storagePaths.mjs";

const insertCapture = db.prepare(`
  INSERT INTO captures (
    id,
    original_name,
    format,
    size_bytes,
    storage_name,
    created_at
  ) VALUES (?, ?, ?, ?, ?, ?)
`);

const selectCapture = db.prepare(`
  SELECT
    id,
    original_name,
    format,
    size_bytes,
    storage_name,
    created_at
  FROM captures
  WHERE id = ?
`);

const selectRecentCaptures = db.prepare(`
  SELECT
    id AS captureId,
    original_name AS originalName,
    format,
    size_bytes AS sizeBytes,
    created_at AS createdAt
  FROM captures
  ORDER BY created_at DESC, id DESC
  LIMIT ? OFFSET ?
`);

export function listRecentCaptures(limit = 20, offset = 0) {
    return selectRecentCaptures.all(limit, offset);
}

export function saveCapture(capture) {
    insertCapture.run(
        capture.id,
        capture.originalName,
        capture.format,
        capture.sizeBytes,
        path.basename(capture.filePath),
        capture.createdAt
    );
}

export function getCapture(id) {
    const row = selectCapture.get(id);

    if (row === undefined) {
        return null;
    }

    return {
        id: row.id,
        originalName: row.original_name,
        format: row.format,
        sizeBytes: row.size_bytes,
        createdAt: row.created_at,
        filePath: path.join(uploadDirectory, row.storage_name)
    };
}

const selectRunningAnalysis = db.prepare(`
  SELECT id
  FROM analysis_jobs
  WHERE capture_id = ? AND status = 'running'
  LIMIT 1
`);

const queueFileDeletion = db.prepare(`
  INSERT INTO pending_file_deletions (storage_name, created_at)
  VALUES (?, ?)
`);

const deleteCaptureJobs = db.prepare(`
  DELETE FROM analysis_jobs WHERE capture_id = ?
`);

const deleteCaptureRecord = db.prepare(`
  DELETE FROM captures WHERE id = ?
`);

export function prepareCaptureDeletion(id) {
  db.exec("BEGIN IMMEDIATE");

  try {
    const capture = selectCapture.get(id);

    if (capture === undefined) {
      db.exec("ROLLBACK");
      return { status: "not_found" };
    }

    if (selectRunningAnalysis.get(id) !== undefined) {
      db.exec("ROLLBACK");
      return { status: "busy" };
    }

    queueFileDeletion.run(
      capture.storage_name,
      new Date().toISOString()
    );

    deleteCaptureJobs.run(id);
    deleteCaptureRecord.run(id);

    db.exec("COMMIT");

    return {
      status: "prepared",
      storageName: capture.storage_name
    };
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch (rollbackError) {
      console.error("Deletion rollback failed:", rollbackError);
    }

    throw error;
  }
}