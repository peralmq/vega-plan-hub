---
id: p4-13-recipe-images
title: Every recipe has a picture — audit, fill, fall back, ratchet
phase: P4
status: todo
depends_on: [p1-05-validate-recipe]
---

## Goal

No recipe ever renders imageless (directive Pelle 2026-08-27, from
the p4-11 phone test): every recipe's `imageUrl` is present and
loads; a recipe missing one gets an appropriate sourced image for
that type of dish; the UI falls back to `public/placeholder.svg` on
load error instead of a broken tile; and `./harness validate-recipe`
ratchets to require a non-empty `imageUrl` so the gap can never
silently return. recipe-format.spec's empty-string allowance is
removed in the same change set (pre-authorized by the directive).

## Non-goals

- No image reachability check in the harness: `check` must stay
  deterministic and offline — liveness is handled by the UI fallback,
  not the gate.
- No redesign of image layout/scrims (design.spec rules stand).
- No bulk re-hosting of *working* external images.

## Context

Corpus: 31 recipes in `src/data/recipes/`. Known gap:
`swedish-vegan-hash-with-tofu-egg.md` has `imageUrl: ""` (the one
grandfathered case named in recipe-format.spec). Other `imageUrl`s
are absolute URLs to source sites — some may 404/hotlink-block;
audit with curl and replace dead ones. Replacement images: find an
appropriate, rights-reasonable image for the dish type (source-site
image preferred; otherwise a stable image downloaded into
`public/recipes/` — recipe-format.spec already allows a filename).
UI: recipe images render in Cook Mode, the pool picker, Plan Mode's
picker — the `onError` → placeholder fallback belongs in the shared
image component(s), not per page.

## Progress

- [ ] Audit: every imageUrl curl-checked, dead/missing list recorded
      in Evidence
- [ ] Fills: missing/dead images replaced (sourced or downloaded to
      `public/recipes/`)
- [ ] UI fallback to placeholder.svg on image error, covered by a test
- [ ] validate-recipe requires non-empty imageUrl;
      recipe-format.spec updated in the same change set
- [ ] `./harness check` green

## Steps

1. Audit script (scratch, not committed): curl -sI every imageUrl,
   record status per recipe in Evidence.
2. Fill `swedish-vegan-hash-with-tofu-egg` and any dead-link recipes:
   pick an image that actually depicts the dish type; prefer the
   recipe's own source site; else download a suitable image into
   `public/recipes/<id>.<ext>` and set `imageUrl` to that filename.
3. Shared image fallback: `onError` swap to `placeholder.svg`
   (component-level), unit/e2e-tested with a deliberately broken URL.
4. Ratchet: validate-recipe rejects empty `imageUrl`; update
   recipe-format.spec's field table accordingly; fixture for the
   rejection.
5. `./harness check` + `./harness e2e`; evidence; commit.

## Verification

- `./harness validate-recipe` fails on an `imageUrl: ""` fixture and
  passes the full corpus.
- `./harness check` + e2e green; the broken-URL test shows the
  placeholder, not a broken image.
- Spot-check in the app: the hash recipe shows its new image.

## Evidence

(recorded during implementation)
