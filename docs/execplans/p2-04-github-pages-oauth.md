---
id: p2-04-github-pages-oauth
title: Configure GitHub Pages deployment OAuth
phase: P2
status: done
depends_on: [p2-02-mock-auth-mode]
---

## Goal

Make Google sign-in work on the GitHub Pages deployment at
`https://peralmq.github.io/vega-plan-hub/` in addition to the Lovable
preview/published URLs. The app already uses `lovable.auth.signInWithOAuth`
with a dynamic `redirect_uri = window.location.origin`, so the only
requirements are backend allow-list configuration and the Google Cloud
Console OAuth client settings.

## Non-goals

- No code changes to the sign-in flow (already implemented in previous
  session).
- No custom Google OAuth credentials required (Lovable Cloud-managed
  credentials are used; user can still supply their own later).
- No changes to the GitHub Actions deploy workflow.

## Context

Supabase auth uses a configured Site URL and redirect allow-list. The app
overrides the redirect target at runtime with `redirect_uri`, but that URI
must be allowed by Supabase and accepted by the Google OAuth client. In the
previous session the Supabase allow-list was updated and the user confirmed
the Google Cloud Console changes.

## Progress

- [x] Supabase redirect allow-list includes `https://peralmq.github.io/vega-plan-hub/**`
- [x] Google Cloud Console authorized JavaScript origin includes `https://peralmq.github.io`
- [x] Google Cloud Console authorized redirect URI includes `https://fbssmpypnakawxxvvgvo.supabase.co/auth/v1/callback`
- [x] App uses dynamic `redirect_uri: window.location.origin` so sign-in returns to the same origin

## Steps

1. Add `https://peralmq.github.io/vega-plan-hub/**` to the Supabase redirect
   allow-list.
2. In the Google Cloud Console OAuth web client, add
   `https://peralmq.github.io` as an authorized JavaScript origin.
3. In the same client, add the Supabase callback
   `https://fbssmpypnakawxxvvgvo.supabase.co/auth/v1/callback` as an
   authorized redirect URI.
4. Confirm the app sign-in code passes `redirect_uri: window.location.origin`.

## Verification

- User confirmed all Google Cloud Console fields are set.
- Supabase side verified in the previous session:
  - Site URL is `https://vega-plan-hub.lovable.app`.
  - GitHub Pages URL is present in the redirect allow-list.
  - OAuth server is disabled (not needed for managed Google sign-in).

## Evidence

### Supabase auth allow-list (verified via `supabase--debug_oauth_server`)

```
Site URL: https://vega-plan-hub.lovable.app
Redirect URLs: https://peralmq.github.io/vega-plan-hub/**
OAuth server: disabled
```

### Google Cloud Console configuration (confirmed by user)

- Authorized JavaScript origins: `https://peralmq.github.io`
- Authorized redirect URIs: `https://fbssmpypnakawxxvvgvo.supabase.co/auth/v1/callback`

### Code path

`src/contexts/AuthContext.tsx` uses `lovable.auth.signInWithOAuth('google', {
redirect_uri: window.location.origin })`, so any successful OAuth provider
redirect returns the user to the same origin they started from (e.g. the
GitHub Pages URL or the Lovable published URL).

### Handoff

Google Cloud Console OAuth setup is complete; no further action required.
