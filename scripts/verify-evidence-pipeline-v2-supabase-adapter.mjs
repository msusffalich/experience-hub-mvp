import assert from "node:assert/strict";
import { createEvidencePipelineV2 } from "../lib/evidence-pipeline-v2.mjs";
import { createSupabaseEvidenceV2Adapters } from "../lib/evidence-pipeline-v2-supabase.mjs";

const db = {
  operations: new Map(),
  assets: new Map(),
  experiences: new Map(),
  events: new Map(),
  objects: new Map(),
  failNextRpc: false,
};

function eqValue(filter = "") {
  return String(filter).replace(/^eq\./, "");
}

async function rest(table, options = {}) {
  const method = options.method || "GET";
  const body = options.body ? JSON.parse(options.body) : null;
  const query = options.searchParams || {};
  if (table === "evidence_operations_v2") {
    if (method === "POST") {
      db.operations.set(body.operation_id, structuredClone(body));
      return [structuredClone(body)];
    }
    return [...db.operations.values()]
      .filter((row) => !query.owner_user_id || row.owner_user_id === eqValue(query.owner_user_id))
      .filter((row) => !query.idempotency_key || row.idempotency_key === eqValue(query.idempotency_key))
      .filter((row) => !query.asset_id || row.asset_id === eqValue(query.asset_id))
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
      .slice(0, Number(query.limit || 500))
      .map((row) => structuredClone(row));
  }
  if (table === "assets") {
    if (method === "POST") {
      db.assets.set(body.asset_id, structuredClone(body));
      return [structuredClone(body)];
    }
    return [...db.assets.values()]
      .filter((row) => !query.workspace_id || row.workspace_id === eqValue(query.workspace_id))
      .filter((row) => !query.owner_user_id || row.owner_user_id === eqValue(query.owner_user_id))
      .filter((row) => !query.asset_id || row.asset_id === eqValue(query.asset_id))
      .filter((row) => !query.adoption_status || row.adoption_status === eqValue(query.adoption_status))
      .slice(0, Number(query.limit || 500))
      .map((row) => structuredClone(row));
  }
  if (table === "experiences") {
    if (method === "POST") {
      db.experiences.set(body.experience_id, structuredClone(body));
      return [structuredClone(body)];
    }
    return [...db.experiences.values()]
      .filter((row) => !query.experience_id || row.experience_id === eqValue(query.experience_id))
      .filter((row) => !query.user_id || row.user_id === eqValue(query.user_id))
      .filter((row) => !query.workspace_id || row.workspace_id === eqValue(query.workspace_id))
      .map((row) => structuredClone(row));
  }
  throw new Error(`unsupported_table:${table}`);
}

async function rpc(name, payload) {
  if (name === "claim_evidence_operation_v2") {
    const existing = [...db.operations.values()].find((row) =>
      row.owner_user_id === payload.p_owner_user_id &&
      row.idempotency_key === payload.p_idempotency_key
    );
    if (existing) {
      if (
        existing.asset_id !== payload.p_asset_id ||
        existing.workspace_id !== payload.p_workspace_id ||
        existing.checksum !== payload.p_checksum
      ) {
        throw new Error("evidence_idempotency_conflict");
      }
      return { created: false, operation: structuredClone(existing) };
    }
    const operation = {
      operation_id: payload.p_operation_id,
      idempotency_key: payload.p_idempotency_key,
      asset_id: payload.p_asset_id,
      owner_user_id: payload.p_owner_user_id,
      workspace_id: payload.p_workspace_id,
      requested_experience_id: payload.p_requested_experience_id,
      requested_event_id: payload.p_requested_event_id,
      checksum: payload.p_checksum,
      storage_path: payload.p_storage_path,
      state: "received",
      attempt_count: 0,
      created_at: "2026-07-26T12:00:00.000Z",
      updated_at: "2026-07-26T12:00:00.000Z",
      metadata: payload.p_metadata || {},
    };
    db.operations.set(operation.operation_id, operation);
    return { created: true, operation: structuredClone(operation) };
  }
  assert.equal(name, "commit_experience_graph_v2");
  if (db.failNextRpc) {
    db.failNextRpc = false;
    throw new Error("simulated_rpc_failure");
  }
  const experience = db.experiences.get(payload.p_experience_id);
  if (!experience) throw new Error("experience_v2_parent_not_found");
  const assetIds = payload.p_asset_links.map((item) => item.asset_id);
  if (assetIds.some((assetId) => !db.assets.has(assetId))) {
    throw new Error("evidence_v2_link_count_mismatch");
  }

  const nextEvents = new Map(db.events);
  const nextAssets = new Map([...db.assets.entries()].map(([key, value]) => [key, structuredClone(value)]));
  for (const event of payload.p_events) nextEvents.set(event.event_id, structuredClone(event));
  for (const link of payload.p_asset_links) {
    const asset = nextAssets.get(link.asset_id);
    nextAssets.set(link.asset_id, {
      ...asset,
      experience_id: payload.p_experience_id,
      event_id: link.event_id || null,
      adoption_status: "adopted",
    });
  }
  db.events = nextEvents;
  db.assets = nextAssets;
  return {
    ok: true,
    experienceId: payload.p_experience_id,
    eventsCommitted: payload.p_events.length,
    assetsExpected: assetIds.length,
    assetsLinked: assetIds.length,
  };
}

