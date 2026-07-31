# R5 — Surface Split: What Lives in Chat, What Stays on the Web

Status: draft with provisional calls, 2026-07-31. Spike R5 of
[telegram-pivot-research-plan.md](telegram-pivot-research-plan.md).
Final verdicts depend on the R1 dry-run and R2 probes; each call below
states what would flip it.

## Provisional calls

| Surface | Call | Reasoning | What would flip it |
| --- | --- | --- | --- |
| Ad-hoc capture, tonight-query, planning ritual, preference teaching | **Chat only** | The pivot's whole point; scripts 1–5 cover them | Nothing plausible |
| **Cook mode** | **Web, unchanged** — chat sends a summary card + deep link | Steps + scaled quantities want a propped-up screen with big type; the page already exists and just shipped a redesign (p3-01) | Dry-run shows they actually read steps from the phone in chat |
| In-store check-off | **Chat first, Mini App as the known fallback** | Try the simplest thing (Script 7's tappable checklist); a 20+ item button grid may prove miserable | R2/R6 probe: if edit-in-place latency or button limits hurt, wrap `/summary` as a Mini App |
| Recipe browsing, ratings history, comments | **Web, demoted to occasional** | Curation and reading are couch activities; chat gets quick lookup + one-tap ratings (Script 8) | If web visits drop to ~zero after month one, fold the remnant into chat/Mini App |
| Admin (family members, preference inspection/edit, Telegram allow-list) | **Web** — grows a small "what the bot believes" page | The trust-boundary principle (R4): learned facts must be inspectable and editable somewhere calm | If a `visa vad du vet` chat command turns out to be enough for a 2-person household |
| Printing the list | **Web print view, unchanged** | Already exists; chat can deep-link it | Paper stops being used |

## Consequences if the calls hold

- The SPA is **kept, not killed**: it sheds Plan Mode as the primary
  planner and becomes cook screen + library + admin + print. GitHub
  Pages hosting and OAuth stay as-is (p2-04 work is not wasted).
- Plan Mode's week grid becomes a *view* over the date-based
  `planned_meals` (R4) — read-mostly, still useful for the couch
  overview.
- **No Mini App in v1.** It's the strongest candidate for v2 (in-store
  mode), but it adds a build target, Telegram-specific auth
  (initData validation), and hosting coupling for a surface chat might
  serve fine. Decide after living with Script 7 for a few weeks.
- The new admin page ("what the bot believes": current
  `product_preferences`, allow-list, batch history) is the only *new*
  web work the pivot demands.

## Open items feeding the gate

1. R2 probe result on group privacy mode — if group-chat capture is
   flaky, the DM-first model changes several scripts.
2. Script 7 verdict — chat check-off vs. Mini App.
3. Whether cook-mode deep links (`[🍳 Cook mode]`) need auto-login
   (Telegram → web session handoff) or the kitchen device just stays
   logged in (likely: it just stays logged in — 2-person household).
