(function () {
  const { api } = window.NBLC;

  const DOM = {
    SOURCE_PANEL: ".source-panel",
    PANEL_HEADER_BUTTONS: ".panel-header > div:last-child",
  };

  const INJECTED_ATTR = "nblc-compactor-injected";

  const i18n = {
    en: {
      compactSelected: "Compact selected sources",
      selectSourcesToCompact: "Please select sources to compact",
    },
    zh: {
      compactSelected: "压缩选中的来源",
      selectSourcesToCompact: "请选择要压缩的来源",
    },
  };

  let tooltipEl = null;
  let injectScheduled = false;

  function getLanguage() {
    const lang = (document.documentElement.lang || navigator.language || "en").toLowerCase();
    return lang.startsWith("zh") ? "zh" : "en";
  }

  function t(key) {
    return i18n[getLanguage()][key];
  }

  function showTooltip(button, text) {
    if (!tooltipEl) {
      tooltipEl = document.createElement("div");
      tooltipEl.className = "nblc-tooltip";
      document.body.appendChild(tooltipEl);
    }

    const rect = button.getBoundingClientRect();
    tooltipEl.textContent = text;
    tooltipEl.style.display = "block";

    requestAnimationFrame(() => {
      const tipRect = tooltipEl.getBoundingClientRect();
      tooltipEl.style.top = `${rect.bottom + 6}px`;
      tooltipEl.style.left = `${rect.left + (rect.width - tipRect.width) / 2}px`;
      tooltipEl.style.opacity = "1";
    });
  }

  function hideTooltip() {
    if (!tooltipEl) return;
    tooltipEl.style.opacity = "0";
    setTimeout(() => {
      if (tooltipEl) tooltipEl.style.display = "none";
    }, 100);
  }

  function createIconButton(iconText, ariaLabel, onClick) {
    const button = document.createElement("button");
    button.className =
      "mdc-icon-button mat-mdc-icon-button mat-mdc-button-base mat-unthemed";
    button.setAttribute("aria-label", ariaLabel);
    button.style.cssText = [
      "width: 40px",
      "height: 40px",
      "min-width: 40px",
      "padding: 8px",
      "border: none",
      "background: transparent",
      "cursor: pointer",
      "border-radius: 50%",
      "display: inline-flex",
      "align-items: center",
      "justify-content: center",
      "flex-shrink: 0",
      "box-sizing: border-box",
    ].join(";");

    const icon = document.createElement("mat-icon");
    icon.className =
      "mat-icon notranslate material-symbols-outlined google-symbols mat-icon-no-color";
    icon.setAttribute("role", "img");
    icon.style.cssText = "font-size: 20px; width: 20px; height: 20px; line-height: 20px;";
    icon.textContent = iconText;
    button.appendChild(icon);

    button.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      onClick();
    });

    button.addEventListener("mouseenter", () => {
      button.style.backgroundColor = "rgba(0, 0, 0, 0.04)";
      showTooltip(button, ariaLabel);
    });

    button.addEventListener("mouseleave", () => {
      button.style.backgroundColor = "transparent";
      hideTooltip();
    });

    return button;
  }

  function onCompactClick() {
    const selected = api.getSelectedSourceIds();
    if (selected.length === 0) {
      alert(t("selectSourcesToCompact"));
      return;
    }

    window.dispatchEvent(
      new CustomEvent("nblc-compact", {
        detail: { sourceIds: selected },
      })
    );
  }

  function createHeaderButtons() {
    const container = document.createElement("div");
    container.id = "nblc-header-buttons";
    container.style.cssText =
      "display: inline-flex; flex-direction: row; align-items: center; gap: 0; flex-shrink: 0;";

    container.appendChild(
      createIconButton("inventory_2", t("compactSelected"), onCompactClick)
    );

    return container;
  }

  function injectHeaderButtons() {
    if (document.getElementById("nblc-header-buttons")) {
      return true;
    }

    const panel = document.querySelector(DOM.SOURCE_PANEL);
    if (!panel) return false;

    const headerButtons = panel.querySelector(DOM.PANEL_HEADER_BUTTONS);
    if (!headerButtons) return false;

    if (headerButtons.querySelector("#nblc-header-buttons")) {
      return true;
    }

    const buttons = createHeaderButtons();
    headerButtons.insertBefore(buttons, headerButtons.firstChild);

    document.body.setAttribute(INJECTED_ATTR, "true");
    return true;
  }

  function removeInjectionMarker() {
    document.body.removeAttribute(INJECTED_ATTR);
  }

  function scheduleInject() {
    if (injectScheduled) return;
    injectScheduled = true;

    requestAnimationFrame(() => {
      injectScheduled = false;

      if (document.getElementById("nblc-header-buttons")) {
        return;
      }

      document.body.removeAttribute(INJECTED_ATTR);
      injectHeaderButtons();
    });
  }

  function initSourcePanelObserver() {
    const observer = new MutationObserver(() => {
      scheduleInject();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    scheduleInject();

    return observer;
  }

  window.NBLC.inject = {
    initSourcePanelObserver,
    removeInjectionMarker,
    injectHeaderButtons,
  };
})();