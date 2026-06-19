import {
  extractSourceId,
  findSourceInNotebook,
} from "./rpc-parse.js";

const RPC_GET_CONTENT = "hizoJc";
const RPC_ADD_SOURCE = "izAoDd";
const RPC_DELETE = "tGMBJ";
const RPC_GET_NOTEBOOK = "rLM1Ne";

// Google frontend build label — may need updating if API calls start failing.
const BL_VERSION = "boq_labs-tailwind-frontend_20260108.06_p0";

const SOURCE_STATUS = {
  PROCESSING: 1,
  READY: 2,
  ERROR: 3,
  PREPARING: 5,
};

function buildTemplateBlock() {
  return [2, null, null, [1, null, null, null, null, null, null, null, null, null, [1]]];
}

function buildBatchExecuteUrl(notebookId, rpcId) {
  const params = new URLSearchParams({
    rpcids: rpcId,
    "source-path": `/notebook/${notebookId}`,
    bl: BL_VERSION,
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

function buildAddTextBody(title, content, notebookId, atToken) {
  const params = [
    [[null, [title, content], null, 2, null, null, null, null, null, null, 1]],
    notebookId,
    buildTemplateBlock(),
  ];
  return buildFReqBody(RPC_ADD_SOURCE, params, atToken);
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

async function batchExecute({ notebookId, rpcId, body }) {
  const url = buildBatchExecuteUrl(notebookId, rpcId);
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
  let sourceUrl = "";

  try {
    const meta = innerData?.[0]?.[2];
    if (typeof meta === "string") {
      const parsed = JSON.parse(meta);
      const url = parsed?.[0]?.[2]?.[7];
      if (Array.isArray(url) && url[0]) sourceUrl = url[0];
    }
  } catch {
    // optional metadata
  }

  const segments = innerData?.[3]?.[0]?.[0];
  if (!Array.isArray(segments) || segments.length === 0) {
    return { title, content: "", url: sourceUrl || null };
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

  return { title, content: lines.join("\n\n"), url: sourceUrl || null };
}

async function getSourceContent({ sourceId, notebookId, atToken }) {
  const body = buildGetContentBody(sourceId, atToken);
  const innerData = await batchExecute({
    notebookId,
    rpcId: RPC_GET_CONTENT,
    body,
  });
  return extractSourceContent(innerData);
}

async function addTextSource({ title, content, notebookId, atToken }) {
  const body = buildAddTextBody(title, content, notebookId, atToken);
  const innerData = await batchExecute({
    notebookId,
    rpcId: RPC_ADD_SOURCE,
    body,
  });

  const sourceId = extractSourceId(innerData);
  if (!sourceId) {
    throw new Error("Failed to parse new source ID from upload response");
  }

  return { sourceId, title };
}

async function getNotebook({ notebookId, atToken }) {
  const body = buildGetNotebookBody(notebookId, atToken);
  return batchExecute({
    notebookId,
    rpcId: RPC_GET_NOTEBOOK,
    body,
  });
}

async function deleteSources({ sourceIds, notebookId, atToken }) {
  if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
    throw new Error("delete requires at least one source ID");
  }

  const body = buildDeleteBody(sourceIds, atToken);
  await batchExecute({
    notebookId,
    rpcId: RPC_DELETE,
    body,
  });

  return { deletedCount: sourceIds.length };
}

async function waitForSourceReady({
  notebookId,
  sourceId,
  atToken,
  timeoutMs = 120000,
  initialIntervalMs = 1000,
  maxIntervalMs = 10000,
}) {
  const start = Date.now();
  let intervalMs = initialIntervalMs;

  while (Date.now() - start < timeoutMs) {
    const notebook = await getNotebook({ notebookId, atToken });
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
    title,
    content,
    timeoutMs,
  } = message.body || {};

  try {
    switch (action) {
      case "getContent": {
        const result = await getSourceContent({ sourceId, notebookId, atToken });
        return { success: true, ...result };
      }

      case "addText": {
        const result = await addTextSource({
          title,
          content,
          notebookId,
          atToken,
        });
        return { success: true, ...result };
      }

      case "getNotebook": {
        const notebook = await getNotebook({ notebookId, atToken });
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