const user = { id: "11111111-1111-1111-1111-111111111111", accessToken: "token" };
const workspaceId = "22222222-2222-2222-2222-222222222222";
const adapters = createSupabaseEvidenceV2Adapters({
  user,
  workspaceId,
  rest,
  rpc,
  putObject: async (bucket, storagePath, bytes, metadata) => {
    assert.equal(bucket, "experience-media-v2");
    db.objects.set(`${bucket}/${storagePath}`, { bytes: new Uint8Array(bytes), metadata });
  },
  objectExists: async (bucket, storagePath) => db.objects.has(`${bucket}/${storagePath}`),
  mapExperienceRow: async (experience) => ({
    experience_id: experience.id,
    user_id: user.id,
    title: experience.title,
    category: "Trabajo",
    occurred_at: "2026-07-26T12:00:00.000Z",
    duration_minutes: 0,
    mood: "calmo",
    energy: 5,
    locale: "es",
    metadata: {},
  }),
  mapEventRows: async (events) => events.map((event, index) => ({
    event_id: event.id,
    event_order: index + 1,
    title: event.title,
    narrative_text: event.narrativeText || null,
    narrative_status: event.narrativeText ? "ok" : "pending",
    metadata: {},
  })),
});

const pipeline = createEvidencePipelineV2(adapters);
const upload = await pipeline.receiveEvidence({
  assetId: "asset-adapter-1",
  ownerUserId: user.id,
  workspaceId,
  idempotencyKey: "vibeapp-asset:adapter-1",
  name: "foto.jpg",
  mimeType: "image/jpeg",
  bytes: new Uint8Array([1, 2, 3, 4]),
  requestedExperienceId: "experience-adapter-1",
  requestedEventId: "event-adapter-1",
});
assert.equal(upload.linkStatus, "pending_parent");
assert.equal(db.assets.get("asset-adapter-1").experience_id, null);

db.failNextRpc = true;
await assert.rejects(
  () => pipeline.saveExperience({
    ownerUserId: user.id,
    experience: { id: "experience-adapter-1", title: "Prueba adaptador" },
    events: [{ id: "event-adapter-1", title: "Evento", narrativeText: "Narrativa humana real." }],
    assetLinks: [{ assetId: "asset-adapter-1", eventId: "event-adapter-1" }],
  }),
);
assert.equal(db.assets.get("asset-adapter-1").experience_id, null);
assert.equal(db.events.size, 0);

const committed = await pipeline.saveExperience({
  ownerUserId: user.id,
  experience: { id: "experience-adapter-1", title: "Prueba adaptador" },
  events: [{ id: "event-adapter-1", title: "Evento", narrativeText: "Narrativa humana real." }],
  assetLinks: [{ assetId: "asset-adapter-1", eventId: "event-adapter-1" }],
});
assert.deepEqual(committed.evidence, { expected: 1, linked: 1, pending: 0 });
assert.equal(db.assets.get("asset-adapter-1").experience_id, "experience-adapter-1");
assert.equal(db.assets.get("asset-adapter-1").event_id, "event-adapter-1");
assert.equal(db.events.get("event-adapter-1").narrative_status, "ok");

await pipeline.saveExperience({
  ownerUserId: user.id,
  experience: { id: "experience-adapter-1", title: "Prueba adaptador actualizada" },
  events: [{ id: "event-adapter-1", title: "Evento actualizado", narrativeText: "Narrativa humana actualizada." }],
  assetLinks: [{ assetId: "asset-adapter-1", eventId: "event-adapter-1" }],
});
assert.equal(db.assets.get("asset-adapter-1").event_id, "event-adapter-1");
assert.equal(db.events.get("event-adapter-1").title, "Evento actualizado");

console.log("Evidence pipeline V2 Supabase adapter: transaction and retry checks passed.");
