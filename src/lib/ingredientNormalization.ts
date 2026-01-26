import type { ParsedIngredient } from '@/services/recipeLoader';

// Ingredient name aliases - maps variations to a canonical name
const INGREDIENT_ALIASES: Record<string, string> = {
  // Onions
  'onion': 'onion',
  'onions': 'onion',
  'yellow onion': 'onion',
  'yellow onions': 'onion',
  'white onion': 'onion',
  'white onions': 'onion',
  'brown onion': 'onion',
  'brown onions': 'onion',
  'red onion': 'red onion',
  'red onions': 'red onion',
  
  // Garlic
  'garlic': 'garlic',
  'garlic clove': 'garlic',
  'garlic cloves': 'garlic',
  'clove garlic': 'garlic',
  'cloves garlic': 'garlic',
  'clove of garlic': 'garlic',
  'cloves of garlic': 'garlic',
  
  // Tomatoes
  'tomato': 'tomato',
  'tomatoes': 'tomato',
  'canned tomatoes': 'canned tomatoes',
  'crushed tomatoes': 'crushed tomatoes',
  'diced tomatoes': 'diced tomatoes',
  'tomato paste': 'tomato paste',
  'tomato puree': 'tomato puree',
  'tomato purée': 'tomato puree',
  
  // Oil
  'oil': 'oil',
  'olive oil': 'olive oil',
  'extra virgin olive oil': 'olive oil',
  'vegetable oil': 'vegetable oil',
  'canola oil': 'vegetable oil',
  'sunflower oil': 'vegetable oil',
  'cooking oil': 'vegetable oil',
  'neutral oil': 'vegetable oil',
  
  // Salt & Pepper
  'salt': 'salt',
  'sea salt': 'salt',
  'kosher salt': 'salt',
  'fine salt': 'salt',
  'table salt': 'salt',
  'pepper': 'black pepper',
  'black pepper': 'black pepper',
  'ground pepper': 'black pepper',
  'ground black pepper': 'black pepper',
  'freshly ground black pepper': 'black pepper',
  
  // Lentils
  'lentils': 'lentils',
  'lentil': 'lentils',
  'red lentils': 'red lentils',
  'green lentils': 'green lentils',
  'brown lentils': 'brown lentils',
  'black lentils': 'black lentils',
  'beluga lentils': 'black lentils',
  
  // Rice
  'rice': 'rice',
  'basmati rice': 'basmati rice',
  'jasmine rice': 'jasmine rice',
  'white rice': 'rice',
  'brown rice': 'brown rice',
  
  // Tofu
  'tofu': 'tofu',
  'firm tofu': 'firm tofu',
  'extra firm tofu': 'firm tofu',
  'silken tofu': 'silken tofu',
  'soft tofu': 'silken tofu',
  
  // Ginger
  'ginger': 'ginger',
  'fresh ginger': 'ginger',
  'ginger root': 'ginger',
  'minced ginger': 'ginger',
  'grated ginger': 'ginger',
  
  // Chili
  'chili': 'chili',
  'chilli': 'chili',
  'chilies': 'chili',
  'chillies': 'chili',
  'chili flakes': 'chili flakes',
  'chilli flakes': 'chili flakes',
  'red pepper flakes': 'chili flakes',
  'crushed red pepper': 'chili flakes',
  
  // Soy sauce
  'soy sauce': 'soy sauce',
  'soya sauce': 'soy sauce',
  'shoyu': 'soy sauce',
  'dark soy sauce': 'dark soy sauce',
  'light soy sauce': 'soy sauce',
  
  // Coconut milk
  'coconut milk': 'coconut milk',
  'coconut cream': 'coconut cream',
  'full fat coconut milk': 'coconut milk',
  'canned coconut milk': 'coconut milk',
  
  // Cumin
  'cumin': 'cumin',
  'ground cumin': 'cumin',
  'cumin powder': 'cumin',
  'cumin seeds': 'cumin seeds',
  
  // Coriander
  'coriander': 'coriander',
  'ground coriander': 'coriander',
  'coriander powder': 'coriander',
  'coriander seeds': 'coriander seeds',
  'fresh coriander': 'fresh cilantro',
  'cilantro': 'fresh cilantro',
  'fresh cilantro': 'fresh cilantro',
  
  // Turmeric
  'turmeric': 'turmeric',
  'ground turmeric': 'turmeric',
  'turmeric powder': 'turmeric',
  
  // Pasta
  'pasta': 'pasta',
  'spaghetti': 'spaghetti',
  'penne': 'penne',
  'rigatoni': 'rigatoni',
  'fusilli': 'fusilli',
  'tagliatelle': 'tagliatelle',
  'fettuccine': 'fettuccine',
  'linguine': 'linguine',
  
  // Cream
  'cream': 'cream',
  'heavy cream': 'cream',
  'whipping cream': 'cream',
  'double cream': 'cream',
  'single cream': 'light cream',
  'light cream': 'light cream',
  'oat cream': 'oat cream',
  'soy cream': 'soy cream',
  'vegan cream': 'vegan cream',
  
  // Broth/Stock
  'vegetable broth': 'vegetable broth',
  'vegetable stock': 'vegetable broth',
  'veggie broth': 'vegetable broth',
  'veggie stock': 'vegetable broth',
  'water': 'water',
};

