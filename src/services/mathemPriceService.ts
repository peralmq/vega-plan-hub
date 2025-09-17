// Mock Mathem.se price integration service
// In a real implementation, this would call their API or scrape their website

interface IngredientPrice {
  name: string;
  price: number; // SEK per unit
  unit: string;
  inStock: boolean;
  store: string;
}

interface PriceLookupResult {
  ingredient: string;
  price: number;
  unit: string;
  found: boolean;
  store: string;
}

// Mock price database based on typical Swedish grocery prices
const mockPriceDatabase: { [key: string]: IngredientPrice } = {
  // Pasta and grains
  "pasta": { name: "Pasta", price: 15.95, unit: "500g", inStock: true, store: "Mathem.se" },
  "arborio rice": { name: "Arborio Rice", price: 32.50, unit: "500g", inStock: true, store: "Mathem.se" },
  "jasmine rice": { name: "Jasmine Rice", price: 28.90, unit: "500g", inStock: true, store: "Mathem.se" },
  
  // Vegetables
  "cherry tomatoes": { name: "Cherry Tomatoes", price: 34.95, unit: "500g", inStock: true, store: "Mathem.se" },
  "bell peppers": { name: "Bell Peppers", price: 12.95, unit: "each", inStock: true, store: "Mathem.se" },
  "broccoli": { name: "Broccoli", price: 22.95, unit: "400g", inStock: true, store: "Mathem.se" },
  "carrots": { name: "Carrots", price: 15.50, unit: "1kg", inStock: true, store: "Mathem.se" },
  "mushrooms": { name: "Mushrooms", price: 42.90, unit: "500g", inStock: true, store: "Mathem.se" },
  "onion": { name: "Yellow Onion", price: 18.95, unit: "1kg", inStock: true, store: "Mathem.se" },
  "garlic": { name: "Garlic", price: 24.95, unit: "250g", inStock: true, store: "Mathem.se" },
  "ginger": { name: "Fresh Ginger", price: 89.50, unit: "100g", inStock: true, store: "Mathem.se" },
  "lime": { name: "Lime", price: 8.95, unit: "each", inStock: true, store: "Mathem.se" },
  
  // Pantry items
  "olive oil": { name: "Extra Virgin Olive Oil", price: 69.95, unit: "500ml", inStock: true, store: "Mathem.se" },
  "sesame oil": { name: "Sesame Oil", price: 45.90, unit: "250ml", inStock: true, store: "Mathem.se" },
  "soy sauce": { name: "Soy Sauce", price: 32.95, unit: "500ml", inStock: true, store: "Mathem.se" },
  "coconut milk": { name: "Coconut Milk", price: 18.95, unit: "400ml", inStock: true, store: "Mathem.se" },
  "vegetable broth": { name: "Vegetable Broth", price: 12.95, unit: "1L", inStock: true, store: "Mathem.se" },
  "white wine": { name: "White Cooking Wine", price: 59.90, unit: "750ml", inStock: true, store: "Mathem.se" },
  "nutritional yeast": { name: "Nutritional Yeast", price: 89.50, unit: "200g", inStock: true, store: "Mathem.se" },
  "thai green curry paste": { name: "Thai Green Curry Paste", price: 32.95, unit: "100g", inStock: true, store: "Mathem.se" },
  "lentils": { name: "Red Lentils", price: 24.95, unit: "500g", inStock: true, store: "Mathem.se" },
  
  // Fresh herbs
  "fresh basil": { name: "Fresh Basil", price: 24.95, unit: "20g", inStock: true, store: "Mathem.se" },
  "thai basil": { name: "Thai Basil", price: 34.95, unit: "20g", inStock: true, store: "Mathem.se" },
  
  // Other
  "olives": { name: "Green Olives", price: 28.95, unit: "200g", inStock: true, store: "Mathem.se" },
  "vegetables mix": { name: "Frozen Vegetable Mix", price: 25.90, unit: "500g", inStock: true, store: "Mathem.se" },
};

export class MathemPriceService {
  private static readonly CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
  private static cache: Map<string, { data: PriceLookupResult; timestamp: number }> = new Map();

  /**
   * Simulates fetching ingredient prices from Mathem.se
   * In a real implementation, this would make HTTP requests to their API/website
   */
  static async lookupPrice(ingredient: string): Promise<PriceLookupResult> {
    // Check cache first
    const cacheKey = ingredient.toLowerCase();
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 200));

    // Find ingredient in mock database
    const normalizedIngredient = this.normalizeIngredientName(ingredient);
    const priceData = mockPriceDatabase[normalizedIngredient];

    const result: PriceLookupResult = {
      ingredient,
      price: priceData?.price || 0,
      unit: priceData?.unit || 'unit',
      found: !!priceData,
      store: 'Mathem.se'
    };

    // Cache the result
    this.cache.set(cacheKey, { data: result, timestamp: Date.now() });

    return result;
  }

  /**
   * Lookup prices for multiple ingredients at once
   */
  static async lookupMultiplePrices(ingredients: string[]): Promise<PriceLookupResult[]> {
    const promises = ingredients.map(ingredient => this.lookupPrice(ingredient));
    return Promise.all(promises);
  }

  /**
   * Calculate total cost for a list of ingredients
   */
  static async calculateTotalCost(ingredients: string[]): Promise<{
    totalCost: number;
    itemCosts: PriceLookupResult[];
    currency: string;
  }> {
    const itemCosts = await this.lookupMultiplePrices(ingredients);
    const totalCost = itemCosts
      .filter(item => item.found)
      .reduce((sum, item) => sum + item.price, 0);

    return {
      totalCost: Math.round(totalCost * 100) / 100, // Round to 2 decimal places
      itemCosts,
      currency: 'SEK'
    };
  }

  /**
   * Normalize ingredient names for better matching
   */
  private static normalizeIngredientName(ingredient: string): string {
    return ingredient
      .toLowerCase()
      .replace(/\([^)]*\)/g, '') // Remove parentheses and their content
      .replace(/\d+\s*(g|kg|ml|l|cl|dl|pieces?|cloves?|large|medium|small)/gi, '') // Remove quantities
      .replace(/fresh|dried|chopped|sliced|diced/gi, '') // Remove descriptors
      .trim();
  }

  /**
   * Get currency symbol
   */
  static getCurrencySymbol(): string {
    return 'kr'; // Swedish kronor
  }

  /**
   * Format price for display
   */
  static formatPrice(price: number): string {
    return `${price.toFixed(2)} kr`;
  }
}
