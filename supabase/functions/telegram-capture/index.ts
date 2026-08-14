// p4-02 capture layer — the always-on half of the hybrid transport
// (gate-brief decision 2). This function does exactly three things:
// secret-token check → telegram_accounts allow-list → enqueue the raw
// update into telegram_inbox. All parsing, tools, and replies live in the
// household M1 consumer (bot/), which drains the queue over an outbound
// Realtime subscription. Per tech.spec.md the function authenticates as
// the shared household user with RLS active — no service-role key.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Household-user session, cached across warm invocations. Password grant on
// cold start only (r4 §3: session auth bounds blast radius to household data).
let clientPromise: Promise<SupabaseClient> | null = null;
function household(): Promise<SupabaseClient> {
  clientPromise ??= (async () => {
    const client = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error } = await client.auth.signInWithPassword({
      email: Deno.env.get("HOUSEHOLD_EMAIL") ?? "",
      password: Deno.env.get("HOUSEHOLD_PASSWORD") ?? "",
    });
    if (error) {
      clientPromise = null; // next invocation retries the sign-in
      throw new Error(`household sign-in failed: ${error.message}`);
    }
    return client;
  })();
  return clientPromise;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number };
    chat: { id: number; type: string };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number };
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
}

Deno.serve(async (req: Request) => {
  // Telegram's secret_token header is the only accepted caller credential.
  if (req.headers.get("x-telegram-bot-api-secret-token") !== Deno.env.get("FUNCTION_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return new Response("ok"); // garbage in, 200 out — never retry-storm
  }

  try {
    const msg = update.message;
    const cb = update.callback_query;
    const kind = cb ? "callback_query" : msg?.text ? "message" : null;
    if (!kind) return new Response("ok"); // joins, edits, media — not captured

    const senderId = cb ? cb.from.id : msg!.from?.id;
    const chatId = cb ? cb.message?.chat.id : msg!.chat.id;
    const messageId = cb ? cb.message?.message_id : msg!.message_id;
    const text = cb ? (cb.data ?? "") : msg!.text!;
    if (senderId == null || chatId == null) return new Response("ok");

    // Bootstrap helper, deliberately BEFORE the gate: anyone may ask for
    // their own Telegram id (needed once, to fill telegram_accounts).
    if (kind === "message" && /^\/whoami(@\w+)?$/.test(text.trim())) {
      await fetch(`${TG_API}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: `🪪 Your Telegram id: ${senderId}` }),
      });
      return new Response("ok");
    }

    const supa = await household();

    // Allow-list gate (r4 §4 T1): unknown senders get silence and a log
    // line — and are never enqueued (privacy default, p4-06).
    const { data: account } = await supa
      .from("telegram_accounts")
      .select("user_id, family_member_id")
      .eq("telegram_user_id", senderId)
      .eq("active", true)
      .maybeSingle();
    if (!account) {
      console.log(`ignored unknown sender ${senderId}`);
      return new Response("ok");
    }

    // Enqueue verbatim; update_id dedupe makes Telegram retries idempotent.
    const { error } = await supa.from("telegram_inbox").upsert(
      {
        user_id: account.user_id,
        update_id: update.update_id,
        chat_id: chatId,
        message_id: messageId,
        telegram_user_id: senderId,
        family_member_id: account.family_member_id,
        kind,
        text,
        payload: update,
      },
      { onConflict: "user_id,update_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(`enqueue failed: ${error.message}`);
  } catch (err) {
    // Log and 200 anyway: a Telegram retry-storm helps nobody; the miss is
    // visible in the function log and the live-trial log.
    console.error(err);
  }
  return new Response("ok");
});
