import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startServer({ port, mode, canaryUsers = "", frozen = "true" }) {
  const output = [];
  const child = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      NODE_ENV: "test",
      STORAGE_ADAPTER: "json-file",
      EVIDENCE_PIPELINE_MODE: mode,
      EVIDENCE_PIPELINE_CANARY_USERS: canaryUsers,
      EVIDENCE_PIPELINE_V2_FROZEN: frozen,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", (chunk) => output.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => output.push(chunk.toString("utf8")));
  const baseUrl = `http://127.0.0.1:${port}/api`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`, { cache: "no-store" });
      if (response.ok) return { child, baseUrl, output };
    } catch {
      // Wait for the local server.
    }
    await sleep(100);
  }
  child.kill();
  throw new Error(`v2_http_server_not_ready:${output.join("").slice(-1000)}`);
}

async function jsonRequest(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const text = await response.text();
  return {
    status: response.status,
    payload: text ? JSON.parse(text) : {},
  };
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(2000),
  ]);
}

async function verifyOffMode() {
  const runtime = await startServer({ port: 5212, mode: "off", frozen: "false" });
  try {
    const health = await jsonRequest(runtime.baseUrl, "/health");
    assert.equal(health.status, 200);
    assert.equal(health.payload.status, "ok");

    const status = await jsonRequest(runtime.baseUrl, "/v2/status");
    assert.equal(status.status, 200);
    assert.equal(status.payload.mode, "off");
    assert.equal(status.payload.ready, false);
    assert.equal(status.payload.enabledForUser, false);

    const evidence = await jsonRequest(runtime.baseUrl, "/v2/evidence", {
      method: "POST",
      body: JSON.stringify({
        assetId: "should-not-write",
        idempotencyKey: "should-not-write",
        text: "V2 apagada no debe aceptar datos.",
      }),
    });
    assert.equal(evidence.status, 404);
    assert.equal(evidence.payload.error, "evidence_pipeline_v2_disabled");
  } finally {
    await stopServer(runtime.child);
  }
}

async function verifyCanaryGuard() {
  const runtime = await startServer({
    port: 5213,
    mode: "canary",
    canaryUsers: "another-user@example.com",
    frozen: "false",
  });
  try {
    const status = await jsonRequest(runtime.baseUrl, "/v2/status");
    assert.equal(status.status, 200);
    assert.equal(status.payload.mode, "canary");
    assert.equal(status.payload.enabledForUser, false);

    const evidence = await jsonRequest(runtime.baseUrl, "/v2/evidence", {
      method: "POST",
      body: JSON.stringify({
        assetId: "blocked-canary",
        idempotencyKey: "blocked-canary",
        text: "El usuario fuera del canario debe quedar bloqueado.",
      }),
    });
    assert.equal(evidence.status, 403);
    assert.equal(evidence.payload.error, "evidence_pipeline_v2_canary_only");
  } finally {
    await stopServer(runtime.child);
  }
}

async function verifyFrozenModeOverridesRailwayConfiguration() {
  const runtime = await startServer({
    port: 5214,
    mode: "canary",
    canaryUsers: "local-user@example.com",
    frozen: "true",
  });
  try {
    const status = await jsonRequest(runtime.baseUrl, "/v2/status");
    assert.equal(status.status, 200);
    assert.equal(status.payload.mode, "canary");
    assert.equal(status.payload.frozen, true);
    assert.equal(status.payload.ready, false);
    assert.equal(status.payload.enabledForUser, false);
    assert.equal(status.payload.reason, "replacement_in_progress");

    const evidence = await jsonRequest(runtime.baseUrl, "/v2/evidence", {
      method: "POST",
      body: JSON.stringify({
        assetId: "must-never-write",
        idempotencyKey: "must-never-write",
        text: "La proteccion debe bloquear incluso un canario configurado.",
      }),
    });
    assert.equal(evidence.status, 503);
    assert.equal(evidence.payload.error, "evidence_pipeline_v2_frozen");
  } finally {
    await stopServer(runtime.child);
  }
}

await verifyOffMode();
await verifyCanaryGuard();
await verifyFrozenModeOverridesRailwayConfiguration();

console.log("Evidence pipeline V2 HTTP: freeze, off mode and canary guard passed.");
