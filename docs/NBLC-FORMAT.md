# NBLC Format Specification (v1)

**NBLC** = NotebookLM Compactor bundle format.

A self-contained markdown document uploaded as a single pasted-text source. Contains everything required to decompact on **any machine** without extension storage.

---

## Design requirements

1. **Portable** — decompact reads only this file from NotebookLM
2. **Parseable** — unambiguous block boundaries
3. **Human-readable** — user can open source in NotebookLM viewer
4. **Model-friendly** — section titles visible for chat context
5. **Versioned** — `version: 1` for forward compatibility

---

## File structure

```
---NBLC-BUNDLE---
{yaml-like key: value header lines}
---END-BUNDLE---

---NBLC-SOURCE---
{per-source metadata lines}
---END-META---

# [index] Source Title

(source markdown content)

---NBLC-SOURCE---
...
```

---

## Bundle header

```markdown
---NBLC-BUNDLE---
version: 1
created: 2026-06-19T14:30:00Z
notebook: optional-notebook-slug-or-id
source_count: 33
compactor: NotebookLM-Compactor/1.3.1
---END-BUNDLE---

# NotebookLM Compactor Bundle

> 33 sources compacted. Restore with NotebookLM-Compactor extension (Decompact).
> Do not edit ---NBLC-SOURCE--- or ---NBLC-BUNDLE--- markers manually.
```

### Bundle fields

| Field | Required | Description |
|-------|----------|-------------|
| `version` | yes | Format version integer |
| `created` | yes | ISO 8601 UTC timestamp |
| `source_count` | yes | Number of source blocks (validator) |
| `notebook` | no | Notebook ID or slug for debugging |
| `compactor` | no | Extension name/version that created bundle |

---

## Per-source block

```markdown
---NBLC-SOURCE---
index: 7
original_id: a1b2c3d4-e5f6-7890-abcd-ef1234567890
title: Woke up tired, with ringing in your ears...
type: youtube
url: https://www.youtube.com/watch?v=xxxxx
---END-META---

# [7] Woke up tired, with ringing in your ears...

(content exactly as fetched from hizoJc, or normalized markdown)
```

### Meta fields

| Field | Required | Description |
|-------|----------|-------------|
| `index` | yes | 1-based stable index for citations `[N]` |
| `title` | yes | Original source title; used on decompact upload |
| `type` | yes | `youtube` \| `web` \| `pdf` \| `text` \| `gdoc` \| `markdown` \| `unknown` |
| `original_id` | no | NotebookLM UUID before delete (audit only; new IDs on restore) |
| `url` | no | Original URL if known — enables live link restore on decompact (`addYoutube` / `addUrl`) |

### Content rules

- Content follows `---END-META---` until next `---NBLC-SOURCE---` or EOF
- Leading `# [index] title` heading is **added by compactor** (not necessarily in original)
- Preserve fetched content as-is when possible
- If content contains `---NBLC-SOURCE---` literally, escape or use alternate delimiter (v1: unlikely; document if hit)

---

## Compacted source title (in NotebookLM UI)

Recommended pattern:

```
📦 NBLC · 33 sources · 2026-06-19
```

Optional UUID suffix for dedupe detection:

```
📦 NBLC · 33 sources · 2026-06-19 · a1b2c3d4
```

---

## Merge algorithm (compact)

```javascript
function compactSources(sources, { notebookId, version }) {
  const header = buildBundleHeader({ source_count: sources.length, notebook: notebookId });
  const blocks = sources.map((src, i) => buildSourceBlock({
    index: i + 1,
    original_id: src.id,
    title: src.title,
    type: src.type,
    url: src.url ?? null,
    content: src.content,
  }));
  return header + "\n\n" + blocks.join("\n\n");
}
```

Input `sources[]` from `hizoJc` fetch: `{ id, title, content, type, url? }`. Compact uses DOM icon type + API `sourceType` + `url` from metadata (`metadata[7]` / `metadata[5]`).

---

## Parse algorithm (decompact)

