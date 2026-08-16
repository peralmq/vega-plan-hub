// p5-01 store-comparison CLI: compare a shopping list across Mathem,
// Willys, Hemköp, ICA (default store: Maxi Lindhagen) and Coop, with a
// delivery-eligibility check. Cart-ready only — checkout, slot booking
// and payment always stay with the human (non-goal by design).
//
//   npm run compare -- --list fixtures/compare-list.json [--zip 11251]
//     [--stores mathem,willys,hemkop,ica,coop] [--day 2026-08-20]
//     [--window 17-20] [--fill-cart mathem] [--json]
//
// List file: JSON array of search terms (strings) or {name} objects; a
// {name, stores: [...]} entry restricts where that item may be sourced
// (p5-02 affinity), and the rotation suggestion alternates the primary
// store among tied candidates week over week (--record <store> after
// ordering updates compare/.rotation.json).
// Slot-level day/time filtering needs store logins (Willys/Hemköp) or the
// Mathem MCP OAuth — until those human steps land, --day/--window are
// recorded in the output but per-store slot status is reported honestly
// as needs-auth / check-at-checkout.
import { readFileSync } from "node:fs";

import {
  axfoodFeeSlot,
  coopFeeSlot,
  mathemFeeSlot,
  rankByComparable,
  slotFees,
  unknownFees,
  validateMathemSlots,
  type DeliveryFees,
} from "@/lib/feeTotals";
import {
  buildComparison,
  cartPlan,
  commonProductsFromMathemOrders,
  commonProductsFromOrders,
  extractAxfood,
  extractMathemMcp,
  mergeSeeds,
  validateMathemOrders,
  type StoreComparison,
  type StoreProduct,
} from "@/lib/storeCompare";
import {
  allowedTerms,
  parseListEntries,
  suggestPrimary,
  type ListItem,
  type RotationSuggestion,
} from "@/lib/storeRotation";
import { AxfoodSession, type AxfoodSlot } from "./axfood";
import { loadRotationHistory, recordRun } from "./rotation-state";
import { cached } from "./cache";
import { loadCompareEnv } from "./env";
import {
  cartItemsTotal,
  getDeliverySlots,
  getOrders,
  hasMathemAuth,
  likelyToBuy,
  manipulateCart,
  type MathemSlot,
} from "./mathem-mcp";
import {
  coopTimeWindows,
  ICA_DEFAULT_STORE,
  icaStoresForZip,
  pacedDelay,
  searchCoop,
  searchHemkop,
  searchIca,
  searchMathem,
  searchWillys,
  type SearchResult,
} from "./stores";

type DeliveryStatus =
  | { kind: "eligible"; detail: string; fees?: DeliveryFees }
  | { kind: "not-deliverable"; detail: string; fees?: DeliveryFees }
  | { kind: "needs-auth"; detail: string; fees?: DeliveryFees }
  | { kind: "unknown"; detail: string; fees?: DeliveryFees };

/** Fees for ranking: handlers attach them where computable; otherwise the
 * status itself says why they are unknown (needs-auth, no --day, ICA's
 * at-checkout fees) or that no eligible slot exists. */
function feesOf(delivery: DeliveryStatus): DeliveryFees {
  if (delivery.fees) return delivery.fees;
  if (delivery.kind === "not-deliverable") return { kind: "none" };
  return unknownFees(delivery.detail);
}

interface StoreReport {
  comparison: StoreComparison | null;
  errors: string[];
  delivery: DeliveryStatus;
  /** Terms this store may not supply under the list's affinities. */
  excluded: string[];
}

const SEARCHERS: Record<string, (term: string) => Promise<SearchResult>> = {
  mathem: searchMathem,
  willys: searchWillys,
  hemkop: searchHemkop,
  ica: searchIca,
  coop: searchCoop,
};

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function readList(path: string): ListItem[] {
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!Array.isArray(raw)) throw new Error("list file must be a JSON array");
  return parseListEntries(raw);
}

/** Format a UTC instant (ISO string or epoch ms) as local Stockholm HH:MM. */
const localTime = (t: string | number) =>
  new Date(t).toLocaleTimeString("sv-SE", {
    timeZone: "Europe/Stockholm",
    hour: "2-digit",
    minute: "2-digit",
  });

