import assert from "node:assert/strict";

const baseUrl = String(
  process.env.VIBE_PRODUCTION_URL
    || "https://experience-hub-web-production.up.railway.app",
).replace(/\/+$/, "");

const live = await requestJson("/api/v2/health/live");
assert.equal(live.response.status, 200, `V2 liveness failed: ${live.response.status}`);
assert.equal(live.body?.status, "ok", "V2 liveness did not return status=ok");

const ready = await requestJson("/api/v2/health/ready?force=1");
assert.equal(ready.response.status, 200, `V2 readiness failed: ${ready.response.status}`);
assert.equal(ready.body?.ready, true, `V2 readiness is not true: ${JSON.stringify(ready.body)}`);

const shell = await fetch(`${baseUrl}/apps/vibepwa-next/index.html`, {
  headers: { "cache-control": "no-cache" },
});
assert.equal(shell.status, 200, `VibePWA2 shell failed: ${shell.status}`);
const html = await shell.text();
assert.match(html, /<title>Vibe<\/title>/, "VibePWA2 shell is not the expected release");
assert.match(html, /src="\.\/src\/app\.js"/, "VibePWA2 application module is missing");

const email = String(process.env.VIBE_TEST_EMAIL || "").trim();
const password = String(process.env.VIBE_TEST_PASSWORD || "");
if (email && password) {
  const signIn = await requestJson("/api/v2/auth/sign-in", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  assert.equal(signIn.response.status, 200, `V2 sign-in failed: ${signIn.response.status}`);
  const accessToken = signIn.body?.access_token || signIn.body?.accessToken || "";
  assert.ok(accessToken, "V2 sign-in did not return an access token");

  const authenticatedHealth = await requestJson("/api/v2/health", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  assert.equal(
    authenticatedHealth.response.status,
    200,
    `Authenticated V2 health failed: ${authenticatedHealth.response.status}`,
  );
  assert.equal(authenticatedHealth.body?.ready, true, "Authenticated V2 health is not ready");
}

console.log(
  `VibePWA2 production verified at ${baseUrl}: live, ready and application shell passed`
    + (email && password ? ", authenticated health passed." : "."),
);

async function requestJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "cache-control": "no-cache",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { response, body };
}
