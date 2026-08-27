import { test, expect } from "./support/mockDb";

// Cook Mode (p4-12): tonight's pick comes from the active batch's remaining
// pool (design.spec.md). Picking a dish stamps it cooked for today and shows
// its detail; portion scaling is always visible and updates the ingredient
// list immediately; an undo lets you correct a same-day mistake.

const CHANA_DAL = "chana-dal";
const CHANA_DAL_TITLE = /chana dal/i;

test("picking a dish from the pool shows its detail and scaling updates ingredients", async ({
  page,
  mockDb,
}) => {
  await mockDb.login();
  mockDb.seedActiveBatch([{ recipeId: CHANA_DAL }]);

  await page.goto("/");

  // The picker shows the remaining pool.
  await expect(page.getByText(/what's for dinner tonight/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: CHANA_DAL_TITLE })).toBeVisible();

  await page.getByRole("button", { name: /cook this/i }).click();

  // Picking swaps the picker for the recipe detail.
  await expect(page.getByText(/tonight's pick/i).first()).toBeVisible();
  await expect(page.getByText("4 servings")).toBeVisible(); // Chana Dal is 4-serving

  const ingredientsCard = page.locator(
    'div:has(> h2:has-text("Ingredients"))',
  );
  const list = ingredientsCard.locator(".space-y-3").first();
  const before = await list.innerText();

  await page.locator("button:has(svg.lucide-plus)").first().click();

  await expect(page.getByText("5 servings")).toBeVisible();
  const after = await list.innerText();
  expect(after).not.toBe(before);
});

test("undo returns a same-day pick to the pool", async ({ page, mockDb }) => {
  await mockDb.login();
  mockDb.seedActiveBatch([
    { recipeId: CHANA_DAL, cookedOn: mockDb.today() },
  ]);

  await page.goto("/");

  // Already picked today: detail shows directly, with an undo action.
  await expect(page.getByRole("heading", { name: CHANA_DAL_TITLE })).toBeVisible();
  await page.getByRole("button", { name: /undo/i }).click();

  // Back to the picker.
  await expect(page.getByText(/what's for dinner tonight/i)).toBeVisible();
});

test("a fully-cooked batch shows the completion state", async ({ page, mockDb }) => {
  await mockDb.login();
  mockDb.seedActiveBatch([
    { recipeId: CHANA_DAL, cookedOn: mockDb.isoDaysFromToday(-1) },
  ]);

  await page.goto("/");

  await expect(page.getByText(/everything's cooked/i)).toBeVisible();
  await expect(page.getByText(CHANA_DAL_TITLE).first()).toBeVisible();
});

test("no active batch shows the playful empty state pointing at chat", async ({
  page,
  mockDb,
}) => {
  await mockDb.login(); // no batch seeded at all

  await page.goto("/");

  await expect(page.getByRole("heading", { name: /no active batch yet/i })).toBeVisible();
  await expect(page.getByText(/plan one in chat/i)).toBeVisible();
});