const localHour = (t: string | number) =>
  Number(
    new Date(t).toLocaleTimeString("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", hour12: false }),
  );

function inWindow(openIso: string | number, closeIso: string | number, window: string | null): boolean {
  if (!window) return true;
  const m = window.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) return true;
  const [from, to] = [Number(m[1]), Number(m[2])];
  // Overlap test: the slot's local delivery window intersects [from, to).
  return localHour(openIso) < to && localHour(closeIso) > from;
}

const slotInWindow = (slot: MathemSlot, window: string | null): boolean =>
  inWindow(slot.openDatetime, slot.closeDatetime, window);

/** Local Stockholm calendar date (YYYY-MM-DD) of a UTC instant. */
const localDate = (t: string | number): string =>
  new Date(t).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });

async function mathemDelivery(day: string | null, window: string | null): Promise<DeliveryStatus> {
  if (!hasMathemAuth()) {
    return { kind: "needs-auth", detail: "run `npm run mathem-auth` to enable Mathem slot checks" };
  }
  if (!day) return { kind: "eligible", detail: "authenticated — pass --day YYYY-MM-DD to fetch slots" };
  try {
    const days = await getDeliverySlots([day]);
    const allSlots = days[0]?.slots ?? [];
    validateMathemSlots(allSlots);
    const open = allSlots.filter((s) => !s.isFull && !s.isUnavailable);
    const inWindow = open.filter((s) => slotInWindow(s, window));
    if (inWindow.length > 0) {
      const shown = inWindow
        .slice(0, 4)
        .map((s) => `${localTime(s.openDatetime)}–${localTime(s.closeDatetime)} (${s.price})`)
        .join(", ");
      return {
        kind: "eligible",
        detail: `${inWindow.length} slot(s) on ${day}${window ? ` in ${window}` : ""}: ${shown}${inWindow.length > 4 ? ", …" : ""}`,
        fees: slotFees(inWindow.map(mathemFeeSlot)),
      };
    }
    return {
      kind: "not-deliverable",
      detail:
        open.length > 0
          ? `no slots in ${window ?? "window"} on ${day}, but ${open.length} at other times that day`
          : `no open slots on ${day}`,
    };
  } catch (e) {
    return { kind: "unknown", detail: `Mathem slot lookup failed: ${e instanceof Error ? e.message : e}` };
  }
}

const axfoodSlotInWindow = (slot: AxfoodSlot, window: string | null): boolean =>
  inWindow(slot.startTime, slot.endTime, window);

/** Willys/Hemköp slot tier: same Axfood platform, credentials per chain
 * from compare/.env ({PREFIX}_USERNAME / {PREFIX}_PASSWORD). Read-only —
 * login + slot listing; booking stays with the human. Slot fees are
 * per-slot (totalCost = delivery + picking), shown with each slot. */
async function axfoodDelivery(
  host: string,
  envPrefix: string,
  zip: string | null,
  day: string | null,
  window: string | null,
): Promise<DeliveryStatus> {
  const username = process.env[`${envPrefix}_USERNAME`];
  const password = process.env[`${envPrefix}_PASSWORD`];
  if (!username || !password) {
    return {
      kind: "needs-auth",
      detail: `slot times need ${envPrefix}_USERNAME/${envPrefix}_PASSWORD in compare/.env`,
    };
  }
  if (!zip) return { kind: "unknown", detail: "pass --zip to check delivery slots" };
  try {
    const session = new AxfoodSession(`https://${host}`);
    await session.login(username, password);
    const slots = await session.deliverySlots(zip);
    if (slots.length === 0) {
      return { kind: "not-deliverable", detail: `no home-delivery slots for ${zip}` };
    }
    if (!day) {
      const days = new Set(slots.map((s) => localDate(s.startTime))).size;
      return {
        kind: "eligible",
        detail: `${days} delivery day(s) for ${zip} — pass --day YYYY-MM-DD to filter slots`,
      };
    }
    const open = slots.filter((s) => s.available && localDate(s.startTime) === day);
    const matching = open.filter((s) => axfoodSlotInWindow(s, window));
    if (matching.length > 0) {
      const shown = matching
        .slice(0, 4)
        .map(
          (s) =>
            `${localTime(s.startTime)}–${localTime(s.endTime)} (${s.totalCost.value} kr${s.pickingCost?.value ? ` varav plock ${s.pickingCost.value}` : ""})`,
        )
        .join(", ");
      return {
        kind: "eligible",
        detail: `${matching.length} slot(s) on ${day}${window ? ` in ${window}` : ""}: ${shown}${matching.length > 4 ? ", …" : ""}`,
        fees: slotFees(matching.map(axfoodFeeSlot)),
      };
    }
    return {
      kind: "not-deliverable",
      detail:
        open.length > 0
          ? `no slots in ${window ?? "window"} on ${day}, but ${open.length} at other times that day`
          : `no open slots on ${day}`,
    };
  } catch (e) {
    return { kind: "unknown", detail: `slot lookup failed: ${e instanceof Error ? e.message : e}` };
  }
}

