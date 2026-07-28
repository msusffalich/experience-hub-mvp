import { CaptureContractError, normalizeCaptureCommand } from "./capture-contract.mjs";

const MEDIA_KINDS = new Set(["image", "audio", "video", "document"]);
const CONTEXT_KIND_BY_PAYLOAD = Object.freeze({
  activity: "biometric",
  agenda: "agenda",
  biometric: "biometric",
  calendar: "agenda",
  location: "location",
  news: "news",
  sensor: "sensor",
  sleep: "biometric",
  weather: "weather",
});

const STORY_KEYS = new Set([
  "eventid",
  "events",
  "experienceid",
  "linkedexperienceid",
  "parentexperienceid",
  "requestedexperienceid",
  "requestedeventid",
  "storyid",
]);
const OBSERVER_BINARY_MARKER = Buffer.from([1]);

export function inspectLegacyIntegrationCapture(signal = {}, context = {}) {
  const normalized = normalizeLegacySignal(signal);
  const storyFields = findStoryFields(signal);
  const diagnostics = storyFields.length > 0
    ? [{ code: "legacy_story_hints_ignored", fields: storyFields }]
    : [];

  const kind = captureKindForIntegration(normalized);
  if (!kind) {
    return incompatible("legacy_payload_not_capture", {
      route: context.route || "/api/integration/ingest",
      payloadType: normalized.payloadType,
    });
  }

  const intent = MEDIA_KINDS.has(kind) || kind === "text" ? "evidence" : "context";
  if (kind === "text") diagnostics.push({ code: "text_becomes_unassigned_evidence" });
  const payload = asObject(normalized.payload);
  const firstFile = Array.isArray(payload.files) ? asObject(payload.files[0]) : {};
  const captureId = firstText(
    signal.captureId,
    signal.assetId,
    signal.id,
    payload.captureId,
    payload.assetId,
    normalized.sourceId,
    normalized.idempotencyKey,
  );
  const idempotencyKey = firstText(
    normalized.idempotencyKey,
    signal.idempotencyKey,
    normalized.sourceId,
    captureId,
  );
  const bytes = bytesFromLegacyPayload(signal, payload);
  const text = firstText(
    signal.text,
    signal.narrativeText,
    signal.transcript,
    typeof normalized.payload === "string" ? normalized.payload : "",
    payload.text,
    payload.narrativeText,
    payload.transcript,
  );
  const metadata = {
    ...normalized.metadata,
    payload: normalized.payload,
    privacyLevel: normalized.privacyLevel,
    legacyRoute: context.route || "/api/integration/ingest",
    legacyPayloadType: normalized.payloadType,
  };

  return validateCandidate({
    captureId,
    idempotencyKey,
    ownerUserId: context.ownerUserId,
    workspaceId: context.workspaceId,
    participantId: normalized.participantId,
    occurredAt: normalized.capturedAt,
    intent,
    kind,
    text,
    bytes,
    filename: firstText(
      signal.filename,
      signal.name,
      payload.fileName,
      payload.filename,
      payload.name,
      firstFile.fileName,
      firstFile.filename,
      firstFile.name,
    ),
    mimeType: firstText(
      signal.mimeType,
      signal.type,
      payload.mimeType,
      payload.type,
      firstFile.mimeType,
      firstFile.type,
    ),
    metadata,
    source: {
      app: normalized.sourceType || "vibeapp",
      device: firstText(signal.sourceDevice, signal.device, normalized.deviceMetadata.deviceName),
      platform: firstText(normalized.deviceMetadata.platform, signal.platform),
      capturedOffline: Boolean(signal.capturedOffline || normalized.metadata.capturedOffline),
    },
  }, {
    route: context.route || "/api/integration/ingest",
    payloadType: normalized.payloadType,
  }, diagnostics);
}

