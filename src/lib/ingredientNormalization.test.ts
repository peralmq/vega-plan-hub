import { describe, expect, it } from 'vitest';
import {
  aggregateIngredients,
  convertIngredientToMetric,
  formatAggregatedIngredient,
  formatQuantityMetric,
  getNormalizedIngredientKey,
  normalizeIngredientName,
  parseQuantity,
  toMetric,
} from './ingredientNormalization';
import type { ParsedIngredient } from '@/services/recipeLoader';

const ingredient = (over: Partial<ParsedIngredient> = {}): ParsedIngredient => ({
  quantity: '',
  unit: '',
  key: '',
  ingredient: 'onion',
  notes: '',
  ...over,
});

describe('normalizeIngredientName', () => {
  it('collapses spelling/case variants to the canonical name', () => {
    expect(normalizeIngredientName('Onions')).toBe('onion');
    expect(normalizeIngredientName('yellow onion')).toBe('onion');
    expect(normalizeIngredientName('  Yellow Onions  ')).toBe('onion');
  });

  it('keeps distinct-but-related ingredients separate', () => {
    expect(normalizeIngredientName('red onion')).toBe('red onion');
    expect(normalizeIngredientName('onion')).toBe('onion');
  });

  it('merges alias spellings for the same ingredient', () => {
    expect(normalizeIngredientName('cilantro')).toBe('fresh cilantro');
    expect(normalizeIngredientName('fresh coriander')).toBe('fresh cilantro');
  });

  it('passes unknown ingredients through lowercased and trimmed', () => {
    expect(normalizeIngredientName('  Nutritional Yeast  ')).toBe('nutritional yeast');
  });
});

describe('parseQuantity', () => {
  it('parses whole, decimal, fraction, and mixed-fraction forms', () => {
    expect(parseQuantity('2')).toBe(2);
    expect(parseQuantity('1.5')).toBe(1.5);
    expect(parseQuantity('1/2')).toBe(0.5);
    expect(parseQuantity('1 1/2')).toBe(1.5);
  });

  it('returns 0 for empty or non-numeric quantities', () => {
    expect(parseQuantity('')).toBe(0);
    expect(parseQuantity('to serve')).toBe(0);
  });
});

describe('toMetric', () => {
  it('converts imperial volume units to metric with unit optimization', () => {
    expect(toMetric(1, 'tsp')).toEqual({ quantity: 5, unit: 'ml' });
    // 4 cups = 960ml; optimizeMetricUnit only escalates ml -> l at >= 1000.
    expect(toMetric(4, 'cup')).toEqual({ quantity: 9.6, unit: 'dl' });
  });

  it('converts imperial weight units to metric', () => {
    expect(toMetric(1, 'lb')).toEqual({ quantity: 454, unit: 'g' });
    expect(toMetric(1, 'oz')).toEqual({ quantity: 28.35, unit: 'g' });
  });

  it('normalizes already-metric units to a base unit', () => {
    // 500ml is < 1000, so it optimizes to dl, not l.
    expect(toMetric(500, 'ml')).toEqual({ quantity: 5, unit: 'dl' });
    // 1kg = 1000g; optimizeMetricUnit escalates g -> kg at >= 1000, so it
    // round-trips back to kg.
    expect(toMetric(1, 'kg')).toEqual({ quantity: 1, unit: 'kg' });
  });

  it('passes unknown units through unchanged', () => {
    expect(toMetric(2, 'bunch')).toEqual({ quantity: 2, unit: 'bunch' });
  });
});

describe('formatQuantityMetric', () => {
  it('returns an empty string for 0', () => {
    expect(formatQuantityMetric(0)).toBe('');
  });

  it('rounds large values to whole numbers', () => {
    expect(formatQuantityMetric(1500)).toBe('1500');
    expect(formatQuantityMetric(12)).toBe('12');
  });

  it('keeps one decimal place for values >= 1', () => {
    expect(formatQuantityMetric(1.25)).toBe('1.3');
    expect(formatQuantityMetric(2)).toBe('2');
  });

  it('keeps up to two decimals for small values', () => {
    // Math.round(0.125 * 100) / 100 rounds 12.5 up to 13 (JS round-half-up).
    expect(formatQuantityMetric(0.125)).toBe('0.13');
  });
});

