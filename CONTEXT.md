# NotebookLM-Compactor — Agent Context

**Read this file first.** It captures the full design, API knowledge, and decisions from the planning session.

**Implementation status (2026-06-20):** Phases 1–5 complete. Chrome + Firefox dual-browser support on `main`. Stable release **`v1.0.0`** (dual-browser zips + per-account source limit in Compact UI). Manual QA signed off in [docs/MANUAL_TEST_CHECKLIST.md](./docs/MANUAL_TEST_CHECKLIST.md). See [AGENTS.md](./AGENTS.md) for a short agent entry point.

## Project goal

Chrome and Firefox extension that **reduces NotebookLM source count** by merging many sources into one, while supporting **lossless decompact** on any machine.

### Problem

NotebookLM’s practical limit is **source count** per notebook, not total bytes. Users with many YouTube links, PDFs, and pasted notes hit the count ceiling before size limits.

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

### 5. Decompact restore strategy

- **YouTube / web** with recoverable URL → `addYoutube` / `addUrl` (live link sources)
- **Everything else** (pdf, text, missing URL) → `addText` (pasted transcript/content)
- URL from `url:` meta or recovered from section content when NotebookLM strips meta on round-trip

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

| Operation | RPC ID | Status in Compactor |
|-----------|--------|---------------------|
| Get source content | `hizoJc` | ✅ Phase 1 (`background/source-api.js`) |
| Delete source(s) | `tGMBJ` | ✅ Phase 2 (batch delete) |
| Add pasted text | `izAoDd` | ✅ Phase 2 |
| Add file (PDF etc.) | `o4cbdc` + resumable upload | 📋 Not needed v1 |
| List notebook / poll status | `rLM1Ne` | ✅ Phase 2 (`waitForSourceReady`) |
| Re-add URL / YouTube | `izAoDd` (different payload slots) | ✅ Done |
| Account source limit | `ZwVcOc` (`getUserSettings`) | ✅ Compact quota panel |

Auth: `window.WIZ_global_data.SNlM0e` or regex in page scripts. `batchexecute` requests use `credentials: 'include'` from the **content script** (`lib/runtime-messaging.js` → `content/batchexecute-bridge.js`) so session cookies are available in Firefox; background worker is fallback for storage sweep and legacy routing.

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

| Phase | Deliverable | Status |
|-------|-------------|--------|
| **1** | NBLC merge/split + Compact UI + local backup in storage + download zip option. **No delete, no upload.** | ✅ Done |
| **2** | `addText` + `waitForSourceReady` + full compact with delete | ✅ Done |
| **3** | Decompact UI + parse + upload N + delete compacted | ✅ Done |
| **4** | Smart restore: URL/YouTube from metadata; extract `bl` from page HTML | ✅ Done |

### Compact behavior (current)

Select sources → fetch (`hizoJc`, captures `url` + `sourceType` from metadata) → merge NBLC → `chrome.storage` backup → upload as pasted text → poll until READY → delete originals → clear storage. Optional backup zip on success. On upload failure: storage retained, originals unchanged. On delete failure after upload: storage retained, both compacted and originals remain.

### Decompact behavior (current)

Select one NBLC-titled source → fetch bundle (`hizoJc`) → parse with round-trip fallbacks → preview (shows restore method per source) → upload each section via `addYoutube`, `addUrl`, or `addText` (`izAoDd` + `waitForSourceReady`) → delete compacted source → clear storage. YouTube/web sources restore as live links when `url` is in meta or recoverable from section content. Works cross-machine without extension storage. On partial upload failure: storage retains progress; retry resumes from next source. Older bundles without `url:` metadata may lack stored URLs — re-compact to enable live link restore.

---

## Current file structure