// Normalize ingredient name to a canonical form
export function normalizeIngredientName(name: string): string {
  const lower = name.toLowerCase().trim();
  return INGREDIENT_ALIASES[lower] || lower;
}

// Unit conversion to metric
interface MetricConversion {
  metricUnit: string;
  factor: number; // multiply original by this to get metric
}

const IMPERIAL_TO_METRIC: Record<string, MetricConversion> = {
  // Volume
  'tsp': { metricUnit: 'ml', factor: 5 },
  'teaspoon': { metricUnit: 'ml', factor: 5 },
  'teaspoons': { metricUnit: 'ml', factor: 5 },
  'tbsp': { metricUnit: 'ml', factor: 15 },
  'tablespoon': { metricUnit: 'ml', factor: 15 },
  'tablespoons': { metricUnit: 'ml', factor: 15 },
  'cup': { metricUnit: 'ml', factor: 240 },
  'cups': { metricUnit: 'ml', factor: 240 },
  'c': { metricUnit: 'ml', factor: 240 },
  'fl oz': { metricUnit: 'ml', factor: 30 },
  'fluid ounce': { metricUnit: 'ml', factor: 30 },
  'fluid ounces': { metricUnit: 'ml', factor: 30 },
  'pint': { metricUnit: 'ml', factor: 473 },
  'pints': { metricUnit: 'ml', factor: 473 },
  'quart': { metricUnit: 'l', factor: 0.95 },
  'quarts': { metricUnit: 'l', factor: 0.95 },
  'gallon': { metricUnit: 'l', factor: 3.78 },
  'gallons': { metricUnit: 'l', factor: 3.78 },
  
  // Weight
  'oz': { metricUnit: 'g', factor: 28.35 },
  'ounce': { metricUnit: 'g', factor: 28.35 },
  'ounces': { metricUnit: 'g', factor: 28.35 },
  'lb': { metricUnit: 'g', factor: 454 },
  'lbs': { metricUnit: 'g', factor: 454 },
  'pound': { metricUnit: 'g', factor: 454 },
  'pounds': { metricUnit: 'g', factor: 454 },
};

// Already metric units that we optimize
const METRIC_UNITS: Record<string, { base: string; factor: number }> = {
  'ml': { base: 'ml', factor: 1 },
  'milliliter': { base: 'ml', factor: 1 },
  'milliliters': { base: 'ml', factor: 1 },
  'cl': { base: 'ml', factor: 10 },
  'centiliter': { base: 'ml', factor: 10 },
  'centiliters': { base: 'ml', factor: 10 },
  'dl': { base: 'ml', factor: 100 },
  'deciliter': { base: 'ml', factor: 100 },
  'deciliters': { base: 'ml', factor: 100 },
  'l': { base: 'ml', factor: 1000 },
  'liter': { base: 'ml', factor: 1000 },
  'liters': { base: 'ml', factor: 1000 },
  'litre': { base: 'ml', factor: 1000 },
  'litres': { base: 'ml', factor: 1000 },
  'g': { base: 'g', factor: 1 },
  'gram': { base: 'g', factor: 1 },
  'grams': { base: 'g', factor: 1 },
  'kg': { base: 'g', factor: 1000 },
  'kilogram': { base: 'g', factor: 1000 },
  'kilograms': { base: 'g', factor: 1000 },
  'kilo': { base: 'g', factor: 1000 },
  'kilos': { base: 'g', factor: 1000 },
};

