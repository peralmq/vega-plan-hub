// Base Playwright test/expect. The project-specific fixture that seeds auth and
// stubs the Supabase network layer lives in e2e/support/mockDb.ts; import
// { test, expect } from there in specs.
//
// The original stub re-exported from `lovable-agent-playwright-config`, which is
// not resolvable against the pinned public registry; we use `@playwright/test`
// directly (see the plan's Decision Log).
export { test, expect } from "@playwright/test";
