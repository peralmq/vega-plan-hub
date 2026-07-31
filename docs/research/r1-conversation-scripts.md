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

> **W:** köp mjölk
>
> **Vega:** 🥛 Oatly Havredryck Deluxe → shopping list (that's your
> usual). 12 items now.
>
> *(nothing else. No buttons, no questions — the preference table
> already knows which "mjölk".)*

Variants to rehearse in the same sitting:

> **P:** buy toilet paper and coffee
>
> **Vega:** 🧻☕ Added toilet paper + coffee. 14 items.

> **W:** vi behöver citroner till på lördag
>
> **Vega:** 🍋 Lemons added. 15 items. (Tagged for Saturday 👀)

**Watch for:** does the confirmation feel right, or is even one reply
per item too chatty in a group? Would a 👍 emoji *reaction* on the
human's message be better than a reply message? (Telegram bots can
react — zero noise.) Does "that's your usual" build trust or feel
presumptuous?

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

## Script 5 — The weekly planning ritual (the long one)

*The hardest conversation to get right: locking next week (A.3).
Tests bot-proposes-first vs. humans-build-from-scratch.*

> **Vega:** *(Sunday 17:00, proactive)* 📅 Time to plan next week?
> Here's a draft from your favourites + what you haven't had in a
> while:
> Mon 🍛 Dal · Tue 🌮 Tacos · Wed 🍝 Pasta alla Norma · Thu 🥘 Chana
> masala · Fri 🍕 Fredagspizza · Sat 🍲 Ramen · Sun 🥗 Buddha bowls
> `[✅ Looks good]` `[✏️ Change days]` `[🎲 New draft]` `[😴 Not now]`
>
> **W:** *(taps `[✏️ Change days]`)*
>
> **Vega:** Which day?
> `[Mon]` `[Tue]` `[Wed]` `[Thu]` `[Fri]` `[Sat]` `[Sun]`
>
> **W:** *(taps `[Thu]`)* — **Vega:** Thursday, pick a swap:
> `[🍜 Pad see ew]` `[🥔 Raggmunk]` `[🍔 Svampburgare]` `[Type something…]`
>
> **W:** *(taps `[🥔 Raggmunk]`)*
>
> **Vega:** ✏️ *draft edited in place:* Thu → 🥔 Raggmunk. Anything
> else? `[✅ Lock the week]` `[✏️ Change days]`
>
> **P:** kan vi köra dubbla portioner på måndagen?
>
> **Vega:** 💪 Mon Dal ×2 (lunch boxes incoming). Lock it?
> `[✅ Lock the week]` `[✏️ Keep editing]`
>
> **W:** *(taps `[✅ Lock the week]`)*
>
> **Vega:** 🔒 Week 33 locked! 7 dinners, 2 doubled.
> 🛒 Shopping list is ready: **23 items, ~612 kr**.
> `[🛒 Show list]` `[🖨 Open on web]`
> cooked with compassion · for the animals, the planet & each other 🐾🌍💚

**Watch for:** mixing taps (W) and free text (P) in one flow — does the
state hold up? Is the draft-first approach welcome or does it feel like
the bot railroads the week? Does *lock* as an explicit, celebrated
moment match your mental model ("this is what we cook AND shop for")?
Is Sunday 17:00 the right ritual trigger, and should the bot wait for
both partners' sign-off before locking, or is one enough?

## Script 6 — Mid-week swap: plan and list stay consistent

> **P:** byt torsdag till tacos istället
>
> **Vega:** 🌮 Thu: Raggmunk → Tacos. Shopping impact: −potatis −äggersättning,
> +tortillas +svarta bönor (already have salsa ✅).
> You already shopped this week — want the diff as a mini-list?
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
| A.2 | Free text vs. buttons — where does each win? | ☐ | |
| A.3 | Draft-first weekly ritual? Sunday 17:00? Both must approve lock? | ☐ | |
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
| `lås veckan` | `plan_lock {}` |
| `mindre stark nästa gång bara` | `note_recipe {note: "less heat", target: last_cooked}` |
| `köp också diskmedel` | `add_item {item: "diskmedel"}` — mid-conversation, other context active |
| `har vi vitlök hemma?` | `show_list {query: "vitlök"}` — nearest v0 behavior; pantry state is out of scope |
| `tack snälla vega!` | `chitchat_fallback {}` — must NOT touch the list |

Hard cases to grow during the dry-run: negations ("köp inte mer
kaffe"), quantities ("3 burkar krossade tomater"), compounds
("taco-grejer"), code-switching mid-sentence, typos from
one-thumbed store typing.
