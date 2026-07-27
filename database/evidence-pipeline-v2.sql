-- Parallel evidence pipeline V2.
-- Additive only: it does not modify V1 routes or delete existing data.

CREATE TABLE IF NOT EXISTS evidence_operations_v2 (
  operation_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  requested_experience_id TEXT,
  requested_event_id TEXT,
  checksum TEXT NOT NULL,
  storage_path TEXT,
  state TEXT NOT NULL DEFAULT 'received',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  last_error_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (owner_user_id, idempotency_key)
);

ALTER TABLE evidence_operations_v2
  DROP CONSTRAINT IF EXISTS evidence_operations_v2_state_check,
  ADD CONSTRAINT evidence_operations_v2_state_check
  CHECK (
    state IN (
      'received',
      'storing_binary',
      'binary_stored',
      'registering_asset',
      'asset_registered',
      'inbox_complete',
      'link_pending',
      'linking',
      'linked_complete',
      'failed_retryable',
      'failed_terminal',
      'conflict'
    )
  );

CREATE INDEX IF NOT EXISTS evidence_operations_v2_workspace_state_idx
  ON evidence_operations_v2 (workspace_id, state, updated_at);

CREATE INDEX IF NOT EXISTS evidence_operations_v2_owner_asset_idx
  ON evidence_operations_v2 (owner_user_id, asset_id, updated_at DESC);

ALTER TABLE evidence_operations_v2 ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE evidence_operations_v2 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE evidence_operations_v2 TO service_role;

DROP POLICY IF EXISTS "Members can manage V2 evidence operations" ON evidence_operations_v2;

CREATE POLICY "Members can manage V2 evidence operations"
  ON evidence_operations_v2
  FOR ALL
  TO authenticated
  USING (
    owner_user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = evidence_operations_v2.workspace_id
        AND wm.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    owner_user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = evidence_operations_v2.workspace_id
        AND wm.user_id = (select auth.uid())
    )
  );

