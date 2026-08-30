// Tool execution for the capture bot: the narrow, enumerable surface from
// r4 §4 T2 — list reads/writes through the shared-user session (RLS active),
// confirmations per design.spec.md "Chat voice" (react when nothing needs
// saying; speak only to add information). The pure planning behind this
// lives in src/lib/botActions; this file is the Supabase/Telegram side.
import type { SupabaseClient } from "@supabase/supabase-js";
import { detectLanguage, type ParsedUtterance } from "../src/lib/intentParser";
import {
  type BotAction,
  type InsertItemAction,
  type NoteRecipeAction,
  type PlanAction,
  matchCandidates,
  planActions,
} from "../src/lib/botActions";
import {
  handlePlanEvent,
  parsePlanCallback,
  type PlanEvent,
  type PlanSession,
} from "../src/lib/planConversation";
import type { ParsedRecipe } from "../src/lib/recipeMarkdown";
import { makePlanChat, makePlanStore } from "./planning";
import { resolveMenuTarget, sendMenuCard } from "./menu";
import {
  currentPreferenceMap,
  formatSinceMonth,
  planSupersede,
  planUndo,
  type PreferenceRow,
} from "../src/lib/productPreferences";
import { normalizeIngredientName } from "../src/lib/ingredientNormalization";
import {
  formatNoteLine,
  localIsoDate,
  matchRecipeTitle,
  type RecipeIndexEntry,
} from "../src/lib/recipeNotes";
import {
  applyEdit,
  describeChanges,
  expandTermCandidates,
  interpretEdit,
  type EditIntent,
  type SynonymEntry,
} from "../src/lib/recipeEdits";
import { REACTIONS, TelegramApi } from "./telegram";
import { buildTraceInsert, formatTraceReview } from "../src/lib/nluTraces";
import { labelTraceFromReview, linkCorrection, listUnsettled, writeTrace } from "./nluTrace";

// The repo-write seam (p4-08/p4-09): tools.ts decides WHAT to save and asks
// the sender; recipePublish.ts (injected by the consumer) is the only code
// that touches files or git, and only from the note_yes callback below.
export interface RecipeRepoDeps {
  index(): RecipeIndexEntry[];
  /** The full parsed corpus (p4-03: shared loader over the same checkout). */
  library(): ParsedRecipe[];
  synonyms(): SynonymEntry[];
  read(recipeId: string): string;
  publishNote(recipeId: string, noteLine: string): Promise<{ committed: boolean; pushed: boolean }>;
  publishEdit(
    recipeId: string,
    candidates: string[],
    edit: EditIntent,
  ): Promise<{ committed: boolean; pushed: boolean }>;
}

export type PendingChange =
  | { kind: "note"; recipeId: string; title: string; noteLine: string }
  | { kind: "edit"; recipeId: string; title: string; candidates: string[]; edit: EditIntent };

export interface InboxRow {
  id: number;
  user_id: string;
  chat_id: number;
  message_id: number | null;
  telegram_user_id: number;
  family_member_id: string | null;
  kind: "message" | "callback_query";
  text: string | null;
  payload: {
    callback_query?: { id: string };
  };
}

// correct_last needs "what did we just add" — kept in-process per chat.
// Lost on restart by design: after a restart, "nej, penne" politely asks
// instead of guessing at a stale row.
export interface ChatState {
  lastInsert?: {
    rowIds: string[];
    displayNames: string[];
    // The canonical bucket each row was inserted under — correct_last needs
    // this to teach a preference against what the household was ORIGINALLY
    // shopping for (p4-04), not the replacement's own canonical form.
    canonicalIngredients: (string | null)[];
    // p4-06: the nlu_traces row this insert's parse was logged under, or
    // null when the write degraded (missing table, or no traceMeta passed —
    // e.g. from a caller that pre-dates trace capture). correct_last uses
    // this to overturn the trace behind the item it is fixing.
    traceId: string | null;
  };
  // A note or edit awaiting its [Ja, spara] press. In-process on purpose
  // (same restart semantics as lastInsert): after a restart the callback
  // says "skicka igen" instead of publishing something stale.
  pendingChange?: PendingChange;
  // p4-04: "nej, penne" asks [New usual] / [One-off] — the crumb is which
  // canonical bucket + product the correction just taught, same in-process,
  // lost-on-restart semantics as lastInsert/pendingChange above.
  pendingCorrection?: { canonicalIngredient: string; productName: string };
  // p4-04: [Undo] sits under every learning moment (an explicit
  // set_preference or a [New usual] tap). What to re-point, and enough to
  // build the "back to X" confirmation without a re-read.
  lastPreferenceChange?: {
    newRowId: string;
    previousId: string | null;
    previousProductName: string | null;
  };
  // The planning conversation carries NO state here — the draft is in
  // planned_meals and every tap re-derives from it (p4-03). The one crumb is
  // the unanswered Script 6 diff question, with the same "ask again" fallback.
  plan?: PlanSession;
}
export type StateMap = Map<number, ChatState>;

