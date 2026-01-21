# Agents.md - AI Agent Instructions for Vega Plan Hub

This file provides guidance for AI coding agents (GitHub Copilot, Cursor, Windsurf, etc.) working on the Vega Plan Hub codebase. It complements `.github/copilot-instructions.md` with agent-specific workflows and patterns.

## Agent Identity & Purpose

You are an AI assistant helping developers build and maintain Vega Plan Hub, a vegan meal planning application with a playful, colorful design. Your role is to:

1. **Generate idiomatic code** that follows established patterns
2. **Maintain consistency** with the existing design system
3. **Preserve playfulness** - this is a fun, emoji-filled app
4. **Work incrementally** - make small, focused changes
5. **Respect constraints** - work within the client-side architecture

## Quick Reference

### Key Patterns to Follow

```typescript
// ✅ Component structure
export const ComponentName = ({ prop1, prop2 }: ComponentProps) => {
  const [state, setState] = useState<Type>(initialValue);
  
  useEffect(() => {
    // Side effects
  }, [dependencies]);
  
  return (
    <div className={cn("base-classes", conditionalClasses)}>
      {/* Content with emojis */}
    </div>
  );
};

// ✅ Import pattern
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMealPlans } from "@/hooks/useMealPlans";

// ✅ Service pattern
export class ServiceName {
  private static cache = new Map();
  
  static async method(param: string): Promise<Result> {
    // Implementation with caching
  }
}
```

### Common Tasks

| Task | Action |
|------|--------|
| Add new page | Create in `src/pages/`, add route in `App.tsx` before `*` |
| Add component | Create in `src/components/`, use named export |
| Add UI component | Run `npx shadcn@latest add [component]` |
| Style element | Use `cn()` with design tokens (no arbitrary colors) |
| Store data | Use `useMealPlans` hook with localStorage |
| Add emoji | Use food/cooking emojis consistently (✨🍽️👨‍🍳⏰) |

## Agent Workflow

### Before Making Changes

1. **Understand the context:**
   - What feature is being added/modified?
   - Which components/files are affected?
   - What patterns are used in similar code?

2. **Check existing patterns:**
   ```bash
   # Search for similar components
   grep -r "similar-pattern" src/
   
   # View related files
   ls src/components/
   ```

3. **Verify design tokens:**
   - Check `src/index.css` for available colors, gradients, shadows
   - Review `tailwind.config.ts` for theme configuration

### While Making Changes

1. **Follow the component checklist:**
   - [ ] TypeScript interface defined
   - [ ] Props use camelCase
   - [ ] Imports use `@/` alias
   - [ ] Styling uses `cn()` utility
   - [ ] Design tokens used (no arbitrary colors)
   - [ ] Emojis included appropriately
   - [ ] Lists have stable keys
   - [ ] Async operations cleaned up

2. **Test incrementally:**
   ```bash
   # Run dev server
   npm run dev
   
   # Run linter
   npm run lint
   ```

### After Making Changes

1. **Verify integration:**
   - Does it work with existing features?
   - Is the styling consistent?
   - Are emojis used appropriately?

2. **Check for issues:**
   ```bash
   # Lint the code
   npm run lint
   
   # Build to catch type errors
   npm run build
   ```

## Common Agent Scenarios

### Scenario 1: Adding a New Recipe Component

**Request:** "Create a component to display recipe nutritional information"

**Agent Response Pattern:**

1. Create interface in the component file:
```typescript
interface NutritionInfoProps {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

export const NutritionInfo = ({ 
  calories, 
  protein, 
  carbs, 
  fat 
}: NutritionInfoProps) => {
  return (
    <Card className="p-4">
      <h3 className="font-bold mb-2">Nutrition Facts 🥗</h3>
      <div className="space-y-1 text-sm">
        {calories && <p>Calories: {calories} kcal 🔥</p>}
        {protein && <p>Protein: {protein}g 💪</p>}
        {carbs && <p>Carbs: {carbs}g 🌾</p>}
        {fat && <p>Fat: {fat}g 🥑</p>}
      </div>
    </Card>
  );
};
```

2. Import in parent component using `@/`:
```typescript
import { NutritionInfo } from "@/components/NutritionInfo";
```

3. Use appropriate emojis and design tokens

### Scenario 2: Adding a New Page

**Request:** "Create a favorites page for saved recipes"

**Agent Response Pattern:**

1. Create `src/pages/Favorites.tsx`:
```typescript
import { Navigation } from "@/components/Navigation";
import { RecipeCard } from "@/components/RecipeCard";

const Favorites = () => {
  // Logic here
  
  return (
    <div className="min-h-screen">
      <Navigation />
      <main className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-6">
          Your Favorite Recipes ⭐
        </h1>
        {/* Content */}
      </main>
    </div>
  );
};

export default Favorites;
```

2. Add route in `src/App.tsx` BEFORE the catch-all:
```typescript
<Route path="/favorites" element={<Favorites />} />
{/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
<Route path="*" element={<NotFound />} />
```

3. Add navigation link in `Navigation` component

### Scenario 3: Styling a Component

**Request:** "Style this button to match the app's design"

