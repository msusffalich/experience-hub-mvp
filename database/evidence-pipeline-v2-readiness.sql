-- Single-row, read-only verification after database/evidence-pipeline-v2.sql.
-- Every column must return true before enabling the V2 canary.

SELECT
  to_regclass('public.evidence_operations_v2') IS NOT NULL
    AS operation_ledger_ready,
  to_regprocedure(
    'public.claim_evidence_operation_v2(text,text,text,uuid,uuid,text,text,text,text,jsonb)'
  ) IS NOT NULL
    AS claim_function_ready,
  to_regprocedure(
    'public.commit_experience_graph_v2(text,uuid,uuid,jsonb,jsonb)'
  ) IS NOT NULL
    AS graph_function_ready,
  EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'experience-media-v2'
      AND name = 'experience-media-v2'
      AND public = false
      AND file_size_limit = 104857600
  ) AS private_bucket_ready,
  (
    SELECT count(DISTINCT column_name) = 10
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'assets'
      AND column_name IN (
        'asset_id',
        'workspace_id',
        'owner_user_id',
        'experience_id',
        'event_id',
        'storage_bucket',
        'storage_path',
        'adoption_status',
        'adopted_at',
        'checksum'
      )
  ) AS asset_schema_ready,
  (
    SELECT count(*) >= 16
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'evidence_operations_v2'
  ) AS operation_schema_ready;
