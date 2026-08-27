// Pure action planner (p4-02): maps a parsed utterance to the data
// operations the bot may perform — the enumerable-tool guarantee from
// r4 §4 T2 made unit-testable. The consumer (bot/) executes these against
// Supabase; nothing here touches the network. Notably: chitchat and every
// unimplemented intent plan ZERO write actions, which is the deterministic
// proof behind the two must-not-act fixtures.

import type { ParsedUtterance } from "./intentParser";
import { normalizeIngredientName } from "./ingredientNormalization";
import { planEventFromParse, type PlanEvent } from "./planConversation";
import { localIsoDate } from "./recipeNotes";

export interface InsertItemAction {
  type: "insert_item";
  displayName: string;   // preference-resolved at add-time (gate call)
  asWritten: string;     // what the human typed, kept for the reply/clarify
  canonicalIngredient: string | null;
  preferenceResolved: boolean;
  quantity?: string;
  note?: string;
}
export interface CheckItemsAction { type: "check_items"; terms: string[] }
export interface RemoveItemsAction { type: "remove_items"; terms: string[] }
export interface CorrectLastAction { type: "correct_last"; replacement: string }
export interface ShowListAction { type: "show_list"; query?: string }
// The repo-write path (p4-08): planning only carries the extracted note —
// recipe resolution, human confirmation, and the git tool live in bot/.
export interface NoteRecipeAction { type: "note_recipe"; note: string }
// The planning conversation (p4-03): planning never writes the shopping list
// or the repo directly — it hands one event to the state machine, which owns
// every pool/batch write behind its own confirm-and-lock flow.
export interface PlanAction { type: "plan"; event: PlanEvent }
export interface UnsupportedAction { type: "unsupported"; intent: string }
export interface NoopAction { type: "noop" }

export type BotAction =
  | InsertItemAction
  | CheckItemsAction
  | RemoveItemsAction
  | CorrectLastAction
  | ShowListAction
  | NoteRecipeAction
  | PlanAction
  | UnsupportedAction
  | NoopAction;

const WRITE_ACTIONS = new Set(["insert_item", "check_items", "remove_items", "correct_last", "note_recipe"]);

// "Write" here means the shopping list and the recipe repo — the surfaces the
// r4 §4 T2 must-not-act guarantee is about. Planning has its own gate (a draft
// is editable and only [✅ Lås] creates a batch), so it is deliberately not in
// this set; the invariant it must satisfy is that it never touches the list.
export function isWriteAction(action: BotAction): boolean {
  return WRITE_ACTIONS.has(action.type);
}

// Intents the capture bot deliberately does not act on yet (preference
// learning, proactive flows — later P4 plans). They get a short "not yet"
// reply from the consumer, never a data write.
const UNSUPPORTED: ReadonlySet<string> = new Set([
  "set_preference", "query_tonight",
]);

// Check-off and removal match by ilike against what's on the list, but
// Swedish speech uses definite forms ("bocka av spenaten") while list rows
// hold the bare item ("spenat"). Candidates are tried in order until one
// matches; the full term always goes first so exact phrasing wins.
// "na" before "en"/"et": "linserna" → "linser" (not "lins…"), and bare "n"
// last so "tofun" → "tofu". ilike is substring anyway, so the stripped form
// only needs to be a prefix of the listed row, not the perfect lemma.
const DEFINITE_SUFFIXES = ["na", "en", "et", "n"];

export function matchCandidates(term: string): string[] {
  const t = term.trim().toLowerCase();
  const candidates = [t];
  for (const suffix of DEFINITE_SUFFIXES) {
    if (t.endsWith(suffix) && t.length - suffix.length >= 3) {
      candidates.push(t.slice(0, -suffix.length));
      break; // longest matching suffix only
    }
  }
  const canonical = normalizeIngredientName(t);
  if (!candidates.includes(canonical)) candidates.push(canonical);
  return candidates;
}

export function planActions(
  parse: ParsedUtterance,
  preferences: Map<string, string>,
  todayIso: string = localIsoDate(),
): BotAction[] {
  switch (parse.intent) {
    case "add_item": {
      const items = parse.items ?? [];
      return items.map((item): BotAction => {
        const canonical = normalizeIngredientName(item);
        const preferred = preferences.get(canonical);
        return {
          type: "insert_item",
          displayName: preferred ?? item,
          asWritten: item,
          canonicalIngredient: canonical,
          preferenceResolved: preferred != null,
          ...(parse.quantity ? { quantity: parse.quantity } : {}),
          ...(parse.note ? { note: parse.note } : {}),
        };
      });
    }
    case "check_item":
      return parse.items?.length ? [{ type: "check_items", terms: parse.items }] : [{ type: "noop" }];
    case "remove_item":
      return parse.items?.length ? [{ type: "remove_items", terms: parse.items }] : [{ type: "noop" }];
    case "correct_last":
      return parse.replacement
        ? [{ type: "correct_last", replacement: parse.replacement }]
        : [{ type: "noop" }];
    case "show_list":
      return [{ type: "show_list", ...(parse.query ? { query: parse.query } : {}) }];
    case "note_recipe":
      return parse.note?.trim()
        ? [{ type: "note_recipe", note: parse.note.trim() }]
        : [{ type: "noop" }];
    case "plan_draft":
    case "plan_set_day":
    case "plan_set_multiplier":
    case "plan_lock": {
      const event = planEventFromParse(parse, todayIso);
      return event ? [{ type: "plan", event }] : [{ type: "noop" }];
    }
    case "chitchat":
      return [{ type: "noop" }];
    default:
      return UNSUPPORTED.has(parse.intent)
        ? [{ type: "unsupported", intent: parse.intent }]
        : [{ type: "noop" }];
  }
}
