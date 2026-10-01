function requiredNumber(value, name, integer = false) {
  if (value.trim() === "") {
    throw new Error(`Missing ${name}.`);
  }

  const result = Number(value);

  if (
    !Number.isFinite(result) ||
    (integer && !Number.isSafeInteger(result))
  ) {
    throw new Error(`Invalid ${name}: ${value}`);
  }

  return result;
}

function optionalPort(value) {
  if (value === "") return null;

  const port = requiredNumber(value, "port", true);

  if (port < 0 || port > 65535) {
    throw new Error(`Port is outside the valid range: ${value}`);
  }

  return port;
}

export function parsePacketLine(line) {
  const fields = line.split("\t");

  if (fields.length !== 11) {
    throw new Error(`Expected 11 fields, received ${fields.length}.`);
  }

  const [
    number,
    time,
    ipv4Source,
    ipv4Destination,
    ipv6Source,
    ipv6Destination,
    tcpSourcePort,
    tcpDestinationPort,
    udpSourcePort,
    udpDestinationPort,
    length
  ] = fields;

  const packetNumber = requiredNumber(number, "packet number", true);
  const timeSeconds = requiredNumber(time, "timestamp");
  const lengthBytes = requiredNumber(length, "frame length", true);

  if (packetNumber < 1 || lengthBytes < 0) {
    throw new Error("Invalid packet number or frame length.");
  }

  const hasIPv4 = ipv4Source !== "" || ipv4Destination !== "";
  const hasIPv6 = ipv6Source !== "" || ipv6Destination !== "";
  const hasTCP = tcpSourcePort !== "" || tcpDestinationPort !== "";
  const hasUDP = udpSourcePort !== "" || udpDestinationPort !== "";

  return {
    number: packetNumber,
    timeSeconds,

    ipv4Source: ipv4Source || null,
    ipv4Destination: ipv4Destination || null,
    ipv6Source: ipv6Source || null,
    ipv6Destination: ipv6Destination || null,

    networkType:
      hasIPv4 && hasIPv6 ? "Mixed" :
      hasIPv4 ? "IPv4" :
      hasIPv6 ? "IPv6" : "Other",

    transportType:
      hasTCP && hasUDP ? "Mixed" :
      hasTCP ? "TCP" :
      hasUDP ? "UDP" : "Other",

    tcpSourcePort: optionalPort(tcpSourcePort),
    tcpDestinationPort: optionalPort(tcpDestinationPort),
    udpSourcePort: optionalPort(udpSourcePort),
    udpDestinationPort: optionalPort(udpDestinationPort),

    lengthBytes
  };
}