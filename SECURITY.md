# Security & Compliance Posture

**Last updated:** 2026-06-19

This document describes how NotebookLM Compactor is designed to minimize risk to users and to respect third-party service boundaries. It is not legal advice.

## Design principles

| Principle | How we implement it |
|-----------|---------------------|
| User-initiated only | Compact and Decompact run only after explicit clicks and confirmations in the NotebookLM UI |
| Session-scoped access | Uses the browser's existing Google login on `notebooklm.google.com`; no separate credentials |
| Least privilege | Permissions limited to `storage` and `https://notebooklm.google.com/*` |
| No author servers | No telemetry, analytics, or backend operated by the extension authors |
| Transparent destructive actions | First-run terms + per-operation acknowledgments before delete flows |
| Rate-conscious requests | Minimum spacing between NotebookLM RPC calls in the background worker |

## Data flow

```
User on notebooklm.google.com
  → selects sources, opens modal, confirms
  → content script messages background worker
  → background worker POSTs to notebooklm.google.com (user cookies)
  → optional temporary state in chrome.storage.local
  → cleared on success or after 24h stale sweep
```

The extension authors never receive notebook content.

## What we do not do

- Scrape or poll notebooks in the background without user action
- Access sites other than `notebooklm.google.com`
- Store Google passwords or long-lived tokens outside the browser session
- Redistribute Google's client code or trademarks
- Impersonate Google or NotebookLM in branding or behavior

## Third-party terms

Use of NotebookLM is governed by [Google's Terms of Service](https://policies.google.com/terms) and applicable product policies. This extension is not endorsed by Google. Users are responsible for their own accounts.

## Reporting issues

Security or privacy concerns:

https://github.com/ayv4zyan/NotebookLM-Compactor/issues

Please do not post notebook content or session tokens in public issues.