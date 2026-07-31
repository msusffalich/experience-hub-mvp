import { ApiError } from "./errors.mjs";

export function createWorkspaceService(supabase) {
  async function resolve(auth) {
    const owned = await supabase.rest("workspaces", {
      accessToken: auth.accessToken,
      query: {
        owner_user_id: `eq.${auth.user.id}`,
        select: "workspace_id,created_at",
        order: "created_at.asc",
        limit: "1",
      },
    });
    if (owned?.[0]?.workspace_id) {
      const ownedMembership = await supabase.rest("workspace_members", {
        accessToken: auth.accessToken,
        query: {
          workspace_id: `eq.${owned[0].workspace_id}`,
          user_id: `eq.${auth.user.id}`,
          select: "workspace_id,role",
          limit: "1",
        },
      });
      if (ownedMembership?.[0]) {
        return {
          id: owned[0].workspace_id,
          role: ownedMembership[0].role || "owner",
        };
      }
    }
    const memberships = await supabase.rest("workspace_members", {
      accessToken: auth.accessToken,
      query: {
        user_id: `eq.${auth.user.id}`,
        select: "workspace_id,role,created_at",
        order: "created_at.asc",
        limit: "1",
      },
    });
    if (memberships?.[0]?.workspace_id) {
      return {
        id: memberships[0].workspace_id,
        role: memberships[0].role || "member",
      };
    }
    return provision(auth);
  }

  async function provision(auth) {
    const workspaceId = crypto.randomUUID();
    const now = new Date().toISOString();
    await supabase.rest("workspaces", {
      method: "POST",
      auth: "service",
      prefer: "return=minimal",
      body: {
        workspace_id: workspaceId,
        name: `${auth.user.email || "Vibe"} workspace`,
        owner_user_id: auth.user.id,
        created_at: now,
        updated_at: now,
      },
    });
    await supabase.rest("workspace_members", {
      method: "POST",
      auth: "service",
      prefer: "return=minimal",
      body: {
        workspace_id: workspaceId,
        user_id: auth.user.id,
        role: "owner",
        created_at: now,
      },
    });
    const verify = await supabase.rest("workspace_members", {
      accessToken: auth.accessToken,
      query: {
        workspace_id: `eq.${workspaceId}`,
        user_id: `eq.${auth.user.id}`,
        select: "workspace_id,role",
      },
    });
    if (!verify?.length) throw new ApiError(500, "workspace_provision_failed");
    return { id: workspaceId, role: "owner" };
  }

  async function assertMember(auth, workspaceId) {
    const memberships = await supabase.rest("workspace_members", {
      accessToken: auth.accessToken,
      query: {
        workspace_id: `eq.${workspaceId}`,
        user_id: `eq.${auth.user.id}`,
        select: "workspace_id,role",
        limit: "1",
      },
    });
    if (!memberships?.length) throw new ApiError(403, "workspace_forbidden");
    return memberships[0];
  }

  return { resolve, assertMember };
}
