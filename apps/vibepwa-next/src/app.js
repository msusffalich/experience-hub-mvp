import { downloadBlob, getSession, loadWorkspace, request, setSession, signIn } from "./api.js";
import { uploadEvidence } from "./direct-upload.js";
import { icon } from "./icons.js";
import { supportedLanguages, translator } from "./i18n.js";
import {
  drainUploadQueue,
  enqueueUpload,
  getUploadQueueSummary,
  retryQueuedUpload,
} from "./upload-queue.js";
import { createZip } from "./zip.js";
import { forgetVault, getStoredVault, isVaultPickerSupported, pickVault, writeBundleToVault } from "./vault.js";

const app = document.getElementById("app");
const toastRegion = document.getElementById("toastRegion");
const areas = ["Trabajo", "Paseo", "Aprendizaje", "Social", "Entretenimiento", "Creatividad", "Espiritualidad", "Salud", "Compras"];
const state = {
  session: getSession(),
  route: routeFromHash(),
  language: localStorage.getItem("vibe-next-language") || "es",
  theme: localStorage.getItem("vibe-next-theme") || "light",
  loading: false,
  data: {
    health: null,
    profile: {},
    groups: [],
    experiences: [],
    assets: [],
    captures: [],
    agenda: [],
    capture: null,
    context: null,
    contextSignals: [],
    briefing: null,
    oura: null,
    issues: [],
  },
  offlineQueue: { total: 0, pending: 0, uploading: 0, retry_pending: 0 },
  filters: { search: "", area: "", group: "", from: "", to: "" },
  selectedPublicationStories: new Set(),
  contextRefreshQueued: false,
  contextRefreshStatus: "",
  obsidianPreview: null,
  obsidianPreviewLoading: false,
  obsidianPreviewError: "",
  // Nombre de la carpeta de boveda elegida en este equipo (File System Access).
  obsidianVaultName: "",
  modal: null,
  upload: null,
};

let t = translator(state.language);
document.documentElement.dataset.theme = state.theme;
document.documentElement.lang = state.language;

window.addEventListener("hashchange", () => {
  state.route = routeFromHash();
  render();
});
window.addEventListener("vibe:session-expired", () => {
  state.session = null;
  render();
});

boot();

async function boot() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js", { scope: "./" }).catch(() => {});
  }
  if (!state.session?.accessToken) {
    renderLogin();
    return;
  }
  // Recuperar la carpeta de boveda ya autorizada (sin pedir permiso: eso exige
  // gesto del usuario y se hace al pulsar Exportar).
  await restoreObsidianVaultName();
  await refreshData();
  await refreshOfflineQueue();
  showIntegrationCallback();
  if (navigator.onLine && state.offlineQueue.total > 0) drainOfflineUploads();
}

window.addEventListener("online", () => drainOfflineUploads());

