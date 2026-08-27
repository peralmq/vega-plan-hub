// p4-10: Veckans meny — ONE pure, deterministic builder over a locked
// batch's pool + the recipe corpus. Produces the Telegram media-group album
// spec, the chat menu message's HTML, and the menu PDF's HTML from the same
// per-meal collapse/emoji/link logic, so the three deliverables can never
// disagree about what's actually in the pool. Impurity (the Telegram
// album/document sends, the Playwright PDF render) lives entirely in
// bot/menu.ts and bot/menuPdf.ts — this module touches neither network nor
// filesystem, which is what makes it snapshot-testable.
//
// design.spec "Pool over calendar": a meal list with counts, no weekday
// lines — the 🍱 ×N badge collapses same-recipe entries into ONE line
// (never two), reusing planConversation's `poolLines` so the chat draft,
// the lock announcement and this card can never read the pool differently.
// design.spec "Cook Mode deep links" (p4-11): every dish title links to
// `<baseUrl>?recipe=<id>&scale=<multiplier>`.

import type { ParsedRecipe } from "./recipeMarkdown";
import { poolLines, type PoolRow } from "./planConversation";
import { daysBetween } from "./planDraft";

export interface MenuBatchInput {
  /** Used only for the 💻 compare-handoff line — compare/cli.ts's --batch
   * takes exact ids only (no prefix matching), so the full id is printed. */
  batchId: string;
  startsOn: string; // yyyy-MM-dd
  endsOn: string; // yyyy-MM-dd
  entries: PoolRow[];
  recipes: ParsedRecipe[];
  /** The deployed Pages base, trailing slash — Cook Mode deep links and
   * local recipe image resolution both hang off this. */
  baseUrl: string;
  shoppingItemCount: number;
  shoppingSekEstimate: number;
}

export interface MenuPhoto {
  url: string;
}

export interface MenuCard {
  album: MenuPhoto[];
  chatHtml: string;
  pdfHtml: string;
}

// Telegram's sendMediaGroup hard cap (2..10 items per call). Distinct dishes
// beyond this are dropped from the ALBUM only — the text and PDF always
// list every dish.
export const MENU_ALBUM_LIMIT = 10;

const PLACEHOLDER_PATH = "/placeholder.svg";

