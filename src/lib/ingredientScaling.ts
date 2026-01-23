import type { ParsedIngredient } from '@/services/recipeLoader';

// Unit conversion table - units that can be converted between each other
interface UnitConversion {
  base: string; // The base unit (e.g., 'tsp')
  factor: number; // How many base units in this unit
  aliases: string[]; // Alternative names
}

interface UnitGroup {
  units: UnitConversion[];
}

// Define unit groups that can be converted between
const UNIT_GROUPS: UnitGroup[] = [
  // Volume - teaspoons/tablespoons/cups
  {
    units: [
      { base: 'tsp', factor: 1, aliases: ['teaspoon', 'teaspoons', 'tsp', 'tsps', 'tesked', 'tsk'] },
      { base: 'tbsp', factor: 3, aliases: ['tablespoon', 'tablespoons', 'tbsp', 'tbsps', 'matsked', 'msk'] },
      { base: 'cup', factor: 48, aliases: ['cup', 'cups', 'c'] },
    ]
  },
  // Volume - metric milliliters/liters
  {
    units: [
      { base: 'ml', factor: 1, aliases: ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'] },
      { base: 'cl', factor: 10, aliases: ['cl', 'centiliter', 'centiliters', 'centilitre', 'centilitres'] },
      { base: 'dl', factor: 100, aliases: ['dl', 'deciliter', 'deciliters', 'decilitre', 'decilitres'] },
      { base: 'l', factor: 1000, aliases: ['l', 'liter', 'liters', 'litre', 'litres'] },
    ]
  },
  // Weight - grams/kilograms
  {
    units: [
      { base: 'g', factor: 1, aliases: ['g', 'gram', 'grams'] },
      { base: 'kg', factor: 1000, aliases: ['kg', 'kilogram', 'kilograms', 'kilo', 'kilos'] },
    ]
  },
  // Weight - ounces/pounds
  {
    units: [
      { base: 'oz', factor: 1, aliases: ['oz', 'ounce', 'ounces'] },
      { base: 'lb', factor: 16, aliases: ['lb', 'lbs', 'pound', 'pounds'] },
    ]
  },
];

// Find the unit group and conversion for a given unit
function findUnitConversion(unit: string): { group: UnitGroup; conversion: UnitConversion } | null {
  const normalizedUnit = unit.toLowerCase().trim();
  for (const group of UNIT_GROUPS) {
    for (const conversion of group.units) {
      if (conversion.aliases.includes(normalizedUnit)) {
        return { group, conversion };
      }
    }
  }
  return null;
}

// Parse quantity string to number (handles fractions like "1/2", "1 1/2")
export function parseQuantity(quantityStr: string): number {
  if (!quantityStr || quantityStr.trim() === '') return 0;
  
  const trimmed = quantityStr.trim();
  
  // Handle mixed fractions like "1 1/2"
  const mixedMatch = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const num = parseInt(mixedMatch[2], 10);
    const denom = parseInt(mixedMatch[3], 10);
    return whole + (num / denom);
  }
  
  // Handle simple fractions like "1/2"
  const fractionMatch = trimmed.match(/^(\d+)\/(\d+)$/);
  if (fractionMatch) {
    const num = parseInt(fractionMatch[1], 10);
    const denom = parseInt(fractionMatch[2], 10);
    return num / denom;
  }
  
  // Handle ranges like "2-3" - use the first number
  const rangeMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*-\s*\d+/);
  if (rangeMatch) {
    return parseFloat(rangeMatch[1]);
  }
  
  // Handle decimal numbers
  const numMatch = trimmed.match(/^(\d+(?:\.\d+)?)/);
  if (numMatch) {
    return parseFloat(numMatch[1]);
  }
  
  return 0;
}

