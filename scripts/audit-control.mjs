import { readFileSync } from "node:fs";

const files = {
  app: readFileSync("app.js", "utf8"),
  productShell: readFileSync("product-shell.js", "utf8"),
  index: readFileSync("index.html", "utf8"),
  serviceWorker: readFileSync("service-worker.js", "utf8"),
  reset: readFileSync("reset.html", "utf8"),
  packageJson: readFileSync("package.json", "utf8"),
  runtimeAudit: readFileSync("scripts/audit-runtime-helpers.mjs", "utf8"),
};

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const version = files.app.match(/const APP_VERSION = "([^"]+)";/)?.[1] || "";
check(Boolean(version), "APP_VERSION is missing.");

for (const [name, text] of Object.entries({
  index: files.index,
  serviceWorker: files.serviceWorker,
  reset: files.reset,
})) {
  check(text.includes(version), `${name} does not reference the current APP_VERSION.`);
}

check(files.index.includes(`app.js?v=${version}`), "index.html is not loading the current app.js.");
check(files.index.includes(`product-shell.js?v=${version}`), "index.html is not loading the current product shell.");
check(files.index.includes(`styles.css?v=${version}`), "index.html is not loading the current styles.css.");
check(files.index.includes(`manifest.webmanifest?v=${version}`), "index.html is not loading the current manifest.");
check(files.serviceWorker.includes(`experience-hub-pwa-${version}`), "service-worker cache name is not aligned with APP_VERSION.");
check(files.serviceWorker.includes("NETWORK_ONLY_PATHS") && files.serviceWorker.includes('"/product-shell.js"') && files.serviceWorker.includes('"/app.js"') && files.serviceWorker.includes('cache: "no-store"'), "app shell files must bypass the service worker cache.");
check(files.productShell.includes("global.VibeProductShell = Object.freeze"), "product-shell.js does not expose the stable navigation contract.");
check(files.reset.includes("getRegistrations") && files.reset.includes("caches.keys"), "reset.html must clear service workers and caches.");

check(files.app.includes("const fullAmbitionOverall"), "global progress does not separate current delivery from future ambition.");
check(files.app.includes("const operatingPwaScore") && files.app.includes("compuerta PWA verificable"), "global progress does not expose the verifiable PWA delivery gate.");
check(files.app.includes("Ruta operativa al 90") && files.app.includes("Operating route to 90"), "global progress must separate the operating route from future native/connectors horizon.");
check(files.app.includes("Entrega actual") && files.app.includes("Current delivery"), "global progress labels must use current delivery.");
check(!files.app.includes('overall: "Entrega global"'), "global progress still exposes the old ambiguous Entrega global label.");
check(files.app.includes("Estado global de avance mide capacidades implementadas"), "Spanish manual is missing the capability-based progress explanation.");
check(files.app.includes("Global Progress measures implemented and verifiable product capabilities"), "English manual is missing the capability-based progress explanation.");

check(files.app.includes("Auditoría de control de release"), "Admin does not expose the release control audit.");
check(files.app.includes("Release control audit"), "English Admin does not expose the release control audit.");
check(files.app.includes("npm run audit:control"), "Manual/Admin does not mention npm run audit:control.");
check(files.packageJson.includes('"audit:control"'), "package.json does not expose audit:control.");
check(files.packageJson.includes('"audit:runtime"'), "package.json does not expose audit:runtime.");
check(files.packageJson.includes('"verify:closure"') && files.packageJson.includes("npm run verify:pilot && node scripts/verify-closure.mjs"), "package.json does not expose the final PWA closure gate.");
check(files.packageJson.includes("npm run audit:control") && files.packageJson.includes('"verify:release"'), "verify:release does not include the control audit.");
check(files.packageJson.includes("npm run audit:runtime"), "check does not include the runtime helper audit.");
check(files.runtimeAudit.includes("Runtime helper audit passed"), "runtime helper audit script is missing its success guard.");

if (failures.length) {
  console.error("Control audit failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Control audit passed for ${version}: version, PWA reset, progress model, Manual/Admin, and release scripts.`);
