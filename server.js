import { createServer } from "node:http";
import { readFile, mkdir, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
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
const EMBEDDINGS_PROVIDER = process.env.EMBEDDINGS_PROVIDER || "local-hash";
const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS || 384);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const TRANSCRIPTION_PROVIDER = process.env.TRANSCRIPTION_PROVIDER || "openai";
const OPENAI_TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";
const OCR_PROVIDER = process.env.OCR_PROVIDER || "openai";
const OPENAI_OCR_MODEL = process.env.OPENAI_OCR_MODEL || "gpt-4o-mini";
const SIGNAL_METADATA_SCHEMA_VERSION = "clio-inspired-signal-v1";
const execFileAsync = promisify(execFile);

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
];

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      error: error.statusCode ? error.message : "internal_error",
      message: error.statusCode ? undefined : error.message,
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
      sendJson(res, 201, await saveMediaBuffer(upload.media, upload.bytes, user));
      return;
    }
    const media = await readJson(req);
    sendJson(res, 201, await saveMedia(media, user));
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
    const user = await getRequestUser(req);
    const body = await readJson(req);
    sendPdf(res, await buildPdfReport(user, body.report));
    return;
  }

  if (url.pathname === "/api/publication/pdf" && req.method === "POST") {
    const user = await getRequestUser(req);
    const body = await readJson(req);
    sendPdf(res, await buildPublicationPdf(body.html, user), "publicacion-inteligente.pdf");
    return;
  }

  if (url.pathname === "/api/exports/file" && req.method === "POST") {
    const body = await readJson(req);
    sendJson(res, 201, await saveExportFile(body));
    return;
  }

  if (url.pathname === "/api/context/impact" && req.method === "GET") {
    const location = url.searchParams.get("location") || "New York";
    const experienceType = url.searchParams.get("experienceType") || "auto";
    const user = await getOptionalRequestUser(req);
    const profile = await getProfile(user);
    sendJson(res, 200, await getContextImpact(location, profile, experienceType));
    return;
  }

  if (url.pathname === "/api/daily-briefing" && req.method === "GET") {
    const location = url.searchParams.get("location") || "San Juan";
    const locale = url.searchParams.get("locale") || "es";
    const force = url.searchParams.get("force") === "1";
    const user = await getOptionalRequestUser(req);
    sendJson(res, 200, await getDailyBriefing(location, locale, { user, force }));
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

async function serveStatic(res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(__dirname, safePath);

  if (!filePath.startsWith(__dirname) || !existsSync(filePath)) {
    sendText(res, 404, "Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const content = await readFile(filePath);
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  res.end(content);
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
    await supabaseRest("experience_events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(events.map((event, index) => toExperienceEventRow(event, experience, workspace.id, index))),
      accessToken: user.accessToken,
    });
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
    await supabaseRest("assets", {
      method: "DELETE",
      searchParams: { experience_id: `eq.${experience.id}` },
      headers: { Prefer: "return=minimal" },
      accessToken: user.accessToken,
    });
    const rows = attachments
      .map((attachment, index) => toAssetRow(attachment, experience, workspace.id, user, index))
      .filter(Boolean);
    if (!rows.length) return { synced: true, count: 0 };
    await supabaseRest("assets", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
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

function toExperienceEventRow(event, experience, workspaceId, index = 0) {
  const participantId = experience.pilotParticipantId || null;
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
    metadata: buildSignalMetadata({
      existing: event.metadata,
      source: "experience-capture-v1",
      sourceType: event.sourceType || experience.sourceType || "manual",
      payloadType: "experience_event",
      experience,
      event,
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
  };
}

function toAssetRow(attachment, experience, workspaceId, user, index = 0) {
  if (!attachment) return null;
  const kind = attachment.kind || inferServerMediaKind(attachment);
  const participantId = experience.pilotParticipantId || null;
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
      },
    }),
  };
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
    capturedAt: metadata.capturedAt || "",
    uploadedAt: metadata.uploadedAt || "",
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

  const objectPath = `${user.id}/${Date.now()}-${sanitizeFileName(normalized.name)}`;
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
      kind: normalized.kind || inferServerMediaKind(normalized),
      sourceType: normalized.sourceType || "",
      sourceId: normalized.sourceId || "",
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
  return {
    id: media.id || createId(),
    name: media.name || "media",
    type: media.type || "application/octet-stream",
    size: Number(media.size || 0),
    dataUrl: media.dataUrl || null,
    createdAt: media.createdAt || new Date().toISOString(),
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
    metadata: isPlainObject(media.metadata) ? media.metadata : {},
    sourceType: media.sourceType || media.source || "",
    sourceDevice: media.sourceDevice || media.device || "",
    sourceId: media.sourceId || "",
    permissions: media.permissions || "",
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
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${SUPABASE_STORAGE_BUCKET}`, {
    method: "DELETE",
    headers: {
      ...supabaseServerKeyHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefixes: [objectPath] }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`supabase_storage_delete_${response.status}: ${text}`);
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
    const location = inferPrimaryLocationFrom(experiences) || "San Juan";
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
    const richPdf = await renderReportHtmlToPdf(buildReportPdfHtml(report));
    if (richPdf) {
      await appendLog("info", "PDF report generated", { count: report.rows.length, userId: user.id, source: "client-report-html" });
      return richPdf;
    }
    const kpiLines = (report.humanKpis || []).flatMap((item) => [
      `${item.label || "KPI"}: ${item.score || 0}/100 ${pdfBar(item.score || 0)}`,
      item.detail || "",
    ]);
    const categoryLines = (report.categoryBreakdown || []).slice(0, 10).flatMap((item) => [
      `${item.category || ""}: ${item.count || 0} experiencias | ${((Number(item.minutes || 0) / 60) || 0).toFixed(1)} h | energia ${item.avgEnergy || 0}/10 ${pdfBar(Number(item.avgEnergy || 0) * 10)}`,
    ]);
    const predictive = report.predictiveOutlook || null;
    const lines = [
      "Experience Hub MVP",
      report.language === "en" ? "Experience report" : "Reporte de experiencias",
      `Generado: ${report.generatedAt || new Date().toISOString()}`,
      `Experiencias: ${report.summary.totalExperiences || 0}`,
      `Horas capturadas: ${report.summary.capturedHours || 0}`,
      `Energia media: ${report.summary.averageEnergy || 0}/10`,
      `Categoria dominante: ${report.summary.topCategory || ""}`,
      "",
      predictive ? (report.language === "en" ? "Initial outlook" : "Proyeccion inicial") : "",
      predictive ? `${predictive.title || ""} | confianza ${predictive.confidence || 0}% ${pdfBar(predictive.confidence || 0)}` : "",
      predictive ? `Hipotesis: ${predictive.hypothesis || ""}` : "",
      predictive ? `Siguiente accion: ${predictive.nextStep || ""}` : "",
      ...((predictive?.drivers || []).slice(0, 5).map((driver) => `- ${driver}`)),
      predictive ? "" : "",
      report.language === "en" ? "Integrated reading" : "Lectura integrada",
      ...(report.integratedReading || []).flatMap((item) => [
        `${item.title || ""}`,
        `Prioridad: ${item.priority || ""}`,
        `Evidencia: ${item.evidence || ""}`,
        `Accion: ${item.action || ""}`,
        "",
      ]),
      kpiLines.length ? (report.language === "en" ? "Human indexes" : "Indices humanos") : "",
      ...kpiLines,
      kpiLines.length ? "" : "",
      categoryLines.length ? (report.language === "en" ? "Category breakdown" : "Desglose por categoria") : "",
      ...categoryLines,
      categoryLines.length ? "" : "",
      report.language === "en" ? "Map routes" : "Rutas del mapa",
      ...(report.mapRoutes || []).map((route) => `${route.title || ""}: ${route.count || 0} experiencias | energia ${route.avgEnergy || 0}/10`),
      "",
      (report.multimodalEvidence || []).length ? (report.language === "en" ? "Multimodal evidence" : "Evidencia multimodal") : "",
      ...(report.multimodalEvidence || []).slice(0, 8).flatMap((item) => [
        `${item.experienceTitle || ""} | ${item.name || ""} | ${item.kind || ""}`,
        `${item.analyticalText || item.manualNote || ""}`,
      ]),
      (report.multimodalEvidence || []).length ? "" : "",
      ...report.rows.slice(0, 40).map((item) => `${item.fecha || ""} | ${item.titulo || ""} | ${item.categoría || item.categoria || ""} | ${item.energia || ""}/10`),
    ];
    await appendLog("info", "PDF report generated", { count: report.rows.length, userId: user.id, source: "client-report" });
    return createSimplePdf(lines);
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

async function buildPublicationPdf(html, user = { id: LOCAL_USER_ID }) {
  if (typeof html !== "string" || !html.trim()) {
    throw new HttpError(400, "publication_html_required");
  }
  const printable = normalizePublicationHtmlForPdf(html);
  const pdf = await renderReportHtmlToPdf(printable);
  if (pdf) {
    await appendLog("info", "Publication PDF generated", { userId: user.id, source: "publication-html" });
    return pdf;
  }
  await appendLog("warn", "Publication PDF fallback used", { userId: user.id });
  return createSimplePdf([
    "Experience Hub - Publicacion inteligente",
    "El servidor no pudo renderizar el PDF visual avanzado.",
    "Usa Exportar HTML como salida visual equivalente o configura Chrome/Edge en el entorno del servidor.",
  ]);
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

async function getContextImpact(location, profile = {}, experienceType = "auto") {
  let place;
  try {
    place = await geocodeLocation(location);
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
    location: place.name,
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
  const query = `${place.name} ${place.country || ""} conflict OR protest OR security OR election`;
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
    const fallbackQuery = [place.name, place.country, "politica economia seguridad gobierno noticias"].filter(Boolean).join(" ");
    articles = await fetchGoogleNewsRss({ query: fallbackQuery }, "es");
    if (articles.length) {
      source = "Google News RSS";
      fallbackReason = fallbackReason || "gdelt_without_articles";
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
  const language = String(locale).startsWith("en") ? "en" : "es";
  const user = options.user || { id: LOCAL_USER_ID };
  if (!options.force) {
    const cached = await getStoredDailyBriefing(user, location, language);
    if (cached && !isStoredDailyBriefingStale(cached)) {
      return { ...cached, cached: true, cacheSource: cached.cacheSource || activePersistence() };
    }
  }

  try {
    const briefing = await buildLiveDailyBriefing(location, language);
    await saveStoredDailyBriefing(user, briefing);
    return { ...briefing, cached: false, cacheSource: "live" };
  } catch (error) {
    const cached = await getStoredDailyBriefing(user, location, language);
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

async function buildLiveDailyBriefing(location, language = "es") {
  const place = await geocodeLocation(location);
  const worldLabel = language === "en" ? "World" : "Mundo";
  const placeLabel = [place.name, place.country || place.countryCode].filter(Boolean).join(", ");
  const queryPlace = [place.name, place.country || place.countryCode].filter(Boolean).join(" ");
  const sections = buildBriefingSections(queryPlace, language);
  const [sectionResults, weatherResult] = await Promise.all([
    Promise.allSettled(sections.map((section) => fetchBriefingSection(section, language))),
    Promise.allSettled([getWeatherImpact(place)]),
  ]);
  const resolvedSections = sections.map((section, index) => {
    const result = sectionResults[index];
    return result.status === "fulfilled" ? result.value : enrichBriefingSection({ ...section, summary: unavailableBriefingSummary(language), articles: [] }, language);
  });
  const weather = weatherResult[0]?.status === "fulfilled" ? weatherResult[0].value : unavailableWeatherImpact(weatherResult[0]?.reason);
  return {
    schemaVersion: "20260522-daily-media-specific-35",
    source: "GDELT DOC 2.0 + Google News RSS",
    location: place.name,
    country: place.country || place.countryCode || "",
    countryCode: place.countryCode,
    scope: `${placeLabel || location} + ${worldLabel}`,
    locale: language,
    generatedAt: new Date().toISOString(),
    refreshEveryHours: 6,
    nextRefreshAt: addMinutes(new Date(), 360).toISOString(),
    agendaLinks: buildAgendaLinks(place, language),
    weather,
    groups: buildBriefingGroups(resolvedSections, language),
    sections: resolvedSections,
    horoscope: await getDailyHoroscope(language),
  };
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
  return String(location || "san juan")
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
      title: language === "en" ? "Local news" : "Noticias locales",
      sections: sections.filter((section) => section.scope === "local"),
    },
    {
      id: "world",
      title: language === "en" ? "World news" : "Noticias mundiales",
      sections: sections.filter((section) => section.scope === "world"),
    },
  ];
}

function buildAgendaLinks(place, language) {
  const placeLabel = [place.name, place.country || place.countryCode].filter(Boolean).join(" ");
  const labels =
    language === "en"
      ? [
          ["Movie showtimes", `movie showtimes ${placeLabel}`],
          ["Concerts", `concerts ${placeLabel}`],
          ["Theater", `theater shows ${placeLabel}`],
          ["Events today", `events today ${placeLabel}`],
          ["Exhibitions", `exhibitions museums ${placeLabel}`],
        ]
      : [
          ["Cartelera de cine", `cartelera cine ${placeLabel}`],
          ["Conciertos", `conciertos ${placeLabel}`],
          ["Teatro", `teatro obras ${placeLabel}`],
          ["Eventos de hoy", `eventos hoy ${placeLabel}`],
          ["Exposiciones", `exposiciones museos ${placeLabel}`],
        ];
  return labels.map(([label, query]) => ({
    label,
    query,
    url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  }));
}

async function fetchBriefingSection(section, language) {
  const gdeltArticles = await fetchGdeltBriefingArticles(section);
  if (gdeltArticles.length) {
    return enrichBriefingSection({
      id: section.id,
      scope: section.scope,
      title: section.title,
      source: "GDELT DOC 2.0",
      summary: buildBriefingSummary(gdeltArticles, language),
      articles: gdeltArticles,
    }, language);
  }

  const rssArticles = await hydrateArticleImages(await fetchGoogleNewsRss(section, language));
  return enrichBriefingSection({
    id: section.id,
    scope: section.scope,
    title: section.title,
    source: rssArticles.length ? "Google News RSS" : "Sin fuente disponible",
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
  const searchQuery = `${section.title} ${language === "en" ? "news" : "noticias"}`;
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
  url.searchParams.set("sort", "hybridrel");
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

async function fetchGoogleNewsRss(section, language) {
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", normalizeNewsQuery(section.query));
  if (language === "en") {
    url.searchParams.set("hl", "en-US");
    url.searchParams.set("gl", "US");
    url.searchParams.set("ceid", "US:en");
  } else {
    url.searchParams.set("hl", "es-419");
    url.searchParams.set("gl", "US");
    url.searchParams.set("ceid", "US:es-419");
  }
  try {
    const xml = await fetchTextWithTimeout(url);
    return parseGoogleNewsRss(xml, language).slice(0, 6);
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
  if (language !== "en") return buildDailyHoroscope(language);
  const signs = [
    ["Aries", "aries"],
    ["Taurus", "taurus"],
    ["Gemini", "gemini"],
    ["Cancer", "cancer"],
    ["Leo", "leo"],
    ["Virgo", "virgo"],
    ["Libra", "libra"],
    ["Scorpio", "scorpio"],
    ["Sagittarius", "sagittarius"],
    ["Capricorn", "capricorn"],
    ["Aquarius", "aquarius"],
    ["Pisces", "pisces"],
  ];
  const results = await Promise.allSettled(signs.map(([label, sign]) => fetchDailyHoroscopeSign(label, sign)));
  const external = results
    .map((result) => (result.status === "fulfilled" ? result.value : null))
    .filter(Boolean);
  return external.length === signs.length ? external : buildDailyHoroscope(language);
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
  return `${articles.length} notas recientes encontradas. Principal: ${lead}${domains.length ? ` Fuentes: ${domains.join(", ")}.` : ""}`;
}

function unavailableBriefingSummary(language) {
  return language === "en" ? "No recent items available for this section." : "Sin notas recientes disponibles para esta sección.";
}

function buildDailyHoroscope(language) {
  const signs =
    language === "en"
      ? ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"]
      : ["Aries", "Tauro", "Géminis", "Cáncer", "Leo", "Virgo", "Libra", "Escorpio", "Sagitario", "Capricornio", "Acuario", "Piscis"];
  const themes =
    language === "en"
      ? ["focus", "patience", "movement", "dialogue", "care", "planning", "creativity", "rest", "clarity", "discipline", "connection", "learning"]
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
      ...(experience.metadata || {}),
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
    locale: row.locale || "es",
    updatedAt: row.updated_at,
  });
}

function normalizeExperience(experience) {
  return {
    id: experience.id || createId(),
    title: experience.title || "Untitled experience",
    category: normalizeCategoryName(experience.category || "Trabajo"),
    timestamp: experience.timestamp || new Date().toISOString(),
    duration: Number(experience.duration || 0),
    mood: experience.mood || "Calmo",
    energy: Number(experience.energy || 5),
    location: experience.location || "Sin ubicación",
    people: experience.people || "Sin personas",
    notes: experience.notes || "",
    objective: experience.objective || experience.metadata?.objective || "",
    workspaceId: experience.workspaceId || experience.metadata?.workspaceId || "",
    pilotParticipantId: experience.pilotParticipantId || experience.metadata?.pilotParticipantId || "",
    pilotParticipantName: experience.pilotParticipantName || experience.metadata?.pilotParticipantName || "",
    events: normalizeExperienceEvents(experience.events || experience.metadata?.events || [], experience.id),
    isDemo: Boolean(experience.isDemo || experience.metadata?.isDemo),
    demoBatch: experience.demoBatch || experience.metadata?.demoBatch || "",
    attachments: Array.isArray(experience.attachments) ? experience.attachments : [],
    locale: experience.locale || "es",
    updatedAt: experience.updatedAt || new Date().toISOString(),
  };
}

function normalizeExperienceEvents(events = [], experienceId = "") {
  if (!Array.isArray(events)) return [];
  return events
    .map((event, index) => ({
      id: event.id || event.eventId || `evt-${experienceId || "experience"}-${index + 1}`,
      title: String(event.title || event.name || "").trim(),
      description: String(event.description || event.notes || "").trim(),
      order: Number.isFinite(Number(event.order)) ? Number(event.order) : index + 1,
      timestamp: event.timestamp || event.occurredAt || "",
      duration: event.duration ? Number(event.duration) : null,
      mood: event.mood || "",
      energy: event.energy ? Number(event.energy) : null,
    }))
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

function sanitizeExportFilename(filename) {
  const base = path.basename(String(filename || "export.json"));
  return base.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120) || "export.json";
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}



