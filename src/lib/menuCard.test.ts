// p4-10 step 1/2: the pure menu builder, snapshot-tested (chatHtml/pdfHtml)
// plus explicit assertions for the contract points a snapshot alone could
// silently regress on (the 🍱 collapse, the deep-link param names, the
// album truncation, the emoji fallback over the real corpus).

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildMenuCard, menuDishEmoji, menuDishUrl, MENU_ALBUM_LIMIT } from "./menuCard";
import { parseRecipeMarkdown, type ParsedRecipe } from "./recipeMarkdown";
import type { PoolRow } from "./planConversation";

const BASE_URL = "https://peralmq.github.io/vega-plan-hub/";

function recipe(over: Partial<ParsedRecipe> & { id: string; title: string }): ParsedRecipe {
  return {
    image: "",
    cookTime: 20,
    servings: 4,
    difficulty: "Easy",
    tags: [],
    theme: "Vegan Favorites",
    ingredients: [],
    instructions: [],
    ...over,
  };
}

const FIXTURE_RECIPES: ParsedRecipe[] = [
  recipe({ id: "mapo-tofu", title: "Mapo Tofu", image: "/recipes/mapo-tofu.webp", cookTime: 20, tags: ["Sichuan", "Spicy"] }),
  recipe({ id: "chana-dal", title: "Chana Dal", image: "/recipes/chana-dal.jpg", cookTime: 35, tags: ["Dal", "Indian"] }),
  recipe({ id: "fredagsmys-tacos", title: "Fredagsmys-tacos", image: "https://example.com/tacos.jpg", cookTime: 25, tags: ["Tacos", "Mexican"] }),
  recipe({ id: "baked-feta-pasta", title: "Baked Feta Pasta", image: "/recipes/feta-pasta.jpg", cookTime: 30, tags: ["Pasta", "Italian"] }),
  recipe({ id: "no-image-soup", title: "Mystery Soup", image: "", cookTime: 15, tags: ["Soup"] }),
];

function entries(pairs: Array<[string, number?]>): PoolRow[] {
  return pairs.map(([recipe_id, servings_multiplier], i) => ({
    id: `e${i}`,
    recipe_id,
    servings_multiplier: servings_multiplier ?? 1,
  }));
}

describe("buildMenuCard — 5-day meal-prep batch", () => {
  const card = buildMenuCard({
    batchId: "batch-123",
    startsOn: "2026-08-27",
    endsOn: "2026-08-31",
    entries: entries([
      ["mapo-tofu"],
      ["chana-dal"],
      ["chana-dal"], // the storkok pair
      ["fredagsmys-tacos"],
      ["baked-feta-pasta"],
    ]),
    recipes: FIXTURE_RECIPES,
    baseUrl: BASE_URL,
    shoppingItemCount: 19,
    shoppingSekEstimate: 487,
  });

  it("matches the chat HTML snapshot", () => {
    expect(card.chatHtml).toMatchSnapshot();
  });

  it("matches the PDF HTML snapshot", () => {
    expect(card.pdfHtml).toMatchSnapshot();
  });

  it("collapses the 🍱 pair into ONE line with a ×2 badge, never two lines", () => {
    const chanaDalLines = card.chatHtml.split("\n").filter((l) => l.includes("Chana Dal"));
    expect(chanaDalLines).toHaveLength(1);
    expect(chanaDalLines[0]).toContain("🍱 ×2");
    expect(card.chatHtml.match(/🍱 ×2/g)).toHaveLength(1);
  });

  it("headers with the Swedish day-count · date-range · meal-count line", () => {
    expect(card.chatHtml).toContain("5 dagar · 27/8–31/8 · 5 middagar");
  });

  it("every dish title links into Cook Mode with recipe + scale", () => {
    expect(card.chatHtml).toContain(
      `href="${BASE_URL}?recipe=mapo-tofu&amp;scale=1"`,
    );
    expect(card.chatHtml).toContain(
      `href="${BASE_URL}?recipe=chana-dal&amp;scale=1"`,
    );
  });

  it("carries the shopping line, the compare handoff (full batch id), and the Swedish compassion footer", () => {
    expect(card.chatHtml).toContain("🛒 19 varor · ~487 kr");
    expect(card.chatHtml).toContain("💻 Prisjämför: npm run compare -- --batch batch-123");
    expect(card.chatHtml).toContain(
      "cooked with compassion · för djuren, planeten & varandra 🐾🌍💚",
    );
  });

  it("carries the pool-model hint, never a weekday label", () => {
    expect(card.chatHtml).toContain("Ni väljer kvällens rätt när ni vill 😌");
    // Word-boundary match: "Fredagsmys-tacos" is a dish NAME that legitimately
    // contains "fredag" — the check is for a weekday used as a schedule slot.
    expect(card.chatHtml).not.toMatch(/\b(måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag)\b/i);
  });

  it("albums one photo per DISTINCT dish, in pool order, local paths made absolute", () => {
    expect(card.album).toEqual([
      { url: `${BASE_URL}recipes/mapo-tofu.webp` },
      { url: `${BASE_URL}recipes/chana-dal.jpg` },
      { url: "https://example.com/tacos.jpg" },
      { url: `${BASE_URL}recipes/feta-pasta.jpg` },
    ]);
  });

  it("PDF HTML carries the same links and photos, design-token colors, but no compare-handoff line", () => {
    expect(card.pdfHtml).toContain(`href="${BASE_URL}?recipe=mapo-tofu&amp;scale=1"`);
    expect(card.pdfHtml).toContain("#3D7A4E"); // primary token
    expect(card.pdfHtml).not.toContain("npm run compare");
  });
});

