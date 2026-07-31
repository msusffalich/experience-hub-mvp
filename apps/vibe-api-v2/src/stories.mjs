import { ApiError } from "./errors.mjs";

const ACTIVITIES = new Set([
  "Trabajo",
  "Paseo",
  "Aprendizaje",
  "Social",
  "Entretenimiento",
  "Creatividad",
  "Espiritualidad",
  "Salud",
  "Compras",
]);

export function createStoryService({ supabase, workspace, config }) {
  async function list(auth, options = {}) {
    const scope = await workspace.resolve(auth);
    const query = {
      user_id: `eq.${auth.user.id}`,
      select: "*",
      order: "occurred_at.desc",
      limit: String(Math.max(1, Math.min(Number(options.limit || 500), 500))),
    };
    if (options.from) query.occurred_at = `gte.${new Date(options.from).toISOString()}`;
    const rows = await supabase.rest("experiences", { accessToken: auth.accessToken, query });
    if (!rows?.length) return [];
    const ids = rows.map((row) => row.experience_id);
    const inFilter = `in.(${ids.map(postgrestValue).join(",")})`;
    const [events, links, legacyAssets] = await Promise.all([
      supabase.rest("experience_events", {
        accessToken: auth.accessToken,
        query: { experience_id: inFilter, select: "*", order: "event_order.asc" },
      }),
      supabase.rest("story_evidence_links", {
        accessToken: auth.accessToken,
        query: { story_id: inFilter, select: "*" },
      }),
      supabase.rest("assets", {
        accessToken: auth.accessToken,
        query: {
          workspace_id: `eq.${scope.id}`,
          owner_user_id: `eq.${auth.user.id}`,
          experience_id: inFilter,
          select: "*",
          order: "created_at.asc",
        },
      }),
    ]);
    const captureIds = [...new Set((links || []).map((link) => link.capture_id).filter(Boolean))];
    const captures = captureIds.length
      ? await supabase.rest("capture_records", {
        accessToken: auth.accessToken,
        query: {
          capture_id: `in.(${captureIds.map(postgrestValue).join(",")})`,
          owner_user_id: `eq.${auth.user.id}`,
          select: "*",
        },
      })
      : [];
    return rows.map((row) => mapStory(
      row,
      (events || []).filter((event) => event.experience_id === row.experience_id),
      linkedEvidence(row.experience_id, links || [], captures || []),
      (legacyAssets || []).filter((asset) => asset.experience_id === row.experience_id).map(mapLegacyAsset),
    ));
  }

  async function save(body, auth, id = "") {
    const scope = await workspace.resolve(auth);
    const story = normalizeStory({ ...body, id: id || body.id });
    const existing = id ? await getRow(id, auth) : null;
    if (id && !existing) throw new ApiError(404, "story_not_found");
    await supabase.rpc("save_story_v2", {
      p_story: {
        experience_id: story.id,
        workspace_id: scope.id,
        participant_id: story.participantId || "",
        title: story.title,
        category: story.category,
        occurred_at: story.timestamp,
        duration_minutes: story.duration,
        mood: story.mood,
        energy: story.energy,
        location: story.location,
        people: story.people,
        notes: story.notes,
        locale: story.locale,
        attachments: existing?.attachments || [],
        metadata: {
          ...(existing?.metadata || {}),
          ...(story.metadata || {}),
          narrativeStatus: narrativeStatus(story.notes, story.events),
          narrativeOrigin: story.notes ? "human_text" : "pending",
          wellbeing: story.wellbeing,
          placeType: story.placeType || null,
        },
      },
      p_events: story.events.map((event) => ({
        event_id: event.id || crypto.randomUUID(),
        title: String(event.title || "").trim(),
        description: String(event.description || "").trim(),
        narrative_text: String(event.narrativeText || "").trim(),
        occurred_at: event.timestamp || story.timestamp,
        duration_minutes: event.duration || null,
        mood: event.mood || null,
        energy: validEnergy(event.energy),
        metadata: event.metadata || {},
      })),
      p_capture_ids: story.captureIds,
      p_legacy_asset_ids: story.legacyAssetIds,
    }, {
      accessToken: auth.accessToken,
    });
    const saved = (await list(auth)).find((item) => item.id === story.id);
    if (!saved) throw new ApiError(500, "story_save_not_verified");
    return saved;
  }

  async function remove(id, auth) {
    const row = await getRow(id, auth);
    if (!row) throw new ApiError(404, "story_not_found");
    await supabase.rpc("delete_story_v2", {
      p_story_id: id,
    }, {
      accessToken: auth.accessToken,
    });
    const verify = await getRow(id, auth);
    if (verify) throw new ApiError(500, "story_delete_not_verified");
    return { ok: true, id };
  }

  async function adopt(body, auth) {
    const storyId = String(body.experienceId || body.storyId || "").trim();
    const captureIds = unique(body.captureIds || body.assetIds || []);
    if (!storyId || !captureIds.length) throw new ApiError(400, "adoption_selection_required");
    const story = await getRow(storyId, auth);
    if (!story) throw new ApiError(404, "story_not_found");
    const scope = await workspace.resolve(auth);
    const captures = await supabase.rest("capture_records", {
      accessToken: auth.accessToken,
      query: {
        capture_id: `in.(${captureIds.map(postgrestValue).join(",")})`,
        owner_user_id: `eq.${auth.user.id}`,
        workspace_id: `eq.${scope.id}`,
        intent: "eq.evidence",
        select: "capture_id",
      },
    });
    if (captures.length !== captureIds.length) throw new ApiError(409, "adoption_capture_mismatch");
    const now = new Date().toISOString();
    await supabase.rest("story_evidence_links", {
      method: "POST",
      accessToken: auth.accessToken,
      prefer: "resolution=merge-duplicates,return=representation",
      query: { on_conflict: "story_id,capture_id" },
      body: captureIds.map((captureId) => ({
        story_id: storyId,
        capture_id: captureId,
        event_id: body.eventId || null,
        linked_by: auth.user.id,
        linked_at: now,
        metadata: { method: body.method || "story_editor" },
      })),
    });
    const links = await supabase.rest("story_evidence_links", {
      accessToken: auth.accessToken,
      query: {
        story_id: `eq.${storyId}`,
        capture_id: `in.(${captureIds.map(postgrestValue).join(",")})`,
        select: "capture_id",
      },
    });
    if (links.length !== captureIds.length) throw new ApiError(500, "adoption_not_verified");
    return { ok: true, storyId, adopted: captureIds.length };
  }

  async function release(body, auth) {
    const captureIds = unique(body.captureIds || body.assetIds || []);
    if (!captureIds.length) throw new ApiError(400, "release_selection_required");
    await supabase.rest("story_evidence_links", {
      method: "DELETE",
      accessToken: auth.accessToken,
      prefer: "return=minimal",
      query: {
        capture_id: `in.(${captureIds.map(postgrestValue).join(",")})`,
        linked_by: `eq.${auth.user.id}`,
      },
    });
    return { ok: true, released: captureIds.length };
  }

  async function listAssets(auth) {
    const scope = await workspace.resolve(auth);
    const [captures, links, legacy] = await Promise.all([
      supabase.rest("capture_records", {
        accessToken: auth.accessToken,
        query: {
          owner_user_id: `eq.${auth.user.id}`,
          workspace_id: `eq.${scope.id}`,
          intent: "eq.evidence",
          select: "*",
          order: "occurred_at.desc",
          limit: "500",
        },
      }),
      supabase.rest("story_evidence_links", {
        accessToken: auth.accessToken,
        query: { linked_by: `eq.${auth.user.id}`, select: "*" },
      }),
      supabase.rest("assets", {
        accessToken: auth.accessToken,
        query: {
          owner_user_id: `eq.${auth.user.id}`,
          workspace_id: `eq.${scope.id}`,
          select: "*",
          order: "created_at.desc",
          limit: "500",
        },
      }),
    ]);
    const linkMap = new Map((links || []).map((link) => [link.capture_id, link]));
    const modern = (captures || []).map((row) => mapCaptureAsset(row, linkMap.get(row.capture_id)));
    const legacyRows = (legacy || []).map(mapLegacyAsset);
    return dedupe([...modern, ...legacyRows]);
  }

  async function downloadAsset(assetId, auth) {
    const captures = await supabase.rest("capture_records", {
      accessToken: auth.accessToken,
      query: {
        capture_id: `eq.${assetId}`,
        owner_user_id: `eq.${auth.user.id}`,
        select: "capture_id,storage_bucket,storage_path",
        limit: "1",
      },
    });
    let row = captures?.[0];
    if (!row) {
      const assets = await supabase.rest("assets", {
        accessToken: auth.accessToken,
        query: {
          asset_id: `eq.${assetId}`,
          owner_user_id: `eq.${auth.user.id}`,
          select: "asset_id,storage_bucket,storage_path",
          limit: "1",
        },
      });
      row = assets?.[0];
    }
    if (!row) throw new ApiError(404, "asset_not_found");
    if (!row.storage_path) throw new ApiError(409, "asset_binary_unavailable");
    // La propiedad YA quedo verificada arriba (la consulta filtra por
    // owner_user_id), asi que si la firma con el token del usuario no sale
    // —tipicamente porque las politicas RLS de storage.objects no habilitan la
    // lectura al rol authenticated— se reintenta con la clave de servicio.
    // Sin esto, /assets/:id/download devolvia 502 y las miniaturas nunca
    // cargaban: solo se veian los iconos.
    const bucket = row.storage_bucket || config.storageBucket;
    let signed;
    try {
      signed = await supabase.storageSignDownload(bucket, row.storage_path, 900, {
        accessToken: auth.accessToken,
      });
    } catch (error) {
      signed = await supabase.storageSignDownload(bucket, row.storage_path, 900, {
        auth: "service",
      }).catch(() => {
        throw error;
      });
    }
    // `signedUrl` ya viene absolutizado por storageSignDownload. Antes se leia
    // primero `signedURL`, que es el valor CRUDO y relativo de Supabase
    // ("/object/sign/..."); al empezar por "/" se concatenaba tal cual y la URL
    // quedaba sin el prefijo /storage/v1 -> 404 en todas las miniaturas.
    const raw = String(signed.signedUrl || signed.signedURL || signed.url || "");
    return {
      ok: true,
      url: /^https?:\/\//i.test(raw)
        ? raw
        : `${config.supabaseUrl}/storage/v1/${raw.replace(/^\/+(storage\/v1\/)?/, "")}`,
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    };
  }

  async function getRow(id, auth) {
    const rows = await supabase.rest("experiences", {
      accessToken: auth.accessToken,
      query: {
        experience_id: `eq.${id}`,
        user_id: `eq.${auth.user.id}`,
        select: "*",
        limit: "1",
      },
    });
    return rows?.[0] || null;
  }

  return { list, save, remove, adopt, release, listAssets, downloadAsset };
}

