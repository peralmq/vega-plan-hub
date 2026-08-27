# R1 — Conversation Scripts for the Telegram Assistant

Status: draft for dry-run, 2026-07-31. Spike R1 of
[telegram-pivot-research-plan.md](telegram-pivot-research-plan.md).
These are **Wizard-of-Oz scripts**: no code exists; the two household
users rehearse them in a real Telegram group with a human playing the
bot, and the verdicts (A.1–A.8) get recorded at the bottom. The
Appendix doubles as the starter fixture set for spike R3.

## Conventions

- **Bot** = working name **Vega** 🌱 (rename freely; short = easy to
  @-mention).
- **P** and **W** = the two partners (either can send anything; scripts
  vary who speaks on purpose, to exercise attribution).
- `[Button]` = Telegram inline-keyboard button under the bot message.
  `✏️ msg edited` = the bot edits an earlier message in place instead of
  sending a new one.
- Humans write mixed Swedish/English (as they naturally chat); the bot
  replies in app-voice English (per design.spec.md) with Swedish
  ingredient names kept as-is. **Whether bot replies should instead be
  Swedish is an explicit dry-run question** (see Verdicts, A.7).
- Setting: one shared three-way group ("🥗 Matcentralen") unless a
  script says otherwise — testing the group-first hypothesis (A.1).

## Script 1 — Ad-hoc capture: the canonical "buy milk"

*The whole pivot in four lines. Must feel instant and need zero
follow-up in the common case.*

*Directive 2026-07-31: emoji confirmations — the bot reacts on the
human's message instead of replying, whenever nothing needs saying.*

> **W:** köp mjölk
>
> **Vega:** *(reacts 🥛 on W's message — no reply. The preference table
> already knows which "mjölk"; it resolved silently to ICA Havredryck.)*

Variants to rehearse in the same sitting:

> **P:** buy toilet paper and coffee
>
> **Vega:** *(reacts 👍)*

> **W:** vi behöver citroner till på lördag
>
> **Vega:** *(reacts 🍋, then one short reply because there's info to
> add:)* Tagged for Saturday 👀

**Watch for:** the reaction carries zero information — is silent
resolution ("which milk?") fine as long as `🛒 show list` reveals the
truth on demand and mistakes are one-line correctable (Script 2)? When
*does* a reply earn its place — new/unknown items, notes, warnings
only? Which reaction emoji set reads clearly on both phones?

## Script 2 — Ambiguity repair: unknown item, one-tap clarify

*The error-repair moment decides whether the bot feels smart or
annoying (A.4). Rule being tested: silently do the sensible thing when
confident; ask ONE tap-able question when not; never ask twice.*

> **P:** köp mjölk till pannkakorna
>
> **Vega:** 🥛 Which milk for pancakes?
> `[Oatly Deluxe (usual)]` `[iKaffe]` `[Something else…]`
>
> **P:** *(taps `[iKaffe]`)*
>
> **Vega:** ✏️ *msg edited:* 🥛 iKaffe → list. (Kept Oatly as your
> everyday default.)

And the unknown-to-the-catalog case:

> **W:** köp nutritional yeast
>
> **Vega:** ✨ New one for me! Added "nutritional yeast" as written.
> Want me to remember it as a pantry staple? `[Yes, remember]` `[Just this once]`

**Watch for:** is the one clarifying question acceptable mid-flow? Is
editing-in-place (question disappears, answer remains) better than a
new message? When the bot guesses *wrong* silently, how bad does the
correction turn feel?

## Script 3 — Preference teaching: "we switched milk"

*A.8 made concrete. Structured preference change, spoken casually.*

> **W:** btw vi har bytt från oatly deluxe till ica havredryck, den är billigare
>
> **Vega:** 📝 Noted: mjölk → ICA Havredryck from now on (was: Oatly
> Deluxe since March). I'll use it next time. `[Undo]`
>
> *…a week later…*
>
> **P:** köp mjölk
>
> **Vega:** 🥛 ICA Havredryck → list. 8 items.

And the correction-as-teaching path (implicit learning):

