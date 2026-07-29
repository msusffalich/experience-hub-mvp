import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const WORKSPACE_ID = "00000000-0000-0000-0000-000000000002";
const ACCESS_TOKEN = "capture-matrix-access-token";
const BUCKET = "experience-media";
const CAPTURE_PREFIX = "captures/";
const OCCURRED_AT = "2026-07-29T14:30:00-04:00";

const CAPTURE_CASES = [
  {
    type: "text",
    transport: "json",
    intent: "evidence",
    kind: "text",
    text: "Miguel registro una nota humana durante la prueba automatica.",
  },
  {
    type: "image",
    transport: "multipart",
    intent: "evidence",
    kind: "image",
    filename: "capture-matrix-image.jpg",
    mimeType: "image/jpeg",
    bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x56, 0x49, 0x42, 0x45, 0xff, 0xd9]),
  },
  {
    type: "audio",
    transport: "multipart",
    intent: "evidence",
    kind: "audio",
    filename: "capture-matrix-audio.m4a",
    mimeType: "audio/mp4",
    bytes: Buffer.from("capture-matrix-audio-content"),
  },
  {
    type: "video",
    transport: "multipart",
    intent: "evidence",
    kind: "video",
    filename: "capture-matrix-video.mp4",
    mimeType: "video/mp4",
    bytes: Buffer.from("capture-matrix-video-content"),
  },
  {
    type: "document",
    transport: "multipart",
    intent: "evidence",
    kind: "document",
    filename: "capture-matrix-document.pdf",
    mimeType: "application/pdf",
    bytes: Buffer.from("%PDF-1.4\n% capture matrix\n%%EOF\n"),
  },
  {
    type: "biometric-file",
    transport: "multipart",
    intent: "context",
    kind: "biometric",
    filename: "capture-matrix-health.csv",
    mimeType: "text/csv",
    bytes: Buffer.from("timestamp,heart_rate,steps\n2026-07-29T18:30:00Z,72,6400\n"),
    metadata: {
      provider: "apple-health",
      metrics: ["heart_rate", "steps"],
    },
  },
  {
    type: "biometric",
    transport: "json",
    intent: "context",
    kind: "biometric",
    metadata: {
      heartRateBpm: 72,
      steps: 6400,
      activeEnergyKcal: 410,
      provider: "apple-health",
    },
  },
  {
    type: "location",
    transport: "json",
    intent: "context",
    kind: "location",
    participantId: "00000000-0000-0000-0000-000000000003",
    metadata: {
      latitude: 28.5653,
      longitude: -81.5862,
      accuracyMeters: 8,
      city: "Winter Garden",
    },
  },
  {
    type: "agenda",
    transport: "json",
    intent: "context",
    kind: "agenda",
    metadata: {
      title: "Reunion de prueba",
      startsAt: "2026-07-29T18:30:00.000Z",
      endsAt: "2026-07-29T19:00:00.000Z",
    },
  },
  {
    type: "weather",
    transport: "json",
    intent: "context",
    kind: "weather",
    metadata: {
      temperatureC: 31,
      humidityPct: 68,
      windKph: 9,
      precipitationMm: 0,
      provider: "open-meteo",
    },
  },
  {
    type: "news",
    transport: "json",
    intent: "context",
    kind: "news",
    metadata: {
      headline: "Prueba local de contexto informativo",
      source: "capture-matrix",
      publishedAt: "2026-07-29T18:20:00.000Z",
    },
  },
  {
    type: "sensor",
    transport: "json",
    intent: "context",
    kind: "sensor",
    metadata: {
      sensorType: "accelerometer",
      x: 0.12,
      y: -0.04,
      z: 0.98,
      unit: "g",
    },
  },
];

class MatrixFailure extends Error {
  constructor(captureType, stage, cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`${captureType}:${stage}:${detail}`);
    this.name = "MatrixFailure";
    this.captureType = captureType;
    this.stage = stage;
    this.detail = detail;
    this.cause = cause;
  }
}

let activeType = "startup";
let activeStage = "initialize";
let appProcess = null;
let supabaseDouble = null;
const appOutput = [];
const matrixResults = [];
const matrixWatchdog = setTimeout(() => {
  console.error("");
  console.error("CAPTURE MATRIX FAILED");
  console.error(`type=${activeType}`);
  console.error(`stage=${activeStage}`);
  console.error("detail=matrix_timeout_45000ms");
  appProcess?.kill();
  process.exit(1);
}, 45_000);

try {
  const appPort = await findFreePort();
  supabaseDouble = await startSupabaseDouble();
  appProcess = await startApplicationServer(appPort, supabaseDouble.baseUrl);
  const baseUrl = `http://127.0.0.1:${appPort}`;

  await collectResult("A", "pipeline", "status", () =>
    verifyPipelineReadiness(baseUrl, supabaseDouble.state));
  for (const captureCase of CAPTURE_CASES) {
    const section = captureCase.transport === "multipart" ? "C" : "B";
    await collectResult(section, captureCase.type, "capture", () =>
      verifyCaptureCase(baseUrl, supabaseDouble.state, captureCase));
  }
  await collectResult("F", "image", "storage_retry", () =>
    verifyStorageFailureAndRetry(baseUrl, supabaseDouble.state));
  await collectResult("F", "video", "catalog_resume", () =>
    verifyCatalogFailureAndResume(baseUrl, supabaseDouble.state));
  await collectResult("F", "text", "needs_attention", () =>
    verifyNeedsAttentionReconciliation(baseUrl, supabaseDouble.state));
  await collectResult("G", "contract", "forbidden_story_fields", () =>
    verifyForbiddenStoryFields(baseUrl, supabaseDouble.state));
  await collectResult("I", "contract", "http_errors", () =>
    verifyHttpErrors(baseUrl, supabaseDouble.state));
  await collectResult("J", "v1", "no_regression", () =>
    verifyV1NoRegression(baseUrl));
  await collectResult("H", "matrix", "global_invariants", async () =>
    verifyGlobalInvariants(supabaseDouble.state));

  printMatrixSummary(supabaseDouble.state);
  if (matrixResults.some((result) => !result.ok)) process.exitCode = 1;
} catch (error) {
  const failure = error instanceof MatrixFailure
    ? error
    : new MatrixFailure(activeType, activeStage, error);
  console.error("");
  console.error("CAPTURE MATRIX FAILED");
  console.error(`type=${failure.captureType}`);
  console.error(`stage=${failure.stage}`);
  console.error(`detail=${failure.detail}`);
  if (appOutput.length) {
    console.error("server_tail:");
    console.error(appOutput.join("").slice(-4000));
  }
  process.exitCode = 1;
} finally {
  await stopChild(appProcess);
  await supabaseDouble?.close();
  clearTimeout(matrixWatchdog);
}

