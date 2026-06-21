#!/usr/bin/env node
/**
 * Tests for lib/backup-zip-files.js
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { sanitizeFilename, uniqueBaseName, buildBackupZipFileMap } = require(
  "../lib/backup-zip-files.js"
);

assert.equal(sanitizeFilename("Foo Bar"), "Foo_Bar");
assert.equal(sanitizeFilename('bad<>:"/\\|?*name'), "bad_name");

const used = new Set(["Foo"]);
assert.equal(uniqueBaseName("Foo", used), "Foo_1");
assert.equal(used.has("Foo_1"), true);

const collisionMap = buildBackupZipFileMap(
  [
    { title: "Foo", content: "alpha" },
    { title: "Foo", content: "beta" },
  ],
  "Foo",
  "compacted body"
);

assert.deepEqual(Object.keys(collisionMap).sort(), ["Foo.md", "Foo_1.md", "Foo_2.md"]);
assert.equal(collisionMap["Foo.md"], "# Foo\n\nalpha");
assert.equal(collisionMap["Foo_1.md"], "# Foo\n\nbeta");
assert.equal(collisionMap["Foo_2.md"], "compacted body");

const compactCollision = buildBackupZipFileMap(
  [{ title: "Report", content: "src" }],
  "Report",
  "bundle"
);

assert.deepEqual(Object.keys(compactCollision).sort(), ["Report.md", "Report_1.md"]);
assert.equal(compactCollision["Report.md"], "# Report\n\nsrc");
assert.equal(compactCollision["Report_1.md"], "bundle");

console.log("backup-zip-files.test.mjs: OK");