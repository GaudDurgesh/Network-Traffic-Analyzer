import path from "node:path";
import { readdir, lstat } from "node:fs/promises";
import { uploadDirectory, maxCaptureBytes } from "./upload.mjs";

const budgetMiB = Number(
  process.env.UPLOAD_STORAGE_LIMIT_MIB ?? "100"
);

const budgetBytes = budgetMiB * 1024 * 1024;

if (
  !Number.isSafeInteger(budgetMiB) ||
  budgetMiB < 10 ||
  !Number.isSafeInteger(budgetBytes)
) {
  throw new Error(
    "UPLOAD_STORAGE_LIMIT_MIB must be a whole number of at least 10."
  );
}

let uploadActive = false;

function capacityError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export async function acquireUploadCapacity() {
  if (uploadActive) {
    throw capacityError(
      "Another upload is in progress. Try again shortly.",
      503
    );
  }

  uploadActive = true;

  try {
    const entries = await readdir(uploadDirectory);
    let usedBytes = 0;

    for (const name of entries) {
      const info = await lstat(path.join(uploadDirectory, name));

      if (!info.isFile()) {
        throw new Error(
          "The upload directory must contain only regular files."
        );
      }

      usedBytes += info.size;
    }

    if (usedBytes > budgetBytes - maxCaptureBytes) {
      throw capacityError(
        "Upload storage budget reached. Free space before uploading again.",
        507
      );
    }

    let released = false;

    return function releaseCapacity() {
      if (released) return;
      released = true;
      uploadActive = false;
    };
  } catch (error) {
    uploadActive = false;
    throw error;
  }
}