import { readFileSync } from "node:fs";

const app = readFileSync("app.js", "utf8");
const version = app.match(/const APP_VERSION = "([^"]+)";/)?.[1];
if (!version) throw new Error("APP_VERSION missing from app.js.");

const baseUrl = (process.env.VIBE_RELEASE_URL || "").replace(/\/$/, "");
if (!baseUrl) {
  throw new Error("Set VIBE_RELEASE_URL to the deployed app URL before running production output verification.");
}

const REQUEST_TIMEOUT_MS = Number(process.env.VIBE_PRODUCTION_VERIFY_TIMEOUT_MS || 30000);
const RETRIES = Number(process.env.VIBE_PRODUCTION_VERIFY_RETRIES || 3);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function retry(label, fn) {
  let lastError;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < RETRIES) await sleep(1000 * attempt);
    }
  }
  throw new Error(`${label} failed after ${RETRIES} attempt(s): ${lastError?.message || lastError}`);
}

const baseExperience = {
  title: "Prueba de produccion",
  category: "Trabajo",
  location: "Casa",
  people: "Miguel",
  timestamp: "2026-05-30T12:00:00.000Z",
  duration: 30,
  energy: 7,
  notes: "Validacion de endpoints PDF en produccion.",
};

const endpointCases = [
  {
    name: "report",
    path: "/api/report/pdf",
    filename: "reporte-experiencias.pdf",
    body: {
      report: {
        summary: { totalExperiences: 1, topCategory: "Trabajo", averageEnergy: 7, capturedHours: 1 },
        rows: [baseExperience],
        integratedReading: [{ title: "Lectura ejecutiva", evidence: "Produccion responde.", action: "Mantener compuerta.", priority: "Alta" }],
        humanKpis: [{ label: "Confiabilidad", score: 90, detail: "PDF generado en produccion." }],
        categoryBreakdown: [{ category: "Trabajo", count: 1, avgEnergy: 7, minutes: 30 }],
        quality: { score: 90 },
        generatedAt: new Date().toISOString(),
      },
    },
  },
  {
    name: "insights",
    path: "/api/insights/pdf",
    filename: "hallazgos-experiencias.pdf",
    body: {
      participant: "Miguel",
      experiences: 1,
      axes: [{ title: "Trabajo y Productividad", status: "Listo", avgEnergy: 7, assets: 0, question: "Que indica la prueba?", action: "Mantener la ruta.", items: [baseExperience] }],
      actionPlan: [{ title: "Validar flujo", priority: "Alta", horizon: "7 dias", evidence: "PDF en produccion.", why: "Evita falsos cierres.", next: "Usar la misma compuerta antes de publicar." }],
      insights: [{ title: "Salida estable", type: "Recommendation", confidence: 90, description: "El endpoint responde PDF real en produccion.", action: "Mantener prueba." }],
    },
  },
  {
    name: "publication",
    path: "/api/publication/pdf",
    filename: "publicacion-inteligente.pdf",
    body: {
      title: "Publicacion de produccion",
      language: "es",
      html: "<h1>Publicacion de produccion</h1><p>Validacion de PDF ReportLab en Railway.</p>",
      draft: {
        title: "Publicacion de produccion",
        summary: "Prueba de salida PDF.",
        body: "El borrador se transforma en PDF sin requerir navegacion adicional.",
        channel: "PDF/HTML",
        pages: [{ pageNumber: 1, pageType: "cover", title: "Publicacion de produccion", body: "Validacion completa.", mediaIds: [] }],
        media: [],
      },
    },
  },
  {
    name: "manual",
    path: "/api/manual/pdf",
    filename: "manual-vibe.pdf",
    body: {
      html: "<h1>Manual Vibe</h1><section><h2>Verificacion</h2><p>El manual se genera como PDF ReportLab en produccion.</p></section>",
    },
  },
];

await retry("production app.js version", async () => {
  const response = await fetchWithTimeout(`${baseUrl}/app.js?verify=${encodeURIComponent(version)}`);
  if (!response.ok) throw new Error(`app.js responded ${response.status}`);
  const text = await response.text();
  if (!text.includes(`APP_VERSION = "${version}"`)) {
    throw new Error(`production app.js is not serving ${version}`);
  }
});

await retry("production health", async () => {
  const response = await fetchWithTimeout(`${baseUrl}/api/health`);
  if (!response.ok) throw new Error(`health responded ${response.status}`);
  const health = await response.json();
  if (health.status !== "ok") throw new Error(`health status ${health.status}`);
});

for (const item of endpointCases) {
  await retry(`${item.name} PDF`, async () => {
    const response = await fetchWithTimeout(`${baseUrl}${item.path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item.body),
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "";
    const disposition = response.headers.get("content-disposition") || "";
    if (!response.ok) {
      throw new Error(`${item.name} PDF responded ${response.status}: ${buffer.toString("utf8").slice(0, 300)}`);
    }
    if (!contentType.includes("application/pdf")) {
      throw new Error(`${item.name} returned ${contentType || "no content-type"}`);
    }
    if (!disposition.includes(item.filename)) {
      throw new Error(`${item.name} did not advertise ${item.filename}`);
    }
    if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-")) || buffer.length < 4000) {
      throw new Error(`${item.name} returned invalid PDF bytes (${buffer.length})`);
    }
    console.log(`${item.name} production PDF ok (${Math.round(buffer.length / 1024)} KB)`);
  });
}

console.log(`Production output verification passed for ${version} at ${baseUrl}.`);
