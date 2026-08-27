// p4-10 step 3 Verification: the produced PDF bytes actually carry clickable
// link annotations — the property that makes a PDF the right deliverable
// here instead of a PNG (design.spec / this plan's Non-goals). Runs real
// Playwright chromium (already a project dependency; a cached chromium
// binary is the one-time M1 prerequisite recorded in
// docs/research/r6-track-b-runbook.md).
import { describe, expect, it } from "vitest";
import { renderMenuPdf } from "./menuPdf";

const SAMPLE_HTML = `<!doctype html>
<html><body>
<a href="https://peralmq.github.io/vega-plan-hub/?recipe=mapo-tofu&scale=2">Mapo Tofu</a>
</body></html>`;

describe("renderMenuPdf", () => {
  it("produces a real PDF", async () => {
    const pdf = await renderMenuPdf(SAMPLE_HTML);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30_000);

  it("preserves the <a href> as a clickable PDF link annotation (/URI)", async () => {
    const pdf = await renderMenuPdf(SAMPLE_HTML);
    // Link annotations may live inside a compressed object stream in newer
    // PDF output, so decompress every FlateDecode stream and search both the
    // raw bytes and the inflated content for the /URI entry + our target URL.
    const zlib = await import("node:zlib");
    const raw = pdf.toString("latin1");
    const chunks: string[] = [raw];
    const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let m: RegExpExecArray | null;
    while ((m = streamRe.exec(raw))) {
      try {
        chunks.push(zlib.inflateSync(Buffer.from(m[1], "latin1")).toString("latin1"));
      } catch {
        // not a zlib stream (e.g. already-raw content) — skip
      }
    }
    const haystack = chunks.join("\n");
    expect(haystack).toContain("/URI");
    expect(haystack).toContain("peralmq.github.io/vega-plan-hub");
  }, 30_000);
});
