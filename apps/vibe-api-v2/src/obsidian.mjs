import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "./errors.mjs";

const AUTO_START = "<!-- vibe:auto -->";
const AUTO_END = "<!-- /vibe:auto -->";
const HUMAN_HEADING = "## Curaduría humana";

export function createObsidianService({ config, stories }) {
  async function preview(auth) {
    const items = await stories.list(auth);
    const assets = new Map();
    items.forEach((story) => (story.attachments || []).forEach((asset) => {
      const id = asset.id || asset.assetId || asset.captureId;
      if (id) assets.set(id, asset);
    }));
    return {
      generatedAt: new Date().toISOString(),
      files: [
        ...items.map((story) => ({
          path: `02_Experiences/${filename(story)}.md`,
          markdown: markdown(story),
        })),
        ...[...assets.values()].map((asset) => ({
          path: `04_Assets/${assetFilename(asset)}.md`,
          markdown: assetMarkdown(asset),
        })),
      ],
      map: {
        path: "05_Generated/mapa-de-conocimiento-vibe-obsidian.md",
        markdown: mapMarkdown(items),
      },
    };
  }

  async function exportVault(auth) {
    const vault = await resolveVault(config.obsidianVaultPath);
    const bundle = await preview(auth);
    const written = [];
    for (const file of [...bundle.files, bundle.map]) {
      const target = path.join(vault, file.path);
      await mkdir(path.dirname(target), { recursive: true });
      let finalContent = file.markdown;
      let finalTarget = target;
      if (file.path.startsWith("02_Experiences/")) {
        const merged = await mergeHumanZone(target, file.markdown);
        finalContent = merged.content;
        finalTarget = merged.path;
      }
      await writeFile(finalTarget, finalContent, "utf8");
      written.push(path.relative(vault, finalTarget).split(path.sep).join("/"));
    }
    for (const relative of written) {
      const target = path.resolve(vault, relative);
      if (!target.startsWith(path.resolve(vault))) throw new ApiError(500, "obsidian_path_escape");
      const text = await readFile(target, "utf8");
      if (!text.trim()) throw new ApiError(500, "obsidian_empty_file", relative);
    }
    return { ok: true, vault, written, count: written.length };
  }

  return { preview, exportVault };
}

async function resolveVault(configured) {
  const vault = path.resolve(String(configured || ""));
  if (!configured) throw new ApiError(409, "obsidian_vault_not_configured");
  await access(path.join(vault, ".obsidian")).catch(() => {
    throw new ApiError(409, "obsidian_vault_marker_missing");
  });
  return vault;
}

// Devuelve { content, path } — `path` puede diferir del original si hay que
// versionar para NO pisar una nota sin marcadores.
//
// La version anterior reconstruia la zona humana a partir de dos secciones
// fijas (### Aprendizajes y ### Notas). Eso: (a) borraba
// "### Decisiones o acciones" en cada reexport; (b) corrompia
// "### Notas editoriales" porque indexOf("### Notas") casa con su prefijo;
// (c) sobrescribia entera cualquier nota sin marcadores. Ahora se conserva
// TODO lo posterior a <!-- /vibe:auto --> tal cual, sin parsear secciones.
async function mergeHumanZone(target, generated) {
  let existing = "";
  try {
    existing = await readFile(target, "utf8");
  } catch {}

  const autoEnd = generated.indexOf(AUTO_END);
  const generatedAuto = autoEnd >= 0 ? generated.slice(0, autoEnd + AUTO_END.length) : generated;

  if (!existing.trim()) {
    return { content: generated, path: target };
  }

  const existingEnd = existing.indexOf(AUTO_END);
  if (existingEnd < 0) {
    // Nota sin marcadores: no es nuestra o fue escrita a mano. No se pisa.
    return { content: generated, path: await versionedPath(target) };
  }

  // Todo lo que hay tras el bloque automatico es del humano: se copia literal.
  const humanZone = existing.slice(existingEnd + AUTO_END.length);
  const hasLearnings = /###\s*Aprendizajes\s*\n+\s*\S/.test(humanZone);
  const withState = generatedAuto.replace(
    /^learnings:\s*(?:pending|ok)\s*$/m,
    `learnings: ${hasLearnings ? "ok" : "pending"}`,
  );
  return { content: `${withState}${humanZone}`, path: target };
}

async function versionedPath(target) {
  const dir = path.dirname(target);
  const ext = path.extname(target);
  const stem = path.basename(target, ext);
  for (let index = 2; index < 100; index += 1) {
    const candidate = path.join(dir, `${stem} ${index}${ext}`);
    try {
      await access(candidate);
    } catch {
      return candidate;
    }
  }
  return path.join(dir, `${stem} ${Date.now()}${ext}`);
}