async function collectResult(section, captureType, stage, callback) {
  try {
    await callback();
    matrixResults.push({ section, captureType, stage, ok: true, detail: "ok" });
  } catch (error) {
    const failure = error instanceof MatrixFailure
      ? error
      : new MatrixFailure(captureType, stage, error);
    matrixResults.push({
      section,
      captureType: failure.captureType,
      stage: failure.stage,
      ok: false,
      detail: failure.detail,
    });
    console.error(
      `[FAIL] section=${section} type=${failure.captureType} ` +
      `stage=${failure.stage} detail=${failure.detail}`,
    );
  }
}

function printMatrixSummary(state) {
  console.log("");
  console.log("CAPTURE MATRIX A-J");
  for (const result of matrixResults) {
    console.log(
      `${result.ok ? "GREEN" : "RED"} section=${result.section} ` +
      `type=${result.captureType} stage=${result.stage}` +
      `${result.ok ? "" : ` detail=${result.detail}`}`,
    );
  }
  const failures = matrixResults.filter((result) => !result.ok);
  console.log("");
  console.log(failures.length ? "CAPTURE MATRIX FAILED" : "CAPTURE MATRIX PASSED");
  console.log(`Types: ${CAPTURE_CASES.map((item) => item.type).join(", ")}`);
  console.log("Architecture: bucket=experience-media prefix=captures/ legacy=vibe-captures forbidden");
  console.log("HTTP: JSON and multipart");
  console.log("Recovery: receipt, reconciliation, idempotent resend, storage retry, catalog resume");
  console.log(
    `Persisted: ${state.captures.size} capture(s), ` +
    `${state.objects.size} object(s), ` +
    `${state.operations.size} operation(s)`,
  );
  if (failures.length) {
    console.log(`Verdict: PENDING (${failures.length} red check(s))`);
  } else {
    console.log("Verdict: READY TO RECONNECT");
  }
}

async function verifyPipelineReadiness(baseUrl, state) {
  await step("pipeline", "status", async () => {
    const result = await requestJson(`${baseUrl}/api/captures/status`, {
      headers: authHeaders(),
    });
    assert.equal(result.response.status, 200, describeHttp(result));
    assert.equal(result.payload.mode, "on");
    assert.equal(result.payload.enabledForUser, true);
    assert.equal(result.payload.ready, true);
    assert.equal(result.payload.reason, "ready");
    for (const [name, check] of Object.entries(result.payload.checks || {})) {
      assert.equal(check.ok, true, `readiness check ${name}: ${JSON.stringify(check)}`);
    }
    const storageRoundTrip = result.payload.checks?.storageRoundTrip;
    assert.ok(storageRoundTrip, "status is missing checks.storageRoundTrip");
    assert.equal(storageRoundTrip.ok, true, JSON.stringify(storageRoundTrip));
    const roundTripDetail = String(storageRoundTrip.detail || "");
    assert.match(roundTripDetail, /write_read_delete_ok/);
    assert.match(roundTripDetail, /experience-media/);
    assert.equal(
      JSON.stringify(result.payload).includes("vibe-captures"),
      false,
      "status still references legacy vibe-captures",
    );
    assert.ok(state.storageLifecycle.writes > 0, "status did not execute a real storage write");
    assert.ok(state.storageLifecycle.reads > 0, "status did not execute a real storage read");
    assert.ok(state.storageLifecycle.deletes > 0, "status did not execute a real storage delete");
    assert.equal(
      state.storageLifecycle.paths.some((value) =>
        value.bucket === BUCKET && value.objectPath.includes(CAPTURE_PREFIX)),
      true,
      "storageRoundTrip did not use experience-media with captures/ namespace",
    );
    assert.equal(state.objects.size, 0, "storageRoundTrip left its probe object behind");
  });
  console.log("[PASS] pipeline stage=status storageRoundTrip=write/read/delete");
}

