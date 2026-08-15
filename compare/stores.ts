// Store adapters for the comparison CLI: network I/O only — all parsing
// and matching logic lives in src/lib/storeCompare (fixture-tested).
// Endpoints are the stores' private/unversioned APIs, reverse-engineered
// 2026-08-15/16 (docs/research/store-integration-landscape.md). Each
// adapter degrades to an error string instead of throwing so one broken
// store never sinks the whole comparison.
import {
  extractAxfood,
  extractIca,
  extractMathem,
  type StoreProduct,
} from "@/lib/storeCompare";

// Per Mathem's robots.txt scraper policy: identify as a bot with contact.
const BOT_UA = "vega-plan-hub-compare-bot/0.1 (household tool; pelle@timewellspent.se)";
// ICA's AWS WAF challenges non-browser clients; a browser UA + optional
// session cookie (ICA_COOKIE env, copied from a logged-in/visited browser)
// gets through. Willys/Hemköp accept any client.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

/** Maxi ICA Stormarknad Lindhagen — the household default (Pelle 2026-08-16). */
export const ICA_DEFAULT_STORE = { accountId: "1003418", name: "Maxi ICA Stormarknad Lindhagen", displayId: "13164" };

export type SearchResult = { ok: true; products: StoreProduct[] } | { ok: false; error: string };

async function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: "application/json", ...headers } });
  const wafAction = res.headers.get("x-amzn-waf-action");
  if (wafAction) throw new Error(`bot-challenge (${wafAction}) — set ICA_COOKIE from a browser session`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text) throw new Error("empty response body");
  return JSON.parse(text);
}

const attempt = async (fn: () => Promise<StoreProduct[]>): Promise<SearchResult> => {
  try {
    return { ok: true, products: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

export const searchMathem = (term: string): Promise<SearchResult> =>
  attempt(async () => {
    const raw = (await getJson(
      `https://www.mathem.se/api/v1/search/?q=${encodeURIComponent(term)}`,
      { "user-agent": BOT_UA },
    )) as { products?: never[]; results?: never[] };
    return extractMathem(raw.products ?? raw.results ?? []);
  });

const searchAxfood = (host: string) => (term: string): Promise<SearchResult> =>
  attempt(async () => {
    const raw = (await getJson(`https://${host}/search/clean?q=${encodeURIComponent(term)}`, {
      "user-agent": BOT_UA,
    })) as { results?: never[] };
    return extractAxfood(raw.results ?? []);
  });

export const searchWillys = searchAxfood("www.willys.se");
export const searchHemkop = searchAxfood("www.hemkop.se");

export const searchIca = (term: string, accountId = ICA_DEFAULT_STORE.accountId): Promise<SearchResult> =>
  attempt(async () => {
    const headers: Record<string, string> = { "user-agent": BROWSER_UA };
    if (process.env.ICA_COOKIE) headers.cookie = process.env.ICA_COOKIE;
    const raw = (await getJson(
      `https://handlaprivatkund.ica.se/stores/${accountId}/api/webproductpagews/v6/product-pages/search?maxPageSize=20&maxProductsToDecorate=10&q=${encodeURIComponent(term)}&tag=web`,
      headers,
    )) as { productGroups?: { decoratedProducts?: never[] }[] };
    return extractIca((raw.productGroups ?? []).flatMap((g) => g.decoratedProducts ?? []));
  });

export interface IcaStore {
  id: string;
  name: string;
  city: string;
  deliveryMethods: string[];
  accountId: string;
}

/** Anonymous: every ICA store that serves a postal code (home delivery/pickup). */
export async function icaStoresForZip(zip: string): Promise<IcaStore[]> {
  const raw = (await getJson(
    `https://handla.ica.se/api/store/v1?zip=${encodeURIComponent(zip)}&customerType=B2C`,
    { "user-agent": BROWSER_UA },
  )) as { forHomeDelivery?: IcaStore[]; forPickup?: IcaStore[] };
  return [...(raw.forHomeDelivery ?? []), ...(raw.forPickup ?? [])];
}
