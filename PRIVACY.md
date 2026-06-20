# Privacy Policy — NotebookLM Compactor

**Last updated:** 2026-06-20

This Privacy Policy describes how the NotebookLM Compactor browser extension ("Extension") handles information.

The Extension is an independent open-source project. It is **not** affiliated with Google LLC or NotebookLM.

## Summary

- We do **not** run servers or collect analytics.
- We do **not** sell or share your data with third parties.
- Data stays on your device except when **you** trigger requests to NotebookLM using your existing Google login.

## Information the Extension accesses

When you use Compact or Decompact, the Extension may access:

| Data | Why | Where it goes |
|------|-----|---------------|
| NotebookLM source text and metadata | Merge, upload, restore, or delete sources you selected | Sent to `notebooklm.google.com` over HTTPS using your browser session |
| Notebook IDs and source IDs | Identify which notebook and sources you selected | Used locally and in requests to NotebookLM |
| Session cookies / auth tokens | Reuse your existing logged-in NotebookLM session | Read from the browser context; sent only to Google endpoints the web app already uses |
| Temporary operation state | Rollback if an operation fails mid-flight | Stored in browser extension local storage (`chrome.storage.local` / WebExtensions storage API) on your device |

The Extension does not ask for your Google password. It does not add separate sign-in.

## Local storage

The Extension uses browser extension local storage (`chrome.storage.local` / WebExtensions storage API) as a **temporary workflow buffer** during compact or decompact operations. It stores progress metadata (for example, which sources finished uploading), not a second copy of your full notebook text — the NBLC bundle stays in NotebookLM. On success, local data is cleared. Stale entries older than 24 hours are removed on extension startup.

You can also download optional backup files (NBLC markdown or zip) to your computer when you choose.

## What we do not collect

The Extension does **not**:

- Send data to the Extension authors or any third-party backend
- Include telemetry, crash reporting, or advertising SDKs
- Track browsing outside `notebooklm.google.com`

## Permissions explained

| Permission | Purpose |
|------------|---------|
| `storage` / `unlimitedStorage` | Temporary rollback progress during large compact/decompact operations |
| `host_permissions: https://notebooklm.google.com/*` | Communicate with NotebookLM only when you run Compact or Decompact |

## Data retention and deletion

- **On your device:** temporary storage is cleared after successful operations or by the stale-entry sweep.
- **On NotebookLM:** changes you confirm (uploads, deletes) follow Google's data practices for your account. The Extension authors do not control Google's retention.

To remove local Extension data, uninstall the Extension or clear its storage in `chrome://extensions`.

## Children

The Extension is not directed at children under 13 (or the minimum age required for a Google Account in your region).

## Changes

We may update this policy by posting a revised version in this repository. The "Last updated" date will change when we do.

## Contact

Privacy questions:

https://github.com/ayv4zyan/NotebookLM-Compactor/issues

For how Google handles NotebookLM account data, see [Google's Privacy Policy](https://policies.google.com/privacy).