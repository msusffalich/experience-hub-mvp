import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const app = readFileSync("app.js", "utf8");
const version = app.match(/const APP_VERSION = "([^"]+)";/)?.[1];
if (!version) throw new Error("APP_VERSION missing from app.js.");

const BROWSER_CANDIDATES = [
  process.env.VIBE_E2E_BROWSER,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

const browserPath = BROWSER_CANDIDATES.find((candidate) => existsSync(candidate));
if (!browserPath) throw new Error("No Edge/Chrome executable found for local E2E flow verification.");
if (typeof WebSocket !== "function") throw new Error("Node WebSocket global is required for Chrome DevTools Protocol E2E verification.");

const appPort = Number(process.env.VIBE_E2E_APP_PORT || 5927);
const cdpPort = Number(process.env.VIBE_E2E_CDP_PORT || 9347);
const baseUrl = `http://127.0.0.1:${appPort}`;
const targetUrl = `${baseUrl}/index.html?v=${encodeURIComponent(version)}&view=dashboard&e2e=local-${Date.now()}`;
const userDataDir = mkdtempSync(path.join(tmpdir(), "vibe-local-e2e-"));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return response.json();
}

async function waitForHttp(url, label) {
  let lastError = "";
  for (let i = 0; i < 100; i += 1) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return;
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error.message;
    }
    await sleep(250);
  }
  throw new Error(`${label} did not start. Last error: ${lastError}`);
}

function connectWebSocket(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.addEventListener("open", () => resolve(ws), { once: true });
    ws.addEventListener("error", (event) => reject(new Error(`WebSocket failed: ${event.message || "unknown"}`)), { once: true });
  });
}

function createCdpClient(ws) {
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
    else resolve(message.result || {});
  });
  return function cdp(method, params = {}) {
    const id = nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(payload);
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`${method} timed out`));
        }
      }, 45000);
    });
  };
}

