import { readFileSync } from "node:fs";

const files = {
  app: readFileSync("app.js", "utf8"),
  packageJson: readFileSync("package.json", "utf8"),
  smoke: readFileSync("scripts/smoke-check.mjs", "utf8"),
  control: readFileSync("scripts/audit-control.mjs", "utf8"),
  e2e: readFileSync("scripts/verify-local-e2e-flow.mjs", "utf8"),
  production: readFileSync("scripts/verify-production-e2e.mjs", "utf8"),
};

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const version = files.app.match(/const APP_VERSION = "([^"]+)";/)?.[1] || "";
const pkg = JSON.parse(files.packageJson);

check(Boolean(version), "APP_VERSION is missing.");
check(Boolean(pkg.scripts?.["verify:closure"]), "package.json must expose verify:closure.");
check(pkg.scripts?.["verify:closure"]?.includes("verify:pilot"), "verify:closure must include the complete pilot gate.");
check(files.app.includes("Cierre PWA operativo") && files.app.includes("Operational PWA closure"), "Manual/Admin must expose the PWA closure gate.");
check(files.app.includes("fase 2") || files.app.includes("phase 2"), "Manual/Admin must separate future work as phase 2.");
check(files.app.includes("Ruta operativa al 90") && files.app.includes("Operating route to 90"), "Progress model must keep operating route separate from future ambition.");
check(files.smoke.includes("verify:e2e") && files.control.includes("progress model"), "Smoke/control audits must protect the closure model.");
check(files.e2e.includes("capture E2E ok") && files.e2e.includes("library delete E2E ok") && files.e2e.includes("shared scope E2E ok"), "Local E2E must cover create, delete, and shared scope.");
check(files.production.includes("Production E2E verification passed"), "Production E2E script must verify deployed output flow.");

if (failures.length) {
  console.error("Closure verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`PWA closure verification passed for ${version}. Current delivery is the closure target; Vibeapp native, live connectors, and advanced agents are phase 2.`);
