CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS workspaces (
  workspace_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS participants (
  participant_id TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email TEXT,
  segment TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE experiences
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS participant_id TEXT REFERENCES participants(participant_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS experiences_workspace_time_idx
  ON experiences (workspace_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS experiences_participant_time_idx
  ON experiences (participant_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS experience_events (
  event_id TEXT PRIMARY KEY,
  experience_id TEXT NOT NULL REFERENCES experiences(experience_id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  participant_id TEXT REFERENCES participants(participant_id) ON DELETE SET NULL,
  event_order INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT,
  occurred_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  mood TEXT,
  energy INTEGER CHECK (energy BETWEEN 1 AND 10),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS experience_events_experience_order_idx
  ON experience_events (experience_id, event_order);

CREATE TABLE IF NOT EXISTS assets (
  asset_id TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  participant_id TEXT REFERENCES participants(participant_id) ON DELETE SET NULL,
  experience_id TEXT REFERENCES experiences(experience_id) ON DELETE SET NULL,
  event_id TEXT REFERENCES experience_events(event_id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  storage_bucket TEXT NOT NULL DEFAULT 'experience-media',
  storage_path TEXT,
  signed_url TEXT,
  preview_text TEXT,
  analysis_text TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assets_workspace_created_idx
  ON assets (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS assets_experience_idx
  ON assets (experience_id);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE experience_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE workspaces TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE workspace_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE participants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE experience_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE assets TO authenticated;

DROP POLICY IF EXISTS "Members can read workspaces" ON workspaces;
DROP POLICY IF EXISTS "Owners can manage workspaces" ON workspaces;
DROP POLICY IF EXISTS "Members can read memberships" ON workspace_members;
DROP POLICY IF EXISTS "Owners and admins can manage memberships" ON workspace_members;
DROP POLICY IF EXISTS "Members can manage participants" ON participants;
DROP POLICY IF EXISTS "Members can manage experience events" ON experience_events;
DROP POLICY IF EXISTS "Members can manage assets" ON assets;

CREATE POLICY "Members can read workspaces"
  ON workspaces
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspaces.workspace_id
        AND wm.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Owners can manage workspaces"
  ON workspaces
  FOR ALL
  TO authenticated
  USING (owner_user_id = (select auth.uid()))
  WITH CHECK (owner_user_id = (select auth.uid()));

CREATE POLICY "Members can read memberships"
  ON workspace_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.workspace_id = workspace_members.workspace_id
        AND w.owner_user_id = (select auth.uid())
    )
  );

CREATE POLICY "Owners and admins can manage memberships"
  ON workspace_members
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.workspace_id = workspace_members.workspace_id
        AND w.owner_user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.workspace_id = workspace_members.workspace_id
        AND w.owner_user_id = (select auth.uid())
    )
  );

CREATE POLICY "Members can manage participants"
  ON participants
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = participants.workspace_id
        AND wm.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = participants.workspace_id
        AND wm.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Members can manage experience events"
  ON experience_events
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = experience_events.workspace_id
        AND wm.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = experience_events.workspace_id
        AND wm.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Members can manage assets"
  ON assets
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = assets.workspace_id
        AND wm.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = assets.workspace_id
        AND wm.user_id = (select auth.uid())
    )
  );

-- After this migration is validated, replace the old experiences policy with a
-- workspace-aware policy. Keep the old user_id policy until existing data is migrated.
DROP POLICY IF EXISTS "Workspace members can manage experiences" ON experiences;
CREATE POLICY "Workspace members can manage experiences"
  ON experiences
  FOR ALL
  TO authenticated
  USING (
    (select auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = experiences.workspace_id
        AND wm.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    (select auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = experiences.workspace_id
        AND wm.user_id = (select auth.uid())
    )
  );

-- Align the private bucket with the real mobile/tablet use case. The app still
-- validates supported formats; Supabase should not reject valid media only
-- because it is larger than the old desktop-oriented limit.
UPDATE storage.buckets
SET file_size_limit = 104857600,
    allowed_mime_types = NULL
WHERE id = 'experience-media';
