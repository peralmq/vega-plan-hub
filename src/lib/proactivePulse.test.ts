// p4-05: the proactive layer's pure core, with a frozen clock throughout.
//
// The NIGHT-SAFETY invariant is the headline case here: the household is
// asleep between the evening slot and the next afternoon, and a runtime
// restart at any hour must never produce a send. Everything the scheduler
// decides — is this slot due, has this ping already fired for this gap /
// day / dish — is decided by these pure functions, so "no ping at 00:30"
// is a unit test, not a hope.
import { describe, expect, it } from "vitest";
import {
  PING_TYPES,
  PULSE_CONFIG,
  encodeRatingCallback,
  isRunsLow,
  minutesOfDay,
  nextFireAt,
  parseMuteCommand,
  parseRatingCallback,
  pingConfig,
  ratingKey,
  renderMuteAck,
  renderPulseStatus,
  renderRatingPrompt,
  renderRatingTally,
  renderRunsLowNudge,
  renderTonightPing,
  runsLowKey,
  scoreForEmoji,
  shouldSend,
  slotIsDue,
  tonightKey,
  windowStart,
} from "./proactivePulse";

// Household wall clock, the way the runtime sees it (local, never UTC).
const at = (h: number, m: number, day = 31): Date => new Date(2026, 7, day, h, m, 0, 0);

describe("pulse config", () => {
  it("ships all three script-default pings enabled (A.6 row empty → gate-brief fallback)", () => {
    expect(PING_TYPES).toEqual(["runs_low", "tonight", "rating"]);
    for (const type of PING_TYPES) expect(pingConfig(type).enabled).toBe(true);
  });

  it("keeps every send time in one place, all of them afternoon/evening", () => {
    expect(pingConfig("tonight").sendAt).toBe("16:00");
    expect(pingConfig("runs_low").sendAt).toBe("17:00");
    expect(pingConfig("rating").sendAt).toBe("21:00");
    for (const type of PING_TYPES) {
      // Nothing may be configured into the household's night.
      expect(windowStart(type)).toBeGreaterThanOrEqual(minutesOfDay(at(12, 0)));
      expect(windowStart(type) + pingConfig(type).graceMinutes).toBeLessThan(22 * 60);
    }
  });
});

describe("night safety", () => {
  it("arms at 00:30 with every next fire later the same day — never now", () => {
    const now = at(0, 30);
    for (const type of PING_TYPES) {
      const next = nextFireAt(now, pingConfig(type).sendAt);
      expect(next.getTime()).toBeGreaterThan(now.getTime());
      expect(next.getDate()).toBe(31);
      expect(next.getHours()).toBeGreaterThanOrEqual(16);
    }
    expect(nextFireAt(at(0, 30), "16:00")).toEqual(at(16, 0));
  });

  it("has nothing due anywhere in the night", () => {
    for (const hour of [0, 1, 2, 3, 4, 5, 6, 7, 22, 23]) {
      for (const type of PING_TYPES) {
        expect(slotIsDue(at(hour, 30), type)).toBe(false);
      }
    }
  });

  it("never catches up: a wake-up hours after a missed slot is not due", () => {
    // Lid closed at 15:00, opened at 23:10 — the 16:00 slot is long gone and
    // stays gone. This is the bug a bare setTimeout would ship.
    expect(slotIsDue(at(23, 10), "tonight")).toBe(false);
    expect(slotIsDue(at(19, 0), "tonight")).toBe(false);
  });

  it("rolls to tomorrow only once the slot has passed", () => {
    expect(nextFireAt(at(15, 59), "16:00")).toEqual(at(16, 0));
    expect(nextFireAt(at(16, 0), "16:00")).toEqual(at(16, 0, 32)); // 1 Sep
    expect(nextFireAt(at(16, 1), "16:00")).toEqual(at(16, 0, 32));
  });

  it("is due only inside its own grace window", () => {
    expect(slotIsDue(at(15, 59), "tonight")).toBe(false);
    expect(slotIsDue(at(16, 0), "tonight")).toBe(true);
    expect(slotIsDue(at(16, 44), "tonight")).toBe(true);
    expect(slotIsDue(at(16, 45), "tonight")).toBe(false);
    expect(slotIsDue(at(17, 10), "runs_low")).toBe(true);
    expect(slotIsDue(at(21, 5), "rating")).toBe(true);
  });
});

describe("dedupe keys", () => {
  it("fires the runs-low nudge once per gap, not once per day", () => {
    const key = runsLowKey("batch-7");
    expect(shouldSend(key, undefined)).toBe(true);
    expect(shouldSend(key, key)).toBe(false);
    // A newly locked batch is a new gap — the nudge may speak again.
    expect(shouldSend(runsLowKey("batch-8"), key)).toBe(true);
    // Nothing planned at all is its own single gap.
    expect(runsLowKey(null)).toBe("batch:none");
  });

  it("keys the tonight ping by day and the rating by dish+day", () => {
    expect(shouldSend(tonightKey("2026-08-31"), tonightKey("2026-08-30"))).toBe(true);
    expect(shouldSend(tonightKey("2026-08-31"), tonightKey("2026-08-31"))).toBe(false);
    expect(ratingKey("2026-08-31", "chana-dal")).toBe("2026-08-31:chana-dal");
    expect(shouldSend(ratingKey("2026-08-31", "chana-dal"), ratingKey("2026-08-31", "ramen"))).toBe(true);
  });
});

