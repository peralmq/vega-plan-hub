import { defineConfig } from "vitest/config";
import path from "path";

// Standalone Vitest config (not merged with vite.config.ts): the pure
// lib/service core under test needs only module resolution + import.meta.glob
// support, not the React/lovable-tagger plugin chain. See
// docs/specs/tech.spec.md, Testing strategy.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