async function verifyCaptureCase(baseUrl, state, captureCase) {
  const captureId = `matrix-${captureCase.type}`;
  const idempotencyKey = captureId;
  const request = {
    ...captureCase,
    captureId,
    idempotencyKey,
    occurredAt: OCCURRED_AT,
  };

  const first = await step(captureCase.type, "http.first_submission", () =>
    submitCapture(baseUrl, request));
  await step(captureCase.type, "receipt.first_submission", async () => {
    assert.equal(first.response.status, 201, describeHttp(first));
    assertCompleteReceipt(first.payload, {
      captureId,
      idempotencyKey,
      intent: captureCase.intent,
      kind: captureCase.kind,
      duplicate: false,
    });
  });

  await step(captureCase.type, "persistence.catalog", () => {
    const record = state.captures.get(captureId);
    assert.ok(record, `capture_records missing ${captureId}`);
    assert.equal(record.intent, captureCase.intent);
    assert.equal(record.kind, captureCase.kind);
    assert.equal(record.story_status, undefined);
    assert.equal(record.text_content || "", captureCase.text || "");
    assert.deepEqual(record.metadata || {}, captureCase.metadata || {});
    assert.equal(record.source?.app, "vibeapp");
    assert.equal(record.source?.capturedOffline, true);
    assert.equal(record.occurred_at, new Date(OCCURRED_AT).toISOString());
    assert.equal(record.owner_user_id, USER_ID);
    assert.equal(record.workspace_id, WORKSPACE_ID);
    assert.equal(record.participant_id, captureCase.participantId || null);
    assert.equal(record.filename || null, captureCase.filename || null);
    assert.equal(record.mime_type || null, captureCase.mimeType || null);
    assert.equal(record.size_bytes, captureCase.bytes?.length || 0);
  });

  await step(captureCase.type, "persistence.storage", () => {
    const record = state.captures.get(captureId);
    if (captureCase.transport === "multipart") {
      assert.ok(record.storage_path, "binary capture has no storage_path");
      assert.equal(record.storage_bucket, BUCKET);
      assert.equal(
        record.storage_path.startsWith(CAPTURE_PREFIX) ||
          record.storage_path.includes(`/${CAPTURE_PREFIX}`),
        true,
        `storage_path must use ${CAPTURE_PREFIX} namespace: ${record.storage_path}`,
      );
      const object = state.objects.get(storageKey(BUCKET, record.storage_path));
      assert.ok(object, `storage object missing: ${record.storage_path}`);
      assert.deepEqual(object.bytes, captureCase.bytes);
      assert.equal(object.contentType, captureCase.mimeType);
    } else {
      assert.equal(record.storage_path, null);
      assert.equal(record.storage_bucket, null);
    }
  });

  await step(captureCase.type, "persistence.projection", () => {
    const target = projectionTarget(captureCase.intent, captureCase.kind);
    if (target === "assets") {
      assert.ok(state.assets.has(captureId), `assets missing ${captureId}`);
    } else if (target === "agenda") {
      assert.ok(state.agendaEvents.has(captureId), `agenda_events missing ${captureId}`);
    } else {
      assert.ok(state.contextSignals.has(captureId), `context_signals missing ${captureId}`);
    }
    assert.equal(first.payload.visible, true);
    assert.equal(first.payload.projection?.target, target);
    assert.equal(first.payload.projection?.id, captureId);
  });

  const receipt = await step(captureCase.type, "http.operation_receipt", () =>
    requestJson(`${baseUrl}/api/captures/operations/${encodeURIComponent(idempotencyKey)}`, {
      headers: authHeaders(),
    }));
  await step(captureCase.type, "receipt.operation_receipt", () => {
    assert.equal(receipt.response.status, 200, describeHttp(receipt));
    assertCompleteReceipt(receipt.payload, {
      captureId,
      idempotencyKey,
      intent: captureCase.intent,
      kind: captureCase.kind,
      duplicate: false,
    });
  });

  const resend = await step(captureCase.type, "http.idempotent_resend", () =>
    submitCapture(baseUrl, request));
  await step(captureCase.type, "receipt.idempotent_resend", () => {
    assert.equal(resend.response.status, 201, describeHttp(resend));
    assertCompleteReceipt(resend.payload, {
      captureId,
      idempotencyKey,
      intent: captureCase.intent,
      kind: captureCase.kind,
      duplicate: true,
    });
    const operation = state.operations.get(idempotencyKey);
    assert.equal(operation.attempts, 1, "an idempotent resend must not create another attempt");
    assert.equal(countCaptures(state, captureId), 1, "an idempotent resend duplicated the catalog row");
    if (captureCase.transport === "multipart") {
      const record = state.captures.get(captureId);
      assert.equal(
        state.successfulStorageWrites.get(storageKey(BUCKET, record.storage_path)),
        1,
        "an idempotent resend uploaded the binary again",
      );
    }
  });

  console.log(`[PASS] type=${captureCase.type} transport=${captureCase.transport} resend=idempotent`);
}

async function verifyStorageFailureAndRetry(baseUrl, state) {
  const captureCase = {
    type: "image-retry",
    transport: "multipart",
    intent: "evidence",
    kind: "image",
    captureId: "matrix-retry-storage-image",
    idempotencyKey: "matrix-retry-storage-image",
    occurredAt: OCCURRED_AT,
    filename: "capture-matrix-retry.jpg",
    mimeType: "image/jpeg",
    bytes: Buffer.from([0xff, 0xd8, 0x52, 0x45, 0x54, 0x52, 0x59, 0xff, 0xd9]),
  };
  state.failures.storageUploads = 1;

  const failed = await step(captureCase.type, "storage.temporary_failure", () =>
    submitCapture(baseUrl, captureCase));
  await step(captureCase.type, "storage.retry_pending_receipt", async () => {
    assert.equal(failed.response.status, 503, describeHttp(failed));
    const receipt = await requestJson(
      `${baseUrl}/api/captures/operations/${encodeURIComponent(captureCase.idempotencyKey)}`,
      { headers: authHeaders() },
    );
    assert.equal(receipt.response.status, 200, describeHttp(receipt));
    assert.equal(receipt.payload.state, "retry_pending");
    assert.equal(receipt.payload.retryable, true);
    assert.equal(receipt.payload.captureId, captureCase.captureId);
    assert.equal(receipt.payload.lastError?.code, "capture_storage_write_failed");
    assert.equal(receipt.payload.lastError?.stage, "storage");
  });

  const retried = await step(captureCase.type, "storage.retry_submission", () =>
    submitCapture(baseUrl, captureCase));
  await step(captureCase.type, "storage.retry_complete", () => {
    assert.equal(retried.response.status, 201, describeHttp(retried));
    assertCompleteReceipt(retried.payload, {
      captureId: captureCase.captureId,
      idempotencyKey: captureCase.idempotencyKey,
      intent: captureCase.intent,
      kind: captureCase.kind,
      duplicate: false,
    });
    assert.equal(state.operations.get(captureCase.idempotencyKey)?.attempts, 2);
    assert.equal(countCaptures(state, captureCase.captureId), 1);
    const record = state.captures.get(captureCase.captureId);
    assert.deepEqual(
      state.objects.get(storageKey(BUCKET, record.storage_path))?.bytes,
      captureCase.bytes,
    );
  });
  console.log("[PASS] type=image stage=storage temporary_failure=recovered attempts=2");
}

