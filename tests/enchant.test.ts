import { describe, expect, it } from "vitest";
import { tonightComes } from "../src/shared/day";
import { HAPPENING_EFFECTS } from "../src/shared/schema";
import {
  enchantmentAfterNight,
  enchantmentBonus,
  enchantmentDays,
  enchantmentEnding,
  enchantmentFits,
  enchantmentLive,
  isRegular,
  mealCost,
  mealLift,
  regularTakingsShare,
} from "../src/shared/town";
import { data } from "./helpers";

const town = data.balance.town;
const tavern = data.buildings.get("tavern")!;
const spell = (id: string) => data.entries.get(`spell-${id}`)!;

describe("which spells fit a building", () => {
  it("are learned ones, within the player's level, carrying one of its enchant tags", () => {
    const mending = spell("mending");
    expect(mending.tags).toContain("utility");
    expect(enchantmentFits(mending, tavern, [mending.id], 1, town)).toBe(true);
    // Not learned, and a spell of a tier the level cannot yet reach.
    expect(enchantmentFits(mending, tavern, [], 5, town)).toBe(false);
    const fireball = spell("fireball");
    expect(enchantmentFits(fireball, tavern, [fireball.id], 4, town)).toBe(false);
    // Tags the tavern does not want.
    const wizardsTower = data.buildings.get("wizards-tower")!;
    expect(enchantmentFits(mending, wizardsTower, [mending.id], 5, town)).toBe(false);
  });

  it("never include a spell that bends someone's will, or something that is not a spell", () => {
    const hold = spell("hold-person");
    expect(hold.tags).toContain("control");
    for (const building of data.buildings.values()) expect(enchantmentFits({ ...hold, tags: [...building.enchantTags, "control"] }, building, [hold.id], 5, town)).toBe(false);
    const tree = data.entries.get("tree")!;
    expect(enchantmentFits({ ...tree, tags: tavern.enchantTags }, tavern, [tree.id], 5, town)).toBe(false);
  });
});

describe("an enchantment", () => {
  it("lasts three days plus two a tier, and adds a tenth plus a twentieth a tier", () => {
    expect([0, 1, 2, 3].map((tier) => enchantmentDays(tier, town))).toEqual([3, 5, 7, 9]);
    expect([0, 1, 2, 3].map((tier) => enchantmentBonus(tier, town))).toEqual([0.1, 0.15, 0.2, 0.25].map((n) => expect.closeTo(n, 5)));
  });

  it("lasts longer with a tower's perk, and twice as long on the night of the lantern festival", () => {
    expect(enchantmentDays(1, town, 2)).toBe(7);
    expect(enchantmentDays(1, town, 0, true)).toBe(10);
    expect(enchantmentDays(1, town, 2, true)).toBe(14);
  });

  it("runs down a night at a time, says so at one day left, and ends", () => {
    expect([5, 1, 0].map(enchantmentLive)).toEqual([true, true, false]);
    expect([5, 2, 1, 0].map(enchantmentEnding)).toEqual([false, false, true, false]);
    expect([5, 1, 0].map(enchantmentAfterNight)).toEqual([4, 0, 0]);
  });
});

describe("regulars", () => {
  it("are made at six fondness, and stay regulars when fondness falls", () => {
    expect([0, 5, 6, 9].map((fondness) => isRegular(fondness, false, town))).toEqual([false, false, true, true]);
    expect(isRegular(-3, true, town)).toBe(true);
  });

  it("make their own building pay a tenth more, each", () => {
    expect([0, 1, 2].map((count) => regularTakingsShare(count, town))).toEqual([0, 0.1, 0.2].map((n) => expect.closeTo(n, 5)));
  });
});

describe("the Tavern's meal", () => {
  it("costs five gold a level, and lifts tomorrow by a fifth, twice that at the supper", () => {
    expect([1, 3, 5].map((level) => mealCost(level, town))).toEqual([5, 15, 25]);
    expect(mealLift(town)).toBe(0.2);
    expect(mealLift(town, 0.3)).toBe(0.3);
    expect(mealLift(town, undefined, true)).toBe(0.4);
  });

  it("is lifted by the Tavern's own perk at a higher tier", () => {
    const perk = tavern.tiers[2]!.perks.find((item) => item.type === "meals")!;
    expect(perk).toMatchObject({ type: "meals", lift: 0.3 });
  });
});

describe("one-night happenings", () => {
  it("are the five, each with a coded effect and plain lines in voice", () => {
    expect(data.happenings.map((item) => item.id)).toEqual(["pedlar", "lantern-festival", "harvest-supper", "musician", "stargazer"]);
    expect(data.happenings.map((item) => item.effect).sort()).toEqual([...HAPPENING_EFFECTS].sort());
    for (const item of data.happenings) for (const line of [item.name, item.line, item.taken]) expect(line, line).not.toMatch(/[0-9!]/);
  });

  it("come more often to a player the town thinks well of, by the band's shift", () => {
    const shifts = Object.fromEntries(data.balance.events.repBands.map((band) => [band.name, band.tonightChance]));
    expect(shifts).toEqual({ Wobbly: -0.1, Fine: 0, Liked: 0.05, Beloved: 0.1 });
    const day = data.balance.day;
    // A roll of 0.28 misses at the base chance, 0.25, and lands only for a well-liked player.
    expect(tonightComes(9, false, 0.28, day, shifts.Fine)).toBe(false);
    expect(tonightComes(9, false, 0.28, day, shifts.Liked)).toBe(true);
    expect(tonightComes(9, false, 0.2, day, shifts.Wobbly)).toBe(false);
  });
});
