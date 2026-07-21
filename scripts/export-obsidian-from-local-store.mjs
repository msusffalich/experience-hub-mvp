import { existsSync, readFileSync } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const API_BASE = process.env.API_BASE || "http://127.0.0.1:5174/api";
const STORE_PATH = process.env.STORE_PATH || "data/experience-store.json";
const VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH || "obsidian-vault-vibe";
const TIMEZONE = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
const DIRECT_EXPORT = process.env.DIRECT_OBSIDIAN_EXPORT === "1";
const AUTO_START = "<!-- vibe:auto -->";
const AUTO_END = "<!-- /vibe:auto -->";
const HUMAN_HEADING = `## Curadur${String.fromCharCode(0x00ed)}a humana`;
const TARGETS = {
  generated_map: "05_Generated",
  generated_report: "05_Generated",
  generated: "05_Generated",
  experiences: "02_Experiences",
};

const store = JSON.parse(readFileSync(STORE_PATH, "utf8"));
const experiences = Array.isArray(store.experiences) ? store.experiences : [];
const exportable = experiences.filter(isExportableExperience);
const contextSignals = experiences.filter((experience) => !isExportableExperience(experience));

function clean(value, fallback = "") {
  return String(value || fallback || "").replace(/\s+/g, " ").trim();
}

function localDateKey(value) {
  const date = new Date(value || Date.now());
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localDateTime(value) {
  const date = new Date(value || Date.now());
  const pad = (number) => String(Math.abs(number)).padStart(2, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const hours = Math.trunc(Math.abs(offsetMinutes) / 60);
  const minutes = Math.abs(offsetMinutes) % 60;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(hours)}:${pad(minutes)}`;
}

function slug(value) {
  return clean(value, "experiencia")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 72) || "experiencia";
}

function splitPeople(value) {
  return clean(value)
    .split(/[,;|]/)
    .map((item) => clean(item))
    .map((item) => item === "primary-user-miguel" ? "Miguel" : item)
    .filter((item) => item && !/^sin personas$/i.test(item));
}

function isExportableExperience(experience = {}) {
  if (experience.isDemo) return false;
  if (experience.metadata?.target === "context") return false;
  const notes = clean(experience.notes);
  const title = clean(experience.title);
  return Boolean(title && notes.length > 20);
}

function safeCategory(experience = {}) {
  const category = clean(experience.category);
  if (!category || /^dato del usuario$/i.test(category) || /^sin categor/i.test(category)) return null;
  return category;
}

function safeEnergy(experience = {}) {
  const value = Number(experience.energy);
  if (!Number.isFinite(value) || value < 1 || value > 10) return null;
  return value;
}

function experienceFilename(experience = {}) {
  return `${localDateKey(experience.timestamp)} - ${slug(experience.title)}.md`;
}

function eventLines(experience = {}) {
  const events = Array.isArray(experience.events) ? experience.events : [];
  if (!events.length) return ["- Sin eventos internos registrados."];
  return events.map((event, index) => `- ${event.order || index + 1}. ${clean(event.title || event.description || event.text, "Evento")}`);
}

function assetLines(experience = {}) {
  const attachments = Array.isArray(experience.attachments) ? experience.attachments : [];
  if (!attachments.length) return ["- Sin activos vinculados."];
  return attachments.map((asset) => `- ${clean(asset.name || asset.fileName || asset.kind || "Activo")} · ${clean(asset.kind || asset.type || "multimedia")}`);
}

function buildExperienceMarkdown(experience = {}) {
  const title = clean(experience.title, "Experiencia");
  const category = safeCategory(experience);
  const energy = safeEnergy(experience);
  const people = splitPeople(experience.people);
  const source = clean(experience.metadata?.sourceType || "vibepwa");
  const links = [
    "[[MOC - Vibe]]",
    "[[mapa-de-conocimiento-vibe-obsidian|Mapa de conocimiento]]",
    category ? `[[${category.replace(/[\\/]/g, " - ")}]]` : "",
  ].filter(Boolean);
  const frontmatter = [
    "---",
    `vibe_id: ${JSON.stringify(experience.id || slug(title))}`,
    "type: experience",
    `title: ${JSON.stringify(title)}`,
    `created_at: ${JSON.stringify(localDateTime(experience.timestamp))}`,
    `updated_at: ${JSON.stringify(localDateTime(experience.updatedAt || experience.timestamp))}`,
    `date: ${JSON.stringify(localDateKey(experience.timestamp))}`,
    `datetime_local: ${JSON.stringify(localDateTime(experience.timestamp))}`,
    `timezone: ${JSON.stringify(TIMEZONE)}`,
    `category: ${category ? JSON.stringify(category) : "null"}`,
    `category_source: ${category ? JSON.stringify("user") : "null"}`,
    ...(energy ? [`energy: ${JSON.stringify(energy)}`, `energy_source: ${JSON.stringify("user")}`] : []),
    `narrative: ${JSON.stringify(clean(experience.notes).length > 20 ? "ok" : "pending")}`,
    `learnings: ${JSON.stringify("pending")}`,
    `multimodal: ${JSON.stringify((experience.attachments || []).length ? "ok" : "pending")}`,
    ...(people.length ? [`people: ${JSON.stringify(people)}`] : []),
    `source: ${JSON.stringify(source)}`,
    "sync_status: exported",
    "---",
  ];
  return [
    ...frontmatter,
    "",
    AUTO_START,
    "",
    `# ${title}`,
    "",
    "Tipo: experiencia",
    `Fecha: ${localDateKey(experience.timestamp)}`,
    `Grupo/persona: ${people.join(", ") || "sin registrar"}`,
    `Categoria: ${category || "pendiente de clasificar"}`,
    `Lugar: ${clean(experience.location) || "sin registrar"}`,
    `Fuente: ${source || "Vibe"}`,
    energy ? `Energia registrada: ${energy}/10` : "Energia registrada: sin dato",
    "",
    "## Resumen",
    "",
    clean(experience.notes),
    "",
    "## Eventos internos",
    "",
    ...eventLines(experience),
    "",
    "## Activos vinculados",
    "",
    ...assetLines(experience),
    "",
    "## Lectura automatica",
    "",
    "",
    "## Enlaces",
    "",
    ...links.map((link) => `- ${link}`),
    "",
    AUTO_END,
    "",
    HUMAN_HEADING,
    "",
    "### Aprendizajes",
    "",
    "### Decisiones o acciones",
    "",
    "### Notas editoriales",
    "",
  ].join("\n").trim() + "\n";
}

