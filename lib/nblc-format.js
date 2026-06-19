/**
 * NBLC format — pure merge/parse functions (no Chrome dependencies).
 * Spec: docs/NBLC-FORMAT.md
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.NBLC = root.NBLC || {};
    root.NBLC.format = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const NBLC_VERSION = 1;
  const COMPACTOR_ID = "NotebookLM-Compactor/1.2.0";

  const MARKERS = {
    BUNDLE_START: "---NBLC-BUNDLE---",
    BUNDLE_END: "---END-BUNDLE---",
    SOURCE_START: "---NBLC-SOURCE---",
    META_END: "---END-META---",
  };

  const SOURCE_BLOCK_RE = /^---?\s*NBLC-SOURCE\s*---?\s*$/im;
  const META_END_RE = /---?\s*END-META\s*---?/i;
  const INDEXED_HEADING_RE = /^#{0,3}\s*\[(\d+)\]\s+(.+)$/gm;

  function buildCompactedTitle(sourceCount, date = new Date()) {
    const day = date.toISOString().split("T")[0];
    return `📦 NBLC · ${sourceCount} sources · ${day}`;
  }

  function buildBundleHeader({ source_count, notebook, created, compactor }) {
    const createdISO = created || new Date().toISOString();
    const lines = [
      MARKERS.BUNDLE_START,
      `version: ${NBLC_VERSION}`,
      `created: ${createdISO}`,
      `source_count: ${source_count}`,
    ];

    if (notebook) lines.push(`notebook: ${notebook}`);
    lines.push(`compactor: ${compactor || COMPACTOR_ID}`);
    lines.push(MARKERS.BUNDLE_END);
    lines.push("");
    lines.push("# NotebookLM Compactor Bundle");
    lines.push("");
    lines.push(
      `> ${source_count} sources compacted. Restore with NotebookLM-Compactor extension (Decompact).`
    );
    lines.push(
      "> Do not edit ---NBLC-SOURCE--- or ---NBLC-BUNDLE--- markers manually."
    );

    return lines.join("\n");
  }

  function buildSourceBlock({ index, original_id, title, type, url, content }) {
    const meta = [
      MARKERS.SOURCE_START,
      `index: ${index}`,
      `title: ${title}`,
      `type: ${type || "unknown"}`,
    ];

    if (original_id) meta.push(`original_id: ${original_id}`);
    if (url) meta.push(`url: ${url}`);

    meta.push(MARKERS.META_END);
    meta.push("");
    meta.push(`# [${index}] ${title}`);
    meta.push("");

    const body = typeof content === "string" ? content.trim() : "";
    if (body) meta.push(body);

    return meta.join("\n");
  }

  function compactSources(sources, options = {}) {
    if (!Array.isArray(sources) || sources.length === 0) {
      throw new Error("compactSources requires at least one source");
    }

    const { notebookId, created, compactor } = options;
    const header = buildBundleHeader({
      source_count: sources.length,
      notebook: notebookId,
      created,
      compactor,
    });

    const blocks = sources.map((src, i) =>
      buildSourceBlock({
        index: i + 1,
        original_id: src.id,
        title: src.title || "Untitled",
        type: src.type || "unknown",
        url: src.url ?? null,
        content: src.content ?? "",
      })
    );

    return `${header}\n\n${blocks.join("\n\n")}`;
  }

  const META_KEYS = [
    "version",
    "created",
    "source_count",
    "notebook",
    "compactor",
    "index",
    "original_id",
    "title",
    "type",
    "url",
  ];

  function normalizeMetaText(text) {
    const keyAlt = META_KEYS.join("|");
    const re = new RegExp(`\\s+(${keyAlt}):`, "g");
    return text.replace(re, "\n$1:");
  }

  function parseMetaLines(text) {
    const meta = {};
    const lines = normalizeMetaText(text).split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const colon = trimmed.indexOf(":");
      if (colon === -1) continue;

      const key = trimmed.slice(0, colon).trim();
      const value = trimmed.slice(colon + 1).trim();
      if (key) meta[key] = value;
    }

    return meta;
  }

  function stripDuplicateHeading(content, index, title) {
    const lines = content.split("\n");
    if (lines.length === 0) return content;

    const first = lines[0].trim();
    const expected = `# [${index}] ${title}`;
    if (first === expected) {
      let start = 1;
      while (start < lines.length && lines[start].trim() === "") start++;
      return lines.slice(start).join("\n");
    }

    return content;
  }

  function parseSourceMeta(metaText) {
    const meta = parseMetaLines(metaText);

    const index = Number(meta.index);
    if (!Number.isFinite(index) || index < 1) {
      throw new Error(`Invalid source index: ${meta.index}`);
    }

    const title = meta.title;
    if (!title) {
      throw new Error(`Source ${index} missing title`);
    }

    return {
      index,
      title,
      type: meta.type || "unknown",
      url: meta.url || null,
      original_id: meta.original_id || null,
    };
  }

  function sourceFromParts(meta, content) {
    let body = typeof content === "string" ? content.trim() : "";
    body = stripDuplicateHeading(body, meta.index, meta.title);

    return {
      index: meta.index,
      title: meta.title,
      type: meta.type,
      url: meta.url,
      original_id: meta.original_id,
      content: body,
    };
  }

  function parseSourcesWithMarkers(sourceSection) {
    if (!SOURCE_BLOCK_RE.test(sourceSection)) {
      return null;
    }

    const rawBlocks = sourceSection
      .split(SOURCE_BLOCK_RE)
      .filter((b) => b.trim());

    const sources = [];

    for (const block of rawBlocks) {
      const metaEndMatch = block.match(META_END_RE);
      if (!metaEndMatch || metaEndMatch.index === undefined) {
        continue;
      }

      const metaText = block.slice(0, metaEndMatch.index);
      if (!/\bindex\s*:/i.test(metaText)) {
        continue;
      }

      const meta = parseSourceMeta(metaText);
      const content = block.slice(metaEndMatch.index + metaEndMatch[0].length);
      sources.push(sourceFromParts(meta, content));
    }

    return sources.length > 0 ? sources : null;
  }

  function parseSourcesWithMetaEnd(sourceSection) {
    const markers = [...sourceSection.matchAll(/---?\s*END-META\s*---?/gi)];
    if (markers.length === 0) {
      return null;
    }

    const sources = [];

    for (const marker of markers) {
      const before = sourceSection.slice(0, marker.index);
      const metaStart = before.lastIndexOf("index:");
      if (metaStart === -1) continue;

      let meta;
      try {
        meta = parseSourceMeta(before.slice(metaStart));
      } catch {
        continue;
      }

      let content = sourceSection.slice(marker.index + marker[0].length);
      const nextBlock = content.search(/\n\s*index:\s*\d+/i);
      if (nextBlock !== -1) {
        content = content.slice(0, nextBlock);
      }

      sources.push(sourceFromParts(meta, content));
    }

    return sources.length > 0 ? sources : null;
  }

  function findMetaBeforeIndex(text, endIndex, index) {
    const slice = text.slice(0, endIndex);
    const re = new RegExp(
      `index:\\s*${index}(?:\\s|$|\\n)[\\s\\S]{0,400}`,
      "gi"
    );
    let last = null;
    for (const match of slice.matchAll(re)) {
      last = match;
    }
    if (!last) return null;

    try {
      return parseSourceMeta(last[0]);
    } catch {
      return null;
    }
  }

  function parseSourcesWithHeadings(sourceSection, expectedCount) {
    const matches = [...sourceSection.matchAll(INDEXED_HEADING_RE)];
    if (matches.length === 0) {
      return null;
    }
    if (expectedCount !== null && matches.length !== expectedCount) {
      return null;
    }

    return matches.map((match, i) => {
      const index = Number(match[1]);
      const headingTitle = match[2].trim();
      const contentStart = match.index + match[0].length;
      const contentEnd =
        i + 1 < matches.length ? matches[i + 1].index : sourceSection.length;
      const content = sourceSection.slice(contentStart, contentEnd);

      const meta =
        findMetaBeforeIndex(sourceSection, match.index, index) || {
          index,
          title: headingTitle,
          type: "unknown",
          url: null,
          original_id: null,
        };

      if (!meta.title) meta.title = headingTitle;

      return sourceFromParts(meta, content);
    });
  }

  function parseSourcesFromSection(sourceSection, bundle) {
    const expectedCount = bundle.source_count;
    const strategies = [
      () => parseSourcesWithMarkers(sourceSection),
      () => parseSourcesWithMetaEnd(sourceSection),
      () => parseSourcesWithHeadings(sourceSection, expectedCount),
      () => parseSourcesWithHeadings(sourceSection, null),
    ];

    let bestPartial = null;

    for (const strategy of strategies) {
      const sources = strategy();
      if (!sources || sources.length === 0) continue;

      if (sources.length === expectedCount) {
        sources.sort((a, b) => a.index - b.index);
        return sources;
      }

      if (!bestPartial || sources.length > bestPartial.length) {
        bestPartial = sources;
      }
    }

    if (bestPartial) {
      throw new Error(
        `source_count mismatch: header says ${expectedCount}, found ${bestPartial.length} blocks`
      );
    }

    throw new Error("No ---NBLC-SOURCE--- blocks found");
  }

  function parseBundleHeader(markdown) {
    const start = markdown.indexOf(MARKERS.BUNDLE_START);
    if (start === -1) {
      throw new Error("Missing ---NBLC-BUNDLE--- marker");
    }

    const end = markdown.indexOf(MARKERS.BUNDLE_END, start);
    if (end === -1) {
      throw new Error("Missing ---END-BUNDLE--- marker");
    }

    const headerText = markdown.slice(
      start + MARKERS.BUNDLE_START.length,
      end
    );
    const bundle = parseMetaLines(headerText);

    const version = Number(bundle.version);
    if (!Number.isFinite(version) || version < 1) {
      throw new Error(`Unsupported or missing NBLC version: ${bundle.version}`);
    }

    bundle.version = version;
    bundle.source_count = Number(bundle.source_count);

    if (!Number.isFinite(bundle.source_count) || bundle.source_count < 1) {
      throw new Error(`Invalid source_count: ${bundle.source_count}`);
    }

    return bundle;
  }

  function parseNblc(markdown) {
    if (typeof markdown !== "string" || markdown.trim().length === 0) {
      throw new Error("NBLC content must be a non-empty string");
    }

    const bundle = parseBundleHeader(markdown);

    const bundleEnd = markdown.indexOf(MARKERS.BUNDLE_END);
    if (bundleEnd === -1) {
      throw new Error("Missing ---END-BUNDLE--- marker");
    }

    const sourceSection = markdown.slice(bundleEnd + MARKERS.BUNDLE_END.length);
    const sources = parseSourcesFromSection(sourceSection, bundle);

    return { bundle, sources };
  }

  function validateNblc(markdown) {
    const errors = [];
    const warnings = [];

    try {
      const { bundle, sources } = parseNblc(markdown);

      for (const src of sources) {
        if (!src.content || src.content.trim().length === 0) {
          warnings.push(`Source [${src.index}] "${src.title}" has empty content`);
        }
      }

      return {
        valid: true,
        bundle,
        sources,
        errors,
        warnings,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return { valid: false, bundle: null, sources: [], errors, warnings };
    }
  }

  function isNblcTitle(title) {
    if (typeof title !== "string") return false;
    return /^📦\s*NBLC\s*·/u.test(title.trim());
  }

  return {
    NBLC_VERSION,
    COMPACTOR_ID,
    MARKERS,
    buildCompactedTitle,
    buildBundleHeader,
    buildSourceBlock,
    compactSources,
    parseNblc,
    validateNblc,
    isNblcTitle,
  };
});