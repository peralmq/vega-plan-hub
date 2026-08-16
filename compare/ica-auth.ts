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
// Read-only by construction: no cart writes, no checkout (tech.spec).

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
    const cookies = this.jar(url.host);
    if (cookies.size > 0) {
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
      const res = await this.request(
        `/stores/${this.accountId}/api/webproductpagews/v6/product-pages/favorites?maxPageSize=100`,
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
}

export const hasIcaAuth = (): boolean =>
  Boolean(process.env.ICA_PERSONNUMMER && process.env.ICA_PASSWORD);
