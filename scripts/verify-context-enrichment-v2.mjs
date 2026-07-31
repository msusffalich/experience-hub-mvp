import assert from "node:assert/strict";
import { createContextEnrichmentService } from "../apps/vibe-api-v2/src/context-enrichment.mjs";

const jobs = [];
const briefings = [];
const locationQueries = [];
const signals = [{
  signal_id: "location-1",
  owner_user_id: "user-1",
  workspace_id: "workspace-1",
  signal_type: "location",
  captured_at: "2026-07-30T14:00:00.000Z",
  location: "Winter Garden, Florida, United States",
  payload: { latitude: 28.5653, longitude: -81.5862, city: "Winter Garden", region: "Florida" },
}];

const supabase = {
  async rest(table, options = {}) {
    const method = options.method || "GET";
    if (table === "vibe_jobs_v2") {
      if (method === "GET") {
        if (options.query?.state?.includes("queued")) {
          return jobs.filter((item) => ["queued", "retry_pending"].includes(item.state));
        }
        return jobs.filter((item) => ["queued", "running", "retry_pending"].includes(item.state));
      }
      if (method === "POST") {
        jobs.push(structuredClone(options.body));
        return [structuredClone(options.body)];
      }
      if (method === "PATCH") {
        const id = String(options.query?.job_id || "").replace(/^eq\./, "");
        const job = jobs.find((item) => item.job_id === id);
        if (!job) return [];
        Object.assign(job, structuredClone(options.body));
        return [structuredClone(job)];
      }
    }
    if (table === "context_signals") {
      if (method === "GET") {
        locationQueries.push(options.query || {});
        return signals.filter((item) => item.signal_type === "location").slice(0, 1);
      }
      if (method === "POST") {
        const index = signals.findIndex((item) => item.signal_id === options.body.signal_id);
        if (index >= 0) signals[index] = structuredClone(options.body);
        else signals.push(structuredClone(options.body));
        return null;
      }
    }
    if (table === "daily_briefings") {
      if (method === "GET") return briefings.slice(-1);
      if (method === "POST") {
        briefings.push(structuredClone(options.body));
        return null;
      }
    }
    throw new Error(`Unexpected Supabase operation: ${table} ${method}`);
  },
};

const rss = `<?xml version="1.0"?><rss><channel><item>
  <title>Winter Garden community event</title>
  <link>https://example.test/event</link>
  <pubDate>Thu, 30 Jul 2026 14:00:00 GMT</pubDate>
  <source>Reuters</source>
  <description>Current local information.</description>
</item></channel></rss>`;
const fetchImpl = async (input) => {
  const url = new URL(String(input));
  if (url.hostname === "api.open-meteo.com") {
    return new Response(JSON.stringify({
      current: {
        time: "2026-07-30T14:00",
        temperature_2m: 30,
        apparent_temperature: 33,
        relative_humidity_2m: 68,
        precipitation: 0,
        weather_code: 1,
        wind_speed_10m: 10,
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.hostname === "news.google.com") {
    return new Response(rss, { status: 200, headers: { "content-type": "application/rss+xml" } });
  }
  throw new Error(`Unexpected provider URL: ${url}`);
};

const service = createContextEnrichmentService({
  supabase,
  workspace: { resolve: async () => ({ id: "workspace-1" }) },
  config: { upstreamTimeoutMs: 2_000 },
  fetchImpl,
});
const auth = { user: { id: "user-1" }, accessToken: "token" };
const queued = await service.refresh(auth, { locale: "es", reason: "verification" });
assert.equal(queued.state, "queued");
const result = await service.processQueued();
assert.deepEqual(result, [{ id: queued.id, state: "complete" }]);
assert.equal(jobs[0].state, "complete");
assert.equal(briefings.length, 1);
assert.equal(briefings[0].payload.location.locality, "Winter Garden");
assert.equal(briefings[0].payload.weather.status, "available");
assert.equal(briefings[0].payload.news.items.length, 1);
assert.equal(briefings[0].payload.entertainment.items.length, 1);
assert.equal(signals.filter((item) => ["weather", "news", "entertainment"].includes(item.signal_type)).length, 3);
assert.equal(locationQueries.some((query) => query.owner_user_id === "eq.user-1"), true);
assert.equal(locationQueries.some((query) => query.workspace_id !== undefined), false, "Location lookup must reconcile user-owned context from prior workspaces");

const latest = await service.latest(auth);
assert.equal(latest.status, "available");
assert.equal(latest.payload.location.label, "Winter Garden, Florida, United States");

console.log("Vibe API 2 context enrichment verification passed.");
