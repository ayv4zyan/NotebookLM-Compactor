# NotebookLM Compactor

Chrome / Chromium extension that merges many [NotebookLM](https://notebooklm.google.com) sources into one **NBLC** bundle to save **source count quota**, with full **decompact** restore on any machine.

**Current release:** `v1.3.2`

## What it does

NotebookLM limits notebooks by **number of sources** (roughly ~50), not total size. This extension:

- **Compact** — fetches selected sources, merges them into one self-describing NBLC document, uploads it as a single source, then deletes the originals you selected.
- **Decompact** — reads an NBLC bundle (`📦 NBLC · …` title), restores each section as a separate source (YouTube/web links when possible, pasted text otherwise), then deletes the compacted source.

Decompact works **cross-machine**: all restore metadata lives inside the NBLC markdown synced through your Google account — no extension storage required on the second machine.

## ⚠️ Before you use it

- **Compact deletes originals** after a successful upload. There is no undo. Enable **“Also download backup zip on success”** in the Compact modal, or download the NBLC / backup zip manually before proceeding.
- **Unofficial interface** — the extension only acts when you click Compact or Decompact, using your existing NotebookLM browser session. It does not use a published Google API. NotebookLM may change or block this at any time.
- **Your account, your responsibility** — you must comply with [Google’s Terms of Service](https://policies.google.com/terms). This project is not affiliated with Google. See [TERMS.md](./TERMS.md).

## Install

### From a release (recommended)

1. Open [Releases](https://github.com/ayv4zyan/NotebookLM-Compactor/releases) and download `notebooklm-compactor.zip` for the latest `v*` tag.
2. Unzip to a folder that contains `manifest.json` at its root.
3. Open `chrome://extensions` (or `chromium://extensions`) → enable **Developer mode**.
4. Click **Load unpacked** → select that folder.

### From source (development)

```bash
git clone https://github.com/ayv4zyan/NotebookLM-Compactor.git
cd NotebookLM-Compactor
```

Then **Load unpacked** in `chrome://extensions` pointing at the repo root (the directory with `manifest.json`).

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
| Source count | Assumes NotebookLM’s ~50-source-per-notebook limit; not verified against every account tier. |
| Bundle size | Very large merges (e.g. 30+ long transcripts) are untested at scale; NotebookLM may reject oversized pasted text. |
| URL restore | YouTube and web sources restore as live links when URL metadata is present. Bundles compacted before `v1.3.1` may lack stored URLs — re-compact to enable link restore. |
| Citations | NotebookLM cites source **titles**, not sub-sections inside a merged file. NBLC uses `# [index] Title` headings to preserve provenance. |
| Storage | `chrome.storage.local` holds a temporary rollback buffer during operations only; cleared on success. |

## Privacy

No telemetry, no author-operated servers. Data leaves your browser only when you run Compact or Decompact, and only to `notebooklm.google.com` using your existing login.

Full policy: [PRIVACY.md](./PRIVACY.md) · Technical detail: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md#security--privacy)

## Legal

| Document | Purpose |
|----------|---------|
| [LICENSE](./LICENSE) | MIT — open-source code |
| [TERMS.md](./TERMS.md) | Extension use terms, disclaimers, liability limits |
| [PRIVACY.md](./PRIVACY.md) | Required for Chrome Web Store; describes local-only data handling |
| [SECURITY.md](./SECURITY.md) | User-initiated design, data flow, compliance posture |

**In the extension:** first-run acceptance of Terms + Privacy; separate confirmations before destructive Compact/Decompact steps.

This software is provided as-is. Using it with NotebookLM may conflict with Google’s service terms; you choose whether to accept that risk on your own account.

NotebookLM and Google are trademarks of Google LLC. This extension is independent and is not affiliated with, endorsed, or sponsored by Google.

---

## Development

### Tests

```bash
node test/nblc-format.test.js
node test/rpc-parse.test.mjs
node test/source-api.test.mjs
```

CI runs all three on every push and pull request to `main`.

### Cutting a release

Push a version tag to build `notebooklm-compactor.zip` and attach it to a GitHub Release:

```bash
git tag v1.3.2
git push origin v1.3.2
```

The zip can be loaded unpacked or submitted to the Chrome Web Store.

### Implementation status

| Phase | What works |
|-------|------------|
| **1** ✅ | Select sources → fetch → merge NBLC → `chrome.storage` backup → optional zip / `.md` download |
| **2** ✅ | Upload compacted source, poll until ready, delete originals |
| **3** ✅ | Decompact NBLC back into separate sources (cross-machine, no storage required) |
| **4** ✅ | Smart URL/YouTube restore (`addUrl` / `addYoutube`); dynamic `bl` extraction from page HTML |

### Technical flows

**Compact:** select sources → fetch (`hizoJc`) → merge (NBLC) → upload (`izAoDd`) → poll ready (`rLM1Ne`) → delete originals (`tGMBJ`)

**Decompact:** fetch NBLC source → parse (with NotebookLM round-trip fallbacks) → upload each section (`addYoutube` / `addUrl` / `addText`) → delete compacted source

**Portable decompact:** all metadata lives inside the uploaded NBLC markdown — no cross-browser storage dependency.

**Temporary storage:** `chrome.storage.local` only during operations; cleared on success.

## Documentation

| Document | Audience | Contents |
|----------|----------|----------|
| [AGENTS.md](./AGENTS.md) | AI agents | Short entry: status, conventions, verification |
| [CONTEXT.md](./CONTEXT.md) | Contributors | Full design: goals, decisions, flows, risks |
| [docs/API.md](./docs/API.md) | Contributors | batchexecute RPCs: get, delete, upload, poll |
| [docs/NBLC-FORMAT.md](./docs/NBLC-FORMAT.md) | Contributors | Self-contained compact file format (v1) |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Contributors | Components, sequences, error handling |
| [docs/CHROME_WEB_STORE.md](./docs/CHROME_WEB_STORE.md) | Maintainers | Store listing copy and permission justifications |
| [docs/MANUAL_TEST_CHECKLIST.md](./docs/MANUAL_TEST_CHECKLIST.md) | Maintainers | Pre-release manual QA checklist |

## External references

Prior community documentation of NotebookLM’s web interface (for contributors only):

- [notebooklm-py](https://github.com/teng-lin/notebooklm-py) — RPC reference & Python implementation
- [notebooklm-mcp-cli](https://github.com/jacob-bd/notebooklm-mcp-cli) — MCP wrapper docs

This extension does not bundle or depend on those projects.