```
NotebookLM-Compactor/
  AGENTS.md                  ← short agent entry (status, conventions)
  CONTEXT.md                 ← this file (full design)
  README.md
  manifest.json              ✅ v1.0.0 (Chrome-canonical; Firefox uses dist/firefox)
  LICENSE TERMS.md PRIVACY.md SECURITY.md
  .github/workflows/         ✅ ci.yml (build + tests + web-ext lint), release.yml (two zips on v* tag)
  scripts/
    build-extension.mjs      ✅ dist/chrome + dist/firefox
    build-manifest.mjs       ✅ service_worker vs background.scripts
    build-background.mjs     ✅ bundles background/index.js → background.bundle.js
    build-content-api.mjs    ✅ bundles batchexecute client for content scripts
  docs/
    API.md  NBLC-FORMAT.md  ARCHITECTURE.md  FIREFOX.md
    CHROME_WEB_STORE.md  AMO_LISTING.md  FIREFOX_MIGRATION.md  MANUAL_TEST_CHECKLIST.md
  background/
    index.js                 ✅ message router + stale storage sweep
    source-api.js            ✅ batchexecute actions (shared with content-script bridge)
    batchexecute-parse.js    ✅ response parsing (shared module)
    rpc-parse.js             ✅ source ID / status / account limits parsing (unit tested)
    storage-sweep.js
    background.bundle.js     ← built artifact (gitignored; created by build scripts)
  lib/
    notebooklm-api.js        ✅ DOM scrape, AT token, extractBlVersion, isNblcSource
    source-panel-inject.js   ✅ Compact (inventory_2) + Decompact (unarchive) buttons
    nblc-format.js           ✅ compactSources, parseNblc, validateNblc, resolveDecompactUpload
    manifest-store.js        ✅ pending-compact / pending-decompact keys
    user-consent.js          ✅ TERMS version + acceptance storage
    modal-a11y.js            ✅ focus trap, escape close, aria
    runtime-messaging.js     ✅ routes API calls to content-script batchexecute client
    batchexecute-client.bundle.js  ← built artifact (gitignored)
  content/
    content.js  consent-modal.js  compact-modal.js  decompact-modal.js
    recovery-banner.js  batchexecute-bridge.js  modal.css
  test/
    nblc-format.test.js  rpc-parse.test.mjs  source-api.test.mjs  batchexecute-parse.test.mjs
  vendor/jszip.min.js        ✅ optional backup zip
  icons/
  dist/                      ← build output (gitignored): chrome/ and firefox/
```

**Git repo:** `ayv4zyan/NotebookLM-Compactor`. Sibling `NotebookLM-Source-Downloader/` lives outside this repo.

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
| NotebookLM alters NBLC markers on storage | Parser fallbacks: collapsed header lines, `---END-META---` delimiters, `# [N] Title` headings (see `docs/NBLC-FORMAT.md`) |

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
2. **Dual-browser background**: Chrome MV3 uses `background.service_worker`; Firefox MV3 uses `background.scripts` (event page). Build via `scripts/build-extension.mjs` — one codebase, two dist trees.
3. **Content-script API**: `batchexecute` runs in the content script (session cookies). `lib/runtime-messaging.js` prefers in-page client; falls back to `chrome.runtime.sendMessage` → background.
4. **Message protocol**: `{ type: "source-api", body: { action, ... } }`.

---

## Open questions for implementer

1. Max pasted-text source size — stress-test with 30+ long YouTube transcripts (not yet verified at scale).
2. ~~Whether to share `lib/` via copy or monorepo symlink~~ — **resolved:** copy/adapt from Source-Downloader.
3. ~~Compact button label/icon~~ — **resolved:** `inventory_2` icon. ~~Decompact button~~ — **resolved:** `unarchive` icon; enabled when exactly one NBLC-titled source is selected (`isNblcTitle()`).

---

## Repo layout

```
NotebookLM Compactor/              # parent workspace (not a git repo)
  NotebookLM-Ultra-Exporter.crx    # original reverse-engineering source
  extracted/                       # unpacked CRX (reference only)
  NotebookLM-Source-Downloader/    # ✅ working download extension (sibling)
  NotebookLM-Compactor/            # ✅ this extension — git repo, manifest `1.0.0`, dual-browser on main
```

---

## Next steps for agent

Dual-browser code, manual QA, and stable release `v1.0.0` are complete on `main`. **AMO listing live** at [addons.mozilla.org/firefox/addon/notebooklm-compactor](https://addons.mozilla.org/firefox/addon/notebooklm-compactor/) (v1.0.2, approved 2026-06-21). Remaining maintainer action: optional Chrome Web Store ([docs/FIREFOX_MIGRATION.md](./docs/FIREFOX_MIGRATION.md)). Open research: stress-test 30+ long transcripts at scale.