```javascript
function parseNblc(markdown) {
  // 1. Validate ---NBLC-BUNDLE--- / version (tolerate collapsed header lines)
  // 2. Try source extraction strategies in order:
  //    a. Split on ---NBLC-SOURCE--- markers (canonical)
  //    b. Split on ---END-META--- delimiters (markers stripped by NotebookLM)
  //    c. Split on # [N] Title / [N] Title headings (all --- lines stripped)
  // 3. Per block: parse meta lines (key: value) until ---END-META--- or heading
  // 4. Remainder = content (strip optional # [N] title line if duplicate of meta title)
  // 5. Verify source_count matches blocks.length
  return { bundle, sources: [{ index, title, type, url, original_id, content }] };
}
```

Parser must be **pure function** — testable without Chrome APIs.

### NotebookLM round-trip caveats

When a bundle is uploaded as pasted text and later fetched via `hizoJc`, NotebookLM may alter the markdown:

| Issue | Parser mitigation |
|-------|-------------------|
| Bundle header `key: value` lines collapsed onto one line | `normalizeMetaText()` splits inline known keys before parsing |
| `---NBLC-SOURCE---` lines stripped (treated as horizontal rules) | Fall back to `---END-META---` delimiters or `# [N] Title` headings |
| `---END-META---` also stripped | Fall back to indexed heading split; meta recovered from preceding `index:` lines when present |
| Headings returned without `#` prefix | Match `^#{0,3}\s*\[(\d+)\]\s+(.+)$` |

Bundles compacted with any extension version (`1.1.0`, `1.2.0`, etc.) remain decompactable as long as `version: 1` and indexed headings or meta lines survive.

---

## Decompact upload mapping

Implemented in `resolveDecompactUpload()` (`lib/nblc-format.js`). URL may come from `url:` meta or be recovered from section content (`Source:` line, markdown links, bare `youtube.com` / `youtu.be` URLs) when NotebookLM strips meta on round-trip.

| Condition | Upload action | RPC payload |
|-----------|---------------|-------------|
| `youtube` type + YouTube URL (meta or content) | `addYoutube` | `izAoDd` — URL at source-spec slot 7 |
| `web` type + URL (meta or content) | `addUrl` | `izAoDd` — URL at source-spec slot 2 |
| YouTube URL found, type unknown | `addYoutube` | inferred from URL hostname |
| No recoverable URL (e.g. `pdf`, pasted text) | `addText` | `izAoDd` — `title` + `content` |
| `pdf` | `addText` only | cannot restore binary PDF |

Decompact preview shows restore method per source. Warning `no URL found — will paste transcript` means live link restore is not possible for that section.

**Note:** Bundles compacted before `v1.3.1` may lack `url:` meta (YouTube URLs were not extracted correctly during compact). Re-compact from originals to store URLs.

---

## Validation checks

Before delete originals (compact):

- `source_count` in header matches selected count
- Each block has `index`, `title`, `content`
- Total character count under NotebookLM limit (TBD — test empirically)

Before decompact:

- File contains `---NBLC-BUNDLE---` and `version: 1`
- At least one `---NBLC-SOURCE---` block
- Warn if source title doesn't match `📦 NBLC` pattern (user may still confirm)

---

## Example minimal bundle (2 sources)

```markdown
---NBLC-BUNDLE---
version: 1
created: 2026-06-19T12:00:00Z
source_count: 2
---END-BUNDLE---

# NotebookLM Compactor Bundle

> 2 sources compacted.

---NBLC-SOURCE---
index: 1
original_id: abc-111
title: First Source
type: text
---END-META---

# [1] First Source

Hello from source one.

---NBLC-SOURCE---
index: 2
original_id: abc-222
title: Second Source
type: youtube
url: https://www.youtube.com/watch?v=dQw4w9WgXcQ
---END-META---

# [2] Second Source

Transcript content here.
```

---

## Versioning policy

- v1: initial spec (this document)
- v2+: breaking changes increment `version`; parser supports v1 indefinitely

Store `docs/NBLC-FORMAT.md` version in bundle `compactor` field for traceability.