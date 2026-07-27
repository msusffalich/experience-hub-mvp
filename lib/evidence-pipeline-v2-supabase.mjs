export function createSupabaseEvidenceV2Adapters({
  user,
  workspaceId,
  bucket = "experience-media-v2",
  rest,
  rpc,
  putObject,
  objectExists,
  mapExperienceRow,
  mapEventRows,
}) {
  requireFunction("rest", rest);
  requireFunction("rpc", rpc);
  requireFunction("putObject", putObject);
  requireFunction("objectExists", objectExists);
  requireFunction("mapExperienceRow", mapExperienceRow);
  requireFunction("mapEventRows", mapEventRows);

  const ownerUserId = String(user?.id || "");
  const accessToken = String(user?.accessToken || "");
  if (!ownerUserId || !workspaceId) throw new TypeError("user.id and workspaceId are required");

  const request = (table, options = {}) => rest(table, { ...options, accessToken });

  const operations = {
    async claim(operation) {
      const payload = await rpc("claim_evidence_operation_v2", {
        p_operation_id: operation.operationId,
        p_idempotency_key: operation.idempotencyKey,
        p_asset_id: operation.assetId,
        p_owner_user_id: operation.ownerUserId,
        p_workspace_id: operation.workspaceId,
        p_requested_experience_id: operation.requestedExperienceId || null,
        p_requested_event_id: operation.requestedEventId || null,
        p_checksum: operation.checksum,
        p_storage_path: operation.storagePath || null,
        p_metadata: operation.metadata || {},
      }, accessToken);
      const result = Array.isArray(payload) ? payload[0] : payload;
      if (!result?.operation) throw new Error("evidence_v2_operation_not_claimed");
      return {
        created: Boolean(result.created),
        operation: fromOperationRow(result.operation),
      };
    },

    async findByKey(requestOwnerUserId, idempotencyKey) {
      const rows = await request("evidence_operations_v2", {
        searchParams: {
          owner_user_id: `eq.${requestOwnerUserId}`,
          idempotency_key: `eq.${idempotencyKey}`,
          limit: "1",
        },
      });
      return rows[0] ? fromOperationRow(rows[0]) : null;
    },

    async findByAssetId(requestOwnerUserId, assetId) {
      const rows = await request("evidence_operations_v2", {
        searchParams: {
          owner_user_id: `eq.${requestOwnerUserId}`,
          asset_id: `eq.${assetId}`,
          order: "updated_at.desc",
          limit: "1",
        },
      });
      return rows[0] ? fromOperationRow(rows[0]) : null;
    },

    async save(operation) {
      const rows = await request("evidence_operations_v2", {
        method: "POST",
        searchParams: { on_conflict: "operation_id" },
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(toOperationRow(operation)),
      });
      if (!rows[0]) throw new Error("evidence_v2_operation_not_persisted");
      return fromOperationRow(rows[0]);
    },
  };

  const storage = {
    async put(storagePath, bytes, metadata) {
      return putObject(bucket, storagePath, bytes, metadata);
    },
    async exists(storagePath) {
      return objectExists(bucket, storagePath);
    },
  };

  const assets = {
    async findById(assetId) {
      const rows = await request("assets", {
        searchParams: {
          workspace_id: `eq.${workspaceId}`,
          owner_user_id: `eq.${ownerUserId}`,
          asset_id: `eq.${assetId}`,
          limit: "1",
        },
      });
      return rows[0] ? fromAssetRowV2(rows[0]) : null;
    },

    async upsertInbox(asset) {
      const rows = await request("assets", {
        method: "POST",
        searchParams: { on_conflict: "asset_id" },
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(toInboxAssetRow(asset, bucket)),
      });
      if (!rows[0]) throw new Error("evidence_v2_asset_not_persisted");
      return fromAssetRowV2(rows[0]);
    },

    async listPending(requestOwnerUserId) {
      const rows = await request("assets", {
        searchParams: {
          workspace_id: `eq.${workspaceId}`,
          owner_user_id: `eq.${requestOwnerUserId}`,
          adoption_status: "eq.inbox",
          order: "captured_at.asc",
          limit: "500",
        },
      });
      return rows.map(fromAssetRowV2);
    },
  };

  const experiences = {
    async exists(experienceId) {
      const rows = await request("experiences", {
        searchParams: {
          experience_id: `eq.${experienceId}`,
          user_id: `eq.${ownerUserId}`,
          workspace_id: `eq.${workspaceId}`,
          select: "experience_id",
          limit: "1",
        },
      });
      return Boolean(rows[0]);
    },

    async commit(experience, events, assetLinks) {
      const experienceRow = await mapExperienceRow(experience);
      await request("experiences", {
        method: "POST",
        searchParams: { on_conflict: "experience_id" },
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          ...experienceRow,
          workspace_id: workspaceId,
          owner_user_id: ownerUserId,
          attachments: [],
        }),
      });
      const eventRows = await mapEventRows(events, experience, workspaceId);
      return rpc("commit_experience_graph_v2", {
        p_experience_id: experience.id,
        p_workspace_id: workspaceId,
        p_owner_user_id: ownerUserId,
        p_events: eventRows,
        p_asset_links: assetLinks.map((link) => ({
          asset_id: link.assetId,
          event_id: link.eventId || "",
        })),
      }, accessToken);
    },

    async linkAssets(experienceId, assetLinks) {
      return rpc("commit_experience_graph_v2", {
        p_experience_id: experienceId,
        p_workspace_id: workspaceId,
        p_owner_user_id: ownerUserId,
        p_events: [],
        p_asset_links: assetLinks.map((link) => ({
          asset_id: link.assetId,
          event_id: link.eventId || "",
        })),
      }, accessToken);
    },
  };

  return { operations, storage, assets, experiences };
}

