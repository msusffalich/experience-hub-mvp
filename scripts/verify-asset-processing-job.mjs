import { spawn } from "node:child_process";

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
  console.log(`Asset processing job verification passed: ${queued.jobId}`);
} finally {
  server.kill();
}
