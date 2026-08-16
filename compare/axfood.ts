// Authenticated Axfood (Willys/Hemköp — same platform) session for the
// delivery-slot tier. Login flow and credential encryption adapted from
// Erik Hellman's MIT-licensed willys-agent (src/willys-api.ts, src/crypto.ts),
// which replicates the site's own client-side login encryption (module
// 89683 in their JS bundle); slot endpoint shape cross-checked against
// jimmystridh/willys-mcp. Read-only use here: login + slot listing only —
// no cart writes, no slot booking, no checkout (cart-ready non-goal).
import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";

interface EncryptedCredential {
  key: string;
  str: string;
}

/** AES-128-CBC + PBKDF2(SHA-1, 1000) with a random 16-digit passphrase,
 * packaged the way the Axfood login endpoint expects. */
function encryptCredential(plaintext: string): EncryptedCredential {
  const iv = randomBytes(16);
  const salt = randomBytes(16);
  const key =
    Math.random().toString().substring(2, 10) + Math.random().toString().substring(2, 10);
  const derivedKey = pbkdf2Sync(key, salt, 1000, 16, "sha1");
  const cipher = createCipheriv("aes-128-cbc", derivedKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const combined = `${iv.toString("hex")}::${salt.toString("hex")}::${encrypted.toString("base64")}`;
  return { key, str: Buffer.from(combined).toString("base64") };
}

export interface AxfoodSlot {
  slotId: string;
  date: string;
  startTime: string;
  endTime: string;
  formattedTime: string;
  totalCost: string;
  totalCostValue: number;
  available: boolean;
  fullyBooked: boolean;
  limitReached: boolean;
}

export interface AxfoodDeliveryDay {
  date: string;
  formattedDate: string;
  slots: AxfoodSlot[];
}

export class AxfoodSession {
  private cookies = new Map<string, string>();
  private csrfToken: string | null = null;

  constructor(private baseUrl: string) {}

  private parseCookies(response: Response): void {
    for (const header of response.headers.getSetCookie?.() ?? []) {
      const pair = header.split(";")[0];
      const eq = pair.indexOf("=");
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (this.cookies.size > 0) {
      headers.set("cookie", [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    }
    if (init.method && init.method !== "GET" && this.csrfToken) {
      headers.set("x-csrf-token", this.csrfToken);
    }
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers, redirect: "manual" });
    this.parseCookies(res);
    return res;
  }

  private async refreshCsrf(): Promise<void> {
    if (!this.cookies.has("JSESSIONID")) await this.request("/api/config");
    const res = await this.request("/axfood/rest/csrf-token");
    if (!res.ok) throw new Error(`csrf-token HTTP ${res.status}`);
    this.csrfToken = (await res.json()) as string;
  }

  async login(username: string, password: string): Promise<void> {
    await this.refreshCsrf();
    const u = encryptCredential(username);
    const p = encryptCredential(password);
    const res = await this.request("/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        j_username: u.str,
        j_username_key: u.key,
        j_password: p.str,
        j_password_key: p.key,
        j_remember_me: true,
      }),
    });
    if (res.status >= 400) throw new Error(`login failed (HTTP ${res.status}) — check credentials`);
    await this.refreshCsrf();
  }

  /** Home-delivery slot days for a postal code (requires login). */
  async deliverySlots(postalCode: string): Promise<AxfoodDeliveryDay[]> {
    const res = await this.request(
      `/axfood/rest/tms/delivery-slots?postalCode=${encodeURIComponent(postalCode)}`,
    );
    if (!res.ok) throw new Error(`delivery-slots HTTP ${res.status}`);
    const json = (await res.json()) as { deliveryDays?: AxfoodDeliveryDay[] };
    return json.deliveryDays ?? [];
  }
}
