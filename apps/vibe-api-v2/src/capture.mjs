import { createHash } from "node:crypto";
import { ApiError } from "./errors.mjs";

const EVIDENCE_KINDS = new Set(["text", "image", "audio", "video", "document"]);
const CONTEXT_KINDS = new Set([
  "biometric", "location", "weather", "news", "entertainment", "agenda", "sensor",
]);
const BINARY_REQUIRED_KINDS = new Set(["image", "audio", "video", "document"]);
const BINARY_CAPABLE_KINDS = new Set([...BINARY_REQUIRED_KINDS, "biometric", "sensor"]);
const COMPLETE = "complete";

export function createCaptureService({ supabase, workspace, config }) {
  async function status(auth, options = {}) {
    const scope = await workspace.resolve(auth);
    const checks = {
      auth: { ok: Boolean(auth.user.id), detail: auth.user.id },
      workspace: { ok: Boolean(scope.id), detail: scope.id },
      operationLedger: await tableCheck("capture_operations", auth),
      captureCatalog: await tableCheck("capture_records", auth),
      storyLinks: await tableCheck("story_evidence_links", auth),
      storageRoundTrip: options.roundTrip
        ? await storageRoundTrip(auth.user.id)
        : { ok: true, detail: "deferred_to_authenticated_probe" },
    };
    const ready = Object.values(checks).every((check) => check.ok);
    return {
      ok: ready,
      ready,
      architecture: "capture_first_story_later",
      version: "2.0.0",
      checks,
      contract: contract(),
    };
  }

  async function authorize(body, auth) {
    const scope = await workspace.resolve(auth);
    const command = normalizeBinaryCommand(body, auth.user.id, scope.id, config.maxFileBytes);
    let operation = await claim(command, auth);
    assertSameOperation(operation, command);
    const existing = await getCapture(command.captureId, auth);
    if (operation.state === COMPLETE && existing) {
      return authorizationReceipt(operation, command, false, existing);
    }
    const path = operation.storage_path || storagePath(command);
    operation = await updateOperation(operation.operation_id, auth, {
      state: "storing",
      attempts: Number(operation.attempts || 0) + 1,
      storage_path: path,
      last_error: null,
    });
    const signed = await supabase.storageSignUpload(config.storageBucket, path, {
      accessToken: auth.accessToken,
    });
    return {
      ...authorizationReceipt(operation, command, true, null),
      upload: {
        mode: command.sizeBytes > 6 * 1024 * 1024 ? "resumable" : "standard",
        bucket: config.storageBucket,
        path,
        signedUrl: signed.signedUrl,
        token: signed.token,
        tusEndpoint: directStorageOrigin(config.supabaseUrl),
        chunkBytes: 6 * 1024 * 1024,
        headers: {
          "Upload-Metadata": tusMetadata({
            bucketName: config.storageBucket,
            objectName: path,
            contentType: command.mimeType,
            cacheControl: "3600",
          }),
        },
      },
    };
  }

  async function commit(body, auth) {
    const scope = await workspace.resolve(auth);
    const command = normalizeBinaryCommand(body, auth.user.id, scope.id, config.maxFileBytes);
    let operation = await findOperation(command.idempotencyKey, auth);
    if (!operation) operation = await claim(command, auth);
    assertSameOperation(operation, command);
    const existing = await getCapture(command.captureId, auth);
    if (operation.state === COMPLETE && existing) return receipt(operation, existing, true);
    const path = operation.storage_path || storagePath(command);
    try {
      const info = await supabase.storageInfo(config.storageBucket, path, {
        accessToken: auth.accessToken,
      });
      if (Number(info.sizeBytes) !== command.sizeBytes) {
        throw new ApiError(
          409,
          "storage_size_mismatch",
          "El archivo recibido no coincide con el tamaño original.",
          { expected: command.sizeBytes, actual: info.sizeBytes },
        );
      }
      const actualMime = String(info.mimeType || "").toLowerCase();
      if (actualMime && command.mimeType && actualMime !== command.mimeType) {
        throw new ApiError(
          409,
          "storage_mime_mismatch",
          "El tipo del archivo recibido no coincide con el original.",
        );
      }
      await updateOperation(operation.operation_id, auth, {
        state: "binary_stored",
        storage_path: path,
      });
      await updateOperation(operation.operation_id, auth, { state: "cataloging" });
      const record = await upsertCapture({
        ...command,
        storageBucket: config.storageBucket,
        storagePath: path,
      }, auth);
      await projectContext({
        ...command,
        storageBucket: config.storageBucket,
        storagePath: path,
      }, auth);
      operation = await updateOperation(operation.operation_id, auth, {
        state: COMPLETE,
        storage_path: path,
        last_error: null,
      });
      return receipt(operation, record, false);
    } catch (error) {
      const retryable = !(error instanceof ApiError && error.status < 500);
      await updateOperation(operation.operation_id, auth, {
        state: retryable ? "retry_pending" : "needs_attention",
        last_error: {
          code: error.code || "capture_commit_failed",
          message: error.message,
          at: new Date().toISOString(),
        },
      }).catch(() => {});
      throw error;
    }
  }

  async function capture(body, auth) {
    const scope = await workspace.resolve(auth);
    const command = normalizeLightCommand(body, auth.user.id, scope.id);
    let operation = await claim(command, auth);
    assertSameOperation(operation, command);
    const existing = await getCapture(command.captureId, auth);
    if (operation.state === COMPLETE && existing) return receipt(operation, existing, true);
    try {
      await updateOperation(operation.operation_id, auth, {
        state: "cataloging",
        attempts: Number(operation.attempts || 0) + 1,
        last_error: null,
      });
      const record = await upsertCapture(command, auth);
      await projectContext(command, auth);
      operation = await updateOperation(operation.operation_id, auth, {
        state: COMPLETE,
        last_error: null,
      });
      return receipt(operation, record, false);
    } catch (error) {
      const retryable = !(error instanceof ApiError && error.status < 500);
      await updateOperation(operation.operation_id, auth, {
        state: retryable ? "retry_pending" : "needs_attention",
        last_error: {
          code: error.code || "capture_commit_failed",
          message: error.message,
          at: new Date().toISOString(),
        },
      }).catch(() => {});
      throw error;
    }
  }

  async function list(auth, url) {
    const scope = await workspace.resolve(auth);
    const intent = String(url.searchParams.get("intent") || "").trim();
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || 500), 500));
    const query = {
      owner_user_id: `eq.${auth.user.id}`,
      workspace_id: `eq.${scope.id}`,
      select: "*",
      order: "occurred_at.desc",
      limit: String(limit),
    };
    if (intent) query.intent = `eq.${intent}`;
    const [rows, links] = await Promise.all([
      supabase.rest("capture_records", { accessToken: auth.accessToken, query }),
      supabase.rest("story_evidence_links", {
        accessToken: auth.accessToken,
        query: {
          linked_by: `eq.${auth.user.id}`,
          select: "story_id,capture_id,event_id,linked_at",
        },
      }),
    ]);
    const byCapture = new Map((links || []).map((link) => [link.capture_id, link]));
    return (rows || []).map((row) => mapCapture(row, byCapture.get(row.capture_id)));
  }

  async function operation(operationId, auth) {
    const row = await findOperation(operationId, auth);
    if (!row) throw new ApiError(404, "capture_operation_not_found");
    const record = await getCapture(row.capture_id, auth);
    return receipt(row, record, false);
  }

  async function download(captureId, auth) {
    const record = await getCapture(captureId, auth);
    if (!record) throw new ApiError(404, "capture_not_found");
    if (!record.storage_path) throw new ApiError(409, "capture_binary_unavailable");
    const signed = await supabase.storageSignDownload(
      record.storage_bucket || config.storageBucket,
      record.storage_path,
      900,
      { accessToken: auth.accessToken },
    );
    const raw = String(signed.signedURL || signed.signedUrl || signed.url || "");
    const url = /^https?:\/\//i.test(raw)
      ? raw
      : `${config.supabaseUrl}${raw.startsWith("/") ? raw : `/storage/v1${raw}`}`;
    return {
      ok: true,
      captureId,
      url,
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    };
  }

  async function tableCheck(table, auth) {
    try {
      await supabase.rest(table, {
        accessToken: auth.accessToken,
        query: { select: "*", limit: "1" },
      });
      return { ok: true, detail: "available" };
    } catch (error) {
      return { ok: false, detail: error.code || error.message };
    }
  }

  async function storageRoundTrip(ownerId) {
    const path = `${ownerId}/_health/${crypto.randomUUID()}.txt`;
    const expected = Buffer.from(`vibe-api-v2:${Date.now()}`);
    try {
      await supabase.storagePut(config.storageBucket, path, expected, "text/plain", {
        auth: "service",
      });
      const response = await supabase.storageGet(config.storageBucket, path, {
        auth: "service",
      });
      const actual = Buffer.from(await response.arrayBuffer());
      if (!actual.equals(expected)) throw new Error("roundtrip_content_mismatch");
      return { ok: true, detail: "write_read_verified" };
    } catch (error) {
      return { ok: false, detail: error.code || error.message };
    } finally {
      await supabase.storageDelete(config.storageBucket, [path], { auth: "service" }).catch(() => {});
    }
  }

  async function claim(command, auth) {
    return supabase.rpc("claim_capture_operation", {
      p_operation_id: command.idempotencyKey,
      p_idempotency_key: command.idempotencyKey,
      p_capture_id: command.captureId,
      p_owner_user_id: command.ownerUserId,
      p_workspace_id: command.workspaceId,
      p_fingerprint: command.fingerprint,
      p_checksum: command.checksum,
      p_intent: command.intent,
      p_kind: command.kind,
    }, { accessToken: auth.accessToken });
  }

  async function findOperation(operationId, auth) {
    const rows = await supabase.rest("capture_operations", {
      accessToken: auth.accessToken,
      query: {
        operation_id: `eq.${operationId}`,
        owner_user_id: `eq.${auth.user.id}`,
        select: "*",
        limit: "1",
      },
    });
    return rows?.[0] || null;
  }

  async function updateOperation(operationId, auth, patch) {
    const rows = await supabase.rest("capture_operations", {
      method: "PATCH",
      accessToken: auth.accessToken,
      prefer: "return=representation",
      query: {
        operation_id: `eq.${operationId}`,
        owner_user_id: `eq.${auth.user.id}`,
      },
      body: { ...patch, updated_at: new Date().toISOString() },
    });
    if (!rows?.[0]) throw new ApiError(500, "capture_operation_update_failed");
    return rows[0];
  }

  async function getCapture(captureId, auth) {
    const rows = await supabase.rest("capture_records", {
      accessToken: auth.accessToken,
      query: {
        capture_id: `eq.${captureId}`,
        owner_user_id: `eq.${auth.user.id}`,
        select: "*",
        limit: "1",
      },
    });
    return rows?.[0] || null;
  }

  async function upsertCapture(command, auth) {
    const now = new Date().toISOString();
    const rows = await supabase.rest("capture_records", {
      method: "POST",
      accessToken: auth.accessToken,
      prefer: "resolution=merge-duplicates,return=representation",
      query: { on_conflict: "capture_id" },
      body: {
        capture_id: command.captureId,
        owner_user_id: command.ownerUserId,
        workspace_id: command.workspaceId,
        participant_id: command.participantId || null,
        intent: command.intent,
        kind: command.kind,
        occurred_at: command.occurredAt,
        text_content: command.text || null,
        filename: command.filename || null,
        mime_type: command.mimeType || null,
        size_bytes: Number(command.sizeBytes || 0),
        metadata: command.metadata || {},
        source: command.source || {},
        checksum: command.checksum,
        storage_bucket: command.storageBucket || null,
        storage_path: command.storagePath || null,
        updated_at: now,
      },
    });
    if (!rows?.[0]) throw new ApiError(500, "capture_catalog_write_failed");
    return rows[0];
  }

  async function projectContext(command, auth) {
    if (command.intent !== "context") return;
    const now = new Date().toISOString();
    if (command.kind === "agenda") {
      const startAt = command.metadata.startAt || command.metadata.start_at || command.occurredAt;
      const endAt = command.metadata.endAt || command.metadata.end_at ||
        new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString();
      await supabase.rest("agenda_events", {
        method: "POST",
        accessToken: auth.accessToken,
        prefer: "resolution=merge-duplicates,return=minimal",
        query: { on_conflict: "event_id" },
        body: {
          event_id: command.captureId,
          user_id: auth.user.id,
          participant_id: command.participantId || null,
          title: command.metadata.title || command.text || "Evento",
          type: command.metadata.type || "Personal",
          description: command.metadata.description || command.text || null,
          start_at: startAt,
          end_at: endAt,
          location: command.metadata.location || null,
          participants: command.metadata.participants || null,
          priority: command.metadata.priority || "normal",
          status: command.metadata.status || "Planificado",
          source_type: command.source.app || "vibeapp",
          metadata: {
            ...command.metadata,
            captureId: command.captureId,
            capturedOffline: command.source.capturedOffline,
          },
          updated_at: now,
        },
      });
      return;
    }
    await supabase.rest("context_signals", {
      method: "POST",
      accessToken: auth.accessToken,
      prefer: "resolution=merge-duplicates,return=minimal",
      query: { on_conflict: "signal_id" },
      body: {
        signal_id: command.captureId,
        workspace_id: command.workspaceId,
        owner_user_id: auth.user.id,
        participant_id: command.participantId || null,
        source_type: command.source.app || "vibeapp",
        source_device: command.source.device || null,
        source_id: command.captureId,
        signal_type: command.kind,
        captured_at: command.occurredAt,
        valid_from: command.metadata.validFrom || command.metadata.startAt || command.occurredAt,
        valid_to: command.metadata.validTo || command.metadata.endAt || null,
        location: command.metadata.location || coordinates(command.metadata),
        metrics: metricsFor(command),
        payload: {
          ...command.metadata,
          text: command.text || "",
          filename: command.filename || "",
          mimeType: command.mimeType || "",
          storagePath: command.storagePath || "",
        },
        metadata: {
          captureId: command.captureId,
          capturedOffline: command.source.capturedOffline,
        },
        updated_at: now,
      },
    });
  }

  return { status, authorize, commit, capture, list, operation, download, contract };
}

