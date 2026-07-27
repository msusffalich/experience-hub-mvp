-- Read-only readiness check. Every value must be true before enabling /api/captures.

SELECT
  to_regclass('public.capture_operations') IS NOT NULL AS operation_ledger_ready,
  to_regclass('public.capture_records') IS NOT NULL AS capture_catalog_ready,
  to_regclass('public.story_evidence_links') IS NOT NULL AS story_links_ready,
  to_regprocedure(
    'public.claim_capture_operation(text,text,text,uuid,uuid,text,text,text,text)'
  ) IS NOT NULL AS claim_function_ready,
  EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'vibe-captures'
      AND public = false
      AND file_size_limit = 104857600
  ) AS private_bucket_ready,
  NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'capture_records'
      AND column_name IN ('experience_id', 'event_id', 'story_id')
  ) AS capture_story_separation_ready;
