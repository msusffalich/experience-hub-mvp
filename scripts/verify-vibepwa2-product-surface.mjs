import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

import { createCaptureService } from "../apps/vibe-api-v2/src/capture.mjs";
import { createContextEnrichmentService } from "../apps/vibe-api-v2/src/context-enrichment.mjs";

const appRoot = new URL("../apps/vibepwa-next/", import.meta.url);
const backendRoot = new URL("../apps/vibe-api-v2/src/", import.meta.url);
const files = {
  server: await readFile(new URL("../server.js", import.meta.url), "utf8"),
  railway: await readFile(new URL("../railway.json", import.meta.url), "utf8"),
  app: await readFile(new URL("src/app.js", appRoot), "utf8"),
  api: await readFile(new URL("src/api.js", appRoot), "utf8"),
  i18n: await readFile(new URL("src/i18n.js", appRoot), "utf8"),
  manual: await readFile(new URL("src/manual.js", appRoot), "utf8"),
  manualHtml: await readFile(new URL("manual.html", appRoot), "utf8"),
  worker: await readFile(new URL("service-worker.js", appRoot), "utf8"),
  capture: await readFile(new URL("capture.mjs", backendRoot), "utf8"),
  context: await readFile(new URL("context-enrichment.mjs", backendRoot), "utf8"),
  routes: await readFile(new URL("app.mjs", backendRoot), "utf8"),
};

const results = [];
await check("four complete UI dictionaries", verifyLanguageParity);
await check("Agenda navigation and API", verifyAgenda);
await check("automatic location, weather, news and listings", verifyAutomaticContext);
await check("Apple Health through Vibeapp and Backend2", verifyAppleHealth);
await check("multiple multimodal evidence", verifyMultimodal);
await check("date, life-area and group filters", verifyFilters);
await check("discoverable experience map and manual", verifyMapAndManualNavigation);
await check("localized printable manual", verifyManual);
await check("VibePWA2 is the public product entry point", verifyProductEntryPoint);

