import { ApiError } from "./errors.mjs";

export function createSupabaseClient(config, fetchImpl = fetch) {
  async function authSignIn(email, password) {
    return call("/auth/v1/token?grant_type=password", {
      method: "POST",
      auth: "public",
      body: { email, password },
    });
  }

  async function authRefresh(refreshToken) {
    return call("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      auth: "public",
      body: { refresh_token: refreshToken },
    });
  }

  async function authUser(accessToken) {
    return call("/auth/v1/user", { auth: "user", accessToken });
  }

  async function rest(table, options = {}) {
    const query = new URLSearchParams(options.query || {});
    return call(`/rest/v1/${encodeURIComponent(table)}${query.size ? `?${query}` : ""}`, {
      method: options.method || "GET",
      auth: options.auth || "user",
      accessToken: options.accessToken,
      body: options.body,
      headers: {
        Accept: "application/json",
        ...(options.prefer ? { Prefer: options.prefer } : {}),
        ...(options.headers || {}),
      },
    });
  }

  async function rpc(name, body, options = {}) {
    return call(`/rest/v1/rpc/${encodeURIComponent(name)}`, {
      method: "POST",
      auth: options.auth || "user",
      accessToken: options.accessToken,
      body,
      headers: options.headers,
    });
  }

  async function storageSignUpload(bucket, path, options = {}) {
    const result = await call(
      `/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${encodePath(path)}`,
      {
        method: "POST",
        auth: options.auth || "user",
        accessToken: options.accessToken,
        body: {},
      },
    );
    const raw = String(result.signedUrl || result.signedURL || result.url || "");
    const signedUrl = absoluteStorageUrl(config.supabaseUrl, raw);
    const token = String(result.token || safeUrl(signedUrl)?.searchParams.get("token") || "");
    if (!signedUrl || !token) {
      throw new ApiError(502, "storage_upload_authorization_invalid");
    }
    return { signedUrl, token };
  }

  async function storageInfo(bucket, path, options = {}) {
    const response = await callRaw(
      `/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodePath(path)}`,
      {
        method: "GET",
        auth: options.auth || "user",
        accessToken: options.accessToken,
        headers: { Range: "bytes=0-0" },
      },
    );
    const contentRange = response.headers.get("content-range") || "";
    const total = Number(contentRange.split("/")[1] || response.headers.get("content-length") || 0);
    return {
      sizeBytes: Number.isFinite(total) ? total : 0,
      mimeType: String(response.headers.get("content-type") || "").split(";")[0],
      etag: String(response.headers.get("etag") || ""),
    };
  }

  async function storageSignDownload(bucket, path, expiresIn = 900, options = {}) {
    const result = await call(
      `/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodePath(path)}`,
      {
        method: "POST",
        auth: options.auth || "user",
        accessToken: options.accessToken,
        body: { expiresIn },
      },
    );
    const raw = String(result?.signedUrl || result?.signedURL || result?.url || "");
    const signedUrl = absoluteStorageUrl(config.supabaseUrl, raw);
    if (!signedUrl) throw new ApiError(502, "storage_download_authorization_invalid");
    return { ...result, signedUrl };
  }

  async function storagePut(bucket, path, body, contentType, options = {}) {
    return callRaw(
      `/storage/v1/object/${encodeURIComponent(bucket)}/${encodePath(path)}`,
      {
        method: "POST",
        auth: options.auth || "service",
        accessToken: options.accessToken,
        body,
        headers: {
          "Content-Type": contentType || "application/octet-stream",
          "x-upsert": options.upsert ? "true" : "false",
        },
      },
    );
  }

  async function storageGet(bucket, path, options = {}) {
    return callRaw(
      `/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodePath(path)}`,
      {
        method: "GET",
        auth: options.auth || "service",
        accessToken: options.accessToken,
      },
    );
  }

  async function storageDelete(bucket, paths, options = {}) {
    return call("/storage/v1/object/remove", {
      method: "DELETE",
      auth: options.auth || "service",
      accessToken: options.accessToken,
      body: { bucketId: bucket, prefixes: paths },
    });
  }

  async function call(path, options = {}) {
    const response = await callRaw(path, options);
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new ApiError(502, "supabase_invalid_json");
    }
  }

  async function callRaw(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.upstreamTimeoutMs);
    try {
      const headers = new Headers(options.headers || {});
      applyAuthHeaders(headers, options.auth || "user", options.accessToken);
      let body = options.body;
      if (
        body != null &&
        !Buffer.isBuffer(body) &&
        !(body instanceof Uint8Array) &&
        typeof body !== "string"
      ) {
        headers.set("Content-Type", "application/json");
        body = JSON.stringify(body);
      }
      const response = await fetchImpl(`${config.supabaseUrl}${path}`, {
        method: options.method || "GET",
        headers,
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 1200);
        throw new ApiError(
          response.status >= 500 ? 502 : response.status,
          `supabase_${response.status}`,
          "Supabase rechazó la operación.",
          detail,
        );
      }
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  function applyAuthHeaders(headers, mode, accessToken) {
    if (!config.publishableKey) throw new ApiError(503, "supabase_publishable_key_missing");
    headers.set("apikey", mode === "service" ? config.serviceRoleKey : config.publishableKey);
    if (mode === "service") {
      if (!config.serviceRoleKey) throw new ApiError(503, "supabase_service_key_missing");
      // Modern sb_secret_* keys authenticate through apikey and are not JWTs.
      // Legacy service-role JWTs still use Authorization for older projects.
      if (String(config.serviceRoleKey).startsWith("eyJ")) {
        headers.set("Authorization", `Bearer ${config.serviceRoleKey}`);
      } else {
        headers.delete("Authorization");
      }
    } else if (mode === "user") {
      if (!accessToken) throw new ApiError(401, "auth_required");
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
  }

  return {
    authSignIn,
    authRefresh,
    authUser,
    rest,
    rpc,
    storageSignUpload,
    storageInfo,
    storageSignDownload,
    storagePut,
    storageGet,
    storageDelete,
  };
}

function encodePath(path) {
  return String(path || "").split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

function safeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function absoluteStorageUrl(baseUrl, value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/storage/v1/")) return `${baseUrl}${raw}`;
  if (raw.startsWith("/object/") || raw.startsWith("/render/")) {
    return `${baseUrl}/storage/v1${raw}`;
  }
  return `${baseUrl}/storage/v1/${raw.replace(/^\/+/, "")}`;
}
