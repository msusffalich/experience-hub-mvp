import assert from "node:assert/strict";
import {
  createEvidencePipelineV2,
  EVIDENCE_V2_STATES,
  EvidencePipelineError,
} from "../lib/evidence-pipeline-v2.mjs";

class MemoryOperations {
  constructor() {
    this.byKey = new Map();
    this.byAsset = new Map();
  }

  key(ownerUserId, idempotencyKey) {
    return `${ownerUserId}:${idempotencyKey}`;
  }

  async findByKey(ownerUserId, idempotencyKey) {
    return this.byKey.get(this.key(ownerUserId, idempotencyKey)) || null;
  }

  async claim(operation) {
    const key = this.key(operation.ownerUserId, operation.idempotencyKey);
    const existing = this.byKey.get(key);
    if (existing) {
      if (
        existing.assetId !== operation.assetId ||
        existing.workspaceId !== operation.workspaceId ||
        existing.checksum !== operation.checksum
      ) {
        throw new EvidencePipelineError(
          "evidence_idempotency_conflict",
          "La clave idempotente ya identifica otro archivo.",
          { retryable: false, stage: "validation" },
        );
      }
      return { created: false, operation: structuredClone(existing) };
    }
    await this.save(operation);
    return { created: true, operation: structuredClone(operation) };
  }

  async findByAssetId(ownerUserId, assetId) {
    const item = this.byAsset.get(`${ownerUserId}:${assetId}`);
    return item || null;
  }

  async save(operation) {
    const clone = structuredClone(operation);
    this.byKey.set(this.key(clone.ownerUserId, clone.idempotencyKey), clone);
    this.byAsset.set(`${clone.ownerUserId}:${clone.assetId}`, clone);
    return clone;
  }
}

class MemoryStorage {
  constructor() {
    this.objects = new Map();
    this.putCount = 0;
    this.failNextPut = false;
  }

  async exists(path) {
    return this.objects.has(path);
  }

  async put(path, bytes, metadata) {
    if (this.failNextPut) {
      this.failNextPut = false;
      throw new Error("simulated_storage_failure");
    }
    this.putCount += 1;
    this.objects.set(path, { bytes: new Uint8Array(bytes), metadata: structuredClone(metadata) });
  }
}

class MemoryAssets {
  constructor() {
    this.rows = new Map();
    this.failNextUpsert = false;
    this.failNextLink = false;
  }

  async findById(assetId) {
    const row = this.rows.get(assetId);
    return row ? structuredClone(row) : null;
  }

  async upsertInbox(asset) {
    if (this.failNextUpsert) {
      this.failNextUpsert = false;
      throw new Error("simulated_asset_failure");
    }
    const current = this.rows.get(asset.assetId) || {};
    const row = {
      ...current,
      ...structuredClone(asset),
      experienceId: current.experienceId || null,
      eventId: current.eventId || null,
      adoptionStatus: current.adoptionStatus === "adopted" ? "adopted" : "inbox",
    };
    this.rows.set(asset.assetId, row);
    return structuredClone(row);
  }

  async link(assetId, experienceId, eventId) {
    if (this.failNextLink) {
      this.failNextLink = false;
      throw new Error("simulated_link_failure");
    }
    const current = this.rows.get(assetId);
    if (!current) throw new Error("asset_not_found");
    const row = {
      ...current,
      experienceId,
      eventId: eventId || null,
      adoptionStatus: "adopted",
    };
    this.rows.set(assetId, row);
    return structuredClone(row);
  }

  async listPending(ownerUserId, experienceId = "") {
    return [...this.rows.values()]
      .filter((row) => row.ownerUserId === ownerUserId && row.adoptionStatus === "inbox")
      .filter((row) => !experienceId || row.requestedExperienceId === experienceId)
      .map((row) => structuredClone(row));
  }
}

class MemoryExperiences {
  constructor(assets) {
    this.assets = assets;
    this.rows = new Map();
    this.events = new Map();
    this.failNextCommit = false;
  }

  async exists(experienceId) {
    return this.rows.has(experienceId);
  }

  async commit(experience, events, assetLinks) {
    if (this.failNextCommit) {
      this.failNextCommit = false;
      throw new Error("simulated_commit_failure");
    }
    this.rows.set(experience.id, structuredClone(experience));
    const existing = this.events.get(experience.id) || new Map();
    for (const event of events) existing.set(event.id, structuredClone(event));
    this.events.set(experience.id, existing);
    await this.linkAssets(experience.id, assetLinks);
  }

  async linkAssets(experienceId, assetLinks) {
    if (this.assets.failNextLink) {
      this.assets.failNextLink = false;
      throw new Error("simulated_link_failure");
    }
    for (const link of assetLinks) {
      await this.assets.link(link.assetId, experienceId, link.eventId || "");
    }
  }
}

