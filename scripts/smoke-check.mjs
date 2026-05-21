import { readFileSync } from "node:fs";

const files = {
  app: readFileSync("app.js", "utf8"),
  index: readFileSync("index.html", "utf8"),
  serviceWorker: readFileSync("service-worker.js", "utf8"),
  server: readFileSync("server.js", "utf8"),
  styles: readFileSync("styles.css", "utf8"),
  sql: readFileSync("database/workspace-events-assets.sql", "utf8"),
  uploadAttemptsSql: readFileSync("database/asset-upload-attempts.sql", "utf8"),
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
  "function ensureApiOnlineForSave",
  "function isApiConnectivityError",
  "function uploadDataUrlAttachment",
  "function dataUrlToBlob",
  "function buildPendingMediaDetail",
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
assert(files.server.includes("function supabaseServerKeyHeaders") && files.server.includes("function isLegacyJwtSupabaseKey"), "Server does not support current Supabase secret-key headers.");
assert(!files.server.includes("Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`"), "Server still sends Supabase sb_secret/service key directly as a Bearer token.");
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
assert(files.app.includes("Before declaring a save local-only, Capture checks backend health again."), "English manual does not explain save connectivity recheck.");
assert(files.app.includes("Antes de declarar un guardado como local"), "Spanish manual does not explain save connectivity recheck.");
assert(files.app.includes("readback_pending") && files.app.includes("remoteReadbackPending"), "Capture save status still treats remote readback delays as local-only failures.");
assert(files.app.includes("uploadDataUrlAttachment(attachment)") && files.app.includes("FormData"), "Pending local media is not retried through binary multipart upload.");
assert(files.app.includes("Cuando un adjunto queda pendiente") && files.app.includes("When an attachment is pending"), "Manual does not explain binary retry for pending media.");
assert(files.app.includes("compatible con claves Supabase nuevas sb_secret") && files.app.includes("supports new Supabase sb_secret keys"), "Manual does not explain Supabase secret-key Storage compatibility.");
assert(files.app.includes("Detalle del adjunto pendiente") && files.app.includes("Pending attachment detail"), "Capture does not show pending media failure details.");
assert(files.server.includes("remoteSyncError: media.remoteSyncError") && files.server.includes("remoteSyncError: metadata.remoteSyncError"), "Server does not preserve pending media error details.");
assert(files.app.includes("Prueba autom") && files.app.includes("Automated smoke check"), "Admin does not expose the automated smoke check.");
assert(files.server.includes("/api/upload-attempts"), "Server is missing the upload attempts endpoint.");
assert(files.server.includes("function classifyUploadError"), "Server does not classify upload failures.");
assert(files.server.includes("function recordAssetUploadAttempt"), "Server does not record upload attempts.");
assert(files.server.includes("function listAssetUploadAttempts"), "Server does not expose upload attempt history.");
assert(files.server.includes("Trazabilidad de adjuntos") && files.server.includes("uploadAttempts"), "Supabase diagnostics do not include attachment traceability.");
assert(files.uploadAttemptsSql.includes("CREATE TABLE IF NOT EXISTS asset_upload_attempts"), "Upload attempts migration is missing the table.");
assert(files.uploadAttemptsSql.includes("ENABLE ROW LEVEL SECURITY"), "Upload attempts migration does not enable RLS.");
assert(files.uploadAttemptsSql.includes("Users can manage own upload attempts"), "Upload attempts migration is missing the user RLS policy.");
assert(files.app.includes("Cada subida de adjunto queda registrada como intento auditable"), "Spanish manual does not explain upload attempt traceability.");
assert(files.app.includes("Every attachment upload is recorded as an auditable attempt"), "English manual does not explain upload attempt traceability.");
assert(files.app.includes("function loadUploadAttempts"), "Frontend does not load upload attempt history.");
assert(files.app.includes("function renderUploadAttemptsPanel"), "Admin does not render upload attempt history.");
assert(files.app.includes("Trazabilidad de subidas de adjuntos") && files.app.includes("Attachment upload traceability"), "System health does not expose upload traceability.");
assert(files.styles.includes(".upload-attempts-panel") && files.styles.includes(".upload-attempt-item"), "Styles are missing upload attempt history UI.");
assert(files.app.includes("function reconcileOfflineQueueWithRemote"), "Offline queue does not reconcile against remote Supabase data.");
assert(files.app.includes("function isOfflineMutationResolvedByRemote"), "Offline queue cannot detect resolved ghost media pending items.");
assert(files.app.includes("function reconcileOfflineQueueFromSupabase"), "Offline queue does not expose a manual Supabase reconciliation action.");
assert(files.app.includes("offlineQueueReconcile"), "Offline queue is missing the manual clean-saved-items label/action.");
assert(files.app.includes("data-persistence-action=\"clear-queue\""), "Persistence banner does not expose local queue cleanup.");
assert(files.app.includes("function clearOfflineQueueFromBanner"), "Persistence banner cleanup handler is missing.");
assert(files.app.includes("La cola sin conexión se reconcilia con Supabase"), "Spanish manual does not explain offline queue reconciliation.");
assert(files.app.includes("The offline queue reconciles with Supabase"), "English manual does not explain offline queue reconciliation.");

if (failures.length) {
  console.error("Smoke check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Smoke check passed for ${version}: version/cache, events, assets, upload traceability, manual, and admin.`);