export function inspectLegacyMediaCapture(media = {}, context = {}) {
  const normalized = asObject(media);
  const metadata = asObject(normalized.metadata);
  const storyFields = findStoryFields(normalized);
  const diagnostics = storyFields.length > 0
    ? [{ code: "legacy_story_hints_ignored", fields: storyFields }]
    : [];

  const mimeType = firstText(normalized.mimeType, normalized.type, context.mimeType);
  const filename = firstText(normalized.filename, normalized.name, context.filename);
  const biometric = isBiometricMedia(normalized, metadata, filename);
  const kind = biometric ? "biometric" : normalizeMediaKind(
    firstText(normalized.kind, normalized.payloadType, metadata.payloadType),
    mimeType,
    filename,
  );
  if (!biometric && !MEDIA_KINDS.has(kind)) {
    return incompatible("legacy_media_kind_unsupported", {
      route: context.route || "/api/media",
      payloadType: kind,
    });
  }

  const captureId = firstText(
    normalized.captureId,
    normalized.assetId,
    normalized.id,
    normalized.sourceId,
    metadata.sourceId,
    metadata.idempotencyKey,
  );
  const idempotencyKey = firstText(
    context.idempotencyKey,
    normalized.idempotencyKey,
    metadata.idempotencyKey,
    normalized.sourceId,
    metadata.sourceId,
    captureId,
  );
  const participantId = firstText(normalized.participantId, normalized.groupId, metadata.participantId);
  if (!participantId) diagnostics.push({ code: "participant_missing" });
  const identityValues = uniqueText([
    context.idempotencyKey,
    normalized.idempotencyKey,
    metadata.idempotencyKey,
  ]);
  if (identityValues.length > 1) diagnostics.push({ code: "idempotency_key_mismatch" });
  const bytes = context.bytes || bytesFromLegacyPayload(normalized, normalized);
  const declaredSize = Number(normalized.size || metadata.size || 0);
  if (declaredSize > 0 && bytes.length > 0 && declaredSize !== bytes.length) {
    diagnostics.push({ code: "declared_size_mismatch" });
  }
  return validateCandidate({
    captureId,
    idempotencyKey,
    ownerUserId: context.ownerUserId,
    workspaceId: context.workspaceId,
    participantId,
    occurredAt: firstText(normalized.occurredAt, normalized.capturedAt, metadata.capturedAt),
    intent: biometric ? "context" : "evidence",
    kind,
    bytes,
    filename,
    mimeType,
    metadata: {
      ...metadata,
      legacyRoute: context.route || "/api/media",
      legacyPayloadType: kind,
      transportOnly: biometric && filename.toLowerCase().endsWith(".zip"),
    },
    source: {
      app: firstText(normalized.sourceType, metadata.sourceType, "vibeapp"),
      device: firstText(normalized.sourceDevice, metadata.sourceDevice),
      platform: firstText(normalized.platform, metadata.platform),
      capturedOffline: Boolean(normalized.capturedOffline || metadata.capturedOffline),
    },
  }, {
    route: context.route || "/api/media",
    payloadType: kind,
  }, diagnostics);
}

export function createCaptureCompatibilityMonitor({ maxRecent = 12, clock = () => new Date() } = {}) {
  const state = {
    observed: 0,
    compatible: 0,
    compatibleWithLoss: 0,
    incompatible: 0,
    byRoute: new Map(),
    byCode: new Map(),
    recent: [],
  };

  function record(result = {}) {
    const route = String(result.route || "unknown");
    const status = String(result.status || (result.ok ? "compatible" : "incompatible"));
    const code = String(result.code || status || "unknown");
    state.observed += 1;
    if (status === "compatible_with_loss") state.compatibleWithLoss += 1;
    else state[result.ok ? "compatible" : "incompatible"] += 1;
    state.byRoute.set(route, (state.byRoute.get(route) || 0) + 1);
    state.byCode.set(code, (state.byCode.get(code) || 0) + 1);
    state.recent.unshift({
      observedAt: clock().toISOString(),
      route,
      payloadType: String(result.payloadType || ""),
      ok: Boolean(result.ok),
      status,
      code,
    });
    state.recent = state.recent.slice(0, Math.max(1, Number(maxRecent) || 12));
    return result;
  }

  function snapshot() {
    const migratable = state.compatible + state.compatibleWithLoss;
    return {
      mode: "observe_only",
      writesDuplicated: false,
      observed: state.observed,
      compatible: state.compatible,
      compatibleWithLoss: state.compatibleWithLoss,
      incompatible: state.incompatible,
      migratable,
      compatiblePercent: state.observed
        ? Math.round((migratable / state.observed) * 100)
        : null,
      byRoute: Object.fromEntries(state.byRoute),
      byCode: Object.fromEntries(state.byCode),
      recent: structuredClone(state.recent),
    };
  }

  return Object.freeze({ record, snapshot });
}

function validateCandidate(candidate, summary, diagnostics = []) {
  try {
    const observedSizeBytes = candidate.bytes?.length || 0;
    const command = normalizeCaptureCommand({
      ...candidate,
      bytes: observedSizeBytes > 0 ? OBSERVER_BINARY_MARKER : candidate.bytes,
    });
    const status = diagnostics.length > 0 ? "compatible_with_loss" : "compatible";
    return {
      ok: true,
      status,
      code: diagnostics[0]?.code || "compatible",
      route: summary.route,
      payloadType: summary.payloadType,
      diagnostics,
      command: {
        ...command,
        bytes: Buffer.alloc(0),
        checksum: "",
        fingerprint: "",
        observedSizeBytes,
        hashMode: "deferred_to_canonical_write",
      },
    };
  } catch (error) {
    if (error instanceof CaptureContractError) {
      return incompatible(error.code, {
        ...summary,
        detail: error.detail,
      });
    }
    throw error;
  }
}