/** Coop's slot surface is anonymous (postcode → time windows), so the
 * day/window filter is live for Coop with zero credentials. */
async function coopDelivery(
  zip: string | null,
  day: string | null,
  window: string | null,
): Promise<DeliveryStatus> {
  if (!zip) return { kind: "unknown", detail: "pass --zip to check Coop delivery" };
  try {
    const today = new Date().toISOString().slice(0, 10);
    const windows = (await coopTimeWindows(zip, today, 30)).filter((w) => w.active);
    if (windows.length === 0) {
      return { kind: "not-deliverable", detail: `Coop has no home-delivery windows for ${zip}` };
    }
    if (!day) {
      return { kind: "eligible", detail: `Coop home-delivers to ${zip} — pass --day YYYY-MM-DD to filter slots` };
    }
    const open = windows.filter((w) => !w.fullyBooked && localDate(w.startTime) === day);
    const matching = open.filter((w) => inWindow(w.startTime, w.endTime, window));
    if (matching.length > 0) {
      const shown = matching
        .slice(0, 4)
        .map((w) => `${localTime(w.startTime)}–${localTime(w.endTime)} (${w.cost} kr)`)
        .join(", ");
      return {
        kind: "eligible",
        detail: `${matching.length} slot(s) on ${day}${window ? ` in ${window}` : ""}: ${shown}${matching.length > 4 ? ", …" : ""}`,
        fees: slotFees(matching.map(coopFeeSlot)),
      };
    }
    return {
      kind: "not-deliverable",
      detail:
        open.length > 0
          ? `no slots in ${window ?? "window"} on ${day}, but ${open.length} at other times that day`
          : `no open slots on ${day}`,
    };
  } catch (e) {
    return { kind: "unknown", detail: `Coop slot lookup failed: ${e instanceof Error ? e.message : e}` };
  }
}

async function deliveryForStore(
  store: string,
  zip: string | null,
  day: string | null,
  window: string | null,
): Promise<DeliveryStatus> {
  switch (store) {
    case "mathem":
      return mathemDelivery(day, window);
    case "willys":
      return axfoodDelivery("www.willys.se", "WILLYS", zip, day, window);
    case "hemkop":
      return axfoodDelivery("www.hemkop.se", "HEMKOP", zip, day, window);
    case "coop":
      return coopDelivery(zip, day, window);
    case "ica": {
      if (!zip) return { kind: "unknown", detail: "pass --zip to check ICA delivery eligibility" };
      try {
        const stores = await icaStoresForZip(zip);
        const match = stores.find((s) => s.accountId === ICA_DEFAULT_STORE.accountId);
        return match
          ? {
              kind: "eligible",
              detail: `${ICA_DEFAULT_STORE.name} home-delivers to ${zip}; slot times shown at checkout`,
              // No ICA login tier (p5-01 gate): fees stay honestly unknown.
              fees: unknownFees("ICA fees shown at checkout"),
            }
          : {
              kind: "not-deliverable",
              detail: `${ICA_DEFAULT_STORE.name} does not deliver to ${zip} (${stores.length} other ICA stores do)`,
            };
      } catch (e) {
        return { kind: "unknown", detail: `store lookup failed: ${e instanceof Error ? e.message : e}` };
      }
    }
    default:
      return { kind: "unknown", detail: "unknown store" };
  }
}

