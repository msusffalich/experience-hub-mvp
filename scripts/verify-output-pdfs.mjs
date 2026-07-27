import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const candidates = process.platform === "win32" ? ["python", "py"] : ["python3", "python"];

function resolvePython() {
  for (const candidate of candidates) {
    const args = candidate === "py" ? ["-3", "--version"] : ["--version"];
    const result = spawnSync(candidate, args, { stdio: "ignore", windowsHide: true });
    if (result.status === 0) return { command: candidate, args: candidate === "py" ? ["-3"] : [] };
  }
  throw new Error("Python is not available for PDF output verification.");
}

const python = resolvePython();
const pythonPath = [path.join(process.cwd(), ".python"), process.env.PYTHONPATH].filter(Boolean).join(path.delimiter);

const baseExperience = {
  title: "Prueba de Software",
  category: "Trabajo",
  location: "Casa",
  people: "Miguel",
  timestamp: "2026-05-22T14:20:00.000Z",
  duration: 45,
  energy: 7,
  notes: "Validacion de flujo completo con captura, activos, reporte y publicacion.",
};

const cases = [
  {
    name: "report",
    script: "report_pdf_reportlab.py",
    payload: {
      summary: {
        totalExperiences: 3,
        topCategory: "Trabajo",
        averageEnergy: 6.8,
        attachmentCount: 4,
      },
      rows: [
        baseExperience,
        { ...baseExperience, title: "Caminata", category: "Salud", energy: 8, timestamp: "2026-05-22T16:00:00.000Z" },
        { ...baseExperience, title: "Lectura", category: "Aprendizaje", energy: 6, timestamp: "2026-05-23T09:00:00.000Z" },
      ],
      integratedReadings: [
        { title: "Energia y recuperacion", evidence: "Energia media 6.8/10.", action: "Mantener pausas breves y registrar descanso.", priority: "Media" },
      ],
      kpis: [{ label: "Confiabilidad", score: 82, detail: "Datos suficientes para lectura ejecutiva." }],
      categories: [{ label: "Trabajo", count: 1 }, { label: "Salud", count: 1 }, { label: "Aprendizaje", count: 1 }],
      quality: { score: 82 },
    },
  },
  {
    name: "report-evidence-inventory",
    script: "report_pdf_reportlab.py",
    requiredText: ["Inventario de evidencia y", "No calcula cobertura ni balance"],
    payload: {
      outputScope: {
        basis: "evidence",
        presentationMode: "evidence_inventory",
        stories: 0,
        evidence: 2,
        context: 1,
      },
      summary: {
        totalExperiences: 0,
        capturedHours: 0,
        averageEnergy: null,
        topCategory: "",
      },
      evidenceInventory: {
        evidence: 2,
        context: 1,
        readable: 1,
        measurements: {
          records: 2,
          hasMeasurements: true,
          metrics: { heartAvg: 68, steps: 4520, sleepMinutes: 420, activeEnergy: 310 },
        },
      },
      multimodalEvidence: [
        { name: "foto-playa.jpg", kind: "image", capturedAt: "2026-07-27T10:00:00.000Z", analyticalText: "Foto disponible para revisar." },
        { name: "nota-de-voz.m4a", kind: "audio", capturedAt: "2026-07-27T10:05:00.000Z", manualNote: "Nota de voz disponible." },
      ],
      contextEvidence: [
        { name: "salud.csv", kind: "biometric", capturedAt: "2026-07-27T10:10:00.000Z" },
      ],
      rows: [],
      dataQuality: { score: 0 },
    },
  },
  {
    name: "insights",
    script: "insights_pdf_reportlab.py",
    payload: {
      participant: "Miguel",
      experiences: 3,
      axes: [
        { name: "Salud y Bienestar", avgEnergy: 8, items: ["Caminata"] },
        { name: "Trabajo y Productividad", avgEnergy: 7, items: ["Prueba de Software"] },
        { name: "Aprendizaje y Crecimiento", avgEnergy: 6, items: ["Lectura"] },
      ],
      insights: [
        { title: "Ritmo sostenible", type: "Diagnostico", confidence: 80, description: "La energia mejora cuando hay pausas y movimiento.", action: "Reservar un bloque corto de recuperacion despues de trabajo intenso." },
      ],
    },
  },
  {
    name: "insights-signal-inventory",
    script: "insights_pdf_reportlab.py",
    requiredText: ["mediciones", "No calcula ejes"],
    payload: {
      experiences: 0,
      outputScope: { basis: "evidence", presentationMode: "signal_inventory", evidence: 2, context: 1 },
      evidenceInventory: {
        evidence: 2,
        context: 1,
        readable: 1,
        measurements: { records: 2, hasMeasurements: true, metrics: { heartAvg: 68, steps: 4520, sleepMinutes: 420, activeEnergy: 310 } },
      },
      evidence: [
        { name: "foto-playa.jpg", kind: "image", capturedAt: "2026-07-27T10:00:00.000Z", analyticalText: "Foto disponible para revisar." },
        { name: "nota-de-voz.m4a", kind: "audio", capturedAt: "2026-07-27T10:05:00.000Z" },
      ],
      contextEvidence: [{ name: "salud.csv", kind: "biometric", capturedAt: "2026-07-27T10:10:00.000Z" }],
    },
  },
  {
    name: "publication",
    script: "publication_pdf_reportlab.py",
    payload: {
      title: "Memoria breve de la semana",
      language: "es",
      html: "<h1>Memoria breve de la semana</h1><p>Una seleccion de momentos, aprendizajes y evidencia para compartir.</p>",
      draft: {
        title: "Memoria breve de la semana",
        format: "memoria",
        channel: "WhatsApp",
        body: "Esta semana combinó trabajo, caminata y aprendizaje. La lectura principal es mantener energia sin perder claridad.",
        highlights: [
          { title: "Prueba de Software", category: "Trabajo", note: "Validacion del flujo completo." },
          { title: "Caminata", category: "Salud", note: "Momento de recuperacion." },
        ],
        media: [
          { type: "document", name: "nota.txt", analyticalText: "Resumen en lenguaje claro disponible." },
          { type: "audio", name: "audio.webm", transcript: "Nota de voz transcrita." },
        ],
      },
    },
  },
  {
    name: "manual",
    script: "manual_pdf_reportlab.py",
    payload: {
      version: "verify-output-pdfs",
      html: `
        <h1>Manual Vibe</h1>
        <section><h2>Captura</h2><p>Registra experiencias, eventos y activos con confirmacion clara.</p><ul><li>Guardar</li><li>Revisar en Libreria</li></ul></section>
        <section><h2>Reportes</h2><p>Genera PDFs editados con ReportLab y filtros por fecha o grupo.</p></section>
        <section><h2>Vibeapp</h2><p>La app nativa complementa la PWA para camara, audio, ubicacion y cola offline.</p></section>
      `,
    },
  },
];

