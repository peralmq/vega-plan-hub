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

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36";

const MAX_HOPS = 12;

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
    const submit = await this.follow(
      new URL("https://ims.icagruppen.se/authn/authenticate/IcaCustomers"),
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ userName: personnummer, password }).toString(),
      },
    );
    // Success resumes the OAuth flow and ends back on the shop; landing on
    // the IdP again means the form re-rendered (wrong credentials).
    if (submit.url.host === "ims.icagruppen.se") {
      throw new Error("ICA login failed — check ICA_PERSONNUMMER/ICA_PASSWORD (BankID-only accounts have no password set)");
    }
  }

  /** Authenticated GET against the per-store shop API. */
  async request(path: string, accept = "application/json"): Promise<Response> {
    const url = new URL(`https://handlaprivatkund.ica.se${path}`);
    return this.fetch(url, { headers: { accept } });
  }
}

export const hasIcaAuth = (): boolean =>
  Boolean(process.env.ICA_PERSONNUMMER && process.env.ICA_PASSWORD);
