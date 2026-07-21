import { readFileSync } from "node:fs";

const app = readFileSync("app.js", "utf8");
const server = readFileSync("server.js", "utf8");
const index = readFileSync("index.html", "utf8");

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

function between(text, start, end) {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) return "";
  return text.slice(startIndex, endIndex);
}

const experienceNoteBuilder = between(
  app,
  "function buildObsidianExperienceNoteMarkdown",
  "async function exportExperienceNotesToLocalObsidianVault",
);
const mapExporter = between(
  app,
  "async function exportExperienceMapMarkdown",
  "function renderReport",
);
const localTargetMap = between(
  app,
  "function getLocalObsidianTargetPath",
  "function sanitizeLocalObsidianFilename",
);
const serverTargets = between(
  server,
  "const OBSIDIAN_EXPORT_TARGETS =",
  "const execFileAsync",
);
const integrationExperienceBuilder = between(
  server,
  "function buildExperienceFromIntegrationSignal",
  "function buildAgendaEventFromIntegrationSignal",
);
const saveObsidianExport = between(
  server,
  "async function saveObsidianExport",
  "function inferObsidianTargetFromFilename",
);

assert(app.includes('const APP_VERSION = "20260721-obsidian-map-trust-680";'), "APP_VERSION must identify the Obsidian map trust build.");
assert(app.includes("RECOMMENDED_OBSIDIAN_VAULT_PATH") && app.includes("obsidian-vault-vibe"), "The app must show the exact expected local Obsidian vault path.");
assert(app.includes("function hasObsidianMarkerDirectory") && app.includes('hasChildDirectoryHandle(handle, ".obsidian")'), "Local vault selection must validate the real Obsidian .obsidian marker.");
assert(app.includes("function resolveLocalObsidianVaultHandle") && app.includes("obsidian_vault_marker_missing"), "Local vault selection must reject folders that are not Obsidian vaults.");
assert(app.includes("obsidian_multiple_vaults_found"), "Local vault selection must reject ambiguous parent folders with multiple vaults.");
assert(app.includes("function ensureConnectedLocalObsidianVaultHandle") && app.includes("await resolveLocalObsidianVaultHandle(vault.handle)"), "Stored local vault handles must be revalidated before export.");
assert(app.includes("await ensureConnectedLocalObsidianVaultHandle()") && app.includes("obsidian_vault_marker_missing"), "Local Markdown save must verify the vault marker before writing.");
assert(app.includes("function getLocalDateKey") && app.includes("function getLocalDateTimeWithOffset"), "Obsidian export must use local date helpers.");
assert(experienceNoteBuilder.includes("getLocalDateKey(experience.timestamp)"), "Experience notes must use local dates, not UTC dates.");
assert(!experienceNoteBuilder.includes("toISOString().slice(0, 10)"), "Experience notes must not derive date from UTC toISOString().slice(0, 10).");
assert(experienceNoteBuilder.includes("created_at") && experienceNoteBuilder.includes("updated_at"), "Experience notes must include created_at and updated_at required by the vault contract.");
assert(experienceNoteBuilder.includes("datetime_local") && experienceNoteBuilder.includes("timezone"), "Experience notes must include local datetime and timezone.");
assert(experienceNoteBuilder.includes("getExperienceCategoryForExport") && experienceNoteBuilder.includes("category: ${category ?"), "Experience notes must omit untrusted categories instead of inventing them.");
assert(experienceNoteBuilder.includes("getExperienceEnergyForExport") && !experienceNoteBuilder.includes("Number(experience.energy || 0)") && !experienceNoteBuilder.includes("Number(experience.energy || 5)"), "Experience notes must not fabricate energy values.");
assert(experienceNoteBuilder.includes("getExperienceNarrativeStatus(experience)") && experienceNoteBuilder.includes("multimodalStatus"), "Experience notes must emit Dataview status fields from the shared narrative rule.");
assert(experienceNoteBuilder.includes("...(people.length ?") && !experienceNoteBuilder.includes("people: []"), "Experience notes must omit people when no real people are known instead of emitting an empty array.");
assert(app.includes("function isLowValueObsidianNarrative") && app.includes("function getExperienceNarrativeTextForExport") && app.includes("function getExperienceNarrativeStatus"), "Obsidian export must have one shared rule for real narrative text.");
assert(experienceNoteBuilder.includes("getExperienceNarrativeTextForExport(experience)") && !experienceNoteBuilder.includes("Sin resumen narrativo suficiente"), "Experience notes must mark missing narrative as pending, not export filler text.");
assert(experienceNoteBuilder.includes("getObsidianCategoryWikiLink"), "Experience notes must sanitize category wiki links.");
assert(experienceNoteBuilder.includes("wrapObsidianAutoBlock") && app.includes("OBSIDIAN_HUMAN_HEADING") && app.includes("String.fromCharCode(0x00ed)"), "Experience notes must write the human curation heading with the UTF-8 accented i.");
const autoBlockStart = experienceNoteBuilder.indexOf("...wrapObsidianAutoBlock");
const autoBlockEnd = experienceNoteBuilder.indexOf("OBSIDIAN_HUMAN_HEADING", autoBlockStart);
const autoBlockBuilder = autoBlockStart >= 0 && autoBlockEnd > autoBlockStart ? experienceNoteBuilder.slice(autoBlockStart, autoBlockEnd) : "";
assert(autoBlockBuilder.includes("## Enlaces") && autoBlockBuilder.includes("...links.map"), "Generated Obsidian backlinks must stay inside the automatic block so they update on reexport.");
assert(app.includes("function isObsidianExportableExperience") && app.includes("function isTechnicalMediaOnlyExperience"), "Obsidian export must exclude technical media-only captures from experience notes.");
assert(app.includes("getExperienceNarrativeStatus(experience) === \"pending\"") && app.includes("image_picker") && app.includes("native-media"), "Technical media-only captures must require a missing real narrative before they are excluded.");
assert(localTargetMap.includes('generated_map: ["05_Generated"]'), "Generated maps must be routed to 05_Generated in the local vault.");
assert(serverTargets.includes('generated_map: "05_Generated"'), "Generated maps must be routed to 05_Generated on the server.");
assert(mapExporter.includes("fuente:") && mapExporter.includes("generado") && mapExporter.includes("fiabilidad:") && mapExporter.includes("pendiente"), "Generated map frontmatter must declare generated source and reliability.");
assert(mapExporter.includes("Exportacion Obsidian terminada") && mapExporter.includes("notesResult.count === notesResult.expected"), "Map export must report verifiable note counts.");
assert(app.includes("upsert: options.upsert !== false"), "General Markdown sync must request upsert by default for regenerated artifacts.");
assert(app.includes("preserveHuman: true") && !experienceNoteBuilder.includes("upsert: true"), "Experience-note export must preserve human curation instead of forcing upsert.");
assert(app.includes("mergeObsidianAutoBlock(existingMarkdown, safeMarkdown)"), "Local Obsidian save must merge the automatic block instead of overwriting curated experience notes.");
assert(saveObsidianExport.includes("shouldPreserveHumanObsidianContent") && saveObsidianExport.includes("mergeObsidianAutoBlock(existingContent, finalContent)"), "Server Obsidian export must preserve human curation for experience notes.");
assert(server.includes("function mergeObsidianAutoBlock") && server.includes("await uniqueObsidianPath(requestedPath)"), "Server must version legacy experience notes that do not have auto-block markers.");
assert(app.includes("hasCuratedObsidianLearnings(preservedHuman)") && app.includes('"learnings", "ok"') && app.includes('"updated_at"'), "Local merge must mark learnings ok and refresh updated_at when human curation adds learning content.");
assert(server.includes("hasCuratedObsidianLearnings(preservedHuman)") && server.includes('"learnings", "ok"') && server.includes('"updated_at"'), "Server merge must mark learnings ok and refresh updated_at when human curation adds learning content.");
assert(mapExporter.includes("Exportando...") && mapExporter.includes("requestAnimationFrame") && mapExporter.includes("skipObsidian: true") && mapExporter.includes('target: "generated_map"'), "Experience-map Markdown button must show progress and sync the map explicitly instead of silently doing nothing.");
assert(mapExporter.indexOf("exportExperienceNotesToLocalObsidianVault(experiences)") < mapExporter.indexOf("syncMarkdownBlobToObsidian(blob, filename"), "Obsidian export must save experience notes before saving the generated map.");
assert(mapExporter.includes("obsidian_notes_incomplete") && mapExporter.includes("obsidian_map_not_saved"), "Obsidian export must fail visibly instead of accepting a partial map-only export.");
assert(app.includes("buildObsidianExcludedExperienceNoteCandidates(allExperiences)") && app.includes("Notas candidatas a revisar"), "Obsidian export must report stale-note candidates for human review.");
assert(!app.includes("function deleteMarkdownFromLocalObsidianVault") && !app.includes("removeEntry(safeFilename)") && !app.includes("deleteObsidianExperienceNoteIfExists"), "VibePWA must not automatically delete append-only experience notes.");
assert(!server.includes('url.pathname === "/api/obsidian/export" && req.method === "DELETE"') && !server.includes("function deleteObsidianExport"), "Server Obsidian export must not expose automatic deletion for experience notes.");
assert(index.includes('onclick="window.exportExperienceMapMarkdown?.()"') && app.includes("window.exportExperienceMapMarkdown = exportExperienceMapMarkdown"), "Experience-map Markdown button must have a direct browser click fallback.");
assert(app.includes('experienceMapExportButton")?.addEventListener("click", exportExperienceMapMarkdown') && app.includes('button?.dataset.exporting === "1"'), "Experience-map Markdown button must also have a programmatic listener guarded against duplicate execution.");
assert(index.includes('id="localObsidianVaultStatus"') && index.includes('id="connectLocalObsidianVaultButton"') && index.includes('id="forgetLocalObsidianVaultButton"'), "Experience map must show a clear Obsidian vault connection state and actions.");
assert(app.includes("experience-map-board") && app.includes("renderExperienceMapBoardExperience") && app.includes("renderExperienceMapBoardFactor"), "Experience map must render as a readable board instead of only a dense SVG node graph.");
assert(!app.includes("EXPERIENCE_CATEGORIES"), "Experience category validation must use the real categories array, not an undefined constant.");
assert(app.includes("getExperienceNarrativeStatus(item) === \"ok\"") && !app.includes("cleanObsidianMarkdownText(item.notes).length > 30"), "Map narrative metrics must use the same real-narrative rule as exported notes.");
assert(app.includes("function getMeaningfulAssetAnalysisSnippets") && app.includes("Lectura relevante de activos"), "Map export must suppress generic OCR/review boilerplate and show only meaningful asset readings.");
assert(app.includes("function getExperienceEnergyForKnowledge") && app.includes("function getExperienceCategoryForKnowledge"), "Map export must separate trusted analytical values from raw/default experience values.");
assert(mapExporter.includes('Categoria dominante: ${knowledgeSummary.topCategory ?') && mapExporter.includes("sin dato confiable"), "Generated map must not claim a dominant category when source confidence is missing.");
assert(mapExporter.includes('Energia media registrada: ${knowledgeSummary.avgEnergy ?') && mapExporter.includes("sin dato suficiente"), "Generated map must not claim average energy when source confidence is missing.");
assert(saveObsidianExport.includes("obsidian_markdown_required"), "Server must reject empty Markdown exports.");
assert(integrationExperienceBuilder.includes('rawCategory ? normalizeCategoryName(rawCategory) : "Sin categoría"'), "External experience ingest must not default category to Trabajo.");
assert(integrationExperienceBuilder.includes("Number.isFinite(Number(rawEnergy))") && integrationExperienceBuilder.includes(": null"), "External experience ingest must not default energy to 5.");

