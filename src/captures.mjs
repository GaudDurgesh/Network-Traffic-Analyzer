import { Router } from "express";
import { acquireUploadCapacity } from "./uploadCapacity.mjs";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { receiveCapture } from "./upload.mjs";
import { validateCaptureHeader } from "./validateCaptureHeader.mjs";
import {
  saveCapture,
  getCapture,
  listRecentCaptures,
  prepareCaptureDeletion
} from "./captureStore.mjs";
import { validatePagination } from "./pagination.mjs";
import { isCaptureBeingAnalyzed } from "./analysisJobs.mjs";
import { cleanPendingFile } from "./fileCleanup.mjs";

export { getCapture };

export const capturesRouter = Router();

function receiveFile(req, res) {
  return new Promise((resolve, reject) => {
    receiveCapture(req, res, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function removeRejectedFile(filePath) {
  if (!filePath) return;

  try {
    await unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Could not remove rejected upload:", error.message);
    }
  }
}

capturesRouter.post("/", async (req, res) => {
  let releaseCapacity;

  try {
    releaseCapacity = await acquireUploadCapacity();
    await receiveFile(req, res);

    if (!req.file) {
      return res.status(400).json({
        error: 'Upload one file using the field name "capture".'
      });
    }

    const { format } = await validateCaptureHeader(req.file.path);

    const capture = {
      id: randomUUID(),
      originalName: req.file.originalname,
      format,
      sizeBytes: req.file.size,
      createdAt: new Date().toISOString(),
      filePath: req.file.path
    };

    saveCapture(capture);

    return res.status(201).json({
      captureId: capture.id,
      originalName: capture.originalName,
      format: capture.format,
      sizeBytes: capture.sizeBytes,
      createdAt: capture.createdAt
    });
  } catch (error) {
    await removeRejectedFile(req.file?.path);

    if (error.status === 503 || error.status === 507) {
      if (error.status === 503) {
        res.set("Retry-After", "5");
      }

      return res.status(error.status).json({
        error: error.message
      });
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          error: "Capture files must not exceed 10 MiB."
        });
      }

      return res.status(400).json({
        error: 'Send exactly one file in the "capture" field, with no extra fields.'
      });
    }

    if (error.status === 415) {
      return res.status(415).json({
        error: error.message
      });
    }

    console.error("Capture upload failed:", error);

    return res.status(500).json({
      error: "Could not save the capture."
    });
  } finally {
    releaseCapacity?.();
  }
});

capturesRouter.get("/", validatePagination, (req, res) => {
  const { limit, offset } = res.locals.pagination;

  return res.json({
    captures: listRecentCaptures(limit, offset),
    pagination: { limit, offset }
  });
});

capturesRouter.get("/:id", (req, res) => {
  const capture = getCapture(req.params.id);

  if (capture === null) {
    return res.status(404).json({
      error: "Capture not found."
    });
  }

  return res.json({
    captureId: capture.id,
    originalName: capture.originalName,
    format: capture.format,
    sizeBytes: capture.sizeBytes,
    createdAt: capture.createdAt
  });
});

capturesRouter.delete("/:id", async (req, res, next) => {
  try {
    const captureId = req.params.id;

    if (isCaptureBeingAnalyzed(captureId)) {
      return res.status(409).json({
        error: "This capture is being analyzed. Try again when it finishes."
      });
    }

    const deletion = prepareCaptureDeletion(captureId);

    if (deletion.status === "not_found") {
      return res.status(404).json({
        error: "Capture not found."
      });
    }

    if (deletion.status === "busy") {
      return res.status(409).json({
        error: "This capture has a running analysis."
      });
    }

    try {
      await cleanPendingFile(deletion.storageName);
    } catch (error) {
      console.error("Capture file cleanup failed:", error);

      return res.status(202).json({
        captureId,
        status: "cleanup_pending",
        message: "Capture records deleted; uploaded file cleanup is pending."
      });
    }

    return res.status(204).end();
  } catch (error) {
    next(error);
  }
});