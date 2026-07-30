import { ApiError } from "./errors.mjs";

export function createAuthService(supabase) {
  async function signIn(body = {}) {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) throw new ApiError(400, "credentials_required");
    const result = await supabase.authSignIn(email, password);
    return sessionPayload(result);
  }

  async function refresh(body = {}) {
    const token = String(body.refreshToken || body.refresh_token || "").trim();
    if (!token) throw new ApiError(400, "refresh_token_required");
    const result = await supabase.authRefresh(token);
    return sessionPayload(result);
  }

  async function requireUser(req) {
    const accessToken = bearer(req.headers.authorization);
    if (!accessToken) throw new ApiError(401, "auth_required", "Inicia sesión para continuar.");
    const user = await supabase.authUser(accessToken);
    if (!user?.id) throw new ApiError(401, "auth_invalid");
    return { user, accessToken };
  }

  return { signIn, refresh, requireUser };
}

function sessionPayload(result = {}) {
  const user = result.user || {};
  if (!result.access_token || !user.id) throw new ApiError(401, "auth_failed");
  return {
    accessToken: result.access_token,
    refreshToken: result.refresh_token || "",
    expiresAt: result.expires_at
      ? new Date(Number(result.expires_at) * 1000).toISOString()
      : null,
    user: {
      id: user.id,
      email: user.email || "",
      name: user.user_metadata?.name || user.user_metadata?.full_name || "",
    },
  };
}

function bearer(value) {
  const match = String(value || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}
