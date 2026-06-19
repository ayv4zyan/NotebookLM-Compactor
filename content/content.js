(function () {
  const { inject, compactModal, decompactModal, consentModal, store, recoveryBanner } =
    window.NBLC;

  let observer = null;

  function init() {
    if (observer) observer.disconnect();
    observer = inject.initSourcePanelObserver();

    store
      .migrateFatPendingEntries()
      .then(() => store.sweepStale())
      .then(() => recoveryBanner?.refresh())
      .catch((error) => {
        console.error("[NBLC] Storage maintenance failed:", error);
      });

    recoveryBanner?.initRecoveryBanner();

    window.addEventListener("nblc-compact", async (event) => {
      const accepted = await consentModal.ensureAccepted();
      if (!accepted) return;

      const sourceIds = event.detail?.sourceIds || null;
      compactModal.open(sourceIds);
    });

    window.addEventListener("nblc-decompact", async (event) => {
      const accepted = await consentModal.ensureAccepted();
      if (!accepted) return;

      decompactModal.open({
        sourceId: event.detail?.sourceId || null,
        title: event.detail?.title || "",
        emptyReason: event.detail?.emptyReason || null,
      });
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