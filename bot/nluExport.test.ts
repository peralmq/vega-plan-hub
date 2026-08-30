// Step 5 coverage: the Supabase query round trip (fetchConfirmedTraces —
// exportFixtures itself is pure-tested in src/lib/nluTraces.test.ts), plus
// the literal claim from the plan's Verification section: "export
// round-trips through the r3 scorer" — spawn the actual bake-off runner
// against a file this module produced and prove it scores as a valid r3-kit
// fixture file (the same "verifies scorer + plumbing" self-test the R3 kit
// already documents for its own fixtures.json, run.mjs --mock).
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeFakeSupabase, type FakeDb } from "./fakeSupabase";
import { fetchConfirmedTraces } from "./nluExport";
import { exportFixtures } from "../src/lib/nluTraces";

const USER = "user-1";
const here = dirname(fileURLToPath(import.meta.url));

describe("fetchConfirmedTraces", () => {
  it("exports only this household's confirmed traces, correct-as-is and wrong-as-fixed", async () => {
    const db: FakeDb = {
      nlu_traces: [
        {
          user_id: USER,
          utterance: "köp mjölk",
          parse: { intent: "add_item", items: ["mjölk"] },
          label: "confirmed_correct",
          corrected_parse: null,
        },
        {
          user_id: USER,
          utterance: "köp pasta",
          parse: { intent: "add_item", items: ["pasta"] },
          label: "confirmed_wrong",
          corrected_parse: { intent: "add_item", items: ["penne"] },
        },
        {
          user_id: USER,
          utterance: "hej",
          parse: { intent: "chitchat" },
          label: "unsettled",
          corrected_parse: null,
        },
        {
          user_id: "other-household",
          utterance: "köp öl",
          parse: { intent: "add_item", items: ["öl"] },
          label: "confirmed_correct",
          corrected_parse: null,
        },
      ],
    };
    const supa = makeFakeSupabase(db) as unknown as SupabaseClient;
    const fixtures = await fetchConfirmedTraces(supa, USER);
    expect(fixtures).toEqual([
      { utterance: "köp mjölk", expect: { intent: "add_item", items: ["mjölk"] } },
      { utterance: "köp pasta", expect: { intent: "add_item", items: ["penne"] } },
    ]);
  });
});

describe("export round-trips through the r3 scorer", () => {
  it("run.mjs --mock scores a freshly exported fixture file as 100% pass", () => {
    const fixtures = exportFixtures([
      {
        utterance: "köp mjölk",
        parse: { intent: "add_item", items: ["mjölk"] },
        label: "confirmed_correct",
        corrected_parse: null,
      },
      {
        utterance: "köp pasta",
        parse: { intent: "add_item", items: ["pasta"] },
        label: "confirmed_wrong",
        corrected_parse: { intent: "add_item", items: ["penne"] },
      },
    ]);
    expect(fixtures.length).toBeGreaterThan(0);

    const dir = mkdtempSync(join(tmpdir(), "nlu-export-roundtrip-"));
    const fixturesPath = join(dir, "fixtures-live-test.json");
    writeFileSync(fixturesPath, JSON.stringify(fixtures, null, 2));
    try {
      const out = execFileSync(
        "node",
        [join(here, "..", "spikes", "r3-nlu-bakeoff", "run.mjs"), "--mock", "--fixtures", fixturesPath],
        { encoding: "utf8" },
      );
      const summaryMatch = out.match(/== summary == ([\s\S]+)$/);
      expect(summaryMatch).not.toBeNull();
      const summary = JSON.parse(summaryMatch![1]);
      expect(summary.total).toBe(fixtures.length);
      expect(summary.pass).toBe(fixtures.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
