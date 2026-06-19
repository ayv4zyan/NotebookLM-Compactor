(function () {
  const { inject, compactModal, decompactModal, store } = window.NBLC;

  let observer = null;

  function init() {
    if (observer) observer.disconnect();
    observer = inject.initSourcePanelObserver();

    store.sweepStale().catch((error) => {
      console.error("[NBLC] Stale storage sweep failed:", error);
    });

    window.addEventListener("nblc-compact", (event) => {
      const sourceIds = event.detail?.sourceIds || null;
      compactModal.open(sourceIds);
    });

    window.addEventListener("nblc-decompact", (event) => {
      const sourceId = event.detail?.sourceId;
      const title = event.detail?.title || "";
      if (sourceId) decompactModal.open(sourceId, title);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.addEventListener("beforeunload", () => {
    observer?.disconnect();
    inject.removeInjectionMarker();
  });
})();