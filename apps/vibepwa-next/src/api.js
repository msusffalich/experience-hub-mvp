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
  const response = await request("/api/v2/auth/sign-in", {
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
    const response = await fetch("/api/v2/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        ok: false,
        invalid: response.status === 400 || response.status === 401 || response.status === 403,
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

export async function loadWorkspace(previous = {}) {
  const modules = [
    ["health", "/api/v2/health", null],
    ["profile", "/api/v2/profile", {}],
    ["groups", "/api/v2/groups", []],
    ["experiences", "/api/v2/experiences", []],
    ["assets", "/api/v2/assets", []],
    ["captures", "/api/v2/captures?intent=evidence", []],
    ["agenda", "/api/v2/agenda", []],
    ["capture", "/api/v2/captures/status", null],
    ["context", "/api/v2/context/summary", null],
    ["contextSignals", "/api/v2/context/signals", []],
    ["briefing", "/api/v2/context/briefing", null],
    ["oura", "/api/v2/integrations/oura/status", null],
  ];
  const settled = await Promise.allSettled(modules.map(([, path]) => request(path)));
  const result = { issues: [] };
  settled.forEach((outcome, index) => {
    const [name, , fallback] = modules[index];
    if (outcome.status === "fulfilled") {
      result[name] = outcome.value;
      return;
    }
    result[name] = previous[name] ?? fallback;
    result.issues.push({
      module: name,
      status: Number(outcome.reason?.status || 0),
      message: String(outcome.reason?.message || "module_unavailable"),
    });
  });
  return result;
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
