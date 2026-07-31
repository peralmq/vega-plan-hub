// Throwaway R2 spike — echo + reaction + inline-keyboard probe.
// Deno runtime (Supabase Edge Functions); deploy per README.md.
import { Bot, webhookCallback, InlineKeyboard } from "https://deno.land/x/grammy@v1.30.0/mod.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const bot = new Bot(Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "");

// Probe 2: emoji-reaction confirmation (the directive'd UX for "köp X").
bot.hears(/^köp (.+)/i, async (ctx) => {
  await ctx.react("👍");
});

// Probe 3: inline keyboard + edit-in-place.
bot.command("plan", async (ctx) => {
  const kb = new InlineKeyboard().text("Next 3 days", "d3").text("Next 5 days", "d5");
  await ctx.reply("📅 Plan how far?", { reply_markup: kb });
});
bot.on("callback_query:data", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`✏️ Locked in: ${ctx.callbackQuery.data} (edit-in-place works)`);
});

// Probe 1/4: echo everything else with timing + chat info (shows what
// privacy mode lets through in the group).
bot.on("message:text", async (ctx) => {
  await ctx.reply(
    `🦞 seen in ${ctx.chat.type} from ${ctx.from?.first_name}: "${ctx.message.text}"`,
  );
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