// Format a number as a nice quantity string (converts back to fractions when appropriate)
export function formatQuantity(value: number): string {
  if (value === 0) return '';
  
  // Handle common fractions
  const fractions: [number, string][] = [
    [0.125, '1/8'],
    [0.25, '1/4'],
    [0.333, '1/3'],
    [0.375, '3/8'],
    [0.5, '1/2'],
    [0.625, '5/8'],
    [0.666, '2/3'],
    [0.75, '3/4'],
    [0.875, '7/8'],
  ];
  
  const whole = Math.floor(value);
  const decimal = value - whole;
  
  // Check if the decimal part is close to a common fraction
  for (const [frac, fracStr] of fractions) {
    if (Math.abs(decimal - frac) < 0.05) {
      if (whole === 0) {
        return fracStr;
      }
      return `${whole} ${fracStr}`;
    }
  }
  
  // If close to a whole number, round it
  if (decimal < 0.05) {
    return whole.toString();
  }
  if (decimal > 0.95) {
    return (whole + 1).toString();
  }
  
  // Otherwise, use decimal with reasonable precision
  if (value < 10) {
    return value.toFixed(1).replace(/\.0$/, '');
  }
  return Math.round(value).toString();
}

// Optimize unit for readability (e.g., 6 tsp -> 2 tbsp)
function optimizeUnit(quantity: number, unit: string): { quantity: number; unit: string } {
  const found = findUnitConversion(unit);
  if (!found) {
    return { quantity, unit };
  }
  
  const { group, conversion } = found;
  
  // Convert to base units
  const baseQuantity = quantity * conversion.factor;
  
  // Find the best unit (smallest that gives a quantity >= 1, or largest if all < 1)
  // Sort units by factor descending
  const sortedUnits = [...group.units].sort((a, b) => b.factor - a.factor);
  
  for (const targetUnit of sortedUnits) {
    const targetQuantity = baseQuantity / targetUnit.factor;
    // Use this unit if it gives us a reasonable number (>= 0.25 and <= 100)
    if (targetQuantity >= 0.25 && targetQuantity <= 100) {
      return { quantity: targetQuantity, unit: targetUnit.base };
    }
  }
  
  // Fallback: just use the original unit with scaled quantity
  return { quantity, unit };
}

// Scale a single ingredient
export function scaleIngredient(
  ingredient: ParsedIngredient,
  originalServings: number,
  targetServings: number
): ParsedIngredient {
  const scaleFactor = targetServings / originalServings;
  const originalQuantity = parseQuantity(ingredient.quantity);
  
  // If no quantity, return as-is
  if (originalQuantity === 0 || !ingredient.unit) {
    return {
      ...ingredient,
      quantity: ingredient.quantity ? formatQuantity(originalQuantity * scaleFactor) || ingredient.quantity : '',
    };
  }
  
  // Scale and optimize
  const scaledQuantity = originalQuantity * scaleFactor;
  const optimized = optimizeUnit(scaledQuantity, ingredient.unit);
  
  return {
    ...ingredient,
    quantity: formatQuantity(optimized.quantity),
    unit: optimized.unit,
  };
}

// Scale all ingredients in a recipe
export function scaleIngredients(
  ingredients: ParsedIngredient[],
  originalServings: number,
  targetServings: number
): ParsedIngredient[] {
  return ingredients.map(ing => scaleIngredient(ing, originalServings, targetServings));
}

// Format an ingredient for display
export function formatIngredient(ingredient: ParsedIngredient): string {
  const parts: string[] = [];
  
  if (ingredient.quantity) {
    parts.push(ingredient.quantity);
  }
  
  if (ingredient.unit) {
    parts.push(ingredient.unit);
  }
  
  if (ingredient.ingredient) {
    parts.push(ingredient.ingredient);
  }
  
  const main = parts.join(' ');
  
  if (ingredient.notes) {
    return `${main} (${ingredient.notes})`;
  }
  
  return main;
}

// Get ingredient key for shopping list grouping
export function getIngredientKey(ingredient: ParsedIngredient): string {
  return ingredient.key || ingredient.ingredient.toLowerCase().trim();
}
