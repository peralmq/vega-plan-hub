import { test, expect } from "./support/mockDb";

// Shopping Summary aggregates + normalizes ingredients across the active
// batch's pool and offers copy-to-clipboard (design.spec.md). Chana Dal and
// Palak Paneer share several ingredients (garlic, onion, ginger, turmeric,
// …) so aggregation is observable as a "(×2 recipes)" marker.

test("shopping summary aggregates the active batch's pool and copy works", async ({
  page,
  context,
  mockDb,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await mockDb.login();
  mockDb.seedActiveBatch([
    { recipeId: "chana-dal" },
    { recipeId: "palak-paneer" },
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

test("a cooked dish still counts toward the batch's shopping list", async ({
  page,
  mockDb,
}) => {
  await mockDb.login();
  mockDb.seedActiveBatch([
    { recipeId: "chana-dal", cookedOn: mockDb.today() },
  ]);

  await page.goto("/summary");

  await expect(
    page.getByRole("heading", { name: /shopping list/i }).first(),
  ).toBeVisible();
  await expect(page.getByText(/chana dal/i).first()).toBeVisible();
});

test("no active batch shows the playful empty state pointing at chat", async ({
  page,
  mockDb,
}) => {
  await mockDb.login(); // no batch seeded at all

  await page.goto("/summary");

  await expect(page.getByRole("heading", { name: /no active batch yet/i })).toBeVisible();
  await expect(page.getByText(/plan one in chat/i)).toBeVisible();
});