function markdown(story) {
  const human = humanNarrative(story);
  const learnings = "pending";
  const links = [`[[MOC - Vibe]]`, story.category ? `[[${story.category}]]` : ""].filter(Boolean);
  return `---
type: experience
vibe_id: "${yaml(story.id)}"
date: "${yaml(story.timestamp)}"
updated_at: "${new Date().toISOString()}"
activity: "${yaml(story.category || "")}"
narrative: ${human ? "ok" : "pending"}
learnings: ${learnings}
multimodal: ${(story.attachments || []).length > 0}
---

${AUTO_START}
# ${story.title}

## Relato
${human || "Narrativa pendiente."}

## Eventos
${(story.events || []).map((event) => `- ${event.title}${event.narrativeText ? `: ${event.narrativeText}` : ""}`).join("\n") || "- Sin eventos registrados."}

## Evidencias
${(story.attachments || []).map((asset) => `- [[${assetFilename(asset)}]]`).join("\n") || "- Sin evidencia vinculada."}

## Enlaces
${links.map((link) => `- ${link}`).join("\n")}
${AUTO_END}

${HUMAN_HEADING}

### Aprendizajes

### Notas
`;
}

function assetMarkdown(asset) {
  return `---
type: asset
vibe_id: "${yaml(asset.id || asset.assetId || asset.captureId || "")}"
kind: "${yaml(asset.kind || "")}"
mime_type: "${yaml(asset.mimeType || asset.type || "")}"
captured_at: "${yaml(asset.capturedAt || asset.uploadedAt || "")}"
source: "${yaml(asset.sourceType || asset.sourceDevice || "")}"
storage_path: "${yaml(asset.storagePath || asset.path || "")}"
---

# ${asset.name || asset.filename || "Evidencia"}

- Tipo: ${asset.kind || asset.mimeType || asset.type || "archivo"}
- Fecha: ${asset.capturedAt || asset.uploadedAt || "sin dato"}
- Origen: ${asset.sourceType || asset.sourceDevice || "Vibe"}
`;
}

function assetFilename(asset) {
  const id = String(asset.id || asset.assetId || asset.captureId || "asset").slice(0, 20);
  const label = String(asset.name || asset.filename || asset.kind || "evidencia")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 54);
  return `asset-${id}-${label || "evidencia"}`;
}

function mapMarkdown(items) {
  const narrated = items.filter((story) => Boolean(humanNarrative(story))).length;
  const categories = new Map();
  // Sin este guard, las historias sin categoria entraban con clave undefined y
  // producian un wikilink literal "[[undefined]]", ademas de contarse como
  // "area de vida observada".
  items.forEach((story) => {
    const area = String(story.category || "").trim();
    if (!area) return;
    categories.set(area, (categories.get(area) || 0) + 1);
  });
  return `---
type: generated_map
updated_at: "${new Date().toISOString()}"
---

# Mapa de conocimiento Vibe

- Experiencias exportadas: ${items.length}
- Experiencias con narrativa humana: ${narrated}
- Áreas de vida observadas: ${categories.size}

## Experiencias
${items.map((story) => `- [[${filename(story)}]]`).join("\n")}

## Áreas de vida
${[...categories.entries()].map(([area, count]) => `- [[${area}]]: ${count}`).join("\n")}
`;
}

// Un umbral de 8 caracteres contaba "IMG_2024.jpg" como narrativa humana e
// inflaba la metrica. Se exige longitud razonable y se descartan los textos que
// son en realidad nombres de fichero o rutas.
const MIN_NARRATIVE_LENGTH = 24;

function isLowValueNarrative(text) {
  if (/^[\w .,()-]+\.(jpg|jpeg|png|heic|gif|mp4|mov|m4a|mp3|wav|pdf|docx?|txt)$/i.test(text)) return true;
  if (/^(https?:\/\/|[a-z]:\\|\/)/i.test(text)) return true;
  return !/\s/.test(text);
}

function humanNarrative(story) {
  const own = String(story.notes || "").trim();
  if (own.length >= MIN_NARRATIVE_LENGTH && !isLowValueNarrative(own)) return own;
  return (story.events || [])
    .map((event) => String(event.narrativeText || "").trim())
    .find((text) => text.length >= MIN_NARRATIVE_LENGTH && !isLowValueNarrative(text)) || "";
}

function filename(story) {
  const date = String(story.timestamp || "").slice(0, 10);
  const slug = String(story.title || "experiencia")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${date} - ${slug || "experiencia"}`;
}

function yaml(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
