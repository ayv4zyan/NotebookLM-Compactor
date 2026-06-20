# Manual test checklist

Run before tagging a release. Use a **throwaway or backup notebook** — Compact deletes originals.

## Setup

- [x] Load extension unpacked from repo root or release zip (`manifest.json` at root)
- [x] Open `https://notebooklm.google.com` and sign in
- [x] Notebook has mixed sources: pasted text, web/URL, YouTube (if available)

## First-run consent

- [x] Click **Compact** — consent modal appears
- [x] **Not now** closes without opening Compact modal
- [x] Re-open Compact — accept Terms + unofficial-interface checkboxes
- [x] Consent not shown again on **Decompact** in same profile

## Compact

- [ ] Open Compact → quota panel shows `N / source_limit` for your account (bar + headroom); count-only if limit unavailable
- [x] Select 3+ sources → Compact → confirm step requires both checkboxes
- [x] **Back** returns to source list without changes
- [x] Enable backup zip → proceed → success + zip downloads
- [x] Notebook shows one `📦 NBLC · …` source; originals deleted
- [x] Optional: download NBLC `.md` from success screen opens valid file

## Decompact (same machine)

- [x] Select exactly one NBLC bundle → Decompact
- [x] Preview shows restore method per source (link vs pasted text)
- [x] Both confirm checkboxes required before button enables
- [x] Success → sources restored; NBLC bundle deleted

## Cross-machine (optional)

- [ ] Compact on machine A (same Google account)
- [ ] Open same notebook on machine B (extension installed)
- [ ] Decompact without relying on `chrome.storage` from machine A

## Failure paths

- [x] Disconnect network mid-compact → error shown; originals not deleted if upload failed
- [x] Cancel during operation not possible while busy (close disabled) — expected

## Regression

- [x] Source panel remains responsive (no freeze) after 30s on notebook page
- [x] Buttons still inject after navigating between notebooks

## Firefox (v1.0.0 gate)

Completed for stable release `v1.0.0`. Use a **throwaway notebook**. Build first: `node scripts/build-extension.mjs` → load `dist/firefox/manifest.json`.

### Setup (Firefox-specific)

- [x] Firefox ≥ 128.0
- [x] Build Firefox tree: `node scripts/build-extension.mjs` → load `dist/firefox/manifest.json` (temporary via `about:debugging`) or signed (AMO)
- [x] Confirm `manifest.json` includes `browser_specific_settings.gecko.id`
- [x] Signed in to Google on `https://notebooklm.google.com`

### Service worker health

- [x] `about:debugging` → Inspect service worker → no startup errors
- [x] After 30s idle on notebook page, click Compact → SW wakes and fetch succeeds
- [x] Decompact 10 sources without timeout or "Extension context invalidated" errors

### Functional parity

- [x] First-run consent flow
- [ ] Compact modal shows `N / source_limit` for your account tier (quota bar + headroom when limit loads)
- [x] Compact 3+ mixed sources → NBLC created → originals deleted
- [x] Backup zip download triggers (Firefox download UI)
- [x] Download NBLC `.md` from success screen
- [x] Decompact preview shows restore methods
- [x] Decompact restores sources; NBLC bundle deleted
- [x] Cross-browser: compact on Chrome A → decompact on Firefox B (same Google account)

### Firefox-specific regression

- [x] Source panel buttons inject (`inventory_2`, `unarchive` icons render)
- [x] MutationObserver: no page freeze after 30s navigation between notebooks
- [ ] `chrome.storage.onChanged` recovery banner updates
- [x] Network failure mid-compact → error shown; originals preserved
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
| v1.0.0 | 2026-06-20 | Artur | Chrome + Firefox | yes |
