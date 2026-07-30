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
    return (rows || []).map((row) => ({
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
    }));
  }

  async function signals(auth, url) {
    const scope = await workspace.resolve(auth);
    const query = {
      workspace_id: `eq.${scope.id}`,
      owner_user_id: `eq.${auth.user.id}`,
      select: "*",
      order: "captured_at.desc",
      limit: String(Math.max(1, Math.min(Number(url?.searchParams?.get("limit") || 500), 500))),
    };
    const type = url?.searchParams?.get("type");
    if (type) query.signal_type = `eq.${type}`;
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
    const biometric = rows.filter((row) => row.signalType === "biometric");
    const metrics = biometric.reduce((accumulator, row) => mergeMetrics(accumulator, row.metrics), {});
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      sourceSignals: rows.length,
      biometricSignals: biometric.length,
      metrics,
      latestLocation: rows.find((row) => row.signalType === "location")?.location || "",
      latestWeather: rows.find((row) => row.signalType === "weather")?.payload || null,
      latestNews: rows.find((row) => row.signalType === "news")?.payload || null,
      energy: energyFromMetrics(metrics),
    };
  }

  return { agenda, signals, summary };
}

function mergeMetrics(target, metrics) {
  const result = { ...target };
  for (const [key, value] of Object.entries(metrics || {})) {
    const number = Number(value);
    if (!Number.isFinite(number)) continue;
    if (!Array.isArray(result[`_${key}`])) result[`_${key}`] = [];
    result[`_${key}`].push(number);
    result[key] = average(result[`_${key}`]);
  }
  return result;
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
