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

const payload = {
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
      {
        pageNumber: 1,
        pageType: "cover",
        layoutTemplate: "cover-typographic",
        title: "Publicacion automatica de aceptacion",
        subtitle: "Prueba de flujo suave",
        body: "Portada generada desde el borrador actual.",
        mediaIds: [],
      },
      {
        pageNumber: 2,
        pageType: "story",
        layoutTemplate: "story-feature",
        title: "Narrativa",
        body: "El contenido editado debe viajar al PDF final. Esta prueba falla si el servidor responde auth_required, HTML o un cuerpo vacio.",
        mediaIds: ["media-1"],
      },
    ],
    media: [
      { id: "media-1", type: "image", name: "imagen-de-prueba.jpg", analyticalText: "Imagen de prueba para composicion editorial." },
      { id: "media-2", type: "audio", name: "audio-de-prueba.webm", transcript: "Transcripcion de prueba para memoria viva." },
    ],
  },
};

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
  const response = await fetchWithTimeout(`${BASE_URL}/api/publication/pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    throw new Error(`Publication PDF endpoint returned ${response.status}: ${buffer.toString("utf8").slice(0, 500)}`);
  }
  if (!contentType.includes("application/pdf")) {
    throw new Error(`Publication PDF endpoint returned ${contentType || "no content-type"} instead of application/pdf.`);
  }
  if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-")) || buffer.length < 4000) {
    throw new Error(`Publication PDF endpoint returned invalid PDF bytes (${buffer.length}).`);
  }
  console.log(`publication PDF endpoint ok without auth (${Math.round(buffer.length / 1024)} KB)`);
} catch (error) {
  const excerpt = serverOutput.trim().split(/\r?\n/).slice(-12).join("\n");
  throw new Error(`${error.message}${excerpt ? `\nServer excerpt:\n${excerpt}` : ""}`);
} finally {
  await stopServer(child);
}
