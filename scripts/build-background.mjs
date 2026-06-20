#!/usr/bin/env node
/**
 * Bundle MV3 background into a single classic script (IIFE) for both browsers.
 * Chrome loads it via background.service_worker; Firefox via background.scripts.
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
    "background/index.js",
    "--bundle",
    "--outfile=background/background.bundle.js",
    "--platform=browser",
    "--format=iife",
    "--target=es2020",
  ],
  { cwd: root, stdio: "inherit" }
);