// All user-facing strings, mirrored per design.spec "Chat voice": reply in
// the sender's language, Swedish when ambiguous (A.7 live verdict).
type Lang = "sv" | "en";
const T = {
  sv: {
    help:
      "🌱 Jag kan det här:\n" +
      "• köp <grej>[, <grej>…] — in på listan\n" +
      "• visa listan\n" +
      "• bocka av <grej>\n" +
      "• ta bort <grej>\n" +
      "• nej, <grej> — rättar mitt senaste tillägg\n" +
      "• planera 5 dagar — utkast att pilla på, sen lås\n" +
      "• byt <rätt> mot <rätt> — fritext funkar för alla recept\n" +
      "• storkok på <rätt> — samma rätt två gånger i potten 🍱\n" +
      "• lås dagarna — låser utkastet + fixar inköpslistan 🔒",
    emptyList: "🛒 Listan är tom — snyggt! ✨",
    listHeader: (n: number) => `🛒 Inköpslista (${n}):`,
    nothingMatching: (term: string) => `🤷 Inget på listan som matchar "${term}".`,
    onList: (names: string) => `✅ På listan: ${names}`,
    notOnList: (q: string) => `🤷 "${q}" står inte på listan.`,
    newOne: (item: string) =>
      `✨ Ny för mig! La till "${item}" som du skrev det. Ska jag komma ihåg den som stapelvara?`,
    btnRemember: "Ja, kom ihåg",
    btnOnce: "Bara denna gång",
    corrected: (item: string) => `✏️ ${item} ska det va — utbytt på listan.`,
    nothingToCorrect: "🤔 Inget färskt av dig att rätta — köp den rätta?",
    btnNewUsual: "Ny standard",
    // p4-04 Script 3: the stated-memory reply — "was: X since <month>" —
    // makes the belief inspectable (research-plan A.8) instead of a silent
    // swap. `since` is formatSinceMonth's output, already localized.
    prefNoted: (ingredient: string, product: string, was: { product: string; since: string } | null) =>
      was
        ? `📝 Noterat: ${ingredient} → ${product} från och med nu (var: ${was.product} sedan ${was.since}). Jag använder den nästa gång. 🌱`
        : `📝 Noterat: ${ingredient} → ${product} från och med nu. Jag använder den nästa gång. 🌱`,
    btnUndo: "Ångra",
    cbCorrUsual: (product: string) => `🌱 Uppfattat — ${product} är den nya standarden nu.`,
    cbCorrGone: "🤔 Inget färskt att komma ihåg — rätta mig igen? 🙏",
    cbUndoGone: "🤔 Inget att ångra längre.",
    cbUndone: (was: string | null) => (was ? `↩️ Ångrat — tillbaka till ${was}.` : "↩️ Ångrat — ingen favorit satt nu."),
    unsupported:
      "🚧 Det där kan jag inte än (\"vad blir det ikväll\") — men listor och planering fixar jag: köp / visa listan / planera 5 dagar 🌱",
    cbRemember: "🌱 Att komma ihåg stapelvaror lär jag mig i nästa uppdatering — noterat i själen!",
    cbOnce: "👍 Bara denna gång, då.",
    noteWhich:
      "🤔 Vilket recept gäller det? Ingen middag är planerad idag — nämn rättens namn så fixar jag det.",
    noteConfirm: (title: string, noteLine: string) =>
      `📝 Spara på ${title}?\n„${noteLine}"`,
    editConfirm: (title: string, changes: string) =>
      `✏️ Uppdatera ${title}?\n${changes}`,
    btnSaveNote: "Ja, spara",
    btnSkipNote: "Avbryt",
    cbNoteSaved: (title: string) =>
      `📝 Sparat på ${title}! Publicerar — syns i appen om ett par minuter 🌱`,
    cbNoteCommitted: (title: string) =>
      `📝 Sparat på ${title} (lokal commit — push är avstängd på den här maskinen).`,
    cbNoteGone: "🤔 Hittar ingen anteckning att spara — skicka den igen 🙏",
    cbNoteSkipped: "👍 Skippar anteckningen.",
    cbNoteFailed: (reason: string) => `😵 Kunde inte spara anteckningen: ${reason}`,
    noMenu: "🤔 Ingen låst batch att visa ännu — lås några dagar först 🔒",
    // p4-06: /traces review digest — one message per unsettled trace.
    reviewNone: "🌱 Inget att granska just nu — allt uppfattat rätt (eller inget nytt sedan sist)!",
    btnReviewOk: "✅ Rätt",
    btnReviewWrong: "❌ Fel",
    reviewThanksOk: "✅ Tack — noterat som rätt.",
    reviewThanksWrong: "📝 Tack — noterat som fel.",
  },
  en: {
    help:
      "🌱 I know these:\n" +
      "• köp/buy <thing>[, <thing>…] — onto the list\n" +
      "• visa listan / show list\n" +
      "• bocka av/check <thing>\n" +
      "• ta bort <thing>\n" +
      "• nej, <thing> — fix my last add\n" +
      "• plan the next 5 days — a draft to edit, then lock\n" +
      "• byt <dish> mot <dish> — free text reaches every recipe\n" +
      "• storkok på <dish> — the same dish twice in the pool 🍱\n" +
      "• lås dagarna / lock it in — locks it + builds the list 🔒",
    emptyList: "🛒 List is empty — nice! ✨",
    listHeader: (n: number) => `🛒 Shopping list (${n}):`,
    nothingMatching: (term: string) => `🤷 Nothing on the list matching "${term}".`,
    onList: (names: string) => `✅ On the list: ${names}`,
    notOnList: (q: string) => `🤷 "${q}" is not on the list.`,
    newOne: (item: string) =>
      `✨ New one for me! Added "${item}" as written. Want me to remember it as a pantry staple?`,
    btnRemember: "Yes, remember",
    btnOnce: "Just this once",
    corrected: (item: string) => `✏️ ${item} it is — swapped on the list.`,
    nothingToCorrect: "🤔 Nothing recent of yours to correct — köp the right one?",
    btnNewUsual: "New usual",
    prefNoted: (ingredient: string, product: string, was: { product: string; since: string } | null) =>
      was
        ? `📝 Noted: ${ingredient} → ${product} from now on (was: ${was.product} since ${was.since}). I'll use it next time. 🌱`
        : `📝 Noted: ${ingredient} → ${product} from now on. I'll use it next time. 🌱`,
    btnUndo: "Undo",
    cbCorrUsual: (product: string) => `🌱 Got it — ${product} is the new usual now.`,
    cbCorrGone: "🤔 Nothing fresh to remember — correct me again? 🙏",
    cbUndoGone: "🤔 Nothing to undo anymore.",
    cbUndone: (was: string | null) => (was ? `↩️ Undone — back to ${was}.` : "↩️ Undone — no preference set now."),
    unsupported:
      "🚧 Can't do that one yet (\"what's for dinner\") — lists and planning I can: köp / visa listan / plan the next 5 days 🌱",
    cbRemember: "🌱 I'll learn to remember staples in the next update — noted in spirit!",
    cbOnce: "👍 Just this once then.",
    noteWhich:
      "🤔 Which recipe is that for? Nothing is planned today — name the dish and I'll take it.",
    noteConfirm: (title: string, noteLine: string) =>
      `📝 Save on ${title}?\n"${noteLine}"`,
    editConfirm: (title: string, changes: string) =>
      `✏️ Update ${title}?\n${changes}`,
    btnSaveNote: "Yes, save",
    btnSkipNote: "Cancel",
    cbNoteSaved: (title: string) =>
      `📝 Saved on ${title}! Publishing — in the app in a couple of minutes 🌱`,
    cbNoteCommitted: (title: string) =>
      `📝 Saved on ${title} (local commit — push is off on this machine).`,
    cbNoteGone: "🤔 No note waiting to be saved — send it again 🙏",
    cbNoteSkipped: "👍 Skipping the note.",
    cbNoteFailed: (reason: string) => `😵 Couldn't save the note: ${reason}`,
    noMenu: "🤔 No locked batch to show yet — lock a few days first 🔒",
    reviewNone: "🌱 Nothing to review right now — all caught up!",
    btnReviewOk: "✅ Correct",
    btnReviewWrong: "❌ Wrong",
    reviewThanksOk: "✅ Thanks — noted as correct.",
    reviewThanksWrong: "📝 Thanks — noted as wrong.",
  },
} satisfies Record<Lang, unknown>;

