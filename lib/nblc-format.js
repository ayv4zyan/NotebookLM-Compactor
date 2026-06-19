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
  const COMPACTOR_ID = "NotebookLM-Compactor/1.1.0";

  const MARKERS = {
    BUNDLE_START: "---NBLC-BUNDLE---",
    BUNDLE_END: "---END-BUNDLE---",
    SOURCE_START: "---NBLC-SOURCE---",
    META_END: "---END-META---",
  };

  const SOURCE_BLOCK_RE = /^---NBLC-SOURCE---$/m;

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

  function parseMetaLines(text) {
    const meta = {};
    const lines = text.split("\n");

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
    if (!SOURCE_BLOCK_RE.test(sourceSection)) {
      throw new Error("No ---NBLC-SOURCE--- blocks found");
    }
    const rawBlocks = sourceSection
      .split(SOURCE_BLOCK_RE)
      .filter((b) => b.trim() && b.includes(MARKERS.META_END));

    const sources = rawBlocks.map((block) => {
      const metaEnd = block.indexOf(MARKERS.META_END);
      if (metaEnd === -1) {
        throw new Error("Source block missing ---END-META---");
      }

      const metaText = block.slice(0, metaEnd);
      const meta = parseMetaLines(metaText);

      const index = Number(meta.index);
      if (!Number.isFinite(index) || index < 1) {
        throw new Error(`Invalid source index: ${meta.index}`);
      }

      const title = meta.title;
      if (!title) {
        throw new Error(`Source ${index} missing title`);
      }

      let content = block.slice(metaEnd + MARKERS.META_END.length).trim();
      content = stripDuplicateHeading(content, index, title);

      return {
        index,
        title,
        type: meta.type || "unknown",
        url: meta.url || null,
        original_id: meta.original_id || null,
        content,
      };
    });

    if (sources.length !== bundle.source_count) {
      throw new Error(
        `source_count mismatch: header says ${bundle.source_count}, found ${sources.length} blocks`
      );
    }

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