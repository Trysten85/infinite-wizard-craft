import { describe, expect, it } from "vitest";
import { buildGameData, loadGameData, readGameFiles, townWords } from "../src/server/gameData";
import { buildPath } from "../src/server/paths";
import { QUALITIES, type Building, type GameEntry, type Perk, type RuleCode, type ShiftRules, type TownRules } from "../src/shared/schema";
import { qualityFor } from "../src/shared/shifts";
import {
  buildingQuality,
  buildingScore,
  cheerBand,
  cheerPoints,
  checkNeeds,
  deedsFor,
  liftQuality,
  liftsFor,
  previewQuality,
  extraDiscoveryGold,
  isStockable,
  hireCost,
  hireTopUp,
  staffedTakings,
  discountShare,
  learnPrice,
  levelForPlot,
  needMet,
  perksAt,
  perksOf,
  plotPrice,
  refusePlot,
  refuseTier,
  slotsAt,
  takingsFor,
  tierCost,
  topTier,
  wantedThings,
  type Held,
} from "../src/shared/town";
import { data } from "./helpers";

// Numbers pinned for the sums below, so retuning config/balance.json does not move these tests.
const rules: TownRules = {
  plotPrices: [10, 30, 60, 100, 150, 210, 280, 360, 450],
  deedsByLevel: [2, 3, 5, 7, 9],
  regularAt: 6,
  teachAt: 4,
  hireByTier: [20, 50, 100],
  raiseNights: 1,
  neighbour: { reach: 1, liked: 0.05, disliked: 0.05, cap: 0.15 },
  regularTakings: 0.1,
  meal: { goldPerLevel: 5, lift: 0.2 },
  enchant: { blockedTags: ["control"], baseDays: 3, daysPerTier: 2, bonus: 0.1, bonusPerTier: 0.05 },
  cheer: [
    { name: "Quiet", from: 0, takings: 0 },
    { name: "Pleasant", from: 4, takings: 0.1 },
    { name: "Lively", from: 9, takings: 0.2 },
    { name: "Merry", from: 15, takings: 0.3 },
  ],
  tiers: [
    { gold: null, level: 1, slots: 2, takings: 5, made: null },
    { gold: 150, level: 3, slots: 3, takings: 12, made: { count: 2, depth: 5 } },
    { gold: 400, level: 5, slots: 4, takings: 24, made: { count: 3, depth: 8 } },
  ],
};
const shifts: ShiftRules = data.balance.shifts;
const words = townWords(data);

const building = (id: string) => data.buildings.get(id)!;
const tavern = building("tavern");
const herbGarden = building("herb-garden");

// Something the player holds. Made by them unless said otherwise.
function thing(id: string, tags: string[], depth: number, more: { made?: boolean; kind?: GameEntry["kind"] } = {}): Held {
  return { entry: { id, kind: more.kind ?? "material", tags, depth }, made: more.made ?? true };
}
// A thing from the game's own files, as a player who made it holds it.
const real = (id: string, made = true): Held => ({ entry: data.entries.get(id)!, made });
const reals = (...ids: string[]) => ids.map((id) => real(id));

describe("plots", () => {
  it("are bought in order at rising prices, the first one free", () => {
    expect([0, 1, 2, 8].map((index) => plotPrice(index, rules))).toEqual([10, 30, 60, 450]);
    expect(plotPrice(9, rules)).toBeNull();
  });

  it("may be owned by the deeds a level gives", () => {
    expect([1, 2, 3, 4, 5].map((level) => deedsFor(level, rules))).toEqual([2, 3, 5, 7, 9]);
    // A level past the table keeps the last row, and nobody is handed more deeds than plots.
    expect(deedsFor(9, rules)).toBe(9);
    expect(deedsFor(5, { ...rules, plotPrices: [0, 30, 60] })).toBe(3);
  });

  it("each open at the level whose deeds first reach them", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => levelForPlot(index, rules))).toEqual([1, 1, 2, 3, 3, 4, 4, 5, 5]);
    expect(levelForPlot(9, rules)).toBeNull();
  });

  it("are refused without a deed, or without the gold", () => {
    // What the buyer brings: the trades in town, their level and their gold.
    const buyer = (level: number, gold: number, jobs = ["farmer"]) => ({ jobs, level, gold });
    expect(refusePlot(0, buyer(1, 10), rules)).toBeNull();
    expect(refusePlot(0, buyer(1, 9), rules)).toBe("not-enough-gold");
    expect(refusePlot(1, buyer(1, 29), rules)).toBe("not-enough-gold");
    expect(refusePlot(1, buyer(1, 30), rules)).toBeNull();
    // A third plot waits for level two, however much gold there is.
    expect(refusePlot(2, buyer(1, 9999), rules)).toBe("no-deed");
    expect(refusePlot(2, buyer(2, 60), rules)).toBeNull();
    // The street has an end.
    expect(refusePlot(9, buyer(5, 9999), rules)).toBe("no-deed");
  });

  it("wait on a first job, and only the first", () => {
    expect(refusePlot(0, { jobs: [], level: 1, gold: 9999 }, rules)).toBe("no-job");
    // A save that already owns a plot is not asked for a job again.
    expect(refusePlot(1, { jobs: [], level: 1, gold: 30 }, rules)).toBeNull();
    expect(plotPrice(0, rules)).toBe(10);
  });
});