async function verifyCatalogFailureAndResume(baseUrl, state) {
  const captureCase = {
    type: "video-resume",
    transport: "multipart",
    intent: "evidence",
    kind: "video",
    captureId: "matrix-retry-catalog-video",
    idempotencyKey: "matrix-retry-catalog-video",
    occurredAt: OCCURRED_AT,
    filename: "capture-matrix-resume.mp4",
    mimeType: "video/mp4",
    bytes: Buffer.from("capture-matrix-video-resume-content"),
  };
  state.failures.catalogWrites = 1;

  const failed = await step(captureCase.type, "catalog.temporary_failure", () =>
    submitCapture(baseUrl, captureCase));
  let storagePath = "";
  await step(captureCase.type, "catalog.binary_preserved", async () => {
    assert.equal(failed.response.status, 503, describeHttp(failed));
    assert.equal(failed.payload.error, "capture_catalog_write_failed", describeHttp(failed));
    assert.equal(failed.payload.detail?.stage, "catalog", describeHttp(failed));
    const operation = state.operations.get(captureCase.idempotencyKey);
    storagePath = operation?.storage_path || "";
    assert.ok(storagePath, "operation lost storage_path after catalog failure");
    assert.ok(state.objects.has(storageKey(BUCKET, storagePath)), "stored binary was lost");
    assert.equal(state.captures.has(captureCase.captureId), false);
    const receipt = await requestJson(
      `${baseUrl}/api/captures/operations/${encodeURIComponent(captureCase.idempotencyKey)}`,
      { headers: authHeaders() },
    );
    assert.equal(receipt.payload.state, "retry_pending");
    assert.equal(receipt.payload.retryable, true);
  });

  const uploadCallsBeforeRetry = state.storageUploadCalls.get(storageKey(BUCKET, storagePath));
  const retried = await step(captureCase.type, "catalog.resume_submission", () =>
    submitCapture(baseUrl, captureCase));
  await step(captureCase.type, "catalog.resume_complete", () => {
    assert.equal(retried.response.status, 201, describeHttp(retried));
    assertCompleteReceipt(retried.payload, {
      captureId: captureCase.captureId,
      idempotencyKey: captureCase.idempotencyKey,
      intent: captureCase.intent,
      kind: captureCase.kind,
      duplicate: false,
    });
    assert.equal(state.operations.get(captureCase.idempotencyKey)?.attempts, 2);
    assert.equal(state.storageUploadCalls.get(storageKey(BUCKET, storagePath)), uploadCallsBeforeRetry);
    assert.equal(countCaptures(state, captureCase.captureId), 1);
  });
  console.log("[PASS] type=video stage=catalog temporary_failure=resumed binary_reuploaded=false");
}

async function verifyNeedsAttentionReconciliation(baseUrl, state) {
  const captureId = "matrix-needs-attention";
  state.captures.set(captureId, {
    capture_id: captureId,
    owner_user_id: USER_ID,
    workspace_id: WORKSPACE_ID,
    participant_id: null,
    intent: "evidence",
    kind: "text",
    occurred_at: new Date(OCCURRED_AT).toISOString(),
    text_content: "Contenido anterior.",
    filename: null,
    mime_type: null,
    size_bytes: 0,
    metadata: {},
    source: { app: "vibeapp" },
    checksum: "checksum-that-does-not-match",
    storage_bucket: null,
    storage_path: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  try {
    const result = await step("text", "reconciliation.content_conflict", () =>
      submitCapture(baseUrl, {
        type: "needs-attention",
        transport: "json",
        intent: "evidence",
        kind: "text",
        captureId,
        idempotencyKey: captureId,
        occurredAt: OCCURRED_AT,
        text: "Contenido nuevo que no debe sobrescribir el anterior.",
      }));
    await step("text", "reconciliation.needs_attention", async () => {
      assert.equal(result.response.status, 409, describeHttp(result));
      assert.equal(result.payload.error, "capture_content_conflict", describeHttp(result));
      const receipt = await requestJson(
        `${baseUrl}/api/captures/operations/${encodeURIComponent(captureId)}`,
        { headers: authHeaders() },
      );
      assert.equal(receipt.response.status, 200, describeHttp(receipt));
      assert.equal(receipt.payload.operationId, captureId);
      assert.equal(receipt.payload.captureId, captureId);
      assert.equal(receipt.payload.state, "needs_attention");
      assert.equal(receipt.payload.durable, false);
      assert.equal(receipt.payload.needsAttention, true);
      assert.equal(receipt.payload.retryable, false);
      assert.equal(receipt.payload.lastError?.code, "capture_content_conflict");
      assert.equal(receipt.payload.lastError?.stage, "catalog");
    });
  } finally {
    state.captures.delete(captureId);
  }
  console.log("[PASS] type=text stage=reconciliation state=needs_attention");
}

async function verifyForbiddenStoryFields(baseUrl, state) {
  const fields = [
    "experienceId",
    "eventId",
    "storyId",
    "parentExperienceId",
    "requestedExperienceId",
    "requestedEventId",
  ];
  for (const field of fields) {
    const captureId = `matrix-forbidden-${field.toLowerCase()}`;
    const operationsBefore = state.operations.size;
    const capturesBefore = state.captures.size;
    const result = await step("contract", `forbidden.${field}`, () =>
      requestJson(`${baseUrl}/api/captures`, {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
          "Idempotency-Key": captureId,
        },
        body: JSON.stringify({
          captureId,
          idempotencyKey: captureId,
          intent: "evidence",
          kind: "text",
          occurredAt: OCCURRED_AT,
          text: "Este texto no puede crear una historia desde captura.",
          [field]: "forbidden-story-value",
        }),
      }));
    await step("contract", `forbidden.${field}.rejected`, () => {
      assert.equal(result.response.status, 400, describeHttp(result));
      assert.equal(result.payload.error, "capture_story_fields_forbidden", describeHttp(result));
      assert.equal(state.operations.size, operationsBefore, `${field} created an operation`);
      assert.equal(state.captures.size, capturesBefore, `${field} created a capture`);
    });
  }
  assert.equal(state.storyLinks.length, 0);
  console.log("[PASS] type=contract stage=forbidden_story_fields rejected=6");
}

async function verifyHttpErrors(baseUrl, state) {
  const unsupported = await step("contract", "unsupported_content_type", () =>
    requestJson(`${baseUrl}/api/captures`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "text/plain",
        "Idempotency-Key": "matrix-unsupported-content-type",
      },
      body: "unsupported",
    }));
  await step("contract", "unsupported_content_type.response", () => {
    assert.equal(unsupported.response.status, 415, describeHttp(unsupported));
    assert.equal(unsupported.payload.error, "capture_content_type_unsupported", describeHttp(unsupported));
  });

  const oversizedJsonId = "matrix-oversized-json";
  const oversizedJson = await step("contract", "oversized_json", () =>
    requestJson(`${baseUrl}/api/captures`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Idempotency-Key": oversizedJsonId,
      },
      body: JSON.stringify({
        captureId: oversizedJsonId,
        idempotencyKey: oversizedJsonId,
        intent: "evidence",
        kind: "text",
        occurredAt: OCCURRED_AT,
        text: "x".repeat(6_000),
      }),
    }));
  await step("contract", "oversized_json.response", () => {
    assert.equal(oversizedJson.response.status, 413, describeHttp(oversizedJson));
    assert.equal(oversizedJson.payload.error, "json_payload_too_large", describeHttp(oversizedJson));
  });

  const oversizedMultipartId = "matrix-oversized-multipart";
  const oversizedForm = new FormData();
  oversizedForm.append("metadata", JSON.stringify({
    captureId: oversizedMultipartId,
    idempotencyKey: oversizedMultipartId,
    intent: "evidence",
    kind: "document",
    occurredAt: OCCURRED_AT,
    filename: "oversized.bin",
    mimeType: "application/octet-stream",
  }));
  oversizedForm.append(
    "file",
    new Blob([Buffer.alloc(6_000, 7)], { type: "application/octet-stream" }),
    "oversized.bin",
  );
  const oversizedMultipart = await step("contract", "oversized_multipart", () =>
    requestJson(`${baseUrl}/api/captures`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Idempotency-Key": oversizedMultipartId,
      },
      body: oversizedForm,
    }));
  await step("contract", "oversized_multipart.response", () => {
    assert.equal(oversizedMultipart.response.status, 413, describeHttp(oversizedMultipart));
    assert.equal(
      oversizedMultipart.payload.error,
      "capture_payload_too_large",
      describeHttp(oversizedMultipart),
    );
  });

  const unauthorized = await step("contract", "auth_required", () =>
    requestJson(`${baseUrl}/api/captures`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }));
  await step("contract", "auth_required.response", () => {
    assert.equal(unauthorized.response.status, 401, describeHttp(unauthorized));
    assert.equal(unauthorized.payload.error, "auth_required", describeHttp(unauthorized));
  });

  await verifyModeError(baseUrl, state, {
    mode: "canary",
    canaryUsers: "another-user@example.com",
    expectedStatus: 403,
    expectedError: "capture_pipeline_canary_only",
  });
  await verifyModeError(baseUrl, state, {
    mode: "off",
    canaryUsers: "",
    expectedStatus: 503,
    expectedError: "capture_pipeline_disabled",
  });
  console.log("[PASS] type=contract stage=http_errors status=401/403/413/415/503");
}

