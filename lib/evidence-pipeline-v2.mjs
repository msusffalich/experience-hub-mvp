import { createHash } from "node:crypto";

export const EVIDENCE_V2_STATES = Object.freeze({
  RECEIVED: "received",
  STORING_BINARY: "storing_binary",
  BINARY_STORED: "binary_stored",
  REGISTERING_ASSET: "registering_asset",
  ASSET_REGISTERED: "asset_registered",
  INBOX_COMPLETE: "inbox_complete",
  LINK_PENDING: "link_pending",
  LINKING: "linking",
  LINKED_COMPLETE: "linked_complete",
  FAILED_RETRYABLE: "failed_retryable",
  FAILED_TERMINAL: "failed_terminal",
  CONFLICT: "conflict",
});

const SUCCESS_STATES = new Set([
  EVIDENCE_V2_STATES.INBOX_COMPLETE,
  EVIDENCE_V2_STATES.LINK_PENDING,
  EVIDENCE_V2_STATES.LINKED_COMPLETE,
]);

export class EvidencePipelineError extends Error {
  constructor(code, detail, options = {}) {
    super(code);
    this.name = "EvidencePipelineError";
    this.code = code;
    this.detail = detail || code;
    this.retryable = options.retryable !== false;
    this.stage = options.stage || "";
    this.cause = options.cause;
  }
}

