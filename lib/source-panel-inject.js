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
      decompactSelected: "Decompact NBLC bundle",
    },
    zh: {
      compactSelected: "压缩选中的来源",
      decompactSelected: "解压 NBLC 压缩包",
    },
  };

  let tooltipEl = null;
  let injectScheduled = false;
  let decompactButton = null;

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
    window.dispatchEvent(
      new CustomEvent("nblc-compact", {
        detail: { sourceIds: api.getSelectedSourceIds() },
      })
    );
  }

  function getSelectedNblcSource() {
    const selectedIds = new Set(api.getSelectedSourceIds());
    if (selectedIds.size !== 1) return null;

    const sources = api.extractSourcesFromDOM();
    const match = sources.find((s) => selectedIds.has(s.id) && s.isNblc);
    return match || null;
  }

  function getDecompactEmptyReason() {
    const selectedIds = api.getSelectedSourceIds();
    if (selectedIds.length === 0) return "no-selection";
    if (selectedIds.length > 1) return "multiple";

    const sources = api.extractSourcesFromDOM();
    const selected = sources.find((s) => s.id === selectedIds[0]);
    if (!selected?.isNblc) return "not-nblc";

    return null;
  }

  function onDecompactClick() {
    const nblcSource = getSelectedNblcSource();
    const emptyReason = nblcSource ? null : getDecompactEmptyReason();

    window.dispatchEvent(
      new CustomEvent("nblc-decompact", {
        detail: {
          sourceId: nblcSource?.id || null,
          title: nblcSource?.title || "",
          emptyReason,
        },
      })
    );
  }

  function updateDecompactButtonState() {
    if (!decompactButton) return;

    decompactButton.disabled = false;
    decompactButton.style.opacity = "1";
    decompactButton.style.cursor = "pointer";
  }

  function createHeaderButtons() {
    const container = document.createElement("div");
    container.id = "nblc-header-buttons";
    container.style.cssText =
      "display: inline-flex; flex-direction: row; align-items: center; gap: 0; flex-shrink: 0;";

    container.appendChild(
      createIconButton("inventory_2", t("compactSelected"), onCompactClick)
    );

    decompactButton = createIconButton(
      "unarchive",
      t("decompactSelected"),
      onDecompactClick
    );
    container.appendChild(decompactButton);
    updateDecompactButtonState();

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
        updateDecompactButtonState();
        window.NBLC.recoveryBanner?.refresh();
        return;
      }

      document.body.removeAttribute(INJECTED_ATTR);
      injectHeaderButtons();
      window.NBLC.recoveryBanner?.refresh();
    });
  }

  function initSourcePanelObserver() {
    const observer = new MutationObserver(() => {
      scheduleInject();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("change", (event) => {
      const checkbox = event.target.closest(
        '.select-checkbox input[type="checkbox"]'
      );
      if (checkbox) updateDecompactButtonState();
    });

    scheduleInject();

    return observer;
  }

  window.NBLC.inject = {
    initSourcePanelObserver,
    removeInjectionMarker,
    injectHeaderButtons,
  };
})();