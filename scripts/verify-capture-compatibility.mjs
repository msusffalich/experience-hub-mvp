import assert from "node:assert/strict";
import {
  createCaptureCompatibilityMonitor,
  inspectLegacyIntegrationCapture,
  inspectLegacyMediaCapture,
} from "../lib/capture/capture-compatibility.mjs";

const ownerUserId = "miguel";
const capturedAt = "2026-07-28T18:00:00-04:00";

const text = inspectLegacyIntegrationCapture({
  sourceId: "note-1",
  sourceType: "vibeapp-native",
  capturedAt,
  participantId: "principal",
  payloadType: "text",
  payload: { text: "Conversamos sobre el proyecto." },
  idempotencyKey: "note-1",
}, { ownerUserId });
assert.equal(text.ok, true);
assert.equal(text.status, "compatible_with_loss");
assert.equal(text.code, "text_becomes_unassigned_evidence");
assert.equal(text.command.intent, "evidence");
assert.equal(text.command.kind, "text");
assert.equal(text.command.text, "Conversamos sobre el proyecto.");

const biometric = inspectLegacyIntegrationCapture({
  sourceId: "health-1",
  sourceType: "wearable",
  capturedAt,
  participantId: "principal",
  payloadType: "activity",
  payload: { steps: 7200 },
  privacyLevel: "sensitive",
  idempotencyKey: "health-1",
}, { ownerUserId });
assert.equal(biometric.ok, true);
assert.equal(biometric.command.intent, "context");
assert.equal(biometric.command.kind, "biometric");
assert.equal(biometric.command.metadata.payload.steps, 7200);

const agenda = inspectLegacyIntegrationCapture({
  sourceId: "agenda-1",
  sourceType: "calendar",
  capturedAt,
  participantId: "principal",
  payloadType: "calendar",
  payload: { title: "Reunion", startsAt: capturedAt },
  idempotencyKey: "agenda-1",
}, { ownerUserId });
assert.equal(agenda.ok, true);
assert.equal(agenda.command.intent, "context");
assert.equal(agenda.command.kind, "agenda");

const metadataOnlyImage = inspectLegacyIntegrationCapture({
  sourceId: "photo-metadata-1",
  sourceType: "vibeapp-native",
  capturedAt,
  participantId: "principal",
  payloadType: "image",
  payload: { fileName: "playa.jpg", mimeType: "image/jpeg" },
  idempotencyKey: "photo-metadata-1",
}, { ownerUserId });
assert.equal(metadataOnlyImage.ok, false);
assert.equal(metadataOnlyImage.code, "capture_binary_required");

const legacyStory = inspectLegacyIntegrationCapture({
  sourceId: "legacy-story-1",
  sourceType: "vibeapp-native",
  capturedAt,
  participantId: "principal",
  payloadType: "text",
  payload: { text: "Texto valido." },
  experienceId: "old-experience",
  idempotencyKey: "legacy-story-1",
}, { ownerUserId });
assert.equal(legacyStory.ok, true);
assert.equal(legacyStory.status, "compatible_with_loss");
assert.equal(legacyStory.code, "legacy_story_hints_ignored");
assert.deepEqual(legacyStory.diagnostics[0].fields, ["experienceId"]);

const photo = inspectLegacyMediaCapture({
  id: "photo-1",
  name: "familia.jpg",
  type: "image/jpeg",
  capturedAt,
  sourceType: "vibeapp-native",
  participantId: "principal",
  metadata: { idempotencyKey: "photo-1" },
}, {
  ownerUserId,
  bytes: Buffer.from("complete-image"),
});
assert.equal(photo.ok, true);
assert.equal(photo.status, "compatible");
assert.equal(photo.command.intent, "evidence");
assert.equal(photo.command.kind, "image");
assert.equal(photo.command.filename, "familia.jpg");

const linkedPhoto = inspectLegacyMediaCapture({
  id: "photo-2",
  name: "legacy.jpg",
  type: "image/jpeg",
  capturedAt,
  experienceId: "old-experience",
  metadata: { idempotencyKey: "photo-2" },
}, {
  ownerUserId,
  bytes: Buffer.from("complete-image"),
});
assert.equal(linkedPhoto.ok, true);
assert.equal(linkedPhoto.status, "compatible_with_loss");
assert.equal(linkedPhoto.code, "legacy_story_hints_ignored");
assert.equal(linkedPhoto.command.intent, "evidence");
assert.equal(linkedPhoto.command.kind, "image");

