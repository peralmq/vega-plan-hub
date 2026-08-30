// Supabase-side coverage for the trace-capture loop (p4-06). The graceful-
// degradation tests are the load-bearing ones here (directive Pelle
// 2026-08-30): the live bot may run tonight against a database that does not
// have nlu_traces yet, and every function in bot/nluTrace.ts must survive
// that without throwing or skipping the message it was called alongside.
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeFakeSupabase, type FakeDb } from "./fakeSupabase";
import { buildTraceInsert } from "../src/lib/nluTraces";
import { labelTraceFromReview, linkCorrection, listUnsettled, writeTrace } from "./nluTrace";

const USER = "user-1";

const dbWithTraces = (): FakeDb => ({ nlu_traces: [] });
const dbWithoutTraces = (): FakeDb => ({}); // the pre-migration shape

const sampleInsert = () =>
  buildTraceInsert({
    userId: USER,
    chatId: 555,
    utterance: "köp pasta",
    parse: { intent: "add_item", items: ["pasta"] },
    model: "rules",
    harnessVersion: "p4-06.0",
    latencyMs: 12,
  });

describe("writeTrace", () => {
  it("inserts the row and returns its id when the table exists", async () => {
    const supa = makeFakeSupabase(dbWithTraces()) as unknown as SupabaseClient;
    const id = await writeTrace(supa, sampleInsert());
    expect(id).not.toBeNull();
    const rows = (supa as unknown as { db: FakeDb }).db.nlu_traces;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ utterance: "köp pasta", label: "unsettled" });
  });

  it("degrades gracefully — logs and returns null, never throws — when nlu_traces is missing", async () => {
    const supa = makeFakeSupabase(dbWithoutTraces()) as unknown as SupabaseClient;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let threw = false;
    let id: string | null = "not-set";
    try {
      id = await writeTrace(supa, sampleInsert());
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(id).toBeNull();
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("[nluTrace] write skipped"));
    errSpy.mockRestore();
  });
});

describe("linkCorrection — the scripted correct→corrected pair", () => {
  it("overturns the target trace to implicit-wrong with the repair as corrected_parse", async () => {
    const supa = makeFakeSupabase(dbWithTraces()) as unknown as SupabaseClient;
    const id = await writeTrace(supa, sampleInsert());
    await linkCorrection(supa, id as string, { intent: "add_item", items: ["penne"] });
    const row = (supa as unknown as { db: FakeDb }).db.nlu_traces[0];
    expect(row.label).toBe("implicit_wrong");
    expect(row.label_source).toBe("correction");
    expect(row.corrected_parse).toEqual({ intent: "add_item", items: ["penne"] });
    expect(row.labelled_at).toBeTruthy();
  });

  it("degrades gracefully when the table is missing — never throws", async () => {
    const supa = makeFakeSupabase(dbWithoutTraces()) as unknown as SupabaseClient;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      linkCorrection(supa, "some-id", { intent: "add_item", items: ["penne"] }),
    ).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("[nluTrace] linkCorrection skipped"));
    errSpy.mockRestore();
  });
});

describe("listUnsettled / labelTraceFromReview — the /traces review loop", () => {
  it("lists only this household's unsettled traces, oldest first", async () => {
    const db: FakeDb = {
      nlu_traces: [
        {
          id: "t1",
          user_id: USER,
          utterance: "köp mjölk",
          parse: { intent: "add_item" },
          label: "unsettled",
          created_at: "2026-08-30T10:00:00Z",
        },
        {
          id: "t2",
          user_id: USER,
          utterance: "köp bröd",
          parse: { intent: "add_item" },
          label: "unsettled",
          created_at: "2026-08-30T09:00:00Z",
        },
        {
          id: "t3",
          user_id: USER,
          utterance: "köp ost",
          parse: { intent: "add_item" },
          label: "confirmed_correct",
          created_at: "2026-08-30T08:00:00Z",
        },
        {
          id: "t4",
          user_id: "other-household",
          utterance: "köp öl",
          parse: { intent: "add_item" },
          label: "unsettled",
          created_at: "2026-08-30T07:00:00Z",
        },
      ],
    };
    const supa = makeFakeSupabase(db) as unknown as SupabaseClient;
    const rows = await listUnsettled(supa, USER, 5);
    expect(rows.map((r) => r.id)).toEqual(["t2", "t1"]);
  });

  it("returns [] and degrades gracefully when the table is missing", async () => {
    const supa = makeFakeSupabase(dbWithoutTraces()) as unknown as SupabaseClient;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(listUnsettled(supa, USER)).resolves.toEqual([]);
    errSpy.mockRestore();
  });

  it("labelTraceFromReview confirms a trace with no invented fix", async () => {
    const supa = makeFakeSupabase(dbWithTraces()) as unknown as SupabaseClient;
    const id = await writeTrace(supa, sampleInsert());
    await labelTraceFromReview(supa, id as string, "correct");
    const row = (supa as unknown as { db: FakeDb }).db.nlu_traces[0];
    expect(row.label).toBe("confirmed_correct");
    expect(row.label_source).toBe("review");
    expect(row.corrected_parse).toBeNull();
  });
});