async function loadPreferences(
  supa: SupabaseClient,
  userId: string,
): Promise<Map<string, string>> {
  const { data } = await supa
    .from("product_preferences")
    .select("canonical_ingredient, product_name, superseded_by, valid_from")
    .eq("user_id", userId)
    .is("superseded_by", null);
  return currentPreferenceMap(data ?? []);
}

const PREFERENCE_COLUMNS = "id, canonical_ingredient, product_name, superseded_by, valid_from, source, note";

// p4-04 Script 3 write path: "insert + supersede atomically" (Step 1). The
// DECISION (what to insert, which row it replaces) is the pure
// planSupersede; this is only the two-call round trip against it — insert
// first (the new row needs an id before anything can point at it), then
// re-point the previous current row, if there was one.
async function teachPreference(
  supa: SupabaseClient,
  userId: string,
  canonicalIngredient: string,
  productName: string,
  source: "explicit" | "correction",
): Promise<{ newRowId: string; previous: PreferenceRow | null }> {
  const { data, error: readError } = await supa
    .from("product_preferences")
    .select(PREFERENCE_COLUMNS)
    .eq("user_id", userId)
    .eq("canonical_ingredient", canonicalIngredient);
  if (readError) throw new Error(`preference history failed: ${readError.message}`);
  const plan = planSupersede((data ?? []) as PreferenceRow[], canonicalIngredient, productName, source);

  const { data: inserted, error: insertError } = await supa
    .from("product_preferences")
    .insert({ user_id: userId, ...plan.insert })
    .select("id")
    .single();
  if (insertError) throw new Error(`preference insert failed: ${insertError.message}`);
  const newRowId = (inserted as { id: string }).id;

  if (plan.previous) {
    const { error: supersedeError } = await supa
      .from("product_preferences")
      .update({ superseded_by: newRowId })
      .eq("id", plan.previous.id);
    if (supersedeError) throw new Error(`preference supersede failed: ${supersedeError.message}`);
  }
  return { newRowId, previous: plan.previous };
}

