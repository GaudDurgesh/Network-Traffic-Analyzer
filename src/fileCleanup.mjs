import path from "node:path";
import { unlink } from "node:fs/promises";
import { db } from "./database.mjs";
import { uploadDirectory } from "./storagePaths.mjs";

const selectPendingDeletion = db.prepare(`
  SELECT storage_name
  FROM pending_file_deletions
  WHERE storage_name = ?
`);

const removePendingDeletion = db.prepare(`
  DELETE FROM pending_file_deletions
  WHERE storage_name = ?
`);

export async function cleanPendingFile(storageName) {
    if (selectPendingDeletion.get(storageName) === undefined) {
        return;
    }

    const validStorageName =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.capture$/i;

    if (!validStorageName.test(storageName)) {
        throw new Error("Invalid stored upload filename.");
    }

    const filePath = path.join(uploadDirectory, storageName);

    try {
        await unlink(filePath);
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
    }

    removePendingDeletion.run(storageName);
}

const selectPendingFiles = db.prepare(`
  SELECT storage_name
  FROM pending_file_deletions
  ORDER BY created_at, storage_name
`);

export async function retryPendingFileDeletions() {
    const pendingFiles = selectPendingFiles.all();
    let removed = 0;
    let failed = 0;

    for (const row of pendingFiles) {
        try {
            await cleanPendingFile(row.storage_name);
            removed++;
        } catch (error) {
            failed++;
            console.error(
                "Pending file cleanup failed:",
                row.storage_name,
                error
            );
        }
    }

    return { removed, failed };
}