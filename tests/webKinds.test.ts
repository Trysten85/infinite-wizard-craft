import { describe, expect, it } from "vitest";
import type { GameEntry } from "../src/shared/schema";
import { kindLabel } from "../web/src/kinds";

function entry(kind: GameEntry["kind"], extra: Partial<GameEntry> = {}): GameEntry {
  return { id: "x", name: "x", kind, description: "x", tags: [], affinity: [], tier: 0, source: "authored", depth: 0, xp: 0, ...extra };
}

describe("kindLabel", () => {
  it("names plain kinds", () => {
    expect(kindLabel(entry("material", { tier: 2 }))).toBe("Material");
    expect(kindLabel(entry("element"))).toBe("Element");
    expect(kindLabel(entry("focus"))).toBe("Focus");
  });

  it("gives a spell its rank and school", () => {
    expect(kindLabel(entry("spell", { school: "evocation" }))).toBe("Cantrip · Evocation");
    expect(kindLabel(entry("spell", { tier: 3, school: "abjuration" }))).toBe("Tier 3 spell · Abjuration");
    expect(kindLabel(entry("spell", { tier: 1 }))).toBe("Tier 1 spell");
  });
});
