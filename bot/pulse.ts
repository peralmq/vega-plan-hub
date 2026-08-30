// p4-05: the Supabase/Telegram side of the proactive pulse. The decisions
// (is a slot due, has it already fired, what does the message say) are the
// pure src/lib/proactivePulse; this file is the adapter plus the one
// scheduler — a plain tick on the M1 consumer, which is the transport p4-02
// recorded (hybrid via queue, Track B runtime on household hardware). No
// pg_cron, no edge-function timer, no second mechanism anywhere.
//
// NIGHT SAFETY: `tick` is the only thing that can send, it sends only inside
// a slot's own grace window, and bot/consumer.ts arms it with setInterval —
// never an immediate call — so a restart at 00:30 (or at any hour) can
// neither fire now nor catch up on what it slept through.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedRecipe } from "../src/lib/recipeMarkdown";
import { findCurrentBatch } from "../src/lib/planPool";
import { cookModeUrl, encodePlanCallback } from "../src/lib/planConversation";
import { localIsoDate } from "../src/lib/recipeNotes";
import {
  PING_TYPES,
  PULSE_CONFIG,
  encodeRatingCallback,
  isRunsLow,
  nextFireAt,
  parseMuteCommand,
  parseRatingCallback,
  pingConfig,
  ratingKey,
  renderMuteAck,
  renderMuteHelp,
  renderPulseStatus,
  renderRatingPrompt,
  renderRatingTally,
  renderRunsLowNudge,
  renderTonightPing,
  runsLowKey,
  shouldSend,
  slotIsDue,
  tonightKey,
  type PingType,
} from "../src/lib/proactivePulse";
import type { InlineButton, TelegramApi } from "./telegram";
import type { InboxRow } from "./tools";

// ---------------------------------------------------------------------------
// State: mute flags + the send log (the A.6 week-one audit). Deliberately a
// small local JSON file, NOT a table — this plan adds no schema (its
// non-goals), and the same gitignored-file pattern already carries
// compare/.rotation.json.

export interface PulseSend {
  type: PingType;
  key: string;
  at: string;
}

export interface PulseState {
  muted: Partial<Record<PingType, boolean>>;
  lastSends: Partial<Record<PingType, { key: string; at: string }>>;
  log: PulseSend[];
}

export interface PulseStore {
  read(): PulseState;
  write(state: PulseState): void;
}

const EMPTY_STATE = (): PulseState => ({ muted: {}, lastSends: {}, log: [] });

// One week of pings is a couple of dozen rows; keep a generous tail so the
// audit can look back further than the plan's first week.
const LOG_CAP = 500;

export function memoryPulseStore(initial: PulseState = EMPTY_STATE()): PulseStore {
  let state = initial;
  return {
    read: () => state,
    write: (next) => {
      state = next;
    },
  };
}

export function defaultPulseStatePath(): string {
  return (
    process.env.PULSE_STATE_FILE ??
    join(dirname(fileURLToPath(import.meta.url)), ".pulse-state.json")
  );
}

export function filePulseStore(path = defaultPulseStatePath()): PulseStore {
  return {
    read() {
      try {
        if (!existsSync(path)) return EMPTY_STATE();
        return { ...EMPTY_STATE(), ...JSON.parse(readFileSync(path, "utf8")) } as PulseState;
      } catch (err) {
        // A corrupt state file must never take the consumer down; the worst
        // case is one repeated ping, and only inside its own window.
        console.error("[pulse] unreadable state file, starting clean:", err);
        return EMPTY_STATE();
      }
    },
    write(state) {
      try {
        writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
      } catch (err) {
        console.error("[pulse] could not persist state:", err);
      }
    },
  };
}

// ---------------------------------------------------------------------------

export interface PulseDeps {
  supa: SupabaseClient;
  tg: TelegramApi;
  userId: string;
  /** Where proactive messages go — the household group (see resolvePulseChatId). */
  chatId: number;
  recipes: () => ParsedRecipe[];
  store: PulseStore;
}

interface PoolEntryRow {
  id: string;
  recipe_id: string;
  servings_multiplier: number | null;
  cooked_on: string | null;
}

export interface PulseRuntime {
  /** The one thing that can send. Called on an interval by the consumer. */
  tick(now?: Date): Promise<void>;
  /** Boot-log evidence: every armed slot's next fire, all in the future. */
  nextFires(now?: Date): Array<{ type: PingType; at: Date }>;
  /** [🤩]/[😋]/[😐]/[👎] on a rating prompt. False = not our callback. */
  handleRatingCallback(row: InboxRow): Promise<boolean>;
  /** "sluta påminna om X" / "/pulse". False = leave it to the NLU. */
  handleCommand(text: string, chatId: number): Promise<boolean>;
}

