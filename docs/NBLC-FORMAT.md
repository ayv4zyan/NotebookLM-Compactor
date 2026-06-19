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
compactor: NotebookLM-Compactor/1.0.0
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
| `url` | no | Original URL if known — enables Phase 4 smart re-import |

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

Input `sources[]` from `hizoJc` fetch: `{ id, title, content, type, url? }`.

---

## Parse algorithm (decompact)

```javascript
function parseNblc(markdown) {
  // 1. Validate ---NBLC-BUNDLE--- / version
  // 2. Split on /^---NBLC-SOURCE---$/m
  // 3. Per block: parse meta lines (key: value) until ---END-META---
  // 4. Remainder = content (strip optional # [N] title line if duplicate of meta title)
  // 5. Verify source_count matches blocks.length
  return { bundle, sources: [{ index, title, type, url, original_id, content }] };
}
```

Parser must be **pure function** — testable without Chrome APIs.

---

## Decompact upload mapping

| meta.type | v1 action | Phase 4 action |
|-----------|-----------|----------------|
| any | `izAoDd` pasted text with `title` + `content` | — |
| `youtube` + url | pasted text | `izAoDd` YouTube URL at slot 7 |
| `web` + url | pasted text | `izAoDd` web URL at slot 2 |
| `pdf` | pasted text only | cannot restore binary PDF |

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