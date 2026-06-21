(function () {
  const { consent, modalA11y, domHtml } = window.NBLC;
  const { replaceHtml } = domHtml;
  const { isCheckboxActionElement, setModalVisible } = modalA11y;

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

  function renderBody() {
    return `
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
        <button type="button" class="nblc-secondary-btn" data-action="decline">Not now</button>
        <button type="button" class="nblc-primary-btn" data-action="accept" ${canAccept() ? "" : "disabled"}>
          I agree — continue
        </button>
      </div>
    `;
  }

  function render() {
    if (!overlay) return;

    const bodyEl = overlay.querySelector(".nblc-modal-body");
    if (!bodyEl) return;

    replaceHtml(bodyEl, renderBody());
    a11y?.afterRender();
  }

  function finish(accepted) {
    setModalVisible(overlay, false);
    a11y?.onClose({ restoreFocus: false });
    const resolve = resolvePending;
    resolvePending = null;
    if (resolve) resolve(accepted);
  }

  function hide() {
    setModalVisible(overlay, false);
    a11y?.onClose({ restoreFocus: false });
  }

  function ensureOverlay() {
    if (overlay) return;

    overlay = document.createElement("div");
    overlay.id = "nblc-consent-modal-root";
    overlay.hidden = true;
    overlay.dataset.nblcOpen = "false";
    overlay.innerHTML = `
      <div class="nblc-overlay">
        <div class="nblc-modal nblc-consent-modal" role="dialog" aria-label="Terms of Use">
          <div class="nblc-modal-header">
            <div class="nblc-modal-title-row">
              <span class="nblc-modal-icon">📋</span>
              <h3>Before you continue</h3>
            </div>
          </div>
          <div class="nblc-modal-body"></div>
        </div>
      </div>
    `;
    overlay.addEventListener("click", handleClick, true);
    overlay.addEventListener("change", handleChange);
    document.body.appendChild(overlay);
    setModalVisible(overlay, false);

    a11y = modalA11y.attachModalA11y(overlay, () => ({
      isBusy: () => false,
      onClose: () => finish(false),
    }));
  }

  function open() {
    window.NBLC.compactModal?.hide?.();
    window.NBLC.decompactModal?.hide?.();

    ackTerms = false;
    ackUnofficial = false;

    ensureOverlay();
    render();
    setModalVisible(overlay, true);
    a11y.onOpen();
  }

  async function ensureAccepted() {
    if (await consent.hasAcceptedCurrentTerms()) {
      hide();
      return true;
    }

    return new Promise((resolve) => {
      resolvePending = resolve;
      open();
    });
  }

  function resolveActionTarget(event) {
    const direct = event.target.closest("[data-action]");
    if (direct) return direct;

    const label = event.target.closest("label");
    if (label) {
      return label.querySelector("[data-action]");
    }

    return null;
  }

  function handleChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") return;

    const action = target.dataset.action;
    if (!action) return;

    switch (action) {
      case "toggle-ack-terms":
        ackTerms = target.checked;
        render();
        break;
      case "toggle-ack-unofficial":
        ackUnofficial = target.checked;
        render();
        break;
    }
  }

  function handleClick(event) {
    event.stopPropagation();

    const link = event.target.closest("a[href]");
    if (link) {
      return;
    }

    const target = resolveActionTarget(event);
    if (!target) return;

    const action = target.dataset.action;
    if (target.disabled) return;

    if (isCheckboxActionElement(target)) return;

    event.preventDefault();

    switch (action) {
      case "decline":
        finish(false);
        break;
      case "accept":
        if (!canAccept()) return;
        consent.acceptCurrentTerms().then(() => finish(true));
        break;
    }
  }

  window.NBLC.consentModal = { ensureAccepted, hide };
})();