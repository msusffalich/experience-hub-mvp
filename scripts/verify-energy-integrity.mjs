import { readFileSync } from "node:fs";

const app = readFileSync("app.js", "utf8");
const index = readFileSync("index.html", "utf8");
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function functionBodyStart(signature, length = 2400) {
  const start = app.indexOf(signature);
  return start >= 0 ? app.slice(start, start + length) : "";
}

const energyInputTag = index.match(/<input\b[^>]*id="energyInput"[^>]*>/)?.[0] || "";
expect(Boolean(energyInputTag), "The perceived-energy input is missing.");
expect(energyInputTag.includes('type="number"'), "Perceived energy must be an optional numeric input.");
expect(!/\bvalue=/.test(energyInputTag), "Perceived energy must not have a default value.");
expect(index.includes("Vibe no inventará ni convertirá la ausencia en energía baja."), "The energy field must explain how missing data is handled.");

expect(app.includes("function getRecordedExperienceEnergy(experience = {})"), "The recorded-energy validator is missing.");
expect(app.includes("function averageRecordedEnergy(experiences = [])"), "Recorded-energy averages must share one helper.");
expect(app.includes("function formatRecordedEnergyMetric(value)"), "Missing energy must share one display formatter.");
expect(app.includes('energySource: energy == null ? null : "user"'), "Manual perceived energy must carry an explicit user source.");
expect(app.includes('document.getElementById("energyInput").value = "";'), "Clearing a story must clear perceived energy.");

[
  "function saveDailyArticleAsExperience(",
  "async function saveVoiceQuickExperience(",
  "async function convertAgendaEventToExperience(",
].forEach((signature) => {
  const body = functionBodyStart(signature);
  expect(Boolean(body), `Automatic story function is missing: ${signature}`);
  expect(body.includes("energy: null"), `Automatic story function must not invent perceived energy: ${signature}`);
  expect(body.includes("energySource: null"), `Automatic story function must mark energy as absent: ${signature}`);
});

expect(!/Number\([^\r\n]*\.energy[^\r\n]*\|\| 0/.test(app), "Missing energy must not be converted to zero.");
expect(!/average\([^\r\n]*\.map\([^\r\n]*\.energy/.test(app), "Averages must not include missing raw energy values.");
expect(!/item\.energy\s*(?:<=|>=)/.test(app), "Energy thresholds must use the recorded-energy validator.");
expect(app.includes("formatRecordedEnergyMetric(payload.summary.averageEnergy)"), "Report PDF must render missing average energy safely.");
expect(app.includes("formatRecordedEnergyMetric(axis.avgEnergy)"), "Insights must render missing average energy safely.");
expect(app.includes("No hay energía percibida registrada en ambos periodos"), "Trends must disclose insufficient perceived-energy data.");

if (failures.length) {
  console.error("Energy integrity verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Energy integrity verification passed.");
