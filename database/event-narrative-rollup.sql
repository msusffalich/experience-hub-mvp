-- Adds two-level human narrative support for experience events.
-- Safe to run multiple times in Supabase SQL Editor.

ALTER TABLE experience_events
  ADD COLUMN IF NOT EXISTS narrative_text TEXT,
  ADD COLUMN IF NOT EXISTS narrative_status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE experience_events DROP CONSTRAINT IF EXISTS experience_events_narrative_status_check;
ALTER TABLE experience_events
  ADD CONSTRAINT experience_events_narrative_status_check
  CHECK (narrative_status IN ('ok', 'pending'));

CREATE INDEX IF NOT EXISTS experience_events_workspace_narrative_idx
  ON experience_events (workspace_id, narrative_status, occurred_at DESC);

NOTIFY pgrst, 'reload schema';
