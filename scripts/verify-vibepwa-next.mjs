import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../apps/vibepwa-next/", import.meta.url);
const server = await readFile(new URL("../server.js", import.meta.url), "utf8");
const files = {
  html: await readFile(new URL("index.html", root), "utf8"),
  css: await readFile(new URL("styles.css", root), "utf8"),
  app: await readFile(new URL("src/app.js", root), "utf8"),
  api: await readFile(new URL("src/api.js", root), "utf8"),
  upload: await readFile(new URL("src/direct-upload.js", root), "utf8"),
  zip: await readFile(new URL("src/zip.js", root), "utf8"),
  i18n: await readFile(new URL("src/i18n.js", root), "utf8"),
  manual: await readFile(new URL("src/manual.js", root), "utf8"),
  worker: await readFile(new URL("service-worker.js", root), "utf8"),
};

assert.match(files.html, /src\/app\.js/);
assert.match(files.html, /manifest\.webmanifest/);
assert.match(files.css, /\.mobile-nav/);
assert.match(files.css, /@media \(max-width: 700px\)/);
assert.match(files.css, /\[data-theme="dark"\]/);
assert.doesNotMatch(files.css, /letter-spacing:\s*-/);

for (const route of ["home", "stories", "evidence", "intelligence", "publish", "account"]) {
  assert.match(files.app, new RegExp(`"${route}"`));
}
for (const language of ["es", "en", "fr", "pt"]) {
  assert.match(files.i18n, new RegExp(`\\b${language}: \\{`));
  assert.match(files.manual, new RegExp(`\\b${language}: \\{`));
}
for (const endpoint of [
  "/api/profile",
  "/api/experiences",
  "/api/assets",
  "/api/captures/status",
  "/api/report/pdf",
  "/api/insights/pdf",
  "/api/publication/pdf",
]) {
  assert.equal(files.app.includes(endpoint) || files.api.includes(endpoint), true, `${endpoint} missing`);
}
assert.match(files.upload, /\/api\/captures\/uploads/);
assert.match(files.upload, /\/api\/captures\/commit/);
assert.match(files.upload, /crypto\.subtle\.digest\("SHA-256"/);
assert.match(files.upload, /Tus-Resumable/);
assert.match(files.upload, /method: "HEAD"/);
assert.match(files.upload, /localStorage\.setItem\(resumeKey/);
assert.match(files.api, /\/api\/mobile\/auth\/refresh/);
assert.match(files.api, /refreshPromise/);
assert.match(files.api, /if \(!refreshed\.invalid\) throw refreshed\.error/);
assert.match(files.zip, /0x06054b50/);
assert.match(files.worker, /vibe-next-/);
assert.match(server, /url\.pathname === "\/api\/mobile\/auth\/refresh"/);
assert.match(server, /released_from_deleted_story/);
assert.doesNotMatch(
  server.match(/async function deleteExperienceCompanionRows[\s\S]*?\n\}/)?.[0] || "",
  /supabaseRest\("assets",\s*\{\s*method:\s*"DELETE"/,
);

const { createZip } = await import(new URL("src/zip.js", root));
const archive = new Uint8Array(await (await createZip([
  { name: "publicacion.pdf", blob: new Blob(["PDF"]) },
  { name: "video.mp4", blob: new Blob(["VIDEO"]) },
])).arrayBuffer());
assert.deepEqual(Array.from(archive.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04]);
assert.equal(new TextDecoder().decode(archive).includes("publicacion.pdf"), true);
assert.equal(new TextDecoder().decode(archive).includes("video.mp4"), true);

console.log("VibePWA 2 shell: routes, languages, responsive UI and direct upload passed.");
