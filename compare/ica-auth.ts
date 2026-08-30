// ICA login tier (p5-04, adopted by Pelle 2026-08-16): authenticate the
// household's ICA account against ims.icagruppen.se (Curity IdP) and
// carry the resulting handlaprivatkund.ica.se session for read-only API
// calls (favorites/"Återkommande" seeds, slot probing). Flow mapped live
// 2026-08-16: /stores/{id}/login → OAuth authorize (client OcadoB2C,
// code flow) → /authn/authenticate — BankID is the default authenticator
// but "Lösenord" (IcaCustomers) takes personnummer + password as a plain
// form POST; the OAuth resume then redirects back with the code and the
// shop sets its session cookies. Credentials come from compare/.env
// (ICA_PERSONNUMMER / ICA_PASSWORD) and never leave this process.
// Reads (favorites/"Återkommande" seeds, slot probing) plus cart-fill
// (p5-06, adopted 2026-08-28) — checkout, slot booking and payment
// never happen here (tech.spec 🚫-never). ICA_COOKIE (a cookie header
// copied from the household's own logged-in browser tab) overrides the
// jar for handlaprivatkund requests: it is the sanctioned escape hatch
// when the WAF challenges our non-browser POSTs, since it carries the
// human-obtained aws-waf-token — we never solve a challenge ourselves.

import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36";

const MAX_HOPS = 12;

// Persisted session cookies (gitignored, mode 600 — same pattern as the
// Mathem tokens). Re-using a session instead of re-running the ~8-request
// login chain every run is the politest thing we can do for ICA's
// rate-based WAF.
const SESSION_FILE = join(dirname(fileURLToPath(import.meta.url)), ".ica-session.json");

export class IcaSession {
  /** Cookie jar per host — the login flow crosses ica.se subdomains and
   * the IdP, and cookies must never leak across hosts. */
  private jars = new Map<string, Map<string, string>>();

  constructor(private accountId: string) {}

  private jar(host: string): Map<string, string> {
    let jar = this.jars.get(host);
    if (!jar) this.jars.set(host, (jar = new Map()));
    return jar;
  }

  /** ICA_COOKIE comes from a human browser copy, so guard the one way that
   * copy goes wrong in practice: a panel that elides the value mid-string
   * leaves a "…" (or another char > 0xFF), which undici rejects with an
   * unreadable ByteString TypeError deep inside Headers.set. */
  private validateBrowserCookie(raw: string): string {
    const bad = [...raw].findIndex((c) => c.codePointAt(0)! > 0xff);
    if (bad < 0) return raw;
    const truncated = raw.includes("…") ? " ('…' — the panel truncated the value)" : "";
    throw new Error(
      `ICA_COOKIE has a non-header character at index ${bad}${truncated} — copy the FULL value: ` +
        "DevTools → Network → right-click the request → Copy → Copy as cURL, then take the cookie header from the paste",
    );
  }