for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}${result.ok ? "" : `: ${result.error}`}`);
}
const failed = results.filter((result) => !result.ok);
if (failed.length) {
  process.exitCode = 1;
  console.error(`VibePWA2 product surface: ${results.length - failed.length}/${results.length} checks passed.`);
} else {
  console.log(`VibePWA2 product surface: ${results.length}/${results.length} checks passed.`);
}

async function verifyLanguageParity() {
  const source = `${files.i18n}\nexport { messages as __verificationMessages };`;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const module = await import(moduleUrl);
  const dictionaries = module.__verificationMessages;
  const languages = ["es", "en", "fr", "pt"];
  assert.deepEqual(Object.keys(dictionaries), languages);
  const baseline = Object.keys(dictionaries.es).sort();
  assert.ok(baseline.length >= 120, "The UI dictionary is unexpectedly small");
  for (const language of languages) {
    assert.deepEqual(
      Object.keys(dictionaries[language]).sort(),
      baseline,
      `${language} does not contain the same keys as Spanish`,
    );
    for (const key of baseline) {
      assert.ok(
        String(dictionaries[language][key] ?? "").trim(),
        `${language}.${key} is empty`,
      );
    }
  }
  for (const key of [
    "agenda", "agendaTitle", "contextTitle", "healthContext", "currentNews",
    "entertainment", "groups", "from", "to", "activity", "manual", "map", "experienceMap",
  ]) {
    assert.ok(baseline.includes(key), `Shared translation key ${key} is missing`);
  }
}

function verifyAgenda() {
  assert.match(files.app, /\["agenda",\s*"calendar"\]/);
  assert.match(files.app, /state\.route === "agenda"\)\s*return agendaView\(\)/);
  assert.match(files.app, /function agendaView\(\)/);
  assert.match(files.app, /state\.data\.agenda/);
  assert.match(files.api, /\["agenda",\s*"\/api\/v2\/agenda"/);
  assert.match(files.routes, /router\.add\("GET",\s*"\/api\/v2\/agenda"/);
  assert.match(files.app, /\["stories",\s*"evidence",\s*"agenda",\s*"intelligence",\s*"map",\s*"publish",\s*"account"\]/);
}

function verifyMapAndManualNavigation() {
  assert.match(files.app, /\["map",\s*"map"\]/);
  assert.match(files.app, /state\.route === "map"\)\s*return mapView\(\)/);
  assert.match(files.app, /function mapView\(\)/);
  assert.match(files.app, /manualNavLink\(\)/);
  assert.match(files.app, /manualNavLink\(true\)/);
  assert.match(files.app, /href="\.\/manual\.html"/);
  assert.match(files.app, /request\("\/api\/v2\/obsidian\/preview"\)/);
  assert.match(files.app, /request\("\/api\/v2\/obsidian\/export"/);
  assert.match(files.routes, /router\.add\("GET",\s*"\/api\/v2\/obsidian\/preview"/);
  assert.match(files.routes, /router\.add\("POST",\s*"\/api\/v2\/obsidian\/export"/);
}

async function verifyAutomaticContext() {
  assert.match(files.api, /\["context",\s*"\/api\/v2\/context\/summary"/);
  assert.match(files.api, /\["contextSignals",\s*"\/api\/v2\/context\/signals"/);
  assert.match(files.api, /\["briefing",\s*"\/api\/v2\/context\/briefing"/);
  assert.match(files.app, /scheduleContextRefresh\(\)/);
  assert.match(files.app, /request\("\/api\/v2\/context\/refresh"/);
  assert.match(files.app, /reason:\s*userInitiated\s*\?\s*"manual"\s*:\s*"automatic"/);
  assert.match(files.context, /signal_type:\s*"eq\.location"/);
  assert.match(files.context, /https:\/\/api\.open-meteo\.com\/v1\/forecast/);
  assert.match(files.context, /Reuters OR BBC OR AP OR NPR/);
  assert.match(files.context, /cinema OR theater OR theatre OR concert OR festival OR events OR shows/);
  assert.match(files.context, /Promise\.allSettled\(\[/);
  assert.match(files.context, /\["weather",\s*payload\.weather\]/);
  assert.match(files.context, /\["news",\s*payload\.news\]/);
  assert.match(files.context, /\["entertainment",\s*payload\.entertainment\]/);

  const briefings = [];
  const persistedSignals = [];
  const fetches = [];
  const job = {
    job_id: "context-job-1",
    owner_user_id: "user-1",
    workspace_id: "workspace-1",
    job_type: "context_refresh",
    state: "queued",
    attempts: 0,
    input: { locale: "es", reason: "automatic" },
    result: {},
    created_at: "2026-07-30T12:00:00.000Z",
    updated_at: "2026-07-30T12:00:00.000Z",
  };
  const supabase = {
    async rest(table, options = {}) {
      if (table === "vibe_jobs_v2" && !options.method) return [job];
      if (table === "vibe_jobs_v2" && options.method === "PATCH") {
        return options.prefer === "return=representation"
          ? [{ ...job, ...options.body }]
          : null;
      }
      if (table === "context_signals" && !options.method) {
        return [{
          signal_id: "location-1",
          owner_user_id: "user-1",
          workspace_id: "workspace-1",
          signal_type: "location",
          location: "Winter Garden, Florida, USA",
          payload: {
            latitude: 28.5653,
            longitude: -81.5862,
            city: "Winter Garden",
            region: "Florida",
            country: "USA",
            timezone: "America/New_York",
          },
        }];
      }
      if (table === "context_signals" && options.method === "POST") {
        persistedSignals.push(options.body);
        return null;
      }
      if (table === "daily_briefings" && options.method === "POST") {
        briefings.push(options.body);
        return null;
      }
      throw new Error(`Unexpected context fake call: ${table} ${options.method || "GET"}`);
    },
  };
  const service = createContextEnrichmentService({
    supabase,
    workspace: { async resolve() { return { id: "workspace-1" }; } },
    config: { upstreamTimeoutMs: 1000 },
    fetchImpl: async (input) => {
      const url = new URL(input);
      fetches.push(url);
      if (url.hostname === "api.open-meteo.com") {
        return textResponse(JSON.stringify({
          current: {
            time: "2026-07-30T12:00",
            temperature_2m: 29,
            apparent_temperature: 31,
            relative_humidity_2m: 74,
            precipitation: 0,
            weather_code: 1,
            wind_speed_10m: 8,
          },
        }));
      }
      if (url.hostname === "news.google.com") {
        return textResponse(
          // El titular menciona la localidad a proposito: el enriquecimiento
          // exige que el resultado hable del lugar del usuario. Antes se
          // aceptaba cualquier nota y en produccion salia cartelera de Madrid
          // para alguien en Florida.
          "<rss><channel><item><title>Evento local en Winter Garden</title><link>https://example.test/item</link>" +
          "<pubDate>Thu, 30 Jul 2026 12:00:00 GMT</pubDate><source>Reuters</source>" +
          "<description>Informacion reciente de Winter Garden.</description></item></channel></rss>",
        );
      }
      throw new Error(`Unexpected context URL: ${url}`);
    },
  });
  const outcomes = await service.processQueued(1);
  assert.deepEqual(outcomes, [{ id: "context-job-1", state: "complete" }]);
  assert.equal(fetches.filter((url) => url.hostname === "api.open-meteo.com").length, 1);
  assert.equal(fetches.filter((url) => url.hostname === "news.google.com").length, 2);
  assert.equal(briefings.length, 1);
  assert.equal(briefings[0].payload.location.locality, "Winter Garden");
  assert.equal(briefings[0].payload.weather.status, "available");
  assert.equal(briefings[0].payload.news.items.length, 1);
  assert.equal(briefings[0].payload.entertainment.items.length, 1);
  assert.deepEqual(
    persistedSignals.map((item) => item.signal_type).sort(),
    ["entertainment", "news", "weather"],
  );
}

async function verifyAppleHealth() {
  const capture = createCaptureService({
    supabase: { async rest() { return []; } },
    workspace: { async resolve() { return { id: "workspace-1" }; } },
    config: { storageBucket: "experience-media", maxFileBytes: 100 * 1024 * 1024 },
  });
  const contract = capture.contract();
  assert.ok(contract.context.includes("biometric"));
  assert.match(files.capture, /body\.source\?\.app\s*\|\|\s*body\.sourceType\s*\|\|\s*"vibeapp"/);
  assert.match(files.capture, /\["biometric",\s*"sensor",\s*"weather"\]\.includes\(command\.kind\)/);
  assert.match(files.app, /t\("healthContext"\)/);
  assert.match(files.app, /t\("appleHealthHelp"\)/);
  assert.match(files.app, /heartAvg[\s\S]*steps[\s\S]*sleepMinutes[\s\S]*activeEnergy/);
  for (const token of ["Apple Health", "HealthKit", "Vibeapp"]) {
    const haystack = `${files.app}\n${files.i18n}\n${files.manual}\n${files.capture}`;
    assert.match(haystack, new RegExp(token, "i"), `${token} is not visible in the flow`);
  }
  assert.match(files.api, /\["context",\s*"\/api\/v2\/context\/summary"/);
  assert.match(files.api, /\["contextSignals",\s*"\/api\/v2\/context\/signals"/);
  assert.match(files.routes, /router\.add\("POST",\s*"\/api\/v2\/captures"/);
}

function verifyMultimodal() {
  assert.match(
    files.app,
    /type="file"[^>]*accept="image\/\*,video\/\*,audio\/\*,[^"]*"[^>]*multiple/,
  );
  assert.match(files.app, /Array\.from\(event\.target\.files\s*\|\|\s*\[\]\)/);
  assert.match(files.app, /for\s*\(const file of files\)/);
  assert.match(files.app, /function pickerItem\(/);
  assert.match(files.app, /data-asset-preview/);
  assert.match(files.app, /kind === "image"[\s\S]*kind === "video"/);
  for (const kind of ["text", "image", "audio", "video", "document"]) {
    assert.match(files.capture, new RegExp(`"${kind}"`), `Backend2 lacks ${kind}`);
  }
}

function verifyFilters() {
  assert.match(files.app, /filters:\s*\{[^}]*area:\s*""[^}]*from:\s*""[^}]*to:\s*""/);
  assert.match(files.app, /data-filter="area"/);
  assert.match(files.app, /data-filter="from"\s+type="date"/);
  assert.match(files.app, /data-filter="to"\s+type="date"/);
  assert.match(files.app, /!state\.filters\.area\s*\|\|\s*item\.category\s*===\s*state\.filters\.area/);
  assert.match(files.app, /inDateRange\(item\.timestamp\)/);
  assert.match(
    files.app,
    /filters:\s*\{[^}]*group:\s*""/,
    "The shared filter state does not include group/person",
  );
  assert.match(
    files.app,
    /data-filter="group"/,
    "The toolbar has no group/person selector",
  );
  assert.match(files.app, /participantMatches\(item\.participantId\)/, "Stories are not filtered by participantId");
  assert.match(files.app, /function participantMatches\(value\)/);
}

function verifyManual() {
  assert.match(files.manualHtml, /id="manual"/);
  assert.match(files.manualHtml, /src="\.\/src\/manual\.js"/);
  assert.match(files.manual, /window\.print\(\)/);
  assert.match(files.worker, /"\.\/manual\.html"/);
  assert.match(files.worker, /"\.\/src\/manual\.js"/);

  const start = files.manual.indexOf("const copies =");
  const end = files.manual.indexOf("renderManual();", start);
  assert.ok(start >= 0 && end > start, "Manual dictionaries could not be parsed");
  const sandbox = {};
  vm.runInNewContext(
    `${files.manual.slice(start, end)}\nglobalThis.__copies = copies;`,
    sandbox,
  );
  const copies = sandbox.__copies;
  const languages = ["es", "en", "fr", "pt"];
  assert.deepEqual(Object.keys(copies), languages);
  const chapterCount = copies.es.chapters.length;
  assert.ok(chapterCount >= 12, "The manual is missing expected functional chapters");
  for (const language of languages) {
    const copy = copies[language];
    assert.ok(copy.title && copy.back && copy.language && copy.print);
    assert.equal(copy.chapters.length, chapterCount, `${language} manual is incomplete`);
    assert.ok(copy.chapters.every((chapter) => (
      chapter.id?.trim()
      && chapter.title?.trim()
      && chapter.lead?.trim()
      && chapter.sections?.every((section) => section.title?.trim())
    )));
    assert.match(
      JSON.stringify(copy.chapters),
      /HealthKit/i,
      `${language} manual does not explain the mobile health flow`,
    );
  }
}

function verifyProductEntryPoint() {
  assert.match(
    files.server,
    /url\.pathname === "\/" \|\| url\.pathname === "\/index\.html"[\s\S]*Location:\s*"\/apps\/vibepwa-next\/index\.html"/,
  );
  assert.match(files.server, /url\.pathname === "\/legacy"/);
  assert.match(files.server, /Location:\s*"\/index\.html\?legacy=1"/);
  assert.equal(
    JSON.parse(files.railway).deploy?.healthcheckPath,
    "/api/v2/health/live",
    "Railway deploy healthcheck must use liveness; readiness depends on external infrastructure",
  );
}

async function check(name, verifier) {
  try {
    await verifier();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: String(error.message || error).split("\n")[0] });
  }
}

function textResponse(value) {
  return {
    ok: true,
    status: 200,
    async text() {
      return value;
    },
  };
}
