import { readFileSync } from "node:fs";

const app = readFileSync("app.js", "utf8");
const productShell = readFileSync("product-shell.js", "utf8");
const index = readFileSync("index.html", "utf8");
const styles = readFileSync("styles.css", "utf8");
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const primaryRoots = ["dashboard", "library", "assetLibrary", "report", "publications", "auth"];
const contextualViews = ["agenda", "capture", "timeline", "insights", "experienceMap", "manual", "admin", "automation"];
const assetCardRenderer = app.slice(app.indexOf("function renderAssetCard("), app.indexOf("async function handleAssetLibraryClick("));
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
expect(index.includes('id="contextNavigationRootButton"'), "Secondary tools need an explicit return to their parent space.");
expect(index.includes('id="contextNavigationLabel"'), "Secondary tools need a clear location label.");
expect(app.includes('document.querySelectorAll(".nav-item, .context-nav-item")'), "Primary and contextual navigation must share the same event binding.");
expect(app.includes('document.getElementById("contextNavigationRootButton")?.addEventListener'), "The contextual return control is not bound.");
expect(index.indexOf("product-shell.js") < index.indexOf("app.js"), "The product shell module must load before app.js.");
expect(productShell.includes("const isRootView = view === navRoot;"), "Primary spaces must hide the contextual toolbar.");
expect(productShell.includes("navigation.hidden = isRootView"), "Contextual navigation must only appear inside a secondary tool.");
expect(app.includes("function getProductViewContract(view)"), "Navigation must use the DOM-backed product view contract.");
expect(app.includes("window.VibeProductShell?.getViewContract(view)"), "app.js must delegate view contracts to the product shell module.");
expect(app.includes("window.VibeProductShell?.activate(view)"), "app.js must delegate view activation to the product shell module.");
expect(productShell.includes("if (!section || !navRoot || !rootButton) return null;"), "Navigation must reject incomplete view contracts.");
expect(productShell.includes("global.VibeProductShell = Object.freeze"), "The product shell must expose one immutable public contract.");
expect(app.includes("if (getProductViewContract(view)) safeShowView(view);"), "Initial URL navigation must validate the same product view contract.");
expect(!app.includes("PRODUCT_NAV_ROOT_BY_VIEW"), "Navigation roots must not be duplicated in JavaScript.");
expect(!index.includes('onclick="showView(') && !app.includes('onclick="showView('), "Inline view navigation must stay removed.");
expect(!index.includes('id="dashboardDataResetButton"'), "Destructive data reset must not be visible on the daily dashboard.");

