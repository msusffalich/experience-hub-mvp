export function createHealthService({ config, supabase, capture }) {
  let cached = null;

  function live() {
    return {
      status: "ok",
      service: "vibe-api-v2",
      version: "2.0.0",
      time: new Date().toISOString(),
    };
  }

  async function ready(force = false) {
    if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
    const checks = {
      configuration: {
        ok: Boolean(config.supabaseUrl && config.publishableKey && config.serviceRoleKey),
        detail: "required_variables",
      },
      database: await databaseCheck(),
      storage: await storageCheck(),
    };
    const ok = Object.values(checks).every((check) => check.ok);
    const value = {
      status: ok ? "ok" : "degraded",
      ready: ok,
      service: "vibe-api-v2",
      version: "2.0.0",
      checks,
      time: new Date().toISOString(),
    };
    cached = { expiresAt: Date.now() + config.healthCacheMs, value };
    return value;
  }

  async function authenticated(auth) {
    const infrastructure = await ready();
    const pipeline = await capture.status(auth, { roundTrip: true });
    const readyValue = infrastructure.ready && pipeline.ready;
    return {
      status: readyValue ? "ok" : "degraded",
      ready: readyValue,
      infrastructure,
      capture: pipeline,
    };
  }

  async function databaseCheck() {
    const tables = [
      ["profiles", "user_id"],
      ["capture_operations", "operation_id"],
      ["capture_records", "capture_id"],
      ["story_evidence_links", "capture_id"],
      ["experience_events", "event_id"],
      ["vibe_jobs_v2", "job_id"],
      ["integration_connections_v2", "connection_id"],
      ["integration_oauth_states_v2", "state"],
      ["agenda_events", "event_id"],
      ["context_signals", "signal_id"],
      ["daily_briefings", "user_id"],
    ];
    const results = await Promise.all(tables.map(async ([table, column]) => {
      try {
        await supabase.rest(table, {
          auth: "service",
          query: { select: column, limit: "1" },
        });
        return { ok: true, table };
      } catch (error) {
        return {
          ok: false,
          detail: error.code || error.message,
          table,
        };
      }
    }));
    const failures = results.filter((result) => !result.ok);
    if (failures.length) {
      return {
        ok: false,
        detail: "v2_schema_incomplete",
        failures,
      };
    }
    return { ok: true, detail: "v2_schema_readable", tables: tables.length };
  }

  async function storageCheck() {
    if (!config.serviceRoleKey) return { ok: false, detail: "service_key_missing" };
    const path = `_health/${crypto.randomUUID()}.txt`;
    const expected = Buffer.from(`vibe-api-v2:${Date.now()}`);
    try {
      await supabase.storagePut(config.storageBucket, path, expected, "text/plain", {
        auth: "service",
      });
      const response = await supabase.storageGet(config.storageBucket, path, {
        auth: "service",
      });
      const actual = Buffer.from(await response.arrayBuffer());
      if (!actual.equals(expected)) throw new Error("storage_roundtrip_mismatch");
      return { ok: true, detail: "write_read_delete_verified" };
    } catch (error) {
      return { ok: false, detail: error.code || error.message };
    } finally {
      await supabase.storageDelete(config.storageBucket, [path], { auth: "service" }).catch(() => {});
    }
  }

  return { live, ready, authenticated };
}
