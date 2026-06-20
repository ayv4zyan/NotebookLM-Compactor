import assert from "assert";
import {
  extractAccountLimits,
  extractSourceId,
  extractIdFromEntry,
  extractSourceStatus,
  findSourceInNotebook,
} from "../background/rpc-parse.js";

function testMediumNestedAddResponse() {
  const data = [[[["new-source-abc"], "📦 NBLC · 2 sources · 2026-06-19"]]];
  assert.strictEqual(extractSourceId(data), "new-source-abc");
}

function testDeeplyNestedAddResponse() {
  const data = [[[[["deep-source-xyz"], "Title"]]]];
  assert.strictEqual(extractSourceId(data), "deep-source-xyz");
}

function testFlatAddResponse() {
  const data = [["flat-source-123"], "Title"];
  assert.strictEqual(extractSourceId(data), "flat-source-123");
}

function testFindSourceInNotebook() {
  const notebook = [
    [
      "notebook-meta",
      [
        [["src-1"], "First", null, [null, 2]],
        [["src-2"], "Second", null, [null, 1]],
      ],
    ],
  ];

  const ready = findSourceInNotebook(notebook, "src-1");
  assert.strictEqual(ready.id, "src-1");
  assert.strictEqual(ready.status, 2);
  assert.strictEqual(ready.title, "First");

  const processing = findSourceInNotebook(notebook, "src-2");
  assert.strictEqual(processing.status, 1);
  assert.strictEqual(findSourceInNotebook(notebook, "missing"), null);
}

function testEntryHelpers() {
  const entry = [["drive-id"], "Drive Source", [], [null, 3]];
  assert.strictEqual(extractIdFromEntry(entry), "drive-id");
  assert.strictEqual(extractSourceStatus(entry), 3);
}

function testExtractAccountLimits() {
  const settings = [[null, [null, 100, 300]]];
  const limits = extractAccountLimits(settings);
  assert.strictEqual(limits.notebookLimit, 100);
  assert.strictEqual(limits.sourceLimit, 300);

  assert.deepStrictEqual(extractAccountLimits(null), {
    notebookLimit: null,
    sourceLimit: null,
  });
  assert.deepStrictEqual(extractAccountLimits([[]]), {
    notebookLimit: null,
    sourceLimit: null,
  });
}

const tests = [
  testMediumNestedAddResponse,
  testDeeplyNestedAddResponse,
  testFlatAddResponse,
  testFindSourceInNotebook,
  testEntryHelpers,
  testExtractAccountLimits,
];

for (const test of tests) {
  test();
}

console.log(`All ${tests.length} rpc-parse tests passed.`);