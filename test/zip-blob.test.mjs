#!/usr/bin/env node
/**
 * Minimal checks for lib/zip-blob.js
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { createZipBlob } = require("../lib/zip-blob.js");

const tempDir = mkdtempSync(path.join(tmpdir(), "nblc-zip-"));

try {
  const zipPath = path.join(tempDir, "backup.zip");
  const blob = createZipBlob({
    "alpha.md": "# Alpha\n\none",
    "beta.md": "# Beta\n\ntwo",
  });
  const bytes = Buffer.from(await blob.arrayBuffer());
  writeFileSync(zipPath, bytes);

  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);

  const listing = execFileSync("unzip", ["-l", zipPath], { encoding: "utf8" });
  assert.match(listing, /alpha\.md/);
  assert.match(listing, /beta\.md/);

  const alpha = execFileSync("unzip", ["-p", zipPath, "alpha.md"], { encoding: "utf8" });
  assert.equal(alpha, "# Alpha\n\none");

  console.log("zip-blob.test.mjs: OK");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}