// [Undo]: re-point superseded_by (r4 §1) — never a delete, never touching a
// row's own product_name/canonical_ingredient. planUndo is the pure
// decision; this is the (up to) two-call round trip against it.
async function undoPreference(
  supa: SupabaseClient,
  change: { newRowId: string; previousId: string | null },
): Promise<void> {
  const plan = planUndo(change.newRowId, change.previousId);
  const { error } = await supa
    .from("product_preferences")
    .update({ superseded_by: plan.retireSupersededBy })
    .eq("id", plan.retireId);
  if (error) throw new Error(`preference undo failed: ${error.message}`);
  if (plan.restoreId) {
    const { error: restoreError } = await supa
      .from("product_preferences")
      .update({ superseded_by: null })
      .eq("id", plan.restoreId);
    if (restoreError) throw new Error(`preference restore failed: ${restoreError.message}`);
  }
}

// Note target resolution: a dish named in the message wins; otherwise what was
// COOKED today.
//
// p4-12 residual, fixed here (p4-03): this used to look for
// `meal_date = today`, which pool writes never set — the note-tonight shortcut
// silently found nothing once the pool migration went live. In the pool model
// the picked dish is stamped `cooked_on`; when nothing is stamped yet, a pool
// with exactly one meal left is unambiguous enough to take. Anything else
// still asks (T.noteWhich) rather than guessing.
async function resolveNoteRecipe(
  supa: SupabaseClient,
  row: InboxRow,
  index: RecipeIndexEntry[],
): Promise<RecipeIndexEntry | null> {
  const named = matchRecipeTitle(row.text ?? "", index);
  if (named) return named;
  const byId = (recipeId: string | undefined) =>
    (recipeId ? index.find((r) => r.id === recipeId) : undefined) ?? null;

  const { data: cooked } = await supa
    .from("planned_meals")
    .select("recipe_id")
    .eq("user_id", row.user_id)
    .eq("cooked_on", localIsoDate())
    .order("id")
    .limit(1);
  const cookedToday = (cooked ?? [])[0] as { recipe_id: string } | undefined;
  if (cookedToday) return byId(cookedToday.recipe_id);

  const today = localIsoDate();
  const { data: batches } = await supa
    .from("plan_batches")
    .select("id")
    .eq("user_id", row.user_id)
    .lte("starts_on", today)
    .gte("ends_on", today)
    .limit(1);
  const batchId = (batches ?? [])[0] as { id: string } | undefined;
  if (!batchId) return null;
  const { data: remaining } = await supa
    .from("planned_meals")
    .select("recipe_id")
    .eq("user_id", row.user_id)
    .eq("batch_id", batchId.id)
    .is("cooked_on", null);
  const rows = (remaining ?? []) as Array<{ recipe_id: string }>;
  const distinct = [...new Set(rows.map((r) => r.recipe_id))];
  return distinct.length === 1 ? byId(distinct[0]) : null;
}

async function familyMemberName(
  supa: SupabaseClient,
  familyMemberId: string | null,
): Promise<string | null> {
  if (!familyMemberId) return null;
  const { data } = await supa
    .from("family_members")
    .select("name")
    .eq("id", familyMemberId)
    .maybeSingle();
  return data?.name ?? null;
}

async function findUnchecked(
  supa: SupabaseClient,
  userId: string,
  term: string,
): Promise<Array<{ id: string; display_name: string }>> {
  for (const candidate of matchCandidates(term)) {
    const { data } = await supa
      .from("shopping_list_items")
      .select("id, display_name")
      .eq("user_id", userId)
      .is("checked_at", null)
      .ilike("display_name", `%${candidate}%`);
    if (data && data.length > 0) return data;
  }
  return [];
}

async function executeInserts(
  supa: SupabaseClient,
  tg: TelegramApi,
  row: InboxRow,
  inserts: InsertItemAction[],
  state: ChatState,
  lang: Lang,
  traceId: string | null,
): Promise<void> {
  // "New one for me" (Script 2) is decided BEFORE inserting, per item:
  // unknown = no preference matched and never seen on the list before.
  let firstUnknown: InsertItemAction | null = null;
  for (const action of inserts) {
    if (action.preferenceResolved || firstUnknown) continue;
    const { count } = await supa
      .from("shopping_list_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", row.user_id)
      .eq("canonical_ingredient", action.canonicalIngredient);
    if (!count) firstUnknown = action;
  }

  const { data, error } = await supa
    .from("shopping_list_items")
    .insert(
      inserts.map((action) => ({
        user_id: row.user_id,
        source: "adhoc",
        display_name: action.displayName,
        canonical_ingredient: action.canonicalIngredient,
        quantity: action.quantity != null ? Number(action.quantity) || null : null,
        note: action.note ?? null,
        added_by: row.family_member_id,
      })),
    )
    .select("id, display_name, canonical_ingredient");
  if (error) throw new Error(`insert failed: ${error.message}`);

  const inserted = (data ?? []) as Array<{
    id: string;
    display_name: string;
    canonical_ingredient: string | null;
  }>;
  state.lastInsert = {
    rowIds: inserted.map((r) => r.id),
    displayNames: inserted.map((r) => r.display_name),
    canonicalIngredients: inserted.map((r) => r.canonical_ingredient),
    traceId,
  };

  if (row.message_id != null) await tg.react(row.chat_id, row.message_id, REACTIONS.added);
  if (firstUnknown) {
    await tg.sendMessage(row.chat_id, T[lang].newOne(firstUnknown.asWritten), [[
      { text: T[lang].btnRemember, callback_data: "remember" },
      { text: T[lang].btnOnce, callback_data: "once" },
    ]]);
  }
}

