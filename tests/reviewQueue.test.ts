import { describe, expect, it } from "vitest";
import { buildQueue, decide, needsAlternatives, progressLine } from "../src/server/reviewQueue";
import type { BakedCombo } from "../src/shared/schema";

const row = (inputs: [string, string], more: Partial<BakedCombo> = {}): BakedCombo => ({ inputs, name: "Thing", description: "A thing.", tags: ["utility"], wonder: false, sense: 4, reason: "", status: "draft", ...more });
const tiers: Record<string, number> = { fire: 0, water: 0, air: 0, bat: 2, tea: 2, herb: 2, crown: 2, feather: 2, forge: 1 };

describe("what a reviewer meets first", () => {
  const rows = [
    row(["bat", "tea"]),
    row(["herb", "crown"]),
    row(["fire", "water"]),
    row(["air", "air"]),
    row(["sand", "spirits"] as [string, string], { notes: "needs alternatives: pick one of five" }),
    row(["fire", "fire"], { status: "ok", notes: "tags proposed by the model: confirm" }),
    row(["crown", "feather"]),
    row(["water", "water"]),
    row(["fire", "forge"], { status: "ok" }),
  ];
  const queue = buildQueue(rows, { heldOut: new Set(["water+water"]), tierOf: (id) => tiers[id] ?? 2, sample: 1 });

  it("starts with tags to confirm, then pairs waiting on alternatives, then base pairs, then a sample", () => {
    expect(queue.map((item) => [item.group, [...item.row.inputs].sort().join("+")])).toEqual([
      ["confirm-tags", "fire+fire"],
      ["alternatives", "sand+spirits"],
      ["priority-1", "air+air"],
      ["priority-1", "fire+water"],
      ["sample", expect.any(String)],
    ]);
  });

  it("never holds a held-out pair or a settled one, and takes only as big a sample as asked", () => {
    const keys = queue.map((item) => [...item.row.inputs].sort().join("+"));
    expect(keys).not.toContain("water+water");
    expect(keys).not.toContain("fire+forge");
    expect(queue.filter((item) => item.group === "sample")).toHaveLength(1);
  });

  it("picks the same sample every time", () => {
    const again = buildQueue([...rows].reverse(), { heldOut: new Set(["water+water"]), tierOf: (id) => tiers[id] ?? 2, sample: 1 });
    expect(again.find((item) => item.group === "sample")!.row.inputs).toEqual(queue.find((item) => item.group === "sample")!.row.inputs);
  });

  it("says where it has got to", () => {
    expect(progressLine(2, queue)).toContain("3 of 5");
    expect(needsAlternatives(rows[4]!)).toBe(true);
    expect(needsAlternatives(rows[0]!)).toBe(false);
  });
});

describe("what a key does to a row", () => {
  const draft = row(["bat", "tea"], { name: "Cave", notes: "old" });

  it("keeps, rejects with the failure and a note, and says nothing happens", () => {
    expect(decide(draft, { kind: "keep" })).toMatchObject({ status: "ok", source: "user" });
    expect(decide(draft, { kind: "keep" }).notes).toBeUndefined();
    expect(decide(draft, { kind: "reject", failure: "attractor", note: "Bat Tea Party" })).toMatchObject({ status: "rejected", failure: "attractor", notes: "Bat Tea Party" });
    expect(decide(draft, { kind: "nothing" })).toMatchObject({ status: "nothing" });
  });

  it("puts a picked alternative in as a fix, with its description still to be written", () => {
    expect(decide(draft, { kind: "alternative", name: "Teapot", failure: "attractor" })).toMatchObject({ status: "fix", correction: "Teapot", failure: "attractor", name: "Cave" });
  });

  it("settles tags that were proposed", () => {
    const proposed = row(["fire", "fire"], { status: "ok", tags: ["energy"], notes: "tags proposed by the model: confirm" });
    const done = decide(proposed, { kind: "tags", tags: ["utility", "energy"] });
    expect(done).toMatchObject({ status: "ok", tags: ["utility", "energy"], source: "user" });
    expect(done.notes).toBeUndefined();
  });
});
