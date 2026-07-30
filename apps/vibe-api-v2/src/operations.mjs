import { ApiError } from "./errors.mjs";

export function createOperationsService({ supabase, workspace }) {
  async function create(auth, type, input = {}) {
    const scope = await workspace.resolve(auth);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const rows = await supabase.rest("vibe_jobs_v2", {
      method: "POST",
      accessToken: auth.accessToken,
      prefer: "return=representation",
      body: {
        job_id: id,
        owner_user_id: auth.user.id,
        workspace_id: scope.id,
        job_type: type,
        state: "queued",
        input,
        result: {},
        error: null,
        attempts: 0,
        created_at: now,
        updated_at: now,
      },
    });
    if (!rows?.[0]) throw new ApiError(500, "job_create_failed");
    return map(rows[0]);
  }

  async function list(auth, url) {
    const scope = await workspace.resolve(auth);
    const state = url?.searchParams?.get("state");
    const query = {
      owner_user_id: `eq.${auth.user.id}`,
      workspace_id: `eq.${scope.id}`,
      select: "*",
      order: "created_at.desc",
      limit: "100",
    };
    if (state) query.state = `eq.${state}`;
    const rows = await supabase.rest("vibe_jobs_v2", {
      accessToken: auth.accessToken,
      query,
    });
    return (rows || []).map(map);
  }

  async function get(auth, id) {
    const rows = await supabase.rest("vibe_jobs_v2", {
      accessToken: auth.accessToken,
      query: {
        job_id: `eq.${id}`,
        owner_user_id: `eq.${auth.user.id}`,
        select: "*",
        limit: "1",
      },
    });
    if (!rows?.[0]) throw new ApiError(404, "job_not_found");
    return map(rows[0]);
  }

  async function transition(auth, id, state, patch = {}) {
    const rows = await supabase.rest("vibe_jobs_v2", {
      method: "PATCH",
      accessToken: auth.accessToken,
      prefer: "return=representation",
      query: { job_id: `eq.${id}`, owner_user_id: `eq.${auth.user.id}` },
      body: { ...patch, state, updated_at: new Date().toISOString() },
    });
    if (!rows?.[0]) throw new ApiError(404, "job_not_found");
    return map(rows[0]);
  }

  return { create, list, get, transition };
}

function map(row) {
  return {
    id: row.job_id,
    type: row.job_type,
    state: row.state,
    input: row.input || {},
    result: row.result || {},
    error: row.error || null,
    attempts: Number(row.attempts || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