**Agent Response Pattern:**

1. Use design tokens, not arbitrary values:
```typescript
// ❌ Wrong
<Button className="bg-[#9b59b6] text-white">
  Click me
</Button>

// ✅ Correct
<Button className="bg-gradient-fun text-white rounded-xl hover:scale-105 transition-transform">
  Click me ✨
</Button>
```

2. Apply hover effects and transitions:
```typescript
<Card className="hover:shadow-glow transition-all duration-300 hover:-translate-y-2">
```

3. Use `cn()` for conditional classes:
```typescript
<Badge className={cn(
  "rounded-xl border-0",
  isActive && "bg-gradient-fresh",
  !isActive && "bg-muted"
)}>
```

### Scenario 4: Working with State

**Request:** "Add functionality to favorite a recipe"

**Agent Response Pattern:**

1. Use localStorage pattern with error handling:
```typescript
const [favorites, setFavorites] = useState<string[]>([]);

useEffect(() => {
  const stored = localStorage.getItem('favorites');
  if (stored) {
    try {
      setFavorites(JSON.parse(stored));
    } catch (error) {
      console.error('Failed to load favorites:', error);
    }
  }
}, []);

const toggleFavorite = (recipeId: string) => {
  const newFavorites = favorites.includes(recipeId)
    ? favorites.filter(id => id !== recipeId)
    : [...favorites, recipeId];
  
  setFavorites(newFavorites);
  localStorage.setItem('favorites', JSON.stringify(newFavorites));
};
```

2. Sync state and localStorage together

### Scenario 5: Creating a Service

**Request:** "Create a service to handle recipe filtering"

**Agent Response Pattern:**

1. Create service class with static methods:
```typescript
// src/services/recipeFilterService.ts
export class RecipeFilterService {
  static filterByDifficulty(
    recipes: Recipe[], 
    difficulty: string
  ): Recipe[] {
    return recipes.filter(r => r.difficulty === difficulty);
  }
  
  static filterByTags(
    recipes: Recipe[], 
    tags: string[]
  ): Recipe[] {
    return recipes.filter(r => 
      tags.some(tag => r.tags.includes(tag))
    );
  }
  
  static sortByPopularity(recipes: Recipe[]): Recipe[] {
    // Implementation
  }
}
```

2. Use from components:
```typescript
const filtered = RecipeFilterService.filterByDifficulty(recipes, 'Easy');
```

## Agent Constraints

### DO ✅

1. **Always use TypeScript interfaces** for props and data structures
2. **Always use `@/` imports** for src files
3. **Always use `cn()`** for merging Tailwind classes
4. **Always add emojis** to user-facing text (food, cooking, time emojis)
5. **Always use design tokens** (colors, gradients, shadows from index.css)
6. **Always handle localStorage errors** with try-catch
7. **Always add routes before catch-all** in App.tsx
8. **Always provide stable keys** in list renders
9. **Always use shadcn-ui components** when available
10. **Always clean up async operations** in useEffect

### DON'T ❌

1. **Never skip TypeScript types** completely
2. **Never use relative imports** from src/ (use `@/`)
3. **Never use arbitrary color values** (no `bg-[#hex]`)
4. **Never forget emojis** in user-facing text
5. **Never assume localStorage works** without error handling
6. **Never add routes after catch-all** (`*` route)
7. **Never use array indices** as keys
8. **Never create basic components** that shadcn-ui provides
9. **Never put business logic** in component files (use services)
10. **Never modify shadcn-ui components** directly (extend them)

## Design System Quick Reference

### Colors

Use these semantic tokens (defined in `src/index.css`):

```typescript
// Primary colors
"bg-primary"        // Purple
"bg-secondary"      // Soft yellow
"bg-accent"         // Orange
"bg-destructive"    // Red

// Custom colors
"bg-forest"         // Green
"bg-citrus"         // Yellow
"bg-carrot"         // Orange
"bg-berry"          // Purple-pink
"bg-avocado"        // Green-yellow

// Gradients (use as className)
"bg-gradient-primary"  // Purple to berry
"bg-gradient-fresh"    // Green gradient
"bg-gradient-warm"     // Yellow to orange
"bg-gradient-fun"      // Multi-color
```

### Shadows

```typescript
"shadow-fresh"      // Green shadow
"shadow-glow"       // Purple glow
"shadow-playful"    // Purple bounce shadow
```

### Emojis by Category

```typescript
// Food
🥗 🥕 🥑 🍅 🥦 🫑 🌽 🥔 🍠 🥒

// Cooking
👨‍🍳 👩‍🍳 🔪 🍳 🥘 🍲 🥗 🍽️

// Time
⏰ ⏱️ ⏳ 🕐

// Quality
✨ ⭐ 💫 🌟

// Actions
⚡ 💰 🛒 📝 ❤️ 💚

// Celebration
🎉 🎊 🎈
```

## Error Handling Patterns

### localStorage Operations

```typescript
// ✅ Always wrap in try-catch
try {
  const data = localStorage.getItem(key);
  if (data) {
    const parsed = JSON.parse(data);
    // Use parsed data
  }
} catch (error) {
  console.error('Failed to load data:', error);
  // Handle error gracefully
}
```

