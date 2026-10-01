import { existsSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { parsePacketLine } from "./packetParser.mjs";

const tsharkPath =
  process.env.TSHARK_PATH ||
  (process.platform === "win32"
    ? "C:\\Program Files\\Wireshark\\tshark.exe"
    : "/usr/bin/tshark");

    
const timeoutMs = 60_000;
const previewLimit = 10;

export async function analyzeCapture(capturePath) {
  if (!existsSync(tsharkPath)) {
    throw new Error("TShark was not found. Check its installation path.");
  }

  if (!existsSync(capturePath)) {
    throw new Error(`Capture file was not found: ${capturePath}`);
  }

  if (!statSync(capturePath).isFile()) {
    throw new Error("The capture path must point to a file.");
  }

  const fields = [
    "frame.number",
    "frame.time_relative",
    "ip.src",
    "ip.dst",
    "ipv6.src",
    "ipv6.dst",
    "tcp.srcport",
    "tcp.dstport",
    "udp.srcport",
    "udp.dstport",
    "frame.len"
  ];

  const args = [
    "-r", capturePath,
    "-n",
    "-T", "fields",
    "-E", "header=n",
    "-E", "separator=/t",
    "-E", "quote=n",
    "-E", "occurrence=f",
    ...fields.flatMap((field) => ["-e", field])
  ];

  return new Promise((resolve, reject) => {
    const summary = {
      totalPackets: 0,
      totalFrameBytes: 0,
      networkCounts: { IPv4: 0, IPv6: 0, Mixed: 0, Other: 0 },
      transportCounts: { TCP: 0, UDP: 0, Mixed: 0, Other: 0 }
    };

    const packets = [];
    const samples = { ipv6: null, udp: null };

    let failure = null;
    let diagnostics = "";

    const tshark = spawn(tsharkPath, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    function stopWithError(error) {
      if (failure !== null) return;

      failure = error;
      tshark.kill();
    }

    const timeout = setTimeout(() => {
      stopWithError(
        new Error(`Analysis exceeded ${timeoutMs / 1000} seconds.`)
      );
    }, timeoutMs);

    const lines = createInterface({
      input: tshark.stdout,
      crlfDelay: Infinity
    });

    tshark.stderr.setEncoding("utf8");

    tshark.stderr.on("data", (chunk) => {
      diagnostics = (diagnostics + chunk).slice(-4096);
    });

    lines.on("line", (line) => {
      if (failure !== null || line.length === 0) return;

      let packet;

      try {
        packet = parsePacketLine(line);
      } catch (error) {
        stopWithError(
          new Error(`Packet parsing failed: ${error.message}`)
        );
        return;
      }

      summary.totalPackets++;
      summary.totalFrameBytes += packet.lengthBytes;
      summary.networkCounts[packet.networkType]++;
      summary.transportCounts[packet.transportType]++;

      if (
        samples.ipv6 === null &&
        (packet.ipv6Source !== null || packet.ipv6Destination !== null)
      ) {
        samples.ipv6 = packet;
      }

      if (
        samples.udp === null &&
        (packet.udpSourcePort !== null || packet.udpDestinationPort !== null)
      ) {
        samples.udp = packet;
      }

      if (packets.length < previewLimit) {
        packets.push(packet);
      }
    });

    tshark.on("error", (error) => {
      failure ??= new Error(`TShark process error: ${error.message}`);
      clearTimeout(timeout);
      reject(failure);
    });

    tshark.on("close", (code, signal) => {
      clearTimeout(timeout);

      if (failure !== null) {
        reject(failure);
        return;
      }

      if (code !== 0) {
        const reason = signal
          ? `terminated by ${signal}`
          : `exit code ${code}`;

        reject(
          new Error(
            `TShark failed (${reason}). ${diagnostics.trim()}`
          )
        );
        return;
      }

      resolve({
        summary,
        preview: packets,
        samples,
        diagnostics: diagnostics.trim()
      });
    });
  });
}