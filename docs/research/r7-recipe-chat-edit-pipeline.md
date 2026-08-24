# R7 — Recipe edits via Telegram chat, end-to-end to the deployed cooking view

Research date: 2026-08-24. Question: can a family member chat with the
Vega bot ("mindre stark nästa gång", "double the sauce") and have the
recipe databank updated so the change shows up automatically in the
deployed CookMode view — including the git commit + CI leg?

## Verdict

**Yes, and most of the plumbing already exists.** The blockers are
contract, not code: three human-sign-off amendments (tool surface,
egress allow-list, possibly an LLM dependency) and one new execplan.
Expected chat-confirm → live latency: **~1–2 minutes**.

## What exists today (verified in-repo)

- **Intake is done.** Telegram → edge function `telegram-capture`
  (secret-token check, `telegram_accounts` allow-list) → `telegram_inbox`
  → the M1 consumer (`bot/consumer.ts`) drains via outbound Realtime +
  15 s sweep. Zero inbound ports. A recipe-edit feature needs **no new
  transport** — just a new intent in `src/lib/intentParser.ts` and a new
  tool in `bot/tools.ts`. (External research suggested grammY + long
  polling; superseded — the existing webhook→inbox pipeline is strictly
  better for this household and already live.)
- **Recipes are markdown-in-repo, bundled at build time**
  (`src/data/recipes/*.md`, loaded eagerly by
  `src/services/recipeLoader.ts`). CookMode has no runtime recipe fetch,
  so an edit **must** land as a commit on `main` to appear — the
  user's assumption holds.
- **CI + deploy are done.** Push to `main` → `check.yml` (full
  `./harness check`) and `deploy-pages.yml` (Vite build → GitHub Pages
  at peralmq.github.io/vega-plan-hub). Historical CI evidence: ~36 s for
  the check job; Pages job lighter. Lovable also republishes on push
  (second host — confirm that's intended for bot-authored commits).
- **A deterministic pre-flight exists.** `./harness validate-recipe
  <file>` validates a single file in milliseconds — the bot can gate
  every LLM-proposed edit locally *before* committing; CI re-runs the
  same check as a safety net.
- **The use case is already sketched.** r1 Script 4 is literally
  "mindre stark nästa gång → noted on the recipe"; the `note_recipe`
  intent exists in the parser but routes to `UNSUPPORTED` in
  `botActions.ts`. `.github/prompts/add-recipe.prompt.md` is a head
  start on the authoring prompt (stale: its example tag `Curry` is not
  in `ALLOWED_TAGS`).

## Proposed pipeline

```
wife ──Telegram──▶ telegram-capture ──▶ telegram_inbox ──▶ M1 consumer
                                                              │
                                     LLM edit loop (iterate until she
                                     confirms; every draft passes
                                     ./harness validate-recipe)
                                                              │
                                     publish_recipe_edit tool:
                                     write file → validate → commit
                                     (templated message) → push main
                                                              │
                     GitHub: check.yml + deploy-pages.yml (~1–2 min)
                                                              │
                     bot polls for deployed SHA ──▶ "✅ live!" message
```

## Decision points

### A. LLM for the edit loop

| Option | Pros | Cons |
|---|---|---|
| **Keep local Ollama (qwen3:8b)** — recommended start | No new dependency, no new egress, spec-compliant today, free | May struggle with strict frontmatter/table format; mitigated by validator-retry loop and by starting with templated edits (see MVP) |
| Direct Anthropic Messages API + hand-written tools | Deterministic, cheap (cents/conversation), tight blast radius | New dependency **and** new egress (`api.anthropic.com`) — two escalation triggers per orchestration.spec |
| Claude Agent SDK (headless Claude Code) | File+git tools and "run the harness before committing" for free; sessions map to "chat until happy" | Same two triggers, plus the broadest tool surface — hardest to reconcile with the "narrow enumerable tools" contract |

Start with Ollama + narrow tools; upgrade to the Anthropic API only if
edit quality demands it (that upgrade is its own spec decision).

### B. MVP scope: notes first, edits second

Phase 1 = **recipe notes**: LLM only extracts `(recipe_id, note_text)`;
the bot appends a bullet to `## Notes` via a deterministic template.
Near-zero format risk, exactly r1 Script 4, and it un-stubs the existing
`note_recipe` intent. Phase 2 = real ingredient/instruction edits with
the iterate-and-confirm loop.

### C. Git write path

- **Local clone on the M1 + repo-scoped deploy key (SSH), push to
  `main`** — recommended. No expiry, single-repo blast radius, zero
  renewal ceremony. Fine-grained PAT (Contents: r/w, no expiry) is the
  HTTPS fallback. GitHub App tokens are overkill (1-h expiry, minting
  code).
- Expose git to the LLM as **one enumerated `publish_recipe_edit` tool**
  (fixed-arg `execFile` git, templated commit message, path-restricted
  to `src/data/recipes/`) — *not* shell. This keeps the spirit of
  "narrow enumerable tools" and shrinks the required spec amendment.
- PR + required checks + auto-merge is available (repo is public — it
  deploys to Pages on the free plan) but adds latency and ceremony a
  two-person household doesn't need; the wife's explicit chat
  confirmation is the human gate, local harness validation is the
  machine gate, CI is the net. Undo story: an `undo last change` bot
  command wrapping `git revert`.

### D. "Your change is live" notification

Bot-side polling — recommended: the bot knows the SHA it pushed; poll the
GitHub Actions/deployments API (or a build-stamped `version.json` on the
Pages site) and send "✅ live" when it matches. Send "✔ saved,
publishing…" immediately on push. Alternative (workflow `curl` to
Telegram sendMessage with repo secrets) notifies on *every* deploy
unless gated by commit author — messier.

## Required contract changes (human sign-off, spec-first)

1. **tech.spec.md tool surface**: bot gains `publish_recipe_edit` (file
   write in `src/data/recipes/` + templated git commit/push). Also
   reconcile with r4 §4 T2 ("recipe text never given tool access"):
   mitigations = enumerated tool, path restriction, explicit chat
   confirmation before push, harness validation, no shell.
2. **r6 egress allow-list**: add `github.com` (push + status polling);
   `api.anthropic.com` only if/when the cloud-LLM upgrade happens.
3. **Sandbox git credentials**: deploy key on the M1; `bot/.env` must be
   gitignored first (currently is not — leak path once the bot can
   `git add`).
4. New execplan (suggest `p4-08-recipe-notes-via-chat`), sequenced to
   avoid `p2-03` (in-progress, touches the same recipe files) and after
   `p4-02` live smoke completes.

## Open questions

- Is Lovable's auto-republish of bot-authored commits acceptable?
- Does qwen3:8b hold up on Phase-2 structural edits, or is the
  Anthropic-API upgrade needed then?
- Should `note_recipe` notes also mirror into `recipe_comments`
  (Supabase) so they're visible instantly, with the file commit as the
  durable copy? (Would make the note *appear* in CookMode within
  seconds via the existing comments UI, hiding the CI latency.)
