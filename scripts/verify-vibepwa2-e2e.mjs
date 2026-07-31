import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = new URL("../apps/vibepwa-next/", import.meta.url);
const sourceRoot = new URL("src/", appRoot);
const sourceFiles = await listFiles(sourceRoot, (name) => name.endsWith(".js"));
const sources = new Map();

for (const file of sourceFiles) {
  const value = await readFile(file, "utf8");
  sources.set(fileURLToPath(file), value);
  const result = spawnSync(process.execPath, ["--check", fileURLToPath(file)], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(
    result.status,
    0,
    `Syntax error in ${fileURLToPath(file)}:\n${result.stderr || result.stdout}`,
  );
}

const app = await readFile(new URL("app.js", sourceRoot), "utf8");
const api = await readFile(new URL("api.js", sourceRoot), "utf8");
const upload = await readFile(new URL("direct-upload.js", sourceRoot), "utf8");
const i18n = await readFile(new URL("i18n.js", sourceRoot), "utf8");
const html = await readFile(new URL("index.html", appRoot), "utf8");
const worker = await readFile(new URL("service-worker.js", appRoot), "utf8");

const endpointReferences = [];
for (const [file, source] of sources) {
  for (const match of source.matchAll(/\/api\/[A-Za-z0-9_?&=./:${}-]*/g)) {
    endpointReferences.push({ file, endpoint: match[0] });
  }
}
assert.ok(endpointReferences.length >= 20, "Expected a meaningful V2 endpoint inventory");
for (const reference of endpointReferences) {
  assert.equal(
    reference.endpoint.startsWith("/api/v2/"),
    true,
    `Legacy API reference ${reference.endpoint} remains in ${reference.file}`,
  );
}

const expectedEndpointFragments = [
  "/api/v2/auth/sign-in",
  "/api/v2/auth/refresh",
  "/api/v2/health",
  "/api/v2/profile",
  "/api/v2/groups",
  "/api/v2/experiences",
  "/api/v2/assets",
  "/api/v2/captures?intent=evidence",
  "/api/v2/captures/status",
  "/api/v2/captures/uploads",
  "/api/v2/captures/commit",
  "/api/v2/agenda",
  "/api/v2/context/summary",
  "/api/v2/outputs/report/pdf",
  "/api/v2/outputs/insights/pdf",
  "/api/v2/outputs/publication/pdf",
  "/api/v2/integrations/oura/status",
];
const combined = [...sources.values()].join("\n");
for (const endpoint of expectedEndpointFragments) {
  assert.equal(combined.includes(endpoint), true, `Missing frontend endpoint ${endpoint}`);
}
assert.doesNotMatch(combined, /\/api\/mobile\//);
assert.doesNotMatch(combined, /\/api\/(?:experiences|assets|captures|report|insights|publication)(?:[/?`'"])/);

assert.match(api, /Promise\.allSettled\(/);
assert.match(api, /\["health",\s*"\/api\/v2\/health"/);
assert.doesNotMatch(
  api.match(/export async function loadWorkspace\(previous = \{\}\)[\s\S]*?\n\}/)?.[0] || "",
  /\.catch\(\(\)\s*=>/,
  "Workspace load must not hide failed V2 services",
);

for (const language of ["es", "en", "fr", "pt"]) {
  assert.match(i18n, new RegExp(`\\b${language}: \\{`), `Missing ${language} UI dictionary`);
}
for (const route of ["home", "stories", "evidence", "intelligence", "publish", "account"]) {
  assert.match(app, new RegExp(`"${route}"`), `Missing ${route} workspace`);
}
assert.match(html, /src\/app\.js/);
assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);

const kindRules = [
  [/type\.startsWith\("image\/"\)[\s\S]*return "image"/, "image"],
  [/type\.startsWith\("audio\/"\)[\s\S]*return "audio"/, "audio"],
  [/type\.startsWith\("video\/"\)[\s\S]*return "video"/, "video"],
  [/health\|biometr\|oura\|sleep\|heart[\s\S]*return "biometric"/i, "biometric"],
  [/return "document"/, "document"],
];
for (const [pattern, kind] of kindRules) {
  assert.match(upload, pattern, `Missing ${kind} upload classification`);
}
assert.match(upload, /crypto\.subtle\.digest\("SHA-256"/);
assert.match(upload, /occurredAt:\s*options\.occurredAt\s*\|\|/);
assert.match(upload, /idempotencyKey/);
assert.match(upload, /\/api\/v2\/captures\/uploads/);
assert.match(upload, /\/api\/v2\/captures\/commit/);
assert.match(upload, /Tus-Resumable/);
assert.match(upload, /method:\s*"HEAD"/);

const recordedEnergy = app.match(/function recordedEnergy\(stories\)\s*\{[\s\S]*?\n\}/)?.[0] || "";
const analyticalPayload = app.match(/function analyticalPayload\(stories\)\s*\{[\s\S]*?\n\}/)?.[0] || "";
assert.match(recordedEnergy, /Number\.isFinite\(value\)\s*&&\s*value\s*>\s*0/);
assert.doesNotMatch(recordedEnergy, /\|\|\s*(?:5|7|10)\b/);
assert.match(analyticalPayload, /averageEnergy:\s*energy\.length\s*\?[\s\S]*:\s*null/);
assert.doesNotMatch(analyticalPayload, /averageEnergy:\s*(?:5|7|10)\b/);
assert.doesNotMatch(combined, /\benergy\s*:\s*(?:5|7|10)\b/);

const { createZip } = await import(new URL("zip.js", sourceRoot));
const archive = new Uint8Array(await (await createZip([
  { name: "publicacion.pdf", blob: new Blob(["PDF"]) },
  { name: "video.mp4", blob: new Blob(["VIDEO"]) },
])).arrayBuffer());
assert.deepEqual(Array.from(archive.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04]);
const archiveText = new TextDecoder().decode(archive);
assert.equal(archiveText.includes("publicacion.pdf"), true);
assert.equal(archiveText.includes("video.mp4"), true);

console.log(
  `VibePWA2 verified: ${endpointReferences.length} V2 references, ${sourceFiles.length} syntax checks, four languages, asset matrix, null-safe energy and publication ZIP.`,
);

async function listFiles(directoryUrl, predicate) {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directoryUrl);
    if (entry.isDirectory()) files.push(...await listFiles(url, predicate));
    else if (predicate(entry.name)) files.push(url);
  }
  return files;
}
