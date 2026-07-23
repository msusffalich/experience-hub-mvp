import { readFileSync } from "node:fs";

const files = {
  app: readFileSync("app.js", "utf8"),
  server: readFileSync("server.js", "utf8"),
  index: readFileSync("index.html", "utf8"),
  packageJson: readFileSync("package.json", "utf8"),
  localE2e: readFileSync("scripts/verify-local-e2e-flow.mjs", "utf8"),
  productionE2e: readFileSync("scripts/verify-production-e2e.mjs", "utf8"),
  flowAutomation: readFileSync("scripts/verify-flow-automation.mjs", "utf8"),
  simulateVibeapp: readFileSync("scripts/simulate-vibeapp-sync.mjs", "utf8"),
  nativeBlueprint: readFileSync("docs/vibeapp-native-blueprint.md", "utf8"),
  operatingContract: readFileSync("docs/vibeapp-vibepwa-operating-contract.md", "utf8"),
  captureAdoptionBlueprint: readFileSync("docs/capture-adoption-blueprint-20260721.md", "utf8"),
  evidenceMigration: readFileSync("database/evidence-adoption-context-signals.sql", "utf8"),
  clioPlan: readFileSync("docs/clio-adoption-plan.md", "utf8"),
  productGapRegister: readFileSync("docs/product-gap-register.md", "utf8"),
};

const failures = [];
const warnings = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};
const warn = (condition, message) => {
  if (!condition) warnings.push(message);
};

const version = files.app.match(/const APP_VERSION = "([^"]+)";/)?.[1] || "";

check(Boolean(version), "APP_VERSION is missing.");
check(files.index.includes(version), "index.html is not aligned with APP_VERSION.");

check(files.server.includes("/api/integration/ingest"), "Blueprint requires a single integration ingest endpoint.");
check(files.server.includes("buildPostIngestAutomation"), "Integration ingest must trigger post-ingest automation.");
check(files.server.includes("biometric_impact_recomputed"), "Biometric ingest must recompute impact, not only store data.");
check(files.server.includes("inferUpdatedPanelsFromIngest"), "Post-ingest automation must list affected operational panels.");
check(files.server.includes("upsertContextSignal(buildContextSignalFromIntegrationSignal"), "Context ingest must store context_signals instead of generated context experiences.");
check(!files.server.includes("upsertExperience(buildContextExperienceFromIntegrationSignal"), "Context ingest must not create ctx-* experience rows.");
check(files.server.includes("upsertAssetEvidence(saved, user, { requireRemote: true })"), "Direct /api/media uploads must require a persisted intentional evidence row in assets.");
check(files.server.includes("getDailyBriefing") && files.server.includes("getContextImpact"), "Daily/context providers must remain server-side.");
check(files.server.includes("allowedSourceTypes") && files.server.includes("apple-healthkit-native") && files.server.includes("android-health-connect"), "Device source catalog must include Apple HealthKit and Health Connect.");
check(files.server.includes("/api/sync/state") && files.server.includes("getServerSyncState"), "Server must expose a sync state endpoint for automatic multi-device refresh.");
check(files.server.includes("/api/jobs/asset-processing") && files.server.includes("processAssetJob"), "Server must process assets through a central job queue.");
check(files.server.includes("server-apple-health-zip-extraction") && files.server.includes("extractAppleHealthXmlRowsServer"), "Server must process Apple Health export.zip when it contains biometric XML.");

check(files.app.includes("syncBiometricImportToServer"), "PWA biometric imports must sync to server ingest.");
check(files.app.includes("extractAppleHealthXmlRows"), "PWA must support Apple Health export.xml, not only CSV/JSON.");
check(files.index.includes(".xml") && files.index.includes("application/xml"), "Biometric file input must allow XML.");
check(files.app.includes("applyIntegrationAutomationResponse"), "PWA must consume automation responses from the server.");
check(files.app.includes("state.contextImpact = automation.contextImpact.impact"), "Server context impact must update local state automatically.");
check(files.app.includes("setupServerSyncPolling") && files.app.includes("pollServerSyncState"), "PWA must poll server sync state and refresh automatically when another device changes data.");
check(files.app.includes("queueAssetProcessingJob") && files.app.includes("/jobs/asset-processing"), "PWA automatic asset processing must enqueue server jobs instead of relying only on manual buttons.");

