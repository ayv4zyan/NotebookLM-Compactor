(function () {
  const FOCUSABLE_SELECTOR =
    'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function isVisible(element) {
    return element.getClientRects().length > 0;
  }

  function getFocusableElements(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
      isVisible
    );
  }

  function focusFirst(container) {
    const elements = getFocusableElements(container);
    if (elements.length === 0) return false;
    elements[0].focus();
    return true;
  }

  function isCheckboxActionElement(element) {
    return (
      element instanceof HTMLInputElement &&
      element.type === "checkbox" &&
      Boolean(element.dataset.action)
    );
  }

  function setModalVisible(overlay, visible) {
    if (!overlay) return;
    overlay.hidden = !visible;
    overlay.dataset.nblcOpen = visible ? "true" : "false";
    overlay.style.display = visible ? "block" : "none";
    overlay.style.pointerEvents = visible ? "auto" : "none";
  }

  function attachModalA11y(overlay, getHandlers) {
    let returnFocusEl = null;
    let isActive = false;
    let shouldFocusOnRender = false;
    let keydownHandler = null;

    function handleKeydown(event) {
      if (!isActive || overlay.style.display === "none") return;

      const dialog = overlay.querySelector(".nblc-modal");
      if (!dialog) return;

      const { isBusy, onClose } = getHandlers();

      if (event.key === "Escape") {
        if (!isBusy()) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function syncDialog() {
      const dialog = overlay.querySelector(".nblc-modal");
      const body = overlay.querySelector(".nblc-modal-body");
      const { isBusy } = getHandlers();

      if (dialog) {
        dialog.setAttribute("aria-modal", "true");
      }

      if (body) {
        body.setAttribute("aria-busy", isBusy() ? "true" : "false");
      }
    }

    function focusDialog() {
      const dialog = overlay.querySelector(".nblc-modal");
      if (!dialog) return;

      const filter = dialog.querySelector(".nblc-filter-input:not([disabled])");
      if (filter && shouldFocusOnRender) {
        filter.focus();
        if (typeof filter.setSelectionRange === "function") {
          const length = filter.value.length;
          filter.setSelectionRange(length, length);
        }
        shouldFocusOnRender = false;
        return;
      }

      if (shouldFocusOnRender || !dialog.contains(document.activeElement)) {
        focusFirst(dialog);
        shouldFocusOnRender = false;
      }
    }

    return {
      onOpen({ focusOnRender = true } = {}) {
        returnFocusEl = document.activeElement;
        shouldFocusOnRender = focusOnRender;
        isActive = true;
        if (keydownHandler) {
          overlay.removeEventListener("keydown", keydownHandler);
        }
        keydownHandler = handleKeydown;
        overlay.addEventListener("keydown", keydownHandler);
        syncDialog();
        requestAnimationFrame(focusDialog);
      },

      afterRender() {
        if (!isActive) return;
        syncDialog();

        requestAnimationFrame(() => {
          if (shouldFocusOnRender) {
            focusDialog();
            return;
          }

          const dialog = overlay.querySelector(".nblc-modal");
          if (!dialog) return;

          const active = document.activeElement;
          if (!active || active === document.body || !dialog.contains(active)) {
            focusFirst(dialog);
          }
        });
      },

      onClose({ restoreFocus = false } = {}) {
        isActive = false;
        shouldFocusOnRender = false;
        if (keydownHandler) {
          overlay.removeEventListener("keydown", keydownHandler);
        }

        const focusTarget = returnFocusEl;
        returnFocusEl = null;

        if (
          restoreFocus &&
          focusTarget &&
          typeof focusTarget.focus === "function" &&
          focusTarget.isConnected
        ) {
          setTimeout(() => focusTarget.focus(), 0);
        }
      },
    };
  }

  window.NBLC = window.NBLC || {};
  window.NBLC.modalA11y = {
    attachModalA11y,
    getFocusableElements,
    focusFirst,
    isCheckboxActionElement,
    setModalVisible,
  };
})();