describe("a need", () => {
  const held = [thing("spirits", ["liquid", "reagent"], 3), thing("cider", ["brewing", "liquid"], 6), thing("shop-ale", ["brewing"], 7, { made: false })];

  it("is met by a named thing the player has", () => {
    expect(needMet({ entry: "spirits" }, held)).toBe(true);
    expect(needMet({ entry: "food" }, held)).toBe(false);
  });

  it("is met by anything carrying a tag, at a depth if one is asked", () => {
    expect(needMet({ tag: "brewing" }, held)).toBe(true);
    expect(needMet({ tag: "forging" }, held)).toBe(false);
    expect(needMet({ tag: "liquid", depth: 6 }, held)).toBe(true);
    expect(needMet({ tag: "liquid", depth: 7 }, held)).toBe(false);
  });

  it("leaves out what was bought or given when it asks for something made", () => {
    expect(needMet({ tag: "brewing", depth: 7 }, held)).toBe(true);
    expect(needMet({ tag: "brewing", depth: 7, made: true }, held)).toBe(false);
    expect(needMet({ tag: "brewing", depth: 6, made: true }, held)).toBe(true);
    // A named thing counts however it was come by.
    expect(needMet({ entry: "shop-ale" }, held)).toBe(true);
  });
});

describe("the things a higher tier asks for", () => {
  it("are different things the player made, deep enough, that the building wants", () => {
    const held = [
      thing("cider", ["brewing"], 6),
      thing("stew", ["animal", "liquid"], 5),
      // Too shallow, bought, and wanted by nobody here, in that order.
      thing("broth", ["liquid"], 4),
      thing("shop-ale", ["brewing"], 7, { made: false }),
      thing("anvil", ["forging"], 9),
      // Held twice over is still one thing.
      thing("cider", ["brewing"], 6),
    ];
    expect(wantedThings(tavern, held, 5).map((item) => item.entry.id)).toEqual(["cider", "stew"]);
    expect(wantedThings(tavern, held, 6).map((item) => item.entry.id)).toEqual(["cider"]);
  });

  it("are things that could sit on a shelf: materials and spells, never a job or an element", () => {
    expect(["material", "spell"].map((kind) => isStockable({ kind: kind as GameEntry["kind"] }))).toEqual([true, true]);
    expect(["element", "school", "job", "focus"].map((kind) => isStockable({ kind: kind as GameEntry["kind"] }))).toEqual([false, false, false, false]);
    const held = [thing("tea-shop-owner", ["plant", "liquid"], 7, { kind: "job" }), thing("spell-misty-brew", ["brewing"], 6, { kind: "spell" })];
    expect(wantedThings(tavern, held, 5).map((item) => item.entry.id)).toEqual(["spell-misty-brew"]);
  });
});

