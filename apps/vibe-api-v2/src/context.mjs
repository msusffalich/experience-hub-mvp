import { randomUUID } from "node:crypto";
import { ApiError } from "./errors.mjs";

export function createContextService({ supabase, workspace }) {
  async function agenda(auth, url) {
    const query = {
      user_id: `eq.${auth.user.id}`,
      select: "*",
      order: "start_at.asc",
      limit: "500",
    };
    const from = url?.searchParams?.get("from");
    const to = url?.searchParams?.get("to");
    if (from) query.start_at = `gte.${new Date(from).toISOString()}`;
    if (to) query.end_at = `lte.${new Date(to).toISOString()}`;
    const rows = await supabase.rest("agenda_events", {
      accessToken: auth.accessToken,
      query,
    });
    return (rows || []).map(mapAgendaRow);
  }

  async function saveAgenda(body, auth, id = "") {
    const title = clean(body.title, 220);
    if (!title) throw new ApiError(400, "agenda_title_required");
    const startAt = validDate(body.startAt);
    const endAt = validDate(body.endAt || body.startAt);
    if (!startAt || !endAt) throw new ApiError(400, "agenda_date_required");
    if (new Date(endAt).getTime() < new Date(startAt).getTime()) {
      throw new ApiError(400, "agenda_end_before_start");
    }

    const eventId = clean(id || body.id || randomUUID(), 180);
    const row = {
      event_id: eventId,
      user_id: auth.user.id,
      participant_id: clean(body.participantId, 180) || null,
      title,
      type: clean(body.type || "Personal", 80),
      description: clean(body.description, 2000) || null,
      start_at: startAt,
      end_at: endAt,
      location: clean(body.location, 500) || null,
      participants: clean(body.participants, 1000) || null,
      priority: ["low", "normal", "high"].includes(body.priority) ? body.priority : "normal",
      status: clean(body.status || "Planificado", 80),
      reminders: clean(body.reminders, 500) || null,
      source_type: clean(body.sourceType || "vibepwa", 80),
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
      updated_at: new Date().toISOString(),
    };

    let rows;
    if (id) {
      rows = await supabase.rest("agenda_events", {
        method: "PATCH",
        accessToken: auth.accessToken,
        prefer: "return=representation",
        query: {
          event_id: `eq.${eventId}`,
          user_id: `eq.${auth.user.id}`,
        },
        body: row,
      });
      if (!rows?.[0]) throw new ApiError(404, "agenda_event_not_found");
    } else {
      rows = await supabase.rest("agenda_events", {
        method: "POST",
        accessToken: auth.accessToken,
        prefer: "return=representation",
        body: row,
      });
      if (!rows?.[0]) throw new ApiError(500, "agenda_event_save_failed");
    }
    return mapAgendaRow(rows[0]);
  }

  async function removeAgenda(id, auth) {
    const rows = await supabase.rest("agenda_events", {
      method: "DELETE",
      accessToken: auth.accessToken,
      prefer: "return=representation",
      query: {
        event_id: `eq.${clean(id, 180)}`,
        user_id: `eq.${auth.user.id}`,
      },
    });
    if (!rows?.[0]) throw new ApiError(404, "agenda_event_not_found");
    return { ok: true, id: rows[0].event_id };
  }

  async function signals(auth, url) {
    await workspace.resolve(auth);
    const query = {
      owner_user_id: `eq.${auth.user.id}`,
      select: "*",
      order: "captured_at.desc",
      limit: String(Math.max(1, Math.min(Number(url?.searchParams?.get("limit") || 500), 500))),
    };
    const type = url?.searchParams?.get("type");
    if (type) query.signal_type = `eq.${type}`;
    const from = url?.searchParams?.get("from");
    const to = url?.searchParams?.get("to");
    if (from) query.captured_at = `gte.${new Date(from).toISOString()}`;
    if (to) query.captured_at = `lte.${new Date(to).toISOString()}`;
    const rows = await supabase.rest("context_signals", {
      accessToken: auth.accessToken,
      query,
    });
    return (rows || []).map((row) => ({
      id: row.signal_id,
      participantId: row.participant_id || "",
      sourceType: row.source_type,
      sourceDevice: row.source_device || "",
      signalType: row.signal_type,
      capturedAt: row.captured_at,
      validFrom: row.valid_from,
      validTo: row.valid_to,
      location: row.location || "",
      metrics: row.metrics || {},
      payload: row.payload || {},
      metadata: row.metadata || {},
    }));
  }

  async function summary(auth, url) {
    const rows = await signals(auth, url);
    const measured = rows.filter((row) => (
      row.signalType === "biometric"
      || String(row.signalType || "").startsWith("oura_")
    ));
    const metrics = measured.reduce((accumulator, row) => mergeMetrics(accumulator, row.metrics), {});
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      sourceSignals: rows.length,
      biometricSignals: measured.length,
      metrics,
      latestLocation: rows.find((row) => row.signalType === "location")?.location || "",
      latestWeather: rows.find((row) => row.signalType === "weather")?.payload || null,
      latestNews: rows.find((row) => row.signalType === "news")?.payload || null,
      latestEntertainment: rows.find((row) => row.signalType === "entertainment")?.payload || null,
      energy: energyFromMetrics(metrics),
    };
  }

  return { agenda, saveAgenda, removeAgenda, signals, summary };
}

function mapAgendaRow(row) {
  return {
    id: row.event_id,
    title: row.title,
    type: row.type,
    description: row.description || "",
    startAt: row.start_at,
    endAt: row.end_at,
    location: row.location || "",
    participants: row.participants || "",
    priority: row.priority || "normal",
    status: row.status || "Planificado",
    participantId: row.participant_id || "",
    sourceType: row.source_type || "",
    metadata: row.metadata || {},
  };
}

function validDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

// Métricas acumulativas: se suman entre señales en vez de promediarse.
// El resto (pulso, readiness, sleepScore…) sigue promediándose.
const CUMULATIVE_METRICS = new Set([
  "steps",
  "activeEnergy",
  "active_calories",
  "activeCalories",
  "distance",
  "sleepHours",
  "sleep_hours",
]);

function mergeMetrics(target, metrics) {
  const result = { ...target };
  for (const [key, value] of Object.entries(metrics || {})) {
    const number = Number(value);
    if (!Number.isFinite(number)) continue;
    if (!Array.isArray(result[`_${key}`])) result[`_${key}`] = [];
    result[`_${key}`].push(number);
    result[key] = CUMULATIVE_METRICS.has(key)
      ? Number(sum(result[`_${key}`]).toFixed(1))
      : average(result[`_${key}`]);
  }
  return result;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function average(values) {
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
}

function energyFromMetrics(metrics) {
  const candidates = [];
  if (Number.isFinite(Number(metrics.readiness))) candidates.push(Number(metrics.readiness) / 10);
  if (Number.isFinite(Number(metrics.sleepScore))) candidates.push(Number(metrics.sleepScore) / 10);
  if (Number.isFinite(Number(metrics.steps))) candidates.push(Math.min(10, Number(metrics.steps) / 1000));
  if (Number.isFinite(Number(metrics.activeEnergy))) candidates.push(Math.min(10, Number(metrics.activeEnergy) / 60));
  if (Number.isFinite(Number(metrics.active_calories))) candidates.push(Math.min(10, Number(metrics.active_calories) / 60));
  return candidates.length ? Number(average(candidates).toFixed(1)) : null;
}
