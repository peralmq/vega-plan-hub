---
id: p5-05-batch-compare-handoff
title: Locked batch → compare handoff — price match + Mathem cart from a Claude Code session
phase: P5
status: in-progress
depends_on: [p4-03-planning-conversation, p5-04-ica-login-history-seeds]
---

## Goal

Close the loop from Telegram to checkout: after the household locks a
batch (p4-03), a human opens a Claude Code session on the M1 and runs
`npm run compare -- --batch latest` (or an explicit batch id). The CLI
signs in with the household account, pulls that batch's
`shopping_list_items` from Supabase, maps them into the p5-01 list
shape (store affinities from `product_preferences` included), and runs
the standard pipeline: per-store totals, fee-aware ranking, 🔁
rotation suggestion, and `--fill-cart mathem` when Mathem wins. The
p4-03 lock announcement gains one line telling the human the exact
handoff command with the batch id. Checkout, slot booking and payment
stay with the human, as always.

## Non-goals

- No bot-initiated compare runs: compare stays human-triggered from a
  Claude Code session (egress allow-list, WAF pacing, and cart review
  all want a human in the loop).
- No new cart integrations — `--fill-cart` remains Mathem-only; other
  winners get the ranked list + store link for manual carting.
- No quantity-aware cart fill: v1 keeps the existing one-unit-per-term
  additive behavior and prints the batch quantities alongside for
  human review (residual risk recorded below).
- No auto-checkout, ever (product.spec boundary).

## Context

