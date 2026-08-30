// p4-05: the rationed proactive layer's pure core — Script 5's runs-low
// nudge, Script 8's tonight ping and post-dinner rating prompt, and the
// per-ping mute. Everything here is deterministic and clock-injected; the
// Supabase/Telegram side lives in bot/pulse.ts, the scheduler that ticks it
// in bot/consumer.ts (ONE mechanism, matching the transport p4-02 recorded:
// hybrid via queue, Track B runtime on household hardware — no pg_cron, no
// second scheduler anywhere).
//
// WHICH PINGS SHIP ENABLED is not this file's judgement call: the R1 A.6
// verdict row is still empty, and the gate-brief's standing rule for that
// case (docs/research/gate-brief.md: "p4-02..05 read the filled verdict
// table at dispatch and fall back to the scripts' defaults where a row is
// empty") points at the Script 5/8 defaults below — 16:00 tonight, 17:00
// runs-low, 21:00 post-dinner, all three on. The budget's posture ("fewer
// than feels clever") is what the mute command and the /pulse audit are
// for: week one decides which survive, and A.6 gets filled from the send
// log, not from a guess made here.
//
// NIGHT SAFETY (hard requirement, directive Pelle 2026-08-30): send times
// are fixed and afternoon/evening only; a slot is due only INSIDE its own
// short grace window, so a runtime restart — or a laptop waking at 23:00
// with a missed 16:00 slot behind it — computes "not due" and stays silent.
// There is deliberately no catch-up path: a missed ping is missed.

import { HORIZON_CHOICES } from "./planDraft";
import { localIsoDate } from "./recipeNotes";

export const PING_TYPES = ["runs_low", "tonight", "rating"] as const;
export type PingType = (typeof PING_TYPES)[number];

export interface PingConfig {
  type: PingType;
  /** Household wall clock, "HH:MM". The only place a send time is written. */
  sendAt: string;
  /** How long after `sendAt` the slot may still fire. Bounds every wake-up. */
  graceMinutes: number;
  /** Ships on per the verdict fallback above; the household mutes in chat. */
  enabled: boolean;
  /** What the household calls it in "sluta påminna om …". */
  label: string;
  aliases: string[];
}

export interface PulseConfig {
  /** Scheduler resolution. The tick is the ONLY thing that can send. */
  tickMs: number;
  /** A.3: "planned through tomorrow" — one dinner left in the pool. */
  runsLowRemaining: number;
  /** The nudge's horizon buttons — the p4-03 choices, 5 days first (A.3). */
  horizonChoices: readonly number[];
  /** Script 8's one-tap emoji set, on the existing 1–5 rating column. */
  ratingChoices: readonly RatingChoice[];
  pings: PingConfig[];
}

export interface RatingChoice {
  emoji: string;
  score: number;
}

// Script 8's one-tap set, mapped onto the EXISTING recipe_ratings 1–5 column
// (plan non-goal: no new rating model). 👎 lands on 1 rather than 2 so the
// planner's average moves as much as a thumbs-down deserves.
export const RATING_CHOICES: RatingChoice[] = [
  { emoji: "🤩", score: 5 },
  { emoji: "😋", score: 4 },
  { emoji: "😐", score: 3 },
  { emoji: "👎", score: 1 },
];

export const PULSE_CONFIG: PulseConfig = {
  tickMs: 60_000,
  runsLowRemaining: 1,
  horizonChoices: HORIZON_CHOICES,
  ratingChoices: RATING_CHOICES,
  pings: [
    {
      type: "runs_low",
      sendAt: "17:00", // Script 5: "(Wednesday 17:00, proactive — plan runs out tomorrow)"
      graceMinutes: 45,
      enabled: true,
      label: "planeringspåminnelsen",
      aliases: ["planering", "planeringen", "planeringspåminnelsen", "planera", "planning", "plan"],
    },
    {
      type: "tonight",
      sendAt: "16:00", // Script 8: "(16:00) 🍳 Tonight: …"
      graceMinutes: 45,
      enabled: true,
      label: "middagstipset",
      aliases: ["middagstipset", "middagstips", "middagen", "ikväll", "kvällsmaten", "tonight", "dinner"],
    },
    {
      type: "rating",
      sendAt: "21:00", // Script 8: "…21:00, only after a cooked dinner…"
      graceMinutes: 45,
      enabled: true,
      label: "betygsfrågan",
      aliases: ["betyg", "betygen", "betygsfrågan", "omdöme", "rating", "ratings"],
    },
  ],
};