describe("raising a building", () => {
  it("costs its own price at the first tier, and the town's price after", () => {
    expect([1, 2, 3].map((tier) => tierCost(tavern, tier, rules))).toEqual([
      { gold: 80, level: 1 },
      { gold: 150, level: 3 },
      { gold: 400, level: 5 },
    ]);
    expect(tierCost(building("farm"), 1, rules).gold).toBe(30);
    expect(topTier(tavern, rules)).toBe(3);
  });

  it("needs its named things at the first tier, each said by name", () => {
    expect(checkNeeds(tavern, 1, { held: reals("spirits", "tree"), jobs: [] }, rules, words)).toEqual([
      { label: "Spirits", met: true },
      { label: "Food", met: false },
      { label: "Tree", met: true },
    ]);
  });

  it("needs things the player made at the higher tiers, and says how many they have", () => {
    const held = [thing("cider", ["brewing"], 6), thing("stew", ["animal"], 8), thing("broth", ["liquid"], 9)];
    expect(checkNeeds(tavern, 2, { held: held.slice(0, 1), jobs: [] }, rules, words)).toEqual([
      { label: "2 things you made, 5 or more steps deep, that the Tavern wants", met: false, progress: { have: 1, need: 2 } },
    ]);
    expect(checkNeeds(tavern, 2, { held, jobs: [] }, rules, words)[0]).toMatchObject({ met: true, progress: { have: 2, need: 2 } });
    // The third tier asks for three, deeper.
    expect(checkNeeds(tavern, 3, { held, jobs: [] }, rules, words)[0]).toMatchObject({ label: "3 things you made, 8 or more steps deep, that the Tavern wants", met: false, progress: { have: 2, need: 3 } });
  });

  it("can wait on a townsperson arriving", () => {
    const made = [thing("tonic", ["healing"], 6), thing("salve", ["plant"], 5)];
    const without = checkNeeds(herbGarden, 2, { held: made, jobs: ["herbalist"] }, rules, words);
    expect(without).toEqual([
      { label: "An Alchemist in town", met: false },
      { label: "2 things you made, 5 or more steps deep, that the Herb Garden wants", met: true, progress: { have: 2, need: 2 } },
    ]);
    expect(checkNeeds(herbGarden, 2, { held: made, jobs: ["herbalist", "alchemist"] }, rules, words)[0]!.met).toBe(true);
  });

  it("says a need by tag in plain words", () => {
    const odd: Building = { ...tavern, tiers: [{ needs: [{ tag: "brewing", depth: 5, made: true }, { tag: "plant" }], perks: [] }] };
    expect(checkNeeds(odd, 1, { held: [], jobs: [] }, rules, words).map((need) => need.label)).toEqual(["Brewing, made by you, 5 or more steps deep", "Something green"]);
  });

  it("is refused for the level first, then the needs, then the gold", () => {
    const ready = { held: reals("spirits", "food", "tree"), jobs: [], level: 1, gold: 80 };
    expect(refuseTier(tavern, 1, ready, rules)).toBeNull();
    expect(refuseTier(tavern, 1, { ...ready, gold: 79 }, rules)).toBe("not-enough-gold");
    expect(refuseTier(tavern, 1, { ...ready, held: reals("spirits", "food") }, rules)).toBe("needs-missing");
    expect(refuseTier(tavern, 1, { ...ready, held: [], gold: 0 }, rules)).toBe("needs-missing");

    const deep = [thing("cider", ["brewing"], 6), thing("stew", ["animal"], 8)];
    expect(refuseTier(tavern, 2, { held: deep, jobs: [], level: 2, gold: 0 }, rules)).toBe("level-too-low");
    expect(refuseTier(tavern, 2, { held: deep.slice(1), jobs: [], level: 3, gold: 0 }, rules)).toBe("needs-missing");
    expect(refuseTier(tavern, 2, { held: deep, jobs: [], level: 3, gold: 149 }, rules)).toBe("not-enough-gold");
    expect(refuseTier(tavern, 2, { held: deep, jobs: [], level: 3, gold: 150 }, rules)).toBeNull();
    // Bought things do not raise a tier.
    expect(refuseTier(tavern, 2, { held: deep.map((item) => ({ ...item, made: false })), jobs: [], level: 3, gold: 150 }, rules)).toBe("needs-missing");
  });

  it("gives more shelves with each tier", () => {
    expect([1, 2, 3, 4].map((tier) => slotsAt(tier, rules))).toEqual([2, 3, 4, 0]);
  });
});

describe("takings", () => {
  it("are the tier's, scaled by the building's quality tonight", () => {
    const byQuality = (tier: number) => QUALITIES.map((quality) => takingsFor(tier, quality, rules, shifts));
    expect(byQuality(1)).toEqual([3, 5, 7, 9]);
    expect(byQuality(2)).toEqual([7, 12, 17, 22]);
    expect(byQuality(3)).toEqual([14, 24, 34, 43]);
  });

  it("are raised by a share, such as a cheerful town's", () => {
    expect(takingsFor(3, "good", rules, shifts, 0.1)).toBe(26);
    expect(takingsFor(3, "good", rules, shifts, 0.3)).toBe(31);
    // An empty building is Meh, and still pays.
    expect(takingsFor(1, "meh", rules, shifts)).toBeGreaterThan(0);
  });
});

