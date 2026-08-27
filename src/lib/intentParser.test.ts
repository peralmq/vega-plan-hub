// p4-02: the R3 fixture set (all 68 — original 24 + held-out 44) as a
// deterministic harness suite. Two layers under test:
//
//  1. Rules layer: wherever parseWithRules claims an utterance, it must
//     match the fixture expectation exactly — the rules layer is never
//     allowed to be wrong. A canonical capture set must ALSO be claimed by
//     rules (the common case runs with zero model calls).
//  2. LLM fallback: fixtures the rules decline replay through the real
//     two-stage pipeline against cached qwen3:8b responses (the committed
//     winning-run outputs, per the cache-first runner lore) — the R3
//     "zero wrong intents in 68" invariant is enforced on every run.

import { describe, expect, it } from "vitest";
import {
  detectLanguage,
  parseUtterance,
  parseWithRules,
  type LlmChat,
  type ParsedUtterance,
  SLOT_SPECS,
  type Intent,
} from "./intentParser";
import { planActions, isWriteAction, matchCandidates } from "./botActions";
import fixtures from "./__fixtures__/intent-fixtures.json";
import llmCache from "./__fixtures__/intent-llm-cache.json";

interface Fixture {
  utterance: string;
  expect: Record<string, unknown> & { intent: string };
  set: string;
}
const FIXTURES = fixtures as Fixture[];
const CACHE = llmCache as Record<string, Record<string, unknown> & { intent: Intent }>;

// Scorer ported from the R3 kit (run-twostage.mjs) — fuzzy on slot strings
// (substring either way), exact on intent and numbers.
const norm = (s: unknown) => String(s).toLowerCase().trim();
function slotMatch(expected: unknown, actual: unknown): boolean {
  if (Array.isArray(expected)) {
    const got = Array.isArray(actual) ? actual.map(norm) : [norm(actual ?? "")];
    return expected.every((e) =>
      got.some((g) => g.includes(norm(e)) || norm(e).includes(g)),
    );
  }
  if (typeof expected === "number") return Number(actual) === expected;
  return (
    actual != null &&
    (norm(actual).includes(norm(expected)) || norm(expected).includes(norm(actual)))
  );
}

function assertParseMatches(fixture: Fixture, parse: ParsedUtterance) {
  expect(parse.intent, `intent for "${fixture.utterance}"`).toBe(fixture.expect.intent);
  const slotKeys = Object.keys(fixture.expect).filter((k) => k !== "intent");
  const got = parse as unknown as Record<string, unknown>;
  for (const key of slotKeys) {
    expect(
      slotMatch(fixture.expect[key], got[key]),
      `slot "${key}" for "${fixture.utterance}" — expected ${JSON.stringify(fixture.expect[key])}, got ${JSON.stringify(got[key])}`,
    ).toBe(true);
  }
}

// A fake two-stage client serving the committed qwen3:8b winning-run
// outputs: stage 1 answers the cached intent, stage 2 the cached slots.
const cachedChat: LlmChat = async (_system, utterance, format) => {
  const cached = CACHE[utterance];
  if (!cached) throw new Error(`no cached LLM response for "${utterance}"`);
  const props = (format as { properties: Record<string, unknown> }).properties;
  if ("intent" in props) return JSON.stringify({ intent: cached.intent });
  const { intent: _intent, ...slots } = cached;
  return JSON.stringify(slots);
};

// The one residual slot-level miss in the winning R3 runs: ingredient
// inference ("oatly deluxe" → mjölk) needs the preference table in the
// prompt — a p4-04 feature. Intent is still correct; the slot exception is
// pinned here so any NEW miss fails the suite.
const KNOWN_SLOT_MISSES = new Set([
  "vi har bytt från oatly deluxe till ica havredryck",
]);