// Parse quantity string to number
export function parseQuantity(quantityStr: string): number {
  if (!quantityStr || quantityStr.trim() === '') return 0;
  
  const trimmed = quantityStr.trim();
  
  // Handle mixed fractions like "1 1/2"
  const mixedMatch = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    return parseInt(mixedMatch[1], 10) + (parseInt(mixedMatch[2], 10) / parseInt(mixedMatch[3], 10));
  }
  
  // Handle simple fractions like "1/2"
  const fractionMatch = trimmed.match(/^(\d+)\/(\d+)$/);
  if (fractionMatch) {
    return parseInt(fractionMatch[1], 10) / parseInt(fractionMatch[2], 10);
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

// Format quantity nicely
export function formatQuantityMetric(value: number): string {
  if (value === 0) return '';
  
  // Round to reasonable precision
  if (value >= 100) {
    return Math.round(value).toString();
  }
  if (value >= 10) {
    return Math.round(value).toString();
  }
  if (value >= 1) {
    const rounded = Math.round(value * 10) / 10;
    return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(1);
  }
  // Small values
  const rounded = Math.round(value * 100) / 100;
  return rounded.toFixed(2).replace(/\.?0+$/, '');
}

// Convert to metric and optimize unit
export function toMetric(quantity: number, unit: string): { quantity: number; unit: string } {
  const lowerUnit = unit.toLowerCase().trim();
  
  // Check if it's an imperial unit that needs conversion
  const imperialConversion = IMPERIAL_TO_METRIC[lowerUnit];
  if (imperialConversion) {
    const metricValue = quantity * imperialConversion.factor;
    return optimizeMetricUnit(metricValue, imperialConversion.metricUnit);
  }
  
  // Check if it's already a metric unit
  const metricInfo = METRIC_UNITS[lowerUnit];
  if (metricInfo) {
    const baseValue = quantity * metricInfo.factor;
    return optimizeMetricUnit(baseValue, metricInfo.base);
  }
  
  // Unknown unit - return as-is
  return { quantity, unit };
}

// Optimize metric unit (e.g., 1500ml -> 1.5l, 1500g -> 1.5kg)
function optimizeMetricUnit(value: number, baseUnit: string): { quantity: number; unit: string } {
  if (baseUnit === 'ml') {
    if (value >= 1000) {
      return { quantity: value / 1000, unit: 'l' };
    }
    if (value >= 100) {
      return { quantity: value / 100, unit: 'dl' };
    }
    return { quantity: value, unit: 'ml' };
  }
  
  if (baseUnit === 'g') {
    if (value >= 1000) {
      return { quantity: value / 1000, unit: 'kg' };
    }
    return { quantity: value, unit: 'g' };
  }
  
  return { quantity: value, unit: baseUnit };
}

// Convert ingredient to metric
export function convertIngredientToMetric(ingredient: ParsedIngredient): ParsedIngredient {
  if (!ingredient.unit || !ingredient.quantity) {
    return ingredient;
  }
  
  const qty = parseQuantity(ingredient.quantity);
  if (qty === 0) {
    return ingredient;
  }
  
  const { quantity: metricQty, unit: metricUnit } = toMetric(qty, ingredient.unit);
  
  return {
    ...ingredient,
    quantity: formatQuantityMetric(metricQty),
    unit: metricUnit,
  };
}

// Get a normalized key for grouping ingredients
export function getNormalizedIngredientKey(ingredient: ParsedIngredient): string {
  const normalizedName = normalizeIngredientName(ingredient.ingredient);
  
  // For unit-based items, include unit type in key (volume vs weight)
  if (ingredient.unit) {
    const lowerUnit = ingredient.unit.toLowerCase();
    const isVolume = ['ml', 'l', 'dl', 'cl', 'cup', 'cups', 'tbsp', 'tsp', 'tablespoon', 'teaspoon'].includes(lowerUnit);
    const isWeight = ['g', 'kg', 'oz', 'lb', 'lbs', 'gram', 'grams', 'kilogram'].includes(lowerUnit);
    
    if (isVolume) return `${normalizedName}|volume`;
    if (isWeight) return `${normalizedName}|weight`;
  }
  
  return normalizedName;
}

// Aggregate ingredients - combine same ingredients with different quantities
export interface AggregatedIngredient {
  key: string;
  displayName: string;
  quantity: number; // In base metric units (ml or g)
  unit: string;
  recipes: string[];
  count: number; // For items without quantities
}

export function aggregateIngredients(
  ingredients: Array<{ ingredient: ParsedIngredient; recipeName: string }>
): AggregatedIngredient[] {
  const map = new Map<string, AggregatedIngredient>();
  
  for (const { ingredient, recipeName } of ingredients) {
    const key = getNormalizedIngredientKey(ingredient);
    const existing = map.get(key);
    
    // Convert to metric first
    const metric = convertIngredientToMetric(ingredient);
    const qty = parseQuantity(metric.quantity);
    
    // Convert to base units for aggregation
    let baseQty = qty;
    let baseUnit = metric.unit;
    
    if (metric.unit) {
      const metricInfo = METRIC_UNITS[metric.unit.toLowerCase()];
      if (metricInfo) {
        baseQty = qty * metricInfo.factor;
        baseUnit = metricInfo.base;
      }
    }
    
    if (existing) {
      // Add quantity
      if (baseQty > 0 && existing.unit === baseUnit) {
        existing.quantity += baseQty;
      } else if (baseQty === 0) {
        existing.count++;
      }
      
      if (!existing.recipes.includes(recipeName)) {
        existing.recipes.push(recipeName);
      }
    } else {
      map.set(key, {
        key,
        displayName: normalizeIngredientName(ingredient.ingredient),
        quantity: baseQty,
        unit: baseUnit,
        recipes: [recipeName],
        count: baseQty === 0 ? 1 : 0,
      });
    }
  }
  
  // Optimize units and sort
  return Array.from(map.values())
    .map(ing => {
      if (ing.quantity > 0 && ing.unit) {
        const optimized = optimizeMetricUnit(ing.quantity, ing.unit);
        return {
          ...ing,
          quantity: optimized.quantity,
          unit: optimized.unit,
        };
      }
      return ing;
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// Format aggregated ingredient for display
export function formatAggregatedIngredient(ing: AggregatedIngredient): string {
  if (ing.quantity > 0) {
    return `${formatQuantityMetric(ing.quantity)} ${ing.unit} ${ing.displayName}`;
  }
  if (ing.count > 1) {
    return `${ing.count}× ${ing.displayName}`;
  }
  return ing.displayName;
}
