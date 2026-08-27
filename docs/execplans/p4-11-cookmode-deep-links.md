---
id: p4-11-cookmode-deep-links
title: Cook Mode deep links — ?recipe=<id>&x=<multiplier> opens the dish, scaled
phase: P4
status: todo
depends_on: [p3-01-kreuzberg-redesign]
---

## Goal

`https://peralmq.github.io/vega-plan-hub/?recipe=mapo-tofu&x=2` opens
Cook Mode with Mapo Tofu selected and ×2 scaling applied. This is the
link target contract the Telegram surfaces need (r1 Script 4's
"[🍳 Cook mode] deep-links with tonight's scaling applied", and every
per-meal link in the p4-10 menu card + PDF). Query params on the
existing `/` route — no new route, no Pages 404 trick needed, since
the base URL serves `index.html` directly.

## Non-goals

- No hash-based routing change; `BrowserRouter` + `basename` stays.
- No shareable public recipe pages: `/` remains auth-gated — the deep
  link lands on `/welcome` for logged-out visitors and must resume
  correctly after login.
- No link generation here — producing the URLs is p4-10's job; this
  plan only makes them land.

## Context

Today recipe selection in `CookMode` is in-page state
(`selectedRecipe`); nothing reads the URL. Contract to implement:
`recipe` = markdown recipe id (unknown id → normal Cook Mode plus a
friendly 🤷 toast, never a crash); `x` = servings multiplier (float,
clamped to the app's allowed range; absent → the planned meal's own
multiplier if the recipe is in the active plan, else 1). The param
must survive the `ProtectedRoute` → `/welcome` → login round-trip
(preserve the full query through the auth redirect). Routes/UX are
spec'd: extend design.spec's Cook Mode row with the deep-link
contract in the same change set (directive Pelle 2026-08-27).

## Progress

- [ ] Param parsing + selection wiring in CookMode, unit-tested
      (unknown id, bad multiplier, no param)
- [ ] Auth round-trip preserves the query (e2e or component test)
- [ ] design.spec Cook Mode row extended with the contract
- [ ] Live: link from a phone opens the scaled recipe on Pages

## Steps

1. Parse `recipe`/`x` in CookMode (or a small hook) and drive the
   existing selection state; toast-and-fallback on unknown ids.
2. Preserve query through `ProtectedRoute`/`AuthRoute` redirects.
3. Update design.spec (Cook Mode capabilities + deep-link contract).
4. Tests: unit for parsing/clamping/fallback; e2e for the logged-in
   happy path and the login round-trip (mock-auth mode, p2-02).

## Verification

- `./harness check` passes; new tests cover unknown id, clamped `x`,
  param-less default, and query survival across the auth redirect.
- Live on Pages: `?recipe=<id>&x=2` from a phone (logged out, then
  logging in) ends on the scaled recipe.

## Evidence

(recorded during implementation)