check(files.localE2e.includes("capture E2E ok"), "Local E2E must cover capture.");
check(files.localE2e.includes("library edit E2E ok") && files.localE2e.includes("library delete E2E ok"), "Local E2E must cover library edit/delete.");
check(files.localE2e.includes("capture asset E2E ok"), "Local E2E must cover asset visibility after capture.");
check(files.localE2e.includes("shared scope E2E ok"), "Local E2E must cover shared filters/scope across outputs.");
check(files.localE2e.includes("downloadEditedReportPdfButton") && files.localE2e.includes("exportInsightsPdfButton") && files.localE2e.includes("exportPublicationPdfButton"), "Local E2E must cover all three PDF output flows.");
check(files.productionE2e.includes("downloadEditedReportPdfButton") && files.productionE2e.includes("exportPublicationPdfButton"), "Production E2E must cover ReportLab PDF output flows.");

check(files.app.includes("reportSharedScopeContext") && files.app.includes("insightsSharedScopeContext") && files.app.includes("publicationSharedScopeContext"), "Report, Findings, and Publications must share scope context.");
check(files.app.includes("publicationEditor") && files.app.includes("publicationTemplateGallery") && files.app.includes("publicationFinalDocument"), "Publications must keep editor, template gallery, and final document stages.");
check(files.app.includes("reportProgressPanel") && files.app.includes("insightsProgressPanel") && files.app.includes("publicationProgressPanel"), "Outputs must expose visible progress panels.");

check(files.simulateVibeapp.includes("buildPostIngestAutomation") && files.simulateVibeapp.includes("extractAppleHealthXmlRows"), "Vibeapp simulation must guard post-ingest and biometric XML support.");
check(files.packageJson.includes('"simulate:vibeapp"') && files.packageJson.includes('"verify:integrations"'), "Package scripts must expose Vibeapp simulation and integration verification.");
check(files.packageJson.includes('"verify:processing"') && files.packageJson.includes("verify-asset-processing-job.mjs"), "Package scripts must verify server asset processing jobs.");
check(files.productGapRegister.includes("Registro de brechas de producto Vibe"), "Product gap register is missing.");
check(files.productGapRegister.includes("Apple Health") && files.productGapRegister.includes("Samsung Watch") && files.productGapRegister.includes("Oura Ring") && files.productGapRegister.includes("Meta/Oakley"), "Product gap register must track device/accessory universe explicitly.");
check(files.productGapRegister.includes("Cerrado con prueba") && files.productGapRegister.includes("Pendiente hardware/API"), "Product gap register must separate tested closure from hardware/API assumptions.");
check(files.evidenceMigration.includes("CREATE TABLE IF NOT EXISTS context_signals"), "Evidence/context migration must create context_signals.");
check(files.evidenceMigration.includes("adoption_status") && files.evidenceMigration.includes("evidence_type"), "Evidence/context migration must add adoption status and evidence type to assets.");
check(files.operatingContract.includes("Intentional evidence is allowed to exist before its parent experience"), "Operating contract must state evidence can be captured before its experience.");
check(files.captureAdoptionBlueprint.includes("Do not ship partial behavior that writes context as both `context_signals` and `ctx-*` experiences"), "Capture blueprint must prevent dual-writing context as fake experiences.");
check(files.packageJson.includes('"verify:flows"') && files.packageJson.includes("verify-flow-automation.mjs"), "Package scripts must verify automatic server flow closure.");
check(files.packageJson.includes("npm run verify:flows"), "Release verification must run the automatic flow closure gate.");
check(files.packageJson.includes("verify-local-e2e-flow.mjs") && files.packageJson.includes("verify-production-e2e.mjs"), "Package scripts must expose local and production E2E verification.");
check(files.flowAutomation.includes("/integration/ingest") && files.flowAutomation.includes("biometric_impact_recomputed") && files.flowAutomation.includes("/sync/state") && files.flowAutomation.includes("/jobs/asset-processing") && files.flowAutomation.includes("/routines/offline-sync/run"), "Automatic flow closure must test ingest automation, sync state, asset jobs, and routines.");

warn(files.app.includes("setupServerSyncPolling"), "Realtime subscription is still not implemented; current protection is server-state polling.");
warn(files.server.includes("/api/jobs/asset-processing") && files.app.includes("queueAssetProcessingJob"), "Asset processing queue is not explicitly detectable; OCR/transcription may still be partly synchronous or manual.");
warn(files.nativeBlueprint.includes("Health Connect") && files.app.includes("Health Connect"), "Health Connect is documented and represented, but physical Android permission testing still requires a device.");

if (failures.length) {
  console.error("Blueprint flow audit failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  if (warnings.length) {
    console.error("Warnings:");
    for (const item of warnings) console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log(`Blueprint flow audit passed for ${version}.`);
if (warnings.length) {
  console.log("Warnings to track:");
  for (const item of warnings) console.log(`- ${item}`);
}
