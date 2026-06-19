import {
  extractSourceId,
  findSourceInNotebook,
} from "./rpc-parse.js";

const RPC_GET_CONTENT = "hizoJc";
const RPC_ADD_SOURCE = "izAoDd";
const RPC_DELETE = "tGMBJ";
const RPC_GET_NOTEBOOK = "rLM1Ne";

// Fallback when content script cannot extract `cfb2h` from page HTML.
export const DEFAULT_BL_VERSION = "boq_labs-tailwind-frontend_20260108.06_p0";

export {
  extractSourceUrlFromMetadata,
  extractSourceTypeFromMetadata,
};

const SOURCE_STATUS = {
  PROCESSING: 1,
  READY: 2,
  ERROR: 3,
  PREPARING: 5,
};

function buildTemplateBlock() {
  return [2, null, null, [1, null, null, null, null, null, null, null, null, null, [1]]];
}

function resolveBlVersion(blVersion) {
  return typeof blVersion === "string" && blVersion.trim().length > 0
    ? blVersion.trim()
    : DEFAULT_BL_VERSION;
}

function buildBatchExecuteUrl(notebookId, rpcId, blVersion) {
  const params = new URLSearchParams({
    rpcids: rpcId,
    "source-path": `/notebook/${notebookId}`,
    bl: resolveBlVersion(blVersion),
    hl: "en",
    _reqid: String(Math.floor(Math.random() * 1e6)),
    rt: "c",
  });
  return `https://notebooklm.google.com/_/LabsTailwindUi/data/batchexecute?${params.toString()}`;
}

function buildFReqBody(rpcId, params, atToken) {
  const inner = JSON.stringify(params);
  const fReq = JSON.stringify([[[rpcId, inner, null, "generic"]]]);
  return `f.req=${encodeURIComponent(fReq)}&at=${encodeURIComponent(atToken)}&`;
}

function buildGetContentBody(sourceId, atToken) {
  const params = [[sourceId], [2], [2]];
  return buildFReqBody(RPC_GET_CONTENT, params, atToken);
}

export function buildAddTextParams(title, content, notebookId) {
  return [
    [[null, [title, content], null, 2, null, null, null, null, null, null, 1]],
    notebookId,
    buildTemplateBlock(),
  ];
}

function buildAddTextBody(title, content, notebookId, atToken) {
  return buildFReqBody(
    RPC_ADD_SOURCE,
    buildAddTextParams(title, content, notebookId),
    atToken
  );
}

export function buildAddUrlParams(url, notebookId) {
  return [
    [[null, null, [url], null, null, null, null, null, null, null, 1]],
    notebookId,
    buildTemplateBlock(),
  ];
}

function buildAddUrlBody(url, notebookId, atToken) {
  return buildFReqBody(
    RPC_ADD_SOURCE,
    buildAddUrlParams(url, notebookId),
    atToken
  );
}

export function buildAddYoutubeParams(url, notebookId) {
  return [
    [[null, null, null, null, null, null, null, [url], null, null, 1]],
    notebookId,
    buildTemplateBlock(),
  ];
}

function buildAddYoutubeBody(url, notebookId, atToken) {
  return buildFReqBody(
    RPC_ADD_SOURCE,
    buildAddYoutubeParams(url, notebookId),
    atToken
  );
}

export function isYoutubeUrl(url) {
  if (typeof url !== "string" || url.trim().length === 0) return false;

  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return host === "youtu.be" || host.endsWith("youtube.com");
  } catch {
    return /(?:^|\/\/)(?:www\.)?(?:youtube\.com|youtu\.be)/i.test(url);
  }
}

function buildGetNotebookBody(notebookId, atToken) {
  const params = [notebookId, null, buildTemplateBlock(), null, 0];
  return buildFReqBody(RPC_GET_NOTEBOOK, params, atToken);
}

function buildDeleteBody(sourceIds, atToken) {
  const nested = sourceIds.map((id) => [id]);
  const params = [nested, [2]];
  return buildFReqBody(RPC_DELETE, params, atToken);
}

function parseBatchExecuteResponse(text) {
  const lines = text.split("\n");
  for (const line of lines) {
    if (!line.startsWith("[[")) continue;
    const parsed = JSON.parse(line);
    if (parsed[0]?.[2]) {
      return JSON.parse(parsed[0][2]);
    }
  }
  return null;
}

async function batchExecute({ notebookId, rpcId, body, blVersion }) {
  const url = buildBatchExecuteUrl(notebookId, rpcId, blVersion);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "X-Same-Domain": "1",
    },
    credentials: "include",
    body,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const text = await response.text();
  const innerData = parseBatchExecuteResponse(text);
  if (!innerData) {
    throw new Error("Failed to parse API response");
  }

  return innerData;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SOURCE_TYPE_CODE_MAP = {
  1: "gdoc",
  3: "pdf",
  4: "text",
  5: "web",
  9: "youtube",
};

