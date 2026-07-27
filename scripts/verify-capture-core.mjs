import assert from "node:assert/strict";
import { createCaptureMemoryAdapters } from "../lib/capture/capture-memory-adapters.mjs";
import {
  CaptureContractError,
  normalizeCaptureCommand,
} from "../lib/capture/capture-contract.mjs";
import {
  CAPTURE_STATES,
  createCaptureOrchestrator,
} from "../lib/capture/capture-orchestrator.mjs";

const base = {
  ownerUserId: "miguel",
  workspaceId: "vibe",
  participantId: "principal",
  occurredAt: "2026-07-27T14:00:00-04:00",
  source: { app: "vibeapp", device: "iphone-14-pro", platform: "ios" },
};

await verifyAllCaptureTypes();
await verifyIdempotency();
await verifyTransientRetry();
await verifyCatalogResumeAfterBinaryWasStored();
verifyStoryFieldsAreRejected();
verifyInvalidKindPairIsRejected();

console.log("Capture core: types, isolation, idempotency and retry passed.");

async function verifyAllCaptureTypes() {
  const adapters = createCaptureMemoryAdapters();
  const orchestrator = createCaptureOrchestrator(adapters);
  const cases = [
    { intent: "evidence", kind: "text", text: "Hoy conversé con Ana.", suffix: "text" },
    { intent: "evidence", kind: "image", bytes: Buffer.from("image"), filename: "foto.jpg", mimeType: "image/jpeg", suffix: "image" },
    { intent: "evidence", kind: "audio", bytes: Buffer.from("audio"), filename: "voz.m4a", mimeType: "audio/mp4", suffix: "audio" },
    { intent: "evidence", kind: "video", bytes: Buffer.from("video"), filename: "clip.mp4", mimeType: "video/mp4", suffix: "video" },
    { intent: "evidence", kind: "document", bytes: Buffer.from("document"), filename: "nota.pdf", mimeType: "application/pdf", suffix: "document" },
    { intent: "context", kind: "biometric", metadata: { heartRate: 72, steps: 6400 }, suffix: "biometric" },
    { intent: "context", kind: "location", metadata: { latitude: 28.5653, longitude: -81.5862 }, suffix: "location" },
    { intent: "context", kind: "weather", metadata: { temperatureC: 29, humidityPct: 70 }, suffix: "weather" },
    { intent: "context", kind: "news", metadata: { headlines: ["Fuente confiable"] }, suffix: "news" },
    { intent: "context", kind: "agenda", metadata: { title: "Reunión", startsAt: base.occurredAt }, suffix: "agenda" },
  ];
  for (const item of cases) {
    const result = await orchestrator.accept({
      ...base,
      ...item,
      captureId: `capture-${item.suffix}`,
      idempotencyKey: `operation-${item.suffix}`,
    });
    assert.equal(result.ok, true);
    assert.equal(result.durable, true);
    assert.equal(result.state, CAPTURE_STATES.COMPLETE);
    const saved = adapters.inspect.catalog.get(`capture-${item.suffix}`);
    assert.equal(saved.intent, item.intent);
    assert.equal(saved.storyStatus, "unassigned");
    assert.equal("experienceId" in saved, false);
    assert.equal("eventId" in saved, false);
  }
}

async function verifyIdempotency() {
  const adapters = createCaptureMemoryAdapters();
  const orchestrator = createCaptureOrchestrator(adapters);
  const payload = {
    ...base,
    intent: "evidence",
    kind: "image",
    captureId: "same-photo",
    idempotencyKey: "same-operation",
    bytes: Buffer.from("same-image"),
    filename: "same.jpg",
  };
  const first = await orchestrator.accept(payload);
  const second = await orchestrator.accept(payload);
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(adapters.inspect.catalog.size, 1);
  assert.equal(adapters.inspect.objects.size, 1);
}

async function verifyTransientRetry() {
  const adapters = createCaptureMemoryAdapters();
  adapters.failNext("storagePut");
  const orchestrator = createCaptureOrchestrator(adapters);
  const payload = {
    ...base,
    intent: "evidence",
    kind: "audio",
    captureId: "offline-audio",
    idempotencyKey: "offline-operation",
    bytes: Buffer.from("voice"),
    filename: "voice.m4a",
  };
  await assert.rejects(() => orchestrator.accept(payload), (error) => {
    assert.equal(error.retryable, true);
    assert.equal(error.operation.state, CAPTURE_STATES.RETRY_PENDING);
    return true;
  });
  const result = await orchestrator.accept(payload);
  assert.equal(result.ok, true);
  assert.equal(result.state, CAPTURE_STATES.COMPLETE);
  assert.equal(adapters.inspect.catalog.size, 1);
}

async function verifyCatalogResumeAfterBinaryWasStored() {
  const adapters = createCaptureMemoryAdapters();
  adapters.failNext("catalogUpsert");
  const orchestrator = createCaptureOrchestrator(adapters);
  const payload = {
    ...base,
    intent: "evidence",
    kind: "video",
    captureId: "resume-video",
    idempotencyKey: "resume-operation",
    bytes: Buffer.from("video-content"),
    filename: "clip.mp4",
  };
  await assert.rejects(() => orchestrator.accept(payload));
  assert.equal(adapters.inspect.objects.size, 1);
  assert.equal(adapters.inspect.catalog.size, 0);
  const result = await orchestrator.accept(payload);
  assert.equal(result.ok, true);
  assert.equal(adapters.inspect.objects.size, 1);
  assert.equal(adapters.inspect.catalog.size, 1);
}

function verifyStoryFieldsAreRejected() {
  assert.throws(
    () => normalizeCaptureCommand({
      ...base,
      intent: "evidence",
      kind: "text",
      captureId: "bad-story",
      idempotencyKey: "bad-story-operation",
      text: "Esto es evidencia.",
      experienceId: "forbidden",
      metadata: { eventId: "also-forbidden" },
    }),
    (error) => {
      assert.equal(error instanceof CaptureContractError, true);
      assert.equal(error.code, "capture_story_fields_forbidden");
      return true;
    },
  );
}

function verifyInvalidKindPairIsRejected() {
  assert.throws(
    () => normalizeCaptureCommand({
      ...base,
      intent: "context",
      kind: "image",
      captureId: "bad-context",
      idempotencyKey: "bad-context-operation",
      bytes: Buffer.from("image"),
    }),
    (error) => {
      assert.equal(error.code, "capture_kind_invalid");
      return true;
    },
  );
}