async function runStore(
  store: string,
  items: ListItem[],
  zip: string | null,
  day: string | null,
  window: string | null,
): Promise<StoreReport> {
  // Affinity gate (p5-02): terms this store may not supply are never even
  // searched — they can't enter its basket or total.
  const terms = allowedTerms(items, store);
  const excluded = items.map((i) => i.term).filter((t) => !terms.includes(t));
  const search = SEARCHERS[store];
  const productsByTerm: Record<string, never[]> = {};
  const errors: string[] = [];
  // Household-staple seeds: what the household actually buys pins
  // fully-covering matches over search relevance. Sources per store
  // (p5-04): Mathem likely_to_buy (MCP), Willys/Hemköp order history
  // (Axfood login). Weak seeds never pin (storeCompare invariant).
  let seeds: StoreProduct[] = [];
  let seedError: string | null = null;
  if (store === "mathem" && hasMathemAuth()) {
    const { value } = await cached<StoreProduct[]>("mathem:seeds", async () => {
      try {
        // Real order history first, likely_to_buy prediction as backfill.
        const { orders } = await getOrders();
        validateMathemOrders(orders);
        return mergeSeeds(
          extractMathemMcp(commonProductsFromMathemOrders(orders)),
          extractMathemMcp(await likelyToBuy()),
        );
      } catch (e) {
        seedError = `Mathem seeds unavailable: ${e instanceof Error ? e.message : e}`;
        return null;
      }
    });
    seeds = value ?? [];
  } else if (store === "willys" || store === "hemkop") {
    const prefix = store.toUpperCase();
    const username = process.env[`${prefix}_USERNAME`];
    const password = process.env[`${prefix}_PASSWORD`];
    if (username && password) {
      const { value } = await cached<StoreProduct[]>(`${store}:order-seeds`, async () => {
        try {
          const session = new AxfoodSession(
            `https://www.${store === "willys" ? "willys" : "hemkop"}.se`,
          );
          await session.login(username, password);
          return extractAxfood(commonProductsFromOrders(await session.orderHistory()));
        } catch (e) {
          seedError = `order-history seeds unavailable: ${e instanceof Error ? e.message : e}`;
          return null;
        }
      });
      seeds = value ?? [];
    }
  }
  for (const term of terms) {
    // 12h cache first — the fewer live requests, the less bot-shaped we
    // look to ICA's WAF (and the politer we are everywhere else).
    const { value, hit } = await cached<StoreProduct[]>(`${store}:${term}`, async () => {
      const result = await search(term);
      if (result.ok) return result.products;
      errors.push(`"${term}": ${result.error}`);
      return null;
    });
    productsByTerm[term] = (value ?? []) as never[];
    if (!hit) await pacedDelay(store);
  }
  // Every term erroring means the store is unreachable, not an empty catalog.
  const comparison =
    errors.length === terms.length ? null : buildComparison(store, terms, productsByTerm, seeds);
  if (seedError) errors.push(seedError);
  return { comparison, errors, excluded, delivery: await deliveryForStore(store, zip, day, window) };
}

const fmtKr = (n: number) => `${n.toFixed(2).replace(".", ",")} kr`;

interface CartFillResult {
  plan: ReturnType<typeof cartPlan>;
  cart: Awaited<ReturnType<typeof manipulateCart>> | null;
}

/**
 * Push the matched Mathem basket into the household's cart (additive: one
 * unit per term; re-running adds again). Cart-ready only — checkout, slot
 * booking and payment stay in the shop, which the Mathem MCP server itself
 * also enforces.
 */
async function fillMathemCart(comparison: StoreComparison): Promise<CartFillResult> {
  const plan = cartPlan(comparison);
  if (plan.ops.length === 0) return { plan, cart: null };
  const cart = await manipulateCart(
    plan.ops.map((o) => ({ productId: Number(o.productId), quantity: o.quantity })),
  );
  return { plan, cart };
}

