import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { ApiError } from "./errors.mjs";

const OURA_SCOPES = "email personal daily heartrate workout tag session spo2";
const OURA_COLLECTIONS = Object.freeze([
  "daily_activity",
  "daily_readiness",
  "daily_sleep",
  "sleep",
  "heartrate",
  "workout",
  "session",
  "daily_spo2",
]);

export function createIntegrationService({ config, supabase, workspace, fetchImpl = fetch }) {
  async function status(auth) {
    const scope = await workspace.resolve(auth);
    const rows = await supabase.rest("integration_connections_v2", {
      accessToken: auth.accessToken,
      query: {
        owner_user_id: `eq.${auth.user.id}`,
        workspace_id: `eq.${scope.id}`,
        provider: "eq.oura",
        select: "provider,status,scopes,last_sync_at,last_error,updated_at",
        limit: "1",
      },
    });
    const row = rows?.[0];
    return {
      provider: "oura",
      configured: Boolean(config.ouraClientId && config.ouraClientSecret && config.ouraRedirectUri),
      connected: row?.status === "connected",
      status: row?.status || "not_connected",
      scopes: row?.scopes || [],
      lastSyncAt: row?.last_sync_at || null,
      lastError: row?.last_error || null,
      updatedAt: row?.updated_at || null,
    };
  }

  async function authorize(auth) {
    assertOuraConfigured(config);
    const scope = await workspace.resolve(auth);
    const state = randomBytes(32).toString("hex");
    const now = new Date();
    await supabase.rest("integration_oauth_states_v2", {
      method: "POST",
      auth: "service",
      prefer: "return=minimal",
      body: {
        state,
        provider: "oura",
        owner_user_id: auth.user.id,
        workspace_id: scope.id,
        expires_at: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
        created_at: now.toISOString(),
      },
    });
    const params = new URLSearchParams({
      response_type: "code",
      client_id: config.ouraClientId,
      redirect_uri: config.ouraRedirectUri,
      scope: OURA_SCOPES,
      state,
    });
    return {
      ok: true,
      provider: "oura",
      authorizationUrl: `https://cloud.ouraring.com/oauth/authorize?${params}`,
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
    };
  }

  async function callback(url) {
    assertOuraConfigured(config);
    const state = String(url.searchParams.get("state") || "");
    const code = String(url.searchParams.get("code") || "");
    const oauthError = String(url.searchParams.get("error") || "");
    if (!state) throw new ApiError(400, "oura_state_missing");
    const states = await supabase.rest("integration_oauth_states_v2", {
      auth: "service",
      query: {
        state: `eq.${state}`,
        provider: "eq.oura",
        consumed_at: "is.null",
        expires_at: `gt.${new Date().toISOString()}`,
        select: "*",
        limit: "1",
      },
    });
    const pending = states?.[0];
    if (!pending) throw new ApiError(400, "oura_state_invalid");
    await consumeState(state);
    if (oauthError) {
      await recordConnectionError(pending, {
        code: oauthError,
        message: String(url.searchParams.get("error_description") || oauthError),
      });
      return callbackUrl("error", oauthError);
    }
    if (!code) throw new ApiError(400, "oura_code_missing");
    try {
      const token = await tokenRequest({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.ouraRedirectUri,
      });
      await saveConnection(pending, token);
      return callbackUrl("connected");
    } catch (error) {
      await recordConnectionError(pending, {
        code: error.code || "oura_token_exchange_failed",
        message: error.message,
      });
      return callbackUrl("error", error.code || "oura_token_exchange_failed");
    }
  }

  async function sync(auth, options = {}) {
    assertOuraConfigured(config);
    const scope = await workspace.resolve(auth);
    let connection = await getConnection(auth.user.id, scope.id);
    if (!connection || connection.status !== "connected") {
      throw new ApiError(409, "oura_not_connected");
    }
    connection = await ensureFreshToken(connection);
    return syncConnection(connection, options);
  }

  async function syncConnection(connection, options = {}) {
    const startDate = dateOnly(options.startDate || daysAgo(30));
    const endDate = dateOnly(options.endDate || new Date());
    const summaries = [];
    try {
      for (const collection of OURA_COLLECTIONS) {
        const payload = await ouraGet(collection, connection, { start_date: startDate, end_date: endDate });
        const data = Array.isArray(payload?.data) ? payload.data : [];
        if (data.length) await persistOuraSignals(connection, collection, data);
        summaries.push({ collection, count: data.length });
      }
      const now = new Date().toISOString();
      await supabase.rest("integration_connections_v2", {
        method: "PATCH",
        auth: "service",
        prefer: "return=minimal",
        query: { connection_id: `eq.${connection.connection_id}` },
        body: { last_sync_at: now, last_error: null, updated_at: now },
      });
      return {
        ok: true,
        provider: "oura",
        startDate,
        endDate,
        records: summaries.reduce((sum, item) => sum + item.count, 0),
        collections: summaries,
        syncedAt: now,
      };
    } catch (error) {
      await recordConnectionError(connection, {
        code: error.code || "oura_sync_failed",
        message: error.message,
      });
      throw error;
    }
  }

  async function disconnect(auth) {
    const scope = await workspace.resolve(auth);
    const connection = await getConnection(auth.user.id, scope.id);
    if (!connection) return { ok: true, disconnected: false };
    const token = decrypt(connection.access_token_encrypted);
    if (token) {
      const revoke = new URL("https://api.ouraring.com/oauth/revoke");
      revoke.searchParams.set("access_token", token);
      revoke.searchParams.set("client_id", config.ouraClientId);
      await fetchImpl(revoke, { method: "POST" }).catch(() => {});
    }
    await supabase.rest("integration_connections_v2", {
      method: "DELETE",
      auth: "service",
      prefer: "return=minimal",
      query: {
        connection_id: `eq.${connection.connection_id}`,
        owner_user_id: `eq.${auth.user.id}`,
      },
    });
    return { ok: true, disconnected: true };
  }

  function verifyWebhook(rawBody, headers) {
    if (!config.ouraClientSecret) throw new ApiError(503, "oura_not_configured");
    const signature = String(headers["x-oura-signature"] || "");
    const timestamp = String(headers["x-oura-timestamp"] || "");
    if (!signature || !timestamp) throw new ApiError(401, "oura_webhook_signature_missing");
    const expected = createHmac("sha256", config.ouraClientSecret)
      .update(timestamp)
      .update(rawBody)
      .digest("hex")
      .toUpperCase();
    const received = signature.toUpperCase();
    const left = Buffer.from(expected);
    const right = Buffer.from(received);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new ApiError(401, "oura_webhook_signature_invalid");
    }
    return JSON.parse(rawBody.toString("utf8"));
  }

  async function webhook(rawBody, headers) {
    const payload = verifyWebhook(rawBody, headers);
    const ouraUserId = String(payload.user_id || "");
    if (!ouraUserId) return { ok: true, ignored: true };
    const connections = await supabase.rest("integration_connections_v2", {
      auth: "service",
      query: {
        provider: "eq.oura",
        provider_user_id: `eq.${ouraUserId}`,
        status: "eq.connected",
        select: "*",
      },
    });
    for (const connection of connections || []) {
      await supabase.rest("vibe_jobs_v2", {
        method: "POST",
        auth: "service",
        prefer: "return=minimal",
        body: {
          job_id: randomUUID(),
          owner_user_id: connection.owner_user_id,
          workspace_id: connection.workspace_id,
          job_type: "oura_webhook_sync",
          state: "queued",
          input: payload,
          result: {},
          attempts: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      });
    }
    return { ok: true, queued: (connections || []).length };
  }

  async function processQueued(limit = 5) {
    const rows = await supabase.rest("vibe_jobs_v2", {
      auth: "service",
      query: {
        job_type: "eq.oura_webhook_sync",
        state: "in.(queued,retry_pending)",
        select: "*",
        order: "created_at.asc",
        limit: String(Math.max(1, Math.min(Number(limit || 5), 20))),
      },
    });
    const outcomes = [];
    for (const job of rows || []) {
      const attempts = Number(job.attempts || 0) + 1;
      const claimed = await supabase.rest("vibe_jobs_v2", {
        method: "PATCH",
        auth: "service",
        prefer: "return=representation",
        query: { job_id: `eq.${job.job_id}`, state: `eq.${job.state}` },
        body: { state: "running", attempts, updated_at: new Date().toISOString() },
      });
      if (!claimed?.[0]) continue;
      try {
        let connection = await getConnection(job.owner_user_id, job.workspace_id);
        if (!connection || connection.status !== "connected") {
          throw new ApiError(409, "oura_not_connected");
        }
        connection = await ensureFreshToken(connection);
        const eventTime = Number(job.input?.event_time || 0);
        const endDate = eventTime > 0 ? new Date(eventTime * 1000) : new Date();
        const result = await syncConnection(connection, {
          startDate: new Date(endDate.getTime() - 2 * 86_400_000),
          endDate,
        });
        await finishJob(job.job_id, "complete", { result, error: null });
        outcomes.push({ id: job.job_id, state: "complete" });
      } catch (error) {
        const state = attempts >= 5 ? "needs_attention" : "retry_pending";
        await finishJob(job.job_id, state, {
          error: {
            code: error.code || "oura_webhook_sync_failed",
            message: error.message,
            at: new Date().toISOString(),
          },
        });
        outcomes.push({ id: job.job_id, state });
      }
    }
    return outcomes;
  }

  function startWorker() {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await processQueued();
      } catch (error) {
        console.error("vibe_api_v2_oura_worker_failed", {
          code: error.code || "worker_failed",
          message: error.message,
        });
      } finally {
        running = false;
      }
    };
    const timer = setInterval(tick, 60_000);
    timer.unref?.();
    const initial = setTimeout(tick, 5_000);
    initial.unref?.();
    return () => {
      clearInterval(timer);
      clearTimeout(initial);
    };
  }

  async function verification(url) {
    const token = String(url.searchParams.get("verification_token") || "");
    const challenge = String(url.searchParams.get("challenge") || "");
    if (!config.ouraWebhookSecret || token !== config.ouraWebhookSecret || !challenge) {
      throw new ApiError(401, "oura_webhook_verification_failed");
    }
    return { challenge };
  }

  async function consumeState(state) {
    await supabase.rest("integration_oauth_states_v2", {
      method: "PATCH",
      auth: "service",
      prefer: "return=minimal",
      query: { state: `eq.${state}`, consumed_at: "is.null" },
      body: { consumed_at: new Date().toISOString() },
    });
  }

  async function tokenRequest(values) {
    const body = new URLSearchParams({
      ...values,
      client_id: config.ouraClientId,
      client_secret: config.ouraClientSecret,
    });
    const response = await fetchImpl("https://api.ouraring.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token) {
      throw new ApiError(502, "oura_token_exchange_failed", "Oura no completo la autorizacion.", payload);
    }
    return payload;
  }

  async function saveConnection(pending, token) {
    const info = await ouraFetchWithToken("personal_info", token.access_token);
    const expiresAt = new Date(Date.now() + Number(token.expires_in || 86_400) * 1000).toISOString();
    const now = new Date().toISOString();
    await supabase.rest("integration_connections_v2", {
      method: "POST",
      auth: "service",
      prefer: "resolution=merge-duplicates,return=minimal",
      query: { on_conflict: "owner_user_id,workspace_id,provider" },
      body: {
        connection_id: randomUUID(),
        owner_user_id: pending.owner_user_id,
        workspace_id: pending.workspace_id,
        provider: "oura",
        provider_user_id: String(info?.id || ""),
        status: "connected",
        scopes: String(token.scope || OURA_SCOPES).split(/\s+/).filter(Boolean),
        access_token_encrypted: encrypt(token.access_token),
        refresh_token_encrypted: encrypt(token.refresh_token || ""),
        token_expires_at: expiresAt,
        last_error: null,
        metadata: { tokenType: token.token_type || "bearer" },
        created_at: now,
        updated_at: now,
      },
    });
  }

  async function getConnection(ownerId, workspaceId) {
    const rows = await supabase.rest("integration_connections_v2", {
      auth: "service",
      query: {
        owner_user_id: `eq.${ownerId}`,
        workspace_id: `eq.${workspaceId}`,
        provider: "eq.oura",
        select: "*",
        limit: "1",
      },
    });
    return rows?.[0] || null;
  }

  async function ensureFreshToken(connection) {
    const expiresAt = new Date(connection.token_expires_at || 0).getTime();
    if (expiresAt > Date.now() + 5 * 60 * 1000) return connection;
    const refreshToken = decrypt(connection.refresh_token_encrypted);
    if (!refreshToken) throw new ApiError(401, "oura_refresh_token_missing");
    const token = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
    const patch = {
      access_token_encrypted: encrypt(token.access_token),
      refresh_token_encrypted: encrypt(token.refresh_token || refreshToken),
      token_expires_at: new Date(Date.now() + Number(token.expires_in || 86_400) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
      last_error: null,
    };
    await supabase.rest("integration_connections_v2", {
      method: "PATCH",
      auth: "service",
      prefer: "return=minimal",
      query: { connection_id: `eq.${connection.connection_id}` },
      body: patch,
    });
    return { ...connection, ...patch };
  }

  async function ouraGet(collection, connection, query = {}) {
    return ouraFetchWithToken(collection, decrypt(connection.access_token_encrypted), query);
  }

  async function ouraFetchWithToken(collection, token, query = {}) {
    const url = new URL(`https://api.ouraring.com/v2/usercollection/${collection}`);
    Object.entries(query).forEach(([key, value]) => value && url.searchParams.set(key, value));
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(response.status === 401 ? 401 : 502, `oura_${response.status}`, "Oura no devolvio los datos.", payload);
    }
    return payload;
  }

  async function persistOuraSignals(connection, collection, data) {
    const rows = data.map((item) => {
      const capturedAt = item.timestamp || (item.day ? `${item.day}T12:00:00Z` : new Date().toISOString());
      const id = String(item.id || item.document_id || item.day || createHash("sha256").update(JSON.stringify(item)).digest("hex"));
      return {
        signal_id: `oura:${collection}:${id}`,
        workspace_id: connection.workspace_id,
        owner_user_id: connection.owner_user_id,
        participant_id: null,
        source_type: "oura-api-v2",
        source_device: "Oura Ring",
        source_id: id,
        signal_type: collection === "heartrate" ? "biometric" : `oura_${collection}`,
        captured_at: capturedAt,
        valid_from: capturedAt,
        valid_to: null,
        location: null,
        metrics: extractMetrics(collection, item),
        payload: item,
        metadata: { provider: "oura", collection },
        updated_at: new Date().toISOString(),
      };
    });
    await supabase.rest("context_signals", {
      method: "POST",
      auth: "service",
      prefer: "resolution=merge-duplicates,return=minimal",
      query: { on_conflict: "signal_id" },
      body: rows,
    });
  }

  async function recordConnectionError(connection, error) {
    const ownerId = connection.owner_user_id;
    const workspaceId = connection.workspace_id;
    if (!ownerId || !workspaceId) return;
    await supabase.rest("integration_connections_v2", {
      method: "POST",
      auth: "service",
      prefer: "resolution=merge-duplicates,return=minimal",
      query: { on_conflict: "owner_user_id,workspace_id,provider" },
      body: {
        connection_id: connection.connection_id || randomUUID(),
        owner_user_id: ownerId,
        workspace_id: workspaceId,
        provider: "oura",
        status: connection.status === "connected" ? "connected" : "error",
        scopes: connection.scopes || [],
        access_token_encrypted: connection.access_token_encrypted || "",
        refresh_token_encrypted: connection.refresh_token_encrypted || "",
        last_error: { ...error, at: new Date().toISOString() },
        metadata: connection.metadata || {},
        updated_at: new Date().toISOString(),
      },
    }).catch(() => {});
  }

  async function finishJob(jobId, state, patch) {
    await supabase.rest("vibe_jobs_v2", {
      method: "PATCH",
      auth: "service",
      prefer: "return=minimal",
      query: { job_id: `eq.${jobId}` },
      body: { state, ...patch, updated_at: new Date().toISOString() },
    });
  }

  function encrypt(value) {
    if (!value) return "";
    if (!config.integrationEncryptionKey) throw new ApiError(503, "integration_encryption_key_missing");
    const key = createHash("sha256").update(config.integrationEncryptionKey).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
  }

  function decrypt(value) {
    if (!value) return "";
    if (!config.integrationEncryptionKey) throw new ApiError(503, "integration_encryption_key_missing");
    const [version, ivValue, tagValue, ciphertextValue] = String(value).split(".");
    if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
      throw new ApiError(500, "integration_token_invalid");
    }
    const key = createHash("sha256").update(config.integrationEncryptionKey).digest();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }

  function callbackUrl(statusValue, reason = "") {
    const url = new URL("/apps/vibepwa-next/index.html#account", config.publicBaseUrl);
    url.searchParams.set("integration", "oura");
    url.searchParams.set("status", statusValue);
    if (reason) url.searchParams.set("reason", reason);
    return url.toString();
  }

  return {
    status,
    authorize,
    callback,
    sync,
    disconnect,
    webhook,
    verification,
    processQueued,
    startWorker,
  };
}

function assertOuraConfigured(config) {
  if (!config.ouraClientId || !config.ouraClientSecret || !config.ouraRedirectUri) {
    throw new ApiError(503, "oura_not_configured");
  }
  if (!config.integrationEncryptionKey) throw new ApiError(503, "integration_encryption_key_missing");
}

function extractMetrics(collection, item) {
  const metrics = {};
  const fields = [
    "score",
    "steps",
    "active_calories",
    "total_calories",
    "average_heart_rate",
    "lowest_heart_rate",
    "average_hrv",
    "temperature_deviation",
    "spo2_percentage",
    "bpm",
  ];
  fields.forEach((field) => {
    const value = item?.[field];
    if (Number.isFinite(Number(value))) metrics[field] = Number(value);
  });
  if (collection === "daily_readiness" && Number.isFinite(Number(item.score))) metrics.readiness = Number(item.score);
  if (collection === "daily_sleep" && Number.isFinite(Number(item.score))) metrics.sleepScore = Number(item.score);
  return metrics;
}

function dateOnly(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, "oura_date_invalid");
  return date.toISOString().slice(0, 10);
}

function daysAgo(days) {
  return new Date(Date.now() - days * 86_400_000);
}
