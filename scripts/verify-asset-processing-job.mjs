import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";

const port = 5199;
const baseUrl = `http://127.0.0.1:${port}/api`;

const server = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(port),
    NODE_ENV: "test",
    STORAGE_ADAPTER: "json-file",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
server.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForHealth() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // Wait for the server to accept connections.
    }
    await sleep(150);
  }
  throw new Error(`server_did_not_start: ${output.slice(-1000)}`);
}

async function fetchJson(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`invalid_json_${response.status}: ${text.slice(0, 400)}`);
  }
  if (!response.ok) {
    throw new Error(`${pathname}_${response.status}: ${payload.error || payload.message || text}`);
  }
  return payload;
}

async function waitForJob(jobId) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const payload = await fetchJson("/jobs");
    const job = payload.jobs?.find((item) => item.id === jobId);
    if (job?.status === "completed") return job;
    if (job?.status === "failed") throw new Error(`job_failed: ${job.error || "unknown"}`);
    await sleep(150);
  }
  throw new Error(`job_timeout:${jobId}`);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUInt16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function writeUInt32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function createStoredZip(entries = {}) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name, "utf8");
    const data = Buffer.isBuffer(content) ? content : Buffer.from(String(content), "utf8");
    const crc = crc32(data);
    const localHeader = Buffer.concat([
      writeUInt32(0x04034b50),
      writeUInt16(20),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt32(crc),
      writeUInt32(data.length),
      writeUInt32(data.length),
      writeUInt16(nameBytes.length),
      writeUInt16(0),
      nameBytes,
    ]);
    localParts.push(localHeader, data);
    centralParts.push(Buffer.concat([
      writeUInt32(0x02014b50),
      writeUInt16(20),
      writeUInt16(20),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt32(crc),
      writeUInt32(data.length),
      writeUInt32(data.length),
      writeUInt16(nameBytes.length),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt32(0),
      writeUInt32(offset),
      nameBytes,
    ]));
    offset += localHeader.length + data.length;
  }
  const central = Buffer.concat(centralParts);
  return Buffer.concat([
    ...localParts,
    central,
    writeUInt32(0x06054b50),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(Object.keys(entries).length),
    writeUInt16(Object.keys(entries).length),
    writeUInt32(central.length),
    writeUInt32(offset),
    writeUInt16(0),
  ]);
}

try {
  await waitForHealth();
  const queued = await fetchJson("/jobs/asset-processing", {
    method: "POST",
    body: JSON.stringify({
      reason: "verification",
      asset: {
        name: "asset-processing-selftest.txt",
        type: "text/plain",
        kind: "document",
        dataUrl: "data:text/plain;charset=utf-8,Texto%20de%20prueba%20para%20procesamiento%20automatico.",
      },
    }),
  });
  if (!queued.jobId) throw new Error("job_id_missing");
  const job = await waitForJob(queued.jobId);
  const text = String(job.result?.extractedText || "");
  if (!text.includes("Texto de prueba")) {
    throw new Error(`processed_text_missing:${text}`);
  }

  const appleHealthXml = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="es_ES">
  <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Apple Watch" unit="count" startDate="2026-06-05 08:00:00 -0400" endDate="2026-06-05 09:00:00 -0400" value="1200"/>
  <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Apple Watch" unit="count/min" startDate="2026-06-05 08:30:00 -0400" endDate="2026-06-05 08:31:00 -0400" value="72"/>
  <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" sourceName="Apple Watch" unit="kcal" startDate="2026-06-05 08:00:00 -0400" endDate="2026-06-05 09:00:00 -0400" value="180"/>
</HealthData>`;
  const zip = createStoredZip({ "apple_health_export/export.xml": appleHealthXml });
  const zipQueued = await fetchJson("/jobs/asset-processing", {
    method: "POST",
    body: JSON.stringify({
      reason: "verification-apple-health-zip",
      asset: {
        id: "apple-health-zip-selftest",
        name: "export.zip",
        type: "application/zip",
        kind: "document",
        size: zip.length,
        sourceType: "biometric",
        dataUrl: `data:application/zip;base64,${zip.toString("base64")}`,
        metadata: {
          payloadType: "biometric_archive",
          originalArchive: true,
          processingIntent: "biometric_time_context",
        },
      },
    }),
  });
  if (!zipQueued.jobId) throw new Error("apple_health_zip_job_id_missing");
  const zipJob = await waitForJob(zipQueued.jobId);
  if (zipJob.result?.processingStatus !== "processed") {
    throw new Error(`apple_health_zip_not_processed:${zipJob.result?.processingStatus}`);
  }
  if (zipJob.result?.extractionMethod !== "server-apple-health-zip-extraction") {
    throw new Error(`apple_health_zip_wrong_method:${zipJob.result?.extractionMethod}`);
  }
  if (!String(zipJob.result?.extractedText || "").includes("Importacion Apple Health desde ZIP")) {
    throw new Error(`apple_health_zip_text_missing:${zipJob.result?.extractedText}`);
  }
  if (zipJob.result?.biometricImport?.recordCount !== 3) {
    throw new Error(`apple_health_zip_record_count_wrong:${zipJob.result?.biometricImport?.recordCount}`);
  }
  if (!zipJob.result?.biometricImport?.metricNames?.includes("frecuencia cardiaca")) {
    throw new Error("apple_health_zip_metric_names_missing");
  }
  if (zipJob.result?.structuredContext?.connector !== "apple-healthkit-native") {
    throw new Error("apple_health_zip_structured_context_missing");
  }

  console.log(`Asset processing job verification passed: text=${queued.jobId}, appleHealthZip=${zipQueued.jobId}`);
} finally {
  server.kill();
}