export function createEvidencePipelineV2({
  operations,
  storage,
  assets,
  experiences,
  clock = () => new Date().toISOString(),
}) {
  requireAdapter("operations", operations, ["claim", "findByKey", "findByAssetId", "save"]);
  requireAdapter("storage", storage, ["put", "exists"]);
  requireAdapter("assets", assets, ["findById", "upsertInbox", "listPending"]);
  requireAdapter("experiences", experiences, ["exists", "commit", "linkAssets"]);

  async function receiveEvidence(input = {}) {
    const command = normalizeEvidenceCommand(input);
    const claimed = await operations.claim(createOperation(command, clock()));
    const existing = claimed?.created ? null : claimed?.operation;
    let operation = claimed?.operation;
    if (
      existing &&
      (existing.assetId !== command.assetId || (existing.checksum && existing.checksum !== command.checksum))
    ) {
      throw new EvidencePipelineError(
        "evidence_idempotency_conflict",
        "La clave idempotente ya identifica otro archivo.",
        { retryable: false, stage: "validation" },
      );
    }
    if (existing && SUCCESS_STATES.has(existing.state)) {
      return buildReceiveResult(existing, await assets.findById(command.assetId));
    }

    try {
      operation = await transition(operations, operation, EVIDENCE_V2_STATES.STORING_BINARY, clock);
      const objectExists = await storage.exists(command.storagePath);
      if (!objectExists) {
        await storage.put(command.storagePath, command.bytes, {
          contentType: command.mimeType,
          assetId: command.assetId,
          idempotencyKey: command.idempotencyKey,
        });
      }
      if (!(await storage.exists(command.storagePath))) {
        throw new EvidencePipelineError(
          "evidence_binary_not_verified",
          "El archivo no pudo verificarse despues de guardarlo.",
          { stage: "storage" },
        );
      }

      operation = await transition(operations, operation, EVIDENCE_V2_STATES.BINARY_STORED, clock);
      operation = await transition(operations, operation, EVIDENCE_V2_STATES.REGISTERING_ASSET, clock);
      const existingAsset = await assets.findById(command.assetId);
      if (existingAsset?.checksum && existingAsset.checksum !== command.checksum) {
        throw new EvidencePipelineError(
          "evidence_asset_content_conflict",
          "El identificador del activo ya pertenece a otro contenido.",
          { retryable: false, stage: "asset" },
        );
      }
      if (existingAsset?.adoptionStatus === "adopted") {
        if (
          command.requestedExperienceId &&
          existingAsset.experienceId !== command.requestedExperienceId
        ) {
          throw new EvidencePipelineError(
            "evidence_asset_parent_conflict",
            "El activo ya esta vinculado a otra experiencia.",
            { retryable: false, stage: "asset" },
          );
        }
        operation = await transition(operations, operation, EVIDENCE_V2_STATES.ASSET_REGISTERED, clock);
        operation = await transition(operations, operation, EVIDENCE_V2_STATES.LINKED_COMPLETE, clock);
        return buildReceiveResult(operation, existingAsset);
      }
      const asset = await assets.upsertInbox({
        assetId: command.assetId,
        ownerUserId: command.ownerUserId,
        workspaceId: command.workspaceId,
        participantId: command.participantId,
        name: command.name,
        kind: command.kind,
        mimeType: command.mimeType,
        sizeBytes: command.bytes.length,
        storagePath: command.storagePath,
        capturedAt: command.capturedAt,
        sourceType: command.sourceType,
        sourceDevice: command.sourceDevice,
        checksum: command.checksum,
        adoptionStatus: "inbox",
        experienceId: null,
        eventId: null,
      });
      const persisted = await assets.findById(command.assetId);
      if (!persisted || persisted.experienceId || persisted.adoptionStatus !== "inbox") {
        throw new EvidencePipelineError(
          "evidence_asset_not_verified",
          "La evidencia no quedo registrada como pendiente.",
          { stage: "asset" },
        );
      }

      operation = await transition(operations, operation, EVIDENCE_V2_STATES.ASSET_REGISTERED, clock);
      if (!command.requestedExperienceId) {
        operation = await transition(operations, operation, EVIDENCE_V2_STATES.INBOX_COMPLETE, clock);
        return buildReceiveResult(operation, asset);
      }

      operation = await transition(operations, operation, EVIDENCE_V2_STATES.LINK_PENDING, clock);
      if (await experiences.exists(command.requestedExperienceId)) {
        try {
          operation = await transition(operations, operation, EVIDENCE_V2_STATES.LINKING, clock);
          await experiences.linkAssets(command.requestedExperienceId, [{
            assetId: command.assetId,
            eventId: command.requestedEventId || "",
          }]);
          const linkedAsset = await assets.findById(command.assetId);
          if (
            linkedAsset?.experienceId === command.requestedExperienceId &&
            linkedAsset?.adoptionStatus === "adopted" &&
            String(linkedAsset?.eventId || "") === String(command.requestedEventId || "")
          ) {
            operation = await transition(operations, operation, EVIDENCE_V2_STATES.LINKED_COMPLETE, clock);
            return buildReceiveResult(operation, linkedAsset);
          }
        } catch {
          // The binary and inbox row are already durable. A missing event or
          // transient link failure remains pending and is retried with the
          // experience graph; it must not turn a successful upload into 502.
        }
        operation = await transition(operations, operation, EVIDENCE_V2_STATES.LINK_PENDING, clock);
      }
      return buildReceiveResult(operation, asset);
    } catch (error) {
      const pipelineError = asPipelineError(error);
      operation = await failOperation(operations, operation, pipelineError, clock);
      throw pipelineError;
    }
  }

  async function saveExperience(input = {}) {
    const command = normalizeExperienceCommand(input);
    const operationByAsset = new Map();
    for (const link of command.assetLinks) {
      const operation = await findOperationForAsset(operations, command.ownerUserId, link.assetId);
      if (!operation) {
        throw new EvidencePipelineError(
          "evidence_operation_not_found",
          `No existe una operacion durable para el activo ${link.assetId}.`,
          { stage: "link" },
        );
      }
      const asset = await assets.findById(link.assetId);
      if (!asset) {
        throw new EvidencePipelineError(
          "evidence_asset_not_found",
          `No existe la evidencia ${link.assetId}.`,
          { stage: "link" },
        );
      }
      operationByAsset.set(link.assetId, operation);
    }

    let linkingOperations = [];
    try {
      for (const operation of operationByAsset.values()) {
        linkingOperations.push(
          await transition(operations, operation, EVIDENCE_V2_STATES.LINKING, clock, {
            requestedExperienceId: command.experience.id,
          }),
        );
      }
      await experiences.commit(command.experience, command.events, command.assetLinks);
      if (!(await experiences.exists(command.experience.id))) {
        throw new EvidencePipelineError(
          "evidence_experience_not_verified",
          "La experiencia no pudo verificarse despues de guardarla.",
          { stage: "experience" },
        );
      }

      const verified = [];
      for (const link of command.assetLinks) {
        const asset = await assets.findById(link.assetId);
        if (
          !asset ||
          asset.experienceId !== command.experience.id ||
          asset.adoptionStatus !== "adopted" ||
          String(asset.eventId || "") !== String(link.eventId || "")
        ) {
          throw new EvidencePipelineError(
            "evidence_link_not_verified",
            `El activo ${link.assetId} no quedo vinculado al padre esperado.`,
            { stage: "link" },
          );
        }
        verified.push(asset);
        const operation = operationByAsset.get(link.assetId);
        await transition(operations, operation, EVIDENCE_V2_STATES.LINKED_COMPLETE, clock, {
          requestedExperienceId: command.experience.id,
          requestedEventId: link.eventId || "",
        });
      }

      return {
        ok: true,
        experienceId: command.experience.id,
        experienceStatus: "stored",
        eventsStatus: "stored",
        evidence: {
          expected: command.assetLinks.length,
          linked: verified.length,
          pending: command.assetLinks.length - verified.length,
        },
        assets: verified,
      };
    } catch (error) {
      const pipelineError = asPipelineError(error, "experience_commit");
      for (const operation of linkingOperations) {
        await failOperation(operations, operation, pipelineError, clock);
      }
      throw pipelineError;
    }
  }

  async function reconcilePending({ ownerUserId, experienceId = "" } = {}) {
    const pending = await assets.listPending(ownerUserId);
    const result = { inspected: pending.length, linked: 0, stillPending: 0, failed: 0 };
    for (const asset of pending) {
      const operation = await findOperationForAsset(operations, ownerUserId, asset.assetId);
      const requestedExperienceId = operation?.requestedExperienceId || "";
      if (experienceId && requestedExperienceId !== experienceId) {
        result.stillPending += 1;
        continue;
      }
      if (!operation || !requestedExperienceId || !(await experiences.exists(requestedExperienceId))) {
        result.stillPending += 1;
        continue;
      }
      try {
        await experiences.linkAssets(requestedExperienceId, [{
          assetId: operation.assetId,
          eventId: operation.requestedEventId || "",
        }]);
        const verified = await assets.findById(operation.assetId);
        if (!verified || verified.experienceId !== requestedExperienceId || verified.adoptionStatus !== "adopted") {
          throw new EvidencePipelineError(
            "evidence_link_not_verified",
            `El activo ${operation.assetId} no quedo vinculado al padre esperado.`,
            { stage: "reconcile" },
          );
        }
        await transition(operations, operation, EVIDENCE_V2_STATES.LINKED_COMPLETE, clock);
        result.linked += 1;
      } catch {
        result.failed += 1;
      }
    }
    return result;
  }

  return {
    receiveEvidence,
    saveExperience,
    reconcilePending,
  };
}

