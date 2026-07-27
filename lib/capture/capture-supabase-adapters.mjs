export function createSupabaseCaptureAdapters({
  rest,
  rpc,
  storage,
  ownerUserId,
  workspaceId,
  accessToken = "",
  bucket = "vibe-captures",
}) {
  requireFunction("rest", rest);
  requireFunction("rpc", rpc);
  requireAdapter("storage", storage, ["exists", "put"]);
  if (!ownerUserId || !workspaceId) throw new TypeError("ownerUserId and workspaceId are required");

  const operations = {
    async claim(seed) {
      const result = await rpc("claim_capture_operation", {
        p_operation_id: seed.operationId,
        p_idempotency_key: seed.idempotencyKey,
        p_capture_id: seed.captureId,
        p_owner_user_id: ownerUserId,
        p_workspace_id: workspaceId,
        p_fingerprint: seed.fingerprint,
        p_checksum: seed.checksum,
        p_intent: seed.intent,
        p_kind: seed.kind,
      }, accessToken);
      return operationFromRow(unwrapSingle(result));
    },
    async get(operationId) {
      const rows = await rest("capture_operations", {
        searchParams: {
          select: "*",
          operation_id: `eq.${operationId}`,
          owner_user_id: `eq.${ownerUserId}`,
          limit: "1",
        },
        accessToken,
      });
      return rows[0] ? operationFromRow(rows[0]) : null;
    },
    async save(operation) {
      const rows = await rest("capture_operations", {
        method: "PATCH",
        searchParams: {
          operation_id: `eq.${operation.operationId}`,
          owner_user_id: `eq.${ownerUserId}`,
        },
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(operationToRow(operation)),
        accessToken,
      });
      if (!rows[0]) throw new Error("capture_operation_save_failed");
      return operationFromRow(rows[0]);
    },
  };

  const catalog = {
    async get(captureId) {
      const rows = await rest("capture_records", {
        searchParams: {
          select: "*",
          capture_id: `eq.${captureId}`,
          owner_user_id: `eq.${ownerUserId}`,
          limit: "1",
        },
        accessToken,
      });
      return rows[0] ? captureFromRow(rows[0]) : null;
    },
    async upsert(record) {
      const rows = await rest("capture_records", {
        method: "POST",
        searchParams: { on_conflict: "capture_id" },
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(captureToRow({
          ...record,
          ownerUserId,
          workspaceId,
          storageBucket: record.storagePath ? bucket : null,
        })),
        accessToken,
      });
      if (!rows[0]) throw new Error("capture_catalog_upsert_failed");
      return captureFromRow(rows[0]);
    },
  };

  return { operations, storage, catalog };
}

function operationToRow(value) {
  return {
    state: value.state,
    attempts: Number(value.attempts || 0),
    storage_path: value.storagePath || null,
    last_error: value.lastError || null,
    updated_at: value.updatedAt,
  };
}

function operationFromRow(row = {}) {
  return {
    operationId: row.operation_id,
    idempotencyKey: row.idempotency_key,
    captureId: row.capture_id,
    ownerUserId: row.owner_user_id,
    workspaceId: row.workspace_id,
    fingerprint: row.fingerprint,
    checksum: row.checksum,
    intent: row.intent,
    kind: row.kind,
    state: row.state,
    attempts: Number(row.attempts || 0),
    storagePath: row.storage_path || "",
    lastError: row.last_error || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function captureToRow(value) {
  return {
    capture_id: value.captureId,
    owner_user_id: value.ownerUserId,
    workspace_id: value.workspaceId,
    participant_id: value.participantId || null,
    intent: value.intent,
    kind: value.kind,
    occurred_at: value.occurredAt,
    text_content: value.text || null,
    filename: value.filename || null,
    mime_type: value.mimeType || null,
    size_bytes: Number(value.sizeBytes || 0),
    metadata: value.metadata || {},
    source: value.source || {},
    checksum: value.checksum,
    storage_bucket: value.storageBucket || null,
    storage_path: value.storagePath || null,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
  };
}

function captureFromRow(row = {}) {
  return {
    captureId: row.capture_id,
    ownerUserId: row.owner_user_id,
    workspaceId: row.workspace_id,
    participantId: row.participant_id || "",
    intent: row.intent,
    kind: row.kind,
    occurredAt: row.occurred_at,
    text: row.text_content || "",
    filename: row.filename || "",
    mimeType: row.mime_type || "",
    sizeBytes: Number(row.size_bytes || 0),
    metadata: row.metadata || {},
    source: row.source || {},
    checksum: row.checksum,
    storageBucket: row.storage_bucket || "",
    storagePath: row.storage_path || "",
    storyStatus: "unassigned",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function unwrapSingle(value) {
  if (Array.isArray(value)) return value[0] || {};
  return value || {};
}

function requireFunction(name, value) {
  if (typeof value !== "function") throw new TypeError(`${name} is required`);
}

function requireAdapter(name, adapter, methods) {
  for (const method of methods) {
    if (typeof adapter?.[method] !== "function") throw new TypeError(`${name}.${method} is required`);
  }
}
