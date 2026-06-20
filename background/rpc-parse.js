/**
 * Pure helpers for parsing NotebookLM batchexecute source payloads.
 * Spec: docs/API.md, notebooklm-py SourceRow adapter.
 */

export function extractIdFromEnvelope(rawId) {
  if (rawId == null) return null;
  if (!Array.isArray(rawId)) return String(rawId);
  if (rawId[0] != null) return String(rawId[0]);
  if (Array.isArray(rawId[2]) && rawId[2][0] != null) return String(rawId[2][0]);
  return null;
}

export function extractSourceId(data) {
  if (!Array.isArray(data) || data.length === 0) return null;

  const outer = data[0];
  if (
    Array.isArray(outer) &&
    outer.length > 0 &&
    Array.isArray(outer[0]) &&
    outer[0].length > 0
  ) {
    const inner = outer[0];
    if (Array.isArray(inner[0])) {
      return extractIdFromEnvelope(inner[0]);
    }
    return extractIdFromEnvelope(outer[0]);
  }

  return extractIdFromEnvelope(data[0]);
}

export function extractIdFromEntry(entry) {
  if (!Array.isArray(entry) || entry.length === 0) return null;
  return extractIdFromEnvelope(entry[0]);
}

export function extractSourcesList(notebookData) {
  if (!Array.isArray(notebookData)) return [];
  const nbInfo = notebookData[0];
  if (!Array.isArray(nbInfo) || nbInfo.length <= 1) return [];
  const sourcesList = nbInfo[1];
  return Array.isArray(sourcesList) ? sourcesList : [];
}

export function extractSourceStatus(entry) {
  if (!Array.isArray(entry) || entry.length <= 3) return null;
  const statusBlock = entry[3];
  if (!Array.isArray(statusBlock) || statusBlock.length <= 1) return null;
  const status = statusBlock[1];
  return typeof status === "number" ? status : null;
}

export function findSourceInNotebook(notebookData, sourceId) {
  const sources = extractSourcesList(notebookData);
  for (const entry of sources) {
    const id = extractIdFromEntry(entry);
    if (id === sourceId) {
      return {
        id,
        status: extractSourceStatus(entry),
        title: typeof entry[1] === "string" ? entry[1] : null,
      };
    }
  }
  return null;
}

function positiveInt(value) {
  if (typeof value === "boolean") return null;
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  return null;
}

/**
 * Account limits from GET_USER_SETTINGS (ZwVcOc) inner payload.
 * Path: result[0][1] — index 1 = notebook_limit, index 2 = source_limit.
 */
export function extractAccountLimits(settingsData) {
  if (!Array.isArray(settingsData)) {
    return { notebookLimit: null, sourceLimit: null };
  }

  const accountRow = settingsData[0];
  if (!Array.isArray(accountRow) || accountRow.length <= 1) {
    return { notebookLimit: null, sourceLimit: null };
  }

  const limits = accountRow[1];
  if (!Array.isArray(limits)) {
    return { notebookLimit: null, sourceLimit: null };
  }

  const notebookLimit =
    limits.length > 1 ? positiveInt(limits[1]) : null;
  const sourceLimit =
    limits.length > 2 ? positiveInt(limits[2]) : null;

  return { notebookLimit, sourceLimit };
}