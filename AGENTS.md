# Agent instructions

Quick entry point for AI coding agents. **Full design lives in [CONTEXT.md](./CONTEXT.md)** — read that before making architectural changes.

## Current status

| Phase | Status | Notes |
|-------|--------|-------|
| **1** | ✅ Done | NBLC merge/parse, Compact UI, `chrome.storage` backup, optional zip download. **No upload or delete.** |
| **2** | 🔜 Next | `addText` (`izAoDd`), `getNotebook` poll (`rLM1Ne`), `delete` (`tGMBJ`), full compact flow |
| **3** | Planned | Decompact UI + parse + upload N + delete compacted |
| **4** | Planned | Smart URL/YouTube restore; dynamic `bl` extraction |

**Extension version:** `1.0.0` (manifest) · **GitHub:** private repo `ayv4zyan/NotebookLM-Compactor`

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
- **NBLC format:** pure functions in `lib/nblc-format.js` — no Chrome APIs; keep unit-testable.
- **Storage:** `chrome.storage.local` is a temporary rollback buffer only; cleared on success.

## Verification

```bash
node test/nblc-format.test.js
```

CI runs the same test on every push/PR to `main`.

## Git workflow

- **`main`** = stable; feature branches (e.g. `phase-2`) merged via PR.
- No long-lived `develop` branch.
- Release: tag `v*` (e.g. `v1.0.0`) → GitHub Action builds `notebooklm-compactor.zip` and attaches to Release.

## Phase 2 checklist (next agent task)

1. Add `addText`, `getNotebook`, `delete` actions to `background/source-api.js` per `docs/API.md`.
2. Implement `waitForSourceReady()` (poll `rLM1Ne` until status `2`).
3. Extend `content/compact-modal.js`: upload NBLC → poll READY → delete originals → clear storage.
4. Remove or replace Phase 1 preview banner when upload path is live.
5. Add tests where possible; manual test on notebooklm.google.com with 2–3 small sources.

## Resolved from planning

- Compact button: `inventory_2` icon in source panel header.
- `lib/` sharing: copy/adapt from Source-Downloader (not symlink).
- Decompact button: Phase 3; show only for NBLC-titled sources (`isNblcTitle()`).

## Open questions (still valid)

1. Exact NotebookLM source count limit (~50 assumed).
2. Max pasted-text source size — test with 30+ long transcripts in Phase 2.
3. Whether to extract `bl` from page HTML proactively (Phase 4).