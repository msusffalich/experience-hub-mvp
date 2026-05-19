ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_briefings ENABLE ROW LEVEL SECURITY;

-- Supabase is moving new projects toward explicit Data API grants.
-- RLS decides which rows a user can access; GRANT decides whether the role can
-- reach the table through PostgREST at all.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE experiences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE daily_briefings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE experiences TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE daily_briefings TO service_role;

DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can manage own experiences" ON experiences;
DROP POLICY IF EXISTS "Users can manage own daily briefings" ON daily_briefings;
DROP POLICY IF EXISTS "Users can read own experience media" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own experience media" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own experience media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own experience media" ON storage.objects;

CREATE POLICY "Users can read own profile"
  ON profiles
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own experiences"
  ON experiences
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own daily briefings"
  ON daily_briefings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

UPDATE storage.buckets
SET public = false
WHERE id = 'experience-media';

CREATE POLICY "Users can read own experience media"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'experience-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can upload own experience media"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'experience-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update own experience media"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'experience-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'experience-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own experience media"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'experience-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