describe("buildMenuCard — a storkok pair whose two entries were scaled independently", () => {
  // The edit flow addresses pool entries individually (planConversation's
  // "multiplier" case), so a storkok pair's two rows CAN end up with
  // different multipliers. The collapsed line has only one link — it must
  // take the SAME reading planConversation's own "×N portioner" label uses
  // (max of the multipliers), so the copy and the link can never disagree.
  it("uses the max multiplier for the collapsed line's scale param", () => {
    const card = buildMenuCard({
      batchId: "batch-mixed",
      startsOn: "2026-08-27",
      endsOn: "2026-08-28",
      entries: entries([
        ["chana-dal", 1],
        ["chana-dal", 2], // only the second entry of the pair was doubled
      ]),
      recipes: FIXTURE_RECIPES,
      baseUrl: BASE_URL,
      shoppingItemCount: 5,
      shoppingSekEstimate: 100,
    });
    expect(card.chatHtml).toContain(`href="${BASE_URL}?recipe=chana-dal&amp;scale=2"`);
    expect(card.chatHtml).not.toContain("scale=1\"");
  });
});

describe("buildMenuCard — 3-day batch, no meal prep", () => {
  const card = buildMenuCard({
    batchId: "batch-456",
    startsOn: "2026-09-01",
    endsOn: "2026-09-03",
    entries: entries([["mapo-tofu"], ["chana-dal"], ["baked-feta-pasta"]]),
    recipes: FIXTURE_RECIPES,
    baseUrl: BASE_URL,
    shoppingItemCount: 10,
    shoppingSekEstimate: 250,
  });

  it("matches the chat HTML snapshot", () => {
    expect(card.chatHtml).toMatchSnapshot();
  });

  it("carries no 🍱 badge at all", () => {
    expect(card.chatHtml).not.toContain("🍱");
  });

  it("headers 3 dagar · 3 middagar", () => {
    expect(card.chatHtml).toContain("3 dagar · 1/9–3/9 · 3 middagar");
  });
});

describe("buildMenuCard — missing image falls back to placeholder.svg", () => {
  it("resolves an empty imageUrl to the absolute placeholder", () => {
    const card = buildMenuCard({
      batchId: "batch-789",
      startsOn: "2026-09-01",
      endsOn: "2026-09-01",
      entries: entries([["no-image-soup"]]),
      recipes: FIXTURE_RECIPES,
      baseUrl: BASE_URL,
      shoppingItemCount: 3,
      shoppingSekEstimate: 60,
    });
    expect(card.album).toEqual([{ url: `${BASE_URL}placeholder.svg` }]);
    expect(card.pdfHtml).toContain(`src="${BASE_URL}placeholder.svg"`);
  });
});

describe("buildMenuCard — more than 10 distinct dishes", () => {
  const manyRecipes: ParsedRecipe[] = Array.from({ length: 12 }, (_, i) =>
    recipe({ id: `dish-${i}`, title: `Dish ${i}`, image: `/recipes/dish-${i}.jpg`, cookTime: 10 + i }),
  );
  const card = buildMenuCard({
    batchId: "batch-big",
    startsOn: "2026-09-01",
    endsOn: "2026-09-12",
    entries: entries(manyRecipes.map((r): [string] => [r.id])),
    recipes: manyRecipes,
    baseUrl: BASE_URL,
    shoppingItemCount: 40,
    shoppingSekEstimate: 900,
  });

  it("truncates the ALBUM to the Telegram cap", () => {
    expect(card.album).toHaveLength(MENU_ALBUM_LIMIT);
  });

  it("never truncates the chat text or the PDF — every dish still listed", () => {
    for (const r of manyRecipes) {
      expect(card.chatHtml, r.id).toContain(`recipe=${r.id}`);
      expect(card.pdfHtml, r.id).toContain(`recipe=${r.id}`);
    }
    expect(card.chatHtml).toContain("12 middagar");
  });
});

describe("menuDishUrl", () => {
  it("always includes both recipe and scale params", () => {
    expect(menuDishUrl(BASE_URL, "mapo-tofu", 2)).toBe(`${BASE_URL}?recipe=mapo-tofu&scale=2`);
    expect(menuDishUrl(BASE_URL, "mapo-tofu", 1.5)).toBe(`${BASE_URL}?recipe=mapo-tofu&scale=1.5`);
  });
});

describe("menuDishEmoji — property test over the real shipped corpus", () => {
  const RECIPES: ParsedRecipe[] = readdirSync(join(process.cwd(), "src/data/recipes"))
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .sort()
    .map((f) => parseRecipeMarkdown(readFileSync(join(process.cwd(), "src/data/recipes", f), "utf8"), f))
    .filter((r): r is ParsedRecipe => r !== null);

  it("every shipped recipe resolves to exactly one non-empty emoji", () => {
    expect(RECIPES.length).toBeGreaterThan(0);
    for (const r of RECIPES) {
      const emoji = menuDishEmoji(r.tags);
      expect(typeof emoji, r.id).toBe("string");
      expect(emoji.length, r.id).toBeGreaterThan(0);
    }
  });

  it("a Dal-tagged recipe gets 🍛, never the 🌱 fallback", () => {
    const dal = RECIPES.find((r) => r.tags.includes("Dal"));
    expect(dal).toBeDefined();
    expect(menuDishEmoji(dal!.tags)).toBe("🍛");
  });

  it("an untagged dish falls back to 🌱", () => {
    expect(menuDishEmoji([])).toBe("🌱");
    expect(menuDishEmoji(["Vegan", "Budget"])).toBe("🌱");
  });
});
