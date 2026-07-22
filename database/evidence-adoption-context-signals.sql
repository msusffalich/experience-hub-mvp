-- Vibe evidence adoption and ambient context model.
-- This migration prepares the database for the capture blueprint:
-- Persona -> Experience -> Event -> Evidence / data.
--
-- Intentional evidence can exist before an experience is defined.
-- Ambient context is stored as a time-based signal and is referenced by
-- experiences; it must not be promoted to a fake experience.

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS evidence_type TEXT NOT NULL DEFAULT 'intentional',
  ADD COLUMN IF NOT EXISTS adoption_status TEXT NOT NULL DEFAULT 'inbox',
  ADD COLUMN IF NOT EXISTS adopted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS adoption_method TEXT,
  ADD COLUMN IF NOT EXISTS adoption_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS pruned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pruned_reason TEXT;

ALTER TABLE assets
  DROP CONSTRAINT IF EXISTS assets_evidence_type_check,
  ADD CONSTRAINT assets_evidence_type_check
    CHECK (evidence_type IN ('intentional', 'ambient_snapshot', 'reference', 'generated'));

ALTER TABLE assets
  DROP CONSTRAINT IF EXISTS assets_adoption_status_check,
  ADD CONSTRAINT assets_adoption_status_check
    CHECK (adoption_status IN ('inbox', 'adopted', 'suggested', 'ignored', 'pruned', 'context_reference'));

CREATE INDEX IF NOT EXISTS assets_workspace_inbox_time_idx
  ON assets (workspace_id, adoption_status, captured_at DESC);

CREATE INDEX IF NOT EXISTS assets_workspace_evidence_time_idx
  ON assets (workspace_id, evidence_type, captured_at DESC);

CREATE TABLE IF NOT EXISTS context_signals (
  signal_id TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  participant_id TEXT,
  source_type TEXT NOT NULL,
  source_device TEXT,
  source_id TEXT,
  signal_type TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  location TEXT,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS context_signals_workspace_time_idx
  ON context_signals (workspace_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS context_signals_workspace_type_time_idx
  ON context_signals (workspace_id, signal_type, captured_at DESC);

CREATE INDEX IF NOT EXISTS context_signals_workspace_participant_time_idx
  ON context_signals (workspace_id, participant_id, captured_at DESC);

ALTER TABLE context_signals ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE context_signals TO authenticated;

DROP POLICY IF EXISTS "Members can manage context signals" ON context_signals;

CREATE POLICY "Members can manage context signals"
  ON context_signals
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = context_signals.workspace_id
        AND wm.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = context_signals.workspace_id
        AND wm.user_id = (select auth.uid())
    )
  );

NOTIFY pgrst, 'reload schema';