The compare CLI (p5-01..04, done) takes a JSON list of search terms
with optional per-item store affinities. `shopping_list_items` rows
(p4-01 schema) carry canonical ingredient name, quantity, unit and
`batch_id`; `product_preferences` carries the household's store
affinities. Auth: reuse the household sign-in pattern from `bot/env.ts`
(mode-600 `.env`, never committed) — `compare/.env` grows
`SUPABASE_URL` + household credentials or shares `bot/.env` (pick in
step 1 and record why). `--batch latest` = most recently locked batch;
already-checked-off rows are excluded (they're bought).

## Progress

- [x] Credential/source decision recorded (share bot/.env vs. extend
      compare/.env) — 2026-08-27, see Evidence: extend `compare/.env`.
- [x] Batch → compare-list mapping (name, affinity, quantity
      annotation), fixture-tested — 2026-08-27.
- [x] `--batch <id|latest>` wired through the standard pipeline incl.
      `--fill-cart` and `--record` — 2026-08-27.
- [ ] p4-03 lock announcement includes the handoff command line —
      **deferred out of this change set**: an agent was concurrently
      working in the bot/ + src/lib planning code this step would touch
      (`bot/planning.ts`'s `lockBatch`, the announcement text's source),
      and this plan's footprint was scoped to `compare/**` only to avoid
      collision. Lands with p4-10's announcement wiring instead.
- [ ] Live: a real locked batch price-matched and carted from a
      Claude Code session, human checks out — **left for the human**:
      no credentials exist in this checkout and none were sought (see
      Evidence). Status stays `in-progress` until this is done.

## Steps

1. Decide and record the credential source; sign-in helper shared with
   the bot where practical.
2. Pure mapping function `batchRowsToCompareList` in `src/lib/` (or
   `compare/`, matching where storeCompare.ts logic lives):
   shopping_list_items + product_preferences → p5-01 list entries;
   fixture tests cover affinities, checked-off exclusion, and quantity
   annotations.
3. CLI flag `--batch <id|latest>`: fetch, map, then delegate to the
   existing pipeline unchanged; `--list` and `--batch` are mutually
   exclusive.
4. Extend the p4-03 lock announcement with the handoff line (batch
   short-id + exact command).
5. Live run on the first real locked batch; `--record` the store that
   got the order.

## Verification

- `./harness check` passes; mapping covered by fixture tests
  (affinity, checked-off exclusion, empty batch, unknown-preference
  rows).
- Dry: `--batch <fixture id> --json` against a seeded test batch
  matches the `--list` output for the equivalent hand-written list.
- Live: household locks a batch in Telegram → session here runs
  `--batch latest --fill-cart mathem` → cart URL reviewed → human
  checkout. Residual risk stated in the handoff: cart quantities are
  one unit per term; the printed quantity annotations are the human's
  cue to adjust in the cart before paying.

## Evidence

**Step 1 — credential source decision.** Extend `compare/.env` with
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `HOUSEHOLD_EMAIL`,
`HOUSEHOLD_PASSWORD` (`compare/env.ts`'s `loadBatchEnv`/`hasBatchAuth`)
— same key names as `bot/env.ts` so a value copies verbatim between the
two files, but compare/ does **not** read `bot/.env` directly. Why:
`docs/specs/tech.spec.md` ("Store integrations") already documents
compare/'s credentials as living in `compare/.env`, "bot/.env pattern"
— a same-shaped *sibling* file, not a shared one. `bot/` (a standing M1
daemon) and `compare/` (an ad hoc human-run CLI) are different
processes with different lifecycles; reading `bot/.env` from `compare/`
would make `compare/` unusable standalone and would have required
touching a directory this plan was explicitly scoped out of
(orchestrator constraint: another agent was concurrently working in
`bot/` + `src/lib` planning code — confirmed live via `git status` /
file mtimes during this session, see below).

**Step 2 — pure mapping, fixture-tested.** `compare/batchMap.ts`
(`batchRowsToCompareList`, `storeAffinityFromProductName`,
`formatQuantity`, `pickLatestBatch`) + `compare/batchMap.test.ts`.
`product_preferences` has no store column, so store affinity is
inferred from a store's own brand token appearing (whole-word) in the
household's preferred product name (e.g. "ICA Havredryck" → `["ica"]`);
no token match → `null` (unrestricted), the same convention a
hand-written `--list` entry uses.

```
$ npx vitest run compare/
 Test Files  2 passed (2)
      Tests  21 passed (21)
```

Fixture coverage per Verification: affinity mapping (incl. a
false-positive guard — "Icakupong"/"Coophallen" don't match), checked-off
exclusion, empty batch, rows with no preference / a superseded
preference, ad-hoc rows (no `canonical_ingredient`) falling back to
`display_name`, quantity-annotation formatting, `pickLatestBatch`'s pure
selection logic, and a "Dry" equivalence test: a batch built from
`fixtures/compare-list.json`'s terms maps to the exact same `{term,
stores}` list `parseListEntries` produces from that file directly.

**Step 3 — `--batch <id|latest>` wired through the pipeline.**
`compare/batchFetch.ts` (network I/O, evidence-only, same split as
`stores.ts`/`mathem-mcp.ts`: `signInHousehold`, `resolveBatchId`,
`fetchBatchRows`) + `compare/cli.ts` (`loadBatchList`, `--list`/`--batch`
mutual exclusivity, quantity annotations threaded into `printHuman`,
`printCartFill`, and the `--json` output as `batchAnnotations`).
`--fill-cart`, `--record`, `--json`, `--day`/`--window` all read from the
same `items: ListItem[]` the pipeline always used — nothing downstream
of `loadBatchList`/`readList` changed.

```
$ npx tsc -p compare/tsconfig.json
(no output — 0 errors)
```

**No live network calls or sign-in were attempted** — no credentials
exist in this checkout (`compare/.env` has only the existing store
credentials, no `SUPABASE_*`/`HOUSEHOLD_*` keys) and none were sought,
per instruction. `batchFetch.ts` is untested code, same as every other
network-I/O file in `compare/` (`stores.ts`, `mathem-mcp.ts`,
`axfood.ts`, `ica-auth.ts`) — its contract is exercised only by
`batchMap.ts`'s fixture tests plus the eventual live run.

**Harness gate.**

```
$ ./harness check
check: deps ... OK (73 deps present)
check: npm run lint ... OK (8/8 warnings)
check: npm test ... OK
check: npm run build ... OK
check: tsc bot ... OK
check: tsc compare ... OK
check: plans --validate ... plans validate: OK (31 plans)
check: validate-recipe ... validate-recipe: OK (30 recipes)
check: OK
```

Note: mid-implementation, a full `./harness check` run transiently
failed 7 tests, all inside `src/lib/planConversation.ts(.test.ts)`,
`src/lib/planDraft.ts`, `src/lib/botActions.ts`, and `bot/tools.test.ts`
— files this plan never touched (`git status` confirmed 0 changes by
this session to any of them; `stat` showed write timestamps seconds
old, matching the orchestrator's stated concurrent-agent collision in
`bot/` + `src/lib`). Re-running once that session's edits settled came
back fully green (above), with `compare/**` unchanged throughout.

**Commit:** recorded below after committing the scoped file set.
