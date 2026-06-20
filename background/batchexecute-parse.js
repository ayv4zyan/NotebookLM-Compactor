/**
 * Parse NotebookLM batchexecute multi-line responses.
 * Spec: docs/API.md
 */

const ANTI_XSSI_PREFIX = ")]}'";

export function normalizeBatchExecuteText(text) {
  if (typeof text !== "string") return "";
  let normalized = text.trim();
  if (normalized.startsWith(ANTI_XSSI_PREFIX)) {
    normalized = normalized.slice(ANTI_XSSI_PREFIX.length).trim();
  }
  return normalized;
}

export function looksLikeHtmlResponse(text) {
  const sample = text.trim().slice(0, 200).toLowerCase();
  return sample.startsWith("<!doctype") || sample.startsWith("<html");
}

export function parseInnerPayload(parsedLine) {
  const inner = parsedLine?.[0]?.[2];
  if (inner == null) return null;
  if (typeof inner === "string") {
    try {
      return JSON.parse(inner);
    } catch {
      return null;
    }
  }
  if (typeof inner === "object") return inner;
  return null;
}

export function parseBatchExecuteResponse(text) {
  const normalized = normalizeBatchExecuteText(text);
  if (!normalized) return null;

  if (looksLikeHtmlResponse(normalized)) {
    return { __authError: true };
  }

  const candidates = [];

  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trim();
    const start = line.indexOf("[[");
    if (start === -1) continue;
    candidates.push(line.slice(start));
  }

  if (candidates.length === 0 && normalized.includes("[[")) {
    candidates.push(normalized.slice(normalized.indexOf("[[")));
  }

  for (const jsonLine of candidates) {
    try {
      const parsed = JSON.parse(jsonLine);
      const innerData = parseInnerPayload(parsed);
      if (innerData) return innerData;
    } catch {
      // try next candidate line
    }
  }

  return null;
}

export function describeBatchExecuteParseFailure(text) {
  const normalized = normalizeBatchExecuteText(text);
  if (!normalized) {
    return "Empty API response";
  }
  if (looksLikeHtmlResponse(normalized)) {
    return "Session expired or not logged in — refresh NotebookLM and try again";
  }
  const preview = normalized.replace(/\s+/g, " ").slice(0, 120);
  return `Failed to parse API response (${preview})`;
}