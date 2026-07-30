import assert from "node:assert/strict";

import { createCaptureService } from "../apps/vibe-api-v2/src/capture.mjs";

const operations = new Map();
const captures = new Map();
const storageObjects = new Map();
const agenda = new Map();
const contextSignals = new Map();

const config = {
  supabaseUrl: "https://runtime-test.supabase.co",
  storageBucket: "experience-media",
  maxFileBytes: 100 * 1024 * 1024,
};
const auth = {
  user: { id: "user-1", email: "miguel@example.test" },
  accessToken: "valid-token",
};

const supabase = {
  async rpc(name, body) {
    assert.equal(name, "claim_capture_operation");
    const prior = operations.get(body.p_operation_id);
    if (prior) return structuredClone(prior);
    const row = {
      operation_id: body.p_operation_id,
      idempotency_key: body.p_idempotency_key,
      capture_id: body.p_capture_id,
      owner_user_id: body.p_owner_user_id,
      workspace_id: body.p_workspace_id,
      fingerprint: body.p_fingerprint,
      checksum: body.p_checksum,
      intent: body.p_intent,
      kind: body.p_kind,
      state: "accepted",
      attempts: 0,
      storage_path: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    };
    operations.set(row.operation_id, row);
    return structuredClone(row);
  },
  async rest(table, options = {}) {
    if (table === "capture_operations") return operationRest(options);
    if (table === "capture_records") return captureRest(options);
    if (table === "story_evidence_links") return [];
    if (table === "agenda_events") {
      agenda.set(options.body.event_id, structuredClone(options.body));
      return null;
    }
    if (table === "context_signals") {
      contextSignals.set(options.body.signal_id, structuredClone(options.body));
      return null;
    }
    throw new Error(`Unexpected table ${table}`);
  },
  async storageSignUpload(_bucket, path) {
    return {
      signedUrl: `https://runtime-test.supabase.co/storage/v1/object/upload/sign/experience-media/${path}?token=test`,
      token: "test",
    };
  },
  async storageInfo(_bucket, path) {
    const value = storageObjects.get(path);
    if (!value) throw new Error("storage_object_missing");
    return structuredClone(value);
  },
  async storagePut(_bucket, path, body, mimeType) {
    storageObjects.set(path, { sizeBytes: body.length, mimeType });
  },
  async storageGet(_bucket, path) {
    const value = storageObjects.get(path);
    return new Response(Buffer.alloc(value?.sizeBytes || 0));
  },
  async storageDelete(_bucket, paths) {
    paths.forEach((path) => storageObjects.delete(path));
  },
  async storageSignDownload(_bucket, path) {
    return { signedUrl: `https://runtime.test/download/${path}` };
  },
};

const capture = createCaptureService({
  supabase,
  workspace: {
    async resolve() {
      return { id: "workspace-1", role: "owner" };
    },
  },
  config,
});

const binaryCases = [
  ["image", "photo.jpg", "image/jpeg", 1024, "evidence"],
  ["audio", "voice.m4a", "audio/mp4", 2048, "evidence"],
  ["video", "clip.mp4", "video/mp4", 7 * 1024 * 1024, "evidence"],
  ["document", "notes.pdf", "application/pdf", 4096, "evidence"],
  ["biometric", "health.csv", "text/csv", 512, "context"],
  ["sensor", "sensor.json", "application/json", 256, "context"],
];

for (const [kind, filename, mimeType, sizeBytes, intent] of binaryCases) {
  const command = binaryCommand(kind, filename, mimeType, sizeBytes, intent);
  const authorization = await capture.authorize(command, auth);
  assert.equal(authorization.authorized, true);
  assert.equal(authorization.uploadRequired, true);
  assert.equal(
    authorization.upload.mode,
    sizeBytes > 6 * 1024 * 1024 ? "resumable" : "standard",
  );
  storageObjects.set(authorization.upload.path, { sizeBytes, mimeType });
  const receipt = await capture.commit(command, auth);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.durable, true);
  assert.equal(receipt.visible, true);
  assert.equal(receipt.kind, kind);
  const duplicate = await capture.commit(command, auth);
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
}

const lightCases = [
  ["text", "evidence", { text: "Una nota humana sobre la tarde." }],
  ["biometric", "context", { metadata: { metrics: { heart_rate: 68, steps: 7421 } } }],
  ["location", "context", { metadata: { latitude: 28.3775, longitude: -81.6526 } }],
  ["weather", "context", { metadata: { metrics: { temperature: 29, humidity: 74 } } }],
  ["news", "context", { text: "Fuente verificada y fecha vigente." }],
  ["agenda", "context", { text: "Reunión de trabajo", metadata: { title: "Reunión de trabajo" } }],
  ["sensor", "context", { metadata: { metrics: { ambient_light: 420 } } }],
];

for (const [kind, intent, content] of lightCases) {
  const command = {
    captureId: `light-${kind}`,
    idempotencyKey: `light-${kind}`,
    occurredAt: "2026-07-30T16:00:00.000Z",
    intent,
    kind,
    source: { app: "vibeapp", platform: "ios", capturedOffline: true },
    ...content,
  };
  const receipt = await capture.capture(command, auth);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.durable, true);
  const duplicate = await capture.capture(command, auth);
  assert.equal(duplicate.duplicate, true);
}

assert.equal(captures.size, binaryCases.length + lightCases.length);
assert.equal(agenda.size, 1);
assert.equal(contextSignals.size, 7);
assert.equal(
  [...captures.values()].every((row) => row.owner_user_id === "user-1"),
  true,
);
await assert.rejects(
  () => capture.capture({
    captureId: "bad-story",
    idempotencyKey: "bad-story",
    occurredAt: "2026-07-30T16:00:00.000Z",
    intent: "evidence",
    kind: "text",
    text: "No debe pasar.",
    experienceId: "story-1",
  }, auth),
  (error) => error?.code === "capture_story_fields_forbidden",
);

console.log(
  `Vibe API V2 capture runtime: ${binaryCases.length} binary, ${lightCases.length} light/context, idempotency and offline timestamps passed.`,
);

function binaryCommand(kind, filename, mimeType, sizeBytes, intent) {
  return {
    captureId: `binary-${kind}`,
    idempotencyKey: `binary-${kind}`,
    occurredAt: "2026-07-30T15:00:00.000Z",
    intent,
    kind,
    filename,
    mimeType,
    sizeBytes,
    checksum: "a".repeat(64),
    source: { app: "vibeapp", platform: "ios", capturedOffline: true },
    metadata: kind === "biometric" ? { metrics: { heart_rate: 70 } } : {},
  };
}

function operationRest(options) {
  const id = stripFilter(options.query?.operation_id);
  if ((options.method || "GET") === "PATCH") {
    const row = operations.get(id);
    if (!row) return [];
    Object.assign(row, structuredClone(options.body));
    operations.set(id, row);
    return [structuredClone(row)];
  }
  const row = operations.get(id);
  return row ? [structuredClone(row)] : [];
}

function captureRest(options) {
  if ((options.method || "GET") === "POST") {
    const row = {
      ...structuredClone(options.body),
      created_at: captures.get(options.body.capture_id)?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    captures.set(row.capture_id, row);
    return [structuredClone(row)];
  }
  const id = stripFilter(options.query?.capture_id);
  const row = captures.get(id);
  return row ? [structuredClone(row)] : [];
}

function stripFilter(value) {
  return String(value || "").replace(/^eq\./, "");
}