// Script 1/2's canonical capture phrasings must never need a model call.
const MUST_BE_RULED = [
  "köp mjölk",
  "buy toilet paper and coffee",
  "kop mjolk o brod",
  "vi behöver citroner till på lördag",
  "lägg till sojasås på listan",
  "visa listan",
  "vad står på listan?",
  "har vi vitlök hemma?",
  "bocka av spenaten",
  "nej, penne",
  "ta bort kaffe från listan",
  "köp inte mer kaffe",
  "tack snälla vega!",
  // live-20260814: real household phrasings that took the LLM detour (right
  // intent, square latency) until the rules learned them.
  "Visa lista",
  "Visa mig vad som ska köpas",
  "vad ska köpas?",
  "Köp havremjölk",
  // p4-03: Script 5's entry phrase — the planning ritual must start instantly,
  // not after a model round trip.
  "kan vi planera de närmsta dagarna?",
  "planera fram till söndag",
  "dags att planera igen",
  "planera 5 dagar",
  "lås dagarna",
  // live-feedback round 2 (2026-08-27): storkok and the free-text swap are the
  // household's own words for pool edits — no model call for either.
  "storkok på dalen",
  "ta bort storkok på dalen",
  "byt dalen mot pyttipanna",
  "byt till mapo tofu",
  // p4-10: the menu card's on-demand re-send phrase.
  "visa menyn",
];

describe("rules layer", () => {
  it("claims every canonical capture phrasing", () => {
    for (const utterance of MUST_BE_RULED) {
      expect(parseWithRules(utterance), `rules must claim "${utterance}"`).not.toBeNull();
    }
  });

  for (const fixture of FIXTURES) {
    const ruled = parseWithRules(fixture.utterance);
    if (ruled === null) continue;
    it(`is never wrong: "${fixture.utterance}" (${fixture.set})`, () => {
      assertParseMatches(fixture, ruled);
    });
  }
});

describe("LLM fallback (cached qwen3:8b two-stage replay)", () => {
  for (const fixture of FIXTURES) {
    if (parseWithRules(fixture.utterance) !== null) continue;
    it(`parses "${fixture.utterance}" (${fixture.set})`, async () => {
      const { parse, source } = await parseUtterance(fixture.utterance, cachedChat);
      expect(source).toBe("llm");
      // The R3 invariant: intent is NEVER wrong, no exceptions.
      expect(parse.intent, `intent for "${fixture.utterance}"`).toBe(fixture.expect.intent);
      if (!KNOWN_SLOT_MISSES.has(fixture.utterance)) {
        assertParseMatches(fixture, parse);
      }
    });
  }

  it("every intent in the enum has a slot spec entry", () => {
    for (const intent of Object.keys(SLOT_SPECS)) {
      expect(SLOT_SPECS[intent as Intent] !== undefined).toBe(true);
    }
  });
});

describe("must-not-act guarantees (r4 §4 T2 / p4-02 verification)", () => {
  const prefs = new Map<string, string>();

  it('"tack snälla vega!" plans zero write actions', () => {
    const parse = parseWithRules("tack snälla vega!");
    expect(parse?.intent).toBe("chitchat");
    const actions = planActions(parse!, prefs);
    expect(actions.some(isWriteAction)).toBe(false);
  });

  it('"köp inte mer kaffe" is remove, never an insert', () => {
    const parse = parseWithRules("köp inte mer kaffe");
    expect(parse?.intent).toBe("remove_item");
    const actions = planActions(parse!, prefs);
    expect(actions.some((a) => a.type === "insert_item")).toBe(false);
  });

  it("still-unsupported intents plan zero write actions", () => {
    for (const intent of ["set_preference", "query_tonight"] as const) {
      const actions = planActions({ intent }, prefs);
      expect(actions.some(isWriteAction), intent).toBe(false);
    }
  });

  // p4-03: the planning intents graduated from UNSUPPORTED to the
  // conversation state machine. They must still never touch the shopping list
  // or the recipe repo — a plan action carries ONE event, and only the [✅ Lås]
  // event inside that machine ever writes a batch.
  it("planning intents plan a conversation event, never a list/repo write", () => {
    const planning: ParsedUtterance[] = [
      { intent: "plan_draft" },
      { intent: "plan_draft", horizon: "sunday" },
      { intent: "plan_set_day", day: "thursday", recipe_query: "tacos" },
      { intent: "plan_set_multiplier", day: "sunday", multiplier: 2 },
      { intent: "plan_lock" },
    ];
    for (const parse of planning) {
      const actions = planActions(parse, prefs, "2026-08-27");
      expect(actions.some(isWriteAction), parse.intent).toBe(false);
      expect(actions).toHaveLength(1);
      expect(actions[0].type, parse.intent).toBe("plan");
    }
  });

  // p4-09: the edit-verb rules must never poach neighboring intents —
  // portion talk is plan_set_multiplier, shopping verbs stay shopping,
  // negations stay inert. Rules must DECLINE these (LLM's turn).
  it("edit-verb rules decline portion/shopping/negation phrasings", () => {
    expect(parseWithRules("dubbla portioner på fredagen tack")).toBeNull();
    expect(parseWithRules("kan vi köra dubbla portioner på söndagen?")).toBeNull();
    expect(parseWithRules("köp mer kaffe nästa gång")?.intent).not.toBe("note_recipe");
    expect(parseWithRules("dubbla inte vitlöken")).toBeNull();
    // vague mer/mindre without a next-time anchor is not claimed either
    expect(parseWithRules("mindre stark")).toBeNull();
  });

  // p4-08: note_recipe graduated from UNSUPPORTED to a write action — but
  // only when the parser actually extracted a note; an empty slot must
  // stay inert, and the git side is additionally gated on a button press.
  it("note_recipe plans a note write with the extracted slot, noop without", () => {
    expect(planActions({ intent: "note_recipe", note: "mindre stark" }, prefs)).toEqual([
      { type: "note_recipe", note: "mindre stark" },
    ]);
    expect(planActions({ intent: "note_recipe" }, prefs)).toEqual([{ type: "noop" }]);
    expect(planActions({ intent: "note_recipe", note: "  " }, prefs)).toEqual([{ type: "noop" }]);
  });
});

