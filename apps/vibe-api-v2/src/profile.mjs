import { ApiError } from "./errors.mjs";

const LANGUAGES = new Set(["es", "en", "fr", "pt"]);

export function createProfileService({ supabase, workspace }) {
  async function get(auth) {
    const rows = await supabase.rest("profiles", {
      accessToken: auth.accessToken,
      query: { user_id: `eq.${auth.user.id}`, select: "*", limit: "1" },
    });
    if (rows?.[0]) return map(rows[0]);
    return create(auth);
  }

  async function create(auth) {
    const language = languageFromMetadata(auth.user);
    const rows = await supabase.rest("profiles", {
      method: "POST",
      accessToken: auth.accessToken,
      prefer: "return=representation",
      body: {
        user_id: auth.user.id,
        email: auth.user.email || null,
        name: auth.user.user_metadata?.name || auth.user.email?.split("@")[0] || "Vibe",
        language,
        timezone: auth.user.user_metadata?.timezone || "America/New_York",
        experience_type: "auto",
        subscription_tier: "production",
        updated_at: new Date().toISOString(),
      },
    });
    if (!rows?.[0]) throw new ApiError(500, "profile_create_failed");
    await workspace.resolve(auth);
    return map(rows[0]);
  }

  async function update(body, auth) {
    const patch = {};
    if (body.name != null) patch.name = String(body.name).trim().slice(0, 160);
    if (body.language != null) {
      const language = String(body.language).slice(0, 2).toLowerCase();
      if (!LANGUAGES.has(language)) throw new ApiError(400, "language_invalid");
      patch.language = language;
    }
    if (body.timezone != null) patch.timezone = String(body.timezone).trim().slice(0, 120);
    if (body.gender != null) patch.gender = String(body.gender).trim().slice(0, 80) || null;
    if (body.birthYear != null) {
      const year = Number(body.birthYear);
      if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear()) {
        throw new ApiError(400, "birth_year_invalid");
      }
      patch.birth_year = year;
    }
    patch.updated_at = new Date().toISOString();
    const rows = await supabase.rest("profiles", {
      method: "PATCH",
      accessToken: auth.accessToken,
      prefer: "return=representation",
      query: { user_id: `eq.${auth.user.id}` },
      body: patch,
    });
    if (!rows?.[0]) throw new ApiError(404, "profile_not_found");
    return map(rows[0]);
  }

  return { get, update };
}

function map(row) {
  return {
    userId: row.user_id,
    email: row.email || "",
    name: row.name || "",
    language: row.language || "es",
    timezone: row.timezone || "America/New_York",
    gender: row.gender || "",
    birthYear: row.birth_year || null,
    experienceType: row.experience_type || "auto",
    subscriptionTier: row.subscription_tier || "production",
  };
}

function languageFromMetadata(user) {
  const language = String(user.user_metadata?.language || "es").slice(0, 2).toLowerCase();
  return LANGUAGES.has(language) ? language : "es";
}