function printCartFill({ plan, cart }: CartFillResult): void {
  if (cart === null) {
    console.log("🛒 Mathem cart-fill: nothing matched — cart untouched\n");
    return;
  }
  console.log(`🛒 Mathem cart filled — ${plan.ops.length} item(s) added:`);
  for (const op of plan.ops) {
    console.log(`  ${op.quality === "weak" ? "⚠" : "✓"} ${op.term}: ${op.name} — ${fmtKr(op.price)}`);
  }
  if (plan.skipped.length) console.log(`  ✗ not in cart (no match): ${plan.skipped.join(", ")}`);
  if (plan.weak > 0) {
    console.log(`  ⚠ ${plan.weak} weak match(es) went into the cart — swap them in the shop if wrong`);
  }
  console.log(
    `  → cart now ${cart.productQuantityCount} item(s): items ${fmtKr(cartItemsTotal(cart))}, cart total ${fmtKr(Number(cart.totalGrossAmount))} incl. fees — review & checkout: ${cart.url}\n`,
  );
}

const rankedStores = (reports: Record<string, StoreReport>) =>
  rankByComparable(
    Object.entries(reports)
      .filter(([, r]) => r.comparison !== null)
      .map(([store, r]) => ({ store, basket: r.comparison!.total, fees: feesOf(r.delivery) })),
  );

/** Header money line: both numbers, per the p5-01 gate — the basket and
 * what taking the cheapest eligible slot actually costs. */
function moneyLine(basket: number, fees: DeliveryFees, comparable: number | null): string {
  switch (fees.kind) {
    case "slots": {
      const split =
        fees.cheapest.picking != null ? ` varav plock ${fees.cheapest.picking}` : "";
      return `basket ${fmtKr(basket)} · with delivery ${fmtKr(comparable!)} (cheapest slot ${fees.cheapest.total} kr${split})`;
    }
    case "none":
      return `basket ${fmtKr(basket)} · no eligible slot`;
    case "unknown":
      return `basket ${fmtKr(basket)} + delivery fees unknown (${fees.reason})`;
  }
}

function printRotation(rotation: RotationSuggestion, items: ListItem[]): void {
  if (rotation.primary === null || !items.some((i) => i.stores !== null)) return;
  const parts = [
    `covers ${rotation.coverage}/${items.length} items`,
    ...rotation.rotations.map((r) => `rotates ${r.term} (last: ${r.from} ${r.date})`),
    rotation.unsourced.length ? `shop separately: ${rotation.unsourced.join(", ")}` : null,
  ].filter(Boolean);
  console.log(
    `🔁 Rotation: this week ${rotation.primary.toUpperCase()} — ${parts.join(" · ")}; after ordering, record it with --record ${rotation.primary}`,
  );
}

function printHuman(
  reports: Record<string, StoreReport>,
  items: ListItem[],
  rotation: RotationSuggestion,
  day?: string,
  window?: string,
) {
  console.log(`\n🛒 Store comparison — ${items.length} items`);
  if (day || window) {
    console.log(`🚚 Wanted delivery: ${day ?? "any day"}${window ? ` around ${window}` : ""}`);
  }
  console.log("💰 Ranked on basket + cheapest eligible slot fee where fees are known");
  printRotation(rotation, items);
  const ranked = rankedStores(reports);
  for (const { store, basket, fees, comparable } of ranked) {
    const report = reports[store];
    const c = report.comparison!;
    const flags = [
      c.weak ? `${c.weak} weak match${c.weak > 1 ? "es" : ""} — review` : null,
      c.unmatched.length ? `missing: ${c.unmatched.join(", ")}` : null,
    ].filter(Boolean);
    console.log(
      `\n${store.toUpperCase()} — ${moneyLine(basket, fees, comparable)} (${c.matched}/${c.items.length} matched)`,
    );
    for (const item of c.items) {
      const mark = item.product === null ? "✗" : item.quality === "weak" ? "⚠" : "✓";
      const line = item.product
        ? `${item.product.name} — ${fmtKr(item.product.price)}${item.seeded ? " ★ staple" : ""}${item.alternatives ? ` (+${item.alternatives} alternatives)` : ""}`
        : "no match";
      console.log(`  ${mark} ${item.term}: ${line}`);
    }
    if (report.excluded.length) {
      console.log(`  ✂ not sourced here (affinity): ${report.excluded.join(", ")}`);
    }
    if (flags.length) console.log(`  ⚠ ${flags.join(" · ")}`);
    console.log(`  🚚 ${report.delivery.kind}: ${report.delivery.detail}`);
    if (report.errors.length) console.log(`  ⚠ errors: ${report.errors.join("; ")}`);
  }
  for (const [store, report] of Object.entries(reports)) {
    if (report.comparison === null) {
      console.log(`\n${store.toUpperCase()} — unreachable (${report.errors[0] ?? "unknown error"})`);
    }
  }
  console.log();
}

