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
  matchCandidates,
  planActions,
} from "../src/lib/botActions";
import { currentPreferenceMap } from "../src/lib/productPreferences";
import { normalizeIngredientName } from "../src/lib/ingredientNormalization";
import { REACTIONS, TelegramApi } from "./telegram";

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
): Promise<void> {
  const state = states.get(row.chat_id) ?? {};
  states.set(row.chat_id, state);

  const lang = detectLanguage(row.text ?? "");
  const preferences = await loadPreferences(supa, row.user_id);
  const actions = planActions(parse, preferences);
  const inserts = actions.filter((a): a is InsertItemAction => a.type === "insert_item");
  if (inserts.length > 0) await executeInserts(supa, tg, row, inserts, state, lang);

  for (const action of actions) {
    await executeOne(supa, tg, row, action, state, preferences, lang);
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
): Promise<void> {
  switch (action.type) {
    case "insert_item":
      return; // batched in executeInserts

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
): Promise<void> {
  const callbackId = row.payload.callback_query?.id;
  if (callbackId) await tg.answerCallbackQuery(callbackId);
  // v1 stub (p4-02 scope): [Yes, remember] is acknowledged but writes
  // nothing — preference LEARNING lands in p4-04. Callback data carries no
  // language, so these follow the household default (Swedish).
  if (row.message_id != null) {
    const text = row.text === "remember" ? T.sv.cbRemember : T.sv.cbOnce;
    await tg.editMessageText(row.chat_id, row.message_id, text);
  }
}

export function helpText(sourceText: string): string {
  return T[detectLanguage(sourceText)].help;
}
