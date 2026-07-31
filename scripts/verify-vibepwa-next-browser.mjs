import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
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
  if (server.exitCode === null) {
    server.kill();
    await Promise.race([
      once(server, "exit"),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }
}

console.log("VibePWA 2 browser: login, eight spaces, visible manual, experience map, context, editor, responsive layout and theme passed.");

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
    if (pathname === "/api/v2/health") {
      await json(route, 200, { status: "ok", persistence: "supabase" });
      return;
    }
    if (pathname === "/api/v2/auth/refresh") {
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
    const payload = pathname === "/api/v2/profile"
      ? { userId: "user-1", email: "miguel@example.com", language: "es" }
      : pathname === "/api/v2/captures/status"
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
  await page.getByText("Winter Garden, Florida", { exact: true }).waitFor();
  await page.getByText("Reuters: actividad local reciente", { exact: true }).waitFor();
  await page.getByText("Festival de verano", { exact: true }).waitFor();
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

  for (const route of ["stories", "evidence", "agenda", "intelligence", "map", "publish", "account"]) {
    await visibleRouteButton(page, route, label).click();
    await page.waitForTimeout(50);
    assert.equal(new URL(page.url()).hash.includes(route), true, `${label}:${route}`);
    await assertNoHorizontalOverflow(page, `${label}:${route}`);
    if (route === "agenda") {
      assert.equal(await page.getByText("Reunión de planificación", { exact: true }).isVisible(), true);
    }
    if (route === "intelligence") {
      assert.equal(await page.getByText("Winter Garden, Florida", { exact: true }).isVisible(), true);
      assert.equal(await page.getByText("Festival de verano", { exact: true }).isVisible(), true);
    }
    if (route === "map") {
      assert.equal(await page.getByRole("heading", { name: "Mapa de experiencias", exact: true }).isVisible(), true);
      assert.equal(await page.getByText("Vista estructurada disponible", { exact: true }).isVisible(), true);
      assert.equal(await page.getByText("2 notas de experiencias · 2 notas de activos", { exact: true }).isVisible(), true);
      await page.screenshot({ path: path.join(outputDir, `${label}-map.png`), fullPage: true });
    }
  }

  const manualLink = label === "mobile"
    ? page.locator('.mobile-nav a[href="./manual.html"]')
    : page.locator('.side-nav a[href="./manual.html"]');
  assert.equal(await manualLink.isVisible(), true, `${label}: manual navigation must be visible`);

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
    const storyUpdate = requests.find((entry) => (
      entry.path === "/api/v2/experiences/story-1"
      && entry.method === "PUT"
    ));
    assert.ok(storyUpdate, "Quitar evidencia debe guardar la historia actualizada");
    assert.equal(
      storyUpdate.body?.legacyAssetIds?.includes("asset-1"),
      false,
      "Quitar evidencia debe retirar el vínculo sin borrar el activo",
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
  assert.equal(await page.getByRole("heading", { name: "L'écosystème Vibe", exact: true }).isVisible(), true);
  await page.locator("#manualLanguage").selectOption("pt");
  await page.waitForLoadState("networkidle");
  assert.equal(await page.getByRole("heading", { name: "O ecossistema Vibe", exact: true }).isVisible(), true);
  await assertNoHorizontalOverflow(page, "mobile:manual");
  await page.screenshot({ path: path.join(outputDir, "mobile-manual-pt.png"), fullPage: true });
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
    if (pathname === "/api/v2/health") payload = { status: "ok", persistence: "supabase" };
    else if (pathname === "/api/v2/profile") payload = { userId: "user-1", email: "miguel@example.com", name: "Miguel", language: "es" };
    else if (pathname === "/api/v2/groups") payload = [];
    else if (pathname === "/api/v2/experiences") payload = experiences;
    else if (pathname === "/api/v2/assets") payload = assets;
    else if (pathname === "/api/v2/captures") payload = [];
    else if (pathname === "/api/v2/agenda") payload = [{
      id: "agenda-1",
      title: "Reunión de planificación",
      description: "Revisión de prioridades.",
      startAt: "2026-08-01T14:00:00.000Z",
      endAt: "2026-08-01T15:00:00.000Z",
      location: "Winter Garden",
      status: "Planificado",
      sourceType: "vibeapp",
    }];
    else if (pathname === "/api/v2/captures/status") payload = { enabledForUser: true, contract: { version: "test", directUpload: { binaryTransport: "direct_to_supabase_storage" } } };
    else if (pathname === "/api/v2/context/summary") payload = {
      latestLocation: "Winter Garden, Florida",
      biometricSignals: 4,
      metrics: { heartAvg: 68, steps: 7420, sleepMinutes: 438, activeEnergy: 510 },
    };
    else if (pathname === "/api/v2/context/signals") payload = [];
    else if (pathname === "/api/v2/context/briefing") payload = {
      nextRefreshAt: "2099-08-01T14:00:00.000Z",
      payload: {
        location: { label: "Winter Garden, Florida" },
        weather: { status: "available", description: "Parcialmente nublado", temperatureC: 29, humidity: 74, source: "Open-Meteo" },
        news: { status: "available", items: [{ title: "Reuters: actividad local reciente", link: "https://example.test/news" }], impact: { level: "low", score: 18 } },
        entertainment: { status: "available", items: [{ title: "Festival de verano", link: "https://example.test/event" }] },
      },
    };
    else if (pathname === "/api/v2/integrations/oura/status") payload = { connected: false, configured: true };
    else if (pathname === "/api/v2/obsidian/preview") payload = {
      generatedAt: now,
      files: [
        { path: "02_Experiences/paseo.md", markdown: "# Paseo" },
        { path: "02_Experiences/trabajo.md", markdown: "# Trabajo" },
        { path: "04_Assets/lago.md", markdown: "# Lago" },
        { path: "04_Assets/nota.md", markdown: "# Nota" },
      ],
      map: { path: "05_Generated/mapa.md", markdown: "# Mapa" },
    };
    else if (pathname === "/api/v2/obsidian/export") payload = { ok: true, count: 5 };
    else if (pathname.includes("/download")) payload = { url: "" };
    else if (pathname.startsWith("/api/v2/experiences/")) payload = experiences[0];
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
