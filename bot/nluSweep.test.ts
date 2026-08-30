// Integration-level coverage for the nightly sweep (p4-06 Step 3): the 48h
// window logic itself is unit-tested pure in src/lib/nluTraces.test.ts; this
// file proves the query+update round trip in bot/nluSweep.ts actually
// applies that decision to the right rows, and only those rows.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeFakeSupabase, type FakeDb } from "./fakeSupabase";
import { runSweepOnce } from "./nluSweep";

const USER = "user-1";
const NOW = new Date("2026-08-31T12:00:00Z");

function seedDb(): FakeDb {
  return {
    nlu_traces: [
      { id: "old-unsettled", user_id: USER, label: "unsettled", created_at: "2026-08-20T00:00:00Z" },
      { id: "fresh-unsettled", user_id: USER, label: "unsettled", created_at: "2026-08-31T06:00:00Z" },
      {
        id: "already-labelled",
        user_id: USER,
        label: "implicit_wrong",
        label_source: "correction",
        created_at: "2026-08-01T00:00:00Z",
      },
      {
        id: "other-household",
        user_id: "other-household",
        label: "unsettled",
        created_at: "2026-08-01T00:00:00Z",
      },
    ],
  };
}

describe("runSweepOnce", () => {
  it("marks only this household's old-enough unsettled traces implicit_correct", async () => {
    const supa = makeFakeSupabase(seedDb()) as unknown as SupabaseClient;
    const result = await runSweepOnce(supa, USER, NOW);
    expect(result.swept).toEqual(["old-unsettled"]);
    expect(result.scanned).toBe(2); // both USER's unsettled traces were scanned

    const db = (supa as unknown as { db: FakeDb }).db;
    const byId = Object.fromEntries(db.nlu_traces.map((r) => [r.id, r]));
    expect(byId["old-unsettled"].label).toBe("implicit_correct");
    expect(byId["old-unsettled"].label_source).toBe("sweep");
    expect(byId["old-unsettled"].labelled_at).toBe(NOW.toISOString());
    // Untouched: too fresh, already labelled, or a different household.
    expect(byId["fresh-unsettled"].label).toBe("unsettled");
    expect(byId["already-labelled"].label).toBe("implicit_wrong");
    expect(byId["other-household"].label).toBe("unsettled");
  });

  it("is a no-op when nothing is eligible", async () => {
    const db: FakeDb = { nlu_traces: [seedDb().nlu_traces[1]] }; // only the fresh one
    const supa = makeFakeSupabase(db) as unknown as SupabaseClient;
    const result = await runSweepOnce(supa, USER, NOW);
    expect(result.swept).toEqual([]);
    expect(result.scanned).toBe(1);
  });
});
