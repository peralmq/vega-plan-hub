# GitHub Copilot Instructions for Vega Plan Hub

## Repository Overview

Vega Plan Hub is a modern vegan meal planning application that helps users discover recipes, plan weekly meals, and generate shopping lists with estimated costs. The application features a playful, cartoonish design with vibrant gradients and emoji accents, targeting Swedish users with integration to Swedish grocery prices from Mathem.se.

**Core Features:**
- Recipe browsing and filtering
- Interactive meal planning with 7-day planning cycles
- Cooking view with step-by-step instructions
- Shopping list generation with cost estimation
- Recipe repetition avoidance (4-week grace period)
- Similar recipe recommendations based on ingredient overlap
- Local storage for meal plan persistence

## Technology Stack

### Core Framework
- **React 18.3.1** - UI framework
- **TypeScript 5.8.3** - Type-safe JavaScript with relaxed strictness settings
- **Vite 5.4.19** - Build tool and dev server
- **React Router DOM 6.30.1** - Client-side routing

### UI & Styling
- **shadcn-ui** - Radix UI-based component library
- **Tailwind CSS 3.4.17** - Utility-first CSS framework
- **Lucide React 0.462.0** - Icon library
- **class-variance-authority** - Type-safe component variants
- **tailwindcss-animate** - Animation utilities

### State Management & Data
- **TanStack Query 5.83.0** - Server state management
- **React Hook Form 7.61.1** - Form handling
- **Zod 3.25.76** - Schema validation
- **localStorage** - Client-side persistence for meal plans

### Development Tools
- **ESLint 9.32.0** - Linting
- **TypeScript ESLint** - TypeScript-specific linting
- **Bun** - Alternative package manager (bun.lockb present)

## Code Style & Patterns

### TypeScript Conventions

**Strictness Configuration:**
```json
{
  "noImplicitAny": false,
  "noUnusedParameters": false,
  "noUnusedLocals": false,
  "strictNullChecks": false,
  "allowJs": true
}
```

- Use TypeScript, but strict checking is disabled for faster development
- Explicit types are preferred but not strictly required
- Interfaces are preferred for data structures
- Use `type` for unions, intersections, and utility types

**DO:** Define clear interfaces for component props and data models
```typescript
interface RecipeCardProps {
  id?: string;
  title: string;
  image: string;
  cookTime: number;
  servings: number;
  difficulty: "Easy" | "Medium" | "Hard";
  tags: string[];
  ingredients: string[];
}
```

**DON'T:** Skip types entirely even though strictness is off
```typescript
// Avoid
function processRecipe(recipe) { ... }

// Prefer
function processRecipe(recipe: Recipe) { ... }
```

### React Patterns

**Component Structure:**
- Use functional components with hooks
- Export components as named exports (except for pages, which use default exports)
- Place component files in appropriate directories (`src/components`, `src/pages`)
- Keep component files focused on a single responsibility

**DO:** Use hooks for state and side effects
```typescript
export const RecipeCard = ({ id, title, ingredients }: RecipeCardProps) => {
  const [cost, setCost] = useState<{ total: number; currency: string } | null>(null);
  const [loadingCost, setLoadingCost] = useState(false);

  useEffect(() => {
    // Load cost data
  }, [ingredients]);

  return <Card>...</Card>;
};
```

**DON'T:** Use class components
```typescript
// Avoid
class RecipeCard extends React.Component { ... }
```

### Routing Conventions

**Route Organization:**
- All routes defined in `src/App.tsx`
- Page components in `src/pages/`
- Catch-all route (`*`) must be last
- Use React Router DOM's `BrowserRouter`

**DO:** Add new routes above the catch-all
```typescript
<Routes>
  <Route path="/" element={<Index />} />
  <Route path="/recipes" element={<Recipes />} />
  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
  <Route path="*" element={<NotFound />} />
</Routes>
```

### Import Path Conventions

**Path Aliases:**
- Use `@/` for absolute imports from `src/`
- Always use the alias for cleaner imports

**DO:**
```typescript
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMealPlans } from "@/hooks/useMealPlans";
```

**DON'T:**
```typescript
import { Button } from "../../../components/ui/button";
import { cn } from "../../lib/utils";
```

## Styling with Tailwind CSS

### Design System

**Color Palette:**
The application uses a vibrant, food-themed color palette defined in HSL:
- `forest` (120, 70%, 45%) - Green vegetables
- `citrus` (60, 95%, 60%) - Yellow citrus fruits
- `carrot` (25, 95%, 60%) - Orange root vegetables
- `berry` (320, 80%, 60%) - Purple/pink berries
- `avocado` (90, 50%, 50%) - Green/yellow avocado

