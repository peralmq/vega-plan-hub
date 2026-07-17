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

interface MealPlanRow {
  id: string;
  user_id: string;
  week_start: string;
}
interface DailyMealRow {
  id: string;
  meal_plan_id: string;
  day_of_week: number;
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
  private mealPlans: MealPlanRow[] = [];
  private dailyMeals: DailyMealRow[] = [];
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
    const id = this.nid("plan");
    this.mealPlans.push({ id, user_id: TEST_USER.id, week_start: weekStart });
    for (const m of meals) {
      this.dailyMeals.push({
        id: this.nid("dm"),
        meal_plan_id: id,
        day_of_week: m.dayOfWeek,
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

    if (table === "meal_plans") {
      if (method === "GET") {
        const select = params.get("select") ?? "";
        if (select.includes("daily_meals")) {
          // Weekly fetch: filter by week_start=in.(...), embed daily_meals.
          const weeks = this.parseInList(params.get("week_start"));
          const rows = this.mealPlans
            .filter((p) => weeks.length === 0 || weeks.includes(p.week_start))
            .map((p) => ({
              id: p.id,
              week_start: p.week_start,
              daily_meals: this.dailyMeals
                .filter((d) => d.meal_plan_id === p.id)
                .map((d) => ({
                  id: d.id,
                  day_of_week: d.day_of_week,
                  recipe_id: d.recipe_id,
                  servings_multiplier: d.servings_multiplier,
                })),
            }));
          return this.json(route, rows);
        }
        // Existence check (.maybeSingle): select=id&user_id=eq&week_start=eq.
        const ws = this.eqVal(params.get("week_start"));
        const rows = this.mealPlans
          .filter((p) => !ws || p.week_start === ws)
          .map((p) => ({ id: p.id }));
        return this.json(route, rows); // postgrest-js reduces for maybeSingle
      }
      if (method === "POST") {
        const b = (body ?? {}) as Partial<MealPlanRow>;
        const row: MealPlanRow = {
          id: this.nid("plan"),
          user_id: b.user_id ?? TEST_USER.id,
          week_start: b.week_start ?? this.nextMonday(),
        };
        this.mealPlans.push(row);
        return this.json(route, single ? { id: row.id } : [{ id: row.id }], 201);
      }
    }

    if (table === "daily_meals") {
      if (method === "DELETE") {
        const mp = this.eqVal(params.get("meal_plan_id"));
        this.dailyMeals = this.dailyMeals.filter((d) => d.meal_plan_id !== mp);
        return route.fulfill({ status: 204, body: "" });
      }
      if (method === "POST") {
        const rows = Array.isArray(body) ? body : [body];
        for (const r of rows as Array<Partial<DailyMealRow>>) {
          this.dailyMeals.push({
            id: this.nid("dm"),
            meal_plan_id: r.meal_plan_id ?? "",
            day_of_week: r.day_of_week ?? 0,
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

  private parseInList(value: string | null): string[] {
    if (!value) return [];
    const m = value.match(/^in\.\((.*)\)$/s);
    const inner = m ? m[1] : value;
    return inner
      .split(",")
      .map((s) => s.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
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
