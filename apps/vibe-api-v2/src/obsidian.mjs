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
      const final = file.path.startsWith("02_Experiences/")
        ? await mergeHumanZone(target, file.markdown)
        : file.markdown;
      await writeFile(target, final, "utf8");
      written.push(file.path);
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

async function mergeHumanZone(target, generated) {
  let existing = "";
  try {
    existing = await readFile(target, "utf8");
  } catch {}
  const human = extractHuman(existing);
  const autoEnd = generated.indexOf(AUTO_END);
  const rawAuto = autoEnd >= 0 ? generated.slice(0, autoEnd + AUTO_END.length) : generated;
  const generatedAuto = rawAuto.replace(
    /^learnings:\s*(?:pending|ok)\s*$/m,
    `learnings: ${human.learnings ? "ok" : "pending"}`,
  );
  return `${generatedAuto}\n\n${HUMAN_HEADING}\n\n### Aprendizajes\n${human.learnings}\n\n### Notas\n${human.notes}\n`;
}

function extractHuman(text) {
  const normalized = String(text || "").replace("## Curaduria humana", HUMAN_HEADING);
  const start = normalized.indexOf(HUMAN_HEADING);
  if (start < 0) return { learnings: "", notes: "" };
  const zone = normalized.slice(start);
  return {
    learnings: section(zone, "### Aprendizajes"),
    notes: section(zone, "### Notas"),
  };
}

function section(text, heading) {
  const start = text.indexOf(heading);
  if (start < 0) return "";
  const body = text.slice(start + heading.length);
  const next = body.search(/\n###\s/);
  return (next >= 0 ? body.slice(0, next) : body).trim();
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
  items.forEach((story) => categories.set(story.category, (categories.get(story.category) || 0) + 1));
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

function humanNarrative(story) {
  const own = String(story.notes || "").trim();
  if (own.length >= 8) return own;
  return (story.events || []).map((event) => String(event.narrativeText || "").trim()).find((text) => text.length >= 8) || "";
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
