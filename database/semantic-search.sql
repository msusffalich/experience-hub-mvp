CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE experiences
  ADD COLUMN IF NOT EXISTS embedding vector(384);

ALTER TABLE experiences
  ADD COLUMN IF NOT EXISTS embedding_model TEXT;

CREATE INDEX IF NOT EXISTS experiences_embedding_ivfflat_idx
  ON experiences
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE OR REPLACE FUNCTION match_experiences(
  query_embedding vector(384),
  match_count INT DEFAULT 8
)
RETURNS TABLE (
  experience_id TEXT,
  user_id UUID,
  title TEXT,
  category TEXT,
  occurred_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  mood TEXT,
  energy INTEGER,
  location TEXT,
  people TEXT,
  notes TEXT,
  locale TEXT,
  attachments JSONB,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    e.experience_id,
    e.user_id,
    e.title,
    e.category,
    e.occurred_at,
    e.duration_minutes,
    e.mood,
    e.energy,
    e.location,
    e.people,
    e.notes,
    e.locale,
    e.attachments,
    e.metadata,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM experiences e
  WHERE e.user_id = auth.uid()
    AND e.embedding IS NOT NULL
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION match_experiences(vector, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION match_experiences(vector, INT) TO service_role;
