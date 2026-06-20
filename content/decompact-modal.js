(function () {
  const { api, format, store, modalA11y, runtimeMessaging } = window.NBLC;
  const { isCheckboxActionElement, setModalVisible } = modalA11y;

  const PHASE = {
    EMPTY: "empty",
    FETCHING: "fetching",
    PREVIEW: "preview",
    UPLOADING: "uploading",
    DELETING: "deleting",
    SUCCESS: "success",
    ERROR: "error",
  };

  const EMPTY_REASON_MESSAGES = {
    "no-selection": "Select exactly one NBLC bundle in the source panel.",
    multiple: "Multiple sources are selected. Select only one NBLC bundle.",
    "not-nblc":
      "The selected source is not an NBLC bundle. Select a source titled like <code>📦 NBLC · …</code>.",
  };

  let overlay = null;
  let a11y = null;
  let phase = PHASE.FETCHING;
  let compactedSourceId = null;
  let compactedTitle = "";
  let parsed = null;
  let progress = { current: 0, total: 0, status: "" };
  let uploadedSourceIds = [];
  let errorMessage = "";
  let ackDeleteCompacted = false;
  let ackDataLossRisk = false;
  let emptyStateReason = "no-selection";

  function sendSourceApi(body) {
    return runtimeMessaging.sendSourceApi(body);
  }

  function notifyRecoveryRefresh() {
    window.dispatchEvent(new CustomEvent("nblc-recovery-refresh"));
  }

  function isBusy() {
    return (
      phase === PHASE.FETCHING ||
      phase === PHASE.UPLOADING ||
      phase === PHASE.DELETING
    );
  }

  function formatBytes(chars) {
    const bytes = new TextEncoder().encode(chars).length;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  async function fetchAndParse(notebookId, atToken, sourceId) {
    phase = PHASE.FETCHING;
    progress = { current: 0, total: 1, status: "Fetching NBLC bundle..." };
    errorMessage = "";
    render();

    const response = await sendSourceApi({
      action: "getContent",
      sourceId,
      notebookId,
      atToken,
      blVersion: api.extractBlVersion(),
    });

    if (!response?.success) {
      throw new Error(response?.error || "Failed to fetch NBLC source");
    }

    compactedTitle = response.title || compactedTitle;

    const validation = format.validateNblc(response.content || "");
    if (!validation.valid) {
      throw new Error(validation.errors.join("; "));
    }

    parsed = {
      bundle: validation.bundle,
      sources: validation.sources,
      warnings: validation.warnings,
      contentSize: (response.content || "").length,
    };

    phase = PHASE.PREVIEW;
    progress = { current: 0, total: parsed.sources.length, status: "" };
    render();
  }

  async function runDecompact() {
    if (!parsed || isBusy()) return;

    const notebookId = api.extractNotebookId();
    const atToken = api.extractATToken();
    const blVersion = api.extractBlVersion();

    if (!notebookId || !atToken) {
      phase = PHASE.ERROR;
      errorMessage =
        "Missing notebook ID or session token. Refresh the page and try again.";
      render();
      return;
    }

    const sources = parsed.sources;
    const startIndex = uploadedSourceIds.length;

    phase = PHASE.UPLOADING;
    errorMessage = "";
    render();

    try {
      await store.savePendingDecompact(notebookId, {
        phase: "uploading",
        compactedSourceId,
        uploadedSourceIds,
        sectionCount: sources.length,
      });

      for (let i = startIndex; i < sources.length; i++) {
        const src = format.enrichSourceForDecompact(sources[i]);
        const uploadPlan = format.resolveDecompactUpload(src);
        const methodLabel = format.describeDecompactMethod(src);

        progress = {
          current: i + 1,
          total: sources.length,
          status: `Uploading [${src.index}]: ${src.title} (${methodLabel})`,
        };
        render();

        const uploadBody = {
          notebookId,
          atToken,
          blVersion,
        };

        if (uploadPlan.action === "addYoutube" || uploadPlan.action === "addUrl") {
          uploadBody.action = uploadPlan.action;
          uploadBody.url = uploadPlan.url;
        } else {
          uploadBody.action = "addText";
          uploadBody.title = uploadPlan.title;
          uploadBody.content = uploadPlan.content;
        }

        const uploadResponse = await sendSourceApi(uploadBody);

        if (!uploadResponse?.success) {
          throw new Error(
            uploadResponse?.error ||
              `Failed to upload source [${src.index}]: ${src.title}`
          );
        }

        const newSourceId = uploadResponse.sourceId;
        uploadedSourceIds.push(newSourceId);

        progress = {
          current: i + 1,
          total: sources.length,
          status: `Processing [${src.index}]: ${src.title}`,
        };
        render();

        const readyResponse = await sendSourceApi({
          action: "waitForSourceReady",
          notebookId,
          atToken,
          blVersion,
          sourceId: newSourceId,
        });

        if (!readyResponse?.success) {
          throw new Error(
            readyResponse?.error ||
              `Source [${src.index}] did not become ready: ${src.title}`
          );
        }

        await store.savePendingDecompact(notebookId, {
          phase: "uploading",
          compactedSourceId,
          uploadedSourceIds,
          sectionCount: sources.length,
        });
      }

      phase = PHASE.DELETING;
      progress = {
        current: sources.length,
        total: sources.length,
        status: "Deleting compacted NBLC source...",
      };
      render();

      await store.savePendingDecompact(notebookId, {
        phase: "deleting",
        compactedSourceId,
        uploadedSourceIds,
        sectionCount: sources.length,
      });

      const deleteResponse = await sendSourceApi({
        action: "delete",
        notebookId,
        atToken,
        blVersion,
        sourceIds: [compactedSourceId],
      });

      if (!deleteResponse?.success) {
        throw new Error(
          `${deleteResponse?.error || "Failed to delete compacted source"}. ` +
            `${sources.length} sources were restored but the NBLC bundle remains.`
        );
      }

      await store.clearPending(notebookId);

      phase = PHASE.SUCCESS;
      progress = {
        current: sources.length,
        total: sources.length,
        status: `Restored ${sources.length} sources`,
      };
      render();
      notifyRecoveryRefresh();
    } catch (error) {
      console.error("[DecompactModal] Decompact failed:", error);
      phase = PHASE.ERROR;
      errorMessage =
        error instanceof Error ? error.message : "Decompact failed unexpectedly";
      render();
      notifyRecoveryRefresh();
    }
  }

  function canProceedWithDecompact() {
    return ackDeleteCompacted && ackDataLossRisk;
  }

  function renderPreviewBody() {
    const titleWarning =
      !format.isNblcTitle(compactedTitle)
        ? `<div class="nblc-warnings">Source title does not match the NBLC pattern — confirm this is a compactor bundle before proceeding.</div>`
        : "";

    const warnings =
      parsed?.warnings?.length > 0
        ? `<div class="nblc-warnings">${parsed.warnings.map(escapeHtml).join("<br>")}</div>`
        : "";

    const resumeNote =
      uploadedSourceIds.length > 0
        ? `<div class="nblc-warnings">${uploadedSourceIds.length} of ${parsed.sources.length} sources already uploaded — retry will resume from the next source.</div>`
        : "";

    const sourceList = parsed.sources
      .map((src) => {
        const plan = format.resolveDecompactUpload(src);
        const urlHint =
          plan.action !== "addText" && plan.url
            ? ` · <code>${escapeHtml(plan.url)}</code>`
            : plan.action === "addText" && src.type === "youtube"
              ? ' · <span class="nblc-warn-inline">no URL found — will paste transcript</span>'
              : "";
        return `
        <div class="nblc-source-item nblc-preview-item">
          <span class="nblc-preview-index">[${src.index}]</span>
          <span>${escapeHtml(src.title)} <em>(${escapeHtml(src.type)} → ${escapeHtml(format.describeDecompactMethod(src))})</em>${urlHint}</span>
        </div>
      `;
      })
      .join("");

    return `
      <div class="nblc-preview-summary">
        <p><strong>${parsed.sources.length}</strong> sources in bundle</p>
        <p class="nblc-preview-meta">
          Created: ${escapeHtml(parsed.bundle.created || "unknown")} ·
          Size: ${formatBytes(parsed.contentSize)}
        </p>
        <p class="nblc-preview-meta">
          Compacted source: <code>${escapeHtml(compactedTitle)}</code>
        </p>
      </div>

      ${titleWarning}
      ${warnings}
      ${resumeNote}

      <div class="nblc-source-list nblc-preview-list">
        ${sourceList}
      </div>

      <p class="nblc-preview-note">
        YouTube and web sources with stored URLs are re-added as live links; other types use pasted text.
        The compacted NBLC source will be deleted after all uploads succeed.
      </p>

      <label class="nblc-option-row nblc-consent-check">
        <input
          type="checkbox"
          data-action="toggle-ack-delete-compacted"
          ${ackDeleteCompacted ? "checked" : ""}
        />
        <span>I understand the compacted NBLC source will be permanently deleted after restore succeeds.</span>
      </label>

      <label class="nblc-option-row nblc-consent-check">
        <input
          type="checkbox"
          data-action="toggle-ack-risk"
          ${ackDataLossRisk ? "checked" : ""}
        />
        <span>I accept the risk of irreversible changes if this operation fails partway through.</span>
      </label>

      <button
        type="button"
        class="nblc-primary-btn"
        data-action="decompact"
        ${canProceedWithDecompact() ? "" : "disabled"}
      >
        Decompact ${parsed.sources.length} Sources
      </button>
    `;
  }

  function renderProgressBody() {
    const pct =
      progress.total > 0
        ? Math.round((progress.current / progress.total) * 100)
        : 0;

    return `
      <div class="nblc-progress-panel">
        <div class="nblc-spinner nblc-spinner-dark"></div>
        <p class="nblc-progress-status">${escapeHtml(progress.status)}</p>
        ${
          progress.total > 0
            ? `<p class="nblc-progress-count">${progress.current} / ${progress.total} (${pct}%)</p>`
            : ""
        }
      </div>
    `;
  }

  function renderSuccessBody() {
    return `
      <div class="nblc-success-panel">
        <div class="nblc-success-icon">✓</div>
        <p class="nblc-success-title">${parsed.sources.length} sources restored</p>
        <p class="nblc-success-detail">
          Uploaded from NBLC bundle: <code>${escapeHtml(compactedTitle)}</code>
        </p>
        <p class="nblc-success-note">
          The compacted source was deleted. Original titles and content are back in your notebook.
        </p>
      </div>
      <button type="button" class="nblc-primary-btn" data-action="close">Done</button>
    `;
  }

  function renderErrorBody() {
    const partialNote =
      uploadedSourceIds.length > 0
        ? `<p class="nblc-error-note">${uploadedSourceIds.length} source(s) were already uploaded. Retry will skip completed uploads.</p>`
        : "";

    return `
      <div class="nblc-error-panel">
        <p class="nblc-error-title">Decompact failed</p>
        <p class="nblc-error-detail">${escapeHtml(errorMessage)}</p>
        ${partialNote}
        <p class="nblc-error-note">If upload had started, click Try Again to resume from the next source (bundle is re-read from NotebookLM).</p>
      </div>
      <button type="button" class="nblc-primary-btn" data-action="retry">Try Again</button>
    `;
  }

  function renderNblcBundleList() {
    const bundles = api.extractSourcesFromDOM().filter((s) => s.isNblc);

    if (bundles.length === 0) {
      return `<p class="nblc-empty-detail">No NBLC bundles in this notebook yet. Use Compact to create one.</p>`;
    }

    const list = bundles
      .map(
        (source) => `
        <div class="nblc-source-item nblc-preview-item nblc-nblc-source">
          <span class="nblc-preview-index">📦</span>
          <span>${escapeHtml(source.title)}</span>
        </div>
      `
      )
      .join("");

    return `
      <p class="nblc-preview-note">NBLC bundles in this notebook:</p>
      <div class="nblc-source-list nblc-preview-list">${list}</div>
    `;
  }

  function renderEmptyBody() {
    const message =
      EMPTY_REASON_MESSAGES[emptyStateReason] ||
      EMPTY_REASON_MESSAGES["no-selection"];

    return `
      <div class="nblc-empty-panel">
        <p class="nblc-empty-title">Can't decompact yet</p>
        <p class="nblc-empty-detail">${message}</p>
      </div>

      <p class="nblc-preview-note">
        NBLC bundles are titled like:
        <code>📦 NBLC · 12 sources · 2026-06-19</code>
      </p>

      ${renderNblcBundleList()}

      <button type="button" class="nblc-primary-btn" data-action="close">Close</button>
    `;
  }

  function render() {
    if (!overlay) return;

    let body = "";
    if (phase === PHASE.EMPTY) {
      body = renderEmptyBody();
    } else if (phase === PHASE.SUCCESS) {
      body = renderSuccessBody();
    } else if (phase === PHASE.ERROR) {
      body = renderErrorBody();
    } else if (phase === PHASE.PREVIEW) {
      body = renderPreviewBody();
    } else {
      body = renderProgressBody();
    }

    const bodyEl = overlay.querySelector(".nblc-modal-body");
    const closeBtn = overlay.querySelector(".nblc-close-btn");
    if (!bodyEl) return;

    bodyEl.innerHTML = body;

    if (closeBtn) {
      closeBtn.disabled = isBusy();
    }

    a11y?.afterRender();
  }

  function ensureOverlay() {
    if (overlay) return;

    overlay = document.createElement("div");
    overlay.id = "nblc-decompact-modal-root";
    overlay.hidden = true;
    overlay.dataset.nblcOpen = "false";
    overlay.innerHTML = `
      <div class="nblc-overlay">
        <div class="nblc-modal" role="dialog" aria-label="Decompact Sources">
          <div class="nblc-modal-header">
            <div class="nblc-modal-title-row">
              <span class="nblc-modal-icon">📂</span>
              <h3>Decompact Sources</h3>
            </div>
            <button type="button" class="nblc-close-btn" data-action="close" aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="nblc-modal-body"></div>
        </div>
      </div>
    `;
    overlay.addEventListener("click", handleClick, true);
    overlay.addEventListener("change", handleChange);
    document.body.appendChild(overlay);
    setModalVisible(overlay, false);

    a11y = modalA11y.attachModalA11y(overlay, () => ({
      isBusy,
      onClose: close,
    }));
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function handleChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") return;

    const action = target.dataset.action;
    if (!action) return;

    switch (action) {
      case "toggle-ack-delete-compacted":
        ackDeleteCompacted = target.checked;
        render();
        break;
      case "toggle-ack-risk":
        ackDataLossRisk = target.checked;
        render();
        break;
    }
  }

  function handleClick(event) {
    event.stopPropagation();

    const target = event.target.closest("[data-action]");
    if (!target) return;

    const action = target.dataset.action;
    if (target.disabled) return;

    if (isCheckboxActionElement(target)) return;

    event.preventDefault();

    switch (action) {
      case "close":
        if (!isBusy()) close();
        break;
      case "decompact":
        if (!canProceedWithDecompact()) break;
        runDecompact();
        break;
      case "retry":
        if (parsed) {
          errorMessage = "";
          if (uploadedSourceIds.length > 0) {
            runDecompact();
          } else {
            phase = PHASE.PREVIEW;
            render();
          }
        }
        break;
    }
  }

  function hide() {
    setModalVisible(overlay, false);
    a11y?.onClose({ restoreFocus: false });
    notifyRecoveryRefresh();
  }

  async function open(sourceIdOrOptions, title = "") {
    window.NBLC.consentModal?.hide?.();
    let sourceId = null;
    let emptyReason = null;

    if (typeof sourceIdOrOptions === "object" && sourceIdOrOptions !== null) {
      sourceId = sourceIdOrOptions.sourceId ?? null;
      title = sourceIdOrOptions.title || "";
      emptyReason = sourceIdOrOptions.emptyReason ?? null;
    } else {
      sourceId = sourceIdOrOptions || null;
    }

    compactedSourceId = sourceId;
    compactedTitle = title;
    parsed = null;
    uploadedSourceIds = [];
    progress = { current: 0, total: 0, status: "" };
    errorMessage = "";
    ackDeleteCompacted = false;
    ackDataLossRisk = false;
    emptyStateReason = emptyReason || "no-selection";

    ensureOverlay();
    setModalVisible(overlay, true);
    a11y.onOpen();
    notifyRecoveryRefresh();

    if (!sourceId || emptyReason) {
      phase = PHASE.EMPTY;
      render();
      return;
    }

    phase = PHASE.FETCHING;
    render();

    const notebookId = api.extractNotebookId();
    const atToken = api.extractATToken();

    if (!notebookId || !atToken) {
      phase = PHASE.ERROR;
      errorMessage =
        "Missing notebook ID or session token. Refresh the page and try again.";
      render();
      return;
    }

    try {
      const pending = await store.getPendingDecompact(notebookId);
      const canResume =
        pending?.compactedSourceId === sourceId &&
        pending.phase !== "done" &&
        (pending.uploadedSourceIds?.length > 0 ||
          pending.phase === "uploading" ||
          pending.phase === "deleting");

      if (canResume) {
        uploadedSourceIds = pending.uploadedSourceIds || [];
        await fetchAndParse(notebookId, atToken, sourceId);
        phase = PHASE.PREVIEW;
        progress = {
          current: uploadedSourceIds.length,
          total: parsed.sources.length,
          status: "",
        };
        render();
        return;
      }

      await fetchAndParse(notebookId, atToken, sourceId);
    } catch (error) {
      console.error("[DecompactModal] Fetch/parse failed:", error);
      phase = PHASE.ERROR;
      errorMessage =
        error instanceof Error ? error.message : "Failed to read NBLC bundle";
      render();
    }
  }

  function close() {
    if (isBusy()) return;
    setModalVisible(overlay, false);
    a11y?.onClose({ restoreFocus: false });
    notifyRecoveryRefresh();
  }

  window.NBLC.decompactModal = { open, close, hide };
})();