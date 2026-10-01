import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");

function resolveDirectory(variableName, fallback) {
  const value = process.env[variableName];

  if (value === undefined) {
    return fallback;
  }

  if (value.trim() === "") {
    throw new Error(`${variableName} must not be empty.`);
  }

  return path.resolve(value);
}

export const dataDirectory = resolveDirectory(
  "ANALYZER_DATA_DIR",
  path.join(projectRoot, "data")
);

export const uploadDirectory = resolveDirectory(
  "ANALYZER_UPLOAD_DIR",
  path.join(projectRoot, "captures", "uploads")
);

export const databasePath = path.join(
  dataDirectory,
  "analyzer.sqlite"
);