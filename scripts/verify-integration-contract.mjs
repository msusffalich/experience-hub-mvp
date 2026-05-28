import { readFileSync } from "node:fs";

const files = {
  app: readFileSync("app.js", "utf8"),
  server: readFileSync("server.js", "utf8"),
  packageJson: readFileSync("package.json", "utf8"),
  manualBlueprint: readFileSync("docs/vibeapp-native-blueprint.md", "utf8"),
  ouraDoc: readFileSync("docs/oura-openapi-connector.md", "utf8"),
  simulator: readFileSync("scripts/simulate-vibeapp-sync.mjs", "utf8"),
};

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

[
  "/api/integration/contract",
  "/api/integration/validate",
  "/api/integration/samples",
  "buildIntegrationSampleKit",
  "buildIntegrationSampleSignals",
  "buildOuraConnectorManifest",
  "normalizeOuraPayload",
  "/api/integration/oura/manifest",
  "/api/integration/oura/normalize",
  "buildAppleHealthConnectorManifest",
  "normalizeAppleHealthPayload",
  "/api/integration/apple-health/manifest",
  "/api/integration/apple-health/normalize",
  "buildHealthConnectConnectorManifest",
  "normalizeHealthConnectPayload",
  "/api/integration/health-connect/manifest",
  "/api/integration/health-connect/normalize",
  "buildMetaWearablesConnectorManifest",
  "normalizeMetaWearablesPayload",
  "/api/integration/meta-wearables/manifest",
  "/api/integration/meta-wearables/normalize",
  "validateIntegrationSignal",
].forEach((token) => {
  assert(files.server.includes(token), `Server integration contract is missing ${token}.`);
});

[
  "meta-glasses-media-import",
  "oura-biometric-daily",
  "apple-health-workout",
  "samsung-health-sleep",
  "health-connect-activity",
  "calendar-event-import",
].forEach((token) => {
  assert(files.server.includes(token), `Server sample kit is missing ${token}.`);
});

[
  "buildDeviceIntegrationSamplePayloads",
  "buildDeviceIntegrationSampleKit",
  "Kit de integración",
  "Integration kit",
  "data-device-action=\"export-samples\"",
  "data-device-action=\"copy-samples\"",
].forEach((token) => {
  assert(files.app.includes(token), `Admin device integration UI is missing ${token}.`);
});

[
  "Meta/Oakley",
  "Oura",
  "daily_readiness",
  "Apple Health",
  "Samsung Health",
  "Health Connect",
  "Apple Health",
  "Meta Wearables",
  "idempotencyKey",
].forEach((token) => {
  assert(files.app.includes(token) && files.server.includes(token), `Integration kit must document and sample ${token}.`);
});
assert(files.server.includes("OURA_API_BASE_URL"), "Server must normalize the Oura API base URL.");

assert(files.packageJson.includes("\"verify:integrations\""), "package.json must expose verify:integrations.");
assert(files.packageJson.includes("npm run verify:integrations"), "verify:pilot must include verify:integrations.");
assert(files.simulator.includes("meta-glasses-import"), "Vibeapp simulator must still validate Meta external session imports.");
assert(files.manualBlueprint.includes("Health Connect") && files.manualBlueprint.includes("Meta"), "Vibeapp native blueprint must retain external device route guidance.");
assert(files.ouraDoc.includes("/api/integration/oura/manifest") && files.ouraDoc.includes("daily_readiness") && files.ouraDoc.includes("https://api.ouraring.com"), "Oura connector documentation must explain manifest, readiness, and the corrected API base URL.");
assert(files.ouraDoc.includes("/api/integration/apple-health/manifest") && files.ouraDoc.includes("/api/integration/health-connect/manifest") && files.ouraDoc.includes("/api/integration/meta-wearables/manifest"), "Device connector documentation must cover Apple Health, Health Connect, and Meta Wearables.");
assert(files.app.includes("Conector OpenAPI de Oura") && files.app.includes("Oura OpenAPI connector"), "Manual/Admin must explain the Oura OpenAPI connector.");
assert(files.app.includes("Rutas Apple, Samsung y Meta") && files.app.includes("Apple, Samsung, and Meta routes"), "Manual/Admin must explain Apple, Samsung, and Meta connector routes.");

if (failures.length) {
  console.error("Integration contract verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Integration contract verification passed.");
