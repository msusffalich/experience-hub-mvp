export async function createZip(entries = []) {
  const normalized = [];
  for (const entry of entries) {
    normalized.push({
      name: sanitize(entry.name),
      bytes: new Uint8Array(await entry.blob.arrayBuffer()),
      date: entry.date || new Date(),
    });
  }
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of normalized) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.bytes);
    const { time, date } = dosDateTime(entry.date);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, entry.bytes.length, true);
    local.setUint32(22, entry.bytes.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    localParts.push(local.buffer, nameBytes, entry.bytes);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, time, true);
    central.setUint16(14, date, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, entry.bytes.length, true);
    central.setUint32(24, entry.bytes.length, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint16(30, 0, true);
    central.setUint16(32, 0, true);
    central.setUint16(34, 0, true);
    central.setUint16(36, 0, true);
    central.setUint32(38, 0, true);
    central.setUint32(42, offset, true);
    centralParts.push(central.buffer, nameBytes);
    offset += 30 + nameBytes.length + entry.bytes.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, normalized.length, true);
  end.setUint16(10, normalized.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...localParts, ...centralParts, end.buffer], { type: "application/zip" });
}

// Conserva la estructura de carpetas: el ZIP usa "/" como separador y el
// paquete de Obsidian depende de ella (02_Experiences/, 04_Assets/,
// 05_Generated/). Antes "/" se sustituia por "-" y el archivo salia plano.
// Se sanea cada segmento por separado y se descartan los saltos de directorio.
function sanitize(value) {
  const segments = String(value || "archivo")
    .split(/[/\\]+/)
    .map((segment) => sanitizeSegment(segment))
    .filter((segment) => segment && segment !== "." && segment !== "..");
  return segments.join("/") || "archivo";
}

function sanitizeSegment(value) {
  return String(value || "archivo")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim() || "archivo";
}

function dosDateTime(value) {
  const date = new Date(value);
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

let table;
function crc32(bytes) {
  if (!table) {
    table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      table[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
