import multer from "multer";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

const uploadDirectory = path.join(
  import.meta.dirname,
  "..",
  "captures",
  "uploads"
);

mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDirectory,

  filename(req, file, callback) {
    callback(null, `${randomUUID()}.capture`);
  }
});

const upload = multer({
  storage,

  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 0,
    parts: 1
  },

  fileFilter(req, file, callback) {
    const extension = path.extname(file.originalname).toLowerCase();

    if (extension !== ".pcap" && extension !== ".pcapng") {
      const error = new Error("Only .pcap and .pcapng files are accepted.");
      error.status = 415;
      callback(error);
      return;
    }

    callback(null, true);
  }
});

export const receiveCapture = upload.single("capture");