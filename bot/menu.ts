// p4-10 step 4: the Swedish menu card's delivery — album → HTML menu
// message → PDF document, after a lock or on demand ("visa menyn" /
// [📋 Meny]). The pure per-meal logic (links, emoji, collapse, HTML) lives
// in src/lib/menuCard.ts and is snapshot-tested there; this file is the
// only place that touches Telegram (album/document) or the Playwright PDF
// render — the same Supabase/Telegram split as bot/planning.ts.
import { buildMenuCard } from "../src/lib/menuCard";
import {
  cookModeBaseUrl,
  encodePlanCallback,
  type LockedBatchRow,
  type PlanStore,
} from "../src/lib/planConversation";
import { renderMenuPdf } from "./menuPdf";
import type { InlineButton, TelegramApi } from "./telegram";

export interface MenuTarget {
  batchId: string;
  startsOn: string;
  endsOn: string;
}

// The batch the household means by "the menu": the one covering today, same
// fallback the p4-03 show_list case uses — else the most recently locked
// one. The latter also covers the "right after a lock" case, since a fresh
// batch's range can start AFTER today (an earlier batch still runs), so
// loadCurrentBatch would miss it.
export async function resolveMenuTarget(
  store: PlanStore,
  todayIso: string,
): Promise<MenuTarget | null> {
  const current = await store.loadCurrentBatch(todayIso);
  if (current) {
    return { batchId: current.batch.id, startsOn: current.batch.starts_on, endsOn: current.batch.ends_on };
  }
  const batches = await store.loadLockedBatches();
  const latest = batches.reduce<LockedBatchRow | null>(
    (best, b) => (!best || b.starts_on > best.starts_on ? b : best),
    null,
  );
  return latest ? { batchId: latest.id, startsOn: latest.starts_on, endsOn: latest.ends_on } : null;
}

// design.spec "Cook Mode deep links": Plan Mode is the recipe-library
// browsing screen (Screens table), so [📖 Recept] opens that; [🛒
// Inköpslista] and [✏️ Byt en dag] reuse the EXISTING p4-03 callback
// vocabulary verbatim (p:sl / p:e) so they dispatch through the same
// handlePlanEvent path the lock announcement's own buttons already use.
function menuButtons(): InlineButton[][] {
  return [
    [{ text: "📖 Recept", url: `${cookModeBaseUrl()}plan` }],
    [
      { text: "🛒 Inköpslista", callback_data: encodePlanCallback({ kind: "show_list" }) },
      { text: "✏️ Byt en dag", callback_data: encodePlanCallback({ kind: "edit_menu" }) },
    ],
  ];
}

// `renderPdf` is injected (defaulting to the real Playwright render) so the
// wiring tests here don't have to pay for a chromium launch per case; the
// real render is covered on its own in bot/menuPdf.test.ts.
export async function sendMenuCard(
  store: PlanStore,
  tg: TelegramApi,
  chatId: number,
  target: MenuTarget,
  renderPdf: (html: string) => Promise<Buffer> = renderMenuPdf,
): Promise<void> {
  const [entries, itemRows] = await Promise.all([
    store.loadBatchEntries(target.batchId),
    store.loadBatchItems(target.batchId),
  ]);
  const sek = await store.estimateSek(itemRows.map((r) => r.display_name));
  const card = buildMenuCard({
    batchId: target.batchId,
    startsOn: target.startsOn,
    endsOn: target.endsOn,
    entries,
    recipes: store.recipes(),
    baseUrl: cookModeBaseUrl(),
    shoppingItemCount: itemRows.length,
    shoppingSekEstimate: sek,
  });

  // Album → menu message → PDF, in that order (this plan's Goal/Steps).
  // Telegram's sendMediaGroup rejects fewer than 2 items (a real case: a
  // batch that is entirely one storkok/meal-prep dish has exactly ONE
  // distinct photo) — sendPhoto covers that one, sendMediaGroup the rest,
  // and 0 photos sends nothing.
  if (card.album.length === 1) await tg.sendPhoto(chatId, card.album[0].url);
  else if (card.album.length > 1) await tg.sendMediaGroup(chatId, card.album);
  await tg.sendMessage(chatId, card.chatHtml, menuButtons(), "HTML");
  const pdf = await renderPdf(card.pdfHtml);
  await tg.sendDocument(chatId, "veckans-meny.pdf", pdf);
}
