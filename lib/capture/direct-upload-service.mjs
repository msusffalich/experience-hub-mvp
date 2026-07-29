import {
  buildDirectUploadStoragePath,
  normalizeDirectUploadCommand,
} from "./direct-upload-contract.mjs";
import {
  CAPTURE_STATES,
  CapturePipelineError,
} from "./capture-orchestrator.mjs";

export function createDirectUploadService({
  operations,
  storage,
  catalog,
  maxFileBytes,
  clock = () => new Date().toISOString(),
}) {
  requireAdapter("operations", operations, ["claim", "get", "save"]);
  requireAdapter("storage", storage, ["stat", "createSignedUpload"]);
  requireAdapter("catalog", catalog, ["get", "upsert"]);

  async function authorize(input = {}) {
    const command = normalizeAndLimit(input, maxFileBytes);
    let operation = await stage("ledger", "capture_operation_claim_failed", () =>
      operations.claim(operationSeed(command, clock())));
    assertMatchingOperation(operation, command);

    const existingRecord = await stage(
      "catalog",
      "capture_catalog_read_failed",
      () => catalog.get(command.captureId),
    );
    if (operation.state === CAPTURE_STATES.COMPLETE && existingRecord) {
      return {
        ...receipt(operation, existingRecord, true),
        uploadRequired: false,
        upload: null,
      };
    }

    const storagePath = operation.storagePath || buildDirectUploadStoragePath(command);
    const stored = await stage(
      "storage",
      "capture_storage_check_failed",
      () => storage.stat(storagePath),
    );
    if (stored) verifyStoredObject(stored, command);

    operation = await operations.save({
      ...operation,
      state: stored ? CAPTURE_STATES.BINARY_STORED : CAPTURE_STATES.STORING,
      storagePath,
      attempts: Number(operation.attempts || 0) + 1,
      lastError: null,
      updatedAt: clock(),
    });

    if (stored) {
      return {
        ...receipt(operation, null, false),
        uploadRequired: false,
        upload: {
          mode: command.uploadMode,
          path: storagePath,
          alreadyPresent: true,
        },
      };
    }

    const signed = await stage(
      "authorization",
      "capture_upload_authorization_failed",
      () => storage.createSignedUpload(storagePath, {
        captureId: command.captureId,
        checksum: command.checksum,
        contentType: command.mimeType,
        sizeBytes: command.sizeBytes,
        uploadMode: command.uploadMode,
      }),
    );
    return {
      ...receipt(operation, null, false),
      uploadRequired: true,
      upload: {
        mode: command.uploadMode,
        path: storagePath,
        bucket: signed.bucket,
        signedUrl: signed.signedUrl,
        token: signed.token,
        tusEndpoint: signed.tusEndpoint || "",
        expiresAt: signed.expiresAt,
        method: command.uploadMode === "standard" ? "PUT" : "PATCH",
        headers: command.uploadMode === "standard"
          ? { "Content-Type": command.mimeType }
          : {
              "x-signature": signed.token,
              "Upload-Metadata": signed.tusMetadata || "",
              "Tus-Resumable": "1.0.0",
            },
        chunkBytes: signed.chunkBytes || 0,
      },
    };
  }

  async function commit(input = {}) {
    const command = normalizeAndLimit(input, maxFileBytes);
    let operation = await stage(
      "ledger",
      "capture_operation_read_failed",
      () => operations.get(command.operationId),
    );
    if (!operation) {
      operation = await stage(
        "ledger",
        "capture_operation_claim_failed",
        () => operations.claim(operationSeed(command, clock())),
      );
    }
    assertMatchingOperation(operation, command);

    const prior = await stage(
      "catalog",
      "capture_catalog_read_failed",
      () => catalog.get(command.captureId),
    );
    if (operation.state === CAPTURE_STATES.COMPLETE && prior) {
      return receipt(operation, prior, true);
    }

    const storagePath = operation.storagePath || buildDirectUploadStoragePath(command);
    try {
      const stored = await stage(
        "storage",
        "capture_storage_verify_failed",
        () => storage.stat(storagePath),
      );
      if (!stored) {
        throw new CapturePipelineError(
          "capture_binary_not_found",
          "El archivo aun no aparece en el almacenamiento privado.",
          { stage: "storage" },
        );
      }
      verifyStoredObject(stored, command);
      operation = await operations.save({
        ...operation,
        state: CAPTURE_STATES.BINARY_STORED,
        storagePath,
        lastError: null,
        updatedAt: clock(),
      });
      operation = await operations.save({
        ...operation,
        state: CAPTURE_STATES.CATALOGING,
        updatedAt: clock(),
      });
      const record = await stage(
        "catalog",
        "capture_catalog_write_failed",
        () => catalog.upsert({
          captureId: command.captureId,
          ownerUserId: command.ownerUserId,
          workspaceId: command.workspaceId,
          participantId: command.participantId,
          intent: command.intent,
          kind: command.kind,
          occurredAt: command.occurredAt,
          text: "",
          filename: command.filename,
          mimeType: command.mimeType,
          sizeBytes: command.sizeBytes,
          metadata: {
            ...command.metadata,
            uploadMode: command.uploadMode,
            integrity: {
              algorithm: "sha256",
              clientChecksum: command.checksum,
              objectSizeVerified: true,
              objectMimeVerified: Boolean(stored.mimeType),
            },
          },
          source: command.source,
          checksum: command.checksum,
          storagePath,
          storyStatus: "unassigned",
          createdAt: prior?.createdAt || clock(),
          updatedAt: clock(),
        }),
      );
      const verified = await stage(
        "catalog",
        "capture_catalog_verify_failed",
        () => catalog.get(command.captureId),
      );
      if (
        !verified ||
        verified.checksum !== command.checksum ||
        Number(verified.sizeBytes || 0) !== command.sizeBytes ||
        verified.storyStatus !== "unassigned"
      ) {
        throw new CapturePipelineError(
          "capture_catalog_not_verified",
          "La evidencia no quedo confirmada en el catalogo.",
          { stage: "catalog" },
        );
      }
      operation = await operations.save({
        ...operation,
        state: CAPTURE_STATES.COMPLETE,
        storagePath,
        lastError: null,
        updatedAt: clock(),
      });
      return receipt(operation, record || verified, false);
    } catch (error) {
      const failure = asPipelineError(error);
      operation = await operations.save({
        ...operation,
        state: failure.retryable === false
          ? CAPTURE_STATES.NEEDS_ATTENTION
          : CAPTURE_STATES.RETRY_PENDING,
        lastError: {
          code: failure.code,
          detail: failure.detail,
          stage: failure.stage,
          at: clock(),
        },
        updatedAt: clock(),
      });
      failure.operation = operation;
      throw failure;
    }
  }

  return { authorize, commit };
}

