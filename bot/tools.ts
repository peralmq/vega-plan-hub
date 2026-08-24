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
  matchCandidates,
  planActions,
} from "../src/lib/botActions";
import { currentPreferenceMap } from "../src/lib/productPreferences";
import { normalizeIngredientName } from "../src/lib/ingredientNormalization";
import {
  formatNoteLine,
  localIsoDate,
  matchRecipeTitle,
  type RecipeIndexEntry,
} from "../src/lib/recipeNotes";
import {
  applyScale,
  describeChanges,
  expandTermCandidates,
  interpretEdit,
  type SynonymEntry,
} from "../src/lib/recipeEdits";
import { REACTIONS, TelegramApi } from "./telegram";

// The repo-write seam (p4-08/p4-09): tools.ts decides WHAT to save and asks
// the sender; recipePublish.ts (injected by the consumer) is the only code
// that touches files or git, and only from the note_yes callback below.
export interface RecipeRepoDeps {
  index(): RecipeIndexEntry[];
  synonyms(): SynonymEntry[];
  read(recipeId: string): string;
  publishNote(recipeId: string, noteLine: string): Promise<{ committed: boolean; pushed: boolean }>;
  publishEdit(
    recipeId: string,
    candidates: string[],
    factor: number,
  ): Promise<{ committed: boolean; pushed: boolean }>;
}

export type PendingChange =
  | { kind: "note"; recipeId: string; title: string; noteLine: string }
  | { kind: "edit"; recipeId: string; title: string; candidates: string[]; factor: number };

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
      "Planeringssnack kommer i nästa uppdatering 🚧",
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
      "🚧 Jag kan bara list-grejer än så länge (köp / visa listan / bocka av). Planeringssnack kommer snart 🌱",
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
      "Planning chat comes in the next update 🚧",
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
      "🚧 I only do list stuff so far (köp / visa listan / bocka av). Planning chat is the next update 🌱",
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

// Note target resolution: a dish named in the message wins; otherwise the
// meal planned for today (planned_meals is unique per user + meal_date).
async function resolveNoteRecipe(
  supa: SupabaseClient,
  row: InboxRow,
  index: RecipeIndexEntry[],
): Promise<RecipeIndexEntry | null> {
  const named = matchRecipeTitle(row.text ?? "", index);
  if (named) return named;
  const { data } = await supa
    .from("planned_meals")
    .select("recipe_id")
    .eq("user_id", row.user_id)
    .eq("meal_date", localIsoDate())
    .maybeSingle();
  if (!data?.recipe_id) return null;
  return index.find((r) => r.id === data.recipe_id) ?? null;
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
  const actions = planActions(parse, preferences);
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
    const preview = applyScale(repo.read(target.id), candidates, edit.factor);
    if (preview.ok) {
      state.pendingChange = {
        kind: "edit",
        recipeId: target.id,
        title: target.title,
        candidates,
        factor: edit.factor,
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

  // p4-08/p4-09: the ONLY place a repo write can start — and only when the
  // pending change from this process's confirm question is still around.
  if (row.text === "note_yes" || row.text === "note_no") {
    const state = states.get(row.chat_id);
    const pending = state?.pendingChange;
    if (state) delete state.pendingChange;
    if (row.text === "note_no") {
      await tg.editMessageText(row.chat_id, row.message_id, T.sv.cbNoteSkipped);
      return;
    }
    if (!pending || !notes) {
      await tg.editMessageText(row.chat_id, row.message_id, T.sv.cbNoteGone);
      return;
    }
    try {
      const result =
        pending.kind === "edit"
          ? await notes.publishEdit(pending.recipeId, pending.candidates, pending.factor)
          : await notes.publishNote(pending.recipeId, pending.noteLine);
      await tg.editMessageText(
        row.chat_id,
        row.message_id,
        result.pushed ? T.sv.cbNoteSaved(pending.title) : T.sv.cbNoteCommitted(pending.title),
      );
    } catch (err) {
      const reason = String(err instanceof Error ? err.message : err).slice(0, 200);
      await tg.editMessageText(row.chat_id, row.message_id, T.sv.cbNoteFailed(reason));
    }
    return;
  }

  // v1 stub (p4-02 scope): [Yes, remember] is acknowledged but writes
  // nothing — preference LEARNING lands in p4-04.
  const text = row.text === "remember" ? T.sv.cbRemember : T.sv.cbOnce;
  await tg.editMessageText(row.chat_id, row.message_id, text);
}

export function helpText(sourceText: string): string {
  return T[detectLanguage(sourceText)].help;
}
