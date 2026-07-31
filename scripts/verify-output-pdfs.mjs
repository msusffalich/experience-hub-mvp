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
const richContext = JSON.parse(
  fs.readFileSync(path.join("scripts", "fixtures", "rich-output-context.json"), "utf8"),
);

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
    requiredText: ["Contexto que", "Frecuencia cardiaca", "Winter Garden", "Reuters", "Festival de verano", "Impacto contextual"],
    // Centinelas de dato inventado / seccion vacia: si alguno reaparece, el PDF
    // esta mostrando un relleno como si fuera una medicion.
    forbiddenText: [
      "Supabase", "context_signal", "PGRST", "Storage privado", "ReportLab",
      "None/10", "null/10", "undefined",
      "No hay hallazgos suficientes", "No hay indicadores suficientes",
    ],
    validateBounds: true,
    payload: {
      ...structuredClone(richContext),
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
      // Los nombres correctos son los que emite buildReportExportPayload en
      // app.js. Con las claves antiguas (integratedReadings/kpis/categories/
      // quality) el script leia otras y renderizaba "Hallazgos prioritarios",
      // "Indices humanos" y "Balance de areas" TODOS en su fallback vacio, con
      // confianza 0% — y la verificacion pasaba igual. Es decir: la puerta que
      // debia impedir un PDF vacio era la unica que nunca ejercitaba las
      // secciones que pueden salir vacias.
      integratedReading: [
        { title: "Energia y recuperacion", evidence: "Energia media 6.8/10.", action: "Mantener pausas breves y registrar descanso.", priority: "Media" },
      ],
      humanKpis: [{ label: "Confiabilidad", score: 82, detail: "Datos suficientes para lectura ejecutiva." }],
      categoryBreakdown: [{ label: "Trabajo", count: 1 }, { label: "Salud", count: 1 }, { label: "Aprendizaje", count: 1 }],
      dataQuality: { score: 82 },
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
    requiredText: ["Contexto que", "Frecuencia cardiaca", "Winter Garden", "Reuters", "Festival de verano", "Impacto contextual"],
    forbiddenText: ["Supabase", "context_signal", "PGRST", "Storage privado"],
    validateBounds: true,
    payload: {
      ...structuredClone(richContext),
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
    requiredText: ["Contexto que", "Frecuencia cardiaca", "Winter Garden", "Reuters", "Festival de verano", "Impacto contextual"],
    forbiddenText: ["Supabase", "context_signal", "PGRST", "Storage privado", "ReportLab"],
    validateBounds: true,
    payload: {
      ...structuredClone(richContext),
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

const localeExpectations = {
  es: {
    report: "Reporte de experiencias",
    insights: "Hallazgos de experiencias",
    publication: "Historia editada",
    context: "Contexto que",
    date: "27 de julio de 2026",
  },
  en: {
    report: "Experience report",
    insights: "Experience insights",
    publication: "Edited story",
    context: "Context for the period",
    date: "July 27, 2026",
  },
  fr: {
    report: "Rapport",
    insights: "Enseignements",
    publication: "Partie 1",
    context: "Contexte de la",
    date: "27 juillet 2026",
  },
  pt: {
    report: "Resumo executivo",
    insights: "Descobertas",
    publication: "Parte 1",
    context: "Contexto que acompanhou",
    date: "27 de julho de 2026",
  },
};

const internalTerms = ["Supabase", "context_signal", "PGRST", "Storage privado", "ReportLab", "URL firmada"];
const spanishInterfaceTerms = [
  "Proporción por Área de vida",
  "Evolución de energía",
  "Confiabilidad de datos",
  "Radar de ejes humanos",
  "Leyenda: porcentaje",
  "Lectura actual:",
  "Energía media registrada:",
  "Se consideraron",
  "Siguiente paso:",
];
for (const [locale, expected] of Object.entries(localeExpectations)) {
  const shared = {
    ...structuredClone(richContext),
    language: locale,
    generatedAt: "2026-07-27T10:15:00.000Z",
  };
  cases.push(
    {
      name: `report-${locale}`,
      script: "report_pdf_reportlab.py",
      requiredText: [expected.report, expected.context, expected.date],
      forbiddenText: locale === "es" ? internalTerms : [...internalTerms, ...spanishInterfaceTerms],
      forbiddenPatterns: [/\b2026-07-27(?:T|\s)/],
      validateBounds: true,
      payload: {
        ...structuredClone(shared),
        summary: { totalExperiences: 1, topCategory: "Trabajo", averageEnergy: 7, capturedHours: 1 },
        outputScope: { stories: 1, evidence: 1, context: 4 },
        rows: [{ ...baseExperience, date: "2026-07-27T10:00:00.000Z" }],
        dataQuality: { score: 90 },
      },
    },
    {
      name: `insights-${locale}`,
      script: "insights_pdf_reportlab.py",
      requiredText: [expected.insights, expected.date],
      forbiddenText: locale === "es" ? internalTerms : [...internalTerms, ...spanishInterfaceTerms],
      forbiddenPatterns: [/\b2026-07-27(?:T|\s)/],
      validateBounds: true,
      payload: {
        ...structuredClone(shared),
        experiences: 1,
        outputScope: { evidence: 1, context: 4 },
        axes: [{ title: "Trabajo", avgEnergy: 7, items: ["Momento"] }],
        insights: [],
        actionPlan: [],
      },
    },
    {
      name: `publication-${locale}`,
      script: "publication_pdf_reportlab.py",
      requiredText: [expected.publication, expected.date],
      forbiddenText: locale === "es" ? internalTerms : [...internalTerms, ...spanishInterfaceTerms],
      forbiddenPatterns: [/\b2026-07-27(?:T|\s)/],
      validateBounds: true,
      payload: {
        ...structuredClone(shared),
        title: "Vibe",
        html: "<p>Recorded human account for the selected period.</p>",
        draft: {
          title: "Vibe",
          summary: "Recorded human account for the selected period.",
          body: "Recorded human account for the selected period. A second sentence adds narrative detail.",
          purpose: "A clear memory of the selected period.",
          timeline: [{
            title: "Recorded moment",
            date: "2026-07-27T10:00:00.000Z",
            note: "Human account.",
            mediaSummary: [],
          }],
          media: [],
        },
      },
    },
  );
}

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
  if (process.env.VIBE_PDF_REVIEW_DIR) {
    fs.mkdirSync(process.env.VIBE_PDF_REVIEW_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.VIBE_PDF_REVIEW_DIR, `${item.name}.pdf`), output);
  }
  if (item.requiredText?.length || item.forbiddenText?.length || item.validateBounds) {
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
      const comparable = (value) => value
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .replace(/[’‘]/g, "'");
      const comparableText = comparable(text);
      const missing = (item.requiredText || []).filter((required) => !comparableText.includes(comparable(required)));
      if (extracted.status !== 0 || missing.length) {
        throw new Error(`${item.name} PDF is missing required output content: ${missing.join(", ")}.`);
      }
      const forbidden = (item.forbiddenText || []).find((value) => text.includes(value));
      if (forbidden) {
        throw new Error(`${item.name} PDF exposes technical text: ${forbidden}.`);
      }
      const forbiddenPattern = (item.forbiddenPatterns || []).find((pattern) => pattern.test(text));
      if (forbiddenPattern) {
        throw new Error(`${item.name} PDF exposes forbidden text pattern: ${forbiddenPattern}.`);
      }
      if (item.validateBounds) {
        const bounds = spawnSync(python.command, [
          ...python.args,
          "-c",
          [
            "import pdfplumber,sys",
            "bad=[]",
            "with pdfplumber.open(sys.argv[1]) as pdf:",
            "  for page_no,page in enumerate(pdf.pages,1):",
            "    for char in page.chars:",
            "      if char['x0'] < -1 or char['x1'] > page.width + 1 or char['top'] < -1 or char['bottom'] > page.height + 1:",
            "        bad.append((page_no,char.get('text',''),char['x0'],char['x1'],char['top'],char['bottom']))",
            "print(len(bad))",
          ].join("\n"),
          tempPdf,
        ], {
          windowsHide: true,
          maxBuffer: 2 * 1024 * 1024,
          env: { ...process.env, PYTHONPATH: pythonPath },
        });
        if (bounds.status !== 0 || Number(bounds.stdout?.toString("utf8").trim() || -1) !== 0) {
          throw new Error(`${item.name} PDF contains text outside its page bounds.`);
        }
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
  console.log(`${item.name} PDF ok (${Math.round(output.length / 1024)} KB)`);
}
