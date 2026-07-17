import { describe, expect, it } from 'vitest';
import {
  formatIngredient,
  formatQuantity,
  getIngredientKey,
  parseQuantity,
  scaleIngredient,
  scaleIngredients,
} from './ingredientScaling';
import type { ParsedIngredient } from '@/services/recipeLoader';

const ingredient = (over: Partial<ParsedIngredient> = {}): ParsedIngredient => ({
  quantity: '',
  unit: '',
  key: '',
  ingredient: 'onion',
  notes: '',
  ...over,
});

describe('parseQuantity', () => {
  it('parses whole numbers', () => {
    expect(parseQuantity('2')).toBe(2);
  });

  it('parses decimals', () => {
    expect(parseQuantity('1.5')).toBe(1.5);
  });

  it('parses simple fractions', () => {
    expect(parseQuantity('1/2')).toBe(0.5);
  });

  it('parses mixed fractions', () => {
    expect(parseQuantity('1 1/2')).toBe(1.5);
  });

  it('parses ranges by taking the first number', () => {
    expect(parseQuantity('2-3')).toBe(2);
  });

  it('returns 0 for empty or non-numeric input', () => {
    expect(parseQuantity('')).toBe(0);
    expect(parseQuantity('   ')).toBe(0);
    expect(parseQuantity('to taste')).toBe(0);
  });
});

describe('formatQuantity', () => {
  it('returns an empty string for 0', () => {
    expect(formatQuantity(0)).toBe('');
  });

  it('rounds to the nearest whole number when very close', () => {
    expect(formatQuantity(2.02)).toBe('2');
    expect(formatQuantity(2.97)).toBe('3');
  });

  it('formats common fractions below one', () => {
    expect(formatQuantity(0.5)).toBe('1/2');
    expect(formatQuantity(0.25)).toBe('1/4');
  });

  it('formats mixed whole + fraction values', () => {
    expect(formatQuantity(1.5)).toBe('1 1/2');
  });

  // Bug-shaped case: 0.6667 sits close to both 5/8 (0.625, diff 0.0417) and
  // 2/3 (0.666, diff 0.0007). The fractions table is scanned in a fixed
  // order and previously returned the *first* candidate under the 0.05
  // tolerance (5/8) rather than the *closest* one (2/3), producing a wrong
  // display value whenever a scale factor lands two candidate fractions
  // inside the same tolerance band. See scaleIngredient test below for the
  // end-to-end symptom (doubling "1 tsp" mislabeled as "5/8 tbsp").
  it('picks the closest matching fraction, not the first one within tolerance', () => {
    expect(formatQuantity(2 + 2 / 3)).toBe('2 2/3');
  });

  it('falls back to one decimal place for values with no close fraction', () => {
    expect(formatQuantity(1.8)).toBe('1.8');
  });
});

describe('scaleIngredient', () => {
  it('scales a plain quantity+unit ingredient by the servings ratio', () => {
    const result = scaleIngredient(ingredient({ quantity: '100', unit: 'g' }), 2, 4);
    expect(result.quantity).toBe('200');
    expect(result.unit).toBe('g');
  });

  it('leaves ingredients without a quantity unchanged (e.g. "to serve" rows)', () => {
    const result = scaleIngredient(
      ingredient({ quantity: '', unit: '', ingredient: 'garam masala', notes: 'to serve' }),
      4,
      8,
    );
    expect(result.quantity).toBe('');
    expect(result.notes).toBe('to serve');
  });

  it('leaves quantity-only ingredients (no unit) scaled numerically', () => {
    const result = scaleIngredient(ingredient({ quantity: '2', unit: '', ingredient: 'onion' }), 2, 4);
    expect(result.quantity).toBe('4');
  });

  // Bug-shaped case: doubling "1 tsp" (4 -> 8 servings) converts to base
  // units (2 tsp), then optimizeUnit rounds up to tbsp (2/3 tbsp) since a
  // 0.6667 quantity clears the >=0.25 usability threshold. formatQuantity's
  // nearest-fraction fix (above) makes this land on the correct "2/3", not
  // the previously-wrong "5/8".
  it('formats a doubled small quantity with the closest fraction after unit optimization', () => {
    const result = scaleIngredient(ingredient({ quantity: '1', unit: 'tsp' }), 4, 8);
    expect(result).toEqual({ ...ingredient(), quantity: '2/3', unit: 'tbsp' });
  });

  it('scales down and keeps a sensible unit', () => {
    const result = scaleIngredient(ingredient({ quantity: '2', unit: 'tbsp' }), 4, 2);
    expect(result.quantity).toBe('1');
    expect(result.unit).toBe('tbsp');
  });
});

describe('scaleIngredients', () => {
  it('scales every ingredient in the list', () => {
    const list = [
      ingredient({ quantity: '1', unit: 'cup', ingredient: 'rice' }),
      ingredient({ quantity: '2', unit: 'g', ingredient: 'salt' }),
    ];
    const result = scaleIngredients(list, 2, 4);
    expect(result).toHaveLength(2);
    expect(result[0].quantity).toBe('2');
    expect(result[1].quantity).toBe('4');
  });
});

describe('formatIngredient', () => {
  it('joins quantity, unit, and ingredient', () => {
    expect(
      formatIngredient(ingredient({ quantity: '2', unit: 'tbsp', ingredient: 'olive oil' })),
    ).toBe('2 tbsp olive oil');
  });

  it('appends notes in parentheses when present', () => {
    expect(
      formatIngredient(
        ingredient({ quantity: '1', unit: 'tsp', ingredient: 'salt', notes: 'to taste' }),
      ),
    ).toBe('1 tsp salt (to taste)');
  });

  it('omits empty quantity/unit segments', () => {
    expect(formatIngredient(ingredient({ ingredient: 'guacamole', notes: 'to serve' }))).toBe(
      'guacamole (to serve)',
    );
  });
});

describe('getIngredientKey', () => {
  it('prefers the explicit key field', () => {
    expect(getIngredientKey(ingredient({ key: 'yellow-onion', ingredient: 'onion' }))).toBe(
      'yellow-onion',
    );
  });

  it('falls back to a lowercased, trimmed ingredient name', () => {
    expect(getIngredientKey(ingredient({ key: '', ingredient: '  Red Onion  ' }))).toBe(
      'red onion',
    );
  });
});