describe("runs-low threshold (A.3 — 'planned through tomorrow')", () => {
  it("fires at one dinner left or fewer, stays quiet above it", () => {
    expect(PULSE_CONFIG.runsLowRemaining).toBe(1);
    expect(isRunsLow(0)).toBe(true);
    expect(isRunsLow(1)).toBe(true);
    expect(isRunsLow(2)).toBe(false);
    expect(isRunsLow(5)).toBe(false);
  });
});

describe("copy", () => {
  it("nudges with the pool's own words and no day assignments", () => {
    expect(renderRunsLowNudge(1)).toContain("imorgon");
    expect(renderRunsLowNudge(0)).toContain("📅");
  });

  it("names tonight's dish when the pool has exactly one left", () => {
    const single = renderTonightPing([{ title: "Chana Dal", cookTime: 40 }]);
    expect(single).toContain("Chana Dal");
    expect(single).toContain("40 min");
    const many = renderTonightPing([
      { title: "Chana Dal", cookTime: 40 },
      { title: "Ramen", cookTime: 35 },
    ]);
    expect(many).toContain("• Chana Dal");
    expect(many).toContain("• Ramen");
  });

  it("tallies both partners in one edited message", () => {
    expect(renderRatingPrompt("Chana Dal")).toContain("Chana Dal");
    const tally = renderRatingTally([
      { name: "Pelle", score: 4 },
      { name: "Wilma", score: 5 },
    ]);
    expect(tally).toContain("Pelle 😋");
    expect(tally).toContain("Wilma 🤩");
    expect(tally).toContain("📈");
  });
});

describe("rating callbacks", () => {
  it("round-trips inside Telegram's 64-byte callback_data budget", () => {
    const data = encodeRatingCallback(5, "krispig-tofu-med-sesam-och-ris");
    expect(data.length).toBeLessThanOrEqual(64);
    expect(parseRatingCallback(data)).toEqual({ score: 5, recipeId: "krispig-tofu-med-sesam-och-ris" });
  });

  it("maps the Script 8 emoji set onto the existing 1–5 rating column", () => {
    expect(scoreForEmoji("🤩")).toBe(5);
    expect(scoreForEmoji("😋")).toBe(4);
    expect(scoreForEmoji("😐")).toBe(3);
    expect(scoreForEmoji("👎")).toBe(1);
    expect(scoreForEmoji("🥔")).toBe(null);
  });

  it("refuses anything that is not one of ours", () => {
    expect(parseRatingCallback("p:l")).toBe(null);
    expect(parseRatingCallback(null)).toBe(null);
    expect(parseRatingCallback("pr:9:chana-dal")).toBe(null); // outside 1–5
    expect(parseRatingCallback("pr:5:")).toBe(null);
  });
});

describe("per-ping mute ('sluta påminna om X')", () => {
  it("mutes and unmutes each ping type by its household name", () => {
    expect(parseMuteCommand("sluta påminna om betyg")).toEqual({ kind: "set", type: "rating", muted: true });
    expect(parseMuteCommand("sluta tjata om middagstipset")).toEqual({ kind: "set", type: "tonight", muted: true });
    expect(parseMuteCommand("sluta påminna om planeringen")).toEqual({ kind: "set", type: "runs_low", muted: true });
    expect(parseMuteCommand("börja påminna om betyg igen")).toEqual({ kind: "set", type: "rating", muted: false });
    expect(parseMuteCommand("stop reminding me about ratings")).toEqual({ kind: "set", type: "rating", muted: true });
  });

  it("asks instead of guessing when the ping name is not one of ours", () => {
    expect(parseMuteCommand("sluta påminna om sopsortering")).toEqual({ kind: "unknown", muted: true });
  });

  it("keeps its hands off every ordinary utterance", () => {
    for (const text of ["köp mjölk", "planera 5 dagar", "visa listan", "mindre stark nästa gång"]) {
      expect(parseMuteCommand(text)).toBe(null);
    }
  });

  it("acknowledges in the household's language", () => {
    expect(renderMuteAck("rating", true)).toContain("🤫");
    expect(renderMuteAck("rating", false)).toContain("🌱");
  });
});

describe("/pulse status (the A.6 week-one audit surface)", () => {
  it("lists every ping, its time, its mute state and its last send", () => {
    const text = renderPulseStatus({
      muted: { tonight: true },
      lastSends: { tonight: { key: "2026-08-30", at: "2026-08-30T16:00:12.000Z" } },
    });
    expect(text).toContain("16:00");
    expect(text).toContain("🤫");
    expect(text).toContain("2026-08-30");
    expect(text).toContain("21:00");
  });
});