export function createPulse(deps: PulseDeps): PulseRuntime {
  const { supa, tg, userId, chatId, recipes, store } = deps;

  const titleOf = (recipeId: string): string =>
    recipes().find((r) => r.id === recipeId)?.title ?? recipeId;
  const cookTimeOf = (recipeId: string): number =>
    recipes().find((r) => r.id === recipeId)?.cookTime ?? 30;

  async function activePool(todayIso: string): Promise<{
    batchId: string | null;
    entries: PoolEntryRow[];
  }> {
    const { data: batches, error } = await supa
      .from("plan_batches")
      .select("id, starts_on, ends_on")
      .eq("user_id", userId);
    if (error) throw new Error(`pulse: load batches failed: ${error.message}`);
    // Open-ended batches (design.spec "Pool over calendar"): the active batch
    // is the one that started most recently — never selected by ends_on.
    const batch = findCurrentBatch(
      (batches ?? []) as Array<{ id: string; starts_on: string }>,
      todayIso,
    );
    if (!batch) return { batchId: null, entries: [] };
    const { data: entries, error: poolError } = await supa
      .from("planned_meals")
      .select("id, recipe_id, servings_multiplier, cooked_on")
      .eq("user_id", userId)
      .eq("batch_id", batch.id)
      .order("created_at")
      .order("id");
    if (poolError) throw new Error(`pulse: load pool failed: ${poolError.message}`);
    return { batchId: batch.id, entries: (entries ?? []) as PoolEntryRow[] };
  }

  function record(type: PingType, key: string): void {
    const state = store.read();
    const at = new Date().toISOString();
    state.lastSends = { ...state.lastSends, [type]: { key, at } };
    state.log = [...state.log, { type, key, at }].slice(-LOG_CAP);
    store.write(state);
    // The live audit trail (plan Step 5): one greppable line per send.
    console.log(`[pulse] sent type=${type} key=${key} chat=${chatId}`);
  }

  function isMuted(type: PingType): boolean {
    return store.read().muted[type] === true;
  }

  function lastKey(type: PingType): string | undefined {
    return store.read().lastSends[type]?.key;
  }

  // --- the three pings ----------------------------------------------------

  async function runsLowPing(todayIso: string): Promise<void> {
    const { batchId, entries } = await activePool(todayIso);
    const remaining = entries.filter((e) => e.cooked_on == null).length;
    if (!isRunsLow(remaining)) return;
    const key = runsLowKey(batchId);
    if (!shouldSend(key, lastKey("runs_low"))) return;
    // Straight into the p4-03 planning conversation: these are its own
    // horizon events, so a tap continues in the existing flow with no
    // separate state of ours (5 days first — the A.3 default).
    const buttons: InlineButton[][] = [
      PULSE_CONFIG.horizonChoices.map((days) => ({
        text: `${days} dagar`,
        callback_data: encodePlanCallback({ kind: "draft", horizonDays: days }),
      })),
      [{ text: "😴 Inte nu", callback_data: encodePlanCallback({ kind: "cancel" }) }],
    ];
    await tg.sendMessage(chatId, renderRunsLowNudge(remaining), buttons);
    record("runs_low", key);
  }

  async function tonightPing(todayIso: string): Promise<void> {
    const { entries } = await activePool(todayIso);
    const remaining = entries.filter((e) => e.cooked_on == null);
    if (remaining.length === 0) return; // "only when a meal is planned"
    const key = tonightKey(todayIso);
    if (!shouldSend(key, lastKey("tonight"))) return;
    const distinct = [...new Set(remaining.map((e) => e.recipe_id))];
    const dishes = distinct.map((id) => ({ title: titleOf(id), cookTime: cookTimeOf(id) }));
    const buttons: InlineButton[][] = [
      [
        {
          text: "🍳 Cook mode",
          url: distinct.length === 1 ? cookModeUrl(distinct[0]) : cookModeUrl(),
        },
        { text: "🛒 Visa listan", callback_data: encodePlanCallback({ kind: "show_list" }) },
      ],
    ];
    await tg.sendMessage(chatId, renderTonightPing(dishes), buttons);
    record("tonight", key);
  }

  async function ratingPing(todayIso: string): Promise<void> {
    const { entries } = await activePool(todayIso);
    // "Only on cooked evenings": a pool entry stamped cooked_on = today.
    const cooked = entries.filter((e) => e.cooked_on === todayIso);
    if (cooked.length === 0) return;
    const recipeId = cooked[cooked.length - 1].recipe_id;
    const key = ratingKey(todayIso, recipeId);
    if (!shouldSend(key, lastKey("rating"))) return;
    await tg.sendMessage(chatId, renderRatingPrompt(titleOf(recipeId)), ratingButtons(recipeId));
    record("rating", key);
  }

  function ratingButtons(recipeId: string): InlineButton[][] {
    return [
      PULSE_CONFIG.ratingChoices.map((choice) => ({
        text: choice.emoji,
        callback_data: encodeRatingCallback(choice.score, recipeId),
      })),
    ];
  }

  // --- the tick -----------------------------------------------------------

  async function tick(now: Date = new Date()): Promise<void> {
    const todayIso = localIsoDate(now);
    for (const type of PING_TYPES) {
      if (!slotIsDue(now, type) || isMuted(type)) continue;
      try {
        if (type === "runs_low") await runsLowPing(todayIso);
        else if (type === "tonight") await tonightPing(todayIso);
        else await ratingPing(todayIso);
      } catch (err) {
        // A proactive ping is never worth taking the consumer down for.
        console.error(`[pulse] ${type} failed:`, err);
      }
    }
  }

  function nextFires(now: Date = new Date()): Array<{ type: PingType; at: Date }> {
    return PING_TYPES.filter((type) => pingConfig(type).enabled && !isMuted(type)).map((type) => ({
      type,
      at: nextFireAt(now, pingConfig(type).sendAt),
    }));
  }

  // --- taps and commands --------------------------------------------------

  async function memberNames(): Promise<Map<string, string>> {
    const { data } = await supa.from("family_members").select("id, name").eq("user_id", userId);
    return new Map(
      ((data ?? []) as Array<{ id: string; name: string }>).map((m) => [m.id, m.name]),
    );
  }

  async function handleRatingCallback(row: InboxRow): Promise<boolean> {
    const parsed = parseRatingCallback(row.text);
    if (!parsed) return false;
    const { score, recipeId } = parsed;

    // The existing recipe_ratings shape, as-is (plan non-goal: no new rating
    // model): one row per (user, recipe, family member), updated in place —
    // the same rows useRecipeRatings reads on the web.
    const { data: existing, error } = await supa
      .from("recipe_ratings")
      .select("id, recipe_id, family_member_id, rating")
      .eq("user_id", userId)
      .eq("recipe_id", recipeId);
    if (error) throw new Error(`pulse: load ratings failed: ${error.message}`);
    const rows = (existing ?? []) as Array<{
      id: string;
      family_member_id: string | null;
      rating: number;
    }>;
    const mine = rows.find((r) => r.family_member_id === row.family_member_id);
    if (mine) {
      const { error: updateError } = await supa
        .from("recipe_ratings")
        .update({ rating: score })
        .eq("id", mine.id);
      if (updateError) throw new Error(`pulse: rating update failed: ${updateError.message}`);
      mine.rating = score;
    } else {
      const { error: insertError } = await supa.from("recipe_ratings").insert({
        user_id: userId,
        recipe_id: recipeId,
        family_member_id: row.family_member_id,
        rating: score,
      });
      if (insertError) throw new Error(`pulse: rating insert failed: ${insertError.message}`);
      rows.push({ id: "new", family_member_id: row.family_member_id, rating: score });
    }

    if (row.message_id == null) return true;
    const names = await memberNames();
    const tally = rows.map((r) => ({
      name: (r.family_member_id ? names.get(r.family_member_id) : null) ?? "hushållet",
      score: r.rating,
    }));
    // ✏️ edited in place (design.spec "Chat voice"), keyboard kept live so
    // the second partner — or a change of heart — can still tap.
    await tg.editMessageText(
      row.chat_id,
      row.message_id,
      renderRatingTally(tally),
      ratingButtons(recipeId),
    );
    return true;
  }

  async function handleCommand(text: string, targetChat: number): Promise<boolean> {
    const trimmed = text.trim();
    if (/^\/pulse\b/i.test(trimmed)) {
      const state = store.read();
      await tg.sendMessage(
        targetChat,
        renderPulseStatus({ muted: state.muted, lastSends: state.lastSends }),
      );
      return true;
    }
    const command = parseMuteCommand(trimmed);
    if (!command) return false;
    if (command.kind === "unknown") {
      await tg.sendMessage(targetChat, renderMuteHelp());
      return true;
    }
    const state = store.read();
    state.muted = { ...state.muted, [command.type]: command.muted };
    store.write(state);
    console.log(`[pulse] ${command.muted ? "muted" : "unmuted"} type=${command.type}`);
    await tg.sendMessage(targetChat, renderMuteAck(command.type, command.muted));
    return true;
  }

  return { tick, nextFires, handleRatingCallback, handleCommand };
}

// ---------------------------------------------------------------------------
// Where proactive messages go. The queue already knows: the household chat is
// whichever chat the allow-listed senders actually use, and a group beats a
// private chat when both have been seen. PULSE_CHAT_ID overrides.

export async function resolvePulseChatId(
  supa: SupabaseClient,
  userId: string,
): Promise<number | null> {
  const override = process.env.PULSE_CHAT_ID;
  if (override && /^-?\d+$/.test(override)) return Number(override);
  const { data, error } = await supa
    .from("telegram_inbox")
    .select("chat_id, payload")
    .eq("user_id", userId)
    .order("id", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[pulse] could not resolve a chat:", error.message);
    return null;
  }
  const rows = (data ?? []) as Array<{ chat_id: number; payload: unknown }>;
  const chatType = (payload: unknown): string | undefined =>
    (payload as { message?: { chat?: { type?: string } } } | null)?.message?.chat?.type;
  const group = rows.find((r) => {
    const type = chatType(r.payload);
    return type === "group" || type === "supergroup";
  });
  return group?.chat_id ?? rows[0]?.chat_id ?? null;
}
