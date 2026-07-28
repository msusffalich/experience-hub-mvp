(function initializeVibeAccountShell(global) {
  "use strict";

  const ACTION_TARGETS = Object.freeze({
    help: Object.freeze({ view: "manual", focus: "manualSearchInput" }),
    operation: Object.freeze({ view: "admin", focus: "productSettingsPanel" }),
    privacy: Object.freeze({ view: "admin", focus: "privacy-title" }),
    profile: Object.freeze({ view: "admin", focus: "profileForm" }),
    automation: Object.freeze({ view: "automation", focus: "skillList" }),
  });

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function resolveAction(action) {
    const normalized = String(action || "").trim();
    if (normalized === "signout") return { kind: "signout" };
    const target = ACTION_TARGETS[normalized];
    return target ? { kind: "navigate", ...target } : null;
  }

  function renderSignedIn(model = {}) {
    const labels = model.labels || {};
    const connectivity = model.connectivity || {};
    const tone = connectivity.tone === "ok"
      ? "is-ok"
      : connectivity.tone === "neutral"
        ? "is-neutral"
        : "is-warn";
    return `
      <div class="account-summary-intro">
        <div>
          <span class="report-kicker">${escapeHtml(labels.kicker)}</span>
          <h3>${escapeHtml(model.email)}</h3>
          <p>${escapeHtml(labels.description)}</p>
        </div>
        <span class="sync-status-chip ${tone}">${escapeHtml(connectivity.text)}</span>
      </div>
      <div class="account-summary-grid">
        <article>
          <span>${escapeHtml(labels.language)}</span>
          <strong>${escapeHtml(String(model.language || "es").toUpperCase())}</strong>
          <small>${escapeHtml(labels.languageHelp)}</small>
        </article>
        <article>
          <span>${escapeHtml(labels.privacy)}</span>
          <strong>${escapeHtml(labels.privacyValue)}</strong>
          <small>${escapeHtml(labels.privacyHelp)}</small>
        </article>
      </div>
      <div class="account-primary-actions">
        <button class="primary-button" type="button" data-account-action="profile">${escapeHtml(labels.profile)}</button>
        <button class="ghost-button" type="button" data-account-action="privacy">${escapeHtml(labels.backups)}</button>
        <button class="ghost-button" type="button" data-account-action="help">${escapeHtml(labels.help)}</button>
        <button class="ghost-button" type="button" data-account-action="automation">${escapeHtml(labels.automation)}</button>
        <button class="ghost-button" type="button" data-account-action="operation">${escapeHtml(labels.operation)}</button>
        <button class="ghost-button" type="button" data-account-action="signout">${escapeHtml(labels.signOut)}</button>
      </div>
    `;
  }

  function renderSignedOutIntro(labels = {}) {
    return `
      <strong>${escapeHtml(labels.title)}</strong>
      <p>${escapeHtml(labels.description)}</p>
    `;
  }

  global.VibeAccountShell = Object.freeze({
    renderSignedIn,
    renderSignedOutIntro,
    resolveAction,
  });
})(window);