describe("perks", () => {
  const all = [...data.buildings.values()];
  const standing = (tier: number) => all.map((item) => ({ building: item, tier }));

  it("are a closed list, and the six buildings use every kind between them", () => {
    const used = new Set(all.flatMap((item) => item.tiers.flatMap((tier) => tier.perks.map((perk) => perk.type))));
    const kinds: Perk["type"][] = ["opens-shop", "shop-shelves", "shop-discount", "discovery-gold", "lifts", "learn-discount", "rumour", "gift", "enchant-days", "time", "meals"];
    expect([...used].sort()).toEqual([...kinds].sort());
  });

  it("are everything a building gives at its tier, so a higher tier never loses one", () => {
    for (const item of all) {
      for (let tier = 2; tier <= item.tiers.length; tier++) {
        const before = perksAt(item, tier - 1).map((perk) => perk.type);
        const now = perksAt(item, tier).map((perk) => perk.type);
        for (const type of before) expect(now, `${item.id} tier ${tier}`).toContain(type);
      }
    }
    expect(perksAt(tavern, 9)).toEqual([]);
  });

  it("can be gathered by kind across the town", () => {
    expect(perksOf(standing(1), "opens-shop").map((found) => found.building.id)).toEqual(["market-stall"]);
    expect(perksOf(standing(1), "lifts").map((found) => found.perk.building)).toEqual(["tavern"]);
    expect(perksOf(standing(2), "lifts").map((found) => found.perk.building)).toEqual(["tavern", "herb-garden"]);
    expect(perksOf(standing(1), "time")).toEqual([]);
    expect(perksOf(standing(3), "time").map((found) => [found.building.id, found.perk.count])).toEqual([["wizards-tower", 1]]);
    expect(perksOf([], "meals")).toEqual([]);
  });

  it("open the shop at the Market Stall, and add to it tier by tier", () => {
    const stall = building("market-stall");
    expect(perksAt(stall, 1)).toEqual([{ type: "opens-shop" }]);
    expect(perksAt(stall, 2)).toEqual([{ type: "opens-shop" }, { type: "shop-shelves", shelves: "tailored" }]);
    expect(perksAt(stall, 3)).toContainEqual({ type: "shop-discount", share: 0.1 });
    // Nothing else opens it.
    expect(all.filter((item) => item.tiers.some((tier) => tier.perks.some((perk) => perk.type === "opens-shop"))).map((item) => item.id)).toEqual(["market-stall"]);
  });

  it("pay extra gold for discoveries of a building's kind, by that building's quality", () => {
    const smithy = perksOf([{ building: building("smithy"), tier: 1 }], "discovery-gold")[0]!.perk;
    const garden = perksOf([{ building: herbGarden, tier: 1 }], "discovery-gold")[0]!.perk;
    expect(QUALITIES.map((quality) => extraDiscoveryGold(10, ["metal"], [{ perk: smithy, quality }]))).toEqual([3, 5, 8, 10]);
    // Nothing for a discovery the building does not care about.
    expect(extraDiscoveryGold(10, ["plant"], [{ perk: smithy, quality: "perfect" }])).toBe(0);
    // Two buildings that both care each add their share.
    expect(extraDiscoveryGold(10, ["metal", "plant"], [{ perk: smithy, quality: "good" }, { perk: garden, quality: "good" }])).toBe(10);
    expect(extraDiscoveryGold(10, ["metal"], [])).toBe(0);
    // The extra is rounded up, so a discovery that pays 1 gold still earns 1 more from the plainest Smithy.
    expect(QUALITIES.map((quality) => extraDiscoveryGold(1, ["metal"], [{ perk: smithy, quality }]))).toEqual([1, 1, 1, 1]);
    expect(QUALITIES.map((quality) => extraDiscoveryGold(3, ["metal"], [{ perk: smithy, quality }]))).toEqual([1, 2, 3, 3]);
    // A sum that comes out whole is left alone: 10 at a share of 1.1 is 11, not 12.
    const second = perksOf([{ building: building("smithy"), tier: 2 }], "discovery-gold")[0]!.perk;
    expect(extraDiscoveryGold(10, ["metal"], [{ perk: second, quality: "great" }])).toBe(11);
    // A share of nothing pays nothing.
    expect(extraDiscoveryGold(10, ["metal"], [{ perk: { ...smithy, share: { meh: 0, good: 0, great: 0, perfect: 0 } }, quality: "good" }])).toBe(0);
    // A better Smithy pays more.
    const better = perksOf([{ building: building("smithy"), tier: 3 }], "discovery-gold")[0]!.perk;
    expect(extraDiscoveryGold(10, ["forging"], [{ perk: better, quality: "good" }])).toBeGreaterThan(extraDiscoveryGold(10, ["forging"], [{ perk: smithy, quality: "good" }]));
  });
});