expect(index.includes('id="assetAdvancedFilters"'), "Asset technical filters must remain available in a collapsed advanced drawer.");
expect(index.includes("asset-technical-filters"), "Asset technical controls are not isolated.");
expect(index.includes('id="asset-library-heading">Evidencia</h2>'), "The evidence view must use the user-facing Evidence title.");
expect(app.includes('class="asset-card-details"'), "Evidence cards must isolate review controls in a progressive-disclosure drawer.");
expect(app.includes('class="asset-card-technical-details"'), "Evidence technical metadata must stay behind a second detail level.");
expect(app.includes('data-edit-asset-experience='), "Evidence cards must preserve the edit-story action.");
expect(!assetCardRenderer.includes('onclick="editExperience('), "Evidence cards must not use inline edit handlers.");
expect(styles.includes(".asset-card-summary"), "Evidence gallery summary styles are missing.");
expect(styles.includes(".asset-card-details-content"), "Evidence detail drawer styles are missing.");
expect(index.includes("manual-review-drawer"), "Manual review controls are not isolated.");
expect(index.includes("map-export-drawer"), "Obsidian export controls are not isolated.");
expect(index.includes('id="publicationAdvancedFilters"'), "Publication precision filters must be isolated from the primary workflow.");
expect(index.includes('id="authEntryPanel"'), "Account must separate sign-in controls from the signed-in summary.");
expect(app.includes("function handleAccountAction(event)"), "Account actions must use one explicit controller.");
expect(app.includes('entryPanel.hidden = signedIn'), "Signed-in users must not see the sign-in form.");
expect(app.includes('account-mode", signedIn'), "Account layout must distinguish the signed-in state.");
expect(styles.includes(".account-summary-panel"), "Signed-in account summary styles are missing.");
expect(!index.includes('class="admin-section-drawer" open'), "Operation technical drawers must stay collapsed by default.");
expect(index.includes('class="operation-history-drawer"'), "Historical validation controls need one isolated audit drawer.");
expect(index.indexOf('id="adminAdvancedDrawer"') < index.indexOf('id="coreMvpGatePanel"'), "Historical validation controls must remain inside Advanced diagnostics.");
expect(styles.includes(".operation-history-drawer"), "Historical validation drawer styles are missing.");
[
  '"Mi cuenta", "My account", "Mon compte", "Minha conta"',
  '"Privacidad", "Privacy", "Confidentialité", "Privacidade"',
  '"Perfil y dispositivos", "Profile and devices", "Profil et appareils", "Perfil e dispositivos"',
].forEach((copy) => expect(app.includes(copy), `Account locale contract is incomplete: ${copy}`));

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
expect(styles.includes(".context-nav-root"), "Contextual return styles are missing.");
expect(index.includes('class="space-action-bar"'), "Stories must expose frequent actions inside the space.");
expect(app.includes('data-account-action="help"'), "Account must expose Help without relying on contextual navigation.");
expect(app.includes('data-account-action="operation"'), "Account must expose Operation without relying on contextual navigation.");
expect(app.includes('data-account-action="automation"'), "Account must expose Automations without relying on contextual navigation.");
expect(styles.includes(".output-primary-controls"), "Publication primary controls need a stable layout.");
expect(index.includes('id="capture-heading">Nueva historia</h2>'), "The story workflow must not be labeled as quick capture.");
expect(index.includes('id="storyBuilderStepper"'), "New story must expose a real three-step editor.");
expect((index.match(/data-story-step="/g) || []).length >= 3, "Story editor must expose Tell, Choose, and Review steps.");
expect(index.includes('id="storyBuilderReview"'), "Story editor review summary is missing.");
expect(app.includes("function setCaptureStoryStep("), "Story editor step controller is missing.");
expect(app.includes("function renderStoryBuilderReview("), "Story editor review renderer is missing.");
expect(styles.includes(".story-builder-stepper"), "Story editor stepper styles are missing.");
expect(styles.includes(".story-review-evidence-strip"), "Story review evidence preview styles are missing.");
expect(app.includes("function renderLibraryStoryCard("), "Library must use the simplified story card renderer.");
expect(app.includes("function setExperienceCurationMode("), "Story curation needs an explicit guided-action controller.");
expect(app.includes('state.curationMode = "overview"'), "Story curation must open on the action chooser.");
expect(app.includes('class="story-curation-action-grid"'), "Story curation action chooser is missing.");
expect(app.includes('class="library-more-actions"'), "Secondary Library actions must use progressive disclosure.");
expect(styles.includes(".library-card-narrative"), "Library narrative-first card styles are missing.");
expect(styles.includes(".story-curation-preview"), "Story curation evidence previews are missing.");
expect(styles.includes(".story-curation-action-grid"), "Story curation action styles are missing.");
expect(index.includes('class="library-filter-drawer"'), "Library filters must collapse on small screens.");
expect(styles.includes(".library-filter-drawer:not([open]) > .filters"), "Responsive Library filter disclosure styles are missing.");

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
  'assetLibrary: "Evidencia"',
  'assetLibrary: "Evidence"',
  'assetLibrary: "Preuves"',
  'assetLibrary: "Evidências"',
].forEach((term) => {
  expect(app.includes(term), `Four-language product navigation is incomplete: ${term}.`);
});

if (failures.length) {
  console.error("Product shell verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Product shell verification passed.");
