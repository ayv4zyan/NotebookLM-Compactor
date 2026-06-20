# Firefox Add-ons (AMO) listing

Draft copy and submission notes for `v1.1.0+`. Repo can stay private until you flip visibility; use these URLs once public (or use raw links if GitHub allows collaborators to view).

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

Merge NotebookLM sources into one portable bundle to save source quota. Restore anytime with Decompact.

### Detailed description

NotebookLM Compactor helps you stay under NotebookLM's per-notebook source count limit by merging many sources into one self-describing NBLC bundle — then restoring them later if needed.

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

Provide user-initiated tools to merge and restore NotebookLM notebook sources within `notebooklm.google.com`, solely to help users manage source count limits in their own notebooks.

## Permission justifications

### `storage` and `unlimitedStorage`

Stores small progress records in `browser.storage.local` while a Compact or Decompact operation is in progress (uploaded source IDs, not full notebook text). `unlimitedStorage` prevents the browser's default storage cap from interrupting large notebooks. Cleared on success; stale entries removed after 24 hours. Also stores Terms acceptance version after first-run consent.

### Host permission: `https://notebooklm.google.com/*`

Required to read and update sources in the user's notebook when they explicitly run Compact or Decompact. All requests use the user's existing browser session on NotebookLM. No other sites are accessed.

## Screenshots (capture before submit)

Capture in **Firefox** on `notebooklm.google.com`:

1. NotebookLM source panel with **Compact** (`inventory_2`) and **Decompact** (`unarchive`) buttons visible.
2. Compact source selection modal with filter and source list.
3. Compact confirm step showing delete warnings and checkboxes.
4. Decompact preview showing restore plan per source (optional).

Recommended size: 1280×800 or 640×400. No Google trademarks presented as if endorsed by Google.

## Developer checklist

- [ ] [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/) account created
- [ ] Upload `notebooklm-compactor.zip` from GitHub Release `v1.1.0` (not the git repo folder)
- [ ] Upload source code archive (see [Source code submission](#source-code-submission) below)
- [ ] Privacy policy URL reachable
- [ ] Screenshots attached (Firefox captures)
- [ ] Test install from submitted package in a clean Firefox profile (`about:debugging` or AMO review channel)
- [ ] Confirm `browser_specific_settings.gecko.id` is `notebooklm-compactor@ayv4zyan.github` (immutable after first upload)
- [ ] Set `data_collection_permissions.required` to `["none"]` in manifest (already present)

## Reviewer notes (private field if available)

Extension injects UI only on `notebooklm.google.com`. Background service worker handles authenticated `batchexecute` requests initiated by user modal actions. Delete operations require two explicit checkbox confirmations plus first-run Terms acceptance. See `SECURITY.md` and `PRIVACY.md` in the repository.

Firefox 128+ MV3 module service worker. Uses `chrome.*` namespace (supported natively in Firefox). No remote code execution.

## Source code submission

Required because `vendor/jszip.min.js` is minified third-party code listed in `manifest.json` `content_scripts` and used for optional backup zip downloads in `content/compact-modal.js`.

| Deliverable | Detail |
|-------------|--------|
| **Archive** | Full public repo zip at tag `v1.1.0` (or paths matching `.github/workflows/release.yml` plus `test/`, `docs/`) |
| **Build instructions** | No compile step. Reproduce release zip: |

```bash
zip -r notebooklm-compactor.zip \
  manifest.json LICENSE TERMS.md PRIVACY.md SECURITY.md \
  background content lib vendor icons \
  -x "icons/*.plasmo.*.png"
```

| **Third-party library** | [Stuk/jszip](https://github.com/Stuk/jszip) — `vendor/jszip.min.js` **v3.10.1**; client-side backup zip only |
| **Reviewer statement** | No remote code; **no author-minified code**; only vendored JSZip is minified |

Same zip artifact is used for Chrome Web Store and AMO.