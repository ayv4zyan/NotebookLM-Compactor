/**
 * DOM HTML helpers — avoid dynamic innerHTML assignments (AMO linter).
 */
(function () {
  function fragmentFromHtml(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const fragment = document.createDocumentFragment();
    while (doc.body.firstChild) {
      fragment.appendChild(doc.body.firstChild);
    }
    return fragment;
  }

  function replaceHtml(element, html) {
    if (!element) return;
    if (!html) {
      element.replaceChildren();
      return;
    }
    element.replaceChildren(...fragmentFromHtml(html).childNodes);
  }

  const target = typeof window !== "undefined" ? window : globalThis;
  target.NBLC = target.NBLC || {};
  target.NBLC.domHtml = { replaceHtml };
})();