// p4-06: what parseUtterance already knew about its own parse — passed
// through so handleMessage can write the nlu_traces row without re-deriving
// it. Optional: tests and any future caller that predates trace capture can
// omit it, in which case no trace is written (matches the existing tests in
// tools.test.ts, none of which pass this).
export interface TraceMeta {
  source: "rules" | "llm";
  model: string;
  harnessVersion: string;
  latencyMs: number;
}

export async function handleMessage(
  supa: SupabaseClient,
  tg: TelegramApi,
  row: InboxRow,
  parse: ParsedUtterance,
  states: StateMap,
  notes?: RecipeRepoDeps,
  traceMeta?: TraceMeta,
): Promise<void> {
  const state = states.get(row.chat_id) ?? {};
  states.set(row.chat_id, state);

  const lang = detectLanguage(row.text ?? "");
  const preferences = await loadPreferences(supa, row.user_id);
  const actions = planActions(parse, preferences, localIsoDate());

  // Every parse writes a trace (p4-06 Progress item 2) — before acting on
  // it, so a trace exists even for an action that goes on to fail. Graceful
  // degradation (missing table, offline DB) lives inside writeTrace itself;
  // this call never throws and never blocks the actions below.
  const traceId = traceMeta
    ? await writeTrace(
        supa,
        buildTraceInsert({
          userId: row.user_id,
          chatId: row.chat_id,
          utterance: row.text ?? "",
          parse,
          model: traceMeta.source === "rules" ? "rules" : traceMeta.model,
          harnessVersion: traceMeta.harnessVersion,
          latencyMs: traceMeta.latencyMs,
        }),
      )
    : null;

  const inserts = actions.filter((a): a is InsertItemAction => a.type === "insert_item");
  if (inserts.length > 0) await executeInserts(supa, tg, row, inserts, state, lang, traceId);

  for (const action of actions) {
    await executeOne(supa, tg, row, action, state, preferences, lang, notes);
  }
}

// note_recipe here only PREPARES: resolve the recipe, stage the change,
// ask. The commit/push lives exclusively in the note_yes callback path —
// that asymmetry is the p4-08/p4-09 verification claim.
//
// Edit-vs-note branch (p4-09): the raw utterance — not the NLU note slot,
// which compresses the verb away — is checked against the enumerable edit
// rules. A rule match whose preview applies becomes a structural edit with
// per-row before→after in the confirm; everything else stays a note.
async function prepareRecipeChange(
  supa: SupabaseClient,
  tg: TelegramApi,
  row: InboxRow,
  action: NoteRecipeAction,
  state: ChatState,
  lang: Lang,
  repo: RecipeRepoDeps | undefined,
): Promise<void> {
  if (!repo) {
    await tg.sendMessage(row.chat_id, T[lang].unsupported);
    return;
  }
  const target = await resolveNoteRecipe(supa, row, repo.index());
  if (!target) {
    await tg.sendMessage(row.chat_id, T[lang].noteWhich);
    return;
  }

  const edit = interpretEdit(row.text ?? "");
  if (edit) {
    const candidates = expandTermCandidates(edit.term, repo.synonyms());
    const preview = applyEdit(repo.read(target.id), candidates, edit);
    if (preview.ok) {
      state.pendingChange = {
        kind: "edit",
        recipeId: target.id,
        title: target.title,
        candidates,
        edit,
      };
      await tg.sendMessage(
        row.chat_id,
        T[lang].editConfirm(target.title, describeChanges(preview.changes)),
        [[
          { text: T[lang].btnSaveNote, callback_data: "note_yes" },
          { text: T[lang].btnSkipNote, callback_data: "note_no" },
        ]],
      );
      return;
    }
    // Interpretable but not applicable (no matching row / not numeric):
    // fall through to the note path rather than guessing.
  }

  const author = await familyMemberName(supa, row.family_member_id);
  const noteLine = formatNoteLine(action.note, author, localIsoDate());
  state.pendingChange = { kind: "note", recipeId: target.id, title: target.title, noteLine };
  await tg.sendMessage(row.chat_id, T[lang].noteConfirm(target.title, noteLine), [[
    { text: T[lang].btnSaveNote, callback_data: "note_yes" },
    { text: T[lang].btnSkipNote, callback_data: "note_no" },
  ]]);
}

// The planning conversation's single entry point (p4-03). Everything it needs
// is re-derived from the DB by the store, so a message and a button press are
// handled by the exact same call — the only difference is `messageId`, which
// makes the reply edit the tapped message in place instead of stacking a new
// one (design.spec "Chat voice").
async function runPlanEvent(
  supa: SupabaseClient,
  tg: TelegramApi,
  row: InboxRow,
  state: ChatState,
  lang: Lang,
  event: PlanEvent,
  notes: RecipeRepoDeps | undefined,
  messageId?: number,
): Promise<void> {
  if (!notes) {
    await tg.sendMessage(row.chat_id, T[lang].unsupported);
    return;
  }
  state.plan ??= {};
  const store = makePlanStore(
    supa,
    { userId: row.user_id, familyMemberId: row.family_member_id },
    notes.library(),
  );
  // p4-10: "locking a batch ... sends the household a beautiful Swedish
  // menu" — detected by RE-DERIVING from the DB (the stateless bias:
  // handlePlanEvent stays a pure Promise<void>, no result plumbed back)
  // rather than trusting that a "lock" event always succeeds — an overlap
  // clash or an empty draft answers with a message and locks nothing, and
  // must NOT trigger a menu send (there'd be nothing new to show, or worse,
  // a stale older batch would get re-sent).
  const countBefore = event.kind === "lock" ? (await store.loadLockedBatches()).length : -1;
  await handlePlanEvent(store, makePlanChat(tg, row.chat_id), {
    lang,
    todayIso: localIsoDate(),
    familyMemberId: row.family_member_id,
    session: state.plan,
    ...(messageId != null ? { messageId } : {}),
  }, event);
  if (event.kind === "lock" && (await store.loadLockedBatches()).length > countBefore) {
    const target = await resolveMenuTarget(store, localIsoDate());
    if (target) await sendMenuCard(store, tg, row.chat_id, target);
  }
}