const biometricCsv = inspectLegacyMediaCapture({
  id: "health-csv-1",
  name: "vibeapp-health.csv",
  type: "text/csv",
  capturedAt,
  participantId: "principal",
  sourceType: "apple-healthkit",
  metadata: {
    idempotencyKey: "health-csv-1",
    payloadType: "biometric",
  },
}, {
  ownerUserId,
  bytes: Buffer.from("steps,heart_rate\n7200,72"),
});
assert.equal(biometricCsv.ok, true);
assert.equal(biometricCsv.command.intent, "context");
assert.equal(biometricCsv.command.kind, "biometric");

const biometricZip = inspectLegacyMediaCapture({
  id: "health-zip-1",
  name: "export.zip",
  type: "application/zip",
  capturedAt,
  participantId: "principal",
  sourceType: "healthkit",
  metadata: {
    idempotencyKey: "health-zip-1",
    payloadType: "biometric",
  },
}, {
  ownerUserId,
  bytes: Buffer.from("zip-content"),
});
assert.equal(biometricZip.ok, true);
assert.equal(biometricZip.command.intent, "context");
assert.equal(biometricZip.command.kind, "biometric");
assert.equal(biometricZip.command.metadata.transportOnly, true);

const healthDocument = inspectLegacyMediaCapture({
  id: "health-plan-document",
  name: "health-plan.pdf",
  type: "application/pdf",
  capturedAt,
  participantId: "principal",
  sourceType: "file-upload",
  metadata: { idempotencyKey: "health-plan-document" },
}, {
  ownerUserId,
  bytes: Buffer.from("document"),
});
assert.equal(healthDocument.ok, true);
assert.equal(healthDocument.command.intent, "evidence");
assert.equal(healthDocument.command.kind, "document");

const identityMismatch = inspectLegacyMediaCapture({
  id: "photo-mismatch",
  name: "mismatch.jpg",
  type: "image/jpeg",
  capturedAt,
  participantId: "principal",
  idempotencyKey: "body-key",
  metadata: { idempotencyKey: "metadata-key" },
}, {
  ownerUserId,
  idempotencyKey: "header-key",
  bytes: Buffer.from("image"),
});
assert.equal(identityMismatch.ok, true);
assert.equal(identityMismatch.status, "compatible_with_loss");
assert.equal(identityMismatch.code, "idempotency_key_mismatch");

const largeVideo = inspectLegacyMediaCapture({
  id: "large-video",
  name: "large.mp4",
  type: "video/mp4",
  capturedAt,
  participantId: "principal",
  metadata: { idempotencyKey: "large-video" },
}, {
  ownerUserId,
  bytes: Buffer.alloc(8 * 1024 * 1024, 7),
});
assert.equal(largeVideo.ok, true);
assert.equal(largeVideo.command.observedSizeBytes, 8 * 1024 * 1024);
assert.equal(largeVideo.command.bytes.length, 0);
assert.equal(largeVideo.command.hashMode, "deferred_to_canonical_write");

const monitor = createCaptureCompatibilityMonitor({
  maxRecent: 2,
  clock: () => new Date("2026-07-28T23:00:00.000Z"),
});
monitor.record(text);
monitor.record(metadataOnlyImage);
monitor.record(photo);
const snapshot = monitor.snapshot();
assert.equal(snapshot.mode, "observe_only");
assert.equal(snapshot.writesDuplicated, false);
assert.equal(snapshot.observed, 3);
assert.equal(snapshot.compatible, 1);
assert.equal(snapshot.compatibleWithLoss, 1);
assert.equal(snapshot.incompatible, 1);
assert.equal(snapshot.migratable, 2);
assert.equal(snapshot.compatiblePercent, 67);
assert.equal(snapshot.byRoute["/api/integration/ingest"], 2);
assert.equal(snapshot.byRoute["/api/media"], 1);
assert.equal(snapshot.recent.length, 2);

console.log("Capture compatibility: legacy mapping and observe-only monitor passed.");
