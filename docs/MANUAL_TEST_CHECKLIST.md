# Manual test checklist

Run before tagging a release. Use a **throwaway or backup notebook** — Compact deletes originals.

## Setup

- [ ] Load extension unpacked from repo root or release zip (`manifest.json` at root)
- [ ] Open `https://notebooklm.google.com` and sign in
- [ ] Notebook has mixed sources: pasted text, web/URL, YouTube (if available)

## First-run consent

- [ ] Click **Compact** — consent modal appears
- [ ] **Not now** closes without opening Compact modal
- [ ] Re-open Compact — accept Terms + unofficial-interface checkboxes
- [ ] Consent not shown again on **Decompact** in same profile

## Compact

- [ ] Select 3+ sources → Compact → confirm step requires both checkboxes
- [ ] **Back** returns to source list without changes
- [ ] Enable backup zip → proceed → success + zip downloads
- [ ] Notebook shows one `📦 NBLC · …` source; originals deleted
- [ ] Optional: download NBLC `.md` from success screen opens valid file

## Decompact (same machine)

- [ ] Select exactly one NBLC bundle → Decompact
- [ ] Preview shows restore method per source (link vs pasted text)
- [ ] Both confirm checkboxes required before button enables
- [ ] Success → sources restored; NBLC bundle deleted

## Cross-machine (optional)

- [ ] Compact on machine A (same Google account)
- [ ] Open same notebook on machine B (extension installed)
- [ ] Decompact without relying on `chrome.storage` from machine A

## Failure paths

- [ ] Disconnect network mid-compact → error shown; originals not deleted if upload failed
- [ ] Cancel during operation not possible while busy (close disabled) — expected

## Regression

- [ ] Source panel remains responsive (no freeze) after 30s on notebook page
- [ ] Buttons still inject after navigating between notebooks

## Firefox (v1.1.0 gate)

Run after [FIREFOX_MIGRATION.md](./FIREFOX_MIGRATION.md) PR 1 (gecko manifest) and this checklist section are merged. Use a **throwaway notebook**.

### Setup (Firefox-specific)

- [ ] Firefox ≥ 128.0
- [ ] Load extension: temporary (`about:debugging` → Load Temporary Add-on) or signed (AMO)
- [ ] Confirm `manifest.json` includes `browser_specific_settings.gecko.id`
- [ ] Signed in to Google on `https://notebooklm.google.com`

### Service worker health

- [ ] `about:debugging` → Inspect service worker → no startup errors
- [ ] After 30s idle on notebook page, click Compact → SW wakes and fetch succeeds
- [ ] Decompact 10 sources without timeout or "Extension context invalidated" errors

### Functional parity

- [ ] First-run consent flow
- [ ] Compact 3+ mixed sources → NBLC created → originals deleted
- [ ] Backup zip download triggers (Firefox download UI)
- [ ] Download NBLC `.md` from success screen
- [ ] Decompact preview shows restore methods
- [ ] Decompact restores sources; NBLC bundle deleted
- [ ] Cross-browser: compact on Chrome A → decompact on Firefox B (same Google account)

### Firefox-specific regression

- [ ] Source panel buttons inject (`inventory_2`, `unarchive` icons render)
- [ ] MutationObserver: no page freeze after 30s navigation between notebooks
- [ ] `chrome.storage.onChanged` recovery banner updates
- [ ] Network failure mid-compact → error shown; originals preserved
- [ ] Source titles with `<`, `&`, `"` render correctly in modals (escape verification)
- [ ] Note temporary add-on restart behavior if applicable

### Performance (manual observation)

| Operation | Sources | Target | Failure indicator |
|-----------|---------|--------|-------------------|
| Compact fetch | 5 | < 15s | Modal stuck in "fetching" |
| Compact full | 5 | < 90s | SW unhandled rejection |
| Decompact | 10 | < 5 min | Timeout errors in modal |
| `waitForSourceReady` | 1 large paste | < 120s | "Timeout waiting for source" |

## Sign-off

| Version | Date | Tester | Browser | Pass |
|---------|------|--------|---------|------|
| v1.0.0 | | | Chrome | |
| v1.1.0 | | | Firefox | |