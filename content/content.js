(function () {
  const { inject, compactModal, decompactModal, consentModal, store, recoveryBanner } =
    window.NBLC;

  let observer = null;
  let compactOpening = false;
  let decompactOpening = false;

  async function openCompact(detail = {}) {
    if (compactOpening) return;
    compactOpening = true;

    try {
      const accepted = await consentModal.ensureAccepted();
      if (!accepted) return;

      if (!compactModal?.open) {
        console.error("[NBLC] Compact modal is unavailable — reload the extension.");
        return;
      }

      compactModal.open(detail.sourceIds || null);
    } catch (error) {
      console.error("[NBLC] Failed to open compact modal:", error);
    } finally {
      compactOpening = false;
    }
  }

  async function openDecompact(detail = {}) {
    if (decompactOpening) return;
    decompactOpening = true;

    try {
      const accepted = await consentModal.ensureAccepted();
      if (!accepted) return;

      decompactModal.open({
        sourceId: detail.sourceId || null,
        title: detail.title || "",
        emptyReason: detail.emptyReason || null,
      });
    } catch (error) {
      console.error("[NBLC] Failed to open decompact modal:", error);
    } finally {
      decompactOpening = false;
    }
  }

  function init() {
    if (observer) observer.disconnect();
    observer = inject.initSourcePanelObserver();

    window.NBLC.openCompact = openCompact;
    window.NBLC.openDecompact = openDecompact;

    store
      .migrateFatPendingEntries()
      .then(() => store.sweepStale())
      .then(() => recoveryBanner?.refresh())
      .catch((error) => {
        console.error("[NBLC] Storage maintenance failed:", error);
      });

    recoveryBanner?.initRecoveryBanner();

    window.addEventListener("nblc-compact", (event) => {
      openCompact(event.detail || {});
    });

    window.addEventListener("nblc-decompact", (event) => {
      openDecompact(event.detail || {});
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