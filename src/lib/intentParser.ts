// Intent parser seam (p4-02): rules first, LLM fallback — the R3 winner's
// two-stage harness (spikes/r3-nlu-bakeoff/run-twostage.mjs) graduated into
// the unit-testable core. The rules layer is deterministic and must never be
// wrong (enforced by intentParser.test.ts over all 68 R3 fixtures); anything
// it can't confidently match falls through to the injected LLM client
// (qwen3:8b via Ollama on the household machine — the impure half lives in
// bot/nlu.ts). Every deterministic sub-problem removed from the model
// converts an error class to zero — the R3 harness thesis.

export const INTENTS = [
  "add_item", "remove_item", "check_item", "show_list", "correct_last",
  "set_preference", "query_tonight", "plan_draft", "plan_set_day",
  "plan_set_multiplier", "plan_lock", "note_recipe", "chitchat",
] as const;
export type Intent = (typeof INTENTS)[number];

export interface ParsedUtterance {
  intent: Intent;
  items?: string[];
  quantity?: string;
  note?: string;
  context?: string;
  replacement?: string;
  ingredient?: string;
  product?: string;
  query?: string;
  day?: string;
  horizon?: string;
  day_offset?: number;
  multiplier?: number;
  recipe_query?: string;
}

// ---------------------------------------------------------------------------
// Two-stage LLM contract (ported verbatim from the R3 winning recipe; the
// prompts ARE the model contract — change them only with a fixture rerun).

export const CLASSIFY_PROMPT = `Classify ONE message from a Swedish/English vegan household
meal-planning chat into exactly one intent:
add_item = put grocery item(s) on the shopping list (incl. "vi behöver X",
  even when a day is mentioned: "till på lördag" is just a note)
remove_item = take item(s) off the list ("ta bort", "skippa", "köp inte
  mer X", "vi behöver inte mer X")
check_item = mark item(s) as bought/done ("bocka av", "tog X nyss",
  "check off")
show_list = show the list or ask what is on it / at home ("har vi X
  hemma/kvar?", "står X på listan?")
correct_last = user corrects their own previous message ("nej, X",
  "jag menade X", "oj fel")
set_preference = household switched brand/product for an ingredient
  ("vi har bytt från X till Y", "vi tar X istället för Y nu")
query_tonight = ask what's for dinner (tonight or another day)
plan_draft = start planning days ahead ("planera", with/without horizon)
plan_set_day = change which DISH is cooked on a day ("byt DAG till DISH",
  "kör DISH på DAG istället")
plan_set_multiplier = scale a day's portions ("dubbla portioner på DAG")
plan_lock = lock the drafted days ("lås dagarna/veckan", "lock it in")
note_recipe = feedback/adjustment on a dish for next time ("mindre salt
  nästa gång")
chitchat = greetings/thanks/banter, no action.
When unsure, prefer chitchat over guessing a destructive action.`;

interface SlotSpec {
  prompt: string;
  schema: Record<string, unknown>;
  required: string[];
}

const DAYS = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