describe('convertIngredientToMetric', () => {
  it('converts a quantity+unit ingredient to metric', () => {
    const result = convertIngredientToMetric(ingredient({ quantity: '1', unit: 'tbsp' }));
    expect(result.quantity).toBe('15');
    expect(result.unit).toBe('ml');
  });

  it('leaves ingredients without a unit or quantity unchanged (e.g. "to serve" rows)', () => {
    const result = convertIngredientToMetric(
      ingredient({ quantity: '', unit: '', ingredient: 'garam masala', notes: 'to serve' }),
    );
    expect(result.quantity).toBe('');
    expect(result.unit).toBe('');
  });
});

describe('getNormalizedIngredientKey', () => {
  it('tags volume-unit ingredients distinctly from weight-unit ones', () => {
    expect(getNormalizedIngredientKey(ingredient({ ingredient: 'oat cream', unit: 'dl' }))).toBe(
      'oat cream|volume',
    );
    expect(getNormalizedIngredientKey(ingredient({ ingredient: 'tofu', unit: 'g' }))).toBe(
      'tofu|weight',
    );
  });

  it('has no unit suffix for count-only ingredients', () => {
    expect(getNormalizedIngredientKey(ingredient({ ingredient: 'onion', unit: '' }))).toBe('onion');
  });
});

describe('aggregateIngredients', () => {
  it('sums quantities for the same normalized ingredient across recipes', () => {
    const result = aggregateIngredients([
      { ingredient: ingredient({ quantity: '1', unit: 'tbsp', ingredient: 'olive oil' }), recipeName: 'Recipe A' },
      { ingredient: ingredient({ quantity: '2', unit: 'tbsp', ingredient: 'extra virgin olive oil' }), recipeName: 'Recipe B' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe('olive oil');
    // 1 tbsp + 2 tbsp = 3 tbsp = 45ml, optimized to 4.5dl-scale? 45ml stays ml.
    expect(result[0].quantity).toBe(45);
    expect(result[0].unit).toBe('ml');
    expect(result[0].recipes).toEqual(['Recipe A', 'Recipe B']);
  });

  it('counts quantity-less ingredients instead of summing (e.g. "to serve" rows)', () => {
    const result = aggregateIngredients([
      { ingredient: ingredient({ ingredient: 'guacamole', notes: 'to serve' }), recipeName: 'Recipe A' },
      { ingredient: ingredient({ ingredient: 'guacamole', notes: 'to serve' }), recipeName: 'Recipe B' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(2);
    expect(result[0].quantity).toBe(0);
  });

  it('keeps ingredients with different units in different groups', () => {
    const result = aggregateIngredients([
      { ingredient: ingredient({ quantity: '100', unit: 'g', ingredient: 'tofu' }), recipeName: 'Recipe A' },
    ]);
    expect(result[0].key).toBe('tofu|weight');
  });

  it('sorts the result by display name', () => {
    const result = aggregateIngredients([
      { ingredient: ingredient({ quantity: '1', unit: 'g', ingredient: 'zucchini' }), recipeName: 'Recipe A' },
      { ingredient: ingredient({ quantity: '1', unit: 'g', ingredient: 'apple' }), recipeName: 'Recipe A' },
    ]);
    expect(result.map((r) => r.displayName)).toEqual(['apple', 'zucchini']);
  });
});

describe('formatAggregatedIngredient', () => {
  it('formats a quantity + unit + name', () => {
    expect(
      formatAggregatedIngredient({
        key: 'tofu|weight',
        displayName: 'tofu',
        quantity: 200,
        unit: 'g',
        recipes: ['A'],
        count: 0,
      }),
    ).toBe('200 g tofu');
  });

  it('formats a count for quantity-less items with count > 1', () => {
    expect(
      formatAggregatedIngredient({
        key: 'guacamole',
        displayName: 'guacamole',
        quantity: 0,
        unit: '',
        recipes: ['A', 'B'],
        count: 2,
      }),
    ).toBe('2× guacamole');
  });

  it('falls back to just the name for a single count-only item', () => {
    expect(
      formatAggregatedIngredient({
        key: 'guacamole',
        displayName: 'guacamole',
        quantity: 0,
        unit: '',
        recipes: ['A'],
        count: 1,
      }),
    ).toBe('guacamole');
  });
});
