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
import { currentPreferenceMap } from "../src/lib/productPreferences";
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
  lastInsert?: { rowIds: string[]; displayNames: string[] };
  // A note or edit awaiting its [Ja, spara] press. In-process on purpose
  // (same restart semantics as lastInsert): after a restart the callback
  // says "skicka igen" instead of publishing something stale.
  pendingChange?: PendingChange;
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
    unsupported:
      "🚧 Det där kan jag inte än (preferenser, \"vad blir det ikväll\") — men listor och planering fixar jag: köp / visa listan / planera 5 dagar 🌱",
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
    unsupported:
      "🚧 Can't do that one yet (preferences, \"what's for dinner\") — lists and planning I can: köp / visa listan / plan the next 5 days 🌱",
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
    .select("id, display_name");
  if (error) throw new Error(`insert failed: ${error.message}`);

  state.lastInsert = {
    rowIds: (data ?? []).map((r: { id: string }) => r.id),
    displayNames: (data ?? []).map((r: { display_name: string }) => r.display_name),
  };

  if (row.message_id != null) await tg.react(row.chat_id, row.message_id, REACTIONS.added);
  if (firstUnknown) {
    await tg.sendMessage(row.chat_id, T[lang].newOne(firstUnknown.asWritten), [[
      { text: T[lang].btnRemember, callback_data: "remember" },
      { text: T[lang].btnOnce, callback_data: "once" },
    ]]);
  }
}

export async function handleMessage(
  supa: SupabaseClient,
  tg: TelegramApi,
  row: InboxRow,
  parse: ParsedUtterance,
  states: StateMap,
  notes?: RecipeRepoDeps,
): Promise<void> {
  const state = states.get(row.chat_id) ?? {};
  states.set(row.chat_id, state);

  const lang = detectLanguage(row.text ?? "");
  const preferences = await loadPreferences(supa, row.user_id);
  const actions = planActions(parse, preferences, localIsoDate());
  const inserts = actions.filter((a): a is InsertItemAction => a.type === "insert_item");
  if (inserts.length > 0) await executeInserts(supa, tg, row, inserts, state, lang);

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
  await handlePlanEvent(store, makePlanChat(tg, row.chat_id), {
    lang,
    todayIso: localIsoDate(),
    familyMemberId: row.family_member_id,
    session: state.plan,
    ...(messageId != null ? { messageId } : {}),
  }, event);
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
      const targetId = last.rowIds[last.rowIds.length - 1];
      const canonical = normalizeIngredientName(action.replacement);
      const displayName = preferences.get(canonical) ?? action.replacement;
      const { error } = await supa
        .from("shopping_list_items")
        .update({ display_name: displayName, canonical_ingredient: canonical })
        .eq("id", targetId);
      if (error) throw new Error(`correct failed: ${error.message}`);
      last.displayNames[last.displayNames.length - 1] = displayName;
      await tg.sendMessage(row.chat_id, T[lang].corrected(displayName));
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

  // v1 stub (p4-02 scope): [Yes, remember] is acknowledged but writes
  // nothing — preference LEARNING lands in p4-04.
  if (row.text === "remember" || row.text === "once") {
    const text = row.text === "remember" ? T.sv.cbRemember : T.sv.cbOnce;
    await tg.editMessageText(row.chat_id, row.message_id, text, []);
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
