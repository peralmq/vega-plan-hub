---
id: p5-01-store-comparison-spike
title: Store comparison spike — Mathem MCP + multi-chain price/delivery compare
phase: P5
status: todo
depends_on: [p4-02-capture-bot]
---

## Goal

From a Vega shopping list, produce a cross-store comparison the
household can act on: per store, the matched basket with total price,
unmatched items, and — the decision-driving filter — **whether the
store can deliver on day X around time Y** to the household address.
Stores in scope: **Mathem via its official MCP server** (launched
2026-08-07, OAuth + dynamic client registration verified 2026-08-16)
and **Willys / Hemköp / Coop via Erik Hellman's MIT-licensed CLI
suite** (willys-agent, hemkop-cli, coop-cli — the same trio his
food-shopping-agent drives). Direction set by Pelle 2026-08-16.

This is a spike: it ends in working prototype evidence, a gate brief,
and the tech.spec boundary wording for the follow-up implementation
plan — not in shipped product surface.

## Non-goals

- **No checkout or payment automation, ever** — the community's
  "cart-ready, never checkout" convention is also ours; the flow ends
  with the human reviewing cart + slot in the store's own UI.
- No store credentials in the repo — bot/.env pattern on the M1 only
  (r6 runbook), same as the Telegram token.
- No new Supabase schema in this spike (any persistence lands with
  the implementation plan, ask-first as usual).
- No web-admin UI work — output is CLI/agent-consumable JSON plus a
  readable summary; surfaces come later.

## Context

Research base: docs/research/store-integration-landscape.md (two
rounds, 2026-08-15). Facts verified 2026-08-16 that this plan builds
on:

- Mathem's OAuth AS (`https://www.mathem.se/o`) supports **dynamic
  client registration** (`/o/register/`), authorization-code + PKCE
  S256, refresh tokens, scope `mcp`, token auth `none` — a
  self-registered hobby client is possible; no partnership needed.
  MCP resource: `https://www.mathem.se/mcp` (401 + resource metadata
  confirmed). Tool list unknown until we complete OAuth.
- Hellman's four repos are all **MIT** (last pushed 2026-03-28):
  search + cart add/clear per chain; auth personnummer/email +
  password per chain. **None of them touch delivery slots** — the
  day-X/time-Y filter is our own work.
- Known slot surfaces: Willys/Hemköp (same Axfood platform)
  `/axfood/rest/tms/delivery-slots?postalCode=` + pickup variants,
  login-required (reference implementation: jimmystridh/willys-mcp,
  19 tools incl. slot selection). Mathem: marcusforsberg/ha-mathem
  does slot selection with a session; the official MCP may expose
  slots — check first. Coop: unknown, investigate in coop-cli's API
  or via the site.
- Prior art to study before writing code: simonnordberg/veckomenyn
  (pluggable store backends), ErikHellman/food-shopping-agent (the
  compare-and-fill-cheapest agentic loop this plan generalizes).

## Steps

1. **Mathem MCP first.** Register a client at `/o/register/`, run the
   authorization-code + PKCE flow with the household Mathem account
   (human step: Pelle logs in / approves — one step, per working
   agreement), then enumerate tools. Record: does it cover search,
   cart, shopping lists, delivery slots? Does an MCP-filled cart
   appear for review in the normal mathem.se checkout?
2. **Hellman CLIs.** Build/install willys-agent, hemkop-cli,
   coop-cli on the M1; verify each still works against the current
   sites (they're from March). Household accounts per chain are
   human steps (created by Pelle, credentials straight into
   bot/.env — never echoed). Chains without an account the household
   wants can be dropped; price-compare value degrades gracefully.
3. **Slot availability per store.** Implement a read-only
   `delivery_check(store, postalCode, date, timeWindow)` probe:
   Axfood pair via `tms/delivery-slots`; Mathem via MCP tool if one
   exists, else the session ajax; Coop per findings from step 2.
   Output: matching slots (start, end, price) or "cannot deliver".
4. **Comparison harness.** A script that takes a shopping list
   (fixture file in the Vega list shape) + target day/time-window and
   emits per-store JSON: matched items with prices, unmatched items,
   basket total, delivery options passing the filter — plus a human
   summary table. Product matching reuses
   `src/lib/ingredientNormalization` canonical names as search terms.
5. **Fixture the deterministic parts** (self-improvement rule):
   matching logic and comparison assembly run from committed fixture
   API responses in `./harness check`; live calls stay in the spike
   evidence only.
6. **Gate brief.** Evidence: one real household list compared across
   the working stores with the delivery filter live. Propose the
   tech.spec boundary wording (store integrations as outbound calls
   from the adopted M1 host; credential handling; which chains) and
   the p5-02 implementation plan scope. Spec change is Pelle's
   decision at the gate.

## Verification

- `./harness check` passes, including new comparison fixtures.
- Comparison harness on a fixture list: deterministic output from
  cached responses — per-store totals, unmatched items, and slot
  filter results match committed expectations.
- Live evidence recorded: Mathem MCP tool list; each working chain's
  cart filled from a real list and visible in that store's UI;
  `delivery_check` returning real slots for the household postal code
  filtered to a day/time-window; at least one store correctly
  excluded by the filter (no slots in window) if reality provides
  one.
- No credential material anywhere in the repo or evidence text.

## Evidence

(none yet — plan drafted 2026-08-16 from Pelle's direction +
verified OAuth/licensing/slot-gap facts recorded in Context)