async function verifyModeError(_baseUrl, _state, expectation) {
  const port = await findFreePort();
  const child = await startApplicationServer(port, supabaseDouble.baseUrl, {
    mode: expectation.mode,
    canaryUsers: expectation.canaryUsers,
  });
  try {
    const captureId = `matrix-mode-${expectation.mode}`;
    const result = await requestJson(`http://127.0.0.1:${port}/api/captures`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Idempotency-Key": captureId,
      },
      body: JSON.stringify({
        captureId,
        idempotencyKey: captureId,
        intent: "evidence",
        kind: "text",
        occurredAt: OCCURRED_AT,
        text: "Guard test.",
      }),
    });
    assert.equal(result.response.status, expectation.expectedStatus, describeHttp(result));
    assert.equal(result.payload.error, expectation.expectedError, describeHttp(result));
  } finally {
    await stopChild(child);
  }
}

async function verifyV1NoRegression(baseUrl) {
  const result = await step("v1", "integration_validate", () =>
    requestJson(`${baseUrl}/api/integration/validate`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sourceId: "matrix-v1-text",
        sourceType: "vibeapp-native",
        capturedAt: OCCURRED_AT,
        participantId: "principal",
        payloadType: "text",
        payload: { text: "La ruta V1 continua respondiendo durante el canario." },
        idempotencyKey: "matrix-v1-text",
      }),
    }));
  await step("v1", "integration_validate.response", () => {
    assert.equal(result.response.status, 200, describeHttp(result));
    assert.equal(result.payload.ok, true, describeHttp(result));
    assert.equal(result.payload.normalized?.sourceId, "matrix-v1-text");
  });
  console.log("[PASS] type=v1 stage=integration_validate");
}

function verifyGlobalInvariants(state) {
  activeType = "matrix";
  activeStage = "global_invariants";
  assert.equal(state.storyLinks.length, 0, "capture flow wrote story_evidence_links");
  assert.equal(
    state.operations.size,
    CAPTURE_CASES.length + 3,
    "unexpected operation count",
  );
  assert.equal(
    state.captures.size,
    CAPTURE_CASES.length + 2,
    "unexpected capture count",
  );
  for (const operation of state.operations.values()) {
    if (operation.operation_id === "matrix-needs-attention") {
      assert.equal(operation.state, "needs_attention");
      assert.equal(operation.last_error?.code, "capture_content_conflict");
    } else {
      assert.equal(operation.state, "complete", `operation not complete: ${operation.operation_id}`);
      assert.equal(operation.last_error, null, `operation kept stale error: ${operation.operation_id}`);
    }
  }
}

async function submitCapture(baseUrl, captureCase) {
  const payload = {
    captureId: captureCase.captureId,
    idempotencyKey: captureCase.idempotencyKey,
    intent: captureCase.intent,
    kind: captureCase.kind,
    occurredAt: captureCase.occurredAt,
    text: captureCase.text || undefined,
    participantId: captureCase.participantId || undefined,
    filename: captureCase.filename || undefined,
    mimeType: captureCase.mimeType || undefined,
    metadata: captureCase.metadata || {},
    source: {
      app: "vibeapp",
      device: "capture-matrix-ios",
      platform: "ios",
      capturedOffline: true,
    },
  };
  if (captureCase.transport === "multipart") {
    const form = new FormData();
    form.append("metadata", JSON.stringify(payload));
    form.append(
      "file",
      new Blob([captureCase.bytes], { type: captureCase.mimeType }),
      captureCase.filename,
    );
    return requestJson(`${baseUrl}/api/captures`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Idempotency-Key": captureCase.idempotencyKey,
      },
      body: form,
    });
  }
  return requestJson(`${baseUrl}/api/captures`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
      "Idempotency-Key": captureCase.idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
}

function assertCompleteReceipt(payload, expected) {
  assert.equal(payload.ok, true);
  assert.equal(payload.accepted, true);
  assert.equal(payload.durable, true);
  assert.equal(payload.duplicate, expected.duplicate);
  assert.equal(payload.operationId, expected.idempotencyKey);
  assert.equal(payload.operationId, expected.captureId);
  assert.equal(payload.captureId, expected.captureId);
  assert.equal(payload.intent, expected.intent);
  assert.equal(payload.kind, expected.kind);
  assert.equal(payload.state, "complete");
  assert.equal(payload.retryable, false);
  assert.equal(payload.needsAttention, false);
  assert.equal(payload.lastError, null);
  assert.equal(payload.visible, true);
  assert.equal(payload.projection?.target, projectionTarget(expected.intent, expected.kind));
}

async function step(captureType, stage, callback) {
  activeType = captureType;
  activeStage = stage;
  try {
    return await callback();
  } catch (error) {
    throw new MatrixFailure(captureType, stage, error);
  }
}

async function startApplicationServer(port, supabaseUrl, options = {}) {
  activeType = "pipeline";
  activeStage = "server_start";
  const child = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      NODE_ENV: "test",
      STORAGE_ADAPTER: "supabase",
      SUPABASE_URL: supabaseUrl,
      SUPABASE_PUBLISHABLE_KEY: "capture-matrix-publishable-key",
      SUPABASE_SERVICE_ROLE_KEY: "capture-matrix-service-role-key",
      SUPABASE_STORAGE_BUCKET: BUCKET,
      CAPTURE_PIPELINE_BUCKET: BUCKET,
      CAPTURE_PIPELINE_PREFIX: CAPTURE_PREFIX,
      CAPTURE_PIPELINE_MODE: options.mode || "on",
      CAPTURE_PIPELINE_CANARY_USERS: options.canaryUsers || "",
      EVIDENCE_PIPELINE_MODE: "off",
      EVIDENCE_PIPELINE_V2_FROZEN: "true",
      LOCAL_USER_ID: USER_ID,
      MAX_JSON_BODY_LENGTH: "2048",
      MAX_MEDIA_BODY_LENGTH: "4096",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", (chunk) => appOutput.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => appOutput.push(chunk.toString("utf8")));
  await waitForApplication(port, child);
  return child;
}

async function waitForApplication(port, child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`application_server_exited_${child.exitCode}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // The child is still starting.
    }
    await delay(75);
  }
  throw new Error("application_server_not_ready");
}

async function startSupabaseDouble() {
  const state = createSupabaseState();
  const server = createServer((req, res) => {
    handleSupabaseRequest(req, res, state).catch((error) => {
      sendJson(res, 500, { error: "supabase_double_failed", detail: String(error?.message || error) });
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    state,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(resolve);
    }),
  };
}

function createSupabaseState() {
  return {
    workspaces: [{
      workspace_id: WORKSPACE_ID,
      owner_user_id: USER_ID,
      name: "Capture Matrix Workspace",
    }],
    workspaceMembers: new Map(),
    operations: new Map(),
    captures: new Map(),
    captureRows: [],
    assets: new Map(),
    agendaEvents: new Map(),
    contextSignals: new Map(),
    profiles: new Map([[
      USER_ID,
      {
        user_id: USER_ID,
        email: "local-user@example.com",
        name: "Capture Matrix User",
        language: "es",
        timezone: "America/New_York",
        subscription_tier: "test",
      },
    ]]),
    storyLinks: [],
    objects: new Map(),
    storageUploadCalls: new Map(),
    successfulStorageWrites: new Map(),
    catalogWriteCalls: new Map(),
    storageLifecycle: {
      writes: 0,
      reads: 0,
      deletes: 0,
      paths: [],
    },
    failures: {
      storageUploads: 0,
      catalogWrites: 0,
    },
  };
}

async function handleSupabaseRequest(req, res, state) {
  const url = new URL(req.url, "http://capture-matrix.local");
  if (url.pathname === "/auth/v1/user" && req.method === "GET") {
    sendJson(res, 200, { id: USER_ID, email: "local-user@example.com" });
    return;
  }
  if (url.pathname === `/storage/v1/bucket/${BUCKET}` && req.method === "GET") {
    sendJson(res, 200, {
      id: BUCKET,
      name: BUCKET,
      public: false,
      file_size_limit: 90_000_000,
      allowed_mime_types: null,
    });
    return;
  }
  if (url.pathname.startsWith("/storage/v1/object/info/") && req.method === "GET") {
    const { bucket, objectPath } = parseStorageRoute(url.pathname, "/storage/v1/object/info/");
    const object = state.objects.get(storageKey(bucket, objectPath));
    if (!object) {
      sendJson(res, 404, { statusCode: "404", error: "not_found" });
      return;
    }
    state.storageLifecycle.reads += 1;
    state.storageLifecycle.paths.push({ action: "info", bucket, objectPath });
    sendJson(res, 200, {
      name: objectPath,
      bucket_id: bucket,
      metadata: {
        mimetype: object.contentType,
        size: object.bytes.length,
      },
    });
    return;
  }
  if (url.pathname.startsWith("/storage/v1/object/") && req.method === "POST") {
    const { bucket, objectPath } = parseStorageRoute(url.pathname, "/storage/v1/object/");
    const key = storageKey(bucket, objectPath);
    increment(state.storageUploadCalls, key);
    if (state.failures.storageUploads > 0) {
      state.failures.storageUploads -= 1;
      sendJson(res, 503, {
        error: "temporary_storage_unavailable",
        message: "Injected transient storage failure",
      });
      return;
    }
    const bytes = await readRequestBuffer(req);
    state.objects.set(key, {
      bucket,
      objectPath,
      bytes,
      contentType: String(req.headers["content-type"] || "application/octet-stream"),
    });
    state.storageLifecycle.writes += 1;
    state.storageLifecycle.paths.push({ action: "write", bucket, objectPath });
    increment(state.successfulStorageWrites, key);
    sendJson(res, 200, { Key: `${bucket}/${objectPath}` });
    return;
  }
  if (url.pathname.startsWith("/storage/v1/object/authenticated/") && req.method === "GET") {
    const { bucket, objectPath } = parseStorageRoute(
      url.pathname,
      "/storage/v1/object/authenticated/",
    );
    const object = state.objects.get(storageKey(bucket, objectPath));
    if (!object) {
      sendJson(res, 404, { statusCode: "404", error: "not_found" });
      return;
    }
    state.storageLifecycle.reads += 1;
    state.storageLifecycle.paths.push({ action: "read", bucket, objectPath });
    res.writeHead(200, {
      "Content-Type": object.contentType,
      "Content-Length": object.bytes.length,
    });
    res.end(object.bytes);
    return;
  }
  if (url.pathname.startsWith("/storage/v1/object/") && req.method === "GET") {
    const { bucket, objectPath } = parseStorageRoute(url.pathname, "/storage/v1/object/");
    const object = state.objects.get(storageKey(bucket, objectPath));
    if (!object) {
      sendJson(res, 404, { statusCode: "404", error: "not_found" });
      return;
    }
    state.storageLifecycle.reads += 1;
    state.storageLifecycle.paths.push({ action: "read", bucket, objectPath });
    res.writeHead(200, {
      "Content-Type": object.contentType,
      "Content-Length": object.bytes.length,
    });
    res.end(object.bytes);
    return;
  }
  if (url.pathname === `/storage/v1/object/${BUCKET}` && req.method === "DELETE") {
    const body = await readRequestJson(req);
    const prefixes = Array.isArray(body.prefixes) ? body.prefixes : [];
    const deleted = [];
    for (const objectPath of prefixes) {
      const key = storageKey(BUCKET, objectPath);
      if (state.objects.delete(key)) deleted.push({ name: objectPath });
    }
    state.storageLifecycle.deletes += 1;
    prefixes.forEach((objectPath) =>
      state.storageLifecycle.paths.push({ action: "delete", bucket: BUCKET, objectPath }));
    sendJson(res, 200, deleted);
    return;
  }
  if (url.pathname.startsWith("/storage/v1/object/") && req.method === "DELETE") {
    const { bucket, objectPath } = parseStorageRoute(url.pathname, "/storage/v1/object/");
    const deleted = state.objects.delete(storageKey(bucket, objectPath));
    state.storageLifecycle.deletes += 1;
    state.storageLifecycle.paths.push({ action: "delete", bucket, objectPath });
    sendJson(res, 200, deleted ? [{ name: objectPath }] : []);
    return;
  }
  if (url.pathname === "/rest/v1/rpc/claim_capture_operation" && req.method === "POST") {
    const body = await readRequestJson(req);
    const existing = [...state.operations.values()].find(
      (row) => row.owner_user_id === body.p_owner_user_id &&
        row.idempotency_key === body.p_idempotency_key,
    );
    if (existing) {
      if (
        existing.capture_id !== body.p_capture_id ||
        existing.workspace_id !== body.p_workspace_id ||
        existing.fingerprint !== body.p_fingerprint ||
        existing.checksum !== body.p_checksum
      ) {
        sendJson(res, 409, {
          code: "23505",
          message: "capture_idempotency_conflict",
        });
        return;
      }
      sendJson(res, 200, existing);
      return;
    }
    const now = new Date().toISOString();
    const row = {
      operation_id: body.p_operation_id,
      idempotency_key: body.p_idempotency_key,
      capture_id: body.p_capture_id,
      owner_user_id: body.p_owner_user_id,
      workspace_id: body.p_workspace_id,
      fingerprint: body.p_fingerprint,
      checksum: body.p_checksum,
      intent: body.p_intent,
      kind: body.p_kind,
      state: "received",
      attempts: 0,
      storage_path: null,
      last_error: null,
      created_at: now,
      updated_at: now,
    };
    state.operations.set(row.operation_id, row);
    sendJson(res, 200, row);
    return;
  }
  if (url.pathname.startsWith("/rest/v1/")) {
    await handlePostgrestRequest(req, res, url, state);
    return;
  }
  sendJson(res, 404, {
    error: "supabase_double_route_missing",
    method: req.method,
    path: url.pathname,
  });
}

async function handlePostgrestRequest(req, res, url, state) {
  const table = decodeURIComponent(url.pathname.slice("/rest/v1/".length));
  if (table === "workspaces") {
    if (req.method === "GET") {
      const ownerId = eqValue(url.searchParams.get("owner_user_id"));
      sendJson(res, 200, state.workspaces.filter((row) => !ownerId || row.owner_user_id === ownerId));
      return;
    }
  }
  if (table === "workspace_members" && req.method === "POST") {
    const body = await readRequestJson(req);
    state.workspaceMembers.set(`${body.workspace_id}:${body.user_id}`, body);
    sendJson(res, 201, []);
    return;
  }
  if (table === "capture_operations") {
    if (req.method === "GET") {
      const operationId = eqValue(url.searchParams.get("operation_id"));
      const ownerId = eqValue(url.searchParams.get("owner_user_id"));
      const workspaceId = eqValue(url.searchParams.get("workspace_id"));
      const rows = [...state.operations.values()].filter((row) =>
        (!operationId || row.operation_id === operationId) &&
        (!ownerId || row.owner_user_id === ownerId) &&
        (!workspaceId || row.workspace_id === workspaceId));
      sendJson(res, 200, rows.slice(0, Number(url.searchParams.get("limit") || rows.length)));
      return;
    }
    if (req.method === "PATCH") {
      const operationId = eqValue(url.searchParams.get("operation_id"));
      const patch = await readRequestJson(req);
      const existing = state.operations.get(operationId);
      if (!existing) {
        sendJson(res, 200, []);
        return;
      }
      const row = { ...existing, ...patch };
      state.operations.set(operationId, row);
      sendJson(res, 200, [row]);
      return;
    }
  }
  if (table === "capture_records") {
    if (req.method === "GET") {
      const captureId = eqValue(url.searchParams.get("capture_id"));
      const ownerId = eqValue(url.searchParams.get("owner_user_id"));
      const workspaceId = eqValue(url.searchParams.get("workspace_id"));
      const rows = [...state.captures.values()].filter((row) =>
        (!captureId || row.capture_id === captureId) &&
        (!ownerId || row.owner_user_id === ownerId) &&
        (!workspaceId || row.workspace_id === workspaceId));
      sendJson(res, 200, rows.slice(0, Number(url.searchParams.get("limit") || rows.length)));
      return;
    }
    if (req.method === "POST") {
      const body = await readRequestJson(req);
      increment(state.catalogWriteCalls, body.capture_id);
      if (state.failures.catalogWrites > 0) {
        state.failures.catalogWrites -= 1;
        sendJson(res, 503, {
          error: "temporary_catalog_unavailable",
          message: "Injected transient catalog failure",
        });
        return;
      }
      state.captures.set(body.capture_id, body);
      state.captureRows.push(structuredClone(body));
      sendJson(res, 201, [body]);
      return;
    }
  }
  if (table === "story_evidence_links" && req.method === "GET") {
    sendJson(res, 200, state.storyLinks);
    return;
  }
  if (table === "assets") {
    if (req.method === "POST") {
      const row = await readRequestJson(req);
      state.assets.set(row.asset_id, row);
      sendJson(res, 201, [row]);
      return;
    }
    if (req.method === "GET") {
      const assetId = eqValue(url.searchParams.get("asset_id"));
      const workspaceId = eqValue(url.searchParams.get("workspace_id"));
      const rows = [...state.assets.values()].filter((row) =>
        (!assetId || row.asset_id === assetId) &&
        (!workspaceId || row.workspace_id === workspaceId));
      sendJson(res, 200, rows);
      return;
    }
  }
  if (table === "agenda_events") {
    if (req.method === "POST") {
      const row = await readRequestJson(req);
      state.agendaEvents.set(row.event_id, row);
      sendJson(res, 201, [row]);
      return;
    }
    if (req.method === "GET") {
      const eventId = eqValue(url.searchParams.get("event_id"));
      const rows = [...state.agendaEvents.values()].filter((row) =>
        !eventId || row.event_id === eventId);
      sendJson(res, 200, rows);
      return;
    }
  }
  if (table === "context_signals") {
    if (req.method === "POST") {
      const row = await readRequestJson(req);
      state.contextSignals.set(row.signal_id, row);
      sendJson(res, 201, [row]);
      return;
    }
    if (req.method === "GET") {
      const signalId = eqValue(url.searchParams.get("signal_id"));
      const rows = [...state.contextSignals.values()].filter((row) =>
        !signalId || row.signal_id === signalId);
      sendJson(res, 200, rows);
      return;
    }
  }
  if (table === "profiles") {
    if (req.method === "GET") {
      const userId = eqValue(url.searchParams.get("user_id"));
      const row = state.profiles.get(userId);
      sendJson(res, 200, row ? [row] : []);
      return;
    }
    if (req.method === "POST") {
      const row = await readRequestJson(req);
      state.profiles.set(row.user_id, row);
      sendJson(res, 201, [row]);
      return;
    }
  }
  sendJson(res, 404, {
    code: "PGRST205",
    message: `Capture matrix does not implement ${req.method} ${table}`,
  });
}

async function requestJson(url, options = {}) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(url, {
        ...options,
        signal: options.signal || controller.signal,
      });
      const text = await response.text();
      let payload = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { raw: text };
      }
      return { response, payload, text };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`http_timeout_5000ms:${new URL(url).pathname}`);
    }
    throw error;
  }
}

function describeHttp(result) {
  return `HTTP ${result.response.status}: ${result.text}`;
}

function authHeaders() {
  return { Authorization: `Bearer ${ACCESS_TOKEN}` };
}

function parseStorageRoute(pathname, prefix) {
  const parts = pathname.slice(prefix.length).split("/");
  const bucket = decodeURIComponent(parts.shift() || "");
  const objectPath = parts.map((part) => decodeURIComponent(part)).join("/");
  return { bucket, objectPath };
}

function storageKey(bucket, objectPath) {
  return `${bucket}/${objectPath}`;
}

function eqValue(value) {
  return value ? String(value).replace(/^eq\./, "") : "";
}

function projectionTarget(intent, kind) {
  if (intent === "evidence") return "assets";
  if (kind === "agenda") return "agenda";
  return "context";
}

function roundTripValue(check, key) {
  if (Object.hasOwn(check, key)) return check[key];
  if (check.detail && typeof check.detail === "object" && Object.hasOwn(check.detail, key)) {
    return check.detail[key];
  }
  return undefined;
}

function normalizePrefix(value) {
  const prefix = String(value || "").replace(/^\/+/, "");
  return prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix;
}

function increment(map, key) {
  map.set(key, Number(map.get(key) || 0) + 1);
}

function countCaptures(state, captureId) {
  return state.captureRows.filter((row) => row.capture_id === captureId).length;
}

async function readRequestJson(req) {
  const bytes = await readRequestBuffer(req);
  return bytes.length ? JSON.parse(bytes.toString("utf8")) : {};
}

async function readRequestBuffer(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function sendJson(res, statusCode, payload) {
  if (res.headersSent) return;
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function findFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(1500),
  ]);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
