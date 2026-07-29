import { downloadBlob, getSession, loadWorkspace, request, setSession, signIn } from "./api.js";
import { uploadEvidence } from "./direct-upload.js";
import { icon } from "./icons.js";
import { supportedLanguages, translator } from "./i18n.js";
import { createZip } from "./zip.js";

const app = document.getElementById("app");
const toastRegion = document.getElementById("toastRegion");
const areas = ["Trabajo", "Paseo", "Aprendizaje", "Social", "Entretenimiento", "Creatividad", "Espiritualidad", "Salud", "Compras"];
const state = {
  session: getSession(),
  route: routeFromHash(),
  language: localStorage.getItem("vibe-next-language") || "es",
  theme: localStorage.getItem("vibe-next-theme") || "light",
  loading: false,
  data: { health: null, profile: {}, experiences: [], assets: [], captures: [], agenda: [], capture: null },
  filters: { search: "", area: "", from: "", to: "" },
  selectedPublicationStories: new Set(),
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
  await refreshData();
}

async function refreshData() {
  state.loading = true;
  render();
  try {
    state.data = await loadWorkspace();
    state.language = normalizeLanguage(state.data.profile?.language || state.language);
    t = translator(state.language);
    document.documentElement.lang = state.language;
    localStorage.setItem("vibe-next-language", state.language);
  } catch (error) {
    if (error.status !== 401) toast(error.message, true);
  } finally {
    state.loading = false;
    render();
    hydrateAssetPreviews();
  }
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
          <div class="field"><label for="loginPassword">${escapeHtml(t("password"))}</label><input id="loginPassword" name="password" type="password" autocomplete="current-password" required /></div>
          <button class="button full" type="submit">${icon("arrow")}${escapeHtml(t("signIn"))}</button>
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
}

function shell(content) {
  const nav = [
    ["home", "home"], ["stories", "story"], ["evidence", "image"],
    ["intelligence", "insight"], ["publish", "publish"], ["account", "user"],
  ];
  const routeTitle = t(state.route);
  const serviceOk = state.data.health?.status === "ok";
  return `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand"><img src="/icons/vibe-icon-192.png" alt="" /><strong>Vibe</strong></div>
        <nav class="side-nav" aria-label="Principal">
          ${nav.map(([route, symbol]) => navButton(route, symbol)).join("")}
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
        <div class="content">${content}</div>
      </main>
      <nav class="mobile-nav" aria-label="Principal">${nav.map(([route, symbol]) => navButton(route, symbol, true)).join("")}</nav>
    </div>`;
}

function navButton(route, symbol, mobile = false) {
  return `<button class="${mobile ? "" : "nav-link "}${state.route === route ? "active" : ""}" data-route="${route}">${icon(symbol)}<span>${escapeHtml(t(route))}</span></button>`;
}

function viewForRoute() {
  if (state.route === "stories") return storiesView();
  if (state.route === "evidence") return evidenceView();
  if (state.route === "intelligence") return intelligenceView();
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
      <label class="button">${icon("upload")}${escapeHtml(t("uploadEvidence"))}<input id="evidenceFileInput" type="file" hidden /></label>
    </section>
    ${state.upload ? uploadStatus() : ""}
    ${filterToolbar(false)}
    ${assets.length ? `<div class="evidence-grid">${assets.map(evidenceTile).join("")}</div>` : `<div class="empty">${escapeHtml(t("noEvidence"))}</div>`}`;
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
    <section class="action-grid">
      <div class="action-cell"><h3>${escapeHtml(t("report"))}</h3><p>${escapeHtml(t("reportHelp"))}</p><button class="button secondary" data-action="generate-report">${icon("download")}${escapeHtml(t("generate"))}</button></div>
      <div class="action-cell"><h3>${escapeHtml(t("findings"))}</h3><p>${escapeHtml(t("findingsHelp"))}</p><button class="button secondary" data-action="generate-findings">${icon("download")}${escapeHtml(t("generate"))}</button></div>
      <div class="action-cell"><h3>${escapeHtml(t("knowledgeMap"))}</h3><p>${escapeHtml(t("knowledgeMapHelp"))}</p><a class="button secondary" href="/index.html?view=experience-map">${icon("map")}${escapeHtml(t("openMap"))}</a></div>
    </section>`;
}

