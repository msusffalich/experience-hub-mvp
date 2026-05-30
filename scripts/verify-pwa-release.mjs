import { readFileSync, statSync } from "node:fs";

const app = readFileSync("app.js", "utf8");
const index = readFileSync("index.html", "utf8");
const serviceWorker = readFileSync("service-worker.js", "utf8");
const reset = readFileSync("reset.html", "utf8");
const manifest = JSON.parse(readFileSync("manifest.webmanifest", "utf8"));

const version = app.match(/const APP_VERSION = "([^"]+)";/)?.[1];
if (!version) throw new Error("APP_VERSION missing from app.js.");

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

check(index.includes(`app.js?v=${version}`), "index.html does not reference the current app.js version.");
check(index.includes(`styles.css?v=${version}`), "index.html does not reference the current styles.css version.");
check(index.includes(`manifest.webmanifest?v=${version}`), "index.html does not reference the current manifest version.");
check(serviceWorker.includes(version), "service-worker.js cache name does not include the current app version.");
check(reset.includes(version), "reset.html does not redirect to the current app version.");
check(reset.includes("getRegistrations") && reset.includes("caches.keys"), "reset.html must clear service workers and app caches.");
check(serviceWorker.includes("NETWORK_ONLY_PATHS") && serviceWorker.includes('"/app.js"') && serviceWorker.includes('cache: "no-store"'), "service worker must bypass caching for app shell files.");
check(app.includes("const fullAmbitionOverall") && app.includes("Current delivery") && app.includes("Entrega actual"), "global progress must separate current delivery from full future ambition.");
check(app.includes("const operatingPwaScore") && app.includes("Release PWA verificable") && app.includes("verifiable PWA gate"), "global progress must include the verified PWA delivery gate.");
check(app.includes("Ruta operativa al 90") && app.includes("Operating route to 90"), "global progress must separate the operating route from future native/connectors horizon.");
check(app.includes("Estado global de avance mide capacidades implementadas") && app.includes("Global Progress measures implemented"), "manual must explain that progress is capability-based, not browser-data-based.");
check(Array.isArray(manifest.icons) && manifest.icons.length >= 2, "manifest must declare at least 192 and 512 icons.");
check(manifest.display === "standalone", "manifest display must be standalone.");
check(manifest.start_url?.includes("view=dashboard"), "manifest start_url should open the operational dashboard.");
check(manifest.scope === "/", "manifest scope must cover the whole app.");
check(manifest.theme_color && manifest.background_color, "manifest must define theme and background colors.");

for (const icon of manifest.icons || []) {
  const localPath = icon.src?.replace(/^\//, "");
  try {
    const stat = statSync(localPath);
    check(stat.size > 1000, `manifest icon ${icon.src} is too small or empty.`);
  } catch {
    check(false, `manifest icon ${icon.src} is missing.`);
  }
  check(icon.purpose?.includes("maskable"), `manifest icon ${icon.src} should support maskable purpose.`);
}

const shellFiles = [
  "/icons/vibe-icon-192.png",
  "/icons/vibe-icon-512.png",
  "/icons/vibe-apple-touch.png",
];
for (const file of shellFiles) {
  check(serviceWorker.includes(`"${file}"`), `service worker app shell is missing ${file}.`);
}

const releaseUrl = process.env.VIBE_RELEASE_URL || "";
if (releaseUrl) {
  const base = releaseUrl.replace(/\/$/, "");
  const appResponse = await fetch(`${base}/app.js?verify=${encodeURIComponent(version)}`);
  check(appResponse.ok, `production app.js responded ${appResponse.status}.`);
  if (appResponse.ok) {
    const productionApp = await appResponse.text();
    check(productionApp.includes(`APP_VERSION = "${version}"`), `production app.js is not serving ${version}.`);
  }
  const healthResponse = await fetch(`${base}/api/health`);
  check(healthResponse.ok, `production health responded ${healthResponse.status}.`);
  if (healthResponse.ok) {
    const health = await healthResponse.json();
    check(health.status === "ok", "production health status is not ok.");
    check(Boolean(health.supabaseConfigured), "production health does not report Supabase configured.");
    check(health.mediaStorage === "supabase-storage", "production health does not report Supabase Storage media.");
  }
  const resetResponse = await fetch(`${base}/reset.html?verify=${encodeURIComponent(version)}`);
  check(resetResponse.ok, `production reset.html responded ${resetResponse.status}.`);
  if (resetResponse.ok) {
    const resetHtml = await resetResponse.text();
    check(resetHtml.includes(version), "production reset.html is not serving the current version.");
    check(resetHtml.includes("getRegistrations") && resetHtml.includes("caches.keys"), "production reset.html does not clear PWA caches.");
  }
}

if (failures.length) {
  console.error("PWA release verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`PWA release verification passed for ${version}${releaseUrl ? ` at ${releaseUrl}` : ""}.`);
