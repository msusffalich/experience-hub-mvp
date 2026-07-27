-- Read-only verification after database/evidence-pipeline-v2.sql.

SELECT
  to_regclass('public.evidence_operations_v2') IS NOT NULL AS operation_ledger_ready,
  to_regprocedure(
    'public.claim_evidence_operation_v2(text,text,text,uuid,uuid,text,text,text,text,jsonb)'
  ) IS NOT NULL AS claim_function_ready,
  to_regprocedure(
    'public.commit_experience_graph_v2(text,uuid,uuid,jsonb,jsonb)'
  ) IS NOT NULL AS graph_function_ready;

SELECT
  id,
  name,
  public,
  file_size_limit
FROM storage.buckets
WHERE id = 'experience-media-v2';

SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'evidence_operations_v2'
ORDER BY ordinal_position;

SELECT
  column_name,
  data_type,
  is_nullable
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
ORDER BY column_name;
