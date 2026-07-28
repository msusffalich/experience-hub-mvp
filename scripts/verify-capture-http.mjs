import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = 5215;
const output = [];
const child = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(port),
    NODE_ENV: "test",
    STORAGE_ADAPTER: "json-file",
    CAPTURE_PIPELINE_MODE: "off",
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
child.stdout.on("data", (chunk) => output.push(chunk.toString("utf8")));
child.stderr.on("data", (chunk) => output.push(chunk.toString("utf8")));

try {
  await waitForServer();
  const statusResponse = await fetch(`http://127.0.0.1:${port}/api/captures/status`);
  const status = await statusResponse.json();
  assert.equal(statusResponse.status, 200);
  assert.equal(status.mode, "off");
  assert.equal(status.ready, false);
  assert.equal(status.architecture, "capture_first_story_later");
  assert.equal(status.compatibility.mode, "observe_only");
  assert.equal(status.compatibility.writesDuplicated, false);
  assert.equal(status.compatibility.observed, 0);

  const postResponse = await fetch(`http://127.0.0.1:${port}/api/captures`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      intent: "evidence",
      kind: "text",
      captureId: "must-not-write",
      idempotencyKey: "must-not-write",
      text: "La ruta paralela apagada no acepta datos.",
    }),
  });
  const post = await postResponse.json();
  assert.equal(postResponse.status, 503);
  assert.equal(post.error, "capture_pipeline_disabled");
  console.log("Capture HTTP: isolated route remains disabled by default.");
} finally {
  if (child.exitCode === null) child.kill();
}

async function waitForServer() {
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
