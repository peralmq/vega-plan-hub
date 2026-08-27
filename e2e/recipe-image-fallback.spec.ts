import { test, expect } from "./support/mockDb";

// p4-13: no recipe ever renders imageless. `imageUrl` is a URL to a
// third-party site we don't control, so it can 404 or hotlink-block at any
// time — that's a runtime concern, not something `./harness validate-recipe`
// can catch (it stays offline and deterministic). The UI-level guarantee is
// the shared <RecipeImage> component (src/components/recipe/RecipeImage.tsx):
// an onError swaps a broken image for public/placeholder.svg. This test
// forces the real network image request to fail and asserts the fallback,
// not just that the URL string is present.

const CHANA_DAL = "chana-dal";
const CHANA_DAL_TITLE = /chana dal/i;
// Must match chana-dal.md's frontmatter `imageUrl` exactly (src/data/recipes/chana-dal.md).
const CHANA_DAL_IMAGE_URL =
  "https://indianenough.se/wp-content/uploads/2021/06/chana-dal1-1400x680.jpg";

test("a broken recipe image falls back to placeholder.svg, not a broken tile", async ({
  page,
  mockDb,
}) => {
  // Force the real image URL to fail, simulating a dead source-site link.
  await page.route(CHANA_DAL_IMAGE_URL, (route) =>
    route.fulfill({ status: 404, body: "not found" }),
  );

  await mockDb.login();
  mockDb.seedActiveBatch([{ recipeId: CHANA_DAL }]);

  await page.goto("/");

  const image = page.getByRole("img", { name: CHANA_DAL_TITLE });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", /\/placeholder\.svg$/);
});
