(function () {
  const SELECTORS = {
    SOURCE_ITEM: ".single-source-container",
    SOURCE_TITLE: ".source-title",
    SOURCE_ICON: ".source-item-source-icon",
    SOURCE_MORE_BUTTON: '[id^="source-item-more-button-"]',
    SOURCE_CHECKBOX: '.select-checkbox input[type="checkbox"]',
  };

  const ICON_TYPE_MAP = {
    picture_as_pdf: "pdf",
    description: "gdoc",
    article: "gdoc",
    web: "web",
    language: "web",
    text_snippet: "text",
    notes: "text",
    video_youtube: "youtube",
    markdown: "markdown",
  };

  function iconToType(icon) {
    return ICON_TYPE_MAP[icon.toLowerCase().trim()] || "unknown";
  }

  function extractNotebookId() {
    const match = window.location.pathname.match(/\/notebook\/([a-f0-9-]+)/);
    return match ? match[1] : null;
  }

  function extractATToken() {
    try {
      if (window.WIZ_global_data?.SNlM0e) {
        return window.WIZ_global_data.SNlM0e;
      }

      for (const script of document.querySelectorAll("script")) {
        const text = script.textContent || "";
        const snl = text.match(/"SNlM0e":"([^"]+)"/);
        if (snl) return snl[1];

        const afo = text.match(/\bAFoagUe\b['"]\s*:\s*['"]([\w-]+)['"]/);
        if (afo) return afo[1];
      }

      const dataAt = document.querySelector("[data-at]");
      if (dataAt) return dataAt.getAttribute("data-at");

      console.warn("[notebooklm-api] Could not extract AT token");
      return null;
    } catch (error) {
      console.error("[notebooklm-api] AT token extraction failed:", error);
      return null;
    }
  }

  function extractUrlFromContent(content) {
    if (typeof content !== "string") return null;
    const match = content.match(/^Source:\s+\[([^\]]+)\]\(([^)]+)\)/m);
    return match ? match[2] : null;
  }

  function extractSourcesFromDOM() {
    const sources = [];

    document.querySelectorAll(SELECTORS.SOURCE_ITEM).forEach((container) => {
      const moreBtn = container.querySelector(SELECTORS.SOURCE_MORE_BUTTON);
      if (!moreBtn) return;

      const id = moreBtn.id.replace("source-item-more-button-", "");
      if (!id) return;

      const titleEl = container.querySelector(SELECTORS.SOURCE_TITLE);
      const title = titleEl?.textContent?.trim() || "Unknown";

      const iconEl = container.querySelector(SELECTORS.SOURCE_ICON);
      const icon = iconEl?.textContent?.trim() || "";

      sources.push({
        id,
        title,
        type: iconToType(icon),
        icon,
        isNblc: window.NBLC?.format?.isNblcTitle(title) ?? false,
      });
    });

    return sources;
  }

  function getSelectedSourceIds() {
    const ids = [];

    document.querySelectorAll(SELECTORS.SOURCE_ITEM).forEach((container) => {
      const checkbox = container.querySelector(SELECTORS.SOURCE_CHECKBOX);
      if (!checkbox?.checked) return;

      const moreBtn = container.querySelector(SELECTORS.SOURCE_MORE_BUTTON);
      if (!moreBtn) return;

      const id = moreBtn.id.replace("source-item-more-button-", "");
      if (id) ids.push(id);
    });

    return ids;
  }

  function isNblcSource(title) {
    return window.NBLC?.format?.isNblcTitle(title) ?? false;
  }

  window.NBLC = window.NBLC || {};
  window.NBLC.api = {
    SELECTORS,
    extractNotebookId,
    extractATToken,
    extractUrlFromContent,
    extractSourcesFromDOM,
    getSelectedSourceIds,
    isNblcSource,
  };
})();