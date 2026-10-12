import { describe, expect, it } from "vitest";
import type { GameEntry } from "../src/shared/schema";
import { canCast, learnNote } from "../web/src/spells";

function entry(id: string, kind: GameEntry["kind"], tier = 0): GameEntry {
  return { id, name: id, kind, description: "x", tags: [], affinity: [], tier, source: "authored", depth: 0, xp: 10 };
}

const bolt = entry("spell-fire-bolt", "spell");
const fireball = entry("spell-fireball", "spell", 3);

describe("learnNote", () => {
  const priced = { ...fireball, learnCost: 40 };

  it("shows the price when the player can pay it", () => {
    expect(learnNote(priced, [], 40, 5)).toBe("Learn for 40 gold");
  });

  it("says what it costs when the purse is short", () => {
    expect(learnNote(priced, [], 39, 5)).toBe("Costs 40 gold");
  });

  it("says so when the spell is already learned, whatever the purse holds", () => {
    expect(learnNote(priced, [priced.id], 0, 1)).toBe("Already learned");
  });

  it("names no price for a spell that carries none", () => {
    expect(learnNote(fireball, [], 0, 5)).toBe("Learn this spell");
  });

  it("names the level a spell takes before its price, when the player is short of it", () => {
    expect(learnNote({ ...priced, learnLevel: 5 }, [], 1000, 4)).toBe("Needs level 5");
    expect(learnNote({ ...priced, learnLevel: 5 }, [], 1000, 5)).toBe("Learn for 40 gold");
  });
});

describe("canCast", () => {
  it("goes by the level the server puts on the spell, and lets anyone cast cantrips", () => {
    expect(canCast(bolt, 1)).toBe(true);
    expect(canCast({ ...fireball, learnLevel: 5 }, 4)).toBe(false);
    expect(canCast({ ...fireball, learnLevel: 5 }, 5)).toBe(true);
  });

  it("falls back to the spell's tier when no level came with it", () => {
    expect(canCast(fireball, 2)).toBe(false);
    expect(canCast(fireball, 3)).toBe(true);
  });
});
