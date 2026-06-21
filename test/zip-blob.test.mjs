#!/usr/bin/env node
/**
 * Minimal checks for lib/zip-blob.js
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createZipBlob, sanitizeUtf16 } = require("../lib/zip-blob.js");

function findEndOfCentralDirectory(bytes) {
  const minEocd = 22;
  const maxComment = 0xffff;
  const start = Math.max(0, bytes.length - minEocd - maxComment);
  for (let i = bytes.length - minEocd; i >= start; i--) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      return i;
    }
  }
  throw new Error("EOCD record not found");
}

function assertCentralFileHeader(view, centralOffset, name) {
  assert.equal(view.getUint32(centralOffset, true), 0x02014b50);
  const gpbf = view.getUint16(centralOffset + 8, true);
  const method = view.getUint16(centralOffset + 10, true);
  assert.equal(method, 0, `expected stored central method for ${name}`);
  if (/[^\x00-\x7f]/.test(name)) {
    assert.equal(gpbf & 0x0800, 0x0800, `expected UTF-8 GPBF in central header for ${name}`);
  } else {
    assert.equal(gpbf & 0x0800, 0, `expected no UTF-8 GPBF in central header for ASCII ${name}`);
  }
}

function assertLocalFileHeader(view, localOffset, name) {
  assert.equal(view.getUint32(localOffset, true), 0x04034b50);
  const gpbf = view.getUint16(localOffset + 6, true);
  const method = view.getUint16(localOffset + 8, true);
  assert.equal(method, 0, `expected stored local method for ${name}`);
  if (/[^\x00-\x7f]/.test(name)) {
    assert.equal(gpbf & 0x0800, 0x0800, `expected UTF-8 GPBF in local header for ${name}`);
  } else {
    assert.equal(gpbf & 0x0800, 0, `expected no UTF-8 GPBF in local header for ASCII ${name}`);
  }
}

function parseZipEntries(bytes) {
  const eocdOffset = findEndOfCentralDirectory(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const entries = new Map();
  let offset = centralOffset;

  for (let i = 0; i < entryCount; i++) {
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    const name = new TextDecoder().decode(nameBytes);

    assertCentralFileHeader(view, offset, name);
    assertLocalFileHeader(view, localOffset, name);

    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const contentBytes = bytes.subarray(dataOffset, dataOffset + compressedSize);
    entries.set(name, new TextDecoder().decode(contentBytes));

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function assertLocalOffsetsMatchPayload(bytes) {
  const eocdOffset = findEndOfCentralDirectory(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  let offset = centralOffset;
  let expectedLocalOffset = 0;

  for (let i = 0; i < entryCount; i++) {
    const localOffset = view.getUint32(offset + 42, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);

    assert.equal(localOffset, expectedLocalOffset, `entry ${i} local offset`);
    assert.equal(view.getUint32(localOffset, true), 0x04034b50);

    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    expectedLocalOffset = dataOffset + compressedSize;

    offset += 46 + nameLength + extraLength + commentLength;
  }
}

const blob = await createZipBlob({
  "alpha.md": "# Alpha\n\none",
  "beta.md": "# Beta\n\ntwo",
});
const bytes = Buffer.from(await blob.arrayBuffer());

assert.equal(bytes[0], 0x50);
assert.equal(bytes[1], 0x4b);

const entries = parseZipEntries(bytes);
assert.equal(entries.size, 2);
assert.equal(entries.get("alpha.md"), "# Alpha\n\none");
assert.equal(entries.get("beta.md"), "# Beta\n\ntwo");

const utf8Blob = await createZipBlob({
  "café.md": "# Café\n\ncontenu",
});
const utf8Bytes = Buffer.from(await utf8Blob.arrayBuffer());
const utf8View = new DataView(utf8Bytes.buffer, utf8Bytes.byteOffset, utf8Bytes.byteLength);
const utf8Eocd = findEndOfCentralDirectory(utf8Bytes);
const utf8CentralOffset = utf8View.getUint32(utf8Eocd + 16, true);
assertLocalFileHeader(utf8View, 0, "café.md");
assertCentralFileHeader(utf8View, utf8CentralOffset, "café.md");
const utf8Entries = parseZipEntries(utf8Bytes);
assert.equal(utf8Entries.get("café.md"), "# Café\n\ncontenu");

const emptyBlob = await createZipBlob({});
assert.equal(Buffer.from(await emptyBlob.arrayBuffer()).length, 22);

await assert.rejects(
  () => createZipBlob(null),
  /expects a plain object/
);

const manyFiles = {};
for (let i = 0; i < 15; i++) {
  manyFiles[`entry-${String(i).padStart(2, "0")}.md`] = `# Entry ${i}\n\n${"x".repeat(100 + i)}`;
}
const manyBlob = await createZipBlob(manyFiles);
const manyBytes = Buffer.from(await manyBlob.arrayBuffer());
const manyEntries = parseZipEntries(manyBytes);
assert.equal(manyEntries.size, 15);
assertLocalOffsetsMatchPayload(manyBytes);
for (let i = 0; i < 15; i++) {
  const key = `entry-${String(i).padStart(2, "0")}.md`;
  assert.equal(manyEntries.get(key), manyFiles[key]);
}

const largePayload = "z".repeat(200 * 1024);
const largeBlob = await createZipBlob({
  "large.md": largePayload,
  "tail.md": "end",
});
const largeBytes = Buffer.from(await largeBlob.arrayBuffer());
assertLocalOffsetsMatchPayload(largeBytes);
assert.equal(parseZipEntries(largeBytes).get("large.md"), largePayload);

assert.equal(sanitizeUtf16("ok\uD800there"), "ok\uFFFDthere");
assert.equal(sanitizeUtf16("low\uDC00only"), "low\uFFFDonly");
assert.equal(sanitizeUtf16("emoji\uD83D\uDE00!"), "emoji\uD83D\uDE00!");

const surrogateBlob = await createZipBlob({
  "broken.md": "lone\uD800surrogate",
});
const surrogateBytes = Buffer.from(await surrogateBlob.arrayBuffer());
assert.equal(parseZipEntries(surrogateBytes).get("broken.md"), "lone\uFFFDsurrogate");

console.log("zip-blob.test.mjs: OK");
