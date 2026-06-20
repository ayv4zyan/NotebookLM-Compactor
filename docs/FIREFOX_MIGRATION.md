# Firefox migration plan

Maintainer guide for dual-browser support (Chrome + Firefox). End-user install steps live in [FIREFOX.md](./FIREFOX.md).

**Status (2026-06-20):** Migration **complete** on `main`. Dual-browser support shipped; manual QA signed off. Public alpha **`v0.1.0`** (manifest `0.1.0`, dual-browser GitHub Release zips). Git history was squashed before the first public release.

## Compatibility conclusion

The extension is cross-browser at the WebExtensions API level. No Chrome-only APIs are used (`chrome.scripting`, `chrome.downloads`, `declarativeNetRequest`, `sidePanel`, etc.).

| API / pattern | Files | Firefox |
|---------------|-------|---------|
| `chrome.storage.local` | `lib/manifest-store.js`, `lib/user-consent.js`, `background/storage-sweep.js`, `content/recovery-banner.js` | ✅ |
| `chrome.runtime` messaging | `background/index.js`, modals (fallback path) | ✅ |
| MV3 background (event page) | `background/background.bundle.js` via `background.scripts` in `dist/firefox` | ✅ (Firefox 128+; does **not** use `service_worker`) |
| Content-script `batchexecute` | `lib/runtime-messaging.js`, `content/batchexecute-bridge.js` | ✅ (session cookies; primary API path) |
| Content-script Blob downloads | `content/compact-modal.js` | ✅ |
| DOM scraping | `lib/notebooklm-api.js`, `lib/source-panel-inject.js` | ✅ (QA passed) |

**Decisions:**
- Keep `chrome.*` namespace — Firefox supports it natively; no `webextension-polyfill`.
- **Dual manifests at build time** — Chrome requires `background.service_worker`; Firefox requires `background.scripts`. One repo-root `manifest.json` (Chrome-canonical); `node scripts/build-extension.mjs` writes `dist/chrome` and `dist/firefox`.

## Build and load

```bash
node scripts/build-extension.mjs
```

| Browser | Load path |
|---------|-----------|
| Chrome (dev) | `dist/chrome` or repo root after build |
| Firefox (dev) | `dist/firefox/manifest.json` via `about:debugging` |
| Chrome (release) | `notebooklm-compactor-chrome.zip` |
| Firefox (release) | `notebooklm-compactor-firefox.zip` |

## Manifest checklist (PR 1 — done)

Base `manifest.json` includes:

```json
"browser_specific_settings": {
  "gecko": {
    "id": "notebooklm-compactor@ayv4zyan.github",
    "strict_min_version": "128.0",
    "data_collection_permissions": {
      "required": ["none"]
    }
  }
}
```

| Field | Notes |
|-------|-------|
| `gecko.id` | **Immutable after first AMO upload.** Locked to `notebooklm-compactor@ayv4zyan.github`. |
| `strict_min_version` | `128.0` — MV3 event-page baseline. |
| `data_collection_permissions` | Required AMO policy declaration; extension collects no telemetry. |

Firefox dist manifest uses `background.scripts`; Chrome dist uses `background.service_worker`. Same bundled `background/background.bundle.js` in both.

## PR plan summary