function showIntegrationCallback() {
  const url = new URL(window.location.href);
  if (url.searchParams.get("integration") !== "oura") return;
  const status = url.searchParams.get("status");
  toast(status === "connected" ? t("connected") : `${t("integrationIssue")}: ${url.searchParams.get("reason") || "oura"}`, status !== "connected");
  url.searchParams.delete("integration");
  url.searchParams.delete("status");
  url.searchParams.delete("reason");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

async function refreshData() {
  state.loading = true;
  render();
  try {
    state.data = await loadWorkspace(state.data);
    state.language = normalizeLanguage(state.data.profile?.language || state.language);
    t = translator(state.language);
    document.documentElement.lang = state.language;
    localStorage.setItem("vibe-next-language", state.language);
    scheduleContextRefresh();
  } catch (error) {
    if (error.status !== 401) toast(error.message, true);
  } finally {
    state.loading = false;
    render();
    hydrateAssetPreviews();
  }
}

function scheduleContextRefresh() {
  const nextRefresh = new Date(state.data.briefing?.nextRefreshAt || 0).getTime();
  const hasRecentBriefing = Number.isFinite(nextRefresh) && nextRefresh > Date.now();
  const hasLocation = Boolean(
    state.data.context?.latestLocation ||
    (state.data.contextSignals || []).some((item) => item.signalType === "location"),
  );
  if (hasRecentBriefing || !hasLocation || state.contextRefreshQueued) return;
  requestContextRefresh(false);
}

async function requestContextRefresh(userInitiated) {
  if (state.contextRefreshQueued) return;
  state.contextRefreshQueued = true;
  state.contextRefreshStatus = "updating";
  render();
  if (userInitiated) toast(t("contextUpdating"));
  try {
    const result = await request("/api/v2/context/refresh", {
      method: "POST",
      body: {
        locale: state.language,
        location: state.data.context?.latestLocation || "",
        reason: userInitiated ? "manual" : "automatic",
      },
    });
    if (result.state === "complete") {
      await finishContextRefresh(result, userInitiated);
      return;
    }
    await pollContextRefresh(result.id, userInitiated);
  } catch (error) {
    state.contextRefreshQueued = false;
    state.contextRefreshStatus = "failed";
    render();
    if (userInitiated) toast(error.message, true);
  }
}

async function pollContextRefresh(jobId, userInitiated) {
  if (!jobId) {
    state.contextRefreshQueued = false;
    state.contextRefreshStatus = "failed";
    render();
    if (userInitiated) toast(t("contextRefreshFailed"), true);
    return;
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await delay(1_000);
    const job = await request(`/api/v2/jobs/${encodeURIComponent(jobId)}`);
    if (job.state === "complete") {
      await finishContextRefresh(job, userInitiated);
      return;
    }
    if (job.state === "needs_attention") {
      state.contextRefreshQueued = false;
      state.contextRefreshStatus = "failed";
      render();
      if (userInitiated) toast(t("contextRefreshFailed"), true);
      return;
    }
  }
  state.contextRefreshQueued = false;
  state.contextRefreshStatus = "pending";
  render();
  if (userInitiated) toast(t("contextStillUpdating"));
}

async function finishContextRefresh(job, userInitiated) {
  // El job puede terminar "complete" y aun asi traer un contexto vacio: el
  // servidor marca status unavailable/partial cuando los proveedores fallan.
  // Antes se decia siempre "Contexto actualizado con los datos mas recientes".
  const resultStatus = job.result?.status;
  const waitingForLocation = resultStatus === "waiting_for_location";
  const failed = resultStatus === "unavailable";
  const partial = resultStatus === "partial";
  const degraded = Array.isArray(job.result?.degraded) ? job.result.degraded : [];
  state.contextRefreshQueued = false;
  state.contextRefreshStatus = waitingForLocation
    ? "waiting_location"
    : failed
      ? "failed"
      : "complete";
  state.data = await loadWorkspace(state.data);
  render();
  hydrateAssetPreviews();
  if (userInitiated) {
    if (waitingForLocation) {
      toast(t("contextWaitingLocation"), true);
    } else if (failed) {
      toast(`${t("contextRefreshFailed")}${degraded.length ? ` (${degraded.join(", ")})` : ""}`, true);
    } else if (partial) {
      toast(`${t("contextRefreshComplete")} — ${degraded.join(", ")}: ${t("failed")}`, true);
    } else {
      toast(t("contextRefreshComplete"));
    }
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function render() {
  if (!state.session?.accessToken) {
    renderLogin();
    return;
  }
  if (state.loading && !state.data.health) {
    app.innerHTML = `<main class="loading-screen"><div><div class="spinner"></div><p>${escapeHtml(t("loading"))}</p></div></main>`;
    return;
  }
  app.innerHTML = shell(viewForRoute());
  bindShellEvents();
  bindViewEvents();
  if (state.route === "map" && !state.obsidianPreview && !state.obsidianPreviewLoading) {
    void loadObsidianPreview();
  }
  if (state.modal) renderModal();
}

function renderLogin() {
  app.innerHTML = `
    <main class="login-page">
      <section class="login-visual">
        <div class="login-visual-copy">
          <h1>Vibe</h1>
          <p>${escapeHtml(t("greeting"))}. ${escapeHtml(t("loginIntro"))}</p>
        </div>
      </section>
      <section class="login-panel">
        <form id="loginForm" class="login-form">
          <div class="login-mark"><img src="/icons/vibe-icon-192.png" alt="" /><strong>Vibe</strong></div>
          <h2>${escapeHtml(t("signIn"))}</h2>
          <p>${escapeHtml(t("loginHelp"))}</p>
          <div class="field"><label for="loginEmail">${escapeHtml(t("email"))}</label><input id="loginEmail" name="email" type="email" autocomplete="email" required /></div>
          <div class="field"><label for="loginPassword">${escapeHtml(t("password"))}</label><div class="password-field"><input id="loginPassword" name="password" type="password" autocomplete="current-password" required /><button type="button" data-toggle-password>${escapeHtml(t("showPassword"))}</button></div></div>
          <button class="button full" type="submit">${icon("arrow")}${escapeHtml(t("signIn"))}</button>
          <div class="login-links">
            <label for="loginLanguage">${escapeHtml(t("language"))}</label>
            <select id="loginLanguage" class="filter-control">${supportedLanguages.map((item) => `<option value="${item.value}" ${item.value === state.language ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}</select>
            <a class="button secondary small" href="./manual.html">${icon("file")}${escapeHtml(t("manual"))}</a>
          </div>
        </form>
      </section>
    </main>`;
  document.getElementById("loginForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    try {
      state.session = await signIn(event.currentTarget.email.value, event.currentTarget.password.value);
      await refreshData();
    } catch (error) {
      toast(error.message, true);
      button.disabled = false;
    }
  });
  document.querySelector("[data-toggle-password]")?.addEventListener("click", (event) => {
    const input = document.getElementById("loginPassword");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    event.currentTarget.textContent = t(show ? "hidePassword" : "showPassword");
  });
  document.getElementById("loginLanguage")?.addEventListener("change", (event) => {
    state.language = normalizeLanguage(event.target.value);
    t = translator(state.language);
    document.documentElement.lang = state.language;
    localStorage.setItem("vibe-next-language", state.language);
    renderLogin();
  });
}

function shell(content) {
  const nav = [
    ["home", "home"], ["stories", "story"], ["evidence", "image"],
    ["agenda", "calendar"], ["intelligence", "insight"], ["map", "map"],
    ["publish", "publish"], ["account", "user"],
  ];
  const routeTitle = t(state.route);
  const serviceOk = state.data.health?.status === "ok";
  return `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand"><img src="/icons/vibe-icon-192.png" alt="" /><strong>Vibe</strong></div>
        <nav class="side-nav" aria-label="Principal">
          ${nav.map(([route, symbol]) => navButton(route, symbol)).join("")}
          ${manualNavLink()}
        </nav>
        <div class="sidebar-footer"><div class="user-line">${escapeHtml(state.session?.user?.email || "")}</div></div>
      </aside>
      <main class="main">
        <header class="topbar">
          <h1>${escapeHtml(routeTitle)}</h1>
          <div class="topbar-actions">
            <div class="sync-state"><i class="sync-dot ${serviceOk ? "" : "issue"}"></i><span>${escapeHtml(serviceOk ? t("syncReady") : t("serviceIssue"))}</span></div>
            <button id="refreshButton" class="button secondary icon-only" title="${escapeHtml(t("refresh"))}">${icon("refresh")}</button>
          </div>
        </header>
        <div class="content">${moduleIssuesBanner()}${content}</div>
      </main>
      <nav class="mobile-nav" aria-label="Principal">${nav.map(([route, symbol]) => navButton(route, symbol, true)).join("")}${manualNavLink(true)}</nav>
    </div>`;
}

function moduleIssuesBanner() {
  const issues = state.data.issues || [];
  if (!issues.length) return "";
  const labels = issues.map((item) => t(`module.${item.module}`)).join(", ");
  return `<section class="module-warning" role="status">${icon("warning")}<div><strong>${escapeHtml(t("moduleIssueTitle"))}</strong><p>${escapeHtml(`${t("moduleIssueHelp")}: ${labels}`)}</p></div><button class="button secondary small" data-action="retry-modules">${icon("refresh")}${escapeHtml(t("retry"))}</button></section>`;
}

function navButton(route, symbol, mobile = false) {
  return `<button class="${mobile ? "" : "nav-link "}${state.route === route ? "active" : ""}" data-route="${route}">${icon(symbol)}<span>${escapeHtml(t(route))}</span></button>`;
}

function manualNavLink(mobile = false) {
  return `<a class="${mobile ? "" : "nav-link"}" href="./manual.html">${icon("file")}<span>${escapeHtml(t("manual"))}</span></a>`;
}

function viewForRoute() {
  if (state.route === "stories") return storiesView();
  if (state.route === "evidence") return evidenceView();
  if (state.route === "agenda") return agendaView();
  if (state.route === "intelligence") return intelligenceView();
  if (state.route === "map") return mapView();
  if (state.route === "publish") return publishView();
  if (state.route === "account") return accountView();
  return homeView();
}

function homeView() {
  const stories = state.data.experiences || [];
  const assets = allAssets();
  const pending = pendingAssets();
  const narrated = stories.filter(hasHumanNarrative).length;
  return `
    <section class="page-heading">
      <div><p class="eyebrow">${formatLongDate(new Date())}</p><h2>${escapeHtml(t("greeting"))}</h2><p>${escapeHtml(t("intro"))}</p></div>
      <button class="button" data-action="new-story">${icon("plus")}${escapeHtml(t("newStory"))}</button>
    </section>
    <section class="metric-strip">
      ${metric(stories.length, t("experiences"))}
      ${metric(assets.length, t("assets"))}
      ${metric(pending.length, t("waitingEvidence"))}
      ${metric(stories.length ? `${Math.round((narrated / stories.length) * 100)}%` : "0%", t("narrativeQuality"))}
    </section>
    ${contextOverview()}
    <section class="two-column">
      <div class="section">
        <div class="section-heading"><div><h3>${escapeHtml(t("recentStories"))}</h3><p>${escapeHtml(t("recentHelp"))}</p></div><button class="button ghost small" data-route="stories">${escapeHtml(t("allStories"))}${icon("chevron")}</button></div>
        ${storyList(stories.slice(0, 6))}
      </div>
      <aside class="inbox-panel">
        <h3>${escapeHtml(t("waitingEvidence"))}</h3>
        <p class="evidence-detail">${escapeHtml(t("inboxHelp"))}</p>
        <div class="inbox-count">${pending.length}</div>
        <button class="button secondary full" data-route="evidence">${icon("image")}${escapeHtml(t("evidence"))}</button>
      </aside>
    </section>`;
}

function storiesView() {
  const filtered = filteredStories();
  return `
    <section class="page-heading">
      <div><p class="eyebrow">${escapeHtml(t("stories"))}</p><h2>${escapeHtml(t("allStories"))}</h2><p>${escapeHtml(t("storiesHelp"))}</p></div>
      <button class="button" data-action="new-story">${icon("plus")}${escapeHtml(t("newStory"))}</button>
    </section>
    ${filterToolbar(true)}
    ${filtered.length ? storyList(filtered) : `<div class="empty">${escapeHtml(state.data.experiences.length ? t("noResults") : t("emptyStories"))}</div>`}`;
}

function evidenceView() {
  const assets = filteredAssets();
  return `
    <section class="page-heading">
      <div><p class="eyebrow">${escapeHtml(t("evidence"))}</p><h2>${escapeHtml(t("evidence"))}</h2><p>${escapeHtml(t("evidenceHelp"))}</p></div>
      <label class="button">${icon("upload")}${escapeHtml(t("uploadEvidence"))}<input id="evidenceFileInput" type="file" accept="image/*,video/*,audio/*,.pdf,.txt,.md,.csv,.json,.xml" multiple hidden /></label>
    </section>
    ${state.upload ? uploadStatus() : ""}
    ${offlineQueueStatus()}
    ${filterToolbar(false)}
    ${assets.length ? `<div class="evidence-grid">${assets.map(evidenceTile).join("")}</div>` : `<div class="empty">${escapeHtml(t("noEvidence"))}</div>`}`;
}

function agendaView() {
  const items = filteredAgenda().sort(
    (a, b) => new Date(a.startAt || 0) - new Date(b.startAt || 0),
  );
  const upcoming = items.filter((item) => new Date(item.endAt || item.startAt || 0).getTime() >= Date.now());
  const past = items.filter((item) => !upcoming.includes(item));
  return `
    <section class="page-heading">
      <div><p class="eyebrow">${escapeHtml(t("agenda"))}</p><h2>${escapeHtml(t("agendaTitle"))}</h2><p>${escapeHtml(t("agendaHelp"))}</p></div>
      <button class="button" data-action="new-agenda">${icon("plus")}${escapeHtml(t("newAgendaEvent"))}</button>
    </section>
    ${filterToolbar(false)}
    <section class="metric-strip">
      ${metric(upcoming.length, t("upcoming"))}
      ${metric(past.length, t("past"))}
      ${metric(items.filter((item) => item.status === "Completado").length, t("completed"))}
      ${metric(items.filter((item) => item.sourceType).length, t("fromDevices"))}
    </section>
    <section class="section">
      <div class="section-heading"><div><h3>${escapeHtml(t("upcomingEvents"))}</h3><p>${escapeHtml(t("agendaNotStory"))}</p></div></div>
      ${upcoming.length ? `<div class="agenda-list">${upcoming.map(agendaRow).join("")}</div>` : `<div class="empty">${escapeHtml(t("noAgenda"))}</div>`}
    </section>
    ${past.length ? `<section class="section"><div class="section-heading"><h3>${escapeHtml(t("pastEvents"))}</h3></div><div class="agenda-list">${past.slice(-12).reverse().map(agendaRow).join("")}</div></section>` : ""}`;
}

function agendaRow(item) {
  const when = [formatLongDate(item.startAt), timeLabel(item.startAt)].filter(Boolean).join(" · ");
  return `<article class="agenda-row">
    <div class="agenda-date">${icon("calendar")}<span>${escapeHtml(when)}</span></div>
    <div><h3>${escapeHtml(item.title || t("event"))}</h3><p>${escapeHtml(item.description || t("noNote"))}</p>
      <div class="agenda-meta">${item.location ? `<span>${icon("map")}${escapeHtml(item.location)}</span>` : ""}<span class="tag">${escapeHtml(item.status || t("planned"))}</span></div>
    </div>
    <button class="button secondary icon-only small" data-agenda-id="${escapeAttr(item.id)}" title="${escapeAttr(t("edit"))}">${icon("edit")}</button>
  </article>`;
}

function intelligenceView() {
  const stories = filteredStories();
  const counts = areaCounts(stories);
  const max = Math.max(1, ...counts.map((item) => item.count));
  const months = monthlyCounts(stories);
  return `
    <section class="page-heading">
      <div><p class="eyebrow">${escapeHtml(t("intelligence"))}</p><h2>${escapeHtml(t("lifeBalance"))}</h2><p>${escapeHtml(t("intelligenceHelp"))}</p></div>
    </section>
    ${filterToolbar(true)}
    <section class="metric-strip">
      ${metric(stories.length, t("experiences"))}
      ${metric(counts.filter((item) => item.count).length, t("categories"))}
      ${metric(averageEnergy(stories), t("recordedEnergy"))}
      ${metric(totalMinutes(stories), `${t("duration")} (${t("minutes")})`)}
    </section>
    <section class="two-column">
      <div class="chart-panel"><div class="section-heading"><h3>${escapeHtml(t("lifeBalance"))}</h3></div><div class="bar-list">${counts.map((item) => bar(areaLabel(item.area), item.count, max)).join("")}</div></div>
      <div class="chart-panel"><div class="section-heading"><h3>${escapeHtml(t("activityTrend"))}</h3></div><div class="timeline">${months.map((item) => timelineBar(item, months)).join("")}</div></div>
    </section>
    ${contextOverview(true)}
    <section class="action-grid">
      <div class="action-cell"><h3>${escapeHtml(t("report"))}</h3><p>${escapeHtml(t("reportHelp"))}</p><button class="button secondary" data-action="generate-report">${icon("download")}${escapeHtml(t("generate"))}</button></div>
      <div class="action-cell"><h3>${escapeHtml(t("findings"))}</h3><p>${escapeHtml(t("findingsHelp"))}</p><button class="button secondary" data-action="generate-findings">${icon("download")}${escapeHtml(t("generate"))}</button></div>
      <div class="action-cell"><h3>${escapeHtml(t("knowledgeMap"))}</h3><p>${escapeHtml(t("knowledgeMapHelp"))}</p><button class="button secondary" data-route="map">${icon("map")}${escapeHtml(t("openMap"))}</button></div>
    </section>`;
}

function mapView() {
  const stories = filteredStories();
  const assets = allAssets();
  const narrated = stories.filter(hasHumanNarrative).length;
  const groups = activeGroups();
  const kinds = ["image", "video", "audio", "document"].map((kind) => ({
    kind,
    count: assets.filter((asset) => assetKind(asset) === kind).length,
  }));
  const preview = state.obsidianPreview;
  const experienceNotes = preview?.files?.filter((file) => file.path?.startsWith("02_Experiences/")).length || 0;
  const assetNotes = preview?.files?.filter((file) => file.path?.startsWith("04_Assets/")).length || 0;
  const previewState = state.obsidianPreviewLoading
    ? t("mapChecking")
    : state.obsidianPreviewError
      ? t("mapNeedsAttention")
      : preview
        ? t("mapReady")
        : t("mapNotChecked");
  return `
    <section class="page-heading">
      <div><p class="eyebrow">${escapeHtml(t("knowledgeMap"))}</p><h2>${escapeHtml(t("experienceMap"))}</h2><p>${escapeHtml(t("experienceMapHelp"))}</p></div>
      <div class="heading-actions">${vaultPickerControls()}<button class="button secondary" data-action="preview-obsidian">${icon("refresh")}${escapeHtml(t("refreshMap"))}</button><button class="button" data-action="export-obsidian">${icon("download")}${escapeHtml(t("exportToObsidian"))}</button></div>
    </section>
    ${filterToolbar(true)}
    <section class="metric-strip">
      ${metric(stories.length, t("experiences"))}
      ${metric(narrated, t("narratedStories"))}
      ${metric(assets.length, t("evidence"))}
      ${metric(groups.length + 1, t("peopleAndGroups"))}
    </section>
    <section class="map-explainer" aria-label="${escapeAttr(t("mapReadingGuide"))}">
      <div>${icon("user")}<strong>${escapeHtml(t("peopleAndGroups"))}</strong><span>${escapeHtml(t("mapPeopleHelp"))}</span></div>
      <i>${icon("chevron")}</i>
      <div>${icon("story")}<strong>${escapeHtml(t("experiences"))}</strong><span>${escapeHtml(t("mapStoriesHelp"))}</span></div>
      <i>${icon("chevron")}</i>
      <div>${icon("image")}<strong>${escapeHtml(t("evidence"))}</strong><span>${escapeHtml(t("mapEvidenceHelp"))}</span></div>
    </section>
    <section class="map-layout">
      <div class="map-column">
        <div class="section-heading"><div><h3>${escapeHtml(t("storiesOnMap"))}</h3><p>${escapeHtml(t("storiesOnMapHelp"))}</p></div></div>
        ${storyList(stories.slice(0, 10))}
      </div>
      <aside class="map-column map-summary">
        <div class="section-heading"><div><h3>${escapeHtml(t("evidenceComposition"))}</h3><p>${escapeHtml(t("evidenceCompositionHelp"))}</p></div></div>
        <div class="map-kind-list">${kinds.map((item) => `<div>${icon(item.kind === "audio" ? "mic" : item.kind === "video" ? "play" : item.kind === "image" ? "image" : "file")}<span>${escapeHtml(t(`kind.${item.kind}`))}</span><strong>${item.count}</strong></div>`).join("")}</div>
        <div class="obsidian-status ${state.obsidianPreviewError ? "issue" : ""}">
          <div>${icon(state.obsidianPreviewError ? "warning" : "map")}<span><strong>${escapeHtml(t("obsidianConnection"))}</strong><small>${escapeHtml(previewState)}</small></span></div>
          ${preview ? `<p>${experienceNotes} ${escapeHtml(t("experienceNotes"))} · ${assetNotes} ${escapeHtml(t("assetNotes"))}</p>` : ""}
          ${state.obsidianPreviewError ? `<p>${escapeHtml(state.obsidianPreviewError)}</p>` : ""}
        </div>
      </aside>
    </section>`;
}

function publishView() {
  const stories = filteredStories();
  const selected = stories.filter((item) => state.selectedPublicationStories.has(item.id));
  return `
    <section class="page-heading">
      <div><p class="eyebrow">${escapeHtml(t("publish"))}</p><h2>${escapeHtml(t("publicationTitle"))}</h2><p>${escapeHtml(t("publicationHelp"))}</p></div>
    </section>
    ${filterToolbar(true)}
    <section class="publication-layout">
      <div>
        <div class="field"><label for="publicationTitle">${escapeHtml(t("publicationName"))}</label><input id="publicationTitle" value="${escapeAttr(t("publicationDefault"))}" /></div>
        <div class="section-heading"><h3>${escapeHtml(t("chooseStories"))}</h3><span class="tag">${selected.length} ${escapeHtml(t("selected"))}</span></div>
        <div class="selection-list">${stories.map(publicationSelection).join("") || `<div class="empty">${escapeHtml(t("emptyStories"))}</div>`}</div>
        <button class="button full" data-action="generate-publication">${icon("download")}${escapeHtml(t("createPdf"))}</button>
      </div>
      <article class="publication-preview">
        <p class="eyebrow">${escapeHtml(t("editorial"))}</p>
        <h2 id="publicationPreviewTitle">${escapeHtml(t("publicationDefault"))}</h2>
        <p>${formatLongDate(new Date())} · ${selected.length} ${escapeHtml(t("experiences"))}</p>
        ${selected.length ? selected.map(previewStory).join("") : `<div class="empty">${escapeHtml(t("selectAtLeastOne"))}</div>`}
      </article>
    </section>`;
}

function contextOverview(compact = false) {
  const context = state.data.context || {};
  const briefing = state.data.briefing?.payload || {};
  const metrics = cleanMetrics(context.metrics || {});
  const weather = briefing.weather || context.latestWeather || {};
  const news = briefing.news || context.latestNews || {};
  const entertainment = briefing.entertainment || context.latestEntertainment || {};
  const location = briefing.location?.label || context.latestLocation || "";
  const impact = briefing.impact || news.impact || {};
  const hasBiometrics = Number(context.biometricSignals || 0) > 0;
  const newsItems = Array.isArray(news.items) ? news.items : [];
  const entertainmentItems = Array.isArray(entertainment.items) ? entertainment.items : [];
  const contextStatus = state.contextRefreshStatus
    ? `<div class="context-refresh-state ${state.contextRefreshStatus === "failed" || state.contextRefreshStatus === "waiting_location" ? "issue" : ""}" role="status">${icon(state.contextRefreshStatus === "complete" ? "check" : state.contextRefreshStatus === "failed" || state.contextRefreshStatus === "waiting_location" ? "warning" : "refresh")}<span>${escapeHtml(t(`contextStatus.${state.contextRefreshStatus}`))}</span></div>`
    : "";
  return `<section class="context-section ${compact ? "compact" : ""}">
    <div class="section-heading">
      <div><h3>${escapeHtml(t("contextTitle"))}</h3><p>${escapeHtml(t("contextHelp"))}</p></div>
      <button class="button secondary small" data-action="refresh-context">${icon("refresh")}${escapeHtml(t("refreshContext"))}</button>
    </div>
    ${contextStatus}
    <div class="context-grid">
      <article class="context-card">
        <div class="context-card-head">${icon("insight")}<span>${escapeHtml(t("healthContext"))}</span></div>
        ${hasBiometrics ? `<div class="context-metrics">
          ${contextMetric(metricValue(metrics, ["heartAvg", "heartRate", "heart_rate", "heartRateAvg", "heartRateBpm", "average_heart_rate"]), "bpm", t("heartRate"))}
          ${contextMetric(metricValue(metrics, ["steps", "stepCount"]), "", t("steps"))}
          ${contextMetric(formatSleep(metricValue(metrics, ["sleepMinutes", "sleep_duration", "sleep"])), "", t("sleep"))}
          ${contextMetric(metricValue(metrics, ["activeEnergy", "active_calories", "activeEnergyKcal"]), "kcal", t("activeEnergy"))}
        </div><p class="source-line">${Number(context.biometricSignals || 0)} ${escapeHtml(t("healthRecords"))}</p>`
          : `<p>${escapeHtml(t("noHealthData"))}</p>`}
      </article>
      <article class="context-card">
        <div class="context-card-head">${icon("map")}<span>${escapeHtml(t("locationWeather"))}</span></div>
        <strong class="context-primary">${escapeHtml(location || t("noLocationData"))}</strong>
        ${weather.status === "available" || Number.isFinite(Number(weather.temperatureC))
          ? `<p>${escapeHtml(weather.description || t("weather"))} · ${formatNumber(weather.temperatureC, "°C")} · ${formatNumber(weather.humidity, "%")}</p><p class="source-line">${escapeHtml(weather.source || "Open-Meteo")}</p>`
          : `<p>${escapeHtml(t("weatherWaiting"))}</p>`}
      </article>
      <article class="context-card">
        <div class="context-card-head">${icon("file")}<span>${escapeHtml(t("currentNews"))}</span></div>
        ${newsItems.length ? headlineList(newsItems, 3) : `<p>${escapeHtml(t("noNews"))}</p>`}
        ${impact.level ? `<p class="impact-line ${escapeAttr(impact.level)}">${escapeHtml(t("contextImpact"))}: ${escapeHtml(t(`impact.${impact.level}`))} (${Number(impact.score || 0)}/100)</p>` : ""}
      </article>
      <article class="context-card">
        <div class="context-card-head">${icon("calendar")}<span>${escapeHtml(t("entertainment"))}</span></div>
        ${entertainmentItems.length ? headlineList(entertainmentItems, 3) : `<p>${escapeHtml(t("noEntertainment"))}</p>`}
      </article>
    </div>
  </section>`;
}

function headlineList(items, limit) {
  return `<ul class="headline-list">${items.slice(0, limit).map((item) =>
    `<li>${item.link ? `<a href="${escapeAttr(item.link)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a>` : escapeHtml(item.title)}</li>`,
  ).join("")}</ul>`;
}

function contextMetric(value, suffix, label) {
  const available = value !== "" && value != null;
  return `<div><span>${escapeHtml(label)}</span><strong>${available ? `${escapeHtml(String(value))}${suffix ? ` ${escapeHtml(suffix)}` : ""}` : "—"}</strong></div>`;
}

function metricValue(metrics, keys) {
  for (const key of keys) {
    if (Number.isFinite(Number(metrics[key]))) return Number(metrics[key]).toFixed(key === "steps" ? 0 : 1).replace(/\.0$/, "");
  }
  return "";
}

function formatSleep(value) {
  // metricValue devuelve "" cuando no hay dato, y Number("") es 0 (finito!):
  // por eso el sueno ausente se mostraba como "0.0 h" en vez de "—".
  if (value === "" || value === null || value === undefined) return "—";
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  return minutes >= 24 ? `${(minutes / 60).toFixed(1)} h` : `${minutes.toFixed(1)} h`;
}

function formatNumber(value, suffix) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1).replace(/\.0$/, "")}${suffix}` : "—";
}

function accountView() {
  const profile = state.data.profile || {};
  const capture = state.data.capture || {};
  const groups = state.data.groups || [];
  const oura = state.data.oura || {};
  return `
    <section class="page-heading">
      <div><p class="eyebrow">${escapeHtml(t("account"))}</p><h2>${escapeHtml(t("profile"))}</h2><p>${escapeHtml(profile.email || state.session?.user?.email || "")}</p></div>
    </section>
    <div class="account-sections">
      <div class="settings-row">
        <div><h3>${escapeHtml(t("language"))}</h3><p>${escapeHtml(t("languageHelp"))}</p></div>
        <select id="languageSelect" class="filter-control">${supportedLanguages.map((item) => `<option value="${item.value}" ${item.value === state.language ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}</select>
      </div>
      <div class="settings-row">
        <div><h3>${escapeHtml(t("appearance"))}</h3><p>${escapeHtml(t("appearanceHelp"))}</p></div>
        <div class="segmented"><button data-theme-choice="light" class="${state.theme === "light" ? "active" : ""}">${icon("sun")}${escapeHtml(t("light"))}</button><button data-theme-choice="dark" class="${state.theme === "dark" ? "active" : ""}">${icon("moon")}${escapeHtml(t("dark"))}</button></div>
      </div>
      <section class="account-block">
        <div class="section-heading"><div><h3>${escapeHtml(t("groups"))}</h3><p>${escapeHtml(t("groupsHelp"))}</p></div></div>
        <form id="groupForm" class="inline-form">
          <input name="displayName" aria-label="${escapeAttr(t("groupName"))}" placeholder="${escapeAttr(t("groupName"))}" required />
          <input name="segment" aria-label="${escapeAttr(t("groupNote"))}" placeholder="${escapeAttr(t("groupNote"))}" />
          <button class="button secondary" type="submit">${icon("plus")}${escapeHtml(t("addGroup"))}</button>
        </form>
        <div class="group-list">
          ${groups.length ? groups.map(groupRow).join("") : `<p class="muted-copy">${escapeHtml(t("noGroups"))}</p>`}
        </div>
      </section>
      <section class="account-block">
        <div class="settings-row">
          <div><h3>Apple Health / HealthKit</h3><p>${escapeHtml(t("appleHealthHelp"))}</p></div>
          <span class="tag ${Number(state.data.context?.biometricSignals || 0) > 0 ? "accent" : ""}">${escapeHtml(Number(state.data.context?.biometricSignals || 0) > 0 ? t("healthDataAvailable") : t("waitingForVibeapp"))}</span>
        </div>
        <p class="muted-copy">${escapeHtml(t("appleHealthFlow"))}</p>
      </section>
      <section class="account-block">
        <div class="settings-row">
          <div><h3>Oura Ring</h3><p>${escapeHtml(t("ouraHelp"))}</p></div>
          <div class="account-actions">
            <span class="tag ${oura.connected ? "accent" : ""}">${escapeHtml(oura.connected ? t("connected") : t("notConnected"))}</span>
            ${oura.connected
              ? `<button class="button secondary small" data-action="oura-sync">${icon("refresh")}${escapeHtml(t("syncNow"))}</button><button class="button danger small" data-action="oura-disconnect">${escapeHtml(t("disconnect"))}</button>`
              : `<button class="button secondary small" data-action="oura-connect">${icon("arrow")}${escapeHtml(t("connect"))}</button>`}
          </div>
        </div>
        ${oura.lastSyncAt ? `<p class="muted-copy">${escapeHtml(t("lastSync"))}: ${escapeHtml(formatLongDate(oura.lastSyncAt))}</p>` : ""}
        ${oura.lastError ? `<p class="error-copy">${escapeHtml(t("integrationIssue"))}</p>` : ""}
      </section>
      <div class="settings-row">
        <div><h3>${escapeHtml(t("about"))}</h3><p>${escapeHtml(t("parallelHelp"))}</p></div>
        <div><span class="tag">VibePWA 2</span> <a class="button secondary small" href="./manual.html">Manual</a></div>
      </div>
      <details class="operation">
        <summary>${escapeHtml(t("operations"))}</summary>
        <div class="operation-body">
          ${operationRow("API", state.data.health?.status === "ok" ? t("serviceAvailable") : t("serviceIssue"))}
          ${operationRow(t("persistence"), state.data.health?.persistence || "—")}
          ${operationRow(t("captures"), capture.enabled === false ? t("unavailable") : t("available"))}
          ${operationRow("Contrato", capture.contract?.version || capture.contractVersion || "—")}
          ${operationRow(t("binaryFiles"), capture.contract?.directUpload?.binaryTransport || "direct_to_supabase_storage")}
          ${operationRow(t("offlineQueue"), String(state.offlineQueue.total || 0))}
        </div>
      </details>
      <div style="margin-top:24px"><button class="button danger" data-action="sign-out">${icon("logout")}${escapeHtml(t("signOut"))}</button></div>
    </div>`;
}

function groupRow(group) {
  return `<div class="group-row">
    <div><strong>${escapeHtml(group.displayName || "")}</strong><span>${escapeHtml(group.segment || t("noNote"))}</span></div>
    <span class="tag">${escapeHtml(group.status === "inactive" ? t("inactive") : t("active"))}</span>
    ${group.status === "inactive" ? "" : `<button class="button danger small" data-group-deactivate="${escapeAttr(group.id)}">${escapeHtml(t("deactivate"))}</button>`}
  </div>`;
}

function activeGroups() {
  return (state.data.groups || []).filter((group) => group.status !== "inactive");
}

function eventEditorRows(events = []) {
  if (!events.length) return `<p class="muted-copy">${escapeHtml(t("noEvents"))}</p>`;
  return events.map((event, index) => `
    <div class="event-editor-row" data-event-row data-event-id="${escapeAttr(event.id || "")}">
      <div class="event-editor-head"><strong>${escapeHtml(`${t("event")} ${index + 1}`)}</strong><button class="button danger icon-only small" type="button" data-remove-event="${index}" title="${escapeAttr(t("removeEvent"))}">${icon("delete")}</button></div>
      <div class="field-grid">
        <div class="field"><label>${escapeHtml(t("eventTitle"))}</label><input data-event-title value="${escapeAttr(event.title || "")}" /></div>
        <div class="field"><label>${escapeHtml(t("date"))}</label><input data-event-time type="datetime-local" value="${localDateTimeValue(event.timestamp || new Date())}" /></div>
      </div>
      <div class="field"><label>${escapeHtml(t("eventNarrative"))}</label><textarea data-event-narrative placeholder="${escapeAttr(t("eventNarrativeHelp"))}">${escapeHtml(event.narrativeText || event.description || "")}</textarea></div>
    </div>`).join("");
}

function bindShellEvents() {
  document.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => {
      window.location.hash = button.dataset.route === "home" ? "" : button.dataset.route;
    });
  });
  document.getElementById("refreshButton")?.addEventListener("click", refreshData);
}

function bindViewEvents() {
  document.querySelectorAll("[data-action='new-story']").forEach((button) => button.addEventListener("click", () => openStoryModal()));
  document.querySelectorAll("[data-action='new-agenda']").forEach((button) => button.addEventListener("click", () => openAgendaModal()));
  document.querySelectorAll("[data-agenda-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = state.data.agenda.find((entry) => entry.id === button.dataset.agendaId);
      if (item) openAgendaModal(item);
    });
  });
  document.querySelectorAll("[data-story-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const story = state.data.experiences.find((item) => item.id === button.dataset.storyId);
      if (story) openStoryModal(story);
    });
  });
  document.querySelectorAll("[data-filter]").forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.filter;
      const caret = input.selectionStart;
      state.filters[key] = input.value;
      // render() reemplaza el innerHTML y destruye el input con el foco: sin
      // restaurarlo, el usuario escribia una letra y perdia el teclado.
      render();
      const restored = document.querySelector(`[data-filter="${key}"]`);
      if (restored) {
        restored.focus();
        try {
          restored.setSelectionRange(caret, caret);
        } catch {
          // los input type=date no admiten setSelectionRange
        }
      }
      hydrateAssetPreviews();
    });
  });
  document.getElementById("evidenceFileInput")?.addEventListener("change", handleEvidenceFile);
  document.querySelector("[data-action='retry-upload']")?.addEventListener("click", retryEvidenceUpload);
  document.querySelector("[data-action='retry-queue']")?.addEventListener("click", drainOfflineUploads);
  document.querySelector("[data-action='retry-modules']")?.addEventListener("click", refreshData);
  document.querySelectorAll("[data-action='refresh-context']").forEach((button) =>
    button.addEventListener("click", () => requestContextRefresh(true)),
  );
  document.querySelectorAll("[data-asset-download]").forEach((button) => button.addEventListener("click", () => downloadAsset(button.dataset.assetDownload)));
  document.querySelectorAll("[data-publication-story]").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) state.selectedPublicationStories.add(input.value);
      else state.selectedPublicationStories.delete(input.value);
      render();
      hydrateAssetPreviews();
    });
  });
  document.getElementById("publicationTitle")?.addEventListener("input", (event) => {
    const title = document.getElementById("publicationPreviewTitle");
    if (title) title.textContent = event.target.value || t("publicationDefault");
  });
  document.querySelector("[data-action='generate-report']")?.addEventListener("click", () => generatePdf("report"));
  document.querySelector("[data-action='generate-findings']")?.addEventListener("click", () => generatePdf("findings"));
  document.querySelector("[data-action='generate-publication']")?.addEventListener("click", generatePublication);
  document.querySelector("[data-action='preview-obsidian']")?.addEventListener("click", loadObsidianPreview);
  document.querySelector("[data-action='export-obsidian']")?.addEventListener("click", exportObsidian);
  document.querySelector("[data-action='choose-vault']")?.addEventListener("click", chooseObsidianVault);
  document.querySelector("[data-action='forget-vault']")?.addEventListener("click", forgetObsidianVault);
  document.getElementById("groupForm")?.addEventListener("submit", saveGroup);
  document.querySelectorAll("[data-group-deactivate]").forEach((button) => {
    button.addEventListener("click", () => deactivateGroup(button.dataset.groupDeactivate));
  });
  document.querySelector("[data-action='oura-connect']")?.addEventListener("click", connectOura);
  document.querySelector("[data-action='oura-sync']")?.addEventListener("click", syncOura);
  document.querySelector("[data-action='oura-disconnect']")?.addEventListener("click", disconnectOura);
  document.querySelector("[data-action='sign-out']")?.addEventListener("click", () => {
    setSession(null);
    state.session = null;
    render();
  });
  document.getElementById("languageSelect")?.addEventListener("change", async (event) => {
    state.language = normalizeLanguage(event.target.value);
    t = translator(state.language);
    localStorage.setItem("vibe-next-language", state.language);
    document.documentElement.lang = state.language;
    render();
    try {
      state.data.profile = await request("/api/v2/profile", {
        method: "PUT",
        body: { ...state.data.profile, language: state.language },
      });
    } catch (error) {
      toast(error.message, true);
    }
  });
  document.querySelectorAll("[data-theme-choice]").forEach((button) => button.addEventListener("click", () => {
    state.theme = button.dataset.themeChoice;
    localStorage.setItem("vibe-next-theme", state.theme);
    document.documentElement.dataset.theme = state.theme;
    render();
  }));
}

// Controles de la carpeta de la boveda. Si el navegador no soporta la File
// System Access API (Safari iOS), se dice explicitamente en vez de ofrecer un
// boton que no haria nada: la exportacion caera a la descarga del ZIP.
async function restoreObsidianVaultName() {
  try {
    const vault = await getStoredVault();
    state.obsidianVaultName = vault?.name || "";
  } catch {
    state.obsidianVaultName = "";
  }
}

function vaultPickerControls() {
  if (!isVaultPickerSupported()) {
    return `<span class="tag">${escapeHtml(t("obsidianPickerUnsupported"))}</span>`;
  }
  if (state.obsidianVaultName) {
    return `<span class="tag" title="${escapeAttr(t("obsidianVaultInUse"))}">${icon("file")}${escapeHtml(state.obsidianVaultName)}</span>`
      + `<button class="button secondary" data-action="choose-vault">${escapeHtml(t("obsidianChangeVault"))}</button>`
      + `<button class="button secondary" data-action="forget-vault">${escapeHtml(t("obsidianForgetVault"))}</button>`;
  }
  return `<button class="button secondary" data-action="choose-vault">${icon("file")}${escapeHtml(t("obsidianChooseVault"))}</button>`;
}

// Elegir la carpeta de la boveda en el propio equipo. Requiere gesto del
// usuario, por eso vive en su propio boton.
async function chooseObsidianVault() {
  try {
    const info = await pickVault();
    state.obsidianVaultName = info.name;
    toast(info.correctedFromParent
      ? `${t("obsidianVaultSelected")} ${info.name} (${t("obsidianVaultCorrected")})`
      : `${t("obsidianVaultSelected")} ${info.name}`);
    render();
  } catch (error) {
    toast(obsidianErrorText(error), true);
  }
}

async function forgetObsidianVault() {
  await forgetVault();
  state.obsidianVaultName = "";
  toast(t("obsidianVaultForgotten"));
  render();
}

function obsidianErrorText(error) {
  const code = String(error?.message || "");
  if (code.includes("obsidian_vault_marker_missing")) return t("obsidianVaultMarkerMissing");
  if (code.includes("obsidian_multiple_vaults_found")) return t("obsidianVaultMultiple");
  if (code.includes("obsidian_permission_denied")) return t("obsidianVaultDenied");
  if (code.includes("obsidian_picker_unsupported")) return t("obsidianPickerUnsupported");
  if (code === "AbortError" || code.includes("aborted")) return t("obsidianVaultCancelled");
  return code || t("failed");
}

async function exportObsidian() {
  const button = document.querySelector("[data-action='export-obsidian']");
  if (button) button.disabled = true;
  try {
    // 1) Si hay carpeta elegida, se escribe DIRECTO en la boveda del equipo.
    //    Es la unica via que llega a la boveda real: el servidor escribe en el
    //    contenedor de Railway, no en el disco del usuario.
    const vault = await getStoredVault({ interactive: true }).catch(() => null);
    if (vault) {
      const bundle = await request("/api/v2/obsidian/preview");
      const files = [...(bundle.files || []), ...(bundle.map ? [bundle.map] : [])];
      const summary = await writeBundleToVault(vault, files);
      state.obsidianPreview = bundle;
      state.obsidianPreviewError = "";
      const parts = [`${t("obsidianExportComplete")} ${summary.written} ${t("files")}.`];
      if (summary.preserved) parts.push(`${t("obsidianHumanPreserved")}: ${summary.preserved}.`);
      if (summary.versioned.length) parts.push(`${t("obsidianVersioned")}: ${summary.versioned.length}.`);
      if (summary.failed.length) parts.push(`${t("failed")}: ${summary.failed.length}.`);
      toast(parts.join(" "), summary.failed.length > 0);
      render();
      return;
    }

    // 2) Sin carpeta elegida: se intenta la boveda del servidor y, si no esta
    //    configurada, se descarga el paquete para descomprimir.
    let serverExported = false;
    try {
      const result = await request("/api/v2/obsidian/export", { method: "POST" });
      serverExported = true;
      toast(`${t("obsidianExportComplete")} ${Number(result.count || 0)} ${t("files")}.`);
    } catch (error) {
      if (!isObsidianVaultUnavailable(error)) throw error;
      await downloadObsidianBundle();
    }
    try {
      state.obsidianPreview = await request("/api/v2/obsidian/preview");
      state.obsidianPreviewError = "";
    } catch (previewError) {
      // Un fallo al refrescar la vista previa NO invalida una exportacion que
      // si ocurrio: antes se mostraba un toast rojo enganoso.
      state.obsidianPreviewError = previewError.message;
      if (!serverExported) throw previewError;
    }
    render();
  } catch (error) {
    toast(obsidianErrorText(error), true);
  } finally {
    if (button) button.disabled = false;
  }
}

function isObsidianVaultUnavailable(error) {
  const text = String(error?.message || "").toLowerCase();
  return text.includes("obsidian_vault_not_configured")
    || text.includes("obsidian_vault_marker_missing")
    || text.includes("enoent");
}

// Descarga todas las notas como ZIP, con la misma estructura de carpetas de la
// boveda (02_Experiences/, 04_Assets/, 05_Generated/), para descomprimir encima.
async function downloadObsidianBundle() {
  const bundle = await request("/api/v2/obsidian/preview");
  const files = [...(bundle.files || []), ...(bundle.map ? [bundle.map] : [])]
    .filter((file) => file && file.path && typeof file.markdown === "string");
  if (!files.length) throw new Error(t("obsidianExportEmpty"));
  const entries = files.map((file) => ({
    name: file.path,
    blob: new Blob([file.markdown], { type: "text/markdown;charset=utf-8" }),
  }));
  downloadBlob(await createZip(entries), "boveda-vibe-obsidian.zip");
  toast(`${t("obsidianExportDownloaded")} ${files.length} ${t("files")}.`);
}

async function loadObsidianPreview() {
  if (state.obsidianPreviewLoading) return;
  state.obsidianPreviewLoading = true;
  state.obsidianPreviewError = "";
  render();
  try {
    state.obsidianPreview = await request("/api/v2/obsidian/preview");
  } catch (error) {
    state.obsidianPreview = null;
    state.obsidianPreviewError = error.message;
  } finally {
    state.obsidianPreviewLoading = false;
    render();
  }
}

async function saveGroup(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  const form = new FormData(event.currentTarget);
  try {
    await request("/api/v2/groups", {
      method: "POST",
      body: {
        displayName: form.get("displayName"),
        segment: form.get("segment"),
      },
    });
    toast(t("groupSaved"));
    await refreshData();
  } catch (error) {
    toast(error.message, true);
    button.disabled = false;
  }
}

async function deactivateGroup(id) {
  if (!id || !window.confirm(t("confirmDeactivateGroup"))) return;
  try {
    await request(`/api/v2/groups/${encodeURIComponent(id)}`, { method: "DELETE" });
    toast(t("groupDeactivated"));
    await refreshData();
  } catch (error) {
    toast(error.message, true);
  }
}

async function connectOura() {
  try {
    const result = await request("/api/v2/integrations/oura/authorize", { method: "POST" });
    if (!result.authorizationUrl) throw new Error("oura_authorization_url_missing");
    window.location.assign(result.authorizationUrl);
  } catch (error) {
    toast(error.message, true);
  }
}

async function syncOura() {
  try {
    const result = await request("/api/v2/integrations/oura/sync", { method: "POST", body: {} });
    toast(`${t("ouraSynced")}: ${Number(result.records || 0)}`);
    await refreshData();
  } catch (error) {
    toast(error.message, true);
  }
}

async function disconnectOura() {
  if (!window.confirm(t("confirmDisconnect"))) return;
  try {
    await request("/api/v2/integrations/oura", { method: "DELETE" });
    toast(t("disconnected"));
    await refreshData();
  } catch (error) {
    toast(error.message, true);
  }
}

function openStoryModal(story = null) {
  const linkedAssets = story ? assetsForStory(story) : [];
  state.modal = {
    type: "story",
    story,
    events: structuredClone(story?.events || []),
    linkedAtOpen: new Set(linkedAssets.map((item) => item.id).filter(Boolean)),
    selected: new Set(linkedAssets.map((item) => item.id).filter(Boolean)),
  };
  renderModal();
}

function renderModal() {
  document.getElementById("activeModal")?.remove();
  if (state.modal?.type === "agenda") {
    renderAgendaModal();
    return;
  }
  const story = state.modal?.story || {};
  const pending = pendingAssets();
  const linked = story.id ? assetsForStory(story) : [];
  const choices = dedupeAssets([...linked, ...pending]);
  const wrapper = document.createElement("div");
  wrapper.id = "activeModal";
  wrapper.className = "modal-backdrop";
  wrapper.innerHTML = `
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="storyModalTitle">
      <header class="modal-header"><h2 id="storyModalTitle">${escapeHtml(story.id ? t("edit") : t("createStory"))}</h2><button class="button secondary icon-only" data-modal-close>${icon("close")}</button></header>
      <form id="storyForm" class="modal-body">
        <div class="form-layout">
          <div>
            <section class="form-section">
              <h3>1. ${escapeHtml(t("narrative"))}</h3>
              <div class="field"><label for="storyTitle">${escapeHtml(t("title"))}</label><input id="storyTitle" name="title" value="${escapeAttr(story.title || "")}" required /></div>
              <div class="field"><label for="storyNarrative">${escapeHtml(t("narrative"))}</label><textarea id="storyNarrative" name="notes" placeholder="${escapeAttr(t("narrativePlaceholder"))}">${escapeHtml(story.notes || "")}</textarea></div>
            </section>
            <section class="form-section">
              <h3>2. ${escapeHtml(t("details"))}</h3>
              <div class="field-grid">
                <div class="field"><label for="storyActivity">${escapeHtml(t("activity"))}</label><select id="storyActivity" name="category">${areas.map((area) => `<option value="${escapeAttr(area)}" ${area === story.category ? "selected" : ""}>${escapeHtml(areaLabel(area))}</option>`).join("")}</select></div>
                <div class="field"><label for="storyDate">${escapeHtml(t("date"))}</label><input id="storyDate" name="timestamp" type="datetime-local" value="${localDateTimeValue(story.timestamp || new Date())}" required /></div>
                <div class="field"><label for="storyPlace">${escapeHtml(t("place"))}</label><input id="storyPlace" name="location" value="${escapeAttr(cleanDefault(story.location))}" /></div>
                <div class="field"><label for="storyPeople">${escapeHtml(t("people"))}</label><input id="storyPeople" name="people" value="${escapeAttr(cleanDefault(story.people))}" /></div>
                <div class="field"><label for="storyGroup">${escapeHtml(t("groupPerson"))}</label><select id="storyGroup" name="participantId"><option value="">${escapeHtml(t("primaryUser"))}</option>${activeGroups().map((group) => `<option value="${escapeAttr(group.id)}" ${group.id === story.participantId ? "selected" : ""}>${escapeHtml(group.displayName)}</option>`).join("")}</select></div>
              </div>
            </section>
            <section class="form-section">
              <div class="section-heading"><div><h3>3. ${escapeHtml(t("events"))}</h3><p>${escapeHtml(t("eventsHelp"))}</p></div><button class="button secondary small" type="button" data-add-event>${icon("plus")}${escapeHtml(t("addEvent"))}</button></div>
              <div id="eventEditor" class="event-editor">${eventEditorRows(state.modal.events)}</div>
            </section>
          </div>
          <aside>
            <div class="section-heading"><div><h3>4. ${escapeHtml(t("chooseEvidence"))}</h3><p>${pending.length} ${escapeHtml(t("pending"))}</p></div></div>
            <div class="evidence-picker">${choices.length ? `<div class="picker-grid">${choices.map((asset) => pickerItem(asset, state.modal.selected.has(asset.id))).join("")}</div>` : `<div class="empty">${escapeHtml(t("noEvidence"))}</div>`}</div>
          </aside>
        </div>
        <div class="sticky-actions">${story.id ? `<button type="button" class="button danger" data-delete-story>${icon("delete")}${escapeHtml(t("deleteStory"))}</button>` : ""}<button type="button" class="button secondary" data-modal-close>${escapeHtml(t("cancel"))}</button><button class="button" type="submit">${icon("check")}${escapeHtml(t("save"))}</button></div>
      </form>
    </section>`;
  document.body.appendChild(wrapper);
  wrapper.querySelectorAll("[data-modal-close]").forEach((button) => button.addEventListener("click", () => closeModal()));
  wrapper.addEventListener("click", (event) => {
    if (event.target === wrapper) closeModal();
  });
  wrapper.querySelectorAll("[data-picker-id]").forEach((input) => input.addEventListener("change", () => {
    if (input.checked) state.modal.selected.add(input.value);
    else state.modal.selected.delete(input.value);
  }));
  wrapper.querySelector("#storyForm")?.addEventListener("submit", saveStory);
  wrapper.querySelector("[data-add-event]")?.addEventListener("click", () => {
    state.modal.events.push({
      id: crypto.randomUUID(),
      title: "",
      narrativeText: "",
      timestamp: story.timestamp || new Date().toISOString(),
    });
    renderModal();
  });
  wrapper.querySelectorAll("[data-remove-event]").forEach((button) => {
    button.addEventListener("click", () => {
      state.modal.events.splice(Number(button.dataset.removeEvent), 1);
      renderModal();
    });
  });
  wrapper.querySelector("[data-delete-story]")?.addEventListener("click", deleteCurrentStory);
  hydrateAssetPreviews(wrapper);
}

function openAgendaModal(item = null) {
  state.modal = { type: "agenda", item };
  renderAgendaModal();
}

function renderAgendaModal() {
  document.getElementById("activeModal")?.remove();
  const item = state.modal?.item || {};
  const wrapper = document.createElement("div");
  wrapper.id = "activeModal";
  wrapper.className = "modal-backdrop";
  wrapper.innerHTML = `
    <section class="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="agendaModalTitle">
      <header class="modal-header"><h2 id="agendaModalTitle">${escapeHtml(item.id ? t("editAgendaEvent") : t("newAgendaEvent"))}</h2><button class="button secondary icon-only" data-modal-close>${icon("close")}</button></header>
      <form id="agendaForm" class="modal-body">
        <div class="field"><label for="agendaTitle">${escapeHtml(t("title"))}</label><input id="agendaTitle" name="title" value="${escapeAttr(item.title || "")}" required /></div>
        <div class="field"><label for="agendaDescription">${escapeHtml(t("description"))}</label><textarea id="agendaDescription" name="description">${escapeHtml(item.description || "")}</textarea></div>
        <div class="field-grid">
          <div class="field"><label for="agendaStart">${escapeHtml(t("start"))}</label><input id="agendaStart" name="startAt" type="datetime-local" value="${localDateTimeValue(item.startAt || new Date())}" required /></div>
          <div class="field"><label for="agendaEnd">${escapeHtml(t("end"))}</label><input id="agendaEnd" name="endAt" type="datetime-local" value="${localDateTimeValue(item.endAt || item.startAt || new Date())}" required /></div>
          <div class="field"><label for="agendaPlace">${escapeHtml(t("place"))}</label><input id="agendaPlace" name="location" value="${escapeAttr(item.location || "")}" /></div>
          <div class="field"><label for="agendaPeople">${escapeHtml(t("people"))}</label><input id="agendaPeople" name="participants" value="${escapeAttr(item.participants || "")}" /></div>
          <div class="field"><label for="agendaGroup">${escapeHtml(t("groupPerson"))}</label><select id="agendaGroup" name="participantId"><option value="">${escapeHtml(t("primaryUser"))}</option>${activeGroups().map((group) => `<option value="${escapeAttr(group.id)}" ${group.id === item.participantId ? "selected" : ""}>${escapeHtml(group.displayName)}</option>`).join("")}</select></div>
          <div class="field"><label for="agendaStatus">${escapeHtml(t("status"))}</label><select id="agendaStatus" name="status">${["Planificado", "Confirmado", "Completado", "Cancelado"].map((status) => `<option value="${status}" ${status === item.status ? "selected" : ""}>${escapeHtml(t(`agendaStatus.${status}`))}</option>`).join("")}</select></div>
        </div>
        <p class="muted-copy">${escapeHtml(t("agendaNotStory"))}</p>
        <div class="sticky-actions">${item.id ? `<button type="button" class="button danger" data-delete-agenda>${icon("delete")}${escapeHtml(t("delete"))}</button>` : ""}<button type="button" class="button secondary" data-modal-close>${escapeHtml(t("cancel"))}</button><button class="button" type="submit">${icon("check")}${escapeHtml(t("save"))}</button></div>
      </form>
    </section>`;
  document.body.appendChild(wrapper);
  wrapper.querySelectorAll("[data-modal-close]").forEach((button) => button.addEventListener("click", closeModal));
  wrapper.addEventListener("click", (event) => {
    if (event.target === wrapper) closeModal();
  });
  wrapper.querySelector("#agendaForm")?.addEventListener("submit", saveAgendaEvent);
  wrapper.querySelector("[data-delete-agenda]")?.addEventListener("click", deleteAgendaEvent);
}

async function saveAgendaEvent(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const existing = state.modal?.item || {};
  const payload = {
    title: form.get("title"),
    description: form.get("description"),
    startAt: new Date(form.get("startAt")).toISOString(),
    endAt: new Date(form.get("endAt")).toISOString(),
    location: form.get("location"),
    participants: form.get("participants"),
    participantId: form.get("participantId"),
    status: form.get("status"),
    sourceType: existing.sourceType || "vibepwa",
  };
  const submit = event.currentTarget.querySelector("[type='submit']");
  submit.disabled = true;
  try {
    await request(existing.id ? `/api/v2/agenda/${encodeURIComponent(existing.id)}` : "/api/v2/agenda", {
      method: existing.id ? "PUT" : "POST",
      body: payload,
    });
    closeModal();
    toast(t("agendaSaved"));
    await refreshData();
  } catch (error) {
    submit.disabled = false;
    toast(error.message, true);
  }
}

async function deleteAgendaEvent() {
  const item = state.modal?.item;
  if (!item?.id || !window.confirm(t("confirmDeleteAgenda"))) return;
  try {
    await request(`/api/v2/agenda/${encodeURIComponent(item.id)}`, { method: "DELETE" });
    closeModal();
    toast(t("agendaDeleted"));
    await refreshData();
  } catch (error) {
    toast(error.message, true);
  }
}

async function saveStory(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const existing = state.modal.story || {};
  const payload = {
    ...existing,
    id: existing.id || crypto.randomUUID(),
    title: form.get("title"),
    notes: form.get("notes"),
    category: form.get("category"),
    timestamp: new Date(form.get("timestamp")).toISOString(),
    location: form.get("location"),
    people: form.get("people"),
    participantId: form.get("participantId"),
    mood: existing.mood || "",
    energy: existing.energy ?? null,
    attachments: existing.attachments || [],
    captureIds: Array.from(state.modal.selected).filter((id) => {
      const asset = allAssets().find((item) => item.id === id);
      return Boolean(asset?.captureId);
    }),
    legacyAssetIds: Array.from(state.modal.selected).filter((id) => {
      const asset = allAssets().find((item) => item.id === id);
      return Boolean(asset && !asset.captureId);
    }),
    events: Array.from(event.currentTarget.querySelectorAll("[data-event-row]")).map((row) => ({
      id: row.dataset.eventId || crypto.randomUUID(),
      title: row.querySelector("[data-event-title]")?.value || "",
      narrativeText: row.querySelector("[data-event-narrative]")?.value || "",
      timestamp: new Date(row.querySelector("[data-event-time]")?.value || form.get("timestamp")).toISOString(),
    })),
    metadata: { ...(existing.metadata || {}), narrativeOrigin: form.get("notes") ? "human_text" : "pending" },
  };
  const submit = event.currentTarget.querySelector("[type='submit']");
  submit.disabled = true;
  try {
    const saved = await request(existing.id ? `/api/v2/experiences/${encodeURIComponent(existing.id)}` : "/api/v2/experiences", {
      method: existing.id ? "PUT" : "POST",
      body: payload,
    });
    closeModal();
    toast(t("storySaved"));
    await refreshData();
  } catch (error) {
    toast(error.message, true);
    submit.disabled = false;
  }
}

async function deleteCurrentStory() {
  const story = state.modal?.story;
  if (!story?.id || !window.confirm(t("confirmDelete"))) return;
  const button = document.querySelector("[data-delete-story]");
  if (button) button.disabled = true;
  try {
    await request(`/api/v2/experiences/${encodeURIComponent(story.id)}`, { method: "DELETE" });
    closeModal();
    toast(t("storyDeleted"));
    await refreshData();
  } catch (error) {
    toast(error.message, true);
    if (button) button.disabled = false;
  }
}

function closeModal() {
  state.modal = null;
  document.getElementById("activeModal")?.remove();
}

async function handleEvidenceFile(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  for (const file of files) {
    const captureId = crypto.randomUUID();
    await enqueueUpload(file, {
      captureId,
      idempotencyKey: `web-${captureId}`,
      occurredAt: new Date(file.lastModified || Date.now()).toISOString(),
      source: { app: "vibepwa", platform: "web" },
    });
  }
  state.upload = {
    queueId: "",
    name: files.length === 1 ? files[0].name : `${files.length} ${t("files")}`,
    progress: 2,
    status: t("uploading"),
  };
  event.target.value = "";
  await refreshOfflineQueue();
  await drainOfflineUploads();
}

async function retryEvidenceUpload() {
  if (!state.upload?.queueId) return;
  state.upload.error = false;
  state.upload.progress = 2;
  state.upload.status = t("uploading");
  await runEvidenceUpload();
}

async function runEvidenceUpload() {
  const current = state.upload;
  if (!current?.queueId) return;
  render();
  try {
    await retryQueuedUpload(current.queueId, uploadEvidence, {
      onProgress(progress) {
        updateUploadProgress(progress);
      },
    });
    state.upload = { name: current.name, progress: 100, status: t("ready"), queueId: "" };
    toast(t("evidenceSaved"));
    await refreshOfflineQueue();
    await refreshData();
  } catch (error) {
    const waitingForConnection = !navigator.onLine;
    state.upload = {
      ...current,
      progress: waitingForConnection ? 4 : 100,
      status: waitingForConnection ? t("queuedOffline") : `${t("failed")}: ${error.message}`,
      error: true,
    };
    await refreshOfflineQueue();
    render();
    toast(waitingForConnection ? t("queuedOffline") : error.message, !waitingForConnection);
  }
}

async function refreshOfflineQueue() {
  try {
    state.offlineQueue = await getUploadQueueSummary();
    state.offlineQueueError = "";
  } catch (error) {
    // Antes se fabricaba "0 pendientes" cuando la lectura de la cola fallaba:
    // el banner desaparecia y el usuario concluia que todo se habia subido.
    // Se conserva el ultimo valor conocido y se registra el error.
    state.offlineQueueError = error?.message || "queue_unavailable";
  }
}

async function drainOfflineUploads() {
  if (!state.session?.accessToken || !navigator.onLine) return;
  await drainUploadQueue(uploadEvidence, {
    onItemStart(item) {
      state.upload = {
        queueId: item.queueId,
        captureId: item.captureId,
        idempotencyKey: item.idempotencyKey,
        name: item.filename,
        progress: 2,
        status: t("uploading"),
      };
      render();
    },
    onProgress(_item, progress) {
      updateUploadProgress(progress);
    },
    onItemComplete(item) {
      state.upload = { name: item.filename, progress: 100, status: t("ready"), queueId: "" };
    },
    onItemError(item, error) {
      state.upload = {
        queueId: item.queueId,
        captureId: item.captureId,
        idempotencyKey: item.idempotencyKey,
        name: item.filename,
        progress: 100,
        status: `${t("failed")}: ${error.message}`,
        error: true,
      };
    },
  });
  await refreshOfflineQueue();
  await refreshData();
}

function updateUploadProgress(progress) {
  state.upload.progress = progress;
  const bar = document.querySelector(".upload-progress span");
  if (bar) bar.style.width = `${progress}%`;
}

async function downloadAsset(assetId) {
  try {
    const asset = allAssets().find((item) => item.id === assetId);
    let result;
    try {
      result = await request(`/api/v2/assets/${encodeURIComponent(assetId)}/download`);
    } catch (error) {
      if (!asset?.captureId || error.status !== 404) throw error;
      result = await request(`/api/v2/captures/${encodeURIComponent(asset.captureId)}/download`);
    }
    window.open(result.url || result.signedUrl, "_blank", "noopener");
  } catch (error) {
    toast(error.message, true);
  }
}

async function generatePdf(type) {
  const stories = filteredStories();
  const payload = analyticalPayload(stories);
  const endpoint = type === "report" ? "/api/v2/outputs/report/pdf" : "/api/v2/outputs/insights/pdf";
  try {
    const blob = await request(endpoint, {
      method: "POST",
      body: type === "report" ? { report: payload } : payload,
      responseType: "blob",
    });
    downloadBlob(blob, type === "report" ? "reporte-vibe.pdf" : "hallazgos-vibe.pdf");
    toast(t("generated"));
  } catch (error) {
    toast(error.message, true);
  }
}

async function generatePublication() {
  const stories = filteredStories().filter((item) => state.selectedPublicationStories.has(item.id));
  if (!stories.length) {
    toast(t("selectAtLeastOne"), true);
    return;
  }
  const title = document.getElementById("publicationTitle")?.value || t("publicationDefault");
  const enrichedStories = await enrichPublicationStories(stories);
  const html = publicationHtml(title, enrichedStories);
  try {
    const blob = await request("/api/v2/outputs/publication/pdf", {
      method: "POST",
      body: {
        title,
        language: state.language,
        html,
        draft: {
          title,
          type: "premium-magazine",
          stories: enrichedStories,
          generatedAt: new Date().toISOString(),
        },
      },
      responseType: "blob",
    });
    const videos = enrichedStories.flatMap((story) =>
      (story.attachments || []).filter((item) => assetKind(item) === "video" && item.resolvedUrl),
    );
    // Antes: `if (response.ok)` sin else descartaba en silencio cada video con
    // URL caducada, se descargaba igual un zip "pdf-videos" incompleto y se
    // cantaba "Archivo generado". Ahora se cuentan los fallos y se avisa.
    let missingVideos = 0;
    if (videos.length) {
      const entries = [{ name: "publicacion-vibe.pdf", blob }];
      for (const [index, video] of videos.entries()) {
        let ok = false;
        try {
          const response = await fetch(video.resolvedUrl);
          if (response.ok) {
            // Prefijo por indice: dos adjuntos homonimos colisionaban en el zip.
            const name = video.name || video.filename || "video.mp4";
            entries.push({
              name: `videos/${String(index + 1).padStart(2, "0")}-${name}`,
              blob: await response.blob(),
            });
            ok = true;
          }
        } catch {
          ok = false;
        }
        if (!ok) missingVideos += 1;
      }
      if (missingVideos === videos.length) {
        throw new Error(`${t("failed")}: ${missingVideos}/${videos.length} ${t("kind.video")}`);
      }
      downloadBlob(await createZip(entries), "publicacion-vibe-pdf-videos.zip");
    } else {
      downloadBlob(blob, "publicacion-vibe.pdf");
    }
    if (missingVideos > 0) {
      toast(`${t("generated")} — ${missingVideos}/${videos.length} ${t("kind.video")}: ${t("failed")}`, true);
    } else {
      toast(t("generated"));
    }
  } catch (error) {
    toast(error.message, true);
  }
}

async function enrichPublicationStories(stories) {
  return Promise.all(stories.map(async (story) => ({
    ...story,
    attachments: await Promise.all(assetsForStory(story).map(async (attachment) => {
      const existing = attachment.url || attachment.signedUrl || attachment.previewUrl || "";
      if (existing) return { ...attachment, resolvedUrl: existing };
      const id = attachment.id || attachment.assetId;
      if (!id) return attachment;
      try {
        const result = await request(`/api/v2/assets/${encodeURIComponent(id)}/download`);
        return { ...attachment, resolvedUrl: result.url || result.signedUrl || "" };
      } catch {
        return attachment;
      }
    })),
  })));
}

function storyList(stories) {
  if (!stories.length) return `<div class="empty">${escapeHtml(t("emptyStories"))}</div>`;
  return `<div class="story-list">${stories.map((story) => `
    <button class="story-row clickable" data-story-id="${escapeAttr(story.id)}">
      <time class="story-date">${formatShortDate(story.timestamp)}</time>
      <div><p class="story-title">${escapeHtml(story.title)}</p><p class="story-summary">${escapeHtml(story.notes || t("pendingNarrative"))}</p><div class="story-meta"><span class="tag">${escapeHtml(story.category ? areaLabel(story.category) : t("noArea"))}</span>${(story.attachments?.length || 0) ? `<span class="tag accent">${story.attachments.length} ${escapeHtml(t("assets"))}</span>` : ""}</div></div>
      ${icon("chevron")}
    </button>`).join("")}</div>`;
}

function evidenceTile(asset) {
  const linked = Boolean(asset.experienceId || asset.linkedExperienceId || asset.adoptionStatus === "adopted");
  return `<article class="evidence-tile">
    <div class="evidence-preview" data-asset-preview="${escapeAttr(asset.id)}" data-asset-kind="${escapeAttr(assetKind(asset))}">${assetFallback(asset)}</div>
    <div class="evidence-body"><p class="evidence-name" title="${escapeAttr(asset.name || asset.filename || "")}">${escapeHtml(asset.name || asset.filename || t("evidenceItem"))}</p><p class="evidence-detail">${escapeHtml(assetKind(asset))} · ${formatShortDate(asset.capturedAt || asset.uploadedAt)}</p><div class="evidence-actions"><span class="tag ${linked ? "" : "accent"}">${escapeHtml(linked ? t("linked") : t("pending"))}</span><button class="button ghost icon-only small" data-asset-download="${escapeAttr(asset.id)}" title="${escapeHtml(t("download"))}">${icon("download")}</button></div></div>
  </article>`;
}

function pickerItem(asset, selected) {
  return `<label class="picker-item"><input type="checkbox" data-picker-id="${escapeAttr(asset.id)}" value="${escapeAttr(asset.id)}" ${selected ? "checked" : ""}/><div class="picker-item-body"><div class="picker-preview" data-asset-preview="${escapeAttr(asset.id)}" data-asset-kind="${escapeAttr(assetKind(asset))}">${assetFallback(asset)}</div><div class="picker-caption">${escapeHtml(asset.name || asset.filename || t("evidenceItem"))}</div></div></label>`;
}

async function hydrateAssetPreviews(root = document) {
  const nodes = Array.from(root.querySelectorAll("[data-asset-preview]"));
  await Promise.all(nodes.map(async (node) => {
    if (node.dataset.loaded === "1") return;
    // El id y el tipo YA estan en el propio elemento. Antes se volvia a buscar
    // el activo en allAssets() y, si la busqueda no encontraba coincidencia
    // (ids distintos entre la lista que pinta y la que consulta), se salia en
    // SILENCIO: sin miniatura y sin rastro en consola. Por eso solo se veian
    // los iconos y no habia nada que depurar.
    const id = node.dataset.assetPreview || "";
    if (!id) return;
    const asset = allAssets().find((item) => item.id === id
      || item.captureId === id
      || item.assetId === id) || {};
    const kind = node.dataset.assetKind || assetKind(asset);
    if (kind !== "image" && kind !== "video") return;

    let url = asset.previewUrl || asset.signedUrl || asset.url || asset.dataUrl || "";
    if (!url) {
      const candidates = [
        `/api/v2/assets/${encodeURIComponent(id)}/download`,
        `/api/v2/captures/${encodeURIComponent(asset.captureId || id)}/download`,
      ];
      const errors = [];
      for (const endpoint of candidates) {
        try {
          const result = await request(endpoint);
          url = result.url || result.signedUrl || "";
          if (url) break;
          errors.push(`${endpoint}: sin url en la respuesta`);
        } catch (error) {
          errors.push(`${endpoint}: ${error?.message || error}`);
        }
      }
      if (!url) {
        node.dataset.previewError = errors.join(" | ");
        console.warn("asset_preview_failed", id, errors);
        return;
      }
    }
    if (kind === "image") {
      node.innerHTML = `<img src="${escapeAttr(url)}" alt="" loading="lazy" />`;
    } else {
      // Con preload="metadata" el navegador carga la cabecera pero NO pinta
      // ningun fotograma: el recuadro quedaba vacio. El fragmento #t=0.1 le
      // pide posicionarse en el primer instante, y ahi si dibuja el frame.
      // playsinline evita que iOS abra el reproductor a pantalla completa.
      const posterUrl = `${url}${url.includes("#") ? "" : "#t=0.1"}`;
      node.innerHTML = `<video src="${escapeAttr(posterUrl)}" preload="metadata" muted playsinline></video>`;
    }
    node.dataset.loaded = "1";
  }));
}

function filterToolbar(includeArea) {
  return `<div class="toolbar">
    <div class="search-box">${icon("search")}<input class="filter-control" data-filter="search" value="${escapeAttr(state.filters.search)}" placeholder="${escapeAttr(t("search"))}" /></div>
    ${includeArea ? `<div class="compact-field"><label>${escapeHtml(t("activity"))}</label><select class="filter-control" data-filter="area"><option value="">${escapeHtml(t("all"))}</option>${areas.map((area) => `<option value="${escapeAttr(area)}" ${state.filters.area === area ? "selected" : ""}>${escapeHtml(areaLabel(area))}</option>`).join("")}</select></div>` : ""}
    <div class="compact-field"><label>${escapeHtml(t("groupPerson"))}</label><select class="filter-control" data-filter="group"><option value="">${escapeHtml(t("allGroups"))}</option><option value="__primary__" ${state.filters.group === "__primary__" ? "selected" : ""}>${escapeHtml(t("primaryUser"))}</option>${activeGroups().map((group) => `<option value="${escapeAttr(group.id)}" ${state.filters.group === group.id ? "selected" : ""}>${escapeHtml(group.displayName)}</option>`).join("")}</select></div>
    <div class="compact-field"><label>${escapeHtml(t("from"))}</label><input class="filter-control" data-filter="from" type="date" value="${escapeAttr(state.filters.from)}" /></div>
    <div class="compact-field"><label>${escapeHtml(t("to"))}</label><input class="filter-control" data-filter="to" type="date" value="${escapeAttr(state.filters.to)}" /></div>
  </div>`;
}

function filteredStories() {
  const search = state.filters.search.trim().toLowerCase();
  return (state.data.experiences || []).filter((item) => {
    const haystack = [item.title, item.notes, item.category, item.location, item.people].join(" ").toLowerCase();
    return (!search || haystack.includes(search))
      && (!state.filters.area || item.category === state.filters.area)
      && participantMatches(item.participantId)
      && inDateRange(item.timestamp);
  });
}

function filteredAssets() {
  const search = state.filters.search.trim().toLowerCase();
  return allAssets().filter((item) => {
    const haystack = [item.name, item.filename, item.type, item.payloadType, item.sourceType].join(" ").toLowerCase();
    const story = storyForAsset(item);
    return (!search || haystack.includes(search))
      && (!state.filters.area || story?.category === state.filters.area)
      && participantMatches(item.participantId || story?.participantId)
      && inDateRange(item.capturedAt || item.occurredAt || item.uploadedAt);
  });
}

function filteredAgenda() {
  const search = state.filters.search.trim().toLowerCase();
  return (state.data.agenda || []).filter((item) => {
    const haystack = [item.title, item.description, item.location, item.participants, item.status].join(" ").toLowerCase();
    return (!search || haystack.includes(search))
      && participantMatches(item.participantId)
      && inDateRange(item.startAt);
  });
}

function participantMatches(value) {
  if (!state.filters.group) return true;
  if (state.filters.group === "__primary__") return !value;
  return String(value || "") === state.filters.group;
}

function storyForAsset(asset) {
  const storyId = String(asset.experienceId || asset.linkedExperienceId || asset.metadata?.linkedExperienceId || "");
  return storyId ? (state.data.experiences || []).find((story) => String(story.id) === storyId) : null;
}

function inDateRange(value) {
  const stamp = new Date(value || 0).getTime();
  if (state.filters.from && stamp < new Date(`${state.filters.from}T00:00:00`).getTime()) return false;
  if (state.filters.to && stamp > new Date(`${state.filters.to}T23:59:59`).getTime()) return false;
  return true;
}

function pendingAssets() {
  return allAssets().filter((item) =>
    !(item.experienceId || item.linkedExperienceId) &&
    item.adoptionStatus !== "adopted" &&
    item.targetLayer !== "context",
  );
}

function allAssets() {
  const byKey = new Map();
  [...(state.data.captures || []), ...(state.data.assets || [])].forEach((item) => {
    const key = item.captureId || item.sourceId || item.storagePath || item.path || item.id;
    if (!key) return;
    const prior = byKey.get(key) || {};
    byKey.set(key, { ...prior, ...item });
  });
  return Array.from(byKey.values()).sort(
    (a, b) => new Date(b.capturedAt || b.occurredAt || b.uploadedAt || 0) - new Date(a.capturedAt || a.occurredAt || a.uploadedAt || 0),
  );
}

function assetsForStory(story = {}) {
  const storyId = String(story.id || "");
  return dedupeAssets([
    ...(story.attachments || []),
    ...allAssets().filter((asset) =>
      String(asset.experienceId || asset.linkedExperienceId || asset.metadata?.linkedExperienceId || "") === storyId,
    ),
  ]);
}

function dedupeAssets(assets = []) {
  const byId = new Map();
  assets.forEach((asset) => {
    const id = asset?.id || asset?.assetId || asset?.captureId || asset?.sourceId;
    if (!id) return;
    byId.set(id, { ...byId.get(id), ...asset, id });
  });
  return Array.from(byId.values());
}

function analyticalPayload(stories) {
  const counts = areaCounts(stories);
  const energy = recordedEnergy(stories);
  const context = state.data.context || {};
  const signals = (state.data.contextSignals || []).filter(contextSignalInScope);
  const metrics = cleanMetrics(context.metrics || {});
  const evidence = filteredAssets();
  const briefing = state.data.briefing?.payload || {};
  const multimodalEvidence = evidence.map((item) => ({
    id: item.id || item.captureId || "",
    name: item.name || item.filename || t("evidenceItem"),
    kind: evidenceKind(item),
    capturedAt: item.capturedAt || item.occurredAt || item.uploadedAt || null,
    experienceTitle: stories.find((story) => story.id === (item.experienceId || item.linkedExperienceId))?.title || "",
    mimeType: item.mimeType || "",
    sizeBytes: Number(item.sizeBytes || item.size || 0),
    source: item.sourceType || item.source?.app || "",
    analyticalText: item.analyticalText || item.transcript || item.text || "",
  }));
  const contextEvidence = signals.map((signal) => ({
    id: signal.id,
    name: contextSignalLabel(signal),
    kind: signal.signalType,
    capturedAt: signal.capturedAt,
    location: signal.location || "",
    source: signal.sourceType || "",
    metrics: signal.metrics || {},
    analyticalText: contextSignalText(signal),
  }));
  const measurementRecords = Number(context.biometricSignals || 0);
  const hasMeasurements = measurementRecords > 0 && Object.keys(metrics).length > 0;
  const reliableDataPoints = stories.length + multimodalEvidence.length + contextEvidence.length;
  return {
    generatedAt: new Date().toISOString(),
    language: state.language,
    summary: {
      totalExperiences: stories.length,
      capturedHours: Number((totalMinutes(stories) / 60).toFixed(1)),
      averageEnergy: energy.length ? Number((energy.reduce((sum, value) => sum + value, 0) / energy.length).toFixed(1)) : null,
      topCategory: counts.slice().sort((a, b) => b.count - a.count)[0]?.count ? counts.slice().sort((a, b) => b.count - a.count)[0].area : "",
    },
    categoryBreakdown: counts.map((item) => ({
      category: item.area,
      count: item.count,
      minutes: stories.filter((story) => story.category === item.area).reduce((sum, story) => sum + Number(story.duration || 0), 0),
      percentage: stories.length ? Math.round((item.count / stories.length) * 100) : 0,
    })),
    rows: stories.map((story) => ({
      fecha: story.timestamp,
      titulo: story.title,
      categoria: story.category,
      duracion_min: Number(story.duration || 0),
      energia: Number.isFinite(Number(story.energy)) ? Number(story.energy) : "",
      estado: story.mood || "",
      ubicacion: cleanDefault(story.location),
      personas: cleanDefault(story.people),
      eventos: story.events?.length || 0,
      adjuntos: story.attachments?.length || 0,
      notas: story.notes || "",
    })),
    experiences: stories,
    findings: buildFindings(stories, briefing),
    multimodalEvidence,
    contextEvidence,
    evidenceInventory: {
      total: evidence.length + signals.length,
      evidence: evidence.length,
      context: signals.length,
      readable: [...multimodalEvidence, ...contextEvidence].filter((item) => item.analyticalText).length,
      images: evidence.filter((item) => evidenceKind(item) === "image").length,
      videos: evidence.filter((item) => evidenceKind(item) === "video").length,
      audio: evidence.filter((item) => evidenceKind(item) === "audio").length,
      documents: evidence.filter((item) => evidenceKind(item) === "document").length,
      measurements: {
        hasMeasurements,
        records: measurementRecords,
        metrics,
      },
    },
    biometricContext: {
      status: context.biometricSignals > 0 ? "available" : "not_available",
      records: Number(context.biometricSignals || 0),
      metrics,
      energy: Number.isFinite(Number(context.energy)) ? Number(context.energy) : null,
    },
    currentContext: {
      records: contextEvidence.length,
      latestLocation: context.latestLocation || "",
      latestWeather: context.latestWeather || null,
      latestNews: context.latestNews || null,
      latestEntertainment: context.latestEntertainment || null,
      agenda: filteredAgenda(),
      briefing,
    },
    contextImpact: briefing.impact || null,
    outputScope: {
      presentationMode: stories.length ? "stories" : "evidence_inventory",
      stories: stories.length,
      evidence: multimodalEvidence.length,
      context: contextEvidence.length,
    },
    dataQuality: {
      score: Math.min(100, Math.round(
        (stories.filter(hasHumanNarrative).length * 20 + reliableDataPoints * 3 + (hasMeasurements ? 15 : 0)) /
        Math.max(1, stories.length * 20 + reliableDataPoints * 3 + 15) * 100,
      )),
      hasMeasurements,
      missingEnergy: stories.filter((story) => !Number.isFinite(Number(story.energy))).length,
    },
  };
}

function contextSignalInScope(signal) {
  const stamp = new Date(signal.capturedAt || signal.validFrom || 0).getTime();
  if (!Number.isFinite(stamp)) return false;
  if (!participantMatches(signal.participantId)) return false;
  if (state.filters.from && stamp < new Date(`${state.filters.from}T00:00:00`).getTime()) return false;
  if (state.filters.to && stamp > new Date(`${state.filters.to}T23:59:59`).getTime()) return false;
  return true;
}

function cleanMetrics(metrics) {
  return Object.fromEntries(Object.entries(metrics || {})
    .filter(([key, value]) => !key.startsWith("_") && Number.isFinite(Number(value)))
    .map(([key, value]) => [key, Number(value)]));
}

function evidenceKind(item = {}) {
  const kind = String(item.kind || "").toLowerCase();
  if (["image", "video", "audio", "document"].includes(kind)) return kind;
  const mime = String(item.mimeType || item.type || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

function buildFindings(stories, briefing = {}) {
  const counts = areaCounts(stories).filter((item) => item.count).sort((a, b) => b.count - a.count);
  const findings = [];
  if (stories.length) {
    findings.push(
      { title: t("mostPresentArea"), detail: `${counts[0]?.area ? areaLabel(counts[0].area) : t("noArea")}: ${counts[0]?.count || 0} ${t("storiesInPeriod")}.`, confidence: 85 },
      { title: t("narrativeQualityFinding"), detail: `${stories.filter(hasHumanNarrative).length}/${stories.length} ${t("storyCountText")}.`, confidence: 100 },
    );
  }
  if (briefing.impact?.summary) {
    findings.push({
      title: t("contextImpact"),
      detail: briefing.impact.summary,
      confidence: briefing.weather?.status === "available" && briefing.news?.status === "available" ? 90 : 60,
    });
  }
  return findings;
}

function contextSignalLabel(signal = {}) {
  const labels = {
    biometric: t("healthContext"),
    location: t("locationWeather"),
    weather: t("weather"),
    news: t("currentNews"),
    entertainment: t("entertainment"),
    agenda: t("agenda"),
    sensor: t("healthContext"),
  };
  return labels[signal.signalType] || signal.signalType || t("evidenceItem");
}

function contextSignalText(signal = {}) {
  if (signal.signalType === "biometric") {
    const values = cleanMetrics(signal.metrics || {});
    return Object.entries(values).map(([key, value]) => `${key}: ${value}`).join(", ");
  }
  const payload = signal.payload || {};
  if (Array.isArray(payload.items)) return payload.items.slice(0, 5).map((item) => item.title).filter(Boolean).join("; ");
  return payload.description || payload.text || payload.summary || signal.location || "";
}

function publicationHtml(title, stories) {
  return `<!doctype html><html lang="${state.language}"><head><meta charset="utf-8"><style>
  @page{size:Letter;margin:18mm}body{font-family:Arial,sans-serif;color:#17201b;margin:0}header{padding:40px 0 28px;border-bottom:4px solid #176b5b}h1{font-size:38px;margin:0 0 8px}header p{color:#607069}article{padding:26px 0;border-bottom:1px solid #d6dfda;break-inside:avoid}h2{font-size:24px;margin:0 0 8px}.meta{color:#607069;font-size:12px}.narrative{font-size:15px;line-height:1.6;white-space:pre-wrap}.context{margin:20px 0;padding:16px;background:#edf2ef;border-left:4px solid #176b5b}.context h2{font-size:18px}.context-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.context-grid p{margin:0;font-size:12px}.events{margin-top:14px;padding-left:18px}.events li{margin:6px 0;line-height:1.45}.evidence{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:14px}.evidence img{width:100%;max-height:420px;object-fit:contain;image-orientation:from-image;background:#f4f6f4}.evidence span{padding:10px;background:#edf2ef;font-size:11px;overflow-wrap:anywhere}</style></head><body>
  <header><h1>${escapeHtml(title)}</h1><p>${formatLongDate(new Date())} · ${stories.length} ${escapeHtml(t("experiences"))}</p></header>
  ${publicationContextHtml()}
  ${stories.slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).map((story) => `<article><p class="meta">${formatLongDate(story.timestamp)} · ${escapeHtml(story.category ? areaLabel(story.category) : "")}${story.location ? ` · ${escapeHtml(story.location)}` : ""}</p><h2>${escapeHtml(story.title)}</h2><div class="narrative">${escapeHtml(story.notes || t("pendingNarrative"))}</div>${story.events?.length ? `<ol class="events">${story.events.slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).map((event) => `<li><strong>${escapeHtml(event.title || t("event"))}</strong>${event.narrativeText ? `: ${escapeHtml(event.narrativeText)}` : ""}</li>`).join("")}</ol>` : ""}${story.attachments?.length ? `<div class="evidence">${story.attachments.map((item) => assetKind(item) === "image" && item.resolvedUrl ? `<img src="${escapeAttr(item.resolvedUrl)}" alt="" />` : `<span>${escapeHtml(item.name || item.filename || t("evidenceItem"))}${assetKind(item) === "video" ? ` · ${escapeHtml(t("videoInPackage"))}` : ""}</span>`).join("")}</div>` : ""}</article>`).join("")}
  </body></html>`;
}

function publicationContextHtml() {
  const context = state.data.context || {};
  const briefing = state.data.briefing?.payload || {};
  const metrics = cleanMetrics(context.metrics || {});
  const values = [
    [t("heartRate"), metricValue(metrics, ["heartAvg", "heartRate", "heart_rate", "heartRateAvg", "heartRateBpm", "average_heart_rate"]), "bpm"],
    [t("steps"), metricValue(metrics, ["steps", "stepCount"]), ""],
    [t("sleep"), formatSleep(metricValue(metrics, ["sleepMinutes", "sleep_duration", "sleep"])), ""],
    [t("activeEnergy"), metricValue(metrics, ["activeEnergy", "active_calories", "activeEnergyKcal"]), "kcal"],
    [t("locationWeather"), briefing.location?.label || context.latestLocation || "", ""],
    [t("weather"), briefing.weather?.description || "", ""],
    [t("contextImpact"), briefing.impact?.summary || "", ""],
  ].filter(([, value]) => value !== "" && value != null);
  if (!values.length) return "";
  return `<section class="context"><h2>${escapeHtml(t("contextTitle"))}</h2><div class="context-grid">${values.map(([label, value, suffix]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(String(value))}${suffix ? ` ${escapeHtml(suffix)}` : ""}</p>`).join("")}</div></section>`;
}

function publicationSelection(story) {
  const checked = state.selectedPublicationStories.has(story.id);
  return `<label class="selection-row"><input type="checkbox" data-publication-story value="${escapeAttr(story.id)}" ${checked ? "checked" : ""}/><span><strong>${escapeHtml(story.title)}</strong><span>${formatShortDate(story.timestamp)} · ${escapeHtml(story.category ? areaLabel(story.category) : "")}</span></span></label>`;
}

function previewStory(story) {
  return `<section class="preview-story"><p class="eyebrow">${formatShortDate(story.timestamp)} · ${escapeHtml(story.category ? areaLabel(story.category) : "")}</p><h3>${escapeHtml(story.title)}</h3><p>${escapeHtml(story.notes || t("pendingNarrative"))}</p></section>`;
}

function areaLabel(area) {
  return t(`area.${area}`);
}

function areaCounts(stories) {
  return areas.map((area) => ({ area, count: stories.filter((item) => item.category === area).length }));
}

function monthlyCounts(stories) {
  const now = new Date();
  return Array.from({ length: 12 }, (_, offset) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 11 + offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return {
      key,
      label: new Intl.DateTimeFormat(state.language, { month: "short" }).format(date).slice(0, 3),
      count: stories.filter((item) => String(item.timestamp || "").startsWith(key)).length,
    };
  });
}

function bar(label, value, max) {
  return `<div class="bar-row"><span class="bar-label">${escapeHtml(label)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round((value / max) * 100)}%"></div></div><span class="bar-value">${value}</span></div>`;
}

function timelineBar(item, months) {
  const max = Math.max(1, ...months.map((entry) => entry.count));
  return `<div class="timeline-column"><div class="timeline-bar" style="height:${Math.max(4, Math.round((item.count / max) * 90))}px" title="${item.count}"></div><span class="timeline-label">${escapeHtml(item.label)}</span></div>`;
}

function metric(value, label) {
  return `<div class="metric"><span>${escapeHtml(String(label))}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function operationRow(label, value) {
  return `<div class="operation-list"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function uploadStatus() {
  return `<section class="inbox-panel" style="min-height:0;margin-bottom:20px"><strong>${escapeHtml(state.upload.name)}</strong><p class="evidence-detail">${escapeHtml(state.upload.status)}</p><div class="upload-progress"><span style="width:${state.upload.progress}%"></span></div>${state.upload.error && state.upload.queueId && navigator.onLine ? `<button class="button secondary small" data-action="retry-upload">${icon("refresh")}${escapeHtml(t("retry"))}</button>` : ""}</section>`;
}

function offlineQueueStatus() {
  // Si no se pudo leer la cola, hay que decirlo: ocultar el banner equivale a
  // afirmar que no queda nada pendiente.
  if (state.offlineQueueError) {
    return `<section class="queue-status" role="status"><div>${icon("warning")}<span><strong>${escapeHtml(t("offlineQueue"))}</strong><small>${escapeHtml(state.offlineQueueError)}</small></span></div><button class="button secondary small" data-action="retry-queue">${icon("refresh")}${escapeHtml(t("retry"))}</button></section>`;
  }
  if (!state.offlineQueue.total) return "";
  const detail = navigator.onLine ? t("queuedRetry") : t("queuedOffline");
  return `<section class="queue-status" role="status"><div>${icon("cloud")}<span><strong>${state.offlineQueue.total} ${escapeHtml(t("offlineQueue"))}</strong><small>${escapeHtml(detail)}</small></span></div>${navigator.onLine ? `<button class="button secondary small" data-action="retry-queue">${icon("refresh")}${escapeHtml(t("retry"))}</button>` : ""}</section>`;
}

function assetFallback(asset) {
  const kind = assetKind(asset);
  return icon(kind === "audio" ? "mic" : kind === "video" ? "play" : kind === "image" ? "image" : "file");
}

// El encadenado `||` se quedaba con el PRIMER campo con valor (p. ej.
// payloadType "evidence") y nunca llegaba a `type`, que es donde viaja el MIME
// real (`row.mime_type`). Resultado: toda foto se clasificaba como "document" y
// nunca se le pintaba miniatura. Se miran TODOS los campos, mas la extension.
function assetKind(asset = {}) {
  const value = [
    asset.payloadType,
    asset.evidenceType,
    asset.kind,
    asset.type,
    asset.mimeType,
    asset.mime_type,
    asset.contentType,
  ].filter(Boolean).join(" ").toLowerCase();
  if (value.includes("image") || value.includes("photo") || value.includes("foto")) return "image";
  if (value.includes("audio") || value.includes("voice")) return "audio";
  if (value.includes("video")) return "video";
  const name = String(asset.filename || asset.name || asset.path || asset.storagePath || "").toLowerCase();
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "avif"].includes(extension)) return "image";
  if (["mp4", "mov", "m4v", "webm", "avi", "mkv"].includes(extension)) return "video";
  if (["mp3", "m4a", "wav", "aac", "ogg", "opus", "caf"].includes(extension)) return "audio";
  return "document";
}

function recordedEnergy(stories) {
  return stories.map((item) => Number(item.energy)).filter((value) => Number.isFinite(value) && value > 0);
}

function averageEnergy(stories) {
  const values = recordedEnergy(stories);
  return values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1) : t("noData");
}

function totalMinutes(stories) {
  return stories.reduce((sum, item) => sum + Number(item.duration || 0), 0);
}

function hasHumanNarrative(story) {
  const text = String(story.notes || "").trim();
  const eventText = (story.events || []).some((event) => String(event.narrativeText || "").trim().length >= 8);
  return text.length >= 8 && !/^(narrativa pendiente|sin resumen|revisi[oó]n multimodal)/i.test(text) || eventText;
}

function routeFromHash() {
  const value = window.location.hash.replace(/^#\/?/, "");
  return ["stories", "evidence", "agenda", "intelligence", "map", "publish", "account"].includes(value) ? value : "home";
}

function normalizeLanguage(value) {
  const code = String(value || "").slice(0, 2).toLowerCase();
  return ["es", "en", "fr", "pt"].includes(code) ? code : "es";
}

function formatShortDate(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(state.language, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function formatLongDate(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(state.language, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
}

function timeLabel(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(state.language, { hour: "numeric", minute: "2-digit" }).format(date);
}

function localDateTimeValue(value) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function cleanDefault(value) {
  return /^(sin ubicaci[oó]n|sin personas)$/i.test(String(value || "")) ? "" : String(value || "");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function toast(message, error = false) {
  const node = document.createElement("div");
  node.className = `toast ${error ? "error" : ""}`;
  node.textContent = message;
  toastRegion.appendChild(node);
  setTimeout(() => node.remove(), 4200);
}