describe("the six buildings", () => {
  it("are the ones the guide sets out, each brought by its townsperson", () => {
    const table = [...data.buildings.values()].map((item) => ({
      id: item.id,
      job: item.job,
      price: item.price,
      needs: item.tiers[0]!.needs!.map((need) => ("entry" in need ? need.entry : need.tag)),
      wants: item.wants,
      enchant: item.enchantTags,
    }));
    expect(table).toEqual([
      { id: "farm", job: "farmer", price: 30, needs: ["mud", "animal"], wants: ["plant", "animal", "liquid"], enchant: ["healing", "enhance"] },
      { id: "market-stall", job: "merchant", price: 50, needs: ["tree", "glass"], wants: ["reagent", "enchanting", "industrial", "knowledge"], enchant: ["knowledge", "utility"] },
      { id: "tavern", job: "innkeeper", price: 80, needs: ["spirits", "food", "tree"], wants: ["brewing", "liquid", "plant", "animal"], enchant: ["utility", "healing"] },
      { id: "smithy", job: "blacksmith", price: 70, needs: ["forge", "iron"], wants: ["forging", "metal", "mineral", "industrial"], enchant: ["energy", "protection"] },
      { id: "herb-garden", job: "herbalist", price: 50, needs: ["herb", "mud"], wants: ["plant", "healing", "reagent", "liquid"], enchant: ["healing", "transform"] },
      { id: "wizards-tower", job: "wizard", price: 100, needs: ["spellbook", "crystal"], wants: ["knowledge", "enchanting", "mind", "energy"], enchant: ["knowledge", "protection"] },
    ]);
  });

  it("have a tier for each row of the town's table, and only the Herb Garden waits on someone", () => {
    for (const item of data.buildings.values()) expect(item.tiers, item.id).toHaveLength(data.balance.town.tiers.length);
    const waits = [...data.buildings.values()].flatMap((item) => item.tiers.map((tier, index) => (tier.needsJob ? `${item.id} ${index + 1} ${tier.needsJob}` : null)).filter(Boolean));
    expect(waits).toEqual(["herb-garden 2 alchemist", "herb-garden 3 alchemist"]);
  });

  it("use the guide's draft numbers for plots, deeds, and tiers", () => {
    expect(data.balance.town).toEqual(rules);
  });
});

describe("never blocked", () => {
  // The game with no baked row approved: only what has a hand-written recipe.
  const fixed = loadGameData(process.cwd(), { baked: false });
  const stockable = [...fixed.entries.values()].filter(isStockable);

  it("gives every named need a path by fixed recipes from the starting four", () => {
    for (const item of fixed.buildings.values()) {
      for (const tier of item.tiers) {
        for (const need of tier.needs ?? []) {
          if (!("entry" in need)) continue;
          const steps = buildPath(fixed, need.entry);
          expect(steps.at(-1)?.result, `${item.id} needs ${need.entry}`).toBe(need.entry);
        }
      }
    }
  });

  it("lets the townsperson who brings each building be made by fixed recipes", () => {
    for (const item of fixed.buildings.values()) {
      for (const job of [item.job, ...item.tiers.flatMap((tier) => [tier.needsJob, tier.job])]) {
        if (job) expect(buildPath(fixed, job).at(-1)?.result, `${item.id}: ${job}`).toBe(job);
      }
    }
  });

  it("lets every building reach Good from fixed recipes alone, on a first tier's shelves", () => {
    for (const item of fixed.buildings.values()) {
      const carried = item.wants.filter((want) => stockable.some((entry) => entry.tags.includes(want)));
      // At least half its wants have something fixed behind them.
      expect(carried.length * 2, `${item.id}: ${carried.join(", ")}`).toBeGreaterThanOrEqual(item.wants.length);
      // And as many fixed things as a first tier has shelves can cover half between them.
      let best = 0;
      const slots = slotsAt(1, fixed.balance.town);
      const pick = (from: number, chosen: GameEntry[]) => {
        best = Math.max(best, item.wants.filter((want) => chosen.some((entry) => entry.tags.includes(want))).length);
        if (chosen.length === slots) return;
        for (let index = from; index < stockable.length; index++) pick(index + 1, [...chosen, stockable[index]!]);
      };
      pick(0, []);
      expect(QUALITIES.indexOf(qualityFor(best / item.wants.length, fixed.balance.shifts)), `${item.id} covers ${best} of ${item.wants.length}`).toBeGreaterThanOrEqual(QUALITIES.indexOf("good"));
    }
  });

  it("does not ask for a fixed recipe behind every want: the last one or two must be found", () => {
    const found = [...fixed.buildings.values()].flatMap((item) => item.wants.filter((want) => !stockable.some((entry) => entry.tags.includes(want))));
    expect([...new Set(found)].sort()).toEqual(["brewing", "enchanting"]);
  });
});

