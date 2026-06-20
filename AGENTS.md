# Agent instructions

Quick entry point for AI coding agents. **Full design lives in [CONTEXT.md](./CONTEXT.md)** — read that before making architectural changes.

**Browsers:** Chrome and Firefox (≥ 128). Firefox migration plan: [docs/FIREFOX_MIGRATION.md](./docs/FIREFOX_MIGRATION.md).

## Current status

| Phase | Status | Notes |
|-------|--------|-------|
| **1** | ✅ Done | NBLC merge/parse, Compact UI, `chrome.storage` backup, optional zip download. **No upload or delete.** |
| **2** | ✅ Done | `addText` (`izAoDd`), `getNotebook` poll (`rLM1Ne`), `delete` (`tGMBJ`), full compact flow |
| **3** | ✅ Done | Decompact UI + parse + upload N + delete compacted |
| **4** | ✅ Done | Smart URL/YouTube restore; dynamic `bl` extraction; YouTube URL capture fix |
| **5** | ✅ Done | Public-ready docs, consent gates, destructive confirmations, `SECURITY.md` |

**Extension version:** `1.0.0` (manifest) · **GitHub:** `ayv4zyan/NotebookLM-Compactor`

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
- **Consent:** `lib/user-consent.js` + `content/consent-modal.js` — first-run TERMS/PRIVACY; bump `TERMS_VERSION` when TERMS change.
- **Confirmations:** Compact `CONFIRM` phase and Decompact preview require explicit checkboxes before delete flows.

## Verification

```bash
node test/nblc-format.test.js
node test/rpc-parse.test.mjs
node test/source-api.test.mjs
```

CI runs all three on every push/PR to `main`.

## Git workflow

- **`main`** = stable; feature branches (e.g. `phase-2`) merged via PR.
- No long-lived `develop` branch.
- Release: tag `v*` (e.g. `v1.0.0`) → GitHub Action builds `notebooklm-compactor.zip` and attaches to Release.
- Pre-release: run [docs/MANUAL_TEST_CHECKLIST.md](./docs/MANUAL_TEST_CHECKLIST.md).

## Phase 4 checklist (complete)

1. ✅ Smart URL/YouTube restore from NBLC metadata (`izAoDd` URL slots).
2. ✅ Proactive `bl` extraction from page HTML (`cfb2h` via `extractBlVersion()`).
3. Manual test: see [docs/MANUAL_TEST_CHECKLIST.md](./docs/MANUAL_TEST_CHECKLIST.md) (not yet signed off).

## Resolved from planning

- Compact button: `inventory_2` icon in source panel header.
- `lib/` sharing: copy/adapt from Source-Downloader (not symlink).
- Decompact button: `unarchive` icon; enabled when exactly one NBLC-titled source is selected (`isNblcTitle()`).

## Open questions (still valid)

1. Exact NotebookLM source count limit (~50 assumed).
2. Max pasted-text source size — stress-test with 30+ long transcripts (not yet verified at scale).
3. ~~Whether to extract `bl` from page HTML proactively~~ — **resolved:** yes, with hardcoded fallback.