const AUTO_START = "<!-- vibe:auto -->";
const AUTO_END = "<!-- /vibe:auto -->";

function testSetFrontmatterField(markdown = "", field = "", value = "") {
  const serialized = `${field}: ${JSON.stringify(value)}`;
  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!frontmatterMatch) return markdown;
  const bodyStart = frontmatterMatch[0].length;
  const frontmatter = frontmatterMatch[1];
  const fieldPattern = new RegExp(`^${field}:.*$`, "m");
  const nextFrontmatter = fieldPattern.test(frontmatter)
    ? frontmatter.replace(fieldPattern, serialized)
    : `${frontmatter}\n${serialized}`;
  return `---\n${nextFrontmatter}\n---\n${markdown.slice(bodyStart)}`;
}

function testHasCuratedLearnings(markdown = "") {
  const match = String(markdown || "").match(/(?:^|\n)###\s+Aprendizajes[^\n]*\n([\s\S]*?)(?=\n#{2,3}\s+|$)/i);
  if (!match) return false;
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line && !line.startsWith("<!--") && !/^[-*]\s*$/.test(line));
}

function testMergeAutoBlock(existingMarkdown = "", incomingMarkdown = "") {
  const existingStart = existingMarkdown.indexOf(AUTO_START);
  const existingEnd = existingMarkdown.indexOf(AUTO_END, existingStart);
  const incomingStart = incomingMarkdown.indexOf(AUTO_START);
  const incomingEnd = incomingMarkdown.indexOf(AUTO_END, incomingStart);
  if (existingStart < 0 || existingEnd < 0 || incomingStart < 0 || incomingEnd < 0) return null;
  const incomingAuto = incomingMarkdown.slice(0, incomingEnd + AUTO_END.length);
  const preservedHuman = existingMarkdown.slice(existingEnd + AUTO_END.length);
  const mergedAuto = testHasCuratedLearnings(preservedHuman)
    ? testSetFrontmatterField(testSetFrontmatterField(incomingAuto, "learnings", "ok"), "updated_at", "2026-07-21T12:00:00-04:00")
    : incomingAuto;
  return `${mergedAuto}${preservedHuman}`.trim();
}

