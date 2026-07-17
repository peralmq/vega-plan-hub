import { defineConfig, devices } from "@playwright/test";

// E2E config for the on-demand `./harness e2e` suite (docs/execplans/p1-03-e2e-suite.md).
// Hermetic: the suite runs against a production build served by `vite preview`,
// with the Supabase network layer stubbed and the auth session seeded in the
// browser (see e2e/support/mockDb.ts). No real Supabase project, secret, or
// network reachability is required. `--mode test` loads .env.test (stub values).
//
// Note: the original stub referenced `lovable-agent-playwright-config`, which is
// not published to the pinned public registry and does not resolve. This config
// uses the installed `@playwright/test` directly (test infra only; no production
// runtime code is affected). See the plan's Decision Log.
const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npx vite build --mode test && npx vite preview --port ${PORT} --strictPort --mode test`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
