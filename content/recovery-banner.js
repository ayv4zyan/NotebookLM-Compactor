(function () {
  const { api, store } = window.NBLC;

  const DOM = {
    SOURCE_PANEL: ".source-panel",
  };

  let bannerRoot = null;
  let dismissTarget = null;
  let recoveryState = { compact: null, decompact: null };

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getCompactMessage(pending) {
    const count = pending.sourceIds?.length || 0;
    switch (pending.phase) {
      case "fetched":
        return `Compact interrupted — <strong>${count}</strong> source${count === 1 ? "" : "s"} backed up locally. Retry will upload without re-fetching.`;
      case "uploaded":
        return `NBLC bundle uploaded — <strong>${count}</strong> original${count === 1 ? "" : "s"} still in the notebook. Retry will delete them.`;
      case "deleting":
        return `Compact failed while deleting originals — <strong>${count}</strong> source${count === 1 ? "" : "s"} remain alongside the NBLC bundle.`;
      default:
        return `Compact did not finish — <strong>${count}</strong> source${count === 1 ? "" : "s"} backed up locally.`;
    }
  }

  function getDecompactMessage(pending) {
    const done = pending.uploadedSourceIds?.length || 0;
    const total = pending.sectionCount || done;
    if (done > 0 && total > done) {
      return `Decompact interrupted — <strong>${done}</strong> of <strong>${total}</strong> sources restored. Resume will continue from the next source.`;
    }
    return `Decompact did not finish — resume will read the NBLC bundle from your notebook and continue.`;
  }

  function renderDismissConfirm(target) {
    if (dismissTarget !== target) return "";

    return `
      <div class="nblc-recovery-dismiss-confirm">
        <span>Discard this local backup?</span>
        <button type="button" class="nblc-recovery-btn nblc-recovery-btn-danger" data-action="dismiss-confirm" data-target="${target}">
          Discard
        </button>
        <button type="button" class="nblc-recovery-btn" data-action="dismiss-cancel">Cancel</button>
      </div>
    `;
  }

  function renderItem(type, pending) {
    const isCompact = type === "compact";
    const message = isCompact
      ? getCompactMessage(pending)
      : getDecompactMessage(pending);
    const retryAction = isCompact ? "retry-compact" : "retry-decompact";
    const dismissAction = isCompact ? "dismiss-compact" : "dismiss-decompact";
    const dismissConfirm = renderDismissConfirm(type);

    return `
      <div class="nblc-recovery-item nblc-recovery-${type}">
        <p class="nblc-recovery-text">${message}</p>
        ${
          dismissConfirm ||
          `<div class="nblc-recovery-actions">
            <button type="button" class="nblc-recovery-btn nblc-recovery-btn-primary" data-action="${retryAction}">
              ${isCompact ? "Retry compact" : "Resume decompact"}
            </button>
            <button type="button" class="nblc-recovery-btn" data-action="${dismissAction}">
              Discard backup
            </button>
          </div>`
        }
      </div>
    `;
  }

  function ensureBannerRoot() {
    const panel = document.querySelector(DOM.SOURCE_PANEL);
    if (!panel) {
      bannerRoot = null;
      return null;
    }

    if (!bannerRoot || !document.body.contains(bannerRoot)) {
      bannerRoot = document.getElementById("nblc-recovery-banner");
    }

    if (!bannerRoot) {
      bannerRoot = document.createElement("div");
      bannerRoot.id = "nblc-recovery-banner";
      bannerRoot.className = "nblc-recovery-banner-root";

      const header = panel.querySelector(".panel-header");
      if (header?.parentNode) {
        header.parentNode.insertBefore(bannerRoot, header.nextSibling);
      } else {
        panel.prepend(bannerRoot);
      }

      bannerRoot.addEventListener("click", handleClick);
    }

    return bannerRoot;
  }

  function render() {
    const root = ensureBannerRoot();
    if (!root) return;

    const items = [];

    if (recoveryState.compact) {
      items.push(renderItem("compact", recoveryState.compact));
    }

    if (recoveryState.decompact) {
      items.push(renderItem("decompact", recoveryState.decompact));
    }

    if (items.length === 0) {
      root.style.display = "none";
      root.innerHTML = "";
      return;
    }

    root.style.display = "block";
    root.innerHTML = items.join("");
  }

  async function refresh() {
    const notebookId = api.extractNotebookId();
    if (!notebookId) {
      recoveryState = { compact: null, decompact: null };
      dismissTarget = null;
      render();
      return;
    }

    const [compact, decompact] = await Promise.all([
      store.getPendingCompact(notebookId),
      store.getPendingDecompact(notebookId),
    ]);

    recoveryState = {
      compact: store.isActivePending(compact) ? compact : null,
      decompact: store.isActivePending(decompact) ? decompact : null,
    };

    render();
  }

  function findSourceTitle(sourceId) {
    const sources = api.extractSourcesFromDOM();
    return sources.find((s) => s.id === sourceId)?.title || "";
  }

  async function handleRetryCompact() {
    if (!recoveryState.compact) return;

    const accepted = await window.NBLC.consentModal.ensureAccepted();
    if (!accepted) return;

    window.NBLC.compactModal.openResume(recoveryState.compact);
  }

  async function handleRetryDecompact() {
    if (!recoveryState.decompact?.compactedSourceId) return;

    const accepted = await window.NBLC.consentModal.ensureAccepted();
    if (!accepted) return;

    const title = findSourceTitle(recoveryState.decompact.compactedSourceId);

    window.NBLC.decompactModal.open({
      sourceId: recoveryState.decompact.compactedSourceId,
      title,
      emptyReason: null,
    });
  }

  async function handleDismissConfirm(target) {
    const notebookId = api.extractNotebookId();
    if (!notebookId) return;

    if (target === "compact") {
      await store.clearPendingCompact(notebookId);
    } else if (target === "decompact") {
      await store.clearPendingDecompact(notebookId);
    }

    dismissTarget = null;
    await refresh();
  }

  function handleClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target || !bannerRoot?.contains(target)) return;

    event.stopPropagation();

    switch (target.dataset.action) {
      case "retry-compact":
        handleRetryCompact();
        break;
      case "retry-decompact":
        handleRetryDecompact();
        break;
      case "dismiss-compact":
        dismissTarget = "compact";
        render();
        break;
      case "dismiss-decompact":
        dismissTarget = "decompact";
        render();
        break;
      case "dismiss-cancel":
        dismissTarget = null;
        render();
        break;
      case "dismiss-confirm":
        handleDismissConfirm(target.dataset.target);
        break;
    }
  }

  function initRecoveryBanner() {
    refresh();

    window.addEventListener("nblc-recovery-refresh", () => {
      refresh();
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;

      const notebookId = api.extractNotebookId();
      if (!notebookId) return;

      const compactKey = `pending-compact/${notebookId}`;
      const decompactKey = `pending-decompact/${notebookId}`;

      if (changes[compactKey] || changes[decompactKey]) {
        refresh();
      }
    });

    let lastPath = window.location.pathname;
    setInterval(() => {
      if (window.location.pathname !== lastPath) {
        lastPath = window.location.pathname;
        dismissTarget = null;
        refresh();
      }
    }, 500);
  }

  window.NBLC.recoveryBanner = {
    initRecoveryBanner,
    refresh,
  };
})();