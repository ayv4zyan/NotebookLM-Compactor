# NotebookLM-Compactor

Chrome extension that merges many NotebookLM sources into one **NBLC** bundle to save **source count quota**, with full **decompact** restore on any machine.

**Status:** Phase 2 complete (full compact: upload + delete). Phase 3 (decompact) not started.

| Phase | What works |
|-------|------------|
| **1** ✅ | Select sources → fetch → merge NBLC → `chrome.storage` backup → optional zip / `.md` download |
| **2** ✅ | Upload compacted source, poll until ready, delete originals |
| **3** | Decompact NBLC back into separate sources |
| **4** | Smart URL/YouTube restore from metadata |

## Install (development)

1. Clone this repo (private GitHub: `ayv4zyan/NotebookLM-Compactor`).
2. Open `chrome://extensions` → enable **Developer mode**.
3. **Load unpacked** → select this folder (`NotebookLM-Compactor/`).
4. Open [notebooklm.google.com](https://notebooklm.google.com), select sources, click **Compact** (`inventory_2` icon in the source panel).

**Compact** uploads one NBLC source and deletes the originals you selected. Use the optional backup zip if you want a local copy first.

## Releases

Push a version tag to trigger a GitHub Release with an installable zip:

```bash
git tag v1.1.0
git push origin v1.1.0
```

Download `notebooklm-compactor.zip` from the Release assets, unzip, and load unpacked in Chrome — or upload to Chrome Web Store.

## Tests

```bash
node test/nblc-format.test.js
node test/rpc-parse.test.mjs
```

CI runs both on every push and pull request to `main`.

## For AI agents / developers

| Document | Contents |
|----------|----------|
| [AGENTS.md](./AGENTS.md) | Short agent entry: status, conventions, Phase 3 checklist |
| [CONTEXT.md](./CONTEXT.md) | Full design: goals, decisions, flows, risks |
| [docs/API.md](./docs/API.md) | batchexecute RPCs: get, delete, upload, poll |
| [docs/NBLC-FORMAT.md](./docs/NBLC-FORMAT.md) | Self-contained compact file format (v1) |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Components, sequences, error handling |

## Related projects

- `../NotebookLM-Source-Downloader/` — working reference (download only; sibling folder, not in this git repo)
- `../NotebookLM-Ultra-Exporter.crx` — original reverse-engineering reference

## External API references

- [notebooklm-py](https://github.com/teng-lin/notebooklm-py) — RPC reference & Python implementation
- [notebooklm-mcp-cli](https://github.com/jacob-bd/notebooklm-mcp-cli) — MCP wrapper docs

## Quick summary

**Compact:** select sources → fetch (`hizoJc`) → merge (NBLC) → upload (`izAoDd`) → poll ready (`rLM1Ne`) → delete originals (`tGMBJ`)

**Decompact (Phase 3):** fetch NBLC source → parse → upload each section → delete compacted source

**Portable decompact:** all metadata lives inside the uploaded NBLC markdown — no cross-browser storage dependency.

**Temporary storage:** `chrome.storage.local` only during operations; cleared after success.