### Async Operations

```typescript
// ✅ Include cleanup
useEffect(() => {
  let cancelled = false;
  
  const fetchData = async () => {
    try {
      const result = await someAsyncOperation();
      if (!cancelled) {
        setData(result);
      }
    } catch (error) {
      if (!cancelled) {
        console.error('Error:', error);
      }
    }
  };
  
  fetchData();
  
  return () => {
    cancelled = true;
  };
}, []);
```

## Testing Guidelines

Currently, no testing infrastructure exists. When adding tests:

1. **Use Vitest** for unit tests
2. **Use React Testing Library** for component tests
3. **Test user interactions**, not implementation details
4. **Mock localStorage** in tests
5. **Test error handling** paths

Example test structure:
```typescript
import { render, screen } from '@testing-library/react';
import { RecipeCard } from './RecipeCard';

describe('RecipeCard', () => {
  it('displays recipe information', () => {
    render(<RecipeCard {...mockProps} />);
    expect(screen.getByText(/Recipe Name/i)).toBeInTheDocument();
  });
});
```

## Performance Considerations

### Caching Strategy

Implement caching for expensive operations:

```typescript
export class ExpensiveService {
  private static cache = new Map<string, { 
    data: Result; 
    timestamp: number 
  }>();
  
  private static CACHE_DURATION = 30 * 60 * 1000; // 30 min
  
  static async operation(key: string): Promise<Result> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }
    
    const result = await expensiveOperation();
    this.cache.set(key, { data: result, timestamp: Date.now() });
    return result;
  }
}
```

### Memoization

Use React memoization hooks appropriately:

```typescript
// Expensive calculations
const expensiveValue = useMemo(() => {
  return calculateExpensiveValue(data);
}, [data]);

// Callback functions passed to children
const handleClick = useCallback(() => {
  doSomething(id);
}, [id]);
```

## Accessibility Guidelines

shadcn-ui components are accessible by default, but ensure:

1. **Semantic HTML:** Use appropriate elements
2. **ARIA labels:** Add when needed for icon buttons
3. **Keyboard navigation:** Ensure all interactions are keyboard-accessible
4. **Focus management:** Visible focus indicators
5. **Color contrast:** Maintain sufficient contrast ratios

```typescript
// ✅ Good accessibility
<Button aria-label="Add to favorites">
  <Heart className="w-4 h-4" />
</Button>

// ✅ Semantic structure
<nav>
  <ul>
    <li><Link to="/">Home</Link></li>
  </ul>
</nav>
```

## Swedish Localization

When working with Swedish market features:

1. **Currency:** Always use SEK/kr
2. **Measurements:** Metric system (kg, g, ml, l)
3. **Prices:** Format as `XX.XX kr`
4. **Ingredients:** Use common Swedish names when relevant

```typescript
// ✅ Swedish formatting
const formatPrice = (price: number) => `${price.toFixed(2)} kr`;

// ✅ Metric measurements
const formatWeight = (grams: number) => `${grams}g`;
```

## Debugging Tips

### Common Issues and Solutions

1. **Component not rendering:**
   - Check route order in App.tsx
   - Verify imports use `@/` alias
   - Check for TypeScript errors

2. **Styles not applying:**
   - Use `cn()` utility
   - Check for Tailwind class conflicts
   - Verify design token exists in index.css

3. **localStorage not working:**
   - Check for try-catch blocks
   - Verify JSON serialization
   - Check browser console for errors

4. **State not updating:**
   - Verify useState is called correctly
   - Check dependency arrays in useEffect
   - Ensure localStorage and state sync together

### Debug Logging

```typescript
// Development logging
if (import.meta.env.DEV) {
  console.log('Debug info:', data);
}
```

## Version Control

When generating commit messages:

1. **Be descriptive:** Explain what and why
2. **Use present tense:** "Add feature" not "Added feature"
3. **Reference patterns:** Mention which pattern was followed

Examples:
- "Add NutritionInfo component following shadcn-ui patterns"
- "Implement recipe favoriting with localStorage persistence"
- "Update RecipeCard styling to use design tokens"

## Agent Success Metrics

A successful code generation includes:

- ✅ TypeScript interfaces defined
- ✅ `@/` import aliases used
- ✅ Design tokens applied (no arbitrary colors)
- ✅ Emojis included appropriately
- ✅ `cn()` used for class merging
- ✅ Error handling implemented
- ✅ Consistent with existing patterns
- ✅ ESLint passes
- ✅ Builds without TypeScript errors
- ✅ Maintains playful design spirit

## Additional Resources

- **Tailwind CSS:** https://tailwindcss.com/docs
- **shadcn-ui:** https://ui.shadcn.com/
- **Radix UI:** https://www.radix-ui.com/
- **React Router:** https://reactrouter.com/
- **TanStack Query:** https://tanstack.com/query/latest

---

**Remember:** You're building a fun, friendly vegan meal planning app. Every component should reflect that playful spirit with vibrant colors, smooth animations, and delightful emojis! 🎉🥗✨
