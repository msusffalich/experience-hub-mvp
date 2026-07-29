import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const port = 5392;
const baseUrl = `http://127.0.0.1:${port}`;
const outputDir = path.resolve("artifacts/vibepwa-next");
await mkdir(outputDir, { recursive: true });

const server = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    NODE_ENV: "test",
    STORAGE_ADAPTER: "json-file",
    CAPTURE_PIPELINE_MODE: "off",
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
const logs = [];
server.stdout.on("data", (chunk) => logs.push(chunk.toString("utf8")));
server.stderr.on("data", (chunk) => logs.push(chunk.toString("utf8")));

try {
  await waitForServer();
  const browser = await launchBrowser();
  try {
    await verifyLogin(browser);
    await verifySessionRefresh(browser);
    await verifyProduct(browser, { width: 1440, height: 1000 }, "desktop");
    await verifyProduct(browser, { width: 390, height: 844 }, "mobile");
    await verifyManualLanguages(browser);
  } finally {
    await browser.close();
  }
} finally {
  if (server.exitCode === null) server.kill();
}

console.log("VibePWA 2 browser: login, six spaces, story editor, responsive layout and theme passed.");

async function verifyLogin(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/apps/vibepwa-next/index.html`, { waitUntil: "networkidle" });
  await page.locator("#loginForm").waitFor();
  assert.equal(await page.locator("#loginEmail").isVisible(), true);
  assert.equal(await page.locator("#loginPassword").isVisible(), true);
  await page.screenshot({ path: path.join(outputDir, "login-mobile.png"), fullPage: true });
  await context.close();
}

async function verifySessionRefresh(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    localStorage.setItem("experience-hub-session", JSON.stringify({
      accessToken: "expired-token",
      refreshToken: "refresh-token",
      user: { id: "user-1", email: "miguel@example.com" },
    }));
  });
  const page = await context.newPage();
  let refreshRequests = 0;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/health") {
      await json(route, 200, { status: "ok", persistence: "supabase" });
      return;
    }
    if (pathname === "/api/mobile/auth/refresh") {
      refreshRequests += 1;
      await json(route, 200, {
        accessToken: "fresh-token",
        refreshToken: "refresh-token-2",
        user: { id: "user-1", email: "miguel@example.com" },
      });
      return;
    }
    if (request.headers().authorization !== "Bearer fresh-token") {
      await json(route, 401, { error: "expired" });
      return;
    }
    const payload = pathname === "/api/profile"
      ? { userId: "user-1", email: "miguel@example.com", language: "es" }
      : pathname === "/api/captures/status"
        ? { enabledForUser: true }
        : [];
    await json(route, 200, payload);
  });
  await page.goto(`${baseUrl}/apps/vibepwa-next/index.html`, { waitUntil: "networkidle" });
  await page.locator(".metric-strip").waitFor();
  assert.equal(refreshRequests, 1, "Las solicitudes paralelas deben compartir una sola renovación");
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem("experience-hub-session")));
  assert.equal(session.accessToken, "fresh-token");
  assert.equal(session.refreshToken, "refresh-token-2");
  await context.close();
}

async function verifyProduct(browser, viewport, label) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    localStorage.setItem("experience-hub-session", JSON.stringify({
      accessToken: "test-token",
      user: { id: "user-1", email: "miguel@example.com" },
    }));
  });
  const page = await context.newPage();
  const requests = await installApiMocks(page);
  await page.goto(`${baseUrl}/apps/vibepwa-next/index.html`, { waitUntil: "networkidle" });
  await page.locator(".metric-strip").waitFor({ state: "attached" });
  await page.waitForTimeout(100);
  if (!(await page.locator(".metric-strip").isVisible())) {
    const debug = await page.evaluate(() => {
      const metric = document.querySelector(".metric-strip");
      const style = metric ? getComputedStyle(metric) : null;
      return {
        url: location.href,
        viewport: { width: innerWidth, height: innerHeight },
        body: { width: document.body.getBoundingClientRect().width, scrollWidth: document.body.scrollWidth },
        shell: document.querySelector(".shell")?.getBoundingClientRect().toJSON(),
        main: document.querySelector(".main")?.getBoundingClientRect().toJSON(),
        content: document.querySelector(".content")?.getBoundingClientRect().toJSON(),
        bodyText: document.body.innerText.slice(0, 500),
        metric: metric ? {
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          width: metric.getBoundingClientRect().width,
          height: metric.getBoundingClientRect().height,
        } : null,
      };
    });
    throw new Error(`metric_strip_not_visible:${JSON.stringify(debug)}`);
  }
  await assertNoHorizontalOverflow(page, `${label}:home`);
  await page.screenshot({ path: path.join(outputDir, `${label}-home.png`), fullPage: true });

  for (const route of ["stories", "evidence", "intelligence", "publish", "account"]) {
    await visibleRouteButton(page, route, label).click();
    await page.waitForTimeout(50);
    assert.equal(new URL(page.url()).hash.includes(route), true, `${label}:${route}`);
    await assertNoHorizontalOverflow(page, `${label}:${route}`);
  }

  await visibleRouteButton(page, "stories", label).click();
  await page.locator('[data-action="new-story"]').click();
  assert.equal(await page.locator("#storyForm").isVisible(), true);
  await page.locator("#storyTitle").fill("Una historia de prueba");
  await page.locator("#storyNarrative").fill("Probamos una interfaz simple para contar lo vivido.");
  await assertNoHorizontalOverflow(page, `${label}:story-modal`);
  await page.locator("[data-modal-close]").first().click();

  if (label === "desktop") {
    await page.locator("[data-story-id='story-1']").click();
    const linked = page.locator("[data-picker-id='asset-1']");
    assert.equal(await linked.isChecked(), true, "La evidencia vinculada debe mostrarse seleccionada");
    await linked.uncheck();
    await page.locator("#storyForm [type='submit']").click();
    await page.waitForTimeout(100);
    assert.equal(
      requests.some((entry) => entry.path === "/api/assets/reassign" && entry.body?.release === true),
      true,
      "Quitar evidencia debe usar la liberación no destructiva",
    );
  }

  await visibleRouteButton(page, "account", label).click();
  await page.locator('[data-theme-choice="dark"]').click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  if (label === "desktop") {
    await page.locator("#languageSelect").selectOption("fr");
    assert.equal(await page.locator(".topbar h1").textContent(), "Compte");
    await page.locator("#languageSelect").selectOption("pt");
    assert.equal(await page.locator(".topbar h1").textContent(), "Conta");
  }
  await page.screenshot({ path: path.join(outputDir, `${label}-account-dark.png`), fullPage: true });
  await context.close();
}

async function verifyManualLanguages(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => localStorage.setItem("vibe-next-language", "fr"));
  const page = await context.newPage();
  await page.goto(`${baseUrl}/apps/vibepwa-next/manual.html`, { waitUntil: "networkidle" });
  assert.equal(await page.locator("h2").first().textContent(), "Une idée simple");
  await page.locator("#manualLanguage").selectOption("pt");
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator("h2").first().textContent(), "Uma ideia simples");
  await assertNoHorizontalOverflow(page, "mobile:manual");
  await context.close();
}

function visibleRouteButton(page, route, label) {
  const matches = page.locator(`[data-route="${route}"]`);
  return label === "mobile" ? matches.last() : matches.first();
}

async function installApiMocks(page) {
  const requests = [];
  const now = "2026-07-29T15:00:00.000Z";
  const experiences = [
    {
      id: "story-1",
      title: "Paseo junto al lago",
      category: "Paseo",
      timestamp: now,
      duration: 75,
      mood: "Calmo",
      energy: 8,
      location: "Winter Garden",
      people: "Miguel y Ana",
      notes: "Caminamos junto al lago y conversamos sobre los planes del verano.",
      attachments: [{ id: "asset-1", name: "lago.jpg", type: "image/jpeg" }],
      events: [],
    },
    {
      id: "story-2",
      title: "Cierre de jornada",
      category: "Trabajo",
      timestamp: "2026-07-28T21:00:00.000Z",
      duration: 120,
      mood: "Enfocado",
      energy: 6,
      notes: "Cerramos los acuerdos del proyecto y definimos las prioridades de mañana.",
      attachments: [],
      events: [],
    },
  ];
  const assets = [
    {
      id: "asset-1",
      name: "lago.jpg",
      type: "image/jpeg",
      payloadType: "image",
      capturedAt: now,
      adoptionStatus: "inbox",
      targetLayer: "evidence",
      experienceId: "story-1",
    },
    {
      id: "asset-2",
      name: "nota.m4a",
      type: "audio/mp4",
      payloadType: "audio",
      capturedAt: now,
      adoptionStatus: "inbox",
      targetLayer: "evidence",
    },
  ];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    let requestBody = null;
    try {
      requestBody = route.request().postDataJSON();
    } catch {
      requestBody = null;
    }
    requests.push({ path: pathname, method: route.request().method(), body: requestBody });
    let payload = {};
    if (pathname === "/api/health") payload = { status: "ok", persistence: "supabase" };
    else if (pathname === "/api/profile") payload = { userId: "user-1", email: "miguel@example.com", name: "Miguel", language: "es" };
    else if (pathname === "/api/experiences") payload = experiences;
    else if (pathname === "/api/assets") payload = assets;
    else if (pathname === "/api/captures") payload = [];
    else if (pathname === "/api/agenda") payload = [];
    else if (pathname === "/api/captures/status") payload = { enabledForUser: true, contract: { version: "test", directUpload: { binaryTransport: "direct_to_supabase_storage" } } };
    else if (pathname.includes("/download")) payload = { url: "" };
    else if (pathname.startsWith("/api/experiences/")) payload = experiences[0];
    else payload = { ok: true };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });
  return requests;
}

async function json(route, status, payload) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

async function assertNoHorizontalOverflow(page, label) {
  const result = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    root: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  assert.equal(result.body <= result.viewport + 1, true, `${label}: body overflow ${JSON.stringify(result)}`);
  assert.equal(result.root <= result.viewport + 1, true, `${label}: root overflow ${JSON.stringify(result)}`);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`vibepwa_next_server_not_ready:${logs.join("").slice(-1000)}`);
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: "msedge", headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}
