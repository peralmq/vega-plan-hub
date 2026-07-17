import { test, expect } from "./support/mockDb";

// Shopping Summary aggregates + normalizes ingredients across the week's recipes
// and offers copy-to-clipboard (design.spec.md). Chana Dal and Palak Paneer
// share several ingredients (garlic, onion, ginger, turmeric, …) so aggregation
// is observable as a "(×2 recipes)" marker.

test("shopping summary aggregates ingredients and copy works", async ({
  page,
  context,
  mockDb,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await mockDb.login();
  mockDb.seedNextWeek([
    { dayOfWeek: 0, recipeId: "chana-dal" },
    { dayOfWeek: 1, recipeId: "palak-paneer" },
  ]);

  await page.goto("/summary");

  await expect(
    page.getByRole("heading", { name: /shopping list/i }).first(),
  ).toBeVisible();

  // At least one ingredient is shared by both recipes → aggregated.
  await expect(page.getByText(/×2 recipes/i).first()).toBeVisible();

  // Copy action → toast confirmation + clipboard populated.
  await page.getByRole("button", { name: /^copy$/i }).click();
  await expect(page.getByText(/copied!/i).first()).toBeVisible();

  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain("Shopping List for");
});
