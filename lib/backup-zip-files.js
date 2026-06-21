/**
 * Backup zip filename map — pure helpers (no Chrome dependencies).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    const target =
      typeof window !== "undefined"
        ? window
        : typeof globalThis !== "undefined"
          ? globalThis
          : root;
    target.NBLC = target.NBLC || {};
    target.NBLC.backupZipFiles = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function sanitizeFilename(title) {
    return (
      String(title)
        .replace(/[<>:"/\\|?*]/g, "_")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .substring(0, 100) || "untitled"
    );
  }

  function uniqueBaseName(baseName, usedNames) {
    let name = baseName;
    let counter = 1;
    while (usedNames.has(name)) {
      name = `${baseName}_${counter}`;
      counter++;
    }
    usedNames.add(name);
    return name;
  }

  function buildBackupZipFileMap(sources, compactedTitle, compactedContent) {
    const files = {};
    const usedNames = new Set();
    const list = Array.isArray(sources) ? sources : [];

    for (const src of list) {
      if (!src || typeof src !== "object") continue;
      const title = src.title == null ? "" : String(src.title);
      const content = src.content == null ? "" : String(src.content);
      const baseName = sanitizeFilename(title);
      const name = uniqueBaseName(baseName, usedNames);
      files[`${name}.md`] = `# ${title}\n\n${content}`;
    }

    const compactBase = sanitizeFilename(compactedTitle);
    const compactName = uniqueBaseName(compactBase, usedNames);
    files[`${compactName}.md`] = compactedContent == null ? "" : String(compactedContent);

    return files;
  }

  return { sanitizeFilename, uniqueBaseName, buildBackupZipFileMap };
});