function incompatible(code, extra = {}) {
  return {
    ok: false,
    status: "incompatible",
    code,
    route: extra.route || "",
    payloadType: extra.payloadType || "",
    detail: extra.detail || "",
    storyFields: extra.storyFields || [],
  };
}

function isBiometricMedia(media, metadata, filename) {
  const tokens = [
    media.kind,
    media.payloadType,
    media.sourceType,
    metadata.payloadType,
    metadata.externalPayloadType,
    metadata.sourceType,
    metadata.connector,
    metadata.dataType,
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  const structuredMatch = [
    "biometric",
    "health",
    "healthkit",
    "health-connect",
    "health_connect",
    "oura",
    "samsung",
  ].some((marker) => tokens.includes(marker));
  const normalizedFilename = String(filename || "").trim().toLowerCase();
  const filenameMatch = /^(vibeapp-health|oura|healthkit|health-connect|health_connect|apple_health_export|samsung-health)/.test(
    normalizedFilename,
  );
  return structuredMatch || filenameMatch;
}

function normalizeLegacySignal(signal = {}) {
  const metadata = asObject(signal.metadata);
  return {
    sourceId: firstText(signal.sourceId, signal.idempotencyKey, metadata.sourceId),
    sourceType: firstText(signal.sourceType, metadata.sourceType),
    capturedAt: firstText(signal.capturedAt, signal.timestamp, metadata.capturedAt),
    participantId: firstText(signal.participantId, signal.pilotParticipantId, signal.groupId),
    payloadType: firstText(signal.payloadType, signal.type).toLowerCase(),
    payload: signal.payload ?? signal.data ?? null,
    privacyLevel: firstText(signal.privacyLevel, metadata.privacyLevel, "normal").toLowerCase(),
    idempotencyKey: firstText(signal.idempotencyKey, metadata.idempotencyKey, signal.sourceId),
    deviceMetadata: asObject(signal.deviceMetadata),
    metadata,
  };
}

function captureKindForIntegration(normalized) {
  if (normalized.payloadType === "text") return "text";
  if (MEDIA_KINDS.has(normalized.payloadType)) return normalized.payloadType;
  if (normalized.payloadType === "media") {
    const payload = asObject(normalized.payload);
    const firstFile = Array.isArray(payload.files) ? asObject(payload.files[0]) : {};
    return normalizeMediaKind(
      firstText(payload.kind, payload.payloadType),
      firstText(payload.mimeType, payload.type, firstFile.mimeType, firstFile.type),
      firstText(payload.fileName, payload.filename, payload.name, firstFile.fileName, firstFile.filename),
    );
  }
  if (normalized.payloadType === "context") {
    const payload = asObject(normalized.payload);
    const contextType = firstText(payload.contextType, payload.dataType, payload.type).toLowerCase();
    if (contextType.includes("location") || contextType.includes("gps")) return "location";
    if (contextType.includes("weather") || contextType.includes("climate")) return "weather";
    if (contextType.includes("news")) return "news";
    return "sensor";
  }
  return CONTEXT_KIND_BY_PAYLOAD[normalized.payloadType] || "";
}

function normalizeMediaKind(kind, mimeType, filename) {
  const token = String(kind || "").trim().toLowerCase();
  if (MEDIA_KINDS.has(token)) return token;
  const mime = String(mimeType || "").trim().toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime && mime !== "application/octet-stream") return "document";
  const extension = String(filename || "").split(".").pop()?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "heic", "webp"].includes(extension)) return "image";
  if (["m4a", "mp3", "wav", "aac", "ogg"].includes(extension)) return "audio";
  if (["mp4", "mov", "hevc", "m4v"].includes(extension)) return "video";
  if (extension) return "document";
  return "";
}

function bytesFromLegacyPayload(signal, payload) {
  if (signal.bytes instanceof Uint8Array || Buffer.isBuffer(signal.bytes)) return signal.bytes;
  if (payload.bytes instanceof Uint8Array || Buffer.isBuffer(payload.bytes)) return payload.bytes;
  const base64 = firstText(signal.base64, payload.base64, signal.dataUrl, payload.dataUrl);
  if (!base64) return Buffer.alloc(0);
  return OBSERVER_BINARY_MARKER;
}

function findStoryFields(value, prefix = "", found = []) {
  if (!value || typeof value !== "object" || value instanceof Uint8Array) return found;
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    if (STORY_KEYS.has(normalizedKey) && firstText(child)) found.push(fieldPath);
    findStoryFields(child, fieldPath, found);
  }
  return found;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function uniqueText(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}