// p4-10: "visa menyn" / [📋 Meny] — re-renders the menu card idempotently
// from DB state (album + HTML message + PDF). Same entry point for both a
// free-text ask (executeOne's "show_menu" case) and the button press
// (handleCallback's plain "show_menu" callback, not "p:"-namespaced since
// planConversation's pure state machine has no Telegram album/document port).
async function runShowMenu(
  supa: SupabaseClient,
  tg: TelegramApi,
  row: InboxRow,
  lang: Lang,
  notes: RecipeRepoDeps | undefined,
): Promise<void> {
  if (!notes) {
    await tg.sendMessage(row.chat_id, T[lang].unsupported);
    return;
  }
  const store = makePlanStore(
    supa,
    { userId: row.user_id, familyMemberId: row.family_member_id },
    notes.library(),
  );
  const target = await resolveMenuTarget(store, localIsoDate());
  if (!target) {
    await tg.sendMessage(row.chat_id, T[lang].noMenu);
    return;
  }
  await sendMenuCard(store, tg, row.chat_id, target);
}

// p4-06 Step 4: `/traces` review surface — the oldest unsettled traces, one
// message each, one tap to confirm or overturn (design.spec "keep it
// one-tap"). Private-chat only, same gate as helpText (bot/consumer.ts).
export async function runTracesReview(
  supa: SupabaseClient,
  tg: TelegramApi,
  row: InboxRow,
  lang: Lang,
): Promise<void> {
  const traces = await listUnsettled(supa, row.user_id, 5);
  if (traces.length === 0) {
    await tg.sendMessage(row.chat_id, T[lang].reviewNone);
    return;
  }
  for (const trace of traces) {
    await tg.sendMessage(row.chat_id, formatTraceReview(trace, lang), [[
      { text: T[lang].btnReviewOk, callback_data: `nlu_ok:${trace.id}` },
      { text: T[lang].btnReviewWrong, callback_data: `nlu_wrong:${trace.id}` },
    ]]);
  }
}

