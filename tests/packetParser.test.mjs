import test from "node:test";
import assert from "node:assert/strict";
import { parsePacketLine } from "../src/packetParser.mjs";

function makeRow(changes = {}) {
  const fields = [
    "1", "0",
    "192.0.2.10", "198.51.100.20",
    "", "",
    "50000", "443",
    "", "",
    "125"
  ];

  for (const [index, value] of Object.entries(changes)) {
    fields[Number(index)] = value;
  }

  return fields.join("\t");
}

test("reads IPv4 TCP fields as numbers and addresses", () => {
  const packet = parsePacketLine(makeRow());

  assert.equal(packet.networkType, "IPv4");
  assert.equal(packet.transportType, "TCP");
  assert.equal(packet.ipv4Source, "192.0.2.10");
  assert.equal(packet.tcpDestinationPort, 443);
  assert.equal(packet.lengthBytes, 125);
  assert.equal(packet.ipv6Source, null);
  assert.equal(packet.udpSourcePort, null);
});

test("reads IPv6 UDP fields", () => {
  const packet = parsePacketLine(makeRow({
    2: "",
    3: "",
    4: "2001:db8::1",
    5: "2001:db8::2",
    6: "",
    7: "",
    8: "53000",
    9: "53"
  }));

  assert.equal(packet.networkType, "IPv6");
  assert.equal(packet.transportType, "UDP");
  assert.equal(packet.ipv6Source, "2001:db8::1");
  assert.equal(packet.ipv6Destination, "2001:db8::2");
  assert.equal(packet.udpDestinationPort, 53);
  assert.equal(packet.tcpSourcePort, null);
});

test("keeps missing ports null but preserves port zero", () => {
  const packet = parsePacketLine(makeRow({ 6: "0" }));

  assert.equal(packet.tcpSourcePort, 0);
  assert.equal(packet.udpSourcePort, null);
});

test("handles a frame without IP or TCP/UDP fields", () => {
  const packet = parsePacketLine(makeRow({
    2: "", 3: "", 6: "", 7: ""
  }));

  assert.equal(packet.networkType, "Other");
  assert.equal(packet.transportType, "Other");
  assert.equal(packet.ipv4Source, null);
});

test("rejects an incomplete row", () => {
  assert.throws(() => parsePacketLine("1\t0"), /Expected 11 fields/);
});

test("rejects missing or invalid required numbers", () => {
  for (const changes of [
    { 0: "" },
    { 0: "0" },
    { 1: "" },
    { 1: "NaN" },
    { 10: "" },
    { 10: "-1" },
    { 10: "12.5" }
  ]) {
    assert.throws(() => parsePacketLine(makeRow(changes)));
  }
});

test("rejects invalid ports", () => {
  for (const port of ["-1", "65536", "abc", "80.5"]) {
    assert.throws(() => parsePacketLine(makeRow({ 6: port })));
  }
});