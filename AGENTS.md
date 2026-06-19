# Agent instructions

Quick entry point for AI coding agents. **Full design lives in [CONTEXT.md](./CONTEXT.md)** — read that before making architectural changes.

## Current status

| Phase | Status | Notes |
|-------|--------|-------|
| **1** | ✅ Done | NBLC merge/parse, Compact UI, `chrome.storage` backup, optional zip download. **No upload or delete.** |
| **2** | ✅ Done | `addText` (`izAoDd`), `getNotebook` poll (`rLM1Ne`), `delete` (`tGMBJ`), full compact flow |
| **3** | ✅ Done | Decompact UI + parse + upload N + delete compacted |
| **4** | Planned | Smart URL/YouTube restore; dynamic `bl` extraction |

**Extension version:** `1.2.0` (manifest) · **GitHub:** private repo `ayv4zyan/NotebookLM-Compactor`

## Before you code

1. Read [CONTEXT.md](./CONTEXT.md) — goals, flows, storage schema, risks.
2. Read [docs/API.md](./docs/API.md) for RPC payloads (especially `buildTemplateBlock()`).
3. Read [docs/NBLC-FORMAT.md](./docs/NBLC-FORMAT.md) if touching merge/parse.
4. Reference `../NotebookLM-Source-Downloader/` for patterns — **do not modify it in place**; copy/adapt into this repo.

## Conventions

- **Namespace:** `window.NBLC` (not `NBLSD` from Source-Downloader).
- **Message protocol:** `{ type: "source-api", body: { action, ... } }`.
- **Background:** MV3 service worker with `"type": "module"`.
- **MutationObserver:** inject-once + `requestAnimationFrame` debounce in `lib/source-panel-inject.js`. Never remove and reinsert buttons on every DOM mutation — caused NotebookLM page freeze.
- **NBLC format:** pure functions in `lib/nblc-format.js` — no Chrome APIs; keep unit-testable. Parser must tolerate NotebookLM round-trip (collapsed headers, stripped `---` markers) — see `docs/NBLC-FORMAT.md`.
- **Storage:** `chrome.storage.local` is a temporary rollback buffer only; cleared on success.

## Verification

```bash
node test/nblc-format.test.js
node test/rpc-parse.test.mjs
```

CI runs both on every push/PR to `main`.

## Git workflow

- **`main`** = stable; feature branches (e.g. `phase-2`) merged via PR.
- No long-lived `develop` branch.
- Release: tag `v*` (e.g. `v1.2.0`) → GitHub Action builds `notebooklm-compactor.zip` and attaches to Release.

## Phase 4 checklist (next agent task)

1. Smart URL/YouTube restore from NBLC metadata (`izAoDd` URL slots).
2. Proactive `bl` extraction from page HTML.
3. Manual test: compact on one notebook, decompact on same or different machine (same Google account).

## Resolved from planning

- Compact button: `inventory_2` icon in source panel header.
- `lib/` sharing: copy/adapt from Source-Downloader (not symlink).
- Decompact button: `unarchive` icon; enabled when exactly one NBLC-titled source is selected (`isNblcTitle()`).

## Open questions (still valid)

1. Exact NotebookLM source count limit (~50 assumed).
2. Max pasted-text source size — stress-test with 30+ long transcripts (not yet verified at scale).
3. Whether to extract `bl` from page HTML proactively (Phase 4).