// Regression test for the concurrent-writer lost-update found 2026-08-16:
// stores run via Promise.all, and per-call read-modify-write of the cache
// file dropped entries written by concurrent callers (Coop's first-run
// entries vanished). The cache must keep every key across concurrent misses.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.COMPARE_CACHE_DIR = mkdtempSync(join(tmpdir(), "compare-cache-test-"));
const { cached } = await import("./cache");

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("cached", () => {
  it("keeps all keys when concurrent callers miss and write", async () => {
    await Promise.all([
      cached("store-a:term", async () => (await delay(20), ["a"])),
      cached("store-b:term", async () => (await delay(20), ["b"])),
      cached("store-c:term", async () => (await delay(20), ["c"])),
    ]);
    const onDisk = JSON.parse(
      readFileSync(join(process.env.COMPARE_CACHE_DIR!, "search.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(Object.keys(onDisk).sort()).toEqual(["store-a:term", "store-b:term", "store-c:term"]);
  });

  it("serves fresh entries without re-invoking the fetcher", async () => {
    let calls = 0;
    const fetcher = async () => (calls++, ["value"]);
    const first = await cached("hit:term", fetcher);
    const second = await cached("hit:term", fetcher);
    expect(first.hit).toBe(false);
    expect(second.hit).toBe(true);
    expect(second.value).toEqual(["value"]);
    expect(calls).toBe(1);
  });

  it("does not cache null (error) results", async () => {
    const miss1 = await cached("err:term", async () => null);
    let retried = false;
    const miss2 = await cached("err:term", async () => ((retried = true), ["ok"]));
    expect(miss1.value).toBeNull();
    expect(miss2.hit).toBe(false);
    expect(retried).toBe(true);
    expect(miss2.value).toEqual(["ok"]);
  });
});