function normalizeBinaryCommand(body, ownerUserId, workspaceId, maxBytes) {
  const command = normalizeBase(body, ownerUserId, workspaceId);
  if (!BINARY_CAPABLE_KINDS.has(command.kind)) throw new ApiError(400, "capture_binary_kind_invalid");
  command.filename = required(body.filename || body.name, "capture_filename_required", 260);
  command.mimeType = required(body.mimeType, "capture_mime_type_required", 160).toLowerCase();
  command.sizeBytes = Number(body.sizeBytes ?? body.size);
  command.checksum = required(body.checksum || body.sha256, "capture_checksum_required", 128).toLowerCase();
  if (!Number.isSafeInteger(command.sizeBytes) || command.sizeBytes < 1 || command.sizeBytes > maxBytes) {
    throw new ApiError(400, "capture_size_invalid");
  }
  if (!/^[a-f0-9]{64}$/.test(command.checksum)) {
    throw new ApiError(400, "capture_checksum_invalid");
  }
  command.fingerprint = fingerprint(command);
  return command;
}

function normalizeLightCommand(body, ownerUserId, workspaceId) {
  const command = normalizeBase(body, ownerUserId, workspaceId);
  if (BINARY_REQUIRED_KINDS.has(command.kind)) {
    throw new ApiError(400, "capture_direct_upload_required");
  }
  command.text = String(body.text || body.narrativeText || body.transcript || "").trim().slice(0, 200_000);
  if (!command.text && !Object.keys(command.metadata).length) {
    throw new ApiError(400, "capture_content_required");
  }
  command.checksum = createHash("sha256")
    .update(JSON.stringify({ text: command.text, metadata: command.metadata }))
    .digest("hex");
  command.sizeBytes = Buffer.byteLength(command.text);
  command.mimeType = "text/plain";
  command.filename = "";
  command.fingerprint = fingerprint(command);
  return command;
}

