CREATE TABLE IF NOT EXISTS agenda_events (
  event_id TEXT PRIMARY KEY,
  user_id UUID REFERENCES profiles(user_id) ON DELETE CASCADE,
  participant_id TEXT,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Personal',
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  location TEXT,
  participants TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'Planificado',
  reminders TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_experience_id TEXT,
  linked_experience_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agenda_events_user_start_idx
  ON agenda_events (user_id, start_at ASC);

CREATE INDEX IF NOT EXISTS agenda_events_participant_idx
  ON agenda_events (participant_id);

ALTER TABLE agenda_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own agenda events" ON agenda_events;
CREATE POLICY "Users can read own agenda events"
  ON agenda_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own agenda events" ON agenda_events;
CREATE POLICY "Users can insert own agenda events"
  ON agenda_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own agenda events" ON agenda_events;
CREATE POLICY "Users can update own agenda events"
  ON agenda_events FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own agenda events" ON agenda_events;
CREATE POLICY "Users can delete own agenda events"
  ON agenda_events FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON agenda_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON agenda_events TO service_role;
