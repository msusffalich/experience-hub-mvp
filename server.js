import { createServer } from "node:http";
import { readFile, mkdir, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync, inflateRawSync } from "node:zlib";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
await loadDotEnv();
const PORT = Number(process.env.PORT || 5174);
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const DATA_DIR = path.join(__dirname, "data");
const STORE_PATH = path.join(DATA_DIR, "experience-store.json");
const LOG_PATH = path.join(DATA_DIR, "operation-log.json");
const ROUTINES_PATH = path.join(DATA_DIR, "routine-store.json");
const DAILY_BRIEFINGS_PATH = path.join(DATA_DIR, "daily-briefing-store.json");
const PROFILE_PARAMETERS_PATH = path.join(DATA_DIR, "profile-parameters.json");
const AGENDA_EVENTS_PATH = path.join(DATA_DIR, "agenda-events.json");
const OURA_TOKEN_STORE_PATH = path.join(DATA_DIR, "oura-oauth-store.json");
const EXPORTS_DIR = path.join(DATA_DIR, "exports");
const STORAGE_ADAPTER = process.env.STORAGE_ADAPTER || "json-file";
const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "experience-media";
const ASSET_UPLOAD_ATTEMPTS_TABLE = "asset_upload_attempts";
const MAX_JSON_BODY_LENGTH = Number(process.env.MAX_JSON_BODY_LENGTH || 40_000_000);
const MAX_MEDIA_BODY_LENGTH = Number(process.env.MAX_MEDIA_BODY_LENGTH || 90_000_000);
const LOCAL_USER_ID = process.env.LOCAL_USER_ID || "00000000-0000-0000-0000-000000000001";
const CONTEXT_TIMEOUT_MS = Number(process.env.CONTEXT_TIMEOUT_MS || 12000);
const DAILY_NEWS_FRESHNESS_HOURS = Math.max(1, Math.min(Number(process.env.DAILY_NEWS_FRESHNESS_HOURS || 48), 168));
const MOBILE_DAILY_CONTEXT_CACHE_MINUTES = Math.max(5, Math.min(Number(process.env.MOBILE_DAILY_CONTEXT_CACHE_MINUTES || 30), 180));
const DEFAULT_OPERATIONAL_LOCATION = process.env.DEFAULT_OPERATIONAL_LOCATION || "Winter Garden, Florida";
const TRUSTED_NEWS_DOMAINS = (process.env.TRUSTED_NEWS_DOMAINS || [
  "reuters.com",
  "bbc.com",
  "bbc.co.uk",
  "apnews.com",
  "ap.org",
  "afp.com",
  "efe.com",
  "bloomberg.com",
  "ft.com",
  "financialtimes.com",
  "theguardian.com",
  "npr.org",
  "dw.com",
  "france24.com",
  "elpais.com",
  "nytimes.com",
  "washingtonpost.com",
  "wsj.com",
].join(",")).split(",").map((domain) => domain.trim().toLowerCase()).filter(Boolean);
const TRUSTED_NEWS_NAMES = [
  "reuters",
  "bbc",
  "associated press",
  "ap news",
  "ap",
  "afp",
  "efe",
  "bloomberg",
  "financial times",
  "the guardian",
  "npr",
  "deutsche welle",
  "dw",
  "france 24",
  "el pais",
  "the new york times",
  "the washington post",
  "wall street journal",
  "wsj",
];
const EMBEDDINGS_PROVIDER = process.env.EMBEDDINGS_PROVIDER || "local-hash";
const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS || 384);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const TRANSCRIPTION_PROVIDER = process.env.TRANSCRIPTION_PROVIDER || "openai";
const OPENAI_TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";
const OCR_PROVIDER = process.env.OCR_PROVIDER || "openai";
const OPENAI_OCR_MODEL = process.env.OPENAI_OCR_MODEL || "gpt-4o-mini";
const OPENAI_ASSISTANT_MODEL = process.env.OPENAI_ASSISTANT_MODEL || process.env.OPENAI_CHAT_MODEL || OPENAI_OCR_MODEL;
const OPENAI_REALTIME_API_KEY = process.env.OPENAI_REALTIME_API_KEY || OPENAI_API_KEY;
const OPENAI_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2";
const OPENAI_REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE || "marin";
const OPENAI_REALTIME_CLIENT_SECRET_URL = (process.env.OPENAI_REALTIME_CLIENT_SECRET_URL || "https://api.openai.com/v1/realtime/client_secrets").trim();
const OPENAI_REALTIME_WS_BASE_URL = (process.env.OPENAI_REALTIME_WS_BASE_URL || "wss://api.openai.com/v1/realtime").trim().replace(/\?+$/, "");
const OPENAI_REALTIME_TOKEN_TIMEOUT_MS = Math.max(1000, Math.min(Number(process.env.OPENAI_REALTIME_TOKEN_TIMEOUT_MS || 12000), 30000));
const OPENAI_REALTIME_MAX_SESSION_MINUTES = Math.max(1, Math.min(Number(process.env.OPENAI_REALTIME_MAX_SESSION_MINUTES || 10), 60));
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
const ANTHROPIC_API_BASE_URL = (process.env.ANTHROPIC_API_BASE_URL || "https://api.anthropic.com").trim().replace(/\/$/, "");
const MOBILE_ASSISTANT_PROVIDER = (process.env.MOBILE_ASSISTANT_PROVIDER || (OPENAI_API_KEY ? "openai" : "anthropic")).trim().toLowerCase();
const MOBILE_ASSISTANT_PROVIDER_TIMEOUT_MS = Math.max(1000, Math.min(Number(process.env.MOBILE_ASSISTANT_PROVIDER_TIMEOUT_MS || 12000), 30000));
const VIBE_BACKEND_BASE_URL = (process.env.VIBE_BACKEND_BASE_URL || process.env.PUBLIC_BASE_URL || "https://experience-hub-web-production.up.railway.app").trim().replace(/\/$/, "");
const ARNES_ASSISTANT_URL = (process.env.ARNES_ASSISTANT_URL || "").trim();
const ARNES_ASSISTANT_ENABLED = ["1", "true", "yes"].includes(String(process.env.ARNES_ASSISTANT_ENABLED || "").trim().toLowerCase()) && Boolean(ARNES_ASSISTANT_URL);
const ARNES_ASSISTANT_TIMEOUT_MS = Math.max(1000, Math.min(Number(process.env.ARNES_ASSISTANT_TIMEOUT_MS || 15000), 60000));
const SIGNAL_METADATA_SCHEMA_VERSION = "clio-inspired-signal-v1";
const INTEGRATION_CONTRACT_VERSION = "vibe-signal-contract-v2";
const OURA_API_BASE_URL = (process.env.OURA_API_BASE_URL || "https://api.ouraring.com").trim().replace(/\/$/, "");
const OURA_AUTH_BASE_URL = (process.env.OURA_AUTH_BASE_URL || "https://cloud.ouraring.com").trim().replace(/\/$/, "");
const OURA_CLIENT_ID = (process.env.OURA_CLIENT_ID || "").trim();
const OURA_CLIENT_SECRET = (process.env.OURA_CLIENT_SECRET || "").trim();
const OURA_REDIRECT_URI = (process.env.OURA_REDIRECT_URI || "").trim();
const OURA_TOKEN_ENCRYPTION_SECRET = (process.env.OURA_TOKEN_ENCRYPTION_SECRET || "").trim();
const OURA_WEBHOOK_SECRET = (process.env.OURA_WEBHOOK_SECRET || "").trim();
const OURA_SCOPES = (process.env.OURA_SCOPES || "").split(/[,\s]+/).map((scope) => scope.trim()).filter(Boolean);
const OURA_AUTHORIZE_REDIRECT_MODE = (process.env.OURA_AUTHORIZE_REDIRECT_MODE || "explicit").trim().toLowerCase();
const OURA_AUTHORIZE_SCOPE_MODE = (process.env.OURA_AUTHORIZE_SCOPE_MODE || "core").trim().toLowerCase();
const OURA_TOKEN_AUTH_MODE = (process.env.OURA_TOKEN_AUTH_MODE || "body").trim().toLowerCase();
const OURA_TOKEN_EXCHANGE_FALLBACK = ["1", "true", "yes"].includes(String(process.env.OURA_TOKEN_EXCHANGE_FALLBACK || "").trim().toLowerCase());
const OURA_DEFAULT_SYNC_DAYS = Math.max(1, Math.min(Number(process.env.OURA_DEFAULT_SYNC_DAYS || 14), 365));
const OBSIDIAN_VAULT_PATH = (process.env.OBSIDIAN_VAULT_PATH || path.join(__dirname, "obsidian-vault-vibe")).trim();
const OBSIDIAN_EXPORT_TARGETS = {
  inbox: "00_Inbox",
  experiences: "02_Experiences",
  experience: "02_Experiences",
  events: "03_Events",
  event: "03_Events",
  assets: "04_Assets",
  asset: "04_Assets",
  images: "04_Assets/Images",
  image: "04_Assets/Images",
  videos: "04_Assets/Videos",
  video: "04_Assets/Videos",
  audio: "04_Assets/Audio",
  documents: "04_Assets/Documents",
  document: "04_Assets/Documents",
  biometrics: "04_Assets/Biometrics",
  biometric: "04_Assets/Biometrics",
  notes: "10_Atomic_Notes",
  atomic_note: "10_Atomic_Notes",
  moc: "20_Maps_of_Content",
  map: "20_Maps_of_Content",
  generated: "05_Generated",
  generated_map: "05_Generated",
  generated_report: "05_Generated",
  projects: "30_Projects",
  project: "30_Projects",
  publications: "40_Publications",
  publication: "40_Publications",
  reference: "50_Reference",
  manual: "50_Reference",
};
const OBSIDIAN_AUTO_START = "<!-- vibe:auto -->";
const OBSIDIAN_AUTO_END = "<!-- /vibe:auto -->";
const execFileAsync = promisify(execFile);
const PYTHON_EXECUTABLE_CANDIDATES = [
  process.env.PYTHON_EXECUTABLE,
  process.env.PYTHON_PATH,
  "C:\\Users\\msusf\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe",
  "python",
  "python3",
].filter(Boolean);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

const defaultStore = {
  profile: {
    userId: LOCAL_USER_ID,
    name: "Experience Hub User",
    language: "es",
    timezone: "America/New_York",
    gender: "",
    birthYear: null,
    experienceType: "auto",
    subscriptionTier: "mvp",
  },
  experiences: [],
  agendaEvents: [],
  contextSignals: [],
};

const categoryAliases = {
  Movilidad: "Viajes / Paseos",
};

if (STORAGE_ADAPTER === "json-file") {
  await ensureStore();
} else {
  await ensureStore();
}
let storeQueue = Promise.resolve();
let logQueue = Promise.resolve();
let routineQueue = Promise.resolve();
const jobQueue = [];
const jobs = new Map();
const workspaceSchemaState = { checkedAt: null, available: null, error: null };
let jobRunning = false;
let routineSchedulerRunning = false;

const defaultRoutines = [
  {
    id: "daily-review",
    name: "Daily Review",
    enabled: false,
    intervalMinutes: 1440,
    type: "capture-template",
  },
  {
    id: "daily-briefing",
    name: "Diario",
    enabled: true,
    intervalMinutes: 360,
    type: "daily-briefing",
  },
  {
    id: "weekly-report",
    name: "Weekly Report",
    enabled: false,
    intervalMinutes: 10080,
    type: "report-summary",
  },
  {
    id: "embedding-refresh",
    name: "Embedding Refresh",
    enabled: false,
    intervalMinutes: 1440,
    type: "embeddings-backfill",
  },
  {
    id: "offline-sync",
    name: "Offline Sync",
    enabled: false,
    intervalMinutes: 60,
    type: "sync-check",
  },
  {
    id: "context-scan",
    name: "Context Scan",
    enabled: false,
    intervalMinutes: 360,
    type: "context-impact",
  },
  {
    id: "oura-sync",
    name: "Oura Sync",
    enabled: false,
    intervalMinutes: 1440,
    type: "wearable-sync",
  },
];

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(req, res, url.pathname);
  } catch (error) {
    const errorMessage = formatHttpErrorMessage(error);
    sendJson(res, error.statusCode || 500, {
      error: error.statusCode ? error.message : "internal_error",
      message: errorMessage,
      detail: error.detail,
    });
  }
});

server.listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" ? "localhost" : HOST;
  console.log(`Experience Hub MVP running at http://${displayHost}:${PORT}/index.html`);
});
setInterval(() => processRoutineSchedules().catch(() => {}), 60_000);
processRoutineSchedules().catch(() => {});

async function handleApi(req, res, url) {
  if (url.pathname === "/api/health" && req.method === "GET") {
    sendJson(res, 200, {
      status: "ok",
      service: "experience-hub-api",
      host: HOST,
      port: PORT,
      deploymentMode: process.env.NODE_ENV === "production" ? "production" : "local",
      cloudReady: HOST === "0.0.0.0",
      persistence: activePersistence(),
      supabaseConfigured: isSupabaseConfigured(),
      mediaStorage: activePersistence() === "supabase" ? "supabase-storage" : "inline-json",
      semanticSearch: activePersistence() === "supabase" ? "pgvector" : "token-vector",
      embeddingsProvider: activeEmbeddingsProvider(),
      transcriptionProvider: activeTranscriptionProvider(),
      ocrProvider: activeOcrProvider(),
      contextProviders: {
        environmental: { status: "available", provider: "Open-Meteo", mode: "on-demand" },
        geopolitical: { status: "available", provider: "GDELT DOC 2.0", mode: "on-demand" },
      },
      routineScheduler: { status: "active", intervalSeconds: 60 },
      jobs: getJobSummary(),
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (url.pathname === "/api/config" && req.method === "GET") {
    sendJson(res, 200, {
      persistence: activePersistence(),
      supabaseUrl: activePersistence() === "supabase" ? SUPABASE_URL : null,
      supabasePublishableKey: activePersistence() === "supabase" ? SUPABASE_PUBLISHABLE_KEY : null,
      transcriptionProvider: activeTranscriptionProvider(),
      ocrProvider: activeOcrProvider(),
    });
    return;
  }

  if (url.pathname === "/api/mobile/auth/sign-in" && req.method === "POST") {
    const body = await readJson(req);
    const email = String(body.email || "").trim();
    const password = String(body.password || "");
    if (!email || !password) {
      throw new HttpError(400, "missing_credentials", "Ingresa correo y clave.");
    }
    const auth = await signInSupabasePassword(email, password);
    sendJson(res, 200, {
      ok: true,
      accessToken: auth.access_token,
      refreshToken: auth.refresh_token || null,
      tokenType: auth.token_type || "bearer",
      expiresIn: auth.expires_in || null,
      expiresAt: auth.expires_at || null,
      user: {
        id: auth.user?.id || "",
        email: auth.user?.email || email,
      },
    });
    return;
  }

  if (url.pathname === "/api/mobile/assistant/message" && req.method === "POST") {
    const user = await getRequestUser(req);
    const body = await readJson(req);
    sendJson(res, 200, await handleMobileAssistantMessage(body, user));
    return;
  }

  if (url.pathname === "/api/mobile/assistant/status" && req.method === "GET") {
    const user = await getRequestUser(req);
    sendJson(res, 200, await getMobileAssistantStatus(user));
    return;
  }

  if (
    (url.pathname === "/api/mobile/ai/vision" || url.pathname === "/api/mobile/assistant/vision") &&
    req.method === "POST"
  ) {
    const user = await getRequestUser(req);
    const body = await readJson(req);
    sendJson(res, 200, await handleMobileAssistantVision(body, user));
    return;
  }

  if (url.pathname === "/api/mobile/ai/messages" && req.method === "POST") {
    const user = await getRequestUser(req);
    const body = await readJson(req);
    sendJson(res, 200, await proxyMobileAnthropicMessages(body, user));
    return;
  }

  if (url.pathname === "/api/mobile/ai/transcribe" && req.method === "POST") {
    const user = await getRequestUser(req);
    sendJson(res, 200, await proxyMobileTranscription(req, req.headers["content-type"] || "", user));
    return;
  }

  if (url.pathname === "/api/mobile/realtime/token" && req.method === "POST") {
    const user = await getRequestUser(req);
    const body = await readJson(req);
    sendJson(res, 200, await createMobileRealtimeToken(body, user));
    return;
  }

  if (url.pathname.startsWith("/api/mobile/oura/") && req.method === "GET") {
    const user = await getRequestUser(req);
    const collection = decodeURIComponent(url.pathname.replace("/api/mobile/oura/", "")).trim();
    sendJson(res, 200, await proxyMobileOuraCollection(collection, url.searchParams, user));
    return;
  }

  if (url.pathname === "/api/mobile/participants" && req.method === "GET") {
    const user = await getRequestUser(req);
    sendJson(res, 200, await listMobileParticipants(user));
    return;
  }

  if (url.pathname === "/api/mobile/context/daily" && req.method === "GET") {
    const user = await getRequestUser(req);
    sendJson(res, 200, await getMobileDailyContext(url.searchParams, user));
    return;
  }

  if (url.pathname === "/api/mobile/context/health-summary" && req.method === "GET") {
    const user = await getRequestUser(req);
    sendJson(res, 200, await getMobileHealthSummary(url.searchParams, user));
    return;
  }

  if (url.pathname === "/api/integration/contract" && req.method === "GET") {
    sendJson(res, 200, buildIntegrationContract());
    return;
  }

  if (url.pathname === "/api/integration/samples" && req.method === "GET") {
    sendJson(res, 200, buildIntegrationSampleKit());
    return;
  }

  if (url.pathname === "/api/integration/oura/manifest" && req.method === "GET") {
    sendJson(res, 200, buildOuraConnectorManifest());
    return;
  }

  if (url.pathname === "/api/integration/oura/status" && req.method === "GET") {
    const user = await getOptionalRequestUser(req);
    sendJson(res, 200, await getOuraConnectionStatus(user));
    return;
  }

  if (url.pathname === "/api/integration/oura/preflight" && req.method === "GET") {
    sendJson(res, 200, await buildOuraPublicPreflight(url));
    return;
  }

  if (url.pathname === "/api/integration/oura/diagnostic-connect" && req.method === "GET") {
    await startOuraDiagnosticFlow(req, res, url);
    return;
  }

  if (url.pathname === "/api/integration/oura/connect" && req.method === "GET") {
    const user = await getRequestUser(req);
    await startOuraOAuthFlow(req, res, url, user);
    return;
  }

  if (url.pathname === "/api/integration/oura/connect-url" && req.method === "GET") {
    const user = await getRequestUser(req);
    sendJson(res, 200, await createOuraOAuthUrl(url, user));
    return;
  }

  if (url.pathname === "/api/integration/oura/callback" && req.method === "GET") {
    await completeOuraOAuthFlow(req, res, url);
    return;
  }

  if (url.pathname === "/api/integration/oura/sync" && req.method === "POST") {
    const user = await getRequestUser(req);
    const body = await readJson(req);
    sendJson(res, 200, await syncOuraApiData(body, user));
    return;
  }

  if (url.pathname === "/api/integration/oura/webhook" && req.method === "POST") {
    const body = await readJson(req);
    sendJson(res, 202, await handleOuraWebhook(req, body));
    return;
  }

  if (url.pathname === "/api/integration/oura/normalize" && req.method === "POST") {
    const user = await getOptionalRequestUser(req);
    const body = await readJson(req);
    sendJson(res, 200, normalizeOuraPayload(body, user));
    return;
  }

  if (url.pathname === "/api/integration/apple-health/manifest" && req.method === "GET") {
    sendJson(res, 200, buildAppleHealthConnectorManifest());
    return;
  }

  if (url.pathname === "/api/integration/apple-health/normalize" && req.method === "POST") {
    const user = await getOptionalRequestUser(req);
    const body = await readJson(req);
    sendJson(res, 200, normalizeAppleHealthPayload(body, user));
    return;
  }

  if (url.pathname === "/api/integration/health-connect/manifest" && req.method === "GET") {
    sendJson(res, 200, buildHealthConnectConnectorManifest());
    return;
  }

  if (url.pathname === "/api/integration/health-connect/normalize" && req.method === "POST") {
    const user = await getOptionalRequestUser(req);
    const body = await readJson(req);
    sendJson(res, 200, normalizeHealthConnectPayload(body, user));
    return;
  }

  if (url.pathname === "/api/integration/meta-wearables/manifest" && req.method === "GET") {
    sendJson(res, 200, buildMetaWearablesConnectorManifest());
    return;
  }

  if (url.pathname === "/api/integration/meta-wearables/normalize" && req.method === "POST") {
    const user = await getOptionalRequestUser(req);
    const body = await readJson(req);
    sendJson(res, 200, normalizeMetaWearablesPayload(body, user));
    return;
  }

  if (url.pathname === "/api/integration/device/selftest" && req.method === "GET") {
    const user = await getOptionalRequestUser(req);
    sendJson(res, 200, runDeviceConnectorSelfTest(user));
    return;
  }

  if (url.pathname === "/api/integration/validate" && req.method === "POST") {
    const user = await getRequestUser(req);
    const body = await readJson(req);
    sendJson(res, 200, validateIntegrationSignal(body, user));
    return;
  }

  if (url.pathname === "/api/integration/ingest" && req.method === "POST") {
    const user = await getRequestUser(req);
    const body = await readJson(req);
    sendJson(res, 201, await ingestIntegrationSignals(body, user));
    return;
  }

  if (url.pathname === "/api/vibeapp/simulate" && req.method === "POST") {
    const user = await getRequestUser(req);
    sendJson(res, 200, runVibeappIntegrationSimulation(user));
    return;
  }

  if (url.pathname === "/api/profile") {
    const user = await getRequestUser(req);
    if (req.method === "GET") {
      sendJson(res, 200, await getProfile(user));
      return;
    }
    if (req.method === "PUT") {
      const body = await readJson(req);
      sendJson(res, 200, await upsertProfile(body, user));
      return;
    }
  }

  if (url.pathname === "/api/participants" && req.method === "POST") {
    const user = await getRequestUser(req);
    const body = await readJson(req);
    sendJson(res, 201, await upsertParticipantRecord(body, user));
    return;
  }

  const participantMatch = url.pathname.match(/^\/api\/participants\/([^/]+)$/);
  if (participantMatch) {
    const user = await getRequestUser(req);
    const participantId = decodeURIComponent(participantMatch[1]);
    if (req.method === "PATCH") {
      const body = await readJson(req);
      sendJson(res, 200, await updateParticipantLifecycle(participantId, body, user));
      return;
    }
  }

  if (url.pathname === "/api/account/closure-request" && req.method === "POST") {
    const user = await getRequestUser(req);
    const body = await readJson(req);
    sendJson(res, 201, await recordAccountClosureRequest(body, user));
    return;
  }

  if (url.pathname === "/api/account/data-reset" && req.method === "POST") {
    const user = await getRequestUser(req);
    const body = await readJson(req);
    sendJson(res, 200, await resetUserContentData(body, user));
    return;
  }

  if (url.pathname === "/api/experiences") {
    const user = await getRequestUser(req);
    if (req.method === "GET") {
      sendJson(res, 200, await listExperiences(user));
      return;
    }
    if (req.method === "POST") {
      const experience = await readJson(req);
      const normalized = normalizeExperience(experience);
      sendJson(res, 201, await upsertExperience(normalized, user));
      return;
    }
  }

  if (url.pathname === "/api/agenda") {
    const user = await getRequestUser(req);
    if (req.method === "GET") {
      sendJson(res, 200, await listAgendaEvents(user));
      return;
    }
    if (req.method === "POST") {
      const agendaEvent = await readJson(req);
      sendJson(res, 201, await upsertAgendaEvent(agendaEvent, user));
      return;
    }
  }

  if (url.pathname === "/api/media" && req.method === "POST") {
    const user = await getRequestUser(req);
    const contentType = req.headers["content-type"] || "";
    if (contentType.includes("multipart/form-data")) {
      const upload = await readMultipartMedia(req, contentType);
      const saved = await saveMediaBuffer(upload.media, upload.bytes, user);
      sendJson(res, 201, await upsertAssetEvidence(saved, user, { requireRemote: true }));
      return;
    }
    const media = await readJson(req);
    const saved = await saveMedia(media, user);
    sendJson(res, 201, await upsertAssetEvidence(saved, user, { requireRemote: true }));
    return;
  }

  if (url.pathname === "/api/assets" && req.method === "GET") {
    const user = await getRequestUser(req);
    sendJson(res, 200, await listAssetEvidence(user));
    return;
  }

  if (url.pathname === "/api/assets/adopt" && req.method === "POST") {
    const user = await getRequestUser(req);
    const body = await readJson(req);
    sendJson(res, 200, await adoptAssetEvidenceForExperience(body, user));
    return;
  }

  if (url.pathname.startsWith("/api/assets/") && url.pathname.endsWith("/download") && req.method === "GET") {
    const user = await getRequestUser(req);
    const assetId = decodeURIComponent(url.pathname.replace("/api/assets/", "").replace("/download", ""));
    sendJson(res, 200, await getAssetEvidenceDownload(assetId, user));
    return;
  }

  if (url.pathname === "/api/upload-attempts" && req.method === "GET") {
    const user = await getRequestUser(req);
    const limit = Number(url.searchParams.get("limit") || 20);
    sendJson(res, 200, await listAssetUploadAttempts(user, limit));
    return;
  }

  if (url.pathname.startsWith("/api/assets/") && url.pathname.endsWith("/processing") && req.method === "PATCH") {
    const user = await getRequestUser(req);
    const assetId = decodeURIComponent(url.pathname.replace("/api/assets/", "").replace("/processing", ""));
    const body = await readJson(req);
    sendJson(res, 200, await updateAssetProcessing(assetId, body, user));
    return;
  }

  if (url.pathname === "/api/transcribe" && req.method === "POST") {
    await getRequestUser(req);
    const media = await readJson(req);
    sendJson(res, 200, await transcribeMedia(media));
    return;
  }

  if (url.pathname === "/api/extract-document" && req.method === "POST") {
    await getRequestUser(req);
    const media = await readJson(req);
    sendJson(res, 200, await extractDocumentText(media));
    return;
  }

  if (url.pathname === "/api/ocr-image" && req.method === "POST") {
    await getRequestUser(req);
    const media = await readJson(req);
    sendJson(res, 200, await ocrImage(media));
    return;
  }

  if (url.pathname === "/api/translate-text" && req.method === "POST") {
    await getRequestUser(req);
    const body = await readJson(req);
    sendJson(res, 200, await translateText(body));
    return;
  }

  if (url.pathname === "/api/search/semantic" && req.method === "POST") {
    const user = await getRequestUser(req);
    const body = await readJson(req);
    sendJson(res, 200, await semanticSearch(body.query || "", user, body.limit || 8));
    return;
  }

  if (url.pathname === "/api/embeddings/backfill" && req.method === "POST") {
    const user = await getRequestUser(req);
    const body = await readJson(req);
    sendJson(res, 200, await backfillEmbeddings(user, body.limit || 50));
    return;
  }

  if (url.pathname === "/api/workspace/backfill" && req.method === "POST") {
    const user = await getRequestUser(req);
    sendJson(res, 200, await backfillWorkspaceStructure(user));
    return;
  }

  if (url.pathname === "/api/jobs" && req.method === "GET") {
    await getRequestUser(req);
    sendJson(res, 200, { jobs: listJobs(), logs: await readLogs() });
    return;
  }

  if (url.pathname === "/api/sync/state" && req.method === "GET") {
    const user = await getRequestUser(req);
    sendJson(res, 200, await getServerSyncState(user));
    return;
  }

  if (url.pathname === "/api/supabase/diagnostics" && req.method === "GET") {
    const user = await getRequestUser(req);
    sendJson(res, 200, await runSupabaseDiagnostics(user));
    return;
  }

  if (url.pathname === "/api/supabase/self-test" && req.method === "POST") {
    const user = await getRequestUser(req);
    sendJson(res, 200, await runSupabaseSelfTest(user));
    return;
  }

  if (url.pathname === "/api/routines" && req.method === "GET") {
    const user = await getRequestUser(req);
    sendJson(res, 200, await listUserRoutines(user));
    return;
  }

  if (url.pathname === "/api/jobs/embeddings" && req.method === "POST") {
    const user = await getRequestUser(req);
    const body = await readJson(req);
    sendJson(res, 202, enqueueJob("embeddings-backfill", user, { limit: body.limit || 200 }));
    return;
  }

  if (url.pathname === "/api/jobs/asset-processing" && req.method === "POST") {
    const user = await getRequestUser(req);
    const body = await readJson(req);
    sendJson(res, 202, enqueueJob("asset-processing", user, body));
    return;
  }

  const routineMatch = url.pathname.match(/^\/api\/routines\/([^/]+)$/);
  if (routineMatch) {
    const user = await getRequestUser(req);
    const id = decodeURIComponent(routineMatch[1]);
    if (req.method === "PUT") {
      const body = await readJson(req);
      sendJson(res, 200, await updateUserRoutine(user, id, body));
      return;
    }
  }

  const routineRunMatch = url.pathname.match(/^\/api\/routines\/([^/]+)\/run$/);
  if (routineRunMatch && req.method === "POST") {
    const user = await getRequestUser(req);
    const id = decodeURIComponent(routineRunMatch[1]);
    sendJson(res, 202, await runUserRoutine(user, id, { manual: true }));
    return;
  }

  if (url.pathname === "/api/report/pdf" && req.method === "POST") {
    const user = await getOptionalRequestUser(req);
    const body = await readJson(req);
    sendPdf(res, await buildPdfReport(user, body.report));
    return;
  }

  if (url.pathname === "/api/insights/pdf" && req.method === "POST") {
    const user = await getOptionalRequestUser(req);
    const body = await readJson(req);
    sendPdf(res, await buildInsightsPdf(body, user), "hallazgos-experiencias.pdf");
    return;
  }

  if (url.pathname === "/api/publication/pdf" && req.method === "POST") {
    const user = await getOptionalRequestUser(req);
    const body = await readJson(req);
    sendPdf(res, await buildPublicationPdf(body, user), "publicacion-inteligente.pdf");
    return;
  }

  if (url.pathname === "/api/manual/pdf" && req.method === "POST") {
    const user = await getOptionalRequestUser(req);
    const body = await readJson(req);
    sendPdf(res, await buildManualPdf(body.html, user), "manual-vibe.pdf");
    return;
  }

  if (url.pathname === "/api/exports/file" && req.method === "POST") {
    const body = await readJson(req);
    sendJson(res, 201, await saveExportFile(body));
    return;
  }

  if (url.pathname === "/api/obsidian/export" && req.method === "POST") {
    const user = await getOptionalRequestUser(req);
    const body = await readJson(req);
    sendJson(res, 201, await saveObsidianExport(body, user));
    return;
  }

  if (url.pathname === "/api/context/impact" && req.method === "GET") {
    const location = url.searchParams.get("location") || DEFAULT_OPERATIONAL_LOCATION;
    const experienceType = url.searchParams.get("experienceType") || "auto";
    const user = await getOptionalRequestUser(req);
    const profile = await getProfile(user);
    const contextLabel = url.searchParams.get("label") || url.searchParams.get("contextLabel") || "";
    sendJson(res, 200, await getContextImpact(location, profile, experienceType, { contextLabel }));
    return;
  }

  if (url.pathname === "/api/daily-briefing" && req.method === "GET") {
    const location = url.searchParams.get("location") || DEFAULT_OPERATIONAL_LOCATION;
    const locale = url.searchParams.get("locale") || "es";
    const force = url.searchParams.get("force") === "1";
    const user = await getOptionalRequestUser(req);
    const contextLabel = url.searchParams.get("label") || url.searchParams.get("contextLabel") || "";
    sendJson(res, 200, await getDailyBriefing(location, locale, { user, force, contextLabel }));
    return;
  }

  if (url.pathname === "/api/daily-briefing/latest" && req.method === "GET") {
    const locale = url.searchParams.get("locale") || "";
    const user = await getRequestUser(req);
    sendJson(res, 200, await getLatestStoredDailyBriefing(user, locale));
    return;
  }

  const match = url.pathname.match(/^\/api\/experiences\/([^/]+)$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    const user = await getRequestUser(req);

    if (req.method === "PUT") {
      const body = await readJson(req);
      const normalized = normalizeExperience({ ...body, id });
      sendJson(res, 200, await upsertExperience(normalized, user));
      return;
    }

    if (req.method === "DELETE") {
      await deleteExperienceRecord(id, user);
      sendJson(res, 200, { ok: true });
      return;
    }
  }

  const agendaMatch = url.pathname.match(/^\/api\/agenda\/([^/]+)$/);
  if (agendaMatch) {
    const id = decodeURIComponent(agendaMatch[1]);
    const user = await getRequestUser(req);
    if (req.method === "PUT") {
      const body = await readJson(req);
      sendJson(res, 200, await upsertAgendaEvent({ ...body, id }, user));
      return;
    }
    if (req.method === "DELETE") {
      await deleteAgendaEvent(id, user);
      sendJson(res, 200, { ok: true });
      return;
    }
  }

  sendJson(res, 404, { error: "not_found" });
}

async function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!existsSync(envPath)) return;
  const raw = await readFile(envPath, "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function serveStatic(req, res, pathname) {
  if (pathname === "/applink/meta") {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vibeapp</title></head><body><h1>Vibeapp</h1><p>Este enlace abre Vibeapp cuando la aplicacion nativa esta instalada.</p></body></html>`);
    return;
  }
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(__dirname, safePath);

  if (!filePath.startsWith(__dirname) || !existsSync(filePath)) {
    sendText(res, 404, "Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = path.basename(filePath) === "apple-app-site-association"
    ? "application/json; charset=utf-8"
    : mimeTypes[ext] || "application/octet-stream";
  const content = await readFile(filePath);
  const acceptsGzip = /\bgzip\b/.test(req.headers["accept-encoding"] || "");
  const compressible = /^(text\/|application\/javascript|application\/json|application\/manifest\+json)/.test(contentType);
  const body = acceptsGzip && compressible && content.length > 1024 ? gzipSync(content) : content;
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    ...(body !== content ? { "Content-Encoding": "gzip", "Vary": "Accept-Encoding" } : {}),
  });
  res.end(body);
}

function buildIntegrationContract() {
  return {
    schemaVersion: INTEGRATION_CONTRACT_VERSION,
    validationEndpoint: "/api/integration/validate",
    ingestionEndpoint: "/api/integration/ingest",
    samplesEndpoint: "/api/integration/samples",
    requiredFields: ["sourceId", "sourceType", "capturedAt", "participantId", "payloadType", "payload"],
    optionalFields: ["location", "deviceMetadata", "confidence", "privacyLevel", "linkedExperienceId", "permissions", "checksum"],
    allowedSourceTypes: [
      "mobile",
      "wearable",
      "file_import",
      "api",
      "calendar",
      "voice",
      "manual",
      "vibeapp-native",
      "vibeapp-native-image",
      "vibeapp-native-video",
      "vibeapp-native-audio",
      "vibeapp-native-document",
      "external-session",
      "apple-healthkit-native",
      "android-health-connect",
      "oura-api-v2",
      "meta-wearables-device-access",
    ],
    allowedPayloadTypes: ["biometric", "location", "media", "image", "audio", "video", "document", "activity", "sleep", "text", "calendar", "context"],
    targets: {
      media: "assets",
      image: "assets",
      audio: "assets",
      video: "assets",
      document: "assets",
      calendar: "agenda",
      biometric: "context",
      activity: "context",
      sleep: "context",
      location: "context",
      text: "experience",
      context: "context",
    },
    rules: [
      "Validate before ingesting.",
      "Ingest through /api/integration/ingest only after validation passes.",
      "Do not write directly to reports.",
      "Keep original files private and store derived analysis separately.",
      "Use stable sourceId or idempotencyKey for retries.",
    ],
  };
}

function buildIntegrationSampleKit(now = new Date().toISOString()) {
  const samples = buildIntegrationSampleSignals(now);
  return {
    schemaVersion: INTEGRATION_CONTRACT_VERSION,
    generatedAt: now,
    purpose: "Reusable normalized payloads for testing Vibeapp, external devices, wearable files, and service connectors before real ingestion.",
    validationEndpoint: "/api/integration/validate",
    rule: "Every connector must validate a payload, keep a stable idempotencyKey, and write to the expected target: experience, assets, agenda, or context.",
    samples,
  };
}

function buildIntegrationSampleSignals(now = new Date().toISOString()) {
  return [
    ...buildVibeappSimulationSamples(now).map((sample) => ({
      ...sample,
      family: "vibeapp-native",
      connectorStatus: "ready-for-native-pilot",
    })),
    {
      name: "meta-glasses-media-import",
      label: "Meta/Oakley glasses media import",
      family: "meta-glasses",
      connectorStatus: "manual-import-now-native-bridge-later",
      expectedTarget: "assets",
      signal: {
        sourceId: "meta-oakley-session-001",
        sourceType: "external-session",
        capturedAt: now,
        participantId: "miguel",
        payloadType: "media",
        privacyLevel: "private",
        linkedExperienceId: "exp-trip-001",
        idempotencyKey: "meta-oakley:session:001",
        payload: {
          provider: "Meta AI glasses",
          importRoute: "Meta AI app -> phone photo library -> Vibeapp/PWA upload",
          files: [
            { fileName: "bridge-photo.heic", mimeType: "image/heic", storageObjectHint: "meta-oakley-001.heic" },
            { fileName: "bridge-clip.mp4", mimeType: "video/mp4", storageObjectHint: "meta-oakley-001.mp4" },
          ],
        },
        deviceMetadata: {
          deviceFamily: "Oakley Meta / Ray-Ban Meta",
          captureMode: "autocapture-or-manual",
          limitations: ["No official CSV media export", "JSON/HTML export is account/activity metadata, not the media transport"],
        },
      },
    },
    {
      name: "oura-biometric-daily",
      label: "Oura biometric day",
      family: "oura",
      connectorStatus: "csv-or-api-json-ready",
      expectedTarget: "context",
      signal: {
        sourceId: "oura-daily-2026-05-28",
        sourceType: "external-session",
        capturedAt: now,
        participantId: "miguel",
        payloadType: "biometric",
        privacyLevel: "sensitive",
        idempotencyKey: "oura:daily:2026-05-28:miguel",
        payload: {
          provider: "Oura",
          importRoute: "CSV export or Oura API JSON",
          metrics: {
            readinessScore: 78,
            sleepScore: 81,
            restingHeartRate: 58,
            hrvMs: 42,
            temperatureDeviationC: 0.1,
          },
        },
        deviceMetadata: {
          deviceFamily: "Oura Ring",
          supportedRoutes: ["csv", "api-json", "apple-health", "health-connect"],
        },
      },
    },
    {
      name: "apple-health-workout",
      label: "Apple Health file import",
      family: "apple-health",
      connectorStatus: "file-import-ready-native-healthkit-later",
      expectedTarget: "context",
      signal: {
        sourceId: "apple-health-workout-001",
        sourceType: "file_import",
        capturedAt: now,
        participantId: "miguel",
        payloadType: "activity",
        privacyLevel: "sensitive",
        idempotencyKey: "apple-health:activity:001",
        payload: {
          provider: "Apple Health",
          importRoute: "CSV/JSON file now; HealthKit in native iOS later",
          metrics: { steps: 8420, activeEnergyKcal: 512, workoutMinutes: 42 },
        },
        deviceMetadata: { platform: "ios", nativeFutureApi: "HealthKit" },
      },
    },
    {
      name: "samsung-health-sleep",
      label: "Samsung Health file import",
      family: "samsung-health",
      connectorStatus: "file-import-ready-health-connect-later",
      expectedTarget: "context",
      signal: {
        sourceId: "samsung-health-sleep-001",
        sourceType: "file_import",
        capturedAt: now,
        participantId: "miguel",
        payloadType: "sleep",
        privacyLevel: "sensitive",
        idempotencyKey: "samsung-health:sleep:001",
        payload: {
          provider: "Samsung Health",
          importRoute: "Exported file now; Android Health Connect/native bridge later",
          metrics: { sleepMinutes: 421, deepSleepMinutes: 74, wakeEvents: 3 },
        },
        deviceMetadata: { platform: "android", nativeFutureApi: "Health Connect" },
      },
    },
    {
      name: "health-connect-activity",
      label: "Android Health Connect activity",
      family: "health-connect",
      connectorStatus: "native-connector-planned",
      expectedTarget: "context",
      signal: {
        sourceId: "health-connect-activity-001",
        sourceType: "external-session",
        capturedAt: now,
        participantId: "miguel",
        payloadType: "activity",
        privacyLevel: "sensitive",
        idempotencyKey: "health-connect:activity:001",
        payload: {
          provider: "Android Health Connect",
          importRoute: "Vibeapp native connector",
          metrics: { steps: 6200, distanceKm: 4.3, heartRateAvg: 92 },
        },
        deviceMetadata: { platform: "android", nativeFutureApi: "Health Connect" },
      },
    },
    {
      name: "calendar-event-import",
      label: "Calendar event",
      family: "calendar",
      connectorStatus: "contract-ready",
      expectedTarget: "agenda",
      signal: {
        sourceId: "calendar-dinner-001",
        sourceType: "calendar",
        capturedAt: now,
        participantId: "miguel",
        payloadType: "calendar",
        privacyLevel: "private",
        idempotencyKey: "calendar:event:dinner-001",
        payload: {
          title: "Cena",
          location: "Casa",
          startAt: "2026-05-28T20:00:00.000-04:00",
          sourceCalendar: "manual-or-native-calendar",
        },
        deviceMetadata: { route: "agenda" },
      },
    },
  ];
}

function buildOuraConnectorManifest() {
  const dataTypes = [
    {
      dataType: "daily_readiness",
      route: "/v2/usercollection/daily_readiness",
      target: "context",
      payloadType: "biometric",
      metrics: ["score", "temperature_deviation", "temperature_trend_deviation", "contributors"],
      scopes: ["daily"],
    },
    {
      dataType: "daily_sleep",
      route: "/v2/usercollection/daily_sleep",
      target: "context",
      payloadType: "sleep",
      metrics: ["score", "contributors"],
      scopes: ["daily"],
    },
    {
      dataType: "sleep",
      route: "/v2/usercollection/sleep",
      target: "context",
      payloadType: "sleep",
      metrics: ["period", "sleep phases", "heart_rate", "hrv"],
      scopes: ["daily"],
    },
    {
      dataType: "daily_activity",
      route: "/v2/usercollection/daily_activity",
      target: "context",
      payloadType: "activity",
      metrics: ["score", "steps", "active_calories", "total_calories", "inactivity_alerts", "contributors"],
      scopes: ["daily"],
    },
    {
      dataType: "daily_stress",
      route: "/v2/usercollection/daily_stress",
      target: "context",
      payloadType: "biometric",
      metrics: ["stress_high", "recovery_high", "day_summary"],
      scopes: ["daily"],
    },
    {
      dataType: "daily_resilience",
      route: "/v2/usercollection/daily_resilience",
      target: "context",
      payloadType: "biometric",
      metrics: ["level", "contributors.sleep_recovery", "contributors.daytime_recovery", "contributors.stress"],
      scopes: ["daily"],
    },
    {
      dataType: "daily_spo2",
      route: "/v2/usercollection/daily_spo2",
      target: "context",
      payloadType: "biometric",
      metrics: ["spo2_percentage", "breathing_disturbance_index"],
      scopes: ["spo2"],
    },
    {
      dataType: "heartrate",
      route: "/v2/usercollection/heartrate",
      target: "context",
      payloadType: "biometric",
      metrics: ["timestamp", "bpm", "source"],
      scopes: ["heartrate"],
      queryMode: "datetime",
    },
    {
      dataType: "workout",
      route: "/v2/usercollection/workout",
      target: "context",
      payloadType: "activity",
      metrics: ["activity", "calories", "distance", "intensity", "start_datetime", "end_datetime"],
      scopes: ["workout"],
    },
    {
      dataType: "daily_cardiovascular_age",
      route: "/v2/usercollection/daily_cardiovascular_age",
      target: "context",
      payloadType: "biometric",
      metrics: ["vascular_age", "pulse_wave_velocity"],
      scopes: ["daily"],
    },
    {
      dataType: "vo2_max",
      route: "/v2/usercollection/vO2_max",
      target: "context",
      payloadType: "biometric",
      metrics: ["vo2_max"],
      scopes: ["daily"],
    },
    {
      dataType: "ring_battery_level",
      route: "/v2/usercollection/ring_battery_level",
      target: "context",
      payloadType: "context",
      metrics: ["level", "charging", "in_charger"],
      scopes: ["daily"],
    },
  ];
  return {
    schemaVersion: INTEGRATION_CONTRACT_VERSION,
    connector: "oura-api-v2",
    source: "openapi-1.30.json",
    apiBaseUrl: OURA_API_BASE_URL,
    auth: {
      recommended: "oauth2-authorization-code",
      supported: ["oauth2", "bearer-token"],
      personalAccessTokenStatus: "deprecated-not-for-product",
      tokenStorage: "backend-only",
      requiredEnvironment: ["OURA_CLIENT_ID", "OURA_CLIENT_SECRET", "OURA_REDIRECT_URI"],
    },
    syncModes: {
      now: ["csv-json-file-import", "backend-normalize", "oauth-status", "oauth-connect", "oauth-manual-sync", "device-connector-selftest"],
      next: ["daily-background-job", "paginated-api-sync"],
      later: ["provider-webhook-subscription"],
    },
    endpoints: {
      manifest: "/api/integration/oura/manifest",
      status: "/api/integration/oura/status",
      connect: "/api/integration/oura/connect",
      connectUrl: "/api/integration/oura/connect-url",
      callback: "/api/integration/oura/callback",
      sync: "/api/integration/oura/sync",
      webhook: "/api/integration/oura/webhook",
      normalize: "/api/integration/oura/normalize",
      selftest: "/api/integration/device/selftest",
    },
    privacyLevel: "sensitive",
    dataTypes,
    webhookDataTypes: [
      "tag",
      "enhanced_tag",
      "workout",
      "session",
      "sleep",
      "daily_sleep",
      "daily_readiness",
      "daily_activity",
      "daily_spo2",
      "sleep_time",
      "rest_mode_period",
      "ring_configuration",
      "daily_stress",
      "daily_cardiovascular_age",
      "daily_resilience",
      "vo2_max",
      "period_start",
      "pregnancy",
      "fertile_window",
      "ovulation_confirmed",
      "blood_glucose",
      "meal",
    ],
  };
}

function getOuraDocumentDate(document = {}) {
  return document.day || document.timestamp || document.start_datetime || document.end_datetime || document.datetime || new Date().toISOString();
}

function pickOuraMetrics(dataType, document = {}) {
  const contributors = document.contributors || {};
  if (dataType === "daily_readiness") {
    return {
      readinessScore: document.score ?? null,
      temperatureDeviationC: document.temperature_deviation ?? null,
      temperatureTrendDeviationC: document.temperature_trend_deviation ?? null,
      contributors,
    };
  }
  if (dataType === "daily_sleep" || dataType === "sleep") {
    return {
      sleepScore: document.score ?? null,
      sleepDay: document.day || null,
      contributors,
      bedtimeStart: document.bedtime_start || document.start_datetime || null,
      bedtimeEnd: document.bedtime_end || document.end_datetime || null,
      totalSleepDuration: document.total_sleep_duration ?? document.total_sleep ?? null,
    };
  }
  if (dataType === "daily_activity") {
    return {
      activityScore: document.score ?? null,
      steps: document.steps ?? null,
      activeCalories: document.active_calories ?? null,
      totalCalories: document.total_calories ?? null,
      equivalentWalkingDistance: document.equivalent_walking_distance ?? null,
      inactivityAlerts: document.inactivity_alerts ?? null,
      contributors,
    };
  }
  if (dataType === "daily_stress") {
    return {
      stressHighSeconds: document.stress_high ?? null,
      recoveryHighSeconds: document.recovery_high ?? null,
      daySummary: document.day_summary ?? null,
    };
  }
  if (dataType === "daily_resilience") {
    return {
      resilienceLevel: document.level ?? null,
      contributors,
    };
  }
  if (dataType === "daily_spo2") {
    return {
      breathingDisturbanceIndex: document.breathing_disturbance_index ?? null,
      spo2Percentage: document.spo2_percentage ?? null,
    };
  }
  if (dataType === "heartrate" || dataType === "heart_rate") {
    return {
      bpm: document.bpm ?? null,
      source: document.source ?? null,
      timestamp: document.timestamp ?? null,
    };
  }
  if (dataType === "workout") {
    return {
      activity: document.activity ?? null,
      calories: document.calories ?? null,
      distanceMeters: document.distance ?? null,
      intensity: document.intensity ?? null,
      startAt: document.start_datetime ?? null,
      endAt: document.end_datetime ?? null,
      source: document.source ?? null,
    };
  }
  if (dataType === "daily_cardiovascular_age") {
    return {
      vascularAge: document.vascular_age ?? null,
      pulseWaveVelocity: document.pulse_wave_velocity ?? null,
    };
  }
  if (dataType === "vo2_max") {
    return {
      vo2Max: document.vo2_max ?? null,
    };
  }
  if (dataType === "ring_battery_level") {
    return {
      batteryLevel: document.level ?? null,
      charging: document.charging ?? null,
      inCharger: document.in_charger ?? null,
    };
  }
  return { raw: document };
}

function buildOuraSignal({ dataType = "daily_readiness", document = {}, participantId = "miguel", user = null } = {}) {
  const manifest = buildOuraConnectorManifest();
  const dataTypeConfig = manifest.dataTypes.find((item) => item.dataType === dataType) || {
    dataType,
    target: "context",
    payloadType: "biometric",
    route: "/v2/usercollection",
  };
  const capturedAt = getOuraDocumentDate(document);
  const documentId = document.id || `${dataType}-${capturedAt}`;
  return {
    sourceId: `oura-${dataType}-${documentId}`,
    sourceType: "wearable",
    capturedAt,
    participantId: participantId || user?.id || LOCAL_USER_ID,
    payloadType: dataTypeConfig.payloadType,
    privacyLevel: "sensitive",
    idempotencyKey: `oura:${dataType}:${documentId}:${participantId || user?.id || LOCAL_USER_ID}`,
    payload: {
      provider: "Oura",
      apiVersion: "v2",
      dataType,
      route: dataTypeConfig.route,
      metrics: pickOuraMetrics(dataType, document),
      originalDocumentId: document.id || null,
      originalDay: document.day || null,
    },
    deviceMetadata: {
      deviceFamily: "Oura Ring",
      connector: manifest.connector,
      apiBaseUrl: manifest.apiBaseUrl,
      syncMode: "backend-normalize",
      scopes: dataTypeConfig.scopes || [],
    },
  };
}

function normalizeOuraPayload(body = {}, user = null) {
  const documents = Array.isArray(body.documents)
    ? body.documents
    : Array.isArray(body.data)
      ? body.data
      : [body.document || body.data || body];
  const dataType = String(body.dataType || body.type || "daily_readiness").trim();
  const participantId = String(body.participantId || body.pilotParticipantId || "miguel").trim();
  const results = documents
    .filter((document) => document && typeof document === "object")
    .map((document) => {
      const signal = buildOuraSignal({ dataType, document, participantId, user });
      return validateIntegrationSignal(signal, user);
    });
  return {
    ok: results.length > 0 && results.every((item) => item.ok),
    connector: "oura-api-v2",
    schemaVersion: INTEGRATION_CONTRACT_VERSION,
    dataType,
    count: results.length,
    targetSummary: results.reduce((acc, item) => {
      acc[item.target] = (acc[item.target] || 0) + 1;
      return acc;
    }, {}),
    results,
  };
}

function getOuraRequiredScopes(dataTypes = buildOuraConnectorManifest().dataTypes) {
  if (OURA_SCOPES.length) return [...new Set(OURA_SCOPES)].sort();
  return [...new Set(dataTypes.flatMap((item) => item.scopes || []))].filter(Boolean).sort();
}

function getOuraAuthorizeScopes() {
  if (OURA_SCOPES.length) return [...new Set(OURA_SCOPES)].sort();
  if (OURA_AUTHORIZE_SCOPE_MODE === "full") return getOuraRequiredScopes();
  return ["daily", "heartrate", "workout"].sort();
}

function buildOuraOAuthDiagnostics() {
  const requiredScopes = getOuraRequiredScopes();
  const authorizeScopes = getOuraAuthorizeScopes();
  let redirectHost = "";
  let redirectPath = "";
  let redirectValid = false;
  try {
    const redirectUrl = new URL(OURA_REDIRECT_URI);
    redirectHost = redirectUrl.host;
    redirectPath = redirectUrl.pathname;
    redirectValid = redirectUrl.protocol === "https:" && redirectPath === "/api/integration/oura/callback";
  } catch {
    redirectValid = false;
  }
  return {
    authBaseUrl: OURA_AUTH_BASE_URL,
    apiBaseUrl: OURA_API_BASE_URL,
    redirectUri: OURA_REDIRECT_URI,
    redirectHost,
    redirectPath,
    redirectValid,
    requiredScopes,
    authorizeScopes,
    scopes: authorizeScopes,
    scopesSource: OURA_SCOPES.length ? "OURA_SCOPES" : OURA_AUTHORIZE_SCOPE_MODE,
    authorizeRedirectMode: OURA_AUTHORIZE_REDIRECT_MODE === "registered" ? "registered" : "explicit",
    tokenAuthMode: OURA_TOKEN_AUTH_MODE === "basic" ? "basic" : "body",
    tokenExchangeFallback: OURA_TOKEN_EXCHANGE_FALLBACK,
    clientIdPresent: Boolean(OURA_CLIENT_ID),
    clientIdSuffix: OURA_CLIENT_ID ? OURA_CLIENT_ID.slice(-6) : "",
    expectedRedirectUri: "https://experience-hub-web-production.up.railway.app/api/integration/oura/callback",
  };
}

function getOuraMissingConfig() {
  return [
    ["OURA_CLIENT_ID", OURA_CLIENT_ID],
    ["OURA_CLIENT_SECRET", OURA_CLIENT_SECRET],
    ["OURA_REDIRECT_URI", OURA_REDIRECT_URI],
    ["OURA_TOKEN_ENCRYPTION_SECRET", OURA_TOKEN_ENCRYPTION_SECRET],
  ].filter(([, value]) => !value).map(([key]) => key);
}

function isOuraOAuthConfigured() {
  return getOuraMissingConfig().length === 0;
}

async function readOuraTokenStore() {
  await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(OURA_TOKEN_STORE_PATH)) return { tokens: {}, states: {} };
  try {
    return { tokens: {}, states: {}, ...JSON.parse(await readFile(OURA_TOKEN_STORE_PATH, "utf-8")) };
  } catch {
    return { tokens: {}, states: {} };
  }
}

async function writeOuraTokenStore(store) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OURA_TOKEN_STORE_PATH, JSON.stringify({
    tokens: store.tokens || {},
    states: store.states || {},
    connectionResults: store.connectionResults || {},
  }, null, 2), "utf-8");
}

function getOuraTokenCipherKey() {
  if (!OURA_TOKEN_ENCRYPTION_SECRET) throw new HttpError(503, "oura_token_secret_missing");
  return createHash("sha256").update(OURA_TOKEN_ENCRYPTION_SECRET).digest();
}

function encryptOuraTokenPayload(payload) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getOuraTokenCipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    value: encrypted.toString("base64"),
  };
}

function decryptOuraTokenPayload(record = {}) {
  const decipher = createDecipheriv("aes-256-gcm", getOuraTokenCipherKey(), Buffer.from(record.iv || "", "base64"));
  decipher.setAuthTag(Buffer.from(record.tag || "", "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(record.value || "", "base64")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8"));
}

async function getStoredOuraTokens(userId) {
  const store = await readOuraTokenStore();
  const record = store.tokens?.[userId];
  if (!record?.value) return null;
  return decryptOuraTokenPayload(record);
}

async function storeOuraTokens(userId, tokenPayload = {}) {
  const store = await readOuraTokenStore();
  const now = Date.now();
  const expiresIn = Number(tokenPayload.expires_in || tokenPayload.expiresIn || 0);
  const tokens = {
    access_token: tokenPayload.access_token,
    refresh_token: tokenPayload.refresh_token,
    token_type: tokenPayload.token_type || "Bearer",
    scope: tokenPayload.scope || "",
    expires_at: expiresIn ? new Date(now + expiresIn * 1000).toISOString() : tokenPayload.expires_at || null,
    saved_at: new Date(now).toISOString(),
  };
  store.tokens[userId] = encryptOuraTokenPayload(tokens);
  await writeOuraTokenStore(store);
  return { ...tokens, access_token: "stored", refresh_token: tokens.refresh_token ? "stored" : "" };
}

function summarizeOuraConnectionError(error = {}, fallbackMessage = "") {
  const detail = error.detail || {};
  const firstAttempt = Array.isArray(detail.attempts) ? detail.attempts[0] : null;
  const providerDetail = firstAttempt?.detail || detail;
  const providerError = providerDetail?.error || providerDetail?.message || error.message || "";
  const providerDescription = providerDetail?.error_description || providerDetail?.errorDescription || "";
  const status = firstAttempt?.status || error.statusCode || detail.status || 0;
  const detailCode = providerDetail?.error || error.message || "oura_connection_failed";
  const message = fallbackMessage
    || providerDescription
    || providerError
    || "Oura no completo la conexion.";
  return {
    ok: false,
    status: status ? String(status) : "",
    detailCode: String(detailCode).slice(0, 120),
    message: String(message).slice(0, 240),
    checkedAt: new Date().toISOString(),
    tokenAuthMode: OURA_TOKEN_AUTH_MODE === "basic" ? "basic" : "body",
    authorizeRedirectMode: OURA_AUTHORIZE_REDIRECT_MODE === "registered" ? "registered" : "explicit",
  };
}

async function rememberOuraConnectionResult(userId, result = {}) {
  if (!userId) return;
  const store = await readOuraTokenStore();
  store.connectionResults = store.connectionResults || {};
  store.connectionResults[userId] = {
    ok: Boolean(result.ok),
    status: result.status || "",
    detailCode: result.detailCode || "",
    message: result.message || "",
    checkedAt: result.checkedAt || new Date().toISOString(),
    tokenAuthMode: result.tokenAuthMode || (OURA_TOKEN_AUTH_MODE === "basic" ? "basic" : "body"),
    authorizeRedirectMode: result.authorizeRedirectMode || (OURA_AUTHORIZE_REDIRECT_MODE === "registered" ? "registered" : "explicit"),
  };
  await writeOuraTokenStore(store);
}

async function getStoredOuraConnectionResult(userId) {
  const store = await readOuraTokenStore();
  return store.connectionResults?.[userId] || null;
}

async function rememberOuraOAuthState(state, user, returnTo = "", metadata = {}) {
  const store = await readOuraTokenStore();
  store.states[state] = {
    userId: user.id,
    email: user.email || "",
    returnTo,
    metadata,
    createdAt: new Date().toISOString(),
  };
  const cutoff = Date.now() - 20 * 60 * 1000;
  Object.entries(store.states).forEach(([key, value]) => {
    if (Date.parse(value.createdAt || "") < cutoff) delete store.states[key];
  });
  await writeOuraTokenStore(store);
}

async function consumeOuraOAuthState(state) {
  const store = await readOuraTokenStore();
  const value = store.states?.[state];
  if (value) delete store.states[state];
  await writeOuraTokenStore(store);
  if (!value) throw new HttpError(400, "oura_oauth_state_invalid_or_expired");
  return value;
}

async function getOuraConnectionStatus(user = { id: LOCAL_USER_ID }) {
  const missingConfig = getOuraMissingConfig();
  let connected = false;
  let tokenSavedAt = "";
  let tokenExpiresAt = "";
  if (!missingConfig.includes("OURA_TOKEN_ENCRYPTION_SECRET")) {
    try {
      const tokens = await getStoredOuraTokens(user.id);
      connected = Boolean(tokens?.access_token);
      tokenSavedAt = tokens?.saved_at || "";
      tokenExpiresAt = tokens?.expires_at || "";
    } catch {
      connected = false;
    }
  }
  const manifest = buildOuraConnectorManifest();
  const lastConnection = await getStoredOuraConnectionResult(user.id);
  return {
    ok: missingConfig.length === 0,
    connector: manifest.connector,
    connected,
    configured: missingConfig.length === 0,
    missingConfig,
    personalAccessTokenStatus: manifest.auth.personalAccessTokenStatus,
    requiredScopes: getOuraRequiredScopes(),
    oauthDiagnostics: buildOuraOAuthDiagnostics(),
    dataTypes: manifest.dataTypes.map((item) => item.dataType),
    tokenSavedAt,
    tokenExpiresAt,
    lastConnection,
    nextAction: missingConfig.length
      ? `Define ${missingConfig.join(", ")} en el backend/Railway.`
      : connected
        ? "Puedes ejecutar sincronizacion Oura."
        : lastConnection?.message
          ? `Ultimo intento Oura: ${lastConnection.message}`
          : "Conecta Oura con OAuth desde /api/integration/oura/connect.",
  };
}

async function startOuraOAuthFlow(req, res, url, user) {
  const payload = await createOuraOAuthUrl(url, user);
  res.writeHead(302, { Location: payload.authUrl });
  res.end();
}

async function startOuraDiagnosticFlow(req, res, url) {
  const payload = await createOuraDiagnosticOAuthUrl(url);
  res.writeHead(302, { Location: payload.authUrl });
  res.end();
}

async function buildOuraPublicPreflight(url) {
  const missingConfig = getOuraMissingConfig();
  const oauthDiagnostics = buildOuraOAuthDiagnostics();
  const payload = {
    ok: missingConfig.length === 0 && oauthDiagnostics.redirectValid,
    configured: missingConfig.length === 0,
    missingConfig,
    oauthDiagnostics,
    tokenExchange: "not_run_without_vibe_session",
    nextAction: missingConfig.length
      ? `Define ${missingConfig.join(", ")} en Railway.`
      : "Abre diagnosticConnectUrl para probar Oura sin sesion Supabase. Esto no conecta la cuenta.",
  };
  if (payload.ok) {
    const diagnostic = await createOuraDiagnosticOAuthUrl(url);
    payload.diagnosticConnectUrl = diagnostic.diagnosticConnectUrl;
    payload.authUrlHost = new URL(diagnostic.authUrl).host;
  }
  return payload;
}

async function createOuraOAuthUrl(url, user) {
  const missingConfig = getOuraMissingConfig();
  if (missingConfig.length) {
    throw new HttpError(503, "oura_oauth_not_configured", {
      missingConfig,
      message: `Oura requiere OAuth en backend. Faltan: ${missingConfig.join(", ")}.`,
    });
  }
  const oauthDiagnostics = buildOuraOAuthDiagnostics();
  if (!oauthDiagnostics.redirectValid) {
    throw new HttpError(503, "oura_redirect_uri_invalid", {
      message: "La URL de retorno Oura no coincide con el formato seguro esperado.",
      redirectUri: oauthDiagnostics.redirectUri,
      expectedRedirectUri: oauthDiagnostics.expectedRedirectUri,
    });
  }
  const state = randomUUID();
  const includeRedirectUri = oauthDiagnostics.authorizeRedirectMode === "explicit";
  await rememberOuraOAuthState(state, user, url.searchParams.get("returnTo") || "", {
    includeRedirectUri,
    authorizeScopes: oauthDiagnostics.authorizeScopes,
  });
  const authUrl = new URL("/oauth/authorize", OURA_AUTH_BASE_URL);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", OURA_CLIENT_ID);
  if (includeRedirectUri) authUrl.searchParams.set("redirect_uri", OURA_REDIRECT_URI);
  authUrl.searchParams.set("scope", oauthDiagnostics.authorizeScopes.join(" "));
  authUrl.searchParams.set("state", state);
  return {
    ok: true,
    connector: "oura-api-v2",
    authUrl: authUrl.toString(),
    oauthDiagnostics,
    expiresInSeconds: 20 * 60,
    message: "Abriendo autorizacion segura de Oura.",
  };
}

async function createOuraDiagnosticOAuthUrl(url) {
  const user = {
    id: "oura-diagnostic",
    email: "diagnostic@vibe.local",
  };
  const returnTo = url.searchParams.get("returnTo") || "/index.html?view=dashboard";
  const payload = await createOuraOAuthUrl(url, user);
  const state = new URL(payload.authUrl).searchParams.get("state") || "";
  const store = await readOuraTokenStore();
  if (store.states?.[state]) {
    store.states[state].returnTo = returnTo;
    store.states[state].metadata = {
      ...(store.states[state].metadata || {}),
      diagnostic: true,
    };
    await writeOuraTokenStore(store);
  }
  return {
    ...payload,
    diagnostic: true,
    diagnosticConnectUrl: `/api/integration/oura/diagnostic-connect?returnTo=${encodeURIComponent(returnTo)}`,
    message: "Diagnostico Oura sin sesion Supabase. No conecta ni guarda tokens.",
  };
}

async function completeOuraOAuthFlow(req, res, url) {
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");
  if (error) {
    let savedState = null;
    try {
      savedState = state ? await consumeOuraOAuthState(state) : null;
    } catch {
      savedState = null;
    }
    const summary = summarizeOuraConnectionError({
      message: error,
      detail: {
        error,
        error_description: url.searchParams.get("error_description") || "",
      },
    }, url.searchParams.get("error_description") || "Oura cancelo o rechazo la autorizacion.");
    if (savedState?.userId) await rememberOuraConnectionResult(savedState.userId, summary);
    redirectOuraConnectionResult(req, res, savedState?.returnTo, "oauth-error", summary);
    return;
  }
  const code = url.searchParams.get("code");
  if (!code || !state) {
    const summary = summarizeOuraConnectionError({
      message: "oura_oauth_code_or_state_missing",
      detail: { error: "callback_incompleto" },
    }, "Oura regreso sin codigo o sin estado de seguridad. Inicia la conexion nuevamente desde Vibe.");
    redirectOuraConnectionResult(req, res, "", "callback-error", summary);
    return;
  }
  const savedState = await consumeOuraOAuthState(state);
  if (savedState.metadata?.diagnostic) {
    await appendLog("info", "oura_oauth_diagnostic_return", {
      stateUser: savedState.userId,
      email: savedState.email,
    });
    redirectOuraConnectionResult(req, res, savedState.returnTo, "diagnostic-ok", {
      ok: true,
      detailCode: "diagnostic_redirect_ok",
      message: "Oura abrio y regreso correctamente. Diagnostico externo OK; no se conecto la cuenta.",
    });
    return;
  }
  const tokenRequest = {
    grant_type: "authorization_code",
    code,
  };
  let tokens;
  try {
    tokens = await exchangeOuraAuthorizationCode(tokenRequest, savedState);
  } catch (error) {
    const summary = summarizeOuraConnectionError(error, "Oura no completo la conexion. Revisa Client ID, Client Secret y Redirect URI en Railway/Oura.");
    await rememberOuraConnectionResult(savedState.userId, summary);
    redirectOuraConnectionResult(req, res, savedState.returnTo, "token-error", summary);
    return;
  }
  const saved = await storeOuraTokens(savedState.userId, tokens);
  await rememberOuraConnectionResult(savedState.userId, {
    ok: true,
    status: "connected",
    detailCode: "connected",
    message: "Oura quedo conectado correctamente.",
    checkedAt: new Date().toISOString(),
  });
  await appendLog("info", "oura_oauth_connected", {
    userId: savedState.userId,
    scope: saved.scope,
    expiresAt: saved.expires_at,
  });
  const returnUrl = savedState.returnTo || "/index.html?view=dashboard&integration=oura&status=connected";
  redirectOuraConnectionResult(req, res, returnUrl, "connected", {
    ok: true,
    detailCode: "connected",
    message: "Oura quedo conectado correctamente.",
  });
}

function redirectOuraConnectionResult(req, res, returnTo = "", status = "", result = {}) {
  const baseUrl = `http://${req.headers.host || "localhost"}`;
  const returnPath = returnTo || "/index.html?view=dashboard";
  const callbackUrl = new URL(returnPath, baseUrl);
  callbackUrl.searchParams.set("integration", "oura");
  callbackUrl.searchParams.set("status", status || (result.ok ? "connected" : "error"));
  callbackUrl.searchParams.set("message", result.message || "");
  if (result.detailCode) callbackUrl.searchParams.set("detail", result.detailCode);
  res.writeHead(302, { Location: `${callbackUrl.pathname}${callbackUrl.search}` });
  res.end();
}

async function exchangeOuraToken(params = {}, options = {}) {
  const payload = Object.entries(params).reduce((acc, [key, value]) => {
    if (value !== null && value !== undefined && value !== "") acc[key] = String(value);
    return acc;
  }, {});
  const useBasicAuth = (options.authMode || OURA_TOKEN_AUTH_MODE) !== "body";
  if (!useBasicAuth) {
    payload.client_id = OURA_CLIENT_ID;
    payload.client_secret = OURA_CLIENT_SECRET;
  }
  const body = new URLSearchParams(payload);
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  if (useBasicAuth) {
    headers.Authorization = `Basic ${Buffer.from(`${OURA_CLIENT_ID}:${OURA_CLIENT_SECRET}`, "utf8").toString("base64")}`;
  }
  const tokenBaseUrl = (options.tokenBaseUrl || OURA_API_BASE_URL).replace(/\/$/, "");
  const response = await fetch(`${tokenBaseUrl}/oauth/token`, {
    method: "POST",
    headers,
    body,
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new HttpError(response.status, "oura_token_exchange_failed", data);
  }
  return data;
}

async function exchangeOuraAuthorizationCode(baseRequest = {}, savedState = {}) {
  const includeRedirectUri = savedState.metadata?.includeRedirectUri !== false;
  const officialVariant = {
    tokenBaseUrl: OURA_API_BASE_URL,
    authMode: OURA_TOKEN_AUTH_MODE === "basic" ? "basic" : "body",
    includeRedirectUri,
  };
  const variants = OURA_TOKEN_EXCHANGE_FALLBACK
    ? [
        officialVariant,
        { tokenBaseUrl: OURA_API_BASE_URL, authMode: "body", includeRedirectUri: true },
        { tokenBaseUrl: OURA_API_BASE_URL, authMode: "basic", includeRedirectUri: true },
        { tokenBaseUrl: OURA_AUTH_BASE_URL, authMode: "body", includeRedirectUri: true },
        { tokenBaseUrl: OURA_AUTH_BASE_URL, authMode: "basic", includeRedirectUri: true },
      ].filter((variant, index, list) => (
        index === list.findIndex((candidate) => (
          candidate.tokenBaseUrl === variant.tokenBaseUrl
          && candidate.authMode === variant.authMode
          && candidate.includeRedirectUri === variant.includeRedirectUri
        ))
      ))
    : [officialVariant];
  const failures = [];
  for (const variant of variants) {
    const request = {
      ...baseRequest,
      ...(variant.includeRedirectUri ? { redirect_uri: OURA_REDIRECT_URI } : {}),
    };
    try {
      const tokens = await exchangeOuraToken(request, variant);
      await appendLog("info", "oura_token_exchange_variant_ok", {
        tokenBaseUrl: variant.tokenBaseUrl,
        authMode: variant.authMode,
        includeRedirectUri: variant.includeRedirectUri,
      });
      return tokens;
    } catch (error) {
      failures.push({
        status: error.statusCode || 500,
        tokenBaseUrl: variant.tokenBaseUrl,
        authMode: variant.authMode,
        includeRedirectUri: variant.includeRedirectUri,
        detail: error.detail || error.message,
      });
    }
  }
  await appendLog("error", "oura_token_exchange_all_variants_failed", {
    attempts: failures.map(({ status, tokenBaseUrl, authMode, includeRedirectUri }) => ({ status, tokenBaseUrl, authMode, includeRedirectUri })),
  });
  throw new HttpError(400, "oura_token_exchange_failed", {
    message: "Oura rechazo el intercambio final de token. Verifica que Client ID y Client Secret pertenezcan a la misma app Oura.",
    attempts: failures,
  });
}

async function refreshOuraTokensIfNeeded(userId, tokens) {
  const expiresAt = Date.parse(tokens.expires_at || "");
  if (!tokens.refresh_token || (Number.isFinite(expiresAt) && expiresAt - Date.now() > 90_000)) {
    return tokens;
  }
  const refreshed = await exchangeOuraToken({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
  });
  const saved = await storeOuraTokens(userId, {
    ...refreshed,
    refresh_token: refreshed.refresh_token || tokens.refresh_token,
  });
  return {
    ...tokens,
    ...refreshed,
    refresh_token: refreshed.refresh_token || tokens.refresh_token,
    expires_at: saved.expires_at,
  };
}

function buildOuraQueryForDataType(dataType, options = {}) {
  const defaultEnd = new Date();
  const defaultStart = new Date(defaultEnd.getTime() - OURA_DEFAULT_SYNC_DAYS * 24 * 60 * 60 * 1000);
  const startDate = options.startDate || options.start_date || formatLocalDateKey(defaultStart);
  const endDate = options.endDate || options.end_date || formatLocalDateKey(defaultEnd);
  const startDateTime = options.startDateTime || options.start_datetime || `${startDate}T00:00:00`;
  const endDateTime = options.endDateTime || options.end_datetime || `${endDate}T23:59:59`;
  const query = new URLSearchParams();
  if (dataType === "heartrate" || dataType === "heart_rate") {
    query.set("start_datetime", startDateTime);
    query.set("end_datetime", endDateTime);
  } else {
    if (startDate) query.set("start_date", startDate);
    if (endDate) query.set("end_date", endDate);
  }
  if (options.nextToken || options.next_token) query.set("next_token", options.nextToken || options.next_token);
  return query;
}

async function fetchOuraCollection(dataTypeConfig, tokens, options = {}) {
  const documents = [];
  const pages = [];
  let nextToken = options.nextToken || options.next_token || "";
  const maxPages = Math.max(1, Math.min(Number(options.maxPages || 12), 50));
  for (let page = 0; page < maxPages; page += 1) {
    const query = buildOuraQueryForDataType(dataTypeConfig.dataType, { ...options, nextToken });
    const url = `${OURA_API_BASE_URL}${dataTypeConfig.route}${query.toString() ? `?${query}` : ""}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    if (!response.ok) {
      throw new HttpError(response.status, "oura_collection_fetch_failed", {
        dataType: dataTypeConfig.dataType,
        route: dataTypeConfig.route,
        status: response.status,
        retryable: response.status === 429 || response.status >= 500,
        details: data,
      });
    }
    const pageDocuments = Array.isArray(data.data)
      ? data.data
      : Array.isArray(data)
        ? data
        : data && typeof data === "object" && !("next_token" in data)
          ? [data]
          : [];
    documents.push(...pageDocuments);
    pages.push({ page: page + 1, count: pageDocuments.length, nextToken: data?.next_token || null });
    nextToken = data?.next_token || "";
    if (!nextToken) break;
  }
  return { dataType: dataTypeConfig.dataType, route: dataTypeConfig.route, documents, pages };
}

async function syncOuraApiData(body = {}, user = { id: LOCAL_USER_ID }) {
  const missingConfig = getOuraMissingConfig();
  if (missingConfig.length) {
    throw new HttpError(503, "oura_oauth_not_configured", { missingConfig });
  }
  const storedTokens = await getStoredOuraTokens(user.id);
  if (!storedTokens?.access_token) {
    throw new HttpError(409, "oura_not_connected", {
      nextAction: "Conecta Oura desde /api/integration/oura/connect antes de sincronizar.",
    });
  }
  const tokens = await refreshOuraTokensIfNeeded(user.id, storedTokens);
  const manifest = buildOuraConnectorManifest();
  const requested = Array.isArray(body.dataTypes) && body.dataTypes.length
    ? new Set(body.dataTypes.map((item) => String(item).trim()))
    : null;
  const dataTypes = manifest.dataTypes.filter((item) => !requested || requested.has(item.dataType));
  const participantId = String(body.participantId || body.groupId || user.id || "miguel").trim();
  const collections = [];
  const errors = [];
  for (const dataTypeConfig of dataTypes) {
    try {
      collections.push(await fetchOuraCollection(dataTypeConfig, tokens, body));
    } catch (error) {
      errors.push({
        dataType: dataTypeConfig.dataType,
        error: sanitizeDiagnosticError(error),
      });
    }
  }
  const signals = [];
  for (const collection of collections) {
    const normalized = normalizeOuraPayload({
      dataType: collection.dataType,
      documents: collection.documents,
      participantId,
    }, user);
    normalized.results.forEach((result) => {
      if (result.ok) signals.push(result.normalized);
      else errors.push({ dataType: collection.dataType, error: result.errors.join("; ") });
    });
  }
  const ingest = signals.length
    ? await ingestIntegrationSignals({ signals, source: "oura-api-v2", refreshContext: false, refreshDailyBriefing: false }, user)
    : {
        ok: errors.length === 0,
        count: 0,
        targetSummary: {},
        results: [],
        automation: { status: "no_changes", triggered: false, actions: [] },
      };
  await appendLog(errors.length ? "warn" : "info", "oura_sync_completed", {
    userId: user.id,
    requested: dataTypes.map((item) => item.dataType),
    collections: collections.map((item) => ({ dataType: item.dataType, count: item.documents.length })),
    ingested: ingest.count,
    errors,
  });
  return {
    ok: errors.length === 0 && ingest.ok,
    connector: "oura-api-v2",
    syncedAt: new Date().toISOString(),
    range: {
      startDate: body.startDate || body.start_date || formatLocalDateKey(new Date(Date.now() - OURA_DEFAULT_SYNC_DAYS * 24 * 60 * 60 * 1000)),
      endDate: body.endDate || body.end_date || formatLocalDateKey(new Date()),
    },
    dataTypes: dataTypes.map((item) => item.dataType),
    collectionSummary: collections.map((item) => ({ dataType: item.dataType, count: item.documents.length, pages: item.pages || [] })),
    ingestedSignals: signals.length,
    ingest,
    errors,
    message: errors.length
      ? "Oura sincronizo parcialmente; revisa errores por tipo de dato."
      : "Oura sincronizado y convertido en contexto biometrico transversal.",
  };
}

async function handleOuraWebhook(req, body = {}) {
  const signature = req.headers["x-oura-signature"] || req.headers["x-oura-webhook-signature"] || "";
  const webhookEvents = Array.isArray(body.events)
    ? body.events
    : Array.isArray(body.data)
      ? body.data
      : body && typeof body === "object"
        ? [body]
        : [];
  const configured = Boolean(OURA_WEBHOOK_SECRET);
  const validated = configured ? Boolean(signature) : false;
  const userId = String(body.userId || body.user_id || body.ownerId || LOCAL_USER_ID);
  await appendLog(configured && !validated ? "warn" : "info", "oura_webhook_received", {
    configured,
    validated,
    userId,
    events: webhookEvents.map((event) => ({
      dataType: event.data_type || event.dataType || event.type || "",
      eventType: event.event_type || event.eventType || event.action || "",
      objectId: event.object_id || event.objectId || event.id || "",
    })),
  });
  return {
    ok: true,
    connector: "oura-api-v2",
    status: configured && !validated ? "accepted_signature_unverified" : "accepted",
    receivedEvents: webhookEvents.length,
    nextAction: "El webhook quedo registrado; la sincronizacion segura ocurre por /api/integration/oura/sync o rutina oura-sync.",
  };
}

function buildAppleHealthConnectorManifest() {
  return {
    schemaVersion: INTEGRATION_CONTRACT_VERSION,
    connector: "apple-healthkit-native",
    source: "HealthKit client-side framework",
    directRestApi: false,
    recommendedRoute: "Vibeapp iOS reads HealthKit locally with user permission and posts normalized signals to the Vibe backend.",
    notRecommendedRoute: "CloudKit as a primary health bridge, because availability, data types, permissions, and privacy expectations are not reliable enough for Vibe's core flow.",
    endpoints: {
      manifest: "/api/integration/apple-health/manifest",
      normalize: "/api/integration/apple-health/normalize",
      selftest: "/api/integration/device/selftest",
    },
    privacyLevel: "sensitive",
    requiredNativeCapabilities: ["HealthKit entitlement", "NSHealthShareUsageDescription", "granular user permission per data type"],
    dataTypes: [
      { dataType: "stepCount", healthKitIdentifier: "HKQuantityTypeIdentifierStepCount", payloadType: "activity", target: "context", unit: "count" },
      { dataType: "activeEnergyBurned", healthKitIdentifier: "HKQuantityTypeIdentifierActiveEnergyBurned", payloadType: "activity", target: "context", unit: "kcal" },
      { dataType: "distanceWalkingRunning", healthKitIdentifier: "HKQuantityTypeIdentifierDistanceWalkingRunning", payloadType: "activity", target: "context", unit: "m" },
      { dataType: "heartRate", healthKitIdentifier: "HKQuantityTypeIdentifierHeartRate", payloadType: "biometric", target: "context", unit: "count/min" },
      { dataType: "restingHeartRate", healthKitIdentifier: "HKQuantityTypeIdentifierRestingHeartRate", payloadType: "biometric", target: "context", unit: "count/min" },
      { dataType: "heartRateVariabilitySDNN", healthKitIdentifier: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN", payloadType: "biometric", target: "context", unit: "ms" },
      { dataType: "oxygenSaturation", healthKitIdentifier: "HKQuantityTypeIdentifierOxygenSaturation", payloadType: "biometric", target: "context", unit: "percent" },
      { dataType: "respiratoryRate", healthKitIdentifier: "HKQuantityTypeIdentifierRespiratoryRate", payloadType: "biometric", target: "context", unit: "count/min" },
      { dataType: "bodyTemperature", healthKitIdentifier: "HKQuantityTypeIdentifierBodyTemperature", payloadType: "biometric", target: "context", unit: "degC" },
      { dataType: "sleepAnalysis", healthKitIdentifier: "HKCategoryTypeIdentifierSleepAnalysis", payloadType: "sleep", target: "context", unit: "category" },
      { dataType: "workout", healthKitIdentifier: "HKWorkoutType", payloadType: "activity", target: "context", unit: "workout" },
    ],
  };
}

function buildHealthConnectConnectorManifest() {
  return {
    schemaVersion: INTEGRATION_CONTRACT_VERSION,
    connector: "android-health-connect",
    source: "Android Health Connect",
    directRestApi: false,
    recommendedRoute: "Vibeapp Android reads Health Connect locally with user permission and posts normalized signals to the Vibe backend.",
    samsungRoute: "Samsung Health should flow through Health Connect where possible; the older Health Platform API is deprecated.",
    endpoints: {
      manifest: "/api/integration/health-connect/manifest",
      normalize: "/api/integration/health-connect/normalize",
      selftest: "/api/integration/device/selftest",
    },
    privacyLevel: "sensitive",
    requiredNativeCapabilities: ["Health Connect permission declaration", "runtime permissions per record type", "background sync policy"],
    dataTypes: [
      { dataType: "StepsRecord", payloadType: "activity", target: "context", metrics: ["count", "startTime", "endTime"] },
      { dataType: "ActiveCaloriesBurnedRecord", payloadType: "activity", target: "context", metrics: ["energy", "startTime", "endTime"] },
      { dataType: "DistanceRecord", payloadType: "activity", target: "context", metrics: ["distance", "startTime", "endTime"] },
      { dataType: "HeartRateRecord", payloadType: "biometric", target: "context", metrics: ["samples.bpm", "samples.time"] },
      { dataType: "RestingHeartRateRecord", payloadType: "biometric", target: "context", metrics: ["beatsPerMinute"] },
      { dataType: "HeartRateVariabilityRmssdRecord", payloadType: "biometric", target: "context", metrics: ["heartRateVariabilityMillis"] },
      { dataType: "OxygenSaturationRecord", payloadType: "biometric", target: "context", metrics: ["percentage"] },
      { dataType: "RespiratoryRateRecord", payloadType: "biometric", target: "context", metrics: ["rate"] },
      { dataType: "BodyTemperatureRecord", payloadType: "biometric", target: "context", metrics: ["temperature"] },
      { dataType: "SleepSessionRecord", payloadType: "sleep", target: "context", metrics: ["stages", "startTime", "endTime"] },
      { dataType: "ExerciseSessionRecord", payloadType: "activity", target: "context", metrics: ["exerciseType", "startTime", "endTime"] },
    ],
  };
}

function buildMetaWearablesConnectorManifest() {
  return {
    schemaVersion: INTEGRATION_CONTRACT_VERSION,
    connector: "meta-wearables-device-access",
    source: "Meta Wearables Device Access Toolkit / Meta AI app import",
    directRestApi: false,
    recommendedRoute: "Use Vibeapp as native bridge for live commands/media when SDK access is available; otherwise import files from Meta AI app or the phone gallery.",
    currentRoute: "Manual import from Meta AI app to phone photos/files, then Vibeapp/PWA uploads to Storage.",
    endpoints: {
      manifest: "/api/integration/meta-wearables/manifest",
      normalize: "/api/integration/meta-wearables/normalize",
      selftest: "/api/integration/device/selftest",
    },
    privacyLevel: "private",
    dataTypes: [
      { dataType: "photo", payloadType: "image", target: "assets", fileTypes: ["image/jpeg", "image/heic"] },
      { dataType: "video", payloadType: "video", target: "assets", fileTypes: ["video/mp4", "video/hevc"] },
      { dataType: "voice_activity", payloadType: "audio", target: "assets", fileTypes: ["audio/mpeg", "audio/mp4", "text/plain", "application/json"] },
      { dataType: "autocapture_session", payloadType: "media", target: "assets", fileTypes: ["video/mp4", "image/jpeg", "application/json"] },
      { dataType: "ai_context_export", payloadType: "document", target: "assets", fileTypes: ["application/json", "text/html"] },
    ],
  };
}

function normalizeNativeHealthDate(document = {}) {
  return document.startDate || document.startTime || document.day || document.timestamp || document.endDate || document.endTime || new Date().toISOString();
}

function findManifestDataType(manifest, dataType) {
  const normalized = String(dataType || "").toLowerCase();
  return manifest.dataTypes.find((item) => String(item.dataType).toLowerCase() === normalized)
    || manifest.dataTypes.find((item) => String(item.healthKitIdentifier || "").toLowerCase() === normalized)
    || { dataType, payloadType: "biometric", target: "context" };
}

function buildNativeHealthSignal({ connector, manifest, dataType, document = {}, participantId = "miguel", user = null } = {}) {
  const config = findManifestDataType(manifest, dataType);
  const capturedAt = normalizeNativeHealthDate(document);
  const documentId = document.id || document.uuid || document.uid || `${config.dataType}-${capturedAt}`;
  return {
    sourceId: `${connector}-${config.dataType}-${documentId}`,
    sourceType: "wearable",
    capturedAt,
    participantId: participantId || user?.id || LOCAL_USER_ID,
    payloadType: config.payloadType || "biometric",
    privacyLevel: "sensitive",
    idempotencyKey: `${connector}:${config.dataType}:${documentId}:${participantId || user?.id || LOCAL_USER_ID}`,
    payload: {
      provider: connector === "apple-healthkit-native" ? "Apple HealthKit" : "Android Health Connect",
      dataType: config.dataType,
      target: config.target || "context",
      metrics: document.metrics || document.value || document.samples || document,
      originalDocumentId: document.id || document.uuid || document.uid || null,
    },
    deviceMetadata: {
      connector,
      nativeBridge: "Vibeapp",
      sourceFramework: connector === "apple-healthkit-native" ? "HealthKit" : "Health Connect",
      importMode: document.importMode || "native-or-file",
    },
  };
}

function normalizeAppleHealthPayload(body = {}, user = null) {
  const manifest = buildAppleHealthConnectorManifest();
  const dataType = String(body.dataType || body.type || "stepCount").trim();
  const documents = Array.isArray(body.documents) ? body.documents : Array.isArray(body.data) ? body.data : [body.document || body.data || body];
  const participantId = String(body.participantId || body.pilotParticipantId || "miguel").trim();
  const results = documents
    .filter((document) => document && typeof document === "object")
    .map((document) => validateIntegrationSignal(buildNativeHealthSignal({ connector: manifest.connector, manifest, dataType, document, participantId, user }), user));
  return {
    ok: results.length > 0 && results.every((item) => item.ok),
    connector: manifest.connector,
    schemaVersion: INTEGRATION_CONTRACT_VERSION,
    dataType,
    count: results.length,
    targetSummary: results.reduce((acc, item) => {
      acc[item.target] = (acc[item.target] || 0) + 1;
      return acc;
    }, {}),
    results,
  };
}

function normalizeHealthConnectPayload(body = {}, user = null) {
  const manifest = buildHealthConnectConnectorManifest();
  const dataType = String(body.dataType || body.type || "StepsRecord").trim();
  const documents = Array.isArray(body.documents) ? body.documents : Array.isArray(body.data) ? body.data : [body.document || body.data || body];
  const participantId = String(body.participantId || body.pilotParticipantId || "miguel").trim();
  const results = documents
    .filter((document) => document && typeof document === "object")
    .map((document) => validateIntegrationSignal(buildNativeHealthSignal({ connector: manifest.connector, manifest, dataType, document, participantId, user }), user));
  return {
    ok: results.length > 0 && results.every((item) => item.ok),
    connector: manifest.connector,
    schemaVersion: INTEGRATION_CONTRACT_VERSION,
    dataType,
    count: results.length,
    targetSummary: results.reduce((acc, item) => {
      acc[item.target] = (acc[item.target] || 0) + 1;
      return acc;
    }, {}),
    results,
  };
}

function normalizeMetaWearablesPayload(body = {}, user = null) {
  const manifest = buildMetaWearablesConnectorManifest();
  const dataType = String(body.dataType || body.type || "photo").trim();
  const config = findManifestDataType(manifest, dataType);
  const files = Array.isArray(body.files) ? body.files : Array.isArray(body.payload?.files) ? body.payload.files : [body.file || body.payload || body].filter(Boolean);
  const participantId = String(body.participantId || body.pilotParticipantId || "miguel").trim();
  const capturedAt = body.capturedAt || body.timestamp || new Date().toISOString();
  const signal = {
    sourceId: String(body.sourceId || `meta-wearables-${dataType}-${capturedAt}`).replace(/\s+/g, "-"),
    sourceType: "external-session",
    capturedAt,
    participantId,
    payloadType: config.payloadType || "media",
    privacyLevel: "private",
    linkedExperienceId: body.linkedExperienceId || body.experienceId || "",
    idempotencyKey: body.idempotencyKey || `meta-wearables:${dataType}:${capturedAt}:${participantId || user?.id || LOCAL_USER_ID}`,
    payload: {
      provider: "Meta Wearables",
      dataType: config.dataType || dataType,
      importRoute: body.importRoute || manifest.currentRoute,
      files,
      metadata: body.metadata || {},
    },
    deviceMetadata: {
      connector: manifest.connector,
      nativeBridge: "Vibeapp",
      sourceFramework: "Meta Wearables",
      captureMode: body.captureMode || "manual-import-or-sdk",
    },
  };
  const validation = validateIntegrationSignal(signal, user);
  return {
    ok: validation.ok,
    connector: manifest.connector,
    schemaVersion: INTEGRATION_CONTRACT_VERSION,
    dataType,
    count: 1,
    targetSummary: { [validation.target]: 1 },
    results: [validation],
  };
}

function runDeviceConnectorSelfTest(user = null) {
  const checkedAt = new Date().toISOString();
  const cases = [
    {
      name: "oura-daily-readiness",
      connector: "oura-api-v2",
      expectedTarget: "context",
      run: () => normalizeOuraPayload({
        dataType: "daily_readiness",
        participantId: "selftest",
        document: {
          id: "selftest-readiness",
          day: "2026-05-28",
          score: 82,
          temperature_deviation: 0.1,
          contributors: { hrv_balance: 78, sleep_balance: 80 },
        },
      }, user),
    },
    {
      name: "apple-health-steps",
      connector: "apple-healthkit-native",
      expectedTarget: "context",
      run: () => normalizeAppleHealthPayload({
        dataType: "stepCount",
        participantId: "selftest",
        document: {
          id: "selftest-apple-steps",
          startDate: "2026-05-28T09:00:00-04:00",
          value: 8420,
        },
      }, user),
    },
    {
      name: "health-connect-steps",
      connector: "android-health-connect",
      expectedTarget: "context",
      run: () => normalizeHealthConnectPayload({
        dataType: "StepsRecord",
        participantId: "selftest",
        document: {
          id: "selftest-health-connect-steps",
          startTime: "2026-05-28T09:00:00-04:00",
          metrics: { count: 6200 },
        },
      }, user),
    },
    {
      name: "meta-wearables-photo",
      connector: "meta-wearables-device-access",
      expectedTarget: "assets",
      run: () => normalizeMetaWearablesPayload({
        dataType: "photo",
        participantId: "selftest",
        sourceId: "selftest-meta-photo",
        capturedAt: "2026-05-28T14:00:00-04:00",
        files: [{ fileName: "meta-photo.heic", mimeType: "image/heic", storageObjectHint: "meta-photo.heic" }],
      }, user),
    },
  ];
  const results = cases.map((testCase) => {
    try {
      const output = testCase.run();
      const target = Object.keys(output.targetSummary || {})[0] || output.results?.[0]?.target || "";
      const ok = Boolean(output.ok && target === testCase.expectedTarget);
      return {
        name: testCase.name,
        connector: testCase.connector,
        ok,
        expectedTarget: testCase.expectedTarget,
        target,
        count: output.count || 0,
        payloadType: output.results?.[0]?.normalized?.payloadType || "",
        errors: output.results?.flatMap((item) => item.errors || []) || [],
        warnings: output.results?.flatMap((item) => item.warnings || []) || [],
      };
    } catch (error) {
      return {
        name: testCase.name,
        connector: testCase.connector,
        ok: false,
        expectedTarget: testCase.expectedTarget,
        target: "error",
        count: 0,
        payloadType: "",
        errors: [error.message],
        warnings: [],
      };
    }
  });
  return {
    ok: results.every((item) => item.ok),
    checkedAt,
    schemaVersion: INTEGRATION_CONTRACT_VERSION,
    samples: results.length,
    passed: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    targetSummary: results.reduce((acc, item) => {
      acc[item.target] = (acc[item.target] || 0) + 1;
      return acc;
    }, {}),
    results,
  };
}

function validateIntegrationSignal(signal = {}, user = null) {
  const contract = buildIntegrationContract();
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
    idempotencyKey: String(signal.idempotencyKey || signal.metadata?.idempotencyKey || signal.sourceId || "").trim(),
    deviceMetadata: isPlainObject(signal.deviceMetadata) ? signal.deviceMetadata : {},
    metadata: isPlainObject(signal.metadata) ? signal.metadata : {},
  };

  for (const field of contract.requiredFields) {
    if (field === "payload") {
      if (normalized.payload === null || normalized.payload === undefined || normalized.payload === "") errors.push(`${field} is required`);
    } else if (!normalized[field]) {
      errors.push(`${field} is required`);
    }
  }

  const capturedTime = Date.parse(normalized.capturedAt);
  if (normalized.capturedAt && !Number.isFinite(capturedTime)) {
    errors.push("capturedAt must be an ISO date/time");
  }
  if (normalized.sourceType && !contract.allowedSourceTypes.includes(normalized.sourceType)) {
    warnings.push(`sourceType '${normalized.sourceType}' is not in the recommended catalog`);
  }
  if (normalized.payloadType && !contract.allowedPayloadTypes.includes(normalized.payloadType)) {
    warnings.push(`payloadType '${normalized.payloadType}' is not in the recommended catalog`);
  }
  if (!signal.idempotencyKey && !signal.metadata?.idempotencyKey) {
    warnings.push("idempotencyKey is recommended for retry-safe ingestion");
  }
  if (["biometric", "activity", "sleep", "media", "image", "audio", "video", "document"].includes(normalized.payloadType) && normalized.privacyLevel === "normal") {
    warnings.push("sensitive or media payloads should declare privacyLevel private or sensitive");
  }

  const target = contract.targets[normalized.payloadType] || "review";
  return {
    ok: errors.length === 0,
    schemaVersion: contract.schemaVersion,
    target,
    traceId: randomUUID(),
    userId: user?.id || LOCAL_USER_ID,
    errors,
    warnings,
    normalized,
    acceptedAt: new Date().toISOString(),
  };
}

async function ingestIntegrationSignals(body = {}, user = { id: LOCAL_USER_ID }) {
  const signals = Array.isArray(body.signals)
    ? body.signals
    : Array.isArray(body)
      ? body
      : [body.signal || body].filter(Boolean);
  const results = [];
  for (const signal of signals) {
    results.push(await ingestIntegrationSignal(signal, user));
  }
  const targetSummary = results.reduce((acc, item) => {
    acc[item.target || "unknown"] = (acc[item.target || "unknown"] || 0) + 1;
    return acc;
  }, {});
  const response = {
    ok: results.every((item) => item.ok),
    schemaVersion: INTEGRATION_CONTRACT_VERSION,
    acceptedAt: new Date().toISOString(),
    count: results.length,
    targetSummary,
    results,
  };
  response.automation = await buildPostIngestAutomation(response, user, body);
  await appendLog(response.ok ? "info" : "warn", "integration_ingest_batch", {
    userId: user.id,
    count: response.count,
    targetSummary,
    statuses: results.map((item) => ({ target: item.target, status: item.status, id: item.id || "" })),
    automation: {
      status: response.automation.status,
      panels: response.automation.updatedPanels,
      actions: response.automation.actions,
    },
  });
  return response;
}

async function ingestIntegrationSignal(signal = {}, user = { id: LOCAL_USER_ID }) {
  const validation = validateIntegrationSignal(signal, user);
  const normalized = validation.normalized;
  const idempotencyKey = normalized.idempotencyKey || normalized.sourceId || validation.traceId;
  if (!validation.ok) {
    return {
      ok: false,
      status: "rejected",
      target: validation.target,
      traceId: validation.traceId,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  if (validation.target === "experience") {
    const experience = await upsertExperience(buildExperienceFromIntegrationSignal(normalized, signal, user), user);
    return integrationIngestResult(validation, "stored", experience.id, { experience });
  }

  if (validation.target === "agenda") {
    const agendaEvent = await upsertAgendaEvent(buildAgendaEventFromIntegrationSignal(normalized, signal), user);
    return integrationIngestResult(validation, "stored", agendaEvent.id, { agendaEvent });
  }

  if (validation.target === "context") {
    const contextSignal = await upsertContextSignal(buildContextSignalFromIntegrationSignal(normalized, signal, user), user);
    return integrationIngestResult(validation, "stored", contextSignal.id, {
      contextSignal,
      contextType: normalized.payloadType,
    });
  }

  if (validation.target === "assets") {
    const asset = await upsertAssetEvidence(buildAssetEvidenceFromIntegrationSignal(normalized, signal, user), user, { requireRemote: true });
    return integrationIngestResult(validation, "stored", asset.id, {
      asset,
      route: "/api/assets",
      message: "Asset evidence stored in the inbox. Binary media can still be uploaded through /api/media with the same sourceId and idempotencyKey.",
    });
  }

  return integrationIngestResult(validation, "accepted_for_review", stableIntegrationId("review", idempotencyKey), {
    message: "Signal validated, but no automatic target is configured.",
  });
}

function buildAssetEvidenceFromIntegrationSignal(normalized = {}, signal = {}, user = { id: LOCAL_USER_ID }) {
  const payload = isPlainObject(normalized.payload) ? normalized.payload : {};
  const firstFile = Array.isArray(payload.files) && payload.files.length && isPlainObject(payload.files[0])
    ? payload.files[0]
    : {};
  const fileName = payload.fileName || payload.filename || payload.name || firstFile.fileName || firstFile.filename || firstFile.name || `${normalized.payloadType || "media"}-${normalized.sourceId || Date.now()}`;
  const mimeType = payload.mimeType || payload.type || firstFile.mimeType || firstFile.type || defaultMimeTypeForPayload(normalized.payloadType);
  const idempotencyKey = normalized.idempotencyKey || normalized.sourceId || signal.idempotencyKey || "";
  const sourceId = normalized.sourceId || signal.sourceId || idempotencyKey;
  const assetId = signal.assetId || signal.asset_id || payload.assetId || payload.asset_id || stableIntegrationId("asset", idempotencyKey || sourceId || fileName);
  const metadata = {
    ...(normalized.metadata || {}),
    ...(isPlainObject(signal.metadata) ? signal.metadata : {}),
    idempotencyKey,
    sourceId,
    sourceType: normalized.sourceType,
    sourceDevice: signal.sourceDevice || signal.device || normalized.deviceMetadata?.deviceName || normalized.deviceMetadata?.platform || "",
    payloadType: normalized.payloadType,
    privacyLevel: normalized.privacyLevel,
    linkedExperienceId: normalized.linkedExperienceId || "",
    storageObjectHint: payload.storageObjectHint || firstFile.storageObjectHint || "",
    originalPayload: payload,
    ingestRoute: "/api/integration/ingest",
  };
  return {
    id: assetId,
    name: fileName,
    type: mimeType,
    size: Number(payload.size || payload.sizeBytes || firstFile.size || firstFile.sizeBytes || 0),
    dataUrl: payload.dataUrl || "",
    path: payload.storagePath || payload.path || firstFile.storagePath || firstFile.path || "",
    url: payload.url || payload.downloadUrl || firstFile.url || "",
    createdAt: normalized.capturedAt || new Date().toISOString(),
    capturedAt: normalized.capturedAt,
    uploadedAt: new Date().toISOString(),
    storage: payload.storage || (payload.storagePath || firstFile.storagePath ? "supabase" : "metadata"),
    kind: normalized.payloadType === "media" ? inferServerMediaKind({ type: mimeType, name: fileName }) : normalized.payloadType,
    payloadType: normalized.payloadType,
    sourceType: normalized.sourceType,
    sourceDevice: metadata.sourceDevice,
    sourceId,
    participantId: normalized.participantId,
    pilotParticipantId: normalized.participantId,
    experienceId: normalized.linkedExperienceId || "",
    adoptionStatus: normalized.linkedExperienceId ? "adopted" : "inbox",
    permissions: normalized.privacyLevel || "private",
    checksum: signal.checksum || payload.checksum || firstFile.checksum || "",
    metadata,
  };
}

function defaultMimeTypeForPayload(payloadType = "") {
  const type = String(payloadType || "").toLowerCase();
  if (type === "image") return "image/jpeg";
  if (type === "video") return "video/mp4";
  if (type === "audio") return "audio/mp4";
  if (type === "document") return "application/octet-stream";
  return "application/octet-stream";
}

function integrationIngestResult(validation, status, id, extra = {}) {
  return {
    ok: true,
    status,
    id,
    target: validation.target,
    payloadType: validation.normalized.payloadType,
    sourceType: validation.normalized.sourceType,
    traceId: validation.traceId,
    sourceId: validation.normalized.sourceId,
    idempotencyKey: validation.normalized.idempotencyKey,
    warnings: validation.warnings,
    ...extra,
  };
}

async function buildPostIngestAutomation(response = {}, user = { id: LOCAL_USER_ID }, options = {}) {
  const results = Array.isArray(response.results) ? response.results : [];
  const stored = results.filter((item) => item?.ok && ["stored", "accepted_pending_media"].includes(item.status));
  const targetSet = new Set(stored.map((item) => item.target).filter(Boolean));
  const payloadSet = new Set(stored.map((item) => item.payloadType || item.contextType).filter(Boolean));
  const updatedPanels = inferUpdatedPanelsFromIngest(targetSet, payloadSet);
  const actions = inferPostIngestActions(targetSet, payloadSet);
  const automation = {
    ok: true,
    status: stored.length ? "completed" : "no_changes",
    triggered: stored.length > 0,
    generatedAt: new Date().toISOString(),
    updatedTargets: [...targetSet],
    payloadTypes: [...payloadSet],
    updatedPanels,
    actions,
    biometricImpact: buildBiometricImpactFromIngest(stored),
    contextImpact: { status: "not_required" },
    dailyBriefing: { status: "not_required" },
  };

  const location = inferPostIngestLocation(stored);
  const runInline = shouldRunInlinePostIngestAutomation(options);
  if (!runInline) {
    const shouldRefreshContext = location && shouldRefreshContextImpact(payloadSet, targetSet, options);
    const shouldRefreshDaily = location && shouldRefreshDailyBriefing(payloadSet, targetSet, options);
    if (shouldRefreshContext || shouldRefreshDaily) {
      automation.status = "completed_with_deferred_context";
      automation.contextImpact = shouldRefreshContext
        ? { status: "deferred", location, reason: "background_refresh_scheduled" }
        : automation.contextImpact;
      automation.dailyBriefing = shouldRefreshDaily
        ? { status: "deferred", location, reason: "background_refresh_scheduled" }
        : automation.dailyBriefing;
      queuePostIngestContextRefresh({ location, payloadSet, targetSet, user, options });
    }
    return automation;
  }

  if (location && shouldRefreshContextImpact(payloadSet, targetSet, options)) {
    try {
      const profile = await getProfile(user);
      automation.contextImpact = {
        status: "refreshed",
        location,
        impact: await getContextImpact(location, profile, inferExperienceTypeFromPayloads(payloadSet)),
      };
    } catch (error) {
      automation.contextImpact = {
        status: "deferred",
        location,
        reason: sanitizeDiagnosticError(error),
      };
      automation.status = "completed_with_attention";
    }
  }

  if (location && shouldRefreshDailyBriefing(payloadSet, targetSet, options)) {
    try {
      const briefing = await getDailyBriefing(location, "es", { user, force: Boolean(options.forceDailyBriefing) });
      automation.dailyBriefing = {
        status: "refreshed",
        location,
        generatedAt: briefing.generatedAt,
        nextRefreshAt: briefing.nextRefreshAt,
        briefing,
      };
    } catch (error) {
      automation.dailyBriefing = {
        status: "deferred",
        location,
        reason: sanitizeDiagnosticError(error),
      };
      automation.status = "completed_with_attention";
    }
  }

  return automation;
}

function shouldRunInlinePostIngestAutomation(options = {}) {
  return options.awaitAutomation === true
    || options.awaitPostIngestAutomation === true
    || options.inlineAutomation === true;
}

const POST_INGEST_CONTEXT_REFRESH_RETRY_DELAYS_MS = [15000, 60000];

function queuePostIngestContextRefresh({ location, payloadSet, targetSet, user, options = {} }) {
  const payloadTypes = [...payloadSet];
  const targetTypes = [...targetSet];
  appendLog("info", "integration_ingest_background_refresh_scheduled", {
    userId: user.id,
    location,
    payloadTypes,
    targetTypes,
  }).catch(() => {});
  runQueuedPostIngestContextRefresh({ location, payloadTypes, targetTypes, user, options }, 0);
}

function runQueuedPostIngestContextRefresh(job, attempt = 0) {
  Promise.resolve()
    .then(() => runPostIngestContextRefresh(job))
    .then((summary) => {
      if (hasPostIngestRefreshFailure(summary) && attempt < POST_INGEST_CONTEXT_REFRESH_RETRY_DELAYS_MS.length) {
        schedulePostIngestContextRefreshRetry(job, attempt, summary);
      } else if (hasPostIngestRefreshFailure(summary)) {
        logPostIngestContextRefreshFailure(job, summary, attempt);
      }
    })
    .catch((error) => {
      if (attempt < POST_INGEST_CONTEXT_REFRESH_RETRY_DELAYS_MS.length) {
        schedulePostIngestContextRefreshRetry(job, attempt, { error: sanitizeDiagnosticError(error) });
      } else {
        logPostIngestContextRefreshFailure(job, { error: sanitizeDiagnosticError(error) }, attempt);
      }
    });
}

function hasPostIngestRefreshFailure(summary = {}) {
  return [summary.contextImpact?.status, summary.dailyBriefing?.status].some((status) => String(status || "").includes("failed"))
    || Boolean(summary.error);
}

function schedulePostIngestContextRefreshRetry(job, attempt = 0, summary = {}) {
  const delayMs = POST_INGEST_CONTEXT_REFRESH_RETRY_DELAYS_MS[attempt] || 0;
  appendLog("warn", "integration_ingest_background_refresh_retry_scheduled", {
    userId: job.user?.id,
    location: job.location,
    payloadTypes: job.payloadTypes,
    targetTypes: job.targetTypes,
    attempt: attempt + 1,
    delayMs,
    contextImpact: summary.contextImpact?.status || "unknown",
    dailyBriefing: summary.dailyBriefing?.status || "unknown",
    error: summary.error || null,
  }).catch(() => {});
  setTimeout(() => runQueuedPostIngestContextRefresh(job, attempt + 1), delayMs);
}

function logPostIngestContextRefreshFailure(job, summary = {}, attempt = 0) {
  appendLog("warn", "integration_ingest_background_refresh_failed", {
    userId: job.user?.id,
    location: job.location,
    payloadTypes: job.payloadTypes,
    targetTypes: job.targetTypes,
    attempts: attempt + 1,
    contextImpact: summary.contextImpact?.status || "unknown",
    dailyBriefing: summary.dailyBriefing?.status || "unknown",
    error: summary.error || null,
  }).catch(() => {});
}

async function runPostIngestContextRefresh({ location, payloadTypes = [], targetTypes = [], user = { id: LOCAL_USER_ID }, options = {} }) {
  const payloadSet = new Set(payloadTypes);
  const targetSet = new Set(targetTypes);
  const summary = {
    contextImpact: { status: "not_required" },
    dailyBriefing: { status: "not_required" },
  };
  if (location && shouldRefreshContextImpact(payloadSet, targetSet, options)) {
    try {
      const profile = await getProfile(user);
      summary.contextImpact = {
        status: "refreshed",
        location,
        impact: await getContextImpact(location, profile, inferExperienceTypeFromPayloads(payloadSet)),
      };
    } catch (error) {
      summary.contextImpact = {
        status: "deferred_failed",
        location,
        reason: sanitizeDiagnosticError(error),
      };
    }
  }
  if (location && shouldRefreshDailyBriefing(payloadSet, targetSet, options)) {
    try {
      const briefing = await getDailyBriefing(location, "es", { user, force: Boolean(options.forceDailyBriefing) });
      summary.dailyBriefing = {
        status: "refreshed",
        location,
        generatedAt: briefing.generatedAt,
        nextRefreshAt: briefing.nextRefreshAt,
      };
    } catch (error) {
      summary.dailyBriefing = {
        status: "deferred_failed",
        location,
        reason: sanitizeDiagnosticError(error),
      };
    }
  }
  await appendLog("info", "integration_ingest_background_refresh_completed", {
    userId: user.id,
    location,
    payloadTypes,
    targetTypes,
    contextImpact: summary.contextImpact.status,
    dailyBriefing: summary.dailyBriefing.status,
  });
  return summary;
}

function inferUpdatedPanelsFromIngest(targetSet = new Set(), payloadSet = new Set()) {
  const panels = new Set();
  if (targetSet.has("experience")) ["dashboard", "library", "reports", "findings", "publications"].forEach((item) => panels.add(item));
  if (targetSet.has("agenda")) ["dashboard", "agenda"].forEach((item) => panels.add(item));
  if (targetSet.has("assets")) ["assets", "library", "reports", "publications"].forEach((item) => panels.add(item));
  if (targetSet.has("context") || ["biometric", "activity", "sleep", "location", "context"].some((item) => payloadSet.has(item))) {
    ["dashboard", "capture", "assets", "reports", "findings"].forEach((item) => panels.add(item));
  }
  return [...panels];
}

function inferPostIngestActions(targetSet = new Set(), payloadSet = new Set()) {
  const actions = [];
  if (targetSet.has("experience")) actions.push("library_updated");
  if (targetSet.has("agenda")) actions.push("agenda_updated");
  if (targetSet.has("assets")) actions.push("asset_upload_required");
  if (targetSet.has("context")) actions.push("context_index_updated");
  if (["biometric", "activity", "sleep"].some((item) => payloadSet.has(item))) actions.push("biometric_impact_recomputed");
  if (payloadSet.has("location")) actions.push("external_context_refresh_requested");
  return actions;
}

function shouldRefreshContextImpact(payloadSet = new Set(), targetSet = new Set(), options = {}) {
  if (options.refreshContext === false) return false;
  return targetSet.has("agenda") || payloadSet.has("location") || payloadSet.has("context");
}

function shouldRefreshDailyBriefing(payloadSet = new Set(), targetSet = new Set(), options = {}) {
  if (options.refreshDailyBriefing === false) return false;
  return targetSet.has("agenda") || payloadSet.has("location");
}

function inferExperienceTypeFromPayloads(payloadSet = new Set()) {
  if (payloadSet.has("activity") || payloadSet.has("sleep") || payloadSet.has("biometric")) return "Salud";
  if (payloadSet.has("calendar")) return "Agenda";
  if (payloadSet.has("location")) return "Viajes / Paseos";
  return "auto";
}

function inferPostIngestLocation(results = []) {
  const candidates = [];
  for (const result of results) {
    candidates.push(result.agendaEvent?.location);
    candidates.push(result.experience?.location);
    candidates.push(result.contextSignal?.location);
    candidates.push(result.contextSignal?.payload?.raw?.location);
    const context = result.experience?.metadata?.structuredContext;
    candidates.push(context?.signals?.[0]?.location);
    candidates.push(context?.signals?.[0]?.payload?.location);
  }
  return candidates
    .map((item) => String(item || "").trim())
    .find((item) => item && !/^(sin ubicaci[oó]n|dato del dispositivo|unknown|n\/a)$/i.test(item)) || "";
}

function buildBiometricImpactFromIngest(results = []) {
  const biometricResults = results.filter((item) => ["biometric", "activity", "sleep"].includes(item.payloadType || item.contextType));
  if (!biometricResults.length) {
    return { status: "not_required" };
  }
  const metricNames = new Set();
  let recordCount = 0;
  let suggestedEnergyTotal = 0;
  let suggestedEnergyCount = 0;
  for (const result of biometricResults) {
    const context = result.contextSignal
      ? {
          metrics: result.contextSignal.metrics || {},
          signals: result.contextSignal.payload?.signals || [],
          payloadType: result.contextSignal.signalType,
        }
      : result.experience?.metadata?.structuredContext || {};
    const metrics = context.metrics && typeof context.metrics === "object" ? context.metrics : {};
    Object.keys(metrics).forEach((key) => metricNames.add(key));
    const signals = Array.isArray(context.signals) ? context.signals : [];
    recordCount += signals.length || Number(metrics.recordCount || 0) || 1;
    const estimatedEnergy = estimateBiometricEnergyFromMetrics(metrics, result.payloadType || context.payloadType);
    if (Number.isFinite(estimatedEnergy)) {
      suggestedEnergyTotal += estimatedEnergy;
      suggestedEnergyCount += 1;
    }
  }
  const averageEnergy = suggestedEnergyCount ? Number((suggestedEnergyTotal / suggestedEnergyCount).toFixed(1)) : null;
  return {
    status: "updated",
    imports: biometricResults.length,
    recordCount,
    metricNames: [...metricNames].slice(0, 12),
    suggestedEnergy: averageEnergy,
    message: "Biometric context was interpreted and is available for dashboard, capture, reports, and findings.",
  };
}

function buildExperienceFromIntegrationSignal(normalized, signal = {}, user = { id: LOCAL_USER_ID }) {
  const payload = isPlainObject(normalized.payload) ? normalized.payload : {};
  const title = String(payload.title || signal.title || normalized.metadata.title || "Registro desde Vibeapp").trim();
  const text = String(payload.text || payload.note || payload.description || signal.notes || "").trim();
  const idempotencyKey = normalized.idempotencyKey || normalized.sourceId;
  const rawCategory = payload.category || signal.category || "";
  const rawEnergy = payload.energy ?? signal.energy;
  return {
    id: stableIntegrationId("exp", idempotencyKey),
    title: title || "Registro desde Vibeapp",
    category: rawCategory ? normalizeCategoryName(rawCategory) : "Sin categoría",
    timestamp: normalized.capturedAt,
    duration: Number(payload.durationMinutes || signal.duration || 0),
    mood: payload.mood || "Calmo",
    energy: Number.isFinite(Number(rawEnergy)) ? clampServerNumber(rawEnergy, 1, 10) : null,
    location: payload.location || signal.location || "Sin ubicación",
    people: payload.people || normalized.participantId || "Sin personas",
    notes: text || title,
    objective: payload.objective || "Registro creado desde una señal externa validada.",
    pilotParticipantId: normalized.participantId,
    pilotParticipantName: normalized.participantId,
    sourceType: normalized.sourceType,
    locale: signal.locale || "es",
    metadata: buildIntegrationMetadata(normalized, signal, user, { target: "experience" }),
    events: [
      {
        id: stableIntegrationId("evt", idempotencyKey),
        title,
        description: text || title,
        timestamp: normalized.capturedAt,
        order: 1,
      },
    ],
  };
}

function buildAgendaEventFromIntegrationSignal(normalized, signal = {}) {
  const payload = isPlainObject(normalized.payload) ? normalized.payload : {};
  const startAt = payload.startAt || payload.start_at || normalized.capturedAt;
  const endAt = payload.endAt || payload.end_at || new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString();
  const idempotencyKey = normalized.idempotencyKey || normalized.sourceId;
  return {
    id: stableIntegrationId("agenda", idempotencyKey),
    title: payload.title || signal.title || "Evento desde Vibeapp",
    type: payload.type || "Personal",
    description: payload.description || payload.text || "",
    startAt,
    endAt,
    location: payload.location || signal.location || "Sin ubicación",
    participants: payload.participants || normalized.participantId || "Sin participantes",
    source: normalized.sourceType,
    sourceType: normalized.sourceType,
    pilotParticipantId: normalized.participantId,
    metadata: buildIntegrationMetadata(normalized, signal, null, { target: "agenda" }),
  };
}

function buildContextSignalFromIntegrationSignal(normalized, signal = {}, user = { id: LOCAL_USER_ID }) {
  const payload = isPlainObject(normalized.payload) ? normalized.payload : {};
  const idempotencyKey = normalized.idempotencyKey || normalized.sourceId;
  const weather = normalizeIntegrationWeather(payload.weather || signal.weather || signal.metadata?.weather);
  const news = normalizeIntegrationNews(payload.news || payload.dailyContext?.news || signal.news || signal.metadata?.news);
  const entertainment = normalizeIntegrationEntertainment(payload.entertainment || payload.dailyContext?.entertainment || signal.entertainment || signal.metadata?.entertainment);
  const metrics = {
    ...(payload.metrics && typeof payload.metrics === "object" ? payload.metrics : {}),
    ...(weather ? {
      weatherTemperatureC: weather.temperatureC,
      weatherApparentC: weather.apparentC,
      weatherHumidity: weather.humidity,
      weatherWindKph: weather.windKph,
      weatherCode: weather.weatherCode,
    } : {}),
  };
  const rows = Array.isArray(payload.records)
    ? payload.records
    : Array.isArray(payload.samples)
      ? payload.samples
      : [signal];
  const dataType = payload.dataType || payload.recordType || normalized.payloadType;
  const capturedAt = normalized.capturedAt || new Date().toISOString();
  const validFrom = payload.validFrom || payload.startAt || payload.startTime || payload.startDate || capturedAt;
  const validTo = payload.validTo || payload.endAt || payload.endTime || payload.endDate || null;
  return {
    id: stableIntegrationId("ctxsig", idempotencyKey),
    ownerUserId: user.id || LOCAL_USER_ID,
    participantId: normalized.participantId || "",
    sourceType: normalized.sourceType || "device",
    sourceDevice: normalized.deviceMetadata?.deviceId || normalized.deviceMetadata?.device || "",
    sourceId: normalized.sourceId,
    signalType: normalized.payloadType || "context",
    capturedAt,
    validFrom,
    validTo,
    location: payload.location || signal.location || "",
    metrics,
    payload: {
      provider: payload.provider || normalized.sourceType || "",
      dataType,
      summary: buildContextSignalSummary(normalized),
      weather,
      news,
      entertainment,
      signals: rows,
      raw: payload,
    },
    metadata: buildIntegrationMetadata(normalized, signal, user, {
      target: "context_signal",
      contextModel: "ambient_context_v1",
      idempotencyKey,
    }),
  };
}

function buildContextExperienceFromIntegrationSignal(normalized, signal = {}, user = { id: LOCAL_USER_ID }) {
  const payload = isPlainObject(normalized.payload) ? normalized.payload : {};
  const idempotencyKey = normalized.idempotencyKey || normalized.sourceId;
  const label = integrationPayloadLabel(normalized);
  const weather = normalizeIntegrationWeather(payload.weather || signal.weather || signal.metadata?.weather);
  const news = normalizeIntegrationNews(payload.news || payload.dailyContext?.news || signal.news || signal.metadata?.news);
  const entertainment = normalizeIntegrationEntertainment(payload.entertainment || payload.dailyContext?.entertainment || signal.entertainment || signal.metadata?.entertainment);
  const metrics = {
    ...(payload.metrics && typeof payload.metrics === "object" ? payload.metrics : {}),
    ...(weather ? {
      weatherTemperatureC: weather.temperatureC,
      weatherApparentC: weather.apparentC,
      weatherHumidity: weather.humidity,
      weatherWindKph: weather.windKph,
      weatherCode: weather.weatherCode,
    } : {}),
  };
  const dataType = payload.dataType || payload.recordType || normalized.payloadType;
  const rows = Array.isArray(payload.records)
    ? payload.records
    : Array.isArray(payload.samples)
      ? payload.samples
      : [signal];
  return {
    id: stableIntegrationId("ctx", idempotencyKey),
    title: label,
    category: normalizeCategoryName(normalized.payloadType === "location" ? "Viajes / Paseos" : "Salud"),
    timestamp: normalized.capturedAt,
    duration: 0,
    mood: "Observado",
    energy: inferEnergyFromIntegrationPayload(normalized),
    location: payload.location || signal.location || "Dato del dispositivo",
    people: normalized.participantId || "Sin personas",
    notes: buildContextSignalSummary(normalized),
    objective: "Conservar contexto transversal de dispositivo para análisis por fecha y hora.",
    pilotParticipantId: normalized.participantId,
    pilotParticipantName: normalized.participantId,
    sourceType: normalized.sourceType,
    locale: signal.locale || "es",
    metadata: {
      ...buildIntegrationMetadata(normalized, signal, user, { target: "context" }),
      structuredContext: {
        id: stableIntegrationId("structured", idempotencyKey),
        connector: normalized.sourceType,
        sourceId: normalized.sourceId,
        idempotencyKey,
        payloadType: normalized.payloadType,
        dataType,
        capturedAt: normalized.capturedAt,
        summary: buildContextSignalSummary(normalized),
        metrics,
        weather,
        news,
        entertainment,
        signals: rows,
      },
    },
    events: [
      {
        id: stableIntegrationId("evt", idempotencyKey),
        title: label,
        description: buildContextSignalSummary(normalized),
        timestamp: normalized.capturedAt,
        order: 1,
      },
    ],
  };
}

function buildIntegrationMetadata(normalized, signal = {}, user = null, extra = {}) {
  return removeEmptyMetadataFields({
    ...(isPlainObject(signal.metadata) ? signal.metadata : {}),
    integration: true,
    integrationVersion: INTEGRATION_CONTRACT_VERSION,
    sourceId: normalized.sourceId,
    sourceType: normalized.sourceType,
    payloadType: normalized.payloadType,
    privacyLevel: normalized.privacyLevel,
    participantId: normalized.participantId,
    idempotencyKey: normalized.idempotencyKey,
    capturedAt: normalized.capturedAt,
    linkedExperienceId: normalized.linkedExperienceId,
    userId: user?.id || "",
    deviceMetadata: normalized.deviceMetadata,
    ...extra,
  });
}

function integrationPayloadLabel(normalized) {
  const payload = isPlainObject(normalized.payload) ? normalized.payload : {};
  const source = normalized.sourceType || "dispositivo";
  const dataType = payload.dataType || payload.recordType || payload.type || normalized.payloadType;
  if (normalized.payloadType === "sleep") return `Sueño desde ${source}`;
  if (normalized.payloadType === "activity") return `Actividad desde ${source}`;
  if (normalized.payloadType === "location") return `Ubicación desde ${source}`;
  if (normalized.payloadType === "biometric") return `Biometría desde ${source}`;
  return `Contexto desde ${source}: ${dataType}`;
}

function buildContextSignalSummary(normalized) {
  const payload = isPlainObject(normalized.payload) ? normalized.payload : {};
  const metrics = payload.metrics && typeof payload.metrics === "object"
    ? Object.entries(payload.metrics).slice(0, 4).map(([key, value]) => `${key}: ${value}`).join(", ")
    : "";
  const weather = normalizeIntegrationWeather(payload.weather);
  const weatherText = weather
    ? ` Clima: ${weather.description || "observado"}${Number.isFinite(Number(weather.temperatureC)) ? `, ${weather.temperatureC}C` : ""}.`
    : "";
  const dataType = payload.dataType || payload.recordType || normalized.payloadType;
  return `Señal ${dataType} recibida desde ${normalized.sourceType}. ${metrics || "Disponible para cruce por fecha/hora."}${weatherText}`.trim();
}

function normalizeIntegrationWeather(weather = null) {
  if (!isPlainObject(weather)) return null;
  const normalized = {
    source: String(weather.source || "device").trim() || "device",
    time: weather.time || weather.observedAt || null,
    temperatureC: normalizeOptionalNumber(weather.temperatureC ?? weather.temperature_c ?? weather.temperature),
    apparentC: normalizeOptionalNumber(weather.apparentC ?? weather.apparent_c ?? weather.apparentTemperature),
    humidity: normalizeOptionalNumber(weather.humidity ?? weather.humidityPct ?? weather.relativeHumidity),
    windKph: normalizeOptionalNumber(weather.windKph ?? weather.wind_kph ?? weather.windSpeed),
    isDay: typeof weather.isDay === "boolean" ? weather.isDay : null,
    weatherCode: normalizeOptionalNumber(weather.weatherCode ?? weather.weather_code),
    description: String(weather.description || "").trim(),
  };
  return Object.values(normalized).some((value) => value !== null && value !== "") ? normalized : null;
}

function normalizeIntegrationNews(news = null) {
  if (!isPlainObject(news)) return null;
  const normalizeItems = (items = []) => Array.isArray(items)
    ? items.slice(0, 12).map((item) => ({
        title: String(item?.title || "").trim(),
        summary: String(item?.summary || item?.description || "").trim(),
        url: String(item?.url || "").trim(),
        source: String(item?.source || item?.domain || "").trim(),
        section: String(item?.section || "").trim(),
        image: item?.image || null,
        seenAt: item?.seenAt || item?.publishedAt || null,
      })).filter((item) => item.title || item.summary || item.url)
    : [];
  const normalized = {
    local: normalizeItems(news.local),
    global: normalizeItems(news.global || news.world),
  };
  return normalized.local.length || normalized.global.length ? normalized : null;
}

function normalizeIntegrationEntertainment(items = null) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 12).map((item) => ({
    title: String(item?.title || "").trim(),
    type: String(item?.type || "event").trim(),
    venue: String(item?.venue || "").trim(),
    time: item?.time || null,
    image: item?.image || null,
    url: String(item?.url || "").trim(),
    source: String(item?.source || "").trim(),
  })).filter((item) => item.title || item.url);
}

function normalizeOptionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function inferEnergyFromIntegrationPayload(normalized) {
  const payload = isPlainObject(normalized.payload) ? normalized.payload : {};
  const metrics = payload.metrics && typeof payload.metrics === "object" ? payload.metrics : payload;
  const estimate = estimateBiometricEnergyFromMetrics(metrics, normalized.payloadType);
  return Number.isFinite(estimate) ? estimate : null;
}

function estimateBiometricEnergyFromMetrics(metrics = {}, payloadType = "") {
  if (!metrics || typeof metrics !== "object") return null;
  const scoreSignals = [
    normalizeOptionalNumber(metrics.readinessScore ?? metrics.readiness ?? metrics.recoveryScore),
    normalizeOptionalNumber(metrics.sleepScore),
    normalizeOptionalNumber(metrics.activityScore),
  ].filter((value) => Number.isFinite(value) && value > 0);
  let score = scoreSignals.length ? average(scoreSignals) / 10 : null;
  let evidence = scoreSignals.length;
  const ensureScore = () => {
    if (!Number.isFinite(score)) score = 6;
  };
  const sleepMinutes = normalizeSleepMinutes(metrics);
  const steps = normalizeMetricNumber(metrics.steps ?? metrics.stepCount ?? metrics.count);
  const activeEnergy = normalizeMetricNumber(metrics.activeEnergyKcal ?? metrics.activeCalories ?? metrics.activeEnergy ?? metrics.calories);
  const workoutMinutes = normalizeMetricNumber(metrics.workoutMinutes ?? metrics.exerciseMinutes ?? metrics.activityMinutes);
  const heartAvg = normalizeMetricNumber(metrics.heartRateAvg ?? metrics.heartAvg ?? metrics.averageHeartRate);
  const restingHeart = normalizeMetricNumber(metrics.restingHeartRate ?? metrics.restingHeartRateAvg);
  const hrvMs = normalizeMetricNumber(metrics.hrvMs ?? metrics.hrv ?? metrics.hrvRmssd);
  const stressHighSeconds = normalizeMetricNumber(metrics.stressHighSeconds ?? metrics.stressHigh);
  const recoveryHighSeconds = normalizeMetricNumber(metrics.recoveryHighSeconds ?? metrics.recoveryHigh);
  const temperatureDeviation = Math.abs(normalizeMetricNumber(metrics.temperatureDeviationC ?? metrics.temperatureDeviation ?? metrics.temperatureTrendDeviationC));
  if (sleepMinutes > 0) {
    ensureScore();
    evidence += 1;
    const sleepHours = sleepMinutes / 60;
    if (sleepHours >= 7 && sleepHours <= 9.5) score += 0.9;
    else if (sleepHours >= 6) score += 0.3;
    else score -= 1.1;
  }
  if (steps > 0) {
    ensureScore();
    evidence += 1;
    if (steps >= 12000) score += 1.0;
    else if (steps >= 8000) score += 0.7;
    else if (steps < 2500) score -= 0.4;
  }
  if (activeEnergy > 0) {
    ensureScore();
    evidence += 1;
    if (activeEnergy >= 450) score += 0.8;
    else if (activeEnergy >= 250) score += 0.4;
  }
  if (workoutMinutes > 0) {
    ensureScore();
    evidence += 1;
    score += workoutMinutes >= 30 ? 0.7 : 0.3;
  }
  if (restingHeart > 0) {
    ensureScore();
    evidence += 1;
    if (restingHeart <= 60) score += 0.4;
    if (restingHeart >= 80) score -= 0.7;
  }
  if (heartAvg > 0) {
    ensureScore();
    evidence += 1;
    if (heartAvg >= 105) score -= 0.8;
    else if (heartAvg >= 90) score -= 0.2;
  }
  if (hrvMs > 0) {
    ensureScore();
    evidence += 1;
    if (hrvMs >= 45) score += 0.4;
    else if (hrvMs < 25) score -= 0.5;
  }
  if (stressHighSeconds > 0) {
    ensureScore();
    evidence += 1;
    if (stressHighSeconds >= 2 * 60 * 60) score -= 0.8;
    else score -= 0.3;
  }
  if (recoveryHighSeconds > 0) {
    ensureScore();
    evidence += 1;
    if (recoveryHighSeconds >= 2 * 60 * 60) score += 0.6;
  }
  if (temperatureDeviation > 0) {
    ensureScore();
    evidence += 1;
    if (temperatureDeviation >= 0.5) score -= 0.6;
  }
  if (!evidence || !Number.isFinite(score)) return null;
  return clampServerNumber(Number(score.toFixed(1)), 1, 10);
}

function normalizeMetricNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeSleepMinutes(metrics = {}) {
  const direct = normalizeMetricNumber(metrics.sleepMinutes ?? metrics.durationMinutes);
  if (direct) return direct;
  const seconds = normalizeMetricNumber(metrics.totalSleepDuration ?? metrics.totalSleepSeconds ?? metrics.total_sleep_duration);
  if (seconds) return seconds > 24 * 60 ? seconds / 60 : seconds;
  const hours = normalizeMetricNumber(metrics.sleepHours);
  return hours ? hours * 60 : 0;
}

function stableIntegrationId(prefix, key) {
  const value = String(key || randomUUID());
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 18)}`;
}

function clampServerNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function buildVibeappSimulationSamples(now = new Date().toISOString()) {
  return [
    {
      name: "quick-note",
      label: "Nota rapida",
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
      label: "Agenda",
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
      label: "Foto",
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
      label: "Video",
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
      label: "Audio",
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
      label: "Biometria",
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
      label: "Ubicacion",
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
      label: "Sesion Meta/Oakley",
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
}

function runVibeappIntegrationSimulation(user = null) {
  const checkedAt = new Date().toISOString();
  const samples = buildVibeappSimulationSamples(checkedAt);
  const results = samples.map((sample) => {
    const validation = validateIntegrationSignal(sample.signal, user);
    const routeOk = validation.target === sample.expectedTarget;
    return {
      name: sample.name,
      label: sample.label,
      expectedTarget: sample.expectedTarget,
      target: validation.target,
      ok: validation.ok && routeOk && validation.warnings.length === 0,
      validationOk: validation.ok,
      routeOk,
      errors: validation.errors,
      warnings: validation.warnings,
      payloadType: validation.normalized.payloadType,
      sourceType: validation.normalized.sourceType,
      traceId: validation.traceId,
    };
  });
  const targetSummary = results.reduce((acc, item) => {
    acc[item.target] = (acc[item.target] || 0) + 1;
    return acc;
  }, {});
  const ok = results.every((item) => item.ok);
  return {
    ok,
    checkedAt,
    schemaVersion: INTEGRATION_CONTRACT_VERSION,
    samples: results.length,
    passed: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    targetSummary,
    results,
  };
}

async function ensureStore() {
  await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(STORE_PATH)) {
    await writeStore(defaultStore);
  }
  if (!existsSync(LOG_PATH)) {
    await writeFile(LOG_PATH, JSON.stringify([], null, 2), "utf-8");
  }
  if (!existsSync(ROUTINES_PATH)) {
    await writeFile(ROUTINES_PATH, JSON.stringify({}, null, 2), "utf-8");
  }
  if (!existsSync(PROFILE_PARAMETERS_PATH)) {
    await writeFile(PROFILE_PARAMETERS_PATH, JSON.stringify({}, null, 2), "utf-8");
  }
}

async function readStore() {
  const raw = await readFile(STORE_PATH, "utf-8");
  return { ...defaultStore, ...JSON.parse(raw) };
}

async function writeStore(store) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

async function mutateStore(mutator) {
  const operation = storeQueue.then(async () => {
    const store = await readStore();
    const result = await mutator(store);
    await writeStore(store);
    return result;
  });
  storeQueue = operation.catch(() => {});
  return operation;
}

async function readLogs() {
  if (!existsSync(LOG_PATH)) return [];
  const raw = await readFile(LOG_PATH, "utf-8");
  return JSON.parse(raw || "[]").slice(-80).reverse();
}

async function appendLog(level, message, details = {}) {
  const entry = {
    id: createId(),
    level,
    message,
    details,
    createdAt: new Date().toISOString(),
  };
  const operation = logQueue.then(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    const existing = existsSync(LOG_PATH) ? JSON.parse(await readFile(LOG_PATH, "utf-8")) : [];
    existing.push(entry);
    await writeFile(LOG_PATH, JSON.stringify(existing.slice(-300), null, 2), "utf-8");
  });
  logQueue = operation.catch(() => {});
  await operation;
  return entry;
}

async function readRoutineStore() {
  if (!existsSync(ROUTINES_PATH)) return {};
  const raw = await readFile(ROUTINES_PATH, "utf-8");
  return JSON.parse(raw || "{}");
}

async function readProfileParameters() {
  if (!existsSync(PROFILE_PARAMETERS_PATH)) return {};
  const raw = await readFile(PROFILE_PARAMETERS_PATH, "utf-8");
  return JSON.parse(raw || "{}");
}

async function readAgendaStore() {
  if (!existsSync(AGENDA_EVENTS_PATH)) return {};
  const raw = await readFile(AGENDA_EVENTS_PATH, "utf-8");
  return JSON.parse(raw || "{}");
}

async function writeAgendaStore(store) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(AGENDA_EVENTS_PATH, JSON.stringify(store, null, 2), "utf-8");
}

async function mutateAgendaStore(mutator, user = { id: LOCAL_USER_ID }) {
  const current = await readAgendaStore();
  const result = await mutator(current, user);
  await writeAgendaStore(current);
  return result;
}

async function writeProfileParameters(userId, profile) {
  const current = await readProfileParameters();
  current[userId] = {
    gender: profile.gender || "",
    birthYear: profile.birthYear ? Number(profile.birthYear) : null,
    age: profile.age ? Number(profile.age) : null,
    ageGroup: resolveAgeGroup(profile),
    experienceType: profile.experienceType || "auto",
    updatedAt: new Date().toISOString(),
  };
  await writeFile(PROFILE_PARAMETERS_PATH, JSON.stringify(current, null, 2), "utf-8");
  return current[userId];
}

async function getProfileParameters(userId) {
  const current = await readProfileParameters();
  return current[userId] || {};
}

async function writeRoutineStore(store) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(ROUTINES_PATH, JSON.stringify(store, null, 2), "utf-8");
}

async function mutateRoutineStore(mutator) {
  const operation = routineQueue.then(async () => {
    const store = await readRoutineStore();
    const result = await mutator(store);
    await writeRoutineStore(store);
    return result;
  });
  routineQueue = operation.catch(() => {});
  return operation;
}

async function readDailyBriefingStore() {
  await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(DAILY_BRIEFINGS_PATH)) return {};
  try {
    return JSON.parse(await readFile(DAILY_BRIEFINGS_PATH, "utf-8"));
  } catch {
    return {};
  }
}

async function writeDailyBriefingStore(store) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DAILY_BRIEFINGS_PATH, JSON.stringify(store, null, 2), "utf-8");
}

function activePersistence() {
  return STORAGE_ADAPTER === "supabase" && isSupabaseConfigured() ? "supabase" : "json-file";
}

function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && SUPABASE_SERVICE_ROLE_KEY);
}

async function getRequestUser(req) {
  if (activePersistence() !== "supabase") {
    return {
      id: LOCAL_USER_ID,
      email: "local-user@example.com",
      accessToken: null,
    };
  }
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) throw new HttpError(401, "auth_required");
  const user = await verifySupabaseUser(token);
  return { id: user.id, email: user.email, accessToken: token };
}

async function getOptionalRequestUser(req) {
  try {
    return await getRequestUser(req);
  } catch {
    return {
      id: LOCAL_USER_ID,
      email: "local-user@example.com",
      accessToken: null,
    };
  }
}

async function verifySupabaseUser(token) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new HttpError(401, `invalid_auth: ${text}`);
  return JSON.parse(text);
}

async function signInSupabasePassword(email, password) {
  if (activePersistence() !== "supabase") {
    throw new HttpError(503, "supabase_not_active", "La nube de Vibe no está lista para iniciar sesión.");
  }
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new HttpError(response.status === 400 ? 401 : response.status, "auth_rejected", cleanAuthError(text));
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new HttpError(502, "auth_invalid_response", "Vibe no recibió una respuesta válida de acceso.");
  }
  if (!data?.access_token) {
    throw new HttpError(502, "auth_missing_token", "Vibe no recibió el token de sesión.");
  }
  return data;
}

async function handleMobileAssistantMessage(body = {}, user = {}) {
  const system = limitAssistantText(body.system, 4000, "system");
  const text = limitAssistantText(body.text || body.userText || body.prompt, 8000, "text");
  if (!system || !text) {
    throw new HttpError(400, "assistant_payload_incomplete", "Falta el texto para consultar a V.");
  }
  const history = normalizeAssistantHistory(body.history);
  const maxTokens = Number(body.maxTokens || body.max_tokens || 700);
  const actionMode = isMobileAssistantActionMode(system);
  const assistantSystem = buildMobileAssistantSystem(system, actionMode);
  if (ARNES_ASSISTANT_ENABLED) {
    try {
      return await proxyMobileAssistantToArnes(body, { system: assistantSystem, text, history, maxTokens, user, actionMode });
    } catch (error) {
      await appendLog("warn", "arnes_assistant_proxy_failed", {
        userId: user.id,
        error: sanitizeDiagnosticError(error),
      });
    }
  }
  const result = await callMobileAssistantMessages({
    system: assistantSystem,
    messages: [...history, { role: "user", content: text }],
    maxTokens,
    actionMode,
  });
  const contract = normalizeMobileAssistantContract(result.text, { actionMode });
  await appendLog("info", "mobile_assistant_message", {
    userId: user.id,
    promptLength: text.length,
    historyTurns: history.length,
    model: result.model,
    actionMode,
    actions: contract.actions.length,
    contractFallback: contract.fallback,
  });
  return { ok: true, text: contract.text, answer: contract.answer, actions: contract.actions, model: result.model, source: "native-provider" };
}

async function getMobileAssistantStatus(user = {}) {
  const status = {
    ok: true,
    schemaVersion: "vibe-mobile-assistant-status-v1",
    generatedAt: new Date().toISOString(),
    userId: user.id || LOCAL_USER_ID,
    arnes: {
      enabled: ARNES_ASSISTANT_ENABLED,
      configured: Boolean(ARNES_ASSISTANT_URL),
      urlHost: safeUrlHost(ARNES_ASSISTANT_URL),
      timeoutMs: ARNES_ASSISTANT_TIMEOUT_MS,
      health: "not_checked",
    },
    fallback: {
      enabled: true,
      provider: MOBILE_ASSISTANT_PROVIDER,
    },
    contract: {
      messageEndpoint: "/api/mobile/assistant/message",
      statusEndpoint: "/api/mobile/assistant/status",
      responseFields: ["ok", "text", "answer", "actions", "model", "source"],
      arnesSourceValue: "arnes",
      fallbackSourceValue: "native-provider",
    },
  };
  if (!ARNES_ASSISTANT_ENABLED || !ARNES_ASSISTANT_URL) {
    return status;
  }
  try {
    const healthUrl = buildArnesHealthUrl(ARNES_ASSISTANT_URL);
    const response = await fetchWithTimeout(healthUrl, { method: "GET" }, Math.min(ARNES_ASSISTANT_TIMEOUT_MS, 5000));
    const text = await response.text();
    const payload = parseJsonPayload(text);
    status.arnes.health = response.ok ? "ok" : "error";
    status.arnes.httpStatus = response.status;
    status.arnes.llm = Boolean(payload.llm);
  } catch (error) {
    status.arnes.health = "error";
    status.arnes.error = sanitizeDiagnosticError(error);
  }
  return status;
}

function buildArnesHealthUrl(url = "") {
  try {
    const parsed = new URL(url);
    parsed.pathname = "/health";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "https://arnes-production.up.railway.app/health";
  }
}

function safeUrlHost(url = "") {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

async function proxyMobileAssistantToArnes(originalBody = {}, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (options.user?.accessToken) {
    headers.Authorization = `Bearer ${options.user.accessToken}`;
  }
  const payload = {
    ...originalBody,
    system: options.system,
    text: options.text,
    userText: options.text,
    prompt: options.text,
    history: options.history,
    maxTokens: options.maxTokens,
    user: {
      id: options.user?.id || LOCAL_USER_ID,
      email: options.user?.email || "",
    },
    backend: {
      baseUrl: VIBE_BACKEND_BASE_URL,
      endpoints: {
        vision: "/api/mobile/ai/vision",
        dailyContext: "/api/mobile/context/daily",
        healthSummary: "/api/mobile/context/health-summary",
      },
      authMode: "forward-user-bearer",
    },
  };
  const response = await fetchWithTimeout(ARNES_ASSISTANT_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  }, ARNES_ASSISTANT_TIMEOUT_MS);
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { text };
  }
  if (!response.ok) {
    throw new HttpError(response.status, "arnes_assistant_failed", data || text || response.statusText);
  }
  const answer = String(data.answer || data.text || data.message || "").trim();
  const contract = normalizeMobileAssistantContract(answer || JSON.stringify({ actions: data.actions || [], answer: "" }), {
    actionMode: options.actionMode,
    actions: data.actions,
    answer,
  });
  if (options.actionMode && contract.fallback) {
    throw new HttpError(502, "arnes_assistant_contract_invalid", "Arnes respondio sin JSON de acciones valido para V.");
  }
  await appendLog("info", "arnes_assistant_proxy_ok", {
    userId: options.user?.id || LOCAL_USER_ID,
    promptLength: options.text.length,
    historyTurns: options.history.length,
    actions: contract.actions.length,
    model: data.model || "arnes",
    actionMode: Boolean(options.actionMode),
    contractFallback: contract.fallback,
  });
  return {
    ok: data.ok !== false,
    text: contract.text,
    answer: contract.answer,
    actions: contract.actions,
    model: data.model || "arnes",
    source: "arnes",
  };
}

async function handleMobileAssistantVision(body = {}, user = {}) {
  const system = limitAssistantText(body.system, 4000, "system");
  const question = limitAssistantText(body.question || body.text || "Describe esta imagen de forma breve y util.", 4000, "question");
  const mediaType = String(body.mediaType || body.media_type || "image/jpeg").trim().toLowerCase();
  const data = String(body.data || body.base64 || "").trim();
  if (!system || !question || !data) {
    throw new HttpError(400, "assistant_vision_payload_incomplete", "Falta la imagen o la pregunta para analizar la foto.");
  }
  if (!/^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(mediaType)) {
    throw new HttpError(415, "assistant_vision_media_not_supported", "V puede analizar imagenes JPEG, PNG, WebP o HEIC.");
  }
  const approxBytes = Math.ceil((data.length * 3) / 4);
  if (approxBytes > 8_000_000) {
    throw new HttpError(413, "assistant_vision_image_too_large", "La imagen es muy grande para analizarla. Usa una version mas liviana.");
  }
  const result = await callMobileAssistantMessages({
    system,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType === "image/jpg" ? "image/jpeg" : mediaType,
              data,
            },
          },
          { type: "text", text: question },
        ],
      },
    ],
    maxTokens: Number(body.maxTokens || body.max_tokens || 700),
  });
  await appendLog("info", "mobile_assistant_vision", {
    userId: user.id,
    mediaType,
    approxBytes,
    model: result.model,
  });
  return { ok: true, text: result.text, model: result.model };
}

async function proxyMobileAnthropicMessages(body = {}, user = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "ai_messages_payload_invalid", "La solicitud de IA no tiene un formato válido.");
  }
  if (!Array.isArray(body.messages) || !body.messages.length) {
    throw new HttpError(400, "ai_messages_missing_messages", "Faltan mensajes para consultar a V.");
  }
  if (!ANTHROPIC_API_KEY) {
    throw new HttpError(503, "assistant_not_configured", "La IA de V no esta configurada en Railway. Define ANTHROPIC_API_KEY.");
  }
  const payload = {
    ...body,
    model: String(body.model || ANTHROPIC_MODEL),
    max_tokens: Math.max(1, Math.min(Number(body.max_tokens || body.maxTokens || 700), 2000)),
  };
  delete payload.maxTokens;
  const response = await fetch(`${ANTHROPIC_API_BASE_URL}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let decoded = {};
  try {
    decoded = text ? JSON.parse(text) : {};
  } catch {
    decoded = { raw: text };
  }
  if (!response.ok) {
    throw new HttpError(response.status, "assistant_provider_failed", decoded);
  }
  await appendLog("info", "mobile_ai_messages_proxy", {
    userId: user.id,
    model: decoded.model || payload.model,
    messageCount: body.messages.length,
  });
  return decoded;
}

async function proxyMobileTranscription(req, contentType = "", user = {}) {
  if (activeTranscriptionProvider() !== "openai" || !OPENAI_API_KEY) {
    throw new HttpError(503, "transcription_not_configured", "La transcripción de V no esta configurada en Railway.");
  }
  const boundaryMatch = String(contentType).match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2];
  if (!boundary) throw new HttpError(400, "missing_multipart_boundary", "La transcripción requiere multipart/form-data.");
  const body = await readRawBody(req, MAX_MEDIA_BODY_LENGTH);
  const parts = parseMultipartParts(body, boundary);
  const filePart = parts.find((part) => part.name === "file");
  if (!filePart?.content?.length) throw new HttpError(400, "missing_audio_file", "Falta el archivo de audio para transcribir.");
  const modelPart = parts.find((part) => part.name === "model");
  const model = String(modelPart?.content?.toString("utf8") || OPENAI_TRANSCRIPTION_MODEL).trim() || OPENAI_TRANSCRIPTION_MODEL;
  const audioType = filePart.contentType || "audio/webm";
  const form = new FormData();
  form.append("model", model);
  form.append("file", new Blob([filePart.content], { type: audioType }), filePart.filename || "audio.webm");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    throw new HttpError(response.status, "transcription_provider_failed", payload);
  }
  await appendLog("info", "mobile_ai_transcribe_proxy", {
    userId: user.id,
    model,
    mediaType: audioType,
    bytes: filePart.content.length,
  });
  return { text: String(payload.text || ""), ...payload };
}

async function createMobileRealtimeToken(body = {}, user = {}) {
  if (!OPENAI_REALTIME_API_KEY) {
    throw new HttpError(503, "realtime_not_configured", "La voz en tiempo real no esta configurada en Railway. Define OPENAI_REALTIME_API_KEY u OPENAI_API_KEY.");
  }
  const model = normalizeRealtimeIdentifier(body.model, OPENAI_REALTIME_MODEL);
  const voice = normalizeRealtimeIdentifier(body.voice, OPENAI_REALTIME_VOICE);
  const maxSessionMinutes = Math.max(1, Math.min(Number(body.maxSessionMinutes || body.max_session_minutes || OPENAI_REALTIME_MAX_SESSION_MINUTES), OPENAI_REALTIME_MAX_SESSION_MINUTES));
  const session = {
    type: "realtime",
    model,
    audio: {
      output: {
        voice,
      },
    },
    instructions: String(body.instructions || "Eres V, asistente de captura de experiencias. Responde breve, claro y con tono humano.").slice(0, 1200),
  };
  const response = await fetchWithTimeout(OPENAI_REALTIME_CLIENT_SECRET_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_REALTIME_API_KEY}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": hashUserForProvider(user),
    },
    body: JSON.stringify({ session }),
  }, OPENAI_REALTIME_TOKEN_TIMEOUT_MS);
  const text = await response.text();
  const payload = parseJsonPayload(text);
  if (!response.ok) {
    throw new HttpError(response.status, "realtime_token_failed", cleanProviderError(payload, text));
  }
  const clientSecret = payload.client_secret || payload.clientSecret || payload;
  const token = String(clientSecret.value || payload.value || payload.token || "").trim();
  if (!token) {
    throw new HttpError(502, "realtime_token_missing", "OpenAI no devolvio un token efimero valido.");
  }
  const expiresAt = clientSecret.expires_at || clientSecret.expiresAt || payload.expires_at || null;
  await appendLog("info", "mobile_realtime_token_created", {
    userId: user.id,
    model,
    voice,
    expiresAt,
  });
  return {
    ok: true,
    token,
    expiresAt,
    model: payload.session?.model || model,
    voice: payload.session?.audio?.output?.voice || voice,
    wsUrl: `${OPENAI_REALTIME_WS_BASE_URL}?model=${encodeURIComponent(payload.session?.model || model)}`,
    session: {
      id: payload.session?.id || "",
      type: payload.session?.type || "realtime",
      maxSessionMinutes,
    },
  };
}

function normalizeRealtimeIdentifier(value, fallback) {
  const raw = String(value || fallback || "").trim();
  const safe = raw.replace(/[^a-zA-Z0-9_.:-]/g, "");
  return safe || fallback;
}

function hashUserForProvider(user = {}) {
  return createHash("sha256").update(String(user.id || user.email || LOCAL_USER_ID)).digest("hex").slice(0, 32);
}

function parseJsonPayload(text = "") {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function cleanProviderError(payload = {}, text = "") {
  const error = payload.error || payload;
  const message = error.message || error.error_description || error.error || text || "provider_error";
  return String(message).replace(OPENAI_REALTIME_API_KEY || "__never__", "[openai_key]").slice(0, 240);
}

async function proxyMobileOuraCollection(collection = "", searchParams = new URLSearchParams(), user = {}) {
  const normalizedCollection = String(collection || "").trim();
  const manifest = buildOuraConnectorManifest();
  const allowed = new Set(manifest.dataTypes.map((item) => item.dataType));
  if (!allowed.has(normalizedCollection)) {
    throw new HttpError(404, "oura_collection_not_supported", {
      collection: normalizedCollection,
      allowed: [...allowed],
    });
  }
  const dataTypeConfig = manifest.dataTypes.find((item) => item.dataType === normalizedCollection);
  if (!dataTypeConfig) throw new HttpError(404, "oura_collection_not_configured");
  const storedTokens = await getStoredOuraTokens(user.id);
  if (!storedTokens?.access_token) {
    throw new HttpError(409, "oura_not_connected", {
      message: "Conecta Oura en VibePWA antes de leer datos desde Vibeapp.",
    });
  }
  const tokens = await refreshOuraTokensIfNeeded(user.id, storedTokens);
  const result = await fetchOuraCollection(dataTypeConfig, tokens, {
    start_date: searchParams.get("start_date") || "",
    end_date: searchParams.get("end_date") || "",
    start_datetime: searchParams.get("start_datetime") || "",
    end_datetime: searchParams.get("end_datetime") || "",
    maxPages: Number(searchParams.get("max_pages") || 12),
  });
  await appendLog("info", "mobile_oura_collection_proxy", {
    userId: user.id,
    collection: normalizedCollection,
    count: result.documents.length,
  });
  return { data: result.documents, pages: result.pages };
}

function normalizeAssistantHistory(history = []) {
  if (!Array.isArray(history)) return [];
  return history.slice(-8).map((item) => {
    const role = item?.role === "assistant" ? "assistant" : "user";
    const content = limitAssistantText(item?.text || item?.content || "", 2000, "history");
    return content ? { role, content } : null;
  }).filter(Boolean);
}

function isMobileAssistantActionMode(system = "") {
  const text = String(system || "");
  const hasActionsSchema = /["']?actions["']?\s*:|actions\s*\[|acciones\s*\[|action\s*:/i.test(text);
  const hasAnswerSchema = /["']?answer["']?\s*:|respuesta|answer/i.test(text);
  const requestsJsonOnly = /\bJSON\b|objeto\s+JSON|json\s+object|solo\s+un\s+json|only\s+json|devuelve\s+exclusivamente/i.test(text);
  return hasActionsSchema && hasAnswerSchema && requestsJsonOnly;
}

function buildMobileAssistantSystem(system = "", actionMode = false) {
  const base = String(system || "").trim();
  if (!actionMode) return base;
  return [
    base,
    "",
    "Contrato obligatorio de V modo agente:",
    "Devuelve exclusivamente un objeto JSON valido, sin Markdown, sin explicaciones y sin texto antes o despues.",
    "Formato exacto: {\"actions\":[{\"action\":\"answer\",\"note\":\"\"}],\"answer\":\"\"}.",
    "Si no puedes ejecutar una accion especifica, usa action=\"answer\" y explica en answer de forma breve.",
  ].join("\n");
}

function normalizeMobileAssistantContract(rawText = "", options = {}) {
  const actionMode = Boolean(options.actionMode);
  const suppliedActions = Array.isArray(options.actions) ? options.actions : [];
  const suppliedAnswer = String(options.answer || "").trim();
  const parsed = parseMobileAssistantJson(rawText) || parseMobileAssistantJson(suppliedAnswer);
  if (parsed && (Array.isArray(parsed.actions) || typeof parsed.answer === "string" || typeof parsed.text === "string")) {
    const actions = normalizeMobileAssistantActions(parsed.actions);
    const answer = String(parsed.answer || parsed.text || suppliedAnswer || "").trim();
    const canonical = actionMode ? JSON.stringify({ actions, answer }) : (answer || String(rawText || "").trim());
    return { text: canonical, answer: canonical, actions, fallback: false };
  }
  if (suppliedActions.length) {
    const actions = normalizeMobileAssistantActions(suppliedActions);
    const answer = suppliedAnswer || String(rawText || "").trim();
    const canonical = actionMode ? JSON.stringify({ actions, answer }) : answer;
    return { text: canonical, answer: canonical, actions, fallback: false };
  }
  const answer = String(rawText || suppliedAnswer || "").trim();
  if (actionMode) {
    const canonical = JSON.stringify({ actions: [{ action: "answer", note: "" }], answer });
    return { text: canonical, answer: canonical, actions: [{ action: "answer", note: "" }], fallback: true };
  }
  return { text: answer, answer, actions: [], fallback: false };
}

function normalizeMobileAssistantActions(actions = []) {
  if (!Array.isArray(actions)) return [];
  return actions.map((item) => {
    if (!item || typeof item !== "object") return null;
    const action = String(item.action || item.type || "").trim();
    if (!action) return null;
    return {
      ...item,
      action,
      note: String(item.note || item.message || item.answer || "").trim(),
    };
  }).filter(Boolean);
}

function parseMobileAssistantJson(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const candidates = [
    raw,
    raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim(),
    extractFirstJsonObject(raw),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // Keep trying looser candidates.
    }
  }
  return null;
}

function extractFirstJsonObject(text = "") {
  const raw = String(text || "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return "";
  return raw.slice(start, end + 1).trim();
}

function limitAssistantText(value, maxLength, fieldName) {
  const text = String(value || "").trim();
  if (text.length > maxLength) {
    throw new HttpError(413, "assistant_payload_too_large", `${fieldName} es muy largo para procesarlo en una sola solicitud.`);
  }
  return text;
}

async function callMobileAssistantMessages({ system, messages, maxTokens = 700, actionMode = false }) {
  const startedAt = Date.now();
  const preferredProvider = ["anthropic", "claude"].includes(MOBILE_ASSISTANT_PROVIDER) ? "anthropic" : "openai";
  const providerOrder = preferredProvider === "anthropic" ? ["anthropic", "openai"] : ["openai", "anthropic"];
  let lastError = null;
  for (const provider of providerOrder) {
    if (provider === "openai" && !OPENAI_API_KEY) continue;
    if (provider === "anthropic" && !ANTHROPIC_API_KEY) continue;
    try {
      const result = provider === "openai"
        ? await callOpenAIAssistantMessages({ system, messages, maxTokens, actionMode })
        : await callAnthropicMessages({ system, messages, maxTokens });
      await appendLog("info", "mobile_assistant_provider_ok", {
        provider,
        model: result.model,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      lastError = error;
      await appendLog("warn", "mobile_assistant_provider_failed", {
        provider,
        status: error.status || null,
        message: sanitizeDiagnosticError(error),
        durationMs: Date.now() - startedAt,
      });
    }
  }
  if (lastError) {
    throw lastError;
  }
  throw new HttpError(503, "assistant_not_configured", "La IA de V no esta configurada. Define ANTHROPIC_API_KEY u OPENAI_API_KEY.");
}

async function callAnthropicMessages({ system, messages, maxTokens = 700 }) {
  if (!ANTHROPIC_API_KEY) {
    throw new HttpError(503, "assistant_not_configured", "La IA de V no esta configurada en Railway. Define ANTHROPIC_API_KEY.");
  }
  const response = await fetchWithTimeout(`${ANTHROPIC_API_BASE_URL}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: Math.max(1, Math.min(Number(maxTokens) || 700, 1200)),
      system,
      messages,
    }),
  }, MOBILE_ASSISTANT_PROVIDER_TIMEOUT_MS);
  const raw = await response.text();
  let decoded = {};
  try {
    decoded = raw ? JSON.parse(raw) : {};
  } catch {
    decoded = { raw };
  }
  if (!response.ok) {
    const providerMessage = decoded?.error?.message || raw || `HTTP ${response.status}`;
    throw new HttpError(response.status, "assistant_provider_failed", providerMessage);
  }
  const content = Array.isArray(decoded.content) ? decoded.content : [];
  const text = content.map((part) => (part?.type === "text" ? String(part.text || "").trim() : "")).filter(Boolean).join("\n\n").trim();
  if (!text) {
    throw new HttpError(502, "assistant_empty_response", "La IA respondio sin texto util.");
  }
  return { text, model: decoded.model || ANTHROPIC_MODEL };
}

async function callOpenAIAssistantMessages({ system, messages, maxTokens = 700, actionMode = false }) {
  const openAiMessages = convertAssistantMessagesToOpenAI(system, messages);
  const payload = {
    model: OPENAI_ASSISTANT_MODEL,
    messages: openAiMessages,
    max_tokens: Math.max(1, Math.min(Number(maxTokens) || 700, 1200)),
  };
  if (actionMode) {
    payload.response_format = { type: "json_object" };
  }
  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }, MOBILE_ASSISTANT_PROVIDER_TIMEOUT_MS);
  const raw = await response.text();
  let decoded = {};
  try {
    decoded = raw ? JSON.parse(raw) : {};
  } catch {
    decoded = { raw };
  }
  if (!response.ok) {
    const providerMessage = decoded?.error?.message || raw || `HTTP ${response.status}`;
    throw new HttpError(response.status, "assistant_provider_failed", providerMessage);
  }
  const text = String(decoded?.choices?.[0]?.message?.content || "").trim();
  if (!text) {
    throw new HttpError(502, "assistant_empty_response", "La IA respondio sin texto util.");
  }
  return { text, model: decoded.model || OPENAI_ASSISTANT_MODEL };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new HttpError(504, "assistant_provider_timeout", `La IA no respondio dentro de ${Math.round(timeoutMs / 1000)} segundos.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function convertAssistantMessagesToOpenAI(system, messages = []) {
  const output = [{ role: "system", content: String(system || "") }];
  messages.forEach((message) => {
    const role = message?.role === "assistant" ? "assistant" : "user";
    output.push({
      role,
      content: convertAssistantContentToOpenAI(message?.content),
    });
  });
  return output;
}

function convertAssistantContentToOpenAI(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content || "");
  const parts = content.map((part) => {
    if (part?.type === "text") {
      return { type: "text", text: String(part.text || "") };
    }
    if (part?.type === "image" && part.source?.type === "base64") {
      const mediaType = String(part.source.media_type || "image/jpeg").replace("image/jpg", "image/jpeg");
      return {
        type: "image_url",
        image_url: { url: `data:${mediaType};base64,${part.source.data || ""}` },
      };
    }
    return null;
  }).filter(Boolean);
  return parts.length ? parts : "";
}

async function getProfile(user = { id: LOCAL_USER_ID, email: "local-user@example.com" }) {
  const parameters = await getProfileParameters(user.id || LOCAL_USER_ID);
  if (activePersistence() === "supabase") {
    const rows = await supabaseRest("profiles", {
      searchParams: { user_id: `eq.${user.id}`, limit: "1" },
      accessToken: user.accessToken,
    });
    if (rows[0]) return { ...fromProfileRow(rows[0]), ...parameters };
    return upsertProfile({ ...defaultStore.profile, userId: user.id, email: user.email }, user);
  }
  const store = await readStore();
  return { ...store.profile, ...parameters };
}

async function upsertProfile(profile, user = { id: LOCAL_USER_ID, email: "local-user@example.com" }) {
  const normalized = {
    ...defaultStore.profile,
    ...profile,
    userId: user.id || profile.userId || LOCAL_USER_ID,
    email: user.email || profile.email,
  };
  if (activePersistence() === "supabase") {
    let rows;
    try {
      rows = await supabaseRest("profiles", {
        method: "POST",
        searchParams: { on_conflict: "user_id" },
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(toProfileRow(normalized, true)),
        accessToken: user.accessToken,
      });
    } catch (error) {
      rows = await supabaseRest("profiles", {
        method: "POST",
        searchParams: { on_conflict: "user_id" },
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(toProfileRow(normalized, false)),
        accessToken: user.accessToken,
      });
    }
    const parameters = await writeProfileParameters(normalized.userId, normalized);
    return { ...fromProfileRow(rows[0]), ...parameters };
  }
  await writeProfileParameters(normalized.userId, normalized);
  return mutateStore((currentStore) => {
    currentStore.profile = normalized;
    return currentStore.profile;
  });
}

async function listExperiences(user = { id: LOCAL_USER_ID }) {
  if (activePersistence() === "supabase") {
    const rows = await supabaseRest("experiences", {
      searchParams: {
        user_id: `eq.${user.id}`,
        order: "occurred_at.desc",
      },
      accessToken: user.accessToken,
    });
    const [eventMap, assetMap] = await Promise.all([
      listExperienceEventsForRows(rows, user),
      listExperienceAssetsForRows(rows, user),
    ]);
    return Promise.all(
      rows.map((row) => {
        const experience = fromExperienceRow(row);
        const tableEvents = eventMap.get(experience.id);
        const tableAssets = assetMap.get(experience.id);
        return signExperienceMedia({
          ...experience,
          ...(tableEvents ? { events: tableEvents } : {}),
          ...(tableAssets?.length ? { attachments: tableAssets } : {}),
        });
      }),
    );
  }
  const store = await readStore();
  return store.experiences.map(normalizeExperience);
}

async function listAgendaEvents(user = { id: LOCAL_USER_ID }) {
  if (activePersistence() === "supabase" && !workspaceSchemaUnavailableRecently()) {
    try {
      const rows = await supabaseRest("agenda_events", {
        searchParams: {
          user_id: `eq.${user.id}`,
          order: "start_at.asc",
        },
        accessToken: user.accessToken,
      });
      workspaceSchemaState.available = true;
      workspaceSchemaState.checkedAt = new Date().toISOString();
      workspaceSchemaState.error = null;
      return rows.map(fromAgendaEventRow);
    } catch (error) {
      workspaceSchemaState.available = false;
      workspaceSchemaState.checkedAt = new Date().toISOString();
      workspaceSchemaState.error = sanitizeDiagnosticError(error);
    }
  }
  const store = await readAgendaStore();
  return (store[user.id || LOCAL_USER_ID] || []).map(normalizeAgendaEvent);
}

async function upsertAgendaEvent(agendaEvent, user = { id: LOCAL_USER_ID }) {
  const normalized = normalizeAgendaEvent(agendaEvent);
  if (activePersistence() === "supabase" && !workspaceSchemaUnavailableRecently()) {
    try {
      await upsertProfile(await getProfile(user), user);
      const rows = await supabaseRest("agenda_events", {
        method: "POST",
        searchParams: { on_conflict: "event_id" },
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(toAgendaEventRow(normalized, user)),
        accessToken: user.accessToken,
      });
      workspaceSchemaState.available = true;
      workspaceSchemaState.checkedAt = new Date().toISOString();
      workspaceSchemaState.error = null;
      return fromAgendaEventRow(rows[0]);
    } catch (error) {
      workspaceSchemaState.available = false;
      workspaceSchemaState.checkedAt = new Date().toISOString();
      workspaceSchemaState.error = sanitizeDiagnosticError(error);
    }
  }
  return mutateAgendaStore((store) => {
    const key = user.id || LOCAL_USER_ID;
    const current = Array.isArray(store[key]) ? store[key] : [];
    store[key] = [normalized, ...current.filter((item) => item.id !== normalized.id)];
    return normalized;
  }, user);
}

async function deleteAgendaEvent(id, user = { id: LOCAL_USER_ID }) {
  if (activePersistence() === "supabase" && !workspaceSchemaUnavailableRecently()) {
    try {
      await supabaseRest("agenda_events", {
        method: "DELETE",
        searchParams: {
          event_id: `eq.${id}`,
          user_id: `eq.${user.id}`,
        },
        headers: { Prefer: "return=minimal" },
        accessToken: user.accessToken,
      });
      workspaceSchemaState.available = true;
      workspaceSchemaState.checkedAt = new Date().toISOString();
      workspaceSchemaState.error = null;
      return;
    } catch (error) {
      workspaceSchemaState.available = false;
      workspaceSchemaState.checkedAt = new Date().toISOString();
      workspaceSchemaState.error = sanitizeDiagnosticError(error);
    }
  }
  await mutateAgendaStore((store) => {
    const key = user.id || LOCAL_USER_ID;
    store[key] = (store[key] || []).filter((item) => item.id !== id);
    return { ok: true };
  }, user);
}

async function upsertContextSignal(signal, user = { id: LOCAL_USER_ID }) {
  const normalized = normalizeContextSignal(signal, user);
  if (activePersistence() === "supabase") {
    const workspace = await getWorkspaceContext(user);
    if (workspace?.id && !workspaceSchemaUnavailableRecently()) {
      try {
        const rows = await supabaseRest("context_signals", {
          method: "POST",
          searchParams: { on_conflict: "signal_id" },
          headers: { Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify(toContextSignalRow(normalized, workspace.id, user)),
          accessToken: user.accessToken,
        });
        workspaceSchemaState.available = true;
        workspaceSchemaState.checkedAt = new Date().toISOString();
        workspaceSchemaState.error = null;
        return fromContextSignalRow(rows[0]);
      } catch (error) {
        await appendLog("warn", "context_signal_remote_skipped", {
          signalId: normalized.id,
          reason: sanitizeDiagnosticError(error),
        });
      }
    }
  }
  return mutateStore((currentStore) => {
    const contextSignals = Array.isArray(currentStore.contextSignals) ? currentStore.contextSignals : [];
    currentStore.contextSignals = [normalized, ...contextSignals.filter((item) => item.id !== normalized.id)];
    return normalized;
  });
}

async function listContextSignals(user = { id: LOCAL_USER_ID }, range = null) {
  if (activePersistence() === "supabase") {
    const workspace = await getWorkspaceContext(user);
    if (workspace?.id && !workspaceSchemaUnavailableRecently()) {
      try {
        const rows = await supabaseRest("context_signals", {
          searchParams: {
            workspace_id: `eq.${workspace.id}`,
            order: "captured_at.desc",
            limit: "500",
          },
          accessToken: user.accessToken,
        });
        workspaceSchemaState.available = true;
        workspaceSchemaState.checkedAt = new Date().toISOString();
        workspaceSchemaState.error = null;
        return rows.map(fromContextSignalRow).filter((item) => !range || isTimestampInRange(item.capturedAt, range));
      } catch (error) {
        await appendLog("warn", "context_signal_list_remote_skipped", {
          reason: sanitizeDiagnosticError(error),
        });
      }
    }
  }
  const store = await readStore();
  const items = Array.isArray(store.contextSignals) ? store.contextSignals : [];
  return items
    .filter((item) => !range || isTimestampInRange(item.capturedAt, range))
    .sort((a, b) => new Date(b.capturedAt || 0) - new Date(a.capturedAt || 0));
}

async function upsertExperience(experience, user = { id: LOCAL_USER_ID }) {
  const normalized = normalizeExperience(experience);
  if (activePersistence() === "supabase") {
    await upsertProfile(await getProfile(user), user);
    const mediaReady = await persistExperienceMedia(normalized, user);
    const row = await toExperienceRow(mediaReady, user);
    const rows = await supabaseRest("experiences", {
      method: "POST",
      searchParams: { on_conflict: "experience_id" },
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(row),
      accessToken: user.accessToken,
    });
    const savedExperience = fromExperienceRow(rows[0]);
    await syncExperienceEventsToSupabase(savedExperience, user);
    await syncExperienceAssetsToSupabase(savedExperience, user);
    return signExperienceMedia(savedExperience);
  }
  return mutateStore((currentStore) => {
    currentStore.experiences = [normalized, ...currentStore.experiences.filter((item) => item.id !== normalized.id)];
    return normalized;
  });
}

async function persistExperienceMedia(experience, user = { id: LOCAL_USER_ID }) {
  if (activePersistence() !== "supabase") return experience;
  const attachments = await Promise.all(
    (experience.attachments || []).map(async (attachment) => {
      if (attachment.path) return attachment;
      if (!attachment.dataUrl) return attachment;
      try {
        return await saveMedia(attachment, user);
      } catch {
        return { ...attachment, storage: attachment.storage || "inline", remoteSyncFailed: true };
      }
    }),
  );
  return { ...experience, attachments };
}

async function getWorkspaceContext(user = { id: LOCAL_USER_ID, email: "local-user@example.com" }) {
  if (activePersistence() !== "supabase" || !user?.id) return null;
  if (workspaceSchemaUnavailableRecently()) return null;
  try {
    const existing = await supabaseRest("workspaces", {
      searchParams: { owner_user_id: `eq.${user.id}`, limit: "1" },
      accessToken: user.accessToken,
    });
    let workspace = existing[0];
    if (!workspace) {
      const created = await supabaseRest("workspaces", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          name: user.email ? `${user.email} workspace` : "Experience Hub workspace",
          owner_user_id: user.id,
        }),
        accessToken: user.accessToken,
      });
      workspace = created[0];
    }
    if (!workspace?.workspace_id) return null;
    await supabaseRest("workspace_members", {
      method: "POST",
      searchParams: { on_conflict: "workspace_id,user_id" },
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        workspace_id: workspace.workspace_id,
        user_id: user.id,
        role: "owner",
      }),
      accessToken: user.accessToken,
    });
    workspaceSchemaState.available = true;
    workspaceSchemaState.checkedAt = new Date().toISOString();
    workspaceSchemaState.error = null;
    return { id: workspace.workspace_id, role: "owner" };
  } catch (error) {
    workspaceSchemaState.available = false;
    workspaceSchemaState.checkedAt = new Date().toISOString();
    workspaceSchemaState.error = sanitizeDiagnosticError(error);
    return null;
  }
}

function defaultMobileParticipant(user = { id: LOCAL_USER_ID, email: "local-user@example.com" }) {
  const email = String(user?.email || "").trim();
  const emailName = email.includes("@") ? email.split("@")[0] : email;
  const rawName = emailName || "Mi cuenta";
  const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  return {
    id: String(user?.id || LOCAL_USER_ID),
    name,
    email,
    status: "active",
    source: "account-default",
  };
}

async function listMobileParticipants(user = { id: LOCAL_USER_ID, email: "local-user@example.com" }) {
  const fallback = defaultMobileParticipant(user);
  if (activePersistence() !== "supabase") {
    return { ok: true, participants: [fallback], selectedParticipantId: fallback.id, source: "local-fallback" };
  }
  const workspace = await getWorkspaceContext(user);
  if (!workspace?.id) {
    return { ok: true, participants: [fallback], selectedParticipantId: fallback.id, source: "workspace-fallback" };
  }
  try {
    const rows = await supabaseRest("participants", {
      searchParams: {
        workspace_id: `eq.${workspace.id}`,
        status: "neq.archived",
        order: "display_name.asc",
        limit: "100",
      },
      accessToken: user.accessToken,
    });
    const participants = rows
      .map((row) => ({
        id: String(row.participant_id || "").trim(),
        name: String(row.display_name || row.participant_id || "").trim(),
        email: String(row.email || "").trim(),
        status: String(row.status || "active").trim() || "active",
        source: "workspace",
      }))
      .filter((item) => item.id && item.name);
    if (!participants.length) {
      return { ok: true, participants: [fallback], selectedParticipantId: fallback.id, workspaceId: workspace.id, source: "empty-workspace-fallback" };
    }
    return {
      ok: true,
      participants,
      selectedParticipantId: participants[0].id,
      workspaceId: workspace.id,
      source: "workspace",
    };
  } catch (error) {
    return {
      ok: true,
      participants: [fallback],
      selectedParticipantId: fallback.id,
      source: "participants-fallback",
      warning: sanitizeDiagnosticError(error),
    };
  }
}

function normalizeParticipantPayload(participant = {}, user = { id: LOCAL_USER_ID }) {
  const participantId = String(participant.id || participant.participantId || "").trim();
  const displayName = String(participant.name || participant.displayName || participant.display_name || participantId).trim();
  const status = String(participant.status || "active").trim().toLowerCase() || "active";
  return {
    participantId,
    displayName,
    email: String(participant.email || "").trim() || null,
    segment: String(participant.role || participant.segment || "").trim() || null,
    status,
    metadata: {
      source: "vibepwa-group-management-v1",
      ownerUserId: user.id || null,
      syncedAt: new Date().toISOString(),
      archivedAt: status === "archived" ? (participant.archivedAt || new Date().toISOString()) : null,
      reactivatedAt: status === "active" && participant.reactivatedAt ? participant.reactivatedAt : null,
    },
  };
}

async function upsertParticipantRecord(participant, user = { id: LOCAL_USER_ID }) {
  const workspace = await getWorkspaceContext(user);
  if (!workspace?.id) throw new HttpError(409, "workspace_unavailable", "No se encontro workspace activo para sincronizar el grupo.");
  const normalized = normalizeParticipantPayload(participant, user);
  if (!normalized.participantId || !normalized.displayName) {
    throw new HttpError(400, "participant_required", "Falta nombre o identificador del grupo/persona.");
  }
  await supabaseRest("participants", {
    method: "POST",
    searchParams: { on_conflict: "workspace_id,participant_id" },
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      participant_id: normalized.participantId,
      workspace_id: workspace.id,
      display_name: normalized.displayName,
      email: normalized.email,
      segment: normalized.segment,
      status: normalized.status,
      metadata: normalized.metadata,
      updated_at: new Date().toISOString(),
    }),
    accessToken: user.accessToken,
  });
  return { ok: true, participantId: normalized.participantId, status: normalized.status, workspaceId: workspace.id };
}

async function updateParticipantLifecycle(participantId, body = {}, user = { id: LOCAL_USER_ID }) {
  const workspace = await getWorkspaceContext(user);
  if (!workspace?.id) throw new HttpError(409, "workspace_unavailable", "No se encontro workspace activo para actualizar el grupo.");
  const action = String(body.action || body.status || "").trim().toLowerCase();
  const status = action === "reactivate" || action === "active" ? "active" : "archived";
  const now = new Date().toISOString();
  await supabaseRest("participants", {
    method: "PATCH",
    searchParams: {
      workspace_id: `eq.${workspace.id}`,
      participant_id: `eq.${participantId}`,
    },
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      status,
      updated_at: now,
      metadata: {
        source: "vibepwa-group-lifecycle-v1",
        ownerUserId: user.id || null,
        archivedAt: status === "archived" ? now : null,
        reactivatedAt: status === "active" ? now : null,
        note: String(body.note || "").trim() || null,
      },
    }),
    accessToken: user.accessToken,
  });
  return { ok: true, participantId, status, workspaceId: workspace.id };
}

async function recordAccountClosureRequest(body = {}, user = { id: LOCAL_USER_ID, email: "local-user@example.com" }) {
  const now = new Date().toISOString();
  const request = {
    id: `closure-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    userId: user.id || LOCAL_USER_ID,
    email: user.email || body.email || "",
    requestedAt: now,
    reason: String(body.reason || "").trim(),
    appVersion: String(body.appVersion || ""),
    status: "requested",
    dataPolicy: "account_review_required_before_destructive_delete",
  };
  const filePath = path.join(DATA_DIR, "account-closure-requests.json");
  let existing = [];
  try {
    existing = JSON.parse(await readFile(filePath, "utf-8"));
    if (!Array.isArray(existing)) existing = [];
  } catch {
    existing = [];
  }
  await writeFile(filePath, JSON.stringify([request, ...existing].slice(0, 250), null, 2));
  return {
    ok: true,
    requestId: request.id,
    requestedAt: now,
    message: "Solicitud registrada. La cuenta no fue eliminada automaticamente; requiere respaldo, revision y confirmacion final.",
  };
}

async function resetUserContentData(body = {}, user = { id: LOCAL_USER_ID, email: "local-user@example.com" }) {
  const confirmation = String(body.confirmation || "").trim();
  const accepted = new Set(["BORRAR DATOS", "DELETE DATA", "SUPPRIMER LES DONNEES"]);
  if (!accepted.has(confirmation)) {
    throw new HttpError(400, "confirmation_required", "Escribe BORRAR DATOS para confirmar la limpieza de contenido.");
  }

  const now = new Date().toISOString();
  const includeGroups = Boolean(body.includeGroups);
  const summary = {
    ok: true,
    userId: user.id || LOCAL_USER_ID,
    resetAt: now,
    mode: includeGroups ? "content-and-groups" : "content-only",
    deleted: {},
    storage: { attempted: 0, deleted: 0, failed: 0 },
    warnings: [],
  };

  if (activePersistence() !== "supabase") {
    await mutateStore((currentStore) => {
      const before = currentStore.experiences.length;
      currentStore.experiences = [];
      summary.deleted.contextSignals = Array.isArray(currentStore.contextSignals) ? currentStore.contextSignals.length : 0;
      currentStore.contextSignals = [];
      summary.deleted.experiences = before;
      return { ok: true };
    });
    await mutateAgendaStore((store) => {
      const key = user.id || LOCAL_USER_ID;
      summary.deleted.agendaEvents = Array.isArray(store[key]) ? store[key].length : 0;
      store[key] = [];
      return { ok: true };
    }, user);
    await writeDailyBriefingStore({});
    summary.deleted.dailyBriefings = "local-store-cleared";
    return summary;
  }

  const workspaceIds = await listUserWorkspaceIdsForReset(user, summary);
  const storagePaths = await collectUserStoragePathsForReset(user, workspaceIds, summary);
  if (storagePaths.length) {
    summary.storage.attempted = storagePaths.length;
    const result = await deleteSupabaseObjects(storagePaths);
    summary.storage.deleted = result.deleted;
    summary.storage.failed = result.failed;
    summary.warnings.push(...result.warnings);
  }

  await deleteSupabaseRowsForReset("asset_upload_attempts", { user_id: `eq.${user.id}` }, summary);
  if (workspaceIds.length) {
    await deleteSupabaseRowsForReset("assets", { workspace_id: `in.(${workspaceIds.join(",")})` }, summary);
    await deleteSupabaseRowsForReset("context_signals", { workspace_id: `in.(${workspaceIds.join(",")})` }, summary);
    await deleteSupabaseRowsForReset("experience_events", { workspace_id: `in.(${workspaceIds.join(",")})` }, summary);
    await deleteSupabaseRowsForReset("participants", { workspace_id: `in.(${workspaceIds.join(",")})` }, summary);
  } else {
    await deleteSupabaseRowsForReset("context_signals", { owner_user_id: `eq.${user.id}` }, summary);
    await deleteSupabaseRowsForReset("assets", { owner_user_id: `eq.${user.id}` }, summary);
  }
  await deleteSupabaseRowsForReset("agenda_events", { user_id: `eq.${user.id}` }, summary);
  await deleteSupabaseRowsForReset("daily_briefings", { user_id: `eq.${user.id}` }, summary);
  await deleteSupabaseRowsForReset("experiences", { user_id: `eq.${user.id}` }, summary);

  if (includeGroups) {
    await deleteSupabaseRowsForReset("workspace_members", { user_id: `eq.${user.id}` }, summary);
    await deleteSupabaseRowsForReset("workspaces", { owner_user_id: `eq.${user.id}` }, summary);
  }

  await appendLog("warn", "user_content_reset_completed", {
    userId: user.id || LOCAL_USER_ID,
    email: user.email || "",
    mode: summary.mode,
    deleted: summary.deleted,
    storage: summary.storage,
  });
  return summary;
}

async function listUserWorkspaceIdsForReset(user, summary) {
  try {
    const rows = await supabaseRest("workspaces", {
      searchParams: {
        owner_user_id: `eq.${user.id}`,
        select: "workspace_id",
      },
    });
    return rows.map((row) => row.workspace_id).filter(Boolean);
  } catch (error) {
    summary.warnings.push(`workspaces_lookup_skipped: ${sanitizeDiagnosticError(error)}`);
    return [];
  }
}

async function collectUserStoragePathsForReset(user, workspaceIds, summary) {
  const paths = new Set();
  const addPath = (value) => {
    const clean = String(value || "").trim();
    if (clean && clean.startsWith(`${user.id}/`)) paths.add(clean);
  };

  try {
    const rows = await supabaseRest("experiences", {
      searchParams: {
        user_id: `eq.${user.id}`,
        select: "attachments",
      },
    });
    rows.forEach((row) => {
      const attachments = Array.isArray(row.attachments) ? row.attachments : [];
      attachments.forEach((attachment) => addPath(attachment?.path || attachment?.storagePath));
    });
  } catch (error) {
    summary.warnings.push(`experience_storage_lookup_skipped: ${sanitizeDiagnosticError(error)}`);
  }

  try {
    const assetFilter = workspaceIds.length ? { workspace_id: `in.(${workspaceIds.join(",")})` } : { owner_user_id: `eq.${user.id}` };
    const rows = await supabaseRest("assets", {
      searchParams: {
        ...assetFilter,
        select: "storage_path",
      },
    });
    rows.forEach((row) => addPath(row.storage_path));
  } catch (error) {
    summary.warnings.push(`asset_storage_lookup_skipped: ${sanitizeDiagnosticError(error)}`);
  }

  try {
    const rows = await supabaseRest("asset_upload_attempts", {
      searchParams: {
        user_id: `eq.${user.id}`,
        select: "storage_path",
      },
    });
    rows.forEach((row) => addPath(row.storage_path));
  } catch (error) {
    summary.warnings.push(`upload_attempt_storage_lookup_skipped: ${sanitizeDiagnosticError(error)}`);
  }

  return [...paths];
}

async function deleteSupabaseRowsForReset(table, searchParams, summary) {
  try {
    const rows = await supabaseRest(table, {
      method: "DELETE",
      searchParams,
      headers: { Prefer: "return=representation" },
    });
    summary.deleted[table] = Array.isArray(rows) ? rows.length : 0;
  } catch (error) {
    summary.deleted[table] = "skipped";
    summary.warnings.push(`${table}_delete_skipped: ${sanitizeDiagnosticError(error)}`);
  }
}

async function ensureExperienceParticipant(experience, workspaceId, user = { id: LOCAL_USER_ID }) {
  const participantId = String(experience?.pilotParticipantId || "").trim();
  if (!participantId || !workspaceId) return null;
  const displayName = String(experience?.pilotParticipantName || participantId).trim() || participantId;
  try {
    await supabaseRest("participants", {
      method: "POST",
      searchParams: { on_conflict: "workspace_id,participant_id" },
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        participant_id: participantId,
        workspace_id: workspaceId,
        display_name: displayName,
        email: null,
        status: "active",
        metadata: {
          source: "experience-capture-v1",
          ownerUserId: user.id || null,
          lastSeenAt: new Date().toISOString(),
        },
      }),
      accessToken: user.accessToken,
    });
    return { id: participantId, displayName };
  } catch (error) {
    workspaceSchemaState.available = false;
    workspaceSchemaState.checkedAt = new Date().toISOString();
    workspaceSchemaState.error = sanitizeDiagnosticError(error);
    return null;
  }
}

async function syncExperienceEventsToSupabase(experience, user = { id: LOCAL_USER_ID }) {
  const workspace = await getWorkspaceContext(user);
  if (!workspace?.id) return { synced: false, reason: "workspace_schema_unavailable" };
  const events = normalizeExperienceEvents(experience.events || [], experience.id);
  try {
    if (experience.pilotParticipantId) {
      const participant = await ensureExperienceParticipant(experience, workspace.id, user);
      if (!participant) return { synced: false, reason: "participant_sync_failed" };
    }
    await supabaseRest("experience_events", {
      method: "DELETE",
      searchParams: { experience_id: `eq.${experience.id}` },
      headers: { Prefer: "return=minimal" },
      accessToken: user.accessToken,
    });
    if (!events.length) return { synced: true, count: 0 };
    const eventRows = events.map((event, index) => toExperienceEventRow(event, experience, workspace.id, index));
    try {
      await supabaseRest("experience_events", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(eventRows),
        accessToken: user.accessToken,
      });
    } catch (error) {
      if (!isSupabaseMissingEventNarrativeColumns(error)) throw error;
      await supabaseRest("experience_events", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(eventRows.map(stripExperienceEventNarrativeColumns)),
        accessToken: user.accessToken,
      });
    }
    return { synced: true, count: events.length };
  } catch (error) {
    workspaceSchemaState.available = false;
    workspaceSchemaState.checkedAt = new Date().toISOString();
    workspaceSchemaState.error = sanitizeDiagnosticError(error);
    return { synced: false, reason: "event_sync_failed" };
  }
}

async function syncExperienceAssetsToSupabase(experience, user = { id: LOCAL_USER_ID }) {
  const workspace = await getWorkspaceContext(user);
  if (!workspace?.id) return { synced: false, reason: "workspace_schema_unavailable" };
  const attachments = Array.isArray(experience.attachments) ? experience.attachments : [];
  try {
    if (experience.pilotParticipantId) {
      const participant = await ensureExperienceParticipant(experience, workspace.id, user);
      if (!participant) return { synced: false, reason: "participant_sync_failed" };
    }
    const rows = attachments
      .map((attachment, index) => toAssetRow(attachment, experience, workspace.id, user, index))
      .filter(Boolean);
    if (!rows.length) return { synced: true, count: 0 };
    await supabaseRest("assets", {
      method: "POST",
      searchParams: { on_conflict: "asset_id" },
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
      accessToken: user.accessToken,
    });
    return { synced: true, count: rows.length };
  } catch (error) {
    workspaceSchemaState.available = false;
    workspaceSchemaState.checkedAt = new Date().toISOString();
    workspaceSchemaState.error = sanitizeDiagnosticError(error);
    return { synced: false, reason: "asset_sync_failed" };
  }
}

async function listExperienceEventsForRows(rows = [], user = { id: LOCAL_USER_ID }) {
  if (!rows.length || activePersistence() !== "supabase" || workspaceSchemaUnavailableRecently()) return new Map();
  const ids = rows.map((row) => row.experience_id).filter(Boolean);
  if (!ids.length) return new Map();
  try {
    const eventRows = await supabaseRest("experience_events", {
      searchParams: {
        experience_id: `in.(${ids.map(encodePostgrestListValue).join(",")})`,
        order: "event_order.asc",
      },
      accessToken: user.accessToken,
    });
    workspaceSchemaState.available = true;
    workspaceSchemaState.checkedAt = new Date().toISOString();
    workspaceSchemaState.error = null;
    return eventRows.reduce((map, row) => {
      const experienceId = row.experience_id;
      if (!map.has(experienceId)) map.set(experienceId, []);
      map.get(experienceId).push(fromExperienceEventRow(row));
      return map;
    }, new Map());
  } catch (error) {
    workspaceSchemaState.available = false;
    workspaceSchemaState.checkedAt = new Date().toISOString();
    workspaceSchemaState.error = sanitizeDiagnosticError(error);
    return new Map();
  }
}

async function listExperienceAssetsForRows(rows = [], user = { id: LOCAL_USER_ID }) {
  if (!rows.length || activePersistence() !== "supabase" || workspaceSchemaUnavailableRecently()) return new Map();
  const ids = rows.map((row) => row.experience_id).filter(Boolean);
  if (!ids.length) return new Map();
  try {
    const assetRows = await supabaseRest("assets", {
      searchParams: {
        experience_id: `in.(${ids.map(encodePostgrestListValue).join(",")})`,
        order: "created_at.asc",
      },
      accessToken: user.accessToken,
    });
    workspaceSchemaState.available = true;
    workspaceSchemaState.checkedAt = new Date().toISOString();
    workspaceSchemaState.error = null;
    return assetRows.reduce((map, row) => {
      const experienceId = row.experience_id;
      if (!experienceId) return map;
      if (!map.has(experienceId)) map.set(experienceId, []);
      map.get(experienceId).push(fromAssetRow(row));
      return map;
    }, new Map());
  } catch (error) {
    workspaceSchemaState.available = false;
    workspaceSchemaState.checkedAt = new Date().toISOString();
    workspaceSchemaState.error = sanitizeDiagnosticError(error);
    return new Map();
  }
}

function cleanEventNarrativeText(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLowValueEventNarrative(value = "") {
  const clean = cleanEventNarrativeText(value);
  if (!clean) return true;
  const words = clean.split(/\s+/).filter(Boolean);
  if (clean.length < 12 || words.length < 2) return true;
  if (/^(img|image|video|vid|audio|recording|foto|photo)[-_ ]?\d*/i.test(clean)) return true;
  if (/\b(image_picker|camera_capture|native-media|vibeapp-native|vibe-glasses)\b/i.test(clean)) return true;
  if (/\.(jpe?g|png|heic|webp|gif|mp4|mov|webm|m4v|mp3|wav|m4a|aac|pdf|docx?|txt|csv|json|zip)$/i.test(clean)) return true;
  if (/^(foto|imagen|video|audio)\s+capturad[oa]\s+desde\s+vibeapp/i.test(clean)) return true;
  if (/sin resumen narrativo suficiente|narrativa pendiente/i.test(clean)) return true;
  if (/extracci[oó]n local autom[aá]tica|revisi[oó]n multimodal guiada|estado mvp actual|evidencia consultable|revisar antes de publicar/i.test(clean)) return true;
  return false;
}

function getEventNarrativeText(event = {}) {
  const description = cleanEventNarrativeText(event.description);
  const title = cleanEventNarrativeText(event.title || event.text || event.name);
  const descriptionLooksHuman =
    description &&
    description.toLowerCase() !== title.toLowerCase() &&
    !isLowValueEventNarrative(description);
  return [
    event.narrativeText,
    event.narrative_text,
    event.narrative,
    event.humanNarrative,
    event.manualNote,
    event.voiceTranscript,
    event.transcript,
    event.notes,
    descriptionLooksHuman ? description : "",
  ]
    .map(cleanEventNarrativeText)
    .find((value) => value && !isLowValueEventNarrative(value)) || "";
}

function getEventNarrativeStatus(event = {}) {
  return getEventNarrativeText(event) ? "ok" : "pending";
}

function stripExperienceEventNarrativeColumns(row = {}) {
  const { narrative_text, narrative_status, ...rest } = row;
  return rest;
}

function isSupabaseMissingEventNarrativeColumns(error) {
  const detail = sanitizeDiagnosticError(error);
  return /narrative_text|narrative_status|schema cache|column/i.test(detail);
}

function toExperienceEventRow(event, experience, workspaceId, index = 0) {
  const participantId = experience.pilotParticipantId || null;
  const narrativeText = getEventNarrativeText(event);
  const narrativeStatus = narrativeText ? "ok" : "pending";
  return {
    event_id: event.id || `evt-${experience.id}-${index + 1}`,
    experience_id: experience.id,
    workspace_id: workspaceId,
    participant_id: participantId,
    event_order: Number(event.order || index + 1),
    title: event.title || event.description || `Evento ${index + 1}`,
    description: event.description || null,
    occurred_at: event.timestamp || experience.timestamp || null,
    duration_minutes: event.duration || null,
    mood: event.mood || null,
    energy: event.energy || null,
    narrative_text: narrativeText || null,
    narrative_status: narrativeStatus,
    metadata: buildSignalMetadata({
      existing: event.metadata,
      source: "experience-capture-v1",
      sourceType: event.sourceType || experience.sourceType || "manual",
      payloadType: "experience_event",
      experience,
      event: {
        ...event,
        narrativeText: narrativeText || null,
        narrativeStatus,
      },
      participantId,
      index,
    }),
  };
}

function fromExperienceEventRow(row) {
  return {
    id: row.event_id,
    title: row.title || "",
    description: row.description || "",
    order: Number(row.event_order || 0),
    timestamp: row.occurred_at || "",
    duration: row.duration_minutes || null,
    mood: row.mood || "",
    energy: row.energy || null,
    narrativeText: row.narrative_text || row.metadata?.event?.narrativeText || "",
    narrativeStatus: row.narrative_status || row.metadata?.event?.narrativeStatus || "pending",
  };
}

function normalizeContextSignal(signal = {}, user = { id: LOCAL_USER_ID }) {
  const now = new Date().toISOString();
  return {
    id: signal.id || signal.signalId || createId(),
    ownerUserId: signal.ownerUserId || signal.owner_user_id || user?.id || LOCAL_USER_ID,
    participantId: signal.participantId || signal.participant_id || "",
    sourceType: signal.sourceType || signal.source_type || "device",
    sourceDevice: signal.sourceDevice || signal.source_device || "",
    sourceId: signal.sourceId || signal.source_id || "",
    signalType: signal.signalType || signal.signal_type || "context",
    capturedAt: signal.capturedAt || signal.captured_at || now,
    validFrom: signal.validFrom || signal.valid_from || signal.capturedAt || now,
    validTo: signal.validTo || signal.valid_to || null,
    location: signal.location || "",
    metrics: isPlainObject(signal.metrics) ? signal.metrics : {},
    payload: isPlainObject(signal.payload) ? signal.payload : {},
    metadata: isPlainObject(signal.metadata) ? signal.metadata : {},
    createdAt: signal.createdAt || signal.created_at || now,
    updatedAt: signal.updatedAt || signal.updated_at || now,
  };
}

function toContextSignalRow(signal, workspaceId, user = { id: LOCAL_USER_ID }) {
  const normalized = normalizeContextSignal(signal, user);
  return {
    signal_id: normalized.id,
    workspace_id: workspaceId,
    owner_user_id: user.id || normalized.ownerUserId || null,
    participant_id: normalized.participantId || null,
    source_type: normalized.sourceType,
    source_device: normalized.sourceDevice || null,
    source_id: normalized.sourceId || null,
    signal_type: normalized.signalType,
    captured_at: normalized.capturedAt,
    valid_from: normalized.validFrom || normalized.capturedAt,
    valid_to: normalized.validTo || null,
    location: normalized.location || null,
    metrics: normalized.metrics || {},
    payload: normalized.payload || {},
    metadata: normalized.metadata || {},
    updated_at: new Date().toISOString(),
  };
}

function fromContextSignalRow(row = {}) {
  return normalizeContextSignal({
    id: row.signal_id,
    ownerUserId: row.owner_user_id,
    participantId: row.participant_id,
    sourceType: row.source_type,
    sourceDevice: row.source_device,
    sourceId: row.source_id,
    signalType: row.signal_type,
    capturedAt: row.captured_at,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    location: row.location,
    metrics: row.metrics,
    payload: row.payload,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function toAssetRow(attachment, experience, workspaceId, user, index = 0) {
  if (!attachment) return null;
  const kind = attachment.kind || inferServerMediaKind(attachment);
  const participantId = experience.pilotParticipantId || null;
  const adoptedAt = attachment.adoptedAt || attachment.adopted_at || attachment.metadata?.adoptedAt || new Date().toISOString();
  const adoptionMethod = attachment.adoptionMethod || attachment.adoption_method || attachment.metadata?.adoptionMethod || "experience_attachment";
  const adoptionConfidence = Number(attachment.adoptionConfidence ?? attachment.adoption_confidence ?? attachment.metadata?.adoptionConfidence ?? 1);
  return {
    asset_id: attachment.id || `asset-${experience.id}-${index + 1}`,
    workspace_id: workspaceId,
    owner_user_id: user.id || null,
    participant_id: participantId,
    experience_id: experience.id,
    event_id: attachment.eventId || attachment.metadata?.linkedEventId || null,
    name: attachment.name || `Activo ${index + 1}`,
    kind,
    mime_type: attachment.type || attachment.originalType || "application/octet-stream",
    size_bytes: Number(attachment.size || 0),
    storage_bucket: SUPABASE_STORAGE_BUCKET,
    storage_path: attachment.path || null,
    signed_url: null,
    evidence_type: attachment.evidenceType || attachment.evidence_type || attachment.metadata?.evidenceType || "intentional",
    adoption_status: "adopted",
    adopted_at: adoptedAt,
    adoption_method: adoptionMethod,
    adoption_confidence: Number.isFinite(adoptionConfidence) ? adoptionConfidence : 1,
    preview_text: attachment.previewText || "",
    analysis_text: attachment.analysisText || "",
    metadata: buildSignalMetadata({
      existing: attachment.metadata,
      source: "experience-attachment-v1",
      sourceType: attachment.sourceType || attachment.source || experience.sourceType || "file_upload",
      payloadType: kind,
      experience,
      attachment,
      participantId,
      user,
      index,
      extra: {
        extension: attachment.extension || "",
        storage: attachment.storage || "",
        storageBucket: SUPABASE_STORAGE_BUCKET,
        storagePath: attachment.path || "",
        previewable: attachment.previewable !== false,
        remoteSyncFailed: Boolean(attachment.remoteSyncFailed),
        remoteSyncError: attachment.remoteSyncError || attachment.uploadError || "",
        experienceTitle: experience.title || "",
        linkedEventId: attachment.eventId || attachment.metadata?.linkedEventId || "",
        linkedEventTitle: attachment.eventTitle || attachment.metadata?.linkedEventTitle || "",
        eventOrder: attachment.eventOrder || attachment.metadata?.eventOrder || "",
        processingStatus: inferAssetProcessingStatus(attachment, kind),
        evidenceType: attachment.evidenceType || attachment.evidence_type || attachment.metadata?.evidenceType || "intentional",
        adoptionStatus: "adopted",
        adoptedAt,
        adoptionMethod,
        adoptionConfidence: Number.isFinite(adoptionConfidence) ? adoptionConfidence : 1,
      },
    }),
  };
}

async function upsertAssetEvidence(media, user = { id: LOCAL_USER_ID }, options = {}) {
  const normalized = normalizeMedia(media);
  if (activePersistence() !== "supabase") return normalized;
  const requireRemote = Boolean(options.requireRemote);
  const workspace = await getWorkspaceContext(user);
  if (!workspace?.id) {
    if (requireRemote) throwAssetEvidencePersistenceError("asset_evidence_workspace_missing", "No se pudo resolver el workspace para registrar la evidencia.");
    return withAssetEvidenceRemoteFailure(normalized, "asset_evidence_workspace_missing");
  }
  if (workspaceSchemaUnavailableRecently()) {
    if (requireRemote) throwAssetEvidencePersistenceError("asset_evidence_workspace_unavailable", workspaceSchemaState.error || "La tabla de activos no esta disponible temporalmente.");
    return withAssetEvidenceRemoteFailure(normalized, "asset_evidence_workspace_unavailable");
  }
  try {
    const row = toAssetEvidenceRow(normalized, workspace.id, user);
    const rows = await supabaseRest("assets", {
      method: "POST",
      searchParams: { on_conflict: "asset_id" },
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(row),
      accessToken: user.accessToken,
    });
    workspaceSchemaState.available = true;
    workspaceSchemaState.checkedAt = new Date().toISOString();
    workspaceSchemaState.error = null;
    return {
      ...normalized,
      ...fromAssetRow(rows[0]),
      adoptionStatus: rows[0]?.adoption_status || inferMediaAdoptionStatus(normalized),
      evidenceType: rows[0]?.evidence_type || "intentional",
    };
  } catch (error) {
    if (isAssetOptionalAdoptionColumnError(error)) {
      const row = removeAssetOptionalAdoptionColumns(toAssetEvidenceRow(normalized, workspace.id, user));
      const rows = await supabaseRest("assets", {
        method: "POST",
        searchParams: { on_conflict: "asset_id" },
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(row),
        accessToken: user.accessToken,
      });
      await appendLog("warn", "asset_evidence_optional_columns_skipped", {
        assetId: normalized.id,
        reason: sanitizeDiagnosticError(error),
      });
      return {
        ...normalized,
        ...fromAssetRow(rows[0]),
        adoptionStatus: rows[0]?.adoption_status || inferMediaAdoptionStatus(normalized),
        evidenceType: rows[0]?.evidence_type || "intentional",
      };
    }
    const reason = sanitizeDiagnosticError(error);
    await appendLog("warn", "asset_evidence_remote_skipped", {
      assetId: normalized.id,
      reason,
    });
    if (requireRemote) throwAssetEvidencePersistenceError("asset_evidence_remote_write_failed", reason, error);
    return withAssetEvidenceRemoteFailure(normalized, reason);
  }
}

function withAssetEvidenceRemoteFailure(media, reason) {
  return {
    ...media,
    assetEvidenceSynced: false,
    remoteSyncFailed: true,
    remoteSyncError: reason || "asset_evidence_remote_write_failed",
  };
}

function throwAssetEvidencePersistenceError(code, detail, cause) {
  const error = new Error(code);
  error.statusCode = 502;
  error.detail = detail || code;
  error.cause = cause;
  throw error;
}

function isAssetOptionalAdoptionColumnError(error) {
  const detail = `${error?.message || ""} ${error?.detail || ""} ${JSON.stringify(error?.cause || {})}`;
  return detail.includes("PGRST204")
    && ["adopted_at", "adoption_method", "adoption_confidence", "pruned_at", "pruned_reason"].some((column) => detail.includes(column));
}

function removeAssetOptionalAdoptionColumns(row = {}) {
  const compatible = { ...row };
  delete compatible.adopted_at;
  delete compatible.adoption_method;
  delete compatible.adoption_confidence;
  delete compatible.pruned_at;
  delete compatible.pruned_reason;
  return compatible;
}

async function listAssetEvidence(user = { id: LOCAL_USER_ID }) {
  if (activePersistence() !== "supabase") return [];
  const workspace = await getWorkspaceContext(user);
  if (!workspace?.id || workspaceSchemaUnavailableRecently()) return [];
  try {
    const rows = await supabaseRest("assets", {
      searchParams: {
        workspace_id: `eq.${workspace.id}`,
        order: "captured_at.desc",
        limit: "250",
      },
      accessToken: user.accessToken,
    });
    workspaceSchemaState.available = true;
    workspaceSchemaState.checkedAt = new Date().toISOString();
    workspaceSchemaState.error = null;
    const repaired = await repairMissingAssetEvidenceRowsFromUploadAttempts(rows, user);
    return mergeAssetEvidenceRows(rows.map(fromAssetRow), repaired);
  } catch (error) {
    await appendLog("warn", "asset_evidence_list_remote_skipped", {
      reason: sanitizeDiagnosticError(error),
    });
    return [];
  }
}

async function repairMissingAssetEvidenceRowsFromUploadAttempts(assetRows = [], user = { id: LOCAL_USER_ID }) {
  const existingIds = new Set(assetRows.map((row) => row.asset_id).filter(Boolean));
  const attempts = await listAssetUploadAttempts(user, 100);
  const uploadedAttempts = attempts
    .filter((attempt) => attempt.status === "uploaded")
    .filter((attempt) => attempt.assetId && !existingIds.has(attempt.assetId))
    .filter((attempt) => attempt.storagePath && attempt.bucketId === SUPABASE_STORAGE_BUCKET);
  if (!uploadedAttempts.length) return [];
  const repaired = [];
  for (const attempt of uploadedAttempts) {
    try {
      const asset = await upsertAssetEvidence(buildAssetEvidenceFromUploadAttempt(attempt), user);
      if (asset?.id) {
        existingIds.add(asset.id);
        repaired.push(asset);
      }
    } catch (error) {
      await appendLog("warn", "asset_evidence_repair_failed", {
        assetId: attempt.assetId,
        fileName: attempt.fileName,
        reason: sanitizeDiagnosticError(error),
      });
    }
  }
  if (repaired.length) {
    await appendLog("info", "asset_evidence_repaired_from_upload_attempts", {
      repaired: repaired.length,
      source: "asset_upload_attempts",
    });
  }
  return repaired;
}

function mergeAssetEvidenceRows(primary = [], repaired = []) {
  const byId = new Map();
  [...primary, ...repaired].forEach((asset) => {
    const id = asset?.id || asset?.assetId || asset?.asset_id;
    if (id) byId.set(id, asset);
  });
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.capturedAt || b.uploadedAt || 0) - new Date(a.capturedAt || a.uploadedAt || 0),
  );
}

function buildAssetEvidenceFromUploadAttempt(attempt = {}) {
  const metadata = isPlainObject(attempt.metadata) ? attempt.metadata : {};
  return {
    id: attempt.assetId,
    name: attempt.fileName || "media",
    type: attempt.mimeType || "application/octet-stream",
    size: Number(attempt.sizeBytes || 0),
    storage: "supabase",
    path: attempt.storagePath || "",
    sourceType: metadata.sourceType || "vibeapp-native-media",
    sourceDevice: attempt.deviceId || metadata.sourceDevice || "",
    sourceId: metadata.sourceId || metadata.idempotencyKey || attempt.assetId || "",
    capturedAt: metadata.capturedAt || attempt.startedAt || attempt.finishedAt || new Date().toISOString(),
    uploadedAt: attempt.finishedAt || attempt.startedAt || new Date().toISOString(),
    participantId: metadata.participantId || "",
    experienceId: attempt.experienceId || metadata.linkedExperienceId || "",
    adoptionStatus: attempt.experienceId || metadata.linkedExperienceId ? "adopted" : "inbox",
    targetLayer: "evidence",
    payloadType: inferServerMediaKind({ type: attempt.mimeType, name: attempt.fileName }),
    metadata: removeEmptyMetadataFields({
      ...metadata,
      repairedFromUploadAttempt: true,
      repairedAt: new Date().toISOString(),
      idempotencyKey: metadata.idempotencyKey || "",
      storagePath: attempt.storagePath || "",
      storageBucket: attempt.bucketId || SUPABASE_STORAGE_BUCKET,
      adoptionStatus: attempt.experienceId || metadata.linkedExperienceId ? "adopted" : "inbox",
      inboxReason: attempt.experienceId || metadata.linkedExperienceId ? "" : "repaired_waiting_for_experience_adoption",
    }),
  };
}

async function adoptAssetEvidenceForExperience(body = {}, user = { id: LOCAL_USER_ID }) {
  if (activePersistence() !== "supabase") {
    return { ok: false, reason: "supabase_not_active", updated: 0, assets: [] };
  }
  const assetIds = [...new Set((Array.isArray(body.assetIds) ? body.assetIds : []).map((id) => String(id || "").trim()).filter(Boolean))];
  const experienceId = String(body.experienceId || "").trim();
  if (!assetIds.length || !experienceId) {
    const error = new Error("asset_adoption_payload_required");
    error.statusCode = 400;
    throw error;
  }
  const workspace = await getWorkspaceContext(user);
  if (!workspace?.id || workspaceSchemaUnavailableRecently()) {
    return { ok: false, reason: "workspace_unavailable", updated: 0, assets: [] };
  }
  const rows = await supabaseRest("assets", {
    searchParams: {
      workspace_id: `eq.${workspace.id}`,
      asset_id: `in.(${assetIds.map(encodePostgrestListValue).join(",")})`,
    },
    accessToken: user.accessToken,
  });
  const now = new Date().toISOString();
  const updatedAssets = [];
  for (const row of rows) {
    const metadata = removeEmptyMetadataFields({
      ...(isPlainObject(row.metadata) ? row.metadata : {}),
      linkedExperienceId: experienceId,
      linkedExperienceTitle: body.experienceTitle || "",
      participantId: body.participantId || row.participant_id || "",
      linkedEventId: body.eventId || row.event_id || "",
      linkedEventTitle: body.eventTitle || "",
      adoptionStatus: "adopted",
      adoptionMethod: body.method || "manual_window",
      adoptionConfidence: Number.isFinite(Number(body.confidence)) ? Number(body.confidence) : 1,
      adoptedAt: now,
      inboxReason: "",
    });
    const patch = removeEmptyMetadataFields({
      experience_id: experienceId,
      event_id: body.eventId || row.event_id || null,
      participant_id: body.participantId || row.participant_id || null,
      adoption_status: "adopted",
      adopted_at: now,
      adoption_method: body.method || "manual_window",
      adoption_confidence: Number.isFinite(Number(body.confidence)) ? Number(body.confidence) : 1,
      metadata,
      updated_at: now,
    });
    let updated;
    try {
      updated = await supabaseRest("assets", {
        method: "PATCH",
        searchParams: {
          workspace_id: `eq.${workspace.id}`,
          asset_id: `eq.${row.asset_id}`,
        },
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(patch),
        accessToken: user.accessToken,
      });
    } catch (error) {
      if (!isAssetOptionalAdoptionColumnError(error)) throw error;
      const compatiblePatch = removeAssetOptionalAdoptionColumns(patch);
      updated = await supabaseRest("assets", {
        method: "PATCH",
        searchParams: {
          workspace_id: `eq.${workspace.id}`,
          asset_id: `eq.${row.asset_id}`,
        },
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(compatiblePatch),
        accessToken: user.accessToken,
      });
      await appendLog("warn", "asset_adoption_optional_columns_skipped", {
        assetId: row.asset_id,
        reason: sanitizeDiagnosticError(error),
      });
    }
    updatedAssets.push(fromAssetRow(updated[0] || { ...row, ...patch }));
  }
  const foundIds = new Set(rows.map((row) => row.asset_id));
  const missingIds = assetIds.filter((id) => !foundIds.has(id));
  await appendLog("info", "asset_evidence_adopted", {
    experienceId,
    updated: updatedAssets.length,
    missing: missingIds.length,
    method: body.method || "manual_window",
  });
  return {
    ok: true,
    updated: updatedAssets.length,
    missingIds,
    assets: updatedAssets,
  };
}

async function getAssetEvidenceDownload(assetId = "", user = { id: LOCAL_USER_ID }) {
  const cleanId = String(assetId || "").trim();
  if (!cleanId) throw new HttpError(400, "asset_id_required");
  if (activePersistence() !== "supabase") throw new HttpError(503, "supabase_not_active");
  const workspace = await getWorkspaceContext(user);
  if (!workspace?.id) throw new HttpError(503, "workspace_unavailable");
  const rows = await supabaseRest("assets", {
    searchParams: {
      workspace_id: `eq.${workspace.id}`,
      asset_id: `eq.${cleanId}`,
      limit: "1",
    },
    accessToken: user.accessToken,
  });
  const row = rows[0];
  if (!row) throw new HttpError(404, "asset_not_found");
  if (!row.storage_path) throw new HttpError(409, "asset_binary_unavailable");
  const url = await createSignedObjectUrl(row.storage_path);
  return {
    ok: true,
    asset: fromAssetRow(row),
    url,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function toAssetEvidenceRow(media, workspaceId, user = { id: LOCAL_USER_ID }) {
  const normalized = normalizeMedia(media);
  const kind = normalized.kind || inferServerMediaKind(normalized);
  const linkedExperienceId = normalized.experienceId || normalized.metadata?.linkedExperienceId || "";
  const participantId = normalized.participantId || normalized.pilotParticipantId || normalized.metadata?.participantId || "";
  const adoptionStatus = inferMediaAdoptionStatus(normalized);
  return {
    asset_id: normalized.id,
    workspace_id: workspaceId,
    owner_user_id: user.id || null,
    participant_id: participantId || null,
    experience_id: linkedExperienceId || null,
    event_id: normalized.eventId || normalized.metadata?.linkedEventId || null,
    name: normalized.name || "Activo",
    kind,
    mime_type: normalized.type || normalized.originalType || "application/octet-stream",
    size_bytes: Number(normalized.size || 0),
    storage_bucket: SUPABASE_STORAGE_BUCKET,
    storage_path: normalized.path || null,
    signed_url: null,
    preview_text: normalized.previewText || "",
    analysis_text: normalized.analysisText || "",
    metadata: buildSignalMetadata({
      existing: normalized.metadata,
      source: "evidence-inbox-v1",
      sourceType: normalized.sourceType || normalized.source || "media_upload",
      payloadType: kind,
      attachment: normalized,
      participantId,
      user,
      extra: {
        evidenceModel: "intentional_evidence_v1",
        adoptionStatus,
        targetLayer: normalized.targetLayer || normalized.metadata?.targetLayer || "evidence",
        payloadType: normalized.payloadType || normalized.metadata?.payloadType || kind,
        linkedExperienceId,
        storage: normalized.storage || "",
        storageBucket: SUPABASE_STORAGE_BUCKET,
        storagePath: normalized.path || "",
        capturedAt: normalized.capturedAt || normalized.createdAt || "",
        inboxReason: linkedExperienceId ? "" : "waiting_for_experience_adoption",
      },
    }),
    source_type: normalized.sourceType || normalized.source || "media_upload",
    source_device: normalized.sourceDevice || normalized.device || null,
    source_id: normalized.sourceId || null,
    captured_at: normalized.capturedAt || normalized.createdAt || new Date().toISOString(),
    uploaded_at: normalized.uploadedAt || new Date().toISOString(),
    processing_status: normalized.processingStatus || inferAssetProcessingStatus(normalized, kind),
    permissions: normalized.permissions || normalized.metadata?.permissions || "private",
    metadata_fingerprint: normalized.fingerprint || normalized.metadata?.fingerprint || "",
    checksum: normalized.checksum || normalized.metadata?.checksum || null,
    evidence_type: "intentional",
    adoption_status: adoptionStatus,
    adopted_at: linkedExperienceId ? new Date().toISOString() : null,
    adoption_method: linkedExperienceId ? "explicit_link" : null,
    adoption_confidence: linkedExperienceId ? 1 : null,
  };
}

function inferMediaAdoptionStatus(media = {}) {
  if (media.experienceId || media.metadata?.linkedExperienceId) return "adopted";
  const explicit = String(media.adoptionStatus || media.metadata?.adoptionStatus || "").trim().toLowerCase();
  return explicit || "inbox";
}

function fromAssetRow(row) {
  const metadata = row.metadata || {};
  return {
    id: row.asset_id,
    name: row.name || "Activo",
    type: row.mime_type || "application/octet-stream",
    originalType: row.mime_type || "application/octet-stream",
    size: Number(row.size_bytes || 0),
    kind: row.kind || inferServerMediaKind({ type: row.mime_type }),
    storage: "supabase",
    path: row.storage_path || "",
    previewText: row.preview_text || "",
    analysisText: row.analysis_text || "",
    extractedText: metadata.extractedText || row.preview_text || "",
    detectedLanguage: metadata.detectedLanguage || "",
    translatedText: metadata.translatedText || "",
    translationLanguage: metadata.translationLanguage || "",
    experienceId: row.experience_id || metadata.linkedExperienceId || "",
    participantId: row.participant_id || metadata.participantId || "",
    adoptionStatus: row.adoption_status || metadata.adoptionStatus || "",
    adoptionMethod: row.adoption_method || metadata.adoptionMethod || "",
    adoptionConfidence: row.adoption_confidence ?? metadata.adoptionConfidence ?? null,
    adoptedAt: row.adopted_at || metadata.adoptedAt || "",
    evidenceType: row.evidence_type || metadata.evidenceType || "",
    extractionMethod: metadata.extractionMethod || "",
    extractionStatus: metadata.extractionStatus || row.processing_status || "",
    processedAt: metadata.processedAt || "",
    extension: metadata.extension || "",
    previewable: metadata.previewable !== false,
    remoteSyncFailed: Boolean(metadata.remoteSyncFailed),
    remoteSyncError: metadata.remoteSyncError || "",
    sourceType: metadata.sourceType || "",
    sourceDevice: metadata.sourceDevice || "",
    sourceId: metadata.sourceId || "",
    // Preserve persisted timestamps: the inbox filters by the local capture day.
    capturedAt: row.captured_at || metadata.capturedAt || row.created_at || "",
    uploadedAt: row.uploaded_at || metadata.uploadedAt || row.created_at || "",
    processingStatus: row.processing_status || metadata.processingStatus || "",
    permissions: metadata.permissions || "",
    metadataFingerprint: metadata.metadataFingerprint || "",
    eventId: row.event_id || metadata.linkedEventId || "",
    eventTitle: metadata.linkedEventTitle || "",
    eventOrder: metadata.eventOrder || "",
    metadata,
  };
}

async function updateAssetProcessing(assetId, body = {}, user = { id: LOCAL_USER_ID }) {
  if (activePersistence() !== "supabase") {
    return {
      synced: false,
      reason: "supabase_not_active",
    };
  }
  const rows = await supabaseRest("assets", {
    searchParams: {
      asset_id: `eq.${assetId}`,
      limit: "1",
    },
    accessToken: user.accessToken,
  });
  if (!rows.length) {
    const error = new Error("asset_not_found");
    error.statusCode = 404;
    throw error;
  }
  const current = rows[0];
  const now = new Date().toISOString();
  const extractedText = String(body.extractedText || "").trim();
  const analysisText = String(body.analysisText || "").trim();
  const translatedText = String(body.translatedText || "").trim();
  const processingStatus = String(body.extractionStatus || body.processingStatus || "processed").trim();
  const metadata = removeEmptyMetadataFields({
    ...(isPlainObject(current.metadata) ? current.metadata : {}),
    extractedText,
    detectedLanguage: body.detectedLanguage || "",
    translatedText,
    translationLanguage: body.translationLanguage || "",
    extractionMethod: body.extractionMethod || "",
    extractionStatus: processingStatus,
    processingStatus,
    processedAt: body.processedAt || now,
    processingSource: "asset-processing-v1",
  });
  const patch = removeEmptyMetadataFields({
    preview_text: extractedText || current.preview_text || "",
    analysis_text: analysisText || current.analysis_text || "",
    processing_status: processingStatus,
    metadata,
    updated_at: now,
  });
  const updated = await supabaseRest("assets", {
    method: "PATCH",
    searchParams: {
      asset_id: `eq.${assetId}`,
    },
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch),
    accessToken: user.accessToken,
  });
  return {
    synced: true,
    asset: fromAssetRow(updated[0] || current),
  };
}

function normalizeAgendaEvent(event = {}) {
  const startAt = event.startAt || event.start_at || new Date().toISOString();
  const endAt = event.endAt || event.end_at || new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString();
  const metadata = isPlainObject(event.metadata) ? event.metadata : {};
  return {
    id: String(event.id || event.eventId || event.event_id || randomUUID()),
    title: String(event.title || "Evento").trim() || "Evento",
    type: String(event.type || "Personal"),
    description: String(event.description || ""),
    startAt,
    endAt,
    location: String(event.location || "Sin ubicación"),
    participants: String(event.participants || "Sin participantes"),
    priority: String(event.priority || "normal"),
    status: String(event.status || "Planificado"),
    reminders: String(event.reminders || ""),
    source: event.source || event.sourceType || metadata.source || "manual",
    sourceType: event.sourceType || metadata.sourceType || event.source || "manual",
    sourceExperienceId: event.sourceExperienceId || event.source_experience_id || metadata.sourceExperienceId || "",
    linkedExperienceId: event.linkedExperienceId || event.linked_experience_id || metadata.linkedExperienceId || "",
    pilotParticipantId: event.pilotParticipantId || event.participantId || event.participant_id || metadata.participantId || "",
    pilotParticipantName: event.pilotParticipantName || metadata.participantName || "",
    createdAt: event.createdAt || event.created_at || new Date().toISOString(),
    updatedAt: event.updatedAt || event.updated_at || new Date().toISOString(),
    metadata,
  };
}

function toAgendaEventRow(event, user = { id: LOCAL_USER_ID }) {
  const normalized = normalizeAgendaEvent(event);
  return {
    event_id: normalized.id,
    user_id: user.id,
    participant_id: normalized.pilotParticipantId || null,
    title: normalized.title,
    type: normalized.type,
    description: normalized.description || null,
    start_at: normalized.startAt,
    end_at: normalized.endAt,
    location: normalized.location || null,
    participants: normalized.participants || null,
    priority: normalized.priority || "normal",
    status: normalized.status || "Planificado",
    reminders: normalized.reminders || null,
    source_type: normalized.sourceType || normalized.source || "manual",
    source_experience_id: normalized.sourceExperienceId || null,
    linked_experience_id: normalized.linkedExperienceId || null,
    metadata: removeEmptyMetadataFields({
      ...normalized.metadata,
      participantName: normalized.pilotParticipantName || "",
      source: normalized.source || normalized.sourceType || "manual",
      sourceType: normalized.sourceType || normalized.source || "manual",
    }),
    created_at: normalized.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function fromAgendaEventRow(row = {}) {
  const metadata = row.metadata || {};
  return normalizeAgendaEvent({
    id: row.event_id,
    title: row.title,
    type: row.type,
    description: row.description || "",
    startAt: row.start_at,
    endAt: row.end_at,
    location: row.location || "",
    participants: row.participants || "",
    priority: row.priority || "normal",
    status: row.status || "Planificado",
    reminders: row.reminders || "",
    sourceType: row.source_type || metadata.sourceType || "",
    source: metadata.source || row.source_type || "",
    sourceExperienceId: row.source_experience_id || "",
    linkedExperienceId: row.linked_experience_id || "",
    pilotParticipantId: row.participant_id || metadata.participantId || "",
    pilotParticipantName: metadata.participantName || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    metadata,
  });
}

function buildSignalMetadata({ existing, source, sourceType, payloadType, experience, attachment, event, participantId, user, index = 0, extra = {} }) {
  const base = isPlainObject(existing) ? { ...existing } : {};
  const capturedAt = attachment?.createdAt || event?.timestamp || experience?.timestamp || new Date().toISOString();
  const sourceDevice =
    attachment?.sourceDevice ||
    attachment?.device ||
    event?.sourceDevice ||
    experience?.sourceDevice ||
    (attachment?.storage === "supabase" ? "supabase-storage" : "web");
  const sourceId =
    attachment?.sourceId ||
    event?.sourceId ||
    experience?.sourceId ||
    attachment?.id ||
    event?.id ||
    experience?.id ||
    "";
  return removeEmptyMetadataFields({
    ...base,
    ...extra,
    schemaVersion: SIGNAL_METADATA_SCHEMA_VERSION,
    source,
    sourceType,
    sourceDevice,
    sourceId,
    capturedAt,
    uploadedAt: base.uploadedAt || new Date().toISOString(),
    participantId: participantId || "",
    ownerUserId: user?.id || base.ownerUserId || "",
    payloadType,
    linkedExperienceId: experience?.id || "",
    linkedEventId: event?.id || attachment?.eventId || "",
    permissions: base.permissions || attachment?.permissions || experience?.permissions || "private",
    metadataFingerprint:
      base.metadataFingerprint ||
      buildMetadataFingerprint([
        source,
        sourceType,
        payloadType,
        sourceDevice,
        sourceId,
        participantId,
        experience?.id,
        attachment?.name,
        attachment?.size,
        attachment?.path,
        index,
      ]),
  });
}

function inferAssetProcessingStatus(attachment = {}, kind = "") {
  if (attachment.remoteSyncFailed) return "upload_pending";
  if (String(attachment.analysisText || "").trim()) return "ready";
  if (kind === "audio") return String(attachment.previewText || "").trim() ? "ready" : "needs_transcription";
  if (kind === "image") return "needs_visual_review";
  if (kind === "video") return "needs_audiovisual_review";
  if (kind === "document") return String(attachment.previewText || "").trim() ? "ready" : "needs_extraction";
  return "pending_review";
}

function buildMetadataFingerprint(parts = []) {
  const raw = parts.map((part) => String(part || "")).filter(Boolean).join("|");
  if (!raw) return "";
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash << 5) - hash + raw.charCodeAt(index);
    hash |= 0;
  }
  return `meta-${Math.abs(hash).toString(16)}`;
}

function removeEmptyMetadataFields(metadata = {}) {
  return Object.entries(metadata).reduce((clean, [key, value]) => {
    if (value === undefined || value === null || value === "") return clean;
    clean[key] = value;
    return clean;
  }, {});
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function inferServerMediaKind(attachment = {}) {
  const type = String(attachment.type || attachment.originalType || "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("text/") || type.includes("pdf") || type.includes("word") || type.includes("json") || type.includes("zip") || type.includes("rar") || type.includes("7z")) return "document";
  const ext = String(attachment.extension || attachment.name?.split(".").pop() || "").toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "avif", "tif", "tiff"].includes(ext)) return "image";
  if (["mp3", "wav", "m4a", "aac", "flac", "ogg", "opus", "wma", "aiff", "aif", "amr"].includes(ext)) return "audio";
  if (ext === "webm" && isLikelyServerAudioWebm(attachment)) return "audio";
  if (type.startsWith("video/")) return "video";
  if (["mp4", "mov", "m4v", "webm", "mkv", "avi", "wmv", "mpeg", "mpg", "3gp"].includes(ext)) return "video";
  return "document";
}

function isLikelyServerAudioWebm(attachment = {}) {
  const type = String(attachment.type || attachment.originalType || "").toLowerCase();
  const name = String(attachment.name || "").toLowerCase();
  const source = String(attachment.sourceType || attachment.source || attachment.metadata?.sourceType || "").toLowerCase();
  const ext = String(attachment.extension || attachment.name?.split(".").pop() || "").toLowerCase();
  return ext === "webm"
    && (type === "audio/webm"
      || source.includes("audio")
      || /(^|[-_\s])(audio|voz|voice|record|recording|grabacion|grabación|captura)([-_\s]|\d|$)/i.test(name));
}

function encodePostgrestListValue(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function workspaceSchemaUnavailableRecently() {
  if (workspaceSchemaState.available !== false || !workspaceSchemaState.checkedAt) return false;
  return Date.now() - new Date(workspaceSchemaState.checkedAt).getTime() < 5 * 60 * 1000;
}

async function deleteExperienceRecord(id, user = { id: LOCAL_USER_ID }) {
  if (activePersistence() === "supabase") {
    await deleteExperienceCompanionRows(id, user);
    await supabaseRest("experiences", {
      method: "DELETE",
      searchParams: {
        experience_id: `eq.${id}`,
        user_id: `eq.${user.id}`,
      },
      headers: { Prefer: "return=minimal" },
      accessToken: user.accessToken,
    });
    return;
  }
  await mutateStore((currentStore) => {
    currentStore.experiences = currentStore.experiences.filter((item) => item.id !== id);
    return { ok: true };
  });
}

async function deleteExperienceCompanionRows(id, user = { id: LOCAL_USER_ID }) {
  if (workspaceSchemaUnavailableRecently()) return;
  await Promise.all(
    ["experience_events", "assets"].map(async (table) => {
      try {
        await supabaseRest(table, {
          method: "DELETE",
          searchParams: { experience_id: `eq.${id}` },
          headers: { Prefer: "return=minimal" },
          accessToken: user.accessToken,
        });
      } catch (error) {
        workspaceSchemaState.available = false;
        workspaceSchemaState.checkedAt = new Date().toISOString();
        workspaceSchemaState.error = sanitizeDiagnosticError(error);
      }
    }),
  );
}

async function saveMedia(media, user = { id: LOCAL_USER_ID }) {
  const normalized = normalizeMedia(media);
  if (activePersistence() !== "supabase") {
    return normalized;
  }

  const bytes = dataUrlToBuffer(normalized.dataUrl);
  return saveMediaBuffer(normalized, bytes, user);
}

async function saveMediaBuffer(media, bytes, user = { id: LOCAL_USER_ID }) {
  const normalized = normalizeMedia(media);
  if (activePersistence() !== "supabase") {
    return {
      ...normalized,
      dataUrl: normalized.dataUrl || null,
      storage: normalized.storage || "inline",
    };
  }

  const storageObjectHint = normalized.metadata?.storageObjectHint || "";
  const stableObjectName = storageObjectHint
    ? sanitizeFileName(storageObjectHint)
    : normalized.sourceId
      ? sanitizeFileName(`${normalized.sourceId}-${normalized.name}`)
      : `${Date.now()}-${sanitizeFileName(normalized.name)}`;
  const objectPath = `${user.id}/${stableObjectName}`;
  const attemptBase = {
    assetId: normalized.id,
    experienceId: normalized.experienceId || normalized.metadata?.linkedExperienceId || "",
    userId: user.id || null,
    deviceId: normalized.sourceDevice || normalized.device || "",
    fileName: normalized.name,
    mimeType: normalized.type,
    sizeBytes: Number(normalized.size || bytes?.length || 0),
    bucketId: SUPABASE_STORAGE_BUCKET,
    storagePath: objectPath,
    metadata: {
      ...(isPlainObject(normalized.metadata) ? normalized.metadata : {}),
      kind: normalized.kind || inferServerMediaKind(normalized),
      sourceType: normalized.sourceType || "",
      sourceId: normalized.sourceId || "",
      idempotencyKey: normalized.metadata?.idempotencyKey || normalized.sourceId || "",
      storageObjectHint: storageObjectHint || "",
      participantId: normalized.participantId || normalized.pilotParticipantId || normalized.metadata?.participantId || "",
      adoptionStatus: inferMediaAdoptionStatus(normalized),
      targetLayer: normalized.targetLayer || normalized.metadata?.targetLayer || "evidence",
      payloadType: normalized.payloadType || normalized.metadata?.payloadType || inferServerMediaKind(normalized),
      capturedAt: normalized.capturedAt || normalized.createdAt || "",
    },
  };

  await recordAssetUploadAttempt({ ...attemptBase, status: "uploading" }, user);

  try {
    if (!bytes?.length) throw new Error("invalid_media_payload");
    await uploadSupabaseObject(objectPath, normalized.type, bytes);
    const signedUrl = await createSignedObjectUrl(objectPath);
    await recordAssetUploadAttempt({ ...attemptBase, status: "uploaded", finishedAt: new Date().toISOString() }, user);

    return {
      ...normalized,
      dataUrl: null,
      path: objectPath,
      url: signedUrl,
      storage: "supabase",
      remoteSyncFailed: false,
      remoteSyncError: "",
    };
  } catch (error) {
    const failure = classifyUploadError(error);
    await recordAssetUploadAttempt({
      ...attemptBase,
      status: "failed",
      errorCode: failure.code,
      errorMessage: failure.message,
      finishedAt: new Date().toISOString(),
    }, user);
    const uploadError = new Error(`${failure.code}: ${failure.message}`);
    uploadError.status = error?.status;
    uploadError.code = failure.code;
    throw uploadError;
  }
}

async function recordAssetUploadAttempt(attempt, user = { id: LOCAL_USER_ID }) {
  const normalized = normalizeAssetUploadAttempt(attempt, user);
  await appendLog(normalized.status === "failed" ? "warn" : "info", "asset_upload_attempt", normalized);
  if (activePersistence() !== "supabase") return normalized;

  try {
    await supabaseRest(ASSET_UPLOAD_ATTEMPTS_TABLE, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(toAssetUploadAttemptRow(normalized)),
      accessToken: user.accessToken,
    });
  } catch (error) {
    await appendLog("warn", "asset_upload_attempt_remote_skipped", {
      assetId: normalized.assetId,
      status: normalized.status,
      reason: sanitizeDiagnosticError(error),
    });
  }
  return normalized;
}

async function listAssetUploadAttempts(user = { id: LOCAL_USER_ID }, limit = 20) {
  const cappedLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  if (activePersistence() === "supabase") {
    try {
      const rows = await supabaseRest(ASSET_UPLOAD_ATTEMPTS_TABLE, {
        searchParams: {
          user_id: `eq.${user.id}`,
          order: "started_at.desc",
          limit: String(cappedLimit),
        },
        accessToken: user.accessToken,
      });
      return rows.map(fromAssetUploadAttemptRow);
    } catch (error) {
      await appendLog("warn", "asset_upload_attempt_list_remote_skipped", {
        reason: sanitizeDiagnosticError(error),
      });
    }
  }

  const logs = await readLogs();
  return logs
    .filter((entry) => entry.message === "asset_upload_attempt")
    .map((entry) => entry.details)
    .filter((entry) => !user?.id || !entry.userId || entry.userId === user.id)
    .slice(0, cappedLimit);
}

function normalizeAssetUploadAttempt(attempt = {}, user = { id: LOCAL_USER_ID }) {
  const now = new Date().toISOString();
  const status = ["pending", "uploading", "uploaded", "failed"].includes(attempt.status) ? attempt.status : "pending";
  return {
    attemptId: attempt.attemptId || randomUUID(),
    assetId: attempt.assetId || attempt.asset_id || createId(),
    experienceId: attempt.experienceId || attempt.experience_id || null,
    userId: attempt.userId || attempt.user_id || user?.id || LOCAL_USER_ID,
    deviceId: attempt.deviceId || attempt.device_id || "",
    fileName: attempt.fileName || attempt.file_name || "media",
    mimeType: attempt.mimeType || attempt.mime_type || "application/octet-stream",
    sizeBytes: Number(attempt.sizeBytes || attempt.size_bytes || 0),
    bucketId: attempt.bucketId || attempt.bucket_id || SUPABASE_STORAGE_BUCKET,
    storagePath: attempt.storagePath || attempt.storage_path || "",
    status,
    errorCode: attempt.errorCode || attempt.error_code || "",
    errorMessage: attempt.errorMessage || attempt.error_message || "",
    startedAt: attempt.startedAt || attempt.started_at || now,
    finishedAt: attempt.finishedAt || attempt.finished_at || null,
    metadata: isPlainObject(attempt.metadata) ? attempt.metadata : {},
  };
}

function toAssetUploadAttemptRow(attempt) {
  return {
    attempt_id: attempt.attemptId,
    asset_id: attempt.assetId,
    experience_id: attempt.experienceId || null,
    user_id: attempt.userId || LOCAL_USER_ID,
    device_id: attempt.deviceId || null,
    file_name: attempt.fileName || "media",
    mime_type: attempt.mimeType || "application/octet-stream",
    size_bytes: Number(attempt.sizeBytes || 0),
    bucket_id: attempt.bucketId || SUPABASE_STORAGE_BUCKET,
    storage_path: attempt.storagePath || null,
    status: attempt.status,
    error_code: attempt.errorCode || null,
    error_message: attempt.errorMessage || null,
    started_at: attempt.startedAt,
    finished_at: attempt.finishedAt || null,
    metadata: attempt.metadata || {},
  };
}

function fromAssetUploadAttemptRow(row = {}) {
  return normalizeAssetUploadAttempt({
    attemptId: row.attempt_id,
    assetId: row.asset_id,
    experienceId: row.experience_id,
    userId: row.user_id,
    deviceId: row.device_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    bucketId: row.bucket_id,
    storagePath: row.storage_path,
    status: row.status,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    metadata: row.metadata,
  });
}

function classifyUploadError(error) {
  const detail = sanitizeDiagnosticError(error);
  const lower = detail.toLowerCase();
  if (lower.includes("invalid_media_payload") || lower.includes("invalid_media_data_url")) {
    return { code: "invalid_media_payload", message: "El archivo no llegó completo al servidor." };
  }
  if (lower.includes("invalid_mime_type") || lower.includes("mime")) {
    return { code: "invalid_mime_type", message: "El tipo de archivo no está permitido por Storage o llegó sin MIME válido." };
  }
  if (lower.includes("413") || lower.includes("payload_too_large") || lower.includes("too large")) {
    return { code: "file_too_large", message: "El archivo excede el tamaño permitido por la app o por Storage." };
  }
  if (lower.includes("401") || lower.includes("403") || lower.includes("permission") || lower.includes("jwt")) {
    return { code: "storage_auth", message: "Storage rechazó la subida por sesión, clave o permiso." };
  }
  if (lower.includes("404") || lower.includes("bucket")) {
    return { code: "bucket_not_found", message: `No se encontró el bucket ${SUPABASE_STORAGE_BUCKET} o su ruta.` };
  }
  if (lower.includes("sign")) {
    return { code: "signed_url_failed", message: "El archivo subió, pero no se pudo crear la URL privada de lectura." };
  }
  return { code: "storage_upload_failed", message: detail || "Storage no completó la subida del archivo." };
}

function normalizeMedia(media) {
  const metadata = isPlainObject(media.metadata) ? media.metadata : {};
  return {
    id: media.id || media.assetId || media.asset_id || media.sourceId || metadata.sourceId || metadata.idempotencyKey || createId(),
    name: media.name || "media",
    type: media.type || "application/octet-stream",
    size: Number(media.size || 0),
    dataUrl: media.dataUrl || null,
    createdAt: media.createdAt || new Date().toISOString(),
    capturedAt: media.capturedAt || metadata.capturedAt || media.timestamp || media.createdAt || new Date().toISOString(),
    uploadedAt: media.uploadedAt || null,
    storage: media.storage || "inline",
    path: media.path || null,
    url: media.url || null,
    originalType: media.originalType || media.type || "",
    extension: media.extension || "",
    kind: media.kind || "",
    previewable: media.previewable !== false,
    previewText: media.previewText || "",
    analysisText: media.analysisText || "",
    analysisSuggested: Boolean(media.analysisSuggested),
    remoteSyncFailed: Boolean(media.remoteSyncFailed),
    remoteSyncError: media.remoteSyncError || "",
    metadata,
    experienceId: media.experienceId || media.experience_id || media.linkedExperienceId || metadata.linkedExperienceId || metadata.experienceId || "",
    eventId: media.eventId || media.event_id || media.linkedEventId || metadata.linkedEventId || metadata.eventId || "",
    participantId: media.participantId || media.pilotParticipantId || metadata.participantId || "",
    pilotParticipantId: media.pilotParticipantId || media.participantId || metadata.participantId || "",
    sourceType: media.sourceType || metadata.sourceType || media.source || metadata.source || "",
    sourceDevice: media.sourceDevice || metadata.sourceDevice || media.device || metadata.device || "",
    sourceId: media.sourceId || metadata.sourceId || "",
    targetLayer: media.targetLayer || metadata.targetLayer || "",
    payloadType: media.payloadType || metadata.payloadType || "",
    adoptionStatus: media.adoptionStatus || metadata.adoptionStatus || "",
    permissions: media.permissions || metadata.permissions || "",
    checksum: media.checksum || metadata.checksum || "",
    fingerprint: media.fingerprint || metadata.fingerprint || "",
    processingStatus: media.processingStatus || media.extractionStatus || metadata.processingStatus || "",
  };
}

function dataUrlToBuffer(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith("data:")) {
    throw new Error("invalid_media_data_url");
  }
  const [header, payload = ""] = dataUrl.split(",", 2);
  if (header.includes(";base64")) return Buffer.from(payload, "base64");
  return Buffer.from(decodeURIComponent(payload), "utf-8");
}

async function uploadSupabaseObject(objectPath, contentType, bytes) {
  const url = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_STORAGE_BUCKET}/${objectPath}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...supabaseServerKeyHeaders(),
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: bytes,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`supabase_storage_${response.status}: ${text}`);
  }
}

async function createSignedObjectUrl(objectPath) {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${SUPABASE_STORAGE_BUCKET}/${objectPath}`, {
    method: "POST",
    headers: {
      ...supabaseServerKeyHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: 60 * 60 * 24 * 7 }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`supabase_sign_${response.status}: ${text}`);
  const payload = JSON.parse(text);
  return `${SUPABASE_URL}/storage/v1${payload.signedURL}`;
}

function supabaseServerKeyHeaders() {
  const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY };
  if (isLegacyJwtSupabaseKey(SUPABASE_SERVICE_ROLE_KEY)) {
    headers.Authorization = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
  }
  return headers;
}

function isLegacyJwtSupabaseKey(key = "") {
  return typeof key === "string" && key.split(".").length === 3;
}

async function assertSignedUrlReachable(url) {
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`signed_url_${response.status}: ${text.slice(0, 120)}`);
  }
}

async function assertObjectIsNotPublic(objectPath) {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/${objectPath}`, {
    method: "GET",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
  });
  if (response.ok) {
    throw new Error("public_object_accessible");
  }
  if (![400, 401, 403, 404].includes(response.status)) {
    const text = await response.text();
    throw new Error(`public_object_check_${response.status}: ${text.slice(0, 120)}`);
  }
}

async function signExperienceMedia(experience) {
  if (activePersistence() !== "supabase") return experience;
  const attachments = await Promise.all(
    (experience.attachments || []).map(async (attachment) => {
      if (!attachment.path) return attachment;
      return {
        ...attachment,
        url: await createSignedObjectUrl(attachment.path),
      };
    }),
  );
  return { ...experience, attachments };
}

async function runSupabaseDiagnostics(user) {
  const checks = [];
  const addCheck = (id, label, status, detail = "", action = "", actionType = "") => {
    const fallback = diagnosticActionForCheck(id, status, detail);
    checks.push({ id, label, status, detail, action: action || fallback.text, actionType: actionType || fallback.actionType || "" });
  };

  addCheck(
    "config",
    "Configuración Supabase",
    isSupabaseConfigured() ? "ok" : "error",
    activePersistence() === "supabase" ? "Variables backend presentes." : "Falta STORAGE_ADAPTER=supabase o alguna variable Supabase.",
    activePersistence() === "supabase"
      ? "Sin acción requerida."
      : "Completa STORAGE_ADAPTER, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY y SUPABASE_STORAGE_BUCKET en .env; luego reinicia server.js.",
  );

  if (activePersistence() !== "supabase") {
    return summarizeSupabaseDiagnostics(checks);
  }

  addCheck(
    "auth",
    "Auth del usuario",
    user?.id ? "ok" : "error",
    user?.email ? `Sesión válida para ${user.email}.` : "Token no validado.",
    user?.id ? "Sin acción requerida." : "Inicia sesión en la app con un usuario de Supabase Auth y vuelve a ejecutar Verificar Supabase.",
    user?.id ? "" : "openAuth",
  );

  await collectDiagnosticCheck(checks, "profile", "Perfil y RLS", async () => {
    const profile = await getProfile(user);
    return profile?.userId === user.id ? "Perfil accesible con RLS de usuario." : "Perfil creado o recuperado, revisa user_id.";
  });

  await collectDiagnosticCheck(checks, "experiences", "Experiencias y RLS", async () => {
    const experiences = await listExperiences(user);
    return `${experiences.length} experiencias legibles para el usuario autenticado.`;
  });

  await collectDiagnosticCheck(checks, "workspaceEvents", "Workspace y eventos internos", async () => {
    const workspace = await getWorkspaceContext(user);
    if (!workspace?.id) throw new Error(workspaceSchemaState.error || "workspace_schema_unavailable");
    return `Workspace activo ${workspace.id}; los eventos internos se sincronizan en experience_events.`;
  });

  await collectDiagnosticCheck(checks, "workspaceParticipants", "Participantes compartidos", async () => {
    const workspace = await getWorkspaceContext(user);
    if (!workspace?.id) throw new Error(workspaceSchemaState.error || "workspace_schema_unavailable");
    const rows = await supabaseRest("participants", {
      searchParams: {
        workspace_id: `eq.${workspace.id}`,
        limit: "1",
      },
      accessToken: user.accessToken,
    });
    return `Tabla participants accesible; ${rows.length} participante encontrado en la muestra del workspace.`;
  });

  await collectDiagnosticCheck(checks, "workspaceAssets", "Activos multimodales compartidos", async () => {
    const rows = await supabaseRest("assets", {
      searchParams: {
        owner_user_id: `eq.${user.id}`,
        limit: "1",
      },
      accessToken: user.accessToken,
    });
    return `Tabla assets accesible; ${rows.length} activo encontrado en la muestra del usuario.`;
  });

  await collectDiagnosticCheck(checks, "dailyBriefings", "Diario persistente", async () => {
    const rows = await supabaseRest("daily_briefings", {
      searchParams: {
        user_id: `eq.${user.id}`,
        limit: "1",
      },
      accessToken: user.accessToken,
    });
    return `Tabla daily_briefings accesible; ${rows.length} briefing persistido para este usuario.`;
  });

  await collectDiagnosticCheck(checks, "storage", "Storage privado", async () => {
    const bucket = await getSupabaseStorageBucket();
    if (!bucket) throw new Error("Bucket no encontrado.");
    const allowed = Array.isArray(bucket.allowed_mime_types) ? bucket.allowed_mime_types : null;
    if (bucket.public !== false) {
      return `Bucket ${SUPABASE_STORAGE_BUCKET} existe, pero está público. Ejecuta database/auth-rls.sql.`;
    }
    if (allowed && !allowed.includes("application/pdf")) {
      return `Bucket ${SUPABASE_STORAGE_BUCKET} privado, pero bloquea PDF/documentos. Ejecuta database/storage-accept-all-supported-media.sql.`;
    }
    return allowed
      ? `Bucket ${SUPABASE_STORAGE_BUCKET} privado; lista MIME activa con ${allowed.length} tipos.`
      : `Bucket ${SUPABASE_STORAGE_BUCKET} privado y acepta los formatos soportados por la app.`;
  }, (detail) => (detail.includes("público") ? "warn" : "ok"));

  await collectDiagnosticCheck(checks, "uploadAttempts", "Trazabilidad de adjuntos", async () => {
    const attempts = await listAssetUploadAttempts(user, 8);
    if (!attempts.length) return "Tabla de intentos accesible; aún no hay subidas recientes para este usuario.";
    const failed = attempts.filter((attempt) => attempt.status === "failed");
    if (failed.length) {
      const last = failed[0];
      return `${failed.length}/${attempts.length} intentos recientes fallaron. Último: ${last.fileName || last.assetId} · ${last.errorCode || "sin_codigo"} · ${last.errorMessage || "sin detalle"}.`;
    }
    return `${attempts.length} intentos recientes registrados; no hay fallos de adjuntos en la muestra.`;
  }, (detail) => (detail.includes("fallaron") ? "warn" : "ok"));

  await collectDiagnosticCheck(checks, "semantic", "Búsqueda semántica", async () => {
    if (activePersistence() !== "supabase") return "Fallback local activo.";
    const engine = activeEmbeddingsProvider() === "openai" ? `OpenAI ${OPENAI_EMBEDDING_MODEL}` : "local-hash";
    return `Motor ${engine}; pgvector disponible si database/semantic-search.sql fue aplicado.`;
  });

  return summarizeSupabaseDiagnostics(checks);
}

async function collectDiagnosticCheck(checks, id, label, operation, statusResolver = () => "ok") {
  try {
    const detail = await operation();
    const status = statusResolver(String(detail));
    const action = diagnosticActionForCheck(id, status, detail);
    checks.push({ id, label, status, detail, action: action.text, actionType: action.actionType || "" });
  } catch (error) {
    const detail = sanitizeDiagnosticError(error);
    const action = diagnosticActionForCheck(id, "error", detail);
    checks.push({ id, label, status: "error", detail, action: action.text, actionType: action.actionType || "" });
  }
}

function diagnosticActionFor(id, status, detail = "") {
  return diagnosticActionForCheck(id, status, detail).text;
}

function diagnosticActionForCheck(id, status, detail = "") {
  if (status === "ok") return { text: "Sin acción requerida." };
  if (id === "config") {
    return { text: "Revisa el archivo .env local, completa las variables Supabase y reinicia el servidor." };
  }
  if (id === "auth") {
    return { text: "Inicia sesión o crea una cuenta desde el panel de acceso de la app.", actionType: "openAuth" };
  }
  if (id === "profile") {
    return { text: "Ejecuta database/schema.sql y database/auth-rls.sql en Supabase; luego guarda el perfil desde Admin.", actionType: "openAdmin" };
  }
  if (id === "experiences") {
    return { text: "Ejecuta database/schema.sql y database/auth-rls.sql; después guarda una experiencia de prueba y vuelve a verificar.", actionType: "openAdmin" };
  }
  if (id === "workspaceEvents") {
    return { text: "Ejecuta database/workspace-events-assets.sql para habilitar workspace, participantes, eventos internos y activos compartidos.", actionType: "openAdmin" };
  }
  if (id === "workspaceParticipants") {
    return { text: "Ejecuta database/workspace-events-assets.sql para habilitar participantes compartidos y sus políticas RLS.", actionType: "openAdmin" };
  }
  if (id === "workspaceAssets") {
    return { text: "Ejecuta database/workspace-events-assets.sql para habilitar la tabla assets y sus políticas RLS.", actionType: "openAdmin" };
  }
  if (id === "dailyBriefings") {
    return { text: "Ejecuta database/schema.sql y database/auth-rls.sql para crear daily_briefings y sus políticas.", actionType: "openAdmin" };
  }
  if (id === "storage") {
    return {
      text: String(detail).includes("público")
        ? "Ejecuta database/auth-rls.sql para marcar experience-media como privado."
        : String(detail).includes("bloquea PDF")
          ? "Ejecuta database/storage-accept-all-supported-media.sql para permitir PDF, documentos y multimedia en el bucket privado."
          : "Ejecuta database/schema.sql para crear el bucket experience-media y confirma permisos de Storage.",
      actionType: "openAdmin",
    };
  }
  if (id === "uploadAttempts") {
    return { text: "Ejecuta database/asset-upload-attempts.sql para habilitar auditoría de adjuntos y vuelve a probar una subida real.", actionType: "openAdmin" };
  }
  if (id === "semantic") {
    return { text: "Ejecuta database/semantic-search.sql y luego pulsa Actualizar embeddings en Admin.", actionType: "openAdmin" };
  }
  return { text: "Revisa el detalle del error, corrige la configuración relacionada y vuelve a ejecutar Verificar Supabase.", actionType: "openAdmin" };
}

function summarizeSupabaseDiagnostics(checks) {
  const errors = checks.filter((check) => check.status === "error").length;
  const warnings = checks.filter((check) => check.status === "warn").length;
  return {
    checkedAt: new Date().toISOString(),
    status: errors ? "error" : warnings ? "warn" : "ok",
    checks,
  };
}

function sanitizeDiagnosticError(error) {
  const message = String(error?.message || error || "unknown_error");
  return message
    .replace(SUPABASE_SERVICE_ROLE_KEY || "__never__", "[service_role]")
    .replace(SUPABASE_PUBLISHABLE_KEY || "__never__", "[publishable_key]")
    .slice(0, 220);
}

function cleanAuthError(text = "") {
  try {
    const data = JSON.parse(text);
    const message = String(data.msg || data.message || data.error_description || data.error || "");
    if (/invalid login|invalid credentials|email not confirmed|invalid grant/i.test(message)) {
      return "Correo o clave no válidos, o cuenta pendiente de confirmación.";
    }
    if (message) return message.slice(0, 180);
  } catch {
    // Fall through to a short plain-text response.
  }
  const plain = String(text || "").trim();
  if (!plain) return "No se pudo iniciar sesión.";
  return plain.slice(0, 180);
}

async function getSupabaseStorageBucket() {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${SUPABASE_STORAGE_BUCKET}`, {
    headers: {
      ...supabaseServerKeyHeaders(),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`storage_bucket_${response.status}: ${text}`);
  return JSON.parse(text);
}

async function runSupabaseSelfTest(user) {
  if (activePersistence() !== "supabase") {
    throw new HttpError(400, "supabase_not_active");
  }

  const steps = [];
  const testId = `selftest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const testParticipantId = `${testId}-participant`;
  let uploadedMedia = null;
  let uploadedAudio = null;
  let uploadedVideo = null;
  let uploadedDocument = null;
  let uploadedArchive = null;
  let dailyTestLocation = null;

  try {
    await collectSelfTestStep(steps, "profile", "Perfil", async () => {
      const profile = await getProfile(user);
      if (!profile?.userId) throw new Error("profile_missing");
      return "Perfil leído o creado correctamente para el usuario autenticado.";
    });

    await collectSelfTestStep(steps, "storage", "Storage privado", async () => {
      uploadedMedia = await saveMedia(
        {
          id: `${testId}-media`,
          name: `${testId}.png`,
          type: "image/png",
          size: 68,
          dataUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
        },
        user,
      );
      if (!uploadedMedia?.path || !uploadedMedia?.url) throw new Error("storage_upload_missing_path");
      await assertSignedUrlReachable(uploadedMedia.url);
      await assertObjectIsNotPublic(uploadedMedia.path);
      return `Archivo temporal subido, URL firmada validada y acceso público bloqueado en ${SUPABASE_STORAGE_BUCKET}.`;
    });

    await collectSelfTestStep(steps, "uploadAttempts", "Auditoría de adjuntos", async () => {
      const attempts = await listAssetUploadAttempts(user, 10);
      const attempt = attempts.find((item) => item.assetId === `${testId}-media` && item.status === "uploaded");
      if (!attempt) throw new Error("asset_upload_attempt_missing");
      return "Intento de subida registrado con archivo, ruta, estado y usuario.";
    });

    await collectSelfTestStep(steps, "audioStorage", "Audio multidispositivo", async () => {
      uploadedAudio = await saveMedia(
        {
          id: `${testId}-audio`,
          name: `${testId}.wav`,
          type: "audio/wav",
          size: 44,
          dataUrl: "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
          kind: "audio",
        },
        user,
      );
      if (!uploadedAudio?.path || !uploadedAudio?.url) throw new Error("audio_upload_missing_path");
      await assertSignedUrlReachable(uploadedAudio.url);
      return "Audio temporal subido a Storage y legible mediante URL firmada, igual que en otro dispositivo.";
    });

    await collectSelfTestStep(steps, "videoStorage", "Video multidispositivo", async () => {
      uploadedVideo = await saveMedia(
        {
          id: `${testId}-video`,
          name: `${testId}.mp4`,
          type: "video/mp4",
          size: 28,
          dataUrl: "data:video/mp4;base64,AAAAHGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=",
          kind: "video",
        },
        user,
      );
      if (!uploadedVideo?.path || !uploadedVideo?.url) throw new Error("video_upload_missing_path");
      await assertSignedUrlReachable(uploadedVideo.url);
      return "Video temporal subido a Storage y disponible mediante URL firmada para otros dispositivos.";
    });

    await collectSelfTestStep(steps, "documentStorage", "Documento multidispositivo", async () => {
      uploadedDocument = await saveMedia(
        {
          id: `${testId}-document`,
          name: `${testId}.txt`,
          type: "text/plain",
          size: 86,
          dataUrl: "data:text/plain;base64,UHJ1ZWJhIHRlbXBvcmFsIGRlIGRvY3VtZW50byBtdWx0aWRpc3Bvc2l0aXZvIHBhcmEgVmliZS4=",
          kind: "document",
          previewText: "Prueba temporal de documento multidispositivo para Vibe.",
        },
        user,
      );
      if (!uploadedDocument?.path || !uploadedDocument?.url) throw new Error("document_upload_missing_path");
      await assertSignedUrlReachable(uploadedDocument.url);
      return "Documento temporal subido a Storage, con texto legible y URL firmada funcional.";
    });

    await collectSelfTestStep(steps, "archiveStorage", "ZIP de transporte", async () => {
      uploadedArchive = await saveMedia(
        {
          id: `${testId}-archive`,
          name: `${testId}.zip`,
          type: "application/zip",
          size: 22,
          dataUrl: "data:application/zip;base64,UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==",
          kind: "document",
          previewable: false,
          previewText: "ZIP conservado para transporte y descarga; no se interpreta automáticamente.",
        },
        user,
      );
      if (!uploadedArchive?.path || !uploadedArchive?.url) throw new Error("archive_upload_missing_path");
      await assertSignedUrlReachable(uploadedArchive.url);
      return "ZIP temporal subido como activo documental: se conserva y descarga, pero no se interpreta.";
    });

    await collectSelfTestStep(steps, "experienceCreate", "Guardar experiencia", async () => {
      const saved = await upsertExperience(
        {
          id: testId,
          title: "SUPABASE SELF TEST - borrar automaticamente",
          category: "Trabajo",
          timestamp: new Date().toISOString(),
          duration: 1,
          mood: "Calmo",
          energy: 5,
          location: "Self-test",
          people: "Sistema",
          objective: "validacion tecnica",
          notes: "Registro temporal creado por la prueba de cierre Supabase.",
          pilotParticipantId: testParticipantId,
          pilotParticipantName: "Participante de prueba",
          events: [
            { id: `${testId}-event-1`, title: "Inicio", description: "Se crea el registro temporal.", order: 1 },
            { id: `${testId}-event-2`, title: "Validación", description: "Se verifica lectura y sincronización.", order: 2 },
          ],
          attachments: [uploadedMedia, uploadedAudio, uploadedVideo, uploadedDocument, uploadedArchive].filter(Boolean),
          locale: "es",
        },
        user,
      );
      if (saved.id !== testId) throw new Error("experience_not_saved");
      return "Experiencia temporal guardada con RLS del usuario.";
    });

    await collectSelfTestStep(steps, "experienceRead", "Leer experiencia", async () => {
      const experiences = await listExperiences(user);
      const saved = experiences.find((experience) => experience.id === testId);
      if (!saved) throw new Error("experience_not_readable");
      const attachments = Array.isArray(saved.attachments) ? saved.attachments : [];
      const expectedNames = [uploadedMedia, uploadedAudio, uploadedVideo, uploadedDocument, uploadedArchive]
        .filter(Boolean)
        .map((item) => item.name);
      const missing = expectedNames.filter((name) => !attachments.some((attachment) => attachment.name === name && attachment.path && attachment.url));
      if (missing.length) throw new Error(`experience_attachment_missing_signed_url: ${missing.join(", ")}`);
      await Promise.all(attachments.filter((attachment) => expectedNames.includes(attachment.name)).map((attachment) => assertSignedUrlReachable(attachment.url)));
      return `Experiencia temporal leída con ${expectedNames.length} adjuntos, rutas Storage y URLs firmadas funcionales.`;
    });

    await collectSelfTestStep(steps, "workspaceEvents", "Eventos internos", async () => {
      const experiences = await listExperiences(user);
      const saved = experiences.find((experience) => experience.id === testId);
      const events = normalizeExperienceEvents(saved?.events || [], testId);
      if (workspaceSchemaState.available === false) throw new Error(workspaceSchemaState.error || "workspace_schema_unavailable");
      if (events.length < 2) throw new Error("experience_events_not_readable");
      return `${events.length} eventos internos sincronizados y legibles desde experience_events.`;
    });

    await collectSelfTestStep(steps, "workspaceParticipants", "Participantes compartidos", async () => {
      const rows = await supabaseRest("participants", {
        searchParams: {
          participant_id: `eq.${testParticipantId}`,
          limit: "1",
        },
        accessToken: user.accessToken,
      });
      if (!rows.length) throw new Error("participant_not_synced");
      return "Participante temporal sincronizado y disponible para eventos y activos.";
    });

    await collectSelfTestStep(steps, "workspaceAssets", "Activos compartidos", async () => {
      const rows = await supabaseRest("assets", {
        searchParams: {
          experience_id: `eq.${testId}`,
          limit: "10",
        },
        accessToken: user.accessToken,
      });
      if (!rows.length) throw new Error("assets_not_synced");
      if (!rows[0].storage_path) throw new Error("asset_storage_path_missing");
      const requiredKinds = {
        image: (row) => row.kind === "image" || String(row.mime_type || "").startsWith("image/"),
        audio: (row) => row.kind === "audio" || String(row.mime_type || "").startsWith("audio/"),
        video: (row) => row.kind === "video" || String(row.mime_type || "").startsWith("video/"),
        document: (row) => row.kind === "document" || String(row.mime_type || "").startsWith("text/"),
        archive: (row) => String(row.mime_type || "").includes("zip") || String(row.name || "").toLowerCase().endsWith(".zip"),
      };
      const missingKinds = Object.entries(requiredKinds)
        .filter(([, predicate]) => !rows.some(predicate))
        .map(([kind]) => kind);
      if (missingKinds.length) throw new Error(`asset_kinds_not_synced: ${missingKinds.join(", ")}`);
      return `${rows.length} activos sincronizados en assets: imagen, audio, video, documento y ZIP de transporte.`;
    });

    await collectSelfTestStep(steps, "semantic", "Consulta semántica", async () => {
      const result = await semanticSearch("validacion tecnica self test", user, 3);
      return `Consulta ejecutada con motor ${result.engine}.`;
    });

    await collectSelfTestStep(steps, "dailyBriefing", "Diario persistente", async () => {
      dailyTestLocation = `Self Test ${testId}`;
      const briefing = {
        schemaVersion: "20260522-daily-media-specific-35",
        source: "self-test",
        location: dailyTestLocation,
        country: "",
        countryCode: "",
        scope: "Self Test",
        locale: "es",
        generatedAt: new Date().toISOString(),
        refreshEveryHours: 6,
        nextRefreshAt: addMinutes(new Date(), 360).toISOString(),
        agendaLinks: [],
        weather: { source: "self-test", signals: [] },
        groups: [],
        sections: [],
        horoscope: [],
      };
      await saveStoredDailyBriefing(user, briefing);
      const saved = await getStoredDailyBriefing(user, briefing.location, "es");
      if (!saved?.generatedAt) throw new Error("daily_briefing_not_persisted");
      return "Briefing temporal guardado y recuperado para el usuario.";
    });
  } finally {
    await collectSelfTestStep(steps, "cleanupExperience", "Limpieza experiencia", async () => {
      await deleteExperienceRecord(testId, user);
      return "Experiencia temporal eliminada.";
    });
    await collectSelfTestStep(steps, "cleanupParticipant", "Limpieza participante", async () => {
      await deleteParticipantRecord(testParticipantId, user);
      return "Participante temporal eliminado.";
    });
    if (uploadedMedia?.path) {
      await collectSelfTestStep(steps, "cleanupStorage", "Limpieza Storage", async () => {
        await deleteSupabaseObject(uploadedMedia.path);
        return "Archivo temporal eliminado de Storage.";
      });
    }
    if (uploadedAudio?.path) {
      await collectSelfTestStep(steps, "cleanupAudioStorage", "Limpieza audio", async () => {
        await deleteSupabaseObject(uploadedAudio.path);
        return "Audio temporal eliminado de Storage.";
      });
    }
    if (uploadedVideo?.path) {
      await collectSelfTestStep(steps, "cleanupVideoStorage", "Limpieza video", async () => {
        await deleteSupabaseObject(uploadedVideo.path);
        return "Video temporal eliminado de Storage.";
      });
    }
    if (uploadedDocument?.path) {
      await collectSelfTestStep(steps, "cleanupDocumentStorage", "Limpieza documento", async () => {
        await deleteSupabaseObject(uploadedDocument.path);
        return "Documento temporal eliminado de Storage.";
      });
    }
    if (uploadedArchive?.path) {
      await collectSelfTestStep(steps, "cleanupArchiveStorage", "Limpieza ZIP", async () => {
        await deleteSupabaseObject(uploadedArchive.path);
        return "ZIP temporal eliminado de Storage.";
      });
    }
    if (dailyTestLocation) {
      await collectSelfTestStep(steps, "cleanupDailyBriefing", "Limpieza Diario", async () => {
        await deleteStoredDailyBriefing(user, dailyTestLocation, "es");
        return "Briefing temporal eliminado.";
      });
    }
  }

  return summarizeSupabaseSelfTest(steps);
}

async function collectSelfTestStep(steps, id, label, operation) {
  try {
    const detail = await operation();
    steps.push({ id, label, status: "ok", detail, action: "Sin acción requerida." });
  } catch (error) {
    const detail = sanitizeDiagnosticError(error);
    const action = selfTestActionFor(id, detail);
    steps.push({ id, label, status: "error", detail, action: action.text, actionType: action.actionType || "" });
  }
}

function summarizeSupabaseSelfTest(steps) {
  const errors = steps.filter((step) => step.status === "error").length;
  return {
    checkedAt: new Date().toISOString(),
    status: errors ? "error" : "ok",
    steps,
  };
}

function selfTestActionFor(id, detail = "") {
  if (id === "profile") return { text: "Ejecuta database/schema.sql y database/auth-rls.sql; luego vuelve a iniciar sesión.", actionType: "openAdmin" };
  if (id === "storage" || id === "audioStorage" || id === "videoStorage" || id === "documentStorage" || id === "archiveStorage") {
    return { text: "Revisa que el bucket experience-media exista, sea privado y acepte todos los formatos soportados. Si hay invalid_mime_type, ejecuta database/storage-accept-all-supported-media.sql.", actionType: "openAdmin" };
  }
  if (id === "uploadAttempts") return { text: "Ejecuta database/asset-upload-attempts.sql para habilitar auditoría de adjuntos.", actionType: "openAdmin" };
  if (id === "experienceCreate" || id === "experienceRead") return { text: "Revisa tabla experiences, políticas RLS y que auth.uid() coincida con user_id.", actionType: "openAdmin" };
  if (id === "semantic") return { text: "Ejecuta database/semantic-search.sql; si no está aplicado, la app seguirá con búsqueda local.", actionType: "openAdmin" };
  if (id === "workspaceEvents" && String(detail || "").includes("agenda_events")) {
    return { text: "Ejecuta database/agenda-events.sql para habilitar Agenda multidispositivo y vuelve a ejecutar Probar flujo real.", actionType: "openAdmin" };
  }
  if (id === "workspaceEvents") return { text: "Ejecuta database/workspace-events-assets.sql para habilitar eventos internos compartidos y vuelve a ejecutar Probar flujo real.", actionType: "openAdmin" };
  if (id === "workspaceParticipants") return { text: "Ejecuta database/workspace-events-assets.sql y vuelve a ejecutar Probar flujo real.", actionType: "openAdmin" };
  if (id === "workspaceAssets") return { text: "Ejecuta database/workspace-events-assets.sql y vuelve a ejecutar Probar flujo real.", actionType: "openAdmin" };
  if (id === "dailyBriefing") return { text: "Ejecuta database/schema.sql y database/auth-rls.sql para habilitar daily_briefings.", actionType: "openAdmin" };
  if (id === "cleanupDailyBriefing") return { text: "Borra manualmente el registro de prueba en daily_briefings si quedó pendiente.", actionType: "openAdmin" };
  if (id === "cleanupExperience") return { text: "Borra manualmente cualquier experiencia con título SUPABASE SELF TEST.", actionType: "openAdmin" };
  if (id === "cleanupParticipant") return { text: "Borra manualmente cualquier participante temporal con prefijo selftest si quedó pendiente.", actionType: "openAdmin" };
  if (id === "cleanupStorage") return { text: `Borra manualmente el objeto temporal indicado en ${SUPABASE_STORAGE_BUCKET}.`, actionType: "openAdmin" };
  if (id === "cleanupAudioStorage") return { text: `Borra manualmente el audio temporal indicado en ${SUPABASE_STORAGE_BUCKET}.`, actionType: "openAdmin" };
  return { text: "Corrige el punto indicado y vuelve a ejecutar Probar flujo real.", actionType: "openAdmin" };
}

async function deleteSupabaseObject(objectPath) {
  const result = await deleteSupabaseObjects([objectPath]);
  if (result.failed) throw new Error(result.warnings[0] || "supabase_storage_delete_failed");
}

async function deleteSupabaseObjects(objectPaths = []) {
  const uniquePaths = [...new Set(objectPaths.map((item) => String(item || "").trim()).filter(Boolean))];
  const summary = { deleted: 0, failed: 0, warnings: [] };
  for (let index = 0; index < uniquePaths.length; index += 100) {
    const batch = uniquePaths.slice(index, index + 100);
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${SUPABASE_STORAGE_BUCKET}`, {
      method: "DELETE",
      headers: {
        ...supabaseServerKeyHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: batch }),
    });
    const text = await response.text();
    if (!response.ok) {
      summary.failed += batch.length;
      summary.warnings.push(`supabase_storage_delete_${response.status}: ${text.slice(0, 180)}`);
    } else {
      summary.deleted += batch.length;
    }
  }
  return summary;
}

async function deleteParticipantRecord(participantId, user = { id: LOCAL_USER_ID }) {
  if (!participantId || activePersistence() !== "supabase") return;
  await supabaseRest("participants", {
    method: "DELETE",
    searchParams: { participant_id: `eq.${participantId}` },
    headers: { Prefer: "return=minimal" },
    accessToken: user.accessToken,
  });
}

async function semanticSearch(query, user, limit = 8) {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) return { query: cleanQuery, results: [], engine: "token-vector-v1" };
  const cappedLimit = Math.max(1, Math.min(Number(limit) || 8, 20));
  if (activePersistence() === "supabase") {
    const vectorResults = await semanticSearchWithPgvector(cleanQuery, user, cappedLimit);
    if (vectorResults) return vectorResults;
  }
  const experiences = await listExperiences(user);
  const queryVector = vectorizeText(cleanQuery);
  const results = experiences
    .map((experience) => {
      const text = experienceSearchText(experience);
      return {
        score: cosineSimilarity(queryVector, vectorizeText(text)),
        experience,
      };
    })
    .filter((entry) => entry.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, cappedLimit)
    .map((entry) => ({
      score: Number(entry.score.toFixed(4)),
      experience: entry.experience,
    }));
  return {
    query: cleanQuery,
    engine: activePersistence() === "supabase" ? "supabase-token-vector-v1" : "local-token-vector-v1",
    results,
  };
}

async function semanticSearchWithPgvector(query, user, limit) {
  try {
    const queryEmbedding = await createEmbedding(query);
    const rows = await supabaseRpc(
      "match_experiences",
      {
        query_embedding: queryEmbedding,
        match_count: limit,
      },
      user.accessToken,
    );
    const signedResults = await Promise.all(
      rows.map(async (row) => ({
        score: Number(row.similarity || 0),
        experience: await signExperienceMedia(fromExperienceRow(row)),
      })),
    );
    if (!signedResults.length) return null;
    return {
      query,
      engine: `supabase-pgvector-${activeEmbeddingsProvider()}`,
      results: signedResults,
    };
  } catch {
    return null;
  }
}

async function backfillEmbeddings(user, limit = 50) {
  if (activePersistence() !== "supabase") {
    return { updated: 0, skipped: 0, engine: "not-supabase" };
  }
  const experiences = (await listExperiences(user)).slice(0, Math.max(1, Math.min(Number(limit) || 50, 200)));
  let updated = 0;
  for (const experience of experiences) {
    await upsertExperience(experience, user);
    updated += 1;
  }
  return {
    updated,
    skipped: 0,
    engine: activeEmbeddingsProvider(),
  };
}

async function backfillWorkspaceStructure(user) {
  if (activePersistence() !== "supabase") {
    return { syncedExperiences: 0, syncedParticipants: 0, syncedEvents: 0, syncedAssets: 0, skipped: 0, status: "not-supabase" };
  }
  workspaceSchemaState.available = null;
  workspaceSchemaState.checkedAt = null;
  workspaceSchemaState.error = null;
  const workspace = await getWorkspaceContext(user);
  if (!workspace?.id) {
    return {
      syncedExperiences: 0,
      syncedParticipants: 0,
      syncedEvents: 0,
      syncedAssets: 0,
      skipped: 0,
      status: "migration-required",
      detail: workspaceSchemaState.error || "workspace_schema_unavailable",
    };
  }
  const rows = await supabaseRest("experiences", {
    searchParams: {
      user_id: `eq.${user.id}`,
      order: "occurred_at.desc",
    },
    accessToken: user.accessToken,
  });
  let syncedEvents = 0;
  let syncedAssets = 0;
  const syncedParticipantIds = new Set();
  let skipped = 0;
  for (const row of rows) {
    const experience = await signExperienceMedia(fromExperienceRow(row));
    if (experience.pilotParticipantId) {
      const participant = await ensureExperienceParticipant(experience, workspace.id, user);
      if (participant?.id) syncedParticipantIds.add(participant.id);
    }
    const eventResult = await syncExperienceEventsToSupabase(experience, user);
    const assetResult = await syncExperienceAssetsToSupabase(experience, user);
    if (eventResult.synced) syncedEvents += Number(eventResult.count || 0);
    if (assetResult.synced) syncedAssets += Number(assetResult.count || 0);
    if (!eventResult.synced || !assetResult.synced) skipped += 1;
  }
  return {
    syncedExperiences: rows.length,
    syncedParticipants: syncedParticipantIds.size,
    syncedEvents,
    syncedAssets,
    skipped,
    status: skipped ? "partial" : "ok",
    workspaceId: workspace.id,
  };
}

function enqueueJob(type, user, payload = {}) {
  const job = {
    id: createId(),
    type,
    status: "queued",
    payload,
    user: { id: user.id, email: user.email, accessToken: user.accessToken },
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    result: null,
    error: null,
  };
  jobs.set(job.id, job);
  jobQueue.push(job.id);
  appendLog("info", `Job queued: ${type}`, { jobId: job.id }).catch(() => {});
  processJobs();
  return { jobId: job.id, status: job.status, type: job.type };
}

async function processJobs() {
  if (jobRunning) return;
  jobRunning = true;
  while (jobQueue.length) {
    const jobId = jobQueue.shift();
    const job = jobs.get(jobId);
    if (!job) continue;
    job.status = "running";
    job.startedAt = new Date().toISOString();
    await appendLog("info", `Job started: ${job.type}`, { jobId });
    try {
      if (job.type === "embeddings-backfill") {
        job.result = await backfillEmbeddings(job.user, job.payload.limit || 200);
      } else if (job.type === "asset-processing") {
        job.result = await processAssetJob(job.user, job.payload);
      } else {
        throw new Error(`unknown_job_type:${job.type}`);
      }
      job.status = "completed";
      await appendLog("info", `Job completed: ${job.type}`, { jobId, result: job.result });
    } catch (error) {
      job.status = "failed";
      job.error = error.message;
      await appendLog("error", `Job failed: ${job.type}`, { jobId, error: error.message });
    } finally {
      job.finishedAt = new Date().toISOString();
    }
  }
  jobRunning = false;
}

function listJobs() {
  return [...jobs.values()]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 30)
    .map(({ user, ...job }) => ({
      ...job,
      userId: user.id,
    }));
}

function getJobSummary() {
  const values = [...jobs.values()];
  return {
    queued: values.filter((job) => job.status === "queued").length,
    running: values.filter((job) => job.status === "running").length,
    completed: values.filter((job) => job.status === "completed").length,
    failed: values.filter((job) => job.status === "failed").length,
  };
}

async function processAssetJob(user = { id: LOCAL_USER_ID }, payload = {}) {
  const rawAsset = payload.asset || payload.media || payload;
  const assetId = String(payload.assetId || rawAsset.assetId || rawAsset.assetKey || rawAsset.id || "").trim();
  const media = normalizeMedia({
    ...rawAsset,
    id: assetId || rawAsset.id,
    kind: rawAsset.kind || inferServerMediaKind(rawAsset),
  });
  const kind = media.kind || inferServerMediaKind(media);
  const processedAt = new Date().toISOString();
  const processing = await analyzeAssetOnServer(media, kind);
  const extractedText = cleanExtractedText(processing.text || "");
  const analysisText = buildServerAssetProcessingAnalysis(media, kind, processing, extractedText);
  const processingStatus = normalizeAssetJobStatus(processing.status, extractedText);
  const result = {
    assetId,
    kind,
    processingStatus,
    extractedText,
    analysisText,
    detectedLanguage: "",
    translatedText: "",
    translationLanguage: "",
    extractionMethod: processing.method || `${kind || "asset"}-server-processing`,
    extractionStatus: processing.status || processingStatus,
    provider: processing.provider || "",
    message: processing.message || "",
    processedAt,
    remoteSynced: false,
  };
  if (processing.biometricImport) {
    result.biometricImport = processing.biometricImport;
  }
  if (processing.structuredContext) {
    result.structuredContext = processing.structuredContext;
  }
  if (assetId) {
    try {
      const updated = await updateAssetProcessing(assetId, result, user);
      result.remoteSynced = Boolean(updated?.synced);
      result.asset = updated?.asset || null;
    } catch (error) {
      result.remoteSynced = false;
      result.remoteSyncError = error.message || "asset_processing_sync_failed";
      await appendLog("warn", "Asset processing completed without remote patch", { assetId, error: result.remoteSyncError });
    }
  }
  return result;
}

async function analyzeAssetOnServer(media = {}, kind = "") {
  const existingText = cleanExtractedText(media.extractedText || media.previewText || media.analysisText || media.metadata?.extractedText || "");
  if (existingText) {
    return {
      status: "ok",
      method: "server-existing-text",
      text: existingText,
      characters: existingText.length,
    };
  }
  const hasReadableSource = Boolean(media.dataUrl || media.url);
  const extension = getExtension(media.name || media.extension || media.type || "");
  if (kind === "document" && ["zip", "rar", "7z"].includes(extension)) {
    if (extension === "zip" && isAppleHealthBiometricArchive(media)) {
      if (!hasReadableSource) return buildAssetProviderPending("apple-health-zip-source-unavailable");
      return analyzeAppleHealthZip(media);
    }
    return {
      status: "skipped",
      method: "archive-transport-only",
      text: "",
      message: "Compressed files are stored and synchronized, but are not interpreted automatically.",
    };
  }
  if (kind === "document") {
    if (!hasReadableSource) return buildAssetProviderPending("document-source-unavailable");
    return extractDocumentText(media);
  }
  if (kind === "image") {
    if (!hasReadableSource) return buildAssetProviderPending("image-source-unavailable");
    return ocrImage(media);
  }
  if (kind === "audio") {
    if (!hasReadableSource) return buildAssetProviderPending("audio-source-unavailable");
    return transcribeMedia(media);
  }
  if (kind === "video") {
    return {
      status: "needs_review",
      method: "video-metadata-review",
      text: "",
      message: "Video is stored and synchronized. Automatic scene/audio interpretation remains a provider-backed step.",
    };
  }
  return buildAssetProviderPending("unsupported-asset-kind");
}

function buildAssetProviderPending(reason = "provider-unavailable") {
  return {
    status: "pending_provider",
    method: reason,
    text: "",
    message: reason,
  };
}

function normalizeAssetJobStatus(status = "", extractedText = "") {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "ok" || normalized === "automatic") return "processed";
  if (normalized === "empty") return "processed-empty";
  if (normalized === "skipped") return "transport-only";
  if (normalized === "unavailable" || normalized === "pending_provider") return "pending-provider";
  if (extractedText) return "processed";
  return "needs-review";
}

function buildServerAssetProcessingAnalysis(media = {}, kind = "", processing = {}, extractedText = "") {
  const name = media.name || media.id || "activo";
  if (processing.method === "server-apple-health-zip-extraction") {
    const biometric = processing.biometricImport || {};
    const metrics = Array.isArray(biometric.metricNames) && biometric.metricNames.length
      ? biometric.metricNames.join(", ")
      : "senales biometricas";
    const range = biometric.startAt && biometric.endAt
      ? `${biometric.startAt} - ${biometric.endAt}`
      : "sin rango detectado";
    return [
      `ZIP Apple Health procesado por el servidor: ${name}.`,
      `${biometric.recordCount || 0} registros interpretados.`,
      `Senales: ${metrics}.`,
      `Rango: ${range}.`,
      "Uso: contexto biometrico transversal para Panel, Captura, Reportes y Hallazgos; no es diagnostico medico.",
    ].join(" ");
  }
  if (extractedText) {
    return [
      `Activo procesado por el servidor: ${name}.`,
      `Tipo: ${kind || "archivo"}.`,
      `Metodo: ${processing.method || "server-processing"}.`,
      `Contenido util para reportes y hallazgos: ${extractedText.slice(0, 900)}`,
    ].join(" ");
  }
  if (processing.status === "skipped") {
    return `Activo sincronizado como transporte: ${name}. El archivo queda disponible para descarga, pero no se interpreta automaticamente.`;
  }
  if (processing.status === "pending_provider" || processing.status === "unavailable") {
    return `Activo recibido por el servidor: ${name}. Queda sincronizado, pero el analisis automatico requiere habilitar el proveedor correspondiente.`;
  }
  return `Activo recibido por el servidor: ${name}. Queda disponible para revision humana y uso como evidencia vinculada.`;
}

async function getServerSyncState(user = { id: LOCAL_USER_ID }) {
  const [experiences, agendaEvents, logs] = await Promise.all([
    listExperiences(user),
    listAgendaEvents(user).catch(() => []),
    readLogs().catch(() => []),
  ]);
  const attachments = experiences.flatMap((experience) => Array.isArray(experience.attachments) ? experience.attachments : []);
  const events = experiences.flatMap((experience) => Array.isArray(experience.events) ? experience.events : []);
  const contextSignals = experiences.filter((experience) => experience.metadata?.structuredContext);
  const latestAt = latestTimestamp([
    ...experiences.map((item) => item.updatedAt || item.timestamp),
    ...agendaEvents.map((item) => item.updatedAt || item.startAt),
    ...attachments.map((item) => item.updatedAt || item.uploadedAt || item.createdAt),
    ...events.map((item) => item.updatedAt || item.timestamp),
    ...logs.slice(0, 10).map((item) => item.timestamp),
  ]);
  const counts = {
    experiences: experiences.length,
    agenda: agendaEvents.length,
    assets: attachments.length,
    events: events.length,
    context: contextSignals.length,
    jobs: getJobSummary(),
  };
  const fingerprint = {
    userId: user.id || LOCAL_USER_ID,
    persistence: activePersistence(),
    latestAt,
    counts,
    experienceIds: experiences.slice(0, 80).map((item) => `${item.id}:${item.updatedAt || item.timestamp || ""}`),
    agendaIds: agendaEvents.slice(0, 80).map((item) => `${item.id}:${item.updatedAt || item.startAt || ""}`),
    assetIds: attachments.slice(0, 120).map((item) => `${item.id || item.assetId || item.name}:${item.updatedAt || item.uploadedAt || item.path || ""}`),
  };
  return {
    schemaVersion: "server-sync-state-v1",
    generatedAt: new Date().toISOString(),
    userId: user.id || LOCAL_USER_ID,
    persistence: activePersistence(),
    latestAt,
    counts,
    token: createHash("sha256").update(JSON.stringify(fingerprint)).digest("hex").slice(0, 24),
  };
}

function latestTimestamp(values = []) {
  const latest = values
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0];
  return latest ? new Date(latest).toISOString() : "";
}

async function listUserRoutines(user) {
  const store = await readRoutineStore();
  return getMergedUserRoutines(store, user.id);
}

async function updateUserRoutine(user, id, updates) {
  return mutateRoutineStore((store) => {
    const routines = getMergedUserRoutines(store, user.id);
    const existing = routines.find((routine) => routine.id === id);
    if (!existing) throw new HttpError(404, "routine_not_found");
    const now = new Date();
    const intervalMinutes = Math.max(15, Math.min(Number(updates.intervalMinutes || existing.intervalMinutes), 10080));
    const preferredTime = normalizePreferredTime(updates.preferredTime || existing.preferredTime || defaultRoutineTime(id));
    const weeklyDay = normalizeWeeklyDay(updates.weeklyDay ?? existing.weeklyDay ?? defaultRoutineWeekday(id));
    const windowStart = normalizePreferredTime(updates.windowStart || existing.windowStart || "00:00");
    const windowEnd = normalizePreferredTime(updates.windowEnd || existing.windowEnd || "23:59");
    const blockedDates = normalizeBlockedDates(updates.blockedDates ?? existing.blockedDates);
    const updated = {
      ...existing,
      enabled: Boolean(updates.enabled),
      intervalMinutes,
      preferredTime,
      weeklyDay,
      paused: Boolean(updates.paused),
      windowStart,
      windowEnd,
      blockedDates,
      nextRunAt: updates.enabled ? updates.nextRunAt || addMinutes(now, intervalMinutes).toISOString() : null,
      updatedAt: now.toISOString(),
    };
    store[user.id] = routines.map((routine) => (routine.id === id ? updated : routine));
    return updated;
  });
}

async function runUserRoutine(user, id, options = {}) {
  const routines = await listUserRoutines(user);
  const routine = routines.find((item) => item.id === id);
  if (!routine) throw new HttpError(404, "routine_not_found");
  const result = await executeRoutine(routine, user, options);
  const updated = await mutateRoutineStore((store) => {
    const merged = getMergedUserRoutines(store, user.id);
    const now = new Date();
    const nextRunAt = routine.enabled ? addMinutes(now, routine.intervalMinutes).toISOString() : routine.nextRunAt || null;
    const next = {
      ...merged.find((item) => item.id === id),
      lastRunAt: now.toISOString(),
      nextRunAt,
      lastStatus: "completed",
      lastResult: result,
      updatedAt: now.toISOString(),
    };
    store[user.id] = merged.map((item) => (item.id === id ? next : item));
    return next;
  });
  return { routine: updated, result };
}

function getMergedUserRoutines(store, userId) {
  const saved = Array.isArray(store[userId]) ? store[userId] : [];
  return defaultRoutines.map((base) => {
    const current = saved.find((routine) => routine.id === base.id) || {};
    return {
      ...base,
      ...current,
      nextRunAt: current.nextRunAt || null,
      lastRunAt: current.lastRunAt || null,
      lastStatus: current.lastStatus || "never",
      lastResult: current.lastResult || null,
      preferredTime: current.preferredTime || defaultRoutineTime(base.id),
      weeklyDay: normalizeWeeklyDay(current.weeklyDay ?? defaultRoutineWeekday(base.id)),
      paused: Boolean(current.paused),
      windowStart: normalizePreferredTime(current.windowStart || "00:00"),
      windowEnd: normalizePreferredTime(current.windowEnd || "23:59"),
      blockedDates: normalizeBlockedDates(current.blockedDates),
    };
  });
}

async function processRoutineSchedules() {
  if (routineSchedulerRunning) return;
  routineSchedulerRunning = true;
  try {
    const store = await readRoutineStore();
    const now = new Date();
    for (const [userId, routines] of Object.entries(store)) {
      for (const routine of getMergedUserRoutines(store, userId)) {
        if (!routine.enabled || !routine.nextRunAt || new Date(routine.nextRunAt) > now) continue;
        const blockReason = getRoutineBlockReason(now, routine);
        if (blockReason) {
          await postponeRoutine(userId, routine, now, blockReason);
          continue;
        }
        const user = { id: userId, email: "scheduled@local", accessToken: null };
        try {
          await runUserRoutine(user, routine.id, { scheduled: true });
        } catch (error) {
          await appendLog("error", `Scheduled routine failed: ${routine.id}`, { userId, error: error.message });
          await mutateRoutineStore((currentStore) => {
            const merged = getMergedUserRoutines(currentStore, userId);
            const next = {
              ...routine,
              lastRunAt: now.toISOString(),
              nextRunAt: addMinutes(now, routine.intervalMinutes).toISOString(),
              lastStatus: "failed",
              lastResult: { error: error.message },
              updatedAt: now.toISOString(),
            };
            currentStore[userId] = merged.map((item) => (item.id === routine.id ? next : item));
            return next;
          });
        }
      }
    }
  } finally {
    routineSchedulerRunning = false;
  }
}

async function executeRoutine(routine, user, options = {}) {
  if (routine.id === "embedding-refresh") {
    const result = await backfillEmbeddings(user, 200);
    await appendLog("info", "Routine completed: embedding refresh", { userId: user.id, result, options });
    return result;
  }
  if (routine.id === "weekly-report") {
    const experiences = await listExperiences(user);
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = experiences.filter((item) => new Date(item.timestamp).getTime() >= since);
    const result = {
      count: recent.length,
      hours: Number((recent.reduce((sum, item) => sum + Number(item.duration || 0), 0) / 60).toFixed(1)),
      topCategory: getTopCategoryFor(recent),
    };
    await appendLog("info", "Routine completed: weekly report", { userId: user.id, result, options });
    return result;
  }
  if (routine.id === "daily-briefing") {
    const experiences = await listExperiences(user);
    const location = inferPrimaryLocationFrom(experiences) || DEFAULT_OPERATIONAL_LOCATION;
    const result = await getDailyBriefing(location, "es");
    await appendLog("info", "Routine completed: daily briefing", { userId: user.id, location, options });
    return result;
  }
  if (routine.id === "context-scan") {
    const experiences = await listExperiences(user);
    const location = inferPrimaryLocationFrom(experiences);
    const result = location ? await getContextImpact(location) : { status: "no_location" };
    await appendLog("info", "Routine completed: context scan", { userId: user.id, location, options });
    return result;
  }
  if (routine.id === "oura-sync") {
    let result;
    try {
      result = await syncOuraApiData({
        startDate: formatLocalDateKey(new Date(Date.now() - OURA_DEFAULT_SYNC_DAYS * 24 * 60 * 60 * 1000)),
        endDate: formatLocalDateKey(new Date()),
        maxPages: 12,
      }, user);
    } catch (error) {
      result = {
        status: "not_ready",
        error: error.message,
        detail: error.detail || null,
        nextAction: "Conecta Oura y define las variables de backend antes de activar la rutina.",
      };
    }
    await appendLog("info", "Routine completed: Oura sync", { userId: user.id, result, options });
    return result;
  }
  if (routine.id === "offline-sync") {
    const result = { status: "ready", message: "La sincronización offline se ejecuta desde el navegador cuando hay cola local." };
    await appendLog("info", "Routine checked: offline sync", { userId: user.id, result, options });
    return result;
  }
  if (routine.id === "daily-review") {
    const result = { status: "template-ready", template: "Daily Review" };
    await appendLog("info", "Routine checked: daily review", { userId: user.id, result, options });
    return result;
  }
  throw new Error(`unknown_routine:${routine.id}`);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function defaultRoutineTime(id) {
  if (id === "daily-review") return "18:00";
  if (id === "weekly-report") return "09:00";
  if (id === "embedding-refresh") return "02:00";
  if (id === "oura-sync") return "04:00";
  return "08:00";
}

function defaultRoutineWeekday(id) {
  if (id === "weekly-report") return 1;
  return 1;
}

function normalizePreferredTime(value) {
  return /^\d{2}:\d{2}$/.test(String(value || "")) ? value : "08:00";
}

function normalizeWeeklyDay(value) {
  const day = Number(value);
  return Number.isFinite(day) ? Math.max(0, Math.min(day, 6)) : 1;
}

function normalizeBlockedDates(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(/[,\s;]+/);
  return [...new Set(values.map((item) => String(item).trim()).filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item)))].slice(0, 50);
}

function getRoutineBlockReason(date, routine) {
  if (routine.paused) return "paused";
  if (isBlockedRoutineDate(date, routine)) return "blocked-date";
  if (!isWithinRoutineWindow(date, routine)) return "outside-window";
  return "";
}

function isBlockedRoutineDate(date, routine) {
  return normalizeBlockedDates(routine.blockedDates).includes(formatLocalDateKey(date));
}

function isWithinRoutineWindow(date, routine) {
  const start = timeToMinutes(routine.windowStart || "00:00", 0);
  const end = timeToMinutes(routine.windowEnd || "23:59", 1439);
  const current = date.getHours() * 60 + date.getMinutes();
  if (start <= end) return current >= start && current <= end;
  return current >= start || current <= end;
}

async function postponeRoutine(userId, routine, now, reason = "outside-window") {
  await mutateRoutineStore((store) => {
    const merged = getMergedUserRoutines(store, userId);
    const next = {
      ...routine,
      nextRunAt: calculatePostponedRun(now, routine, reason).toISOString(),
      lastStatus: reason,
      updatedAt: now.toISOString(),
    };
    store[userId] = merged.map((item) => (item.id === routine.id ? next : item));
    return next;
  });
}

function calculatePostponedRun(now, routine, reason) {
  const next = new Date(now);
  const start = timeToMinutes(routine.windowStart || routine.preferredTime || "08:00", 480);
  const end = timeToMinutes(routine.windowEnd || "23:59", 1439);
  const current = next.getHours() * 60 + next.getMinutes();
  if (reason === "blocked-date" || (reason === "outside-window" && current > end)) {
    next.setDate(next.getDate() + 1);
    next.setHours(Math.floor(start / 60), start % 60, 0, 0);
    return next;
  }
  if (reason === "outside-window" && current < start) {
    next.setHours(Math.floor(start / 60), start % 60, 0, 0);
    return next;
  }
  return addMinutes(now, Math.max(15, Math.min(Number(routine.intervalMinutes || 60), 10080)));
}

function timeToMinutes(value, fallback) {
  const [hours, minutes] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
  return Math.max(0, Math.min(hours * 60 + minutes, 1439));
}

function formatLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function inferPrimaryLocationFrom(experiences) {
  const counts = experiences.reduce((acc, item) => {
    if (item.location && item.location !== "Sin ubicación") acc[item.location] = (acc[item.location] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function getTopCategoryFor(experiences) {
  const totals = experiences.reduce((acc, item) => {
    const category = normalizeCategoryName(item.category);
    acc[category] = (acc[category] || 0) + Number(item.duration || 0);
    return acc;
  }, {});
  return Object.entries(totals).sort((a, b) => b[1] - a[1])[0]?.[0] || "Sin datos";
}

function experienceSearchText(experience) {
  return [
    experience.title,
    experience.objective,
    normalizeCategoryName(experience.category),
    experience.mood,
    experience.location,
    experience.people,
    experience.notes,
    ...(experience.attachments || []).map((attachment) => attachment.name || ""),
  ].join(" ");
}

function vectorizeText(text) {
  const synonyms = {
    clima: "weather tiempo lluvia viento temperatura",
    weather: "clima lluvia viento temperatura",
    energia: "energy focus mood ánimo productividad",
    energy: "energía focus mood productivity",
    geopolitica: "geopolitical news conflict protest security election noticias",
    noticias: "news geopolitical conflict protest security election",
    aprendizaje: "learning study insight skill conocimiento",
    familia: "family social hogar relaciones",
    trabajo: "work productivity focus reunión proyecto",
    salud: "health wellness energy descanso movimiento",
  };
  return tokenizeText(text).reduce((vector, token) => {
    const expanded = synonyms[token] ? tokenizeText(`${token} ${synonyms[token]}`) : [token];
    expanded.forEach((term) => {
      vector[term] = (vector[term] || 0) + 1;
    });
    return vector;
  }, {});
}

function tokenizeText(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

function cosineSimilarity(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  keys.forEach((key) => {
    dot += (a[key] || 0) * (b[key] || 0);
    normA += (a[key] || 0) ** 2;
    normB += (b[key] || 0) ** 2;
  });
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

async function createEmbedding(text) {
  if (activeEmbeddingsProvider() === "openai") {
    return createOpenAiEmbedding(text);
  }
  return createLocalHashEmbedding(text);
}

function activeEmbeddingsProvider() {
  return EMBEDDINGS_PROVIDER === "openai" && OPENAI_API_KEY ? "openai" : "local-hash";
}

async function createOpenAiEmbedding(text) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`openai_embedding_${response.status}: ${payload.error?.message || "failed"}`);
  return normalizeEmbedding(payload.data?.[0]?.embedding || []);
}

function createLocalHashEmbedding(text) {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  const tokens = tokenizeText(text);
  tokens.forEach((token, tokenIndex) => {
    const expanded = [token, ...characterShingles(token)];
    expanded.forEach((part, partIndex) => {
      const index = positiveHash(`${part}:${partIndex}`) % EMBEDDING_DIMENSIONS;
      const sign = positiveHash(`${part}:sign`) % 2 === 0 ? 1 : -1;
      vector[index] += sign * (1 + Math.min(token.length, 12) / 12) * (tokenIndex + 1) ** -0.15;
    });
  });
  return normalizeEmbedding(vector);
}

function characterShingles(token) {
  if (token.length <= 4) return [token];
  const shingles = [];
  for (let index = 0; index <= token.length - 4; index += 1) {
    shingles.push(token.slice(index, index + 4));
  }
  return shingles;
}

function positiveHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeEmbedding(vector) {
  const resized = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => Number(vector[index] || 0));
  const norm = Math.sqrt(resized.reduce((sum, value) => sum + value * value, 0)) || 1;
  return resized.map((value) => Number((value / norm).toFixed(7)));
}

async function transcribeMedia(media) {
  if (activeTranscriptionProvider() !== "openai") {
    return {
      provider: activeTranscriptionProvider(),
      transcript: "",
      status: "unavailable",
      message: "Configure TRANSCRIPTION_PROVIDER=openai and OPENAI_API_KEY to enable backend transcription.",
    };
  }
  const normalized = normalizeMedia(media);
  if ((!normalized.dataUrl && !normalized.url) || !isTranscribableServerMedia(normalized)) {
    throw new HttpError(400, "audio_data_required");
  }
  const bytes = await getDocumentBytes(normalized);
  const transcriptionType = normalized.type.startsWith("audio/") ? normalized.type : "audio/webm";
  const form = new FormData();
  form.append("model", OPENAI_TRANSCRIPTION_MODEL);
  form.append("file", new Blob([bytes], { type: transcriptionType }), normalized.name || "audio.webm");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: form,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`transcription_${response.status}: ${payload.error?.message || "failed"}`);
  }
  return {
    provider: "openai",
    model: OPENAI_TRANSCRIPTION_MODEL,
    transcript: payload.text || "",
    status: "ok",
  };
}

function isTranscribableServerMedia(media = {}) {
  const type = String(media.type || media.originalType || "").toLowerCase();
  if (type.startsWith("audio/")) return true;
  return isLikelyServerAudioWebm(media);
}

async function extractDocumentText(media) {
  const normalized = normalizeMedia(media);
  const bytes = await getDocumentBytes(normalized);
  const extension = getExtension(normalized.name || normalized.type || "");
  if (["zip", "rar", "7z"].includes(extension)) {
    if (extension === "zip" && isAppleHealthBiometricArchive(normalized)) {
      return analyzeAppleHealthZip(normalized, bytes);
    }
    return {
      status: "skipped",
      method: "archive-transport-only",
      text: "",
      characters: 0,
    };
  }
  let text = "";
  let method = "";
  if (extension === "docx" || normalized.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    text = extractDocxText(bytes);
    method = "server-docx-extraction";
  } else if (extension === "pdf" || normalized.type === "application/pdf") {
    text = extractPdfText(bytes);
    method = "server-pdf-heuristic";
    const cleanedPdfText = cleanExtractedText(text);
    if (!cleanedPdfText && activeOcrProvider() === "openai") {
      return ocrPdfDocument(normalized, bytes);
    }
  } else if (extension === "rtf" || normalized.type === "application/rtf" || normalized.type === "text/rtf") {
    text = extractRtfText(bytes.toString("utf8"));
    method = "server-rtf-extraction";
  } else {
    text = bytes.toString("utf8");
    method = "server-text-extraction";
  }
  const cleaned = cleanExtractedText(text);
  return {
    status: cleaned ? "ok" : "empty",
    method,
    text: cleaned,
    characters: cleaned.length,
  };
}

function isAppleHealthBiometricArchive(media = {}) {
  const name = String(media.name || media.fileName || "").toLowerCase();
  const type = String(media.type || media.originalType || "").toLowerCase();
  const sourceType = String(media.sourceType || media.source || media.metadata?.sourceType || "").toLowerCase();
  const payloadType = String(media.payloadType || media.metadata?.payloadType || media.metadata?.externalPayloadType || "").toLowerCase();
  const intent = String(media.processingIntent || media.metadata?.processingIntent || media.metadata?.externalProcessingIntent || "").toLowerCase();
  const biometricImport = media.biometricImport || media.metadata?.biometricImport;
  return type.includes("zip")
    && (
      payloadType.includes("biometric")
      || sourceType.includes("biometric")
      || intent.includes("biometric")
      || Boolean(biometricImport)
      || /apple[-_\s]?health|healthkit|export\.zip|biometric|biometr/.test(name)
    );
}

async function analyzeAppleHealthZip(media = {}, existingBytes = null) {
  const bytes = existingBytes || await getDocumentBytes(normalizeMedia(media));
  const entries = readZipEntries(bytes);
  const xmlEntry = Object.entries(entries).find(([name]) =>
    /(^|\/)(export|apple_health_export|health)[^/]*\.xml$/i.test(name)
      || /apple_health_export\/export\.xml$/i.test(name)
      || /export\.xml$/i.test(name),
  );
  if (!xmlEntry) {
    return {
      status: "skipped",
      method: "apple-health-zip-no-export-xml",
      text: "",
      message: "ZIP recibido como biometria, pero no contiene export.xml reconocible.",
    };
  }
  const [entryName, xmlBytes] = xmlEntry;
  const xml = xmlBytes.toString("utf8");
  const rows = extractAppleHealthXmlRowsServer(xml).slice(0, 50000);
  const metricNames = detectServerBiometricMetricNames(rows);
  const metrics = aggregateServerBiometricRows(rows);
  const dates = rows
    .map((row) => row.date)
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a - b);
  const startAt = dates[0]?.toISOString() || "";
  const endAt = dates[dates.length - 1]?.toISOString() || "";
  const sourceDevice = detectServerBiometricSource(rows) || "Apple Health";
  const biometricImport = {
    sourceDevice,
    fileName: media.name || "export.zip",
    archiveEntry: entryName,
    recordCount: rows.length,
    metricNames,
    startAt,
    endAt,
    metrics,
    records: rows.slice(0, 250),
  };
  const metricText = metricNames.length ? metricNames.join(", ") : "sin senales identificadas";
  const rangeText = startAt && endAt ? `${startAt} - ${endAt}` : "sin rango detectado";
  const text = [
    `Importacion Apple Health desde ZIP.`,
    `${rows.length} registros interpretados.`,
    `Fuente principal: ${sourceDevice}.`,
    `Senales: ${metricText}.`,
    `Rango: ${rangeText}.`,
    metrics.heartAvg ? `Frecuencia cardiaca promedio: ${Math.round(metrics.heartAvg)}.` : "",
    metrics.steps ? `Pasos acumulados: ${Math.round(metrics.steps)}.` : "",
    metrics.activeEnergy ? `Energia activa: ${Math.round(metrics.activeEnergy)}.` : "",
    metrics.sleepMinutes ? `Sueno registrado: ${(metrics.sleepMinutes / 60).toFixed(1)} horas.` : "",
  ].filter(Boolean).join(" ");
  return {
    status: rows.length ? "ok" : "empty",
    method: "server-apple-health-zip-extraction",
    provider: "local-server",
    text,
    characters: text.length,
    biometricImport,
    structuredContext: {
      connector: "apple-healthkit-native",
      payloadType: inferServerBiometricPayloadType(metricNames),
      metrics,
      signals: rows.slice(0, 250),
    },
  };
}

function extractAppleHealthXmlRowsServer(xml = "") {
  const text = String(xml || "");
  const rows = [];
  for (const match of text.matchAll(/<Record\b([^>]*)\/?>/gi)) {
    const attrs = parseXmlAttributes(match[1] || "");
    rows.push(normalizeServerBiometricRow({
      type: String(attrs.type || "").replace(/^HKQuantityTypeIdentifier/, "").replace(/^HKCategoryTypeIdentifier/, ""),
      source: attrs.sourceName || attrs.source || "",
      sourceName: attrs.sourceName || "",
      device: attrs.device || "",
      unit: attrs.unit || "",
      creationDate: attrs.creationDate || "",
      startDate: attrs.startDate || "",
      endDate: attrs.endDate || "",
      value: attrs.value || "",
    }));
  }
  for (const match of text.matchAll(/<Workout\b([^>]*)\/?>/gi)) {
    const attrs = parseXmlAttributes(match[1] || "");
    rows.push(normalizeServerBiometricRow({
      type: String(attrs.workoutActivityType || "Workout").replace(/^HKWorkoutActivityType/, "Workout"),
      source: attrs.sourceName || attrs.source || "",
      sourceName: attrs.sourceName || "",
      unit: attrs.durationUnit || "min",
      creationDate: attrs.creationDate || "",
      startDate: attrs.startDate || "",
      endDate: attrs.endDate || "",
      duration: attrs.duration || "",
      value: attrs.duration || "",
    }));
  }
  return rows.filter((row) => row.type || row.date || row.value);
}

function parseXmlAttributes(raw = "") {
  const attrs = {};
  for (const match of String(raw || "").matchAll(/([:\w-]+)\s*=\s*"([^"]*)"/g)) {
    attrs[match[1]] = decodeXmlEntities(match[2] || "");
  }
  return attrs;
}

function decodeXmlEntities(value = "") {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function normalizeServerBiometricRow(row = {}) {
  const type = String(row.type || row.metric || row.metricType || row.identifier || row.name || "");
  const source = String(row.source || row.sourceName || row.device || row.deviceName || "");
  const date = String(row.startDate || row.start || row.date || row.timestamp || row.creationDate || row.endDate || "");
  const value = row.value ?? row.quantity ?? row.count ?? row.duration ?? "";
  const unit = row.unit || "";
  return { ...row, type, source, date, value, unit };
}

function classifyServerBiometricType(row = {}) {
  const raw = `${row.type || ""} ${row.metric || ""}`.toLowerCase();
  if (/heart|hr|cardio|pulse|ritmo|frecuencia/.test(raw)) return "heart";
  if (/step|paso/.test(raw)) return "steps";
  if (/sleep|sueno/.test(raw)) return "sleep";
  if (/energy|calorie|kcal|energia/.test(raw)) return "energy";
  if (/distance|distancia/.test(raw)) return "distance";
  if (/workout|exercise|active|actividad|entreno/.test(raw)) return "activity";
  if (/oxygen|spo2|respiratory|respiracion/.test(raw)) return "respiration";
  return "other";
}

function getServerBiometricNumericValue(row = {}) {
  const value = Number(String(row.value ?? "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(value) ? value : 0;
}

function aggregateServerBiometricRows(rows = []) {
  const grouped = rows.reduce((acc, row) => {
    const type = classifyServerBiometricType(row);
    const value = getServerBiometricNumericValue(row);
    if (!acc[type]) acc[type] = [];
    if (value) acc[type].push(value);
    return acc;
  }, {});
  const sum = (items = []) => items.reduce((total, value) => total + value, 0);
  return {
    heartAvg: grouped.heart?.length ? average(grouped.heart) : 0,
    steps: grouped.steps?.length ? sum(grouped.steps) : 0,
    activeEnergy: grouped.energy?.length ? sum(grouped.energy) : 0,
    sleepMinutes: grouped.sleep?.length ? sum(grouped.sleep) : 0,
    activityCount: grouped.activity?.length || 0,
    metricTypes: Object.keys(grouped),
    recordCount: rows.length,
  };
}

function detectServerBiometricMetricNames(rows = []) {
  const names = new Set();
  rows.forEach((row) => {
    const raw = String(row.type || "").toLowerCase();
    if (!raw) return;
    if (/heart|hr|cardio|pulse|ritmo|frecuencia/.test(raw)) names.add("frecuencia cardiaca");
    else if (/step|paso/.test(raw)) names.add("pasos");
    else if (/sleep|sueno/.test(raw)) names.add("sueno");
    else if (/energy|calorie|kcal|energia/.test(raw)) names.add("energia/calorias");
    else if (/distance|distancia/.test(raw)) names.add("distancia");
    else if (/oxygen|spo2|respiratory|respiracion/.test(raw)) names.add("oxigeno/respiracion");
    else if (/workout|exercise|active|actividad|entreno/.test(raw)) names.add("actividad");
    else names.add(raw.replace(/^hkquantitytypeidentifier/i, "").replace(/^hkcategorytypeidentifier/i, "").slice(0, 34));
  });
  return [...names].filter(Boolean).slice(0, 12);
}

function detectServerBiometricSource(rows = []) {
  const counts = rows.reduce((acc, row) => {
    const source = String(row.source || row.sourceName || "").trim();
    if (source) acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function inferServerBiometricPayloadType(metricNames = []) {
  const text = (metricNames || []).join(" ").toLowerCase();
  if (/sleep|sueno/.test(text)) return "sleep";
  if (/step|distance|workout|activity|calorie|paso|actividad|energia/.test(text)) return "activity";
  return "biometric";
}

async function ocrPdfDocument(media, bytes) {
  if (bytes.length > 50_000_000) throw new HttpError(413, "pdf_ocr_too_large");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_OCR_MODEL,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_file",
              filename: media.name || "document.pdf",
              file_data: bytes.toString("base64"),
            },
            {
              type: "input_text",
              text: "Extract all readable text from this PDF, including scanned pages. Return only the extracted text. If there is no readable text, return an empty string.",
            },
          ],
        },
      ],
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`pdf_ocr_${response.status}: ${payload.error?.message || "failed"}`);
  }
  const cleaned = cleanExtractedText(extractOpenAIResponseText(payload));
  return {
    status: cleaned ? "ok" : "empty",
    provider: "openai",
    model: OPENAI_OCR_MODEL,
    method: "openai-pdf-ocr",
    text: cleaned,
    characters: cleaned.length,
  };
}

async function ocrImage(media) {
  if (activeOcrProvider() !== "openai") {
    return {
      provider: activeOcrProvider(),
      status: "unavailable",
      text: "",
      message: "Configure OCR_PROVIDER=openai and OPENAI_API_KEY to enable backend OCR.",
    };
  }
  const normalized = normalizeMedia(media);
  if (!normalized.dataUrl && !normalized.url) throw new HttpError(400, "image_data_required");
  const imageUrl = normalized.dataUrl || normalized.url;
  if (!String(normalized.type || "").startsWith("image/") && !String(imageUrl || "").startsWith("data:image/")) {
    throw new HttpError(400, "image_type_required");
  }
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_OCR_MODEL,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Extract all readable text from this image. Return only the extracted text. If there is no readable text, return an empty string.",
            },
            {
              type: "input_image",
              image_url: imageUrl,
            },
          ],
        },
      ],
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`ocr_${response.status}: ${payload.error?.message || "failed"}`);
  }
  const text = extractOpenAIResponseText(payload);
  return {
    provider: "openai",
    model: OPENAI_OCR_MODEL,
    status: text ? "ok" : "empty",
    method: "openai-image-ocr",
    text: cleanExtractedText(text),
    characters: cleanExtractedText(text).length,
  };
}

async function translateText(body = {}) {
  if (!OPENAI_API_KEY) {
    return {
      provider: "none",
      status: "unavailable",
      translatedText: "",
      detectedLanguage: body.sourceLanguage || "",
      targetLanguage: body.targetLanguage || "es",
      message: "Configure OPENAI_API_KEY to enable backend translation.",
    };
  }
  const text = String(body.text || "").trim();
  if (!text) throw new HttpError(400, "translation_text_required");
  const targetLanguage = normalizeLanguageCode(body.targetLanguage || "es");
  const sourceLanguage = normalizeLanguageCode(body.sourceLanguage || "");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_OCR_MODEL,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `Translate the following asset text to ${targetLanguage}.`,
                sourceLanguage ? `The source language hint is ${sourceLanguage}.` : "Detect the source language.",
                "Return only valid JSON with keys detectedLanguage and translatedText. Preserve names, prices, dates, and units.",
                text.slice(0, 12000),
              ].join("\n\n"),
            },
          ],
        },
      ],
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`translation_${response.status}: ${payload.error?.message || "failed"}`);
  }
  const raw = extractOpenAIResponseText(payload);
  let parsed = {};
  try {
    parsed = JSON.parse(raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim());
  } catch {
    parsed = { translatedText: raw };
  }
  return {
    provider: "openai",
    model: OPENAI_OCR_MODEL,
    status: "ok",
    detectedLanguage: normalizeLanguageCode(parsed.detectedLanguage || sourceLanguage || ""),
    targetLanguage,
    translatedText: cleanExtractedText(parsed.translatedText || raw),
  };
}

function normalizeLanguageCode(value = "") {
  const raw = String(value || "").toLowerCase().trim();
  if (!raw) return "";
  if (raw.startsWith("es") || raw.includes("spanish") || raw.includes("español")) return "es";
  if (raw.startsWith("en") || raw.includes("english") || raw.includes("inglés") || raw.includes("ingles")) return "en";
  if (raw.startsWith("fr") || raw.includes("french") || raw.includes("francés") || raw.includes("frances")) return "fr";
  if (raw.startsWith("pt")) return "pt";
  if (raw.startsWith("it")) return "it";
  if (raw.startsWith("de")) return "de";
  if (raw.startsWith("cs") || raw.includes("czech") || raw.includes("checo")) return "cs";
  if (raw.startsWith("ja")) return "ja";
  return raw.slice(0, 8);
}

function extractOpenAIResponseText(payload = {}) {
  if (typeof payload.output_text === "string") return payload.output_text;
  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function getDocumentBytes(media) {
  if (media.dataUrl) return dataUrlToBuffer(media.dataUrl);
  if (media.url && /^https?:\/\//i.test(media.url)) {
    const response = await fetch(media.url);
    if (!response.ok) throw new HttpError(400, `document_fetch_failed_${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_MEDIA_BODY_LENGTH) throw new HttpError(413, "document_too_large");
    return buffer;
  }
  throw new HttpError(400, "document_data_required");
}

function getExtension(name = "") {
  return String(name).split("?")[0].split("#")[0].split(".").pop()?.toLowerCase() || "";
}

function extractDocxText(bytes) {
  const entries = readZipEntries(bytes);
  const documentNames = Object.keys(entries).filter((name) =>
    /^word\/(document|header\d*|footer\d*)\.xml$/i.test(name),
  );
  return documentNames
    .map((name) => xmlToText(entries[name].toString("utf8")))
    .filter(Boolean)
    .join("\n\n");
}

function readZipEntries(bytes) {
  const entries = {};
  const eocdOffset = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocdOffset < 0) return entries;
  const entryCount = bytes.readUInt16LE(eocdOffset + 10);
  const centralOffset = bytes.readUInt32LE(eocdOffset + 16);
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) break;
    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const fileNameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const name = bytes.slice(offset + 46, offset + 46 + fileNameLength).toString("utf8");
    if (bytes.readUInt32LE(localOffset) === 0x04034b50) {
      const localNameLength = bytes.readUInt16LE(localOffset + 26);
      const localExtraLength = bytes.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);
      if (method === 0) entries[name] = compressed;
      if (method === 8) entries[name] = inflateRawSync(compressed);
    }
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function xmlToText(xml = "") {
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function extractPdfText(bytes) {
  const raw = bytes.toString("latin1");
  const strings = [];
  const literalPattern = /\((?:\\.|[^\\)]){2,}\)\s*Tj/g;
  for (const match of raw.matchAll(literalPattern)) {
    strings.push(decodePdfLiteral(match[0].replace(/\)\s*Tj$/, "").slice(1)));
  }
  const arrayPattern = /\[((?:\s*\((?:\\.|[^\\)])+\)\s*-?\d*)+)\]\s*TJ/g;
  for (const match of raw.matchAll(arrayPattern)) {
    for (const part of match[1].matchAll(/\((?:\\.|[^\\)])+\)/g)) {
      strings.push(decodePdfLiteral(part[0].slice(1, -1)));
    }
  }
  if (strings.length) return strings.join(" ");
  return raw
    .replace(/[^\x09\x0a\x0d\x20-\x7eáéíóúÁÉÍÓÚñÑüÜ]+/g, " ")
    .replace(/\s+/g, " ");
}

function decodePdfLiteral(value = "") {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function extractRtfText(value = "") {
  return value
    .replace(/\\'[0-9a-fA-F]{2}/g, " ")
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\[a-zA-Z]+\d* ?/g, "")
    .replace(/[{}]/g, " ");
}

function cleanExtractedText(value = "") {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 20000);
}

function activeTranscriptionProvider() {
  return TRANSCRIPTION_PROVIDER === "openai" && OPENAI_API_KEY ? "openai" : "none";
}

function activeOcrProvider() {
  return OCR_PROVIDER === "openai" && OPENAI_API_KEY ? "openai" : "none";
}

async function buildPdfReport(user, report = null) {
  if (report?.summary && Array.isArray(report.rows)) {
    try {
      const reportLabPdf = await renderReportLabPdf("report_pdf_reportlab.py", report);
      await appendLog("info", "PDF report generated", { count: report.rows.length, userId: user.id, source: "reportlab" });
      return reportLabPdf;
    } catch (error) {
      await appendLog("error", "ReportLab PDF required but unavailable", { userId: user.id, document: "report", error: error.message });
      throw new HttpError(503, "reportlab_unavailable", error.message);
    }
  }
  const experiences = await listExperiences(user);
  const sorted = [...experiences].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const totalMinutes = sorted.reduce((sum, item) => sum + item.duration, 0);
  const avgEnergy = sorted.length ? average(sorted.map((item) => item.energy)).toFixed(1) : "0.0";
  const lines = [
    "Experience Hub MVP",
    "Reporte de experiencias",
    `Generado: ${new Date().toISOString()}`,
    `Experiencias: ${sorted.length}`,
    `Horas capturadas: ${(totalMinutes / 60).toFixed(1)}`,
    `Energía media: ${avgEnergy}/10`,
    "",
    ...sorted.slice(0, 40).map((item) => `${formatPdfDate(item.timestamp)} | ${item.title} | ${item.category} | ${item.energy}/10`),
  ];
  await appendLog("info", "PDF report generated", { count: sorted.length, userId: user.id });
  return createSimplePdf(lines);
}

async function buildPublicationPdf(payload = {}, user = { id: LOCAL_USER_ID }) {
  const html = typeof payload === "string" ? payload : payload.html;
  const draft = typeof payload === "object" && payload ? payload.draft : null;
  if ((!html || typeof html !== "string" || !html.trim()) && !draft) {
    throw new HttpError(400, "publication_payload_required");
  }
  try {
    const reportLabPdf = await renderReportLabPdf("publication_pdf_reportlab.py", {
      html: html || "",
      draft,
      title: typeof payload === "object" ? payload.title : "",
      language: typeof payload === "object" ? payload.language : "",
    });
    await appendLog("info", "Publication PDF generated", { userId: user.id, source: "reportlab" });
    return reportLabPdf;
  } catch (error) {
    await appendLog("error", "ReportLab PDF required but unavailable", { userId: user.id, document: "publication", error: error.message });
    throw new HttpError(503, "reportlab_unavailable", error.message);
  }
}

async function buildInsightsPdf(payload = {}, user = { id: LOCAL_USER_ID }) {
  try {
    const reportLabPdf = await renderReportLabPdf("insights_pdf_reportlab.py", payload);
    await appendLog("info", "Insights PDF generated", { userId: user.id, source: "reportlab" });
    return reportLabPdf;
  } catch (error) {
    await appendLog("error", "ReportLab PDF required but unavailable", { userId: user.id, document: "insights", error: error.message });
    throw new HttpError(503, "reportlab_unavailable", error.message);
  }
}

async function buildManualPdf(html, user = { id: LOCAL_USER_ID }) {
  if (typeof html !== "string" || !html.trim()) {
    throw new HttpError(400, "manual_html_required");
  }
  try {
    const reportLabPdf = await renderReportLabPdf("manual_pdf_reportlab.py", {
      title: "Manual Vibe",
      html,
    });
    await appendLog("info", "Manual PDF generated", { userId: user.id, source: "reportlab" });
    return reportLabPdf;
  } catch (error) {
    await appendLog("error", "ReportLab PDF required but unavailable", { userId: user.id, document: "manual", error: error.message });
    throw new HttpError(503, "reportlab_unavailable", error.message);
  }
}

function normalizePublicationHtmlForPdf(html) {
  if (html.includes("</style>")) {
    return html.replace(
      "</style>",
      `
html,body{max-width:100%;overflow-x:hidden}
article,section,.cover,.media,pre{max-width:100%;overflow-wrap:anywhere}
img,video{max-width:100%;height:auto}
pre{white-space:pre-wrap;word-break:break-word}
.media{grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}
@media print{article,section,.cover,.media figure{break-inside:avoid;page-break-inside:avoid}}
</style>`,
    );
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;margin:24px;color:#17201b}pre{white-space:pre-wrap;word-break:break-word}</style></head><body>${escapeHtmlServer(html)}</body></html>`;
}

function pdfBar(value, width = 16) {
  const score = Math.max(0, Math.min(100, Number(value) || 0));
  const filled = Math.round((score / 100) * width);
  return `[${"#".repeat(filled)}${"-".repeat(Math.max(0, width - filled))}]`;
}

function buildReportPdfHtml(report = {}) {
  const language = report.language === "en" ? "en" : "es";
  const labels = language === "en"
    ? {
        title: "Experience Report",
        subtitle: "Human Experience Intelligence Platform",
        generated: "Generated",
        experiences: "Experiences",
        hours: "Hours",
        energy: "Avg. energy",
        category: "Top category",
        executive: "Executive Summary",
        outlook: "Initial Outlook",
        integrated: "Integrated Reading",
        kpis: "Human Indexes",
        categories: "Category Breakdown",
        routes: "Experience Map Routes",
        evidence: "Multimodal Evidence",
        table: "Experience Register",
        confidence: "Confidence",
        hypothesis: "Hypothesis",
        next: "Next action",
        priority: "Priority",
        action: "Action",
      }
    : {
        title: "Reporte de Experiencias",
        subtitle: "Plataforma de Inteligencia de Experiencias Humanas",
        generated: "Generado",
        experiences: "Experiencias",
        hours: "Horas",
        energy: "Energía media",
        category: "Categoría dominante",
        executive: "Resumen ejecutivo",
        outlook: "Proyección inicial",
        integrated: "Lectura integrada",
        kpis: "Índices humanos",
        categories: "Desglose por categoría",
        routes: "Rutas del mapa de experiencias",
        evidence: "Evidencia multimodal",
        table: "Registro de experiencias",
        confidence: "Confianza",
        hypothesis: "Hipótesis",
        next: "Siguiente acción",
        priority: "Prioridad",
        action: "Acción",
      };
  const summary = report.summary || {};
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const attachmentCount = rows.reduce((sum, row) => sum + Number(row.adjuntos || row.attachments || 0), 0);
  const predictive = report.predictiveOutlook || {};
  const integrated = Array.isArray(report.integratedReading) ? report.integratedReading : [];
  const kpis = Array.isArray(report.humanKpis) ? report.humanKpis : [];
  const categories = Array.isArray(report.categoryBreakdown) ? report.categoryBreakdown : [];
  const routes = Array.isArray(report.mapRoutes) ? report.mapRoutes : [];
  const evidence = Array.isArray(report.multimodalEvidence) ? report.multimodalEvidence : [];
  const maxMinutes = Math.max(...categories.map((item) => Number(item.minutes || 0)), 1);
  const heroImage = evidence.find((item) => item.previewUrl)?.previewUrl || "";
  const integratedSelection = integrated
    .slice()
    .sort((a, b) => reportPdfPriorityRank(b.priority) - reportPdfPriorityRank(a.priority))
    .slice(0, 4);
  const kpiSelection = kpis.slice(0, 4);
  const categorySelection = categories.slice(0, 8);
  const routeSelection = routes.slice(0, 4);
  const evidenceSelection = uniqueReportPdfEvidence(evidence).slice(0, 4);
  const rowSelection = rows.slice(0, 18);
  return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: Letter; margin: 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #17202a; background: #ffffff; }
    .cover { min-height: 90vh; display: grid; align-content: center; gap: 24px; padding: 28px; border-radius: 18px; background: linear-gradient(135deg, #10263f, #0d7c66 58%, #f2b84b); color: white; position: relative; overflow: hidden; }
    .cover:after { content: ""; position: absolute; inset: auto -70px -120px auto; width: 280px; height: 280px; border-radius: 50%; background: rgba(255,255,255,.18); }
    .cover h1 { margin: 0; max-width: 680px; font-size: 42px; line-height: 1.02; }
    .cover p { margin: 0; max-width: 620px; font-size: 16px; color: rgba(255,255,255,.86); }
    .hero-image { width: 220px; height: 140px; object-fit: cover; border-radius: 14px; border: 2px solid rgba(255,255,255,.55); box-shadow: 0 18px 38px rgba(0,0,0,.25); }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 8px; }
    .stat { padding: 14px; border-radius: 14px; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.24); }
    .stat span { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: rgba(255,255,255,.78); }
    .stat strong { display: block; margin-top: 6px; font-size: 24px; }
    section { break-inside: avoid; page-break-inside: avoid; margin: 22px 0; }
    h2 { margin: 0 0 12px; font-size: 22px; color: #10263f; }
    h3 { margin: 0 0 8px; font-size: 15px; color: #17202a; }
    p { margin: 4px 0; color: #485869; line-height: 1.45; }
    .card-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .card, .wide-card { padding: 14px; border: 1px solid #d8e0e8; border-radius: 14px; background: #fbfdff; break-inside: avoid; overflow: hidden; }
    .wide-card { background: #f3faf7; border-color: #b8d9ce; }
    .pill { display: inline-block; padding: 4px 9px; border-radius: 999px; background: #eef4ff; color: #25507a; font-size: 11px; font-weight: 700; }
    .meter { height: 9px; margin-top: 8px; background: #e6edf4; border-radius: 999px; overflow: hidden; }
    .meter i { display: block; height: 100%; background: linear-gradient(90deg, #0d7c66, #55b7d7); }
    .category-row { display: grid; grid-template-columns: 150px 1fr 54px; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid #e7edf3; }
    .category-row:last-child { border-bottom: 0; }
    .evidence-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .evidence-image { width: 100%; height: 120px; object-fit: cover; border-radius: 10px; margin-bottom: 8px; }
    .callout { padding: 12px 14px; border-left: 4px solid #0d7c66; background: #f3faf7; border-radius: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th { text-align: left; background: #10263f; color: white; padding: 7px; }
    td { border-bottom: 1px solid #e2e8ef; padding: 7px; vertical-align: top; }
    .footer-note { margin-top: 18px; color: #728092; font-size: 10px; }
  </style>
</head>
<body>
  <section class="cover">
    <div>
      <span class="pill">${escapeHtmlServer(labels.subtitle)}</span>
      <h1>${escapeHtmlServer(labels.title)}</h1>
      <p>${escapeHtmlServer(labels.generated)}: ${escapeHtmlServer(formatReportPdfDateTime(report.generatedAt || new Date().toISOString()))}</p>
    </div>
    ${heroImage ? `<img class="hero-image" src="${escapeHtmlServer(heroImage)}" alt="" />` : ""}
    <div class="stats">
      <article class="stat"><span>${escapeHtmlServer(labels.experiences)}</span><strong>${escapeHtmlServer(summary.totalExperiences ?? rows.length)}</strong></article>
      <article class="stat"><span>${escapeHtmlServer(labels.hours)}</span><strong>${escapeHtmlServer(summary.capturedHours ?? 0)}</strong></article>
      <article class="stat"><span>${escapeHtmlServer(labels.energy)}</span><strong>${escapeHtmlServer(summary.averageEnergy ?? 0)}/10</strong></article>
      <article class="stat"><span>${escapeHtmlServer(labels.category)}</span><strong>${escapeHtmlServer(summary.topCategory || "-")}</strong></article>
    </div>
  </section>
  <section>
    <h2>${escapeHtmlServer(labels.executive)}</h2>
    <div class="wide-card">
      <p>${escapeHtmlServer(buildPdfExecutiveSummary(report, attachmentCount, language))}</p>
    </div>
  </section>
  ${predictive?.title ? `<section><h2>${escapeHtmlServer(labels.outlook)}</h2><div class="wide-card"><span class="pill">${escapeHtmlServer(labels.confidence)} ${escapeHtmlServer(predictive.confidence || 0)}%</span><h3>${escapeHtmlServer(predictive.title)}</h3><p><b>${escapeHtmlServer(labels.hypothesis)}:</b> ${escapeHtmlServer(truncatePdfText(predictive.hypothesis || "", 260))}</p><p><b>${escapeHtmlServer(labels.next)}:</b> ${escapeHtmlServer(truncatePdfText(predictive.nextStep || "", 220))}</p>${renderPdfList((predictive.drivers || []).slice(0, 4).map((item) => truncatePdfText(item, 120)))}</div></section>` : ""}
  ${integratedSelection.length ? `<section><h2>${escapeHtmlServer(labels.integrated)}</h2><div class="card-grid">${integratedSelection.map((item) => `<article class="card"><span class="pill">${escapeHtmlServer(labels.priority)}: ${escapeHtmlServer(item.priority || "-")}</span><h3>${escapeHtmlServer(item.title || "")}</h3><p>${escapeHtmlServer(truncatePdfText(item.evidence || "", 160))}</p><p><b>${escapeHtmlServer(labels.action)}:</b> ${escapeHtmlServer(truncatePdfText(item.action || "", 190))}</p></article>`).join("")}</div></section>` : ""}
  ${kpiSelection.length ? `<section><h2>${escapeHtmlServer(labels.kpis)}</h2><div class="card-grid">${kpiSelection.map((item) => `<article class="card"><h3>${escapeHtmlServer(item.label || "KPI")}</h3><strong>${escapeHtmlServer(item.score || 0)}/100</strong><div class="meter"><i style="width:${clampPdfWidth(item.score)}%"></i></div><p>${escapeHtmlServer(truncatePdfText(item.detail || "", 150))}</p></article>`).join("")}</div></section>` : ""}
  ${categorySelection.length ? `<section><h2>${escapeHtmlServer(labels.categories)}</h2>${categorySelection.map((item) => `<div class="category-row"><span>${escapeHtmlServer(item.category || "")}</span><div class="meter"><i style="width:${Math.max(4, Math.round((Number(item.minutes || 0) / maxMinutes) * 100))}%"></i></div><strong>${escapeHtmlServer(item.avgEnergy || 0)}/10</strong></div>`).join("")}</section>` : ""}
  ${routeSelection.length ? `<section><h2>${escapeHtmlServer(labels.routes)}</h2><div class="card-grid">${routeSelection.map((route) => `<article class="card"><h3>${escapeHtmlServer(route.title || "")}</h3><p>${escapeHtmlServer(route.count || 0)} experiencias - ${escapeHtmlServer(route.avgEnergy || 0)}/10 - ${escapeHtmlServer(route.dominant || "")}</p></article>`).join("")}</div></section>` : ""}
  ${evidenceSelection.length ? `<section><h2>${escapeHtmlServer(labels.evidence)}</h2><p class="callout">${escapeHtmlServer(language === "en" ? "Selected evidence only. Use JSON or CSV for the complete technical register." : "Solo evidencia seleccionada. JSON y CSV conservan el registro tecnico completo.")}</p><div class="evidence-grid">${evidenceSelection.map((item) => `<article class="card">${item.previewUrl ? `<img class="evidence-image" src="${escapeHtmlServer(item.previewUrl)}" alt="" />` : ""}<h3>${escapeHtmlServer(item.experienceTitle || item.name || "")}</h3><p><b>${escapeHtmlServer(item.kind || "")}</b> - ${escapeHtmlServer(item.name || "")}</p><p>${escapeHtmlServer(truncatePdfText(item.analyticalText || item.translatedText || item.manualNote || "", 220))}</p></article>`).join("")}</div></section>` : ""}
  <section>
    <h2>${escapeHtmlServer(language === "en" ? "Short register" : "Registro resumido")}</h2>
    <table>
      <thead><tr><th>Fecha</th><th>Experiencia</th><th>Categoría</th><th>Energía</th><th>Adjuntos</th></tr></thead>
      <tbody>${rowSelection.map((row) => `<tr><td>${escapeHtmlServer(row.fecha || row.date || "")}</td><td>${escapeHtmlServer(row.titulo || row.title || "")}</td><td>${escapeHtmlServer(row.categoría || row.categoria || row.category || "")}</td><td>${escapeHtmlServer(row.energia || row.energy || "")}/10</td><td>${escapeHtmlServer(row.adjuntos || row.attachments || 0)}</td></tr>`).join("")}</tbody>
    </table>
    <p class="footer-note">${escapeHtmlServer(language === "en" ? "This PDF is an executive report. Full evidence, rows, and technical fields remain in JSON and CSV." : "Este PDF es un reporte ejecutivo. La evidencia completa, filas y campos tecnicos quedan en JSON y CSV.")}</p>
    <p class="footer-note">Experience Hub - Vibe</p>
  </section>
</body>
</html>`;
}

async function renderReportHtmlToPdf(html) {
  const chromePath = findChromeExecutable();
  if (!chromePath) return null;
  const id = randomUUID();
  const htmlPath = path.join(tmpdir(), `experience-report-${id}.html`);
  const pdfPath = path.join(tmpdir(), `experience-report-${id}.pdf`);
  try {
    await writeFile(htmlPath, html, "utf-8");
    await execFileAsync(chromePath, [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--print-to-pdf=${pdfPath}`,
      "--print-to-pdf-no-header",
      pathToFileURL(htmlPath).href,
    ], { timeout: 45000, windowsHide: true });
    return await readFile(pdfPath);
  } catch (error) {
    await appendLog("warn", "HTML PDF rendering failed", { error: error.message });
    return null;
  } finally {
    await unlink(htmlPath).catch(() => {});
    await unlink(pdfPath).catch(() => {});
  }
}

async function renderReportLabPdf(scriptName, payload) {
  const scriptPath = path.join(__dirname, "scripts", scriptName);
  const pythonExecutable = findPythonExecutable();
  if (!existsSync(scriptPath)) {
    throw new Error(`missing_reportlab_script:${scriptName}`);
  }
  if (!pythonExecutable) {
    throw new Error("missing_python_executable_for_reportlab");
  }
  try {
    const stdout = await runReportLabProcess(pythonExecutable, scriptPath, payload);
    if (!stdout.length) {
      throw new Error("reportlab_empty_pdf_output");
    }
    return stdout;
  } catch (error) {
    const detail = summarizeReportLabError(error);
    await appendLog("warn", "ReportLab PDF rendering failed", {
      scriptName,
      error: detail,
      stdoutBytes: error.stdoutBytes || (Buffer.isBuffer(error.stdout) ? error.stdout.length : 0),
      stderrBytes: error.stderrBytes || (Buffer.isBuffer(error.stderr) ? error.stderr.length : 0),
    });
    throw new Error(detail || "reportlab_render_failed");
  }
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function summarizeReportLabError(error) {
  const message = String(error?.message || "reportlab_render_failed");
  const stderr = summarizeReportLabBuffer(error?.stderr);
  const stdout = summarizeReportLabBuffer(error?.stdout);
  return [message, stderr, stdout]
    .filter(Boolean)
    .join(" | ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
}

function summarizeReportLabBuffer(value) {
  if (!value) return "";
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  if (!buffer.length) return "";
  const prefix = buffer.subarray(0, 12).toString("latin1");
  if (prefix.startsWith("%PDF")) return "";
  const sample = buffer.subarray(0, Math.min(buffer.length, 1200));
  const binaryMarkers = [...sample].filter((byte) => byte === 0 || byte < 7 || (byte > 13 && byte < 32)).length;
  if (binaryMarkers > 8) return "";
  return sample.toString("utf8").replace(/\s+/g, " ").trim().slice(0, 700);
}

function runReportLabProcess(pythonExecutable, scriptPath, payload) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const resolveOnce = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const child = spawn(pythonExecutable, [scriptPath], {
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONPATH: [path.join(__dirname, ".python"), process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const maxBytes = parsePositiveInteger(process.env.REPORTLAB_MAX_STDOUT_BYTES, 120_000_000);
    const maxStderrBytes = parsePositiveInteger(process.env.REPORTLAB_MAX_STDERR_BYTES, 2_000_000);
    const timeoutMs = parsePositiveInteger(process.env.REPORTLAB_TIMEOUT_MS, 90_000);
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      const error = new Error("reportlab_timeout");
      error.stderr = Buffer.concat(stderr);
      error.stdout = Buffer.alloc(0);
      error.stdoutBytes = stdoutBytes;
      error.stderrBytes = stderrBytes;
      rejectOnce(error);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= maxBytes) stdout.push(chunk);
      if (stdoutBytes > maxBytes) {
        child.kill("SIGKILL");
        const error = new Error(`reportlab_pdf_output_too_large:${stdoutBytes}/${maxBytes}`);
        error.stderr = Buffer.concat(stderr);
        error.stdout = Buffer.alloc(0);
        error.stdoutBytes = stdoutBytes;
        error.stderrBytes = stderrBytes;
        rejectOnce(error);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= maxStderrBytes) stderr.push(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      error.stderr = Buffer.concat(stderr);
      error.stdout = Buffer.alloc(0);
      error.stdoutBytes = stdoutBytes;
      error.stderrBytes = stderrBytes;
      rejectOnce(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolveOnce(Buffer.concat(stdout));
        return;
      }
      const error = new Error(`reportlab_exit_${code}`);
      error.stderr = Buffer.concat(stderr);
      error.stdout = Buffer.alloc(0);
      error.stdoutBytes = stdoutBytes;
      error.stderrBytes = stderrBytes;
      rejectOnce(error);
    });
    child.stdin.end(JSON.stringify(payload || {}), "utf8");
  });
}

function findPythonExecutable() {
  return PYTHON_EXECUTABLE_CANDIDATES.find((candidate) => candidate === "python" || candidate === "python3" || existsSync(candidate)) || "";
}

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function buildPdfExecutiveSummary(report, attachmentCount, language) {
  const summary = report.summary || {};
  if (language === "en") {
    return `This report reviews ${summary.totalExperiences || report.rows?.length || 0} experiences, ${summary.capturedHours || 0} captured hours, ${attachmentCount} attachments, and an average energy of ${summary.averageEnergy || 0}/10. The dominant category is ${summary.topCategory || "not defined"}.`;
  }
  return `Este reporte revisa ${summary.totalExperiences || report.rows?.length || 0} experiencias, ${summary.capturedHours || 0} horas capturadas, ${attachmentCount} adjuntos y una energía media de ${summary.averageEnergy || 0}/10. La categoría dominante es ${summary.topCategory || "sin definir"}.`;
}

function renderPdfList(items = []) {
  const list = Array.isArray(items) ? items.filter(Boolean).slice(0, 5) : [];
  return list.length ? `<ul>${list.map((item) => `<li>${escapeHtmlServer(item)}</li>`).join("")}</ul>` : "";
}

function truncatePdfText(value, limit = 220) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trim()}...`;
}

function uniqueReportPdfEvidence(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.id || ""}|${item.name || ""}|${item.experienceTitle || ""}|${item.kind || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function reportPdfPriorityRank(priority = "") {
  const value = String(priority || "").toLowerCase();
  if (value.includes("alta") || value.includes("high")) return 3;
  if (value.includes("media") || value.includes("medium")) return 2;
  if (value.includes("baja") || value.includes("low")) return 1;
  return 0;
}

function clampPdfWidth(value) {
  return Math.max(4, Math.min(100, Math.round(Number(value) || 0)));
}

function formatReportPdfDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || "") : date.toLocaleString("es-ES");
}

function escapeHtmlServer(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createSimplePdf(lines) {
  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };
  const pages = [];
  const chunks = chunkLines(lines, 34);
  chunks.forEach((chunk, pageIndex) => {
    const text = [
      "BT",
      "/F1 12 Tf",
      "50 760 Td",
      `(${escapePdfText(`Página ${pageIndex + 1}`)}) Tj`,
      "0 -24 Td",
      ...chunk.flatMap((line) => [`(${escapePdfText(line)}) Tj`, "0 -18 Td"]),
      "ET",
    ].join("\n");
    const contentId = addObject(`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent PAGES_PLACEHOLDER /MediaBox [0 0 612 792] /Resources << /Font << /F1 FONT_PLACEHOLDER >> >> /Contents ${contentId} 0 R >>`);
    pages.push(pageId);
  });
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pagesBody = `<< /Type /Pages /Kids [${pages.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  const pagesId = addObject(pagesBody);
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  const rendered = objects.map((body) => body.replaceAll("PAGES_PLACEHOLDER", `${pagesId} 0 R`).replaceAll("FONT_PLACEHOLDER", `${fontId} 0 R`));
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  rendered.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${rendered.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${rendered.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "binary");
}

function chunkLines(lines, size) {
  const chunks = [];
  for (let index = 0; index < lines.length; index += size) {
    chunks.push(lines.slice(index, index + size));
  }
  return chunks.length ? chunks : [["Sin experiencias registradas."]];
}

function escapePdfText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function formatPdfDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function average(values) {
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / (values.length || 1);
}

function sanitizeFileName(name) {
  return String(name)
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "media";
}

async function getContextImpact(location, profile = {}, experienceType = "auto", options = {}) {
  let place;
  try {
    place = await geocodeLocation(location);
    place = enrichPlaceWithContextLabel(place, options.contextLabel);
  } catch (error) {
    const weather = unavailableWeatherImpact(error);
    const news = unavailableNewsImpact(error);
    const profileImpact = buildProfileImpact(profile, experienceType, weather, news);
    return {
      location: String(location || "Lugar no identificado").trim() || "Lugar no identificado",
      country: "",
      latitude: null,
      longitude: null,
      generatedAt: new Date().toISOString(),
      impactScore: Math.max(0, profileImpact.scoreAdjustment || 0),
      summary: buildImpactSummary(0, weather, news),
      profileImpact,
      weather,
      geopoliticalNews: news,
    };
  }
  const [weatherResult, newsResult] = await Promise.allSettled([getWeatherImpact(place), getNewsImpact(place)]);
  const weather =
    weatherResult.status === "fulfilled" ? weatherResult.value : unavailableWeatherImpact(weatherResult.reason);
  const news = newsResult.status === "fulfilled" ? newsResult.value : unavailableNewsImpact(newsResult.reason);
  const baseScore = calculateImpactScore(weather, news);
  const profileImpact = buildProfileImpact(profile, experienceType, weather, news);
  const score = Math.min(100, Math.max(0, baseScore + profileImpact.scoreAdjustment));
  return {
    location: getPlaceDisplayName(place),
    country: place.country,
    latitude: place.latitude,
    longitude: place.longitude,
    generatedAt: new Date().toISOString(),
    impactScore: score,
    summary: buildImpactSummary(score, weather, news),
    profileImpact,
    weather,
    geopoliticalNews: news,
  };
}

function unavailableWeatherImpact(reason) {
  return {
    source: "Open-Meteo",
    unavailable: true,
    error: String(reason?.message || reason || "weather_unavailable"),
    current: {
      temperatureC: null,
      humidityPct: null,
      precipitationMm: null,
      windKmh: null,
      time: null,
    },
    forecast: [],
    riskSignals: [],
  };
}

function unavailableNewsImpact(reason) {
  return {
    source: "GDELT DOC 2.0",
    unavailable: true,
    error: String(reason?.message || reason || "news_unavailable"),
    query: null,
    articleCount: 0,
    riskSignals: [],
    articles: [],
  };
}

async function geocodeLocation(location) {
  const coordinatePlace = parseCoordinateLocation(location);
  if (coordinatePlace) return coordinatePlace;
  const payload = await fetchGeocode(location);
  const fallbackPayload = payload.results?.length ? payload : await fetchGeocode(String(location).split(",")[0]);
  const result = fallbackPayload.results?.[0];
  if (!result) {
    throw new Error("location_not_found");
  }
  return {
    name: result.name,
    country: result.country,
    countryCode: result.country_code,
    latitude: result.latitude,
    longitude: result.longitude,
    timezone: result.timezone || "auto",
  };
}

function enrichPlaceWithContextLabel(place = {}, contextLabel = "") {
  const label = normalizeOperationalPlaceLabel(contextLabel);
  if (!label) return place;
  return {
    ...place,
    displayName: place.coordinateOnly ? label : (place.displayName || place.name),
    newsQueryName: place.newsQueryName || label,
    contextLabel: label,
  };
}

function normalizeOperationalPlaceLabel(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  if (parseCoordinateLocation(text)) return "";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return "";
  if (/^https?:\/\//i.test(text)) return "";
  if (/^(todos?|all|none|null|undefined|sin datos|sin ubicacion|no location)$/i.test(text)) return "";
  return text;
}

function parseCoordinateLocation(location = "") {
  const text = String(location || "").trim();
  const match = text.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return {
    name: text,
    displayName: "Ubicacion movil",
    country: "",
    countryCode: "",
    latitude,
    longitude,
    timezone: "auto",
    coordinateOnly: true,
    newsQueryName: DEFAULT_OPERATIONAL_LOCATION,
  };
}

function getPlaceDisplayName(place = {}) {
  return normalizeOperationalPlaceLabel(place.displayName || place.contextLabel || "") || place.name || DEFAULT_OPERATIONAL_LOCATION;
}

function getPlaceNewsQueryName(place = {}) {
  return normalizeOperationalPlaceLabel(place.newsQueryName || place.contextLabel || place.displayName || "")
    || (place.coordinateOnly ? DEFAULT_OPERATIONAL_LOCATION : place.name)
    || DEFAULT_OPERATIONAL_LOCATION;
}

async function fetchGeocode(location) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", String(location || "").trim());
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "es");
  url.searchParams.set("format", "json");
  return fetchJsonWithTimeout(url);
}

async function getWeatherImpact(place) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(place.latitude));
  url.searchParams.set("longitude", String(place.longitude));
  url.searchParams.set("current", "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m");
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max");
  url.searchParams.set("forecast_days", "3");
  url.searchParams.set("timezone", place.timezone);
  const payload = await fetchJsonWithTimeout(url);
  const current = payload.current || {};
  const daily = payload.daily || {};
  const riskSignals = [];
  if (Number(current.wind_speed_10m || 0) >= 35) riskSignals.push("Viento elevado");
  if (Number(current.precipitation || 0) >= 4) riskSignals.push("Precipitacion intensa");
  if (Number(current.temperature_2m || 0) >= 33) riskSignals.push("Calor alto");
  if (Number(current.temperature_2m || 0) <= 2) riskSignals.push("Frio alto");
  return {
    source: "Open-Meteo",
    current: {
      temperatureC: current.temperature_2m ?? null,
      humidityPct: current.relative_humidity_2m ?? null,
      precipitationMm: current.precipitation ?? null,
      windKmh: current.wind_speed_10m ?? null,
      time: current.time ?? null,
    },
    forecast: (daily.time || []).map((day, index) => ({
      day,
      maxC: daily.temperature_2m_max?.[index] ?? null,
      minC: daily.temperature_2m_min?.[index] ?? null,
      precipitationMm: daily.precipitation_sum?.[index] ?? null,
      windMaxKmh: daily.wind_speed_10m_max?.[index] ?? null,
    })),
    riskSignals,
  };
}

async function getNewsImpact(place) {
  const placeName = place.newsQueryName || place.name;
  const query = `${placeName} ${place.country || ""} conflict OR protest OR security OR election`;
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", query);
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", "5");
  url.searchParams.set("sort", "hybridrel");
  let source = "GDELT DOC 2.0";
  let fallbackReason = null;
  let articles = [];
  try {
    const payload = await fetchJsonWithTimeout(url);
    articles = (payload.articles || []).slice(0, 5).map((article) => ({
      title: article.title,
      url: article.url,
      sourceCountry: article.sourceCountry,
      language: article.language,
      seenAt: article.seendate,
      domain: article.domain,
      source: "GDELT DOC 2.0",
    }));
  } catch (error) {
    fallbackReason = sanitizeDiagnosticError(error);
  }

  if (!articles.length) {
    const fallbackQuery = [placeName, place.country, "politica economia seguridad gobierno noticias"].filter(Boolean).join(" ");
    articles = await fetchGoogleNewsRss({ query: fallbackQuery }, "es");
    if (articles.length) {
      source = "Google News RSS";
      fallbackReason = fallbackReason || "gdelt_without_articles";
    }
  }

  if (!articles.length) {
    const broadFallbackQuery = [placeName, place.country, "noticias actualidad eventos economia seguridad"].filter(Boolean).join(" ");
    articles = await fetchGoogleNewsRss({ query: broadFallbackQuery }, "es", { maxRecords: 5, noFreshness: true });
    if (articles.length) {
      source = "Google News RSS";
      fallbackReason = fallbackReason || "broad_local_news_fallback";
    }
  }

  const keywords = ["conflict", "protest", "election", "sanctions", "security", "border", "strike", "conflicto", "protesta", "eleccion", "seguridad", "frontera", "huelga"];
  const headlineText = articles.map((article) => article.title || "").join(" ").toLowerCase();
  const riskSignals = keywords.filter((keyword) => headlineText.includes(keyword));
  return {
    source,
    unavailable: !articles.length,
    error: articles.length ? null : (fallbackReason || "news_without_articles"),
    fallbackReason,
    query,
    articleCount: articles.length,
    riskSignals,
    articles,
  };
}

async function getDailyBriefing(location, locale = "es", options = {}) {
  const language = normalizeDailyLanguage(locale);
  const user = options.user || { id: LOCAL_USER_ID };
  const cacheLocation = normalizeOperationalPlaceLabel(options.contextLabel) || location || DEFAULT_OPERATIONAL_LOCATION;
  if (!options.force) {
    const cached = await getStoredDailyBriefing(user, cacheLocation, language);
    if (cached && !isStoredDailyBriefingStale(cached)) {
      return { ...cached, cached: true, cacheSource: cached.cacheSource || activePersistence() };
    }
  }

  try {
    const briefing = await buildLiveDailyBriefing(location, language, { contextLabel: options.contextLabel });
    await saveStoredDailyBriefing(user, briefing);
    return { ...briefing, cached: false, cacheSource: "live" };
  } catch (error) {
    const cached = await getStoredDailyBriefing(user, cacheLocation, language);
    if (cached) {
      return {
        ...cached,
        cached: true,
        cacheSource: activePersistence(),
        warning: `live_refresh_failed: ${sanitizeDiagnosticError(error)}`,
      };
    }
    throw error;
  }
}

async function getMobileDailyContext(searchParams = new URLSearchParams(), user = { id: LOCAL_USER_ID }) {
  const rawLat = searchParams.get("lat");
  const rawLon = searchParams.get("lon");
  const lat = Number(rawLat);
  const lon = Number(rawLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new HttpError(400, "invalid_location", "lat y lon son obligatorios para contexto movil.");
  }
  if (rawLat === null || rawLon === null || rawLat === "" || rawLon === "" || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new HttpError(400, "invalid_location", "lat y lon son obligatorios para contexto movil.");
  }
  const language = normalizeDailyLanguage(searchParams.get("lang") || searchParams.get("locale") || "es");
  const force = ["1", "true", "yes"].includes(String(searchParams.get("force") || "").toLowerCase());
  const place = await reverseGeocodeCoordinates(lat, lon, language);
  const locationLabel = place.name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  let briefing = null;
  if (!force) {
    briefing = await getStoredDailyBriefing(user, locationLabel, language);
  }
  if (!briefing || isMobileDailyBriefingStale(briefing)) {
    try {
      briefing = await buildLiveDailyBriefingForPlace(place, language);
      await saveStoredDailyBriefing(user, briefing);
      briefing.cached = false;
      briefing.cacheSource = "live";
    } catch (error) {
      const warning = `mobile_daily_live_failed: ${sanitizeDiagnosticError(error)}`;
      if (briefing) {
        briefing = normalizeMobileDailyFallbackBriefing(briefing, place, language, warning);
      } else {
        briefing = await buildMobileDailyFallbackBriefing(place, language, warning);
      }
      await appendLog("warn", "Mobile daily context served with fallback", {
        userId: user?.id || LOCAL_USER_ID,
        location: locationLabel,
        warning,
      });
    }
  } else {
    briefing.cached = true;
  }
  return buildMobileDailyContextResponse(briefing, place);
}

async function getMobileHealthSummary(searchParams = new URLSearchParams(), user = { id: LOCAL_USER_ID }) {
  const language = normalizeDailyLanguage(searchParams.get("lang") || searchParams.get("locale") || "es");
  const range = normalizeMobileHealthRange(searchParams);
  const contextSignalRecords = (await listContextSignals(user, range))
    .filter((signal) => isMobileHealthContextSignal(signal))
    .map((signal) => ({ signal, context: contextSignalToStructuredContext(signal) }));
  const experiences = await listExperiences(user);
  const legacyRecords = experiences
    .map((experience) => ({ experience, context: experience?.metadata?.structuredContext || null }))
    .filter((item) => isMobileHealthContext(item.context))
    .filter((item) => isTimestampInRange(item.context?.capturedAt || item.experience?.timestamp, range))
    .sort((a, b) => new Date(b.context?.capturedAt || b.experience?.timestamp || 0) - new Date(a.context?.capturedAt || a.experience?.timestamp || 0));
  const records = [
    ...contextSignalRecords,
    ...legacyRecords,
  ].sort((a, b) => new Date(b.context?.capturedAt || b.experience?.timestamp || 0) - new Date(a.context?.capturedAt || a.experience?.timestamp || 0));
  const metricNames = new Set();
  const connectors = new Set();
  const payloadTypes = new Set();
  let signalCount = 0;
  let energyTotal = 0;
  let energyCount = 0;
  records.forEach(({ context }) => {
    const metrics = context.metrics && typeof context.metrics === "object" ? context.metrics : {};
    Object.keys(metrics).forEach((key) => metricNames.add(key));
    if (context.connector) connectors.add(context.connector);
    if (context.payloadType) payloadTypes.add(context.payloadType);
    const signals = Array.isArray(context.signals) ? context.signals : [];
    signalCount += signals.length || Number(metrics.recordCount || 0) || 1;
    const energy = estimateBiometricEnergyFromMetrics(metrics, context.payloadType || context.dataType);
    if (Number.isFinite(energy)) {
      energyTotal += energy;
      energyCount += 1;
    }
  });
  const latestItems = records.slice(0, 12).map(({ experience, signal, context }) => {
    const metrics = context.metrics && typeof context.metrics === "object" ? context.metrics : {};
    const signals = Array.isArray(context.signals) ? context.signals : [];
    return {
      id: signal?.id || experience?.id,
      title: signal ? integrationPayloadLabel({ payloadType: signal.signalType, sourceType: signal.sourceType, payload: signal.payload?.raw || signal.payload || {} }) : experience.title,
      capturedAt: context.capturedAt || experience?.timestamp,
      connector: context.connector || "device",
      payloadType: context.payloadType || "biometric",
      dataType: context.dataType || context.payloadType || "",
      summary: context.summary || experience?.notes || "",
      metricNames: Object.keys(metrics).slice(0, 10),
      signalsPreview: signals.slice(0, 3).map((signal) => ({
        type: signal.type || signal.metric || signal.name || "",
        value: signal.value ?? signal.score ?? signal.quantity ?? "",
        unit: signal.unit || "",
        date: signal.date || signal.timestamp || signal.startDate || "",
      })),
    };
  });
  const message = buildMobileHealthSummaryMessage(records.length, signalCount, language);
  return {
    ok: true,
    schemaVersion: "vibe-mobile-health-summary-v1",
    source: "server-normalized-context",
    generatedAt: new Date().toISOString(),
    userId: user.id || LOCAL_USER_ID,
    range,
    summary: {
      status: records.length ? "available" : "empty",
      records: records.length,
      signals: signalCount,
      suggestedEnergy: energyCount ? Number((energyTotal / energyCount).toFixed(1)) : null,
      connectors: [...connectors].slice(0, 12),
      payloadTypes: [...payloadTypes].slice(0, 8),
      metricNames: [...metricNames].slice(0, 18),
      message,
    },
    items: latestItems,
  };
}

function normalizeMobileHealthRange(searchParams = new URLSearchParams()) {
  const now = new Date();
  const fallbackFrom = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const from = normalizeOptionalIsoDate(searchParams.get("from") || searchParams.get("start_date") || searchParams.get("startDate"), fallbackFrom);
  const to = normalizeOptionalIsoDate(searchParams.get("to") || searchParams.get("end_date") || searchParams.get("endDate"), now);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

function normalizeOptionalIsoDate(value, fallback) {
  const date = new Date(value || fallback);
  return Number.isFinite(date.getTime()) ? date : fallback;
}

function isMobileHealthContext(context = null) {
  if (!context || typeof context !== "object") return false;
  const payloadType = String(context.payloadType || context.dataType || "").toLowerCase();
  const connector = String(context.connector || "").toLowerCase();
  return ["biometric", "activity", "sleep"].includes(payloadType)
    || /oura|health|samsung|galaxy|apple|wearable|biometric/.test(connector);
}

function isMobileHealthContextSignal(signal = null) {
  if (!signal || typeof signal !== "object") return false;
  const signalType = String(signal.signalType || "").toLowerCase();
  const connector = String(signal.sourceType || signal.payload?.provider || "").toLowerCase();
  return ["biometric", "activity", "sleep"].includes(signalType)
    || /oura|health|samsung|galaxy|apple|wearable|biometric/.test(connector);
}

function contextSignalToStructuredContext(signal = {}) {
  const payload = signal.payload && typeof signal.payload === "object" ? signal.payload : {};
  return {
    id: signal.id,
    connector: signal.sourceType || payload.provider || "device",
    sourceId: signal.sourceId || "",
    payloadType: signal.signalType || payload.dataType || "context",
    dataType: payload.dataType || signal.signalType || "",
    capturedAt: signal.capturedAt,
    summary: payload.summary || buildContextSignalSummary({
      payloadType: signal.signalType || "context",
      sourceType: signal.sourceType || "device",
      payload: payload.raw || payload,
    }),
    metrics: signal.metrics || {},
    signals: Array.isArray(payload.signals) ? payload.signals : [],
  };
}

function isTimestampInRange(timestamp, range = {}) {
  const value = new Date(timestamp || 0).getTime();
  const from = new Date(range.from || 0).getTime();
  const to = new Date(range.to || Date.now()).getTime();
  return Number.isFinite(value) && value >= from && value <= to;
}

function buildMobileHealthSummaryMessage(records, signals, language = "es") {
  if (language === "fr") {
    return records
      ? `${records} contexte(s) de sante et ${signals} signal(aux) disponibles pour l'assistant.`
      : "Aucun contexte de sante recent n'est disponible.";
  }
  if (language === "en") {
    return records
      ? `${records} health context record(s) and ${signals} signal(s) are available for the assistant.`
      : "No recent health context is available.";
  }
  return records
    ? `${records} contexto(s) de salud y ${signals} señal(es) disponibles para el asistente.`
    : "No hay contexto de salud reciente disponible.";
}

function normalizeMobileDailyFallbackBriefing(briefing = {}, place = {}, language = "es", warning = "mobile_daily_fallback") {
  const sections = Array.isArray(briefing.sections) ? briefing.sections : [];
  const agendaLinks = Array.isArray(briefing.agendaLinks) && briefing.agendaLinks.length
    ? briefing.agendaLinks
    : buildAgendaLinks(place, language);
  return {
    ...briefing,
    schemaVersion: briefing.schemaVersion || "20260522-daily-media-specific-35",
    generatedAt: briefing.generatedAt || new Date().toISOString(),
    nextRefreshAt: briefing.nextRefreshAt || new Date(Date.now() + MOBILE_DAILY_CONTEXT_CACHE_MINUTES * 60 * 1000).toISOString(),
    refreshEveryHours: briefing.refreshEveryHours || MOBILE_DAILY_CONTEXT_CACHE_MINUTES / 60,
    locale: briefing.locale || language,
    location: briefing.location || getPlaceDisplayName(place) || "",
    country: briefing.country || place.country || "",
    countryCode: briefing.countryCode || place.countryCode || "",
    sections,
    agendaLinks,
    groups: Array.isArray(briefing.groups) ? briefing.groups : buildBriefingGroups(sections, language),
    weather: briefing.weather || unavailableWeatherImpact("weather_unavailable"),
    cached: Boolean(briefing.cached),
    cacheSource: briefing.cacheSource || "fallback",
    warning,
  };
}

async function buildMobileDailyFallbackBriefing(place = {}, language = "es", warning = "mobile_daily_fallback") {
  let weather = unavailableWeatherImpact("weather_unavailable");
  try {
    weather = await getWeatherImpact(place);
  } catch (error) {
    warning = `${warning}; weather_failed: ${sanitizeDiagnosticError(error)}`;
  }
  const generatedAt = new Date().toISOString();
  return {
    schemaVersion: "20260522-daily-media-specific-35",
    generatedAt,
    nextRefreshAt: new Date(Date.now() + MOBILE_DAILY_CONTEXT_CACHE_MINUTES * 60 * 1000).toISOString(),
    refreshEveryHours: MOBILE_DAILY_CONTEXT_CACHE_MINUTES / 60,
    locale: language,
    location: getPlaceDisplayName(place) || "",
    country: place.country || "",
    countryCode: place.countryCode || "",
    sections: [],
    groups: buildBriefingGroups([], language),
    weather,
    agendaLinks: buildAgendaLinks(place, language),
    cached: false,
    cacheSource: "fallback",
    warning,
  };
}

async function reverseGeocodeCoordinates(lat, lon, language = "es") {
  const fallback = {
    name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
    country: "",
    countryCode: "",
    latitude: lat,
    longitude: lon,
    timezone: "auto",
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONTEXT_TIMEOUT_MS);
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("zoom", "10");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", language);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "VibePWA/1.0 daily-context",
        Accept: "application/json",
      },
    });
    if (!response.ok) return fallback;
    const payload = await response.json();
    const address = payload.address || {};
    const name = address.city || address.town || address.village || address.municipality || address.county || payload.name || fallback.name;
    return {
      name,
      country: address.country || "",
      countryCode: String(address.country_code || "").toUpperCase(),
      latitude: lat,
      longitude: lon,
      timezone: "auto",
      displayName: payload.display_name || "",
    };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}

function buildMobileDailyContextResponse(briefing = {}, place = {}) {
  const localSections = (briefing.sections || []).filter((section) => section.scope === "local");
  const worldSections = (briefing.sections || []).filter((section) => section.scope === "world");
  return {
    ok: true,
    schemaVersion: "vibe-mobile-daily-context-v1",
    generatedAt: briefing.generatedAt || new Date().toISOString(),
    nextRefreshAt: briefing.nextRefreshAt || null,
    cached: Boolean(briefing.cached),
    cacheSource: briefing.cacheSource || "",
    warning: briefing.warning || null,
    location: {
      lat: place.latitude ?? null,
      lon: place.longitude ?? null,
      city: place.name || briefing.location || "",
      country: place.country || briefing.country || "",
      countryCode: place.countryCode || briefing.countryCode || "",
      label: [place.name || briefing.location, place.country || briefing.country || place.countryCode || briefing.countryCode].filter(Boolean).join(", "),
    },
    weather: briefing.weather || unavailableWeatherImpact("weather_unavailable"),
    news: {
      local: flattenMobileNewsSections(localSections),
      global: flattenMobileNewsSections(worldSections),
    },
    entertainment: buildMobileEntertainmentItems(briefing, localSections, place),
  };
}

function flattenMobileNewsSections(sections = []) {
  return sections.flatMap((section) => (section.articles || []).slice(0, 4).map((article) => ({
    title: article.title || section.title || "",
    summary: section.summary || article.title || "",
    url: article.url || "",
    image: article.image || null,
    video: null,
    source: article.domain || article.source || section.source || "",
    section: section.title || "",
    seenAt: article.seenAt || null,
    media: article.image ? [{ type: "image", url: article.image, title: article.title || section.title || "", articleSpecific: true }] : [],
  }))).slice(0, 12);
}

function buildMobileEntertainmentItems(briefing = {}, localSections = [], place = {}) {
  const language = normalizeDailyLanguage(briefing.locale || "es");
  const locationLabel = [place.name || briefing.location, place.country || briefing.country || place.countryCode || briefing.countryCode].filter(Boolean).join(", ");
  const entertainmentSection = localSections.find((section) => /entertainment|entretenimiento|event/i.test(section.id || section.title || ""));
  const articleItems = (entertainmentSection?.articles || []).slice(0, 4).map((article) => ({
    title: article.title || entertainmentSection.title || "",
    type: "event",
    venue: locationLabel || place.name || briefing.location || "",
    time: article.seenAt || null,
    image: article.image || null,
    url: article.url || "",
    source: article.domain || article.source || entertainmentSection.source || "",
  }));
  const linkItems = (briefing.agendaLinks || []).slice(0, 6).map((link) => ({
    title: link.label || link.query || "",
    type: /cine|movie|showtime/i.test(`${link.label} ${link.query}`) ? "movie" : "event",
    venue: locationLabel || place.name || briefing.location || "",
    time: link.dateLabel || null,
    image: null,
    url: link.url || "",
    source: "search",
    category: link.category || "",
    description: link.description || "",
  }));
  const fallbackItems = !articleItems.length && !linkItems.length
    ? buildAgendaLinks(place, language).slice(0, 6).map((link) => ({
        title: link.label || link.query || "",
        type: /cine|cinema|movie|showtime/i.test(`${link.label} ${link.query}`) ? "movie" : "event",
        venue: locationLabel,
        time: link.dateLabel || null,
        image: null,
        url: link.url || "",
        source: "live-location-search",
        category: link.category || "",
        description: link.description || "",
      }))
    : [];
  return [...articleItems, ...linkItems, ...fallbackItems].slice(0, 8);
}

async function buildLiveDailyBriefing(location, language = "es", options = {}) {
  const place = enrichPlaceWithContextLabel(await geocodeLocation(location), options.contextLabel);
  return buildLiveDailyBriefingForPlace(place, language);
}

async function buildLiveDailyBriefingForPlace(place, language = "es") {
  const normalizedLanguage = normalizeDailyLanguage(language);
  const worldLabel = normalizedLanguage === "en" ? "World" : normalizedLanguage === "fr" ? "Monde" : "Mundo";
  const displayPlace = getPlaceDisplayName(place);
  const placeLabel = [displayPlace, place.country || place.countryCode].filter(Boolean).join(", ");
  const queryPlace = [getPlaceNewsQueryName(place), place.country || place.countryCode].filter(Boolean).join(" ") || DEFAULT_OPERATIONAL_LOCATION;
  const sections = buildBriefingSections(queryPlace, normalizedLanguage);
  const [sectionResults, weatherResult] = await Promise.all([
    Promise.allSettled(sections.map((section) => fetchBriefingSection(section, normalizedLanguage))),
    Promise.allSettled([getWeatherImpact(place)]),
  ]);
  const resolvedSections = sections.map((section, index) => {
    const result = sectionResults[index];
    return result.status === "fulfilled" ? result.value : enrichBriefingSection({ ...section, summary: unavailableBriefingSummary(normalizedLanguage), articles: [] }, normalizedLanguage);
  });
  const weather = weatherResult[0]?.status === "fulfilled" ? weatherResult[0].value : unavailableWeatherImpact(weatherResult[0]?.reason);
  return {
    schemaVersion: "20260522-daily-media-specific-35",
    source: "Trusted News RSS + fresh fallback",
    location: displayPlace,
    country: place.country || place.countryCode || "",
    countryCode: place.countryCode,
    scope: `${placeLabel || location} + ${worldLabel}`,
    locale: normalizedLanguage,
    generatedAt: new Date().toISOString(),
    refreshEveryHours: MOBILE_DAILY_CONTEXT_CACHE_MINUTES / 60,
    nextRefreshAt: addMinutes(new Date(), MOBILE_DAILY_CONTEXT_CACHE_MINUTES).toISOString(),
    agendaLinks: buildAgendaLinks(place, normalizedLanguage),
    weather,
    groups: buildBriefingGroups(resolvedSections, normalizedLanguage),
    sections: resolvedSections,
    horoscope: await getDailyHoroscope(normalizedLanguage),
  };
}

function normalizeDailyLanguage(locale = "es") {
  const value = String(locale || "es").trim().toLowerCase();
  if (value.startsWith("fr")) return "fr";
  if (value.startsWith("en")) return "en";
  return "es";
}

async function getLatestStoredDailyBriefing(user, locale = "") {
  const userId = user?.id || LOCAL_USER_ID;
  const normalizedLocale = locale ? normalizeDailyLanguage(locale) : "";
  if (activePersistence() === "supabase") {
    try {
      const searchParams = {
        user_id: `eq.${userId}`,
        order: "generated_at.desc",
        limit: "1",
      };
      if (normalizedLocale) searchParams.locale = `eq.${normalizedLocale}`;
      const rows = await supabaseRest("daily_briefings", {
        searchParams,
        accessToken: user?.accessToken,
      });
      const payload = rows[0]?.payload || null;
      return payload ? { ok: true, briefing: { ...payload, cacheSource: "supabase-latest" } } : { ok: true, briefing: null };
    } catch (error) {
      await appendLog("warn", "Latest daily briefing Supabase read skipped", { userId, error: sanitizeDiagnosticError(error) });
    }
  }
  const store = await readDailyBriefingStore();
  const candidates = Object.values(store)
    .filter((row) => row?.user_id === userId)
    .filter((row) => !normalizedLocale || row.locale === normalizedLocale)
    .map((row) => row.payload ? { ...row.payload, cacheSource: "local-file-latest" } : null)
    .filter(Boolean)
    .sort((a, b) => new Date(b.generatedAt || 0) - new Date(a.generatedAt || 0));
  return { ok: true, briefing: candidates[0] || null };
}

async function getStoredDailyBriefing(user, location, language) {
  const userId = user?.id || LOCAL_USER_ID;
  const locationKey = normalizeDailyLocationKey(location);
  if (activePersistence() === "supabase") {
    try {
      const rows = await supabaseRest("daily_briefings", {
        searchParams: {
          user_id: `eq.${userId}`,
          location_key: `eq.${locationKey}`,
          locale: `eq.${language}`,
          limit: "1",
        },
        accessToken: user?.accessToken,
      });
      return rows[0]?.payload ? { ...rows[0].payload, cacheSource: "supabase" } : null;
    } catch {
      return getStoredDailyBriefingFromFile(userId, locationKey, language);
    }
  }

  return getStoredDailyBriefingFromFile(userId, locationKey, language);
}

async function getStoredDailyBriefingFromFile(userId, locationKey, language) {
  const store = await readDailyBriefingStore();
  const payload = store[buildDailyBriefingCacheKey(userId, locationKey, language)]?.payload;
  return payload ? { ...payload, cacheSource: "local-file" } : null;
}

async function saveStoredDailyBriefing(user, briefing) {
  const userId = user?.id || LOCAL_USER_ID;
  const locationKey = normalizeDailyLocationKey(briefing.location || "");
  const row = {
    user_id: userId,
    location_key: locationKey,
    locale: briefing.locale || "es",
    payload: briefing,
    generated_at: briefing.generatedAt,
    next_refresh_at: briefing.nextRefreshAt,
    updated_at: new Date().toISOString(),
  };

  if (activePersistence() === "supabase") {
    try {
      await upsertProfile(await getProfile(user), user);
      await supabaseRest("daily_briefings", {
        method: "POST",
        searchParams: { on_conflict: "user_id,location_key,locale" },
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(row),
        accessToken: user?.accessToken,
      });
      return;
    } catch (error) {
      await appendLog("warn", "Daily briefing Supabase persistence skipped", { userId, locationKey, error: sanitizeDiagnosticError(error) });
    }
  }

  const store = await readDailyBriefingStore();
  store[buildDailyBriefingCacheKey(userId, locationKey, briefing.locale || "es")] = row;
  await writeDailyBriefingStore(store);
}

async function deleteStoredDailyBriefing(user, location, language) {
  const userId = user?.id || LOCAL_USER_ID;
  const locationKey = normalizeDailyLocationKey(location);
  if (activePersistence() === "supabase") {
    await supabaseRest("daily_briefings", {
      method: "DELETE",
      searchParams: {
        user_id: `eq.${userId}`,
        location_key: `eq.${locationKey}`,
        locale: `eq.${language || "es"}`,
      },
      headers: { Prefer: "return=minimal" },
      accessToken: user?.accessToken,
    });
    return;
  }
  const store = await readDailyBriefingStore();
  delete store[buildDailyBriefingCacheKey(userId, locationKey, language || "es")];
  await writeDailyBriefingStore(store);
}

function normalizeDailyLocationKey(location) {
  return String(location || DEFAULT_OPERATIONAL_LOCATION)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "san-juan";
}

function buildDailyBriefingCacheKey(userId, locationKey, language) {
  return `${userId}:${locationKey}:${language}`;
}

function isStoredDailyBriefingStale(briefing) {
  if (!briefing?.generatedAt) return true;
  if (briefing.schemaVersion !== "20260522-daily-media-specific-35") return true;
  const refreshMs = Number(briefing.refreshEveryHours || 6) * 60 * 60 * 1000;
  return Date.now() - new Date(briefing.generatedAt).getTime() >= refreshMs;
}

function isMobileDailyBriefingStale(briefing) {
  if (!briefing?.generatedAt) return true;
  if (briefing.schemaVersion !== "20260522-daily-media-specific-35") return true;
  return Date.now() - new Date(briefing.generatedAt).getTime() >= MOBILE_DAILY_CONTEXT_CACHE_MINUTES * 60 * 1000;
}

function buildBriefingSections(queryPlace, language) {
  if (language === "en") {
    return [
      { id: "local-politics", scope: "local", title: "Local politics", query: `${queryPlace} politics election government policy`, mediaQuery: `${queryPlace} politics government` },
      { id: "local-economy", scope: "local", title: "Local economy and finance", query: `${queryPlace} economy finance markets inflation business`, mediaQuery: `${queryPlace} economy business` },
      { id: "local-technology-ai", scope: "local", title: "Local technology and AI", query: `${queryPlace} technology artificial intelligence startups innovation digital transformation`, mediaQuery: `${queryPlace} technology artificial intelligence innovation` },
      { id: "local-sports", scope: "local", title: "Local sports", query: `${queryPlace} sports football baseball basketball tennis`, mediaQuery: `${queryPlace} sports` },
      { id: "local-entertainment", scope: "local", title: "Local entertainment and events", query: `${queryPlace} cinema concerts theater festival events movie music`, mediaQuery: `${queryPlace} concerts theater events` },
      { id: "world-politics", scope: "world", title: "World politics", query: "world politics elections government policy diplomacy security", mediaQuery: "world politics diplomacy security" },
      { id: "world-economy", scope: "world", title: "Global economy and finance", query: "global economy finance markets inflation business", mediaQuery: "global economy markets finance" },
      { id: "world-technology-ai", scope: "world", title: "Technology and AI", query: "technology artificial intelligence AI chips robotics cybersecurity startups innovation", mediaQuery: "technology artificial intelligence AI innovation" },
      { id: "world-culture-sports", scope: "world", title: "World sports and entertainment", query: "world sports entertainment cinema concerts music events", mediaQuery: "world sports entertainment events" },
    ];
  }
  if (language === "fr") {
    return [
      { id: "local-politics", scope: "local", title: "Politique locale", query: `${queryPlace} politique elections gouvernement securite publique`, mediaQuery: `${queryPlace} politics government` },
      { id: "local-economy", scope: "local", title: "Economie et finances locales", query: `${queryPlace} economie finance marches inflation entreprises`, mediaQuery: `${queryPlace} economy business` },
      { id: "local-technology-ai", scope: "local", title: "Technologie et IA locale", query: `${queryPlace} technologie intelligence artificielle startups innovation transformation numerique`, mediaQuery: `${queryPlace} technology artificial intelligence innovation` },
      { id: "local-sports", scope: "local", title: "Sports locaux", query: `${queryPlace} sports football baseball basketball tennis`, mediaQuery: `${queryPlace} sports` },
      { id: "local-entertainment", scope: "local", title: "Divertissement et evenements locaux", query: `${queryPlace} cinema concerts theatre festival evenements musique`, mediaQuery: `${queryPlace} concerts theater events` },
      { id: "world-politics", scope: "world", title: "Politique mondiale", query: "monde politique elections gouvernement diplomatie securite", mediaQuery: "world politics diplomacy security" },
      { id: "world-economy", scope: "world", title: "Economie et finances mondiales", query: "economie mondiale finance marches inflation entreprises", mediaQuery: "global economy markets finance" },
      { id: "world-technology-ai", scope: "world", title: "Technologie et IA mondiale", query: "technologie intelligence artificielle IA puces robotique cybersecurite startups innovation", mediaQuery: "technology artificial intelligence AI innovation" },
      { id: "world-culture-sports", scope: "world", title: "Sports et divertissement mondial", query: "monde sports divertissement cinema concerts musique evenements", mediaQuery: "world sports entertainment events" },
    ];
  }
  return [
    { id: "local-politics", scope: "local", title: "Política local", query: `${queryPlace} política elecciones gobierno seguridad pública`, mediaQuery: `${queryPlace} politics government` },
    { id: "local-economy", scope: "local", title: "Economía y finanzas locales", query: `${queryPlace} economía finanzas mercados inflación negocios`, mediaQuery: `${queryPlace} economy business` },
    { id: "local-technology-ai", scope: "local", title: "Tecnología y AI local", query: `${queryPlace} tecnología inteligencia artificial startups innovación transformación digital`, mediaQuery: `${queryPlace} technology artificial intelligence innovation` },
    { id: "local-sports", scope: "local", title: "Deportes locales", query: `${queryPlace} deportes fútbol béisbol baloncesto tenis`, mediaQuery: `${queryPlace} sports` },
    { id: "local-entertainment", scope: "local", title: "Entretenimiento y eventos locales", query: `${queryPlace} cine conciertos teatro festival eventos música`, mediaQuery: `${queryPlace} concerts theater events` },
    { id: "world-politics", scope: "world", title: "Política mundial", query: "mundo política elecciones gobierno diplomacia seguridad", mediaQuery: "world politics diplomacy security" },
    { id: "world-economy", scope: "world", title: "Economía y finanzas mundiales", query: "economía mundial finanzas mercados inflación negocios", mediaQuery: "global economy markets finance" },
    { id: "world-technology-ai", scope: "world", title: "Tecnología y AI mundial", query: "tecnología inteligencia artificial IA chips robótica ciberseguridad startups innovación", mediaQuery: "technology artificial intelligence AI innovation" },
    { id: "world-culture-sports", scope: "world", title: "Deportes y entretenimiento mundial", query: "mundo deportes entretenimiento cine conciertos música eventos", mediaQuery: "world sports entertainment events" },
  ];
}

function buildBriefingGroups(sections, language) {
  return [
    {
      id: "local",
      title: language === "en" ? "Local news" : language === "fr" ? "Actualites locales" : "Noticias locales",
      sections: sections.filter((section) => section.scope === "local"),
    },
    {
      id: "world",
      title: language === "en" ? "World news" : language === "fr" ? "Actualites mondiales" : "Noticias mundiales",
      sections: sections.filter((section) => section.scope === "world"),
    },
  ];
}

function buildAgendaLinks(place, language) {
  const placeLabel = [place.name, place.country || place.countryCode].filter(Boolean).join(" ");
  const date = new Date();
  const dateLabel = date.toISOString().slice(0, 10);
  const labels =
    language === "en"
      ? [
          ["Movie showtimes today", "cinema", `movie showtimes today ${dateLabel} ${placeLabel}`, "Current movie showtimes in the user's city."],
          ["Concerts today", "concerts", `concerts live music today ${dateLabel} ${placeLabel}`, "Concerts and live music happening today."],
          ["Theater and performing arts", "theater", `theater performing arts shows today ${dateLabel} ${placeLabel}`, "Theater, comedy, dance and performing arts."],
          ["City events today", "events", `events today ${dateLabel} ${placeLabel}`, "Current local events for today."],
          ["Exhibitions and museums", "exhibitions", `exhibitions museums today ${dateLabel} ${placeLabel}`, "Museum, gallery and cultural exhibitions."],
          ["Shows and cultural agenda", "shows", `shows cultural agenda today ${dateLabel} ${placeLabel}`, "Other active shows, festivals and cultural plans."],
        ]
      : language === "fr"
        ? [
            ["Cinema aujourd'hui", "cinema", `cinema seances aujourd'hui ${dateLabel} ${placeLabel}`, "Seances de cinema actuelles dans la ville de l'utilisateur."],
            ["Concerts aujourd'hui", "concerts", `concerts musique live aujourd'hui ${dateLabel} ${placeLabel}`, "Concerts et musique live disponibles aujourd'hui."],
            ["Theatre et arts de la scene", "theater", `theatre spectacles arts scene aujourd'hui ${dateLabel} ${placeLabel}`, "Theatre, danse, humour et arts de la scene."],
            ["Evenements aujourd'hui", "events", `evenements aujourd'hui ${dateLabel} ${placeLabel}`, "Evenements locaux actuels pour aujourd'hui."],
            ["Expositions et musees", "exhibitions", `expositions musees aujourd'hui ${dateLabel} ${placeLabel}`, "Musees, galeries et expositions culturelles."],
            ["Spectacles et agenda culturel", "shows", `spectacles agenda culturel aujourd'hui ${dateLabel} ${placeLabel}`, "Autres spectacles, festivals et sorties culturelles."],
          ]
      : [
          ["Cines y cartelera de hoy", "cinema", `cartelera cines hoy ${dateLabel} ${placeLabel}`, "Funciones de cine vigentes en la ciudad del usuario."],
          ["Conciertos de hoy", "concerts", `conciertos musica en vivo hoy ${dateLabel} ${placeLabel}`, "Conciertos y musica en vivo disponibles hoy."],
          ["Teatro y artes escenicas", "theater", `teatro obras artes escenicas hoy ${dateLabel} ${placeLabel}`, "Teatro, comedia, danza y artes escenicas."],
          ["Eventos de hoy", "events", `eventos hoy ${dateLabel} ${placeLabel}`, "Eventos locales vigentes para la fecha actual."],
          ["Exposiciones y museos", "exhibitions", `exposiciones museos hoy ${dateLabel} ${placeLabel}`, "Museos, galerias y exposiciones culturales."],
          ["Espectaculos y agenda cultural", "shows", `espectaculos agenda cultural hoy ${dateLabel} ${placeLabel}`, "Otros espectaculos, festivales y planes culturales vigentes."],
        ];
  return labels.map(([label, category, query, description]) => ({
    label,
    category,
    description,
    query,
    dateLabel,
    url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  }));
}

async function fetchBriefingSection(section, language) {
  const trustedRssArticles = await hydrateArticleImages(await fetchGoogleNewsRss(section, language, { trusted: true, maxRecords: 10 }));
  const trustedFreshRssArticles = prepareBriefingArticles(trustedRssArticles, { trustedOnly: true, maxRecords: 6 });
  if (trustedFreshRssArticles.length) {
    return enrichBriefingSection({
      id: section.id,
      scope: section.scope,
      title: section.title,
      source: "Trusted News RSS",
      summary: buildBriefingSummary(trustedFreshRssArticles, language),
      articles: trustedFreshRssArticles,
    }, language);
  }

  const gdeltArticles = prepareBriefingArticles(await fetchGdeltBriefingArticles(section, 10), { trustedOnly: true, maxRecords: 6 });
  if (gdeltArticles.length) {
    return enrichBriefingSection({
      id: section.id,
      scope: section.scope,
      title: section.title,
      source: "Trusted GDELT",
      summary: buildBriefingSummary(gdeltArticles, language),
      articles: gdeltArticles,
    }, language);
  }

  const rssArticles = prepareBriefingArticles(await hydrateArticleImages(await fetchGoogleNewsRss(section, language, { maxRecords: 10 })), { maxRecords: 6 });
  return enrichBriefingSection({
    id: section.id,
    scope: section.scope,
    title: section.title,
    source: rssArticles.length ? "Fresh News RSS" : "Sin fuente disponible",
    summary: buildBriefingSummary(rssArticles, language),
    articles: rssArticles,
  }, language);
}

function enrichBriefingSection(section, language) {
  const mediaItems = (section.articles || []).filter((article) => article.image);
  const media = uniqueBy(mediaItems, (item) => item.image || item.url)
    .filter((article) => isLikelyNewsImage(article.image))
    .slice(0, 4)
    .map((article) => ({
      type: "image",
      url: article.image,
      title: article.title,
      sourceUrl: article.url,
      articleSpecific: true,
    }));
  const searchQuery = `${section.title} ${language === "en" ? "news" : language === "fr" ? "actualites" : "noticias"}`;
  return {
    ...section,
    media,
    mediaLinks: buildBriefingMediaLinks(searchQuery, language),
  };
}

async function hydrateArticleImages(articles) {
  const hydrated = await Promise.allSettled(
    articles.map(async (article, index) => {
      if (article.image || index > 2 || !article.url) return article;
      const image = await fetchArticlePreviewImage(article.url);
      return isLikelyNewsImage(image) ? { ...article, image } : article;
    }),
  );
  return hydrated.map((result, index) => (result.status === "fulfilled" ? result.value : articles[index]));
}

async function fetchArticlePreviewImage(url) {
  try {
    const html = await fetchTextWithTimeout(url);
    return (
      readHtmlMetaContent(html, "property", "og:image") ||
      readHtmlMetaContent(html, "name", "twitter:image") ||
      readHtmlMetaContent(html, "property", "og:image:url")
    );
  } catch {
    return null;
  }
}

function isLikelyNewsImage(url) {
  if (!url) return false;
  const value = String(url).toLowerCase();
  if (!/^https?:\/\//.test(value)) return false;
  const blocked = [
    "logo",
    "favicon",
    "icon",
    "apple-touch",
    "sprite",
    "placeholder",
    "default-image",
    "default.jpg",
    "default.png",
    "avatar",
    "profile",
    "brand",
    "googlelogo",
    "gstatic.com",
    "googleusercontent.com",
    "lh3.googleusercontent.com",
  ];
  return !blocked.some((token) => value.includes(token));
}

function readHtmlMetaContent(html, attributeName, attributeValue) {
  const escapedValue = attributeValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedAttribute = attributeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<meta[^>]+${escapedAttribute}=["']${escapedValue}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  const reversePattern = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${escapedAttribute}=["']${escapedValue}["'][^>]*>`, "i");
  const match = String(html || "").match(pattern) || String(html || "").match(reversePattern);
  return match ? decodeXml(match[1]) : null;
}

async function fetchSupplementalBriefingMedia(section) {
  if (!section.mediaQuery) return [];
  const articles = await fetchGdeltBriefingArticles({ ...section, query: section.mediaQuery }, 8);
  return articles.filter((article) => isLikelyNewsImage(article.image));
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function prepareBriefingArticles(articles = [], options = {}) {
  const maxRecords = Number(options.maxRecords || 6);
  const trustedOnly = Boolean(options.trustedOnly);
  return uniqueBy(
    articles
      .map((article) => ({ ...article, publishedAtMs: parseNewsDateMs(article.seenAt || article.publishedAt) }))
      .filter((article) => Number.isFinite(article.publishedAtMs))
      .filter((article) => Date.now() - article.publishedAtMs <= DAILY_NEWS_FRESHNESS_HOURS * 60 * 60 * 1000)
      .filter((article) => !trustedOnly || isTrustedNewsArticle(article))
      .sort((a, b) => b.publishedAtMs - a.publishedAtMs),
    (article) => normalizeArticleKey(article),
  ).slice(0, maxRecords);
}

function normalizeArticleKey(article = {}) {
  return String(article.url || article.title || "")
    .toLowerCase()
    .replace(/\?.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNewsDateMs(value) {
  if (!value) return NaN;
  const raw = String(value).trim();
  const direct = Date.parse(raw);
  if (Number.isFinite(direct)) return direct;
  const gdelt = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (gdelt) {
    return Date.UTC(Number(gdelt[1]), Number(gdelt[2]) - 1, Number(gdelt[3]), Number(gdelt[4]), Number(gdelt[5]), Number(gdelt[6]));
  }
  const compactDate = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactDate) {
    return Date.UTC(Number(compactDate[1]), Number(compactDate[2]) - 1, Number(compactDate[3]));
  }
  return NaN;
}

function isTrustedNewsArticle(article = {}) {
  const domain = normalizeNewsDomain(article.domain || article.sourceUrl || article.url);
  const sourceName = String(article.domain || article.sourceName || article.source || "").toLowerCase();
  return (
    TRUSTED_NEWS_DOMAINS.some((trustedDomain) => domain === trustedDomain || domain.endsWith(`.${trustedDomain}`)) ||
    TRUSTED_NEWS_NAMES.some((trustedName) => sourceName.includes(trustedName))
  );
}

function normalizeNewsDomain(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  try {
    const parsed = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^www\./, "").replace(/\/.*$/, "");
  }
}

function buildBriefingMediaLinks(query, language) {
  const videoLabel = language === "en" ? "Videos" : "Videos";
  const imageLabel = language === "en" ? "Images" : "Imágenes";
  const audioLabel = language === "en" ? "Audio / podcasts" : "Audio / podcasts";
  return [
    { type: "image", label: imageLabel, url: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}` },
    { type: "video", label: videoLabel, url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` },
    { type: "audio", label: audioLabel, url: `https://www.google.com/search?q=${encodeURIComponent(`${query} podcast audio`)}` },
  ];
}

async function fetchGdeltBriefingArticles(section, maxRecords = 6) {
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", section.query);
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", String(maxRecords));
  url.searchParams.set("sort", "datedesc");
  url.searchParams.set("timespan", `${DAILY_NEWS_FRESHNESS_HOURS}h`);
  try {
    const payload = await fetchJsonWithTimeout(url);
    return (payload.articles || []).slice(0, maxRecords).map((article) => ({
      title: article.title || article.domain || "Artículo",
      url: article.url,
      domain: article.domain,
      language: article.language,
      sourceCountry: article.sourceCountry,
      seenAt: article.seendate,
      image: isLikelyNewsImage(article.socialimage || article.image) ? article.socialimage || article.image : null,
      source: "GDELT DOC 2.0",
    }));
  } catch {
    return [];
  }
}

async function fetchGoogleNewsRss(section, language, options = {}) {
  const url = new URL("https://news.google.com/rss/search");
  let query = normalizeNewsQuery(section.query);
  if (!options.noFreshness) query = `${query} when:${DAILY_NEWS_FRESHNESS_HOURS}h`;
  if (options.trusted) {
    const domainQuery = TRUSTED_NEWS_DOMAINS.slice(0, 10).map((domain) => `site:${domain}`).join(" OR ");
    query = `${query} (${domainQuery})`;
  }
  url.searchParams.set("q", query);
  if (language === "en") {
    url.searchParams.set("hl", "en-US");
    url.searchParams.set("gl", "US");
    url.searchParams.set("ceid", "US:en");
  } else if (language === "fr") {
    url.searchParams.set("hl", "fr-FR");
    url.searchParams.set("gl", "FR");
    url.searchParams.set("ceid", "FR:fr");
  } else {
    url.searchParams.set("hl", "es-419");
    url.searchParams.set("gl", "US");
    url.searchParams.set("ceid", "US:es-419");
  }
  try {
    const xml = await fetchTextWithTimeout(url);
    return parseGoogleNewsRss(xml, language).slice(0, Number(options.maxRecords || 6));
  } catch {
    return [];
  }
}

function normalizeNewsQuery(query) {
  return String(query || "")
    .replace(/[()]/g, " ")
    .replace(/\bOR\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseGoogleNewsRss(xml, language) {
  const itemMatches = [...String(xml || "").matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  return itemMatches.map((match) => {
    const item = match[1];
    const title = decodeXml(readXmlTag(item, "title"));
    const sourceName = decodeXml(readXmlTag(item, "source"));
    const sourceUrl = readXmlAttribute(item, "source", "url");
    const image = readXmlAttribute(item, "media:content", "url") || readXmlAttribute(item, "media:thumbnail", "url") || readXmlAttribute(item, "enclosure", "url");
    const domain = sourceName || (sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, "") : "Google News");
    return {
      title: title || domain || "Artículo",
      url: decodeXml(readXmlTag(item, "link")),
      domain,
      sourceName,
      sourceUrl,
      language,
      sourceCountry: null,
      seenAt: readXmlTag(item, "pubDate"),
      image: isLikelyNewsImage(image) ? image : null,
      source: "Google News RSS",
    };
  });
}

function readXmlTag(xml, tagName) {
  const match = String(xml || "").match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? match[1].trim() : "";
}

function readXmlAttribute(xml, tagName, attributeName) {
  const match = String(xml || "").match(new RegExp(`<${tagName}[^>]*\\s${attributeName}=["']([^"']+)["'][^>]*>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function decodeXml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .trim();
}

async function getDailyHoroscope(language) {
  return buildDailyHoroscope(language);
}

async function fetchDailyHoroscopeSign(label, sign) {
  const url = new URL("https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily");
  url.searchParams.set("sign", sign);
  url.searchParams.set("day", "TODAY");
  const payload = await fetchJsonWithTimeout(url);
  const text = payload?.data?.horoscope_data || payload?.data?.horoscope || payload?.horoscope || "";
  if (!text) throw new Error("horoscope_empty");
  return {
    sign: label,
    text,
    source: "Horoscope API",
  };
}

function buildBriefingSummary(articles, language) {
  if (!articles.length) return unavailableBriefingSummary(language);
  const domains = [...new Set(articles.map((article) => article.domain).filter(Boolean))].slice(0, 3);
  const lead = articles[0]?.title || "";
  if (language === "en") {
    return `${articles.length} recent items found. Lead: ${lead}${domains.length ? ` Sources: ${domains.join(", ")}.` : ""}`;
  }
  if (language === "fr") {
    return `${articles.length} elements recents trouves. Principal: ${lead}${domains.length ? ` Sources: ${domains.join(", ")}.` : ""}`;
  }
  return `${articles.length} notas recientes encontradas. Principal: ${lead}${domains.length ? ` Fuentes: ${domains.join(", ")}.` : ""}`;
}

function unavailableBriefingSummary(language) {
  if (language === "fr") return "Aucun element recent disponible pour cette section.";
  return language === "en" ? "No recent items available for this section." : "Sin notas recientes disponibles para esta sección.";
}

function buildDailyHoroscope(language) {
  const signs =
    language === "en"
      ? ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"]
      : language === "fr"
        ? ["Belier", "Taureau", "Gemeaux", "Cancer", "Lion", "Vierge", "Balance", "Scorpion", "Sagittaire", "Capricorne", "Verseau", "Poissons"]
      : ["Aries", "Tauro", "Géminis", "Cáncer", "Leo", "Virgo", "Libra", "Escorpio", "Sagitario", "Capricornio", "Acuario", "Piscis"];
  const themes =
    language === "en"
      ? ["focus", "patience", "movement", "dialogue", "care", "planning", "creativity", "rest", "clarity", "discipline", "connection", "learning"]
      : language === "fr"
        ? ["attention", "patience", "mouvement", "dialogue", "soin", "planification", "creativite", "repos", "clarte", "discipline", "connexion", "apprentissage"]
      : ["foco", "paciencia", "movimiento", "diálogo", "cuidado", "planificación", "creatividad", "descanso", "claridad", "disciplina", "conexión", "aprendizaje"];
  const today = formatLocalDateKey(new Date());
  return signs.map((sign, index) => {
    const theme = themes[(positiveHash(`${today}:${sign}`) + index) % themes.length];
    return {
      sign,
      source: "local",
      text:
        language === "en"
          ? `Good day to practice ${theme}. Keep one clear priority and avoid scattering attention.`
          : language === "fr"
            ? `Bonne journee pour pratiquer ${theme}. Garde une priorite claire et evite de disperser ton attention.`
          : `Buen día para practicar ${theme}. Mantén una prioridad clara y evita dispersar la atención.`,
    };
  });
}

function calculateImpactScore(weather, news) {
  let score = 20;
  score += Math.min(35, weather.riskSignals.length * 12);
  score += Math.min(35, news.riskSignals.length * 10 + news.articleCount * 2);
  return Math.min(100, score);
}

const profileImpactMatrix = {
  male_young: {
    sports: ["Deportes y alto rendimiento", 5, 12, 16],
    digital: ["Videojuegos/eSports", 8, 2, 2],
    social: ["Socialización y competencia grupal", 8, 10, 6],
    fitness: ["Desarrollo muscular/fitness", 8, 6, 10],
    study: ["Estudios y carrera", 8, 12, 6],
    mobility: ["Viajes / paseos urbanos", 4, 12, 10],
  },
  female_young: {
    social: ["Salud emocional/social", 10, 10, 6],
    study: ["Estudios y formación", 8, 12, 6],
    digital: ["Redes sociales", 10, 6, 2],
    fitness: ["Actividad física/bienestar", 8, 6, 10],
    health: ["Sueño y descanso", 8, 6, 10],
    mobility: ["Seguridad en viajes / paseos", 6, 16, 6],
    creative: ["Actividades artísticas", 6, 2, 2],
  },
  male_adult: {
    work: ["Trabajo profesional", 10, 12, 10],
    finance: ["Gestión financiera", 8, 16, 6],
    fitness: ["Actividad física", 8, 6, 16],
    mobility: ["Transporte / viajes cotidianos", 6, 12, 16],
    health: ["Sueño y recuperación", 8, 6, 10],
    home: ["Crianza/familia", 6, 6, 2],
    digital: ["Tecnología y automatización", 4, 10, 2],
  },
  female_adult: {
    work: ["Equilibrio trabajo-familia", 10, 12, 6],
    health: ["Salud hormonal/metabólica", 10, 6, 10],
    home: ["Crianza y cuidado familiar", 8, 10, 2],
    social: ["Estrés emocional", 8, 10, 6],
    fitness: ["Actividad física preventiva", 8, 6, 16],
    mobility: ["Seguridad en viajes / paseos", 6, 12, 6],
    digital: ["Consumo digital/redes", 6, 6, 2],
  },
  male_senior: {
    health: ["Enfermedades cardiovasculares", 10, 10, 16],
    mobility: ["Paseos / caminatas", 8, 6, 16],
    fitness: ["Actividad física moderada", 8, 6, 16],
    social: ["Interacción social", 6, 6, 2],
    travel: ["Viajes tranquilos", 4, 12, 16],
    creative: ["Recreación/hobbies", 6, 2, 6],
  },
  female_senior: {
    health: ["Salud ósea/articular", 10, 6, 16],
    social: ["Bienestar emocional", 8, 10, 6],
    mobility: ["Paseos, movilidad y equilibrio", 8, 6, 16],
    fitness: ["Actividad física suave", 8, 6, 16],
    home: ["Relaciones familiares", 8, 6, 2],
    spiritual: ["Espiritualidad/comunidad", 6, 6, 2],
  },
};

const experienceTypeAliases = {
  auto: ["work", "study", "fitness", "mobility", "social", "digital", "creative", "home", "spiritual"],
  work: ["work"],
  study: ["study"],
  fitness: ["fitness", "sports", "health"],
  mobility: ["mobility", "travel"],
  social: ["social", "home"],
  digital: ["digital"],
  creative: ["creative"],
  home: ["home", "social"],
  spiritual: ["spiritual", "social"],
  shopping: ["finance"],
};

function buildProfileImpact(profile, experienceType, weather, news) {
  const ageGroup = resolveAgeGroup(profile);
  const genderGroup = profile.gender === "female" ? "female" : profile.gender === "male" ? "male" : "neutral";
  const matrixKey = genderGroup === "neutral" ? `male_${ageGroup}` : `${genderGroup}_${ageGroup}`;
  const matrix = profileImpactMatrix[matrixKey] || profileImpactMatrix.male_adult;
  const aliases = experienceTypeAliases[experienceType] || experienceTypeAliases.auto;
  const row = aliases.map((alias) => matrix[alias]).find(Boolean) || Object.values(matrix)[0];
  const [activity, biometricWeight, geopoliticalWeight, climateWeight] = row;
  const climatePressure = weather.unavailable ? 0 : Math.min(1, (weather.riskSignals.length * 0.35) + (Number(weather.current?.temperatureC || 0) >= 32 ? 0.3 : 0));
  const geopoliticalPressure = news.unavailable ? 0 : Math.min(1, news.riskSignals.length * 0.3 + news.articleCount * 0.06);
  const scoreAdjustment = Math.round((climateWeight * climatePressure + geopoliticalWeight * geopoliticalPressure + biometricWeight * 0.08) / 2);
  const recommendations = [];
  if (climateWeight >= 10) recommendations.push("Revisar hidratación, descanso y exposición climática");
  if (geopoliticalWeight >= 10) recommendations.push("Revisar movilidad, seguridad y cambios operativos");
  if (biometricWeight >= 8) recommendations.push("Monitorear energía, sueño y recuperación");
  return {
    profileSegment: `${genderGroup}_${ageGroup}`,
    experienceType,
    matchedActivity: activity,
    weights: { biometric: biometricWeight, geopolitical: geopoliticalWeight, climate: climateWeight },
    scoreAdjustment,
    summary: `Perfil aplicado: ${activity}. Ajuste de impacto: ${scoreAdjustment >= 0 ? "+" : ""}${scoreAdjustment} puntos según edad, género y tipo de experiencia.`,
    recommendations,
  };
}

function resolveAgeGroup(profile = {}) {
  const age = profile.age || (profile.birthYear ? new Date().getFullYear() - Number(profile.birthYear) : null);
  if (age && age < 30) return "young";
  if (age && age >= 60) return "senior";
  return "adult";
}

function buildImpactSummary(score, weather, news) {
  if (score >= 70) return "Impacto contextual alto: revisa clima, movilidad y noticias antes de planificar experiencias.";
  if (score >= 45) return "Impacto contextual medio: hay señales externas que pueden afectar energía, seguridad o disponibilidad.";
  if (weather.riskSignals.length || news.riskSignals.length) return "Impacto bajo con algunas señales a monitorear.";
  return "Impacto contextual bajo según clima y cobertura noticiosa disponible.";
}

async function fetchJsonWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONTEXT_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`upstream_${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTextWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONTEXT_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`upstream_${response.status}`);
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function supabaseRest(table, options = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(options.searchParams || {})) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      ...supabaseRequestHeaders(options.accessToken),
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`supabase_${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : [];
}

async function supabaseRpc(functionName, body, accessToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      ...supabaseRequestHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`supabase_rpc_${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : [];
}

function supabaseRequestHeaders(accessToken = "") {
  if (accessToken) {
    return {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    };
  }
  return supabaseServerKeyHeaders();
}

function toProfileRow(profile, includeParameters = true) {
  const row = {
    user_id: profile.userId || LOCAL_USER_ID,
    email: profile.email || null,
    name: profile.name || "Experience Hub User",
    language: profile.language || "es",
    timezone: profile.timezone || "America/New_York",
    subscription_tier: profile.subscriptionTier || "mvp",
    updated_at: new Date().toISOString(),
  };
  if (includeParameters) {
    row.gender = profile.gender || null;
    row.birth_year = profile.birthYear ? Number(profile.birthYear) : null;
    row.experience_type = profile.experienceType || "auto";
  }
  return row;
}

function fromProfileRow(row) {
  return {
    userId: row.user_id,
    email: row.email,
    name: row.name,
    language: row.language,
    timezone: row.timezone,
    gender: row.gender || "",
    birthYear: row.birth_year || null,
    experienceType: row.experience_type || "auto",
    subscriptionTier: row.subscription_tier,
  };
}

async function toExperienceRow(experience, user = { id: LOCAL_USER_ID }) {
  const normalized = normalizeExperience(experience);
  const embeddingText = experienceSearchText(normalized);
  const embedding = await createEmbedding(embeddingText);
  return {
    experience_id: normalized.id,
    user_id: user.id || LOCAL_USER_ID,
    title: normalized.title,
    category: normalized.category,
    occurred_at: normalized.timestamp,
    duration_minutes: normalized.duration,
    mood: normalized.mood,
    energy: normalized.energy,
    location: normalized.location,
    people: normalized.people,
    notes: normalized.notes,
    locale: normalized.locale || "es",
    attachments: normalized.attachments || [],
    metadata: {
      ...(normalized.metadata || {}),
      objective: normalized.objective || "",
      workspaceId: normalized.workspaceId || null,
      pilotParticipantId: normalized.pilotParticipantId || null,
      pilotParticipantName: normalized.pilotParticipantName || null,
      events: normalized.events || [],
      isDemo: Boolean(normalized.isDemo),
      demoBatch: normalized.demoBatch || null,
    },
    embedding,
    embedding_model: activeEmbeddingsProvider(),
    updated_at: new Date().toISOString(),
  };
}

function fromExperienceRow(row) {
  return normalizeExperience({
    id: row.experience_id,
    title: row.title,
    category: row.category,
    timestamp: row.occurred_at,
    duration: row.duration_minutes,
    mood: row.mood,
    energy: row.energy,
    location: row.location || "Sin ubicación",
    people: row.people || "Sin personas",
    notes: row.notes || "",
    objective: row.metadata?.objective || "",
    workspaceId: row.workspace_id || row.metadata?.workspaceId || "",
    pilotParticipantId: row.participant_id || row.metadata?.pilotParticipantId || "",
    pilotParticipantName: row.metadata?.pilotParticipantName || "",
    events: Array.isArray(row.metadata?.events) ? row.metadata.events : [],
    isDemo: Boolean(row.metadata?.isDemo),
    demoBatch: row.metadata?.demoBatch || "",
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    metadata: isPlainObject(row.metadata) ? row.metadata : {},
    locale: row.locale || "es",
    updatedAt: row.updated_at,
  });
}

function normalizeExperience(experience) {
  const metadata = isPlainObject(experience.metadata) ? experience.metadata : {};
  const rawEnergy = experience.energy;
  return {
    id: experience.id || createId(),
    title: experience.title || "Untitled experience",
    category: normalizeCategoryName(experience.category || "Sin categoría"),
    timestamp: experience.timestamp || new Date().toISOString(),
    duration: Number(experience.duration || 0),
    mood: experience.mood || "Calmo",
    energy: Number.isFinite(Number(rawEnergy)) ? Number(rawEnergy) : null,
    location: experience.location || "Sin ubicación",
    people: experience.people || "Sin personas",
    notes: experience.notes || "",
    objective: experience.objective || metadata.objective || "",
    workspaceId: experience.workspaceId || metadata.workspaceId || "",
    pilotParticipantId: experience.pilotParticipantId || metadata.pilotParticipantId || "",
    pilotParticipantName: experience.pilotParticipantName || metadata.pilotParticipantName || "",
    events: normalizeExperienceEvents(experience.events || metadata.events || [], experience.id),
    isDemo: Boolean(experience.isDemo || metadata.isDemo),
    demoBatch: experience.demoBatch || metadata.demoBatch || "",
    attachments: Array.isArray(experience.attachments) ? experience.attachments : [],
    metadata,
    locale: experience.locale || "es",
    updatedAt: experience.updatedAt || new Date().toISOString(),
  };
}

function normalizeExperienceEvents(events = [], experienceId = "") {
  if (!Array.isArray(events)) return [];
  return events
    .map((event, index) => {
      const narrativeText = getEventNarrativeText(event);
      return {
        id: event.id || event.eventId || `evt-${experienceId || "experience"}-${index + 1}`,
        title: String(event.title || event.name || "").trim(),
        description: String(event.description || event.notes || "").trim(),
        order: Number.isFinite(Number(event.order)) ? Number(event.order) : index + 1,
        timestamp: event.timestamp || event.occurredAt || "",
        duration: event.duration ? Number(event.duration) : null,
        mood: event.mood || "",
        energy: event.energy ? Number(event.energy) : null,
        narrativeText,
        narrativeStatus: narrativeText ? "ok" : "pending",
      };
    })
    .filter((event) => event.title || event.description);
}

function normalizeCategoryName(category) {
  return categoryAliases[category] || category || "Sin categoría";
}

function createId() {
  return `exp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_JSON_BODY_LENGTH) {
        reject(new Error("payload_too_large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function readRawBody(req, maxLength = MAX_MEDIA_BODY_LENGTH) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    req.on("data", (chunk) => {
      length += chunk.length;
      if (length > maxLength) {
        reject(new Error("payload_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readMultipartMedia(req, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2];
  if (!boundary) throw new Error("missing_multipart_boundary");
  const body = await readRawBody(req, MAX_MEDIA_BODY_LENGTH);
  const parts = parseMultipartParts(body, boundary);
  const filePart = parts.find((part) => part.name === "file");
  if (!filePart?.content?.length) throw new Error("missing_media_file");
  const metaPart = parts.find((part) => part.name === "metadata");
  let metadata = {};
  if (metaPart?.content?.length) {
    try {
      metadata = JSON.parse(metaPart.content.toString("utf8"));
    } catch {
      throw new Error("invalid_media_metadata");
    }
  }
  return {
    media: {
      ...metadata,
      name: metadata.name || filePart.filename || "media",
      type: metadata.type || filePart.contentType || "application/octet-stream",
      size: Number(metadata.size || filePart.content.length),
    },
    bytes: filePart.content,
  };
}

function parseMultipartParts(body, boundary) {
  const marker = `--${boundary}`;
  const raw = body.toString("latin1");
  return raw
    .split(marker)
    .slice(1, -1)
    .map((section) => section.replace(/^\r\n/, "").replace(/\r\n$/, ""))
    .map((section) => {
      const separator = section.indexOf("\r\n\r\n");
      if (separator < 0) return null;
      const headerText = section.slice(0, separator);
      let contentText = section.slice(separator + 4);
      if (contentText.endsWith("\r\n")) contentText = contentText.slice(0, -2);
      const disposition = headerText.match(/content-disposition:\s*([^\r\n]+)/i)?.[1] || "";
      const name = disposition.match(/name="([^"]+)"/i)?.[1] || "";
      const filename = disposition.match(/filename="([^"]*)"/i)?.[1] || "";
      const contentType = headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1] || "";
      return {
        name,
        filename,
        contentType,
        content: Buffer.from(contentText, "latin1"),
      };
    })
    .filter(Boolean);
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, message) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

function sendPdf(res, bytes, filename = "reporte-experiencias.pdf") {
  res.writeHead(200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
  res.end(bytes);
}

function formatHttpErrorMessage(error) {
  if (!error) return "Error desconocido.";
  if (typeof error.detail === "string" && error.detail.trim()) return error.detail;
  if (error.detail?.message) return String(error.detail.message);
  if (Array.isArray(error.detail?.missingConfig)) {
    return `Faltan variables de configuracion: ${error.detail.missingConfig.join(", ")}.`;
  }
  if (error.statusCode) return String(error.message || "request_failed");
  return String(error.message || "internal_error");
}

async function saveExportFile(body = {}) {
  const filename = sanitizeExportFilename(body.filename || "export.json");
  const content = typeof body.content === "string" ? body.content : JSON.stringify(body.content ?? {}, null, 2);
  const stampedName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${filename}`;
  await mkdir(EXPORTS_DIR, { recursive: true });
  const filePath = path.join(EXPORTS_DIR, stampedName);
  await writeFile(filePath, content, "utf-8");
  return {
    ok: true,
    filename: stampedName,
    path: filePath,
    relativePath: path.relative(__dirname, filePath),
    savedAt: new Date().toISOString(),
  };
}

async function saveObsidianExport(body = {}, user = null) {
  if (!OBSIDIAN_VAULT_PATH) {
    throw new HttpError(503, "obsidian_vault_not_configured");
  }
  const content = typeof body.markdown === "string"
    ? body.markdown
    : typeof body.content === "string"
      ? body.content
      : "";
  if (!content.trim()) throw new HttpError(400, "obsidian_markdown_required");

  const vaultRoot = path.resolve(OBSIDIAN_VAULT_PATH);
  await mkdir(vaultRoot, { recursive: true });
  const targetKey = String(body.target || inferObsidianTargetFromFilename(body.filename || "") || "inbox").trim().toLowerCase();
  const targetRelative = OBSIDIAN_EXPORT_TARGETS[targetKey] || OBSIDIAN_EXPORT_TARGETS.inbox;
  const targetDir = path.resolve(vaultRoot, targetRelative);
  if (!isPathInside(targetDir, vaultRoot)) throw new HttpError(400, "obsidian_invalid_target");
  await mkdir(targetDir, { recursive: true });

  const filename = sanitizeObsidianFilename(body.filename || "vibe-export.md");
  const requestedPath = path.resolve(targetDir, filename);
  if (!isPathInside(requestedPath, targetDir)) throw new HttpError(400, "obsidian_invalid_filename");
  const finalContent = ensureObsidianFrontmatter(content, {
    userId: user?.id || LOCAL_USER_ID,
    target: targetKey,
    source: body.source || "vibepwa",
  });
  const preserveHuman = shouldPreserveHumanObsidianContent(targetKey) || body.preserveHuman === true;
  let finalPath = body.upsert === false ? await uniqueObsidianPath(requestedPath) : requestedPath;
  let contentToWrite = finalContent;
  if (preserveHuman && existsSync(requestedPath)) {
    const existingContent = await readFile(requestedPath, "utf-8");
    const mergedContent = mergeObsidianAutoBlock(existingContent, finalContent);
    if (mergedContent) {
      contentToWrite = mergedContent;
      finalPath = requestedPath;
    } else {
      finalPath = await uniqueObsidianPath(requestedPath);
    }
  }
  await writeFile(finalPath, contentToWrite.endsWith("\n") ? contentToWrite : `${contentToWrite}\n`, "utf-8");
  return {
    ok: true,
    filename: path.basename(finalPath),
    path: finalPath,
    relativePath: path.relative(vaultRoot, finalPath).replace(/\\/g, "/"),
    target: targetKey,
    vaultPath: vaultRoot,
    savedAt: new Date().toISOString(),
  };
}

function shouldPreserveHumanObsidianContent(targetKey = "") {
  return String(targetKey || "").toLowerCase() === "experiences" || String(targetKey || "").toLowerCase() === "experience";
}

function mergeObsidianAutoBlock(existingContent = "", incomingContent = "") {
  const existing = String(existingContent || "");
  const incoming = String(incomingContent || "").trim();
  if (!existing.trim()) return incoming;
  const existingStart = existing.indexOf(OBSIDIAN_AUTO_START);
  const existingEnd = existing.indexOf(OBSIDIAN_AUTO_END, existingStart);
  const incomingStart = incoming.indexOf(OBSIDIAN_AUTO_START);
  const incomingEnd = incoming.indexOf(OBSIDIAN_AUTO_END, incomingStart);
  if (existingStart < 0 || existingEnd < 0 || incomingStart < 0 || incomingEnd < 0) return null;
  const incomingAutomatic = incoming.slice(0, incomingEnd + OBSIDIAN_AUTO_END.length);
  const preservedHuman = normalizeObsidianHumanHeadings(existing.slice(existingEnd + OBSIDIAN_AUTO_END.length));
  const mergedAutomatic = hasCuratedObsidianLearnings(preservedHuman)
    ? setObsidianFrontmatterField(
        setObsidianFrontmatterField(incomingAutomatic, "learnings", "ok"),
        "updated_at",
        new Date().toISOString(),
      )
    : incomingAutomatic;
  return `${mergedAutomatic}${preservedHuman}`.trim();
}

function normalizeObsidianHumanHeadings(markdown = "") {
  const humanHeading = `## Curadur${String.fromCharCode(0x00ed)}a humana`;
  const variants = [
    "## Curaduria humana",
    humanHeading,
    `## Curadur${String.fromCharCode(0x00c3)}${String.fromCharCode(0x00ad)}a humana`,
  ];
  return variants.reduce(
    (text, variant) => text.split(variant).join(humanHeading),
    String(markdown || ""),
  );
}

function hasCuratedObsidianLearnings(markdown = "") {
  const text = String(markdown || "");
  const match = text.match(new RegExp("(?:^|\\n)###\\s+Aprendizajes[^\\n]*\\n([\\s\\S]*?)(?=\\n#{2,3}\\s+|$)", "i"));
  if (!match) return false;
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line && !line.startsWith("<!--") && !/^[-*]\s*$/.test(line));
}

function setObsidianFrontmatterField(markdown = "", field = "", value = "") {
  const text = String(markdown || "");
  const serialized = `${field}: ${JSON.stringify(value)}`;
  const frontmatterMatch = text.match(new RegExp("^---\\n([\\s\\S]*?)\\n---\\n?"));
  if (!frontmatterMatch) return text;
  const bodyStart = frontmatterMatch[0].length;
  const frontmatter = frontmatterMatch[1];
  const fieldPattern = new RegExp(`^${field}:.*$`, "m");
  const nextFrontmatter = fieldPattern.test(frontmatter)
    ? frontmatter.replace(fieldPattern, serialized)
    : `${frontmatter}\n${serialized}`;
  return `---\n${nextFrontmatter}\n---\n${text.slice(bodyStart)}`;
}

function inferObsidianTargetFromFilename(filename = "") {
  const normalized = String(filename || "").toLowerCase();
  if (/publicacion|publication/.test(normalized)) return "publications";
  if (/hallazgo|insight|finding|reporte|report/.test(normalized)) return "generated_report";
  if (/mapa|map|obsidian/.test(normalized)) return "generated_map";
  if (/manual|guia|guide/.test(normalized)) return "manual";
  if (/experiencia|experience/.test(normalized)) return "experiences";
  if (/activo|asset|multimedia|biometr/.test(normalized)) return "assets";
  return "inbox";
}

function sanitizeObsidianFilename(filename = "") {
  const base = path.basename(String(filename || "vibe-export.md")).replace(/\.(markdown)$/i, ".md");
  const clean = base
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
  const withExtension = clean || "vibe-export.md";
  return /\.md$/i.test(withExtension) ? withExtension : `${withExtension}.md`;
}

function ensureObsidianFrontmatter(content = "", meta = {}) {
  if (/^\s*---\s*\n/.test(content)) return content;
  const now = new Date().toISOString();
  const lines = [
    "---",
    `vibe_id: ${JSON.stringify(meta.vibeId || `obsidian-${Date.now()}`)}`,
    "type: markdown_export",
    `source: ${JSON.stringify(meta.source || "vibepwa")}`,
    `user_id: ${JSON.stringify(meta.userId || LOCAL_USER_ID)}`,
    `target: ${JSON.stringify(meta.target || "inbox")}`,
    `created_at: ${JSON.stringify(now)}`,
    `updated_at: ${JSON.stringify(now)}`,
    "sync_status: exported",
    "---",
    "",
  ];
  return `${lines.join("\n")}${content}`;
}

async function uniqueObsidianPath(filePath) {
  if (!existsSync(filePath)) return filePath;
  const directory = path.dirname(filePath);
  const extension = path.extname(filePath) || ".md";
  const stem = path.basename(filePath, extension);
  for (let index = 2; index < 500; index += 1) {
    const candidate = path.join(directory, `${stem} ${index}${extension}`);
    if (!existsSync(candidate)) return candidate;
  }
  return path.join(directory, `${stem} ${Date.now()}${extension}`);
}

function isPathInside(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function sanitizeExportFilename(filename) {
  const base = path.basename(String(filename || "export.json"));
  return base.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120) || "export.json";
}

class HttpError extends Error {
  constructor(statusCode, message, detail = "") {
    super(message);
    this.statusCode = statusCode;
    this.detail = detail;
  }
}



