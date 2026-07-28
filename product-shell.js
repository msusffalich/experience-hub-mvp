(function initializeVibeProductShell(global) {
  "use strict";

  function normalizeView(view) {
    return String(view || "").trim();
  }

  function getViewContract(view, root = document) {
    const normalizedView = normalizeView(view);
    if (!normalizedView) return null;
    const section = root.getElementById(`${normalizedView}View`);
    const primaryButton = root.querySelector(`.primary-nav-item[data-view="${normalizedView}"]`);
    const contextButton = root.querySelector(`.context-nav-item[data-view="${normalizedView}"]`);
    const navRoot = primaryButton?.dataset.navRoot || contextButton?.dataset.navParent || "";
    const rootButton = navRoot
      ? root.querySelector(`.primary-nav-item[data-nav-root="${navRoot}"]`)
      : null;
    if (!section || !navRoot || !rootButton) return null;
    return {
      view: normalizedView,
      section,
      root: navRoot,
      rootButton,
      contextButton,
    };
  }

  function rootFor(view, root = document) {
    return getViewContract(view, root)?.root || "dashboard";
  }

  function activate(view, root = document) {
    const contract = getViewContract(view, root);
    if (!contract) return null;
    root.querySelectorAll(".nav-item, .context-nav-item").forEach((item) => {
      item.classList.remove("active");
    });
    root.querySelectorAll(".view").forEach((item) => item.classList.remove("active-view"));
    contract.rootButton.classList.add("active");
    root.querySelectorAll(".primary-nav-item").forEach((item) => {
      if (item === contract.rootButton) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
    contract.section.classList.add("active-view");
    return contract;
  }

  function renderContext(view, labels = {}, root = document) {
    const navigation = root.getElementById("contextNavigation");
    if (!navigation) return;
    const navRoot = rootFor(view, root);
    const isRootView = view === navRoot;
    const label = root.getElementById("contextNavigationLabel");
    const rootButton = root.getElementById("contextNavigationRootButton");
    let visibleCount = 0;

    navigation.querySelectorAll(".context-nav-item").forEach((button) => {
      const visible = !isRootView
        && button.dataset.navParent === navRoot
        && button.dataset.view !== view;
      button.hidden = !visible;
      button.classList.remove("active");
      if (visible) visibleCount += 1;
    });

    if (label && labels.current) label.textContent = labels.current;
    if (rootButton) {
      rootButton.dataset.view = navRoot;
      if (labels.back) rootButton.textContent = labels.back;
    }
    navigation.hidden = isRootView || (!visibleCount && !rootButton);
  }

  global.VibeProductShell = Object.freeze({
    activate,
    getViewContract,
    renderContext,
    rootFor,
  });
})(window);
