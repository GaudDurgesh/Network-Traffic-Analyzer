import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dataDirectory = path.join(import.meta.dirname, "..", "data");

mkdirSync(dataDirectory, { recursive: true });

const databasePath = path.join(dataDirectory, "analyzer.sqlite");

export const db = new DatabaseSync(databasePath);

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS captures (
    id TEXT PRIMARY KEY NOT NULL,
    original_name TEXT NOT NULL,
    format TEXT NOT NULL CHECK (format IN ('pcap', 'pcapng')),
    size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
    storage_name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS analysis_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  capture_id TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('running', 'completed', 'failed')),
  created_at TEXT NOT NULL,
  finished_at TEXT,
  result_json TEXT,
  error TEXT,
  FOREIGN KEY (capture_id) REFERENCES captures(id)
);

`);