async function evaluate(cdp, expression, timeoutMs = 45000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await cdp("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
        timeout: Math.min(timeoutMs, 15000),
      });
      if (result.exceptionDetails) {
        const text = result.exceptionDetails.text || result.exceptionDetails.exception?.description || "Runtime.evaluate failed";
        if (/Execution context was destroyed|Cannot find context|Inspected target navigated/i.test(text)) {
          lastError = new Error(text);
          await sleep(350);
          continue;
        }
        throw new Error(text);
      }
      return result.result?.value;
    } catch (error) {
      if (/Execution context was destroyed|Cannot find context|Inspected target navigated|Target closed/i.test(String(error?.message || error))) {
        lastError = error;
        await sleep(350);
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error("Runtime.evaluate timed out");
}

function waitExpression(expression, timeoutMs = 45000) {
  return `(async () => {
    const started = Date.now();
    while (Date.now() - started < ${timeoutMs}) {
      const result = (() => { ${expression} })();
      if (result) return result;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("Timed out waiting for condition");
  })()`;
}

const server = spawn(process.execPath, ["server.js"], {
  env: {
    ...process.env,
    PORT: String(appPort),
    HOST: "127.0.0.1",
    NODE_ENV: "test",
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

const browser = spawn(browserPath, [
  "--disable-extensions",
  "--disable-background-networking",
  "--disable-gpu-sandbox",
  "--disable-features=RendererCodeIntegrity,CalculateNativeWinOcclusion",
  "--no-sandbox",
  "--no-first-run",
  "--no-default-browser-check",
  "--window-position=-32000,-32000",
  "--window-size=1365,900",
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${userDataDir}`,
  "about:blank",
], {
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

let serverOutput = "";
let browserOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString("utf8"); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString("utf8"); });
browser.stdout.on("data", (chunk) => { browserOutput += chunk.toString("utf8"); });
browser.stderr.on("data", (chunk) => { browserOutput += chunk.toString("utf8"); });

let ws;
try {
  await waitForHttp(`${baseUrl}/api/health`, "Local API");
  await waitForHttp(`http://127.0.0.1:${cdpPort}/json/version`, "Browser DevTools endpoint");

  await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(targetUrl)}`, { method: "PUT" });
  const pages = await fetchJson(`http://127.0.0.1:${cdpPort}/json/list`);
  const page = pages.find((item) => item.type === "page" && item.url.includes("index.html")) || pages.find((item) => item.type === "page");
  if (!page?.webSocketDebuggerUrl) throw new Error("No debuggable page was created.");
  ws = await connectWebSocket(page.webSocketDebuggerUrl);
  const cdp = createCdpClient(ws);
  await cdp("Page.enable");
  await cdp("Runtime.enable");

  await evaluate(cdp, waitExpression(`return document.readyState === "complete" || document.readyState === "interactive";`));
  await evaluate(cdp, waitExpression(`return document.body && document.body.innerText.includes("Vibe");`));
  await evaluate(cdp, waitExpression(`return document.body.innerText.includes("${version}") || window.APP_VERSION === "${version}";`));

  await evaluate(cdp, `(async () => {
    const seed = document.getElementById("seedButton");
    if (!seed) throw new Error("seedButton missing");
    seed.click();
    const started = Date.now();
    while (Date.now() - started < 10000) {
      const assetCards = document.querySelectorAll("#assetLibraryGrid .asset-card").length;
      const libraryCards = document.querySelectorAll("#libraryGrid .library-card").length;
      const text = document.body.innerText || "";
      if (assetCards >= 3 || libraryCards >= 3 || text.match(/experiencias de ejemplo multimodales cargadas|multimodal sample experiences loaded/i)) return true;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!document.body.innerText.match(/experiencias de ejemplo multimodales cargadas|multimodal sample experiences loaded/i)) {
      throw new Error("Demo data load was not confirmed");
    }
    return true;
  })()`);

  const dataChecks = [
    {
      name: "library",
      nav: "library",
      expression: `return document.querySelectorAll("#libraryGrid .library-card").length >= 3;`,
      detail: "Library must show seeded experiences.",
    },
    {
      name: "assets",
      nav: "assetLibrary",
      expression: `return document.querySelectorAll("#assetLibraryGrid .asset-card").length >= 3;`,
      detail: "Assets must show seeded multimodal evidence.",
    },
    {
      name: "agenda",
      nav: "agenda",
      expression: `return (document.body.innerText || "").match(/Agenda|evento|event/i);`,
      detail: "Agenda must render after seeded operational data.",
    },
  ];

  for (const check of dataChecks) {
    await evaluate(cdp, `(async () => {
      const nav = document.querySelector('button[data-view="${check.nav}"]');
      if (!nav) throw new Error("${check.name} nav missing");
      nav.click();
      await new Promise((resolve) => setTimeout(resolve, 900));
      const ok = (() => { ${check.expression} })();
      if (!ok) throw new Error("${check.detail}");
      return true;
    })()`);
    console.log(`${check.name} E2E ok`);
  }

  const outputFlows = [
    {
      name: "report",
      nav: "report",
      before: `document.getElementById("generateReportButton")?.click(); await new Promise((resolve) => setTimeout(resolve, 1000));`,
      button: "downloadEditedReportPdfButton",
      panel: "reportProgressPanel",
      ready: ["PDF de reporte listo", "Report PDF ready"],
    },
    {
      name: "insights",
      nav: "insights",
      before: "",
      button: "exportInsightsPdfButton",
      panel: "insightsProgressPanel",
      ready: ["PDF de hallazgos listo", "Findings PDF ready"],
    },
    {
      name: "publication",
      nav: "publications",
      before: `document.getElementById("generatePublicationButton")?.click(); await new Promise((resolve) => setTimeout(resolve, 1200));`,
      button: "exportPublicationPdfButton",
      panel: "publicationProgressPanel",
      ready: ["PDF final listo", "Final PDF ready"],
    },
  ];

  for (const flow of outputFlows) {
    const readyMatcher = flow.ready.map((text) => `text.includes(${JSON.stringify(text)})`).join(" || ");
    const result = await evaluate(cdp, `(async () => {
      const nav = document.querySelector('button[data-view="${flow.nav}"]');
      if (!nav) throw new Error("${flow.name} nav missing");
      nav.click();
      await new Promise((resolve) => setTimeout(resolve, 900));
      ${flow.before}
      const button = document.getElementById("${flow.button}");
      if (!button) throw new Error("${flow.name} PDF button missing");
      button.click();
      const started = Date.now();
      while (Date.now() - started < 60000) {
        const panel = document.getElementById("${flow.panel}");
        const text = panel?.innerText || "";
        const bodyText = document.body.innerText || "";
        if (/auth_required|requiere la API|API no respondio|Fallo el PDF ReportLab|ReportLab PDF failed|No se pudo generar el PDF final/i.test(bodyText)) {
          throw new Error("${flow.name} showed technical PDF failure: " + bodyText.slice(0, 500));
        }
        if (${readyMatcher}) {
          return { flow: "${flow.name}", text, visible: !!(panel.offsetWidth || panel.offsetHeight || panel.getClientRects().length) };
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error("${flow.name} did not reach final PDF ready state");
    })()`, 70000);
    console.log(`${flow.name} output E2E ok: ${String(result.text).split("\\n").slice(0, 3).join(" | ")}`);
  }

  console.log(`Local operational E2E flow passed for ${version}.`);
} catch (error) {
  const serverExcerpt = serverOutput.trim().split(/\r?\n/).slice(-12).join("\n");
  const browserExcerpt = browserOutput.trim().split(/\r?\n/).slice(-12).join("\n");
  throw new Error(`${error.message}${serverExcerpt ? `\nServer excerpt:\n${serverExcerpt}` : ""}${browserExcerpt ? `\nBrowser excerpt:\n${browserExcerpt}` : ""}`);
} finally {
  try {
    if (ws) ws.close();
  } catch {}
  if (browser.exitCode === null) browser.kill();
  if (server.exitCode === null) server.kill();
  try {
    rmSync(userDataDir, { recursive: true, force: true });
  } catch {}
}
