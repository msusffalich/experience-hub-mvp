import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const LOCAL_USER_ID = "00000000-0000-0000-0000-000000000001";

await verifyOffMode();
await verifyInvalidModeFallsBackToOff();
await verifyCanaryGuard();
await verifyAuthorizedCanaryRequiresSupabase();

console.log("Capture HTTP: off mode, contract and per-user canary guard passed.");

async function verifyOffMode() {
  await withServer({
    port: 5215,
    mode: "off",
  }, async (baseUrl) => {
    const { response, payload } = await getStatus(baseUrl);
    assert.equal(response.status, 200);
    assert.equal(payload.mode, "off");
    assert.equal(payload.ready, false);
    assert.equal(payload.enabledForUser, false);
    assert.equal(payload.reason, "pipeline_off");
    assert.equal(payload.architecture, "capture_first_story_later");
    assert.equal(payload.contract.endpoint, "/api/captures");
    assert.equal(payload.contract.receiptEndpoint, "/api/captures/operations/{operationId}");
    assert.deepEqual(payload.contract.intents.evidence, ["text", "image", "audio", "video", "document"]);
    assert.deepEqual(payload.contract.intents.context, ["biometric", "location", "weather", "news", "agenda", "sensor"]);
    assert.equal(payload.contract.forbiddenStoryFields.includes("experienceId"), true);
    assert.equal(payload.contract.retry.completeState, "complete");
    assert.equal(payload.contract.directUpload.authorizeEndpoint, "/api/captures/uploads");
    assert.equal(payload.contract.directUpload.commitEndpoint, "/api/captures/commit");
    assert.equal(payload.contract.directUpload.binaryTransport, "direct_to_supabase_storage");
    assert.equal(payload.contract.directUpload.resumableUpload.protocol, "tus");
    assert.equal(payload.compatibility.mode, "observe_only");
    assert.equal(payload.compatibility.writesDuplicated, false);
    assert.equal(payload.compatibility.observed, 0);

    const post = await postTextCapture(baseUrl, "off-capture");
    assert.equal(post.response.status, 503);
    assert.equal(post.payload.error, "capture_pipeline_disabled");

    const direct = await postDirectAuthorization(baseUrl, "off-direct");
    assert.equal(direct.response.status, 503);
    assert.equal(direct.payload.error, "capture_pipeline_disabled");
  });
}

async function postDirectAuthorization(baseUrl, captureId) {
  const response = await fetch(`${baseUrl}/api/captures/uploads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      captureId,
      idempotencyKey: captureId,
      intent: "evidence",
      kind: "image",
      occurredAt: "2026-07-29T18:00:00-04:00",
      filename: "foto.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 5,
      checksum: "a".repeat(64),
    }),
  });
  return { response, payload: await response.json() };
}

async function verifyCanaryGuard() {
  await withServer({
    port: 5216,
    mode: "canary",
    canaryUsers: "another-user@example.com",
  }, async (baseUrl) => {
    const { payload } = await getStatus(baseUrl);
    assert.equal(payload.mode, "canary");
    assert.equal(payload.enabledForUser, false);
    assert.equal(payload.reason, "user_not_enabled");

    const post = await postTextCapture(baseUrl, "blocked-canary");
    assert.equal(post.response.status, 403);
    assert.equal(post.payload.error, "capture_pipeline_canary_only");
  });
}

async function verifyInvalidModeFallsBackToOff() {
  await withServer({
    port: 5218,
    mode: "unexpected-mode",
  }, async (baseUrl) => {
    const { payload } = await getStatus(baseUrl);
    assert.equal(payload.mode, "off");
    assert.equal(payload.enabledForUser, false);
    assert.equal(payload.reason, "pipeline_off");
  });
}

async function verifyAuthorizedCanaryRequiresSupabase() {
  await withServer({
    port: 5217,
    mode: "canary",
    canaryUsers: `${LOCAL_USER_ID},local-user@example.com`,
  }, async (baseUrl) => {
    const { payload } = await getStatus(baseUrl);
    assert.equal(payload.mode, "canary");
    assert.equal(payload.enabledForUser, true);
    assert.equal(payload.ready, false);
    assert.equal(payload.reason, "supabase_unavailable");

    const post = await postTextCapture(baseUrl, "authorized-canary");
    assert.equal(post.response.status, 503);
    assert.equal(post.payload.error, "capture_pipeline_requires_supabase");
  });
}

async function getStatus(baseUrl) {
  const response = await fetch(`${baseUrl}/api/captures/status`);
  return { response, payload: await response.json() };
}

async function postTextCapture(baseUrl, captureId) {
  const response = await fetch(`${baseUrl}/api/captures`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": captureId,
    },
    body: JSON.stringify({
      intent: "evidence",
      kind: "text",
      captureId,
      idempotencyKey: captureId,
      occurredAt: "2026-07-28T18:00:00-04:00",
      text: "La ruta canaria conserva la captura sin crear una historia.",
    }),
  });
  return { response, payload: await response.json() };
}

async function withServer({ port, mode, canaryUsers = "" }, callback) {
  const output = [];
  const child = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      NODE_ENV: "test",
      STORAGE_ADAPTER: "json-file",
      CAPTURE_PIPELINE_MODE: mode,
      CAPTURE_PIPELINE_CANARY_USERS: canaryUsers,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", (chunk) => output.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => output.push(chunk.toString("utf8")));

  try {
    await waitForServer(port, output);
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    if (child.exitCode === null) child.kill();
  }
}

async function waitForServer(port, output) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // Wait until the child process is listening.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`capture_http_server_not_ready:${output.join("").slice(-1000)}`);
}
