# Chrome Web Store listing

Draft copy and submission notes for `v1.3.2+`. Repo can stay private until you flip visibility; use these URLs once public (or use raw links if GitHub allows collaborators to view).

## URLs

| Field | Value |
|-------|--------|
| Homepage | `https://github.com/ayv4zyan/NotebookLM-Compactor` |
| Privacy policy | `https://github.com/ayv4zyan/NotebookLM-Compactor/blob/main/PRIVACY.md` |
| Support / issues | `https://github.com/ayv4zyan/NotebookLM-Compactor/issues` |

## Listing text

### Name

`NotebookLM Compactor`

### Short description (≤ 132 chars)

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

### Category

`Productivity`

### Language

English

## Single purpose

Provide user-initiated tools to merge and restore NotebookLM notebook sources within `notebooklm.google.com`, solely to help users manage source count limits in their own notebooks.

## Permission justifications

### `storage`

Stores temporary rollback state in `chrome.storage.local` while a Compact or Decompact operation is in progress. Cleared on success; stale entries removed after 24 hours. Also stores Terms acceptance version after first-run consent.

### Host permission: `https://notebooklm.google.com/*`

Required to read and update sources in the user's notebook when they explicitly run Compact or Decompact. All requests use the user's existing browser session on NotebookLM. No other sites are accessed.

## Screenshots (capture before submit)

1. NotebookLM source panel with **Compact** (`inventory_2`) and **Decompact** (`unarchive`) buttons visible.
2. Compact source selection modal with filter and source list.
3. Compact confirm step showing delete warnings and checkboxes.
4. Decompact preview showing restore plan per source (optional).

Recommended size: 1280×800 or 640×400. No Google trademarks presented as if endorsed by Google.

## Developer checklist

- [ ] $5 Chrome Web Store developer account registered
- [ ] Upload `notebooklm-compactor.zip` from GitHub Release (not the git repo folder)
- [ ] Privacy policy URL reachable
- [ ] Screenshots attached
- [ ] Test install from submitted package in a clean Chrome profile
- [ ] Decline "trader" EU status unless you sell goods/services in the EU as a business

## Reviewer notes (private field if available)

Extension injects UI only on `notebooklm.google.com`. Background service worker handles authenticated `batchexecute` requests initiated by user modal actions. Delete operations require two explicit checkbox confirmations plus first-run Terms acceptance. See `SECURITY.md` and `PRIVACY.md` in the repository.