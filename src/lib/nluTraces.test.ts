import { describe, expect, it } from "vitest";
import {
  buildTraceInsert,
  exportFixtures,
  formatTraceReview,
  isSweepEligible,
  planCorrectionOverturn,
  planReviewLabel,
  sweepImplicitCorrect,
} from "./nluTraces";

describe("buildTraceInsert", () => {
  it("starts every parse unsettled with no label yet", () => {
    const row = buildTraceInsert({
      userId: "u1",
      chatId: 555,
      utterance: "köp pasta",
      parse: { intent: "add_item", items: ["pasta"] },
      model: "rules",
      harnessVersion: "p4-06.0",
      latencyMs: 42,
    });
    expect(row).toEqual({
      user_id: "u1",
      chat_id: 555,
      utterance: "köp pasta",
      parse: { intent: "add_item", items: ["pasta"] },
      model: "rules",
      harness_version: "p4-06.0",
      latency_ms: 42,
      label: "unsettled",
      label_source: null,
      corrected_parse: null,
    });
  });
});

describe("planCorrectionOverturn — the scripted correct→corrected pair", () => {
  it("yields one implicit-wrong patch with the repair as corrected_parse", () => {
    const patch = planCorrectionOverturn({ intent: "add_item", items: ["penne"] });
    expect(patch).toEqual({
      label: "implicit_wrong",
      label_source: "correction",
      corrected_parse: { intent: "add_item", items: ["penne"] },
    });
  });
});

describe("planReviewLabel", () => {
  it("confirms without inventing a fix", () => {
    expect(planReviewLabel("correct")).toEqual({
      label: "confirmed_correct",
      label_source: "review",
      corrected_parse: null,
    });
  });
  it("marks wrong, still no fix (chat review has no free-text fix flow)", () => {
    expect(planReviewLabel("wrong")).toEqual({
      label: "confirmed_wrong",
      label_source: "review",
      corrected_parse: null,
    });
  });
});

describe("isSweepEligible / sweepImplicitCorrect — the 48h window", () => {
  const now = new Date("2026-08-31T12:00:00Z");

  it("leaves a fresh unsettled trace alone", () => {
    const trace = { label: "unsettled" as const, created_at: "2026-08-31T00:00:00Z" }; // 12h old
    expect(isSweepEligible(trace, now)).toBe(false);
  });

  it("sweeps an unsettled trace exactly at the 48h boundary", () => {
    const trace = { label: "unsettled" as const, created_at: "2026-08-29T12:00:00Z" }; // exactly 48h
    expect(isSweepEligible(trace, now)).toBe(true);
  });

  it("never touches a trace that already has a label", () => {
    const trace = { label: "implicit_wrong" as const, created_at: "2026-08-01T00:00:00Z" };
    expect(isSweepEligible(trace, now)).toBe(false);
  });

  it("sweepImplicitCorrect returns only the eligible ids, respecting the window", () => {
    const traces = [
      { id: "fresh", label: "unsettled" as const, created_at: "2026-08-31T06:00:00Z" }, // 6h
      { id: "old-enough", label: "unsettled" as const, created_at: "2026-08-20T00:00:00Z" }, // weeks
      { id: "already-labelled", label: "confirmed_correct" as const, created_at: "2026-08-01T00:00:00Z" },
    ];
    expect(sweepImplicitCorrect(traces, now)).toEqual(["old-enough"]);
  });
});

describe("exportFixtures — confirmed traces only, r3 kit shape", () => {
  it("exports confirmed_correct as its own parse", () => {
    const fixtures = exportFixtures([
      {
        utterance: "köp mjölk",
        parse: { intent: "add_item", items: ["mjölk"] },
        label: "confirmed_correct",
        corrected_parse: null,
      },
    ]);
    expect(fixtures).toEqual([{ utterance: "köp mjölk", expect: { intent: "add_item", items: ["mjölk"] } }]);
  });

  it("exports confirmed_wrong as its corrected_parse", () => {
    const fixtures = exportFixtures([
      {
        utterance: "köp pasta",
        parse: { intent: "add_item", items: ["pasta"] },
        label: "confirmed_wrong",
        corrected_parse: { intent: "add_item", items: ["penne"] },
      },
    ]);
    expect(fixtures).toEqual([{ utterance: "köp pasta", expect: { intent: "add_item", items: ["penne"] } }]);
  });

  it("skips a confirmed_wrong trace with no recorded fix", () => {
    const fixtures = exportFixtures([
      {
        utterance: "köp pasta",
        parse: { intent: "add_item", items: ["pasta"] },
        label: "confirmed_wrong",
        corrected_parse: null,
      },
    ]);
    expect(fixtures).toEqual([]);
  });

  it("skips unsettled and implicit traces — export is confirmed-only", () => {
    const fixtures = exportFixtures([
      { utterance: "a", parse: { intent: "chitchat" }, label: "unsettled", corrected_parse: null },
      { utterance: "b", parse: { intent: "chitchat" }, label: "implicit_correct", corrected_parse: null },
      { utterance: "c", parse: { intent: "chitchat" }, label: "implicit_wrong", corrected_parse: null },
    ]);
    expect(fixtures).toEqual([]);
  });
});

describe("formatTraceReview", () => {
  it("renders the utterance, intent, and slots for a one-tap yes/no ask", () => {
    const text = formatTraceReview(
      { utterance: "köp pasta", parse: { intent: "add_item", items: ["pasta"] } },
      "sv",
    );
    expect(text).toContain("köp pasta");
    expect(text).toContain("add_item");
    expect(text).toContain("pasta");
    expect(text).toContain("Stämmer det?");
  });

  it("switches to English for an English utterance", () => {
    const text = formatTraceReview({ utterance: "buy pasta", parse: { intent: "add_item" } }, "en");
    expect(text).toContain("Did I get that right?");
  });
});
