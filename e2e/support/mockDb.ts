import {
  test as base,
  expect,
  type BrowserContext,
  type Page,
  type Route,
} from "../../playwright-fixture";

// Hermetic Supabase test double.
//
// Strategy (see the plan's Decision Log): the real @supabase/supabase-js client
// is left untouched in production code. We make the suite offline-deterministic
// by (1) seeding a fake auth session into localStorage before the app boots, so
// `supabase.auth.getSession()` resolves a logged-in user with zero network, and
// (2) intercepting every PostgREST call (`/rest/v1/*`) with an in-memory store.
// No personal account, no secret, no reachable Supabase project, no leftover DB
// state — each test gets a fresh browser context and a fresh MockDb.

const TEST_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "e2e@vega.test",
  app_metadata: { provider: "google", providers: ["google"] },
  user_metadata: { full_name: "E2E Tester" },
  identities: [],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

// Derived from VITE_SUPABASE_URL host in .env.test (https://stub.supabase.co):
// supabase-js uses `sb-${hostname.split(".")[0]}-auth-token`.
const STORAGE_KEY = "sb-stub-auth-token";

// p4-12: pool model (tech.spec.md "Pool model") — a plan_batches row covers
// a date range; its planned_meals rows are pool entries (no meal_date; a
// meal prep is the same recipeId twice), and `cookedOn` stamps a pick made
// in Cook Mode.
export interface SeedPoolMeal {
  recipeId: string;
  servingsMultiplier?: number;
  cookedOn?: string | null;
}

interface PlanBatchRow {
  id: string;
  user_id: string;
  starts_on: string; // yyyy-MM-dd
  ends_on: string; // yyyy-MM-dd
}
interface PlannedMealRow {
  id: string;
  user_id: string;
  batch_id: string | null;
  meal_date: string | null;
  recipe_id: string;
  servings_multiplier: number;
  cooked_on: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

export class MockDb {
  private planBatches: PlanBatchRow[] = [];
  private plannedMeals: PlannedMealRow[] = [];
  private familyMembers: unknown[] = [];
  private ratings: unknown[] = [];
  private comments: unknown[] = [];
  private idc = 0;

  constructor(
    private readonly page: Page,
    private readonly context: BrowserContext,
  ) {}

  private nid(prefix: string) {
    return `${prefix}-${++this.idc}`;
  }

  /** Today's date the app uses, as yyyy-MM-dd. */
  today(): string {
    return fmt(new Date());
  }
  /** `n` days from today (negative = past), as yyyy-MM-dd. */
  isoDaysFromToday(n: number): string {
    return fmt(addDays(new Date(), n));
  }

  /** Register the network stubs. Call once (the fixture does this). */
  async install(): Promise<void> {
    await this.context.route("**/rest/v1/**", (route) =>
      this.handleRest(route),
    );
    // Defensive: nothing in the core flows hits /auth/v1, but never let one
    // escape to the network.
    await this.context.route("**/auth/v1/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      }),
    );
  }

  /**
   * Seed a logged-in session. Must be called BEFORE page.goto so the init
   * script runs before the app boots. Pass null / skip entirely for a
   * logged-out test.
   */
  async login(overrides: Partial<typeof TEST_USER> = {}): Promise<void> {
    const user = { ...TEST_USER, ...overrides };
    const session = {
      access_token: "stub-access-token",
      refresh_token: "stub-refresh-token",
      token_type: "bearer",
      expires_in: 3600,
      // 5 years out — never triggers a refresh network call.
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 5,
      user,
    };
    await this.context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [STORAGE_KEY, JSON.stringify(session)] as [string, string],
    );
  }

  /**
   * Seed the active batch (covers today by default) with pool entries.
   * Returns the batch id.
   */
  seedActiveBatch(
    meals: SeedPoolMeal[],
    opts: { startsOn?: string; endsOn?: string } = {},
  ): string {
    return this.addBatch(
      opts.startsOn ?? this.isoDaysFromToday(-1),
      opts.endsOn ?? this.isoDaysFromToday(3),
      meals,
    );
  }

  /** Seed an upcoming batch (starts after today) — not the active one. */
  seedNextBatch(
    meals: SeedPoolMeal[],
    opts: { startsOn?: string; endsOn?: string } = {},
  ): string {
    return this.addBatch(
      opts.startsOn ?? this.isoDaysFromToday(4),
      opts.endsOn ?? this.isoDaysFromToday(8),
      meals,
    );
  }

