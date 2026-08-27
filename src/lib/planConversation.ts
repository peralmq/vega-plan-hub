// p4-03 step 2: the planning conversation — Script 5 (draft → edit → lock)
// and Script 6 (mid-batch swap with a shopping diff) as one state machine.
//
// STATELESS BY CONSTRUCTION (research-plan C.7 bias): there is no session
// object holding "where we are". Every event re-derives the world from the
// store — the open draft is `planned_meals` rows with no batch and no date,
// the locked batches are `plan_batches` rows — so the M1 consumer can restart
// mid-conversation and the next tap continues exactly where it left off. The
// only in-process crumb is `session.pendingDiff`, a message payload with the
// same "ask again" fallback as p4-08's pendingChange.
//
// POOL, NOT CALENDAR (design.spec "Pool over calendar", directive 2026-08-27):
// the draft is a list of meals with counts. Nothing here assigns a weekday;
// dates exist only as the batch's covered range, computed at lock time.
//
// Impurity lives entirely behind the two injected ports (PlanStore, PlanChat),
// so the whole flow replays in unit tests against an in-memory store and a
// mocked Bot API.

import type { ParsedRecipe } from "./recipeMarkdown";
import type { ParsedUtterance } from "./intentParser";
import {
  DEFAULT_HORIZON_DAYS,
  HORIZON_CHOICES,
  MAX_REROLL_ROUND,
  addDays,
  candidatePage,
  clampHorizon,
  daysUntilWeekday,
  draftForRound,
  pageCount,
  scoreRecipe,
  type DraftEntry,
} from "./planDraft";
import { matchCandidates } from "./swedishTerms";
import {
  estimateBatchCostSEK,
  generateShoppingItems,
  reconcileShoppingItems,
  type BatchMeal,
  type ExistingItemRow,
  type GeneratedShoppingItem,
  type ShoppingReconciliation,
} from "./planShopping";

export type Lang = "sv" | "en";

// ---------------------------------------------------------------------------
// Ports

export interface PoolRow {
  id: string;
  recipe_id: string;
  servings_multiplier: number;
}

export interface LockedBatchRow {
  id: string;
  starts_on: string;
  ends_on: string;
}

export interface BatchRange {
  startsOn: string;
  endsOn: string;
}

export interface PlanStore {
  recipes(): ParsedRecipe[];
  ratings(): Promise<Map<string, number>>;
  lastCooked(): Promise<Map<string, string>>;
  preferences(): Promise<Map<string, string>>;
  /** The open draft: pool rows with no batch and no date. */
  loadDraft(): Promise<PoolRow[]>;
  loadCurrentBatch(
    todayIso: string,
  ): Promise<{ batch: LockedBatchRow; entries: PoolRow[] } | null>;
  loadLockedBatches(): Promise<LockedBatchRow[]>;
  /** Pool entries for a SPECIFIC batch, regardless of whether it covers
   * today — p4-10's menu card needs the just-locked batch even when an
   * earlier batch is still current, and needs to re-render an older one
   * on demand ("visa menyn"). */
  loadBatchEntries(batchId: string): Promise<PoolRow[]>;
  replaceDraft(entries: DraftEntry[]): Promise<void>;
  updateEntry(
    id: string,
    patch: { recipe_id?: string; servings_multiplier?: number },
  ): Promise<void>;
  deleteEntry(id: string): Promise<void>;
  /** Add one pool entry — how a storkok pair is made (same recipe twice). */
  insertEntry(entry: DraftEntry, batchId: string | null): Promise<void>;
  lockBatch(
    range: BatchRange,
    entryIds: string[],
    items: GeneratedShoppingItem[],
  ): Promise<string>;
  loadBatchItems(batchId: string): Promise<ExistingItemRow[]>;
  applyItemPlan(batchId: string, plan: ShoppingReconciliation): Promise<void>;
  estimateSek(displayNames: string[]): Promise<number>;
}

export interface PlanButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface PlanChat {
  send(text: string, buttons?: PlanButton[][]): Promise<number | undefined>;
  edit(messageId: number, text: string, buttons?: PlanButton[][]): Promise<void>;
}

export interface PlanSession {
  /** Item names offered by the Script 6 diff question, until it is answered. */
  pendingDiff?: { added: string[] };
}

export interface PlanContext {
  lang: Lang;
  todayIso: string;
  familyMemberId?: string | null;
  /** Present when the event came from a button: the message to edit in place. */
  messageId?: number;
  session: PlanSession;
}

// ---------------------------------------------------------------------------
// Events + callback vocabulary. Telegram caps callback_data at 64 bytes, so
// entries are addressed by their INDEX in the draft (stable: a swap updates a
// row in place, it never reorders the pool) rather than by uuid.

export type PlanEvent =
  | { kind: "start" }
  | { kind: "draft"; horizonDays: number }
  | { kind: "reroll"; round: number }
  | { kind: "edit_menu" }
  | { kind: "pick_entry"; index: number; page: number }
  | { kind: "swap"; index: number; recipeId: string }
  | { kind: "swap_query"; recipeQuery: string; targetQuery?: string }
  | { kind: "storkok"; index: number; on: boolean }
  | { kind: "storkok_query"; on: boolean; targetQuery?: string }
  | { kind: "multiplier"; index: number; multiplier: number }
  | { kind: "multiplier_query"; multiplier: number }
  | { kind: "remove"; index: number }
  | { kind: "lock" }
  | { kind: "show_list" }
  | { kind: "diff"; accepted: boolean }
  | { kind: "cancel" };

export const PLAN_CALLBACK_PREFIX = "p:";

