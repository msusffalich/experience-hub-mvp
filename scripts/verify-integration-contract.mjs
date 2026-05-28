import { readFileSync } from "node:fs";

const files = {
  app: readFileSync("app.js", "utf8"),
  server: readFileSync("server.js", "utf8"),
  packageJson: readFileSync("package.json", "utf8"),
  manualBlueprint: readFileSync("docs/vibeapp-native-blueprint.md", "utf8"),
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
  "Apple Health",
  "Samsung Health",
  "Health Connect",
  "idempotencyKey",
].forEach((token) => {
  assert(files.app.includes(token) && files.server.includes(token), `Integration kit must document and sample ${token}.`);
});

assert(files.packageJson.includes("\"verify:integrations\""), "package.json must expose verify:integrations.");
assert(files.packageJson.includes("npm run verify:integrations"), "verify:pilot must include verify:integrations.");
assert(files.simulator.includes("meta-glasses-import"), "Vibeapp simulator must still validate Meta external session imports.");
assert(files.manualBlueprint.includes("Health Connect") && files.manualBlueprint.includes("Meta"), "Vibeapp native blueprint must retain external device route guidance.");

if (failures.length) {
  console.error("Integration contract verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Integration contract verification passed.");
