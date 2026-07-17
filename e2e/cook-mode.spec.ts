import { test, expect } from "./support/mockDb";

// Cook Mode is home: a signed-in user lands on tonight's meal (design.spec.md).
// Portion scaling is always visible and updates the ingredient list immediately.

const CHANA_DAL = "chana-dal";
const CHANA_DAL_TITLE = /chana dal/i;

test("cook mode shows tonight's meal and scaling updates ingredients", async ({
  page,
  mockDb,
}) => {
  // Seed a meal for *today* so Cook Mode's tonight-first default has content,
  // regardless of the day the suite runs.
  await mockDb.login();
  mockDb.seedCurrentWeek([
    { dayOfWeek: mockDb.todayDayOfWeek(), recipeId: CHANA_DAL },
  ]);

  await page.goto("/");

  // Tonight's recipe is on screen.
  await expect(
    page.getByRole("heading", { name: CHANA_DAL_TITLE }),
  ).toBeVisible();

  // Chana Dal is a 4-serving recipe.
  await expect(page.getByText("4 servings")).toBeVisible();

  // Ingredient list before scaling.
  const ingredientsCard = page.locator(
    'div:has(> h2:has-text("Ingredients"))',
  );
  const list = ingredientsCard.locator(".space-y-3").first();
  const before = await list.innerText();

  // Bump servings via the visible + stepper (the only lucide plus in Cook Mode).
  await page.locator("button:has(svg.lucide-plus)").first().click();

  // Servings and the ingredient quantities both update immediately.
  await expect(page.getByText("5 servings")).toBeVisible();
  const after = await list.innerText();
  expect(after).not.toBe(before);
});
