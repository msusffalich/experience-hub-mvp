import { normalizeCaptureCommand } from "./capture-contract.mjs";

export const CAPTURE_STATES = Object.freeze({
  RECEIVED: "received",
  STORING: "storing",
  BINARY_STORED: "binary_stored",
  CATALOGING: "cataloging",
  COMPLETE: "complete",
  RETRY_PENDING: "retry_pending",
  NEEDS_ATTENTION: "needs_attention",
});

export class CapturePipelineError extends Error {
  constructor(code, detail, options = {}) {
    super(code);
    this.name = "CapturePipelineError";
    this.code = code;
    this.detail = detail || code;
    this.retryable = options.retryable !== false;
    this.stage = options.stage || "";
    this.operation = options.operation || null;
    this.cause = options.cause;
  }
}

export function createCaptureOrchestrator({
  operations,
  storage,
  catalog,
  clock = () => new Date().toISOString(),
}) {
  requireAdapter("operations", operations, ["claim", "get", "save"]);
  requireAdapter("storage", storage, ["exists", "put"]);
  requireAdapter("catalog", catalog, ["get", "upsert"]);

  async function accept(input = {}) {
    const command = normalizeCaptureCommand(input);
    let operation = await operations.claim({
      operationId: command.operationId,
      idempotencyKey: command.idempotencyKey,
      captureId: command.captureId,
      ownerUserId: command.ownerUserId,
      fingerprint: command.fingerprint,
      checksum: command.checksum,
      intent: command.intent,
      kind: command.kind,
      state: CAPTURE_STATES.RECEIVED,
      attempts: 0,
      createdAt: clock(),
      updatedAt: clock(),
      lastError: null,
    });

    if (operation.fingerprint !== command.fingerprint || operation.captureId !== command.captureId) {
      throw new CapturePipelineError(
        "capture_idempotency_conflict",
        "La clave de reintento ya pertenece a otra captura.",
        { retryable: false, stage: "validation", operation },
      );
    }

    const existing = await catalog.get(command.captureId);
    if (operation.state === CAPTURE_STATES.COMPLETE && existing) {
      return receipt(operation, existing, true);
    }

    try {
      operation = await transition(operations, operation, CAPTURE_STATES.RECEIVED, clock, {
        attempts: Number(operation.attempts || 0) + 1,
        lastError: null,
      });

      let storagePath = String(operation.storagePath || "");
      if (command.bytes.length > 0) {
        storagePath = storagePath || buildStoragePath(command);
        operation = await transition(operations, operation, CAPTURE_STATES.STORING, clock, { storagePath });
        if (!(await storage.exists(storagePath))) {
          await storage.put(storagePath, command.bytes, {
            checksum: command.checksum,
            mimeType: command.mimeType,
            captureId: command.captureId,
          });
        }
        if (!(await storage.exists(storagePath))) {
          throw new CapturePipelineError(
            "capture_binary_not_verified",
            "El archivo no pudo verificarse despues de guardarlo.",
            { stage: "storage" },
          );
        }
        operation = await transition(operations, operation, CAPTURE_STATES.BINARY_STORED, clock, { storagePath });
      }

      operation = await transition(operations, operation, CAPTURE_STATES.CATALOGING, clock, { storagePath });
      const prior = await catalog.get(command.captureId);
      if (prior?.checksum && prior.checksum !== command.checksum) {
        throw new CapturePipelineError(
          "capture_content_conflict",
          "El identificador de captura ya pertenece a otro contenido.",
          { retryable: false, stage: "catalog" },
        );
      }
      const record = await catalog.upsert({
        captureId: command.captureId,
        ownerUserId: command.ownerUserId,
        workspaceId: command.workspaceId,
        participantId: command.participantId,
        intent: command.intent,
        kind: command.kind,
        occurredAt: command.occurredAt,
        text: command.text,
        filename: command.filename,
        mimeType: command.mimeType,
        sizeBytes: command.bytes.length || Number(prior?.sizeBytes || 0),
        metadata: command.metadata,
        source: command.source,
        checksum: command.checksum,
        storagePath,
        storyStatus: "unassigned",
        createdAt: prior?.createdAt || clock(),
        updatedAt: clock(),
      });
      const verified = await catalog.get(command.captureId);
      if (!verified || verified.checksum !== command.checksum || verified.storyStatus !== "unassigned") {
        throw new CapturePipelineError(
          "capture_catalog_not_verified",
          "La captura no quedo registrada como evidencia o contexto independiente.",
          { stage: "catalog" },
        );
      }

      operation = await transition(operations, operation, CAPTURE_STATES.COMPLETE, clock, {
        storagePath,
        lastError: null,
      });
      return receipt(operation, record || verified, false);
    } catch (error) {
      const pipelineError = asPipelineError(error);
      const failureState = pipelineError.retryable
        ? CAPTURE_STATES.RETRY_PENDING
        : CAPTURE_STATES.NEEDS_ATTENTION;
      operation = await transition(operations, operation, failureState, clock, {
        lastError: {
          code: pipelineError.code,
          detail: pipelineError.detail,
          stage: pipelineError.stage,
          at: clock(),
        },
      });
      pipelineError.operation = operation;
      throw pipelineError;
    }
  }

  async function getReceipt(operationId) {
    const operation = await operations.get(operationId);
    if (!operation) return null;
    const record = operation.captureId ? await catalog.get(operation.captureId) : null;
    return receipt(operation, record, false);
  }

  return { accept, getReceipt };
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

async function transition(operations, operation, state, clock, patch = {}) {
  return operations.save({
    ...operation,
    ...patch,
    state,
    updatedAt: clock(),
  });
}

function buildStoragePath(command) {
  const safeName = (command.filename || `${command.captureId}.bin`)
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(-180);
  return [
    command.ownerUserId,
    "captures",
    command.occurredAt.slice(0, 10),
    command.captureId,
    safeName,
  ].map(encodeURIComponent).join("/");
}

function asPipelineError(error) {
  if (error instanceof CapturePipelineError) return error;
  return new CapturePipelineError(
    "capture_pipeline_failed",
    String(error?.message || error || "capture_pipeline_failed"),
    { stage: "unknown", cause: error },
  );
}

function requireAdapter(name, adapter, methods) {
  for (const method of methods) {
    if (typeof adapter?.[method] !== "function") {
      throw new TypeError(`${name}.${method} is required`);
    }
  }
}
