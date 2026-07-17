import { test, expect } from "./support/mockDb";

// Plan Mode: build next week from the recipe library, adjust the per-day
// servings multiplier, save. The save must round-trip through the DB layer:
// after saving we land on the Shopping Summary, which re-fetches the plan and
// renders it — proving persistence, not just local state.

// Scope to a weekday grid card by its heading (avoids the recipe-picker cards,
// which have no day heading).
const dayCard = (page: import("@playwright/test").Page, day: string) =>
  page.locator("div.border-2.border-dashed", {
    has: page.getByRole("heading", { name: day, exact: true }),
  });

test("plan a week: pick recipes, set a multiplier, and persist", async ({
  page,
  mockDb,
}) => {
  await mockDb.login(); // planning next week — start with an empty plan

  await page.goto("/plan");
  await expect(page.getByText(/dinners planned/i)).toBeVisible();

  // Monday → Chana Dal.
  await dayCard(page, "Monday")
    .getByRole("button", { name: /add dinner/i })
    .click();
  await page
    .getByRole("dialog")
    .getByText(/chana dal/i)
    .first()
    .click();
  await expect(
    dayCard(page, "Monday").getByText("1×"),
  ).toBeVisible();

  // Bump Monday's servings multiplier to 1.5×.
  await dayCard(page, "Monday")
    .locator("button:has(svg.lucide-plus)")
    .click();
  await expect(dayCard(page, "Monday").getByText("1.5×")).toBeVisible();

  // Tuesday → Palak Paneer (shares ingredients with Chana Dal).
  await dayCard(page, "Tuesday")
    .getByRole("button", { name: /add dinner/i })
    .click();
  await page
    .getByRole("dialog")
    .getByText(/palak paneer/i)
    .first()
    .click();
  await expect(dayCard(page, "Tuesday").getByText("1×")).toBeVisible();

  await expect(page.getByText("2/7 dinners planned")).toBeVisible();

  // Save → Shopping Summary, populated from the re-fetched (persisted) plan.
  await page
    .getByRole("button", { name: /save & get shopping list/i })
    .click();

  await expect(page).toHaveURL(/\/summary$/);
  await expect(
    page.getByRole("heading", { name: /shopping list/i }).first(),
  ).toBeVisible();

  // The persisted plan is what drives the summary sidebar: both meals and the
  // 1.5× multiplier survived the DB round-trip.
  await expect(page.getByText(/chana dal/i).first()).toBeVisible();
  await expect(page.getByText(/palak paneer/i).first()).toBeVisible();
  await expect(page.getByText("1.5×").first()).toBeVisible();
  await expect(page.getByText(/×2 recipes/i).first()).toBeVisible();
});
