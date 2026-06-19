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

  async function savePendingCompact(notebookId, data) {
    const key = compactKey(notebookId);
    const entry = {
      ...data,
      createdAt: data.createdAt || new Date().toISOString(),
    };
    await chrome.storage.local.set({ [key]: entry });
    return entry;
  }

  async function getPendingCompact(notebookId) {
    const key = compactKey(notebookId);
    const result = await chrome.storage.local.get(key);
    return getFromResult(result, key);
  }

  async function savePendingDecompact(notebookId, data) {
    const key = decompactKey(notebookId);
    const entry = {
      ...data,
      createdAt: data.createdAt || new Date().toISOString(),
    };
    await chrome.storage.local.set({ [key]: entry });
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
    sweepStale,
  };
})();