// In-memory PostgREST emulation for mock-auth mode (docs/execplans/p2-02-mock-auth-mode.md).
//
// Adapted from e2e/support/mockDb.ts (the proven network-level double used by
// the Playwright suite) but reworked to run *inside* the app, in-process,
// instead of intercepting HTTP. The e2e copy is left untouched — it emulates
// PostgREST over the wire; this one emulates the same query shapes directly
// against the chainable builder the four data hooks call.
//
// This module has no top-level side effects (only class/type/const
// declarations); everything runs lazily inside `MockStore` methods, called
// only from `src/mocks/mockClient.ts`, which is itself only reachable behind
// the `import.meta.env.VITE_MOCK_AUTH` static check in
// `src/integrations/supabase/client.ts`. That keeps this file eligible for
// Rollup's dead-code elimination when the flag is unset — see that file's
// production-elimination proof.

export const MOCK_USER_ID = "00000000-0000-4000-8000-0000000000f1";

export interface PlanBatchRow {
  id: string;
  user_id: string;
  starts_on: string; // yyyy-MM-dd
  ends_on: string; // yyyy-MM-dd
  locked_at: string;
  locked_by: string | null;
}
export interface PlannedMealRow {
  id: string;
  user_id: string;
  batch_id: string | null;
  meal_date: string | null; // yyyy-MM-dd (legacy; pool rows leave this null)
  recipe_id: string;
  servings_multiplier: number;
  cooked_on: string | null; // yyyy-MM-dd once picked/cooked in Cook Mode
}
export interface FamilyMemberRow {
  id: string;
  user_id: string;
  name: string;
  avatar_color: string;
  created_at: string;
}
export interface RatingRow {
  id: string;
  user_id: string;
  recipe_id: string;
  family_member_id: string | null;
  rating: number;
  created_at: string;
  updated_at: string;
}
export interface CommentRow {
  id: string;
  user_id: string;
  recipe_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export type Row = Record<string, unknown>;

export interface QueryFilter {
  col: string;
  op: "eq" | "in" | "gte" | "lte" | "is";
  val: unknown;
}

export interface QueryOpts {
  type: "select" | "insert" | "update" | "delete" | "upsert";
  selectCols: string;
  payload?: Row | Row[];
  filters: QueryFilter[];
  order?: { col: string; ascending: boolean };
  single?: "single" | "maybeSingle";
}

export interface QueryResult {
  data: unknown;
  error: null;
}

export interface SeedPoolMeal {
  recipeId: string;
  servingsMultiplier?: number;
  cookedOn?: string | null; // yyyy-MM-dd; omitted/null = remaining
}

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

export class MockStore {
  private planBatches: PlanBatchRow[] = [];
  private plannedMeals: PlannedMealRow[] = [];
  private familyMembers: FamilyMemberRow[] = [];
  private ratings: RatingRow[] = [];
  private comments: CommentRow[] = [];
  private idc = 0;

  private nid(prefix: string): string {
    return `${prefix}-${++this.idc}`;
  }
  private now(): string {
    return new Date().toISOString();
  }

  today(): string {
    return fmt(new Date());
  }
  isoDaysFromToday(n: number): string {
    return fmt(addDays(new Date(), n));
  }

  // --- seeding -------------------------------------------------------------