function extractSourceUrlFromMetadata(metadata) {
  if (!Array.isArray(metadata)) {
    if (typeof metadata === "string") {
      try {
        return extractSourceUrlFromMetadata(JSON.parse(metadata));
      } catch {
        return null;
      }
    }
    return null;
  }

  const canonical = metadata[7];
  if (Array.isArray(canonical) && typeof canonical[0] === "string" && canonical[0]) {
    return canonical[0];
  }

  const youtubeBlock = metadata[5];
  if (
    Array.isArray(youtubeBlock) &&
    typeof youtubeBlock[0] === "string" &&
    youtubeBlock[0]
  ) {
    return youtubeBlock[0];
  }

  const bare = metadata[0];
  if (typeof bare === "string" && bare.startsWith("http")) {
    return bare;
  }

  return null;
}

function extractSourceTypeFromMetadata(metadata) {
  if (!Array.isArray(metadata)) return null;
  const code = metadata[4];
  return typeof code === "number" ? SOURCE_TYPE_CODE_MAP[code] || null : null;
}

function parseFormattedText(nodes) {
  if (!Array.isArray(nodes)) return "";

  let result = "";
  for (const node of nodes) {
    const parts = node[2];
    if (!Array.isArray(parts)) continue;

    const raw = parts[0];
    if (!raw || typeof raw !== "string") continue;

    const style = parts[1];
    let text = raw;

    if (Array.isArray(style)) {
      const link = style[3];
      const bold = style[0] === true;
      const code = style[7] === true;

      if (code) text = `\`${text}\``;
      if (typeof link === "string" && link.length > 0) text = `[${text}](${link})`;
      if (bold) text = `**${text}**`;
    }

    result += text;
  }

  return result;
}

function extractSourceContent(innerData) {
  const title = innerData?.[0]?.[1] || "Untitled Source";
  const metadata = innerData?.[0]?.[2];
  const sourceUrl = extractSourceUrlFromMetadata(metadata) || "";
  const sourceType = extractSourceTypeFromMetadata(metadata);

  const segments = innerData?.[3]?.[0]?.[0];
  if (!Array.isArray(segments) || segments.length === 0) {
    return {
      title,
      content: "",
      url: sourceUrl || null,
      sourceType,
    };
  }

  const lines = [];

  for (const segment of segments) {
    if (!Array.isArray(segment)) continue;

    if (segment[4] && Array.isArray(segment[4])) {
      const table = segment[4];
      const colCount = table[1];
      const rows = table[2];

      if (Array.isArray(rows) && rows.length > 0) {
        const tableLines = [];
        for (const row of rows) {
          const cells = row[2];
          if (!Array.isArray(cells)) continue;
          const cellTexts = cells.map((cell) => {
            const text = parseFormattedText(cell[2]);
            return text.replace(/\|/g, "\\|").trim();
          });
          tableLines.push(`| ${cellTexts.join(" | ")} |`);
        }

        if (tableLines.length > 0) {
          const separator = `| ${Array(colCount).fill("---").join(" | ")} |`;
          lines.push(tableLines[0]);
          lines.push(separator);
          for (let i = 1; i < tableLines.length; i++) lines.push(tableLines[i]);
        }
      }
      continue;
    }

    const body = segment[2];
    if (!Array.isArray(body)) continue;

    const textNodes = body[0];
    if (!Array.isArray(textNodes)) continue;

    const headingLevel = body[1]?.[1];
    const text = parseFormattedText(textNodes);
    if (text.trim().length === 0) continue;

    switch (headingLevel) {
      case 4:
        lines.push(`# ${text}`);
        break;
      case 5:
        lines.push(`## ${text}`);
        break;
      case 6:
        lines.push(`### ${text}`);
        break;
      default:
        lines.push(text);
    }
  }

  if (sourceUrl) lines.unshift(`Source: [${sourceUrl}](${sourceUrl})`);

  return {
    title,
    content: lines.join("\n\n"),
    url: sourceUrl || null,
    sourceType,
  };
}

async function getSourceContent({ sourceId, notebookId, atToken, blVersion }) {
  const body = buildGetContentBody(sourceId, atToken);
  const innerData = await batchExecute({
    notebookId,
    rpcId: RPC_GET_CONTENT,
    body,
    blVersion,
  });
  return extractSourceContent(innerData);
}

async function addTextSource({ title, content, notebookId, atToken, blVersion }) {
  const body = buildAddTextBody(title, content, notebookId, atToken);
  const innerData = await batchExecute({
    notebookId,
    rpcId: RPC_ADD_SOURCE,
    body,
    blVersion,
  });

  const sourceId = extractSourceId(innerData);
  if (!sourceId) {
    throw new Error("Failed to parse new source ID from upload response");
  }

  return { sourceId, title };
}

