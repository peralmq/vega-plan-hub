// Minimal client for the official Mathem MCP server (OAuth bearer from
// compare/.mathem-oauth.json, created by `npm run mathem-auth`). Refreshes
// the access token inline when expired; on refresh failure the caller gets
// a clear "re-run mathem-auth" error instead of a silent 401.
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MCP_URL = "https://www.mathem.se/mcp";
const TOKEN_URL = "https://www.mathem.se/o/token/";
const STORE = join(dirname(fileURLToPath(import.meta.url)), ".mathem-oauth.json");

interface TokenStore {
  client_id: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
}

export const hasMathemAuth = (): boolean => {
  if (!existsSync(STORE)) return false;
  const s = JSON.parse(readFileSync(STORE, "utf8")) as TokenStore;
  return Boolean(s.access_token && s.refresh_token);
};

async function freshToken(): Promise<string> {
  const store = JSON.parse(readFileSync(STORE, "utf8")) as TokenStore;
  if (!store.access_token) throw new Error("no Mathem tokens — run `npm run mathem-auth`");
  if (store.expires_at && Date.now() < store.expires_at - 60_000) return store.access_token;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: store.refresh_token ?? "",
      client_id: store.client_id,
    }).toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Mathem token refresh failed (${res.status}) — re-run \`npm run mathem-auth\``);
  store.access_token = json.access_token as string;
  if (json.refresh_token) store.refresh_token = json.refresh_token as string;
  store.expires_at = Date.now() + Number(json.expires_in ?? 3600) * 1000;
  writeFileSync(STORE, JSON.stringify(store, null, 2) + "\n");
  chmodSync(STORE, 0o600);
  return store.access_token;
}

let requestId = 100;

/** Raw JSON-RPC request to the MCP endpoint (tools/list, tools/call, …). */
export async function mcpRpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const token = await freshToken();
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: requestId++, method, params }),
  });
  if (!res.ok) throw new Error(`Mathem MCP HTTP ${res.status}`);
  const text = await res.text();
  // Responses arrive as SSE ("event: message\ndata: {...}") or plain JSON.
  const dataLine = text
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => l.slice(6))
    .join("");
  const rpc = JSON.parse(dataLine || text) as { result?: T; error?: { message?: string } };
  if (rpc.error) throw new Error(`Mathem MCP: ${rpc.error.message}`);
  if (rpc.result === undefined) throw new Error("Mathem MCP: empty RPC result");
  return rpc.result;
}

export async function mcpToolCall<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const result = await mcpRpc<{ content?: { text?: string }[]; isError?: boolean }>("tools/call", {
    name,
    arguments: args,
  });
  const content = result.content?.[0]?.text;
  if (content === undefined) throw new Error("Mathem MCP: empty tool result");
  if (result.isError) throw new Error(`Mathem MCP tool error: ${content.slice(0, 200)}`);
  return JSON.parse(content) as T;
}

export interface MathemSlot {
  id: number;
  openDatetime: string;
  closeDatetime: string;
  price: string;
  isFull: boolean;
  isUnavailable: boolean;
}

export interface MathemSlotDay {
  deliveryDate: string;
  slots: MathemSlot[];
}

export const getDeliverySlots = (dates: string[]): Promise<MathemSlotDay[]> =>
  mcpToolCall<MathemSlotDay[]>("get_delivery_slots", { delivery_dates: dates });

export interface MathemCartItem {
  product: { id: number; name: string; price: string; url?: string };
  quantity: number;
  totalGrossAmount: string;
}

/** Cart shape returned by get_cart and manipulate_cart. Observed live
 * 2026-08-16: totalGrossAmount includes fees on top of the line items
 * (5 lines summing 64.52 → cart total 170.52), so print both. */
export interface MathemCart {
  groups: { items: MathemCartItem[] }[];
  productQuantityCount: number;
  totalGrossAmount: string;
  deliverySlot: unknown | null;
  deliveryAddress: string | null;
  url: string;
}

/** Sum of the cart's line-item amounts in SEK (excludes cart-level fees). */
export const cartItemsTotal = (cart: MathemCart): number =>
  cart.groups
    .flatMap((g) => g.items)
    .reduce((sum, i) => sum + Number(i.totalGrossAmount), 0);

/** Additive cart fill: positive quantity adds that many units per product.
 * Checkout stays in the shop (the server itself enforces cart-ready-only). */
export const manipulateCart = (
  operations: { productId: number; quantity: number }[],
): Promise<MathemCart> => mcpToolCall<MathemCart>("manipulate_cart", { operations });

export const getCart = (): Promise<MathemCart> => mcpToolCall<MathemCart>("get_cart", {});
