import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import { createVibeApiV2 } from "../apps/vibe-api-v2/src/app.mjs";
import { createCaptureService } from "../apps/vibe-api-v2/src/capture.mjs";
import { createContextService } from "../apps/vibe-api-v2/src/context.mjs";
import { createIntegrationService } from "../apps/vibe-api-v2/src/integrations.mjs";
import { createSupabaseClient } from "../apps/vibe-api-v2/src/supabase.mjs";

const backendRoot = new URL("../apps/vibe-api-v2/", import.meta.url);
const sourceRoot = new URL("src/", backendRoot);
const sourceFiles = await listFiles(sourceRoot, (name) => name.endsWith(".mjs"));

for (const file of [new URL("server.mjs", backendRoot), ...sourceFiles]) {
  const result = spawnSync(process.execPath, ["--check", fileURLToPath(file)], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(
    result.status,
    0,
    `Syntax error in ${fileURLToPath(file)}:\n${result.stderr || result.stdout}`,
  );
}

const config = Object.freeze({
  env: "test",
  port: 0,
  supabaseUrl: "https://test.supabase.co",
  publishableKey: "sb_publishable_test",
  serviceRoleKey: "sb_secret_test",
  storageBucket: "experience-media",
  maxJsonBytes: 2 * 1024 * 1024,
  maxFileBytes: 100 * 1024 * 1024,
  upstreamTimeoutMs: 1000,
  healthCacheMs: 1000,
  pythonCommand: "python",
  obsidianVaultPath: "",
  ouraClientId: "oura-client",
  ouraClientSecret: "oura-secret",
  ouraRedirectUri: "https://example.test/api/v2/integrations/oura/callback",
  ouraWebhookSecret: "webhook-verification-secret",
  integrationEncryptionKey: "integration-encryption-test-key",
  openaiApiKey: "",
  openaiModel: "test-model",
  publicBaseUrl: "https://example.test",
});

const profile = {
  user_id: "user-1",
  email: "miguel@example.test",
  name: "Miguel",
  language: "es",
  timezone: "America/New_York",
  experience_type: "auto",
  subscription_tier: "production",
};
const routeSupabase = createRouteSupabase(profile);
const api = createVibeApiV2({
  config,
  supabase: routeSupabase,
  fetchImpl: async () => {
    throw new Error("Unexpected external request");
  },
});

const expectedRoutes = [
  ["GET", "/api/v2/health/live", false],
  ["GET", "/api/v2/health/ready", false],
  ["GET", "/api/v2/health", true],
  ["POST", "/api/v2/auth/sign-in", false],
  ["POST", "/api/v2/auth/refresh", false],
  ["GET", "/api/v2/profile", true],
  ["PUT", "/api/v2/profile", true],
  ["GET", "/api/v2/groups", true],
  ["POST", "/api/v2/groups", true],
  ["PUT", "/api/v2/groups/:id", true],
  ["DELETE", "/api/v2/groups/:id", true],
  ["GET", "/api/v2/experiences", true],
  ["POST", "/api/v2/experiences", true],
  ["PUT", "/api/v2/experiences/:id", true],
  ["DELETE", "/api/v2/experiences/:id", true],
  ["GET", "/api/v2/assets", true],
  ["POST", "/api/v2/assets/adopt", true],
  ["POST", "/api/v2/assets/reassign", true],
  ["GET", "/api/v2/assets/:id/download", true],
  ["GET", "/api/v2/captures", true],
  ["GET", "/api/v2/captures/contract", true],
  ["POST", "/api/v2/captures", true],
  ["GET", "/api/v2/captures/status", true],
  ["POST", "/api/v2/captures/uploads", true],
  ["POST", "/api/v2/captures/commit", true],
  ["GET", "/api/v2/captures/operations/:id", true],
  ["GET", "/api/v2/captures/:id/download", true],
  ["GET", "/api/v2/agenda", true],
  ["POST", "/api/v2/agenda", true],
  ["PUT", "/api/v2/agenda/:id", true],
  ["DELETE", "/api/v2/agenda/:id", true],
  ["GET", "/api/v2/context/signals", true],
  ["GET", "/api/v2/context/summary", true],
  ["GET", "/api/v2/context/briefing", true],
  ["POST", "/api/v2/context/refresh", true],
  ["POST", "/api/v2/outputs/:type/pdf", true],
  ["GET", "/api/v2/obsidian/preview", true],
  ["POST", "/api/v2/obsidian/export", true],
  ["GET", "/api/v2/jobs", true],
  ["GET", "/api/v2/jobs/:id", true],
  ["POST", "/api/v2/assistant/message", true],
  ["GET", "/api/v2/integrations/oura/status", true],
  ["POST", "/api/v2/integrations/oura/authorize", true],
  ["GET", "/api/v2/integrations/oura/callback", false],
  ["POST", "/api/v2/integrations/oura/sync", true],
  ["DELETE", "/api/v2/integrations/oura", true],
  ["GET", "/api/v2/integrations/oura/webhook", false],
  ["POST", "/api/v2/integrations/oura/webhook", false],
];

const actualRoutes = api.routes.map((route) => [route.method, route.pattern, route.auth]);
assert.deepEqual(actualRoutes, expectedRoutes, "The V2 route inventory or auth policy changed");
assert.equal(
  new Set(actualRoutes.map(([method, pattern]) => `${method} ${pattern}`)).size,
  actualRoutes.length,
  "Duplicate V2 routes detected",
);
assert.equal(
  actualRoutes.every(([, pattern]) => pattern.startsWith("/api/v2/")),
  true,
  "A V2 handler was registered outside /api/v2",
);

const unauthenticated = await dispatch(api, "GET", "/api/v2/profile");
assert.equal(unauthenticated.status, 401);
assert.equal(unauthenticated.json.error, "auth_required");

const authenticated = await dispatch(api, "GET", "/api/v2/profile", {
  authorization: "Bearer valid-token",
});
assert.equal(authenticated.status, 200);
assert.equal(authenticated.json.userId, profile.user_id);
assert.equal(authenticated.headers["x-vibe-api-version"], "2.0.0");

const storageRequests = [];
const storageClient = createSupabaseClient(config, async (url) => {
  storageRequests.push(url);
  return new Response(JSON.stringify({
    url: "/object/upload/sign/experience-media/user-1/photo.jpg?token=signed-token",
    token: "signed-token",
  }), { status: 200, headers: { "Content-Type": "application/json" } });
});
const uploadAuthorization = await storageClient.storageSignUpload(
  "experience-media",
  "user-1/photo.jpg",
  { accessToken: "valid-token" },
);
assert.equal(
  uploadAuthorization.signedUrl,
  "https://test.supabase.co/storage/v1/object/upload/sign/experience-media/user-1/photo.jpg?token=signed-token",
);
assert.equal(storageRequests.length, 1);

const capture = createCaptureService({
  supabase: {
    async rest() {
      return [];
    },
  },
  workspace: {
    async resolve() {
      return { id: "workspace-1", role: "owner" };
    },
  },
  config,
});
const captureStatus = await capture.status(authValue());
assert.equal(captureStatus.ready, true);
assert.deepEqual(
  [...captureStatus.contract.evidence].sort(),
  ["audio", "document", "image", "text", "video"],
);
assert.deepEqual(
  [...captureStatus.contract.context].sort(),
  ["agenda", "biometric", "entertainment", "location", "news", "sensor", "weather"],
);
assert.equal(captureStatus.contract.storyFieldsAllowed, false);
assert.equal(captureStatus.contract.successRule, "storage_verified_and_catalog_committed");

const context = createContextService({
  supabase: {
    async rest() {
      return [];
    },
  },
  workspace: {
    async resolve() {
      return { id: "workspace-1", role: "owner" };
    },
  },
});
const emptyContext = await context.summary(
  authValue(),
  new URL("https://example.test/api/v2/context/summary"),
);
assert.equal(emptyContext.sourceSignals, 0);
assert.equal(emptyContext.biometricSignals, 0);
assert.deepEqual(emptyContext.metrics, {});
assert.equal(emptyContext.energy, null, "Missing biometrics must never fabricate energy");

const contextSource = await readFile(new URL("context.mjs", sourceRoot), "utf8");
const storiesSource = await readFile(new URL("stories.mjs", sourceRoot), "utf8");
assert.match(contextSource, /candidates\.length\s*\?[\s\S]*:\s*null/);
assert.doesNotMatch(contextSource, /\benergy\s*:\s*(?:5|7|10)\b/);
assert.match(storiesSource, /Number\.isFinite\(number\)[\s\S]*\?\s*Math\.round\(number\)\s*:\s*null/);
assert.doesNotMatch(storiesSource, /\benergy\s*:\s*(?:5|7|10)\b/);

const queuedJobs = [];
const oura = createIntegrationService({
  config,
  workspace: {
    async resolve() {
      return { id: "workspace-1", role: "owner" };
    },
  },
  supabase: {
    async rest(table, options = {}) {
      if (table === "integration_connections_v2") {
        return [{
          owner_user_id: "user-1",
          workspace_id: "workspace-1",
          provider_user_id: "oura-user-1",
          status: "connected",
        }];
      }
      if (table === "vibe_jobs_v2" && options.method === "POST") {
        queuedJobs.push(options.body);
        return null;
      }
      throw new Error(`Unexpected fake Supabase call: ${table}`);
    },
  },
  fetchImpl: async () => {
    throw new Error("Unexpected Oura HTTP request");
  },
});

const timestamp = "1785430800";
const webhookBody = Buffer.from(JSON.stringify({
  event_type: "update",
  data_type: "daily_sleep",
  user_id: "oura-user-1",
}));
const signature = createHmac("sha256", config.ouraClientSecret)
  .update(timestamp)
  .update(webhookBody)
  .digest("hex")
  .toUpperCase();
const webhookResult = await oura.webhook(webhookBody, {
  "x-oura-signature": signature,
  "x-oura-timestamp": timestamp,
});
assert.deepEqual(webhookResult, { ok: true, queued: 1 });
assert.equal(queuedJobs.length, 1);
assert.equal(queuedJobs[0].owner_user_id, "user-1");
assert.equal(queuedJobs[0].workspace_id, "workspace-1");
assert.equal(queuedJobs[0].job_type, "oura_webhook_sync");
assert.equal(queuedJobs[0].state, "queued");

const invalidSignature = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
await assert.rejects(
  () => oura.webhook(webhookBody, {
    "x-oura-signature": invalidSignature,
    "x-oura-timestamp": timestamp,
  }),
  (error) => error?.status === 401 && error?.code === "oura_webhook_signature_invalid",
);
await assert.rejects(
  () => oura.webhook(webhookBody, {}),
  (error) => error?.status === 401 && error?.code === "oura_webhook_signature_missing",
);

console.log(
  `Vibe API V2 verified: ${actualRoutes.length} routes, strict auth, capture kinds, null energy, Oura HMAC, ${sourceFiles.length + 1} syntax checks.`,
);

function authValue() {
  return {
    user: { id: "user-1", email: "miguel@example.test" },
    accessToken: "valid-token",
  };
}

function createRouteSupabase(profileValue) {
  return {
    async authUser(token) {
      return token === "valid-token"
        ? { id: profileValue.user_id, email: profileValue.email, user_metadata: {} }
        : null;
    },
    async authSignIn() {
      throw new Error("Not used");
    },
    async authRefresh() {
      throw new Error("Not used");
    },
    async rest(table) {
      if (table === "profiles") return [profileValue];
      return [];
    },
    async rpc() {
      return null;
    },
    async storageSignUpload() {
      return { signedUrl: "https://storage.test/upload", token: "token" };
    },
    async storageInfo() {
      return { sizeBytes: 1, mimeType: "application/octet-stream" };
    },
    async storageSignDownload() {
      return { signedUrl: "https://storage.test/download" };
    },
    async storagePut() {
      return null;
    },
    async storageGet() {
      return new Response(Buffer.from("test"));
    },
    async storageDelete() {
      return null;
    },
  };
}

async function dispatch(apiValue, method, url, headers = {}) {
  const req = Readable.from([]);
  req.method = method;
  req.url = url;
  req.headers = headers;
  const output = [];
  const responseHeaders = {};
  const res = {
    writableEnded: false,
    setHeader(name, value) {
      responseHeaders[String(name).toLowerCase()] = String(value);
    },
    writeHead(status, values = {}) {
      this.statusCode = status;
      Object.entries(values).forEach(([name, value]) => {
        responseHeaders[String(name).toLowerCase()] = String(value);
      });
    },
    end(value) {
      if (value != null) output.push(Buffer.from(value));
      this.writableEnded = true;
    },
  };
  const handled = await apiValue.handle(req, res);
  assert.equal(handled, true);
  const body = Buffer.concat(output).toString("utf8");
  return {
    status: res.statusCode,
    headers: responseHeaders,
    body,
    json: body ? JSON.parse(body) : null,
  };
}

async function listFiles(directoryUrl, predicate) {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directoryUrl);
    if (entry.isDirectory()) files.push(...await listFiles(url, predicate));
    else if (predicate(entry.name)) files.push(url);
  }
  return files;
}
