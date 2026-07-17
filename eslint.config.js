import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // Grandfathered pre-harness violations (docs/specs/harness.spec.md, Adoption).
  // Scoped to the exact files that violated each rule when the gate was
  // introduced; the rules stay on for all new code. Shrink this list, never
  // grow it.
  {
    files: [
      "src/components/FeaturedRecipes.tsx",
      "src/components/InteractiveMealPlanner.tsx",
      "src/hooks/useMealPlans.ts",
    ],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    files: ["src/components/ui/command.tsx", "src/components/ui/textarea.tsx"],
    rules: { "@typescript-eslint/no-empty-object-type": "off" },
  },
  {
    files: ["tailwind.config.ts"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  }
);