async function main() {
  loadCompareEnv();
  const args = parseArgs(process.argv.slice(2));
  const listPath = typeof args.list === "string" ? args.list : null;
  if (!listPath) {
    console.error(
      "usage: npm run compare -- --list <file.json> [--zip 11251] [--stores mathem,willys,hemkop,ica,coop] [--day YYYY-MM-DD] [--window HH-HH] [--fill-cart mathem] [--record <store>] [--json]",
    );
    process.exit(1);
  }
  const items = readList(listPath);
  const stores =
    typeof args.stores === "string" ? args.stores.split(",") : Object.keys(SEARCHERS);
  const unknown = stores.filter((s) => !SEARCHERS[s]);
  if (unknown.length) {
    console.error(`unknown store(s): ${unknown.join(", ")}`);
    process.exit(1);
  }
  const zip = typeof args.zip === "string" ? args.zip : null;
  const day = typeof args.day === "string" ? args.day : null;
  const window = typeof args.window === "string" ? args.window : null;
  // --fill-cart: validate before any network work so a typo fails fast.
  const fillStore =
    typeof args["fill-cart"] === "string" ? args["fill-cart"] : args["fill-cart"] === true ? "mathem" : null;
  if (fillStore) {
    if (fillStore !== "mathem") {
      console.error(
        `--fill-cart ${fillStore}: only mathem is supported (official MCP); other stores need their account tiers (p5-01 step 2)`,
      );
      process.exit(1);
    }
    if (!stores.includes("mathem")) {
      console.error("--fill-cart mathem requires mathem in --stores");
      process.exit(1);
    }
    if (!hasMathemAuth()) {
      console.error("--fill-cart mathem needs auth — run `npm run mathem-auth` first");
      process.exit(1);
    }
  }

  // --record <store>: the human placed the order there — remember it for
  // the next rotation suggestion, then exit (no comparison run needed).
  if (typeof args.record === "string") {
    if (!SEARCHERS[args.record]) {
      console.error(`--record ${args.record}: unknown store`);
      process.exit(1);
    }
    const history = recordRun(args.record, items, new Date().toISOString().slice(0, 10));
    const recorded = items.filter((i) => i.stores !== null && history[i.term]?.store === args.record);
    console.log(
      recorded.length
        ? `🔁 recorded: ${recorded.map((i) => i.term).join(", ")} → ${args.record}`
        : `🔁 nothing to record — no affinity item in this list is sourced at ${args.record}`,
    );
    return;
  }

  const reports: Record<string, StoreReport> = {};
  await Promise.all(
    stores.map(async (store) => {
      reports[store] = await runStore(store, items, zip, day, window);
    }),
  );
  const rotation = suggestPrimary(
    rankedStores(reports).map((r, rank) => ({
      store: r.store,
      rank,
      deliverable: reports[r.store].delivery.kind !== "not-deliverable",
    })),
    items,
    loadRotationHistory(),
  );

  let cartFill: CartFillResult | null = null;
  if (fillStore === "mathem") {
    const comparison = reports.mathem?.comparison;
    if (comparison) {
      cartFill = await fillMathemCart(comparison);
    } else {
      console.error("cart-fill skipped: Mathem was unreachable — cart untouched");
    }
  }

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          items,
          day: args.day ?? null,
          window: args.window ?? null,
          ranking: rankedStores(reports),
          rotation,
          reports,
          cartFill,
        },
        null,
        2,
      ),
    );
  } else {
    printHuman(
      reports,
      items,
      rotation,
      typeof args.day === "string" ? args.day : undefined,
      typeof args.window === "string" ? args.window : undefined,
    );
    if (cartFill) printCartFill(cartFill);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
