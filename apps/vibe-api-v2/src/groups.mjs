import { randomUUID } from "node:crypto";
import { ApiError } from "./errors.mjs";

export function createGroupService({ supabase, workspace }) {
  async function list(auth) {
    const scope = await workspace.resolve(auth);
    const rows = await supabase.rest("participants", {
      accessToken: auth.accessToken,
      query: {
        workspace_id: `eq.${scope.id}`,
        select: "*",
        order: "display_name.asc",
      },
    });
    return (rows || []).map(map);
  }

  async function save(body, auth, id = "") {
    const scope = await workspace.resolve(auth);
    const displayName = String(body.displayName || body.name || "").trim().slice(0, 160);
    if (!displayName) throw new ApiError(400, "group_name_required");
    const participantId = String(id || body.id || randomUUID()).trim().slice(0, 160);
    const status = body.status === "inactive" ? "inactive" : "active";
    const rows = await supabase.rest("participants", {
      method: "POST",
      accessToken: auth.accessToken,
      prefer: "resolution=merge-duplicates,return=representation",
      query: { on_conflict: "workspace_id,participant_id" },
      body: {
        workspace_id: scope.id,
        participant_id: participantId,
        display_name: displayName,
        email: String(body.email || "").trim().toLowerCase() || null,
        segment: String(body.segment || body.note || "").trim().slice(0, 500) || null,
        status,
        metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
        updated_at: new Date().toISOString(),
      },
    });
    if (!rows?.[0]) throw new ApiError(500, "group_save_failed");
    return map(rows[0]);
  }

  async function deactivate(id, auth) {
    const scope = await workspace.resolve(auth);
    const activeStories = await supabase.rest("experiences", {
      accessToken: auth.accessToken,
      query: {
        workspace_id: `eq.${scope.id}`,
        participant_id: `eq.${id}`,
        select: "experience_id",
        limit: "1",
      },
    });
    const rows = await supabase.rest("participants", {
      method: "PATCH",
      accessToken: auth.accessToken,
      prefer: "return=representation",
      query: {
        workspace_id: `eq.${scope.id}`,
        participant_id: `eq.${id}`,
      },
      body: {
        status: "inactive",
        metadata: {
          hasRetainedStories: Boolean(activeStories?.length),
          deactivatedAt: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      },
    });
    if (!rows?.[0]) throw new ApiError(404, "group_not_found");
    return {
      ...map(rows[0]),
      dataPolicy: activeStories?.length
        ? "retained_and_excluded_from_new_capture"
        : "retained",
    };
  }

  return { list, save, deactivate };
}

function map(row) {
  return {
    id: row.participant_id,
    displayName: row.display_name,
    email: row.email || "",
    segment: row.segment || "",
    status: row.status || "active",
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