export const SLOT_SPECS: Record<Intent, SlotSpec | null> = {
  add_item: {
    prompt: `Extract slots for add_item. items: the grocery item(s), lowercase
singular-ish Swedish when the user wrote Swedish, fix missing diacritics
("mjolk" -> "mjölk"). quantity: only if a number/amount is stated. note: only
if a day/occasion is attached ("till på lördag" -> "lördag"). context: only if
a dish/purpose is attached ("till pannkakorna" -> "pannkakorna").`,
    schema: {
      items: { type: "array", items: { type: "string" } },
      quantity: { type: "string" }, note: { type: "string" }, context: { type: "string" },
    },
    required: ["items"],
  },
  remove_item: {
    prompt: `Extract slots for remove_item. items: the item(s) to remove, lowercase Swedish, diacritics fixed.`,
    schema: { items: { type: "array", items: { type: "string" } } },
    required: ["items"],
  },
  check_item: {
    prompt: `Extract slots for check_item. items: the item(s) marked as bought/done, lowercase singular-ish Swedish, diacritics fixed.`,
    schema: { items: { type: "array", items: { type: "string" } } },
    required: ["items"],
  },
  show_list: {
    prompt: `Extract slots for show_list. query: the specific item asked about, if any ("har vi X hemma?" -> X). Omit for a plain "show the list".`,
    schema: { query: { type: "string" } },
    required: [],
  },
  correct_last: {
    prompt: `Extract slots for correct_last. replacement: what the user now wants instead.`,
    schema: { replacement: { type: "string" } },
    required: ["replacement"],
  },
  set_preference: {
    prompt: `Extract slots for set_preference. ingredient: the generic ingredient category the switch is about (e.g. oat-drink brands -> "mjölk"; cheese brands -> "ost"). product: the NEW product/brand.`,
    schema: { ingredient: { type: "string" }, product: { type: "string" } },
    required: ["ingredient", "product"],
  },
  query_tonight: {
    prompt: `Extract slots for query_tonight. day_offset: 0 for today/tonight (or omit), 1 for tomorrow, etc.`,
    schema: { day_offset: { type: "integer" } },
    required: [],
  },
  plan_draft: {
    prompt: `Extract slots for plan_draft. horizon: the end day as an ENGLISH weekday name, only if stated ("fram till söndag" -> "sunday").`,
    schema: { horizon: { type: "string" } },
    required: [],
  },
  plan_set_day: {
    prompt: `Extract slots for plan_set_day. day: ENGLISH weekday name
(måndag=monday tisdag=tuesday onsdag=wednesday torsdag=thursday
fredag=friday lördag=saturday söndag=sunday). recipe_query: the dish.`,
    schema: { day: { enum: DAYS }, recipe_query: { type: "string" } },
    required: ["day", "recipe_query"],
  },
  plan_set_multiplier: {
    prompt: `Extract slots for plan_set_multiplier. day: ENGLISH weekday name
(måndag=monday tisdag=tuesday onsdag=wednesday torsdag=thursday
fredag=friday lördag=saturday söndag=sunday). multiplier: the integer factor ("dubbla" -> 2, "tre gånger" -> 3).`,
    schema: { day: { enum: DAYS }, multiplier: { type: "integer" } },
    required: ["day", "multiplier"],
  },
  plan_lock: null,
  note_recipe: {
    prompt: `Extract slots for note_recipe. note: the adjustment, concise ("mindre stark nästa gång bara" -> "mindre stark").`,
    schema: { note: { type: "string" } },
    required: ["note"],
  },
  chitchat: null,
};

// ---------------------------------------------------------------------------
// Deterministic post-processing (the weekday-override trick: LLMs
// false-friend Swedish weekdays — "torsdag" → tuesday — but the weekday is
// regexable from the utterance, so text beats model).

const DAY_MAP: Record<string, string> = {
  "måndag": "monday", "tisdag": "tuesday", "onsdag": "wednesday",
  "torsdag": "thursday", "fredag": "friday", "lördag": "saturday",
  "söndag": "sunday",
  "mandag": "monday", "lordag": "saturday", "sondag": "sunday",
};

function daysInText(utterance: string): string[] {
  const low = utterance.toLowerCase();
  const found = new Set<string>();
  for (const [sv, en] of Object.entries(DAY_MAP)) if (low.includes(sv)) found.add(en);
  for (const en of DAYS) if (low.includes(en)) found.add(en);
  return [...found];
}

export function postProcess(
  parse: Record<string, unknown>,
  utterance: string,
): ParsedUtterance {
  const obj: Record<string, unknown> = { ...parse };
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === "" || v == null || (Array.isArray(v) && v.length === 0)) delete obj[k];
  }
  for (const k of ["day", "horizon"]) {
    if (typeof obj[k] === "string") {
      const low = (obj[k] as string).toLowerCase().trim();
      obj[k] = DAY_MAP[low] ?? low;
    }
  }
  const days = daysInText(utterance);
  if (days.length === 1) {
    for (const k of ["day", "horizon"]) {
      if (obj[k] != null && obj[k] !== days[0]) obj[k] = days[0];
    }
  }
  for (const k of ["day_offset", "multiplier"]) {
    if (typeof obj[k] === "string" && /^\d+$/.test(obj[k] as string)) {
      obj[k] = Number(obj[k]);
    }
  }
  return obj as unknown as ParsedUtterance;
}

// ---------------------------------------------------------------------------
// Rules layer: high-frequency capture phrasings parsed with zero model calls.
// Conservative on purpose — a rule either matches with certainty or returns
// null and lets the LLM take it. Order matters: negation traps ("köp inte mer
// kaffe") must be claimed by remove_item before any add_item pattern sees them.

