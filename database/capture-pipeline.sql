-- Canonical capture pipeline.
-- Additive and isolated: Vibeapp writes facts here; only VibePWA owns stories.

CREATE TABLE IF NOT EXISTS capture_operations (
  operation_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  capture_id TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  checksum TEXT NOT NULL,
  intent TEXT NOT NULL,
  kind TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'received',
  attempts INTEGER NOT NULL DEFAULT 0,
  storage_path TEXT,
  last_error JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, idempotency_key)
);

ALTER TABLE capture_operations
  DROP CONSTRAINT IF EXISTS capture_operations_intent_check,
  ADD CONSTRAINT capture_operations_intent_check
    CHECK (intent IN ('evidence', 'context')),
  DROP CONSTRAINT IF EXISTS capture_operations_state_check,
  ADD CONSTRAINT capture_operations_state_check
    CHECK (
      state IN (
        'received',
        'storing',
        'binary_stored',
        'cataloging',
        'complete',
        'retry_pending',
        'needs_attention'
      )
    );

CREATE INDEX IF NOT EXISTS capture_operations_owner_state_idx
  ON capture_operations (owner_user_id, state, updated_at DESC);

CREATE TABLE IF NOT EXISTS capture_records (
  capture_id TEXT PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  participant_id TEXT,
  intent TEXT NOT NULL,
  kind TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  text_content TEXT,
  filename TEXT,
  mime_type TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source JSONB NOT NULL DEFAULT '{}'::jsonb,
  checksum TEXT NOT NULL,
  storage_bucket TEXT,
  storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE capture_records
  DROP CONSTRAINT IF EXISTS capture_records_intent_check,
  ADD CONSTRAINT capture_records_intent_check
    CHECK (intent IN ('evidence', 'context')),
  DROP CONSTRAINT IF EXISTS capture_records_kind_check,
  ADD CONSTRAINT capture_records_kind_check
    CHECK (
      (intent = 'evidence' AND kind IN ('text', 'image', 'audio', 'video', 'document'))
      OR
      (intent = 'context' AND kind IN ('biometric', 'location', 'weather', 'news', 'agenda', 'sensor', 'energy'))
    );

CREATE INDEX IF NOT EXISTS capture_records_owner_time_idx
  ON capture_records (owner_user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS capture_records_workspace_time_idx
  ON capture_records (workspace_id, occurred_at DESC);

-- Story ownership remains in VibePWA. Capture never writes this table.
CREATE TABLE IF NOT EXISTS story_evidence_links (
  story_id TEXT NOT NULL REFERENCES experiences(experience_id) ON DELETE CASCADE,
  capture_id TEXT NOT NULL REFERENCES capture_records(capture_id) ON DELETE RESTRICT,
  event_id TEXT REFERENCES experience_events(event_id) ON DELETE SET NULL,
  linked_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (story_id, capture_id)
);

CREATE INDEX IF NOT EXISTS story_evidence_links_capture_idx
  ON story_evidence_links (capture_id, linked_at DESC);

ALTER TABLE capture_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_evidence_links ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON capture_operations TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON capture_records TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON story_evidence_links TO authenticated, service_role;

DROP POLICY IF EXISTS "Owners manage capture operations" ON capture_operations;
CREATE POLICY "Owners manage capture operations"
  ON capture_operations
  FOR ALL
  TO authenticated
  USING (
    owner_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = capture_operations.workspace_id
        AND wm.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    owner_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = capture_operations.workspace_id
        AND wm.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Owners manage capture records" ON capture_records;
CREATE POLICY "Owners manage capture records"
  ON capture_records
  FOR ALL
  TO authenticated
  USING (
    owner_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = capture_records.workspace_id
        AND wm.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    owner_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = capture_records.workspace_id
        AND wm.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Owners curate story evidence links" ON story_evidence_links;
CREATE POLICY "Owners curate story evidence links"
  ON story_evidence_links
  FOR ALL
  TO authenticated
  USING (
    linked_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM experiences e
      WHERE e.experience_id = story_evidence_links.story_id
        AND e.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    linked_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM experiences e
      WHERE e.experience_id = story_evidence_links.story_id
        AND e.user_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION claim_capture_operation(
  p_operation_id TEXT,
  p_idempotency_key TEXT,
  p_capture_id TEXT,
  p_owner_user_id UUID,
  p_workspace_id UUID,
  p_fingerprint TEXT,
  p_checksum TEXT,
  p_intent TEXT,
  p_kind TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  claimed capture_operations%ROWTYPE;
BEGIN
  INSERT INTO capture_operations (
    operation_id,
    idempotency_key,
    capture_id,
    owner_user_id,
    workspace_id,
    fingerprint,
    checksum,
    intent,
    kind
  ) VALUES (
    p_operation_id,
    p_idempotency_key,
    p_capture_id,
    p_owner_user_id,
    p_workspace_id,
    p_fingerprint,
    p_checksum,
    p_intent,
    p_kind
  )
  ON CONFLICT (owner_user_id, idempotency_key) DO NOTHING;

  SELECT *
  INTO claimed
  FROM capture_operations op
  WHERE op.owner_user_id = p_owner_user_id
    AND op.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF claimed.operation_id IS NULL THEN
    RAISE EXCEPTION 'capture_operation_claim_failed' USING ERRCODE = 'P0001';
  END IF;

  IF claimed.capture_id <> p_capture_id
    OR claimed.workspace_id <> p_workspace_id
    OR claimed.fingerprint <> p_fingerprint
    OR claimed.checksum <> p_checksum
  THEN
    RAISE EXCEPTION 'capture_idempotency_conflict' USING ERRCODE = '23505';
  END IF;

  RETURN to_jsonb(claimed);
END;
$$;

GRANT EXECUTE ON FUNCTION claim_capture_operation(
  TEXT, TEXT, TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT
) TO authenticated, service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('experience-media', 'experience-media', false, 104857600, NULL)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Final verification. Every value must return true before enabling the canary.
SELECT
  to_regclass('public.capture_operations') IS NOT NULL AS operation_ledger_ready,
  to_regclass('public.capture_records') IS NOT NULL AS capture_catalog_ready,
  to_regclass('public.story_evidence_links') IS NOT NULL AS story_links_ready,
  to_regprocedure(
    'public.claim_capture_operation(text,text,text,uuid,uuid,text,text,text,text)'
  ) IS NOT NULL AS claim_function_ready,
  EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'experience-media'
      AND public = false
      AND file_size_limit = 104857600
  ) AS private_bucket_ready,
  NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'capture_records'
      AND column_name IN ('experience_id', 'event_id', 'story_id')
  ) AS capture_story_separation_ready;
