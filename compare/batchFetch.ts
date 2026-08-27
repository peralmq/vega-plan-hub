// p5-05: household sign-in + batch fetch for `--batch`. Network I/O only —
// deterministic mapping lives in batchMap.ts (fixture-tested); this file is
// evidence-only, like stores.ts/mathem-mcp.ts. Same sign-in shape as
// bot/consumer.ts's boot (createClient + signInWithPassword), short-lived
// here so autoRefreshToken stays off — the process exits when the run ends.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { BatchEnvConfig } from "./env";
import { type PlanBatchRow, type ProductPreferenceRow, type ShoppingListItemRow, pickLatestBatch } from "./batchMap";

export async function signInHousehold(cfg: BatchEnvConfig): Promise<SupabaseClient> {
  const supa = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supa.auth.signInWithPassword({
    email: cfg.householdEmail,
    password: cfg.householdPassword,
  });
  if (error) throw new Error(`household sign-in failed: ${error.message}`);
  return supa;
}

/** Resolves "latest" to a real batch id (pickLatestBatch is the pure,
 * fixture-tested part); an explicit id passes through unchanged — the
 * pipeline itself will fail loudly on a batch id that doesn't exist when
 * the item fetch below comes back empty. */
export async function resolveBatchId(supa: SupabaseClient, batchArg: string): Promise<string> {
  if (batchArg !== "latest") return batchArg;
  const { data, error } = await supa
    .from("plan_batches")
    .select("id, locked_at")
    .order("locked_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`plan_batches lookup failed: ${error.message}`);
  const id = pickLatestBatch((data ?? []) as PlanBatchRow[]);
  if (!id) throw new Error("no locked batches found for --batch latest");
  return id;
}

export interface BatchRows {
  items: ShoppingListItemRow[];
  preferences: ProductPreferenceRow[];
}

/** Every unchecked-or-not row on the batch (checked-off exclusion happens
 * in batchRowsToCompareList, not here, so the pure function stays the one
 * place that invariant is tested) plus the household's full current
 * preference set (RLS already scopes both to the signed-in household). */
export async function fetchBatchRows(supa: SupabaseClient, batchId: string): Promise<BatchRows> {
  const { data: items, error: itemsError } = await supa
    .from("shopping_list_items")
    .select("canonical_ingredient, display_name, quantity, unit, checked_at")
    .eq("batch_id", batchId);
  if (itemsError) throw new Error(`shopping_list_items fetch failed: ${itemsError.message}`);
  const { data: preferences, error: prefError } = await supa
    .from("product_preferences")
    .select("canonical_ingredient, product_name, superseded_by, valid_from");
  if (prefError) throw new Error(`product_preferences fetch failed: ${prefError.message}`);
  return {
    items: (items ?? []) as ShoppingListItemRow[],
    preferences: (preferences ?? []) as ProductPreferenceRow[],
  };
}
