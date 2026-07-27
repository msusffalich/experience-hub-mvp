import { createHash } from "node:crypto";

export const CAPTURE_INTENTS = Object.freeze({
  EVIDENCE: "evidence",
  CONTEXT: "context",
});

export const EVIDENCE_KINDS = Object.freeze([
  "text",
  "image",
  "audio",
  "video",
  "document",
]);

export const CONTEXT_KINDS = Object.freeze([
  "biometric",
  "location",
  "weather",
  "news",
  "agenda",
  "sensor",
]);

const FORBIDDEN_STORY_KEYS = new Set([
  "experience",
  "experienceid",
  "event",
  "eventid",
  "events",
  "story",
  "storyid",
  "parentexperienceid",
  "requestedexperienceid",
  "requestedeventid",
]);

export class CaptureContractError extends Error {
  constructor(code, detail) {
    super(code);
    this.name = "CaptureContractError";
    this.code = code;
    this.detail = detail || code;
    this.retryable = false;
  }
}

export function normalizeCaptureCommand(input = {}) {
  assertObject(input, "capture_payload_required");
  assertNoStoryFields(input);

  const intent = normalizeToken(input.intent);
  if (!Object.values(CAPTURE_INTENTS).includes(intent)) {
    throw new CaptureContractError(
      "capture_intent_invalid",
      "La captura debe declarar intent=evidence o intent=context.",
    );
  }

  const kind = normalizeToken(input.kind || input.type);
  const allowedKinds = intent === CAPTURE_INTENTS.EVIDENCE ? EVIDENCE_KINDS : CONTEXT_KINDS;
  if (!allowedKinds.includes(kind)) {
    throw new CaptureContractError(
      "capture_kind_invalid",
      `El tipo ${kind || "(vacio)"} no corresponde a ${intent}.`,
    );
  }

  const captureId = requireText(input.captureId || input.id, "capture_id_required", 160);
  const idempotencyKey = requireText(input.idempotencyKey, "capture_idempotency_key_required", 220);
  const ownerUserId = requireText(input.ownerUserId, "capture_owner_required", 160);
  const workspaceId = optionalText(input.workspaceId, 160);
  const participantId = optionalText(input.participantId || input.groupId, 160);
  const occurredAt = normalizeDate(input.occurredAt || input.capturedAt);
  const text = optionalText(input.text || input.narrativeText || input.transcript, 200_000);
  const bytes = normalizeBytes(input.bytes, input.base64);
  const source = normalizeSource(input.source, input.sourceType, input.sourceDevice);
  const filename = optionalText(input.filename || input.name, 260);
  const mimeType = optionalText(input.mimeType, 160).toLowerCase();
  const metadata = normalizeMetadata(input.metadata);

  if (kind === "text" && !text) {
    throw new CaptureContractError(
      "capture_text_required",
      "Una captura de texto necesita contenido humano.",
    );
  }
  if (["image", "audio", "video", "document"].includes(kind) && bytes.length === 0) {
    throw new CaptureContractError(
      "capture_binary_required",
      `La captura ${kind} necesita el archivo completo.`,
    );
  }
  if (intent === CAPTURE_INTENTS.CONTEXT && !text && bytes.length === 0 && Object.keys(metadata).length === 0) {
    throw new CaptureContractError(
      "capture_context_payload_required",
      "El contexto necesita datos, texto o un archivo.",
    );
  }

  const checksum = bytes.length
    ? createHash("sha256").update(bytes).digest("hex")
    : createHash("sha256").update(JSON.stringify({ text, metadata })).digest("hex");
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ captureId, ownerUserId, intent, kind, occurredAt, checksum }))
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
    text,
    bytes,
    filename,
    mimeType,
    metadata,
    source,
    checksum,
    fingerprint,
  };
}

export function assertNoStoryFields(input) {
  const found = [];
  visit(input, "", found);
  if (found.length > 0) {
    throw new CaptureContractError(
      "capture_story_fields_forbidden",
      `Vibeapp solo captura hechos. Estos campos pertenecen a VibePWA: ${found.join(", ")}.`,
    );
  }
}

function visit(value, prefix, found) {
  if (!value || typeof value !== "object" || value instanceof Uint8Array) return;
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = prefix ? `${prefix}.${key}` : key;
    if (FORBIDDEN_STORY_KEYS.has(normalizedKey)) found.push(path);
    visit(child, path, found);
  }
}

function normalizeBytes(bytes, base64) {
  if (bytes instanceof Uint8Array) return Buffer.from(bytes);
  if (Buffer.isBuffer(bytes)) return bytes;
  if (Array.isArray(bytes)) return Buffer.from(bytes);
  if (typeof base64 === "string" && base64.trim()) {
    const clean = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
    return Buffer.from(clean, "base64");
  }
  return Buffer.alloc(0);
}

function normalizeSource(source, sourceType, sourceDevice) {
  const value = source && typeof source === "object" ? source : {};
  return {
    app: optionalText(value.app || sourceType || "vibeapp", 80),
    device: optionalText(value.device || sourceDevice, 160),
    platform: optionalText(value.platform, 80),
    capturedOffline: value.capturedOffline === true,
  };
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return structuredClone(metadata);
}

function normalizeDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new CaptureContractError("capture_date_invalid", "La fecha de captura no es valida.");
  }
  return date.toISOString();
}

function assertObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CaptureContractError(code);
  }
}

function requireText(value, code, maxLength) {
  const normalized = optionalText(value, maxLength);
  if (!normalized) throw new CaptureContractError(code);
  return normalized;
}

function optionalText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeToken(value) {
  return optionalText(value, 80).toLowerCase();
}
