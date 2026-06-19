const RPC_GET_CONTENT = "hizoJc";

// Google frontend build label — may need updating if API calls start failing.
const BL_VERSION = "boq_labs-tailwind-frontend_20260108.06_p0";

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

function buildGetContentBody(sourceId, atToken) {
  const inner = JSON.stringify([[sourceId], [2], [2]]);
  const fReq = JSON.stringify([[[RPC_GET_CONTENT, inner, null, "generic"]]]);
  return `f.req=${encodeURIComponent(fReq)}&at=${encodeURIComponent(atToken)}&`;
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
  const url = buildBatchExecuteUrl(notebookId, RPC_GET_CONTENT);
  const body = buildGetContentBody(sourceId, atToken);

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

  return extractSourceContent(innerData);
}

export async function handleSourceApiMessage(message) {
  const { action, sourceId, notebookId, atToken } = message.body || {};

  if (action !== "getContent") {
    return { success: false, error: `Unknown action: ${action}` };
  }

  try {
    const { title, content, url } = await getSourceContent({
      sourceId,
      notebookId,
      atToken,
    });
    return { success: true, title, content, url };
  } catch (error) {
    console.error("[source-api] Failed to fetch source:", sourceId, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}