export function pingConfig(type: PingType): PingConfig {
  const found = PULSE_CONFIG.pings.find((p) => p.type === type);
  if (!found) throw new Error(`unknown ping type: ${type}`);
  return found;
}

// ---------------------------------------------------------------------------
// Clock

export function minutesOfDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

function parseHhMm(sendAt: string): number {
  const m = sendAt.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error(`bad send time: ${sendAt}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function windowStart(type: PingType): number {
  return parseHhMm(pingConfig(type).sendAt);
}

/**
 * The next time this slot comes round, ALWAYS strictly in the future — the
 * boot-time log line that proves nothing is about to fire. At 00:30 that is
 * this afternoon; at 16:00:00 sharp it is tomorrow (the tick that is firing
 * right now owns today's).
 */
export function nextFireAt(now: Date, sendAt: string): Date {
  const target = new Date(now);
  const minutes = parseHhMm(sendAt);
  target.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  return target;
}

/**
 * Is this slot's window open right now? The whole no-catch-up guarantee: a
 * process that starts (or a laptop that wakes) outside the window sees
 * `false` and sends nothing, however long it was away.
 */
export function slotIsDue(now: Date, type: PingType): boolean {
  const config = pingConfig(type);
  if (!config.enabled) return false;
  const start = parseHhMm(config.sendAt);
  const mins = minutesOfDay(now);
  return mins >= start && mins < start + config.graceMinutes;
}

// ---------------------------------------------------------------------------
// Dedupe. Each ping type has a natural "same occasion" key; a send is skipped
// when the key matches the last one recorded for that type.

export const runsLowKey = (batchId: string | null): string => `batch:${batchId ?? "none"}`;
export const tonightKey = (todayIso: string = localIsoDate()): string => todayIso;
export const ratingKey = (todayIso: string, recipeId: string): string => `${todayIso}:${recipeId}`;

export function shouldSend(key: string, lastKey: string | undefined): boolean {
  return key !== lastKey;
}

/** A.3's runs-low trigger, read in the pool model: dinners left, not dates. */
export function isRunsLow(remaining: number, threshold = PULSE_CONFIG.runsLowRemaining): boolean {
  return remaining <= threshold;
}

// ---------------------------------------------------------------------------
// Copy (design.spec "Chat voice": Swedish by default — a proactive message
// has no sender to mirror, and the household speaks Swedish to the bot).

export interface TonightDish {
  title: string;
  cookTime: number;
}

export function renderRunsLowNudge(remaining: number): string {
  const head =
    remaining <= 0
      ? "📅 Potten är tom — inget planerat just nu."
      : "📅 Ni är planerade t.o.m. imorgon.";
  return `${head} Ska vi planera några dagar till? 🌱`;
}

export function renderTonightPing(dishes: TonightDish[]): string {
  if (dishes.length === 1) {
    return (
      `🍳 Ikväll: ${dishes[0].title} (~${dishes[0].cookTime} min).\n` +
      "Puffa mig 🛒 om något saknas."
    );
  }
  const lines = dishes.map((d) => `• ${d.title} (~${d.cookTime} min)`);
  return [
    "🍳 Ikväll kan ni välja i potten:",
    ...lines,
    "Puffa mig 🛒 om något saknas.",
  ].join("\n");
}

export function scoreForEmoji(emoji: string): number | null {
  return RATING_CHOICES.find((c) => c.emoji === emoji)?.score ?? null;
}

export function emojiForScore(score: number): string {
  const exact = RATING_CHOICES.find((c) => c.score === score);
  if (exact) return exact.emoji;
  // Ratings written from the web's star UI are any of 1–5; show the nearest.
  return RATING_CHOICES.reduce((best, c) =>
    Math.abs(c.score - score) < Math.abs(best.score - score) ? c : best,
  ).emoji;
}

export function renderRatingPrompt(title: string): string {
  return `🍽 Hur var ${title}?`;
}

export function renderRatingTally(entries: Array<{ name: string; score: number }>): string {
  const body = entries.map((e) => `${e.name} ${emojiForScore(e.score)}`).join(" · ");
  return `✏️ Loggat (${body}) — den dyker upp oftare 📈`;
}

// ---------------------------------------------------------------------------
// Rating callback vocabulary. Namespaced away from the p4-03 "p:" planning
// events; Telegram caps callback_data at 64 bytes, so it is score + slug.

export const RATING_CALLBACK_PREFIX = "pr:";

export function encodeRatingCallback(score: number, recipeId: string): string {
  return `${RATING_CALLBACK_PREFIX}${score}:${recipeId}`;
}

export function parseRatingCallback(
  data: string | null | undefined,
): { score: number; recipeId: string } | null {
  if (!data || !data.startsWith(RATING_CALLBACK_PREFIX)) return null;
  const rest = data.slice(RATING_CALLBACK_PREFIX.length);
  const sep = rest.indexOf(":");
  if (sep <= 0) return null;
  const score = Number(rest.slice(0, sep));
  const recipeId = rest.slice(sep + 1);
  if (!recipeId) return null;
  if (!Number.isInteger(score) || score < 1 || score > 5) return null;
  return { score, recipeId };
}

// ---------------------------------------------------------------------------
// Per-ping mute — "sluta påminna om X" (plan Goal: every ping type is
// individually mutable in chat). Deterministic rules, zero model calls: the
// mute command must work even when Ollama is down, and it must never be
// mistaken for a shopping utterance.

const MUTE_RE =
  /^(?:sluta|slut(?:a)?\s+med|stoppa)\s+(?:att\s+)?(?:påminna|paminna|tjata|pinga|skicka)\b(?:\s+mig)?(?:\s+(?:om|med|about))?\s*(.*)$/i;
const UNMUTE_RE =
  /^(?:börja|borja|starta|sätt\s*igång|satt\s*igang)\s+(?:att\s+)?(?:påminna|paminna|pinga|skicka)\b(?:\s+mig)?(?:\s+(?:om|med|about))?\s*(.*)$/i;
const EN_MUTE_RE = /^stop\s+(?:reminding|pinging|messaging)\s+(?:me\s+)?(?:about\s+)?(.*)$/i;
const EN_UNMUTE_RE = /^(?:start|resume)\s+(?:reminding|pinging)\s+(?:me\s+)?(?:about\s+)?(.*)$/i;

export type MuteCommand =
  | { kind: "set"; type: PingType; muted: boolean }
  | { kind: "unknown"; muted: boolean };

function matchPingName(raw: string): PingType | null {
  const text = raw
    .toLowerCase()
    .replace(/[.!?]+$/, "")
    .replace(/\b(igen|längre|langre|mer|more|again|please|tack)\b/g, "")
    .trim();
  if (!text) return null;
  for (const ping of PULSE_CONFIG.pings) {
    if (ping.aliases.some((alias) => text.includes(alias))) return ping.type;
  }
  return null;
}

export function parseMuteCommand(text: string): MuteCommand | null {
  const trimmed = text.trim().replace(/\s+/g, " ");
  for (const [re, muted] of [
    [MUTE_RE, true],
    [EN_MUTE_RE, true],
    [UNMUTE_RE, false],
    [EN_UNMUTE_RE, false],
  ] as const) {
    const m = trimmed.match(re);
    if (!m) continue;
    const type = matchPingName(m[1] ?? "");
    return type ? { kind: "set", type, muted } : { kind: "unknown", muted };
  }
  return null;
}

export function renderMuteAck(type: PingType, muted: boolean): string {
  const label = pingConfig(type).label;
  return muted
    ? `🤫 Okej — jag tystnar om ${label}. Säg "börja påminna om ${label}" när ni vill ha den tillbaka.`
    : `🌱 Då är ${label} på igen (${pingConfig(type).sendAt}).`;
}

export function renderMuteHelp(): string {
  const names = PULSE_CONFIG.pings.map((p) => `• ${p.label} (${p.sendAt})`).join("\n");
  return `🤔 Vilken påminnelse menar du?\n${names}`;
}

// ---------------------------------------------------------------------------
// /pulse — the standing audit surface for A.6 ("which pings survived week
// one"): what is configured, what is muted, and when each last spoke.

export interface PulseStatusView {
  muted: Partial<Record<PingType, boolean>>;
  lastSends: Partial<Record<PingType, { key: string; at: string }>>;
}

export function renderPulseStatus(view: PulseStatusView): string {
  const lines = PULSE_CONFIG.pings.map((ping) => {
    const muted = view.muted[ping.type] === true;
    const last = view.lastSends[ping.type];
    const state = muted ? "🤫 tyst" : ping.enabled ? "🔔 på" : "💤 av";
    const when = last ? ` — senast ${last.at.slice(0, 10)} (${last.key})` : " — inget skickat än";
    return `• ${ping.label} ${ping.sendAt} ${state}${when}`;
  });
  return ["🌱 Påminnelser:", ...lines].join("\n");
}