for (const item of cases) {
  const result = spawnSync(python.command, [...python.args, path.join("scripts", item.script)], {
    input: JSON.stringify(item.payload),
    windowsHide: true,
    maxBuffer: 15 * 1024 * 1024,
    env: { ...process.env, PYTHONPATH: pythonPath },
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.toString("utf8") || "";
    throw new Error(`${item.name} PDF failed: ${stderr || `exit ${result.status}`}`);
  }
  const output = result.stdout;
  if (!output.subarray(0, 5).equals(Buffer.from("%PDF-")) || output.length < 4000) {
    throw new Error(`${item.name} PDF output is invalid or too small (${output.length} bytes).`);
  }
  if (item.requiredText?.length) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-pdf-"));
    const tempPdf = path.join(tempDir, `${item.name}.pdf`);
    try {
      fs.writeFileSync(tempPdf, output);
      const extracted = spawnSync(python.command, [...python.args, "-c", "import sys; from pypdf import PdfReader; print('\\n'.join(page.extract_text() or '' for page in PdfReader(sys.argv[1]).pages))", tempPdf], {
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, PYTHONPATH: pythonPath },
      });
      const text = extracted.stdout?.toString("utf8") || "";
      if (extracted.status !== 0 || item.requiredText.some((required) => !text.includes(required))) {
        throw new Error(`${item.name} PDF is missing its required inventory content.`);
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
  console.log(`${item.name} PDF ok (${Math.round(output.length / 1024)} KB)`);
}