function normalizeBase(body, ownerUserId, workspaceId) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "capture_payload_required");
  }
  assertNoStoryFields(body);
  const intent = String(body.intent || "").trim().toLowerCase();
  const kind = String(body.kind || body.type || "").trim().toLowerCase();
  if (!["evidence", "context"].includes(intent)) throw new ApiError(400, "capture_intent_invalid");
  const allowed = intent === "evidence" ? EVIDENCE_KINDS : CONTEXT_KINDS;
  if (!allowed.has(kind)) throw new ApiError(400, "capture_kind_invalid");
  const occurredAt = new Date(required(body.occurredAt || body.capturedAt, "capture_date_required", 80));
  if (Number.isNaN(occurredAt.getTime())) throw new ApiError(400, "capture_date_invalid");
  return {
    captureId: required(body.captureId || body.id, "capture_id_required", 160),
    idempotencyKey: required(body.idempotencyKey, "capture_idempotency_key_required", 220),
    ownerUserId,
    workspaceId,
    participantId: String(body.participantId || body.groupId || "").trim().slice(0, 160),
    intent,
    kind,
    occurredAt: occurredAt.toISOString(),
    metadata: plainObject(body.metadata),
    source: {
      app: String(body.source?.app || body.sourceType || "vibeapp").slice(0, 80),
      device: String(body.source?.device || body.sourceDevice || "").slice(0, 160),
      platform: String(body.source?.platform || "").slice(0, 80),
      capturedOffline: body.source?.capturedOffline === true,
    },
  };
}

