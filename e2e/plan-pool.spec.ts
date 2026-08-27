import { test, expect } from "./support/mockDb";

// Plan Mode (p4-12): edit the active batch's pool — add dishes from the
// recipe library, adjust a per-entry servings multiplier, remove one. The
// mutations must round-trip through the DB layer: after adding, we navigate
// to Shopping Summary, which re-fetches the pool and renders it — proving
// persistence, not just local state. Locking a batch stays chat-only (p4-03,
// non-goal here) — an active batch must already exist for Plan Mode to have
// something to edit.

test("plan the active batch's pool: add dishes, set a multiplier, and persist", async ({
  page,
  mockDb,
}) => {
  await mockDb.login();
  mockDb.seedActiveBatch([]); // an active batch exists but its pool is empty

  await page.goto("/plan");
  await expect(page.getByText(/0 dishes in the pool/i)).toBeVisible();

  // Add Chana Dal.
  await page.getByRole("button", { name: /add a dish/i }).click();
  await page
    .getByRole("dialog")
    .getByText(/chana dal/i)
    .first()
    .click();
  await expect(page.getByText(/1 dish in the pool/i)).toBeVisible();
  await expect(page.getByText("1×").first()).toBeVisible();

  // Bump its servings multiplier to 1.5×.
  await page
    .locator("div.border-2.border-dashed", { hasText: /chana dal/i })
    .getByRole("button", { name: /increase servings/i })
    .click();
  await expect(page.getByText("1.5×").first()).toBeVisible();

  // Add Palak Paneer too (shares ingredients with Chana Dal).
  await page.getByRole("button", { name: /add a dish/i }).click();
  await page
    .getByRole("dialog")
    .getByText(/palak paneer/i)
    .first()
    .click();
  await expect(page.getByText(/2 dishes in the pool/i)).toBeVisible();

  // Hand off to Shopping Summary, populated from the re-fetched (persisted) pool.
  await page.getByRole("button", { name: /view shopping list/i }).click();

  await expect(page).toHaveURL(/\/summary$/);
  await expect(
    page.getByRole("heading", { name: /shopping list/i }).first(),
  ).toBeVisible();

  // The persisted pool is what drives the summary sidebar: both dishes and
  // the 1.5× multiplier survived the DB round-trip.
  await expect(page.getByText(/chana dal/i).first()).toBeVisible();
  await expect(page.getByText(/palak paneer/i).first()).toBeVisible();
  await expect(page.getByText("1.5×").first()).toBeVisible();
  await expect(page.getByText(/×2 recipes/i).first()).toBeVisible();
});

test("removing a dish from the pool takes it out of the shopping list", async ({
  page,
  mockDb,
}) => {
  await mockDb.login();
  mockDb.seedActiveBatch([
    { recipeId: "chana-dal" },
    { recipeId: "palak-paneer" },
  ]);

  await page.goto("/plan");
  await expect(page.getByText(/2 dishes in the pool/i)).toBeVisible();

  const palakCard = page.locator("div.border-2.border-dashed", {
    hasText: /palak paneer/i,
  });
  await palakCard.hover();
  await palakCard.getByRole("button", { name: /remove from pool/i }).click();

  await expect(page.getByText(/1 dish in the pool/i)).toBeVisible();
  await expect(page.getByText(/palak paneer/i)).toHaveCount(0);
});

test("a meal-prep pair (same dish twice) shows the 🍱 ×2 badge", async ({
  page,
  mockDb,
}) => {
  await mockDb.login();
  mockDb.seedActiveBatch([
    { recipeId: "chana-dal" },
    { recipeId: "chana-dal" },
  ]);

  await page.goto("/plan");
  await expect(page.getByText(/2 dishes in the pool/i)).toBeVisible();
  await expect(page.getByText("🍱 ×2").first()).toBeVisible();
});

// live-feedback round 2 (2026-08-27): "jag skulle vilja kunna säga att en
// eller fler rätter ska vara storkok (x2)" — the same semantics as the chat
// toggle: one more pool entry for the same dish, not a bigger multiplier.
test("🍱 Storkok toggles a dish into a pair and back, in the app too", async ({
  page,
  mockDb,
}) => {
  await mockDb.login();
  mockDb.seedActiveBatch([{ recipeId: "chana-dal" }, { recipeId: "palak-paneer" }]);

  await page.goto("/plan");
  await expect(page.getByText(/2 dishes in the pool/i)).toBeVisible();
  await expect(page.getByText("🍱 ×2")).toHaveCount(0);

  const dalCard = page
    .locator("div.border-2.border-dashed", { hasText: /chana dal/i })
    .first();
  await dalCard.getByRole("button", { name: /make it storkok/i }).click();

  await expect(page.getByText(/3 dishes in the pool/i)).toBeVisible();
  await expect(page.getByText("🍱 ×2").first()).toBeVisible();
  // portions are untouched — storkok is a count, not a multiplier
  await expect(page.getByText("1×").first()).toBeVisible();

  // …and the shopping list grows with it, through a real DB round-trip.
  await page.getByRole("button", { name: /view shopping list/i }).click();
  await expect(page.getByText("🍱 ×2").first()).toBeVisible();

  // Back in Plan Mode the toggle undoes it.
  await page.goBack();
  await expect(page.getByText(/3 dishes in the pool/i)).toBeVisible();
  await page
    .locator("div.border-2.border-dashed", { hasText: /chana dal/i })
    .first()
    .getByRole("button", { name: /undo storkok/i })
    .click();
  await expect(page.getByText(/2 dishes in the pool/i)).toBeVisible();
  await expect(page.getByText("🍱 ×2")).toHaveCount(0);
});

test("no active batch shows the playful empty state pointing at chat", async ({
  page,
  mockDb,
}) => {
  await mockDb.login(); // no batch seeded at all

  await page.goto("/plan");
  await expect(page.getByRole("heading", { name: /no active batch yet/i })).toBeVisible();
  await expect(page.getByText(/plan one in chat/i)).toBeVisible();
});
