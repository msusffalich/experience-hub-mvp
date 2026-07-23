import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const port = 5201;
const baseUrl = `http://127.0.0.1:${port}/api`;
const runId = `flow-${Date.now()}`;
const protectedDataFiles = [
  "data/experience-store.json",
  "data/operation-log.json",
  "data/agenda-events.json",
  "data/routine-store.json",
  "data/daily-briefing-store.json",
].map((filePath) => ({
  filePath,
  existed: existsSync(filePath),
  content: existsSync(filePath) ? readFileSync(filePath, "utf8") : "",
}));
const dataBackupDir = mkdtempSync(path.join(tmpdir(), "vibe-flow-audit-"));

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
  windowsHide: true,
});

let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString("utf8"); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString("utf8"); });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForHealth() {
  let lastError = "";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`, { cache: "no-store" });
      if (response.ok) return response.json();
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error.message;
    }
    await sleep(150);
  }
  throw new Error(`server_did_not_start:${lastError}\n${serverOutput.slice(-1000)}`);
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
    throw new Error(`invalid_json_${pathname}_${response.status}: ${text.slice(0, 500)}`);
  }
  if (!response.ok) {
    throw new Error(`${pathname}_${response.status}: ${payload.error || payload.message || text}`);
  }
  return payload;
}

async function waitForJob(jobId) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const payload = await fetchJson("/jobs");
    const job = payload.jobs?.find((item) => item.id === jobId);
    if (job?.status === "completed") return job;
    if (job?.status === "failed") throw new Error(`job_failed:${job.error || "unknown"}`);
    await sleep(120);
  }
  throw new Error(`job_timeout:${jobId}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  await waitForHealth();

  const baseline = await fetchJson("/sync/state");

  const ingest = await fetchJson("/integration/ingest", {
    method: "POST",
    body: JSON.stringify({
      refreshContext: false,
      refreshDailyBriefing: false,
      signals: [
        {
          sourceId: `${runId}-biometric`,
          sourceType: "vibeapp-native",
          capturedAt: new Date().toISOString(),
          participantId: "miguel",
          payloadType: "biometric",
          privacyLevel: "sensitive",
          idempotencyKey: `${runId}:biometric`,
          payload: {
            dataType: "biometric_file_import",
            fileName: "apple-health-export.xml",
            recordCount: 3,
            metricNames: ["heart_rate", "steps", "sleep"],
            metrics: { heartAvg: 74, steps: 4200, sleepMinutes: 390 },
          },
        },
        {
          sourceId: `${runId}-agenda`,
          sourceType: "vibeapp-native",
          capturedAt: new Date().toISOString(),
          participantId: "miguel",
          payloadType: "calendar",
          privacyLevel: "private",
          idempotencyKey: `${runId}:agenda`,
          payload: {
            title: "Auditoria automatica de agenda",
            startAt: new Date(Date.now() + 3_600_000).toISOString(),
            endAt: new Date(Date.now() + 7_200_000).toISOString(),
            location: "San Juan",
            participants: "Miguel",
          },
        },
      ],
    }),
  });
  assert(ingest.ok, "integration_ingest_not_ok");
  assert(ingest.automation?.triggered, "post_ingest_automation_not_triggered");
  assert(ingest.automation?.actions?.includes("biometric_impact_recomputed"), "biometric_action_missing");
  assert(ingest.automation?.actions?.includes("agenda_updated"), "agenda_action_missing");
  assert(ingest.automation?.updatedPanels?.includes("dashboard"), "dashboard_panel_not_marked");
  assert(ingest.automation?.updatedPanels?.includes("agenda"), "agenda_panel_not_marked");

  const afterIngest = await fetchJson("/sync/state");
  assert(afterIngest.token && afterIngest.token !== baseline.token, "sync_state_token_did_not_change_after_ingest");
  assert(Number(afterIngest.counts?.agenda || 0) >= 1, "sync_state_agenda_count_missing");
  // This audit deliberately turns context refresh off so it never depends on
  // external weather/news services. The integration response must say so;
  // other tests cover the deferred context job with an explicit location.
  assert(ingest.automation?.contextImpact?.status === "not_required", "sync_state_context_should_be_deferred_in_audit");

  const queued = await fetchJson("/jobs/asset-processing", {
    method: "POST",
    body: JSON.stringify({
      reason: "flow-automation-audit",
      asset: {
        name: "flow-automation-document.txt",
        type: "text/plain",
        kind: "document",
        dataUrl: "data:text/plain;base64,RG9jdW1lbnRvIGRlIGF1ZGl0b3JpYSBwYXJhIGZsdWpvIGF1dG9tYXRpY28u",
      },
    }),
  });
  assert(queued.jobId, "asset_processing_job_id_missing");
  const job = await waitForJob(queued.jobId);
  assert(job.result?.processingStatus === "processed", "asset_processing_job_not_processed");
  assert(String(job.result?.extractedText || "").includes("Documento de auditoria"), "asset_processing_text_missing");

  const routine = await fetchJson("/routines/offline-sync/run", { method: "POST", body: "{}" });
  assert(routine.result?.status === "ready", "offline_sync_routine_not_ready");

  const finalState = await fetchJson("/sync/state");
  assert(finalState.counts?.jobs?.completed >= 1, "sync_state_job_summary_missing");

  console.log("Flow automation verification passed: ingest automation, sync state, asset jobs, and routine run.");
} finally {
  if (server.exitCode === null) server.kill();
  protectedDataFiles.forEach((entry) => {
    try {
      if (entry.existed) writeFileSync(entry.filePath, entry.content);
      else if (existsSync(entry.filePath)) unlinkSync(entry.filePath);
    } catch {}
  });
  rmSync(dataBackupDir, { recursive: true, force: true });
}
