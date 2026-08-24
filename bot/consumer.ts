// The M1 half of the hybrid transport (gate-brief decision 2): drains
// telegram_inbox — filled by the capture edge function — over an OUTBOUND
// Realtime subscription plus a sweep timer, parses rules-first with the
// qwen3:8b two-stage fallback, and executes the narrow tool set. Zero
// inbound ports: every connection here is initiated by this process
// (Supabase HTTPS/WebSocket, Telegram HTTPS, localhost Ollama).
//
// Run on the M1: npm run bot   (env in bot/.env, chmod 600 — see bot/README.md)
import { createClient } from "@supabase/supabase-js";
import { parseUtterance } from "../src/lib/intentParser";
import { loadConfig } from "./env";
import { ollamaChat } from "./nlu";
import { TelegramApi } from "./telegram";
import {
  handleCallback,
  handleMessage,
  helpText,
  type InboxRow,
  type RecipeRepoDeps,
  type StateMap,
} from "./tools";
import {
  loadIngredientSynonyms,
  loadRecipeIndex,
  publishRecipeEdit,
  publishRecipeNote,
  readRecipe,
} from "./recipePublish";

const cfg = loadConfig();
const tg = new TelegramApi(cfg.telegramBotToken);
const chat = ollamaChat(cfg.ollamaUrl, cfg.nluModel);
const states: StateMap = new Map();

// p4-08/p4-09 recipe notes + structured edits: the enumerated repo-write
// tools, bound to the checkout/push settings from env. Injected so
// tools.ts stays git-free.
const notes: RecipeRepoDeps = {
  index: () => loadRecipeIndex(cfg.recipeRepoDir),
  synonyms: () => loadIngredientSynonyms(cfg.recipeRepoDir),
  read: (recipeId) => readRecipe(cfg.recipeRepoDir, recipeId),
  publishNote: (recipeId, noteLine) =>
    publishRecipeNote({ repoDir: cfg.recipeRepoDir, recipeId, noteLine, push: cfg.recipePush }),
  publishEdit: (recipeId, candidates, edit) =>
    publishRecipeEdit({ repoDir: cfg.recipeRepoDir, recipeId, candidates, edit, push: cfg.recipePush }),
};

const supa = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: true },
});

// r4 §3's open question — refresh-token longevity on a headless client —
// gets its evidence from these log lines during the live week.
supa.auth.onAuthStateChange((event) => {
  console.log(`[auth] ${new Date().toISOString()} ${event}`);
});

async function processRow(row: InboxRow): Promise<void> {
  const t0 = performance.now();
  if (row.kind === "callback_query") {
    await handleCallback(tg, row, states, notes);
    console.log(`[row ${row.id}] callback "${row.text}" ${Math.round(performance.now() - t0)}ms`);
    return;
  }

  const text = (row.text ?? "").trim();
  if (!text) return;

  // Bot commands are capture-layer or help territory, never NLU.
  if (text.startsWith("/")) {
    const isPrivate =
      (row.payload as { message?: { chat?: { type?: string } } }).message?.chat?.type === "private";
    if (isPrivate) await tg.sendMessage(row.chat_id, helpText(text));
    console.log(`[row ${row.id}] command "${text}" (${isPrivate ? "helped" : "group, silent"})`);
    return;
  }

  const { parse, source } = await parseUtterance(text, chat);
  await handleMessage(supa, tg, row, parse, states, notes);
  console.log(
    `[row ${row.id}] intent=${parse.intent} source=${source} ` +
      `${Math.round(performance.now() - t0)}ms "${text}"`,
  );
}

// Single-flight drain: both the sweep timer and Realtime events just wake
// this up; the queue itself (processed_at IS NULL, in id order) is the only
// source of truth, so wake-signal races can never double-process a row.
let draining = false;
async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    for (;;) {
      const { data, error } = await supa
        .from("telegram_inbox")
        .select("*")
        .is("processed_at", null)
        .order("id", { ascending: true })
        .limit(20);
      if (error) {
        console.error("[drain] fetch failed:", error.message);
        return;
      }
      if (!data || data.length === 0) return;
      for (const row of data as InboxRow[]) {
        let processingError: string | null = null;
        try {
          await processRow(row);
        } catch (err) {
          processingError = String(err instanceof Error ? err.message : err).slice(0, 500);
          console.error(`[row ${row.id}] failed:`, processingError);
        }
        await supa
          .from("telegram_inbox")
          .update({ processed_at: new Date().toISOString(), processing_error: processingError })
          .eq("id", row.id);
      }
    }
  } finally {
    draining = false;
  }
}

async function main(): Promise<void> {
  const { error } = await supa.auth.signInWithPassword({
    email: cfg.householdEmail,
    password: cfg.householdPassword,
  });
  if (error) throw new Error(`household sign-in failed: ${error.message}`);
  console.log(`[boot] signed in as household user; model=${cfg.nluModel} ollama=${cfg.ollamaUrl}`);
  console.log(`[boot] recipe notes: repo=${cfg.recipeRepoDir} push=${cfg.recipePush ? "on" : "off"}`);

  // Warm probe: fail loudly at boot if the local LLM is down, instead of
  // on the first hard utterance.
  try {
    await chat("Answer briefly.", "ping", {
      type: "object",
      properties: { ok: { type: "boolean" } },
      required: ["ok"],
    });
    console.log("[boot] ollama reachable");
  } catch (err) {
    console.error("[boot] ollama probe failed — LLM fallback is DOWN:", err);
  }

  supa
    .channel("telegram_inbox_feed")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "telegram_inbox" },
      () => void drain(),
    )
    .subscribe((status) => console.log(`[realtime] ${status}`));

  setInterval(() => void drain(), cfg.sweepMs); // catch-up net under Realtime
  await drain(); // backlog from before this boot (laptop-asleep gap recovery)
  console.log("[boot] draining; ctrl-c to stop");
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
