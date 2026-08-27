import { describe, it, expect } from "vitest";
import type { ParsedRecipe } from "@/services/recipeLoader";
import {
  findDeepLinkRecipe,
  resolveServingsMultiplier,
  clampServingsMultiplier,
  MIN_SERVINGS_MULTIPLIER,
  MAX_SERVINGS_MULTIPLIER,
} from "./cookModeDeepLink";

function stubRecipe(id: string): ParsedRecipe {
  return {
    id,
    title: id,
    image: "",
    cookTime: 10,
    servings: 4,
    difficulty: "Easy",
    tags: [],
    theme: "",
    ingredients: [],
    instructions: [],
  };
}

const recipes = [stubRecipe("mapo-tofu"), stubRecipe("chana-dal")];

describe("findDeepLinkRecipe", () => {
  it("finds a recipe by exact id", () => {
    expect(findDeepLinkRecipe(recipes, "mapo-tofu")).toEqual(
      stubRecipe("mapo-tofu"),
    );
  });

  it("returns undefined for an unknown id (never throws)", () => {
    expect(findDeepLinkRecipe(recipes, "does-not-exist")).toBeUndefined();
  });

  it("returns undefined when the param is absent", () => {
    expect(findDeepLinkRecipe(recipes, null)).toBeUndefined();
  });
});

describe("clampServingsMultiplier", () => {
  it("passes values already in range through unchanged", () => {
    expect(clampServingsMultiplier(2)).toBe(2);
  });
  it("clamps values above the max down to the max", () => {
    expect(clampServingsMultiplier(100)).toBe(MAX_SERVINGS_MULTIPLIER);
  });
  it("clamps values below the min up to the min", () => {
    expect(clampServingsMultiplier(0)).toBe(MIN_SERVINGS_MULTIPLIER);
    expect(clampServingsMultiplier(-5)).toBe(MIN_SERVINGS_MULTIPLIER);
  });
});

describe("resolveServingsMultiplier", () => {
  it("uses the default when the param is absent", () => {
    expect(resolveServingsMultiplier(null, 1)).toBe(1);
    expect(resolveServingsMultiplier(null, 2)).toBe(2);
  });

  it("parses and clamps a valid float param", () => {
    expect(resolveServingsMultiplier("2", 1)).toBe(2);
    expect(resolveServingsMultiplier("1.5", 1)).toBe(1.5);
  });

  it("clamps an in-range-exceeding param to the allowed range", () => {
    expect(resolveServingsMultiplier("100", 1)).toBe(MAX_SERVINGS_MULTIPLIER);
    expect(resolveServingsMultiplier("0", 1)).toBe(MIN_SERVINGS_MULTIPLIER);
  });

  it("falls back to the default on a bad (unparseable) param, never crashing", () => {
    expect(resolveServingsMultiplier("banana", 1)).toBe(1);
    expect(resolveServingsMultiplier("banana", 2)).toBe(2);
    expect(resolveServingsMultiplier("", 1)).toBe(1);
    expect(resolveServingsMultiplier("NaN", 3)).toBe(3);
  });
});
