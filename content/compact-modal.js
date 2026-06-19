(function () {
  const { api, format, store } = window.NBLC;

  const PHASE = {
    IDLE: "idle",
    FETCHING: "fetching",
    MERGING: "merging",
    UPLOADING: "uploading",
    DELETING: "deleting",
    SUCCESS: "success",
    ERROR: "error",
  };

  let overlay = null;
  let selectedIds = new Set();
  let allSources = [];
  let filterText = "";
  let downloadBackupZip = false;
  let phase = PHASE.IDLE;
  let progress = { current: 0, total: 0, status: "" };
  let result = null;
  let errorMessage = "";

  function sanitizeFilename(title) {
    return (
      title
        .replace(/[<>:"/\\|?*]/g, "_")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .substring(0, 100) || "untitled"
    );
  }

  function sendSourceApi(body) {
    return chrome.runtime.sendMessage({ type: "source-api", body });
  }

  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  function formatBytes(chars) {
    const bytes = new TextEncoder().encode(chars).length;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  async function downloadNblcFile() {
    if (!result?.compactedContent) return;
    const filename = `${sanitizeFilename(result.compactedTitle)}.md`;
    const blob = new Blob([result.compactedContent], {
      type: "text/markdown;charset=utf-8",
    });
    triggerBlobDownload(blob, filename);
  }

  async function downloadBackupZipFile() {
    if (!result) return;

    const zip = new JSZip();
    const usedNames = new Set();

    for (const src of result.sources) {
      let baseName = sanitizeFilename(src.title);
      let name = baseName;
      let counter = 1;
      while (usedNames.has(name)) {
        name = `${baseName}_${counter}`;
        counter++;
      }
      usedNames.add(name);
      zip.file(`${name}.md`, `# ${src.title}\n\n${src.content}`);
    }

    zip.file(
      `${sanitizeFilename(result.compactedTitle)}.md`,
      result.compactedContent
    );

    const blob = await zip.generateAsync({ type: "blob" });
    const date = new Date().toISOString().split("T")[0];
    triggerBlobDownload(blob, `nblc-backup-${date}.zip`);
  }

  async function runCompact() {
    if (selectedIds.size === 0 || isBusy()) {
      return;
    }

    const notebookId = api.extractNotebookId();
    const atToken = api.extractATToken();
    const blVersion = api.extractBlVersion();

    if (!notebookId || !atToken) {
      phase = PHASE.ERROR;
      errorMessage = "Missing notebook ID or session token. Refresh the page and try again.";
      render();
      return;
    }

    phase = PHASE.FETCHING;
    errorMessage = "";
    result = null;
    render();

    const ids = Array.from(selectedIds);
    const fetched = [];

    try {
      for (let i = 0; i < ids.length; i++) {
        const sourceId = ids[i];
        const domSource = allSources.find((s) => s.id === sourceId);

        progress = {
          current: i + 1,
          total: ids.length,
          status: `Fetching: ${domSource?.title || sourceId}`,
        };
        render();

        const response = await sendSourceApi({
          action: "getContent",
          sourceId,
          notebookId,
          atToken,
          blVersion,
        });

        if (!response?.success) {
          throw new Error(
            response?.error || `Failed to fetch source: ${domSource?.title || sourceId}`
          );
        }

        const url =
          response.url || api.extractUrlFromContent(response.content) || null;
        const type =
          domSource?.type || response.sourceType || (url ? "web" : "unknown");

        fetched.push({
          id: sourceId,
          title: response.title || domSource?.title || sourceId,
          content: response.content || "",
          type:
            type === "unknown" && format.isYoutubeUrl(url) ? "youtube" : type,
          url,
        });
      }

      phase = PHASE.MERGING;
      progress = {
        current: ids.length,
        total: ids.length,
        status: "Merging into NBLC bundle...",
      };
      render();

      const compactedContent = format.compactSources(fetched, { notebookId });
      const validation = format.validateNblc(compactedContent);

      if (!validation.valid) {
        throw new Error(validation.errors.join("; "));
      }

      const compactedTitle = format.buildCompactedTitle(fetched.length);

      result = {
        sources: fetched,
        compactedContent,
        compactedTitle,
        charCount: compactedContent.length,
        warnings: validation.warnings,
        compactedSourceId: null,
      };

      await store.savePendingCompact(notebookId, {
        phase: "fetched",
        sources: fetched,
        compactedContent,
        compactedSourceId: null,
      });

      phase = PHASE.UPLOADING;
      progress = {
        current: fetched.length,
        total: fetched.length,
        status: `Uploading NBLC bundle: ${compactedTitle}`,
      };
      render();

      const uploadResponse = await sendSourceApi({
        action: "addText",
        notebookId,
        atToken,
        blVersion,
        title: compactedTitle,
        content: compactedContent,
      });

      if (!uploadResponse?.success) {
        throw new Error(uploadResponse?.error || "Failed to upload NBLC bundle");
      }

      const compactedSourceId = uploadResponse.sourceId;
      result.compactedSourceId = compactedSourceId;

      await store.savePendingCompact(notebookId, {
        phase: "uploaded",
        sources: fetched,
        compactedContent,
        compactedSourceId,
      });

      progress = {
        current: fetched.length,
        total: fetched.length,
        status: "Waiting for NotebookLM to finish processing...",
      };
      render();

      const readyResponse = await sendSourceApi({
        action: "waitForSourceReady",
        notebookId,
        atToken,
        blVersion,
        sourceId: compactedSourceId,
      });

      if (!readyResponse?.success) {
        throw new Error(
          readyResponse?.error ||
            "Uploaded source did not become ready — originals were not deleted"
        );
      }

      phase = PHASE.DELETING;
      progress = {
        current: 0,
        total: ids.length,
        status: `Deleting ${ids.length} original sources...`,
      };
      render();

      await store.savePendingCompact(notebookId, {
        phase: "deleting",
        sources: fetched,
        compactedContent,
        compactedSourceId,
      });

      const deleteResponse = await sendSourceApi({
        action: "delete",
        notebookId,
        atToken,
        blVersion,
        sourceIds: ids,
      });

      if (!deleteResponse?.success) {
        throw new Error(
          `${deleteResponse?.error || "Failed to delete original sources"}. ` +
            "The NBLC bundle was uploaded but originals remain — check extension storage backup."
        );
      }

      await store.clearPending(notebookId);

      if (downloadBackupZip) {
        await downloadBackupZipFile();
      }

      phase = PHASE.SUCCESS;
      progress = {
        current: fetched.length,
        total: fetched.length,
        status: `Compacted ${fetched.length} sources into one NBLC source`,
      };
      render();
    } catch (error) {
      console.error("[CompactModal] Compact failed:", error);
      phase = PHASE.ERROR;
      errorMessage =
        error instanceof Error ? error.message : "Compact failed unexpectedly";
      progress = { current: 0, total: 0, status: "" };
      render();
    }
  }

  function getFilteredSources() {
    if (!filterText.trim()) return allSources;
    const q = filterText.toLowerCase();
    return allSources.filter((s) => s.title.toLowerCase().includes(q));
  }

  function toggleSource(id) {
    if (isBusy()) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
    render();
  }

  function toggleSelectAll(filtered) {
    if (isBusy()) return;
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      selectedIds = new Set();
    } else {
      selectedIds = new Set(filtered.map((s) => s.id));
    }
    render();
  }

  function isBusy() {
    return (
      phase === PHASE.FETCHING ||
      phase === PHASE.MERGING ||
      phase === PHASE.UPLOADING ||
      phase === PHASE.DELETING
    );
  }

  function renderIdleBody(filtered, allSelected) {
    return `
      <input
        type="text"
        class="nblc-filter-input"
        placeholder="Filter sources..."
        value="${escapeHtml(filterText)}"
        data-action="filter"
        ${isBusy() ? "disabled" : ""}
      />

      <label class="nblc-select-all">
        <input type="checkbox" ${allSelected ? "checked" : ""} data-action="toggle-all" ${isBusy() ? "disabled" : ""} />
        <span>Select All (${filtered.length})</span>
      </label>

      <div class="nblc-source-list">
        ${
          filtered.length === 0
            ? '<div class="nblc-empty">No sources found</div>'
            : filtered
                .map(
                  (source) => `
              <label class="nblc-source-item ${source.isNblc ? "nblc-nblc-source" : ""}">
                <input
                  type="checkbox"
                  ${selectedIds.has(source.id) ? "checked" : ""}
                  data-action="toggle-source"
                  data-id="${escapeHtml(source.id)}"
                  ${isBusy() ? "disabled" : ""}
                />
                <span>${escapeHtml(source.title)}${source.isNblc ? " <em>(NBLC)</em>" : ""}</span>
              </label>
            `
                )
                .join("")
        }
      </div>

      <label class="nblc-option-row">
        <input
          type="checkbox"
          ${downloadBackupZip ? "checked" : ""}
          data-action="toggle-backup-zip"
          ${isBusy() ? "disabled" : ""}
        />
        <span>Also download backup zip on success</span>
      </label>

      ${progress.status ? `<div class="nblc-progress">${escapeHtml(progress.status)}</div>` : ""}

      <button
        class="nblc-primary-btn"
        data-action="compact"
        ${isBusy() || selectedIds.size === 0 ? "disabled" : ""}
      >
        ${
          isBusy()
            ? `<span class="nblc-spinner"></span> Compacting...`
            : `Compact Selected (${selectedIds.size})`
        }
      </button>
    `;
  }

  function renderSuccessBody() {
    const warnings =
      result?.warnings?.length > 0
        ? `<div class="nblc-warnings">${result.warnings.map(escapeHtml).join("<br>")}</div>`
        : "";

    return `
      <div class="nblc-success-panel">
        <div class="nblc-success-icon">✓</div>
        <p class="nblc-success-title">${result.sources.length} sources compacted</p>
        <p class="nblc-success-detail">
          NBLC bundle: ${formatBytes(result.compactedContent)} ·
          Title: <code>${escapeHtml(result.compactedTitle)}</code>
        </p>
        <p class="nblc-success-note">
          Uploaded to your notebook. Original sources were deleted.
        </p>
        ${warnings}
      </div>

      <div class="nblc-action-row">
        <button class="nblc-secondary-btn" data-action="download-nblc">Download NBLC (.md)</button>
        <button class="nblc-secondary-btn" data-action="download-zip">Download backup zip</button>
      </div>

      <button class="nblc-primary-btn" data-action="close">Done</button>
    `;
  }

  function renderErrorBody() {
    return `
      <div class="nblc-error-panel">
        <p class="nblc-error-title">Compact failed</p>
        <p class="nblc-error-detail">${escapeHtml(errorMessage)}</p>
        <p class="nblc-error-note">Any fetched data is kept in extension storage for retry.</p>
      </div>
      <button class="nblc-primary-btn" data-action="retry">Try Again</button>
    `;
  }

  function render() {
    if (!overlay) return;

    const filtered = getFilteredSources();
    const allSelected =
      filtered.length > 0 && filtered.every((s) => selectedIds.has(s.id));

    let body = "";
    if (phase === PHASE.SUCCESS) {
      body = renderSuccessBody();
    } else if (phase === PHASE.ERROR) {
      body = renderErrorBody();
    } else {
      body = renderIdleBody(filtered, allSelected);
    }

    overlay.innerHTML = `
      <div class="nblc-overlay" data-action="close-overlay">
        <div class="nblc-modal" role="dialog" aria-label="Compact Sources">
          <div class="nblc-modal-header">
            <div class="nblc-modal-title-row">
              <span class="nblc-modal-icon">📦</span>
              <h3>Compact Sources</h3>
            </div>
            <button class="nblc-close-btn" data-action="close" aria-label="Close" ${isBusy() ? "disabled" : ""}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="nblc-modal-body">${body}</div>
        </div>
      </div>
    `;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function handleClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;

    const action = target.dataset.action;

    if (action === "close-overlay" && event.target.classList.contains("nblc-overlay")) {
      if (!isBusy()) close();
      return;
    }

    event.stopPropagation();

    switch (action) {
      case "close":
        if (!isBusy()) close();
        break;
      case "toggle-source":
        toggleSource(target.dataset.id);
        break;
      case "toggle-all":
        toggleSelectAll(getFilteredSources());
        break;
      case "toggle-backup-zip":
        downloadBackupZip = target.checked;
        break;
      case "compact":
        runCompact();
        break;
      case "download-nblc":
        downloadNblcFile();
        break;
      case "download-zip":
        downloadBackupZipFile();
        break;
      case "retry":
        phase = PHASE.IDLE;
        errorMessage = "";
        progress = { current: 0, total: 0, status: "" };
        render();
        break;
    }
  }

  function handleInput(event) {
    const target = event.target.closest("[data-action]");
    if (!target || target.dataset.action !== "filter") return;
    filterText = target.value;
    render();
    const input = overlay.querySelector('[data-action="filter"]');
    if (input) {
      input.focus();
      input.setSelectionRange(filterText.length, filterText.length);
    }
  }

  function open(initialIds = null) {
    allSources = api.extractSourcesFromDOM();
    filterText = "";
    downloadBackupZip = false;
    phase = PHASE.IDLE;
    progress = { current: 0, total: 0, status: "" };
    result = null;
    errorMessage = "";

    if (initialIds && initialIds.length > 0) {
      selectedIds = new Set(initialIds);
    } else {
      selectedIds = new Set(api.getSelectedSourceIds());
    }

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "nblc-compact-modal-root";
      overlay.addEventListener("click", handleClick);
      overlay.addEventListener("input", handleInput);
      document.body.appendChild(overlay);
    }

    render();
    overlay.style.display = "block";
  }

  function close() {
    if (isBusy()) return;
    if (overlay) overlay.style.display = "none";
  }

  window.NBLC.compactModal = { open, close };
})();