  // Pool model (p4-12): a batch covers [startsOn, endsOn] and its
  // planned_meals rows are pool entries (no meal_date) — a meal prep is
  // simply the same recipeId twice. Returns the new batch id.
  seedBatch(startsOn: string, endsOn: string, meals: SeedPoolMeal[]): string {
    const batchId = this.nid("batch");
    this.planBatches.push({
      id: batchId,
      user_id: MOCK_USER_ID,
      starts_on: startsOn,
      ends_on: endsOn,
      locked_at: this.now(),
      locked_by: null,
    });
    for (const m of meals) {
      this.plannedMeals.push({
        id: this.nid("pm"),
        user_id: MOCK_USER_ID,
        batch_id: batchId,
        meal_date: null,
        recipe_id: m.recipeId,
        servings_multiplier: m.servingsMultiplier ?? 1,
        cooked_on: m.cookedOn ?? null,
      });
    }
    return batchId;
  }
  seedFamilyMember(name: string, avatarColor: string): FamilyMemberRow {
    const row: FamilyMemberRow = {
      id: this.nid("fm"),
      user_id: MOCK_USER_ID,
      name,
      avatar_color: avatarColor,
      created_at: this.now(),
    };
    this.familyMembers.push(row);
    return row;
  }
  seedRating(recipeId: string, familyMemberId: string | null, rating: number): void {
    this.ratings.push({
      id: this.nid("rating"),
      user_id: MOCK_USER_ID,
      recipe_id: recipeId,
      family_member_id: familyMemberId,
      rating,
      created_at: this.now(),
      updated_at: this.now(),
    });
  }
  seedComment(recipeId: string, content: string): void {
    this.comments.push({
      id: this.nid("comment"),
      user_id: MOCK_USER_ID,
      recipe_id: recipeId,
      content,
      created_at: this.now(),
      updated_at: this.now(),
    });
  }

  // --- query execution -------------------------------------------------------

  execute(table: string, opts: QueryOpts): QueryResult {
    switch (table) {
      case "plan_batches":
        return this.execPlanBatches(opts);
      case "planned_meals":
        return this.execPlannedMeals(opts);
      case "family_members":
        return this.execFamilyMembers(opts);
      case "recipe_ratings":
        return this.execRatings(opts);
      case "recipe_comments":
        return this.execComments(opts);
      default:
        return { data: opts.single ? null : [], error: null };
    }
  }

  private filterVal(opts: QueryOpts, col: string): unknown {
    return opts.filters.find((f) => f.col === col)?.val;
  }
  private payloadObj(opts: QueryOpts): Row {
    const p = opts.payload;
    if (Array.isArray(p)) return p[0] ?? {};
    return p ?? {};
  }

  private matchesFilters(row: Row, filters: QueryFilter[]): boolean {
    return filters.every((f) => {
      const v = row[f.col];
      switch (f.op) {
        case "eq":
          return v === f.val;
        case "in":
          return Array.isArray(f.val) && (f.val as unknown[]).includes(v);
        case "gte":
          return String(v) >= String(f.val);
        case "lte":
          return String(v) <= String(f.val);
        case "is":
          return v === f.val;
      }
    });
  }

