import { test, expect } from "./support/mockDb";

// p4-11: `/?recipe=<id>&scale=<multiplier>` opens Cook Mode with that recipe
// selected and scaled (design.spec.md, Cook Mode deep links). This is the
// link target contract for the Telegram bot's Cook Mode button and the
// p4-10 menu card/PDF. p4-12 moved Cook Mode onto the batch pool, but the
// deep-link contract is unchanged: it opens a specific dish directly
// regardless of pool state (design.spec.md, "Cook Mode deep links").

const MAPO_TOFU = "mapo-tofu";
const MAPO_TOFU_TITLE = /mapo tofu/i;

test("deep link with ?scale opens the recipe scaled, overriding the pool picker", async ({
  page,
  mockDb,
}) => {
  await mockDb.login();
  // A different, unrelated pool entry so we can prove the deep link
  // overrides the picker rather than just happening to match it.
  mockDb.seedActiveBatch([{ recipeId: "chana-dal" }]);

  await page.goto(`/?recipe=${MAPO_TOFU}&scale=2`);

  await expect(
    page.getByRole("heading", { name: MAPO_TOFU_TITLE }),
  ).toBeVisible();
  // Mapo Tofu is a 4-serving recipe; ×2 -> 8.
  await expect(page.getByText("8 servings")).toBeVisible();

  // The ± stepper writes the multiplier back to ?scale (shareable URL,
  // design.spec "Cook Mode deep links"): 8 -> 9 servings on a 4-serving
  // recipe is ×2.25.
  await page.getByRole("button", { name: "Increase servings" }).click();
  await expect(page).toHaveURL(/\?recipe=mapo-tofu&scale=2\.25$/);
});

test("deep link without ?scale defaults to the recipe's multiplier in the active batch's pool", async ({
  page,
  mockDb,
}) => {
  await mockDb.login();
  mockDb.seedActiveBatch([
    { recipeId: MAPO_TOFU, servingsMultiplier: 3 },
  ]);

  await page.goto(`/?recipe=${MAPO_TOFU}`);

  await expect(
    page.getByRole("heading", { name: MAPO_TOFU_TITLE }),
  ).toBeVisible();
  // 4-serving recipe × the pool's 3x multiplier -> 12.
  await expect(page.getByText("12 servings")).toBeVisible();
});

test("deep link without ?scale defaults to 1x when the recipe isn't in the active batch", async ({
  page,
  mockDb,
}) => {
  await mockDb.login();
  // No batch seeded at all — deep link still works and shows base servings.
  await page.goto(`/?recipe=${MAPO_TOFU}`);

  await expect(
    page.getByRole("heading", { name: MAPO_TOFU_TITLE }),
  ).toBeVisible();
  await expect(page.getByText("4 servings")).toBeVisible();
});

test("unknown recipe id falls back to the normal pool picker with a friendly toast, never a crash", async ({
  page,
  mockDb,
}) => {
  await mockDb.login();
  mockDb.seedActiveBatch([{ recipeId: "chana-dal" }]);

  await page.goto("/?recipe=this-recipe-does-not-exist");

  await expect(page.getByText(/couldn't find that recipe/i).first()).toBeVisible();
  // Falls through to the normal pool picker.
  await expect(page.getByRole("heading", { name: /chana dal/i })).toBeVisible();
});

test("a bad ?scale value falls back to the default multiplier instead of crashing", async ({
  page,
  mockDb,
}) => {
  await mockDb.login();
  await page.goto(`/?recipe=${MAPO_TOFU}&scale=not-a-number`);

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
  await page.goto(`/?recipe=${MAPO_TOFU}&scale=2`);
  await expect(page).toHaveURL(/\/welcome\?recipe=mapo-tofu&scale=2$/);
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

  await expect(page).toHaveURL(/\/\?recipe=mapo-tofu&scale=2$/);
  await expect(
    page.getByRole("heading", { name: MAPO_TOFU_TITLE }),
  ).toBeVisible();
  await expect(page.getByText("8 servings")).toBeVisible();
});
