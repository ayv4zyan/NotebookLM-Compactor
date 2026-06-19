import assert from "assert";
import {
  buildAddTextParams,
  buildAddUrlParams,
  buildAddYoutubeParams,
  isYoutubeUrl,
  extractSourceUrlFromMetadata,
  extractSourceTypeFromMetadata,
  DEFAULT_BL_VERSION,
} from "../background/source-api.js";

const NOTEBOOK_ID = "nb-test-123";
const TEMPLATE_BLOCK = [
  2,
  null,
  null,
  [1, null, null, null, null, null, null, null, null, null, [1]],
];

function testAddTextParams() {
  const params = buildAddTextParams("My Title", "Body text", NOTEBOOK_ID);
  assert.deepStrictEqual(params[0], [
    [null, ["My Title", "Body text"], null, 2, null, null, null, null, null, null, 1],
  ]);
  assert.strictEqual(params[1], NOTEBOOK_ID);
  assert.deepStrictEqual(params[2], TEMPLATE_BLOCK);
}

function testAddUrlParams() {
  const params = buildAddUrlParams("https://example.com/article", NOTEBOOK_ID);
  assert.deepStrictEqual(params[0], [
    [null, null, ["https://example.com/article"], null, null, null, null, null, null, null, 1],
  ]);
  assert.strictEqual(params[1], NOTEBOOK_ID);
  assert.deepStrictEqual(params[2], TEMPLATE_BLOCK);
}

function testAddYoutubeParams() {
  const params = buildAddYoutubeParams(
    "https://www.youtube.com/watch?v=abc123",
    NOTEBOOK_ID
  );
  assert.deepStrictEqual(params[0], [
    [
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      ["https://www.youtube.com/watch?v=abc123"],
      null,
      null,
      1,
    ],
  ]);
  assert.strictEqual(params[1], NOTEBOOK_ID);
  assert.deepStrictEqual(params[2], TEMPLATE_BLOCK);
}

function testYoutubeDetection() {
  assert.strictEqual(
    isYoutubeUrl("https://www.youtube.com/watch?v=abc"),
    true
  );
  assert.strictEqual(isYoutubeUrl("https://youtu.be/abc"), true);
  assert.strictEqual(isYoutubeUrl("https://example.com"), false);
  assert.strictEqual(isYoutubeUrl(""), false);
}

function testDefaultBlVersion() {
  assert.match(DEFAULT_BL_VERSION, /^boq_labs-tailwind-frontend_/);
}

function testExtractYoutubeUrlFromMetadata() {
  const metadata = Array(8).fill(null);
  metadata[5] = ["https://www.youtube.com/watch?v=abc123"];
  metadata[4] = 9;

  assert.strictEqual(
    extractSourceUrlFromMetadata(metadata),
    "https://www.youtube.com/watch?v=abc123"
  );
  assert.strictEqual(extractSourceTypeFromMetadata(metadata), "youtube");
}

function testExtractCanonicalUrlFromMetadata() {
  const metadata = Array(8).fill(null);
  metadata[7] = ["https://example.com/article"];
  metadata[4] = 5;

  assert.strictEqual(
    extractSourceUrlFromMetadata(metadata),
    "https://example.com/article"
  );
  assert.strictEqual(extractSourceTypeFromMetadata(metadata), "web");
}

const tests = [
  testAddTextParams,
  testAddUrlParams,
  testAddYoutubeParams,
  testYoutubeDetection,
  testDefaultBlVersion,
  testExtractYoutubeUrlFromMetadata,
  testExtractCanonicalUrlFromMetadata,
];

for (const test of tests) {
  test();
}

console.log(`All ${tests.length} source-api tests passed.`);