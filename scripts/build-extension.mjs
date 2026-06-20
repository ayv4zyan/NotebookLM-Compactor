#!/usr/bin/env node
/**
 * Build browser-specific extension trees under dist/chrome and dist/firefox.
 */
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { manifestForBrowser, readBaseManifest } from "./build-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const COPY_PATHS = [
  "background",
  "content",
  "lib",
  "vendor",
  "icons",
  "LICENSE",
  "TERMS.md",
  "PRIVACY.md",
  "SECURITY.md",
];

async function copyExtensionTree(targetDir) {
  await mkdir(targetDir, { recursive: true });

  for (const relPath of COPY_PATHS) {
    const source = path.join(root, relPath);
    const destination = path.join(targetDir, relPath);
    await cp(source, destination, {
      recursive: true,
      filter: (src) => !src.includes(".plasmo."),
    });
  }
}

async function writeBrowserDist(browser) {
  const targetDir = path.join(root, "dist", browser);
  await rm(targetDir, { recursive: true, force: true });
  await copyExtensionTree(targetDir);

  const manifest = manifestForBrowser(readBaseManifest(), browser);
  await writeFile(
    path.join(targetDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );

  return targetDir;
}

execFileSync("node", ["scripts/build-background.mjs"], { cwd: root, stdio: "inherit" });
execFileSync("node", ["scripts/build-content-api.mjs"], { cwd: root, stdio: "inherit" });

const chromeDir = await writeBrowserDist("chrome");
const firefoxDir = await writeBrowserDist("firefox");

console.log(`Built Chrome extension: ${chromeDir}`);
console.log(`Built Firefox extension: ${firefoxDir}`);