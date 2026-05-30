import { existsSync, readFileSync } from "node:fs";

const files = {
  app: readFileSync("app.js", "utf8"),
  index: readFileSync("index.html", "utf8"),
  serviceWorker: readFileSync("service-worker.js", "utf8"),
  reset: readFileSync("reset.html", "utf8"),
  manifest: readFileSync("manifest.webmanifest", "utf8"),
  server: readFileSync("server.js", "utf8"),
  packageJson: readFileSync("package.json", "utf8"),
  requirements: readFileSync("requirements.txt", "utf8"),
  railpack: readFileSync("railpack.json", "utf8"),
  pythonInstall: readFileSync("scripts/install-python-deps.mjs", "utf8"),
  reportlabVerify: readFileSync("scripts/verify-reportlab.mjs", "utf8"),
  outputPdfVerify: readFileSync("scripts/verify-output-pdfs.mjs", "utf8"),
  pwaVerify: readFileSync("scripts/verify-pwa-release.mjs", "utf8"),
  localE2eVerify: readFileSync("scripts/verify-local-e2e-flow.mjs", "utf8"),
  controlAudit: readFileSync("scripts/audit-control.mjs", "utf8"),
  runtimeAudit: readFileSync("scripts/audit-runtime-helpers.mjs", "utf8"),
  integrationVerify: readFileSync("scripts/verify-integration-contract.mjs", "utf8"),
  ouraConnectorDoc: readFileSync("docs/oura-openapi-connector.md", "utf8"),
  androidVerify: readFileSync("scripts/verify-android-release.mjs", "utf8"),
  flutterVerify: readFileSync("scripts/verify-flutter-mobile.mjs", "utf8"),
  vibeappPackage: readFileSync("scripts/package-vibeapp-pilot.mjs", "utf8"),
  vibeappSimulator: readFileSync("scripts/simulate-vibeapp-sync.mjs", "utf8"),
  vibeappMain: readFileSync("vibeapp/lib/main.dart", "utf8"),
  vibeappTest: readFileSync("vibeapp/test/widget_test.dart", "utf8"),
  reportPdf: readFileSync("scripts/report_pdf_reportlab.py", "utf8"),
  insightsPdf: readFileSync("scripts/insights_pdf_reportlab.py", "utf8"),
  publicationPdf: readFileSync("scripts/publication_pdf_reportlab.py", "utf8"),
  manualPdf: readFileSync("scripts/manual_pdf_reportlab.py", "utf8"),
  styles: readFileSync("styles.css", "utf8"),
  sql: readFileSync("database/workspace-events-assets.sql", "utf8"),
  uploadAttemptsSql: readFileSync("database/asset-upload-attempts.sql", "utf8"),
  schemaSql: readFileSync("database/schema.sql", "utf8"),
  storageFormatsSql: readFileSync("database/storage-accept-all-supported-media.sql", "utf8"),
  uxAudit: readFileSync("docs/ux-ui-audit.md", "utf8"),
};

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const versionMatch = files.app.match(/const APP_VERSION = "([^"]+)";/);
const version = versionMatch?.[1] || "";
const packageJson = JSON.parse(files.packageJson);

