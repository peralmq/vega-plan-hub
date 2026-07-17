import { test, expect } from "./support/mockDb";

// Proves the pipeline (build → preview → session seeding → route stubs) and the
// auth gating from design.spec.md: /welcome is the only public route; logged-out
// users are sent there, unknown routes redirect (to /welcome logged out, / in).

test.describe("smoke: auth gating", () => {
  test("logged-out user is redirected to the Landing page", async ({
    page,
  }) => {
    // No mockDb.login() → no seeded session → logged out.
    await page.goto("/");
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(
      page.getByRole("button", { name: /sign in with google/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /plan your perfect/i }),
    ).toBeVisible();
  });

  test("unknown route redirects a logged-out user to /welcome", async ({
    page,
  }) => {
    await page.goto("/this-route-does-not-exist");
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(
      page.getByRole("button", { name: /sign in with google/i }),
    ).toBeVisible();
  });

  test("unknown route redirects a logged-in user to Cook Mode (/)", async ({
    page,
    mockDb,
  }) => {
    await mockDb.login();
    await page.goto("/this-route-does-not-exist");
    await expect(page).toHaveURL(`${new URL("/", page.url()).origin}/`);
    // With no plan seeded, Cook Mode shows its empty state — but we are on "/".
    await expect(
      page.getByRole("heading", { name: /no meals planned for this week/i }),
    ).toBeVisible();
  });
});