describe("building data that does not hold together", () => {
  const files = readGameFiles(process.cwd());
  const withBuildings = (change: (all: typeof files.buildings) => typeof files.buildings) => () => buildGameData({ ...files, buildings: change(structuredClone(files.buildings)) });

  it("is refused for a tag outside the vocabulary, or a want only an author can give", () => {
    expect(withBuildings((all) => ((all[0]!.wants = ["sparkly"]), all))).toThrow(/building "farm" uses unknown tag "sparkly"/);
    expect(withBuildings((all) => ((all[0]!.enchantTags = ["sparkly"]), all))).toThrow(/unknown tag "sparkly"/);
    expect(withBuildings((all) => ((all[0]!.wants = ["plant", "rare"]), all))).toThrow(/wants "rare", which only an author can give/);
  });

  it("is refused for a named need with no hand-written recipe", () => {
    expect(withBuildings((all) => ((all[0]!.tiers[0]!.needs = [{ entry: "moonbeam" }]), all))).toThrow(/needs "moonbeam", which has no hand-written recipe/);
    expect(withBuildings((all) => ((all[0]!.tiers[0]!.needs = [{ tag: "sparkly" }]), all))).toThrow(/needs unknown tag "sparkly"/);
  });

  it("is refused for two buildings with one townsperson, an unknown job, or the wrong number of tiers", () => {
    expect(withBuildings((all) => ((all[1]!.job = "farmer"), all))).toThrow(/job "farmer" has two buildings/);
    expect(withBuildings((all) => ((all[0]!.tiers = all[0]!.tiers.slice(0, 2)), all))).toThrow(/has 2 tiers, and the town has 3/);
    expect(withBuildings((all) => [...all, all[0]!])).toThrow(/duplicate building id "farm"/);
  });

  it("is refused for a perk that lifts nothing, or itself", () => {
    expect(withBuildings((all) => ((all[0]!.tiers[0]!.perks = [{ type: "lifts", building: "lighthouse", steps: 1 }]), all))).toThrow(/lifts unknown building "lighthouse"/);
    expect(withBuildings((all) => ((all[0]!.tiers[0]!.perks = [{ type: "lifts", building: "farm", steps: 1 }]), all))).toThrow(/lifts itself/);
  });

  it("is refused when the deeds do not fit the levels or the street", () => {
    const town = files.balance.town;
    const withTown = (change: Partial<TownRules>) => () => buildGameData({ ...files, balance: { ...files.balance, town: { ...town, ...change } } });
    expect(withTown({ deedsByLevel: [2, 3, 5] })).toThrow(/one number for each level/);
    expect(withTown({ deedsByLevel: [2, 3, 2, 7, 9] })).toThrow(/never go down/);
    expect(withTown({ plotPrices: [0, 30, 60] })).toThrow(/more deeds than there are plots/);
    expect(withTown({ tiers: town.tiers.map((tier) => ({ ...tier, level: 9 })) })).toThrow(/levels within the cap/);
  });

  it("leaves out a building that names a job the game does not have, and allows one with no townsperson", () => {
    // Without the magic jobs there is no Wizard for the tower, and no Alchemist for the Herb Garden's second tier.
    const fewer = buildGameData({ ...files, jobs: files.jobs.filter((job) => !job.magic), quests: [] });
    expect([...fewer.buildings.keys()]).toEqual(["farm", "market-stall", "tavern", "smithy"]);
    const misspelled = buildGameData({ ...files, buildings: structuredClone(files.buildings).map((item, index) => (index === 0 ? { ...item, job: "dragon-dentist" } : item)) });
    expect([...misspelled.buildings.keys()]).not.toContain("farm");
    const civic = withBuildings((all) => [...all, { ...all[0]!, id: "well", name: "Well", job: undefined }]);
    expect(civic).not.toThrow();
  });
});

