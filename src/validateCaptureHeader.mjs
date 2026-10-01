import { open } from "node:fs/promises";

function invalidCapture(message) {
  const error = new Error(message);
  error.status = 415;
  return error;
}

export async function validateCaptureHeader(filePath) {
  const file = await open(filePath, "r");

  try {
    const stats = await file.stat();

    if (!stats.isFile() || stats.size < 24) {
      throw invalidCapture("The capture file is empty or too short.");
    }

    const header = Buffer.alloc(24);
    let offset = 0;

    while (offset < header.length) {
      const { bytesRead } = await file.read(
        header,
        offset,
        header.length - offset,
        offset
      );

      if (bytesRead === 0) {
        throw invalidCapture("The capture header is incomplete.");
      }

      offset += bytesRead;
    }

    const signature = header.subarray(0, 4).toString("hex");

    const pcapSignatures = new Set([
      "d4c3b2a1",
      "a1b2c3d4",
      "4d3cb2a1",
      "a1b23c4d"
    ]);

    if (pcapSignatures.has(signature)) {
      const littleEndian =
        signature === "d4c3b2a1" || signature === "4d3cb2a1";

      const major = littleEndian
        ? header.readUInt16LE(4)
        : header.readUInt16BE(4);

      const minor = littleEndian
        ? header.readUInt16LE(6)
        : header.readUInt16BE(6);

      const snapLength = littleEndian
        ? header.readUInt32LE(16)
        : header.readUInt32BE(16);

      if (major !== 2 || minor !== 4 || snapLength === 0) {
        throw invalidCapture("Unsupported or invalid PCAP header.");
      }

      return { format: "pcap" };
    }

    if (signature === "0a0d0d0a") {
      const byteOrder = header.subarray(8, 12).toString("hex");

      if (byteOrder !== "4d3c2b1a" && byteOrder !== "1a2b3c4d") {
        throw invalidCapture("Invalid PCAPNG byte-order marker.");
      }

      const littleEndian = byteOrder === "4d3c2b1a";

      const blockLength = littleEndian
        ? header.readUInt32LE(4)
        : header.readUInt32BE(4);

      if (
        blockLength < 28 ||
        blockLength % 4 !== 0 ||
        blockLength > stats.size
      ) {
        throw invalidCapture("Invalid PCAPNG section-header length.");
      }

      return { format: "pcapng" };
    }

    throw invalidCapture("The file is not a supported PCAP or PCAPNG capture.");
  } finally {
    await file.close();
  }
}