function normalizeEvidenceCommand(input) {
  const bytes = toBytes(input.bytes);
  const assetId = requiredText(input.assetId, "assetId");
  const ownerUserId = requiredText(input.ownerUserId, "ownerUserId");
  const idempotencyKey = requiredText(input.idempotencyKey, "idempotencyKey");
  const name = requiredText(input.name, "name");
  const mimeType = requiredText(input.mimeType, "mimeType");
  if (!bytes.length) {
    throw new EvidencePipelineError("invalid_media_payload", "El archivo esta vacio.", {
      retryable: false,
      stage: "validation",
    });
  }
  return {
    assetId,
    ownerUserId,
    workspaceId: requiredText(input.workspaceId, "workspaceId"),
    participantId: String(input.participantId || ""),
    idempotencyKey,
    name,
    mimeType,
    kind: String(input.kind || inferKind(mimeType)),
    bytes,
    storagePath: String(input.storagePath || `${ownerUserId}/${assetId}/${safeName(name)}`),
    capturedAt: String(input.capturedAt || new Date().toISOString()),
    sourceType: String(input.sourceType || "vibeapp-native"),
    sourceDevice: String(input.sourceDevice || ""),
    requestedExperienceId: String(input.requestedExperienceId || ""),
    requestedEventId: String(input.requestedEventId || ""),
    checksum: createHash("sha256").update(bytes).digest("hex"),
  };
}