describe("the town's refusal codes", () => {
  it("are codes a refusal can carry", () => {
    const codes: RuleCode[] = ["no-deed", "needs-missing", "no-shop"];
    const fromRules: (RuleCode | null)[] = [
      refusePlot(2, { jobs: ["farmer"], level: 1, gold: 0 }, rules),
      refuseTier(tavern, 1, { held: [], jobs: [], level: 1, gold: 0 }, rules),
    ];
    expect(fromRules).toEqual(["no-deed", "needs-missing"]);
    expect(codes).toHaveLength(3);
  });
});

describe("a building's quality", () => {
  const stock = (...items: [string[], number][]) => items.map(([tags, tier]) => ({ tags, tier }));
  const quality = (items: ReturnType<typeof stock>, extra: Parameters<typeof buildingQuality>[3] = {}, tier = 1) => buildingQuality(tavern, tier, items, extra, shifts);

  it("is Meh when empty, whatever lifts it, and still pays", () => {
    expect(buildingScore(tavern, 1, [], {}, shifts)).toBe(0);
    expect(quality([])).toBe("meh");
    expect(quality([], { lifts: { perks: 3, hand: 1, shift: 1 }, enchantBonus: 1 })).toBe("meh");
    expect(takingsFor(1, "meh", rules, shifts)).toBeGreaterThan(0);
  });

  it("steps up with the share of its wants the stock covers between them", () => {
    // The Tavern wants brewing, liquid, plant, animal. Stock of tier 1 meets a tier 1 building.
    expect(buildingScore(tavern, 1, stock([["brewing"], 1]), {}, shifts)).toBeCloseTo(0.25 + shifts.tierBonus);
    expect(quality(stock([["brewing"], 1]))).toBe("meh");
    expect(quality(stock([["brewing"], 1], [["liquid"], 1]))).toBe("good");
    expect(quality(stock([["brewing"], 1], [["liquid"], 1], [["plant"], 1]))).toBe("great");
    expect(quality(stock([["brewing", "liquid"], 1], [["plant", "animal"], 1]))).toBe("perfect");
    // Shallow stock covers the same wants but earns no tier bonus, so it falls a step short.
    expect(quality(stock([["brewing", "liquid"], 0], [["plant", "animal"], 0]))).toBe("great");
    expect(quality(stock([["brewing"], 0], [["liquid"], 0], [["plant"], 0]))).toBe("good");
  });

  it("gains the tier bonus only when the best stocked thing meets the building's tier", () => {
    const shallow = stock([["brewing", "liquid"], 0]);
    const deep = stock([["brewing", "liquid"], 2]);
    expect(buildingScore(tavern, 2, shallow, {}, shifts)).toBeCloseTo(0.5);
    expect(buildingScore(tavern, 2, deep, {}, shifts)).toBeCloseTo(0.5 + shifts.tierBonus);
  });

  it("gains an enchantment's bonus, and the owner's rank bonus only at their own building", () => {
    const one = stock([["brewing"], 1]);
    expect(buildingScore(tavern, 1, one, { enchantBonus: 0.2 }, shifts)).toBeCloseTo(0.25 + shifts.tierBonus + 0.2);
    expect(buildingScore(tavern, 1, one, { rankBonus: 0.1 }, shifts)).toBeCloseTo(0.25 + shifts.tierBonus + 0.1);
    expect(quality(one, { enchantBonus: 0.3 })).toBe("good");
    expect(quality(one, {})).toBe("meh");
  });

  it("is moved up by lifts, a lent hand, and a good shift, and never past Perfect", () => {
    const two = stock([["brewing"], 1], [["liquid"], 1]);
    expect(quality(two)).toBe("good");
    expect(quality(two, { lifts: { perks: 1 } })).toBe("great");
    expect(quality(two, { lifts: { perks: 1, hand: 1 } })).toBe("perfect");
    expect(quality(two, { lifts: { perks: 2, hand: 1, shift: 1 } })).toBe("perfect");
    expect(liftQuality("perfect", 5)).toBe("perfect");
    // Nothing lowers a quality.
    expect(liftQuality("good", -2)).toBe("good");
    expect(liftQuality("meh", 0)).toBe("meh");
  });

  it("is not luck: the same stock always gives the same quality", () => {
    const items = stock([["brewing"], 1], [["plant"], 1]);
    expect(new Set(Array.from({ length: 20 }, () => quality(items))).size).toBe(1);
  });

  it("can be previewed with a discovery added or cleared, matching the real result after", () => {
    const have = stock([["brewing"], 1]);
    const added = { tags: ["liquid", "plant"], tier: 1 };
    const previewed = previewQuality(tavern, 1, have, { add: added }, {}, shifts);
    expect(previewed).toBe(quality([...have, added]));
    expect(previewed).not.toBe(quality(have));
    expect(previewQuality(tavern, 1, [...have, added], { without: 1 }, {}, shifts)).toBe(quality(have));
    // The stock itself is not changed by previewing.
    expect(have).toHaveLength(1);
  });
});

