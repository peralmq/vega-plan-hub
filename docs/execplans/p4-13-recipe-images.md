---
id: p4-13-recipe-images
title: Every recipe has a picture — audit, fill, fall back, ratchet
phase: P4
status: done
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

- [x] Audit: every imageUrl curl-checked, dead/missing list recorded
      in Evidence (2026-08-27)
- [x] Fills: missing/dead images replaced (sourced or downloaded to
      `public/recipes/`) (2026-08-27)
- [x] UI fallback to placeholder.svg on image error, covered by a test
      (2026-08-27)
- [x] validate-recipe requires non-empty imageUrl;
      recipe-format.spec updated in the same change set (2026-08-27)
- [x] `./harness check` green (2026-08-27)

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

### Audit (2026-08-27)

Initial pass — `curl -sI -L -A "<browser UA>" -e "$url" "$url"` (HEAD,
follow redirects, referer = the image's own URL) over all 31 files'
`imageUrl` (network via `dangerouslyDisableSandbox` — the default Bash
sandbox has no outbound network):

```
baked-vegan-feta-pasta            404
chana-dal                         200
chili-sin-carne-with-chipotle     200
classic-indian-dal-tadka-dal      200
creamy-potato-leek-soup           200   (later found to be a false negative, see below)
deluxe-aglio-e-olio               200
fredagsmys-tacos                  200
indian-garlic-dal                 200
maa-ki-dal-black-lentil-dal       200
mapo-tofu                         200   (later found to be a false negative, see below)
masoor-dal                        200
oumph-bourguignon                 404
palak-paneer                      200
peanut-noodles-tofu               200
saffron-scented-lentil-stew...    200
shorbet-adas-lebanese-lentil-soup 200
summer-rolls-peanut-sauce         200
swedish-vegan-hash-with-tofu-egg  EMPTY (the grandfathered "" case)
tofustroganoff                    200
vegan-beluga-bolognese            200
vegan-carbonara-green-peas        200
vegan-cowboy-soup                 200
vegan-dan-dan-noodles             200
vegan-dillkott-potatoes           200
vegan-kalpudding                  200
vegan-meatballs-brown-sauce       404
vegan-meatballs-creamed-macaroni  200
vegan-moussaka                    404
vegan-satay-skewers-peanut-sauce  404
vegan-sushi-rolls                 200
```

6 fixtures needing a fill: `baked-vegan-feta-pasta`, `oumph-bourguignon`,
`vegan-meatballs-brown-sauce`, `vegan-moussaka`,
`vegan-satay-skewers-peanut-sauce` (all real 404s, confirmed again with
a plain GET + the recipe's own page as Referer — not a hotlink false
negative), and `swedish-vegan-hash-with-tofu-egg` (empty).

### Fills — round 1 (source-site og:image or fresh stock photo)

| recipe | new `imageUrl` | source |
| --- | --- | --- |
| `baked-vegan-feta-pasta` | `https://www.theedgyveg.com/wp-content/uploads/2021/07/DSC00392WEB-e1627403400765.jpg` | og:image of the recipe's own `url` (theedgyveg.com) |
| `vegan-moussaka` | `https://rainbowplantlife.com/wp-content/uploads/2022/10/Moussaka-cover-1-of-1.jpg` | og:image of the recipe's own `url` (rainbowplantlife.com) |
| `vegan-satay-skewers-peanut-sauce` | `https://www.cilantroandcitronella.com/wp-content/uploads/2016/01/vegan-satay-image-5.jpg` | og:image of the recipe's own `url` (cilantroandcitronella.com) |
| `swedish-vegan-hash-with-tofu-egg` | `https://www.felix.se/wp-content/uploads/sites/117/2026/08/510003921.png` | og:image of the recipe's own `url` (felix.se product page — the Felix Krögarpytt package this recipe is built on) |
| `oumph-bourguignon` | `/recipes/oumph-bourguignon.jpg` (downloaded) | Unsplash `photo-1608500219063` — no `url` frontmatter field on this recipe (nothing to prefer over stock), same photoshoot series as the dead `photo-1608500218807` it replaces |
| `vegan-meatballs-brown-sauce` | `/recipes/vegan-meatballs-brown-sauce.jpg` (downloaded) | Unsplash `photo-1712594533988` — no `url` frontmatter field; classic Swedish meatballs/mash/lingon/cucumber plate |

Each candidate image was downloaded and visually inspected (Read tool,
image view) before use to confirm it genuinely depicts the dish — not
just that the URL 200s.

### Round 2 — live-browser spot-check caught 2 curl false positives

Spot-checking in the running app (dev-mock, `./harness dev-mock`) via
the Browser pane's `javascript_tool`, testing every rendered `<img>`
with the real cross-origin request a browser makes, found 2 more
recipes whose `imageUrl` curl reported `200` for but that actually
render nothing (`RecipeImage`'s fallback fired, i.e. the DOM `src` had
already swapped to `/placeholder.svg`):

- `mapo-tofu` (`chinasichuanfood.com`): hotlink-blocks on `Referer`.
  `curl` without a `Referer` header got `200`; with
  `-H "Referer: http://localhost:8080/"` (what a real cross-origin
  `<img>` sends) it's `403`.
- `creamy-potato-leek-soup` (`liveslowrunfar.com`): the `-819x1024`
  sized variant now 200s but serves `Content-Type: text/html` (a
  WordPress "attachment not found" page), not image bytes — a curl
  status-code-only check missed this; a `Content-Type` check catches
  it.

Re-ran the audit with both a spoofed cross-origin `Referer` and a
`Content-Type: image/*` check for all 30 recipes (after the round-1
fills) — 0 failures:

```
$ curl -sI -L -A "<browser UA>" -H "Referer: http://localhost:8080/" "$url"
# ... (per-recipe) status must be 200 AND content-type must start with "image/"
fail=0
```

Fills — round 2:

| recipe | new `imageUrl` | source |
| --- | --- | --- |
| `mapo-tofu` | `/recipes/mapo-tofu.webp` (downloaded, 67.8 KB) | chinasichuanfood.com's own image, fetched once with the site's own page as Referer (bypasses the hotlink block for the one-time download; re-hosting locally avoids depending on that block's absence at runtime) |
| `creamy-potato-leek-soup` | `/recipes/creamy-potato-leek-soup.jpg` (downloaded, 87.1 KB) | og:image of the recipe's own `url` (liveslowrunfar.com), via Jetpack's `i2.wp.com` Photon CDN — bytes verified correct (`fetch()` + blob decode, 1000×1250 JPEG) but downloaded rather than hotlinked after the live `<img>` tag intermittently 0-width'd in the Browser-pane sandbox even though `fetch()` to the identical URL succeeded; downloading removes the ambiguity entirely |

All 4 downloaded files verified under the 500 KB ceiling with `ls -la
public/recipes/`: 87 KB, 68 KB, 395 KB, 127 KB.

### Final audit — all 30 recipes, cross-origin Referer + Content-Type check

```
$ ./harness validate-recipe
validate-recipe: OK (30 recipes)
```

29 external `imageUrl`s all `200` + `content-type: image/*` with a
spoofed `Referer: http://localhost:8080/`; 4 recipes use a local
`/recipes/<id>.<ext>` file, all present on disk.

### Live-browser confirmation (dev-mock)

`./harness dev-mock` (Vite dev server, `VITE_MOCK_AUTH=true`), driven
via the Browser-pane tools. Opened Plan Mode's "Add a dish" picker
(renders all 30 recipes' images at once) and waited for every `<img>`
to settle:

```js
// Browser-pane javascript_tool, after opening the picker
function waitAllImgs() { /* wait for every <img>.complete */ }
// result:
{"total":35,"uniqueRecipes":30,"bad":[]}   // "bad" = placeholder.svg or naturalWidth 0
```

Zero recipes fell back to the placeholder. Screenshots confirmed
visually: `swedish-vegan-hash-with-tofu-egg` shows the Felix Krögarpytt
package photo, `creamy-potato-leek-soup` shows the soup (previously a
gray placeholder box), `mapo-tofu` and `oumph-bourguignon` and
`vegan-meatballs-brown-sauce` all show the correct dish.

### UI fallback

Added `src/components/recipe/RecipeImage.tsx` — the single shared
`onError` → `/placeholder.svg` swap, used by all 6 recipe-image render
sites (`src/pages/PlanMode.tsx` ×2, `src/pages/CookMode.tsx` ×3,
`src/pages/ShoppingSummary.tsx` ×1), replacing bare `<img>` tags.

e2e test `e2e/recipe-image-fallback.spec.ts`: routes chana-dal's real
`imageUrl` to a `404`, navigates to Cook Mode, and asserts the
rendered `<img>`'s `src` ends in `/placeholder.svg`:

```
$ ./harness e2e e2e/recipe-image-fallback.spec.ts
✓  a broken recipe image falls back to placeholder.svg, not a broken tile (296ms)
1 passed (4.2s)
```

### Ratchet

`harness`'s `validateRecipeFrontmatter` now fails on `fm.imageUrl ===
""` (previously only checked presence/type). `fixtures/recipes/malformed-empty-image-url.md`
added as the rejection fixture:

```
$ ./harness validate-recipe fixtures/recipes/malformed-empty-image-url.md
FAIL: .../malformed-empty-image-url.md: frontmatter.imageUrl must not be empty (p4-13-recipe-images: every recipe renders an image; see docs/specs/recipe-format.spec.md)
```

`docs/specs/recipe-format.spec.md`'s `imageUrl` field-table row updated:
removed the empty-string allowance and the `swedish-vegan-hash-with-tofu-egg`
grandfather clause; documents the two supported non-empty shapes
(absolute `https://` URL, or a root-relative `/recipes/<file>` path into
`public/recipes/`). `src/services/recipeLoader.test.ts`'s stale comment/assertion
(previously asserting only `typeof === 'string'`, with a comment citing
the now-removed empty-string case) updated to also assert `toBeTruthy()`.

### Full gate

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

$ ./harness e2e
Running 21 tests using 5 workers
  21 passed (11.8s)
```

### Files changed

- `harness` — imageUrl ratchet.
- `docs/specs/recipe-format.spec.md` — field-table update (plan-authorized).
- `fixtures/recipes/malformed-empty-image-url.md` — new rejection fixture.
- `src/components/recipe/RecipeImage.tsx` — new shared fallback component.
- `src/pages/PlanMode.tsx`, `src/pages/CookMode.tsx`, `src/pages/ShoppingSummary.tsx` — `<img>` → `<RecipeImage>`.
- `e2e/recipe-image-fallback.spec.ts` — new e2e test.
- `src/services/recipeLoader.test.ts` — stale comment/assertion fix.
- `src/data/recipes/{baked-vegan-feta-pasta,vegan-moussaka,vegan-satay-skewers-peanut-sauce,swedish-vegan-hash-with-tofu-egg,oumph-bourguignon,vegan-meatballs-brown-sauce,mapo-tofu,creamy-potato-leek-soup}.md` — `imageUrl` fills/fixes (8 recipes).
- `public/recipes/{oumph-bourguignon.jpg,vegan-meatballs-brown-sauce.jpg,mapo-tofu.webp,creamy-potato-leek-soup.jpg}` — new downloaded images (4 files, 87–395 KB each).

### Residual risk

- Non-goal, by design: no reachability gate in `./harness check` (stays
  offline/deterministic) — a source site can still go dark after this
  commit; the UI fallback is the safety net for that, not a rebuilt
  gate.
- The 22 remaining hotlinked source-site images are outside this
  plan's fix list (they audited clean); if any of those blogs
  reorganize their media library later, `RecipeImage`'s placeholder
  fallback covers it live, same as it now does for chana-dal in the
  e2e test.
