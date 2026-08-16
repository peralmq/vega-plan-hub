// One-shot OAuth authorization-code + PKCE flow against Mathem's AS
// (https://www.mathem.se/o) for the official MCP endpoint (p5-01 step 1).
// Runs a loopback listener, prints the authorize URL, and after the human
// logs in + approves, exchanges the code and persists tokens to
// compare/.mathem-oauth.json (gitignored, chmod 600). Also refreshes:
//   npm run mathem-auth            # full flow (prints URL, waits)
//   npm run mathem-auth -- --refresh  # refresh_token grant only
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AS = "https://www.mathem.se/o";
const PORT = 8976;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const STORE = join(dirname(fileURLToPath(import.meta.url)), ".mathem-oauth.json");

interface OAuthStore {
  client_id: string;
  registration_access_token?: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number; // epoch ms
}

const load = (): OAuthStore => JSON.parse(readFileSync(STORE, "utf8"));
const save = (data: OAuthStore) => {
  writeFileSync(STORE, JSON.stringify(data, null, 2) + "\n");
  chmodSync(STORE, 0o600);
};

const b64url = (buf: Buffer) =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function tokenRequest(body: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${AS}/token/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`token endpoint ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

function persistTokens(store: OAuthStore, tokens: Record<string, unknown>) {
  store.access_token = tokens.access_token as string;
  if (tokens.refresh_token) store.refresh_token = tokens.refresh_token as string;
  store.expires_at = Date.now() + Number(tokens.expires_in ?? 3600) * 1000;
  save(store);
}

async function refresh() {
  const store = load();
  if (!store.refresh_token) throw new Error("no refresh_token stored — run the full flow");
  const tokens = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: store.refresh_token,
    client_id: store.client_id,
  });
  persistTokens(store, tokens);
  console.log(`refreshed; access token valid until ${new Date(store.expires_at!).toISOString()}`);
}

async function fullFlow() {
  if (!existsSync(STORE)) {
    throw new Error(
      `${STORE} missing — expected {"client_id": "..."} from dynamic registration`,
    );
  }
  const store = load();
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(16));

  const authUrl =
    `${AS}/authorize/?` +
    new URLSearchParams({
      response_type: "code",
      client_id: store.client_id,
      redirect_uri: REDIRECT,
      scope: "mcp",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", REDIRECT);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const err = url.searchParams.get("error");
      const gotState = url.searchParams.get("state");
      const gotCode = url.searchParams.get("code");
      if (err || !gotCode || gotState !== state) {
        res.writeHead(400, { "content-type": "text/html" });
        res.end("<h1>Login failed — check the terminal.</h1>");
        server.close();
        reject(new Error(err ?? "missing code or state mismatch"));
        return;
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<h1>✅ Vega is connected to Mathem — you can close this tab.</h1>");
      server.close();
      resolve(gotCode);
    });
    server.listen(PORT, "127.0.0.1", () => {
      console.log("\n👉 Open this URL, log in to Mathem, and approve access:\n");
      console.log(authUrl + "\n");
      console.log("(waiting for the callback on 127.0.0.1:8976 — Ctrl-C to abort)");
    });
    setTimeout(() => {
      server.close();
      reject(new Error("timed out after 60 minutes"));
    }, 3_600_000).unref();
  });

  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT,
    client_id: store.client_id,
    code_verifier: verifier,
  });
  persistTokens(store, tokens);
  console.log(
    `\n✅ tokens stored in compare/.mathem-oauth.json (mode 600); access token valid until ${new Date(store.expires_at!).toISOString()}, refresh token ${store.refresh_token ? "present" : "MISSING"}`,
  );
}

(process.argv.includes("--refresh") ? refresh() : fullFlow()).catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
