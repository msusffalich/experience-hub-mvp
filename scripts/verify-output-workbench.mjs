import { readFileSync } from "node:fs";

const app = readFileSync("app.js", "utf8");
const index = readFileSync("index.html", "utf8");
const styles = readFileSync("styles.css", "utf8");
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function expectSingleId(id) {
  const matches = index.match(new RegExp(`id="${id}"`, "g")) || [];
  expect(matches.length === 1, `${id} must appear exactly once; found ${matches.length}.`);
}

[
  "reportPrimaryControls",
  "reportModeGuide",
  "reportAdvancedFilters",
  "reportPeriodFilter",
  "reportQuickStart",
  "insightsPrimaryControls",
  "insightsModeGuide",
  "insightsAdvancedFilters",
  "insightsQuickStart",
].forEach(expectSingleId);

expect(!index.includes('class="report-flow-steps"'), "The obsolete three-step report control strip must stay removed.");
expect(index.indexOf('id="reportPeriodFilter"') < index.indexOf('id="reportAdvancedFilters"'), "The report period must remain a primary control.");
expect(index.indexOf('id="reportQuickStart"') > index.indexOf('id="reportAdvancedFilters"'), "Report presets must remain inside advanced filters.");
expect(index.indexOf('id="insightsQuickStart"') > index.indexOf('id="insightsAdvancedFilters"'), "Finding presets must remain inside advanced filters.");
expect(app.includes('renderOutputModeGuide("reportModeGuide", outputScope, "report")'), "Report mode guidance is not rendered.");
expect(app.includes('renderOutputModeGuide("insightsModeGuide", outputScope, "insights")'), "Insights mode guidance is not rendered.");
expect(app.includes("Las áreas de vida agrupan las historias."), "The distinction between life areas and human interpretation themes is missing.");
expect(app.includes("As áreas de vida agrupam as histórias."), "Portuguese guidance is missing.");
expect(app.includes("Les domaines de vie regroupent les histoires."), "French guidance is missing.");
expect(styles.includes(".output-primary-controls"), "Primary output-control styling is missing.");
expect(styles.includes(".output-mode-guide"), "Output mode-guide styling is missing.");
expect(styles.includes(".output-advanced-drawer"), "Advanced output-filter styling is missing.");

if (failures.length) {
  console.error("Output workbench verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Output workbench verification passed.");