function assertNoStoryFields(value) {
  const forbidden = /^(experience|experienceid|event|eventid|events|story|storyid|parentexperienceid|requestedexperienceid|requestedeventid)$/;
  const visit = (node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    for (const [key, child] of Object.entries(node)) {
      if (forbidden.test(key.toLowerCase().replace(/[^a-z0-9]/g, ""))) {
        throw new ApiError(400, "capture_story_fields_forbidden");
      }
      visit(child);
    }
  };
  visit(value);
}

function fingerprint(command) {
  return createHash("sha256").update(JSON.stringify({
    captureId: command.captureId,
    ownerUserId: command.ownerUserId,
    workspaceId: command.workspaceId,
    intent: command.intent,
    kind: command.kind,
    occurredAt: command.occurredAt,
    checksum: command.checksum,
  })).digest("hex");
}

function storagePath(command) {
  const safe = command.filename.normalize("NFKC").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-180);
  return `${safeSegment(command.ownerUserId)}/captures/${command.occurredAt.slice(0, 10)}/${safeSegment(command.captureId)}/${safe}`;
}

function mapCapture(row, link) {
  return {
    id: row.capture_id,
    captureId: row.capture_id,
    participantId: row.participant_id || "",
    intent: row.intent,
    kind: row.kind,
    occurredAt: row.occurred_at,
    capturedAt: row.occurred_at,
    text: row.text_content || "",
    filename: row.filename || "",
    name: row.filename || row.text_content || row.kind,
    mimeType: row.mime_type || "",
    type: row.mime_type || "",
    sizeBytes: Number(row.size_bytes || 0),
    size: Number(row.size_bytes || 0),
    metadata: row.metadata || {},
    source: row.source || {},
    sourceType: row.source?.app || "",
    sourceDevice: row.source?.device || "",
    checksum: row.checksum || "",
    storageBucket: row.storage_bucket || "",
    storagePath: row.storage_path || "",
    path: row.storage_path || "",
    experienceId: link?.story_id || "",
    eventId: link?.event_id || "",
    adoptionStatus: link ? "adopted" : "inbox",
    targetLayer: row.intent === "context" ? "context" : "evidence",
    durable: true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function receipt(operation, record, duplicate) {
  const complete = operation?.state === COMPLETE && Boolean(record);
  return {
    ok: complete,
    accepted: complete,
    durable: complete,
    visible: complete,
    duplicate,
    operationId: operation?.operation_id,
    captureId: operation?.capture_id,
    intent: operation?.intent,
    kind: operation?.kind,
    state: operation?.state,
    retryable: operation?.state === "retry_pending",
    needsAttention: operation?.state === "needs_attention",
    storagePath: record?.storage_path || operation?.storage_path || "",
    recordedAt: record?.updated_at || operation?.updated_at,
    lastError: operation?.last_error || null,
  };
}

function authorizationReceipt(operation, command, uploadRequired, record) {
  return {
    ...receipt(operation, record, operation.state === COMPLETE),
    ok: true,
    accepted: operation.state === COMPLETE,
    durable: operation.state === COMPLETE,
    authorized: true,
    uploadRequired,
    captureId: command.captureId,
    operationId: operation.operation_id,
  };
}

function assertSameOperation(operation, command) {
  if (
    !operation ||
    operation.capture_id !== command.captureId ||
    operation.fingerprint !== command.fingerprint ||
    operation.checksum !== command.checksum
  ) {
    throw new ApiError(409, "capture_idempotency_conflict");
  }
}

function contract() {
  return {
    version: "2.0.0",
    endpoints: {
      textAndContext: "/api/v2/captures",
      authorizeBinary: "/api/v2/captures/uploads",
      commitBinary: "/api/v2/captures/commit",
      receipt: "/api/v2/captures/operations/{operationId}",
    },
    evidence: [...EVIDENCE_KINDS],
    context: [...CONTEXT_KINDS],
    storyFieldsAllowed: false,
    successRule: "storage_verified_and_catalog_committed",
  };
}

function required(value, code, max) {
  const text = String(value || "").trim().slice(0, max);
  if (!text) throw new ApiError(400, code);
  return text;
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? structuredClone(value)
    : {};
}

function safeSegment(value) {
  return String(value || "").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 160);
}

function directStorageOrigin(supabaseUrl) {
  const url = new URL(supabaseUrl);
  if (url.hostname.endsWith(".supabase.co")) {
    url.hostname = url.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co");
  }
  return `${url.origin}/storage/v1/upload/resumable`;
}

function tusMetadata(values) {
  return Object.entries(values)
    .map(([key, value]) => `${key} ${Buffer.from(String(value)).toString("base64")}`)
    .join(",");
}

function coordinates(metadata = {}) {
  const latitude = Number(metadata.latitude);
  const longitude = Number(metadata.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? `${latitude}, ${longitude}`
    : null;
}

function metricsFor(command) {
  if (command.metadata.metrics && typeof command.metadata.metrics === "object") {
    return command.metadata.metrics;
  }
  return ["biometric", "sensor", "weather"].includes(command.kind) ? command.metadata : {};
}
