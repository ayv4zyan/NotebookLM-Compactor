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

## Sign-off

| Version | Date | Tester | Pass |
|---------|------|--------|------|
| v1.3.2 | | | |