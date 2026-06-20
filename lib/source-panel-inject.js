(function () {
  const { api } = window.NBLC;

  const DOM = {
    SOURCE_PANEL: ".source-panel",
    PANEL_HEADER_BUTTONS: ".panel-header > div:last-child",
  };

  const BUTTONS_ID = "nblc-header-buttons";
  const INJECTED_ATTR = "nblc-compactor-injected";
  const ACTION = {
    COMPACT: "compact",
    DECOMPACT: "decompact",
  };

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
  let documentClickBound = false;

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

  function getPanelHeaderButtonsHost() {
    const panel = document.querySelector(DOM.SOURCE_PANEL);
    if (!panel) return null;
    return panel.querySelector(DOM.PANEL_HEADER_BUTTONS);
  }

  function findMountedButtons() {
    const host = getPanelHeaderButtonsHost();
    if (!host) return null;

    const buttons = host.querySelector(`#${BUTTONS_ID}`);
    if (!buttons || !buttons.isConnected) return null;

    return buttons;
  }

  function removeOrphanButtons() {
    const mounted = findMountedButtons();
    document.querySelectorAll(`#${BUTTONS_ID}`).forEach((element) => {
      if (element !== mounted) {
        element.remove();
      }
    });
  }

  function dispatchCompact() {
    const detail = { sourceIds: api.getSelectedSourceIds() };

    if (typeof window.NBLC.openCompact === "function") {
      window.NBLC.openCompact(detail);
      return;
    }

    window.dispatchEvent(
      new CustomEvent("nblc-compact", { bubbles: true, detail })
    );
  }

  function dispatchDecompact() {
    const nblcSource = getSelectedNblcSource();
    const emptyReason = nblcSource ? null : getDecompactEmptyReason();
    const detail = {
      sourceId: nblcSource?.id || null,
      title: nblcSource?.title || "",
      emptyReason,
    };

    if (typeof window.NBLC.openDecompact === "function") {
      window.NBLC.openDecompact(detail);
      return;
    }

    window.dispatchEvent(
      new CustomEvent("nblc-decompact", { bubbles: true, detail })
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

  function createIconButton(iconText, ariaLabel, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "mdc-icon-button mat-mdc-icon-button mat-mdc-button-base mat-unthemed nblc-panel-btn";
    button.setAttribute("aria-label", ariaLabel);
    button.dataset.nblcAction = action;
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
    icon.setAttribute("aria-hidden", "true");
    icon.style.cssText = "font-size: 20px; width: 20px; height: 20px; line-height: 20px; pointer-events: none;";
    icon.textContent = iconText;
    button.appendChild(icon);

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

  function bindDocumentActions() {
    if (documentClickBound) return;
    documentClickBound = true;

    document.addEventListener(
      "click",
      (event) => {
        const button = event.target.closest(".nblc-panel-btn[data-nblc-action]");
        if (!button || !button.closest(`#${BUTTONS_ID}`)) return;

        event.stopPropagation();

        const action = button.dataset.nblcAction;
        if (action === ACTION.COMPACT) {
          dispatchCompact();
        } else if (action === ACTION.DECOMPACT) {
          dispatchDecompact();
        }
      },
      true
    );
  }

  function createHeaderButtons() {
    const container = document.createElement("div");
    container.id = BUTTONS_ID;
    container.style.cssText =
      "display: inline-flex; flex-direction: row; align-items: center; gap: 0; flex-shrink: 0;";

    container.appendChild(
      createIconButton("inventory_2", t("compactSelected"), ACTION.COMPACT)
    );
    container.appendChild(
      createIconButton("unarchive", t("decompactSelected"), ACTION.DECOMPACT)
    );

    return container;
  }

  function injectHeaderButtons() {
    removeOrphanButtons();

    if (findMountedButtons()) {
      return true;
    }

    const headerButtons = getPanelHeaderButtonsHost();
    if (!headerButtons) return false;

    headerButtons.insertBefore(createHeaderButtons(), headerButtons.firstChild);
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

      if (!findMountedButtons()) {
        document.body.removeAttribute(INJECTED_ATTR);
      }

      injectHeaderButtons();
      window.NBLC.recoveryBanner?.refresh();
    });
  }

  function initSourcePanelObserver() {
    bindDocumentActions();

    const observer = new MutationObserver(() => {
      scheduleInject();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("change", (event) => {
      const checkbox = event.target.closest(
        '.select-checkbox input[type="checkbox"]'
      );
      if (checkbox && findMountedButtons()) {
        scheduleInject();
      }
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