> **P:** köp pasta
>
> **Vega:** 🍝 Spaghetti (your usual) → list.
>
> **P:** nej, penne
>
> **Vega:** ✏️ Penne it is — swapped on the list. Should penne be the
> new usual, or one-off? `[New usual]` `[One-off]`

**Watch for:** does the bot's *stated memory* ("was: Oatly since
March") feel reassuring (inspectable facts, per the research plan's
trust-boundary principle) or creepy? Is `[Undo]` under every learning
moment enough of a safety net? Where does W check what the bot
currently believes — chat command ("what do you know about our milk?")
or the web admin?

## Script 4 — "What's for dinner?"

> **P:** vad blir det för mat ikväll?
>
> **Vega:** 🌮 Tonight: **Tacos al Pastor-style** (planned by W,
> ×2 portions — leftovers for Friday lunch 🍱).
> ⏰ ~35 min · 🌶 medium
> `[🍳 Cook mode]` `[📖 Recipe]` `[🔁 Swap tonight]`

`[🍳 Cook mode]` deep-links to the **web app's** cook mode (the
big-screen surface, per dimension B) with tonight's scaling applied.

**Watch for:** is a summary card + web deep-link the right split, or do
they expect steps *in chat*? Does the ×2/leftovers context earn its
lines? Would they want this pushed proactively at ~16:00 (see
Script 8) rather than asked for?

## Script 5 — The rolling planning ritual (the long one)

*The hardest conversation to get right: locking the next batch of days
(A.3 — directive 2026-07-31: "plan the next X days", not week-by-week).
Tests bot-proposes-first vs. humans-build-from-scratch, and the
runs-low trigger.*

> **Vega:** *(Wednesday 17:00, proactive — plan runs out tomorrow)*
> 📅 You're planned through tomorrow. Plan the next few days?
> `[Next 3 days]` `[Next 5 days]` `[Through Sunday]` `[😴 Not now]`
>
> **W:** *(taps `[Next 5 days]`)*
>
> **Vega:** 🌱 Draft for Fri–Tue, from your favourites + what you
> haven't had in a while:
> Fri 🍕 Fredagspizza · Sat 🍲 Ramen · Sun 🍛 Dal · Mon 🥘 Chana
> masala · Tue 🍝 Pasta alla Norma
> `[✅ Looks good]` `[✏️ Change a day]` `[🎲 New draft]`
>
> **W:** *(taps `[✏️ Change a day]`)* — **Vega:** Which day?
> `[Fri]` `[Sat]` `[Sun]` `[Mon]` `[Tue]`
>
> **W:** *(taps `[Mon]`)* — **Vega:** Monday, pick a swap:
> `[🍜 Pad see ew]` `[🥔 Raggmunk]` `[🍔 Svampburgare]` `[Type something…]`
>
> **W:** *(taps `[🥔 Raggmunk]`)*
>
> **Vega:** ✏️ *draft edited in place:* Mon → 🥔 Raggmunk. Anything
> else? `[✅ Lock these 5 days]` `[✏️ Change a day]`
>
> **P:** kan vi köra dubbla portioner på söndagen?
>
> **Vega:** 💪 Sun Dal ×2 (lunch boxes incoming). Lock it?
> `[✅ Lock these 5 days]` `[✏️ Keep editing]`
>
> **W:** *(taps `[✅ Lock these 5 days]`)*
>
> **Vega:** 🔒 Fri–Tue locked! 5 dinners, 1 doubled.
> 🛒 Shopping list for the batch: **19 items, ~487 kr**.
> `[🛒 Show list]` `[🖨 Open on web]`
> cooked with compassion · for the animals, the planet & each other 🐾🌍💚

**Watch for:** mixing taps (W) and free text (P) in one flow — does the
state hold up? Is the draft-first approach welcome or does it feel like
the bot railroads the days? Is **runs-low** the right trigger, and how
low — one planned day left? zero? Does a *batch* map 1:1 to a shopping
trip in practice? Which horizon do you actually pick (does X converge
to a default the bot should learn)? Should locking need both partners'
sign-off, or is one enough?

