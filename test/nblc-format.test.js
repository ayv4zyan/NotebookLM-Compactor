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

testRoundtrip();
testCompactedTitle();
testSourceCountMismatch();
testStripDuplicateHeading();

console.log("nblc-format tests passed");