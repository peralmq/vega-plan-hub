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

export interface SeedMeal {
  dayOfWeek: number; // 0=Mon .. 6=Sun
  recipeId: string;
  servingsMultiplier?: number;
}

interface PlannedMealRow {
  id: string;
  user_id: string;
  meal_date: string; // yyyy-MM-dd
  recipe_id: string;
  servings_multiplier: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Monday of the week containing `base` (matches date-fns startOfWeek weekStartsOn:1).
function mondayOf(base: Date): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export class MockDb {
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

  currentMonday(): string {
    return fmt(mondayOf(new Date()));
  }
  nextMonday(): string {
    const d = mondayOf(new Date());
    d.setDate(d.getDate() + 7);
    return fmt(d);
  }
  /** Today's day index the app uses: 0=Mon .. 6=Sun. */
  todayDayOfWeek(): number {
    const j = new Date().getDay();
    return j === 0 ? 6 : j - 1;
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

  seedCurrentWeek(meals: SeedMeal[]): this {
    this.addPlan(this.currentMonday(), meals);
    return this;
  }
  seedNextWeek(meals: SeedMeal[]): this {
    this.addPlan(this.nextMonday(), meals);
    return this;
  }
  private addPlan(weekStart: string, meals: SeedMeal[]) {
    // weekStart is a Monday; dayOfWeek 0..6 offsets to the calendar date
    // (planned_meals is date-keyed since p4-01).
    for (const m of meals) {
      const d = new Date(`${weekStart}T00:00:00`);
      d.setDate(d.getDate() + m.dayOfWeek);
      this.plannedMeals.push({
        id: this.nid("pm"),
        user_id: TEST_USER.id,
        meal_date: fmt(d),
        recipe_id: m.recipeId,
        servings_multiplier: m.servingsMultiplier ?? 1,
      });
    }
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

    if (table === "planned_meals") {
      // Date-window filters arrive as repeated meal_date params:
      // meal_date=gte.YYYY-MM-DD & meal_date=lte.YYYY-MM-DD.
      const { gte, lte } = this.dateRange(params.getAll("meal_date"));
      const inRange = (r: PlannedMealRow) =>
        (!gte || r.meal_date >= gte) && (!lte || r.meal_date <= lte);

      if (method === "GET") {
        const rows = this.plannedMeals
          .filter(inRange)
          .map((r) => ({
            id: r.id,
            meal_date: r.meal_date,
            recipe_id: r.recipe_id,
            servings_multiplier: r.servings_multiplier,
          }))
          .sort((a, b) => a.meal_date.localeCompare(b.meal_date));
        return this.json(route, rows);
      }
      if (method === "DELETE") {
        const uid = this.eqVal(params.get("user_id"));
        this.plannedMeals = this.plannedMeals.filter(
          (r) => !(inRange(r) && (!uid || r.user_id === uid)),
        );
        return route.fulfill({ status: 204, body: "" });
      }
      if (method === "POST") {
        // Upsert on (user_id, meal_date) — postgrest sends on_conflict param.
        const rows = Array.isArray(body) ? body : [body];
        for (const r of rows as Array<Partial<PlannedMealRow>>) {
          const userId = r.user_id ?? TEST_USER.id;
          const mealDate = r.meal_date ?? "";
          this.plannedMeals = this.plannedMeals.filter(
            (existing) =>
              !(existing.user_id === userId && existing.meal_date === mealDate),
          );
          this.plannedMeals.push({
            id: this.nid("pm"),
            user_id: userId,
            meal_date: mealDate,
            recipe_id: r.recipe_id ?? "",
            servings_multiplier: r.servings_multiplier ?? 1,
          });
        }
        return route.fulfill({ status: 201, body: "" });
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

  private dateRange(values: string[]): { gte?: string; lte?: string } {
    const range: { gte?: string; lte?: string } = {};
    for (const v of values) {
      const m = v.match(/^(gte|lte)\.(.*)$/s);
      if (m) range[m[1] as "gte" | "lte"] = m[2];
    }
    return range;
  }
  private eqVal(value: string | null): string | null {
    if (!value) return null;
    const m = value.match(/^eq\.(.*)$/s);
    return m ? m[1] : value;
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