function publishView() {
  const stories = filteredStories();
  const selected = stories.filter((item) => state.selectedPublicationStories.has(item.id));
  return `
    <section class="page-heading">
      <div><p class="eyebrow">${escapeHtml(t("publish"))}</p><h2>${escapeHtml(t("publicationTitle"))}</h2><p>${escapeHtml(t("publicationHelp"))}</p></div>
    </section>
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

function accountView() {
  const profile = state.data.profile || {};
  const capture = state.data.capture || {};
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
      <div class="settings-row">
        <div><h3>${escapeHtml(t("about"))}</h3><p>${escapeHtml(t("parallelHelp"))}</p></div>
        <div><span class="tag">VibePWA 2</span> <a class="button secondary small" href="./manual.html">Manual</a> <a class="button secondary small" href="/index.html?view=dashboard">${escapeHtml(t("legacy"))}</a></div>
      </div>
      <details class="operation">
        <summary>${escapeHtml(t("operations"))}</summary>
        <div class="operation-body">
          ${operationRow("API", state.data.health?.status === "ok" ? t("serviceAvailable") : t("serviceIssue"))}
          ${operationRow(t("persistence"), state.data.health?.persistence || "—")}
          ${operationRow(t("captures"), capture.enabled === false ? t("unavailable") : t("available"))}
          ${operationRow("Contrato", capture.contract?.version || capture.contractVersion || "—")}
          ${operationRow(t("binaryFiles"), capture.contract?.directUpload?.binaryTransport || "direct_to_supabase_storage")}
        </div>
      </details>
      <div style="margin-top:24px"><button class="button danger" data-action="sign-out">${icon("logout")}${escapeHtml(t("signOut"))}</button></div>
    </div>`;
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
  document.querySelectorAll("[data-story-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const story = state.data.experiences.find((item) => item.id === button.dataset.storyId);
      if (story) openStoryModal(story);
    });
  });
  document.querySelectorAll("[data-filter]").forEach((input) => {
    input.addEventListener("input", () => {
      state.filters[input.dataset.filter] = input.value;
      render();
      hydrateAssetPreviews();
    });
  });
  document.getElementById("evidenceFileInput")?.addEventListener("change", handleEvidenceFile);
  document.querySelector("[data-action='retry-upload']")?.addEventListener("click", retryEvidenceUpload);
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
      state.data.profile = await request("/api/profile", {
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

function openStoryModal(story = null) {
  const linkedAssets = story ? assetsForStory(story) : [];
  state.modal = {
    type: "story",
    story,
    linkedAtOpen: new Set(linkedAssets.map((item) => item.id).filter(Boolean)),
    selected: new Set(linkedAssets.map((item) => item.id).filter(Boolean)),
  };
  renderModal();
}

function renderModal() {
  document.getElementById("activeModal")?.remove();
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
              </div>
            </section>
          </div>
          <aside>
            <div class="section-heading"><div><h3>3. ${escapeHtml(t("chooseEvidence"))}</h3><p>${pending.length} ${escapeHtml(t("pending"))}</p></div></div>
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
  wrapper.querySelector("[data-delete-story]")?.addEventListener("click", deleteCurrentStory);
  hydrateAssetPreviews(wrapper);
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
    mood: existing.mood || "",
    energy: existing.energy ?? null,
    attachments: existing.attachments || [],
    metadata: { ...(existing.metadata || {}), narrativeOrigin: form.get("notes") ? "human_text" : "pending" },
  };
  const submit = event.currentTarget.querySelector("[type='submit']");
  submit.disabled = true;
  try {
    const saved = await request(existing.id ? `/api/experiences/${encodeURIComponent(existing.id)}` : "/api/experiences", {
      method: existing.id ? "PUT" : "POST",
      body: payload,
    });
    const selected = new Set(state.modal.selected);
    const linkedAtOpen = state.modal.linkedAtOpen || new Set();
    const added = Array.from(selected).filter((id) => !linkedAtOpen.has(id));
    const removed = Array.from(linkedAtOpen).filter((id) => !selected.has(id));
    if (added.length) {
      await request("/api/assets/adopt", {
        method: "POST",
        body: { experienceId: saved.id, assetIds: added, method: "story_editor" },
      });
    }
    if (removed.length) {
      await request("/api/assets/reassign", {
        method: "POST",
        body: { assetIds: removed, release: true },
      });
    }
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
    await request(`/api/experiences/${encodeURIComponent(story.id)}`, { method: "DELETE" });
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
  const file = event.target.files?.[0];
  if (!file) return;
  const captureId = crypto.randomUUID();
  state.upload = {
    file,
    captureId,
    idempotencyKey: `web-${captureId}`,
    name: file.name,
    progress: 2,
    status: t("uploading"),
  };
  await runEvidenceUpload();
}

async function retryEvidenceUpload() {
  if (!state.upload?.file) return;
  state.upload.error = false;
  state.upload.progress = 2;
  state.upload.status = t("uploading");
  await runEvidenceUpload();
}

async function runEvidenceUpload() {
  const current = state.upload;
  if (!current?.file) return;
  render();
  try {
    await uploadEvidence(current.file, {
      captureId: current.captureId,
      idempotencyKey: current.idempotencyKey,
      onProgress(progress) {
        state.upload.progress = progress;
        const bar = document.querySelector(".upload-progress span");
        if (bar) bar.style.width = `${progress}%`;
      },
    });
    state.upload = { name: current.name, progress: 100, status: t("ready") };
    toast(t("evidenceSaved"));
    await refreshData();
  } catch (error) {
    state.upload = { name: file.name, progress: 100, status: `${t("failed")}: ${error.message}`, error: true };
    render();
    toast(error.message, true);
  }
}

async function downloadAsset(assetId) {
  try {
    const asset = allAssets().find((item) => item.id === assetId);
    let result;
    try {
      result = await request(`/api/assets/${encodeURIComponent(assetId)}/download`);
    } catch (error) {
      if (!asset?.captureId || error.status !== 404) throw error;
      result = await request(`/api/captures/${encodeURIComponent(asset.captureId)}/download`);
    }
    window.open(result.url || result.signedUrl, "_blank", "noopener");
  } catch (error) {
    toast(error.message, true);
  }
}

async function generatePdf(type) {
  const stories = filteredStories();
  const payload = analyticalPayload(stories);
  const endpoint = type === "report" ? "/api/report/pdf" : "/api/insights/pdf";
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
  const stories = state.data.experiences.filter((item) => state.selectedPublicationStories.has(item.id));
  if (!stories.length) {
    toast(t("selectAtLeastOne"), true);
    return;
  }
  const title = document.getElementById("publicationTitle")?.value || t("publicationDefault");
  const enrichedStories = await enrichPublicationStories(stories);
  const html = publicationHtml(title, enrichedStories);
  try {
    const blob = await request("/api/publication/pdf", {
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
    if (videos.length) {
      const entries = [{ name: "publicacion-vibe.pdf", blob }];
      for (const video of videos) {
        const response = await fetch(video.resolvedUrl);
        if (response.ok) entries.push({ name: video.name || video.filename || "video.mp4", blob: await response.blob() });
      }
      downloadBlob(await createZip(entries), "publicacion-vibe-pdf-videos.zip");
    } else {
      downloadBlob(blob, "publicacion-vibe.pdf");
    }
    toast(t("generated"));
  } catch (error) {
    toast(error.message, true);
  }
}

async function enrichPublicationStories(stories) {
  return Promise.all(stories.map(async (story) => ({
    ...story,
    attachments: await Promise.all((story.attachments || []).map(async (attachment) => {
      const existing = attachment.url || attachment.signedUrl || attachment.previewUrl || "";
      if (existing) return { ...attachment, resolvedUrl: existing };
      const id = attachment.id || attachment.assetId;
      if (!id) return attachment;
      try {
        const result = await request(`/api/assets/${encodeURIComponent(id)}/download`);
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
    const asset = allAssets().find((item) => item.id === node.dataset.assetPreview);
    if (!asset || node.dataset.loaded === "1") return;
    let url = asset.previewUrl || asset.signedUrl || asset.url || asset.dataUrl || "";
    if (!url && asset.id) {
      try {
        let result;
        try {
          result = await request(`/api/assets/${encodeURIComponent(asset.id)}/download`);
        } catch (error) {
          if (!asset.captureId || error.status !== 404) throw error;
          result = await request(`/api/captures/${encodeURIComponent(asset.captureId)}/download`);
        }
        url = result.url || result.signedUrl || "";
      } catch {
        return;
      }
    }
    if (!url) return;
    const kind = assetKind(asset);
    if (kind === "image") node.innerHTML = `<img src="${escapeAttr(url)}" alt="" loading="lazy" />`;
    else if (kind === "video") node.innerHTML = `<video src="${escapeAttr(url)}" preload="metadata" muted></video>`;
    node.dataset.loaded = "1";
  }));
}

function filterToolbar(includeArea) {
  return `<div class="toolbar">
    <div class="search-box">${icon("search")}<input class="filter-control" data-filter="search" value="${escapeAttr(state.filters.search)}" placeholder="${escapeAttr(t("search"))}" /></div>
    ${includeArea ? `<div class="compact-field"><label>${escapeHtml(t("activity"))}</label><select class="filter-control" data-filter="area"><option value="">${escapeHtml(t("all"))}</option>${areas.map((area) => `<option value="${escapeAttr(area)}" ${state.filters.area === area ? "selected" : ""}>${escapeHtml(areaLabel(area))}</option>`).join("")}</select></div>` : ""}
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
      && inDateRange(item.timestamp);
  });
}

function filteredAssets() {
  const search = state.filters.search.trim().toLowerCase();
  return allAssets().filter((item) => {
    const haystack = [item.name, item.filename, item.type, item.payloadType, item.sourceType].join(" ").toLowerCase();
    return (!search || haystack.includes(search)) && inDateRange(item.capturedAt || item.uploadedAt);
  });
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
    findings: buildFindings(stories),
    biometricContext: { status: "available_when_captured" },
  };
}

function buildFindings(stories) {
  const counts = areaCounts(stories).filter((item) => item.count).sort((a, b) => b.count - a.count);
  if (!stories.length) return [];
  return [
    { title: t("mostPresentArea"), detail: `${counts[0]?.area ? areaLabel(counts[0].area) : t("noArea")}: ${counts[0]?.count || 0} ${t("storiesInPeriod")}.`, confidence: 85 },
    { title: t("narrativeQualityFinding"), detail: `${stories.filter(hasHumanNarrative).length}/${stories.length} ${t("storyCountText")}.`, confidence: 100 },
  ];
}

function publicationHtml(title, stories) {
  return `<!doctype html><html lang="${state.language}"><head><meta charset="utf-8"><style>
  @page{size:Letter;margin:18mm}body{font-family:Arial,sans-serif;color:#17201b;margin:0}header{padding:40px 0 28px;border-bottom:4px solid #176b5b}h1{font-size:38px;margin:0 0 8px}header p{color:#607069}article{padding:26px 0;border-bottom:1px solid #d6dfda;break-inside:avoid}h2{font-size:24px;margin:0 0 8px}.meta{color:#607069;font-size:12px}.narrative{font-size:15px;line-height:1.6;white-space:pre-wrap}.evidence{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:14px}.evidence span{padding:10px;background:#edf2ef;font-size:11px;overflow-wrap:anywhere}</style></head><body>
  <header><h1>${escapeHtml(title)}</h1><p>${formatLongDate(new Date())} · ${stories.length} ${escapeHtml(t("experiences"))}</p></header>
  ${stories.slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).map((story) => `<article><p class="meta">${formatLongDate(story.timestamp)} · ${escapeHtml(story.category ? areaLabel(story.category) : "")}</p><h2>${escapeHtml(story.title)}</h2><div class="narrative">${escapeHtml(story.notes || t("pendingNarrative"))}</div>${story.attachments?.length ? `<div class="evidence">${story.attachments.map((item) => assetKind(item) === "image" && item.resolvedUrl ? `<img src="${escapeAttr(item.resolvedUrl)}" alt="" style="width:100%;max-height:260px;object-fit:cover"/>` : `<span>${escapeHtml(item.name || item.filename || t("evidenceItem"))}${assetKind(item) === "video" ? ` · ${escapeHtml(t("videoInPackage"))}` : ""}</span>`).join("")}</div>` : ""}</article>`).join("")}
  </body></html>`;
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
  return `<section class="inbox-panel" style="min-height:0;margin-bottom:20px"><strong>${escapeHtml(state.upload.name)}</strong><p class="evidence-detail">${escapeHtml(state.upload.status)}</p><div class="upload-progress"><span style="width:${state.upload.progress}%"></span></div>${state.upload.error && state.upload.file ? `<button class="button secondary small" data-action="retry-upload">${icon("refresh")}${escapeHtml(t("retry"))}</button>` : ""}</section>`;
}

function assetFallback(asset) {
  const kind = assetKind(asset);
  return icon(kind === "audio" ? "mic" : kind === "video" ? "play" : kind === "image" ? "image" : "file");
}

function assetKind(asset) {
  const value = String(asset.payloadType || asset.evidenceType || asset.kind || asset.type || "").toLowerCase();
  if (value.includes("image")) return "image";
  if (value.includes("audio")) return "audio";
  if (value.includes("video")) return "video";
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
  return ["stories", "evidence", "intelligence", "publish", "account"].includes(value) ? value : "home";
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
