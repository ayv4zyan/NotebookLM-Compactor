(function () {
  const PREFIX_COMPACT = "pending-compact/";
  const PREFIX_DECOMPACT = "pending-decompact/";
  const DEFAULT_STALE_MS = 24 * 60 * 60 * 1000;

  function compactKey(notebookId) {
    return `${PREFIX_COMPACT}${notebookId}`;
  }

  function decompactKey(notebookId) {
    return `${PREFIX_DECOMPACT}${notebookId}`;
  }

  function getFromResult(result, key) {
    return result?.[key] ?? null;
  }

  function isQuotaError(error) {
    const msg = String(error?.message || error || "");
    return /quota/i.test(msg) || msg.includes("QUOTA_BYTES");
  }

  async function storageSet(items) {
    try {
      await chrome.storage.local.set(items);
    } catch (error) {
      if (isQuotaError(error)) {
        throw new Error(
          "Extension storage quota exceeded. Progress is not saved locally, but your NBLC bundle is still in NotebookLM — close and run Decompact again to continue."
        );
      }
      throw error;
    }
  }

  function slimCompactEntry(data) {
    return {
      phase: data.phase,
      sourceIds: data.sourceIds || [],
      compactedContent: data.compactedContent || "",
      compactedSourceId: data.compactedSourceId ?? null,
      createdAt: data.createdAt || new Date().toISOString(),
    };
  }

  function slimDecompactEntry(data) {
    return {
      phase: data.phase,
      compactedSourceId: data.compactedSourceId,
      uploadedSourceIds: data.uploadedSourceIds || [],
      sectionCount: data.sectionCount ?? 0,
      createdAt: data.createdAt || new Date().toISOString(),
    };
  }

  async function savePendingCompact(notebookId, data) {
    const key = compactKey(notebookId);
    const entry = slimCompactEntry(data);
    await storageSet({ [key]: entry });
    return entry;
  }

  async function getPendingCompact(notebookId) {
    const key = compactKey(notebookId);
    const result = await chrome.storage.local.get(key);
    return getFromResult(result, key);
  }

  async function savePendingDecompact(notebookId, data) {
    const key = decompactKey(notebookId);
    const entry = slimDecompactEntry(data);
    await storageSet({ [key]: entry });
    return entry;
  }

  async function getPendingDecompact(notebookId) {
    const key = decompactKey(notebookId);
    const result = await chrome.storage.local.get(key);
    return getFromResult(result, key);
  }

  async function clearPending(notebookId) {
    const keys = [compactKey(notebookId), decompactKey(notebookId)];
    await chrome.storage.local.remove(keys);
  }

  async function clearPendingCompact(notebookId) {
    await chrome.storage.local.remove(compactKey(notebookId));
  }

  async function clearPendingDecompact(notebookId) {
    await chrome.storage.local.remove(decompactKey(notebookId));
  }

  function isActivePending(entry) {
    return Boolean(entry?.phase && entry.phase !== "done");
  }

  async function migrateFatPendingEntries() {
    const all = await chrome.storage.local.get(null);
    let migrated = 0;

    for (const [key, value] of Object.entries(all)) {
      if (!value || typeof value !== "object") continue;

      if (key.startsWith(PREFIX_DECOMPACT) && Array.isArray(value.sections)) {
        await storageSet({
          [key]: slimDecompactEntry({
            phase: value.phase || "uploading",
            compactedSourceId: value.compactedSourceId,
            uploadedSourceIds: value.uploadedSourceIds || [],
            sectionCount: value.sections.length,
            createdAt: value.createdAt,
          }),
        });
        migrated++;
        continue;
      }

      if (key.startsWith(PREFIX_COMPACT) && Array.isArray(value.sources)) {
        const sourceIds = value.sources
          .map((source) => source?.id)
          .filter((id) => typeof id === "string" && id.length > 0);
        await storageSet({
          [key]: slimCompactEntry({
            phase: value.phase || "fetched",
            sourceIds,
            compactedContent: value.compactedContent || "",
            compactedSourceId: value.compactedSourceId ?? null,
            createdAt: value.createdAt,
          }),
        });
        migrated++;
      }
    }

    return migrated;
  }

  async function sweepStale(maxAgeMs = DEFAULT_STALE_MS) {
    const all = await chrome.storage.local.get(null);
    const now = Date.now();
    const toRemove = [];

    for (const [key, value] of Object.entries(all)) {
      const isPending =
        key.startsWith(PREFIX_COMPACT) || key.startsWith(PREFIX_DECOMPACT);
      if (!isPending) continue;

      const createdAt = value?.createdAt;
      if (!createdAt) continue;

      const age = now - new Date(createdAt).getTime();
      if (Number.isFinite(age) && age > maxAgeMs) {
        toRemove.push(key);
      }
    }

    if (toRemove.length > 0) {
      await chrome.storage.local.remove(toRemove);
    }

    return toRemove.length;
  }

  window.NBLC = window.NBLC || {};
  window.NBLC.store = {
    savePendingCompact,
    getPendingCompact,
    savePendingDecompact,
    getPendingDecompact,
    clearPending,
    clearPendingCompact,
    clearPendingDecompact,
    isActivePending,
    migrateFatPendingEntries,
    sweepStale,
  };
})();