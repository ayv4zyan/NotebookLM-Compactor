# Firefox Add-ons (AMO) listing

Draft copy and submission notes for `v1.0.0+`. Requires a **public** GitHub repo so privacy policy and support URLs are reachable.

## URLs

| Field | Value |
|-------|--------|
| Homepage | `https://github.com/ayv4zyan/NotebookLM-Compactor` |
| Privacy policy | `https://github.com/ayv4zyan/NotebookLM-Compactor/blob/main/PRIVACY.md` |
| Support / issues | `https://github.com/ayv4zyan/NotebookLM-Compactor/issues` |

## Listing text

### Name

`NotebookLM Compactor`

### Short description (AMO summary)

Merge NotebookLM sources into one bundle. See your account source limit in Compact. Restore anytime with Decompact.

### Detailed description

NotebookLM Compactor helps you stay under NotebookLM's per-notebook source count limit by merging many sources into one self-describing NBLC bundle — then restoring them later if needed.

**See your limit** — When you open Compact, the extension reads your account's per-notebook source cap from NotebookLM and shows your current usage as `N / limit`, with a progress bar and how many slots you'll free after compacting. Limits differ by plan (e.g. free vs Google AI Pro); if the limit can't be loaded, you still see your source count before and after.

**Compact** — Select sources in your notebook, merge them into one NBLC source, and remove the originals you selected (with explicit confirmations and optional backup zip).

**Decompact** — Select a `📦 NBLC · …` bundle and restore each section as a separate source. Works across machines via your Google account sync.

**Designed for safety**
- Runs only when you click Compact or Decompact
- First-run Terms and Privacy acceptance
- Separate confirmations before any destructive step
- No telemetry; no third-party servers
- Temporary local storage only during operations

**Not affiliated with Google.** Uses your existing NotebookLM login on `notebooklm.google.com`. Features may break if NotebookLM changes.

NotebookLM and Google are trademarks of Google LLC. This extension is independent and is not affiliated with, endorsed by, or sponsored by Google.

### Category

`Productivity`

### Language

English

## Single purpose

Provide user-initiated tools to merge and restore NotebookLM notebook sources within `notebooklm.google.com`, and to display the user's account-specific per-notebook source limit when they open Compact, solely to help users manage source count limits in their own notebooks.

## Permission justifications

### `storage` and `unlimitedStorage`

Stores small progress records in `browser.storage.local` while a Compact or Decompact operation is in progress (uploaded source IDs, not full notebook text). `unlimitedStorage` prevents the browser's default storage cap from interrupting large notebooks. Cleared on success; stale entries removed after 24 hours. Also stores Terms acceptance version after first-run consent.

### Host permission: `https://notebooklm.google.com/*`

Required to read and update sources in the user's notebook when they explicitly run Compact or Decompact. All requests use the user's existing browser session on NotebookLM. No other sites are accessed.

## Screenshots (capture before submit)

Capture in **Firefox** on `notebooklm.google.com`:

1. NotebookLM source panel with **Compact** (`inventory_2`) and **Decompact** (`unarchive`) buttons visible.
2. Compact modal quota panel showing `current / account limit`, progress bar, and slots freed (e.g. `47 → 12 / 300`).
3. Compact source selection modal with filter and source list.
4. Compact confirm step showing delete warnings and checkboxes.
5. Decompact preview showing restore plan per source (optional).

Recommended size: 1280×800 or 640×400. No Google trademarks presented as if endorsed by Google.

## Developer checklist

- [ ] [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/) account created
- [ ] Upload `notebooklm-compactor-firefox.zip` from GitHub Release `v1.0.0` (not the git repo folder)
- [ ] Upload source code archive (see [Source code submission](#source-code-submission) below)
- [ ] Privacy policy URL reachable
- [ ] Screenshots attached (Firefox captures)
- [ ] Test install from submitted package in a clean Firefox profile (`about:debugging` or AMO review channel)
- [ ] Confirm `browser_specific_settings.gecko.id` is `notebooklm-compactor@ayv4zyan.github` (immutable after first upload)
- [ ] Set `data_collection_permissions.required` to `["none"]` in manifest (already present)

## Reviewer notes (private field if available)

Extension injects UI only on `notebooklm.google.com`. User modal actions trigger `batchexecute` requests from the content script (session cookies). Opening Compact performs one read-only account-settings request (`GET_USER_SETTINGS`) to display the user's per-notebook source limit; no background polling. Firefox uses MV3 `background.scripts` event page for storage sweep; Chrome uses `background.service_worker`. Delete operations require two explicit checkbox confirmations plus first-run Terms acceptance. See `SECURITY.md` and `PRIVACY.md` in the repository.

Firefox 128+. Uses `chrome.*` namespace (supported natively in Firefox). No remote code execution. Build step bundles source with esbuild before release.

## Source code submission

Required because `vendor/jszip.min.js` is minified third-party code listed in `manifest.json` `content_scripts` and used for optional backup zip downloads in `content/compact-modal.js`.

| Deliverable | Detail |
|-------------|--------|
| **Archive** | Full public repo zip at tag `v1.0.0` (or paths matching `.github/workflows/release.yml` plus `test/`, `docs/`) |
| **Build instructions** | No compile step. Reproduce release zip: |

```bash
node scripts/build-extension.mjs
(cd dist/firefox && zip -r ../../notebooklm-compactor-firefox.zip .)
```

| **Third-party library** | [Stuk/jszip](https://github.com/Stuk/jszip) — `vendor/jszip.min.js` **v3.10.1**; client-side backup zip only |
| **Reviewer statement** | No remote code; author bundles via esbuild at build time; only vendored JSZip is third-party minified |

Submit `notebooklm-compactor-firefox.zip` to AMO. Chrome Web Store uses `notebooklm-compactor-chrome.zip` (separate manifest background field).