import { existsSync, readFileSync, readdirSync } from "node:fs";

function readTextTree(dir, extension = ".dart") {
  if (!existsSync(dir)) return "";
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return readTextTree(fullPath, extension);
      if (entry.isFile() && entry.name.endsWith(extension)) return readFileSync(fullPath, "utf8");
      return "";
    })
    .join("\n");
}

const files = {
  app: readFileSync("app.js", "utf8"),
  server: readFileSync("server.js", "utf8"),
  packageJson: readFileSync("package.json", "utf8"),
  vibeappMain: readTextTree("vibeapp/lib"),
  vibeappTest: readFileSync("vibeapp/test/widget_test.dart", "utf8"),
};

const contract = {
  schemaVersion: "vibe-signal-contract-v2",
  requiredFields: ["sourceId", "sourceType", "capturedAt", "participantId", "payloadType", "payload"],
  allowedSourceTypes: ["mobile", "wearable", "file_import", "api", "calendar", "voice", "manual", "vibeapp-native", "external-session"],
  allowedPayloadTypes: ["biometric", "location", "media", "image", "audio", "video", "document", "activity", "sleep", "text", "calendar", "context"],
  targets: {
    text: "experience",
    calendar: "agenda",
    image: "assets",
    audio: "assets",
    video: "assets",
    document: "assets",
    media: "assets",
    biometric: "context",
    location: "context",
  },
};

const now = "2026-05-28T14:00:00.000Z";
const samples = [
  {
    name: "quick-note",
    expectedTarget: "experience",
    signal: {
      sourceId: "vibeapp-note-001",
      sourceType: "vibeapp-native",
      capturedAt: now,
      participantId: "miguel",
      payloadType: "text",
      payload: { title: "Nota rapida", text: "V toma nota que este parque esta hermoso." },
      privacyLevel: "private",
      idempotencyKey: "vibeapp-capture:text:vibeapp-note-001",
    },
  },
  {
    name: "agenda-command",
    expectedTarget: "agenda",
    signal: {
      sourceId: "vibeapp-agenda-001",
      sourceType: "vibeapp-native",
      capturedAt: now,
      participantId: "miguel",
      payloadType: "calendar",
      payload: { title: "Cena", location: "Casa", startAt: "2026-05-28T20:00:00.000Z" },
      privacyLevel: "private",
      idempotencyKey: "vibeapp-agenda:vibeapp-agenda-001",
    },
  },
  {
    name: "photo-asset",
    expectedTarget: "assets",
    signal: {
      sourceId: "vibeapp-photo-001",
      sourceType: "vibeapp-native",
      capturedAt: now,
      participantId: "miguel",
      payloadType: "image",
      payload: { fileName: "vibeapp-photo.jpg", mimeType: "image/jpeg", storageObjectHint: "vibeapp-photo-001.jpg" },
      privacyLevel: "private",
      linkedExperienceId: "exp-native-001",
      idempotencyKey: "vibeapp-asset:vibeapp-photo-001",
    },
  },
  {
    name: "video-asset",
    expectedTarget: "assets",
    signal: {
      sourceId: "vibeapp-video-001",
      sourceType: "vibeapp-native",
      capturedAt: now,
      participantId: "miguel",
      payloadType: "video",
      payload: { fileName: "vibeapp-clip.mp4", mimeType: "video/mp4", storageObjectHint: "vibeapp-video-001.mp4" },
      privacyLevel: "private",
      linkedExperienceId: "exp-native-001",
      idempotencyKey: "vibeapp-asset:vibeapp-video-001",
    },
  },
  {
    name: "audio-asset",
    expectedTarget: "assets",
    signal: {
      sourceId: "vibeapp-audio-001",
      sourceType: "vibeapp-native",
      capturedAt: now,
      participantId: "miguel",
      payloadType: "audio",
      payload: { fileName: "vibeapp-audio.m4a", mimeType: "audio/mp4", storageObjectHint: "vibeapp-audio-001.m4a" },
      privacyLevel: "private",
      linkedExperienceId: "exp-native-001",
      idempotencyKey: "vibeapp-asset:vibeapp-audio-001",
    },
  },
  {
    name: "biometric-file",
    expectedTarget: "context",
    signal: {
      sourceId: "vibeapp-biometric-001",
      sourceType: "vibeapp-native",
      capturedAt: now,
      participantId: "miguel",
      payloadType: "biometric",
      payload: { fileName: "apple-health.csv", metrics: ["steps", "heart_rate", "sleep"] },
      privacyLevel: "sensitive",
      idempotencyKey: "vibeapp-capture:biometric:vibeapp-biometric-001",
    },
  },
  {
    name: "location-context",
    expectedTarget: "context",
    signal: {
      sourceId: "vibeapp-location-001",
      sourceType: "vibeapp-native",
      capturedAt: now,
      participantId: "miguel",
      payloadType: "location",
      payload: { latitude: 18.4655, longitude: -66.1057, accuracyMeters: 18 },
      privacyLevel: "private",
      idempotencyKey: "vibeapp-capture:location:vibeapp-location-001",
    },
  },
  {
    name: "meta-glasses-import",
    expectedTarget: "assets",
    signal: {
      sourceId: "meta-hstn-001",
      sourceType: "external-session",
      capturedAt: now,
      participantId: "miguel",
      payloadType: "media",
      payload: { source: "meta-glasses", files: ["foto.heic", "clip.mp4", "meta-export.json"] },
      privacyLevel: "private",
      idempotencyKey: "vibeapp-external-session:meta-hstn-001",
    },
  },
];