## Script 6 — Mid-week swap: plan and list stay consistent

> **P:** byt torsdag till tacos istället
>
> **Vega:** 🌮 Thu: Raggmunk → Tacos. Shopping impact: −potatis −äggersättning,
> +tortillas +svarta bönor (already have salsa ✅).
> That batch is already shopped — want the diff as a mini-list?
> `[🛒 Yes, diff list]` `[Nah, we have it]`

**Watch for:** the shopping *diff* is the hard promise (list stays
trustworthy after the week is locked) — do they trust it? Is asking
about the diff right, or should an unshopped list just silently update?

## Script 7 — In the store: check-off

*Contested surface (dimension B): chat checklist vs. Mini App vs. web.
Rehearse chat-native first, one-handed, cart in the other.*

> **W:** *(in store)* 🛒
>
> **Vega:** Shopping mode! 23 items, grouped by aisle-ish:
> **Grönt 🥬** `[⬜ citroner]` `[⬜ spenat]` `[⬜ vitlök]`
> **Torrvaror 🌾** `[⬜ penne]` `[⬜ röda linser]` …
> *(tapping a button checks it: ✏️ msg edits in place to ☑️ struck-through)*
>
> **W:** *(taps items as she shops; P is home and sees ticks land live)*
>
> **P:** *(from home)* köp också diskmedel
>
> **Vega:** 🧼 Added to the trip — see **Övrigt**, W! ✏️ *(list msg
> updates)*
>
> **Vega:** *(when all checked)* 🎉 All 23! Nice hunting.
> ~612 kr estimated — what did it come to?

**Watch for:** does a button-grid message survive a real 23-item shop
(Telegram caps ~100 buttons/message; tap latency; scroll pain) or does
this become the Mini App's job? Is the live cross-partner update
("P sees ticks land") delightful or noise? Is the final price question
useful data collection (calibrating SEK estimates, F) or nagging?

## Script 8 — Proactive pulse + ratings (the memory loop)

*Tests the proactivity budget (A.6) and closing the taste loop.*

> **Vega:** *(16:00)* 🍳 Tonight: Chana masala ×1 (~40 min). Ping me
> `🛒` if anything's missing.
>
> *…21:00, only after a cooked dinner, max a few times/week…*
>
> **Vega:** How was the chana masala? `[🤩]` `[😋]` `[😐]` `[👎]`
>
> **P:** *(taps `[😋]`)* **W:** *(taps `[🤩]`)* — **Vega:** ✏️ Logged
> (P 😋 · W 🤩). It'll show up more often 📈
>
> **W:** mindre stark nästa gång bara
>
> **Vega:** 🌶️➖ Noted on the recipe: "less heat for W". I'll remind
> whoever cooks it next time.

**Watch for:** which of these pushes survive week one before being
muted? Are one-tap emoji ratings enough signal for the planner's draft
(Script 5), replacing the web rating UI for daily use? Free-text recipe
notes ("mindre stark") — where do they surface again (cook mode? next
plan draft?)?

## Dry-run protocol (do this before any code)

1. Create the real Telegram group; **P plays Vega** for scripts 1–4,
   **W plays Vega** for 5–8 (playing the bot teaches you what it needs
   to know).
2. Run at most 2 scripts per day, in real context (dinner time, actual
   store trip for Script 7) — not all in one sitting on the couch.
3. After each script, each partner answers in one line: *would I use
   this weekly? what one thing annoyed me?* Log verbatim into the
   Verdicts table.
4. Improvise off-script on purpose — the deviations are the findings:
   they become fixture utterances (Appendix) and new design questions.

## Patterns borrowed (mini-teardown notes)

- **Bring! / AnyList**: shared-list sync with per-person attribution
  and catalog-normalized items — validates Scripts 1–2's
  merge-into-canonical-item behavior; neither learns *product-level*
  preference over time (our A.8 differentiator).
- **Todoist/Slack-style quick capture**: confirmation via emoji
  reaction instead of reply message — candidate for Script 1's
  noise problem.
