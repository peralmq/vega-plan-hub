// Mock Supabase client for VITE_MOCK_AUTH=true dev mode
// (docs/execplans/p2-02-mock-auth-mode.md). Presents the same public surface
// the four data hooks and AuthContext call on the real `supabase` export
// (`auth.getSession` / `auth.onAuthStateChange` / `auth.signOut` /
// `auth.signInWithOAuth`, `from(table)...`) so they run completely
// unmodified against seeded in-memory data — no Google OAuth, no Supabase
// network, no secrets.
//
// This module (and its imports: mockStore.ts, seedData.ts) is only reachable
// through the statically-analyzable `import.meta.env.VITE_MOCK_AUTH ===
// "true"` check in src/integrations/supabase/client.ts, and declares no
// top-level side effects, so a production build with the flag unset tree-
// shakes it out entirely (see that file's elimination proof in the plan's
// Evidence).
//
// MOCK_AUTH_MODE_ACTIVE — sentinel string proving this module's presence or
// absence in a built bundle (grep dist/assets for it).

import type { Session, User } from "@supabase/supabase-js";
import { loadAllRecipes } from "@/services/recipeLoader";
import { MockStore, MockQueryBuilder, MOCK_USER_ID } from "./mockStore";
import { seedMockStore } from "./seedData";

export const MOCK_AUTH_SENTINEL = "MOCK_AUTH_MODE_ACTIVE";

const MOCK_USER: User = {
  id: MOCK_USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "mock-chef@vega.local",
  app_metadata: { provider: "google", providers: ["google"] },
  user_metadata: { full_name: "Mock Chef 🧑‍🍳" },
  identities: [],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function makeSession(user: User): Session {
  return {
    access_token: "mock-access-token",
    refresh_token: "mock-refresh-token",
    token_type: "bearer",
    expires_in: 60 * 60 * 24 * 365 * 5,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 5,
    user,
  };
}

type AuthChangeCallback = (event: string, session: Session | null) => void;

class MockAuth {
  private session: Session | null = makeSession(MOCK_USER);
  private listeners: AuthChangeCallback[] = [];

  async getSession(): Promise<{ data: { session: Session | null }; error: null }> {
    return { data: { session: this.session }, error: null };
  }

  onAuthStateChange(callback: AuthChangeCallback): {
    data: { subscription: { unsubscribe: () => void } };
  } {
    this.listeners.push(callback);
    // Mirror supabase-js: fires asynchronously after subscribing.
    queueMicrotask(() => callback("INITIAL_SESSION", this.session));
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            this.listeners = this.listeners.filter((l) => l !== callback);
          },
        },
      },
    };
  }

  async signOut(): Promise<{ error: null }> {
    this.session = null;
    for (const l of this.listeners) l("SIGNED_OUT", null);
    return { error: null };
  }

  async signInWithOAuth(): Promise<{ error: null }> {
    // Not exercised by the mock-mode flows (the app boots already signed
    // in), kept only so the surface matches the real client.
    this.session = makeSession(MOCK_USER);
    for (const l of this.listeners) l("SIGNED_IN", this.session);
    return { error: null };
  }
}

export interface MockSupabaseClient {
  auth: MockAuth;
  from: (table: string) => MockQueryBuilder;
}

export function createMockClient(): MockSupabaseClient {
  // Deliberate console usage: only reachable when VITE_MOCK_AUTH=true; also
  // anchors MOCK_AUTH_SENTINEL as a real usage so it (and this module)
  // survive minification when the mock is active, which is what makes its
  // *absence* from an unflagged production build a meaningful elimination
  // proof rather than an unused-export accident.
  console.info(`[${MOCK_AUTH_SENTINEL}] mock Supabase client created — seeded, in-memory, not production.`);
  const store = new MockStore();
  seedMockStore(store, loadAllRecipes());

  return {
    auth: new MockAuth(),
    from: (table: string) => new MockQueryBuilder(store, table),
  };
}