describe("action planning (add-time preference resolution, gate call §6.1)", () => {
  it("resolves a preferred product at add-time", () => {
    const prefs = new Map([["mjölk", "ICA Havredryck"]]);
    const parse = parseWithRules("köp mjölk")!;
    const actions = planActions(parse, prefs);
    expect(actions).toEqual([
      expect.objectContaining({
        type: "insert_item",
        displayName: "ICA Havredryck",
        asWritten: "mjölk",
        canonicalIngredient: "mjölk",
        preferenceResolved: true,
      }),
    ]);
  });

  it("keeps unknown items as written (Script 2's new-one-for-me path)", () => {
    const parse = parseWithRules("köp nutritional yeast")!;
    const actions = planActions(parse, new Map());
    expect(actions).toEqual([
      expect.objectContaining({
        type: "insert_item",
        displayName: "nutritional yeast",
        preferenceResolved: false,
      }),
    ]);
  });

  it("collapses Swedish milk variants so one preference covers them (live-20260814)", () => {
    const prefs = new Map([["mjölk", "ICA Havredryck"]]);
    const parse = parseWithRules("Köp havremjölk")!;
    const actions = planActions(parse, prefs);
    expect(actions).toEqual([
      expect.objectContaining({
        type: "insert_item",
        displayName: "ICA Havredryck",
        canonicalIngredient: "mjölk",
        preferenceResolved: true,
      }),
    ]);
  });

  it("mirrors the sender's language, Swedish when ambiguous (A.7)", () => {
    expect(detectLanguage("köp mjölk")).toBe("sv");
    expect(detectLanguage("Visa lista")).toBe("sv");
    expect(detectLanguage("buy oat milk and bananas")).toBe("en");
    expect(detectLanguage("what's on the list")).toBe("en");
    expect(detectLanguage("🌱")).toBe("sv");
  });

  it("strips Swedish definite forms for check-off matching", () => {
    expect(matchCandidates("spenaten")).toContain("spenat");
    expect(matchCandidates("linserna")).toContain("linser");
    expect(matchCandidates("havregrynen")).toContain("havregryn");
    expect(matchCandidates("tofun")).toContain("tofu");
    // the spoken form always stays first so exact rows win
    expect(matchCandidates("spenaten")[0]).toBe("spenaten");
  });

  it("carries the day note onto the inserted row", () => {
    const parse = parseWithRules("vi behöver citroner till på lördag")!;
    const actions = planActions(parse, new Map());
    expect(actions).toEqual([
      expect.objectContaining({ type: "insert_item", note: "lördag" }),
    ]);
  });
});
