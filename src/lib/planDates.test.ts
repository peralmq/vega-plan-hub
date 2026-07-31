import { describe, it, expect } from "vitest";
import {
  toISODate,
  mondayOf,
  dateForDayOfWeek,
  weekWindow,
  dayOfWeekWithin,
  rowsToWeekMeals,
  todayIndex,
} from "./planDates";

// Fixed dates chosen to cross month and year boundaries; constructed with
// (y, m, d) so they are local-time and immune to the runner's timezone.
const wed = new Date(2026, 6, 29); // Wed 2026-07-29
const sun = new Date(2026, 7, 2); //  Sun 2026-08-02
const newYearsDay = new Date(2026, 0, 1); // Thu 2026-01-01

describe("mondayOf", () => {
  it("returns the same day for a Monday", () => {
    expect(toISODate(mondayOf(new Date(2026, 6, 27)))).toBe("2026-07-27");
  });
  it("returns the preceding Monday mid-week", () => {
    expect(toISODate(mondayOf(wed))).toBe("2026-07-27");
  });
  it("treats Sunday as the last day of the week (Monday start)", () => {
    expect(toISODate(mondayOf(sun))).toBe("2026-07-27");
  });
  it("crosses a year boundary backwards", () => {
    expect(toISODate(mondayOf(newYearsDay))).toBe("2025-12-29");
  });
});

describe("dateForDayOfWeek (the backfill arithmetic: week_start + day_of_week)", () => {
  const monday = new Date(2026, 6, 27);
  it("day 0 is the Monday itself", () => {
    expect(dateForDayOfWeek(monday, 0)).toBe("2026-07-27");
  });
  it("crosses a month boundary (Sat of the 2026-07-27 week is Aug 1)", () => {
    expect(dateForDayOfWeek(monday, 5)).toBe("2026-08-01");
  });
  it("crosses a year boundary (Thu of the 2025-12-29 week is Jan 1)", () => {
    expect(dateForDayOfWeek(new Date(2025, 11, 29), 3)).toBe("2026-01-01");
  });
});

describe("weekWindow", () => {
  it("spans Monday..Sunday inclusive", () => {
    expect(weekWindow(new Date(2026, 6, 27))).toEqual({
      start: "2026-07-27",
      end: "2026-08-02",
    });
  });
});

describe("dayOfWeekWithin", () => {
  const monday = new Date(2026, 6, 27);
  it("maps window dates to 0..6", () => {
    expect(dayOfWeekWithin("2026-07-27", monday)).toBe(0);
    expect(dayOfWeekWithin("2026-08-01", monday)).toBe(5);
    expect(dayOfWeekWithin("2026-08-02", monday)).toBe(6);
  });
  it("returns null outside the window", () => {
    expect(dayOfWeekWithin("2026-07-26", monday)).toBeNull();
    expect(dayOfWeekWithin("2026-08-03", monday)).toBeNull();
  });
});

describe("rowsToWeekMeals", () => {
  const monday = new Date(2026, 6, 27);
  it("keeps only the window, sorts by day, defaults null multiplier to 1", () => {
    const meals = rowsToWeekMeals(
      [
        { meal_date: "2026-08-01", recipe_id: "tacos", servings_multiplier: 2 },
        { meal_date: "2026-07-26", recipe_id: "outside-before", servings_multiplier: 1 },
        { meal_date: "2026-07-27", recipe_id: "dal", servings_multiplier: null },
        { meal_date: "2026-08-03", recipe_id: "outside-after", servings_multiplier: 1 },
      ],
      monday,
    );
    expect(meals).toEqual([
      { dayOfWeek: 0, recipeId: "dal", servingsMultiplier: 1 },
      { dayOfWeek: 5, recipeId: "tacos", servingsMultiplier: 2 },
    ]);
  });
});

describe("todayIndex", () => {
  it("maps Monday to 0 and Sunday to 6", () => {
    expect(todayIndex(new Date(2026, 6, 27))).toBe(0);
    expect(todayIndex(sun)).toBe(6);
  });
});