-- Claims an idempotency key in one database transaction. A concurrent request
-- with the same key and different content is rejected before Storage or assets
-- can be changed.
CREATE OR REPLACE FUNCTION claim_evidence_operation_v2(
  p_operation_id TEXT,
  p_idempotency_key TEXT,
  p_asset_id TEXT,
  p_owner_user_id UUID,
  p_workspace_id UUID,
  p_requested_experience_id TEXT DEFAULT NULL,
  p_requested_event_id TEXT DEFAULT NULL,
  p_checksum TEXT DEFAULT '',
  p_storage_path TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  claimed evidence_operations_v2%ROWTYPE;
  inserted BOOLEAN := false;
BEGIN
  INSERT INTO evidence_operations_v2 (
    operation_id,
    idempotency_key,
    asset_id,
    owner_user_id,
    workspace_id,
    requested_experience_id,
    requested_event_id,
    checksum,
    storage_path,
    state,
    metadata
  ) VALUES (
    p_operation_id,
    p_idempotency_key,
    p_asset_id,
    p_owner_user_id,
    p_workspace_id,
    NULLIF(p_requested_experience_id, ''),
    NULLIF(p_requested_event_id, ''),
    p_checksum,
    p_storage_path,
    'received',
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (owner_user_id, idempotency_key) DO NOTHING;

  inserted := FOUND;

  SELECT *
  INTO claimed
  FROM evidence_operations_v2 op
  WHERE op.owner_user_id = p_owner_user_id
    AND op.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF claimed.operation_id IS NULL THEN
    RAISE EXCEPTION 'evidence_v2_operation_claim_failed'
      USING ERRCODE = 'P0001';
  END IF;

  IF claimed.asset_id <> p_asset_id
    OR claimed.workspace_id <> p_workspace_id
    OR claimed.checksum <> p_checksum
  THEN
    RAISE EXCEPTION 'evidence_idempotency_conflict'
      USING ERRCODE = '23505';
  END IF;

  RETURN jsonb_build_object(
    'created', inserted,
    'operation', to_jsonb(claimed)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION claim_evidence_operation_v2(
  TEXT, TEXT, TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB
) TO authenticated;
GRANT EXECUTE ON FUNCTION claim_evidence_operation_v2(
  TEXT, TEXT, TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB
) TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('experience-media-v2', 'experience-media-v2', false, 104857600, NULL)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- The experience row is persisted idempotently before this function. This
-- transaction commits event upserts and evidence links together. It never
-- deletes all events first, so existing assets.event_id links remain valid.
CREATE OR REPLACE FUNCTION commit_experience_graph_v2(
  p_experience_id TEXT,
  p_workspace_id UUID,
  p_owner_user_id UUID,
  p_events JSONB DEFAULT '[]'::jsonb,
  p_asset_links JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  expected_assets INTEGER := COALESCE(jsonb_array_length(p_asset_links), 0);
  linked_assets INTEGER := 0;
  committed_events INTEGER := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM experiences e
    WHERE e.experience_id = p_experience_id
      AND e.user_id = p_owner_user_id
      AND e.workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'experience_v2_parent_not_found'
      USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_events) AS item(event_id TEXT)
    JOIN experience_events existing ON existing.event_id = item.event_id
    WHERE existing.experience_id <> p_experience_id
  ) THEN
    RAISE EXCEPTION 'experience_v2_event_id_conflict'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_asset_links) AS link(asset_id TEXT, event_id TEXT)
    WHERE NULLIF(link.event_id, '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM experience_events event
        WHERE event.event_id = link.event_id
          AND event.experience_id = p_experience_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_events) AS incoming(event_id TEXT)
        WHERE incoming.event_id = link.event_id
      )
  ) THEN
    RAISE EXCEPTION 'experience_v2_asset_event_mismatch'
      USING ERRCODE = '23503';
  END IF;

  IF (
    SELECT count(*)
    FROM jsonb_to_recordset(p_asset_links) AS link(asset_id TEXT)
  ) <> (
    SELECT count(DISTINCT link.asset_id)
    FROM jsonb_to_recordset(p_asset_links) AS link(asset_id TEXT)
  ) THEN
    RAISE EXCEPTION 'experience_v2_duplicate_asset_link'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO experience_events (
    event_id,
    experience_id,
    workspace_id,
    participant_id,
    event_order,
    title,
    description,
    occurred_at,
    duration_minutes,
    mood,
    energy,
    narrative_text,
    narrative_status,
    metadata,
    source_type,
    source_device,
    source_id,
    captured_at,
    uploaded_at,
    processing_status,
    permissions,
    metadata_fingerprint,
    updated_at
  )
  SELECT
    item.event_id,
    p_experience_id,
    p_workspace_id,
    item.participant_id,
    item.event_order,
    item.title,
    item.description,
    item.occurred_at,
    item.duration_minutes,
    item.mood,
    item.energy,
    item.narrative_text,
    COALESCE(item.narrative_status, 'pending'),
    COALESCE(item.metadata, '{}'::jsonb),
    item.source_type,
    item.source_device,
    item.source_id,
    item.captured_at,
    item.uploaded_at,
    item.processing_status,
    item.permissions,
    item.metadata_fingerprint,
    now()
  FROM jsonb_to_recordset(p_events) AS item(
    event_id TEXT,
    participant_id TEXT,
    event_order INTEGER,
    title TEXT,
    description TEXT,
    occurred_at TIMESTAMPTZ,
    duration_minutes INTEGER,
    mood TEXT,
    energy INTEGER,
    narrative_text TEXT,
    narrative_status TEXT,
    metadata JSONB,
    source_type TEXT,
    source_device TEXT,
    source_id TEXT,
    captured_at TIMESTAMPTZ,
    uploaded_at TIMESTAMPTZ,
    processing_status TEXT,
    permissions TEXT,
    metadata_fingerprint TEXT
  )
  ON CONFLICT (event_id) DO UPDATE SET
    participant_id = EXCLUDED.participant_id,
    event_order = EXCLUDED.event_order,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    occurred_at = EXCLUDED.occurred_at,
    duration_minutes = EXCLUDED.duration_minutes,
    mood = EXCLUDED.mood,
    energy = EXCLUDED.energy,
    narrative_text = EXCLUDED.narrative_text,
    narrative_status = EXCLUDED.narrative_status,
    metadata = EXCLUDED.metadata,
    source_type = EXCLUDED.source_type,
    source_device = EXCLUDED.source_device,
    source_id = EXCLUDED.source_id,
    captured_at = EXCLUDED.captured_at,
    uploaded_at = EXCLUDED.uploaded_at,
    processing_status = EXCLUDED.processing_status,
    permissions = EXCLUDED.permissions,
    metadata_fingerprint = EXCLUDED.metadata_fingerprint,
    updated_at = now();

  GET DIAGNOSTICS committed_events = ROW_COUNT;

  UPDATE assets a
  SET
    experience_id = p_experience_id,
    event_id = NULLIF(link.event_id, ''),
    adoption_status = 'adopted',
    adopted_at = now(),
    adoption_method = 'experience_commit_v2',
    adoption_confidence = 1,
    metadata = COALESCE(a.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'linkedExperienceId', p_experience_id,
        'linkedEventId', COALESCE(link.event_id, ''),
        'adoptionStatus', 'adopted',
        'adoptionMethod', 'experience_commit_v2'
      ),
    updated_at = now()
  FROM jsonb_to_recordset(p_asset_links) AS link(asset_id TEXT, event_id TEXT)
  WHERE a.asset_id = link.asset_id
    AND a.workspace_id = p_workspace_id
    AND a.owner_user_id = p_owner_user_id;

  GET DIAGNOSTICS linked_assets = ROW_COUNT;

  IF linked_assets <> expected_assets THEN
    RAISE EXCEPTION 'evidence_v2_link_count_mismatch expected=% linked=%',
      expected_assets,
      linked_assets
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE evidence_operations_v2 op
  SET
    requested_experience_id = p_experience_id,
    requested_event_id = NULLIF(link.event_id, ''),
    state = 'linked_complete',
    last_error_code = NULL,
    last_error_detail = NULL,
    completed_at = now(),
    updated_at = now()
  FROM jsonb_to_recordset(p_asset_links) AS link(asset_id TEXT, event_id TEXT)
  WHERE op.asset_id = link.asset_id
    AND op.workspace_id = p_workspace_id
    AND op.owner_user_id = p_owner_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'experienceId', p_experience_id,
    'eventsCommitted', committed_events,
    'assetsExpected', expected_assets,
    'assetsLinked', linked_assets
  );
END;
$$;

GRANT EXECUTE ON FUNCTION commit_experience_graph_v2(TEXT, UUID, UUID, JSONB, JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION commit_experience_graph_v2(TEXT, UUID, UUID, JSONB, JSONB)
  TO service_role;

NOTIFY pgrst, 'reload schema';
