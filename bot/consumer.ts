// The M1 half of the hybrid transport (gate-brief decision 2): drains
// telegram_inbox — filled by the capture edge function — over an OUTBOUND
// Realtime subscription plus a sweep timer, parses rules-first with the
// qwen3:8b two-stage fallback, and executes the narrow tool set. Zero
// inbound ports: every connection here is initiated by this process
// (Supabase HTTPS/WebSocket, Telegram HTTPS, localhost Ollama).
//
// Run on the M1: npm run bot   (env in bot/.env, chmod 600 — see bot/README.md)
import { createClient } from "@supabase/supabase-js";
import { detectLanguage, NLU_HARNESS_VERSION, parseUtterance } from "../src/lib/intentParser";
import { loadConfig } from "./env";
import { ollamaChat } from "./nlu";
import { TelegramApi } from "./telegram";
import {
  handleCallback,
  handleMessage,
  helpText,
  runTracesReview,
  type InboxRow,
  type RecipeRepoDeps,
  type StateMap,
} from "./tools";
import {
  loadIngredientSynonyms,
  loadRecipeIndex,
  loadRecipeLibrary,
  publishRecipeEdit,
  publishRecipeNote,
  readRecipe,
} from "./recipePublish";
import { createPulse, filePulseStore, resolvePulseChatId, type PulseRuntime } from "./pulse";
import { PULSE_CONFIG, parseRatingCallback } from "../src/lib/proactivePulse";

const cfg = loadConfig();
const tg = new TelegramApi(cfg.telegramBotToken);
const chat = ollamaChat(cfg.ollamaUrl, cfg.nluModel);
const states: StateMap = new Map();

// p4-08/p4-09 recipe notes + structured edits: the enumerated repo-write
// tools, bound to the checkout/push settings from env. Injected so
// tools.ts stays git-free.
const notes: RecipeRepoDeps = {
  index: () => loadRecipeIndex(cfg.recipeRepoDir),
  // p4-03: the same checkout, the same parser — the planning conversation's
  // recipe library (shared loader, no build-time mirror).
  library: () => loadRecipeLibrary(cfg.recipeRepoDir),
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

// p4-05: armed in main() once the household chat is known. Null until then —
// and null forever if no chat could be resolved, in which case the proactive
// layer simply never speaks.
let pulse: PulseRuntime | null = null;

async function processRow(row: InboxRow): Promise<void> {
  const t0 = performance.now();
  if (row.kind === "callback_query") {
    // p4-05: [🤩]/[😋]/[😐]/[👎] on a rating prompt — answered first (Telegram
    // wants it fast), then the tally edit. Its own namespace ("pr:"), so it
    // can never collide with the p4-03 planning vocabulary.
    if (pulse && parseRatingCallback(row.text)) {
      const callbackId = row.payload.callback_query?.id;
      if (callbackId) await tg.answerCallbackQuery(callbackId);
      await pulse.handleRatingCallback(row);
      console.log(`[row ${row.id}] rating "${row.text}" ${Math.round(performance.now() - t0)}ms`);
      return;
    }
    await handleCallback(supa, tg, row, states, notes);
    console.log(`[row ${row.id}] callback "${row.text}" ${Math.round(performance.now() - t0)}ms`);
    return;
  }

  const text = (row.text ?? "").trim();
  if (!text) return;

  // Bot commands are capture-layer or help territory, never NLU.
  if (text.startsWith("/")) {
    const isPrivate =
      (row.payload as { message?: { chat?: { type?: string } } }).message?.chat?.type === "private";
    if (isPrivate) {
      // p4-06 Step 4: /traces reviews the household's unsettled NLU traces —
      // its own command, alongside /help, never routed through the parser.
      if (text.startsWith("/traces")) await runTracesReview(supa, tg, row, detectLanguage(text));
      // p4-05: /pulse is the standing proactivity audit — which pings are on,
      // which are muted, when each last spoke (the A.6 week-one evidence).
      else if (pulse && text.startsWith("/pulse")) await pulse.handleCommand(text, row.chat_id);
      else await tg.sendMessage(row.chat_id, helpText(text));
    }
    console.log(`[row ${row.id}] command "${text}" (${isPrivate ? "helped" : "group, silent"})`);
    return;
  }

  // p4-05: "sluta påminna om X" mutes one ping type. Deterministic rules
  // ahead of the parser on purpose — muting must work when Ollama is down,
  // and must never be mistaken for a shopping utterance (the parser returns
  // null for anything it doesn't own, so ordinary messages fall straight
  // through).
  if (pulse && (await pulse.handleCommand(text, row.chat_id))) {
    console.log(`[row ${row.id}] pulse command "${text}"`);
    return;
  }

  const parseStart = performance.now();
  const { parse, source } = await parseUtterance(text, chat);
  const latencyMs = Math.round(performance.now() - parseStart);
  await handleMessage(supa, tg, row, parse, states, notes, {
    source,
    model: cfg.nluModel,
    harnessVersion: NLU_HARNESS_VERSION,
    latencyMs,
  });
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

// p4-05: the ONE scheduler. A plain interval on this runtime — the transport
// p4-02 recorded (hybrid via queue, Track B on household hardware), so no
// pg_cron and no edge-function timer exists to disagree with it.
//
// NIGHT SAFETY (directive Pelle 2026-08-30): setInterval only — never an
// immediate tick — so arming can never produce a send, at any hour. The tick
// itself only fires inside a slot's own afternoon/evening grace window, so a
// restart at 00:30 or a laptop waking at 23:00 sends nothing and catches up
// on nothing. The boot log prints every armed slot's next fire time as the
// live proof.
async function armPulse(userId: string): Promise<void> {
  const chatId = await resolvePulseChatId(supa, userId);
  if (chatId == null) {
    console.log("[pulse] no household chat seen yet — proactive layer idle");
    return;
  }
  pulse = createPulse({
    supa,
    tg,
    userId,
    chatId,
    recipes: () => loadRecipeLibrary(cfg.recipeRepoDir),
    store: filePulseStore(),
  });
  const now = new Date();
  const armed = pulse
    .nextFires(now)
    .map((fire) => `${fire.type}@${fire.at.toISOString()}`)
    .join(" ");
  console.log(`[pulse] armed chat=${chatId} tick=${PULSE_CONFIG.tickMs}ms next: ${armed}`);
  setInterval(() => void pulse?.tick(), PULSE_CONFIG.tickMs);
}

async function main(): Promise<void> {
  const { data: session, error } = await supa.auth.signInWithPassword({
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
  await armPulse(session.user.id);
  await drain(); // backlog from before this boot (laptop-asleep gap recovery)
  console.log("[boot] draining; ctrl-c to stop");
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
