/**
 * Chrome MV3 uses background.service_worker; Firefox MV3 uses background.scripts.
 * A single manifest.json cannot satisfy both — generate per-browser manifests at build time.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function readBaseManifest(manifestPath = path.join(root, "manifest.json")) {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

export function backgroundEntryPath(manifest) {
  return (
    manifest.background?.service_worker ||
    manifest.background?.scripts?.[0] ||
    "background/background.bundle.js"
  );
}

export function manifestForBrowser(baseManifest, browser) {
  const manifest = structuredClone(baseManifest);
  const entry = backgroundEntryPath(manifest);

  if (browser === "firefox") {
    manifest.background = { scripts: [entry] };
  } else if (browser === "chrome") {
    manifest.background = { service_worker: entry };
  } else {
    throw new Error(`Unknown browser target: ${browser}`);
  }

  return manifest;
}