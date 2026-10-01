import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { receiveCapture } from "./upload.mjs";
import { validateCaptureHeader } from "./validateCaptureHeader.mjs";

export const capturesRouter = Router();

const captures = new Map();

export function getCapture(id) {
  return captures.get(id) ?? null;
}

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
  try {
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

    captures.set(capture.id, capture);

    return res.status(201).json({
      captureId: capture.id,
      originalName: capture.originalName,
      format: capture.format,
      sizeBytes: capture.sizeBytes,
      createdAt: capture.createdAt
    });
  } catch (error) {
    await removeRejectedFile(req.file?.path);

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

    console.error("Capture upload failed:", error.message);

    return res.status(500).json({
      error: "Could not save the capture."
    });
  }
});