async function executeOne(
  supa: SupabaseClient,
  tg: TelegramApi,
  row: InboxRow,
  action: BotAction,
  state: ChatState,
  preferences: Map<string, string>,
  lang: Lang,
  notes?: RecipeRepoDeps,
): Promise<void> {
  switch (action.type) {
    case "insert_item":
      return; // batched in executeInserts

    case "note_recipe":
      return prepareRecipeChange(supa, tg, row, action, state, lang, notes);

    case "show_menu":
      return runShowMenu(supa, tg, row, lang, notes);

    case "plan":
      return runPlanEvent(supa, tg, row, state, lang, (action as PlanAction).event, notes);

    case "check_items": {
      for (const term of action.terms) {
        const matches = await findUnchecked(supa, row.user_id, term);
        if (matches.length === 0) {
          await tg.sendMessage(row.chat_id, T[lang].nothingMatching(term));
          continue;
        }
        const { error } = await supa
          .from("shopping_list_items")
          .update({ checked_at: new Date().toISOString(), checked_by: row.family_member_id })
          .in("id", matches.map((m) => m.id));
        if (error) throw new Error(`check failed: ${error.message}`);
        if (row.message_id != null) await tg.react(row.chat_id, row.message_id, REACTIONS.checked);
      }
      return;
    }

    case "remove_items": {
      for (const term of action.terms) {
        const matches = await findUnchecked(supa, row.user_id, term);
        if (matches.length === 0) {
          await tg.sendMessage(row.chat_id, T[lang].nothingMatching(term));
          continue;
        }
        const { error } = await supa
          .from("shopping_list_items")
          .delete()
          .in("id", matches.map((m) => m.id));
        if (error) throw new Error(`remove failed: ${error.message}`);
        if (row.message_id != null) await tg.react(row.chat_id, row.message_id, REACTIONS.removed);
      }
      return;
    }

    case "correct_last": {
      const last = state.lastInsert;
      if (!last || last.rowIds.length === 0) {
        await tg.sendMessage(row.chat_id, T[lang].nothingToCorrect);
        return;
      }
      const idx = last.rowIds.length - 1;
      const targetId = last.rowIds[idx];
      // p4-04: the bucket the household was ORIGINALLY shopping for — "nej,
      // penne" corrected a "pasta" insert, and Script 3's teaching question
      // ("should penne be the new usual [for pasta]?") is scoped to THAT
      // bucket, not to penne's own canonical form (which is what the list
      // row itself gets updated to, unchanged from p4-02).
      const originalCanonical = last.canonicalIngredients[idx];
      const canonical = normalizeIngredientName(action.replacement);
      const displayName = preferences.get(canonical) ?? action.replacement;
      const { error } = await supa
        .from("shopping_list_items")
        .update({ display_name: displayName, canonical_ingredient: canonical })
        .eq("id", targetId);
      if (error) throw new Error(`correct failed: ${error.message}`);
      last.displayNames[idx] = displayName;
      // p4-06: "nej, penne" is the implicit-wrong signal for the trace
      // behind this insert — the repair (what add_item should have
      // produced) becomes its corrected_parse. Best-effort: the list
      // correction above has already landed and must not be undone by a
      // labelling failure (linkCorrection degrades gracefully on its own).
      if (last.traceId) {
        await linkCorrection(supa, last.traceId, { intent: "add_item", items: [action.replacement] });
      }
      if (originalCanonical) {
        state.pendingCorrection = { canonicalIngredient: originalCanonical, productName: displayName };
        await tg.sendMessage(row.chat_id, T[lang].corrected(displayName), [[
          { text: T[lang].btnNewUsual, callback_data: "corr_usual" },
          { text: T[lang].btnOnce, callback_data: "corr_once" },
        ]]);
      } else {
        await tg.sendMessage(row.chat_id, T[lang].corrected(displayName));
      }
      return;
    }

    case "set_preference": {
      const { newRowId, previous } = await teachPreference(
        supa,
        row.user_id,
        action.canonicalIngredient,
        action.product,
        "explicit",
      );
      state.lastPreferenceChange = {
        newRowId,
        previousId: previous?.id ?? null,
        previousProductName: previous?.product_name ?? null,
      };
      const was = previous
        ? { product: previous.product_name, since: formatSinceMonth(previous.valid_from, lang) }
        : null;
      await tg.sendMessage(
        row.chat_id,
        T[lang].prefNoted(action.ingredientAsWritten, action.product, was),
        [[{ text: T[lang].btnUndo, callback_data: "pref_undo" }]],
      );
      return;
    }

    case "show_list": {
      if (action.query) {
        const matches = await findUnchecked(supa, row.user_id, action.query);
        await tg.sendMessage(
          row.chat_id,
          matches.length > 0
            ? T[lang].onList(matches.map((m) => m.display_name).join(", "))
            : T[lang].notOnList(action.query),
        );
        return;
      }
      const { data, error } = await supa
        .from("shopping_list_items")
        .select("display_name, note, family_members!shopping_list_items_added_by_fkey(name)")
        .eq("user_id", row.user_id)
        .is("checked_at", null)
        .order("created_at");
      if (error) throw new Error(`list failed: ${error.message}`);
      const rows = (data ?? []) as unknown as Array<{
        display_name: string;
        note: string | null;
        family_members: { name: string } | null;
      }>;
      if (rows.length === 0) {
        await tg.sendMessage(row.chat_id, T[lang].emptyList);
        return;
      }
      const lines = rows.map((r) => {
        const by = r.family_members?.name ? ` (${r.family_members.name})` : "";
        const note = r.note ? ` — ${r.note}` : "";
        return `• ${r.display_name}${note}${by}`;
      });
      await tg.sendMessage(row.chat_id, `${T[lang].listHeader(rows.length)}\n${lines.join("\n")}`);
      return;
    }

    case "unsupported": {
      await tg.sendMessage(row.chat_id, T[lang].unsupported);
      return;
    }

    case "noop": {
      // Chitchat: react only when it's plausibly aimed at the bot — a ❤ on
      // every partner-to-partner message in the group would be noise.
      const text = (row.text ?? "").toLowerCase();
      const addressed = text.includes("vega") || (row.payload as { message?: { chat?: { type?: string } } })
        .message?.chat?.type === "private";
      if (addressed && row.message_id != null) {
        await tg.react(row.chat_id, row.message_id, REACTIONS.love);
      }
      return;
    }
  }
}