**Gradients:**
Use predefined gradient classes for consistent branding:
- `bg-gradient-primary` - Purple to berry gradient
- `bg-gradient-fresh` - Forest green to avocado
- `bg-gradient-warm` - Citrus to carrot
- `bg-gradient-fun` - Multi-color playful gradient

**Shadows:**
- `shadow-fresh` - Subtle green shadow for natural elements
- `shadow-glow` - Purple glow effect
- `shadow-playful` - Purple shadow with bounce effect

**DO:** Use semantic color tokens from the design system
```typescript
<Badge className="bg-gradient-fresh text-primary-foreground">
  Easy ✨
</Badge>
```

**DON'T:** Use arbitrary color values
```typescript
// Avoid
<Badge className="bg-[#4ade80] text-white">
  Easy
</Badge>
```

### Component Styling

**Utility Usage:**
- Use `cn()` helper from `@/lib/utils` to merge Tailwind classes
- Apply hover states, transitions, and animations for interactivity
- Use responsive design utilities (`sm:`, `md:`, `lg:`, etc.)

**DO:** Use cn() for conditional styling
```typescript
import { cn } from "@/lib/utils";

<div className={cn(
  "base-class",
  isActive && "active-class",
  className
)}>
```

**DON'T:** Manually concatenate class strings
```typescript
// Avoid
<div className={`base-class ${isActive ? 'active-class' : ''} ${className}`}>
```

### Emoji Usage

**Playful Design Philosophy:**
This application embraces emojis as part of its friendly, approachable design. They should be used consistently throughout the UI.

**DO:** Add emojis to enhance user experience
```typescript
<Badge>Easy ✨</Badge>
<Badge>⚡ Quick!</Badge>
<span>{cookTime} mins ⏰</span>
<span>{servings} portions 🍽️</span>
```

**Guidelines:**
- Use food-related emojis (🍽️, 👨‍🍳, 🥗, 🥕, etc.)
- Add sparkles (✨) for emphasis
- Include time indicators (⏰, ⏱️)
- Use cooking tools (🔪, 🍳)
- Keep consistent within similar contexts

## shadcn-ui Component Patterns

### Component Library Structure

All UI components are in `src/components/ui/` and follow shadcn-ui conventions:
- Built on Radix UI primitives
- Styled with Tailwind CSS
- Use `class-variance-authority` for variants
- Fully accessible by default

### Common Components

**Button:**
```typescript
import { Button } from "@/components/ui/button";

<Button variant="default" size="lg">
  Click me
</Button>

// Available variants: default, destructive, outline, secondary, ghost, link
// Available sizes: default, sm, lg, icon
```

**Badge:**
```typescript
import { Badge } from "@/components/ui/badge";

<Badge variant="secondary">
  Tag
</Badge>

// Available variants: default, secondary, destructive, outline
```

**Card:**
```typescript
import { Card } from "@/components/ui/card";

<Card className="p-6">
  Content
</Card>
```

**DO:** Use existing shadcn-ui components
```typescript
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

<Card>
  <Button variant="outline">Action</Button>
</Card>
```

**DON'T:** Create custom basic components when shadcn-ui provides them
```typescript
// Avoid reinventing existing components
const CustomButton = ({ children }) => (
  <button className="px-4 py-2 rounded">
    {children}
  </button>
);
```

### Adding New shadcn-ui Components

When adding new components from shadcn-ui:
1. Use the CLI: `npx shadcn@latest add [component-name]`
2. Components are added to `src/components/ui/`
3. Update `components.json` if needed
4. Import and use with `@/components/ui/[component-name]`

## State Management Patterns

### Custom Hooks

**Location:** `src/hooks/`

Custom hooks encapsulate reusable logic and state management.

**DO:** Create custom hooks for complex state logic
```typescript
// src/hooks/useMealPlans.ts
export const useMealPlans = () => {
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  
  const saveMealPlans = (plans: MealPlan[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
    setMealPlans(plans);
  };
  
  return {
    mealPlans,
    saveMealPlans,
    // ... other methods
  };
};
```

### localStorage Usage

**Persistence Strategy:**
- Meal plans are stored in localStorage under key `'vegan-meal-plans'`
- Data is serialized as JSON
- Dates are stored as ISO strings and converted on load

**DO:** Handle localStorage errors gracefully
```typescript
useEffect(() => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      // Process data
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }
}, []);
```

**DON'T:** Assume localStorage is always available
```typescript
// Avoid
const data = JSON.parse(localStorage.getItem(key));
```

### TanStack Query

