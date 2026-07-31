import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const port = Number(process.env.PORT || 8770);
const now = new Date("2026-07-30T16:00:00.000Z").toISOString();

const fixtures = {
  "/api/v2/health": { ok: true, status: "ok", version: "2.0.0", database: { ok: true } },
  "/api/v2/profile": {
    userId: "qa-user",
    email: "miguel@example.test",
    name: "Miguel",
    language: "es",
    timezone: "America/New_York",
  },
  "/api/v2/groups": [
    { id: "family", displayName: "Familia", segment: "Grupo familiar", status: "active" },
  ],
  "/api/v2/experiences": [
    {
      id: "story-1",
      title: "Tarde en Winter Garden",
      notes: "Paseamos por el centro y disfrutamos una tarde tranquila en familia.",
      category: "Social",
      participantId: "family",
      timestamp: "2026-07-29T21:00:00.000Z",
      location: "Winter Garden, Florida",
      energy: 8,
      metadata: { narrativeStatus: "ok" },
      events: [{ id: "event-1", title: "Paseo por el centro", narrativeText: "Conversamos y recorrimos la zona histórica." }],
    },
    {
      id: "story-2",
      title: "Revisión del proyecto",
      notes: "Revisé los avances del ecosistema y ordené los próximos acuerdos.",
      category: "Trabajo",
      participantId: "",
      timestamp: "2026-07-30T13:00:00.000Z",
      location: "Winter Garden, Florida",
      energy: null,
      metadata: { narrativeStatus: "ok" },
      events: [],
    },
  ],
  "/api/v2/assets": [
    {
      id: "asset-1",
      captureId: "capture-1",
      experienceId: "story-1",
      participantId: "family",
      filename: "winter-garden.jpg",
      title: "Foto del paseo",
      kind: "image",
      mimeType: "image/jpeg",
      sizeBytes: 1240000,
      capturedAt: "2026-07-29T21:30:00.000Z",
      status: "ready",
      sourceType: "vibeapp",
    },
    {
      id: "asset-2",
      captureId: "capture-2",
      experienceId: "",
      participantId: "",
      filename: "nota-de-voz.m4a",
      title: "Nota de voz",
      kind: "audio",
      mimeType: "audio/mp4",
      sizeBytes: 240000,
      capturedAt: "2026-07-30T15:20:00.000Z",
      status: "ready",
      sourceType: "vibeapp",
    },
  ],
  "/api/v2/captures?intent=evidence": [],
  "/api/v2/agenda": [
    {
      id: "agenda-1",
      title: "Reunión de seguimiento",
      description: "Revisar avances y decisiones.",
      startAt: "2026-07-31T14:00:00.000Z",
      endAt: "2026-07-31T15:00:00.000Z",
      location: "Winter Garden",
      participants: "Miguel, equipo",
      priority: "normal",
      status: "Planificado",
      participantId: "",
    },
  ],
  "/api/v2/captures/status": { ok: true, queued: 0, processing: 0, failed: 0 },
  "/api/v2/context/summary": {
    ok: true,
    generatedAt: now,
    sourceSignals: 12,
    biometricSignals: 5,
    metrics: {
      heartAvg: 68,
      steps: 7420,
      sleepMinutes: 438,
      activeEnergy: 510,
    },
    latestLocation: "Winter Garden, Florida, USA",
    latestWeather: {
      status: "available",
      temperatureC: 29,
      apparentC: 31,
      humidity: 68,
      windKph: 9,
      precipitationMm: 0,
      description: "Cálido y sin lluvia relevante.",
      source: "Open-Meteo",
    },
    latestNews: {
      status: "available",
      items: [
        { title: "Florida anuncia nuevas inversiones en infraestructura", source: "Reuters", publishedAt: now },
      ],
    },
    latestEntertainment: {
      status: "available",
      items: [
        { title: "Concierto y actividades culturales en Orlando", source: "Orlando Weekly", publishedAt: now },
      ],
    },
    energy: 7.8,
  },
  "/api/v2/context/signals": [],
  "/api/v2/context/briefing": {
    ok: true,
    generatedAt: now,
    location: { locality: "Winter Garden", region: "Florida", country: "USA" },
    weather: {
      status: "available",
      temperatureC: 29,
      apparentC: 31,
      humidity: 68,
      windKph: 9,
      precipitationMm: 0,
      description: "Cálido y sin lluvia relevante.",
      source: "Open-Meteo",
    },
    news: {
      status: "available",
      items: [
        { title: "Florida anuncia nuevas inversiones en infraestructura", source: "Reuters", publishedAt: now },
      ],
    },
    entertainment: {
      status: "available",
      items: [
        { title: "Concierto y actividades culturales en Orlando", source: "Orlando Weekly", publishedAt: now },
      ],
    },
    impact: { score: 2, level: "low", summary: "El contexto no muestra alertas relevantes para el período." },
  },
  "/api/v2/integrations/oura/status": { connected: true, lastSyncAt: now, status: "ready" },
};

createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  if (url.pathname === "/api/v2/auth/sign-in" && request.method === "POST") {
    return json(response, {
      accessToken: "qa-token",
      refreshToken: "qa-refresh",
      user: { id: "qa-user", email: "miguel@example.test" },
    });
  }
  if (url.pathname === "/api/v2/auth/refresh" && request.method === "POST") {
    return json(response, { accessToken: "qa-token", refreshToken: "qa-refresh" });
  }
  const fixtureKey = url.pathname === "/api/v2/captures" ? `${url.pathname}${url.search}` : url.pathname;
  if (request.method === "GET" && Object.hasOwn(fixtures, fixtureKey)) {
    return json(response, fixtures[fixtureKey]);
  }
  if (url.pathname.startsWith("/api/v2/")) {
    return json(response, { ok: true, id: "qa-result", queued: true }, 200);
  }

  const relative = url.pathname === "/" ? "apps/vibepwa-next/index.html" : url.pathname.replace(/^\/+/, "");
  const safePath = normalize(join(root, relative));
  if (!safePath.startsWith(normalize(root))) return json(response, { error: "not_found" }, 404);
  try {
    const info = await stat(safePath);
    if (!info.isFile()) throw new Error("not_file");
    response.writeHead(200, {
      "Content-Type": contentType(safePath),
      "Cache-Control": "no-store",
    });
    createReadStream(safePath).pipe(response);
  } catch {
    json(response, { error: "not_found" }, 404);
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`VibePWA2 fixture server: http://127.0.0.1:${port}/apps/vibepwa-next/index.html`);
});

function json(response, payload, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

function contentType(file) {
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
  }[extname(file).toLowerCase()] || "application/octet-stream";
}
