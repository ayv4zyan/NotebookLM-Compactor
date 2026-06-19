(function () {
  const TERMS_VERSION = "2026-06-19";
  const STORAGE_KEY = "nblc_terms_accepted_version";
  const TERMS_URL =
    "https://github.com/ayv4zyan/NotebookLM-Compactor/blob/main/TERMS.md";
  const PRIVACY_URL =
    "https://github.com/ayv4zyan/NotebookLM-Compactor/blob/main/PRIVACY.md";

  async function getAcceptedVersion() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || null;
  }

  async function hasAcceptedCurrentTerms() {
    const accepted = await getAcceptedVersion();
    return accepted === TERMS_VERSION;
  }

  async function acceptCurrentTerms() {
    await chrome.storage.local.set({ [STORAGE_KEY]: TERMS_VERSION });
  }

  window.NBLC = window.NBLC || {};
  window.NBLC.consent = {
    TERMS_VERSION,
    TERMS_URL,
    PRIVACY_URL,
    hasAcceptedCurrentTerms,
    acceptCurrentTerms,
  };
})();