// One-thumb store typing drops diacritics ("kop mjolk o brod"); repair the
// common grocery words deterministically instead of hoping the model does.
const DIACRITIC_REPAIR: Record<string, string> = {
  mjolk: "mjölk", brod: "bröd", rodbetor: "rödbetor", agg: "ägg",
  jast: "jäst", vitlok: "vitlök", lok: "lök", artor: "ärtor",
  kikartor: "kikärtor", sotpotatis: "sötpotatis", ingefara: "ingefära",
  gronsaker: "grönsaker", blomkal: "blomkål", rakor: "räkor",
  gronkal: "grönkål", nudlar: "nudlar", bonor: "bönor", linsror: "linser",
};

function repairDiacritics(item: string): string {
  return item
    .split(/\s+/)
    .map((w) => DIACRITIC_REPAIR[w.toLowerCase()] ?? w)
    .join(" ");
}

const ITEM_SPLIT = /\s+(?:och|and|o|&)\s+|\s*,\s*/i;

function splitItems(phrase: string): string[] {
  return phrase
    .split(ITEM_SPLIT)
    .map((s) => repairDiacritics(s.trim().replace(/[.!?]+$/, "")))
    .filter(Boolean);
}

const SWEDISH_DAY = Object.keys(DAY_MAP).join("|");

// Peel " till (på) <day>" → note, or " till <dish>" → context, off the tail
// of an add_item phrase ("citroner till på lördag", "mjölk till pannkakorna").
function peelTail(phrase: string): { phrase: string; note?: string; context?: string } {
  const dayMatch = phrase.match(
    new RegExp(`^(.+?)\\s+till\\s+(?:på\\s+)?(${SWEDISH_DAY})(?:en)?\\s*$`, "i"),
  );
  if (dayMatch) return { phrase: dayMatch[1], note: dayMatch[2].toLowerCase() };
  const ctxMatch = phrase.match(/^(.+?)\s+till\s+(\S.*)$/i);
  if (ctxMatch) return { phrase: ctxMatch[1], context: ctxMatch[2] };
  return { phrase };
}

const QUANTITY_UNITS =
  "st|kg|hg|g|l|dl|cl|ml|liter|paket|burkar?|flaskor?|påsar?|pasar?|förp|packs?|cans?|jars?|bottles?|bags?";