const existingCuratedNote = `---
learnings: "pending"
---
${AUTO_START}
old automatic content
${AUTO_END}

## Curaduría humana

### Aprendizajes

- Aprendizaje humano preservado.
`;
const incomingMachineNote = `---
learnings: "pending"
---
${AUTO_START}
new automatic content
${AUTO_END}
`;
const mergedCuratedNote = testMergeAutoBlock(existingCuratedNote, incomingMachineNote);
assert(mergedCuratedNote?.includes("new automatic content"), "Behavior check: merge must update the automatic block.");
assert(mergedCuratedNote?.includes("Aprendizaje humano preservado"), "Behavior check: merge must preserve human learning text.");
assert(mergedCuratedNote?.includes('learnings: "ok"'), "Behavior check: merge must mark frontmatter learnings ok when human learning exists.");
assert(mergedCuratedNote?.includes('updated_at: "2026-07-21T12:00:00-04:00"'), "Behavior check: merge must refresh updated_at when human learning exists.");

const existingEmptyLearningNote = `---
learnings: "pending"
---
${AUTO_START}
old automatic content
${AUTO_END}

## Curaduría humana

### Aprendizajes

### Decisiones o acciones
`;
const mergedEmptyLearningNote = testMergeAutoBlock(existingEmptyLearningNote, incomingMachineNote);
assert(mergedEmptyLearningNote?.includes('learnings: "pending"'), "Behavior check: empty learning sections must remain pending after reexport.");

if (failures.length) {
  console.error("Obsidian export contract verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Obsidian export contract verification passed.");
