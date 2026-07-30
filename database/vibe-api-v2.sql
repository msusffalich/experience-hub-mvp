-- Vibe API 2 production schema.
-- Apply after schema.sql, auth-rls.sql, workspace-events-assets.sql,
-- evidence-adoption-context-signals.sql, event-narrative-rollup.sql and
-- capture-pipeline.sql.

BEGIN;

ALTER TABLE public.experiences
  ALTER COLUMN energy DROP NOT NULL,
  ALTER COLUMN mood SET DEFAULT '';

CREATE TABLE IF NOT EXISTS public.vibe_jobs_v2 (
  job_id TEXT PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(workspace_id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued',
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  error JSONB,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vibe_jobs_v2
  DROP CONSTRAINT IF EXISTS vibe_jobs_v2_state_check,
  ADD CONSTRAINT vibe_jobs_v2_state_check
    CHECK (state IN ('queued', 'running', 'complete', 'retry_pending', 'needs_attention'));

CREATE INDEX IF NOT EXISTS vibe_jobs_v2_owner_state_idx
  ON public.vibe_jobs_v2 (owner_user_id, state, created_at DESC);

CREATE INDEX IF NOT EXISTS vibe_jobs_v2_workspace_type_idx
  ON public.vibe_jobs_v2 (workspace_id, job_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.integration_connections_v2 (
  connection_id TEXT PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(workspace_id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'not_connected',
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  access_token_encrypted TEXT NOT NULL DEFAULT '',
  refresh_token_encrypted TEXT NOT NULL DEFAULT '',
  token_expires_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  last_error JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, workspace_id, provider)
);

ALTER TABLE public.integration_connections_v2
  DROP CONSTRAINT IF EXISTS integration_connections_v2_provider_check,
  ADD CONSTRAINT integration_connections_v2_provider_check
    CHECK (provider IN ('oura')),
  DROP CONSTRAINT IF EXISTS integration_connections_v2_status_check,
  ADD CONSTRAINT integration_connections_v2_status_check
    CHECK (status IN ('not_connected', 'connected', 'error', 'revoked'));

CREATE INDEX IF NOT EXISTS integration_connections_v2_provider_user_idx
  ON public.integration_connections_v2 (provider, provider_user_id)
  WHERE provider_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.integration_oauth_states_v2 (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(workspace_id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integration_oauth_states_v2_expiry_idx
  ON public.integration_oauth_states_v2 (expires_at)
  WHERE consumed_at IS NULL;

DROP FUNCTION IF EXISTS public.save_story_v2(JSONB, JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.save_story_v2(
  p_story JSONB,
  p_events JSONB DEFAULT '[]'::jsonb,
  p_capture_ids JSONB DEFAULT '[]'::jsonb,
  p_legacy_asset_ids JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  story_id_value TEXT := NULLIF(BTRIM(p_story->>'experience_id'), '');
  workspace_id_value UUID := NULLIF(p_story->>'workspace_id', '')::UUID;
  event_value JSONB;
  capture_value TEXT;
  event_index INTEGER := 0;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;
  IF story_id_value IS NULL OR workspace_id_value IS NULL THEN
    RAISE EXCEPTION 'story_identity_required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members member
    WHERE member.workspace_id = workspace_id_value
      AND member.user_id = current_user_id
  ) THEN
    RAISE EXCEPTION 'workspace_forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.experiences (
    experience_id,
    user_id,
    owner_user_id,
    workspace_id,
    participant_id,
    title,
    category,
    occurred_at,
    duration_minutes,
    mood,
    energy,
    location,
    people,
    notes,
    locale,
    attachments,
    metadata,
    updated_at
  ) VALUES (
    story_id_value,
    current_user_id,
    current_user_id,
    workspace_id_value,
    NULLIF(p_story->>'participant_id', ''),
    p_story->>'title',
    p_story->>'category',
    (p_story->>'occurred_at')::TIMESTAMPTZ,
    COALESCE((p_story->>'duration_minutes')::INTEGER, 0),
    COALESCE(p_story->>'mood', ''),
    NULLIF(p_story->>'energy', '')::INTEGER,
    NULLIF(p_story->>'location', ''),
    NULLIF(p_story->>'people', ''),
    NULLIF(p_story->>'notes', ''),
    COALESCE(NULLIF(p_story->>'locale', ''), 'es'),
    COALESCE(p_story->'attachments', '[]'::jsonb),
    COALESCE(p_story->'metadata', '{}'::jsonb),
    now()
  )
  ON CONFLICT (experience_id) DO UPDATE SET
    participant_id = EXCLUDED.participant_id,
    title = EXCLUDED.title,
    category = EXCLUDED.category,
    occurred_at = EXCLUDED.occurred_at,
    duration_minutes = EXCLUDED.duration_minutes,
    mood = EXCLUDED.mood,
    energy = EXCLUDED.energy,
    location = EXCLUDED.location,
    people = EXCLUDED.people,
    notes = EXCLUDED.notes,
    locale = EXCLUDED.locale,
    metadata = EXCLUDED.metadata,
    updated_at = now()
  WHERE experiences.user_id = current_user_id
    AND experiences.workspace_id = workspace_id_value;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'story_write_forbidden' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.experience_events
  WHERE experience_id = story_id_value;

  FOR event_value IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_events, '[]'::jsonb))
  LOOP
    event_index := event_index + 1;
    INSERT INTO public.experience_events (
      event_id,
      experience_id,
      workspace_id,
      participant_id,
      event_order,
      title,
      description,
      narrative_text,
      narrative_status,
      occurred_at,
      duration_minutes,
      mood,
      energy,
      metadata,
      updated_at
    ) VALUES (
      COALESCE(NULLIF(event_value->>'event_id', ''), gen_random_uuid()::TEXT),
      story_id_value,
      workspace_id_value,
      NULLIF(p_story->>'participant_id', ''),
      event_index,
      COALESCE(NULLIF(event_value->>'title', ''), 'Evento ' || event_index),
      NULLIF(event_value->>'description', ''),
      NULLIF(event_value->>'narrative_text', ''),
      CASE
        WHEN LENGTH(BTRIM(COALESCE(event_value->>'narrative_text', ''))) >= 8 THEN 'ok'
        ELSE 'pending'
      END,
      COALESCE(NULLIF(event_value->>'occurred_at', '')::TIMESTAMPTZ, (p_story->>'occurred_at')::TIMESTAMPTZ),
      NULLIF(event_value->>'duration_minutes', '')::INTEGER,
      NULLIF(event_value->>'mood', ''),
      NULLIF(event_value->>'energy', '')::INTEGER,
      COALESCE(event_value->'metadata', '{}'::jsonb),
      now()
    );
  END LOOP;

  DELETE FROM public.story_evidence_links
  WHERE story_id = story_id_value
    AND NOT (
      capture_id = ANY (
        ARRAY(
          SELECT jsonb_array_elements_text(COALESCE(p_capture_ids, '[]'::jsonb))
        )
      )
    );

  FOR capture_value IN
    SELECT DISTINCT value
    FROM jsonb_array_elements_text(COALESCE(p_capture_ids, '[]'::jsonb))
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.capture_records capture
      WHERE capture.capture_id = capture_value
        AND capture.owner_user_id = current_user_id
        AND capture.workspace_id = workspace_id_value
        AND capture.intent = 'evidence'
    ) THEN
      RAISE EXCEPTION 'adoption_capture_mismatch' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.story_evidence_links (
      story_id,
      capture_id,
      linked_by,
      linked_at,
      metadata
    ) VALUES (
      story_id_value,
      capture_value,
      current_user_id,
      now(),
      '{"method":"story_editor_v2"}'::jsonb
    )
    ON CONFLICT (story_id, capture_id) DO UPDATE SET
      linked_by = EXCLUDED.linked_by,
      linked_at = EXCLUDED.linked_at,
      metadata = EXCLUDED.metadata;
  END LOOP;

  UPDATE public.assets
  SET
    experience_id = NULL,
    event_id = NULL,
    adoption_status = 'inbox',
    adopted_at = NULL,
    adoption_method = NULL,
    updated_at = now()
  WHERE experience_id = story_id_value
    AND owner_user_id = current_user_id
    AND workspace_id = workspace_id_value
    AND NOT (
      asset_id = ANY (
        ARRAY(
          SELECT jsonb_array_elements_text(COALESCE(p_legacy_asset_ids, '[]'::jsonb))
        )
      )
    );

  UPDATE public.assets
  SET
    experience_id = story_id_value,
    adoption_status = 'adopted',
    adopted_at = now(),
    adoption_method = 'story_editor_v2',
    updated_at = now()
  WHERE asset_id = ANY (
      ARRAY(
        SELECT jsonb_array_elements_text(COALESCE(p_legacy_asset_ids, '[]'::jsonb))
      )
    )
    AND owner_user_id = current_user_id
    AND workspace_id = workspace_id_value;

  IF (
    SELECT COUNT(*)
    FROM public.assets
    WHERE asset_id = ANY (
        ARRAY(
          SELECT jsonb_array_elements_text(COALESCE(p_legacy_asset_ids, '[]'::jsonb))
        )
      )
      AND owner_user_id = current_user_id
      AND workspace_id = workspace_id_value
      AND experience_id = story_id_value
  ) <> jsonb_array_length(COALESCE(p_legacy_asset_ids, '[]'::jsonb)) THEN
    RAISE EXCEPTION 'legacy_asset_adoption_mismatch' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'story_id', story_id_value,
    'events', jsonb_array_length(COALESCE(p_events, '[]'::jsonb)),
    'evidence', jsonb_array_length(COALESCE(p_capture_ids, '[]'::jsonb))
      + jsonb_array_length(COALESCE(p_legacy_asset_ids, '[]'::jsonb))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_story_v2(JSONB, JSONB, JSONB, JSONB)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_story_v2(p_story_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  deleted_count INTEGER := 0;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.assets
  SET
    experience_id = NULL,
    event_id = NULL,
    adoption_status = 'inbox',
    adopted_at = NULL,
    adoption_method = NULL,
    updated_at = now()
  WHERE experience_id = p_story_id
    AND owner_user_id = current_user_id;

  DELETE FROM public.experiences
  WHERE experience_id = p_story_id
    AND user_id = current_user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count <> 1 THEN
    RAISE EXCEPTION 'story_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('ok', true, 'story_id', p_story_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_story_v2(TEXT)
  TO authenticated, service_role;

ALTER TABLE public.vibe_jobs_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_connections_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_oauth_states_v2 ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vibe_jobs_v2 TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_connections_v2 TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_oauth_states_v2 TO service_role;

DROP POLICY IF EXISTS "Owners manage Vibe API 2 jobs" ON public.vibe_jobs_v2;
CREATE POLICY "Owners manage Vibe API 2 jobs"
  ON public.vibe_jobs_v2
  FOR ALL
  TO authenticated
  USING (
    owner_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members member
      WHERE member.workspace_id = vibe_jobs_v2.workspace_id
        AND member.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    owner_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members member
      WHERE member.workspace_id = vibe_jobs_v2.workspace_id
        AND member.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Owners read Vibe API 2 integrations" ON public.integration_connections_v2;
CREATE POLICY "Owners read Vibe API 2 integrations"
  ON public.integration_connections_v2
  FOR SELECT
  TO authenticated
  USING (
    owner_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members member
      WHERE member.workspace_id = integration_connections_v2.workspace_id
        AND member.user_id = (SELECT auth.uid())
    )
  );

-- OAuth tokens and state mutations are server-only. Authenticated users see
-- sanitized integration status through /api/v2, never the encrypted columns.

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT
  to_regclass('public.vibe_jobs_v2') IS NOT NULL AS jobs_ready,
  to_regclass('public.integration_connections_v2') IS NOT NULL AS integrations_ready,
  to_regclass('public.integration_oauth_states_v2') IS NOT NULL AS oauth_states_ready,
  to_regprocedure('public.save_story_v2(jsonb,jsonb,jsonb,jsonb)') IS NOT NULL AS story_transaction_ready,
  to_regprocedure('public.delete_story_v2(text)') IS NOT NULL AS story_delete_ready,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'experiences'
      AND column_name = 'energy'
      AND is_nullable = 'YES'
  ) AS missing_energy_stays_null;