function normalizeAndLimit(input, maxFileBytes) {
  const command = normalizeDirectUploadCommand(input);
  if (command.sizeBytes > maxFileBytes) {
    throw new CapturePipelineError(
      "capture_file_too_large",
      `El archivo supera el limite de ${maxFileBytes} bytes.`,
      { retryable: false, stage: "validation" },
    );
  }
  return command;
}

function operationSeed(command, now) {
  return {
    operationId: command.operationId,
    idempotencyKey: command.idempotencyKey,
    captureId: command.captureId,
    ownerUserId: command.ownerUserId,
    workspaceId: command.workspaceId,
    fingerprint: command.fingerprint,
    checksum: command.checksum,
    intent: command.intent,
    kind: command.kind,
    state: CAPTURE_STATES.RECEIVED,
    attempts: 0,
    storagePath: "",
    createdAt: now,
    updatedAt: now,
    lastError: null,
  };
}

function assertMatchingOperation(operation, command) {
  if (
    operation.captureId !== command.captureId ||
    operation.fingerprint !== command.fingerprint ||
    operation.checksum !== command.checksum
  ) {
    throw new CapturePipelineError(
      "capture_idempotency_conflict",
      "La clave de reintento ya pertenece a otro archivo o metadato.",
      { retryable: false, stage: "validation", operation },
    );
  }
}

function verifyStoredObject(stored, command) {
  const storedSize = Number(stored.sizeBytes ?? stored.size ?? -1);
  if (storedSize !== command.sizeBytes) {
    throw new CapturePipelineError(
      "capture_storage_size_mismatch",
      `Storage reporta ${storedSize} bytes y la captura declara ${command.sizeBytes}.`,
      { retryable: false, stage: "storage" },
    );
  }
  const storedMime = String(stored.mimeType || stored.contentType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const expectedMime = command.mimeType.split(";")[0].trim().toLowerCase();
  if (storedMime && storedMime !== expectedMime) {
    throw new CapturePipelineError(
      "capture_storage_mime_mismatch",
      `Storage reporta ${storedMime} y la captura declara ${expectedMime}.`,
      { retryable: false, stage: "storage" },
    );
  }
}

function receipt(operation, record, duplicate) {
  const complete = operation.state === CAPTURE_STATES.COMPLETE && Boolean(record);
  return {
    ok: complete,
    accepted: complete,
    durable: complete,
    duplicate,
    operationId: operation.operationId,
    captureId: operation.captureId,
    intent: operation.intent,
    kind: operation.kind,
    state: operation.state,
    retryable: operation.state === CAPTURE_STATES.RETRY_PENDING,
    needsAttention: operation.state === CAPTURE_STATES.NEEDS_ATTENTION,
    storagePath: record?.storagePath || operation.storagePath || "",
    recordedAt: record?.updatedAt || operation.updatedAt,
    lastError: operation.lastError || null,
  };
}

function asPipelineError(error) {
  if (error instanceof CapturePipelineError) return error;
  return new CapturePipelineError(
    "capture_direct_upload_failed",
    String(error?.message || error || "capture_direct_upload_failed"),
    { stage: "unknown", cause: error },
  );
}

async function stage(stageName, code, action) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof CapturePipelineError) throw error;
    throw new CapturePipelineError(
      code,
      String(error?.message || error || code),
      { stage: stageName, cause: error },
    );
  }
}

function requireAdapter(name, adapter, methods) {
  for (const method of methods) {
    if (typeof adapter?.[method] !== "function") {
      throw new TypeError(`${name}.${method} is required`);
    }
  }
}
