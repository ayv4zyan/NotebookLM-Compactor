# Firefox install and usage

End-user guide for installing and using NotebookLM Compactor in Firefox.

**Maintainers:** AMO submission, release runbook, and QA gates are in [FIREFOX_MIGRATION.md](./FIREFOX_MIGRATION.md).

## Requirements

| Requirement | Detail |
|-------------|--------|
| **Firefox version** | **128.0 or newer** (Manifest V3 event-page background) |
| **NotebookLM account** | Logged into [notebooklm.google.com](https://notebooklm.google.com) in the same Firefox profile |
| **Network** | Access to `notebooklm.google.com` (extension does not call other hosts) |

## Install from AMO (recommended when available)

Once the listing is approved, install from Mozilla Add-ons:

> **Placeholder:** `https://addons.mozilla.org/en-US/firefox/addon/notebooklm-compactor/`  
> This URL will be updated after AMO approval. Until then, use a release zip or temporary load below.

1. Open the AMO listing URL above.
2. Click **Add to Firefox** and confirm the permission prompt.
3. Open [notebooklm.google.com](https://notebooklm.google.com) — Compact and Decompact buttons appear in the source panel when you select sources.

AMO-signed installs persist across browser restarts (unlike temporary loads).

## Install from a release zip

Firefox needs a different background manifest than Chrome (`background.scripts` instead of `background.service_worker`). Use the Firefox release zip.

1. Open [Releases](https://github.com/ayv4zyan/NotebookLM-Compactor/releases) and download `notebooklm-compactor-firefox.zip` for the latest `v*` tag.
2. Unzip to a folder that contains `manifest.json` at its root.
3. Open `about:debugging` in Firefox.
4. Click **This Firefox** (left sidebar).
5. Click **Load Temporary Add-on…** and select `manifest.json` inside the unzipped folder.

> **Note:** Temporary add-ons are removed when Firefox restarts. Re-load from `about:debugging` after each restart, or install from AMO once the listing is live.

## Install from source (development)

```bash
git clone https://github.com/ayv4zyan/NotebookLM-Compactor.git
cd NotebookLM-Compactor
node scripts/build-extension.mjs
```

Then load via **Load Temporary Add-on…** in `about:debugging` → **This Firefox**, pointing at `dist/firefox/manifest.json` (not the repo-root `manifest.json`, which is Chrome-only).

Temporary loads expire on browser restart — same as the release zip method above.

## Usage

1. Open [notebooklm.google.com](https://notebooklm.google.com) and open a notebook.
2. In the **source panel**, select the sources you want to merge.
3. Click the **Compact** button (`inventory_2` icon) in the panel header.
4. Review the preview, optionally enable backup zip, then confirm.

To restore a bundle:

1. Select **exactly one** source whose title starts with `📦 NBLC ·`.
2. Click **Decompact** (`unarchive` icon).
3. Review the restore plan (live link vs pasted text per source), then confirm.

Buttons appear only on `notebooklm.google.com` — there is no toolbar popup.

## Limitations

| Topic | Detail |
|-------|--------|
| **Temporary add-on expiry** | Loads via `about:debugging` are removed on Firefox restart. Use AMO install for a permanent add-on. |
| **AMO availability** | First AMO review may take days to weeks after maintainers submit. Check [Releases](https://github.com/ayv4zyan/NotebookLM-Compactor/releases) or this doc for the live AMO URL. |
| **Unofficial interface** | The extension uses your existing NotebookLM browser session. It does not use a published Google API. NotebookLM may change or block this at any time. |
| **Terms of Service** | You must comply with [Google's Terms of Service](https://policies.google.com/terms). This project is not affiliated with Google. See [TERMS.md](../TERMS.md). |
| **Compact deletes originals** | After a successful upload there is no undo. Enable **"Also download backup zip on success"** in the Compact modal, or download the NBLC / backup zip manually before proceeding. |
| **Source count / bundle size** | Assumes NotebookLM's ~50-source-per-notebook limit. Very large merges are untested at scale. |
| **Storage** | `browser.storage.local` holds a temporary rollback buffer during operations only; cleared on success. |

## Troubleshooting

### "Not logged in" or fetch failures

- Confirm you are signed into Google at [notebooklm.google.com](https://notebooklm.google.com) in the **same Firefox profile** as the extension.
- Refresh the notebook page and try again.
- If you use containers or strict tracking protection, test in a normal window with the default profile first.

### Compact / Decompact buttons missing

- Ensure the extension is loaded: `about:debugging` → **This Firefox** should list **NotebookLM Compactor** (or check AMO install under `about:addons`).
- You must be on `notebooklm.google.com` with a notebook open and sources visible in the panel.
- After a Firefox restart, re-load a temporary add-on from `about:debugging`.

### Operation stuck or background errors

1. Open `about:debugging` → **This Firefox**.
2. Find **NotebookLM Compactor** → click **Inspect** next to the service worker.
3. Check the Console for errors during Compact or Decompact.
4. If the service worker shows as stopped, trigger the operation again from the notebook page (user actions wake the worker).

Long Decompact runs (many sources) keep the service worker active for extended polling — this is expected.

### Backup zip download does not start

- Confirm you enabled **"Also download backup zip on success"** before confirming Compact.
- Check Firefox's download permission / popup blocker for the NotebookLM tab.
- Backup zips are built client-side with vendored JSZip; no network upload of the zip occurs.

### Recovery banner after interrupted operation

If a previous operation left stale progress data, a recovery banner may appear on the notebook page. Follow its instructions or wait — stale entries are removed automatically after 24 hours.

## Privacy and legal

No telemetry, no author-operated servers. Data leaves your browser only when you run Compact or Decompact, and only to `notebooklm.google.com` using your existing login.

- [PRIVACY.md](../PRIVACY.md)
- [TERMS.md](../TERMS.md)
- [SECURITY.md](../SECURITY.md)

NotebookLM and Google are trademarks of Google LLC. This extension is independent and is not affiliated with, endorsed, or sponsored by Google.