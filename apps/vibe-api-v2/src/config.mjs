import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { ApiError } from "./errors.mjs";

let cachedPythonCommand = null;

// Devuelve el primer interprete que REALMENTE responde. En POSIX se prueba
// python3 antes que python (en Debian `python` no suele existir).
function resolvePythonCommand(env = process.env) {
  if (cachedPythonCommand !== null) return cachedPythonCommand;
  const configured = String(env.PYTHON_COMMAND || env.PYTHON || "").trim();
  const candidates = [
    configured,
    ...(process.platform === "win32" ? ["python", "python3", "py"] : ["python3", "python"]),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.includes("/") || candidate.includes("\\")) {
      if (existsSync(candidate)) {
        cachedPythonCommand = candidate;
        return cachedPythonCommand;
      }
      continue;
    }
    try {
      if (spawnSync(candidate, ["--version"], { stdio: "ignore", windowsHide: true }).status === 0) {
        cachedPythonCommand = candidate;
        return cachedPythonCommand;
      }
    } catch {
      // siguiente candidato
    }
  }
  cachedPythonCommand = configured || "python3";
  return cachedPythonCommand;
}

export function loadConfig(env = process.env) {
  const supabaseUrl = cleanUrl(env.SUPABASE_URL);
  const publishableKey = String(
    env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || "",
  ).trim();
  const serviceRoleKey = String(
    env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || "",
  ).trim();
  return Object.freeze({
    env: String(env.NODE_ENV || "development"),
    port: Number(env.VIBE_API_V2_PORT || env.PORT || 8080),
    supabaseUrl,
    publishableKey,
    serviceRoleKey,
    storageBucket: String(env.SUPABASE_STORAGE_BUCKET || "experience-media").trim(),
    maxJsonBytes: positiveInt(env.VIBE_API_V2_MAX_JSON_BYTES, 2 * 1024 * 1024),
    maxFileBytes: positiveInt(env.VIBE_API_V2_MAX_FILE_BYTES, 100 * 1024 * 1024),
    upstreamTimeoutMs: positiveInt(env.VIBE_API_V2_UPSTREAM_TIMEOUT_MS, 20_000),
    healthCacheMs: positiveInt(env.VIBE_API_V2_HEALTH_CACHE_MS, 120_000),
    // El default era el literal "python", que en Linux (Railway) no existe:
    // ningun PDF de VibePWA 2 se podia generar. Se resuelve probando candidatos
    // reales con --version, igual que el servidor legacy.
    pythonCommand: resolvePythonCommand(env),
    obsidianVaultPath: String(env.OBSIDIAN_VAULT_PATH || "").trim(),
    ouraClientId: String(env.OURA_CLIENT_ID || "").trim(),
    ouraClientSecret: String(env.OURA_CLIENT_SECRET || "").trim(),
    ouraRedirectUri: String(env.OURA_REDIRECT_URI || "").trim(),
    ouraWebhookSecret: String(env.OURA_WEBHOOK_SECRET || "").trim(),
    integrationEncryptionKey: String(env.INTEGRATION_ENCRYPTION_KEY || "").trim(),
    openaiApiKey: String(env.OPENAI_API_KEY || "").trim(),
    openaiModel: String(env.VIBE_ASSISTANT_MODEL || "gpt-4.1-mini").trim(),
    publicBaseUrl: cleanUrl(
      env.VIBE_API_V2_PUBLIC_BASE_URL ||
      env.PUBLIC_BASE_URL ||
      "https://experience-hub-web-production.up.railway.app",
    ),
  });
}

export function assertRuntimeConfig(config) {
  const missing = [];
  if (!config.supabaseUrl) missing.push("SUPABASE_URL");
  if (!config.publishableKey) missing.push("SUPABASE_PUBLISHABLE_KEY");
  if (!config.serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    throw new ApiError(
      503,
      "runtime_not_configured",
      `Faltan variables obligatorias: ${missing.join(", ")}.`,
    );
  }
}

function cleanUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}
