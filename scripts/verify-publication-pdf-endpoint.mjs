import { spawn } from "node:child_process";

const PORT = Number(process.env.VERIFY_PUBLICATION_PDF_PORT || 5899);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const START_TIMEOUT_MS = 20000;
const REQUEST_TIMEOUT_MS = 25000;

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

async function waitForHealth(child) {
  const startedAt = Date.now();
  let lastError = "";
  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    if (child.exitCode !== null) {
      throw new Error(`Local server exited before healthcheck. Exit code: ${child.exitCode}. ${lastError}`);
    }
    try {
      const response = await fetchWithTimeout(`${BASE_URL}/api/health`, { cache: "no-store" }, 2500);
      if (response.ok) return;
      lastError = `health ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await sleep(400);
  }
  throw new Error(`Local server did not become healthy on ${BASE_URL}. Last error: ${lastError}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 2500);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

const baseExperience = {
  title: "Prueba de aceptacion",
  category: "Trabajo",
  location: "Casa",
  people: "Miguel",
  timestamp: "2026-05-22T14:20:00.000Z",
  duration: 45,
  energy: 7,
  notes: "Validacion de flujo suave para salidas PDF.",
};

const endpointCases = [
  {
    name: "report",
    path: "/api/report/pdf",
    filename: "reporte-experiencias.pdf",
    body: {
      report: {
        summary: { totalExperiences: 2, topCategory: "Trabajo", averageEnergy: 7, capturedHours: 2 },
        rows: [baseExperience, { ...baseExperience, title: "Revision", category: "Aprendizaje", energy: 8 }],
        integratedReading: [{ title: "Lectura ejecutiva", evidence: "Datos suficientes.", action: "Cerrar prueba.", priority: "Alta" }],
        humanKpis: [{ label: "Confiabilidad", score: 88, detail: "Flujo validado." }],
        categoryBreakdown: [{ category: "Trabajo", count: 1, avgEnergy: 7, minutes: 45 }],
        quality: { score: 88 },
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
      experiences: 2,
      axes: [{ title: "Trabajo y Productividad", status: "Listo", avgEnergy: 7, assets: 1, question: "Que se repite?", action: "Revisar foco.", items: [baseExperience] }],
      actionPlan: [{ title: "Cerrar flujo", priority: "Alta", horizon: "7 dias", evidence: "Prueba automatica", why: "Evita navegacion compleja.", next: "Validar descarga." }],
      insights: [{ title: "Flujo estable", type: "Recommendation", confidence: 90, description: "La salida PDF se genera sin pedir otra sesion.", action: "Mantener compuerta." }],
    },
  },
  {
    name: "publication",
    path: "/api/publication/pdf",
    filename: "publicacion-inteligente.pdf",
    body: {
      title: "Publicacion automatica de aceptacion",
      language: "es",
      html: "<h1>Publicacion automatica de aceptacion</h1><p>Este documento valida que el flujo de Publicaciones genere PDF sin pedir una navegacion adicional.</p>",
      draft: {
        title: "Publicacion automatica de aceptacion",
        format: "memoria",
        style: "editorial",
        channel: "PDF",
        summary: "Validacion del endpoint de PDF de Publicaciones sin Authorization header.",
        body: "La app debe convertir el borrador preparado por el usuario en un PDF ReportLab sin obligarlo a ir a Administracion o iniciar otra sesion.",
        privacy: { level: "privado", note: "Datos sinteticos de prueba." },
        stats: { experiences: 2, media: 2, averageEnergy: 7 },
        pages: [
          { pageNumber: 1, pageType: "cover", layoutTemplate: "cover-typographic", title: "Publicacion automatica de aceptacion", subtitle: "Prueba de flujo suave", body: "Portada generada desde el borrador actual.", mediaIds: [] },
          { pageNumber: 2, pageType: "story", layoutTemplate: "story-feature", title: "Narrativa", body: "El contenido editado debe viajar al PDF final. Esta prueba falla si el servidor responde auth_required, HTML o un cuerpo vacio.", mediaIds: ["media-1"] },
        ],
        media: [
          { id: "media-1", type: "image", name: "imagen-de-prueba.jpg", analyticalText: "Imagen de prueba para composicion editorial." },
          { id: "media-2", type: "audio", name: "audio-de-prueba.webm", transcript: "Transcripcion de prueba para memoria viva." },
        ],
      },
    },
  },
  {
    name: "manual",
    path: "/api/manual/pdf",
    filename: "manual-vibe.pdf",
    body: {
      html: "<h1>Manual Vibe</h1><section><h2>Salidas PDF</h2><p>Reportes, hallazgos, publicaciones y manual generan PDF ReportLab con progreso visible.</p></section>",
    },
  },
];

const child = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(PORT),
    HOST: "127.0.0.1",
    NODE_ENV: "test",
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

let serverOutput = "";
child.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString("utf8");
});
child.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString("utf8");
});

try {
  await waitForHealth(child);
  for (const item of endpointCases) {
    const response = await fetchWithTimeout(`${BASE_URL}${item.path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(item.body),
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "";
    const disposition = response.headers.get("content-disposition") || "";
    if (!response.ok) {
      throw new Error(`${item.name} PDF endpoint returned ${response.status}: ${buffer.toString("utf8").slice(0, 500)}`);
    }
    if (!contentType.includes("application/pdf")) {
      throw new Error(`${item.name} PDF endpoint returned ${contentType || "no content-type"} instead of application/pdf.`);
    }
    if (!disposition.includes(item.filename)) {
      throw new Error(`${item.name} PDF endpoint did not advertise ${item.filename}.`);
    }
    if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-")) || buffer.length < 4000) {
      throw new Error(`${item.name} PDF endpoint returned invalid PDF bytes (${buffer.length}).`);
    }
    console.log(`${item.name} PDF endpoint ok without auth (${Math.round(buffer.length / 1024)} KB)`);
  }
} catch (error) {
  const excerpt = serverOutput.trim().split(/\r?\n/).slice(-12).join("\n");
  throw new Error(`${error.message}${excerpt ? `\nServer excerpt:\n${excerpt}` : ""}`);
} finally {
  await stopServer(child);
}
