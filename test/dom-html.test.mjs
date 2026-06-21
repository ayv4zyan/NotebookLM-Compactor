#!/usr/bin/env node
/**
 * Tests for lib/dom-html.js (lightweight DOM mocks — no browser/jsdom).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

class MockNode {
  constructor(label, doc) {
    this.label = label;
    this._doc = doc;
  }
}

let parsedHtml = null;

class MockDOMParser {
  parseFromString(html) {
    parsedHtml = html;
    let attached = true;
    const doc = {
      body: {
        get firstChild() {
          return attached ? node : null;
        },
      },
    };
    const node = new MockNode(html, doc);
    Object.defineProperty(doc, "_detach", {
      value: () => {
        attached = false;
      },
    });
    return doc;
  }
}

const mockDocument = {
  createDocumentFragment() {
    const frag = { nodes: [] };
    frag.appendChild = (node) => {
      if (node._doc) {
        node._doc._detach();
      }
      frag.nodes.push(node);
      return node;
    };
    return frag;
  },
};

function makeElement() {
  const state = { children: [], cleared: false };
  return {
    replaceChildren(...nodes) {
      state.children = [...nodes];
      state.cleared = nodes.length === 0;
    },
    get children() {
      return state.children;
    },
    get cleared() {
      return state.cleared;
    },
  };
}

const context = {
  window: {},
  globalThis: {},
  document: mockDocument,
  DOMParser: MockDOMParser,
};
context.window = context;
context.globalThis = context;

vm.runInNewContext(fs.readFileSync(new URL("../lib/dom-html.js", import.meta.url), "utf8"), context);

const { replaceHtml } = context.NBLC.domHtml;

replaceHtml(null, "<p>x</p>");

const el = makeElement();
replaceHtml(el, "");
assert.equal(el.cleared, true);
assert.equal(el.children.length, 0);

replaceHtml(el, undefined);
assert.equal(el.cleared, true);

parsedHtml = null;
replaceHtml(el, "<span>hi</span>");
assert.equal(parsedHtml, "<span>hi</span>");
assert.equal(el.children.length, 1);
assert.equal(el.children[0].nodes.length, 1);
assert.equal(el.children[0].nodes[0].label, "<span>hi</span>");

console.log("dom-html.test.mjs: OK");