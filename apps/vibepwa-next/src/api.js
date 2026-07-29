const SESSION_KEY = "experience-hub-session";
let refreshPromise = null;

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

export function setSession(session) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

export async function signIn(email, password) {
  const response = await request("/api/mobile/auth/sign-in", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
  const session = {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken || "",
    expiresAt: response.expiresAt || null,
    user: response.user,
  };
  setSession(session);
  return session;
}

export async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const session = getSession();
  if (options.auth !== false && session?.accessToken) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }
  let body = options.body;
  if (body != null && !(body instanceof Blob) && !(body instanceof FormData) && typeof body !== "string") {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }
  const response = await fetch(path, {
    method: options.method || "GET",
    headers,
    body,
    cache: "no-store",
    signal: options.signal,
  });
  if (response.status === 401 && options.auth !== false) {
    if (!options._retried && session?.refreshToken) {
      const refreshed = await refreshSession();
      if (refreshed.ok) return request(path, { ...options, _retried: true });
      if (!refreshed.invalid) throw refreshed.error;
    }
    setSession(null);
    window.dispatchEvent(new CustomEvent("vibe:session-expired"));
  }
  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload.message || payload.detail || payload.error || "";
    } catch {
      detail = await response.text();
    }
    const error = new Error(detail || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  if (options.responseType === "blob") return response.blob();
  if (response.status === 204) return null;
  return response.json();
}

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = performSessionRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function performSessionRefresh() {
  const session = getSession();
  if (!session?.refreshToken) {
    return { ok: false, invalid: true, error: new Error("session_refresh_unavailable") };
  }
  try {
    const response = await fetch("/api/mobile/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        ok: false,
        invalid: response.status === 400 || response.status === 401,
        error: new Error(`session_refresh_${response.status}`),
      };
    }
    const payload = await response.json();
    if (!payload?.accessToken) {
      return { ok: false, invalid: false, error: new Error("session_refresh_missing_token") };
    }
    setSession({
      ...session,
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken || session.refreshToken,
      expiresAt: payload.expiresAt || null,
      user: {
        ...session.user,
        ...(payload.user?.id ? payload.user : {}),
      },
    });
    return { ok: true, invalid: false };
  } catch (error) {
    return { ok: false, invalid: false, error };
  }
}

export async function loadWorkspace() {
  const [health, profile, experiences, assets, captures, agenda, capture] = await Promise.all([
    request("/api/health", { auth: false }),
    request("/api/profile"),
    request("/api/experiences"),
    optionalRequest("/api/assets", []),
    optionalRequest("/api/captures?intent=evidence", []),
    optionalRequest("/api/agenda", []),
    optionalRequest("/api/captures/status", { enabledForUser: false }),
  ]);
  return { health, profile, experiences, assets, captures, agenda, capture };
}

async function optionalRequest(path, fallback) {
  try {
    return await request(path);
  } catch (error) {
    if (error.status === 401) throw error;
    return fallback;
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