function normalizeExperienceCommand(input) {
  const experience = input.experience && typeof input.experience === "object" ? input.experience : {};
  requiredText(experience.id, "experience.id");
  return {
    ownerUserId: requiredText(input.ownerUserId, "ownerUserId"),
    experience,
    events: Array.isArray(input.events) ? input.events : [],
    assetLinks: (Array.isArray(input.assetLinks) ? input.assetLinks : []).map((link) => ({
      assetId: requiredText(link.assetId, "assetLinks.assetId"),
      eventId: String(link.eventId || ""),
    })),
  };
}

function createOperation(command, now) {
  return {
    operationId: `op:${command.ownerUserId}:${command.idempotencyKey}`,
    idempotencyKey: command.idempotencyKey,
    assetId: command.assetId,
    ownerUserId: command.ownerUserId,
    workspaceId: command.workspaceId,
    requestedExperienceId: command.requestedExperienceId,
    requestedEventId: command.requestedEventId,
    checksum: command.checksum,
    storagePath: command.storagePath,
    state: EVIDENCE_V2_STATES.RECEIVED,
    attemptCount: 0,
    lastErrorCode: "",
    lastErrorDetail: "",
    createdAt: now,
    updatedAt: now,
    completedAt: "",
  };
}

async function transition(operations, operation, state, clock, extra = {}) {
  const now = clock();
  const updated = {
    ...operation,
    ...extra,
    state,
    attemptCount: Number(operation.attemptCount || 0) + 1,
    lastErrorCode: "",
    lastErrorDetail: "",
    updatedAt: now,
    completedAt: SUCCESS_STATES.has(state) ? now : "",
  };
  return operations.save(updated);
}

async function failOperation(operations, operation, error, clock) {
  if (!operation) return null;
  return operations.save({
    ...operation,
    state: error.retryable ? EVIDENCE_V2_STATES.FAILED_RETRYABLE : EVIDENCE_V2_STATES.FAILED_TERMINAL,
    attemptCount: Number(operation.attemptCount || 0) + 1,
    lastErrorCode: error.code,
    lastErrorDetail: error.detail,
    updatedAt: clock(),
    completedAt: "",
  });
}

async function findOperationForAsset(operations, ownerUserId, assetId) {
  return operations.findByAssetId(ownerUserId, assetId);
}

function buildReceiveResult(operation, asset) {
  return {
    ok: true,
    operationId: operation.operationId,
    assetId: operation.assetId,
    storageStatus: "stored",
    evidenceStatus: asset ? "registered" : "missing",
    linkStatus:
      operation.state === EVIDENCE_V2_STATES.LINKED_COMPLETE
        ? "linked"
        : operation.state === EVIDENCE_V2_STATES.LINK_PENDING
          ? "pending_parent"
          : "inbox",
    retryRequired: false,
    operationState: operation.state,
    completedAt: operation.completedAt || "",
    asset,
  };
}

function asPipelineError(error, stage = "") {
  if (error instanceof EvidencePipelineError) return error;
  return new EvidencePipelineError(
    "evidence_pipeline_failed",
    String(error?.message || error || "evidence_pipeline_failed"),
    { stage, cause: error },
  );
}

function requiredText(value, field) {
  const clean = String(value || "").trim();
  if (!clean) {
    throw new EvidencePipelineError("invalid_evidence_command", `Falta ${field}.`, {
      retryable: false,
      stage: "validation",
    });
  }
  return clean;
}

function requireAdapter(name, adapter, methods) {
  for (const method of methods) {
    if (typeof adapter?.[method] !== "function") {
      throw new TypeError(`${name}.${method} is required`);
    }
  }
}

function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") return new TextEncoder().encode(value);
  return new Uint8Array();
}

function inferKind(mimeType) {
  if (mimeType.startsWith("text/")) return "text";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

function safeName(value) {
  return String(value || "media").replace(/[^A-Za-z0-9._-]+/g, "-");
}
