import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const serverSource = await readFile(path.join(root, "server.js"), "utf8");
const indexSource = await readFile(path.join(root, "index.html"), "utf8");
const docs = (await readdir(path.join(root, "docs"), { withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right));

const routes = collectMatches(
  serverSource,
  /url\.pathname\s*(?:===|startsWith\()\s*["'](\/api\/[^"']+)["']/g,
  (match, line) => ({ path: match[1], line }),
);
const views = collectMatches(
  indexSource,
  /data-view=["']([^"']+)["']/g,
  (match, line) => ({ id: match[1], line }),
);
const buttons = collectMatches(
  indexSource,
  /<button\b[^>]*\bid=["']([^"']+)["'][^>]*>([\s\S]*?)<\/button>/g,
  (match, line) => ({
    id: match[1],
    line,
    label: stripHtml(match[2]),
  }),
);
const writers = collectMatches(
  serverSource,
  /(?:async\s+)?function\s+((?:upsert|save|write|sync|reconcile|ingest|receive|commit)[A-Za-z0-9_]*)\s*\(/g,
  (match, line) => ({ name: match[1], line }),
);

const uniqueRoutes = uniqueBy(routes, (item) => item.path);
const uniqueViews = uniqueBy(views, (item) => item.id);
const uniqueButtons = uniqueBy(buttons, (item) => item.id);
const uniqueWriters = uniqueBy(writers, (item) => item.name);
const canonicalDocs = docs.filter((name) => isCanonicalDocument(name));
const historicalDocs = docs.filter((name) => !isCanonicalDocument(name));

const markdown = [
  "# Inventario de reestructuracion de VibePWA",
  "",
  "Generado por `npm run audit:restructure`. Este documento no decide que se borra; identifica la superficie actual para revisar cada retiro con pruebas.",
  "",
  "## Resumen",
  "",
  `- Rutas API detectadas: ${uniqueRoutes.length}.`,
  `- Vistas de navegacion detectadas: ${uniqueViews.length}.`,
  `- Botones con identificador detectados: ${uniqueButtons.length}.`,
  `- Funciones escritoras o reconciliadoras detectadas: ${uniqueWriters.length}.`,
  `- Documentos candidatos a canonicos: ${canonicalDocs.length}.`,
  `- Documentos historicos o de soporte: ${historicalDocs.length}.`,
  "",
  "## Vistas",
  "",
  ...uniqueViews.map((view) => `- \`${view.id}\` (index.html:${view.line})`),
  "",
  "## Rutas API",
  "",
  ...uniqueRoutes.map((route) => `- \`${route.path}\` (server.js:${route.line})`),
  "",
  "## Escritores y reconciliadores",
  "",
  ...uniqueWriters.map((writer) => `- \`${writer.name}\` (server.js:${writer.line})`),
  "",
  "## Controles identificados",
  "",
  ...uniqueButtons.map((button) => `- \`${button.id}\`: ${button.label || "(solo icono)"} (index.html:${button.line})`),
  "",
  "## Documentacion candidata a canonica",
  "",
  ...canonicalDocs.map((name) => `- \`${name}\``),
  "",
  "## Documentacion historica o de soporte",
  "",
  "Debe conservarse fuera del recorrido normal del usuario y no presentarse como contrato vigente.",
  "",
  ...historicalDocs.map((name) => `- \`${name}\``),
  "",
  "## Reglas de limpieza",
  "",
  "1. No retirar una ruta, vista o escritor hasta que una prueba demuestre que no participa en el flujo estable.",
  "2. Toda captura nueva tendra una sola puerta de entrada; las rutas anteriores quedaran en compatibilidad temporal y luego se retiraran.",
  "3. La complejidad tecnica se concentra en Operacion. El usuario ve Inicio, Historias, Evidencia, Inteligencia, Publicar y Cuenta.",
  "4. Los documentos historicos no se borran durante la migracion; se apartan del manual y de la fuente de verdad.",
  "",
].join("\n");

const outputPath = path.join(root, "docs", "inventory-restructure-20260727.md");
await writeFile(outputPath, markdown, "utf8");
console.log(`Inventory written: ${path.relative(root, outputPath)}`);

function collectMatches(source, pattern, transform) {
  const results = [];
  for (const match of source.matchAll(pattern)) {
    results.push(transform(match, lineNumberAt(source, match.index)));
  }
  return results;
}

function lineNumberAt(source, index = 0) {
  return source.slice(0, index).split("\n").length;
}

function stripHtml(value = "") {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueBy(items, keyOf) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isCanonicalDocument(name = "") {
  const normalized = name.toLowerCase();
  return [
    "plan-maestro",
    "blueprint-produccion",
    "manual",
    "operating-contract",
    "capture-adoption-blueprint",
    "arquitectura-v2",
    "current-evidence",
    "product-gap-register",
  ].some((token) => normalized.includes(token));
}