assert(Boolean(version), "APP_VERSION was not found in app.js.");
assert(files.index.includes(`app.js?v=${version}`), "index.html does not load the current app.js version.");
assert(files.index.includes(`styles.css?v=${version}`), "index.html does not load the current styles.css version.");
assert(files.index.includes(`manifest.webmanifest?v=${version}`), "index.html does not load the current manifest version.");
assert(files.serviceWorker.includes(`experience-hub-pwa-${version}`), "service-worker.js cache name does not match APP_VERSION.");
assert(files.reset.includes(version) && files.reset.includes("getRegistrations") && files.reset.includes("caches.keys"), "reset.html must clear PWA caches and redirect to the current version.");
assert(files.serviceWorker.includes("NETWORK_ONLY_PATHS") && files.serviceWorker.includes('"/app.js"') && files.serviceWorker.includes('cache: "no-store"'), "service-worker.js must never cache the app shell files.");
assert(files.app.includes("const fullAmbitionOverall") && files.app.includes("Current delivery") && files.app.includes("Entrega actual"), "Global progress must separate current delivery from full future ambition.");
assert(files.app.includes("const operatingPwaScore") && files.app.includes("Release PWA verificable") && files.app.includes("verifiable PWA gate"), "Global progress must include the verified PWA delivery gate.");
assert(files.app.includes("Ruta operativa al 90") && files.app.includes("Operating route to 90"), "Global progress must separate the operating route from future native/connectors horizon.");
assert(files.app.includes("Estado global de avance mide capacidades implementadas") && files.app.includes("Global Progress measures implemented"), "Manual must explain that global progress is capability-based, not browser-data-based.");
assert(files.packageJson.includes("\"audit:control\"") && files.packageJson.includes("npm run audit:control"), "Release verification must include the control audit.");
assert(files.controlAudit.includes("Control audit passed") && files.controlAudit.includes("Auditoría de control de release"), "Control audit script must verify the release-control Admin evidence.");
assert(files.packageJson.includes("\"audit:runtime\"") && files.packageJson.includes("npm run audit:runtime"), "Check verification must include the runtime helper audit.");
assert(files.runtimeAudit.includes("Runtime helper audit passed") && files.runtimeAudit.includes("function sentenceCase"), "Runtime helper audit must verify helper declarations.");
const manifest = JSON.parse(files.manifest);
assert(manifest.id === "/", "manifest.webmanifest is missing a stable app id.");
assert(manifest.start_url === "/index.html?view=dashboard", "manifest.webmanifest start_url must be stable and not point to an old app version.");
assert(manifest.display === "standalone", "manifest.webmanifest should use standalone display for PWA install.");
assert(files.index.includes("icons/vibe-icon-192.png") && files.index.includes("icons/vibe-apple-touch.png"), "index.html does not use the Vibe logo icons.");
assert(files.serviceWorker.includes("/icons/vibe-icon-512.png") && files.serviceWorker.includes("/icons/vibe-logo.jpg"), "service-worker.js does not cache Vibe logo assets.");
assert(Array.isArray(manifest.icons) && manifest.icons.some((icon) => icon.src === "/icons/vibe-icon-192.png") && manifest.icons.some((icon) => icon.src === "/icons/vibe-icon-512.png"), "manifest.webmanifest does not expose Vibe PWA icons.");
["icons/vibe-logo.jpg", "icons/vibe-icon-192.png", "icons/vibe-icon-512.png", "icons/vibe-apple-touch.png"].forEach((path) => {
  assert(existsSync(path), `Missing Vibe logo asset: ${path}`);
});
const visibleAndPdfText = files.app + files.index + files.styles + files.manifest + files.serviceWorker + files.uxAudit + files.reportPdf + files.insightsPdf + files.publicationPdf + files.manualPdf;
assert(!/[\u00c3\u00c2\ufffd]/u.test(visibleAndPdfText), "Visible app files or ReportLab scripts contain mojibake characters.");

