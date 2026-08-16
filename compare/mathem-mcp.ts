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

export async function mcpToolCall<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const token = await freshToken();
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: requestId++,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  if (!res.ok) throw new Error(`Mathem MCP HTTP ${res.status}`);
  const text = await res.text();
  // Responses arrive as SSE ("event: message\ndata: {...}") or plain JSON.
  const dataLine = text
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => l.slice(6))
    .join("");
  const rpc = JSON.parse(dataLine || text) as {
    result?: { content?: { text?: string }[]; isError?: boolean };
    error?: { message?: string };
  };
  if (rpc.error) throw new Error(`Mathem MCP: ${rpc.error.message}`);
  const content = rpc.result?.content?.[0]?.text;
  if (content === undefined) throw new Error("Mathem MCP: empty tool result");
  if (rpc.result?.isError) throw new Error(`Mathem MCP tool error: ${content.slice(0, 200)}`);
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
