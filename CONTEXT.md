# NotebookLM-Compactor — Agent Context

**Read this file first.** It captures the full design, API knowledge, and decisions from the planning session. Implementation has not started yet (documentation-only scaffold as of 2026-06-19).

## Project goal

Chrome extension that **reduces NotebookLM source count** by merging many sources into one, while supporting **lossless decompact** on any machine.

### Problem

NotebookLM’s practical limit is **source count** (~50 per notebook), not total bytes. Users with many YouTube links, PDFs, and pasted notes hit the count ceiling before size limits.

### Solution

1. User selects sources → clicks **Compact**
2. Extension fetches content via internal API, merges into one **NBLC** (self-describing) document
3. Uploads compacted source to NotebookLM
4. Deletes original sources (only after successful upload)
5. **Decompact** reverses: parse NBLC → upload N separate sources → delete compacted blob

### Sibling extension (already built)

`../NotebookLM-Source-Downloader/` — read-only export. Shares patterns:

- `lib/notebooklm-api.js` — DOM scraping, AT token, source IDs
- `lib/source-panel-inject.js` — inject button into source panel (MutationObserver; **must not** remove/reinsert on every mutation — caused page freeze)
- `background/source-api.js` — `hizoJc` (get content), background message routing

Compactor reuses these patterns and adds upload + compact/decompact logic.

---

## Core design decisions (agreed)

### 1. NBLC file is the only portable source of truth

Decompact must work **on any PC / any browser** without extension storage.

- Compact on PC A → sync via Google account → decompact on PC B
- Extension on PC B only reads the compacted source from NotebookLM
- Full manifest embedded in the uploaded markdown (see `docs/NBLC-FORMAT.md`)

### 2. chrome.storage is temporary workflow buffer only

Used during compact/decompact to avoid annoying the user with zip downloads.

- Store fetched sources + in-progress state for **rollback**
- **Clear on success** (compact or decompact completed)
- Keep on failure until user retries or dismisses
- Optional setting: “Also download backup zip” (off by default)
- Stale entry cleanup (>24h) on extension load

**Not** used for cross-PC decompact.

### 3. Backup before delete (mandatory order)

```
fetch → merge → store in chrome.storage → upload → wait READY → delete originals → clear storage
```

If upload fails → **abort delete**.

### 4. Citation / attribution

NotebookLM cites **source titles** in the panel, not sub-sections inside a merged file.

Mitigation in NBLC content:

- Each section: `# [index] Original Title`
- Meta block per source: title, type, url, original_id
- Compacted source title: `📦 NBLC · N sources · YYYY-MM-DD`

We cannot change NotebookLM’s citation UI. Structure content so model and human can identify origins.

### 5. Decompact restores pasted-text sources

v1: all restored sources via `izAoDd` pasted text.  
Phase 4: re-add YouTube/URL from stored `url` metadata when available.

### 6. Separate extension

Keep `NotebookLM-Source-Downloader` unchanged. Compactor is a new folder in the same repo.

---

## User flows

### Compact

1. User checks sources in NotebookLM source panel
2. Clicks **Compact** (injected button, same area as Downloader’s download button)
3. Modal: confirm selection, filter, preview count
4. Background: fetch each source (`hizoJc`)
5. Build NBLC markdown
6. Write to `chrome.storage` (silent backup)
7. Upload as pasted text (`izAoDd`) — title e.g. `📦 NBLC · 33 sources · 2026-06-19`
8. Poll until source `READY` (`rLM1Ne`)
9. Delete originals (`tGMBJ`)
10. Clear `chrome.storage` on success

### Decompact

1. User selects the compacted NBLC source (or opens from source detail)
2. Clicks **Decompact**
3. Fetch compacted content (`hizoJc`)
4. Parse NBLC blocks (no storage required for manifest)
5. Optionally cache sections in `chrome.storage` while uploading
6. Upload each section (`izAoDd`, original title + body)
7. Poll each until ready (or batch with progress UI)
8. Delete compacted source (`tGMBJ`)
9. Clear `chrome.storage` on success

---

## API summary

Full details: `docs/API.md`

| Operation | RPC ID | Status in repo |
|-----------|--------|----------------|
| Get source content | `hizoJc` | ✅ Source-Downloader |
| Delete source(s) | `tGMBJ` | ✅ Source-Downloader |
| Add pasted text | `izAoDd` | 📋 Documented, not implemented |
| Add file (PDF etc.) | `o4cbdc` + resumable upload | 📋 Documented, not needed v1 |
| List notebook / poll status | `rLM1Ne` | 📋 Documented, not implemented |
| Re-add URL / YouTube | `izAoDd` (different payload slots) | 📋 Phase 4 |

Auth: `window.WIZ_global_data.SNlM0e` or regex in page scripts. Session cookies via `credentials: 'include'`.