function targetDir(target) {
  return path.resolve(VAULT_PATH, TARGETS[target] || "00_Inbox");
}

function uniquePath(filePath) {
  if (!existsSync(filePath)) return filePath;
  const parsed = path.parse(filePath);
  for (let index = 2; index < 1000; index += 1) {
    const candidate = path.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`);
    if (!existsSync(candidate)) return candidate;
  }
  return path.join(parsed.dir, `${parsed.name}-${Date.now()}${parsed.ext}`);
}

function hasCuratedLearnings(markdown = "") {
  const match = String(markdown || "").match(new RegExp("(?:^|\\n)###\\s+Aprendizajes[^\\n]*\\n([\\s\\S]*?)(?=\\n#{2,3}\\s+|$)", "i"));
  if (!match) return false;
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line && !line.startsWith("<!--") && !/^[-*]\s*$/.test(line));
}

function setFrontmatterField(markdown = "", field = "", value = "") {
  const frontmatterMatch = markdown.match(new RegExp("^---\\n([\\s\\S]*?)\\n---\\n?"));
  if (!frontmatterMatch) return markdown;
  const serialized = `${field}: ${JSON.stringify(value)}`;
  const bodyStart = frontmatterMatch[0].length;
  const fieldPattern = new RegExp(`^${field}:.*$`, "m");
  const nextFrontmatter = fieldPattern.test(frontmatterMatch[1])
    ? frontmatterMatch[1].replace(fieldPattern, serialized)
    : `${frontmatterMatch[1]}\n${serialized}`;
  return `---\n${nextFrontmatter}\n---\n${markdown.slice(bodyStart)}`;
}

function mergeAutoBlock(existing = "", incoming = "") {
  const existingStart = existing.indexOf(AUTO_START);
  const existingEnd = existing.indexOf(AUTO_END, existingStart);
  const incomingStart = incoming.indexOf(AUTO_START);
  const incomingEnd = incoming.indexOf(AUTO_END, incomingStart);
  if (existingStart < 0 || existingEnd < 0 || incomingStart < 0 || incomingEnd < 0) return null;
  const incomingAuto = incoming.slice(0, incomingEnd + AUTO_END.length);
  const preservedHuman = normalizeHumanHeadings(existing.slice(existingEnd + AUTO_END.length));
  const mergedAuto = hasCuratedLearnings(preservedHuman) ? setFrontmatterField(incomingAuto, "learnings", "ok") : incomingAuto;
  return `${mergedAuto}${preservedHuman}`.trim();
}

function normalizeHumanHeadings(markdown = "") {
  const variants = [
    "## Curaduria humana",
    HUMAN_HEADING,
    `## Curadur${String.fromCharCode(0x00c3)}${String.fromCharCode(0x00ad)}a humana`,
  ];
  return variants.reduce(
    (text, variant) => text.split(variant).join(HUMAN_HEADING),
    String(markdown || ""),
  );
}

