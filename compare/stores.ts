// Store adapters for the comparison CLI: network I/O only — all parsing
// and matching logic lives in src/lib/storeCompare (fixture-tested).
// Endpoints are the stores' private/unversioned APIs, reverse-engineered
// 2026-08-15/16 (docs/research/store-integration-landscape.md). Each
// adapter degrades to an error string instead of throwing so one broken
// store never sinks the whole comparison.
import {
  extractAxfood,
  extractCoop,
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

// Coop's personalization API (reverse-engineered from coop.se 2026-08-16).
// The subscription key is the site's PUBLIC anonymous browser key — it is
// served to every visitor in the page config (coopSettings.serviceAccess),
// same key for all; it is not a credential. store 251300 = the anonymous
// "Hemleverans i Stockholm" assortment the site defaults to.
const COOP_PUBLIC_KEY = "3becf0ce306f41a1ae94077c16798187";
export const COOP_DEFAULT_STORE = { id: "251300", name: "Hemleverans i Stockholm" };

export const searchCoop = (term: string, storeId = COOP_DEFAULT_STORE.id): Promise<SearchResult> =>
  attempt(async () => {
    const url =
      `https://external.api.coop.se/personalization/search/products` +
      `?api-version=v1&store=${storeId}&groups=CUSTOMER_PRIVATE&device=desktop&direct=true`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "ocp-apim-subscription-key": COOP_PUBLIC_KEY,
        "user-agent": BROWSER_UA,
      },
      body: JSON.stringify({ query: term, resultsOptions: { skip: 0, take: 10 } }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = (await res.json()) as { results?: { items?: never[] } };
    return extractCoop(raw.results?.items ?? []);
  });

export const searchIca = (term: string, accountId = ICA_DEFAULT_STORE.accountId): Promise<SearchResult> =>
  attempt(async () => {
    const fetchOnce = async () => {
      const headers: Record<string, string> = { "user-agent": BROWSER_UA };
      if (process.env.ICA_COOKIE) headers.cookie = process.env.ICA_COOKIE;
      const raw = (await getJson(
        `https://handlaprivatkund.ica.se/stores/${accountId}/api/webproductpagews/v6/product-pages/search?maxPageSize=20&maxProductsToDecorate=10&q=${encodeURIComponent(term)}&tag=web`,
        headers,
      )) as { productGroups?: { decoratedProducts?: never[] }[] };
      return extractIca((raw.productGroups ?? []).flatMap((g) => g.decoratedProducts ?? []));
    };
    try {
      return await fetchOnce();
    } catch (e) {
      // One patient retry on a WAF challenge: back off well clear of the
      // rate window, then try again. We never attempt to solve the
      // challenge itself — if the retry is challenged too, we report it.
      if (e instanceof Error && e.message.startsWith("bot-challenge")) {
        await new Promise((r) => setTimeout(r, 15_000));
        return await fetchOnce();
      }
      throw e;
    }
  });

/**
 * Per-store inter-request pacing (ms, jittered ±30%). ICA's AWS WAF is
 * fingerprint+rate based — pacing far below human speed keeps the request
 * pattern polite; the rest tolerate a light touch. Mathem's robots policy
 * asks for backoff, which the shared 250 ms + jitter respects at our
 * request volumes.
 */
export const STORE_PACING_MS: Record<string, number> = {
  ica: 2000,
  default: 250,
};

export const pacedDelay = (store: string): Promise<void> => {
  const base = STORE_PACING_MS[store] ?? STORE_PACING_MS.default;
  const jitter = base * 0.3 * (Math.random() * 2 - 1);
  return new Promise((r) => setTimeout(r, Math.max(0, Math.round(base + jitter))));
};

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