assert(!/\bnormalizeExperience\s*\(/.test(files.app), "app.js still calls normalizeExperience(); use normalizeExperienceItem() or normalizeExperiences().");
assert(files.app.includes("function sentenceCase") && files.app.includes("return sentenceCase(payload)"), "sentenceCase helper is missing for external asset payload labels.");
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
  "function renderDashboardAttachmentStatus",
  "function repairDashboardAttachments",
  "function summarizeAttachmentSyncState",
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
assert(files.schemaSql.includes("allowed_mime_types = NULL"), "Base schema still restricts Storage MIME types.");
assert(files.storageFormatsSql.includes("allowed_mime_types = NULL"), "Storage format migration does not allow all app-supported media/document formats.");
assert(files.server.includes("storage-accept-all-supported-media.sql"), "Supabase diagnostics do not point to the Storage MIME migration.");
assert(files.app.includes("invalid_mime_type para PDF") && files.app.includes("invalid_mime_type for PDF"), "Manual does not explain PDF MIME bucket remediation.");
assert(files.index.includes("dashboard-primary-panel") && files.index.includes("Nueva experiencia"), "Dashboard does not expose primary daily actions.");
assert(files.index.includes("dashboardDataStatusPanel") && files.app.includes("function renderDashboardDataStatusPanel") && files.app.includes("renderDashboardStateAndProgressPanels"), "Dashboard does not expose the current data/status guard.");
assert(files.app.includes("function ensureDashboardTopPanel") && files.app.includes("resolveGlobalProgressContainer"), "Dashboard cannot recover progress/data panels from stale HTML.");
assert(files.app.includes("clearAppShellCaches") && files.app.includes("caches.keys"), "Refresh app does not clear stale app-shell caches.");
assert(files.server.includes("/api/integration/contract") && files.server.includes("/api/integration/validate") && files.server.includes("function validateIntegrationSignal"), "Server does not expose integration contract validation.");
assert(files.app.includes("vibe-signal-contract-v2") && files.app.includes("copy-sample") && files.app.includes("idempotencyKey"), "Device integration panel does not expose a validated sample payload.");
assert(files.server.includes("/api/integration/samples") && files.server.includes("function buildIntegrationSampleKit") && files.server.includes("function buildIntegrationSampleSignals"), "Server does not expose a reusable integration sample kit.");
assert(files.app.includes("function buildDeviceIntegrationSamplePayloads") && files.app.includes("data-device-action=\"export-samples\"") && files.app.includes("Kit de integraci\u00f3n") && files.app.includes("Integration kit"), "Device integration panel does not expose the sample kit.");
assert(files.app.includes("Meta/Oakley") && files.app.includes("Oura") && files.app.includes("Samsung Health") && files.app.includes("Health Connect"), "Device integration kit does not cover the priority device families.");
assert(files.packageJson.includes("\"verify:integrations\"") && files.packageJson.includes("npm run verify:integrations"), "Pilot verification must include the integration contract verifier.");
assert(files.integrationVerify.includes("Integration contract verification passed") && files.integrationVerify.includes("/api/integration/samples"), "Integration contract verifier is missing sample-kit checks.");
assert(files.server.includes("/api/integration/oura/manifest") && files.server.includes("/api/integration/oura/normalize") && files.server.includes("function buildOuraSignal"), "Server does not expose the Oura OpenAPI connector manifest and normalizer.");
assert(files.ouraConnectorDoc.includes("Oura OpenAPI v2") && files.ouraConnectorDoc.includes("https://api.ouraring.com") && files.ouraConnectorDoc.includes("daily_readiness"), "Oura connector documentation is missing the OpenAPI-derived decision and mapping.");
assert(files.app.includes("Conector OpenAPI de Oura") && files.app.includes("Oura OpenAPI connector"), "Manual/Admin does not document the Oura OpenAPI connector.");
assert(files.server.includes("/api/integration/apple-health/manifest") && files.server.includes("function normalizeAppleHealthPayload"), "Server does not expose the Apple Health connector manifest and normalizer.");
assert(files.server.includes("/api/integration/health-connect/manifest") && files.server.includes("function normalizeHealthConnectPayload"), "Server does not expose the Android Health Connect connector manifest and normalizer.");
assert(files.server.includes("/api/integration/meta-wearables/manifest") && files.server.includes("function normalizeMetaWearablesPayload"), "Server does not expose the Meta Wearables connector manifest and normalizer.");
assert(files.ouraConnectorDoc.includes("Apple Health / HealthKit") && files.ouraConnectorDoc.includes("Samsung / Android Health Connect") && files.ouraConnectorDoc.includes("Meta Wearables"), "Device connector documentation is missing Apple, Samsung/Health Connect, or Meta sections.");
assert(files.app.includes("Rutas Apple, Samsung y Meta") && files.app.includes("Apple, Samsung, and Meta routes"), "Manual/Admin does not document the Apple, Samsung, and Meta connector routes.");
assert(files.server.includes("/api/integration/device/selftest") && files.server.includes("function runDeviceConnectorSelfTest"), "Server does not expose the unified device connector self-test.");
assert(files.server.includes("/api/integration/ingest") && files.server.includes("function ingestIntegrationSignal") && files.app.includes("/api/integration/ingest"), "Server/manual do not expose validated integration ingest.");
assert(files.app.includes("runDeviceConnectorSelfTest") && files.app.includes("data-device-action=\"run-device-connectors\"") && files.app.includes("Prueba de conectores"), "Admin device panel does not expose the connector self-test.");
assert(files.ouraConnectorDoc.includes("/api/integration/device/selftest"), "Device connector documentation must include the unified self-test endpoint.");
assert(files.index.includes("dashboardBiometricBox") && files.app.includes("function buildBiometricIntelligenceSummary") && files.app.includes("function renderDashboardBiometricContext") && files.styles.includes(".dashboard-biometric-summary"), "Dashboard does not expose the central biometric intelligence panel.");
assert(files.index.includes("dashboardIntegrationBox") && files.app.includes("function renderDashboardIntegrationHandoff") && files.app.includes("function buildDashboardIntegrationHandoffSummary") && files.styles.includes(".dashboard-integration-summary"), "Dashboard does not expose native/connectors data-origin handoff.");
assert(files.app.includes("structuredContext.signals") && files.app.includes("vibeapp-health-connect-structured-context"), "PWA does not hydrate structured Vibeapp/Health Connect biometric signals.");
assert(files.ouraConnectorDoc.includes("Uso en la PWA") && files.ouraConnectorDoc.includes("Panel") && files.ouraConnectorDoc.includes("Hallazgos"), "Device connector documentation does not explain how biometrics inform the PWA.");
assert(!files.index.includes("dashboardAttachmentPanel") && !files.index.includes("dashboardPilotBox"), "Dashboard still exposes technical/pilot monitoring panels.");
assert(files.index.includes("capture-layout-clean") && !files.index.includes("captureCoachBox") && !files.index.includes("templateList"), "Capture still exposes parallel coach/template panels.");
assert(files.index.includes("captureEventPreview") && files.app.includes("function renderCaptureEventPreview"), "Capture does not show the live internal event preview.");
assert(files.styles.includes(".capture-event-card") && files.app.includes("Capture shows a live Event preview"), "Event preview UI or manual documentation is missing.");
assert(files.index.includes("reportEventFilter") && files.app.includes("state.reportFilters.eventQuery"), "Reports cannot filter by internal event text.");
assert(
  files.index.includes("reportSourceFilter")
    && files.index.includes("insightsSourceFilter")
    && files.index.includes("publicationSourceFilter")
    && files.app.includes("function experienceMatchesIntegrationSource")
    && files.app.includes("getIntegrationSourceFilterOptions")
    && files.app.includes("origen/conector"),
  "Reports, Findings, and Publications do not expose the unified origin/connector filter.",
);
assert(files.index.includes("assetEventLinkFilter") && files.app.includes("state.assetFilters.eventLink"), "Assets cannot filter by event link status.");
assert(files.index.includes(".zip,.rar,.7z") && files.app.includes('"zip", "rar", "7z"') && files.server.includes("type.includes(\"zip\")"), "Compressed files are not consistently accepted as document assets.");
assert(files.server.includes("/api/ocr-image") && files.server.includes("openai-image-ocr"), "Backend image OCR endpoint is missing.");
assert(files.app.includes("/ocr-image") && files.app.includes("OCR_PROVIDER=openai"), "Frontend or manual does not document/use automatic image OCR.");
assert(files.server.includes("openai-pdf-ocr") && files.server.includes("pdf_ocr_too_large"), "Backend scanned-PDF OCR fallback is missing.");
assert(files.app.includes("archive-transport-only") && files.app.includes("Los archivos comprimidos se guardan solo para transporte y descarga"), "Archive assets are not protected from automatic interpretation.");
assert(files.server.includes("await getDocumentBytes(normalized)") && files.server.includes("audio_data_required"), "Audio transcription cannot read remote signed URLs.");
assert(files.app.includes("assetDownloadFile") && files.app.includes("renderArchiveMediaCard") && files.app.includes("PDF se previsualiza con una vista embebida"), "Asset preview/download flow is incomplete.");
assert(files.app.includes("patrón del blueprint de CLIO") && files.app.includes("temporary Supabase signed URLs"), "Manual does not document the CLIO-style signed-URL asset reading pattern.");
assert(
  files.index.includes("audioCaptureGuide")
    && files.app.includes("applyAudioTranscriptToCapture")
    && files.app.includes("Captura rápida por audio")
    && files.app.includes("isLikelyAudioWebm")
    && files.server.includes("isTranscribableServerMedia")
    && files.server.includes("audio/webm"),
  "Quick audio capture flow or WebM audio handling is missing.",
);
assert(
  files.app.includes('const VOICE_ASSISTANT_NAME = "V"')
    && files.app.includes("stripVoiceWakePhrase")
    && files.app.includes("hasVoiceWakePhrase")
    && files.app.includes("handleVoiceContentCommand")
    && files.app.includes("createVoiceAgendaEvent")
    && files.app.includes("appendVoiceNoteToCapture")
    && files.app.includes("processAudioTranscriptCommands")
    && files.app.includes("voiceCommandContinuousHelp")
    && files.app.includes("Hola V")
    && files.app.includes("Hi V"),
  "V voice invocation is missing.",
);
assert(
  files.app.includes("scheduleAttachmentRetry")
    && files.app.includes("startAttachmentSyncSupervisor")
    && files.app.includes("offlineQueueAutoRetry"),
  "Automatic attachment retry supervisor is missing.",
);
assert(
  files.app.includes("saveAgendaEventToApi")
    && files.app.includes("mergeRemoteAgendaEvents")
    && files.server.includes("/api/agenda")
    && files.server.includes("agenda_events")
    && files.app.includes("Agenda multidispositivo"),
  "Multi-device Agenda synchronization is missing.",
);
assert(
  files.app.includes("assetTranslatedText")
    && files.app.includes("translateAssetNow")
    && files.app.includes("translateExtractedAssetText")
    && files.server.includes("/api/translate-text")
    && files.server.includes("Translate the following asset text")
    && files.app.includes("Original | Traducci"),
  "Asset translation/original interpretation flow is missing.",
);
assert(
  files.server.includes("audioStorage")
    && files.server.includes("videoStorage")
    && files.server.includes("documentStorage")
    && files.server.includes("archiveStorage")
    && files.server.includes("asset_kinds_not_synced"),
  "Supabase self-test does not validate all core asset families.",
);
assert(files.app.includes("function renderSelfTestAssetMatrix") && files.app.includes("Familias de activos probadas"), "Admin does not show the Supabase asset-family test matrix.");
assert(/@media \(max-width: 1040px\)[\s\S]*\.capture-layout-clean \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/.test(files.styles), "Capture is not forced to full width on tablet/mobile layouts.");
assert(/@media \(max-width: 720px\)[\s\S]*\.capture-layout-clean,[\s\S]*\.filters \{[\s\S]*grid-template-columns: 1fr/.test(files.styles), "Capture is not included in the mobile one-column layout.");
assert(files.index.includes("Activos y multimedia") && files.index.includes("Opciones avanzadas de calendario"), "Assets operations or Agenda advanced tools are not properly grouped.");
assert(!/assetLibraryView[\s\S]*Herramientas avanzadas de activos/.test(files.index), "Asset Library still exposes technical asset tools in the user view.");
assert(files.index.includes("Opciones técnicas") && files.index.includes("Opciones técnicas del reporte"), "Reports or Publications still lack the simplified advanced-action flow.");
assert(files.index.includes("admin-accordion-stack") && files.index.includes("Resumen ejecutivo") && files.index.includes("Persistencia y Supabase"), "Admin is not organized into thematic accordions.");
assert(files.index.includes("manual-version-card") && files.index.includes("manualVersionValue"), "Manual does not expose the current version guide card.");
assert(files.app.includes("Librería, Activos, Reportes, Publicaciones y Agenda usan una vista limpia"), "Spanish manual does not explain the cleaned user pages.");
assert(files.app.includes("La operación técnica de Activos y multimedia vive en Administración"), "Spanish manual does not explain that technical asset operations moved to Admin.");
assert(files.app.includes("Library, Assets, Reports, Publications, and Agenda use a cleaner view"), "English manual does not explain the cleaned user pages.");
assert(files.app.includes("Technical Assets and media operations live in Admin"), "English manual does not explain that technical asset operations moved to Admin.");
assert(files.app.includes("Administración ya no se organiza como una sábana") && files.app.includes("Admin is no longer organized as an endless sheet"), "Manual does not explain the reorganized Admin.");
assert(files.app.includes("El Manual muestra la versión vigente") && files.app.includes("The Manual shows the current version"), "Manual does not explain the current-version guide card.");
assert(files.styles.includes(".user-advanced-drawer") && files.styles.includes(".advanced-action-row"), "Styles are missing cleaned advanced drawer UI.");
assert(files.styles.includes(".admin-section-drawer") && files.styles.includes(".manual-version-card"), "Styles are missing Admin/Manual cleanup UI.");
assert(files.app.includes("Reparar adjuntos") && files.app.includes("Repair attachments"), "Dashboard attachment repair action is missing bilingual labels.");
assert(files.app.includes("El Panel se simplifica para uso diario") && files.app.includes("The Dashboard is simplified for daily use"), "Manual does not explain simplified Dashboard UX.");
assert(files.app.includes("simple por fuera y sofisticada por dentro") && files.app.includes("simple outside and sophisticated inside"), "Manual does not document the core UX principle.");
assert(files.app.includes("Captura usa un formulario único") && files.app.includes("Capture uses one form"), "Manual does not explain simplified Capture UX.");
assert(files.app.includes("Reparación de adjuntos") && files.app.includes("Attachment repair"), "Admin health does not expose attachment repair.");
assert(files.app.includes("dashboardAttachmentFeedback"), "Attachment repair feedback still depends only on global notifications.");
assert(files.styles.includes(".dashboard-attachment-summary") && files.styles.includes(".dashboard-attachment-actions") && files.styles.includes(".dashboard-attachment-feedback"), "Styles are missing Dashboard attachment repair UI.");
assert(files.uxAudit.includes("Usuario diario") && files.uxAudit.includes("Administración") && files.uxAudit.includes("simple por fuera"), "UX/UI audit does not document the daily/admin separation.");
assert(files.requirements.includes("reportlab"), "Python requirements must install ReportLab for production PDFs.");
assert(files.railpack.includes("\"python\""), "railpack.json must include Python so Railway can run ReportLab PDFs.");
assert(files.railpack.includes("node scripts/verify-reportlab.mjs"), "railpack.json must verify ReportLab during the Railway build.");
assert(files.packageJson.includes("\"postinstall\"") && files.packageJson.includes("install-python-deps"), "package.json must install Python PDF dependencies during deployment.");
assert(files.pythonInstall.includes("--target") && files.pythonInstall.includes("./.python"), "Python PDF dependency installer must install into ./.python.");
assert(files.pythonInstall.includes("RAILWAY_PROJECT_ID") && files.pythonInstall.includes("NODE_ENV"), "Python dependency installer must treat Railway/production as a hard failure when Python is missing.");
assert(files.reportlabVerify.includes("import reportlab") && files.reportlabVerify.includes("PYTHONPATH"), "ReportLab verifier must import ReportLab with the bundled .python path.");
assert(files.packageJson.includes("\"verify:outputs\"") && files.packageJson.includes("verify-output-pdfs"), "package.json must expose full PDF output verification.");
assert(files.outputPdfVerify.includes("report_pdf_reportlab.py") && files.outputPdfVerify.includes("publication_pdf_reportlab.py") && files.outputPdfVerify.includes("manual_pdf_reportlab.py"), "Output PDF verifier must render report, publication, and manual PDFs.");
assert(packageJson.scripts?.["verify:e2e"]?.includes("verify-local-e2e-flow.mjs") && packageJson.scripts?.["verify:release"]?.includes("verify:e2e"), "Release verification must include the local operational E2E flow.");
assert(files.localE2eVerify.includes("titleInput") && files.localE2eVerify.includes("experienceForm") && files.localE2eVerify.includes("mediaInput") && files.localE2eVerify.includes("e2e-captura-real.txt"), "Local E2E must create a real capture with an attachment through the visible form.");
assert(files.localE2eVerify.includes("E2E captura real editada") && files.localE2eVerify.includes("Library edit button"), "Local E2E must edit the saved capture from Library and verify persistence.");
assert(files.localE2eVerify.includes("Library delete button") && files.app.includes("Experiencia eliminada") && files.app.includes("danger-button") && files.app.includes("deleteExperience('${item.id}')"), "Library must expose confirmed delete and Local E2E must verify it.");
assert(files.localE2eVerify.includes("Deleted capture attachment stayed visible in Assets") && files.localE2eVerify.includes("asset cleanup E2E ok"), "Local E2E must verify deleted experience attachments disappear from Assets.");
assert(files.localE2eVerify.includes('data-dashboard-scope-preset="work"') && files.localE2eVerify.includes("reportSharedScopeContext") && files.localE2eVerify.includes("insightsSharedScopeContext") && files.localE2eVerify.includes("publicationSharedScopeContext") && files.localE2eVerify.includes("shared scope E2E ok"), "Local E2E must verify shared analytical scope across Reports, Findings, and Publications.");
assert(files.localE2eVerify.includes("seedButton") && files.localE2eVerify.includes("libraryGrid") && files.localE2eVerify.includes("assetLibraryGrid") && files.localE2eVerify.includes("downloadEditedReportPdfButton") && files.localE2eVerify.includes("exportInsightsPdfButton") && files.localE2eVerify.includes("exportPublicationPdfButton"), "Local E2E must verify seeded data, Library, Assets, and the real Report, Findings, and Publication PDF buttons.");
assert(files.packageJson.includes("\"verify:pwa\"") && files.packageJson.includes("\"verify:release\""), "package.json must expose PWA and release verification scripts.");
assert(files.pwaVerify.includes("manifest.webmanifest") && files.pwaVerify.includes("service-worker.js") && files.pwaVerify.includes("VIBE_RELEASE_URL"), "PWA verifier must check manifest, service worker, and optional production URL.");
assert(files.packageJson.includes("\"verify:android\"") && files.androidVerify.includes("apksigner") && files.androidVerify.includes("key.properties"), "package.json must expose Android signing verification.");
assert(files.packageJson.includes("\"verify:flutter\"") && files.packageJson.includes("\"verify:pilot\""), "package.json must expose Flutter and unified pilot verification scripts.");
assert(files.flutterVerify.includes("flutter analyze") || files.flutterVerify.includes('["analyze"]'), "Flutter verifier must run flutter analyze.");
assert(files.flutterVerify.includes("flutter test") || files.flutterVerify.includes('["test"]'), "Flutter verifier must run flutter test.");
assert(files.flutterVerify.includes("io.vibeapp.mobile") && files.flutterVerify.includes("VIBE_REBUILD_ANDROID"), "Flutter verifier must validate the Android package contract and optional rebuild path.");
assert(files.vibeappTest.includes("Native payloads preserve event, media, location, and biometric context"), "Flutter tests must validate the Vibeapp payload contract without a physical device.");
assert(files.vibeappTest.includes("Native sync client sends media, experience, and ingest requests"), "Flutter tests must validate the Vibeapp sync client against a local HTTP server.");
assert(files.vibeappTest.includes("Native sync client reports media and agenda failures clearly"), "Flutter tests must validate clear Vibeapp sync failure handling.");
assert(files.vibeappTest.includes("Native queue validates files and retry state before sync"), "Flutter tests must validate queue retries, terminal failures, and local file validation.");
assert(files.vibeappMain.includes("class CaptureQueueSummary") && files.vibeappTest.includes("Native queue summary explains ready, retry, blocked, and synced items"), "Vibeapp must expose a tested observable queue summary.");
assert(files.vibeappMain.includes("class NativePilotChecklist") && files.vibeappTest.includes("Native pilot checklist scores backend, session, and queue blockers"), "Vibeapp must expose a tested mobile pilot checklist.");
assert(files.vibeappMain.includes("idempotencyKey") && files.server.includes("storageObjectHint") && files.vibeappTest.includes("storageObjectHint"), "Vibeapp/server sync must keep stable idempotency keys and Storage object hints.");
assert(files.vibeappTest.includes("External session import profiles Meta and biometric sources correctly"), "Flutter tests must validate source-specific external import profiles.");
assert(files.app.includes("getExternalAssetProfile") && files.app.includes("externalPayloadType") && files.app.includes("Perfil de dispositivo/origen"), "PWA must surface Vibeapp external import profiles in assets and reports.");
assert(files.app.includes("applyRecommendedPublicationMediaSelection") && files.app.includes("publicationRoleLabel") && files.app.includes("data-publication-media-bulk=\"recommended\""), "Publications must support recommended media curation with editorial asset roles.");
assert(files.app.includes("function buildPublicationChannelStudio") && files.app.includes("publication-channel-studio") && files.app.includes("channelStudio"), "Publications must expose a channel studio with format, media, output, and export payload.");
assert(files.app.includes("function getPublicationChannelPlaybook") && files.app.includes("publication-channel-playbook") && files.app.includes("data-publication-channel-playbook"), "Publications must expose a channel playbook before draft generation.");
assert(files.index.includes("publicationQuickStart") && files.app.includes("publicationQuickStarts") && files.app.includes("handlePublicationQuickStart") && files.styles.includes(".publication-quick-grid"), "Publications must expose one-click quick starts by channel or purpose.");
assert(files.app.includes("publicationChannelFormatPicker") && files.app.includes("renderPublicationChannelFormatPicker") && files.app.includes("data-publication-format-template") && files.styles.includes(".publication-format-channel-grid"), "Publications must expose a channel-first format picker before generation.");
assert(files.app.includes("Selector de publicacion por canal") && files.app.includes("Channel-first publication picker"), "Manual/Admin must document the channel-first publication picker.");
assert(files.index.includes("reportQuickStart") && files.app.includes("reportQuickStarts") && files.app.includes("handleReportQuickStart") && files.styles.includes(".report-quick-grid"), "Reports must expose one-click quick starts by period, theme, and device data.");
assert(files.app.includes("Arranque rapido de reportes") && files.app.includes("Report quick start"), "Manual/Admin must document Report quick starts.");
assert(files.index.includes("dashboardAnalyticalScopeBox") && files.app.includes("analyticalScopePresets") && files.app.includes("applySharedAnalyticalScope") && files.styles.includes(".dashboard-analytical-scope-box"), "Dashboard must expose shared analytical scope for Reports, Findings, and Publications.");
assert(files.app.includes("Alcance analitico compartido") && files.app.includes("Shared analytical scope"), "Manual/Admin must document shared analytical scope.");
assert(files.index.includes("reportSharedScopeContext") && files.index.includes("insightsSharedScopeContext") && files.index.includes("publicationSharedScopeContext") && files.app.includes("renderSharedScopeContext") && files.styles.includes(".shared-scope-context"), "Reports, Findings, and Publications must show their active analytical scope.");
assert(files.app.includes("Contexto de alcance por salida") && files.app.includes("Output scope context"), "Manual/Admin must document output scope context cards.");
assert(files.index.includes("insightsQuickStart") && files.app.includes("insightQuickStarts") && files.app.includes("handleInsightsQuickStart") && files.styles.includes(".insights-quick-grid"), "Findings must expose one-click quick starts by theme, period, and device data.");
assert(files.app.includes("Arranque rapido de Hallazgos") && files.app.includes("Findings quick start"), "Manual/Admin must document Findings quick starts.");
assert(files.app.includes("function buildPublicationChannelDeliverables") && files.app.includes("publication-channel-deliverables") && files.styles.includes(".publication-channel-deliverables"), "Publications must expose channel deliverables for master piece, copy, media package, and limitations.");
assert(files.publicationPdf.includes("channel_studio_cards") && files.publicationPdf.includes("Criterios de publicacion"), "Publication ReportLab PDF must render the channel studio decision layer.");
assert(files.publicationPdf.includes("Entregables del canal") && files.publicationPdf.includes("Que recibe el usuario"), "Publication ReportLab PDF must render channel deliverables.");
assert(files.app.includes("Playbook del canal") && files.app.includes("Channel playbook") && files.app.includes("Entregables por canal") && files.app.includes("Channel deliverables") && files.app.includes("Estudio de publicaci") && files.app.includes("Channel publication studio"), "Manual/Admin must document the Publication playbook, deliverables, and channel studio.");
assert(files.app.includes("syncPublicationDraftPagesFromTopLevel") && files.app.includes("Editor conectado a la exportacion") && files.app.includes("Publication editor tied to export"), "Publications editor must synchronize visible pages and export payloads.");
assert(files.index.includes("publicationProgressPanel") && files.app.includes("setPublicationProgress") && files.app.includes("publicationProgressPdfReady") && files.styles.includes(".publication-progress-panel"), "Publications must show generation progress and final PDF readiness.");
assert(files.app.includes("ensureApiOnlineForExport") && files.app.includes("publicationProgressApiCheck") && files.app.includes("await ensureApiOnlineForExport()"), "Publication PDF export must recheck API health inside the same flow before reporting API unavailable.");
assert(files.server.includes('url.pathname === "/api/publication/pdf"') && files.server.includes("getOptionalRequestUser(req)"), "Publication PDF endpoint must not force a separate sign-in when the client already sends the draft payload.");
assert(files.index.includes("reportProgressPanel") && files.index.includes("insightsProgressPanel") && files.app.includes("setReportProgress") && files.app.includes("setInsightsProgress"), "Reports and Findings must show PDF generation progress in the same flow.");
assert(files.server.includes('url.pathname === "/api/report/pdf"') && files.server.includes('url.pathname === "/api/insights/pdf"') && files.server.includes('url.pathname === "/api/manual/pdf"'), "Report, Findings, and Manual PDF endpoints must exist.");
assert(files.server.match(/getOptionalRequestUser\(req\)/g)?.length >= 4, "All client-payload PDF endpoints must allow smooth ReportLab rendering without a separate sign-in navigation.");
assert(packageJson.scripts?.["verify:publication-pdf-endpoint"]?.includes("verify-publication-pdf-endpoint.mjs"), "Release checks must include the authless Publication PDF endpoint acceptance test.");
assert(packageJson.scripts?.["verify:outputs"]?.includes("verify:publication-pdf-endpoint"), "Output verification must exercise the Publication PDF endpoint, not only the PDF renderer scripts.");
assert(files.app.includes("Local operational E2E verification") && files.app.includes("Compuerta E2E operativa local"), "Manual/Admin must document the local operational E2E gate.");
assert(packageJson.scripts?.["verify:production"]?.includes("verify-production-outputs.mjs") && packageJson.scripts?.["verify:production"]?.includes("verify-production-e2e.mjs"), "Production verification must include endpoint and browser E2E output checks.");
assert(existsSync("scripts/verify-production-e2e.mjs") && readFileSync("scripts/verify-production-e2e.mjs", "utf8").includes("downloadEditedReportPdfButton") && readFileSync("scripts/verify-production-e2e.mjs", "utf8").includes("exportInsightsPdfButton") && readFileSync("scripts/verify-production-e2e.mjs", "utf8").includes("exportPublicationPdfButton"), "Production E2E must click the real Report, Findings, and Publication PDF buttons.");
assert(files.packageJson.includes("\"package:vibeapp\"") && files.vibeappPackage.includes("checksums.sha256") && files.vibeappPackage.includes("manifest.json") && files.vibeappPackage.includes("Compress-Archive"), "package.json must expose a Vibeapp pilot package command with checksums, manifest, and transfer ZIP.");
assert(files.vibeappPackage.includes("verify:android") && files.vibeappPackage.includes("vibeapp-pilot-release.apk") && files.vibeappPackage.includes("vibeapp-pilot-release.aab"), "Vibeapp package script must verify Android and include APK/AAB.");
assert(files.packageJson.includes("\"simulate:vibeapp\"") && files.packageJson.includes("npm run simulate:vibeapp"), "package.json must expose and run the Vibeapp sync simulator in pilot verification.");
assert(files.vibeappSimulator.includes("Vibeapp sync simulation passed") && files.vibeappSimulator.includes("meta-glasses-import"), "Vibeapp simulator must validate native and external-session sync samples.");
assert(files.app.includes("Simulador de sincronizaci") && files.app.includes("Native sync simulator"), "Manual/Admin must expose the Vibeapp sync simulator.");
assert(files.server.includes("/api/vibeapp/simulate") && files.server.includes("runVibeappIntegrationSimulation"), "Server must expose the Vibeapp simulation endpoint.");
assert(files.app.includes("runVibeappSimulation") && files.app.includes("data-device-action=\"run-vibeapp-sim\""), "Admin device panel must run the Vibeapp simulation from the UI.");
assert(files.server.includes("PYTHONPATH") && files.server.includes(".python"), "Server must expose bundled Python packages to ReportLab scripts.");
assert(!files.index.includes('data-daily-flow="horoscope"'), "Daily should not expose horoscope until the module is reliable.");
assert(files.app.includes("function experienceMatchesPilotParticipant"), "Participant filtering must support legacy records by participant name.");
assert(files.app.includes("pilotParticipantFilter.disabled = false"), "Report participant selector must remain usable in every report scope.");
assert(files.index.includes("Descargar PDF editado ReportLab"), "Reports must expose edited ReportLab PDF as a primary action.");
assert(files.index.includes("Descargar PDF de hallazgos"), "Findings must expose PDF as the primary output.");
assert(files.index.includes('id="exportInsightsHtmlButton"') && files.index.includes('id="exportInsightsHtmlButton" class="ghost-button technical-export" type="button" hidden'), "Findings HTML export must not appear as a primary user action.");
assert(files.app.includes("function buildInsightActionPlan") && files.app.includes("data-insight-plan-index"), "Findings must produce a schedulable seven-day action plan.");
assert(files.app.includes("actionPlan = buildInsightActionPlan") && files.app.includes("Plan de acción 7 días"), "Findings exports must include the seven-day action plan.");
assert(files.insightsPdf.includes("actionPlan") && files.insightsPdf.includes("Plan de acción 7 días"), "Findings ReportLab PDF must render the seven-day action plan.");
assert(files.app.includes("Plan de acción de Hallazgos") && files.app.includes("7-day action plan"), "Manual/Admin must document the findings action plan.");
assert(files.index.includes("manualExportPdfButton"), "Manual must expose edited ReportLab PDF export.");
assert(files.server.includes("/api/manual/pdf"), "Server must expose Manual PDF generation.");
assert(!files.app.includes("PDF fallback exported as printable HTML"), "Report PDF failure must not silently download HTML fallback.");
assert(!files.app.includes("HTML was downloaded as a printable backup"), "Findings PDF failure must not silently download HTML fallback.");
assert(!files.app.includes("HTML was exported instead"), "Publication PDF failure must not silently export HTML fallback.");
assert(files.server.includes("throw new HttpError(503, \"reportlab_unavailable\", error.message)"), "Server must fail clearly when ReportLab is unavailable instead of returning a fake PDF.");
assert(files.app.includes("function authHeader()") && files.app.includes("function authHeaders()"), "PDF exports must have a stable auth header helper.");

if (failures.length) {
  console.error("Smoke check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Smoke check passed for ${version}: version/cache, events, assets, upload traceability, manual, and admin.`);