Endpoint: `POST https://notebooklm.google.com/_/LabsTailwindUi/data/batchexecute`

External references:

- https://github.com/teng-lin/notebooklm-py (best RPC reference, updated 2026-06)
- https://github.com/jacob-bd/notebooklm-mcp-cli
- notebooklm-py `docs/rpc-reference.md`, `src/notebooklm/_source/add.py`

---

## NBLC format

Full spec: `docs/NBLC-FORMAT.md`

Self-contained markdown uploaded as one source. Contains bundle header + per-source meta blocks + content. Parser must work without extension storage.

---

## chrome.storage schema (temporary)

```
pending-compact/{notebookId}/
  phase: "fetched" | "uploaded" | "deleting" | "done"
  sources: [{ id, title, content, type, url }]
  compactedContent: string
  compactedSourceId: string | null
  createdAt: ISO timestamp

pending-decompact/{notebookId}/
  phase: "parsed" | "uploading" | "deleting" | "done"
  sections: [{ index, title, content, type, url }]
  compactedSourceId: string
  createdAt: ISO timestamp
```

Cleanup: remove key on success; keep on failure; sweep stale >24h.

---

## Implementation phases

| Phase | Deliverable |
|-------|-------------|
| **1** | NBLC merge/split + Compact UI + local backup in storage + download zip option. **No delete, no upload.** |
| **2** | `addTextSource` + `waitForSourceReady` + full compact with delete |
| **3** | Decompact UI + parse + upload N + delete compacted |
| **4** | Smart restore: URL/YouTube from metadata; extract `bl` from page HTML |

---

## Planned file structure

```
NotebookLM-Compactor/
  CONTEXT.md                 ← this file (agent entry point)
  README.md
  docs/
    API.md
    NBLC-FORMAT.md
    ARCHITECTURE.md
  manifest.json              (not created yet)
  background/
    index.js
    source-api.js            extend Source-Downloader: add, delete, get, list
  lib/
    notebooklm-api.js        copy/adapt from Source-Downloader
    source-panel-inject.js   Compact + Decompact buttons
    nblc-format.js           merge + parse
    manifest-store.js        chrome.storage lifecycle
  content/
    content.js
    compact-modal.js
    decompact-modal.js
    modal.css
  vendor/                    jszip if needed for optional backup zip
```

---

## Known risks

| Risk | Mitigation |
|------|------------|
| Google changes RPC payloads | Use `templateBlock` from notebooklm-py; extract `bl` from page |
| Single compacted file too large | Warn user; split into multiple compact bundles |
| Pasted text no dedupe | Guard decompact: detect existing NBLC or UUID in title |
| Delete is irreversible | storage backup + abort delete if upload fails |
| MutationObserver freeze | Only inject if button missing; debounce with rAF (see Source-Downloader fix) |
| Source processing delay | Poll `rLM1Ne` until status READY (2) before delete |

---

## DOM selectors (from Source-Downloader)

```javascript
SOURCE_ITEM: ".single-source-container"
SOURCE_TITLE: ".source-title"
SOURCE_MORE_BUTTON: '[id^="source-item-more-button-"]'  // id suffix = source UUID
SOURCE_CHECKBOX: '.select-checkbox input[type="checkbox"]'
SOURCE_PANEL: ".source-panel"
PANEL_HEADER_BUTTONS: ".panel-header > div:last-child"
```

Notebook ID: `/notebook/([a-f0-9-]+)` from `window.location.pathname`

---

## Lessons from Source-Downloader

1. **MutationObserver**: Never remove+reinsert buttons on every DOM mutation — causes NotebookLM to freeze (main thread infinite loop).
2. **Background module**: MV3 service worker with `"type": "module"`.
3. **Message protocol**: `{ type: "source-api", body: { action, ... } }`.

---

## Open questions for implementer

1. Exact NotebookLM source count limit (assume ~50; verify in UI when testing).
2. Max pasted-text source size — test with 30+ long YouTube transcripts.
3. Whether to share `lib/` via copy or monorepo symlink (currently: copy/adapt).
4. Compact button label/icon and whether Decompact appears only on NBLC-titled sources.

---

## Repo layout

```
NotebookLM Compactor/
  NotebookLM-Ultra-Exporter.crx    # original reverse-engineering source
  extracted/                       # unpacked CRX (reference only)
  NotebookLM-Source-Downloader/    # ✅ working download extension
  NotebookLM-Compactor/            # 📋 this project (docs scaffold)
```

---

## Next steps for agent

1. Read `docs/API.md` and `docs/NBLC-FORMAT.md`
2. Copy/adapt `notebooklm-api.js`, `source-panel-inject.js`, `background/source-api.js` from Source-Downloader
3. Implement `lib/nblc-format.js` (merge + parse) with unit-testable pure functions
4. Implement `addTextSource` in background per API doc
5. Build Phase 1 (compact to storage + optional zip, no upload/delete) for safe testing