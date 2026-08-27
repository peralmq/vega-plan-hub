// p4-03: the Supabase/Telegram side of the planning conversation. All the
// logic lives in src/lib/planConversation.ts (pure, port-driven, replayed by
// the Script 5 fixture test); this file is only the adapter — every method
// here is one query, and the shared-user session keeps RLS active exactly as
// tech.spec "Chat assistant" requires (no service-role key anywhere).
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LockedBatchRow,
  PlanChat,
  PlanStore,
  PoolRow,
  BatchRange,
} from "../src/lib/planConversation";
import {
  estimateBatchCostSEK,
  type ExistingItemRow,
  type GeneratedShoppingItem,
  type ShoppingReconciliation,
} from "../src/lib/planShopping";
import type { DraftEntry } from "../src/lib/planDraft";
import type { ParsedRecipe } from "../src/lib/recipeMarkdown";
import { currentPreferenceMap } from "../src/lib/productPreferences";
import { MathemPriceService } from "../src/services/mathemPriceService";
import type { InlineButton, TelegramApi } from "./telegram";

export interface PlanOwner {
  userId: string;
  familyMemberId: string | null;
}

const POOL_COLUMNS = "id, recipe_id, servings_multiplier";
const ITEM_COLUMNS = "id, canonical_ingredient, display_name, quantity, unit, checked_at";

function must(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`${what} failed: ${error.message}`);
}