function toOperationRow(operation) {
  return {
    operation_id: operation.operationId,
    idempotency_key: operation.idempotencyKey,
    asset_id: operation.assetId,
    owner_user_id: operation.ownerUserId,
    workspace_id: operation.workspaceId,
    requested_experience_id: operation.requestedExperienceId || null,
    requested_event_id: operation.requestedEventId || null,
    checksum: operation.checksum,
    storage_path: operation.storagePath || null,
    state: operation.state,
    attempt_count: Number(operation.attemptCount || 0),
    last_error_code: operation.lastErrorCode || null,
    last_error_detail: operation.lastErrorDetail || null,
    created_at: operation.createdAt,
    updated_at: operation.updatedAt,
    completed_at: operation.completedAt || null,
    metadata: operation.metadata || {},
  };
}

function fromOperationRow(row) {
  return {
    operationId: row.operation_id,
    idempotencyKey: row.idempotency_key,
    assetId: row.asset_id,
    ownerUserId: row.owner_user_id,
    workspaceId: row.workspace_id,
    requestedExperienceId: row.requested_experience_id || "",
    requestedEventId: row.requested_event_id || "",
    checksum: row.checksum || "",
    storagePath: row.storage_path || "",
    state: row.state,
    attemptCount: Number(row.attempt_count || 0),
    lastErrorCode: row.last_error_code || "",
    lastErrorDetail: row.last_error_detail || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at || "",
    metadata: row.metadata || {},
  };
}

function toInboxAssetRow(asset, bucket) {
  return {
    asset_id: asset.assetId,
    workspace_id: asset.workspaceId,
    owner_user_id: asset.ownerUserId,
    participant_id: asset.participantId || null,
    experience_id: null,
    event_id: null,
    name: asset.name,
    kind: asset.kind,
    mime_type: asset.mimeType,
    size_bytes: Number(asset.sizeBytes || 0),
    storage_bucket: bucket,
    storage_path: asset.storagePath,
    evidence_type: "intentional",
    adoption_status: "inbox",
    captured_at: asset.capturedAt,
    uploaded_at: new Date().toISOString(),
    source_type: asset.sourceType || "vibeapp-native",
    source_device: asset.sourceDevice || null,
    checksum: asset.checksum || null,
    processing_status: "pending",
    permissions: "private",
    metadata: {
      evidencePipeline: "v2",
      checksum: asset.checksum || "",
      capturedAt: asset.capturedAt,
      sourceType: asset.sourceType || "vibeapp-native",
      sourceDevice: asset.sourceDevice || "",
      adoptionStatus: "inbox",
    },
    updated_at: new Date().toISOString(),
  };
}

function fromAssetRowV2(row) {
  return {
    assetId: row.asset_id,
    ownerUserId: row.owner_user_id,
    workspaceId: row.workspace_id,
    participantId: row.participant_id || "",
    experienceId: row.experience_id || null,
    eventId: row.event_id || null,
    name: row.name,
    kind: row.kind,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes || 0),
    storagePath: row.storage_path || "",
    checksum: row.checksum || row.metadata?.checksum || "",
    adoptionStatus: row.adoption_status || "inbox",
    capturedAt: row.captured_at || row.created_at,
    sourceType: row.source_type || row.metadata?.sourceType || "",
    sourceDevice: row.source_device || row.metadata?.sourceDevice || "",
    metadata: row.metadata || {},
  };
}

function requireFunction(name, value) {
  if (typeof value !== "function") throw new TypeError(`${name} is required`);
}
