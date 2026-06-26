# NotebookLM Compactor

**Firefox add-on and Chrome extension** that merges many [NotebookLM](https://notebooklm.google.com) sources into one **NBLC** bundle to save **source count quota**, with full **decompact** restore on any machine.

[![Get it on Firefox](https://img.shields.io/badge/Firefox-Get%20the%20add--on-FF7139?style=for-the-badge&logo=firefox&logoColor=white)](https://addons.mozilla.org/firefox/addon/notebooklm-compactor/)
[![GitHub Release](https://img.shields.io/github/v/release/ayv4zyan/NotebookLM-Compactor?style=for-the-badge&logo=github&label=Release)](https://github.com/ayv4zyan/NotebookLM-Compactor/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](./LICENSE)

**Install:** [Firefox Add-ons (AMO)](https://addons.mozilla.org/firefox/addon/notebooklm-compactor/) · [GitHub Releases](https://github.com/ayv4zyan/NotebookLM-Compactor/releases) (Chrome zip or manual Firefox load)

**Current manifest version:** `1.0.2` · **Latest GitHub tag:** see [Releases](https://github.com/ayv4zyan/NotebookLM-Compactor/releases)

## What it does

NotebookLM limits notebooks by **number of sources**, not total size. This **NotebookLM browser extension** (Firefox add-on and Chrome extension) helps you stay under that quota:

- **Compact** — fetches selected sources, merges them into one self-describing NBLC document, uploads it as a single source, then deletes the originals you selected.
- **Decompact** — reads an NBLC bundle (`📦 NBLC · …` title), restores each section as a separate source (YouTube/web links when possible, pasted text otherwise), then deletes the compacted source.

Decompact works **cross-machine**: all restore metadata lives inside the NBLC markdown synced through your Google account — no extension storage required on the second machine.

## ⚠️ Before you use it

- **Compact deletes originals** after a successful upload. There is no undo. Enable **“Also download backup zip on success”** in the Compact modal, or download the NBLC / backup zip manually before proceeding.
- **Unofficial interface** — the extension only acts when you click Compact or Decompact, using your existing NotebookLM browser session. It does not use a published Google API. NotebookLM may change or block this at any time.
- **Your account, your responsibility** — you must comply with [Google’s Terms of Service](https://policies.google.com/terms). This project is not affiliated with Google. See [TERMS.md](./TERMS.md).

## Install

### Firefox (recommended)

Install from **[Mozilla Add-ons](https://addons.mozilla.org/firefox/addon/notebooklm-compactor/)** — signed, persists across browser restarts, no developer mode required.

Alternative: download `notebooklm-compactor-firefox.zip` from [Releases](https://github.com/ayv4zyan/NotebookLM-Compactor/releases) and load temporarily via `about:debugging`. See **[docs/FIREFOX.md](./docs/FIREFOX.md)** for full steps, requirements (Firefox ≥ 128), and troubleshooting.

### Chrome / Chromium

Releases ship `notebooklm-compactor-chrome.zip` from [Releases](https://github.com/ayv4zyan/NotebookLM-Compactor/releases). Chrome and Firefox require different `background` manifest fields, so use the zip that matches your browser.

#### From a release (recommended)

1. Download `notebooklm-compactor-chrome.zip` for the latest `v*` tag.
2. Unzip to a folder that contains `manifest.json` at its root.
3. Open `chrome://extensions` (or `chromium://extensions`) → enable **Developer mode**.
4. Click **Load unpacked** → select that folder.

#### From source (development)

```bash
git clone https://github.com/ayv4zyan/NotebookLM-Compactor.git
cd NotebookLM-Compactor
node scripts/build-extension.mjs
```

Then **Load unpacked** in `chrome://extensions` pointing at `dist/chrome` (or the repo root after the build step creates bundles).

> **Note:** Chromium assigns a random extension ID for unpacked installs. That is normal and does not affect functionality.

## Usage

1. Open [notebooklm.google.com](https://notebooklm.google.com) and open a notebook.
2. In the **source panel**, select the sources you want to merge.
3. Click the **Compact** button (`inventory_2` icon) in the panel header.
4. Review the preview, optionally enable backup zip, then confirm.

To restore a bundle:

1. Select **exactly one** source whose title starts with `📦 NBLC ·`.
2. Click **Decompact** (`unarchive` icon).
3. Review the restore plan (live link vs pasted text per source), then confirm.

Buttons appear only on `notebooklm.google.com` — there is no toolbar popup.

## Limitations

| Topic | Detail |
|-------|--------|
| Source count | Compact fetches your account’s per-notebook source limit (`GET_USER_SETTINGS`) and shows `current / limit` with headroom; falls back to count-only if unavailable. |
| Bundle size | Very large merges (e.g. 30+ long transcripts) are untested at scale; NotebookLM may reject oversized pasted text. |
| URL restore | YouTube and web sources restore as live links when URL metadata is present. Older bundles without `url:` metadata may lack stored URLs — re-compact to enable link restore. |
| Citations | NotebookLM cites source **titles**, not sub-sections inside a merged file. NBLC uses `# [index] Title` headings to preserve provenance. |
| Storage | `browser.storage.local` holds a temporary rollback buffer during operations only; cleared on success. |
| Firefox temporary load | `about:debugging` installs are removed on browser restart — use the [AMO listing](https://addons.mozilla.org/firefox/addon/notebooklm-compactor/) for a permanent add-on. |

## Privacy

No telemetry, no author-operated servers. Data leaves your browser only when you run Compact or Decompact, and only to `notebooklm.google.com` using your existing login.

Full policy: [PRIVACY.md](./PRIVACY.md) · Technical detail: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md#security--privacy)

## Legal

| Document | Purpose |
|----------|---------|
| [LICENSE](./LICENSE) | MIT — open-source code |
| [TERMS.md](./TERMS.md) | Extension use terms, disclaimers, liability limits |
| [PRIVACY.md](./PRIVACY.md) | Required for Chrome Web Store and AMO; describes local-only data handling |
| [SECURITY.md](./SECURITY.md) | User-initiated design, data flow, compliance posture |

**In the extension:** first-run acceptance of Terms + Privacy; separate confirmations before destructive Compact/Decompact steps.

This software is provided as-is. Using it with NotebookLM may conflict with Google’s service terms; you choose whether to accept that risk on your own account.

NotebookLM and Google are trademarks of Google LLC. This extension is independent and is not affiliated with, endorsed by, or sponsored by Google.

---

## Development

### Build and test

```bash
node scripts/build-extension.mjs
node test/nblc-format.test.js
node test/rpc-parse.test.mjs
node test/source-api.test.mjs
node test/batchexecute-parse.test.mjs
node test/zip-blob.test.mjs
node test/backup-zip-files.test.mjs
```

CI runs build + all six tests on every push and pull request to `main`.

### Cutting a release

1. Bump `version` in `manifest.json` and `COMPACTOR_ID` in `lib/nblc-format.js`.
2. Push a version tag — CI builds and attaches both zips to a GitHub Release:

```bash
git commit -am "chore(release): bump version to X.Y.Z"
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

Submit `notebooklm-compactor-chrome.zip` to Chrome Web Store (optional). Firefox is published on [AMO](https://addons.mozilla.org/firefox/addon/notebooklm-compactor/). See [docs/FIREFOX_MIGRATION.md](./docs/FIREFOX_MIGRATION.md).

### Implementation status

| Phase | What works |
|-------|------------|
| **1** ✅ | Select sources → fetch → merge NBLC → `browser.storage` backup → optional zip / `.md` download |
| **2** ✅ | Upload compacted source, poll until ready, delete originals |
| **3** ✅ | Decompact NBLC back into separate sources (cross-machine, no storage required) |
| **4** ✅ | Smart URL/YouTube restore (`addUrl` / `addYoutube`); dynamic `bl` extraction from page HTML |

### Technical flows

**Compact:** select sources → fetch (`hizoJc`) → merge (NBLC) → upload (`izAoDd`) → poll ready (`rLM1Ne`) → delete originals (`tGMBJ`)

**Decompact:** fetch NBLC source → parse (with NotebookLM round-trip fallbacks) → upload each section (`addYoutube` / `addUrl` / `addText`) → delete compacted source

**Portable decompact:** all metadata lives inside the uploaded NBLC markdown — no cross-browser storage dependency.

**Temporary storage:** `browser.storage.local` only during operations; cleared on success.

## Documentation

| Document | Audience | Contents |
|----------|----------|----------|
| [AGENTS.md](./AGENTS.md) | AI agents | Short entry: status, conventions, verification |
| [CONTEXT.md](./CONTEXT.md) | Contributors | Full design: goals, decisions, flows, risks |
| [docs/API.md](./docs/API.md) | Contributors | batchexecute RPCs: get, delete, upload, poll |
| [docs/NBLC-FORMAT.md](./docs/NBLC-FORMAT.md) | Contributors | Self-contained compact file format (v1) |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Contributors | Components, sequences, error handling |
| [docs/FIREFOX.md](./docs/FIREFOX.md) | Users | Firefox install, usage, troubleshooting |
| [docs/CHROME_WEB_STORE.md](./docs/CHROME_WEB_STORE.md) | Maintainers | Chrome Web Store listing copy and permission justifications |
| [docs/AMO_LISTING.md](./docs/AMO_LISTING.md) | Maintainers | Firefox Add-ons listing copy and source submission notes |
| [docs/FIREFOX_MIGRATION.md](./docs/FIREFOX_MIGRATION.md) | Maintainers | Firefox migration plan, AMO runbook, QA gates |
| [docs/MANUAL_TEST_CHECKLIST.md](./docs/MANUAL_TEST_CHECKLIST.md) | Maintainers | Pre-release manual QA checklist |

## External references

Prior community documentation of NotebookLM’s web interface (for contributors only):

- [notebooklm-py](https://github.com/teng-lin/notebooklm-py) — RPC reference & Python implementation
- [notebooklm-mcp-cli](https://github.com/jacob-bd/notebooklm-mcp-cli) — MCP wrapper docs

This extension does not bundle or depend on those projects.