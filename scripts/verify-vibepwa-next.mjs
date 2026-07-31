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
  queue: await readFile(new URL("src/upload-queue.js", root), "utf8"),
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

for (const route of ["home", "stories", "evidence", "agenda", "intelligence", "map", "publish", "account"]) {
  assert.match(files.app, new RegExp(`"${route}"`));
}
assert.match(files.app, /function mapView\(\)/);
assert.match(files.app, /manualNavLink\(\)/);
assert.match(files.app, /manualNavLink\(true\)/);
assert.match(files.app, /href="\.\/manual\.html"/);
assert.match(files.app, /request\("\/api\/v2\/obsidian\/preview"\)/);
assert.match(files.app, /request\("\/api\/v2\/obsidian\/export"/);
for (const language of ["es", "en", "fr", "pt"]) {
  assert.match(files.i18n, new RegExp(`\\b${language}: \\{`));
  assert.match(files.manual, new RegExp(`\\b${language}: \\{`));
}
for (const endpoint of [
  "/api/v2/profile",
  "/api/v2/groups",
  "/api/v2/experiences",
  "/api/v2/assets",
  "/api/v2/captures/status",
  "/api/v2/context/summary",
  "/api/v2/integrations/oura/status",
  "/api/v2/obsidian/preview",
  "/api/v2/obsidian/export",
  "/api/v2/outputs/report/pdf",
  "/api/v2/outputs/insights/pdf",
  "/api/v2/outputs/publication/pdf",
]) {
  assert.equal(files.app.includes(endpoint) || files.api.includes(endpoint), true, `${endpoint} missing`);
}
assert.match(files.upload, /\/api\/v2\/captures\/uploads/);
assert.match(files.upload, /\/api\/v2\/captures\/commit/);
assert.match(files.upload, /crypto\.subtle\.digest\("SHA-256"/);
assert.match(files.upload, /Tus-Resumable/);
assert.match(files.upload, /method: "HEAD"/);
assert.doesNotMatch(files.upload, /localStorage\./);
assert.match(files.queue, /indexedDB\.open/);
assert.match(files.queue, /idempotencyKey/);
assert.match(files.queue, /occurredAt/);
assert.match(files.api, /\/api\/v2\/auth\/refresh/);
assert.match(files.api, /refreshPromise/);
assert.match(files.api, /if \(!refreshed\.invalid\) throw refreshed\.error/);
assert.match(
  files.api,
  /invalid:\s*response\.status === 400 \|\| response\.status === 401 \|\| response\.status === 403/,
  "A refresh token rejected by an older Supabase session must be cleared",
);
assert.match(files.zip, /0x06054b50/);
assert.match(files.worker, /vibe-next-/);
assert.match(server, /url\.pathname\.startsWith\("\/api\/v2\/"\)/);
assert.match(server, /createVibeApiV2/);
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

const storage = new Map();
globalThis.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
};
const sessionEvents = [];
globalThis.CustomEvent = class CustomEvent {
  constructor(type) {
    this.type = type;
  }
};
globalThis.window = {
  dispatchEvent(event) {
    sessionEvents.push(event.type);
  },
};
const apiModule = await import(new URL(`src/api.js?session-test=${Date.now()}`, root));
apiModule.setSession({
  accessToken: "legacy-access",
  refreshToken: "valid-refresh",
  user: { id: "user-1" },
});
let refreshCalls = 0;
globalThis.fetch = async (path, options = {}) => {
  if (path === "/api/v2/auth/refresh") {
    refreshCalls += 1;
    return jsonResponse(200, {
      accessToken: "fresh-access",
      refreshToken: "fresh-refresh",
      user: { id: "user-1" },
    });
  }
  const authorization = new Headers(options.headers || {}).get("Authorization");
  return authorization === "Bearer fresh-access"
    ? jsonResponse(200, { ok: true, path })
    : jsonResponse(401, { error: "auth_invalid" });
};
const recovered = await Promise.all(
  Array.from({ length: 12 }, (_, index) => apiModule.request(`/api/v2/test/${index}`)),
);
assert.equal(recovered.every((item) => item.ok), true);
assert.equal(refreshCalls, 1, "Concurrent module failures must share one session refresh");
assert.equal(apiModule.getSession().accessToken, "fresh-access");
assert.deepEqual(sessionEvents, []);

apiModule.setSession({
  accessToken: "expired-access",
  refreshToken: "expired-refresh",
  user: { id: "user-1" },
});
globalThis.fetch = async (path) => path === "/api/v2/auth/refresh"
  ? jsonResponse(403, { error: "supabase_403" })
  : jsonResponse(401, { error: "auth_invalid" });
await assert.rejects(() => apiModule.request("/api/v2/profile"), (error) => error?.status === 401);
assert.equal(apiModule.getSession(), null, "An unrecoverable legacy session must be removed");
assert.deepEqual(sessionEvents, ["vibe:session-expired"]);

console.log("VibePWA 2 shell: routes, languages, responsive UI and direct upload passed.");

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
