# NotebookLM-Compactor

Chrome extension (planned) that merges many NotebookLM sources into one to save **source count quota**, with full **decompact** restore on any machine.

**Status:** Documentation scaffold only — not yet implemented.

## For AI agents / developers

**Start here:** [CONTEXT.md](./CONTEXT.md)

| Document | Contents |
|----------|----------|
| [CONTEXT.md](./CONTEXT.md) | Goals, decisions, flows, risks, next steps |
| [docs/API.md](./docs/API.md) | batchexecute RPCs: get, delete, upload, poll |
| [docs/NBLC-FORMAT.md](./docs/NBLC-FORMAT.md) | Self-contained compact file format (v1) |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Components, sequences, error handling |

## Related repo folders

- `../NotebookLM-Source-Downloader/` — working reference implementation (download only)
- `../NotebookLM-Ultra-Exporter.crx` — original extension used for reverse engineering

## External API references

- [notebooklm-py](https://github.com/teng-lin/notebooklm-py) — RPC reference & Python implementation
- [notebooklm-mcp-cli](https://github.com/jacob-bd/notebooklm-mcp-cli) — MCP wrapper docs

## Quick summary

**Compact:** select sources → fetch (`hizoJc`) → merge (NBLC) → upload (`izAoDd`) → delete originals (`tGMBJ`)

**Decompact:** fetch NBLC source → parse → upload each section → delete compacted source

**Portable decompact:** all metadata lives inside the uploaded NBLC markdown — no cross-browser storage dependency.

**Temporary storage:** `chrome.storage.local` only during operations; cleared after success.