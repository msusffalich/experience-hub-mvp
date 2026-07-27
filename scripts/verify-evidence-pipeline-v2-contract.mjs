import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [server, migration, readiness, adapter, pipeline] = await Promise.all([
  readFile(new URL("../server.js", import.meta.url), "utf8"),
  readFile(new URL("../database/evidence-pipeline-v2.sql", import.meta.url), "utf8"),
  readFile(new URL("../database/evidence-pipeline-v2-readiness.sql", import.meta.url), "utf8"),
  readFile(new URL("../lib/evidence-pipeline-v2-supabase.mjs", import.meta.url), "utf8"),
  readFile(new URL("../lib/evidence-pipeline-v2.mjs", import.meta.url), "utf8"),
]);

assert.match(
  server,
  /EVIDENCE_PIPELINE_MODE\s*=\s*String\(process\.env\.EVIDENCE_PIPELINE_MODE\s*\|\|\s*"off"\)/,
  "V2 must remain off unless explicitly enabled.",
);
assert.match(server, /url\.pathname === "\/api\/v2\/status"/);
assert.match(server, /url\.pathname === "\/api\/v2\/evidence"/);
assert.match(server, /evidence_pipeline_v2_text_required/);
assert.match(server, /media\.requestedExperienceId/);
assert.match(server, /normalizeExperienceSubmissionV2/);
assert.match(server, /url\.pathname === "\/api\/v2\/experiences"/);
assert.match(server, /url\.pathname === "\/api\/media"/);
assert.match(
  server,
  /url\.pathname === "\/api\/media"[\s\S]{0,900}upsertAssetEvidence\(saved, user, \{ requireRemote: true \}\)/,
  "The parallel build must not reroute V1 media before canary approval.",
);
assert.match(
  server,
  /url\.pathname === "\/api\/experiences"[\s\S]{0,600}upsertExperience\(normalized, user\)/,
  "The parallel build must not reroute V1 experiences before canary approval.",
);
assert.match(server, /getEvidencePipelineV2Status/);
assert.match(server, /commit_experience_graph_v2/);

assert.match(migration, /CREATE TABLE IF NOT EXISTS evidence_operations_v2/);
assert.match(migration, /UNIQUE \(owner_user_id, idempotency_key\)/);
assert.match(migration, /CREATE OR REPLACE FUNCTION commit_experience_graph_v2/);
assert.match(migration, /CREATE OR REPLACE FUNCTION claim_evidence_operation_v2/);
assert.match(migration, /FOR UPDATE/);
assert.match(migration, /evidence_idempotency_conflict/);
assert.match(migration, /ON CONFLICT \(event_id\) DO UPDATE/);
assert.doesNotMatch(
  migration,
  /DELETE\s+FROM\s+experience_events/i,
  "V2 must not delete and recreate events.",
);
assert.match(migration, /evidence_v2_link_count_mismatch/);
assert.match(migration, /experience-media-v2/);
assert.match(migration, /public\s*=\s*false/i);
assert.match(readiness, /operation_ledger_ready/);
assert.match(readiness, /claim_function_ready/);
assert.match(readiness, /graph_function_ready/);
assert.match(readiness, /experience-media-v2/);

assert.match(adapter, /attachments:\s*\[\]/);
assert.match(adapter, /adoption_status:\s*"inbox"/);
assert.match(adapter, /experience_id:\s*null/);
assert.match(adapter, /event_id:\s*null/);
assert.match(adapter, /rpc\("commit_experience_graph_v2"/);
assert.match(adapter, /rpc\("claim_evidence_operation_v2"/);
assert.doesNotMatch(
  adapter,
  /DELETE/i,
  "The V2 Supabase adapter must not perform destructive event replacement.",
);

assert.match(pipeline, /evidence_idempotency_conflict/);
assert.match(pipeline, /operationId:\s*operation\.operationId/);
assert.match(pipeline, /mimeType\.startsWith\("text\/"\)/);
assert.match(pipeline, /LINK_PENDING/);
assert.match(pipeline, /LINKED_COMPLETE/);
assert.match(pipeline, /FAILED_RETRYABLE/);

console.log("Evidence pipeline V2 contract: isolation, migration and ownership checks passed.");