export function parseWithRules(utterance: string): ParsedUtterance | null {
  const text = utterance.trim().replace(/\s+/g, " ");
  const low = text.toLowerCase();
  let m: RegExpMatchArray | null;

  // chitchat: greetings/thanks/banter — must win over everything (the
  // must-not-act guarantee for "tack snälla vega!").
  if (
    /^(tack|thanks|thank you|hej|hallå|halla|tja|tjena|god morgon|godmorgon|god kväll|god natt|good morning|good night|haha|hehe|hihi|lol|yay|❤️|🙏|😂|🎉)(?=$|[\s,.!?])/iu.test(low) ||
    /^[\p{Emoji}\p{P}\s]+$/u.test(text)
  ) {
    return { intent: "chitchat" };
  }

  // correct_last: "nej, penne" / "nej jag menade X" / "oj fel, skulle vara X"
  if ((m = text.match(/^nej,?\s+(?:jag menade\s+)?(.+)$/i)))
    return { intent: "correct_last", replacement: m[1].replace(/[.!?]+$/, "") };
  if ((m = text.match(/^(?:oj,?\s+)?fel,?\s*(?:skulle vara\s+)?(.+)$/i)))
    return { intent: "correct_last", replacement: m[1].replace(/[.!?]+$/, "") };
  if ((m = text.match(/^(?:jag )?menade\s+(.+)$/i)))
    return { intent: "correct_last", replacement: m[1].replace(/[.!?]+$/, "") };

  // remove_item — including the negation traps, BEFORE any add pattern.
  if ((m = text.match(/^ta bort\s+(.+?)(?:\s+från listan)?\s*$/i)))
    return { intent: "remove_item", items: splitItems(m[1]) };
  if ((m = text.match(/^skippa\s+(.+)$/i)))
    return { intent: "remove_item", items: splitItems(m[1]) };
  if ((m = text.match(/^(?:köp|kop|buy)\s+inte\s+(?:mer\s+)?(.+)$/i)))
    return { intent: "remove_item", items: splitItems(m[1]) };
  if ((m = text.match(/^(?:vi behöver|vi behover|we need)\s+inte\s+(?:mer\s+)?(.+)$/i)))
    return { intent: "remove_item", items: splitItems(m[1]) };
  if ((m = text.match(/^(?:we )?(?:don'?t|do not) need\s+(?:more\s+)?(.+)$/i)))
    return { intent: "remove_item", items: splitItems(m[1]) };

  // check_item: "bocka av X", "check (off) X", "tog X nyss"
  if ((m = text.match(/^bocka av\s+(.+)$/i)))
    return { intent: "check_item", items: splitItems(m[1]) };
  if ((m = text.match(/^check(?:\s+off)?\s+(?:the\s+)?(.+)$/i)))
    return { intent: "check_item", items: splitItems(m[1]) };
  if ((m = text.match(/^tog\s+(.+?)\s+nyss$/i)))
    return { intent: "check_item", items: splitItems(m[1]) };

  // show_list: the plain forms and the "do we have X?" lookups.
  if (/^(visa listan|listan|show (?:me )?(?:the )?list|what'?s on the list\??|vad står på listan\??)$/i.test(low))
    return { intent: "show_list" };
  if ((m = text.match(/^har vi\s+(?:kvar\s+)?(.+?)(?:\s+(?:hemma|kvar))?\s*\??$/i)))
    return { intent: "show_list", query: repairDiacritics(m[1]) };
  if ((m = text.match(/^står\s+(.+?)\s+(?:med\s+)?på listan\s*\??$/i)))
    return { intent: "show_list", query: repairDiacritics(m[1]) };

  // plan_lock: exact ritual phrases only.
  if (/^(lås (dagarna|veckan)|lock it in)\s*!?$/i.test(low))
    return { intent: "plan_lock" };

  // add_item: "köp/buy/get X", "vi behöver X", "lägg till X", "3 burkar X".
  // Negations were consumed above, but guard anyway — a rules-layer add must
  // never fire on an "inte" phrase.
  if (!/\binte\b|\bdon'?t\b/i.test(low)) {
    let phrase: string | null = null;
    if ((m = text.match(/^(?:köp|kop|buy|get)\s+(?:också\s+)?(.+)$/i))) phrase = m[1];
    else if ((m = text.match(/^(?:vi behöver|vi behover|we need)\s+(?:mer\s+|more\s+)?(.+)$/i))) phrase = m[1];
    else if ((m = text.match(/^(?:kan du\s+)?lägg(?:a)? till\s+(.+?)(?:\s+på listan)?(?:\s+också)?\s*$/i))) phrase = m[1];
    if (phrase) {
      const peeled = peelTail(phrase);
      const parse: ParsedUtterance = {
        intent: "add_item",
        items: splitItems(peeled.phrase),
      };
      if (peeled.note) parse.note = peeled.note;
      if (peeled.context) parse.context = peeled.context;
      return parse.items && parse.items.length > 0 ? parse : null;
    }
    if ((m = text.match(new RegExp(`^(\\d+)\\s+(${QUANTITY_UNITS})\\s+(.+)$`, "i")))) {
      return { intent: "add_item", items: splitItems(m[3]), quantity: m[1] };
    }
  }

  return null; // not confident — the LLM's turn
}

// ---------------------------------------------------------------------------
// Full pipeline: rules, then the injected two-stage LLM client. The chat
// function is Ollama's structured-output shape ((system, user, format) →
// message content) so tests can replay cached responses byte-for-byte.

export type LlmChat = (
  system: string,
  user: string,
  format: Record<string, unknown>,
) => Promise<string>;

export async function parseWithLlm(
  utterance: string,
  chat: LlmChat,
): Promise<ParsedUtterance> {
  const stage1 = await chat(CLASSIFY_PROMPT, utterance, {
    type: "object",
    properties: { intent: { enum: INTENTS } },
    required: ["intent"],
  });
  const intent = JSON.parse(stage1).intent as Intent;
  const spec = SLOT_SPECS[intent];
  if (!spec) return postProcess({ intent }, utterance);
  const stage2 = await chat(spec.prompt, utterance, {
    type: "object",
    properties: spec.schema,
    required: spec.required,
  });
  return postProcess({ intent, ...JSON.parse(stage2) }, utterance);
}

export async function parseUtterance(
  utterance: string,
  chat: LlmChat,
): Promise<{ parse: ParsedUtterance; source: "rules" | "llm" }> {
  const ruled = parseWithRules(utterance);
  if (ruled) return { parse: ruled, source: "rules" };
  return { parse: await parseWithLlm(utterance, chat), source: "llm" };
}