async function writeDirectExport(payload) {
  const dir = targetDir(payload.target);
  mkdirSync(dir, { recursive: true });
  const requested = path.join(dir, payload.filename);
  let finalPath = requested;
  let markdown = payload.markdown;
  if (payload.preserveHuman && existsSync(requested)) {
    const existing = readFileSync(requested, "utf8");
    const merged = mergeAutoBlock(existing, markdown);
    if (merged) {
      markdown = merged;
    } else if (existing.trim()) {
      finalPath = uniquePath(requested);
    }
  } else if (payload.upsert === false) {
    finalPath = uniquePath(requested);
  }
  writeFileSync(finalPath, markdown.endsWith("\n") ? markdown : `${markdown}\n`, "utf8");
  return {
    ok: true,
    relativePath: path.relative(path.resolve(VAULT_PATH), finalPath).replace(/\\/g, "/"),
    path: finalPath,
  };
}

function buildMapMarkdown() {
  const now = new Date().toISOString();
  const categories = new Map();
  for (const experience of exportable) {
    const category = safeCategory(experience) || "Sin categoría";
    categories.set(category, (categories.get(category) || 0) + 1);
  }
  return [
    "# Mapa de conocimiento de experiencias",
    "",
    "---",
    `generated: ${JSON.stringify(now)}`,
    `created_at: ${JSON.stringify(localDateTime(now))}`,
    `updated_at: ${JSON.stringify(localDateTime(now))}`,
    'source: "vibepwa"',
    'fuente: "generado"',
    'fiabilidad: "pendiente"',
    "sync_status: exported",
    `experiences_exported: ${exportable.length}`,
    `context_signals_excluded: ${contextSignals.length}`,
    "---",
    "",
    "## Experiencias",
    "",
    ...exportable.map((experience) => `- [[${experienceFilename(experience).replace(/\.md$/i, "")}]] · ${safeCategory(experience) || "sin categoría"} · ${localDateKey(experience.timestamp)}`),
    "",
    "## Categorías",
    "",
    ...[...categories.entries()].map(([category, count]) => `- [[${category}]] · ${count}`),
    "",
    "## Validaciones aplicadas",
    "",
    "- Se excluyeron señales técnicas/contextuales sin narrativa.",
    "- No se inventó categoría ni energía.",
    "- Las notas de experiencia preservan curaduría humana fuera del bloque `vibe:auto`.",
    "",
  ].join("\n");
}

async function postExport(payload) {
  if (DIRECT_EXPORT) return writeDirectExport(payload);
  const response = await fetch(`${API_BASE}/obsidian/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${payload.filename}: HTTP ${response.status} ${JSON.stringify(body)}`);
  }
  return body;
}

const results = [];
results.push(await postExport({
  target: "generated_map",
  filename: "mapa-de-conocimiento-vibe-obsidian.md",
  markdown: buildMapMarkdown(),
  source: "vibepwa-local-export-670",
  upsert: true,
}));

for (const experience of exportable) {
  results.push(await postExport({
    target: "experiences",
    filename: experienceFilename(experience),
    markdown: buildExperienceMarkdown(experience),
    source: "vibepwa-local-export-670",
    preserveHuman: true,
  }));
}

console.log(JSON.stringify({
  ok: true,
  storePath: STORE_PATH,
  apiBase: API_BASE,
  exported: results.length,
  experiences: exportable.length,
  contextSignalsExcluded: contextSignals.length,
  files: results.map((item) => item.relativePath),
}, null, 2));