  private storeCookies(url: URL, res: Response): void {
    for (const header of res.headers.getSetCookie?.() ?? []) {
      const pair = header.split(";")[0];
      const eq = pair.indexOf("=");
      if (eq > 0) this.jar(url.host).set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  private async fetch(url: URL, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("user-agent", BROWSER_UA);
    const raw = process.env.ICA_COOKIE;
    const browserCookie =
      url.host === "handlaprivatkund.ica.se" && raw ? this.validateBrowserCookie(raw) : undefined;
    const cookies = this.jar(url.host);
    if (browserCookie) {
      headers.set("cookie", browserCookie);
    } else if (cookies.size > 0) {
      headers.set("cookie", [...cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    }
    const res = await globalThis.fetch(url, { ...init, headers, redirect: "manual" });
    this.storeCookies(url, res);
    return res;
  }

  /** Follow redirects manually (cookies land in the right per-host jar),
   * returning the first non-redirect response and its URL. */
  private async follow(start: URL, init?: RequestInit): Promise<{ url: URL; res: Response }> {
    let url = start;
    let res = await this.fetch(url, init);
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const location = res.headers.get("location");
      if (res.status < 300 || res.status >= 400 || !location) return { url, res };
      url = new URL(location, url);
      res = await this.fetch(url);
    }
    throw new Error(`ICA login: redirect chain exceeded ${MAX_HOPS} hops at ${url.host}`);
  }

  async login(personnummer: string, password: string): Promise<void> {
    // 1. Shop login route → OAuth authorize → IdP authenticate page.
    const start = new URL(`https://handlaprivatkund.ica.se/stores/${this.accountId}/login`);
    const authn = await this.follow(start);
    if (authn.url.host !== "ims.icagruppen.se") {
      throw new Error(`ICA login: expected the IdP, landed on ${authn.url.host} (${authn.res.status})`);
    }
    // 2. Switch to the password authenticator ("Lösenord") and submit.
    await this.follow(new URL("https://ims.icagruppen.se/authn/authenticate/IcaCustomers"));
    let step = await this.follow(
      new URL("https://ims.icagruppen.se/authn/authenticate/IcaCustomers"),
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ userName: personnummer, password }).toString(),
      },
    );
    // 3. Successful auth renders "Redirecting…" pages a browser would run:
    // Curity auto-submit forms (hidden token/state POSTed to the OAuth
    // resume path), then the shop's sso-login page whose JS GETs the
    // /sso-login/auth code-exchange URL. Replay both until the shop
    // session exists. A re-rendered credential form (userName input, no
    // auto-submit payload) means the credentials were rejected.
    for (let hop = 0; hop < 4; hop++) {
      const body = await step.res.text();
      const jsRedirect = body.match(/window\.location\.replace\("([^"]+)"\)/)?.[1];
      if (jsRedirect) {
        step = await this.follow(new URL(jsRedirect, step.url));
        continue;
      }
      const action = body.match(/<form[^>]*action="([^"]*)"/)?.[1];
      const fields = [...body.matchAll(/<input[^>]*name="([^"]*)"[^>]*value="([^"]*)"/g)];
      if (action && fields.length > 0) {
        step = await this.follow(new URL(action, step.url), {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(Object.fromEntries(fields.map((f) => [f[1], f[2]]))).toString(),
        });
        continue;
      }
      break;
    }
    if (step.url.host === "ims.icagruppen.se") {
      throw new Error(
        "ICA login failed — check ICA_PERSONNUMMER/ICA_PASSWORD (BankID-only accounts have no password set)",
      );
    }
    // 4. Verify the session sticks: an authenticated page must not bounce
    // back to /login.
    if (!(await this.sessionValid())) {
      throw new Error("ICA login: code exchange did not stick");
    }
    this.saveSession();
  }

  private async sessionValid(): Promise<boolean> {
    const check = await this.fetch(
      new URL(`https://handlaprivatkund.ica.se/stores/${this.accountId}/favorites`),
    );
    const bounced = (check.headers.get("location") ?? "").includes("/login");
    return check.status < 400 && !bounced;
  }

  private saveSession(): void {
    const dump = Object.fromEntries([...this.jars].map(([host, jar]) => [host, [...jar]]));
    writeFileSync(SESSION_FILE, JSON.stringify(dump));
    chmodSync(SESSION_FILE, 0o600);
  }

  private loadSession(): boolean {
    if (!existsSync(SESSION_FILE)) return false;
    try {
      const dump = JSON.parse(readFileSync(SESSION_FILE, "utf8")) as Record<
        string,
        [string, string][]
      >;
      this.jars = new Map(Object.entries(dump).map(([host, pairs]) => [host, new Map(pairs)]));
      return true;
    } catch {
      return false;
    }
  }

  /** Reuse the persisted session when it still works; run the full login
   * chain only when it doesn't. */
  async ensure(personnummer: string, password: string): Promise<void> {
    if (this.loadSession() && (await this.sessionValid())) {
      this.saveSession(); // refreshed cookies from the validity check
      return;
    }
    this.jars = new Map();
    await this.login(personnummer, password);
  }

  /** Session from whatever the household provided: a browser-copied
   * ICA_COOKIE wins (it bypasses the jar in fetch(), so the password
   * chain would be pointless), else the credential login. */
  async ensureAny(): Promise<void> {
    if (process.env.ICA_COOKIE) {
      if (await this.sessionValid()) return;
      throw new Error(
        "ICA_COOKIE is stale — copy a fresh cookie header from a logged-in handlaprivatkund.ica.se browser tab",
      );
    }
    if (!hasIcaAuth()) {
      throw new Error(
        "needs ICA_PERSONNUMMER + ICA_PASSWORD (or ICA_COOKIE) in compare/.env",
      );
    }
    await this.ensure(process.env.ICA_PERSONNUMMER!.trim(), process.env.ICA_PASSWORD!);
  }

  /** Authenticated GET against the per-store shop API. */
  async request(path: string, accept = "application/json"): Promise<Response> {
    const url = new URL(`https://handlaprivatkund.ica.se${path}`);
    return this.fetch(url, { headers: { accept } });
  }

  /** The household's favorites ("Dina favoriter") as raw v6 decorated
   * products — the same envelope as search, so extractIca applies.
   * Read-only seed source (p5-04). */
  async favorites(): Promise<unknown[]> {
    const fetchOnce = async (): Promise<unknown[]> => {
      // maxProductsToDecorate is load-bearing: without it the envelope
      // returns bare otherProductIds and zero decorated products.
      const res = await this.request(
        `/stores/${this.accountId}/api/webproductpagews/v6/product-pages/favorites?maxPageSize=100&maxProductsToDecorate=100&tag=web`,
      );
      // The WAF answers 202 + empty body when challenging — that's ok:false
      // territory for us even though fetch calls it ok.
      if (res.status !== 200 || res.headers.get("x-amzn-waf-action")) {
        throw new Error(`bot-challenge or HTTP ${res.status} on favorites`);
      }
      const raw = (await res.json()) as { productGroups?: { decoratedProducts?: unknown[] }[] };
      if (!Array.isArray(raw.productGroups)) {
        throw new Error(
          "ICA favorites shape moved (productGroups missing) — update compare/ica-auth.ts",
        );
      }
      return raw.productGroups.flatMap((g) => g.decoratedProducts ?? []);
    };
    try {
      return await fetchOnce();
    } catch {
      // One patient retry, same policy as ICA search: wait out the rate
      // window, never try to solve a challenge.
      await new Promise((r) => setTimeout(r, 15_000));
      return fetchOnce();
    }
  }

  /** The cart API wants the CSRF token the shop renders into
   * window.__INITIAL_STATE__ (session.csrf.token) on every page. */
  private async csrfToken(): Promise<string> {
    const res = await this.request(`/stores/${this.accountId}/`, "text/html");
    const token = (await res.text()).match(/"csrf":\{"token":"([^"]+)"\}/)?.[1];
    if (!token) {
      throw new Error("ICA CSRF token not found on the store page — update compare/ica-auth.ts");
    }
    return token;
  }

  /** The active cart, raw (web_basket_ws v1 envelope: items[], totals). */
  async activeCart(): Promise<unknown> {
    const res = await this.request(`/stores/${this.accountId}/api/cart/v1/carts/active`);
    if (res.status !== 200 || res.headers.get("x-amzn-waf-action")) {
      throw new Error(`bot-challenge or HTTP ${res.status} reading the ICA cart`);
    }
    return res.json();
  }

  /** One apply-quantity POST. 400 is a per-payload rejection the caller
   * may want to recover from; everything else throws with the honest
   * cause (a challenged POST was NOT processed — 202 + waf header, empty
   * body — so the sanctioned ICA_COOKIE escape hatch is named). */
  private async postQuantities(
    token: string,
    ops: { productId: string; quantity: number }[],
  ): Promise<{ ok: boolean; body: unknown }> {
    const res = await this.fetch(
      new URL(
        `https://handlaprivatkund.ica.se/stores/${this.accountId}/api/cart/v1/carts/active/apply-quantity`,
      ),
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-csrf-token": token,
          "ecom-request-source": "web",
        },
        body: JSON.stringify(ops),
      },
    );
    if (res.headers.get("x-amzn-waf-action") || res.status === 202) {
      throw new Error(
        "the WAF challenged the cart write — set ICA_COOKIE from a logged-in browser tab (it carries the browser's waf token) and re-run",
      );
    }
    if (res.status === 400) return { ok: false, body: await res.text() };
    if (res.status !== 200) {
      throw new Error(`ICA cart write failed: HTTP ${res.status} ${await res.text()}`);
    }
    return { ok: true, body: await res.json() };
  }

  /**
   * Write quantities into the household's active cart — the site's own
   * addBasketItems flow: POST apply-quantity with [{productId, quantity}].
   * The field is named quantity but is a DELTA (live-verified 2026-08-28:
   * duplicate entries stack, 0 is a no-op, -1 removes) — matching the
   * site's optimistic {productId, delta} reducer. A bad product can 400
   * the whole payload, so a rejected batch degrades to per-item writes
   * and reports which products ICA refused instead of sinking the fill.
   * Cart writes only, never checkout (tech.spec 🚫-never).
   */
  async applyQuantities(
    ops: { productId: string; quantity: number }[],
  ): Promise<{ rejected: string[] }> {
    const token = await this.csrfToken();
    const batch = await this.postQuantities(token, ops).catch(async (e: unknown) => {
      // One patient retry on the WAF window, same policy as reads.
      if (!(e instanceof Error && e.message.includes("WAF"))) throw e;
      await new Promise((r) => setTimeout(r, 15_000));
      return this.postQuantities(token, ops);
    });
    if (batch.ok) return { rejected: [] };
    const rejected: string[] = [];
    for (const op of ops) {
      const one = await this.postQuantities(token, [op]);
      if (!one.ok) rejected.push(op.productId);
      // Modest pacing between per-item writes — polite-client rule.
      await new Promise((r) => setTimeout(r, 350 + Math.random() * 250));
    }
    if (rejected.length === ops.length) {
      throw new Error(`ICA cart write failed: every item rejected — ${String(batch.body).slice(0, 200)}`);
    }
    return { rejected };
  }
}

export const hasIcaAuth = (): boolean =>
  Boolean(process.env.ICA_PERSONNUMMER && process.env.ICA_PASSWORD);

/** Cart-fill works with either the credential login or a browser-copied
 * ICA_COOKIE (the WAF escape hatch). */
export const hasIcaCartAuth = (): boolean => hasIcaAuth() || Boolean(process.env.ICA_COOKIE);