| PR | Title | Status |
|----|-------|--------|
| 1 | `feat(manifest): add Firefox gecko settings` | ✅ Merged |
| 2 | `docs: Firefox migration + architecture` | ✅ Merged |
| 3 | `docs: Firefox user guide + AMO listing` | ✅ Merged |
| 4 | `docs(ci): Firefox checklist + PRIVACY + lint` | ✅ Merged |
| 5 | Firefox QA sign-off + dual-browser implementation | ✅ Merged (#5) |
| 6 | *(conditional)* SW/cookie resilience | ⏭️ Skipped — fixed in PR #5 |

## Release runbook (maintainer actions — not a PR)

**Precondition:** PRs 1–5 merged; QA sign-off recorded in [MANUAL_TEST_CHECKLIST.md](./MANUAL_TEST_CHECKLIST.md).

### 1. Version bump and tag

**Done:** `v0.1.0` (2026-06-20) — first public alpha. For the next release:

```bash
# Edit manifest.json version and COMPACTOR_ID in lib/nblc-format.js, then:
git add manifest.json lib/nblc-format.js
git commit -m "chore(release): bump version to X.Y.Z"
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

This triggers `.github/workflows/release.yml` → `notebooklm-compactor-chrome.zip` and `notebooklm-compactor-firefox.zip` on GitHub Releases.

> **Versioning:** Extension semver uses `0.y.z` while in alpha. Reserve `1.0.0` for a stable, production-ready release. NBLC **format** version (`version: 1` in bundle headers) is separate and unchanged.

### 2. Verify GitHub Release zips

1. Download both zips from the `v0.1.0` GitHub Release.
2. Confirm Firefox zip `manifest.json` has `browser_specific_settings.gecko`, `"version": "0.1.0"`, and `background.scripts` (not `service_worker`).
3. Confirm Chrome zip `manifest.json` has `background.service_worker` (not `background.scripts`).
4. Load each in a clean profile; run minimal Compact + Decompact on a throwaway notebook.

### 3. Submit to AMO

AMO review is **not** a gate for the GitHub tag. Tag first; submit after.

1. Create or log in to the [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/).
2. Create a new extension listing (or new version on existing listing).
3. Upload `notebooklm-compactor-firefox.zip` from the `v0.1.0` GitHub Release — not the git working tree.
4. Upload the **source code archive** (see [AMO source-code submission](#4-amo-source-code-submission) below).
5. Paste listing copy from [AMO_LISTING.md](./AMO_LISTING.md).
6. Set privacy policy URL to `PRIVACY.md` on GitHub (same as Chrome Web Store).
7. Submit for review; respond to reviewer questions (allow days–weeks).
8. After approval: update [FIREFOX.md](./FIREFOX.md) with the live AMO URL (follow-up commit/PR).

**Signing:** AMO signs the uploaded zip on approval. No separate `web-ext sign` step is required unless you choose a self-hosted distribution channel.

### 4. AMO source-code submission

Required because `vendor/jszip.min.js` is minified third-party code.

| Deliverable | Detail |
|-------------|--------|
| **Archive** | Full public repo zip at tag `v0.1.0` |
| **Build instructions** | Reproduce release zips: |

```bash
node scripts/build-extension.mjs
(cd dist/chrome && zip -r ../../notebooklm-compactor-chrome.zip .)
(cd dist/firefox && zip -r ../../notebooklm-compactor-firefox.zip .)
```

| **Third-party library** | [Stuk/jszip](https://github.com/Stuk/jszip) — `vendor/jszip.min.js` v3.10.1; client-side backup zip only |
| **Reviewer statement** | No remote code; author bundles via esbuild at build time; only vendored JSZip is third-party minified |

### 5. Post-approval URL update

Update [FIREFOX.md](./FIREFOX.md) with the live AMO listing URL (follow-up commit/PR).

### 6. Chrome Web Store (optional)

Upload `notebooklm-compactor-chrome.zip` to Chrome Web Store for version parity (`v0.1.0`).

## Rollback

| Scope | Action |
|-------|--------|
| Pre-release | Revert gecko block; Chrome users unaffected |
| Post-AMO | Unlist AMO listing; users fall back to temporary load |
| Post-tag | Yank GitHub Release; revert version bump on `main` |

## References

- [ARCHITECTURE.md](./ARCHITECTURE.md) — component map
- [AMO_LISTING.md](./AMO_LISTING.md) — store copy
- [Mozilla publishing](https://extensionworkshop.com/documentation/publish/)
- [browser_specific_settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings)