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
  addDays,
  clampHorizon,
  daysUntilWeekday,
  proposeDraft,
  scoreRecipe,
  type DraftEntry,
} from "./planDraft";
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
  replaceDraft(entries: DraftEntry[]): Promise<void>;
  updateEntry(
    id: string,
    patch: { recipe_id?: string; servings_multiplier?: number },
  ): Promise<void>;
  deleteEntry(id: string): Promise<void>;
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
  | { kind: "reroll" }
  | { kind: "edit_menu" }
  | { kind: "pick_entry"; index: number }
  | { kind: "swap"; index: number; recipeId: string }
  | { kind: "swap_query"; recipeQuery: string }
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
    case "reroll": return "p:r";
    case "edit_menu": return "p:e";
    case "pick_entry": return `p:x:${event.index}`;
    case "swap": return `p:s:${event.index}:${event.recipeId}`;
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
    case "r": return { kind: "reroll" };
    case "e": return { kind: "edit_menu" };
    case "x": {
      const i = int(a ?? "");
      return i == null ? null : { kind: "pick_entry", index: i };
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
        ? { kind: "swap_query", recipeQuery: parse.recipe_query }
        : { kind: "edit_menu" };
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
    noDraft: "🤔 Inget utkast på gång — säg \"planera de närmsta dagarna\" så drar jag ett förslag 🌱",
    noRecipe: (q: string) => `🤷 Hittar ingen rätt som matchar "${q}".`,
    whichEntrySwap: (title: string) => `🔁 Vilken rätt ska bytas mot ${title}?`,
    whichEntryMultiplier: (m: number) => `💪 Vilken rätt ska köras ×${m}?`,
    overlap: (range: string) =>
      `🚧 De dagarna är redan låsta (${range}) — planera efter det, eller ändra den batchen först.`,
    locked: (range: string, meals: number, preps: number) =>
      `🔒 Låst! ${range} — ${meals} middagar${preps ? `, varav ${preps} 🍱 meal prep` : ""}.`,
    lockedList: (items: number, sek: number) => `🛒 Inköpslista: ${items} varor, ~${sek} kr.`,
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
    noDraft: '🤔 No draft going — say "plan the next few days" and I\'ll pitch one 🌱',
    noRecipe: (q: string) => `🤷 No dish matching "${q}".`,
    whichEntrySwap: (title: string) => `🔁 Which dish should become ${title}?`,
    whichEntryMultiplier: (m: number) => `💪 Which dish goes ×${m}?`,
    overlap: (range: string) =>
      `🚧 Those days are already locked (${range}) — plan after that, or edit that batch first.`,
    locked: (range: string, meals: number, preps: number) =>
      `🔒 Locked! ${range} — ${meals} dinners${preps ? `, ${preps} of them 🍱 meal prep` : ""}.`,
    lockedList: (items: number, sek: number) => `🛒 Shopping list: ${items} items, ~${sek} kr.`,
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

function draftButtons(entries: PoolRow[], lang: Lang): PlanButton[][] {
  return [
    [{ text: T[lang].lockBtn(entries.length), callback_data: encodePlanCallback({ kind: "lock" }) }],
    [
      { text: T[lang].editBtn, callback_data: encodePlanCallback({ kind: "edit_menu" }) },
      { text: T[lang].rerollBtn, callback_data: encodePlanCallback({ kind: "reroll" }) },
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
): Promise<void> {
  await say(chat, ctx, renderDraft(entries, store.recipes(), ctx.lang), draftButtons(entries, ctx.lang));
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
  exclude: string[] = [],
): Promise<void> {
  const [ratings, lastCooked] = await Promise.all([store.ratings(), store.lastCooked()]);
  const horizon = clampHorizon(horizonDays);
  const entries = proposeDraft({
    recipes: store.recipes().map((r) => ({ id: r.id, title: r.title, tags: r.tags })),
    ratings,
    lastCooked,
    horizonDays: horizon,
    todayIso: ctx.todayIso,
    // Deterministic per day + horizon; a reroll folds in what it is replacing,
    // so "🎲 Ny dragning" is reproducible AND genuinely different.
    seed: `${ctx.todayIso}:${horizon}:${exclude.join(",")}`,
    exclude,
  });
  await store.replaceDraft(entries);
  await showDraft(store, chat, ctx, await store.loadDraft());
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

// Swap candidates for one entry: the best-scoring dishes not already in the
// pool, ranked by the same heuristic the proposer uses.
async function swapCandidates(
  store: PlanStore,
  ctx: PlanContext,
  entries: PoolRow[],
  limit = 3,
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
    .slice(0, limit)
    .map((c) => c.recipe);
}

export function findRecipeByQuery(
  recipes: ParsedRecipe[],
  query: string,
): ParsedRecipe | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const matches = recipes.filter(
    (r) => r.title.toLowerCase().includes(q) || r.id.includes(q.replace(/\s+/g, "-")),
  );
  if (matches.length === 0) return null;
  // Shortest title wins: "dal" should not resolve to a five-word dish when a
  // plain "Chana Dal" is on the shelf.
  return matches.reduce((best, r) => (r.title.length < best.title.length ? r : best));
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
      return makeDraft(store, chat, ctx, event.horizonDays);

    case "reroll": {
      const draft = await store.loadDraft();
      const horizon = draft.length > 0 ? draft.length : DEFAULT_HORIZON_DAYS;
      return makeDraft(store, chat, ctx, horizon, draft.map((e) => e.recipe_id));
    }

    case "edit_menu": {
      const target = await editTarget(store, ctx);
      if (!target) return say(chat, ctx, T[lang].noDraft);
      const buttons = target.entries.map((entry, index) => [
        {
          text: `${dishEmoji(recipeOf(store.recipes(), entry.recipe_id)?.tags ?? [])} ${titleOf(store.recipes(), entry.recipe_id)}`,
          callback_data: encodePlanCallback({ kind: "pick_entry", index }),
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
      const candidates = await swapCandidates(store, ctx, target.entries);
      const buttons: PlanButton[][] = candidates.map((recipe) => [
        {
          text: T[lang].swapTo(recipe.title),
          callback_data: encodePlanCallback({
            kind: "swap",
            index: event.index,
            recipeId: recipe.id,
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
      // Pool model: no weekday says which entry to replace, so ask — one tap.
      const buttons = target.entries.map((entry, index) => [
        {
          text: titleOf(store.recipes(), entry.recipe_id),
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
      await store.lockBatch(range, draft.map((e) => e.id), items);

      const lines = poolLines(draft, store.recipes());
      const preps = lines.filter((l) => l.count > 1).length;
      const text = [
        T[lang].locked(formatRange(range, lang), draft.length, preps),
        ...lines.map((l) => poolLineText(l, store.recipes())),
        "",
        T[lang].lockedList(items.length, sek),
        COMPASSION,
      ].join("\n");
      await say(chat, ctx, text, [[
        { text: T[lang].showListBtn, callback_data: encodePlanCallback({ kind: "show_list" }) },
        { text: T[lang].openWebBtn, url: cookModeUrl() },
      ]]);
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