function normalizeStory(body = {}) {
  const title = String(body.title || "").trim().slice(0, 240);
  if (!title) throw new ApiError(400, "story_title_required");
  const category = String(body.category || "").trim();
  if (!ACTIVITIES.has(category)) throw new ApiError(400, "story_activity_invalid");
  const timestamp = new Date(body.timestamp || body.occurredAt || Date.now());
  if (Number.isNaN(timestamp.getTime())) throw new ApiError(400, "story_date_invalid");
  const notes = String(body.notes || body.narrative || "").trim().slice(0, 200_000);
  return {
    id: String(body.id || crypto.randomUUID()),
    title,
    category,
    timestamp: timestamp.toISOString(),
    duration: Math.max(0, Math.round(Number(body.duration || 0))),
    mood: String(body.mood || "").trim().slice(0, 100),
    energy: validEnergy(body.energy),
    location: String(body.location || "").trim().slice(0, 500),
    people: String(body.people || "").trim().slice(0, 500),
    notes,
    locale: ["es", "en", "fr", "pt"].includes(body.locale) ? body.locale : "es",
    participantId: String(body.participantId || body.pilotParticipantId || "").trim().slice(0, 160),
    wellbeing: body.wellbeing == null ? null : Number(body.wellbeing),
    placeType: String(body.placeType || "").trim().slice(0, 100),
    events: Array.isArray(body.events) ? body.events : [],
    captureIds: unique(body.captureIds || body.assetIds || []),
    legacyAssetIds: unique(body.legacyAssetIds || []),
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
  };
}

