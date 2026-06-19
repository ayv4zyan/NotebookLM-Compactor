(function () {
  const { inject, compactModal, decompactModal, consentModal, store } =
    window.NBLC;

  let observer = null;

  function init() {
    if (observer) observer.disconnect();
    observer = inject.initSourcePanelObserver();

    store
      .migrateFatPendingEntries()
      .then(() => store.sweepStale())
      .catch((error) => {
        console.error("[NBLC] Storage maintenance failed:", error);
      });

    window.addEventListener("nblc-compact", async (event) => {
      const accepted = await consentModal.ensureAccepted();
      if (!accepted) return;

      const sourceIds = event.detail?.sourceIds || null;
      compactModal.open(sourceIds);
    });

    window.addEventListener("nblc-decompact", async (event) => {
      const accepted = await consentModal.ensureAccepted();
      if (!accepted) return;

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