import { describe, expect, it } from "vitest";
import { resolveAssetSrc } from "./resolveAssetSrc";

describe("resolveAssetSrc", () => {
  it("prefixes root-relative paths with the Pages base", () => {
    expect(resolveAssetSrc("/recipes/mapo-tofu.webp", "/vega-plan-hub/")).toBe(
      "/vega-plan-hub/recipes/mapo-tofu.webp",
    );
    expect(resolveAssetSrc("/placeholder.svg", "/vega-plan-hub/")).toBe(
      "/vega-plan-hub/placeholder.svg",
    );
  });

  it("is a no-op at root base (dev/Lovable)", () => {
    expect(resolveAssetSrc("/recipes/mapo-tofu.webp", "/")).toBe(
      "/recipes/mapo-tofu.webp",
    );
  });

  it("leaves external and protocol-relative URLs untouched", () => {
    expect(
      resolveAssetSrc("https://example.com/a.jpg", "/vega-plan-hub/"),
    ).toBe("https://example.com/a.jpg");
    expect(resolveAssetSrc("//cdn.example.com/a.jpg", "/vega-plan-hub/")).toBe(
      "//cdn.example.com/a.jpg",
    );
  });
});