// Local recipe images ("/recipes/x.webp") only resolve on the deployed
// Pages origin — Telegram fetches album/PDF photos itself, so a
// root-relative path would 404. A missing/blank imageUrl falls back to the
// same placeholder the web app uses (public/placeholder.svg,
// src/components/recipe/RecipeImage.tsx), also made absolute.
function absoluteImageUrl(src: string | undefined, baseUrl: string): string {
  const path = src && src.trim() ? src : PLACEHOLDER_PATH;
  if (/^https?:\/\//i.test(path)) return path;
  const rel = path.startsWith("/") ? path : `/${path}`;
  return baseUrl.replace(/\/$/, "") + rel;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Tag→emoji, its own small table with a 🌱 fallback (step 2 of the plan) —
// deliberately NOT planConversation's `dishEmoji`, whose fallback (🥘) also
// doubles as a real mapped emoji there (Casserole), so "nothing matched"
// would be indistinguishable from "matched Casserole". 🌱 never appears as
// a specific-tag emoji below, so it can only ever mean "no tag matched".
const MENU_TAG_EMOJI: Array<[string, string]> = [
  ["Tacos", "🌮"], ["Sushi", "🍣"], ["Noodles", "🍜"], ["Pasta", "🍝"],
  ["Soup", "🍲"], ["Stew", "🍲"], ["Dal", "🍛"], ["Lentil", "🍛"],
  ["Indian", "🍛"], ["Casserole", "🥘"], ["One-Pot", "🥘"], ["Chickpea", "🧆"],
  ["Paneer", "🧀"], ["Spicy", "🌶"], ["BBQ", "🍢"], ["Mexican", "🌮"],
  ["Italian", "🍝"], ["Sichuan", "🥢"], ["Chinese", "🥢"], ["Japanese", "🍣"],
  ["Vietnamese", "🍜"], ["Saffron", "🌾"],
];

export function menuDishEmoji(tags: string[]): string {
  for (const [tag, emoji] of MENU_TAG_EMOJI) if (tags.includes(tag)) return emoji;
  return "🌱";
}

function formatDayMonth(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}/${m}`;
}

// design.spec "Cook Mode deep links": `?recipe=<id>&scale=<multiplier>` on
// the deployed base. Always includes `scale` (unlike planConversation's
// `cookModeUrl`, which omits it at 1×) — the menu card's contract states
// the full param pair on every dish title.
export function menuDishUrl(baseUrl: string, recipeId: string, scale: number): string {
  const params = new URLSearchParams({ recipe: recipeId, scale: String(scale) });
  return `${baseUrl}?${params.toString()}`;
}

interface MenuDishLine {
  recipeId: string;
  title: string;
  emoji: string;
  cookTime?: number;
  image?: string;
  url: string;
  /** 1 = solo dinner, 2+ = the 🍱 meal-prep pair/group, one line either way. */
  prepCount: number;
}

function dishLines(input: MenuBatchInput): MenuDishLine[] {
  const { entries, recipes, baseUrl } = input;
  return poolLines(entries, recipes).map((line) => {
    const recipe = recipes.find((r) => r.id === line.recipeId);
    // A storkok pair's two entries CAN end up with different multipliers
    // (the edit flow addresses each pool entry independently — see
    // planConversation.ts's "multiplier" case). The collapsed line has
    // only one link, so it takes the same max-of-multipliers reading
    // planConversation's own poolLineText uses for the "×N portioner"
    // label, so the copy and the link scale can never disagree.
    const scale = Math.max(...line.multipliers, 1);
    return {
      recipeId: line.recipeId,
      title: line.title,
      emoji: menuDishEmoji(recipe?.tags ?? []),
      cookTime: recipe?.cookTime,
      image: recipe?.image,
      url: menuDishUrl(baseUrl, line.recipeId, scale),
      prepCount: line.count,
    };
  });
}

const COMPASSION_SV = "cooked with compassion · för djuren, planeten & varandra 🐾🌍💚";

function buildChatHtml(input: MenuBatchInput, dishes: MenuDishLine[]): string {
  const days = daysBetween(input.startsOn, input.endsOn) + 1;
  const dateRange = `${formatDayMonth(input.startsOn)}–${formatDayMonth(input.endsOn)}`;
  const dishRows = dishes.map((d) => {
    const cook = d.cookTime != null ? ` ⏰ ${d.cookTime} min` : "";
    const prep = d.prepCount > 1 ? ` · 🍱 ×${d.prepCount}` : "";
    return `${d.emoji} <a href="${escapeHtml(d.url)}"><b>${escapeHtml(d.title)}</b></a>${cook}${prep}`;
  });
  return [
    "🌱✨ <b>VECKANS MENY</b> ✨🌱",
    `${days} dagar · ${dateRange} · ${input.entries.length} middagar`,
    "",
    ...dishRows,
    "",
    "Ni väljer kvällens rätt när ni vill 😌",
    `🛒 ${input.shoppingItemCount} varor · ~${Math.round(input.shoppingSekEstimate)} kr`,
    // p5-05 deferred step 4: the compare handoff. compare/cli.ts's --batch
    // matches ids exactly (no prefix support — see compare/batchFetch.ts's
    // resolveBatchId), so the full id is printed, not a short prefix.
    `💻 Prisjämför: npm run compare -- --batch ${input.batchId}`,
    COMPASSION_SV,
  ].join("\n");
}

function buildPdfHtml(input: MenuBatchInput, dishes: MenuDishLine[]): string {
  const days = daysBetween(input.startsOn, input.endsOn) + 1;
  const dateRange = `${formatDayMonth(input.startsOn)}–${formatDayMonth(input.endsOn)}`;
  const rows = dishes
    .map((d) => {
      const cook = d.cookTime != null ? `⏰ ${d.cookTime} min` : "";
      const prep = d.prepCount > 1 ? ` · 🍱 ×${d.prepCount}` : "";
      const photo = absoluteImageUrl(d.image, input.baseUrl);
      return `<li class="dish">
        <img class="photo" src="${escapeHtml(photo)}" alt="" />
        <div class="info">
          <a href="${escapeHtml(d.url)}">${d.emoji} <strong>${escapeHtml(d.title)}</strong></a>
          <div class="meta">${cook}${prep}</div>
        </div>
      </li>`;
    })
    .join("");

  // Design tokens (docs/specs/design.spec.md, Visual identity) — light mode
  // only, per the plan's Context: "fine as the single committed look for
  // print". Self-contained (no external stylesheet), matching Playwright's
  // `page.setContent`/`page.pdf()` usage in bot/menuPdf.ts.
  return `<!doctype html>
<html lang="sv"><head><meta charset="utf-8" /><title>Veckans meny</title>
<style>
  :root {
    --background: #FAF7F0; --foreground: #1A1A17; --card: #FFFEF9;
    --border: #E4DFD2; --muted: #6B675C; --primary: #3D7A4E;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px; background: var(--background); color: var(--foreground);
    font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
  }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 32px; }
  h1 { margin: 0 0 4px; font-size: 28px; }
  .sub { color: var(--muted); margin-bottom: 24px; }
  ul.dishes { list-style: none; margin: 0; padding: 0; }
  li.dish { display: flex; gap: 16px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border); }
  li.dish:last-child { border-bottom: none; }
  .photo { width: 72px; height: 72px; object-fit: cover; border-radius: 12px; border: 1px solid var(--border); }
  .info a { color: var(--foreground); text-decoration: none; }
  .info strong { font-size: 17px; }
  .meta { color: var(--muted); font-size: 14px; margin-top: 2px; }
  .hint { margin-top: 20px; font-size: 15px; }
  .footer { margin-top: 24px; color: var(--muted); font-size: 13px; border-top: 1px solid var(--border); padding-top: 16px; }
</style></head>
<body><div class="card">
  <h1>🌱✨ Veckans meny ✨🌱</h1>
  <div class="sub">${days} dagar · ${dateRange} · ${input.entries.length} middagar</div>
  <ul class="dishes">${rows}</ul>
  <div class="hint">Ni väljer kvällens rätt när ni vill 😌</div>
  <div class="footer">🛒 ${input.shoppingItemCount} varor · ~${Math.round(input.shoppingSekEstimate)} kr<br/>${COMPASSION_SV}</div>
</div></body></html>`;
}

export function buildMenuCard(input: MenuBatchInput): MenuCard {
  const dishes = dishLines(input);
  // One photo per DISTINCT dish (poolLines already collapsed the pool), so
  // slicing here is exactly ">10 distinct dishes truncates the album only".
  const album: MenuPhoto[] = dishes
    .slice(0, MENU_ALBUM_LIMIT)
    .map((d) => ({ url: absoluteImageUrl(d.image, input.baseUrl) }));
  return {
    album,
    chatHtml: buildChatHtml(input, dishes),
    pdfHtml: buildPdfHtml(input, dishes),
  };
}