function mapStory(row, events, linked, legacy) {
  const attachments = dedupe([...(linked || []), ...(legacy || [])]);
  return {
    id: row.experience_id,
    title: row.title,
    category: row.category,
    timestamp: row.occurred_at,
    duration: Number(row.duration_minutes || 0),
    mood: row.mood || "",
    energy: validEnergy(row.energy),
    location: row.location || "",
    people: row.people || "",
    notes: row.notes || "",
    locale: row.locale || "es",
    participantId: row.participant_id || "",
    events: (events || []).map((event) => ({
      id: event.event_id,
      title: event.title || "",
      description: event.description || "",
      narrativeText: event.narrative_text || "",
      narrativeStatus: event.narrative_status || "pending",
      timestamp: event.occurred_at || "",
      duration: event.duration_minutes || null,
      mood: event.mood || "",
      energy: validEnergy(event.energy),
      metadata: event.metadata || {},
    })),
    attachments,
    metadata: row.metadata || {},
    updatedAt: row.updated_at,
  };
}

function linkedEvidence(storyId, links, captures) {
  const captureMap = new Map(captures.map((row) => [row.capture_id, row]));
  return links
    .filter((link) => link.story_id === storyId)
    .map((link) => captureMap.get(link.capture_id))
    .filter(Boolean)
    .map((row) => mapCaptureAsset(row, links.find((link) => link.capture_id === row.capture_id)));
}