function createHarness() {
  const operations = new MemoryOperations();
  const storage = new MemoryStorage();
  const assets = new MemoryAssets();
  const experiences = new MemoryExperiences(assets);
  let tick = 0;
  const pipeline = createEvidencePipelineV2({
    operations,
    storage,
    assets,
    experiences,
    clock: () => `2026-07-26T12:00:${String(tick++).padStart(2, "0")}.000Z`,
  });
  return { pipeline, operations, storage, assets, experiences };
}

function evidence(overrides = {}) {
  const assetId = overrides.assetId || "asset-1";
  return {
    assetId,
    ownerUserId: "user-1",
    workspaceId: "workspace-1",
    idempotencyKey: overrides.idempotencyKey || `vibeapp-asset:${assetId}`,
    name: overrides.name || "foto.jpg",
    mimeType: overrides.mimeType || "image/jpeg",
    bytes: overrides.bytes || new Uint8Array([1, 2, 3]),
    capturedAt: overrides.capturedAt || "2026-07-26T12:00:00.000Z",
    sourceType: "vibeapp-native-image",
    sourceDevice: "ios",
    requestedExperienceId: overrides.requestedExperienceId || "",
    requestedEventId: overrides.requestedEventId || "",
  };
}

async function expectPipelineError(fn, code) {
  let caught = null;
  try {
    await fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof EvidencePipelineError);
  assert.equal(caught.code, code);
  return caught;
}

async function verifyLooseEvidenceTypes() {
  const harness = createHarness();
  const fixtures = [
    ["text", "text/plain", "nota.txt"],
    ["photo", "image/jpeg", "foto.jpg"],
    ["audio", "audio/mp4", "voz.m4a"],
    ["video", "video/mp4", "clip.mp4"],
    ["document", "application/pdf", "documento.pdf"],
  ];
  for (let index = 0; index < fixtures.length; index += 1) {
    const [assetId, mimeType, name] = fixtures[index];
    const result = await harness.pipeline.receiveEvidence(evidence({
      assetId,
      mimeType,
      name,
      bytes: new Uint8Array([index + 1, 9, 8]),
    }));
    assert.equal(result.operationState, EVIDENCE_V2_STATES.INBOX_COMPLETE);
    assert.equal(result.linkStatus, "inbox");
    assert.equal((await harness.assets.findById(assetId)).adoptionStatus, "inbox");
  }
  assert.equal(harness.storage.objects.size, 5);
  assert.equal(harness.assets.rows.size, 5);
}

async function verifyFutureParentAndEventLink() {
  const harness = createHarness();
  const upload = await harness.pipeline.receiveEvidence(evidence({
    assetId: "future-photo",
    requestedExperienceId: "experience-1",
    requestedEventId: "event-1",
  }));
  assert.equal(upload.operationState, EVIDENCE_V2_STATES.LINK_PENDING);
  assert.equal((await harness.assets.findById("future-photo")).experienceId, null);

  const saved = await harness.pipeline.saveExperience({
    ownerUserId: "user-1",
    experience: { id: "experience-1", title: "Prueba 1" },
    events: [{ id: "event-1", title: "Nota 1" }],
    assetLinks: [{ assetId: "future-photo", eventId: "event-1" }],
  });
  assert.deepEqual(saved.evidence, { expected: 1, linked: 1, pending: 0 });
  const asset = await harness.assets.findById("future-photo");
  assert.equal(asset.experienceId, "experience-1");
  assert.equal(asset.eventId, "event-1");
  assert.equal(asset.adoptionStatus, "adopted");
}

async function verifyExistingParentLinksImmediately() {
  const harness = createHarness();
  await harness.experiences.commit({ id: "experience-existing", title: "Existente" }, [], []);
  const result = await harness.pipeline.receiveEvidence(evidence({
    assetId: "existing-photo",
    requestedExperienceId: "experience-existing",
  }));
  assert.equal(result.operationState, EVIDENCE_V2_STATES.LINKED_COMPLETE);
  assert.equal(result.linkStatus, "linked");
  assert.equal((await harness.assets.findById("existing-photo")).experienceId, "experience-existing");
}

async function verifyDelayedOfflineSyncPreservesCaptureTime() {
  const harness = createHarness();
  await harness.experiences.commit({ id: "experience-night", title: "Sincronizada primero" }, [], []);
  const result = await harness.pipeline.receiveEvidence(evidence({
    assetId: "offline-photo",
    requestedExperienceId: "experience-night",
    capturedAt: "2026-07-26T08:15:00.000Z",
  }));
  assert.equal(result.operationState, EVIDENCE_V2_STATES.LINKED_COMPLETE);
  const asset = await harness.assets.findById("offline-photo");
  assert.equal(asset.capturedAt, "2026-07-26T08:15:00.000Z");
  assert.equal(asset.experienceId, "experience-night");
}