describe("lifts from other buildings", () => {
  const standing = (tier: number) => [...data.buildings.values()].map((item) => ({ building: item, tier }));

  it("are the steps of every `lifts` perk that names a building, and a building never lifts itself", () => {
    expect(liftsFor("tavern", standing(1))).toBe(1);
    expect(liftsFor("herb-garden", standing(1))).toBe(0);
    expect(liftsFor("herb-garden", standing(2))).toBe(1);
    expect(liftsFor("farm", standing(3))).toBe(0);
    expect(liftsFor("tavern", [])).toBe(0);
  });

  it("travel with perksOf alongside the quality of the building that gives them", () => {
    const found = perksOf([{ building: building("smithy"), tier: 1, quality: "great" }, { building: herbGarden, tier: 1 }], "discovery-gold");
    expect(found.map((item) => [item.building.id, item.quality])).toEqual([["smithy", "great"], ["herb-garden", "meh"]]);
  });
});

describe("Cheer", () => {
  it("is a point per quality step, per regular, and per live enchantment", () => {
    expect(cheerPoints([], 0, 0)).toBe(0);
    expect(cheerPoints(["meh", "good", "great", "perfect"], 0, 0)).toBe(6);
    expect(cheerPoints(["good"], 2, 1)).toBe(4);
  });

  it("falls in a band from its first point, and the last band holds from there up", () => {
    expect([0, 3, 4, 8, 9, 14, 15, 99].map((points) => cheerBand(points, rules).name)).toEqual(["Quiet", "Quiet", "Pleasant", "Pleasant", "Lively", "Lively", "Merry", "Merry"]);
  });

  it("raises takings by the band's share", () => {
    const band = (points: number) => cheerBand(points, rules).takings;
    expect([0, 4, 9, 15].map(band)).toEqual([0, 0.1, 0.2, 0.3]);
    expect(takingsFor(3, "good", rules, shifts, band(15))).toBe(31);
  });
});

describe("learning discount", () => {
  const tower = building("wizards-tower");

  it("takes the tower's share off, never below 1 gold, and is nothing without one", () => {
    expect(discountShare([], "learn-discount")).toBe(0);
    expect(discountShare([{ building: tower, tier: 1 }], "learn-discount")).toBe(0.25);
    // A later tier restates the perk; it is not added on top.
    expect(discountShare([{ building: tower, tier: 3 }], "learn-discount")).toBe(0.25);
    expect(discountShare([{ building: tower, tier: 1 }], "shop-discount")).toBe(0);
    expect(learnPrice(20, 0)).toBe(20);
    expect(learnPrice(20, 0.25)).toBe(15);
    expect(learnPrice(1, 0.9)).toBe(1);
    expect(learnPrice(0, 0.5)).toBe(0);
  });
});

describe("hiring", () => {
  it("costs more with the building's tier, and a tier past the table takes its last row", () => {
    expect([1, 2, 3].map((tier) => hireCost(tier, rules))).toEqual([20, 50, 100]);
    expect(hireCost(9, rules)).toBe(100);
    expect(hireCost(0, rules)).toBe(20);
  });

  it("tops the hire up by the difference when a staffed building is raised", () => {
    expect(hireTopUp(1, 2, rules)).toBe(30);
    expect(hireTopUp(2, 3, rules)).toBe(50);
    expect(hireTopUp(3, 3, rules)).toBe(0);
  });

  it("pays takings only while someone is hired", () => {
    expect(staffedTakings(12, true)).toBe(12);
    expect(staffedTakings(12, false)).toBe(0);
  });
});
