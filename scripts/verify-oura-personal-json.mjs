import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";

const port = 5214;
const baseUrl = `http://127.0.0.1:${port}/api`;
const runId = `oura-personal-${Date.now()}`;
const downloadsDir = "C:\\Users\\msusf\\Downloads";
const inputFiles = [
  { dataType: "daily_activity", path: `${downloadsDir}\\oura_daily_activity.json`, required: true },
  { dataType: "daily_sleep", path: `${downloadsDir}\\oura_daily_sleep.json`, required: false },
  { dataType: "daily_readiness", path: `${downloadsDir}\\oura_daily_readiness.json`, required: false },
  { dataType: "sleep", path: `${downloadsDir}\\oura_sleep.json`, required: false },
  { dataType: "heartrate", path: `${downloadsDir}\\oura_heartrate.json`, required: false },
  { dataType: "daily_spo2", path: `${downloadsDir}\\oura_daily_spo2.json`, required: false },
  { dataType: "daily_stress", path: `${downloadsDir}\\oura_daily_stress.json`, required: false },
  { dataType: "daily_resilience", path: `${downloadsDir}\\oura_daily_resilience.json`, required: false },
  { dataType: "workout", path: `${downloadsDir}\\oura_workouts.json`, required: false },
];

const protectedDataFiles = [
  "data/experience-store.json",
  "data/operation-log.json",
  "data/agenda-events.json",
  "data/daily-briefing-store.json",
].map((filePath) => ({
  filePath,
  existed: existsSync(filePath),
  content: existsSync(filePath) ? readFileSync(filePath, "utf8") : "",
}));

function readOuraFile(entry) {
  if (!existsSync(entry.path)) {
    if (entry.required) throw new Error(`missing_required_oura_file:${entry.path}`);
    return { ...entry, present: false, documents: [], rawKeys: [], emptyReason: "file_missing" };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(entry.path, "utf8"));
  } catch (error) {
    throw new Error(`invalid_json:${entry.path}:${error.message}`);
  }
  const documents = Array.isArray(parsed?.data)
    ? parsed.data
    : Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object"
        ? [parsed]
        : [];
  return {
    ...entry,
    present: true,
    documents,
    rawKeys: parsed && typeof parsed === "object" ? Object.keys(parsed) : [],
    nextToken: parsed?.next_token ?? null,
    firstDocumentKeys: documents[0] && typeof documents[0] === "object" ? Object.keys(documents[0]) : [],
    emptyReason: documents.length ? "" : "no_readings_in_selected_range",
  };
}

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
  throw new Error(`server_did_not_start:${lastError}`);
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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

try {
  const files = inputFiles.map(readOuraFile);
  const present = files.filter((entry) => entry.present);
  const withData = present.filter((entry) => entry.documents.length);
  assert(present.length > 0, "no_oura_json_files_found");
  assert(withData.length > 0, "oura_files_have_no_records");

  await waitForHealth();

  const normalizedCollections = [];
  const allSignals = [];
  for (const entry of withData) {
    const normalized = await fetchJson("/integration/oura/normalize", {
      method: "POST",
      body: JSON.stringify({
        dataType: entry.dataType,
        documents: entry.documents,
        participantId: "miguel",
      }),
    });
    assert(normalized.ok, `oura_normalize_failed:${entry.dataType}`);
    normalized.results.forEach((result) => {
      if (result.ok) {
        allSignals.push({
          ...result.normalized,
          idempotencyKey: `${runId}:${result.normalized.idempotencyKey}`,
        });
      }
    });
    normalizedCollections.push({
      dataType: entry.dataType,
      inputRecords: entry.documents.length,
      normalizedRecords: normalized.count,
      targetSummary: normalized.targetSummary,
      firstMetricKeys: Object.keys(normalized.results[0]?.normalized?.payload?.metrics || {}),
    });
  }

  assert(allSignals.length > 0, "oura_no_valid_signals_after_normalize");
  const ingest = await fetchJson("/integration/ingest", {
    method: "POST",
    body: JSON.stringify({
      source: "oura-personal-json",
      refreshContext: false,
      refreshDailyBriefing: false,
      signals: allSignals,
    }),
  });

  assert(ingest.ok, "oura_ingest_not_ok");
  assert(ingest.automation?.actions?.includes("biometric_impact_recomputed"), "oura_ingest_did_not_recompute_biometric_impact");

  const evidence = {
    ok: true,
    verifiedAt: new Date().toISOString(),
    source: "Oura Ring 4 personal JSON files",
    runId,
    files: files.map((entry) => ({
      dataType: entry.dataType,
      present: entry.present,
      path: entry.path,
      records: entry.documents.length,
      rawKeys: entry.rawKeys,
      firstDocumentKeys: entry.firstDocumentKeys,
      emptyReason: entry.emptyReason,
    })),
    normalizedCollections,
    ingestedSignals: allSignals.length,
    automation: ingest.automation,
    conclusion: {
      complete: files.some((entry) => entry.dataType === "daily_activity" && entry.documents.length)
        && files.some((entry) => entry.dataType === "daily_sleep" && entry.documents.length)
        && files.some((entry) => entry.dataType === "daily_readiness" && entry.documents.length),
      message: "Oura personal JSON was normalized and ingested where records existed. Empty endpoints are valid when Oura had no readings in the selected range.",
      missingOrEmptyForFullBiometricCoverage: files
        .filter((entry) => ["daily_sleep", "daily_readiness", "sleep", "heartrate", "daily_spo2", "daily_stress", "daily_resilience", "workout"].includes(entry.dataType) && !entry.documents.length)
        .map((entry) => entry.dataType),
    },
  };
  mkdirSync("data", { recursive: true });
  writeFileSync("data/oura-personal-json-validation.json", JSON.stringify(evidence, null, 2), "utf8");
  console.log(`Oura personal JSON verification passed: ${allSignals.length} signal(s) ingested. Evidence: data/oura-personal-json-validation.json`);
} finally {
  if (server.exitCode === null) server.kill();
  protectedDataFiles.forEach((entry) => {
    try {
      if (entry.existed) writeFileSync(entry.filePath, entry.content);
      else if (existsSync(entry.filePath)) unlinkSync(entry.filePath);
    } catch {}
  });
}
