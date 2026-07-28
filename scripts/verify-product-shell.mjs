import { readFileSync } from "node:fs";

const app = readFileSync("app.js", "utf8");
const index = readFileSync("index.html", "utf8");
const styles = readFileSync("styles.css", "utf8");
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const primaryRoots = ["dashboard", "library", "assetLibrary", "report", "publications", "auth"];
const contextualViews = ["agenda", "capture", "timeline", "insights", "experienceMap", "manual", "admin", "automation"];
const primaryButtons = [...index.matchAll(/<button\b[^>]*class="[^"]*\bprimary-nav-item\b[^"]*"[^>]*>/g)].map((match) => match[0]);
const contextualButtons = [...index.matchAll(/<button\b[^>]*class="[^"]*\bcontext-nav-item\b[^"]*"[^>]*>/g)].map((match) => match[0]);

function readAttribute(tag, name) {
  return tag.match(new RegExp(`${name}="([^"]+)"`))?.[1] || "";
}

expect(primaryButtons.length === 6, "The product shell must expose exactly six primary navigation spaces.");
const primaryContracts = primaryButtons.map((tag) => ({
  view: readAttribute(tag, "data-view"),
  root: readAttribute(tag, "data-nav-root"),
}));
const contextContracts = contextualButtons.map((tag) => ({
  view: readAttribute(tag, "data-view"),
  root: readAttribute(tag, "data-nav-parent"),
}));
expect(new Set(primaryContracts.map((item) => item.view)).size === primaryContracts.length, "Primary navigation views must be unique.");
expect(new Set(primaryContracts.map((item) => item.root)).size === primaryContracts.length, "Primary navigation roots must be unique.");
primaryRoots.forEach((root) => {
  const contract = primaryContracts.find((item) => item.root === root);
  expect(Boolean(contract), `Primary navigation root is missing: ${root}.`);
  if (contract) expect(contract.view === root, `Primary route ${contract.view} must own its matching root ${root}.`);
});
contextualViews.forEach((view) => {
  const contract = contextContracts.find((item) => item.view === view);
  expect(Boolean(contract), `Contextual route is missing: ${view}.`);
  if (contract) expect(primaryRoots.includes(contract.root), `Contextual route ${view} points to an unknown root: ${contract.root}.`);
});
[...primaryContracts, ...contextContracts].forEach(({ view }) => {
  expect(index.includes(`id="${view}View"`), `Navigation route ${view} has no matching view section.`);
});

expect(index.includes('id="contextNavigation"'), "Contextual navigation container is missing.");
expect(app.includes('document.querySelectorAll(".nav-item, .context-nav-item")'), "Primary and contextual navigation must share the same event binding.");
expect(app.includes("function getProductViewContract(view)"), "Navigation must use the DOM-backed product view contract.");
expect(app.includes("if (!section || !root || !rootButton) return null;"), "Navigation must reject incomplete view contracts.");
expect(app.includes("if (getProductViewContract(view)) safeShowView(view);"), "Initial URL navigation must validate the same product view contract.");
expect(!app.includes("PRODUCT_NAV_ROOT_BY_VIEW"), "Navigation roots must not be duplicated in JavaScript.");
expect(!index.includes('onclick="showView(') && !app.includes('onclick="showView('), "Inline view navigation must stay removed.");
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
expect(index.includes('id="capture-heading">Nueva historia</h2>'), "The story workflow must not be labeled as quick capture.");

[
  'auth: "Cuenta"',
  'auth: "Account"',
  'auth: "Compte"',
  'auth: "Conta"',
  'report: "Inteligencia"',
  'report: "Intelligence"',
  'report: "Inteligência"',
  'capture: "Nueva historia"',
  'capture: "New story"',
  'capture: "Nouvelle histoire"',
  'capture: "Nova história"',
].forEach((term) => {
  expect(app.includes(term), `Four-language product navigation is incomplete: ${term}.`);
});

if (failures.length) {
  console.error("Product shell verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Product shell verification passed.");