export function encodePlanCallback(event: PlanEvent): string {
  switch (event.kind) {
    case "draft": return `p:h:${event.horizonDays}`;
    case "reroll": return `p:r:${event.round}`;
    case "edit_menu": return "p:e";
    case "pick_entry": return `p:x:${event.index}:${event.page}`;
    case "swap": return `p:s:${event.index}:${event.recipeId}`;
    case "storkok": return `p:k:${event.index}:${event.on ? 1 : 0}`;
    case "multiplier": return `p:m:${event.index}:${event.multiplier}`;
    case "remove": return `p:rm:${event.index}`;
    case "lock": return "p:l";
    case "show_list": return "p:sl";
    case "diff": return event.accepted ? "p:dy" : "p:dn";
    case "cancel": return "p:c";
    default: return "p:c";
  }
}

const int = (raw: string): number | null => (/^\d+$/.test(raw) ? Number(raw) : null);

export function parsePlanCallback(data: string | null | undefined): PlanEvent | null {
  if (!data || !data.startsWith(PLAN_CALLBACK_PREFIX)) return null;
  const parts = data.slice(PLAN_CALLBACK_PREFIX.length).split(":");
  const [verb, a, ...rest] = parts;
  switch (verb) {
    case "h": {
      const days = int(a ?? "");
      return days == null ? null : { kind: "draft", horizonDays: clampHorizon(days) };
    }
    case "r": {
      // A keyboard from before the rotation landed carries a bare "p:r".
      const round = int(a ?? "");
      return { kind: "reroll", round: Math.min(MAX_REROLL_ROUND, round ?? 1) };
    }
    case "e": return { kind: "edit_menu" };
    case "x": {
      const i = int(a ?? "");
      const page = int(rest[0] ?? "");
      return i == null ? null : { kind: "pick_entry", index: i, page: page ?? 0 };
    }
    case "k": {
      const i = int(a ?? "");
      const on = rest[0];
      return i == null || (on !== "0" && on !== "1")
        ? null
        : { kind: "storkok", index: i, on: on === "1" };
    }
    case "s": {
      const i = int(a ?? "");
      const recipeId = rest.join(":");
      return i == null || !recipeId ? null : { kind: "swap", index: i, recipeId };
    }
    case "m": {
      const i = int(a ?? "");
      const multiplier = Number(rest[0]);
      return i == null || !Number.isFinite(multiplier)
        ? null
        : { kind: "multiplier", index: i, multiplier };
    }
    case "rm": {
      const i = int(a ?? "");
      return i == null ? null : { kind: "remove", index: i };
    }
    case "l": return { kind: "lock" };
    case "sl": return { kind: "show_list" };
    case "dy": return { kind: "diff", accepted: true };
    case "dn": return { kind: "diff", accepted: false };
    case "c": return { kind: "cancel" };
    default: return null;
  }
}