  private addBatch(startsOn: string, endsOn: string, meals: SeedPoolMeal[]): string {
    const batchId = this.nid("batch");
    this.planBatches.push({
      id: batchId,
      user_id: TEST_USER.id,
      starts_on: startsOn,
      ends_on: endsOn,
    });
    for (const m of meals) {
      this.plannedMeals.push({
        id: this.nid("pm"),
        user_id: TEST_USER.id,
        batch_id: batchId,
        meal_date: null,
        recipe_id: m.recipeId,
        servings_multiplier: m.servingsMultiplier ?? 1,
        cooked_on: m.cookedOn ?? null,
      });
    }
    return batchId;
  }

  // --- PostgREST emulation -------------------------------------------------

  private json(route: Route, data: unknown, status = 200) {
    return route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  }

  private async handleRest(route: Route) {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());
    const table = url.pathname.split("/rest/v1/")[1]?.split("/")[0] ?? "";
    const params = url.searchParams;
    const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");

    let body: unknown;
    const raw = req.postData();
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = undefined;
      }
    }

    if (table === "plan_batches" && method === "GET") {
      const gte = this.gteVal(params.getAll("ends_on"));
      let rows = this.planBatches.filter((b) => !gte || b.ends_on >= gte);
      const order = params.get("order");
      if (order?.startsWith("starts_on")) {
        const asc = !order.includes("desc");
        rows = [...rows].sort((a, b) =>
          asc
            ? a.starts_on.localeCompare(b.starts_on)
            : b.starts_on.localeCompare(a.starts_on),
        );
      }
      return this.json(
        route,
        rows.map((b) => ({ id: b.id, starts_on: b.starts_on, ends_on: b.ends_on })),
      );
    }

    if (table === "planned_meals") {
      if (method === "GET") {
        const batchIds = this.inVals(params.get("batch_id"));
        const rows = this.plannedMeals
          .filter((r) => !batchIds || batchIds.includes(r.batch_id ?? ""))
          .map((r) => ({
            id: r.id,
            batch_id: r.batch_id,
            recipe_id: r.recipe_id,
            servings_multiplier: r.servings_multiplier,
            cooked_on: r.cooked_on,
          }));
        return this.json(route, rows);
      }
      if (method === "POST") {
        const rows = Array.isArray(body) ? body : [body];
        for (const r of rows as Array<Partial<PlannedMealRow>>) {
          this.plannedMeals.push({
            id: this.nid("pm"),
            user_id: r.user_id ?? TEST_USER.id,
            batch_id: r.batch_id ?? null,
            meal_date: r.meal_date ?? null,
            recipe_id: r.recipe_id ?? "",
            servings_multiplier: r.servings_multiplier ?? 1,
            cooked_on: r.cooked_on ?? null,
          });
        }
        return route.fulfill({ status: 201, body: "" });
      }
      if (method === "PATCH") {
        const id = this.eqVal(params.get("id"));
        const patch = (body ?? {}) as Partial<PlannedMealRow>;
        this.plannedMeals = this.plannedMeals.map((r) =>
          id && r.id === id ? { ...r, ...patch } : r,
        );
        return route.fulfill({ status: 204, body: "" });
      }
      if (method === "DELETE") {
        const id = this.eqVal(params.get("id"));
        this.plannedMeals = this.plannedMeals.filter((r) => r.id !== id);
        return route.fulfill({ status: 204, body: "" });
      }
    }

    if (table === "family_members" && method === "GET")
      return this.json(route, this.familyMembers);
    if (table === "recipe_ratings" && method === "GET")
      return this.json(route, this.ratings);
    if (table === "recipe_comments" && method === "GET")
      return this.json(route, this.comments);

    // Safe default: empty result / no-op.
    if (method === "GET") return this.json(route, single ? null : []);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: single ? "{}" : "[]",
    });
  }

  private gteVal(values: string[]): string | undefined {
    for (const v of values) {
      const m = v.match(/^gte\.(.*)$/s);
      if (m) return m[1];
    }
    return undefined;
  }
  private eqVal(value: string | null): string | null {
    if (!value) return null;
    const m = value.match(/^eq\.(.*)$/s);
    return m ? m[1] : value;
  }
  private inVals(value: string | null): string[] | null {
    if (!value) return null;
    const m = value.match(/^in\.\((.*)\)$/s);
    if (!m) return null;
    return m[1].split(",").filter(Boolean);
  }
}

export const test = base.extend<{ mockDb: MockDb }>({
  // `provide` is Playwright's fixture-injection callback (conventionally named
  // `use`); renamed here so eslint's react-hooks/rules-of-hooks does not
  // mistake it for a React Hook.
  mockDb: async ({ page, context }, provide) => {
    const db = new MockDb(page, context);
    await db.install();
    await provide(db);
  },
});

export { expect };
