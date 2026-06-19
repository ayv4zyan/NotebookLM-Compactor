(function () {
  const { consent, modalA11y } = window.NBLC;

  let overlay = null;
  let a11y = null;
  let resolvePending = null;
  let ackTerms = false;
  let ackUnofficial = false;

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function canAccept() {
    return ackTerms && ackUnofficial;
  }

  function render() {
    if (!overlay) return;

    overlay.innerHTML = `
      <div class="nblc-overlay" data-action="decline-overlay">
        <div class="nblc-modal nblc-consent-modal" role="dialog" aria-label="Terms of Use">
          <div class="nblc-modal-header">
            <div class="nblc-modal-title-row">
              <span class="nblc-modal-icon">📋</span>
              <h3>Before you continue</h3>
            </div>
          </div>
          <div class="nblc-modal-body">
            <p class="nblc-consent-lead">
              NotebookLM Compactor is an independent tool. It is not made by or affiliated with Google.
            </p>

            <ul class="nblc-consent-list">
              <li>Actions run only when <strong>you</strong> click Compact or Decompact.</li>
              <li>Data is sent only to <code>notebooklm.google.com</code> using your existing login.</li>
              <li>Compact and Decompact can permanently change or delete sources in your notebook.</li>
            </ul>

            <label class="nblc-option-row nblc-consent-check">
              <input type="checkbox" data-action="toggle-ack-terms" ${ackTerms ? "checked" : ""} />
              <span>
                I agree to the
                <a href="${escapeHtml(consent.TERMS_URL)}" target="_blank" rel="noopener noreferrer">Terms of Use</a>
                and
                <a href="${escapeHtml(consent.PRIVACY_URL)}" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
              </span>
            </label>

            <label class="nblc-option-row nblc-consent-check">
              <input type="checkbox" data-action="toggle-ack-unofficial" ${ackUnofficial ? "checked" : ""} />
              <span>
                I understand this uses an unofficial NotebookLM interface, that I must follow
                <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer">Google's Terms of Service</a>,
                and that features may stop working without notice.
              </span>
            </label>

            <div class="nblc-action-row nblc-consent-actions">
              <button class="nblc-secondary-btn" data-action="decline">Not now</button>
              <button class="nblc-primary-btn" data-action="accept" ${canAccept() ? "" : "disabled"}>
                I agree — continue
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    a11y?.afterRender();
  }

  function finish(accepted) {
    a11y?.onClose();
    if (overlay) overlay.style.display = "none";
    const resolve = resolvePending;
    resolvePending = null;
    if (resolve) resolve(accepted);
  }

  function open() {
    ackTerms = false;
    ackUnofficial = false;

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "nblc-consent-modal-root";
      overlay.addEventListener("click", handleClick);
      document.body.appendChild(overlay);

      a11y = modalA11y.attachModalA11y(overlay, () => ({
        isBusy: () => false,
        onClose: () => finish(false),
      }));
    }

    render();
    overlay.style.display = "block";
    a11y.onOpen();
  }

  async function ensureAccepted() {
    if (await consent.hasAcceptedCurrentTerms()) {
      return true;
    }

    return new Promise((resolve) => {
      resolvePending = resolve;
      open();
    });
  }

  function handleClick(event) {
    const link = event.target.closest("a[href]");
    if (link) {
      event.stopPropagation();
      return;
    }

    const target = event.target.closest("[data-action]");
    if (!target) return;

    const action = target.dataset.action;

    if (action === "decline-overlay" && event.target.classList.contains("nblc-overlay")) {
      finish(false);
      return;
    }

    event.stopPropagation();

    switch (action) {
      case "toggle-ack-terms":
        ackTerms = target.checked;
        render();
        break;
      case "toggle-ack-unofficial":
        ackUnofficial = target.checked;
        render();
        break;
      case "decline":
        finish(false);
        break;
      case "accept":
        if (!canAccept()) return;
        consent.acceptCurrentTerms().then(() => finish(true));
        break;
    }
  }

  window.NBLC.consentModal = { ensureAccepted };
})();