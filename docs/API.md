# NotebookLM Internal API Reference (for Compactor)

Reverse-engineered APIs used by Chrome extensions. **Not official Google APIs** — may break when Google updates NotebookLM.

Primary external source of truth: [notebooklm-py RPC reference](https://github.com/teng-lin/notebooklm-py/blob/main/docs/rpc-reference.md) (verified 2026-06-17).

---

## Common request shape

```
POST https://notebooklm.google.com/_/LabsTailwindUi/data/batchexecute?{query}
Content-Type: application/x-www-form-urlencoded;charset=UTF-8
X-Same-Domain: 1
credentials: include  (session cookies)

Body: f.req={URL_ENCODED_JSON}&at={AT_TOKEN}&
```

### Query parameters

| Param | Description |
|-------|-------------|
| `rpcids` | RPC method ID (e.g. `hizoJc`) |
| `source-path` | `/notebook/{notebookId}` for notebook-scoped ops |
| `bl` | Frontend build label — extract from page HTML (`cfb2h` key) or env `NOTEBOOKLM_BL`. Source-Downloader hardcodes `boq_labs-tailwind-frontend_20260108.06_p0` (may need update). |
| `hl` | Language, e.g. `en` |
| `_reqid` | Random int for cache busting |
| `rt` | `c` |

### f.req structure

```json
[[["RPC_ID", "<params_json_string>", null, "generic"]]]
```

### AT token (CSRF)

Extract in content script:

1. `window.WIZ_global_data.SNlM0e`
2. Regex in `<script>`: `"SNlM0e":"([^"]+)"`
3. `[data-at]` attribute

Pass to background via message; background cannot access page `window`.

### Response parsing

Response is multi-line text. JSON payload line starts with `[[`. Strip anti-XSSI prefix `)]}'` if present.

```javascript
function parseBatchExecuteResponse(text) {
  for (const line of text.split("\n")) {
    if (!line.startsWith("[[")) continue;
    const parsed = JSON.parse(line);
    if (parsed[0]?.[2]) return JSON.parse(parsed[0][2]);
  }
  return null;
}
```

---

## Template block (required since Gemini 3.5 migration)

Old flat `[2], null, null` tails are rejected on migrated accounts.  
See: https://github.com/teng-lin/notebooklm-py/issues/1546

```javascript
function buildTemplateBlock() {
  return [2, null, null, [1, null, null, null, null, null, null, null, null, null, [1]]];
}
```

---

## RPC: GET_SOURCE — `hizoJc`

**Implemented in:** `background/source-api.js`. Originally adapted from `../NotebookLM-Source-Downloader/background/source-api.js`.

Fetch full text content of a source. Used for compact (fetch originals) and decompact (fetch NBLC bundle).

Compactor returns `url` and `sourceType` extracted from the source metadata array (`innerData[0][2]`):

- URL precedence: `metadata[7][0]` → `metadata[5][0]` (YouTube block) → `metadata[0]` if bare `http…`
- Type code: `metadata[4]` mapped to `youtube` (9), `web` (5), `text` (4), `pdf` (3), `gdoc` (1)

Prepends `Source: [url](url)` to content when URL is known. Content-script fallbacks: `extractUrlFromContent()` on markdown body.

### Params

```javascript
const params = [
  [sourceId],  // single-nested ID
  [2],         // output type: plain text
  [2],         // format selector
];
```

### Response parsing

Nested JSON segment tree → markdown. Parser walks `innerData[3][0][0]` segments:

- Text with heading levels 4/5/6 → `#` / `##` / `###`
- Bold, code, links from style arrays
- Tables from `segment[4]`

Returns `{ title, content, url?, sourceType? }`.

---

## RPC: DELETE_SOURCE — `tGMBJ`

**Implemented in:** Source-Downloader (Ultra Exporter original)

### Params

```javascript
const params = [[[sourceId]]];  // triple-nested for single delete
// Batch: [[[id1]], [[id2]], ...] with [2] suffix — see Ultra Exporter
```

`notebookId` goes in `source-path`, **not** in params.

### Ultra Exporter batch delete body

```javascript
const sourceIds = ["id1", "id2"];
const inner = JSON.stringify([sourceIds.map(id => [id]), [2]]);
const fReq = JSON.stringify([[[ "tGMBJ", inner, null, "generic"]]]);
```

---

## RPC: ADD_SOURCE — `izAoDd` (pasted text)

**Implemented as:** `addText` in `background/source-api.js`.

Maps to UI: **Add sources → Copied text → Insert**

### Params (pasted text)

```javascript
const params = [
  [[null, [title, content], null, 2, null, null, null, null, null, null, 1]],
  notebookId,
  buildTemplateBlock(),
];
```

- `[title, content]` at position 1 in 11-element source spec
- `2` at position 3 = `PASTED_TEXT` type code
- Trailing `1` = UI flag

### Response

Returns created source object with new `source_id`. Parse from `result[0]` per notebooklm-py `Source.from_api_response()`.

### Caveats

- **No server-side dedupe** for pasted text — running decompact twice creates duplicates
- Embed UUID in compacted title or check for existing NBLC source before upload
- Source enters `PROCESSING` (1) → poll until `READY` (2)

---

## RPC: ADD_SOURCE — URL / YouTube

**Implemented as:** `addUrl` and `addYoutube` in `background/source-api.js`.

```javascript
// Regular website — URL at position 2
[[null, null, [url], null, null, null, null, null, null, null, 1]]

// YouTube — URL at position 7 (NOT 2)
[[null, null, null, null, null, null, null, [url], null, null, 1]]
```

Both use `buildTemplateBlock()` tail. Detect: `youtube.com` or `youtu.be` → `addYoutube` (slot 7); otherwise `addUrl` (slot 2).

---

## RPC: ADD_SOURCE_FILE — `o4cbdc` (not needed v1)

Two-step file upload:

1. Register filename → get `SOURCE_ID`
2. Resumable upload to `https://notebooklm.google.com/upload/_/`

Compactor uses pasted text instead.

---

## RPC: GET_NOTEBOOK — `rLM1Ne` (poll source status)

### Params

```javascript
const params = [
  notebookId,
  null,
  buildTemplateBlock(),
  null,
  0,
];
```

### Source status codes

| Code | Meaning |
|------|---------|
| 1 | PROCESSING |
| 2 | READY |
| 3 | ERROR |
| 5 | PREPARING |

Poll after upload before deleting originals or proceeding with decompact uploads.

---

## Chrome extension message protocol

Extend Source-Downloader pattern:

```javascript
// Content → Background
chrome.runtime.sendMessage({
  type: "source-api",
  body: {
    action: "getContent" | "delete" | "addText" | "addUrl" | "addYoutube" | "getNotebook",
    sourceId,
    sourceIds,
    notebookId,
    atToken,
    blVersion,  // optional — from extractBlVersion(); falls back to DEFAULT_BL_VERSION
    title,      // addText
    content,    // addText
    url,        // addUrl / addYoutube
  },
});

// Background → Content
{ success: true, title, content, sourceId, ... }
{ success: false, error: "..." }
```

---

## Source type codes (metadata)

| Code | Type |
|------|------|
| 4 | PASTED_TEXT |
| 5 | WEB_PAGE |
| 9 | YOUTUBE |
| 3 | PDF |
| 1 | GOOGLE_DOCS |

Store string names in NBLC meta (`youtube`, `web`, `pdf`, `text`, `gdoc`).

---

## Implementation checklist for background/source-api.js

| Action | RPC | Compactor | Notes |
|--------|-----|-----------|-------|
| `getContent` | `hizoJc` | ✅ | Also in Source-Downloader |
| `addText` | `izAoDd` | ✅ | Pasted text upload; `buildTemplateBlock()` required |
| `getNotebook` | `rLM1Ne` | ✅ | Source status lookup |
| `waitForSourceReady` | `rLM1Ne` | ✅ | Poll until READY (2); exposed as message action |
| `delete` | `tGMBJ` | ✅ | Batch delete; adapted from Ultra Exporter |
| `addUrl` / `addYoutube` | `izAoDd` | ✅ | URL at slot 2; YouTube at slot 7 |
| Extract `bl` from page | — | ✅ | `extractBlVersion()` in content script; `DEFAULT_BL_VERSION` fallback |

### Compact / decompact flow notes (implemented)

- Pass `blVersion` from `extractBlVersion()` on every message; background falls back to `DEFAULT_BL_VERSION`.
- Use `buildTemplateBlock()` on all `izAoDd` and `rLM1Ne` calls (required on Gemini-migrated accounts).
- After any upload (`addText` / `addUrl` / `addYoutube`), parse new `source_id` via `background/rpc-parse.js`; poll before deleting originals or proceeding.
- On upload failure: keep `chrome.storage` pending entry; do **not** call `delete`.
- Decompact: `resolveDecompactUpload()` picks `addYoutube` / `addUrl` / `addText` per source; preview shows method before confirm.