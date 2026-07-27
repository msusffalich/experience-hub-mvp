import assert from "node:assert/strict";
import { createSupabaseCaptureAdapters } from "../lib/capture/capture-supabase-adapters.mjs";

const operations = new Map();
const captures = new Map();
const objects = new Map();

const rpc = async (name, body) => {
  assert.equal(name, "claim_capture_operation");
  const existing = [...operations.values()].find(
    (row) => row.owner_user_id === body.p_owner_user_id &&
      row.idempotency_key === body.p_idempotency_key,
  );
  if (existing) return existing;
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
    state: "received",
    attempts: 0,
    storage_path: null,
    last_error: null,
    created_at: "2026-07-27T12:00:00.000Z",
    updated_at: "2026-07-27T12:00:00.000Z",
  };
  operations.set(row.operation_id, row);
  return row;
};

const rest = async (table, options = {}) => {
  const source = table === "capture_operations" ? operations : captures;
  if (options.method === "PATCH") {
    const id = valueFromEq(options.searchParams.operation_id);
    const row = { ...source.get(id), ...JSON.parse(options.body) };
    source.set(id, row);
    return [row];
  }
  if (options.method === "POST") {
    const row = JSON.parse(options.body);
    source.set(row.capture_id, row);
    return [row];
  }
  const idFilter = options.searchParams.operation_id || options.searchParams.capture_id;
  const row = source.get(valueFromEq(idFilter));
  return row ? [row] : [];
};

const storage = {
  async exists(storagePath) {
    return objects.has(storagePath);
  },
  async put(storagePath, bytes) {
    objects.set(storagePath, Buffer.from(bytes));
  },
};

const adapters = createSupabaseCaptureAdapters({
  rest,
  rpc,
  storage,
  ownerUserId: "00000000-0000-0000-0000-000000000001",
  workspaceId: "00000000-0000-0000-0000-000000000002",
});

const claimed = await adapters.operations.claim({
  operationId: "op-1",
  idempotencyKey: "idem-1",
  captureId: "capture-1",
  fingerprint: "fingerprint-1",
  checksum: "checksum-1",
  intent: "evidence",
  kind: "image",
});
assert.equal(claimed.operationId, "op-1");
assert.equal(claimed.state, "received");

const savedOperation = await adapters.operations.save({
  ...claimed,
  state: "binary_stored",
  attempts: 1,
  storagePath: "owner/captures/image.jpg",
  updatedAt: "2026-07-27T12:01:00.000Z",
});
assert.equal(savedOperation.storagePath, "owner/captures/image.jpg");

const savedCapture = await adapters.catalog.upsert({
  captureId: "capture-1",
  participantId: "principal",
  intent: "evidence",
  kind: "image",
  occurredAt: "2026-07-27T12:00:00.000Z",
  filename: "image.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 5,
  metadata: {},
  source: { app: "vibeapp" },
  checksum: "checksum-1",
  storagePath: "owner/captures/image.jpg",
  createdAt: "2026-07-27T12:00:00.000Z",
  updatedAt: "2026-07-27T12:01:00.000Z",
});
assert.equal(savedCapture.captureId, "capture-1");
assert.equal(savedCapture.storyStatus, "unassigned");
assert.equal("experienceId" in savedCapture, false);
assert.equal("eventId" in savedCapture, false);

console.log("Capture Supabase adapters: operation and capture mapping passed.");

function valueFromEq(value = "") {
  return String(value).replace(/^eq\./, "");
}