// The p4-02 planning intents, reinterpreted for the pool model: `plan_set_day`
// keeps its NLU shape (the model still hears "byt torsdag till tacos") but the
// weekday is DROPPED here — there are no day slots to change any more, only
// pool entries. Which entry gets swapped is settled by one tap.
export function planEventFromParse(
  parse: ParsedUtterance,
  todayIso: string,
): PlanEvent | null {
  switch (parse.intent) {
    case "plan_draft": {
      // The horizon slot is either a day COUNT ("planera 5 dagar" — the
      // rules layer's pool-shaped reading) or an English weekday ("fram till
      // söndag" — what the LLM extracts), which counts the days to it.
      const raw = parse.horizon?.trim();
      const horizon = !raw
        ? null
        : /^\d+$/.test(raw)
          ? clampHorizon(Number(raw))
          : daysUntilWeekday(todayIso, raw);
      return horizon == null ? { kind: "start" } : { kind: "draft", horizonDays: horizon };
    }
    case "plan_set_day":
      return parse.recipe_query
        ? {
            kind: "swap_query",
            recipeQuery: parse.recipe_query,
            ...(parse.target_query ? { targetQuery: parse.target_query } : {}),
          }
        : { kind: "edit_menu" };
    case "plan_set_storkok":
      return {
        kind: "storkok_query",
        on: parse.on !== false,
        ...(parse.recipe_query ? { targetQuery: parse.recipe_query } : {}),
      };
    case "plan_set_multiplier":
      return parse.multiplier && parse.multiplier > 0
        ? { kind: "multiplier_query", multiplier: parse.multiplier }
        : { kind: "edit_menu" };
    case "plan_lock":
      return { kind: "lock" };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Batch range: derived, never asked for. A batch starts the day after
// everything already locked, and covers one day per pool entry.

// The first free day from today, following the chain of batches that already
// cover it — a batch further out is deliberately NOT jumped over, so a draft
// that would collide with it hits the overlap guard instead of silently
// landing after it.
export function nextBatchRange(
  locked: LockedBatchRow[],
  entryCount: number,
  todayIso: string,
): BatchRange {
  let startsOn = todayIso;
  for (let guard = 0; guard <= locked.length; guard++) {
    const covering = locked.find((b) => b.starts_on <= startsOn && startsOn <= b.ends_on);
    if (!covering) break;
    startsOn = addDays(covering.ends_on, 1);
  }
  return { startsOn, endsOn: addDays(startsOn, Math.max(1, entryCount) - 1) };
}

export function findOverlappingBatch(
  locked: LockedBatchRow[],
  range: BatchRange,
): LockedBatchRow | null {
  return (
    locked.find((b) => b.starts_on <= range.endsOn && range.startsOn <= b.ends_on) ?? null
  );
}

// ---------------------------------------------------------------------------
// Copy (design.spec "Chat voice": Swedish by default, emoji as iconography).

const COMPASSION = "cooked with compassion · for the animals, the planet & each other 🐾🌍💚";

const WEEKDAY_LABELS: Record<Lang, string[]> = {
  sv: ["sön", "mån", "tis", "ons", "tors", "fre", "lör"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

function dayLabel(iso: string, lang: Lang): string {
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = WEEKDAY_LABELS[lang][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday} ${d}/${m}`;
}

export function formatRange(range: BatchRange, lang: Lang): string {
  return `${dayLabel(range.startsOn, lang)} → ${dayLabel(range.endsOn, lang)}`;
}

// Emojis are iconography, not decoration (conventions.spec.md) — one per dish,
// derived from the controlled tag vocabulary so it never needs curating.
const TAG_EMOJI: Array<[string, string]> = [
  ["Tacos", "🌮"], ["Sushi", "🍣"], ["Noodles", "🍜"], ["Pasta", "🍝"],
  ["Soup", "🍲"], ["Stew", "🍲"], ["Dal", "🍛"], ["Indian", "🍛"],
  ["Casserole", "🥘"], ["Hash", "🥔"], ["BBQ", "🍢"], ["Fresh", "🥗"],
  ["Spicy", "🌶"], ["Tofu", "🧊"],
];

export function dishEmoji(tags: string[]): string {
  for (const [tag, emoji] of TAG_EMOJI) if (tags.includes(tag)) return emoji;
  return "🥘";
}

const T = {
  sv: {
    askHorizon: "📅 Hur många dagar planerar vi?",
    horizonBtn: (n: number) => `${n} dagar`,
    notNow: "😴 Inte nu",
    cancelled: "👍 Vi tar det sen.",
    draftHeader: (n: number) => `🌱 Utkast — ${n} middagar i potten:`,
    draftHint: "Ingen dag är bokad — ni väljer rätt när ni lagar 🍳",
    lockBtn: (n: number) => `✅ Lås ${n} dagar`,
    editBtn: "✏️ Ändra",
    rerollBtn: "🎲 Ny dragning",
    backBtn: "↩️ Tillbaka",
    editWhich: "✏️ Vilken rätt vill du pilla på?",
    entryMenu: (title: string) => `🍽 ${title} — vad gör vi?`,
    swapTo: (title: string) => `🔁 ${title}`,
    doubleBtn: "💪 Dubbla portioner",
    singleBtn: "🍽 Vanliga portioner",
    removeBtn: "🗑 Ta bort",
    morePicksBtn: "Fler förslag ➡️",
    storkokOnBtn: "🍱 Gör till storkok",
    storkokOffBtn: "🍱 Ta bort storkok",
    storkokOn: (title: string) => `🍱 ${title} blir storkok — samma rätt två gånger i potten.`,
    storkokOff: (title: string) => `🍽 ${title} är tillbaka som en middag.`,
    storkokAlready: (title: string) => `🍱 ${title} är redan storkok.`,
    storkokNot: (title: string) => `🍽 ${title} var inget storkok.`,
    whichEntryStorkok: (on: boolean) =>
      on ? "🍱 Vilken rätt ska bli storkok?" : "🍽 Vilken rätt ska sluta vara storkok?",
    noDraft: "🤔 Inget utkast på gång — säg \"planera de närmsta dagarna\" så drar jag ett förslag 🌱",
    noRecipe: (q: string) => `🤷 Hittar ingen rätt som matchar "${q}".`,
    whichEntrySwap: (title: string) => `🔁 Vilken rätt ska bytas mot ${title}?`,
    whichEntryMultiplier: (m: number) => `💪 Vilken rätt ska köras ×${m}?`,
    overlap: (range: string) =>
      `🚧 De dagarna är redan låsta (${range}) — planera efter det, eller ändra den batchen först.`,
    locked: (range: string, meals: number, preps: number) =>
      `🔒 Låst! ${range} — ${meals} middagar${preps ? `, varav ${preps} 🍱 meal prep` : ""}.`,
    lockedList: (items: number, sek: number) => `🛒 Inköpslista: ${items} varor, ~${sek} kr.`,
    compareHandoff: (batchId: string) => `💻 Prisjämför: npm run compare -- --batch ${batchId}`,
    menuBtn: "📋 Meny",
    showListBtn: "🛒 Visa listan",
    openWebBtn: "🖨 Öppna i appen",
    emptyList: "🛒 Listan är tom — snyggt! ✨",
    listHeader: (n: number) => `🛒 Kvar att handla (${n}):`,
    diffHeader: "🔁 Listan är uppdaterad.",
    diffAdded: (names: string) => `➕ ${names}`,
    diffRemoved: (names: string) => `➖ ${names}`,
    diffAsk: "Den batchen är redan handlad — vill du ha diffen som minilista?",
    diffYes: "🛒 Ja, difflista",
    diffNo: "Nä, vi har det",
    diffList: (names: string) => `🛒 Minilista:\n${names}`,
    diffGone: "🤔 Ingen diff kvar att visa — säg till så räknar jag om 🙏",
    diffOk: "👍 Då kör vi.",
    swapped: (from: string, to: string) => `✏️ ${from} → ${to}.`,
    removed: (title: string) => `🗑 ${title} ur potten.`,
  },
  en: {
    askHorizon: "📅 How many days are we planning?",
    horizonBtn: (n: number) => `${n} days`,
    notNow: "😴 Not now",
    cancelled: "👍 Later then.",
    draftHeader: (n: number) => `🌱 Draft — ${n} dinners in the pool:`,
    draftHint: "No day is booked — you pick a dish when you cook 🍳",
    lockBtn: (n: number) => `✅ Lock ${n} days`,
    editBtn: "✏️ Change",
    rerollBtn: "🎲 New draft",
    backBtn: "↩️ Back",
    editWhich: "✏️ Which dish?",
    entryMenu: (title: string) => `🍽 ${title} — what shall we do?`,
    swapTo: (title: string) => `🔁 ${title}`,
    doubleBtn: "💪 Double portions",
    singleBtn: "🍽 Normal portions",
    removeBtn: "🗑 Remove",
    morePicksBtn: "More ideas ➡️",
    storkokOnBtn: "🍱 Make it a big batch",
    storkokOffBtn: "🍱 Undo big batch",
    storkokOn: (title: string) => `🍱 ${title} is a big batch — the same dish twice in the pool.`,
    storkokOff: (title: string) => `🍽 ${title} is back to one dinner.`,
    storkokAlready: (title: string) => `🍱 ${title} already is a big batch.`,
    storkokNot: (title: string) => `🍽 ${title} was not a big batch.`,
    whichEntryStorkok: (on: boolean) =>
      on ? "🍱 Which dish becomes a big batch?" : "🍽 Which dish stops being a big batch?",
    noDraft: '🤔 No draft going — say "plan the next few days" and I\'ll pitch one 🌱',
    noRecipe: (q: string) => `🤷 No dish matching "${q}".`,
    whichEntrySwap: (title: string) => `🔁 Which dish should become ${title}?`,
    whichEntryMultiplier: (m: number) => `💪 Which dish goes ×${m}?`,
    overlap: (range: string) =>
      `🚧 Those days are already locked (${range}) — plan after that, or edit that batch first.`,
    locked: (range: string, meals: number, preps: number) =>
      `🔒 Locked! ${range} — ${meals} dinners${preps ? `, ${preps} of them 🍱 meal prep` : ""}.`,
    lockedList: (items: number, sek: number) => `🛒 Shopping list: ${items} items, ~${sek} kr.`,
    compareHandoff: (batchId: string) => `💻 Compare prices: npm run compare -- --batch ${batchId}`,
    menuBtn: "📋 Menu",
    showListBtn: "🛒 Show list",
    openWebBtn: "🖨 Open in the app",
    emptyList: "🛒 List is empty — nice! ✨",
    listHeader: (n: number) => `🛒 Left to buy (${n}):`,
    diffHeader: "🔁 List updated.",
    diffAdded: (names: string) => `➕ ${names}`,
    diffRemoved: (names: string) => `➖ ${names}`,
    diffAsk: "That batch is already shopped — want the diff as a mini-list?",
    diffYes: "🛒 Yes, diff list",
    diffNo: "Nah, we have it",
    diffList: (names: string) => `🛒 Mini-list:\n${names}`,
    diffGone: "🤔 No diff left to show — ask again and I'll recompute 🙏",
    diffOk: "👍 Righto.",
    swapped: (from: string, to: string) => `✏️ ${from} → ${to}.`,
    removed: (title: string) => `🗑 ${title} out of the pool.`,
  },
} satisfies Record<Lang, unknown>;

// design.spec "Cook Mode deep links": the deployed base serves index.html
// directly, so `?recipe=&scale=` on the base URL is the whole contract.
const DEPLOY_BASE = "https://peralmq.github.io/vega-plan-hub/";

export function cookModeBaseUrl(): string {
  return DEPLOY_BASE;
}

export function cookModeUrl(recipeId?: string, scale?: number): string {
  if (!recipeId) return DEPLOY_BASE;
  const params = new URLSearchParams({ recipe: recipeId });
  if (scale != null && scale !== 1) params.set("scale", String(scale));
  return `${DEPLOY_BASE}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Rendering

const titleOf = (recipes: ParsedRecipe[], recipeId: string): string =>
  recipes.find((r) => r.id === recipeId)?.title ?? recipeId;

const recipeOf = (recipes: ParsedRecipe[], recipeId: string): ParsedRecipe | undefined =>
  recipes.find((r) => r.id === recipeId);

interface PoolLine {
  recipeId: string;
  title: string;
  count: number;
  multipliers: number[];
}

// Same-recipe entries collapse into one line with a 🍱 ×N badge — the pool's
// count IS the meal prep (tech.spec "Pool model").
export function poolLines(entries: PoolRow[], recipes: ParsedRecipe[]): PoolLine[] {
  const order: string[] = [];
  const byRecipe = new Map<string, PoolLine>();
  for (const entry of entries) {
    const existing = byRecipe.get(entry.recipe_id);
    if (existing) {
      existing.count++;
      existing.multipliers.push(entry.servings_multiplier);
      continue;
    }
    order.push(entry.recipe_id);
    byRecipe.set(entry.recipe_id, {
      recipeId: entry.recipe_id,
      title: titleOf(recipes, entry.recipe_id),
      count: 1,
      multipliers: [entry.servings_multiplier],
    });
  }
  return order.map((id) => byRecipe.get(id)!);
}

function poolLineText(line: PoolLine, recipes: ParsedRecipe[]): string {
  const emoji = dishEmoji(recipeOf(recipes, line.recipeId)?.tags ?? []);
  const prep = line.count > 1 ? ` 🍱 ×${line.count}` : "";
  const scaled = line.multipliers.filter((m) => m !== 1);
  const portions = scaled.length > 0 ? ` (×${Math.max(...scaled)} portioner)` : "";
  return `• ${emoji} ${line.title}${prep}${portions}`;
}

export function renderDraft(
  entries: PoolRow[],
  recipes: ParsedRecipe[],
  lang: Lang,
): string {
  const lines = poolLines(entries, recipes).map((l) => poolLineText(l, recipes));
  return [T[lang].draftHeader(entries.length), ...lines, "", T[lang].draftHint].join("\n");
}

// FNV-1a → a small stable number. Used to pick the next reroll round when the
// draft is re-rendered by something that carries no round of its own (a swap,
// a storkok toggle): the pool has changed, so the rotation should move too,
// and deriving it from the pool keeps that decision stateless.
function stableHash(text: string): number {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function nextRerollRound(entries: PoolRow[], shownRound?: number): number {
  if (shownRound != null) return Math.min(MAX_REROLL_ROUND, shownRound + 1);
  const pool = entries.map((e) => e.recipe_id).sort().join(",");
  return 1 + (stableHash(pool) % 8);
}

function draftButtons(entries: PoolRow[], lang: Lang, round?: number): PlanButton[][] {
  return [
    [{ text: T[lang].lockBtn(entries.length), callback_data: encodePlanCallback({ kind: "lock" }) }],
    [
      { text: T[lang].editBtn, callback_data: encodePlanCallback({ kind: "edit_menu" }) },
      {
        text: T[lang].rerollBtn,
        callback_data: encodePlanCallback({
          kind: "reroll",
          round: nextRerollRound(entries, round),
        }),
      },
    ],
  ];
}

// ---------------------------------------------------------------------------
// The machine

async function say(
  chat: PlanChat,
  ctx: PlanContext,
  text: string,
  buttons: PlanButton[][] = [],
): Promise<void> {
  // Multi-step flows edit ONE message in place (design.spec "Chat voice").
  // A free-text turn has no message of ours to edit, so it starts a new one.
  // The default `[]` is deliberate and always passed on: a step that ends the
  // flow ("👍 Då kör vi.") must take the previous step's buttons with it,
  // rather than leaving a live keyboard on a finished conversation.
  if (ctx.messageId != null) await chat.edit(ctx.messageId, text, buttons);
  else await chat.send(text, buttons);
}

async function showDraft(
  store: PlanStore,
  chat: PlanChat,
  ctx: PlanContext,
  entries: PoolRow[],
  round?: number,
): Promise<void> {
  await say(
    chat,
    ctx,
    renderDraft(entries, store.recipes(), ctx.lang),
    draftButtons(entries, ctx.lang, round),
  );
}

// The pool being edited: the open draft when there is one, otherwise the
// batch covering today (Script 6's mid-batch swap).
interface EditTarget {
  entries: PoolRow[];
  batchId: string | null;
}

async function editTarget(store: PlanStore, ctx: PlanContext): Promise<EditTarget | null> {
  const draft = await store.loadDraft();
  if (draft.length > 0) return { entries: draft, batchId: null };
  const current = await store.loadCurrentBatch(ctx.todayIso);
  if (current) return { entries: current.entries, batchId: current.batch.id };
  return null;
}

async function makeDraft(
  store: PlanStore,
  chat: PlanChat,
  ctx: PlanContext,
  horizonDays: number,
  round: number,
): Promise<void> {
  const [ratings, lastCooked] = await Promise.all([store.ratings(), store.lastCooked()]);
  const horizon = clampHorizon(horizonDays);
  // Deterministic per day + horizon + ROUND, and round n excludes every dish
  // rounds 0…n-1 offered — so 🎲 walks the shelf instead of circling the same
  // handful (live feedback 2026-08-27).
  const entries = draftForRound(
    {
      recipes: store.recipes().map((r) => ({ id: r.id, title: r.title, tags: r.tags })),
      ratings,
      lastCooked,
      horizonDays: horizon,
      todayIso: ctx.todayIso,
    },
    round,
  );
  await store.replaceDraft(entries);
  await showDraft(store, chat, ctx, await store.loadDraft(), round);
}

// After any pool change: an unlocked draft just re-renders; a locked batch
// regenerates its shopping rows (checked ticks preserved) and offers the diff.
async function afterPoolChange(
  store: PlanStore,
  chat: PlanChat,
  ctx: PlanContext,
  target: EditTarget,
  headline: string,
): Promise<void> {
  if (target.batchId == null) {
    await showDraft(store, chat, ctx, await store.loadDraft());
    return;
  }
  const current = await store.loadCurrentBatch(ctx.todayIso);
  if (!current) return;
  const [preferences, existing] = await Promise.all([
    store.preferences(),
    store.loadBatchItems(target.batchId),
  ]);
  const generated = generateShoppingItems(toBatchMeals(store, current.entries), preferences);
  const plan = reconcileShoppingItems(existing, generated);
  await store.applyItemPlan(target.batchId, plan);

  const lang = ctx.lang;
  const lines = [headline, T[lang].diffHeader];
  if (plan.added.length > 0) lines.push(T[lang].diffAdded(plan.added.map((i) => i.displayName).join(", ")));
  if (plan.removed.length > 0) lines.push(T[lang].diffRemoved(plan.removed.map((i) => i.display_name).join(", ")));
  lines.push(T[lang].diffAsk);
  ctx.session.pendingDiff = { added: plan.added.map((i) => i.displayName) };
  await say(chat, ctx, lines.join("\n"), [[
    { text: T[lang].diffYes, callback_data: encodePlanCallback({ kind: "diff", accepted: true }) },
    { text: T[lang].diffNo, callback_data: encodePlanCallback({ kind: "diff", accepted: false }) },
  ]]);
}

function toBatchMeals(store: PlanStore, entries: PoolRow[]): BatchMeal[] {
  const recipes = store.recipes();
  const meals: BatchMeal[] = [];
  for (const entry of entries) {
    const recipe = recipeOf(recipes, entry.recipe_id);
    if (recipe) meals.push({ recipe, servingsMultiplier: entry.servings_multiplier });
  }
  return meals;
}

// How many dishes one page of the swap picker offers. Four keeps the keyboard
// thumb-sized; the pager below reaches the rest of the library.
export const SWAP_PAGE_SIZE = 4;

// Every dish not already in the pool, in one deterministic order (the same
// heuristic the proposer uses). The picker shows a PAGE of this and wraps, so
// [Fler förslag ➡️] eventually offers all 30 — the live complaint was that it
// kept serving the same handful (2026-08-27).
async function rankedSwapCandidates(
  store: PlanStore,
  ctx: PlanContext,
  entries: PoolRow[],
): Promise<ParsedRecipe[]> {
  const [ratings, lastCooked] = await Promise.all([store.ratings(), store.lastCooked()]);
  const inPool = new Set(entries.map((e) => e.recipe_id));
  return store
    .recipes()
    .filter((r) => !inPool.has(r.id))
    .map((recipe) => ({
      recipe,
      score: scoreRecipe(
        { id: recipe.id, title: recipe.title, tags: recipe.tags },
        { ratings, lastCooked, todayIso: ctx.todayIso, seed: `swap:${ctx.todayIso}` },
      ),
    }))
    .sort((a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id))
    .map((c) => c.recipe);
}

// Which pool entries a spoken dish name refers to ("byt DALEN mot …"), by the
// same Swedish definite-form matching the shopping list uses.
export function matchPoolEntries(
  entries: PoolRow[],
  recipes: ParsedRecipe[],
  query: string,
): number[] {
  const wanted = findRecipeByQuery(recipes, query);
  const hits: number[] = [];
  entries.forEach((entry, index) => {
    if (wanted && entry.recipe_id === wanted.id) hits.push(index);
  });
  return hits;
}

// Free text is the escape hatch a 30-dish keyboard can never be, so this has
// to catch how the household actually names dishes: definite forms
// ("moussakan"), one word out of a long Swedish title ("pyttipanna",
// "sushirullar"), or the id. Candidates are tried widest-first and the
// shortest matching title wins, so "dal" lands on "Chana Dal" and not on a
// five-word dish that merely contains the word.
export function findRecipeByQuery(
  recipes: ParsedRecipe[],
  query: string,
): ParsedRecipe | null {
  const raw = query.trim().toLowerCase().replace(/[.!?]+$/, "");
  if (!raw) return null;
  const shortest = (matches: ParsedRecipe[]) =>
    matches.length === 0
      ? null
      : matches.reduce((best, r) => (r.title.length < best.title.length ? r : best));

  for (const candidate of matchCandidates(raw)) {
    if (candidate.length < 3) continue;
    const hit = shortest(
      recipes.filter(
        (r) =>
          r.title.toLowerCase().includes(candidate) ||
          r.id.includes(candidate.replace(/\s+/g, "-")),
      ),
    );
    if (hit) return hit;
  }
  // Last resort: every word of the query has to appear somewhere in the title
  // ("vegansk moussaka" → "Vegansk moussaka" even with the words reordered).
  const words = raw.split(/\s+/).filter((w) => w.length >= 3);
  if (words.length === 0) return null;
  return shortest(
    recipes.filter((r) => {
      const title = r.title.toLowerCase();
      return words.every((w) => matchCandidates(w).some((c) => title.includes(c)));
    }),
  );
}

export async function handlePlanEvent(
  store: PlanStore,
  chat: PlanChat,
  ctx: PlanContext,
  event: PlanEvent,
): Promise<void> {
  const lang = ctx.lang;

  switch (event.kind) {
    case "start": {
      // An open draft is never silently thrown away — show it instead.
      const draft = await store.loadDraft();
      if (draft.length > 0) return showDraft(store, chat, ctx, draft);
      const buttons: PlanButton[][] = [
        HORIZON_CHOICES.map((days) => ({
          text: T[lang].horizonBtn(days),
          callback_data: encodePlanCallback({ kind: "draft", horizonDays: days }),
        })),
        [{ text: T[lang].notNow, callback_data: encodePlanCallback({ kind: "cancel" }) }],
      ];
      await say(chat, ctx, T[lang].askHorizon, buttons);
      return;
    }

    case "draft":
      return makeDraft(store, chat, ctx, event.horizonDays, 0);

    case "reroll": {
      const draft = await store.loadDraft();
      const horizon = draft.length > 0 ? draft.length : DEFAULT_HORIZON_DAYS;
      return makeDraft(store, chat, ctx, horizon, event.round);
    }

    case "edit_menu": {
      const target = await editTarget(store, ctx);
      if (!target) return say(chat, ctx, T[lang].noDraft);
      const buttons = target.entries.map((entry, index) => [
        {
          text: `${dishEmoji(recipeOf(store.recipes(), entry.recipe_id)?.tags ?? [])} ${titleOf(store.recipes(), entry.recipe_id)}`,
          callback_data: encodePlanCallback({ kind: "pick_entry", index, page: 0 }),
        },
      ]);
      buttons.push([{ text: T[lang].backBtn, callback_data: encodePlanCallback({ kind: "cancel" }) }]);
      await say(chat, ctx, T[lang].editWhich, buttons);
      return;
    }

    case "pick_entry": {
      const target = await editTarget(store, ctx);
      const entry = target?.entries[event.index];
      if (!target || !entry) return say(chat, ctx, T[lang].noDraft);
      const ranked = await rankedSwapCandidates(store, ctx, target.entries);
      const page = Math.max(0, event.page);
      const buttons: PlanButton[][] = candidatePage(ranked, page, SWAP_PAGE_SIZE).map((recipe) => [
        {
          text: T[lang].swapTo(recipe.title),
          callback_data: encodePlanCallback({
            kind: "swap",
            index: event.index,
            recipeId: recipe.id,
          }),
        },
      ]);
      // The pager is what makes the whole library reachable from a keyboard.
      if (pageCount(ranked.length, SWAP_PAGE_SIZE) > 1) {
        buttons.push([
          {
            text: T[lang].morePicksBtn,
            callback_data: encodePlanCallback({
              kind: "pick_entry",
              index: event.index,
              page: page + 1,
            }),
          },
        ]);
      }
      const isStorkok =
        target.entries.filter((e) => e.recipe_id === entry.recipe_id).length > 1;
      buttons.push([
        {
          text: isStorkok ? T[lang].storkokOffBtn : T[lang].storkokOnBtn,
          callback_data: encodePlanCallback({
            kind: "storkok",
            index: event.index,
            on: !isStorkok,
          }),
        },
      ]);
      buttons.push([
        entry.servings_multiplier === 1
          ? {
              text: T[lang].doubleBtn,
              callback_data: encodePlanCallback({
                kind: "multiplier",
                index: event.index,
                multiplier: 2,
              }),
            }
          : {
              text: T[lang].singleBtn,
              callback_data: encodePlanCallback({
                kind: "multiplier",
                index: event.index,
                multiplier: 1,
              }),
            },
        { text: T[lang].removeBtn, callback_data: encodePlanCallback({ kind: "remove", index: event.index }) },
      ]);
      buttons.push([{ text: T[lang].backBtn, callback_data: encodePlanCallback({ kind: "cancel" }) }]);
      await say(chat, ctx, T[lang].entryMenu(titleOf(store.recipes(), entry.recipe_id)), buttons);
      return;
    }

    // Storkok (directive Pelle 2026-08-27) = the SAME RECIPE TWICE in the
    // pool: cook once, the second entry is the leftovers night. Deliberately
    // not the servings multiplier, which stays family-size — the shared
    // aggregation doubles the shopping list either way, but only the pair
    // reads as "two dinners" in Cook Mode and the 🍱 ×2 badge.
    case "storkok": {
      const target = await editTarget(store, ctx);
      const entry = target?.entries[event.index];
      if (!target || !entry) return say(chat, ctx, T[lang].noDraft);
      const siblings = target.entries.filter((e) => e.recipe_id === entry.recipe_id);
      const title = titleOf(store.recipes(), entry.recipe_id);
      let headline: string;
      if (event.on) {
        if (siblings.length > 1) headline = T[lang].storkokAlready(title);
        else {
          await store.insertEntry(
            { recipeId: entry.recipe_id, servingsMultiplier: entry.servings_multiplier },
            target.batchId,
          );
          headline = T[lang].storkokOn(title);
        }
      } else if (siblings.length < 2) {
        headline = T[lang].storkokNot(title);
      } else {
        await store.deleteEntry(siblings[siblings.length - 1].id);
        headline = T[lang].storkokOff(title);
      }
      return afterPoolChange(store, chat, ctx, target, headline);
    }

    case "storkok_query": {
      const target = await editTarget(store, ctx);
      if (!target) return say(chat, ctx, T[lang].noDraft);
      const hits = event.targetQuery
        ? matchPoolEntries(target.entries, store.recipes(), event.targetQuery)
        : [];
      if (hits.length === 1) {
        return handlePlanEvent(store, chat, ctx, {
          kind: "storkok",
          index: hits[0],
          on: event.on,
        });
      }
      // Ambiguous or unnamed: one tap per dish, never a guess.
      const choices = hits.length > 1 ? hits : target.entries.map((_, i) => i);
      const seen = new Set<string>();
      const buttons: PlanButton[][] = [];
      for (const index of choices) {
        const recipeId = target.entries[index].recipe_id;
        if (seen.has(recipeId)) continue;
        seen.add(recipeId);
        buttons.push([
          {
            text: titleOf(store.recipes(), recipeId),
            callback_data: encodePlanCallback({ kind: "storkok", index, on: event.on }),
          },
        ]);
      }
      buttons.push([{ text: T[lang].backBtn, callback_data: encodePlanCallback({ kind: "cancel" }) }]);
      await say(chat, ctx, T[lang].whichEntryStorkok(event.on), buttons);
      return;
    }

    case "swap": {
      const target = await editTarget(store, ctx);
      const entry = target?.entries[event.index];
      if (!target || !entry) return say(chat, ctx, T[lang].noDraft);
      const from = titleOf(store.recipes(), entry.recipe_id);
      await store.updateEntry(entry.id, { recipe_id: event.recipeId });
      return afterPoolChange(
        store,
        chat,
        ctx,
        target,
        T[lang].swapped(from, titleOf(store.recipes(), event.recipeId)),
      );
    }

    case "swap_query": {
      const recipe = findRecipeByQuery(store.recipes(), event.recipeQuery);
      if (!recipe) return say(chat, ctx, T[lang].noRecipe(event.recipeQuery));
      const target = await editTarget(store, ctx);
      if (!target) return say(chat, ctx, T[lang].noDraft);
      // "byt DALEN mot pyttipanna" names the victim: no need to ask.
      const named = event.targetQuery
        ? matchPoolEntries(target.entries, store.recipes(), event.targetQuery)
        : [];
      if (named.length === 1) {
        return handlePlanEvent(store, chat, ctx, {
          kind: "swap",
          index: named[0],
          recipeId: recipe.id,
        });
      }
      // Pool model: no weekday says which entry to replace, so ask — one tap.
      const choices = named.length > 1 ? named : target.entries.map((_, i) => i);
      const buttons = choices.map((index) => [
        {
          text: titleOf(store.recipes(), target.entries[index].recipe_id),
          callback_data: encodePlanCallback({ kind: "swap", index, recipeId: recipe.id }),
        },
      ]);
      buttons.push([{ text: T[lang].backBtn, callback_data: encodePlanCallback({ kind: "cancel" }) }]);
      await say(chat, ctx, T[lang].whichEntrySwap(recipe.title), buttons);
      return;
    }

    case "multiplier": {
      const target = await editTarget(store, ctx);
      const entry = target?.entries[event.index];
      if (!target || !entry) return say(chat, ctx, T[lang].noDraft);
      await store.updateEntry(entry.id, { servings_multiplier: event.multiplier });
      return afterPoolChange(
        store,
        chat,
        ctx,
        target,
        `💪 ${titleOf(store.recipes(), entry.recipe_id)} ×${event.multiplier}.`,
      );
    }

    case "multiplier_query": {
      const target = await editTarget(store, ctx);
      if (!target) return say(chat, ctx, T[lang].noDraft);
      const buttons = target.entries.map((entry, index) => [
        {
          text: titleOf(store.recipes(), entry.recipe_id),
          callback_data: encodePlanCallback({
            kind: "multiplier",
            index,
            multiplier: event.multiplier,
          }),
        },
      ]);
      buttons.push([{ text: T[lang].backBtn, callback_data: encodePlanCallback({ kind: "cancel" }) }]);
      await say(chat, ctx, T[lang].whichEntryMultiplier(event.multiplier), buttons);
      return;
    }

    case "remove": {
      const target = await editTarget(store, ctx);
      const entry = target?.entries[event.index];
      if (!target || !entry) return say(chat, ctx, T[lang].noDraft);
      await store.deleteEntry(entry.id);
      return afterPoolChange(
        store,
        chat,
        ctx,
        target,
        T[lang].removed(titleOf(store.recipes(), entry.recipe_id)),
      );
    }

    case "lock": {
      const draft = await store.loadDraft();
      if (draft.length === 0) return say(chat, ctx, T[lang].noDraft);
      const locked = await store.loadLockedBatches();
      const range = nextBatchRange(locked, draft.length, ctx.todayIso);
      const clash = findOverlappingBatch(locked, range);
      if (clash) {
        await say(
          chat,
          ctx,
          T[lang].overlap(formatRange({ startsOn: clash.starts_on, endsOn: clash.ends_on }, lang)),
        );
        return;
      }
      const preferences = await store.preferences();
      const items = generateShoppingItems(toBatchMeals(store, draft), preferences);
      const sek = await store.estimateSek(items.map((i) => i.displayName));
      const batchId = await store.lockBatch(range, draft.map((e) => e.id), items);

      const lines = poolLines(draft, store.recipes());
      const preps = lines.filter((l) => l.count > 1).length;
      const text = [
        T[lang].locked(formatRange(range, lang), draft.length, preps),
        ...lines.map((l) => poolLineText(l, store.recipes())),
        "",
        T[lang].lockedList(items.length, sek),
        // p5-05 deferred step 4 (lands here per that plan's Progress note):
        // the price-compare handoff, full batch id — compare/cli.ts's
        // --batch matches ids exactly, no prefix support.
        T[lang].compareHandoff(batchId),
        COMPASSION,
      ].join("\n");
      await say(chat, ctx, text, [
        [
          { text: T[lang].showListBtn, callback_data: encodePlanCallback({ kind: "show_list" }) },
          { text: T[lang].openWebBtn, url: cookModeUrl() },
        ],
        // p4-10: re-sends the full menu card (album + HTML message + PDF) —
        // routed in bot/tools.ts as a plain callback (never a "p:" event;
        // the pure state machine here has no Telegram album/document port).
        [{ text: T[lang].menuBtn, callback_data: "show_menu" }],
      ]);
      return;
    }

    case "show_list": {
      const current = await store.loadCurrentBatch(ctx.todayIso);
      const batches = await store.loadLockedBatches();
      const batchId = current?.batch.id ?? batches[batches.length - 1]?.id;
      const rows = batchId ? await store.loadBatchItems(batchId) : [];
      const open = rows.filter((r) => r.checked_at == null);
      if (open.length === 0) return say(chat, ctx, T[lang].emptyList);
      const body = open
        .map((r) =>
          ["•", r.quantity ?? "", r.quantity ? (r.unit ?? "") : "", r.display_name]
            .filter((part) => String(part) !== "")
            .join(" "),
        )
        .join("\n");
      await say(chat, ctx, `${T[lang].listHeader(open.length)}\n${body}`);
      return;
    }

    case "diff": {
      const pending = ctx.session.pendingDiff;
      delete ctx.session.pendingDiff;
      if (!event.accepted) return say(chat, ctx, T[lang].diffOk);
      if (!pending || pending.added.length === 0) return say(chat, ctx, T[lang].diffGone);
      await say(chat, ctx, T[lang].diffList(pending.added.map((n) => `• ${n}`).join("\n")));
      return;
    }

    case "cancel": {
      const draft = await store.loadDraft();
      if (draft.length > 0) return showDraft(store, chat, ctx, draft);
      await say(chat, ctx, T[lang].cancelled);
      return;
    }
  }
}
