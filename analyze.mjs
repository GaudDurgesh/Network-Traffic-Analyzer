import path from "node:path";
import { analyzeCapture } from "./src/analyzeCapture.mjs";

const defaultCapturePath = path.join(
  import.meta.dirname,
  "captures",
  "first-capture.pcapng"
);

const capturePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : defaultCapturePath;

async function main() {
  console.log("Analyzing the capture...\n");

  try {
    const result = await analyzeCapture(capturePath);

    console.log("Packet preview:");
    console.table(result.preview);

    console.log("\nCapture summary:");
    console.log("Total packets:", result.summary.totalPackets);
    console.log("Total frame bytes:", result.summary.totalFrameBytes);
    console.log("Preview packets:", result.preview.length);

    console.log("\nNetwork counts:");
    console.table(result.summary.networkCounts);

    console.log("\nTransport counts:");
    console.table(result.summary.transportCounts);

    console.log("\nFirst IPv6 sample:");
    console.log(result.samples.ipv6 ?? "No IPv6 sample found.");

    console.log("\nFirst UDP sample:");
    console.log(result.samples.udp ?? "No UDP sample found.");

    if (result.diagnostics) {
      console.error("\nTShark diagnostics:", result.diagnostics);
    }
  } catch (error) {
    console.error("Analysis failed:", error.message);
    process.exitCode = 1;
  }
}

main();