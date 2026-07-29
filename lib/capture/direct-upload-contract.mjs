import { createHash } from "node:crypto";
import {
  CAPTURE_INTENTS,
  CONTEXT_KINDS,
  EVIDENCE_KINDS,
  CaptureContractError,
  assertNoStoryFields,
} from "./capture-contract.mjs";

export const DIRECT_UPLOAD_CONTRACT_VERSION = "2026-07-29.1";
export const DIRECT_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024;
export const DIRECT_UPLOAD_BINARY_KINDS = Object.freeze([
  "image",
  "audio",
  "video",
  "document",
  "biometric",
  "sensor",
]);

export function normalizeDirectUploadCommand(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new CaptureContractError("capture_payload_required");
  }
  assertNoStoryFields(input);

  const intent = token(input.intent);
  if (!Object.values(CAPTURE_INTENTS).includes(intent)) {
    throw new CaptureContractError(
      "capture_intent_invalid",
      "La captura debe declarar intent=evidence o intent=context.",
    );
  }

  const kind = token(input.kind || input.type);
  const allowedKinds = intent === CAPTURE_INTENTS.EVIDENCE ? EVIDENCE_KINDS : CONTEXT_KINDS;
  if (!allowedKinds.includes(kind) || !DIRECT_UPLOAD_BINARY_KINDS.includes(kind)) {
    throw new CaptureContractError(
      "capture_direct_upload_kind_invalid",
      `El tipo ${kind || "(vacio)"} no admite carga binaria directa para ${intent}.`,
    );
  }

  const captureId = required(input.captureId || input.id, "capture_id_required", 160);
  const idempotencyKey = required(
    input.idempotencyKey,
    "capture_idempotency_key_required",
    220,
  );
  const ownerUserId = required(input.ownerUserId, "capture_owner_required", 160);
  const workspaceId = required(input.workspaceId, "capture_workspace_required", 160);
  const participantId = text(input.participantId || input.groupId, 160);
  const occurredAt = dateValue(
    required(input.occurredAt || input.capturedAt, "capture_occurred_at_required", 80),
  );
  const filename = safeFilename(
    required(input.filename || input.name, "capture_filename_required", 260),
  );
  const mimeType = required(input.mimeType, "capture_mime_type_required", 160).toLowerCase();
  const sizeBytes = integer(input.sizeBytes ?? input.size, "capture_size_required");
  if (sizeBytes <= 0) {
    throw new CaptureContractError(
      "capture_size_invalid",
      "El archivo debe declarar un tamaño mayor que cero.",
    );
  }

  const checksum = required(
    input.checksum || input.sha256,
    "capture_checksum_required",
    128,
  ).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(checksum)) {
    throw new CaptureContractError(
      "capture_checksum_invalid",
      "La carga directa requiere el SHA-256 completo del archivo.",
    );
  }

  const metadata = objectValue(input.metadata);
  const source = sourceValue(input.source, input.sourceType, input.sourceDevice);
  const uploadMode = normalizeUploadMode(input.uploadMode, sizeBytes);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({
      captureId,
      ownerUserId,
      workspaceId,
      intent,
      kind,
      occurredAt,
      filename,
      mimeType,
      sizeBytes,
      checksum,
    }))
    .digest("hex");

  return {
    operationId: idempotencyKey,
    idempotencyKey,
    captureId,
    ownerUserId,
    workspaceId,
    participantId,
    intent,
    kind,
    occurredAt,
    filename,
    mimeType,
    sizeBytes,
    checksum,
    fingerprint,
    metadata,
    source,
    uploadMode,
  };
}

export function buildDirectUploadStoragePath(command) {
  const owner = pathSegment(command.ownerUserId, 100);
  const capture = pathSegment(command.captureId, 160);
  const filename = safeFilename(command.filename);
  return `${owner}/captures/${command.occurredAt.slice(0, 10)}/${capture}/${filename}`;
}

export function directUploadContractSummary(maxFileBytes) {
  return {
    version: DIRECT_UPLOAD_CONTRACT_VERSION,
    authorizeEndpoint: "/api/captures/uploads",
    commitEndpoint: "/api/captures/commit",
    receiptEndpoint: "/api/captures/operations/{operationId}",
    binaryTransport: "direct_to_supabase_storage",
    standardUpload: {
      maxRecommendedBytes: DIRECT_UPLOAD_THRESHOLD_BYTES,
      method: "PUT",
    },
    resumableUpload: {
      minRecommendedBytes: DIRECT_UPLOAD_THRESHOLD_BYTES + 1,
      protocol: "tus",
      chunkBytes: DIRECT_UPLOAD_THRESHOLD_BYTES,
    },
    required: [
      "captureId",
      "idempotencyKey",
      "intent",
      "kind",
      "occurredAt",
      "filename",
      "mimeType",
      "sizeBytes",
      "checksum",
    ],
    maxFileBytes,
    successRule: "storage_verified_and_catalog_committed",
  };
}

function normalizeUploadMode(value, sizeBytes) {
  const requested = token(value);
  if (requested && !["standard", "resumable", "auto"].includes(requested)) {
    throw new CaptureContractError("capture_upload_mode_invalid");
  }
  if (requested === "standard" || requested === "resumable") return requested;
  return sizeBytes > DIRECT_UPLOAD_THRESHOLD_BYTES ? "resumable" : "standard";
}

function sourceValue(source, sourceType, sourceDevice) {
  const value = source && typeof source === "object" && !Array.isArray(source) ? source : {};
  return {
    app: text(value.app || sourceType || "vibeapp", 80),
    device: text(value.device || sourceDevice, 160),
    platform: text(value.platform, 80),
    capturedOffline: value.capturedOffline === true,
  };
}

function objectValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return structuredClone(value);
}

function safeFilename(value) {
  const normalized = String(value || "capture.bin")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(-200);
  return normalized || "capture.bin";
}

function pathSegment(value, maxLength) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLength) || "unknown";
}

function dateValue(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new CaptureContractError("capture_date_invalid", "La fecha de captura no es valida.");
  }
  return parsed.toISOString();
}

function integer(value, code) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new CaptureContractError(code);
  return parsed;
}

function required(value, code, maxLength) {
  const normalized = text(value, maxLength);
  if (!normalized) throw new CaptureContractError(code);
  return normalized;
}

function text(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function token(value) {
  return text(value, 80).toLowerCase();
}