async function verifyIdempotencyAndConflict() {
  const harness = createHarness();
  const command = evidence({ assetId: "same-photo" });
  await harness.pipeline.receiveEvidence(command);
  await harness.pipeline.receiveEvidence(command);
  assert.equal(harness.storage.putCount, 1);
  assert.equal(harness.assets.rows.size, 1);

  await expectPipelineError(
    () => harness.pipeline.receiveEvidence({
      ...command,
      bytes: new Uint8Array([7, 7, 7]),
    }),
    "evidence_idempotency_conflict",
  );
}

async function verifyStorageRecovery() {
  const harness = createHarness();
  harness.storage.failNextPut = true;
  const command = evidence({ assetId: "storage-retry" });
  await expectPipelineError(() => harness.pipeline.receiveEvidence(command), "evidence_pipeline_failed");
  const failed = await harness.operations.findByKey("user-1", command.idempotencyKey);
  assert.equal(failed.state, EVIDENCE_V2_STATES.FAILED_RETRYABLE);

  const result = await harness.pipeline.receiveEvidence(command);
  assert.equal(result.operationState, EVIDENCE_V2_STATES.INBOX_COMPLETE);
  assert.equal(harness.storage.putCount, 1);
}

async function verifyAssetRecoveryWithoutDuplicateBinary() {
  const harness = createHarness();
  harness.assets.failNextUpsert = true;
  const command = evidence({ assetId: "asset-retry" });
  await expectPipelineError(() => harness.pipeline.receiveEvidence(command), "evidence_pipeline_failed");
  assert.equal(harness.storage.putCount, 1);
  assert.equal(await harness.assets.findById("asset-retry"), null);

  const result = await harness.pipeline.receiveEvidence(command);
  assert.equal(result.operationState, EVIDENCE_V2_STATES.INBOX_COMPLETE);
  assert.equal(harness.storage.putCount, 1);
}

async function verifyLinkRecovery() {
  const harness = createHarness();
  await harness.pipeline.receiveEvidence(evidence({
    assetId: "link-retry",
    requestedExperienceId: "experience-link",
  }));
  harness.experiences.failNextCommit = true;
  const command = {
    ownerUserId: "user-1",
    experience: { id: "experience-link", title: "Vinculo" },
    events: [],
    assetLinks: [{ assetId: "link-retry" }],
  };
  await expectPipelineError(() => harness.pipeline.saveExperience(command), "evidence_pipeline_failed");
  assert.equal((await harness.assets.findById("link-retry")).adoptionStatus, "inbox");

  const result = await harness.pipeline.saveExperience(command);
  assert.equal(result.evidence.linked, 1);
  assert.equal((await harness.assets.findById("link-retry")).adoptionStatus, "adopted");
}

async function verifyLostResponseReplay() {
  const harness = createHarness();
  const command = evidence({ assetId: "lost-response" });
  const first = await harness.pipeline.receiveEvidence(command);
  const second = await harness.pipeline.receiveEvidence(command);
  assert.deepEqual(second.asset, first.asset);
  assert.equal(harness.storage.putCount, 1);
}

async function verifyMissingLedgerDoesNotUnlinkAdoptedAsset() {
  const harness = createHarness();
  const command = evidence({
    assetId: "adopted-without-ledger",
    requestedExperienceId: "experience-ledger",
  });
  await harness.pipeline.receiveEvidence(command);
  await harness.pipeline.saveExperience({
    ownerUserId: "user-1",
    experience: { id: "experience-ledger", title: "Historia estable" },
    events: [],
    assetLinks: [{ assetId: "adopted-without-ledger" }],
  });
  harness.operations.byKey.clear();
  harness.operations.byAsset.clear();

  const replay = await harness.pipeline.receiveEvidence(command);
  assert.equal(replay.operationState, EVIDENCE_V2_STATES.LINKED_COMPLETE);
  const asset = await harness.assets.findById("adopted-without-ledger");
  assert.equal(asset.experienceId, "experience-ledger");
  assert.equal(asset.adoptionStatus, "adopted");
}

await verifyLooseEvidenceTypes();
await verifyFutureParentAndEventLink();
await verifyExistingParentLinksImmediately();
await verifyDelayedOfflineSyncPreservesCaptureTime();
await verifyIdempotencyAndConflict();
await verifyStorageRecovery();
await verifyAssetRecoveryWithoutDuplicateBinary();
await verifyLinkRecovery();
await verifyLostResponseReplay();
await verifyMissingLedgerDoesNotUnlinkAdoptedAsset();

console.log("Evidence pipeline V2: 10 suites passed.");