**Usage:**
- Set up in `App.tsx` with `QueryClientProvider`
- Use for server state management when needed
- Currently used for potential API integrations

## Services & Business Logic

### Service Layer Pattern

**Location:** `src/services/`

Services encapsulate business logic and external integrations.

**Example: MathemPriceService**
```typescript
export class MathemPriceService {
  private static cache: Map<string, { data: PriceLookupResult; timestamp: number }> = new Map();
  
  static async lookupPrice(ingredient: string): Promise<PriceLookupResult> {
    // Implementation with caching
  }
  
  static formatPrice(price: number): string {
    return `${price.toFixed(2)} kr`;
  }
}
```

**DO:** Use static methods for stateless services
```typescript
const cost = await MathemPriceService.calculateTotalCost(ingredients);
const formattedPrice = MathemPriceService.formatPrice(cost.totalCost);
```

**DO:** Implement caching for expensive operations
```typescript
private static cache: Map<string, { data: T; timestamp: number }> = new Map();
```

**DON'T:** Put business logic directly in components
```typescript
// Avoid
const RecipeCard = () => {
  const [price, setPrice] = useState(0);
  
  // Complex pricing logic here...
};

// Prefer
const RecipeCard = () => {
  const [price, setPrice] = useState(0);
  
  useEffect(() => {
    PriceService.calculatePrice(ingredients).then(setPrice);
  }, [ingredients]);
};
```

## Quality Standards

### Testing

**Current State:**
- No testing infrastructure is currently set up
- When adding tests, prefer:
  - Vitest for unit testing
  - React Testing Library for component testing
  - Playwright for E2E testing

### Documentation

**Code Comments:**
- Use JSDoc comments for public functions and complex logic
- Comment on "why" not "what"
- Keep comments up to date with code changes

**DO:**
```typescript
/**
 * Simulates fetching ingredient prices from Mathem.se
 * In a real implementation, this would make HTTP requests to their API/website
 */
static async lookupPrice(ingredient: string): Promise<PriceLookupResult>
```

**DON'T:** State the obvious
```typescript
// Set the price
setPrice(100);
```

### ESLint Configuration

**Rules:**
- React Hooks rules enforced
- React Refresh for component updates
- `@typescript-eslint/no-unused-vars` disabled for development speed
- Standard JS and TypeScript recommended rules

**DO:** Run linting before commits
```bash
npm run lint
```

## Architecture & Constraints

### Project Structure

```
src/
├── components/      # React components
│   ├── ui/         # shadcn-ui components
│   └── ...         # Feature components
├── hooks/          # Custom React hooks
├── lib/            # Utility functions
├── pages/          # Route page components
├── services/       # Business logic and API services
├── App.tsx         # Root component with routing
├── main.tsx        # Application entry point
└── index.css       # Global styles and design tokens
```

### Component Organization

**Page Components:**
- Located in `src/pages/`
- One page per route
- Export as default
- Compose feature components

**Feature Components:**
- Located in `src/components/`
- Reusable across pages
- Export as named exports
- Single responsibility

**UI Components:**
- Located in `src/components/ui/`
- From shadcn-ui library
- Don't modify directly; extend if needed

### Data Flow

**Recipe Data:**
- Currently hardcoded in components/pages
- Should be treated as if fetched from an API
- Use the `Recipe` interface from `src/hooks/useMealPlans.ts`

**Meal Plans:**
- Managed by `useMealPlans` hook
- Persisted to localStorage
- No server synchronization

**Price Data:**
- Fetched through `MathemPriceService`
- Cached for 30 minutes
- Mock data, simulates Mathem.se API

### Known Limitations

1. **No Authentication:** Application is client-side only, no user accounts
2. **No Backend:** All data is stored in browser localStorage
3. **Mock Price Data:** Mathem.se integration is simulated, not real
4. **Swedish Market:** Prices and measurements are Swedish-specific (SEK, metric)
5. **Recipe Data:** Hardcoded recipes, no dynamic content management

## Common Pitfalls

### 1. localStorage and React State Synchronization

**Problem:** Changes to localStorage not reflected in UI

**Solution:** Always update React state when writing to localStorage
```typescript
const saveMealPlans = (plans: MealPlan[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  setMealPlans(plans); // Update state too
};
```

### 2. Date Handling in localStorage

**Problem:** Dates become strings when stored in localStorage

**Solution:** Convert dates when loading from storage
```typescript
const parsed = JSON.parse(stored);
const plansWithDates = parsed.map((plan: any) => ({
  ...plan,
  startDate: new Date(plan.startDate),
  createdAt: new Date(plan.createdAt),
}));
```

### 3. Async Operations in useEffect

