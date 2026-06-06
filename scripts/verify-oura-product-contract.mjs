import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";

const port = 5215;
const baseUrl = `http://127.0.0.1:${port}/api`;
const protectedDataFiles = [
  "data/experience-store.json",
  "data/operation-log.json",
  "data/routine-store.json",
].map((filePath) => ({
  filePath,
  existed: existsSync(filePath),
  content: existsSync(filePath) ? readFileSync(filePath, "utf8") : "",
}));

const server = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(port),
    NODE_ENV: "test",
    STORAGE_ADAPTER: "json-file",
    OURA_DEFAULT_SYNC_DAYS: "7",
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString("utf8"); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString("utf8"); });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  return { response, payload, text };
}

async function waitForHealth() {
  let lastError = "";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const { response, payload } = await fetchJson("/health");
      if (response.ok) return payload;
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error.message;
    }
    await sleep(150);
  }
  throw new Error(`server_did_not_start:${lastError}\n${serverOutput.slice(-1000)}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  await waitForHealth();

  const manifestResult = await fetchJson("/integration/oura/manifest");
  assert(manifestResult.response.ok, "oura_manifest_not_ok");
  const manifest = manifestResult.payload;
  assert(manifest.endpoints?.webhook === "/api/integration/oura/webhook", "oura_webhook_endpoint_missing");
  assert(manifest.endpoints?.connectUrl === "/api/integration/oura/connect-url", "oura_connect_url_endpoint_missing");
  assert(manifest.syncModes?.next?.includes("paginated-api-sync"), "oura_paginated_sync_not_declared");
  assert(manifest.dataTypes?.some((item) => item.dataType === "heartrate" && item.queryMode === "datetime"), "oura_heartrate_datetime_query_missing");

  const statusResult = await fetchJson("/integration/oura/status");
  assert(statusResult.response.ok, "oura_status_not_ok");
  assert(Array.isArray(statusResult.payload.missingConfig), "oura_status_missing_config_shape");

  const syncResult = await fetchJson("/integration/oura/sync", { method: "POST", body: "{}" });
  assert(syncResult.response.status === 503, `oura_sync_should_report_missing_config:${syncResult.response.status}`);
  assert(syncResult.payload.detail?.missingConfig?.includes("OURA_CLIENT_ID"), "oura_sync_missing_config_not_explicit");

  const connectUrlResult = await fetchJson("/integration/oura/connect-url");
  assert(connectUrlResult.response.status === 401 || connectUrlResult.response.status === 503, `oura_connect_url_should_require_auth_or_config:${connectUrlResult.response.status}`);

  const webhookResult = await fetchJson("/integration/oura/webhook", {
    method: "POST",
    body: JSON.stringify({
      user_id: "test-user",
      events: [{ data_type: "daily_activity", event_type: "update", object_id: "evt-1" }],
    }),
  });
  assert(webhookResult.response.status === 202, `oura_webhook_should_accept:${webhookResult.response.status}`);
  assert(webhookResult.payload.receivedEvents === 1, "oura_webhook_event_count_wrong");

  const routinesResult = await fetchJson("/routines");
  assert(routinesResult.response.ok, "routines_not_ok");
  const routines = Array.isArray(routinesResult.payload) ? routinesResult.payload : routinesResult.payload.routines || [];
  assert(routines.some((routine) => routine.id === "oura-sync" && routine.enabled === false), "oura_sync_routine_missing_or_enabled_by_default");

  console.log("Oura product contract verification passed: OAuth status, explicit missing config, paginated sync declaration, webhook, and disabled daily routine.");
} finally {
  if (server.exitCode === null) server.kill();
  protectedDataFiles.forEach((entry) => {
    try {
      if (entry.existed) writeFileSync(entry.filePath, entry.content);
      else if (existsSync(entry.filePath)) unlinkSync(entry.filePath);
    } catch {}
  });
}
