import { test, expect } from "./support/mockDb";

// p4-11: `/?recipe=<id>&x=<multiplier>` opens Cook Mode with that recipe
// selected and scaled (design.spec.md, Cook Mode deep links). This is the
// link target contract for the Telegram bot's Cook Mode button and the
// p4-10 menu card/PDF.

const MAPO_TOFU = "mapo-tofu";
const MAPO_TOFU_TITLE = /mapo tofu/i;

test("deep link with ?x opens the recipe scaled, overriding the day pick", async ({
  page,
  mockDb,
}) => {
  await mockDb.login();
  // A different meal on today so we can prove the deep link overrides the
  // day-based pick rather than just happening to match it.
  mockDb.seedCurrentWeek([
    { dayOfWeek: mockDb.todayDayOfWeek(), recipeId: "chana-dal" },
  ]);

  await page.goto(`/?recipe=${MAPO_TOFU}&x=2`);

  await expect(
    page.getByRole("heading", { name: MAPO_TOFU_TITLE }),
  ).toBeVisible();
  // Mapo Tofu is a 4-serving recipe; ×2 -> 8.
  await expect(page.getByText("8 servings")).toBeVisible();
});

test("deep link without ?x defaults to the recipe's multiplier in the active plan", async ({
  page,
  mockDb,
}) => {
  await mockDb.login();
  mockDb.seedCurrentWeek([
    { dayOfWeek: mockDb.todayDayOfWeek(), recipeId: MAPO_TOFU, servingsMultiplier: 3 },
  ]);

  await page.goto(`/?recipe=${MAPO_TOFU}`);

  await expect(
    page.getByRole("heading", { name: MAPO_TOFU_TITLE }),
  ).toBeVisible();
  // 4-serving recipe × the planned 3x multiplier -> 12.
  await expect(page.getByText("12 servings")).toBeVisible();
});

test("deep link without ?x defaults to 1x when the recipe isn't in the active plan", async ({
  page,
  mockDb,
}) => {
  await mockDb.login();
  // No plan seeded at all — deep link still works and shows base servings.
  await page.goto(`/?recipe=${MAPO_TOFU}`);

  await expect(
    page.getByRole("heading", { name: MAPO_TOFU_TITLE }),
  ).toBeVisible();
  await expect(page.getByText("4 servings")).toBeVisible();
});

test("unknown recipe id falls back to normal Cook Mode with a friendly toast, never a crash", async ({
  page,
  mockDb,
}) => {
  await mockDb.login();
  mockDb.seedCurrentWeek([
    { dayOfWeek: mockDb.todayDayOfWeek(), recipeId: "chana-dal" },
  ]);

  await page.goto("/?recipe=this-recipe-does-not-exist");

  await expect(page.getByText(/couldn't find that recipe/i)).toBeVisible();
  // Falls through to today's normal pick.
  await expect(page.getByRole("heading", { name: /chana dal/i })).toBeVisible();
});

test("a bad ?x value falls back to the default multiplier instead of crashing", async ({
  page,
  mockDb,
}) => {
  await mockDb.login();
  await page.goto(`/?recipe=${MAPO_TOFU}&x=not-a-number`);

  await expect(
    page.getByRole("heading", { name: MAPO_TOFU_TITLE }),
  ).toBeVisible();
  await expect(page.getByText("4 servings")).toBeVisible();
});

test("the query survives the ProtectedRoute -> /welcome -> login round trip", async ({
  page,
  mockDb,
}) => {
  // Logged out: the deep link redirects to /welcome, query intact.
  await page.goto(`/?recipe=${MAPO_TOFU}&x=2`);
  await expect(page).toHaveURL(/\/welcome\?recipe=mapo-tofu&x=2$/);
  await expect(
    page.getByRole("button", { name: /sign in with google/i }),
  ).toBeVisible();

  // Simulate completing sign-in (real Google OAuth isn't reachable
  // hermetically): seed a session and reload the same URL. AuthRoute must
  // bounce an authenticated visitor on /welcome back to "/", carrying the
  // same query, the same way signInWithGoogle's redirectTo does after a
  // real OAuth round trip.
  await mockDb.login();
  await page.reload();

  await expect(page).toHaveURL(/\/\?recipe=mapo-tofu&x=2$/);
  await expect(
    page.getByRole("heading", { name: MAPO_TOFU_TITLE }),
  ).toBeVisible();
  await expect(page.getByText("8 servings")).toBeVisible();
});