function validate(signal) {
  const errors = [];
  const warnings = [];
  const normalized = {
    sourceId: String(signal.sourceId || signal.idempotencyKey || "").trim(),
    sourceType: String(signal.sourceType || signal.metadata?.sourceType || "").trim(),
    capturedAt: String(signal.capturedAt || signal.timestamp || "").trim(),
    participantId: String(signal.participantId || signal.pilotParticipantId || "").trim(),
    payloadType: String(signal.payloadType || signal.type || "").trim().toLowerCase(),
    payload: signal.payload ?? signal.data ?? null,
    privacyLevel: String(signal.privacyLevel || signal.metadata?.privacyLevel || "normal").trim().toLowerCase(),
    linkedExperienceId: String(signal.linkedExperienceId || signal.experienceId || "").trim(),
  };

  for (const field of contract.requiredFields) {
    if (field === "payload") {
      if (normalized.payload === null || normalized.payload === undefined || normalized.payload === "") errors.push(`${field} is required`);
    } else if (!normalized[field]) {
      errors.push(`${field} is required`);
    }
  }
  if (normalized.capturedAt && !Number.isFinite(Date.parse(normalized.capturedAt))) errors.push("capturedAt must be an ISO date/time");
  if (normalized.sourceType && !contract.allowedSourceTypes.includes(normalized.sourceType)) warnings.push(`sourceType '${normalized.sourceType}' is not recommended`);
  if (normalized.payloadType && !contract.allowedPayloadTypes.includes(normalized.payloadType)) warnings.push(`payloadType '${normalized.payloadType}' is not recommended`);
  if (!signal.idempotencyKey && !signal.metadata?.idempotencyKey) warnings.push("idempotencyKey is recommended for retry-safe ingestion");
  if (["biometric", "activity", "sleep", "media", "image", "audio", "video", "document"].includes(normalized.payloadType) && normalized.privacyLevel === "normal") {
    warnings.push("media or sensitive payloads should declare privacyLevel private or sensitive");
  }

  return {
    ok: errors.length === 0,
    target: contract.targets[normalized.payloadType] || "review",
    errors,
    warnings,
    normalized,
  };
}

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

check(files.server.includes("/api/integration/validate"), "server must expose /api/integration/validate.");
check(files.server.includes("/api/integration/ingest") && files.server.includes("function ingestIntegrationSignal"), "server must expose a validated integration ingest endpoint.");
check(
  files.server.includes("buildPostIngestAutomation")
    && files.server.includes("biometric_impact_recomputed")
    && files.server.includes("completed_with_deferred_context")
    && files.server.includes("queuePostIngestContextRefresh")
    && files.server.includes("integration_ingest_background_refresh_retry_scheduled"),
  "server ingest must acknowledge native writes quickly and defer slow context/dashboard automation with retry visibility.",
);
check(files.server.includes("/api/experiences") && files.server.includes("/api/media") && files.server.includes("/api/integration/ingest"), "server must keep native sync and validated ingest endpoints.");
check(files.server.includes("storageObjectHint") && files.server.includes("idempotencyKey"), "server must preserve storageObjectHint and idempotency metadata.");
check(files.vibeappMain.includes("Idempotency-Key") && files.vibeappMain.includes("X-Vibe-Source-Id"), "Vibeapp transport must send retry-safe idempotency headers.");
check(files.vibeappMain.includes("ExperienceSyncClient") && files.vibeappMain.includes("NativeSyncTransport"), "Vibeapp must keep a sync client and transport abstraction.");
check(files.vibeappMain.includes("CaptureQueueSummary") && files.vibeappMain.includes("NativePilotChecklist"), "Vibeapp must keep queue summary and pilot checklist.");
check(files.vibeappTest.includes("Native sync client sends media, experience, and ingest requests"), "Flutter tests must cover native sync and ingest requests.");
check(files.app.includes("Vibeapp") && files.app.includes("vibe-signal-contract-v2"), "PWA/Admin must document the Vibeapp signal contract.");
check(files.app.includes("/api/integration/ingest"), "PWA/Admin manual must document the integration ingest endpoint.");
check(files.app.includes("syncBiometricImportToServer") && files.app.includes("extractAppleHealthXmlRows"), "PWA biometric import must parse Apple Health XML and sync context through server ingest.");

const results = samples.map((sample) => ({ ...sample, result: validate(sample.signal) }));
for (const sample of results) {
  check(sample.result.ok, `${sample.name} did not validate: ${sample.result.errors.join("; ")}`);
  check(sample.result.target === sample.expectedTarget, `${sample.name} routed to ${sample.result.target}, expected ${sample.expectedTarget}.`);
  check(sample.result.warnings.length === 0, `${sample.name} has warnings: ${sample.result.warnings.join("; ")}`);
}

const targetSummary = results.reduce((acc, sample) => {
  acc[sample.result.target] = (acc[sample.result.target] || 0) + 1;
  return acc;
}, {});

if (failures.length) {
  console.error("Vibeapp sync simulation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Vibeapp sync simulation passed.");
console.log(`Contract: ${contract.schemaVersion}`);
console.log(`Samples: ${results.length}`);
console.log(`Targets: ${Object.entries(targetSummary).map(([target, count]) => `${target}=${count}`).join(", ")}`);
