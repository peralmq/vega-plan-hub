// p5-01 store-comparison CLI: compare a shopping list across Mathem,
// Willys, Hemköp, ICA (default store: Maxi Lindhagen) and Coop, with a
// delivery-eligibility check. Cart-ready only — checkout, slot booking
// and payment always stay with the human (non-goal by design).
//
//   npm run compare -- --list fixtures/compare-list.json [--zip 11251]
//     [--stores mathem,willys,hemkop,ica,coop] [--day 2026-08-20]
//     [--window 17-20] [--fill-cart mathem] [--json]
//
// List file: JSON array of search terms (strings) or {name} objects.
// Slot-level day/time filtering needs store logins (Willys/Hemköp) or the
// Mathem MCP OAuth — until those human steps land, --day/--window are
// recorded in the output but per-store slot status is reported honestly
// as needs-auth / check-at-checkout.
import { readFileSync } from "node:fs";

import {
  buildComparison,
  cartPlan,
  extractMathemMcp,
  type StoreComparison,
  type StoreProduct,
} from "@/lib/storeCompare";
import { cached } from "./cache";
import {
  cartItemsTotal,
  getDeliverySlots,
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
  | { kind: "eligible"; detail: string }
  | { kind: "not-deliverable"; detail: string }
  | { kind: "needs-auth"; detail: string }
  | { kind: "unknown"; detail: string };

interface StoreReport {
  comparison: StoreComparison | null;
  errors: string[];
  delivery: DeliveryStatus;
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

function readList(path: string): string[] {
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!Array.isArray(raw)) throw new Error("list file must be a JSON array");
  return raw.map((entry) =>
    typeof entry === "string" ? entry : (entry as { name: string }).name,
  );
}

/** Format a UTC ISO instant as local Stockholm HH:MM. */
const localTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("sv-SE", {
    timeZone: "Europe/Stockholm",
    hour: "2-digit",
    minute: "2-digit",
  });

const localHour = (iso: string) =>
  Number(
    new Date(iso).toLocaleTimeString("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", hour12: false }),
  );

function inWindow(openIso: string, closeIso: string, window: string | null): boolean {
  if (!window) return true;
  const m = window.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) return true;
  const [from, to] = [Number(m[1]), Number(m[2])];
  // Overlap test: the slot's local delivery window intersects [from, to).
  return localHour(openIso) < to && localHour(closeIso) > from;
}

const slotInWindow = (slot: MathemSlot, window: string | null): boolean =>
  inWindow(slot.openDatetime, slot.closeDatetime, window);

/** Local Stockholm calendar date (YYYY-MM-DD) of a UTC ISO instant. */
const localDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });

async function mathemDelivery(day: string | null, window: string | null): Promise<DeliveryStatus> {
  if (!hasMathemAuth()) {
    return { kind: "needs-auth", detail: "run `npm run mathem-auth` to enable Mathem slot checks" };
  }
  if (!day) return { kind: "eligible", detail: "authenticated — pass --day YYYY-MM-DD to fetch slots" };
  try {
    const days = await getDeliverySlots([day]);
    const open = (days[0]?.slots ?? []).filter((s) => !s.isFull && !s.isUnavailable);
    const inWindow = open.filter((s) => slotInWindow(s, window));
    if (inWindow.length > 0) {
      const shown = inWindow
        .slice(0, 4)
        .map((s) => `${localTime(s.openDatetime)}–${localTime(s.closeDatetime)} (${s.price})`)
        .join(", ");
      return {
        kind: "eligible",
        detail: `${inWindow.length} slot(s) on ${day}${window ? ` in ${window}` : ""}: ${shown}${inWindow.length > 4 ? ", …" : ""}`,
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
    case "hemkop":
      return {
        kind: "needs-auth",
        detail: "slot endpoint (tms/delivery-slots) requires store login (p5-01 step 2)",
      };
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
  terms: string[],
  zip: string | null,
  day: string | null,
  window: string | null,
): Promise<StoreReport> {
  const search = SEARCHERS[store];
  const productsByTerm: Record<string, never[]> = {};
  const errors: string[] = [];
  // Household-staple seeds (Mathem only for now): what the household
  // actually buys pins fully-covering matches over search relevance.
  let seeds: StoreProduct[] = [];
  let seedError: string | null = null;
  if (store === "mathem" && hasMathemAuth()) {
    const { value } = await cached<StoreProduct[]>("mathem:likely_to_buy", async () => {
      try {
        return extractMathemMcp(await likelyToBuy());
      } catch (e) {
        seedError = `likely_to_buy seeds unavailable: ${e instanceof Error ? e.message : e}`;
        return null;
      }
    });
    seeds = value ?? [];
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
  return { comparison, errors, delivery: await deliveryForStore(store, zip, day, window) };
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

function printHuman(reports: Record<string, StoreReport>, terms: string[], day?: string, window?: string) {
  console.log(`\n🛒 Store comparison — ${terms.length} items`);
  if (day || window) {
    console.log(`🚚 Wanted delivery: ${day ?? "any day"}${window ? ` around ${window}` : ""}`);
  }
  const ranked = Object.entries(reports)
    .filter(([, r]) => r.comparison !== null)
    .sort((a, b) => a[1].comparison!.total - b[1].comparison!.total);
  for (const [store, report] of ranked) {
    const c = report.comparison!;
    const flags = [
      c.weak ? `${c.weak} weak match${c.weak > 1 ? "es" : ""} — review` : null,
      c.unmatched.length ? `missing: ${c.unmatched.join(", ")}` : null,
    ].filter(Boolean);
    console.log(`\n${store.toUpperCase()} — ${fmtKr(c.total)} (${c.matched}/${terms.length} matched)`);
    for (const item of c.items) {
      const mark = item.product === null ? "✗" : item.quality === "weak" ? "⚠" : "✓";
      const line = item.product
        ? `${item.product.name} — ${fmtKr(item.product.price)}${item.seeded ? " ★ staple" : ""}${item.alternatives ? ` (+${item.alternatives} alternatives)` : ""}`
        : "no match";
      console.log(`  ${mark} ${item.term}: ${line}`);
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
  const args = parseArgs(process.argv.slice(2));
  const listPath = typeof args.list === "string" ? args.list : null;
  if (!listPath) {
    console.error(
      "usage: npm run compare -- --list <file.json> [--zip 11251] [--stores mathem,willys,hemkop,ica,coop] [--day YYYY-MM-DD] [--window HH-HH] [--fill-cart mathem] [--json]",
    );
    process.exit(1);
  }
  const terms = readList(listPath);
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

  const reports: Record<string, StoreReport> = {};
  await Promise.all(
    stores.map(async (store) => {
      reports[store] = await runStore(store, terms, zip, day, window);
    }),
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
        { terms, day: args.day ?? null, window: args.window ?? null, reports, cartFill },
        null,
        2,
      ),
    );
  } else {
    printHuman(
      reports,
      terms,
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
