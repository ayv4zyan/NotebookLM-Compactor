const assert = require("assert");
const {
  compactSources,
  parseNblc,
  validateNblc,
  buildCompactedTitle,
  isNblcTitle,
} = require("../lib/nblc-format.js");

const SAMPLE_SOURCES = [
  {
    id: "abc-111",
    title: "First Source",
    type: "text",
    content: "Hello from source one.",
  },
  {
    id: "abc-222",
    title: "Second Source: with colon",
    type: "youtube",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    content: "Transcript content here.",
  },
];

function testRoundtrip() {
  const merged = compactSources(SAMPLE_SOURCES, {
    notebookId: "nb-test-123",
    created: "2026-06-19T12:00:00Z",
  });

  const { bundle, sources } = parseNblc(merged);

  assert.strictEqual(bundle.version, 1);
  assert.strictEqual(bundle.source_count, 2);
  assert.strictEqual(bundle.notebook, "nb-test-123");
  assert.strictEqual(sources.length, 2);

  assert.strictEqual(sources[0].index, 1);
  assert.strictEqual(sources[0].title, "First Source");
  assert.strictEqual(sources[0].content, "Hello from source one.");
  assert.strictEqual(sources[0].original_id, "abc-111");

  assert.strictEqual(sources[1].index, 2);
  assert.strictEqual(sources[1].title, "Second Source: with colon");
  assert.strictEqual(sources[1].url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.strictEqual(sources[1].content, "Transcript content here.");

  const validation = validateNblc(merged);
  assert.strictEqual(validation.valid, true);
}

function testCompactedTitle() {
  const title = buildCompactedTitle(33, new Date("2026-06-19T12:00:00Z"));
  assert.strictEqual(title, "📦 NBLC · 33 sources · 2026-06-19");
  assert.strictEqual(isNblcTitle(title), true);
  assert.strictEqual(isNblcTitle("Regular source"), false);
}

function testSourceCountMismatch() {
  const bad = `---NBLC-BUNDLE---
version: 1
created: 2026-06-19T12:00:00Z
source_count: 5
---END-BUNDLE---

---NBLC-SOURCE---
index: 1
title: Only One
type: text
---END-META---

# [1] Only One

content
`;

  assert.throws(() => parseNblc(bad), /source_count mismatch/);
}

function testStripDuplicateHeading() {
  const merged = compactSources([
    { id: "x", title: "T", type: "text", content: "body only" },
  ]);
  const { sources } = parseNblc(merged);
  assert.strictEqual(sources[0].content, "body only");
}

function testCollapsedBundleHeader() {
  const collapsed = `---NBLC-BUNDLE---
version: 1 created: 2026-06-19T07:57:34.565Z source_count: 2 notebook: 874f2606-8396-40dc-b67a-6a07704cd90a compactor: NotebookLM-Compactor/1.2.0
---END-BUNDLE---

# NotebookLM Compactor Bundle

---NBLC-SOURCE---
index: 1 title: First Source type: text
---END-META---

# [1] First Source

Hello one.

---NBLC-SOURCE---
index: 2 title: Second Source type: text
---END-META---

# [2] Second Source

Hello two.
`;

  const { bundle, sources } = parseNblc(collapsed);

  assert.strictEqual(bundle.version, 1);
  assert.strictEqual(bundle.source_count, 2);
  assert.strictEqual(bundle.notebook, "874f2606-8396-40dc-b67a-6a07704cd90a");
  assert.strictEqual(bundle.compactor, "NotebookLM-Compactor/1.2.0");
  assert.strictEqual(sources.length, 2);
  assert.strictEqual(sources[0].title, "First Source");
  assert.strictEqual(sources[1].content, "Hello two.");
}

function testNotebookLmStrippedSourceMarkers() {
  const stripped = `---NBLC-BUNDLE---
version: 1 created: 2026-06-19T07:57:34.565Z source_count: 2 notebook: nb-1 compactor: NotebookLM-Compactor/1.2.0
---END-BUNDLE---

# NotebookLM Compactor Bundle

> 2 sources compacted.

index: 1 title: First Source type: text
---END-META---

# [1] First Source

Hello one.

index: 2 title: Second Source type: youtube url: https://www.youtube.com/watch?v=abc
---END-META---

# [2] Second Source

Hello two.
`;

  const { bundle, sources } = parseNblc(stripped);

  assert.strictEqual(bundle.source_count, 2);
  assert.strictEqual(sources.length, 2);
  assert.strictEqual(sources[0].title, "First Source");
  assert.strictEqual(sources[0].content, "Hello one.");
  assert.strictEqual(sources[1].type, "youtube");
  assert.strictEqual(sources[1].url, "https://www.youtube.com/watch?v=abc");
}

function testNotebookLmHeadingsOnly() {
  const headingsOnly = `---NBLC-BUNDLE---
version: 1
created: 2026-06-19T12:00:00Z
source_count: 2
---END-BUNDLE---

# NotebookLM Compactor Bundle

# [1] First Source

Hello one.

# [2] Second Source

Hello two.
`;

  const { sources } = parseNblc(headingsOnly);

  assert.strictEqual(sources.length, 2);
  assert.strictEqual(sources[0].title, "First Source");
  assert.strictEqual(sources[1].content, "Hello two.");
}

function testPlainTextIndexedHeadings() {
  const plain = `---NBLC-BUNDLE---
version: 1
created: 2026-06-19T12:00:00Z
source_count: 1
---END-BUNDLE---

[1] Plain Heading Source

Body text here.
`;

  const { sources } = parseNblc(plain);
  assert.strictEqual(sources[0].title, "Plain Heading Source");
  assert.strictEqual(sources[0].content, "Body text here.");
}

testRoundtrip();
testCompactedTitle();
testSourceCountMismatch();
testStripDuplicateHeading();
testCollapsedBundleHeader();
testNotebookLmStrippedSourceMarkers();
testNotebookLmHeadingsOnly();
testPlainTextIndexedHeadings();

console.log("nblc-format tests passed");