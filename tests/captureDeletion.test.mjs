import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  writeFile,
  access,
  rm
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const testRoot = await mkdtemp(
  path.join(os.tmpdir(), "packet-analyzer-test-")
);

const uploadDirectory = path.join(testRoot, "uploads");

process.env.ANALYZER_DATA_DIR = path.join(testRoot, "data");
process.env.ANALYZER_UPLOAD_DIR = uploadDirectory;

await mkdir(uploadDirectory, { recursive: true });

// Import only after configuring isolated storage.
const { db } = await import("../src/database.mjs");

const {
  saveCapture,
  getCapture,
  prepareCaptureDeletion
} = await import("../src/captureStore.mjs");

const {
  cleanPendingFile,
  retryPendingFileDeletions
} = await import("../src/fileCleanup.mjs");

after(async () => {
  db.close();
  await rm(testRoot, { recursive: true, force: true });
});

async function createCapture() {
  const id = randomUUID();
  const storageName = `${randomUUID()}.capture`;
  const filePath = path.join(uploadDirectory, storageName);

  await writeFile(filePath, "test");

  saveCapture({
    id,
    originalName: "test.pcap",
    format: "pcap",
    sizeBytes: 4,
    createdAt: new Date().toISOString(),
    filePath
  });

  return { id, storageName, filePath };
}

function createJob(captureId, status) {
  const id = randomUUID();

  db.prepare(`
    INSERT INTO analysis_jobs (
      id, capture_id, status, created_at
    ) VALUES (?, ?, ?, ?)
  `).run(id, captureId, status, new Date().toISOString());

  return id;
}

function pendingDeletion(storageName) {
  return db.prepare(`
    SELECT storage_name
    FROM pending_file_deletions
    WHERE storage_name = ?
  `).get(storageName);
}

test("refuses deletion when a saved analysis is running", async () => {
  const capture = await createCapture();
  const jobId = createJob(capture.id, "running");

  assert.deepEqual(
    prepareCaptureDeletion(capture.id),
    { status: "busy" }
  );

  assert.notEqual(getCapture(capture.id), null);
  assert.equal(pendingDeletion(capture.storageName), undefined);

  const job = db.prepare(`
    SELECT status FROM analysis_jobs WHERE id = ?
  `).get(jobId);

  assert.equal(job.status, "running");
  await access(capture.filePath);
});

test("deletes capture and history, then removes its file", async () => {
  const capture = await createCapture();
  const jobId = createJob(capture.id, "completed");

  assert.deepEqual(prepareCaptureDeletion(capture.id), {
    status: "prepared",
    storageName: capture.storageName
  });

  assert.equal(getCapture(capture.id), null);

  assert.equal(
    db.prepare("SELECT id FROM analysis_jobs WHERE id = ?").get(jobId),
    undefined
  );

  assert.notEqual(pendingDeletion(capture.storageName), undefined);

  // File removal happens after the database transaction.
  await access(capture.filePath);
  await cleanPendingFile(capture.storageName);

  await assert.rejects(access(capture.filePath), { code: "ENOENT" });
  assert.equal(pendingDeletion(capture.storageName), undefined);

  assert.deepEqual(
    prepareCaptureDeletion(capture.id),
    { status: "not_found" }
  );
});

test("keeps failed cleanup pending and retries successfully", async () => {
  const capture = await createCapture();

  prepareCaptureDeletion(capture.id);

  // A directory at this path makes unlink fail on Windows and Linux.
  await rm(capture.filePath);
  await mkdir(capture.filePath);

  await assert.rejects(cleanPendingFile(capture.storageName));

  assert.notEqual(pendingDeletion(capture.storageName), undefined);

  // Remove the obstruction and restore a file for the retry.
  await rm(capture.filePath, { recursive: true });
  await writeFile(capture.filePath, "test");

  const result = await retryPendingFileDeletions();

  assert.deepEqual(result, { removed: 1, failed: 0 });
  assert.equal(pendingDeletion(capture.storageName), undefined);
  await assert.rejects(access(capture.filePath), { code: "ENOENT" });
});