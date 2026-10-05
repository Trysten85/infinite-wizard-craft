import { describe, expect, it } from "vitest";
import { buildGameData, loadGameData, tierForDepth, xpForTier } from "../src/server/gameData";
import type { Balance, Entry } from "../src/shared/schema";

const balance: Balance = {
  startingEntries: ["fire", "air"],
  depthPerTier: 2,
  discoveryXpByTier: [10, 25],
  generation: { maxAttempts: 3, temperature: 0.8 },
};

function entry(id: string, overrides: Partial<Entry> = {}): Entry {
  return {
    id,
    name: id,
    kind: "element",
    description: "x",
    tags: ["fire"],
    affinity: [],
    tier: 0,
    source: "authored",
    ...overrides,
  };
}

describe("the real data files", () => {
  const data = loadGameData(process.cwd());

  it("load and validate", () => {
    expect(data.entries.size).toBeGreaterThan(0);
  });

  it("reach all eight elements within three combos of the starting set", () => {
    const elements = [...data.entries.values()].filter((e) => e.kind === "element");
    expect(elements.map((e) => e.id).sort()).toEqual(
      ["air", "death", "earth", "fire", "life", "light", "shadow", "water"].sort(),
    );
    for (const element of elements) expect(element.depth, element.id).toBeLessThanOrEqual(3);
  });

  it("unlock Death last, after Life and Shadow", () => {
    const depth = (id: string) => data.entries.get(id)!.depth;
    expect(depth("death")).toBeGreaterThan(depth("life"));
    expect(depth("death")).toBeGreaterThan(depth("shadow"));
  });
});

describe("buildGameData", () => {
  const base = {
    balance,
    tags: ["fire"],
    schools: [],
    entries: [entry("fire"), entry("air"), entry("light")],
    combos: [{ inputs: ["fire", "air"] as [string, string], result: "light" }],
  };

  it("computes depth from the shortest recipe", () => {
    const data = buildGameData({
      ...base,
      entries: [...base.entries, entry("glow")],
      combos: [
        ...base.combos,
        { inputs: ["light", "fire"], result: "glow" },
        { inputs: ["light", "glow"], result: "light" },
      ],
    });
    expect(data.entries.get("fire")!.depth).toBe(0);
    expect(data.entries.get("light")!.depth).toBe(1);
    expect(data.entries.get("glow")!.depth).toBe(2);
  });

  it("rejects a combo that refers to a missing entry", () => {
    expect(() =>
      buildGameData({ ...base, combos: [{ inputs: ["fire", "air"], result: "nothing" }] }),
    ).toThrow(/unknown entry "nothing"/);
  });

  it("rejects the same pair defined twice, in either order", () => {
    expect(() =>
      buildGameData({ ...base, combos: [...base.combos, { inputs: ["air", "fire"], result: "light" }] }),
    ).toThrow(/defined twice/);
  });

  it("rejects tags outside the vocabulary", () => {
    expect(() =>
      buildGameData({ ...base, entries: [entry("fire", { tags: ["sparkly"] }), entry("air"), entry("light")] }),
    ).toThrow(/unknown tag "sparkly"/);
  });

  it("rejects an entry that cannot be reached from the starting set", () => {
    expect(() => buildGameData({ ...base, entries: [...base.entries, entry("orphan")] })).toThrow(/orphan/);
  });
});

describe("tier and xp", () => {
  it("derives tier from depth", () => {
    expect(tierForDepth(1, balance)).toBe(0);
    expect(tierForDepth(2, balance)).toBe(1);
    expect(tierForDepth(5, balance)).toBe(2);
  });

  it("pays more xp for higher tiers and caps at the last table row", () => {
    expect(xpForTier(0, balance)).toBe(10);
    expect(xpForTier(1, balance)).toBe(25);
    expect(xpForTier(9, balance)).toBe(25);
  });
});
