const PREFIX_COMPACT = "pending-compact/";
const PREFIX_DECOMPACT = "pending-decompact/";
const DEFAULT_STALE_MS = 24 * 60 * 60 * 1000;

export async function sweepStale(maxAgeMs = DEFAULT_STALE_MS) {
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