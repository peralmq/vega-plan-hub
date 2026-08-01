// R2/dev spike — capture bot for the live household test (LIVE-TEST.md).
// Deno runtime (Supabase Edge Functions). Throwaway: the production capture
// bot is p4-02; this exists so the household can test Telegram → Supabase
// end to end today. Spike-only deviation from tech.spec.md noted in
// LIVE-TEST.md: uses the edge function's service-role env (never leaves
// Supabase infra) behind a hard telegram_accounts allow-list; p4-02 switches
// to shared-user session auth.
import {
  Bot,
  webhookCallback,
  InlineKeyboard,
  Context,
} from "https://deno.land/x/grammy@v1.30.0/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const supa = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

interface Account {
  user_id: string;
  family_member_id: string;
  display_name: string | null;
}
type BotCtx = Context & { account?: Account };

const bot = new Bot<BotCtx>(Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "");

async function accountFor(telegramId: number): Promise<Account | null> {
  const { data } = await supa
    .from("telegram_accounts")
    .select("user_id, family_member_id, display_name")
    .eq("telegram_user_id", telegramId)
    .eq("active", true)
    .maybeSingle();
  return data as Account | null;
}

// Bootstrap helper — registered BEFORE the allow-list gate on purpose: anyone
// may ask for their own Telegram id (needed once, to fill telegram_accounts).
bot.command("whoami", (ctx) => ctx.reply(`🪪 Your Telegram id: ${ctx.from?.id}`));

// Allow-list gate (r4 §4 T1): unknown senders get silence and a log line.
bot.use(async (ctx, next) => {
  const id = ctx.from?.id;
  if (!id) return;
  const account = await accountFor(id);
  if (!account) {
    console.log(`ignored unknown sender ${id}`);
    return;
  }
  ctx.account = account;
  await next();
});

const ITEM_SPLIT = /\s+(?:och|and)\s+|,\s*/i;

// Capture: "köp mjölk", "buy toilet paper and coffee", "köp citroner, lök".
// Design-spec confirmation style: an emoji reaction, no reply message.
bot.hears(/^(?:köp|kop|buy)\s+(.+)$/i, async (ctx) => {
  const items = ctx.match[1]
    .split(ITEM_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
  const rows = items.map((name) => ({
    user_id: ctx.account!.user_id,
    source: "adhoc",
    display_name: name,
    added_by: ctx.account!.family_member_id,
  }));
  const { error } = await supa.from("shopping_list_items").insert(rows);
  if (error) {
    console.error("insert failed", error);
    await ctx.reply("😵 Couldn't save that — check the function logs.");
    return;
  }
  await ctx.react("👍");
});

// "visa listan" / "show list" — unchecked items with who added them.
bot.hears(/^(?:visa listan|listan|show list)$/i, async (ctx) => {
  const { data, error } = await supa
    .from("shopping_list_items")
    .select("display_name, note, family_members!shopping_list_items_added_by_fkey(name)")
    .eq("user_id", ctx.account!.user_id)
    .is("checked_at", null)
    .order("created_at");
  if (error) {
    console.error("list failed", error);
    await ctx.reply("😵 Couldn't fetch the list.");
    return;
  }
  const rows = (data ?? []) as Array<{
    display_name: string;
    note: string | null;
    family_members: { name: string } | null;
  }>;
  if (rows.length === 0) {
    await ctx.reply("🛒 List is empty — nice! ✨");
    return;
  }
  const lines = rows.map((r) => {
    const by = r.family_members?.name ? ` (${r.family_members.name})` : "";
    const note = r.note ? ` — ${r.note}` : "";
    return `• ${r.display_name}${note}${by}`;
  });
  await ctx.reply(`🛒 Shopping list (${rows.length}):\n${lines.join("\n")}`);
});

// "bocka av mjölk" / "check milk" — check off by fuzzy name match.
bot.hears(/^(?:bocka av|check)\s+(.+)$/i, async (ctx) => {
  const term = ctx.match[1].trim();
  const { data } = await supa
    .from("shopping_list_items")
    .select("id, display_name")
    .eq("user_id", ctx.account!.user_id)
    .is("checked_at", null)
    .ilike("display_name", `%${term}%`);
  const matches = (data ?? []) as Array<{ id: string; display_name: string }>;
  if (matches.length === 0) {
    await ctx.reply(`🤷 Nothing on the list matching "${term}".`);
    return;
  }
  await supa
    .from("shopping_list_items")
    .update({
      checked_at: new Date().toISOString(),
      checked_by: ctx.account!.family_member_id,
    })
    .in("id", matches.map((m) => m.id));
  await ctx.react("👌");
});

// R2 probe: inline keyboard + edit-in-place (findings feed r2-track-a-spike.md).
bot.command("plan", async (ctx) => {
  const kb = new InlineKeyboard()
    .text("Next 3 days", "d3")
    .text("Next 5 days", "d5");
  await ctx.reply("📅 Plan how far?", { reply_markup: kb });
});
bot.on("callback_query:data", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `✏️ Locked in: ${ctx.callbackQuery.data} (edit-in-place works)`,
  );
});

// Fallback: short help in DMs; silence in groups (privacy-mode probe still
// logs what arrived, which is the R2 finding).
bot.on("message:text", async (ctx) => {
  console.log(
    `unmatched in ${ctx.chat.type} from ${ctx.from?.id}: "${ctx.message.text}"`,
  );
  if (ctx.chat.type === "private") {
    await ctx.reply(
      "🌱 I know these:\n• köp/buy <thing>[, <thing>…]\n• visa listan / show list\n• bocka av/check <thing>\n• /plan (button demo)\n• /whoami",
    );
  }
});

const handleUpdate = webhookCallback(bot, "std/http", {
  secretToken: Deno.env.get("FUNCTION_SECRET"),
});
Deno.serve(async (req: Request) => {
  try {
    return await handleUpdate(req);
  } catch (err) {
    console.error(err);
    return new Response("ok"); // never let Telegram retry-storm
  }
});
