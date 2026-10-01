import path from "node:path";
import { db } from "./database.mjs";

const uploadDirectory = path.join(
    import.meta.dirname,
    "..",
    "captures",
    "uploads"
);

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