**Problem:** Missing cleanup or race conditions

**Solution:** Handle cleanup properly
```typescript
useEffect(() => {
  let cancelled = false;
  
  const loadData = async () => {
    const result = await fetchData();
    if (!cancelled) {
      setData(result);
    }
  };
  
  loadData();
  
  return () => {
    cancelled = true;
  };
}, []);
```

### 4. Tailwind Class Conflicts

**Problem:** Classes not applying due to specificity issues

**Solution:** Use `cn()` utility for proper class merging
```typescript
// Wrong - later classes might not apply
<div className={`base-class ${conditionalClass}`} />

// Correct - tailwind-merge handles conflicts
<div className={cn('base-class', conditionalClass)} />
```

### 5. Forgetting Route Order

**Problem:** Catch-all route matching before specific routes

**Solution:** Always add new routes above the `*` route in `App.tsx`
```typescript
<Routes>
  <Route path="/new-route" element={<NewPage />} />
  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
  <Route path="*" element={<NotFound />} />
</Routes>
```

### 6. Component Props Naming

**Problem:** Inconsistent prop naming between components

**Solution:** Follow consistent naming patterns
```typescript
// DO: Use consistent patterns
interface RecipeCardProps {
  cookTime: number;      // camelCase for numbers
  difficulty: string;    // lowercase for strings
  tags: string[];        // plural for arrays
}

// DON'T: Mix conventions
interface RecipeCardProps {
  cook_time: number;     // snake_case
  Difficulty: string;    // PascalCase
  tag: string[];         // singular for array
}
```

### 7. Missing Key Props in Lists

**Problem:** React warnings about missing keys in list renders

**Solution:** Always provide stable keys
```typescript
// DO: Use unique, stable keys
{tags.map((tag) => (
  <Badge key={tag}>
    {tag}
  </Badge>
))}

// DON'T: Use array index as key
{tags.map((tag, index) => (
  <Badge key={index}>
    {tag}
  </Badge>
))}
```

## Development Workflow

### Commands

```bash
# Development server
npm run dev

# Production build
npm run build

# Development build
npm run build:dev

# Lint code
npm run lint

# Preview production build
npm run preview
```

### Adding Features

1. **New Page:**
   - Create component in `src/pages/`
   - Add route in `src/App.tsx` (before catch-all)
   - Add navigation link if needed

2. **New Component:**
   - Create in `src/components/`
   - Export as named export
   - Use TypeScript interfaces for props

3. **New Hook:**
   - Create in `src/hooks/`
   - Follow `use*` naming convention
   - Export as named export

4. **New Service:**
   - Create in `src/services/`
   - Use class with static methods
   - Implement caching if expensive

### Code Review Checklist

- [ ] Components use TypeScript interfaces
- [ ] Imports use `@/` path alias
- [ ] Tailwind classes use `cn()` utility
- [ ] Lists have stable `key` props
- [ ] New routes added before catch-all
- [ ] Emojis used consistently
- [ ] localStorage operations handle errors
- [ ] Dates converted when loading from storage
- [ ] No hardcoded colors (use design tokens)
- [ ] Components follow single responsibility
- [ ] ESLint passes without errors

## Best Practices Summary

### DO ✅

- Use TypeScript with clear interfaces
- Import with `@/` path alias
- Use shadcn-ui components
- Apply design system tokens (colors, gradients, shadows)
- Include emojis in user-facing text
- Handle async operations safely
- Use `cn()` for class merging
- Keep components focused and reusable
- Cache expensive operations
- Handle localStorage errors
- Update state when persisting data
- Add new routes before catch-all

### DON'T ❌

- Skip TypeScript types entirely
- Use relative imports from `src/`
- Create custom basic components
- Use arbitrary color values
- Forget emojis in UI text
- Ignore async cleanup
- Concatenate Tailwind classes manually
- Put business logic in components
- Skip caching for API calls
- Assume localStorage availability
- Forget to sync state with storage
- Add routes after catch-all

## Swedish Market Considerations

This application targets Swedish users:
- All prices in Swedish Kronor (SEK, "kr")
- Measurements in metric system
- Integration with Mathem.se (Swedish online grocery)
- Consider Swedish dietary preferences
- Use Swedish-friendly ingredient names when relevant

## Lovable Integration

This project was initially created with Lovable (GPTEngineer fork) and maintains that workflow:
- Changes can be made via Lovable IDE
- Local development supported
- Commits from Lovable automatically sync
- Built with Vite + React template from Lovable

---

**Remember:** This is a fun, colorful, emoji-filled vegan meal planning app. Keep the playful spirit alive in all contributions! 🎉🥗✨