- **BotFather-style flows**: long structured flows survive in Telegram
  when every step is tap-able and the message edits in place rather
  than stacking — adopted throughout Scripts 5–7.

## Verdicts (fill during dry-run)

| Q | Question | Verdict | Notes |
| --- | --- | --- | --- |
| A.1 | Group chat, DMs, or both? | ☐ | |
| A.2 | Free text vs. buttons — where does each win? | ◐ directive: emoji-reaction confirmations preferred (2026-07-31) | verify silent-resolution comfort in dry-run |
| A.3 | Rolling batches confirmed (2026-07-31 directive). Runs-low trigger? Default X? Both must approve lock? | ✅ 2026-08-27 | Default horizon **5 days** (`[Next 5 days]` first — Pelle directive; first production batch is 5 days incl. one 🍱 meal prep). **One partner's lock suffices** (orchestrator default, Pelle chose not to object when asked): the lock is celebrated + announced so the other partner can still swap (Script 6). Batches are **pools, not calendars** (design.spec "Pool over calendar", 2026-08-27) — Script 5's per-day draft lines are superseded; the draft is a meal list with counts. Runs-low trigger: still open, deferred to p4-05 (proactive pulse) where it belongs. |
| A.4 | One-tap clarify acceptable? Silent-guess threshold? | ☐ | |
| A.5 | In-store check-off: chat, Mini App, or web? | ☐ | |
| A.6 | Which proactive pings survive week one? | ☐ | |
| A.7 | Bot voice: English (app voice) or Swedish? Tone right? | ☐ | |
| A.8 | Preference moments: trust the stated memory? `[Undo]` enough? | ☐ | |

## Appendix — starter intent fixtures for R3

Working intent set (v0): `add_item`, `remove_item`, `show_list`,
`check_item`, `set_preference`, `query_tonight`, `plan_draft`,
`plan_set_day`, `plan_set_multiplier`, `plan_lock`, `rate_recipe`,
`note_recipe`, `chitchat_fallback`.

| Utterance (verbatim, mixed sv/en) | Expected intent + slots |
| --- | --- |
| `köp mjölk` | `add_item {item: "mjölk"}` |
| `buy toilet paper and coffee` | `add_item {items: ["toilet paper", "coffee"]}` — multi-item |
| `vi behöver citroner till på lördag` | `add_item {item: "citroner", note: "lördag"}` |
| `köp mjölk till pannkakorna` | `add_item {item: "mjölk", context: "pannkakor"}` — should trigger clarify |
| `nej, penne` | `correct_last {replacement: "penne"}` |
| `vi har bytt från oatly deluxe till ica havredryck` | `set_preference {ingredient: "mjölk", product: "ICA Havredryck"}` |
| `ta bort kaffe från listan` | `remove_item {item: "kaffe"}` |
| `vad blir det för mat ikväll?` | `query_tonight {}` |
| `what's for dinner tomorrow` | `query_tonight {day: +1}` |
| `byt torsdag till tacos istället` | `plan_set_day {day: "thu", recipe_query: "tacos"}` |
| `kan vi köra dubbla portioner på måndagen?` | `plan_set_multiplier {day: "mon", multiplier: 2}` |
| `kan vi planera de närmsta dagarna?` | `plan_draft {horizon: default}` |
| `planera fram till söndag` | `plan_draft {horizon: through_sunday}` |
| `lås dagarna` | `plan_lock {}` — locks the open draft batch |
| `mindre stark nästa gång bara` | `note_recipe {note: "less heat", target: last_cooked}` |
| `köp också diskmedel` | `add_item {item: "diskmedel"}` — mid-conversation, other context active |
| `har vi vitlök hemma?` | `show_list {query: "vitlök"}` — nearest v0 behavior; pantry state is out of scope |
| `tack snälla vega!` | `chitchat_fallback {}` — must NOT touch the list |

Hard cases to grow during the dry-run: negations ("köp inte mer
kaffe"), quantities ("3 burkar krossade tomater"), compounds
("taco-grejer"), code-switching mid-sentence, typos from
one-thumbed store typing.
