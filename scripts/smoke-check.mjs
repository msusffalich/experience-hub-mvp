import { readFileSync } from "node:fs";

const files = {
  app: readFileSync("app.js", "utf8"),
  index: readFileSync("index.html", "utf8"),
  serviceWorker: readFileSync("service-worker.js", "utf8"),
  server: readFileSync("server.js", "utf8"),
  styles: readFileSync("styles.css", "utf8"),
  sql: readFileSync("database/workspace-events-assets.sql", "utf8"),
};

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const versionMatch = files.app.match(/const APP_VERSION = "([^"]+)";/);
const version = versionMatch?.[1] || "";

assert(Boolean(version), "APP_VERSION was not found in app.js.");
assert(files.index.includes(`app.js?v=${version}`), "index.html does not load the current app.js version.");
assert(files.index.includes(`styles.css?v=${version}`), "index.html does not load the current styles.css version.");
assert(files.index.includes(`manifest.webmanifest?v=${version}`), "index.html does not load the current manifest version.");
assert(files.serviceWorker.includes(`experience-hub-pwa-${version}`), "service-worker.js cache name does not match APP_VERSION.");

assert(!/\bnormalizeExperience\s*\(/.test(files.app), "app.js still calls normalizeExperience(); use normalizeExperienceItem() or normalizeExperiences().");
[
  "function normalizeExperienceItem",
  "function getCaptureEventOptions",
  "function linkAttachmentsToEvents",
  "function handleAttachmentEventSelection",
  "function getExperienceEventTimeline",
  "function buildExperienceEventSearchText",
  "function buildExperienceEventSummary",
  "function buildReportEventTimeline",
  "function renderLibraryEventPreview",
  "function renderReportEventTimeline",
  "function buildReportMultimodalEvidence",
  "function renderReportEvidenceCard",
].forEach((needle) => assert(files.app.includes(needle), `Missing critical frontend function: ${needle}.`));

assert(files.app.includes("eventTitle: asset.eventTitle"), "Report evidence does not include linked event titles.");
assert(files.app.includes("eventTimeline: buildReportEventTimeline"), "Report export payload does not include event timeline.");
assert(files.app.includes("resumen_eventos: buildExperienceEventSummary"), "Report rows do not include event summaries.");
assert(files.app.includes("buildExperienceEventSearchText(item)"), "Experience search does not include internal event text.");
assert(files.app.includes("assetExtractedText") && files.app.includes("asset-extracted-text-panel"), "Asset cards do not expose extracted text evidence.");
assert(files.app.includes("extractionMethod") && files.app.includes("extractionStatus"), "Asset processing metadata is not preserved.");
assert(files.app.includes("asset.extractedText") && files.app.includes("extractedText: asset.extractedText"), "Asset search/inventory does not include extracted text.");
assert(files.app.includes("/extract-document"), "Frontend does not call the backend document extraction endpoint.");
assert(files.server.includes("/api/extract-document") && files.server.includes("extractDocxText") && files.server.includes("extractPdfText"), "Server document extraction endpoint is incomplete.");
assert(files.styles.includes(".asset-extracted-text-panel"), "Styles are missing the extracted text panel.");
assert(files.app.includes("Linked event") && files.app.includes("Evento vinculado"), "Report export does not label linked events in both languages.");
assert(files.styles.includes(".library-event-preview") && files.styles.includes(".report-event-timeline"), "Styles are missing event timeline UI classes.");
assert(files.server.includes("event_id:"), "server.js does not write asset event_id.");
assert(files.sql.includes("assets_event_idx"), "SQL migration is missing the assets_event_idx index.");
assert(files.app.includes("Reportes muestra la evidencia multimodal con su evento vinculado."), "Spanish manual does not explain event-aware report evidence.");
assert(files.app.includes("Reports show multimodal evidence with its linked event."), "English manual does not explain event-aware report evidence.");
assert(files.app.includes("Reportes incluye Línea de eventos"), "Spanish manual does not explain report event timeline.");
assert(files.app.includes("Reports include an Event timeline"), "English manual does not explain report event timeline.");
assert(files.app.includes("La búsqueda de Librería y Línea de tiempo también encuentra texto dentro de eventos internos."), "Spanish manual does not explain event search.");
assert(files.app.includes("Library and Timeline search also find text inside internal events."), "English manual does not explain event search.");
assert(files.app.includes("El procesamiento de activos ahora muestra método"), "Spanish manual does not explain asset processing evidence.");
assert(files.app.includes("Asset processing now shows method"), "English manual does not explain asset processing evidence.");
assert(files.app.includes("El backend local intenta extraer texto"), "Spanish manual does not explain backend document extraction.");
assert(files.app.includes("The local backend attempts text extraction"), "English manual does not explain backend document extraction.");
assert(files.app.includes("Prueba autom") && files.app.includes("Automated smoke check"), "Admin does not expose the automated smoke check.");

if (failures.length) {
  console.error("Smoke check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Smoke check passed for ${version}: version/cache, capture events, asset links, report evidence, manual, and admin.`);