async function addUrlSource({ url, notebookId, atToken, blVersion }) {
  if (typeof url !== "string" || url.trim().length === 0) {
    throw new Error("addUrl requires a non-empty url");
  }

  const trimmedUrl = url.trim();
  const body = isYoutubeUrl(trimmedUrl)
    ? buildAddYoutubeBody(trimmedUrl, notebookId, atToken)
    : buildAddUrlBody(trimmedUrl, notebookId, atToken);

  const innerData = await batchExecute({
    notebookId,
    rpcId: RPC_ADD_SOURCE,
    body,
    blVersion,
  });

  const sourceId = extractSourceId(innerData);
  if (!sourceId) {
    throw new Error("Failed to parse new source ID from URL upload response");
  }

  return { sourceId, url: trimmedUrl };
}

async function addYoutubeSource({ url, notebookId, atToken, blVersion }) {
  if (typeof url !== "string" || url.trim().length === 0) {
    throw new Error("addYoutube requires a non-empty url");
  }

  const trimmedUrl = url.trim();
  const body = buildAddYoutubeBody(trimmedUrl, notebookId, atToken);
  const innerData = await batchExecute({
    notebookId,
    rpcId: RPC_ADD_SOURCE,
    body,
    blVersion,
  });

  const sourceId = extractSourceId(innerData);
  if (!sourceId) {
    throw new Error("Failed to parse new source ID from YouTube upload response");
  }

  return { sourceId, url: trimmedUrl };
}

async function getNotebook({ notebookId, atToken, blVersion }) {
  const body = buildGetNotebookBody(notebookId, atToken);
  return batchExecute({
    notebookId,
    rpcId: RPC_GET_NOTEBOOK,
    body,
    blVersion,
  });
}

async function deleteSources({ sourceIds, notebookId, atToken, blVersion }) {
  if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
    throw new Error("delete requires at least one source ID");
  }

  const body = buildDeleteBody(sourceIds, atToken);
  await batchExecute({
    notebookId,
    rpcId: RPC_DELETE,
    body,
    blVersion,
  });

  return { deletedCount: sourceIds.length };
}

async function waitForSourceReady({
  notebookId,
  sourceId,
  atToken,
  blVersion,
  timeoutMs = 120000,
  initialIntervalMs = 1000,
  maxIntervalMs = 10000,
}) {
  const start = Date.now();
  let intervalMs = initialIntervalMs;

  while (Date.now() - start < timeoutMs) {
    const notebook = await getNotebook({ notebookId, atToken, blVersion });
    const source = findSourceInNotebook(notebook, sourceId);

    if (!source) {
      throw new Error(`Uploaded source not found in notebook: ${sourceId}`);
    }

    if (source.status === SOURCE_STATUS.READY) {
      return source;
    }

    if (source.status === SOURCE_STATUS.ERROR) {
      throw new Error(
        `Source processing failed: ${source.title || sourceId}`
      );
    }

    await sleep(intervalMs);
    intervalMs = Math.min(Math.round(intervalMs * 1.5), maxIntervalMs);
  }

  throw new Error(`Timeout waiting for source to become ready: ${sourceId}`);
}

export async function handleSourceApiMessage(message) {
  const {
    action,
    sourceId,
    sourceIds,
    notebookId,
    atToken,
    blVersion,
    title,
    content,
    url,
    timeoutMs,
  } = message.body || {};

  try {
    switch (action) {
      case "getContent": {
        const result = await getSourceContent({
          sourceId,
          notebookId,
          atToken,
          blVersion,
        });
        return { success: true, ...result };
      }

      case "addText": {
        const result = await addTextSource({
          title,
          content,
          notebookId,
          atToken,
          blVersion,
        });
        return { success: true, ...result };
      }

      case "addUrl": {
        const result = await addUrlSource({
          url,
          notebookId,
          atToken,
          blVersion,
        });
        return { success: true, ...result };
      }

      case "addYoutube": {
        const result = await addYoutubeSource({
          url,
          notebookId,
          atToken,
          blVersion,
        });
        return { success: true, ...result };
      }

      case "getNotebook": {
        const notebook = await getNotebook({ notebookId, atToken, blVersion });
        const source = sourceId ? findSourceInNotebook(notebook, sourceId) : null;
        return {
          success: true,
          source: source || null,
        };
      }

      case "waitForSourceReady": {
        const source = await waitForSourceReady({
          notebookId,
          sourceId,
          atToken,
          blVersion,
          timeoutMs,
        });
        return { success: true, source };
      }

      case "delete": {
        const ids = sourceIds || (sourceId ? [sourceId] : []);
        const result = await deleteSources({
          sourceIds: ids,
          notebookId,
          atToken,
          blVersion,
        });
        return { success: true, ...result };
      }

      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  } catch (error) {
    console.error(`[source-api] ${action} failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}