export async function handleCallback(
  supa: SupabaseClient,
  tg: TelegramApi,
  row: InboxRow,
  states: StateMap,
  notes?: RecipeRepoDeps,
): Promise<void> {
  const callbackId = row.payload.callback_query?.id;
  if (callbackId) await tg.answerCallbackQuery(callbackId);
  if (row.message_id == null) return;
  // Callback data carries no language, so replies follow the household
  // default (Swedish).

  // p4-06 Step 4: [✅ rätt] / [❌ fel] on a /traces review message. Stateless
  // by design (unlike note_yes/pref_undo above) — the trace id rides in the
  // callback_data itself, so a tap still works after a restart.
  if (row.text?.startsWith("nlu_ok:") || row.text?.startsWith("nlu_wrong:")) {
    const [prefix, traceId] = row.text.split(":");
    const verdict = prefix === "nlu_ok" ? "correct" : "wrong";
    await labelTraceFromReview(supa, traceId, verdict);
    await tg.editMessageText(
      row.chat_id,
      row.message_id,
      verdict === "correct" ? T.sv.reviewThanksOk : T.sv.reviewThanksWrong,
      [],
    );
    return;
  }

  // p4-03: every planning tap. The event is re-executed against fresh DB
  // state, so a press that arrives after a restart (or after the partner
  // changed the draft) acts on what is actually there.
  const planEvent = parsePlanCallback(row.text);
  if (planEvent) {
    const state = states.get(row.chat_id) ?? {};
    states.set(row.chat_id, state);
    await runPlanEvent(supa, tg, row, state, "sv", planEvent, notes, row.message_id);
    return;
  }

  // p4-10: [📋 Meny] on the lock announcement (or a re-sent menu message) —
  // a fresh delivery (album/message/PDF), never an edit-in-place, so it is
  // deliberately outside the "p:"-namespaced vocabulary above.
  if (row.text === "show_menu") {
    await runShowMenu(supa, tg, row, "sv", notes);
    return;
  }

  // p4-08/p4-09: the ONLY place a repo write can start — and only when the
  // pending change from this process's confirm question is still around.
  if (row.text === "note_yes" || row.text === "note_no") {
    const state = states.get(row.chat_id);
    const pending = state?.pendingChange;
    if (state) delete state.pendingChange;
    if (row.text === "note_no") {
      await tg.editMessageText(row.chat_id, row.message_id, T.sv.cbNoteSkipped, []);
      return;
    }
    if (!pending || !notes) {
      await tg.editMessageText(row.chat_id, row.message_id, T.sv.cbNoteGone, []);
      return;
    }
    try {
      const result =
        pending.kind === "edit"
          ? await notes.publishEdit(pending.recipeId, pending.candidates, pending.edit)
          : await notes.publishNote(pending.recipeId, pending.noteLine);
      await tg.editMessageText(
        row.chat_id,
        row.message_id,
        result.pushed ? T.sv.cbNoteSaved(pending.title) : T.sv.cbNoteCommitted(pending.title),
        [],
      );
    } catch (err) {
      const reason = String(err instanceof Error ? err.message : err).slice(0, 200);
      await tg.editMessageText(row.chat_id, row.message_id, T.sv.cbNoteFailed(reason), []);
    }
    return;
  }

  // v1 stub (p4-02 scope), UNCHANGED by p4-04: Script 2's "new item, want me
  // to remember it as a pantry staple?" is a different question (never-seen
  // item → known item) from Script 3's product-switch teaching below —
  // [Yes, remember] is still acknowledged but writes nothing.
  if (row.text === "remember" || row.text === "once") {
    const text = row.text === "remember" ? T.sv.cbRemember : T.sv.cbOnce;
    await tg.editMessageText(row.chat_id, row.message_id, text, []);
    return;
  }

  // p4-04 Script 3, correction path: "nej, penne" asked [New usual]/
  // [One-off] — only when the pending correction from THIS process's ask is
  // still around (same restart semantics as note_yes/no above).
  if (row.text === "corr_usual" || row.text === "corr_once") {
    const state = states.get(row.chat_id);
    const pending = state?.pendingCorrection;
    if (state) delete state.pendingCorrection;
    if (row.text === "corr_once") {
      await tg.editMessageText(row.chat_id, row.message_id, T.sv.cbOnce, []);
      return;
    }
    if (!pending) {
      await tg.editMessageText(row.chat_id, row.message_id, T.sv.cbCorrGone, []);
      return;
    }
    const { newRowId, previous } = await teachPreference(
      supa,
      row.user_id,
      pending.canonicalIngredient,
      pending.productName,
      "correction",
    );
    if (state) {
      state.lastPreferenceChange = {
        newRowId,
        previousId: previous?.id ?? null,
        previousProductName: previous?.product_name ?? null,
      };
    }
    await tg.editMessageText(
      row.chat_id,
      row.message_id,
      T.sv.cbCorrUsual(pending.productName),
      [[{ text: T.sv.btnUndo, callback_data: "pref_undo" }]],
    );
    return;
  }

  // p4-04 Script 3: [Undo] under every learning moment (set_preference or
  // [New usual]) — re-points superseded_by (r4 §1), never deletes. The crumb
  // is cleared immediately so a second tap (double-press, or after a
  // restart) gets the honest "nothing to undo" instead of undoing twice.
  if (row.text === "pref_undo") {
    const state = states.get(row.chat_id);
    const change = state?.lastPreferenceChange;
    if (state) delete state.lastPreferenceChange;
    if (!change) {
      await tg.editMessageText(row.chat_id, row.message_id, T.sv.cbUndoGone, []);
      return;
    }
    await undoPreference(supa, change);
    await tg.editMessageText(row.chat_id, row.message_id, T.sv.cbUndone(change.previousProductName), []);
    return;
  }

  // Anything else is a button this build does not know: a keyboard left over
  // from an older deploy, or a newer one. Answering the callback (above) is
  // the whole response — NEVER an edit. This used to be a catch-all that
  // rewrote the message to the preference stub and, after p4-03 started
  // sending reply_markup on every edit, stripped its buttons with it: that is
  // exactly what a stale parallel consumer did to the live planning flow on
  // 2026-08-27 (p4-03 Evidence), and the same shape would do it to us on any
  // future deploy skew.
  console.warn(`[callback] ignoring unknown callback_data ${JSON.stringify(row.text)}`);
}

export function helpText(sourceText: string): string {
  return T[detectLanguage(sourceText)].help;
}