export function makePlanStore(
  supa: SupabaseClient,
  owner: PlanOwner,
  recipes: ParsedRecipe[],
): PlanStore {
  const { userId, familyMemberId } = owner;

  // The open draft: pool rows that belong to no batch and carry no date.
  // (The p4-01 backfill left historical rows batchless but DATED, so the
  // meal_date filter is what keeps them out of a fresh draft.)
  const draftQuery = () =>
    supa
      .from("planned_meals")
      .select(POOL_COLUMNS)
      .eq("user_id", userId)
      .is("batch_id", null)
      .is("meal_date", null);

  return {
    recipes: () => recipes,

    async ratings() {
      const { data, error } = await supa
        .from("recipe_ratings")
        .select("recipe_id, rating")
        .eq("user_id", userId);
      must(error, "ratings");
      const sums = new Map<string, { total: number; n: number }>();
      for (const row of (data ?? []) as Array<{ recipe_id: string; rating: number }>) {
        const acc = sums.get(row.recipe_id) ?? { total: 0, n: 0 };
        acc.total += row.rating;
        acc.n += 1;
        sums.set(row.recipe_id, acc);
      }
      return new Map([...sums].map(([id, acc]) => [id, acc.total / acc.n]));
    },

    async lastCooked() {
      const { data, error } = await supa
        .from("planned_meals")
        .select("recipe_id, cooked_on, meal_date, created_at")
        .eq("user_id", userId);
      must(error, "history");
      const latest = new Map<string, string>();
      for (const row of (data ?? []) as Array<{
        recipe_id: string;
        cooked_on: string | null;
        meal_date: string | null;
        created_at: string;
      }>) {
        // cooked_on is the truth in the pool model; meal_date covers the
        // pre-pool rows, created_at is the last resort.
        const when = row.cooked_on ?? row.meal_date ?? row.created_at.slice(0, 10);
        const seen = latest.get(row.recipe_id);
        if (!seen || when > seen) latest.set(row.recipe_id, when);
      }
      return latest;
    },

    async preferences() {
      const { data } = await supa
        .from("product_preferences")
        .select("canonical_ingredient, product_name, superseded_by, valid_from")
        .eq("user_id", userId)
        .is("superseded_by", null);
      return currentPreferenceMap(data ?? []);
    },

    async loadDraft(): Promise<PoolRow[]> {
      const { data, error } = await draftQuery().order("created_at").order("id");
      must(error, "load draft");
      return (data ?? []) as PoolRow[];
    },

    async loadCurrentBatch(todayIso: string) {
      const { data, error } = await supa
        .from("plan_batches")
        .select("id, starts_on, ends_on")
        .eq("user_id", userId)
        .lte("starts_on", todayIso)
        .gte("ends_on", todayIso)
        .order("starts_on")
        .limit(1);
      must(error, "load batch");
      const batch = (data ?? [])[0] as LockedBatchRow | undefined;
      if (!batch) return null;
      const { data: entries, error: entryError } = await supa
        .from("planned_meals")
        .select(POOL_COLUMNS)
        .eq("user_id", userId)
        .eq("batch_id", batch.id)
        .order("created_at")
        .order("id");
      must(entryError, "load batch pool");
      return { batch, entries: (entries ?? []) as PoolRow[] };
    },

    async loadLockedBatches(): Promise<LockedBatchRow[]> {
      const { data, error } = await supa
        .from("plan_batches")
        .select("id, starts_on, ends_on")
        .eq("user_id", userId)
        .order("starts_on");
      must(error, "load batches");
      return (data ?? []) as LockedBatchRow[];
    },

    async replaceDraft(entries: DraftEntry[]) {
      const { error: deleteError } = await supa
        .from("planned_meals")
        .delete()
        .eq("user_id", userId)
        .is("batch_id", null)
        .is("meal_date", null);
      must(deleteError, "clear draft");
      if (entries.length === 0) return;
      const { error } = await supa.from("planned_meals").insert(
        entries.map((entry) => ({
          user_id: userId,
          recipe_id: entry.recipeId,
          servings_multiplier: entry.servingsMultiplier,
          meal_date: null,
          batch_id: null,
          created_by: familyMemberId,
        })),
      );
      must(error, "insert draft");
    },

    async updateEntry(id, patch) {
      const { error } = await supa
        .from("planned_meals")
        .update(patch)
        .eq("user_id", userId)
        .eq("id", id);
      must(error, "update pool entry");
    },

    async deleteEntry(id) {
      const { error } = await supa
        .from("planned_meals")
        .delete()
        .eq("user_id", userId)
        .eq("id", id);
      must(error, "delete pool entry");
    },

    // The lock: one batch row, the pool stamped into it, and the batch's
    // recipe-derived shopping rows. Ad-hoc rows are untouched (they stay
    // batchless until shopping mode gathers them — the p4-01 gate call).
    async lockBatch(range: BatchRange, entryIds: string[], items: GeneratedShoppingItem[]) {
      const { data, error } = await supa
        .from("plan_batches")
        .insert({
          user_id: userId,
          starts_on: range.startsOn,
          ends_on: range.endsOn,
          locked_by: familyMemberId,
        })
        .select("id")
        .single();
      must(error, "lock batch");
      const batchId = (data as { id: string }).id;

      const { error: stampError } = await supa
        .from("planned_meals")
        .update({ batch_id: batchId })
        .eq("user_id", userId)
        .in("id", entryIds);
      must(stampError, "stamp pool");

      if (items.length > 0) {
        const { error: itemError } = await supa.from("shopping_list_items").insert(
          items.map((item) => ({
            user_id: userId,
            source: "recipe",
            batch_id: batchId,
            canonical_ingredient: item.canonicalIngredient,
            display_name: item.displayName,
            quantity: item.quantity,
            unit: item.unit,
            added_by: familyMemberId,
          })),
        );
        must(itemError, "generate list");
      }
      return batchId;
    },

    async loadBatchItems(batchId: string): Promise<ExistingItemRow[]> {
      const { data, error } = await supa
        .from("shopping_list_items")
        .select(ITEM_COLUMNS)
        .eq("user_id", userId)
        .eq("batch_id", batchId)
        .order("display_name");
      must(error, "load batch items");
      return (data ?? []) as ExistingItemRow[];
    },

    // Checked rows are never in deleteIds and never re-inserted (see
    // reconcileShoppingItems), so this write can only ever move quantities.
    async applyItemPlan(batchId: string, plan: ShoppingReconciliation) {
      if (plan.deleteIds.length > 0) {
        const { error } = await supa
          .from("shopping_list_items")
          .delete()
          .eq("user_id", userId)
          .in("id", plan.deleteIds);
        must(error, "prune list");
      }
      for (const update of plan.updates) {
        const { error } = await supa
          .from("shopping_list_items")
          .update({
            quantity: update.item.quantity,
            unit: update.item.unit,
            display_name: update.item.displayName,
          })
          .eq("user_id", userId)
          .eq("id", update.id);
        must(error, "update list row");
      }
      if (plan.inserts.length > 0) {
        const { error } = await supa.from("shopping_list_items").insert(
          plan.inserts.map((item) => ({
            user_id: userId,
            source: "recipe",
            batch_id: batchId,
            canonical_ingredient: item.canonicalIngredient,
            display_name: item.displayName,
            quantity: item.quantity,
            unit: item.unit,
            added_by: familyMemberId,
          })),
        );
        must(error, "extend list");
      }
    },

    // Still the mock price service (plan step 4 says that is fine); the real
    // numbers arrive with the P5 store comparison.
    estimateSek: (displayNames) =>
      estimateBatchCostSEK(displayNames, async (name) => {
        const result = await MathemPriceService.lookupPrice(name);
        return { price: result.price, found: result.found };
      }),
  };
}

export function makePlanChat(tg: TelegramApi, chatId: number): PlanChat {
  return {
    async send(text, buttons) {
      const result = await tg.sendMessage(chatId, text, buttons as InlineButton[][] | undefined);
      return (result as { message_id?: number } | undefined)?.message_id;
    },
    async edit(messageId, text, buttons) {
      await tg.editMessageText(chatId, messageId, text, buttons as InlineButton[][] | undefined);
    },
  };
}