  private execPlanBatches(opts: QueryOpts): QueryResult {
    if (opts.type === "select") {
      const rows = this.planBatches
        .filter((r) => this.matchesFilters(r as unknown as Row, opts.filters))
        .map((r) => ({ id: r.id, starts_on: r.starts_on, ends_on: r.ends_on }));
      if (opts.order) {
        const { col, ascending } = opts.order;
        rows.sort((a, b) => {
          const av = String(a[col as keyof typeof a]);
          const bv = String(b[col as keyof typeof b]);
          return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
      return { data: rows, error: null };
    }
    return { data: opts.single ? null : [], error: null };
  }

  private execPlannedMeals(opts: QueryOpts): QueryResult {
    if (opts.type === "select") {
      const rows = this.plannedMeals
        .filter((r) => this.matchesFilters(r as unknown as Row, opts.filters))
        .map((r) => ({
          id: r.id,
          batch_id: r.batch_id,
          meal_date: r.meal_date,
          recipe_id: r.recipe_id,
          servings_multiplier: r.servings_multiplier,
          cooked_on: r.cooked_on,
        }));
      return { data: rows, error: null };
    }
    if (opts.type === "delete") {
      this.plannedMeals = this.plannedMeals.filter(
        (r) => !this.matchesFilters(r as unknown as Row, opts.filters),
      );
      return { data: null, error: null };
    }
    if (opts.type === "update") {
      const patch = this.payloadObj(opts);
      this.plannedMeals = this.plannedMeals.map((r) =>
        this.matchesFilters(r as unknown as Row, opts.filters) ? { ...r, ...patch } : r,
      );
      return { data: null, error: null };
    }
    if (opts.type === "insert" || opts.type === "upsert") {
      const rows = (Array.isArray(opts.payload) ? opts.payload : [opts.payload ?? {}]) as Row[];
      for (const r of rows) {
        const userId = (r.user_id as string) ?? MOCK_USER_ID;
        const batchId = (r.batch_id as string | undefined) ?? null;
        const mealDate = (r.meal_date as string | undefined) ?? null;
        this.plannedMeals.push({
          id: this.nid("pm"),
          user_id: userId,
          batch_id: batchId,
          meal_date: mealDate,
          recipe_id: (r.recipe_id as string) ?? "",
          servings_multiplier: (r.servings_multiplier as number) ?? 1,
          cooked_on: (r.cooked_on as string | undefined) ?? null,
        });
      }
      return { data: null, error: null };
    }
    return { data: null, error: null };
  }

  private execFamilyMembers(opts: QueryOpts): QueryResult {
    if (opts.type === "select") {
      let rows = [...this.familyMembers];
      if (opts.order) {
        const { col, ascending } = opts.order;
        rows = rows.sort((a, b) => {
          const av = String(a[col as keyof FamilyMemberRow]);
          const bv = String(b[col as keyof FamilyMemberRow]);
          return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
      return { data: rows, error: null };
    }
    if (opts.type === "insert") {
      const b = this.payloadObj(opts);
      const row: FamilyMemberRow = {
        id: this.nid("fm"),
        user_id: (b.user_id as string) ?? MOCK_USER_ID,
        name: (b.name as string) ?? "",
        avatar_color: (b.avatar_color as string) ?? "#8B5CF6",
        created_at: this.now(),
      };
      this.familyMembers.push(row);
      return { data: row, error: null };
    }
    if (opts.type === "update") {
      const id = this.filterVal(opts, "id") as string | undefined;
      const idx = this.familyMembers.findIndex((m) => m.id === id);
      if (idx === -1) return { data: null, error: null };
      this.familyMembers[idx] = { ...this.familyMembers[idx], ...this.payloadObj(opts) };
      return { data: this.familyMembers[idx], error: null };
    }
    if (opts.type === "delete") {
      const id = this.filterVal(opts, "id") as string | undefined;
      this.familyMembers = this.familyMembers.filter((m) => m.id !== id);
      return { data: null, error: null };
    }
    return { data: null, error: null };
  }

  private execRatings(opts: QueryOpts): QueryResult {
    if (opts.type === "select") {
      const recipeId = this.filterVal(opts, "recipe_id") as string | undefined;
      const rows = this.ratings.filter((r) => !recipeId || r.recipe_id === recipeId);
      return { data: rows, error: null };
    }
    if (opts.type === "insert") {
      const b = this.payloadObj(opts);
      const row: RatingRow = {
        id: this.nid("rating"),
        user_id: (b.user_id as string) ?? MOCK_USER_ID,
        recipe_id: (b.recipe_id as string) ?? "",
        family_member_id: (b.family_member_id as string | null) ?? null,
        rating: (b.rating as number) ?? 0,
        created_at: this.now(),
        updated_at: this.now(),
      };
      this.ratings.push(row);
      return { data: row, error: null };
    }
    if (opts.type === "update") {
      const id = this.filterVal(opts, "id") as string | undefined;
      const idx = this.ratings.findIndex((r) => r.id === id);
      if (idx === -1) return { data: null, error: null };
      this.ratings[idx] = { ...this.ratings[idx], ...this.payloadObj(opts), updated_at: this.now() };
      return { data: this.ratings[idx], error: null };
    }
    if (opts.type === "delete") {
      const id = this.filterVal(opts, "id") as string | undefined;
      this.ratings = this.ratings.filter((r) => r.id !== id);
      return { data: null, error: null };
    }
    return { data: null, error: null };
  }

  private execComments(opts: QueryOpts): QueryResult {
    if (opts.type === "select") {
      const recipeId = this.filterVal(opts, "recipe_id") as string | undefined;
      let rows = this.comments.filter((c) => !recipeId || c.recipe_id === recipeId);
      if (opts.order) {
        const { ascending } = opts.order;
        rows = [...rows].sort((a, b) =>
          ascending
            ? a.created_at.localeCompare(b.created_at)
            : b.created_at.localeCompare(a.created_at),
        );
      }
      return { data: rows, error: null };
    }
    if (opts.type === "insert") {
      const b = this.payloadObj(opts);
      const row: CommentRow = {
        id: this.nid("comment"),
        user_id: (b.user_id as string) ?? MOCK_USER_ID,
        recipe_id: (b.recipe_id as string) ?? "",
        content: (b.content as string) ?? "",
        created_at: this.now(),
        updated_at: this.now(),
      };
      this.comments.push(row);
      return { data: row, error: null };
    }
    if (opts.type === "update") {
      const id = this.filterVal(opts, "id") as string | undefined;
      const idx = this.comments.findIndex((c) => c.id === id);
      if (idx === -1) return { data: null, error: null };
      this.comments[idx] = { ...this.comments[idx], ...this.payloadObj(opts), updated_at: this.now() };
      return { data: this.comments[idx], error: null };
    }
    if (opts.type === "delete") {
      const id = this.filterVal(opts, "id") as string | undefined;
      this.comments = this.comments.filter((c) => c.id !== id);
      return { data: null, error: null };
    }
    return { data: null, error: null };
  }
}

export class MockQueryBuilder<T = unknown> implements PromiseLike<{ data: T; error: null }> {
  private _type: QueryOpts["type"] = "select";
  private _selectCols = "*";
  private _payload?: Row | Row[];
  private _filters: QueryFilter[] = [];
  private _order?: { col: string; ascending: boolean };
  private _single?: "single" | "maybeSingle";

  constructor(
    private readonly store: MockStore,
    private readonly table: string,
  ) {}

  select(cols = "*"): this {
    this._selectCols = cols;
    return this;
  }
  insert(payload: Row | Row[]): this {
    this._type = "insert";
    this._payload = payload;
    return this;
  }
  update(payload: Row): this {
    this._type = "update";
    this._payload = payload;
    return this;
  }
  delete(): this {
    this._type = "delete";
    return this;
  }
  upsert(payload: Row | Row[], _opts?: { onConflict?: string }): this {
    this._type = "upsert";
    this._payload = payload;
    return this;
  }
  eq(col: string, val: unknown): this {
    this._filters.push({ col, op: "eq", val });
    return this;
  }
  in(col: string, val: unknown[]): this {
    this._filters.push({ col, op: "in", val });
    return this;
  }
  gte(col: string, val: unknown): this {
    this._filters.push({ col, op: "gte", val });
    return this;
  }
  lte(col: string, val: unknown): this {
    this._filters.push({ col, op: "lte", val });
    return this;
  }
  is(col: string, val: unknown): this {
    this._filters.push({ col, op: "is", val });
    return this;
  }
  order(col: string, opts: { ascending: boolean }): this {
    this._order = { col, ascending: opts.ascending };
    return this;
  }
  single(): this {
    this._single = "single";
    return this;
  }
  maybeSingle(): this {
    this._single = "maybeSingle";
    return this;
  }

  then<TResult1 = { data: T; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: T; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const result = this.store.execute(this.table, {
      type: this._type,
      selectCols: this._selectCols,
      payload: this._payload,
      filters: this._filters,
      order: this._order,
      single: this._single,
    }) as { data: T; error: null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}