function mapCaptureAsset(row, link) {
  return {
    id: row.capture_id,
    assetId: row.capture_id,
    captureId: row.capture_id,
    name: row.filename || row.text_content || row.kind,
    filename: row.filename || "",
    kind: row.kind,
    type: row.mime_type || "",
    mimeType: row.mime_type || "",
    size: Number(row.size_bytes || 0),
    sizeBytes: Number(row.size_bytes || 0),
    path: row.storage_path || "",
    storagePath: row.storage_path || "",
    storageBucket: row.storage_bucket || "",
    capturedAt: row.occurred_at,
    uploadedAt: row.updated_at,
    sourceType: row.source?.app || "",
    sourceDevice: row.source?.device || "",
    experienceId: link?.story_id || "",
    eventId: link?.event_id || "",
    adoptionStatus: link ? "adopted" : "inbox",
    targetLayer: row.intent === "context" ? "context" : "evidence",
    previewText: row.text_content || "",
    analysisText: row.text_content || "",
    metadata: row.metadata || {},
  };
}

function mapLegacyAsset(row) {
  return {
    id: row.asset_id,
    assetId: row.asset_id,
    name: row.name,
    filename: row.name,
    kind: row.kind,
    type: row.mime_type,
    mimeType: row.mime_type,
    size: Number(row.size_bytes || 0),
    sizeBytes: Number(row.size_bytes || 0),
    path: row.storage_path || "",
    storagePath: row.storage_path || "",
    storageBucket: row.storage_bucket || "",
    capturedAt: row.captured_at || row.created_at,
    uploadedAt: row.uploaded_at || row.updated_at,
    sourceType: row.source_type || "",
    sourceDevice: row.source_device || "",
    experienceId: row.experience_id || "",
    eventId: row.event_id || "",
    adoptionStatus: row.adoption_status || (row.experience_id ? "adopted" : "inbox"),
    targetLayer: row.target_layer || "evidence",
    previewText: row.preview_text || "",
    analysisText: row.analysis_text || "",
    metadata: row.metadata || {},
  };
}

function narrativeStatus(notes, events) {
  return humanNarrative(notes) || (events || []).some((event) => humanNarrative(event.narrativeText))
    ? "ok"
    : "pending";
}

function humanNarrative(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length < 8 || text.split(" ").length < 2) return false;
  return !/^(narrativa pendiente|sin resumen|image_picker|foto capturada|video capturado)/i.test(text);
}

function validEnergy(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 && number <= 10 ? Math.round(number) : null;
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))];
}

function dedupe(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const id = row.id || row.assetId || row.captureId;
    if (id) map.set(id, { ...map.get(id), ...row, id });
  });
  return [...map.values()];
}

function postgrestValue(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}
