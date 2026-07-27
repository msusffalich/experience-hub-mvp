import { readFileSync } from "node:fs";

const app = readFileSync("app.js", "utf8");
const index = readFileSync("index.html", "utf8");
const styles = readFileSync("styles.css", "utf8");
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function countMatches(value, pattern) {
  return (value.match(pattern) || []).length;
}

const primaryRoots = ["dashboard", "library", "assetLibrary", "report", "publications", "auth"];
const contextualViews = ["agenda", "capture", "timeline", "insights", "experienceMap", "manual", "admin", "automation"];

expect(countMatches(index, /class="nav-item primary-nav-item/g) === 6, "The product shell must expose exactly six primary navigation spaces.");
primaryRoots.forEach((root) => {
  expect(index.includes(`data-nav-root="${root}"`), `Primary navigation root is missing: ${root}.`);
});
contextualViews.forEach((view) => {
  expect(index.includes(`class="context-nav-item" data-view="${view}"`), `Contextual route is missing: ${view}.`);
  expect(app.includes(`${view}: "`), `Navigation root mapping is missing: ${view}.`);
});

expect(index.includes('id="contextNavigation"'), "Contextual navigation container is missing.");
expect(app.includes('document.querySelectorAll(".nav-item, .context-nav-item")'), "Primary and contextual navigation must share the same event binding.");
expect(app.includes("if (!section) return;"), "Views must remain reachable even when they are not primary navigation buttons.");
expect(!index.includes('id="dashboardDataResetButton"'), "Destructive data reset must not be visible on the daily dashboard.");

expect(index.includes('id="assetAdvancedFilters"'), "Asset technical filters must remain available in a collapsed advanced drawer.");
expect(index.includes("asset-technical-filters"), "Asset technical controls are not isolated.");
expect(index.includes("manual-review-drawer"), "Manual review controls are not isolated.");
expect(index.includes("map-export-drawer"), "Obsidian export controls are not isolated.");
expect(index.includes('id="publicationAdvancedFilters"'), "Publication precision filters must be isolated from the primary workflow.");

[
  "embeddingBackfillButton",
  "workspaceBackfillButton",
  "refreshOpsButton",
  "syncOfflineButton",
  "supabaseDiagnosticsButton",
  "supabaseSelfTestButton",
].forEach((id) => {
  expect(!index.includes(`id="${id}"`), `Duplicated operation control must stay removed from the visible shell: ${id}.`);
});

expect(app.includes("sync: syncOfflineQueue"), "Offline sync must remain available in product settings.");
expect(app.includes("verify: runSupabaseDiagnostics"), "Supabase verification must remain available in product settings.");
expect(app.includes("selftest: runSupabaseSelfTest"), "Supabase self-test must remain available in product settings.");

expect(styles.includes(".context-navigation"), "Contextual navigation styles are missing.");
expect(styles.includes(".context-nav-item"), "Contextual navigation item styles are missing.");
expect(styles.includes(".output-primary-controls"), "Publication primary controls need a stable layout.");

[
  'auth: "Cuenta"',
  'auth: "Account"',
  'auth: "Compte"',
  'auth: "Conta"',
  'report: "Inteligencia"',
  'report: "Intelligence"',
  'report: "Inteligência"',
].forEach((term) => {
  expect(app.includes(term), `Four-language product navigation is incomplete: ${term}.`);
});

if (failures.length) {
  console.error("Product shell verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Product shell verification passed.");
