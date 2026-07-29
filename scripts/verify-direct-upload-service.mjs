import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  DIRECT_UPLOAD_BINARY_KINDS,
  DIRECT_UPLOAD_THRESHOLD_BYTES,
} from "../lib/capture/direct-upload-contract.mjs";
import { createDirectUploadService } from "../lib/capture/direct-upload-service.mjs";

const NOW = "2026-07-29T20:00:00.000Z";
const OWNER = "11111111-1111-4111-8111-111111111111";
const WORKSPACE = "22222222-2222-4222-8222-222222222222";

for (const kind of DIRECT_UPLOAD_BINARY_KINDS) {
  const fixture = createFixture();
  const body = Buffer.from(`direct-upload-${kind}`);
  const command = captureCommand(kind, body);
  const authorization = await fixture.service.authorize(command);

  assert.equal(authorization.uploadRequired, true, `${kind}: debe pedir carga`);
  assert.equal(authorization.state, "storing", `${kind}: estado storing`);
  assert.match(authorization.upload.signedUrl, /^https:\/\/storage\.example\//);

  fixture.storeObject(authorization.upload.path, body, command.mimeType);
  const committed = await fixture.service.commit(command);
  assert.equal(committed.ok, true, `${kind}: commit durable`);
  assert.equal(committed.state, "complete", `${kind}: estado complete`);
  assert.equal(fixture.catalogRows.size, 1, `${kind}: un registro`);

  const duplicate = await fixture.service.commit(command);
  assert.equal(duplicate.duplicate, true, `${kind}: reintento idempotente`);
  assert.equal(fixture.catalogRows.size, 1, `${kind}: sin duplicados`);
}

{
  const fixture = createFixture();
  const body = Buffer.alloc(DIRECT_UPLOAD_THRESHOLD_BYTES + 1, 7);
  const command = captureCommand("video", body, {
    captureId: "capture-large-video",
    idempotencyKey: "operation-large-video",
    mimeType: "video/mp4",
  });
  const result = await fixture.service.authorize(command);
  assert.equal(result.upload.mode, "resumable");
  assert.equal(result.upload.method, "PATCH");
  assert.equal(result.upload.headers["Tus-Resumable"], "1.0.0");
  assert.match(result.upload.tusEndpoint, /resumable$/);
}

{
  const fixture = createFixture();
  const body = Buffer.from("offline-retry");
  const command = captureCommand("image", body, {
    captureId: "capture-offline",
    idempotencyKey: "operation-offline",
  });
  const first = await fixture.service.authorize(command);
  const second = await fixture.service.authorize(command);
  assert.equal(second.captureId, first.captureId);
  assert.equal(fixture.operationRows.size, 1);
  assert.equal(fixture.operationRows.get(command.idempotencyKey).attempts, 2);

  await assert.rejects(
    fixture.service.commit(command),
    (error) => error.code === "capture_binary_not_found" && error.retryable === true,
  );
  assert.equal(fixture.operationRows.get(command.idempotencyKey).state, "retry_pending");

  fixture.storeObject(first.upload.path, body, command.mimeType);
  const recovered = await fixture.service.commit(command);
  assert.equal(recovered.ok, true);
}

{
  const fixture = createFixture();
  const body = Buffer.from("size-mismatch");
  const command = captureCommand("document", body, {
    captureId: "capture-size",
    idempotencyKey: "operation-size",
    mimeType: "application/pdf",
  });
  const authorization = await fixture.service.authorize(command);
  fixture.objectRows.set(authorization.upload.path, {
    sizeBytes: body.length + 1,
    mimeType: command.mimeType,
  });
  await assert.rejects(
    fixture.service.commit(command),
    (error) => error.code === "capture_storage_size_mismatch" && error.retryable === false,
  );
  assert.equal(fixture.operationRows.get(command.idempotencyKey).state, "needs_attention");
}

{
  const fixture = createFixture();
  const body = Buffer.from("first");
  const command = captureCommand("audio", body, {
    captureId: "capture-conflict",
    idempotencyKey: "operation-conflict",
    mimeType: "audio/mp4",
  });
  await fixture.service.authorize(command);
  const other = captureCommand("audio", Buffer.from("different"), {
    captureId: command.captureId,
    idempotencyKey: command.idempotencyKey,
    mimeType: command.mimeType,
  });
  await assert.rejects(
    fixture.service.authorize(other),
    (error) => error.code === "capture_idempotency_conflict" && error.retryable === false,
  );
}

console.log("Direct upload service: OK");

function createFixture() {
  const operationRows = new Map();
  const catalogRows = new Map();
  const objectRows = new Map();
  const operations = {
    async claim(seed) {
      if (!operationRows.has(seed.operationId)) operationRows.set(seed.operationId, structuredClone(seed));
      return structuredClone(operationRows.get(seed.operationId));
    },
    async get(operationId) {
      return clone(operationRows.get(operationId));
    },
    async save(value) {
      operationRows.set(value.operationId, structuredClone(value));
      return structuredClone(value);
    },
  };
  const catalog = {
    async get(captureId) {
      return clone(catalogRows.get(captureId));
    },
    async upsert(value) {
      const persisted = structuredClone(value);
      catalogRows.set(value.captureId, persisted);
      return persisted;
    },
  };
  const storage = {
    async stat(storagePath) {
      return clone(objectRows.get(storagePath));
    },
    async createSignedUpload(storagePath, metadata) {
      return {
        bucket: "experience-media",
        signedUrl: `https://storage.example/${encodeURIComponent(storagePath)}?token=test-token`,
        token: "test-token",
        tusEndpoint: "https://storage.example/resumable",
        tusMetadata: `captureId ${Buffer.from(metadata.captureId).toString("base64")}`,
        expiresAt: "2026-07-29T22:00:00.000Z",
        chunkBytes: DIRECT_UPLOAD_THRESHOLD_BYTES,
      };
    },
  };
  return {
    service: createDirectUploadService({
      operations,
      storage,
      catalog,
      maxFileBytes: 110 * 1024 * 1024,
      clock: () => NOW,
    }),
    operationRows,
    catalogRows,
    objectRows,
    storeObject(storagePath, bytes, mimeType) {
      objectRows.set(storagePath, {
        sizeBytes: bytes.length,
        mimeType,
      });
    },
  };
}

function captureCommand(kind, bytes, patch = {}) {
  const intent = kind === "biometric" || kind === "sensor" ? "context" : "evidence";
  const mimeByKind = {
    image: "image/jpeg",
    audio: "audio/mp4",
    video: "video/mp4",
    document: "application/pdf",
    biometric: "text/csv",
    sensor: "application/json",
  };
  const extension = {
    image: "jpg",
    audio: "m4a",
    video: "mp4",
    document: "pdf",
    biometric: "csv",
    sensor: "json",
  };
  const captureId = patch.captureId || `capture-${kind}`;
  return {
    captureId,
    idempotencyKey: patch.idempotencyKey || `operation-${kind}`,
    ownerUserId: OWNER,
    workspaceId: WORKSPACE,
    intent,
    kind,
    occurredAt: NOW,
    filename: `${captureId}.${extension[kind]}`,
    mimeType: patch.mimeType || mimeByKind[kind],
    sizeBytes: bytes.length,
    checksum: createHash("sha256").update(bytes).digest("hex"),
    source: {
      app: "vibeapp",
      platform: "ios",
      capturedOffline: patch.capturedOffline === true,
    },
    metadata: {
      test: true,
    },
  };
}

function clone(value) {
  return value == null ? null : structuredClone(value);
}
