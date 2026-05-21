CREATE TABLE IF NOT EXISTS asset_upload_attempts (
  attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id TEXT NOT NULL,
  experience_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT,
  file_name TEXT,
  mime_type TEXT,
  size_bytes BIGINT DEFAULT 0,
  bucket_id TEXT NOT NULL DEFAULT 'experience-media',
  storage_path TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'uploading', 'uploaded', 'failed')),
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS asset_upload_attempts_asset_time_idx
  ON asset_upload_attempts (asset_id, started_at DESC);

CREATE INDEX IF NOT EXISTS asset_upload_attempts_user_status_idx
  ON asset_upload_attempts (user_id, status, started_at DESC);

ALTER TABLE asset_upload_attempts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE asset_upload_attempts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE asset_upload_attempts TO service_role;

DROP POLICY IF EXISTS "Users can manage own upload attempts" ON asset_upload_attempts;

CREATE POLICY "Users can manage own upload attempts"
  ON asset_upload_attempts
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
