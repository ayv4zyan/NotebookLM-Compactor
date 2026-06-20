#!/usr/bin/env node
/**
 * Bundle batchexecute client for content scripts (Firefox needs in-page fetch + cookies).
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

execFileSync(
  "npx",
  [
    "--yes",
    "esbuild@0.25.0",
    "content/batchexecute-bridge.js",
    "--bundle",
    "--outfile=lib/batchexecute-client.bundle.js",
    "--platform=browser",
    "--format=iife",
    "--target=es2020",
  ],
  { cwd: root, stdio: "inherit" }
);