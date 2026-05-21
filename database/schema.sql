CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'es',
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  gender TEXT,
  birth_year INTEGER,
  experience_type TEXT NOT NULL DEFAULT 'auto',
  subscription_tier TEXT NOT NULL DEFAULT 'mvp',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS experiences (
  experience_id TEXT PRIMARY KEY,
  user_id UUID REFERENCES profiles(user_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  mood TEXT NOT NULL,
  energy INTEGER NOT NULL CHECK (energy BETWEEN 1 AND 10),
  location TEXT,
  people TEXT,
  notes TEXT,
  locale TEXT NOT NULL DEFAULT 'es',
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS experiences_user_time_idx
  ON experiences (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS experiences_category_idx
  ON experiences (category);

CREATE INDEX IF NOT EXISTS experiences_attachments_gin_idx
  ON experiences USING GIN (attachments);

CREATE TABLE IF NOT EXISTS daily_briefings (
  user_id UUID REFERENCES profiles(user_id) ON DELETE CASCADE,
  location_key TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'es',
  payload JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  next_refresh_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, location_key, locale)
);

CREATE INDEX IF NOT EXISTS daily_briefings_user_generated_idx
  ON daily_briefings (user_id, generated_at DESC);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS birth_year INTEGER,
  ADD COLUMN IF NOT EXISTS experience_type TEXT NOT NULL DEFAULT 'auto';

INSERT INTO profiles (
  user_id,
  email,
  name,
  language,
  timezone,
  subscription_tier
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'local-user@example.com',
  'Experience Hub User',
  'es',
  'America/New_York',
  'mvp'
) ON CONFLICT (user_id) DO NOTHING;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) VALUES (
  'experience-media',
  'experience-media',
  false,
  10485760,
  NULL
) ON CONFLICT (id) DO NOTHING;

UPDATE storage.buckets
SET
  public = false,
  allowed_mime_types = NULL
WHERE id = 'experience-media';

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_briefings ENABLE ROW LEVEL SECURITY;

-- After creating the base schema, run database/auth-rls.sql.
-- That file installs auth.uid() policies for profiles, experiences, daily_briefings,
-- explicit authenticated/service_role GRANTs for the Supabase Data API,
-- and user-folder policies for private Storage objects in the experience-media bucket.
-- The local server may use SUPABASE_SERVICE_ROLE_KEY for controlled backend work,
-- but browser/client authorization must rely on authenticated user RLS policies.
