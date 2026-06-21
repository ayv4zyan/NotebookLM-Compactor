(function () {
  const { api, format, store, modalA11y, runtimeMessaging, domHtml, zipBlob } = window.NBLC;
  const { replaceHtml } = domHtml;
  const { isCheckboxActionElement, setModalVisible } = modalA11y;


  const LARGE_BUNDLE_BYTES = 5 * 1024 * 1024;
  const WARN_BUNDLE_BYTES = 1024 * 1024;

  const TYPE_LABELS = {
    youtube: "YouTube",
    pdf: "PDF",
    web: "Web",
    text: "Text",
    gdoc: "Google Doc",
    markdown: "Markdown",
    unknown: "Other",
  };

  const PHASE = {
    IDLE: "idle",
    PREVIEW: "preview",
    CONFIRM: "confirm",
    FETCHING: "fetching",
    MERGING: "merging",
    UPLOADING: "uploading",
    DELETING: "deleting",
    SUCCESS: "success",
    ERROR: "error",
  };

  let overlay = null;
  let a11y = null;
  let selectedIds = new Set();
  let allSources = [];
  let filterText = "";
  let downloadBackupZip = false;
  let ackPermanentDelete = false;
  let ackDataLossRisk = false;
  let phase = PHASE.IDLE;
  let progress = { current: 0, total: 0, status: "" };
  let result = null;
  let errorMessage = "";
  let strippedNblcOnOpen = [];
  let pendingResume = null;
  let accountSourceLimit = null;
  let accountLimitsLoadGen = 0;
  let previewLoadGen = 0;
  let previewState = {
    status: "idle",
    fetchKey: "",
    sources: [],
    estimatedTitle: "",
    estimatedSize: 0,
    typeBreakdown: "",
    warnings: [],
    errorMessage: "",
    loadProgress: { current: 0, total: 0, status: "" },
  };

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
    return runtimeMessaging.sendSourceApi(body);
  }

  function notifyRecoveryRefresh() {
    window.dispatchEvent(new CustomEvent("nblc-recovery-refresh"));
  }

  function buildSourcesFromIds(ids) {
    return ids.map((id) => {
      const domSource = allSources.find((s) => s.id === id);
      return {
        id,
        title: domSource?.title || id,
        content: "",
        type: domSource?.type || "unknown",
      };
    });
  }

  async function waitReadyAndDelete(notebookId, atToken, blVersion, ids, compactedSourceId) {
    progress = {
      current: 0,
      total: 0,
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
      total: 0,
      status: `Deleting ${ids.length} original source${ids.length === 1 ? "" : "s"}...`,
    };
    render();

    await store.savePendingCompact(notebookId, {
      phase: "deleting",
      sourceIds: ids,
      compactedContent: result.compactedContent,
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

  const BACKUP_ZIP_FAIL_WARNING =
    "Backup zip download failed. Your compact succeeded — use Download backup zip below to retry.";

  function noteBackupZipFailure() {
    if (!result) return;
    result.warnings = result.warnings || [];
    if (!result.warnings.includes(BACKUP_ZIP_FAIL_WARNING)) {
      result.warnings.push(BACKUP_ZIP_FAIL_WARNING);
    }
    if (phase === PHASE.SUCCESS) {
      render();
    }
  }

  async function downloadBackupZipFile() {
    if (!result) return false;

    try {
      const files = {};
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
        files[`${name}.md`] = `# ${src.title}\n\n${src.content}`;
      }

      let compactName = sanitizeFilename(result.compactedTitle);
      const baseCompactName = compactName;
      let compactCounter = 1;
      while (usedNames.has(compactName)) {
        compactName = `${baseCompactName}_${compactCounter}`;
        compactCounter++;
      }
      usedNames.add(compactName);
      files[`${compactName}.md`] = result.compactedContent;

      const blob = await zipBlob.createZipBlob(files);
      const date = new Date().toISOString().split("T")[0];
      triggerBlobDownload(blob, `nblc-backup-${date}.zip`);
      return true;
    } catch (error) {
      console.error("[CompactModal] Backup zip download failed:", error);
      noteBackupZipFailure();
      return false;
    }
  }

  async function runCompact() {
    if (selectedIds.size === 0 || isBusy() || hasNblcInSelection()) {
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

    const ids = Array.from(selectedIds).filter((id) => {
      const source = allSources.find((s) => s.id === id);
      return !source?.isNblc;
    });
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
        current: 0,
        total: 0,
        status: "Merging sources into NBLC bundle...",
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
        sourceIds: ids,
        compactedContent,
        compactedSourceId: null,
      });

      phase = PHASE.UPLOADING;
      progress = {
        current: 0,
        total: 0,
        status: "Uploading NBLC bundle...",
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
        sourceIds: ids,
        compactedContent,
        compactedSourceId,
      });

      await waitReadyAndDelete(
        notebookId,
        atToken,
        blVersion,
        ids,
        compactedSourceId
      );

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
      notifyRecoveryRefresh();
    } catch (error) {
      console.error("[CompactModal] Compact failed:", error);
      phase = PHASE.ERROR;
      errorMessage =
        error instanceof Error ? error.message : "Compact failed unexpectedly";
      progress = { current: 0, total: 0, status: "" };
      render();
      notifyRecoveryRefresh();
    }
  }

  async function runCompactResume() {
    const pending = pendingResume;
    if (!pending || isBusy()) return;

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

    const ids = (pending.sourceIds || []).filter((id) => {
      const source = allSources.find((s) => s.id === id);
      return !source?.isNblc;
    });

    if (ids.length === 0) {
      phase = PHASE.ERROR;
      errorMessage = "No valid sources in the saved compact backup.";
      pendingResume = null;
      render();
      notifyRecoveryRefresh();
      return;
    }

    errorMessage = "";
    const compactedTitle = format.buildCompactedTitle(ids.length);

    try {
      if (pending.phase === "fetched") {
        if (!pending.compactedContent) {
          throw new Error("Saved backup is missing NBLC content.");
        }

        result = {
          sources: buildSourcesFromIds(ids),
          compactedContent: pending.compactedContent,
          compactedTitle,
          charCount: pending.compactedContent.length,
          warnings: [],
          compactedSourceId: null,
        };

        phase = PHASE.UPLOADING;
        progress = {
          current: 0,
          total: 0,
          status: "Uploading backed-up NBLC bundle...",
        };
        render();

        const uploadResponse = await sendSourceApi({
          action: "addText",
          notebookId,
          atToken,
          blVersion,
          title: compactedTitle,
          content: pending.compactedContent,
        });

        if (!uploadResponse?.success) {
          throw new Error(uploadResponse?.error || "Failed to upload NBLC bundle");
        }

        result.compactedSourceId = uploadResponse.sourceId;

        await store.savePendingCompact(notebookId, {
          phase: "uploaded",
          sourceIds: ids,
          compactedContent: pending.compactedContent,
          compactedSourceId: uploadResponse.sourceId,
        });

        await waitReadyAndDelete(
          notebookId,
          atToken,
          blVersion,
          ids,
          uploadResponse.sourceId
        );
      } else if (pending.phase === "uploaded" || pending.phase === "deleting") {
        if (!pending.compactedSourceId) {
          throw new Error("Saved backup is missing the uploaded NBLC source ID.");
        }

        result = {
          sources: buildSourcesFromIds(ids),
          compactedContent: pending.compactedContent || "",
          compactedTitle,
          charCount: (pending.compactedContent || "").length,
          warnings: [],
          compactedSourceId: pending.compactedSourceId,
        };

        if (pending.phase === "uploaded") {
          phase = PHASE.UPLOADING;
          render();
          await waitReadyAndDelete(
            notebookId,
            atToken,
            blVersion,
            ids,
            pending.compactedSourceId
          );
        } else {
          phase = PHASE.DELETING;
          progress = {
            current: 0,
            total: 0,
            status: `Deleting ${ids.length} original source${ids.length === 1 ? "" : "s"}...`,
          };
          render();

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
        }
      } else {
        throw new Error(`Unsupported resume phase: ${pending.phase}`);
      }

      await store.clearPending(notebookId);
      pendingResume = null;

      if (downloadBackupZip) {
        await downloadBackupZipFile();
      }

      phase = PHASE.SUCCESS;
      progress = {
        current: ids.length,
        total: ids.length,
        status: `Compacted ${ids.length} sources into one NBLC source`,
      };
      render();
      notifyRecoveryRefresh();
    } catch (error) {
      console.error("[CompactModal] Compact resume failed:", error);
      phase = PHASE.ERROR;
      errorMessage =
        error instanceof Error ? error.message : "Compact resume failed unexpectedly";
      progress = { current: 0, total: 0, status: "" };
      render();
      notifyRecoveryRefresh();
    }
  }

  function getFilteredSources() {
    if (!filterText.trim()) return allSources;
    const q = filterText.toLowerCase();
    return allSources.filter((s) => s.title.toLowerCase().includes(q));
  }

  function getSelectedNblcSources() {
    return getSelectedSources().filter((s) => s.isNblc);
  }

  function hasNblcInSelection() {
    return getSelectedNblcSources().length > 0;
  }

  function getCompactableSources(sources = allSources) {
    return sources.filter((s) => !s.isNblc);
  }

  function stripNblcFromSelection() {
    const nblcSources = getSelectedNblcSources();
    if (nblcSources.length === 0) return 0;

    for (const source of nblcSources) {
      selectedIds.delete(source.id);
    }

    previewState.fetchKey = "";
    return nblcSources.length;
  }

  function sanitizeSelectionOnOpen() {
    const stripped = [];

    for (const id of Array.from(selectedIds)) {
      const source = allSources.find((s) => s.id === id);
      if (source?.isNblc) {
        selectedIds.delete(id);
        stripped.push(source.title);
      }
    }

    return stripped;
  }

  function toggleSource(id) {
    if (isBusy()) return;

    const source = allSources.find((s) => s.id === id);
    if (source?.isNblc) return;

    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
    render();
  }

  function toggleSelectAll(filtered) {
    if (isBusy()) return;

    const compactable = getCompactableSources(filtered);
    const allCompactableSelected =
      compactable.length > 0 &&
      compactable.every((s) => selectedIds.has(s.id));

    if (allCompactableSelected) {
      selectedIds = new Set();
    } else {
      selectedIds = new Set(compactable.map((s) => s.id));
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

  function canProceedWithCompact() {
    return ackPermanentDelete && ackDataLossRisk;
  }

  function getQuotaMath() {
    const current = allSources.length;
    const selected = selectedIds.size;
    const after = selected > 0 ? current - selected + 1 : current;
    const freed = selected > 1 ? selected - 1 : 0;
    const limit = accountSourceLimit;
    const headroomAfter =
      typeof limit === "number" ? limit - after : null;
    return { current, selected, after, freed, limit, headroomAfter };
  }

  function renderQuotaLimitSuffix(limit) {
    if (typeof limit !== "number") return "";
    return `<span class="nblc-quota-limit">/ ${limit}</span>`;
  }

  function renderQuotaBar(fillCount, limit) {
    if (typeof limit !== "number" || limit <= 0) return "";
    const pct = Math.min(100, Math.round((fillCount / limit) * 100));
    return `
      <div class="nblc-quota-bar" aria-hidden="true">
        <div class="nblc-quota-bar-fill" style="width: ${pct}%"></div>
      </div>
    `;
  }

  async function loadAccountLimits() {
    const atToken = api.extractATToken();
    const blVersion = api.extractBlVersion();
    if (!atToken) return;

    const gen = ++accountLimitsLoadGen;

    try {
      const response = await sendSourceApi({
        action: "getUserSettings",
        atToken,
        blVersion,
      });

      if (gen !== accountLimitsLoadGen || !overlay || overlay.hidden) return;

      if (response?.success && typeof response.sourceLimit === "number") {
        accountSourceLimit = response.sourceLimit;
        render();
      }
    } catch (error) {
      console.warn("[CompactModal] Could not load account source limit:", error);
    }
  }

  function renderQuotaPanel() {
    const { current, selected, after, freed, limit, headroomAfter } =
      getQuotaMath();
    const limitSuffix = renderQuotaLimitSuffix(limit);

    if (selected === 0) {
      return `
        <div class="nblc-quota-panel">
          <p class="nblc-quota-label">Notebook sources</p>
          <p class="nblc-quota-value">
            ${current}
            ${limitSuffix}
          </p>
          ${renderQuotaBar(current, limit)}
          <p class="nblc-quota-hint">Select 2 or more sources to reduce your source count.</p>
        </div>
      `;
    }

    const savedLine =
      freed > 0
        ? `<p class="nblc-quota-saved"><strong>+${freed}</strong> slot${freed === 1 ? "" : "s"} freed</p>`
        : `<p class="nblc-quota-hint">Select 2+ sources to reduce your source count.</p>`;

    const headroomLine =
      freed > 0 &&
      typeof headroomAfter === "number" &&
      headroomAfter >= 0 &&
      typeof limit === "number"
        ? `<p class="nblc-quota-meta">${headroomAfter} slot${headroomAfter === 1 ? "" : "s"} remaining before ${limit}-source limit</p>`
        : "";

    return `
      <div class="nblc-quota-panel ${freed > 0 ? "nblc-quota-panel-positive" : ""}">
        <p class="nblc-quota-label">Source count after compact</p>
        <p class="nblc-quota-value">
          <span class="nblc-quota-before">${current}</span>
          <span class="nblc-quota-arrow">→</span>
          <span class="nblc-quota-after">${after}</span>
          ${limitSuffix}
        </p>
        ${renderQuotaBar(after, limit)}
        ${savedLine}
        ${headroomLine}
      </div>
    `;
  }

  function getProgressPhaseLabel() {
    switch (phase) {
      case PHASE.FETCHING:
        return "Step 1 of 4 · Fetching sources";
      case PHASE.MERGING:
        return "Step 2 of 4 · Building bundle";
      case PHASE.UPLOADING:
        return "Step 3 of 4 · Uploading bundle";
      case PHASE.DELETING:
        return "Step 4 of 4 · Deleting originals";
      default:
        return "";
    }
  }

  function renderProgressBody() {
    const pct =
      progress.total > 0
        ? Math.round((progress.current / progress.total) * 100)
        : 0;

    const countLine =
      progress.total > 0
        ? `<p class="nblc-progress-count">${progress.current} / ${progress.total} (${pct}%)</p>`
        : "";

    return `
      ${renderQuotaPanel()}

      <div class="nblc-progress-panel">
        <div class="nblc-spinner nblc-spinner-dark"></div>
        <p class="nblc-progress-phase">${escapeHtml(getProgressPhaseLabel())}</p>
        <p class="nblc-progress-status">${escapeHtml(progress.status)}</p>
        ${countLine}
        <p class="nblc-progress-note">Do not close this tab while compacting.</p>
      </div>
    `;
  }

  function getSelectedSources() {
    return allSources.filter((s) => selectedIds.has(s.id));
  }

  function getPreviewFetchKey() {
    return Array.from(selectedIds).sort().join(",");
  }

  function formatSourceType(type) {
    return TYPE_LABELS[type] || TYPE_LABELS.unknown;
  }

  function formatTypeBreakdown(sources) {
    const counts = {};

    for (const src of sources) {
      const type = src.type || "unknown";
      counts[type] = (counts[type] || 0) + 1;
    }

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `${count} ${formatSourceType(type)}`)
      .join(" · ");
  }

  function collectPreviewWarnings(fetched, compactedContent) {
    const warnings = [];
    const validation = format.validateNblc(compactedContent);
    warnings.push(...validation.warnings);

    const bytes = new TextEncoder().encode(compactedContent).length;
    if (bytes >= LARGE_BUNDLE_BYTES) {
      warnings.push(
        `Estimated bundle size is ${formatBytes(compactedContent)} — NotebookLM may reject very large pasted text.`
      );
    } else if (bytes >= WARN_BUNDLE_BYTES) {
      warnings.push(
        `Estimated bundle size is ${formatBytes(compactedContent)} — large bundles are untested; consider a smaller batch.`
      );
    }

    if (fetched.length === 1) {
      warnings.push(
        "Compacting 1 source won't free any quota slots — select 2+ to save space."
      );
    }

    return warnings;
  }

  function resetPreviewState() {
    previewLoadGen++;
    previewState = {
      status: "idle",
      fetchKey: "",
      sources: [],
      estimatedTitle: "",
      estimatedSize: 0,
      typeBreakdown: "",
      warnings: [],
      errorMessage: "",
      loadProgress: { current: 0, total: 0, status: "" },
    };
  }

  async function loadPreviewData() {
    const fetchKey = getPreviewFetchKey();

    if (!fetchKey) {
      previewState = {
        ...previewState,
        status: "ready",
        fetchKey: "",
        sources: [],
        estimatedTitle: "",
        estimatedSize: 0,
        typeBreakdown: "",
        warnings: [],
        errorMessage: "",
        loadProgress: { current: 0, total: 0, status: "" },
      };
      if (phase === PHASE.PREVIEW) render();
      return;
    }

    if (previewState.status === "ready" && previewState.fetchKey === fetchKey) {
      return;
    }

    const gen = ++previewLoadGen;
    previewState.status = "loading";
    previewState.fetchKey = fetchKey;
    previewState.errorMessage = "";
    previewState.loadProgress = { current: 0, total: 0, status: "Analyzing selected sources..." };
    if (phase === PHASE.PREVIEW) render();

    const notebookId = api.extractNotebookId();
    const atToken = api.extractATToken();
    const blVersion = api.extractBlVersion();

    if (!notebookId || !atToken) {
      if (gen !== previewLoadGen || phase !== PHASE.PREVIEW) return;
      previewState.status = "error";
      previewState.errorMessage =
        "Missing notebook ID or session token. Refresh the page and try again.";
      render();
      return;
    }

    const ids = fetchKey.split(",");
    const fetched = [];

    try {
      for (let i = 0; i < ids.length; i++) {
        if (gen !== previewLoadGen || phase !== PHASE.PREVIEW) return;

        const sourceId = ids[i];
        const domSource = allSources.find((s) => s.id === sourceId);

        previewState.loadProgress = {
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
          isNblc: domSource?.isNblc ?? false,
        });
      }

      if (gen !== previewLoadGen || phase !== PHASE.PREVIEW) return;

      const compactedContent = format.compactSources(fetched, { notebookId });
      const validation = format.validateNblc(compactedContent);

      if (!validation.valid) {
        throw new Error(validation.errors.join("; "));
      }

      previewState = {
        status: "ready",
        fetchKey,
        sources: fetched,
        estimatedTitle: format.buildCompactedTitle(fetched.length),
        estimatedSize: compactedContent.length,
        typeBreakdown: formatTypeBreakdown(fetched),
        warnings: collectPreviewWarnings(fetched, compactedContent),
        errorMessage: "",
        loadProgress: { current: ids.length, total: ids.length, status: "" },
      };
      render();
    } catch (error) {
      if (gen !== previewLoadGen || phase !== PHASE.PREVIEW) return;
      console.error("[CompactModal] Preview analysis failed:", error);
      previewState.status = "error";
      previewState.errorMessage =
        error instanceof Error ? error.message : "Failed to analyze selected sources";
      previewState.loadProgress = { current: 0, total: 0, status: "" };
      render();
    }
  }

  function goToPreview() {
    phase = PHASE.PREVIEW;
    scheduleRender();
    loadPreviewData();
  }

  function renderExcludedNblcNotice() {
    if (strippedNblcOnOpen.length === 0) return "";

    const titles = strippedNblcOnOpen.map((title) => escapeHtml(title)).join("<br>");
    return `
      <div class="nblc-warnings">
        Excluded ${strippedNblcOnOpen.length} NBLC bundle${strippedNblcOnOpen.length === 1 ? "" : "s"} from selection — decompact first; nested bundles are not allowed.
        <br>${titles}
      </div>
    `;
  }

  function renderNblcBlockPanel() {
    const nblcSources = getSelectedNblcSources();
    if (nblcSources.length === 0) return "";

    const titles = nblcSources.map((s) => escapeHtml(s.title)).join("<br>");

    return `
      <div class="nblc-confirm-panel">
        <p class="nblc-confirm-title">NBLC bundles can't be compacted</p>
        <p class="nblc-confirm-detail">
          Decompact these bundles first. Nesting one NBLC bundle inside another is not supported.
          <br><br>${titles}
        </p>
      </div>
      <button type="button" class="nblc-secondary-btn nblc-back-summary-btn" data-action="deselect-nblc">
        Remove NBLC bundles from selection
      </button>
    `;
  }

  function renderPreviewActions(count, continueDisabled = false) {
    const blocked = hasNblcInSelection();

    return `
      <label class="nblc-option-row">
        <input
          type="checkbox"
          ${downloadBackupZip ? "checked" : ""}
          data-action="toggle-backup-zip"
        />
        <span>Also download backup zip on success</span>
      </label>

      <div class="nblc-action-row">
        <button type="button" class="nblc-secondary-btn" data-action="edit-selection">Edit selection</button>
        <button
          type="button"
          class="nblc-primary-btn"
          data-action="continue"
          ${continueDisabled || blocked || count === 0 ? "disabled" : ""}
        >
          Continue (${count})
        </button>
      </div>
    `;
  }

  function renderPreviewWarnings(warnings) {
    if (!warnings?.length) return "";
    return `<div class="nblc-warnings">${warnings.map(escapeHtml).join("<br>")}</div>`;
  }

  function renderPreviewSourceList(sources) {
    const list = sources
      .map((source, index) => {
        const emptyHint =
          !source.content || source.content.trim().length === 0
            ? ' · <span class="nblc-preview-warn">empty content</span>'
            : "";
        return `
        <div class="nblc-source-item nblc-preview-item ${source.isNblc ? "nblc-nblc-source" : ""}">
          <span class="nblc-preview-index">${index + 1}</span>
          <span>${escapeHtml(source.title)} <em>(${escapeHtml(formatSourceType(source.type))})</em>${source.isNblc ? " <em>(NBLC)</em>" : ""}${emptyHint}</span>
        </div>
      `;
      })
      .join("");

    return `<div class="nblc-source-list nblc-preview-list">${list}</div>`;
  }

  function renderPreviewBody() {
    const count = selectedIds.size;

    if (previewState.status === "loading") {
      const { current, total, status } = previewState.loadProgress;
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;
      const countLine =
        total > 0
          ? `<p class="nblc-progress-count">${current} / ${total} (${pct}%)</p>`
          : "";

      return `
        ${renderQuotaPanel()}
        <div class="nblc-progress-panel">
          <div class="nblc-spinner nblc-spinner-dark"></div>
          <p class="nblc-progress-phase">Analyzing selection</p>
          <p class="nblc-progress-status">${escapeHtml(status)}</p>
          ${countLine}
        </div>
      `;
    }

    if (previewState.status === "error") {
      return `
        ${renderQuotaPanel()}
        <div class="nblc-error-panel">
          <p class="nblc-error-title">Could not analyze selection</p>
          <p class="nblc-error-detail">${escapeHtml(previewState.errorMessage)}</p>
        </div>
        <div class="nblc-action-row">
          <button type="button" class="nblc-secondary-btn" data-action="edit-selection">Edit selection</button>
          <button type="button" class="nblc-primary-btn" data-action="retry-preview">Try Again</button>
        </div>
      `;
    }

    const sources =
      previewState.sources.length > 0 ? previewState.sources : getSelectedSources();
    const typeBreakdown =
      previewState.typeBreakdown ||
      (sources.length > 0 ? formatTypeBreakdown(sources) : "");
    const estimatedTitle =
      previewState.estimatedTitle ||
      (sources.length > 0 ? format.buildCompactedTitle(sources.length) : "");

    return `
      ${renderQuotaPanel()}

      ${renderExcludedNblcNotice()}
      ${renderNblcBlockPanel()}

      <div class="nblc-preview-summary">
        <p><strong>${count}</strong> source${count === 1 ? "" : "s"} → <strong>1</strong> NBLC bundle</p>
        <p class="nblc-preview-meta">Title: <code>${escapeHtml(estimatedTitle)}</code></p>
        ${
          previewState.estimatedSize > 0
            ? `<p class="nblc-preview-meta">Estimated size: ${formatBytes(previewState.estimatedSize)}</p>`
            : ""
        }
        ${typeBreakdown ? `<p class="nblc-preview-meta">${escapeHtml(typeBreakdown)}</p>` : ""}
      </div>

      ${renderPreviewWarnings(previewState.warnings)}

      ${renderPreviewSourceList(sources)}

      ${renderPreviewActions(count, hasNblcInSelection())}
    `;
  }

  function renderResumePanel() {
    if (!pendingResume) return "";

    const messages = {
      fetched:
        "Resuming a failed compact from local backup. This will upload the saved NBLC bundle without re-fetching sources.",
      uploaded:
        "Resuming a failed compact. The NBLC bundle is already in your notebook — this will delete the selected originals.",
      deleting:
        "Resuming a failed compact. This will retry deleting the selected original sources.",
    };

    const detail =
      messages[pendingResume.phase] ||
      "Resuming a failed compact from local backup.";

    return `
      <div class="nblc-warnings">
        <strong>Resume compact</strong><br>
        ${escapeHtml(detail)}
      </div>
    `;
  }

  function renderConfirmBody() {
    const count = selectedIds.size;
    const previewRecap =
      previewState.status === "ready" &&
      previewState.fetchKey === getPreviewFetchKey() &&
      previewState.estimatedTitle
        ? `<p class="nblc-preview-meta">Bundle: <code>${escapeHtml(previewState.estimatedTitle)}</code> · ${formatBytes(previewState.estimatedSize)}${previewState.typeBreakdown ? ` · ${escapeHtml(previewState.typeBreakdown)}` : ""}</p>`
        : "";

    return `
      ${renderQuotaPanel()}

      ${renderNblcBlockPanel()}

      ${renderResumePanel()}

      ${previewRecap}

      ${renderPreviewWarnings(
        previewState.status === "ready" &&
          previewState.fetchKey === getPreviewFetchKey()
          ? previewState.warnings
          : []
      )}

      <div class="nblc-confirm-panel">
        <p class="nblc-confirm-title">Confirm compact operation</p>
        <p class="nblc-confirm-detail">
          This will upload <strong>1</strong> NBLC source and
          <strong>permanently delete ${count}</strong> selected source${count === 1 ? "" : "s"}.
          There is no undo.
        </p>
      </div>

      <label class="nblc-option-row nblc-consent-check">
        <input
          type="checkbox"
          data-action="toggle-ack-delete"
          ${ackPermanentDelete ? "checked" : ""}
        />
        <span>I understand the selected originals will be permanently deleted after upload succeeds.</span>
      </label>

      <label class="nblc-option-row nblc-consent-check">
        <input
          type="checkbox"
          data-action="toggle-ack-risk"
          ${ackDataLossRisk ? "checked" : ""}
        />
        <span>I have backed up important data or accept the risk of irreversible data loss.</span>
      </label>

      <label class="nblc-option-row">
        <input
          type="checkbox"
          ${downloadBackupZip ? "checked" : ""}
          data-action="toggle-backup-zip"
        />
        <span>Also download backup zip on success</span>
      </label>

      <div class="nblc-action-row">
        <button type="button" class="nblc-secondary-btn" data-action="back">Back</button>
        <button
          type="button"
          class="nblc-primary-btn"
          data-action="proceed-compact"
          ${canProceedWithCompact() && !hasNblcInSelection() ? "" : "disabled"}
        >
          Proceed with Compact (${count})
        </button>
      </div>
    `;
  }

  function renderSelectionHint() {
    if (selectedIds.size > 0) return "";

    return `
      <div class="nblc-empty-panel">
        <p class="nblc-empty-title">No sources selected</p>
        <p class="nblc-empty-detail">
          Check one or more sources in the NotebookLM source panel, then choose them here.
          Select at least <strong>2</strong> to free quota slots.
        </p>
      </div>
    `;
  }

  function renderIdleBody(filtered, allSelected) {
    const backToPreview =
      selectedIds.size > 0
        ? `<button type="button" class="nblc-secondary-btn nblc-back-summary-btn" data-action="back-to-preview">← Back to summary</button>`
        : "";

    return `
      ${renderQuotaPanel()}

      ${renderSelectionHint()}
      ${renderExcludedNblcNotice()}
      ${renderNblcBlockPanel()}

      ${backToPreview}

      <input
        type="text"
        class="nblc-filter-input"
        placeholder="Filter sources..."
        value="${escapeHtml(filterText)}"
        data-action="filter"
      />

      <label class="nblc-select-all">
        <input type="checkbox" ${allSelected ? "checked" : ""} data-action="toggle-all" />
        <span>Select All (${getCompactableSources(filtered).length})</span>
      </label>

      <div class="nblc-source-list">
        ${
          filtered.length === 0
            ? '<div class="nblc-empty">No sources found</div>'
            : filtered
                .map((source) => {
                  if (source.isNblc) {
                    return `
              <div class="nblc-source-item nblc-nblc-source nblc-nblc-blocked">
                <input type="checkbox" disabled />
                <span>${escapeHtml(source.title)} <em>(NBLC — decompact first)</em></span>
              </div>
            `;
                  }

                  return `
              <label class="nblc-source-item">
                <input
                  type="checkbox"
                  ${selectedIds.has(source.id) ? "checked" : ""}
                  data-action="toggle-source"
                  data-id="${escapeHtml(source.id)}"
                />
                <span>${escapeHtml(source.title)}</span>
              </label>
            `;
                })
                .join("")
        }
      </div>

      <label class="nblc-option-row">
        <input
          type="checkbox"
          ${downloadBackupZip ? "checked" : ""}
          data-action="toggle-backup-zip"
        />
        <span>Also download backup zip on success</span>
      </label>

      <button
        type="button"
        class="nblc-primary-btn"
        data-action="compact"
        ${selectedIds.size === 0 || hasNblcInSelection() ? "disabled" : ""}
      >
        Compact Selected (${selectedIds.size})
      </button>
    `;
  }

  function renderSuccessBody() {
    const warnings =
      result?.warnings?.length > 0
        ? `<div class="nblc-warnings">${result.warnings.map(escapeHtml).join("<br>")}</div>`
        : "";

    const compactedCount = result.sources.length;
    const slotsFreed = compactedCount > 1 ? compactedCount - 1 : 0;
    const quotaNote =
      slotsFreed > 0
        ? `<p class="nblc-success-note"><strong>+${slotsFreed}</strong> source slot${slotsFreed === 1 ? "" : "s"} freed in this notebook.</p>`
        : "";

    return `
      <div class="nblc-success-panel">
        <div class="nblc-success-icon">✓</div>
        <p class="nblc-success-title">${compactedCount} sources compacted</p>
        ${quotaNote}
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
        <button type="button" class="nblc-secondary-btn" data-action="download-nblc">Download NBLC (.md)</button>
        <button type="button" class="nblc-secondary-btn" data-action="download-zip">Download backup zip</button>
      </div>

      <button type="button" class="nblc-primary-btn" data-action="close">Done</button>
    `;
  }

  function renderErrorBody() {
    return `
      <div class="nblc-error-panel">
        <p class="nblc-error-title">Compact failed</p>
        <p class="nblc-error-detail">${escapeHtml(errorMessage)}</p>
        <p class="nblc-error-note">Any fetched data is kept in extension storage for retry.</p>
      </div>
      <button type="button" class="nblc-primary-btn" data-action="retry">Try Again</button>
    `;
  }

  function render() {
    if (!overlay) return;

    const filtered = getFilteredSources();
    const compactableFiltered = getCompactableSources(filtered);
    const allSelected =
      compactableFiltered.length > 0 &&
      compactableFiltered.every((s) => selectedIds.has(s.id));

    let body = "";
    if (phase === PHASE.SUCCESS) {
      body = renderSuccessBody();
    } else if (phase === PHASE.ERROR) {
      body = renderErrorBody();
    } else if (phase === PHASE.CONFIRM) {
      body = renderConfirmBody();
    } else if (phase === PHASE.PREVIEW) {
      body = renderPreviewBody();
    } else if (isBusy()) {
      body = renderProgressBody();
    } else {
      body = renderIdleBody(filtered, allSelected);
    }

    const bodyEl = overlay.querySelector(".nblc-modal-body");
    const closeBtn = overlay.querySelector(".nblc-close-btn");
    if (!bodyEl) return;

    replaceHtml(bodyEl, body);

    if (closeBtn) {
      closeBtn.disabled = isBusy();
    }

    a11y?.afterRender();
  }

  function ensureOverlay() {
    if (overlay) return;

    overlay = document.createElement("div");
    overlay.id = "nblc-compact-modal-root";
    overlay.hidden = true;
    overlay.dataset.nblcOpen = "false";
    overlay.innerHTML = `
      <div class="nblc-overlay">
        <div class="nblc-modal" role="dialog" aria-label="Compact Sources">
          <div class="nblc-modal-header">
            <div class="nblc-modal-title-row">
              <span class="nblc-modal-icon">📦</span>
              <h3>Compact Sources</h3>
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
    overlay.addEventListener("input", handleInput);
    document.body.appendChild(overlay);
    setModalVisible(overlay, false);

    a11y = modalA11y.attachModalA11y(overlay, () => ({
      isBusy,
      onClose: close,
    }));
  }

  function resolveActionTarget(event) {
    const direct = event.target.closest("[data-action]");
    if (direct) return direct;

    const label = event.target.closest("label");
    if (label) {
      return label.querySelector("[data-action]");
    }

    return null;
  }

  function setSourceSelected(id, checked) {
    if (isBusy()) return;

    const source = allSources.find((s) => s.id === id);
    if (source?.isNblc) return;

    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    selectedIds = next;
    render();
  }

  function setSelectAll(filtered, checked) {
    if (isBusy()) return;

    const compactable = getCompactableSources(filtered);
    if (checked) {
      selectedIds = new Set(compactable.map((s) => s.id));
    } else {
      selectedIds = new Set();
    }
    render();
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
      case "toggle-source":
        setSourceSelected(target.dataset.id, target.checked);
        break;
      case "toggle-all":
        setSelectAll(getFilteredSources(), target.checked);
        break;
      case "toggle-backup-zip":
        downloadBackupZip = target.checked;
        break;
      case "toggle-ack-delete":
        ackPermanentDelete = target.checked;
        render();
        break;
      case "toggle-ack-risk":
        ackDataLossRisk = target.checked;
        render();
        break;
    }
  }

  function scheduleRender() {
    requestAnimationFrame(() => render());
  }

  function handleClick(event) {
    event.stopPropagation();

    const target = resolveActionTarget(event);
    if (!target) return;

    const action = target.dataset.action;
    if (target.disabled) return;

    if (isCheckboxActionElement(target)) return;

    event.preventDefault();

    switch (action) {
      case "close":
        if (!isBusy()) close();
        break;
      case "back":
        if (!isBusy()) {
          pendingResume = null;
          if (selectedIds.size > 0) goToPreview();
          else {
            phase = PHASE.IDLE;
            scheduleRender();
          }
        }
        break;
      case "continue":
        if (selectedIds.size === 0 || isBusy() || hasNblcInSelection()) break;
        phase = PHASE.CONFIRM;
        ackPermanentDelete = false;
        ackDataLossRisk = false;
        scheduleRender();
        break;
      case "edit-selection":
        if (!isBusy()) {
          phase = PHASE.IDLE;
          scheduleRender();
        }
        break;
      case "back-to-preview":
        if (!isBusy()) goToPreview();
        break;
      case "retry-preview":
        if (!isBusy()) {
          previewState.fetchKey = "";
          loadPreviewData();
        }
        break;
      case "deselect-nblc":
        if (!isBusy() && stripNblcFromSelection() > 0) {
          if (phase === PHASE.PREVIEW) goToPreview();
          else scheduleRender();
        }
        break;
      case "compact":
        if (selectedIds.size === 0 || isBusy() || hasNblcInSelection()) break;
        phase = PHASE.CONFIRM;
        ackPermanentDelete = false;
        ackDataLossRisk = false;
        scheduleRender();
        break;
      case "proceed-compact":
        if (!canProceedWithCompact() || isBusy()) break;
        if (pendingResume) runCompactResume();
        else runCompact();
        break;
      case "download-nblc":
        downloadNblcFile();
        break;
      case "download-zip":
        downloadBackupZipFile();
        break;
      case "retry":
        errorMessage = "";
        progress = { current: 0, total: 0, status: "" };
        if (pendingResume) {
          phase = PHASE.CONFIRM;
          scheduleRender();
        } else if (selectedIds.size > 0) goToPreview();
        else {
          phase = PHASE.IDLE;
          scheduleRender();
        }
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

  function hide() {
    a11y?.onClose();
    setModalVisible(overlay, false);
    notifyRecoveryRefresh();
  }

  function open(initialIds = null) {
    window.NBLC.consentModal?.hide?.();
    window.NBLC.decompactModal?.hide?.();
    pendingResume = null;
    allSources = api.extractSourcesFromDOM();
    filterText = "";
    downloadBackupZip = false;
    ackPermanentDelete = false;
    ackDataLossRisk = false;
    progress = { current: 0, total: 0, status: "" };
    result = null;
    errorMessage = "";

    if (initialIds && initialIds.length > 0) {
      selectedIds = new Set(initialIds);
    } else {
      selectedIds = new Set(api.getSelectedSourceIds());
    }

    strippedNblcOnOpen = sanitizeSelectionOnOpen();

    accountSourceLimit = null;
    accountLimitsLoadGen++;
    resetPreviewState();
    phase = selectedIds.size > 0 ? PHASE.PREVIEW : PHASE.IDLE;

    ensureOverlay();

    render();
    setModalVisible(overlay, true);
    a11y.onOpen();
    notifyRecoveryRefresh();
    loadAccountLimits();

    if (phase === PHASE.PREVIEW) {
      loadPreviewData();
    }
  }

  function close() {
    if (isBusy()) return;
    setModalVisible(overlay, false);
    a11y?.onClose({ restoreFocus: false });
    phase = PHASE.IDLE;
    pendingResume = null;
    notifyRecoveryRefresh();
  }

  function openResume(pending) {
    if (!pending?.sourceIds?.length) return;

    window.NBLC.consentModal?.hide?.();
    window.NBLC.decompactModal?.hide?.();
    allSources = api.extractSourcesFromDOM();
    filterText = "";
    downloadBackupZip = false;
    ackPermanentDelete = false;
    ackDataLossRisk = false;
    progress = { current: 0, total: 0, status: "" };
    result = null;
    errorMessage = "";
    pendingResume = pending;

    selectedIds = new Set(pending.sourceIds);
    strippedNblcOnOpen = sanitizeSelectionOnOpen();
    accountSourceLimit = null;
    accountLimitsLoadGen++;
    resetPreviewState();
    phase = PHASE.CONFIRM;

    ensureOverlay();

    render();
    setModalVisible(overlay, true);
    a11y.onOpen();
    notifyRecoveryRefresh();
    loadAccountLimits();
  }

  window.NBLC.compactModal = { open, close, hide, openResume };
})();