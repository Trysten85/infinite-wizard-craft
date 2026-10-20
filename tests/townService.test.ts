import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/server/app";
import { discoveryGold, xpToReach } from "../src/server/progress";
import { comboKey, type GameEntry, type TownView } from "../src/shared/schema";
import type { GameData } from "../src/server/gameData";
import { openStore } from "../src/server/store";
import { grantOwedStalls, hireStanding } from "../src/server/town";
import { extraDiscoveryGold, learnPrice, takingsFor } from "../src/shared/town";
import { data, newGame } from "./helpers";

const rules = data.balance.town;
const { costs, time } = data.balance.day;
type Game = ReturnType<typeof newGame>;

const building = (id: string) => data.buildings.get(id)!;
// What an unstocked building of a tier pays for a night.
const pays = (tier: number) => takingsFor(tier, "meh", rules, data.balance.shifts);
const give = (game: Game, ids: string[], player = "ann") => ids.forEach((id) => game.store.addDiscovery(player, id));
const firstJob = (game: Game, player = "ann") => give(game, [[...data.jobs.keys()][0]!], player);
const gold = (game: Game, amount: number, player = "ann") => game.store.addLedger(player, amount, "quest", `grant-${amount}-${game.store.getGold(player)}`);
const level = (game: Game, to: number, player = "ann") => {
  game.progress.settle(player);
  game.store.changeStats(player, { bonusXp: xpToReach(to, data.balance) - game.progress.getProgress(player).xp });
  game.progress.settle(player);
};
// The named things a building's first tier asks for.
const needsOf = (id: string) => building(id).tiers[0]!.needs!.flatMap((need) => ("entry" in need ? [need.entry] : []));
// Something the player made themselves, as deep as wanted, carrying a tag.
function made(game: Game, id: string, tag: string, depth: number, player = "ann") {
  const entry: GameEntry = { id, name: id, kind: "material", description: "x", tags: [tag], affinity: [], tier: 1, source: "generated", depth, xp: 10 };
  game.store.saveGenerated(comboKey(id, "fire"), id, "fire", entry);
  game.store.addDiscovery(player, id);
}

// A game opened on a save from before the town: what `setup` wrote, in a database from before
// the column that marks who is owed the stall. The file is removed when the test ends.
const preTownDirs: string[] = [];
afterEach(() => preTownDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
function preTown(setup: (store: ReturnType<typeof openStore>) => void): Game {
  const dir = mkdtempSync(join(tmpdir(), "pre-town-"));
  preTownDirs.push(dir);
  const path = join(dir, "game.db");
  setup(openStore(path));
  const old = new DatabaseSync(path);
  old.exec("ALTER TABLE player_stats DROP COLUMN stall_owed");
  old.close();
  return newGame(1, undefined, { store: openStore(path) });
}

// The game as shipped, but with nobody waiting on a written arrival condition. These tests are
// about raising, and arrival has its own (`tests/evening.test.ts`).
const nobodyWaits: GameData = { ...data, cast: { people: data.cast.people.map((person) => ({ ...person, arrival: {} })) } };

// Brings on the night, and so the next morning: what was raised today stands.
function overnight(game: Game): void {
  game.dusk("ann");
  game.day.end("ann");
}

// A player with a blacksmith in town, the things a Smithy needs, gold, a plot, and an evening.
function readyToBuild(): Game {
  const game = newGame(1, undefined, { data: nobodyWaits });
  give(game, ["person", "blacksmith", ...needsOf("smithy")]);
  gold(game, 500);
  game.town.buyPlot("ann");
  game.dusk("ann");
  return game;
}

describe("townsfolk", () => {
  it("do not come with the trade: crafting it gives the plan, and nobody is in town for it yet", () => {
    const game = newGame(1, undefined, { data: nobodyWaits });
    expect(game.town.view("ann")).toMatchObject({ townsfolk: [], plans: [] });
    give(game, ["blacksmith"]);
    const town = game.town.view("ann");
    expect(town.townsfolk).toEqual([]);
    expect(town.plans).toHaveLength(1);
    expect(town.plans[0]).toMatchObject({ building: "smithy", name: "Smithy", price: building("smithy").price, time: costs.build, ready: false });
    expect(town.plans[0]!.needs).toEqual([{ label: "Forge", met: false }, { label: "Iron", met: false }]);
    expect(game.progress.getProgress("ann").job).toBeNull();
  });

  it("come the morning after their building stands: one person to a building, the trade's written person", () => {
    const game = readyToBuild();
    game.town.build("ann", 0, "smithy");
    expect(game.town.view("ann").townsfolk).toEqual([]);
    overnight(game);
    const first = data.cast.people.find((person) => person.job === "blacksmith")!;
    expect(game.town.view("ann").townsfolk).toEqual([{ person: expect.any(Number), job: "blacksmith", name: first.name, housed: true, fondness: 0, regular: false }]);
    expect(game.store.listPeople("ann")[0]).toMatchObject({ job: "blacksmith", role: "Blacksmith", firstDay: game.day.today("ann").number, pronoun: first.pronoun });
    // They arrive once, however often the street is looked at.
    game.town.view("ann");
    expect(game.store.listPeople("ann")).toHaveLength(1);
  });

  it("only come with a building, though every trade with one gives its plan", () => {
    const game = newGame(1, undefined, { data: nobodyWaits });
    give(game, [...data.jobs.keys()]);
    const town = game.town.view("ann");
    expect(town.townsfolk).toEqual([]);
    expect(town.plans.map((plan) => plan.building).sort()).toEqual([...data.buildings.keys()].sort());
  });

  it("can be the evening's visitor, are not counted against the cast, and keep their names", async () => {
    const briefs: { takenNames: string[]; person: { returning: boolean; name?: string } }[] = [];
    const { createCannedEventWriter } = await import("../src/server/events/writer");
    const canned = createCannedEventWriter();
    const game = newGame(1, { ...canned, write: (brief) => (briefs.push(brief), canned.write(brief)) }, { data: nobodyWaits });
    // Every building standing brings its person.
    for (const [plot, id] of [...data.buildings.keys()].entries()) {
      game.store.addPlot("ann", plot);
      game.store.setBuilding("ann", plot, id, 1);
    }
    game.town.arrive("ann");
    const townsfolk = game.store.listPeople("ann").map((person) => person.name);
    // With nobody met yet, a townsperson is who comes back.
    await game.events.test("ann", "repeat");
    expect(briefs[0]!.person.returning).toBe(true);
    expect(townsfolk).toContain(briefs[0]!.person.name);
    expect(briefs[0]!.takenNames).toEqual(expect.arrayContaining(townsfolk));
    // The visitor is not thrown away with the test event, and the street keeps all its people.
    await game.events.test("ann", "small_thief");
    expect(game.store.listPeople("ann").filter((person) => person.job !== null)).toHaveLength(townsfolk.length);
    // A street full of townsfolk does not push the people the player has met out of the story.
    const heart = (await game.events.respond("ann", "fair")).next!;
    await game.events.respond("ann", heart.responses[0]!.type);
    expect(game.store.listPeople("ann").filter((person) => person.job === null).map((person) => person.status)).toEqual(["active"]);
  });
});

describe("plots", () => {
  it("wait on a first job, which the first plot is bought for", () => {
    const game = newGame();
    gold(game, 1000);
    expect(() => game.town.buyPlot("ann")).toThrowError(expect.objectContaining({ code: "no-job" }));
    expect(game.store.listPlots("ann")).toHaveLength(0);
    firstJob(game);
    const before = game.progress.getProgress("ann").gold;
    const { rewards } = game.town.buyPlot("ann");
    // The plot's price goes out, and the "Buy a plot" quest pays what it pays.
    expect(game.progress.getProgress("ann").gold).toBe(before - rules.plotPrices[0]! + rewards.gold);
    expect(game.store.getLedgerRefs("ann", "plot")).toEqual(["0"]);
  });

  it("are bought in order, at any time of day", () => {
    const game = newGame();
    firstJob(game);
    gold(game, rules.plotPrices[0]!);
    expect(game.town.view("ann").plots.map((plot) => plot.owned)).toEqual(rules.plotPrices.map(() => false));
    expect(game.town.buyPlot("ann")).toMatchObject({ plot: 0 });
    expect(game.progress.getProgress("ann")).toMatchObject({ day: { phase: "morning" } });
    gold(game, rules.plotPrices[1]!);
    expect(game.town.buyPlot("ann").plot).toBe(1);
    const town = game.town.view("ann");
    expect(town.plots.map((plot) => plot.owned)).toEqual(rules.plotPrices.map((_, index) => index < 2));
    expect(town.plots.map((plot) => plot.price)).toEqual(rules.plotPrices);
    expect(town.plots.slice(0, 4).map((plot) => plot.opensAt)).toEqual([1, 1, 2, 3]);
  });

  it("are refused past the player's deeds, and without the gold", () => {
    const game = newGame();
    firstJob(game);
    gold(game, rules.plotPrices[0]!);
    expect(game.town.view("ann").deeds).toEqual({ have: rules.deedsByLevel[0], max: rules.deedsByLevel.at(-1) });
    game.town.buyPlot("ann");
    expect(() => game.town.buyPlot("ann")).toThrowError(expect.objectContaining({ code: "not-enough-gold" }));
    gold(game, 1000);
    game.town.buyPlot("ann");
    expect(() => game.town.buyPlot("ann")).toThrowError(expect.objectContaining({ code: "no-deed", message: expect.stringMatching(/Level 2 brings the next/) }));
    expect(game.store.listPlots("ann")).toHaveLength(2);
    // A level gained is a deed gained.
    level(game, 2);
    expect(game.town.view("ann").deeds.have).toBe(rules.deedsByLevel[1]);
    expect(game.town.buyPlot("ann").plot).toBe(2);
  });
});

describe("raising a building", () => {
  it("takes gold and no time, at any hour, and stands after the night", () => {
    const game = readyToBuild();
    game.setDay("ann", { sun: 0 });
    expect(game.town.view("ann").plans[0]).toMatchObject({ building: "smithy", ready: true });
    const before = game.progress.getProgress("ann").gold;
    const raised = game.town.build("ann", 0, "smithy");
    expect(raised).toMatchObject({ night: null, dusk: null });
    expect(game.progress.getProgress("ann")).toMatchObject({ gold: before - building("smithy").price + raised.rewards.gold, day: { time } });
    // Going up: the plan is spent, nothing stands yet, and the plot says what is coming.
    const going = game.town.view("ann");
    expect(going.plans).toEqual([]);
    expect(going.plots[0]).toMatchObject({ building: null, raising: { building: "smithy", name: "Smithy", tier: 1, nights: rules.raiseNights } });
    expect(going.townsfolk).toEqual([]);
    game.dusk("ann");
    const night = game.day.end("ann").night!;
    expect(night.lines).toContain("The Smithy stands, finished overnight.");
    // It was not standing for tonight's takings.
    expect(night.takings).toEqual([]);
    const town = game.town.view("ann");
    expect(town.plots[0]!.raising).toBeNull();
    expect(town.plans).toEqual([]);
    expect(town.townsfolk[0]).toMatchObject({ job: "blacksmith", housed: true });
    expect(town.plots[0]!.building).toMatchObject({
      id: "smithy",
      name: "Smithy",
      tier: 1,
      quality: "meh",
      // Nobody is hired yet, so it earns nothing.
      takings: 0,
      staff: { person: { id: expect.any(Number), name: data.cast.people.find((person) => person.job === "blacksmith")!.name }, hired: false, hireCost: rules.hireByTier[0] },
      wants: building("smithy").wants,
      stock: [{ slot: 0, entry: null }, { slot: 1, entry: null }],
      enchantment: null,
      next: { gold: rules.tiers[1]!.gold, level: rules.tiers[1]!.level, ready: false },
    });
  });

  it("is refused for the longest wait first: the level, then the needs, then the gold, and never for the hour", () => {
    const game = newGame(1, undefined, { data: nobodyWaits });
    give(game, ["person", "blacksmith"]);
    game.town.buyPlot("ann");
    const raise = () => game.town.build("ann", 0, "smithy");
    expect(raise).toThrowError(expect.objectContaining({ code: "needs-missing", message: expect.stringMatching(/Forge; Iron/) }));
    give(game, ["forge"]);
    expect(raise).toThrowError(expect.objectContaining({ code: "needs-missing", message: expect.stringMatching(/needs: Iron\./) }));
    give(game, ["iron"]);
    game.store.addLedger("ann", -game.store.getGold("ann"), "shop", "test-drain");
    expect(raise).toThrowError(expect.objectContaining({ code: "not-enough-gold" }));
    // Nothing was taken for any of that.
    expect(game.store.getLedgerRefs("ann", "building")).toEqual([]);
    expect(game.store.listPlots("ann")).toEqual([{ plot: 0, building: null, tier: 0, raising: null }]);
    gold(game, 500);
    // In the morning, with every time spent: it is the day's work, and goes ahead.
    game.setDay("ann", { sun: 0, spent: time });
    expect(raise().night).toBeNull();
  });

  it("needs a plot the player owns with nothing on it, a plan in hand, and is one of a kind", () => {
    const game = readyToBuild();
    expect(() => game.town.build("ann", 3, "smithy")).toThrow(/do not own that plot/);
    expect(() => game.town.build("ann", 0, "castle")).toThrow(/no such building/);
    expect(() => game.town.build("ann", 0, "farm")).toThrow(/no plan for a Farm/);
    game.town.build("ann", 0, "smithy");
    give(game, ["farmer", ...needsOf("farm")]);
    expect(() => game.town.build("ann", 0, "farm")).toThrow(/already going up on that plot/);
    game.town.buyPlot("ann");
    expect(() => game.town.build("ann", 1, "smithy")).toThrow(/Smithy is already going up/);
    overnight(game);
    expect(() => game.town.build("ann", 0, "farm")).toThrow(/already stands on that plot/);
    expect(() => game.town.build("ann", 1, "smithy")).toThrow(/Smithy already stands/);
    expect(game.town.build("ann", 1, "farm").night).toBeNull();
    overnight(game);
    expect(game.town.view("ann").plots.slice(0, 2).map((plot) => plot.building?.id)).toEqual(["smithy", "farm"]);
  });

  it("never brings night, even with every time spent, and pays its first takings the night after it stands", () => {
    const game = readyToBuild();
    game.setDay("ann", { spent: time });
    expect(game.town.build("ann", 0, "smithy").night).toBeNull();
    expect(game.day.end("ann").night!.takings).toEqual([]);
    // Standing, its person comes in the morning; hired, it pays that night.
    game.town.hire("ann", 0);
    overnight(game);
    expect(game.store.getLedgerRefs("ann", "takings")).toEqual(["2:0"]);
  });

  it("can be done on the short evening of a player who turned in early", () => {
    const game = readyToBuild();
    game.setDay("ann", { early: true });
    expect(game.town.build("ann", 0, "smithy").night).toBeNull();
  });
});

describe("raising a tier", () => {
  function withSmithy(): Game {
    const game = readyToBuild();
    game.town.build("ann", 0, "smithy");
    overnight(game);
    return game;
  }

  it("asks for the level, things the player made that the building wants, and gold, and is done overnight", () => {
    const game = withSmithy();
    const raise = () => game.town.upgrade("ann", 0);
    expect(raise).toThrowError(expect.objectContaining({ code: "level-too-low", message: expect.stringMatching(/takes level 3/) }));
    level(game, 3);
    expect(raise).toThrowError(expect.objectContaining({ code: "needs-missing" }));
    const asked = rules.tiers[1]!.made!;
    made(game, "deep-ingot", "metal", asked.depth);
    // Too shallow, the wrong kind of thing, and one that was bought: none of these count.
    made(game, "shallow-ingot", "metal", asked.depth - 1);
    made(game, "deep-cheese", "animal", asked.depth);
    made(game, "bought-ingot", "metal", asked.depth);
    game.store.addLedger("ann", 0, "shop", "bought-ingot");
    expect(game.town.view("ann").plots[0]!.building!.next).toMatchObject({ ready: false, needs: [{ met: false, progress: { have: 1, need: asked.count } }] });
    expect(raise).toThrowError(expect.objectContaining({ code: "needs-missing" }));
    made(game, "deep-anvil", "forging", asked.depth + 2);
    game.store.addLedger("ann", -game.store.getGold("ann"), "shop", "test-drain");
    expect(raise).toThrowError(expect.objectContaining({ code: "not-enough-gold" }));
    gold(game, 1000);
    const before = game.progress.getProgress("ann");
    const raised = raise();
    expect(raised.night).toBeNull();
    expect(game.progress.getProgress("ann")).toMatchObject({ gold: before.gold - rules.tiers[1]!.gold! + raised.rewards.gold, day: { time: before.day!.time } });
    // It works at its old tier until the night is out.
    expect(game.town.view("ann").plots[0]).toMatchObject({ building: { tier: 1 }, raising: { building: "smithy", tier: 2 } });
    expect(raise).toThrow(/already being raised/);
    overnight(game);
    expect(game.town.view("ann").plots[0]!.building).toMatchObject({ tier: 2, takings: 0, stock: [{ slot: 0 }, { slot: 1 }, { slot: 2 }] });
  });

  it("is refused where nothing stands and at the top, and not for the hour", () => {
    const game = withSmithy();
    expect(() => game.town.upgrade("ann", 1)).toThrow(/Nothing stands on that plot/);
    level(game, 5);
    gold(game, 5000);
    for (const [index, tag] of ["metal", "forging", "mineral"].entries()) made(game, `deep-${index}`, tag, 9);
    game.setDay("ann", { sun: 0 });
    game.town.upgrade("ann", 0);
    overnight(game);
    game.town.upgrade("ann", 0);
    overnight(game);
    expect(game.town.view("ann").plots[0]!.building).toMatchObject({ tier: 3, next: null });
    expect(() => game.town.upgrade("ann", 0)).toThrow(/as fine as it can be/);
  });

  it("hands the Herb Garden to the Alchemist, who must have arrived first", () => {
    const game = newGame(1, undefined, { data: nobodyWaits });
    give(game, ["herbalist", ...needsOf("herb-garden")]);
    gold(game, 5000);
    level(game, 3);
    game.town.buyPlot("ann");
    game.dusk("ann");
    game.town.build("ann", 0, "herb-garden");
    overnight(game);
    game.town.view("ann");
    for (const [index, tag] of ["plant", "healing"].entries()) made(game, `deep-herb-${index}`, tag, 6);
    expect(() => game.town.upgrade("ann", 0)).toThrowError(expect.objectContaining({ code: "needs-missing", message: expect.stringMatching(/An Alchemist in town/) }));
    give(game, ["alchemist"]);
    game.town.upgrade("ann", 0);
    overnight(game);
    const housed = Object.fromEntries(game.town.view("ann").townsfolk.map((person) => [person.job, person.housed]));
    expect(housed).toEqual({ herbalist: false, alchemist: true });
  });
});

describe("takings", () => {
  it("are paid by each building at night, through the ledger, once", () => {
    const game = readyToBuild();
    game.town.build("ann", 0, "smithy");
    // It stands after tonight, and pays from the next night on, once its person is hired.
    game.day.end("ann");
    game.town.hire("ann", 0);
    game.dusk("ann");
    const before = game.progress.getProgress("ann").gold;
    const night = game.day.end("ann").night!;
    expect(pays(1)).toBeGreaterThan(0);
    expect(night.takings).toEqual([{ plot: 0, building: "smithy", name: "Smithy", quality: "meh", gold: pays(1) }]);
    expect(game.progress.getProgress("ann").gold).toBe(before + pays(1));
    expect(game.store.getLedgerRefs("ann", "takings")).toEqual(["2:0"]);
    // And again the next night, for that night.
    game.dusk("ann");
    game.day.end("ann");
    expect(game.store.getLedgerRefs("ann", "takings")).toEqual(["2:0", "3:0"]);
    expect(game.progress.getProgress("ann").gold).toBe(before + 2 * pays(1));
  });

  it("are nothing on an empty street", () => {
    const game = newGame();
    firstJob(game);
    gold(game, rules.plotPrices[0]!);
    game.town.buyPlot("ann");
    game.dusk("ann");
    expect(game.day.end("ann").night!.takings).toEqual([]);
    expect(game.store.getLedgerRefs("ann", "takings")).toEqual([]);
  });
});

describe("a building that pays for discoveries of its kind", () => {
  it("adds its share to the gold of a new discovery carrying one of its tags, and to no other", () => {
    const game = readyToBuild();
    game.town.build("ann", 0, "smithy");
    overnight(game);
    game.progress.settle("ann");
    const perk = building("smithy").tiers[0]!.perks.find((item) => item.type === "discovery-gold")!;
    const fresh = [...data.entries.values()].filter((entry) => entry.kind === "material" && entry.depth > 0 && !game.store.getDiscoveries("ann").includes(entry.id));
    const metal = fresh.find((entry) => entry.tags.some((tag) => perk.type === "discovery-gold" && perk.tags.includes(tag)))!;
    const other = fresh.find((entry) => !entry.tags.some((tag) => perk.type === "discovery-gold" && perk.tags.includes(tag)))!;

    give(game, [other.id]);
    expect(game.progress.settle("ann").gold).toBe(discoveryGold(other, data.balance));
    expect(game.store.getLedgerRefs("ann", "perk")).toEqual([]);

    give(game, [metal.id]);
    const base = discoveryGold(metal, data.balance);
    const extra = extraDiscoveryGold(base, metal.tags, [{ perk: perk as Extract<typeof perk, { type: "discovery-gold" }>, quality: "meh" }]);
    expect(extra).toBeGreaterThanOrEqual(1);
    const rewards = game.progress.settle("ann");
    expect(rewards.gold - rewards.quests.reduce((total, quest) => total + quest.gold, 0)).toBe(base + extra);
    expect(game.store.getLedgerRefs("ann", "perk")).toEqual([metal.id]);
    // Paid once, like the discovery itself.
    expect(game.progress.settle("ann").gold).toBe(0);
  });

  it("pays nothing extra for something bought", () => {
    const game = readyToBuild();
    game.town.build("ann", 0, "smithy");
    overnight(game);
    game.store.addLedger("ann", -1, "shop", "gold");
    give(game, ["gold"]);
    game.progress.settle("ann");
    expect(game.store.getLedgerRefs("ann", "perk")).toEqual([]);
  });
});

describe("the shop is earned", () => {
  it("is refused until a Market Stall stands", () => {
    const game = newGame();
    expect(() => game.shop.view("ann")).toThrowError(expect.objectContaining({ code: "no-shop", message: expect.stringMatching(/Market Stall/) }));
    expect(() => game.shop.buy("ann", 0)).toThrowError(expect.objectContaining({ code: "no-shop" }));
    expect(game.store.getShop("ann")).toBeUndefined();
    // Another building does not open it.
    const smith = readyToBuild();
    smith.town.build("ann", 0, "smithy");
    overnight(smith);
    expect(() => smith.shop.view("ann")).toThrowError(expect.objectContaining({ code: "no-shop" }));
  });

  it("opens with the three random shelves, and gains the tailored three at the next tier", () => {
    const game = newGame();
    give(game, ["merchant", ...needsOf("market-stall")]);
    gold(game, 5000);
    game.town.buyPlot("ann");
    game.dusk("ann");
    game.town.build("ann", 0, "market-stall");
    overnight(game);
    const first = game.shop.view("ann").slots;
    expect(first.map((slot) => slot.type)).toEqual(["random", "random", "random"]);

    level(game, 3);
    for (const [index, tag] of ["reagent", "industrial"].entries()) made(game, `deep-ware-${index}`, tag, 6);
    game.dusk("ann");
    expect(game.shop.view("ann").slots).toHaveLength(3);
    game.town.upgrade("ann", 0);
    // The tier is done overnight, and its shelves are filled the next morning.
    expect(game.shop.view("ann").slots).toHaveLength(3);
    overnight(game);
    const shelf = game.shop.view("ann").slots;
    expect(shelf).toHaveLength(6);
    expect(shelf.filter((slot) => slot.type === "random").length).toBeGreaterThanOrEqual(3);
  });

  it("takes a share off every price at the top tier", () => {
    const plain = newGame();
    plain.stall("ann", 2);
    const cheap = newGame();
    cheap.stall("ann", 3);
    const share = building("market-stall").tiers[2]!.perks.flatMap((perk) => (perk.type === "shop-discount" ? [perk.share] : []))[0]!;
    const full = plain.shop.view("ann").slots.map((slot) => slot.price);
    expect(cheap.shop.view("ann").slots.map((slot) => slot.price)).toEqual(full.map((price) => Math.max(1, Math.round(price * (1 - share)))));
  });

  it("is given to a saved player who had been buying from it: a stall on their first plot, with every shelf", () => {
    // As an old save had it: something bought, and no street at all.
    const game = preTown((store) => {
      store.changeStats("ann", { bonusXp: 1 });
      store.addLedger("ann", -5, "shop", "sulfur");
      store.addDiscovery("ann", "sulfur");
    });
    expect(grantOwedStalls(data, game.store)).toEqual(["ann"]);
    expect(game.shop.view("ann").slots).toHaveLength(6);
    expect(game.store.listPlots("ann")).toEqual([{ plot: 0, building: "market-stall", tier: 2, raising: null }]);
    const town = game.town.view("ann");
    expect(town.plots[0]).toMatchObject({ owned: true, building: { id: "market-stall", tier: 2 } });
    expect(town.plans).toEqual([]);
    // Given once, and the next plot is still theirs to buy.
    gold(game, 100);
    expect(game.town.buyPlot("ann").plot).toBe(1);
    expect(game.store.listPlots("ann")).toHaveLength(2);
    // Someone who never bought anything starts with an empty street.
    expect(game.town.view("bob").plots.every((plot) => !plot.owned)).toBe(true);
    expect(() => game.shop.view("bob")).toThrowError(expect.objectContaining({ code: "no-shop" }));
  });
});

describe("the town routes", () => {
  const post = (body: unknown = {}) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("serve the street, sell a plot, raise a building, raise it a tier, and open the shop", async () => {
    const game = newGame();
    const app = createApp(game.combiner, { progress: game.progress, shop: game.shop, day: game.day, town: game.town });
    const get = async (path: string) => app.request(`/api/players/ann${path}`);
    const send = async (path: string, body?: unknown) => {
      const response = await app.request(`/api/players/ann${path}`, post(body));
      return { status: response.status, body: (await response.json()) as Record<string, any> };
    };
    give(game, ["merchant", ...needsOf("market-stall")]);
    gold(game, 5000);

    const street = (await (await get("/town")).json()) as TownView;
    expect(street.plots).toHaveLength(rules.plotPrices.length);
    expect(street.plans.map((plan) => plan.building)).toEqual(["market-stall"]);
    const shut = await get("/shop");
    expect(shut.status).toBe(400);
    expect(await shut.json()).toMatchObject({ code: "no-shop", error: expect.any(String) });
    expect((await send("/shop/buy", { slot: 0 })).body).toMatchObject({ code: "no-shop" });

    const plot = await send("/town/plots");
    expect(plot.body).toMatchObject({ plot: 0, rewards: { gold: expect.any(Number) }, night: null, dusk: null, progress: { day: { phase: "morning" } } });
    // In the morning, free of time; it stands after the night.
    const raised = await send("/town/build", { plot: 0, building: "market-stall" });
    expect(raised.status).toBe(200);
    expect(raised.body).toMatchObject({ rewards: { quests: expect.any(Array) }, night: null, dusk: null, progress: { day: { time } } });
    expect(((await (await get("/town")).json()) as TownView).plots[0]).toMatchObject({ building: null, raising: { building: "market-stall", tier: 1 } });
    expect((await get("/shop")).status).toBe(400);
    overnight(game);
    expect((await get("/shop")).status).toBe(200);
    expect(((await (await get("/town")).json()) as TownView).plots[0]!.building).toMatchObject({ id: "market-stall", tier: 1 });

    const early = await send("/town/upgrade", { plot: 0 });
    expect(early.status).toBe(400);
    expect(early.body).toMatchObject({ code: "level-too-low" });
    level(game, 3);
    for (const [index, tag] of ["reagent", "knowledge"].entries()) made(game, `deep-ware-${index}`, tag, 6);
    const better = await send("/town/upgrade", { plot: 0 });
    expect(better.body).toMatchObject({ night: null, progress: { day: { number: 2 } } });
    expect(((await (await get("/town")).json()) as TownView).plots[0]).toMatchObject({ building: { tier: 1 }, raising: { tier: 2 } });
    overnight(game);
    expect(((await (await get("/town")).json()) as TownView).plots[0]!.building!.tier).toBe(2);

    expect((await send("/town/build", { plot: "first", building: "smithy" })).status).toBe(400);
    expect((await send("/town/upgrade", {})).status).toBe(400);
  });
});

describe("the learning price", () => {
  const SPELL = "spell-fire-bolt";
  // A player with a Wizard's Tower standing, and a spell they have discovered.
  function withTower(): Game {
    const game = newGame();
    give(game, [SPELL, "spellbook"]);
    game.store.addPlot("ann", 0);
    game.store.setBuilding("ann", 0, "wizards-tower", 1);
    return game;
  }
  const base = data.entries.get(SPELL)!.learnCost!;

  it("is shown on the spell and charged exactly, so the two agree", () => {
    const game = withTower();
    const shown = game.combiner.listDiscovered("ann").find((entry) => entry.id === SPELL)!;
    expect(shown.learnPrice).toBe(learnPrice(base, 0.25));
    expect(shown.learnPrice).toBeLessThan(base);
    level(game, 5);
    gold(game, 500);
    const before = game.store.getGold("ann");
    const { cost, rewards } = game.progress.learn("ann", SPELL);
    expect(cost).toBe(shown.learnPrice);
    expect(game.store.getGold("ann")).toBe(before - cost + rewards.gold);
  });

  it("is the base price with no Tower", () => {
    const game = newGame();
    give(game, [SPELL]);
    expect(game.combiner.listDiscovered("ann").find((entry) => entry.id === SPELL)!.learnPrice).toBe(base);
  });
});

describe("a player saved before the town", () => {
  it("is given the Market Stall whether or not they bought from the shop, once", () => {
    // An old save: a player who owns no plot and never bought anything.
    const game = preTown((store) => store.changeStats("ann", { bonusXp: 1 }));
    game.store.changeStats("bea", { bonusXp: 1 });
    const owned = (player: string) => game.town.view(player).plots.filter((plot) => plot.building);
    // Looking at the town gives nothing: only the start-up grant does.
    expect(owned("ann")).toEqual([]);
    expect(game.store.listPlots("ann")).toEqual([]);
    expect(game.store.stallOwed("ann")).toBe(true);
    expect(grantOwedStalls(data, game.store)).toEqual(["ann"]);
    expect(owned("ann").map((plot) => plot.building!.id)).toEqual(["market-stall"]);
    expect(game.store.stallOwed("ann")).toBe(false);
    // Once only, and someone who started after the town is not owed one.
    expect(grantOwedStalls(data, game.store)).toEqual([]);
    expect(game.store.listPlots("ann")).toHaveLength(1);
    expect(owned("bea")).toEqual([]);
  });
});

describe("an action that fails half-way", () => {
  // A store that breaks on one write, after the gold has gone out.
  function breaking(method: "addPlot" | "addMeal"): Game {
    const real = openStore(":memory:");
    const store = { ...real, [method]: () => { throw new Error(`${method} broke`); } } as typeof real;
    return newGame(1, undefined, { store });
  }

  it("takes no gold for a plot it could not give", () => {
    const game = breaking("addPlot");
    firstJob(game);
    gold(game, 100);
    const before = game.store.getGold("ann");
    expect(() => game.town.buyPlot("ann")).toThrow("addPlot broke");
    expect(game.store.getGold("ann")).toBe(before);
    expect(game.store.getLedgerRefs("ann", "plot")).toEqual([]);
  });

  it("takes no gold for a meal it could not serve", () => {
    const game = breaking("addMeal");
    game.store.addPlot("ann", 0);
    game.store.setBuilding("ann", 0, "tavern", 1);
    gold(game, 100);
    game.dusk("ann");
    const before = game.store.getGold("ann");
    const time = game.progress.getProgress("ann").day!.time;
    expect(() => game.town.meal("ann")).toThrow("addMeal broke");
    expect(game.store.getGold("ann")).toBe(before);
    expect(game.progress.getProgress("ann").day!.time).toBe(time);
  });
});

describe("the shop at dusk", () => {
  it("can be looked at, and sells nothing until morning", () => {
    const game = newGame();
    game.stall("ann");
    gold(game, 500);
    game.dusk("ann");
    expect(game.shop.view("ann").slots.length).toBeGreaterThan(0);
    expect(() => game.shop.buy("ann", 0)).toThrowError(expect.objectContaining({ code: "shop-closed" }));
    game.day.end("ann");
    expect(game.shop.buy("ann", 0).entry).toBeTruthy();
  });
});

describe("neighbours", () => {
  // A Market Stall on plot 0, and whatever else on the plots given.
  function street(others: [number, string][]): Game {
    const game = newGame();
    game.stall("ann", 1);
    for (const [plot, id] of others) {
      game.store.addPlot("ann", plot);
      game.store.setBuilding("ann", plot, id, 1);
    }
    // Everyone hired, so each building earns.
    for (const plot of [0, ...others.map(([plot]) => plot)]) game.store.setHire("ann", plot, 1);
    return game;
  }
  const stallTakings = (game: Game) => game.town.view("ann").plots[0]!.building!.takings;
  const merchant = data.cast.people.find((person) => person.job === "merchant")!;

  it("a liked trade next door lifts a building's takings, and one further off does nothing", () => {
    expect(merchant.likes).toContain("blacksmith");
    const alone = stallTakings(street([]));
    const beside = street([[1, "smithy"]]);
    expect(stallTakings(beside)).toBe(takingsFor(1, "meh", rules, data.balance.shifts, rules.neighbour.liked));
    expect(stallTakings(beside)).toBeGreaterThanOrEqual(alone);
    expect(stallTakings(street([[2, "smithy"]]))).toBe(alone);
  });

  it("a disliked trade next door lowers them, and what the night pays is what the street shows", () => {
    expect(merchant.dislikes).toContain("innkeeper");
    const game = street([[1, "tavern"]]);
    expect(stallTakings(game)).toBe(takingsFor(1, "meh", rules, data.balance.shifts, -rules.neighbour.disliked));
    const shown = stallTakings(game);
    game.dusk("ann");
    expect(game.day.end("ann").night!.takings.find((row) => row.plot === 0)!.gold).toBe(shown);
  });
});

describe("hiring", () => {
  // A Smithy standing on plot 0 with its person come to work, and gold to spend.
  function withSmithy(): Game {
    const game = readyToBuild();
    game.town.build("ann", 0, "smithy");
    overnight(game);
    game.town.view("ann");
    return game;
  }

  it("costs gold once by the tier, after which the building pays its takings", () => {
    const game = withSmithy();
    expect(game.town.view("ann").plots[0]!.building).toMatchObject({ takings: 0, staff: { hired: false, hireCost: rules.hireByTier[0] } });
    const before = game.store.getGold("ann");
    const { cost, rewards } = game.town.hire("ann", 0);
    expect(cost).toBe(rules.hireByTier[0]);
    expect(game.store.getGold("ann")).toBe(before - cost + rewards.gold);
    expect(game.store.getLedgerRefs("ann", "hire")).toEqual(["0:1"]);
    expect(game.town.view("ann").plots[0]!.building).toMatchObject({ takings: pays(1), staff: { hired: true } });
    expect(() => game.town.hire("ann", 0)).toThrow(/already runs/);
    // The people view says so too.
    expect(game.town.people("ann").people[0]).toMatchObject({ hired: true, worksAt: { plot: 0, building: "smithy" } });
  });

  it("is refused where nothing stands, before anyone has come, and without the gold", () => {
    const game = readyToBuild();
    expect(() => game.town.hire("ann", 0)).toThrow(/Nothing stands/);
    game.store.addPlot("ann", 1);
    game.store.setBuilding("ann", 1, "farm", 1);
    // A Farm's person has not come yet when the view has not been looked at; hiring brings them in.
    game.store.addLedger("ann", -game.store.getGold("ann"), "shop", "test-drain");
    expect(() => game.town.hire("ann", 1)).toThrowError(expect.objectContaining({ code: "not-enough-gold" }));
    expect(game.store.getLedgerRefs("ann", "hire")).toEqual([]);
  });

  it("is topped up by the difference when a hired building is raised a tier", () => {
    const game = withSmithy();
    game.town.hire("ann", 0);
    level(game, 3);
    const asked = rules.tiers[1]!.made!;
    for (const [index, tag] of ["metal", "forging"].entries()) made(game, `deep-${index}`, tag, asked.depth + 2);
    gold(game, 1000);
    // The tier's price as the street shows it (a Smithy standing takes a share off raising).
    const price = game.town.view("ann").plots[0]!.building!.next!.gold;
    const before = game.store.getGold("ann");
    const { rewards } = game.town.upgrade("ann", 0);
    const topUp = rules.hireByTier[1]! - rules.hireByTier[0]!;
    expect(game.store.getGold("ann")).toBe(before - price - topUp + rewards.gold);
    expect(game.store.getLedgerRefs("ann", "hire")).toEqual(["0:1", "0:2"]);
    overnight(game);
    expect(game.town.view("ann").plots[0]!.building).toMatchObject({ tier: 2, takings: pays(2) });
  });

  it("takes on a saved game's townsfolk who already stand in their building, once", () => {
    const dir = mkdtempSync(join(tmpdir(), "pre-hire-"));
    const path = join(dir, "game.db");
    try {
      // A save from before hiring: buildings standing, one with its person there, and no hires table.
      const old = openStore(path);
      old.addPlot("ann", 0);
      old.setBuilding("ann", 0, "farm", 1);
      old.addPlot("ann", 1);
      old.setBuilding("ann", 1, "smithy", 1);
      old.addPerson("ann", { name: "Old Farmer", role: "Farmer", traits: [], facts: [], job: "farmer" }, 1);
      const raw = new DatabaseSync(path);
      raw.exec("DROP TABLE town_hires; DROP TABLE hires_seeded;");
      raw.close();
      const store = openStore(path);
      expect(hireStanding(data, store)).toEqual(["ann: Farm"]);
      expect([...store.listHires("ann")]).toEqual([[0, 1]]);
      // Once only: the Smithy's person, come later, is hired the usual way.
      store.addPerson("ann", { name: "Old Smith", role: "Blacksmith", traits: [], facts: [], job: "blacksmith" }, 1);
      expect(hireStanding(data, store)).toEqual([]);
      expect(hireStanding(data, openStore(path))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the model turned off", () => {
  it("lets a known pair be made, and a new pair says how to fix it, through the route", async () => {
    const { createCombiner } = await import("../src/server/combiner");
    const { createModelClient, readModelConfig } = await import("../src/server/llm/config");
    const { createComboGenerator } = await import("../src/server/comboGenerator");
    const game = newGame();
    const off = { ...readModelConfig(process.cwd(), {}), enabled: false };
    const generate = createComboGenerator({ client: createModelClient(off, "combos"), log: () => {}, voice: "", tags: data.tags.values(), balance: data.balance, storybook: data.storybook, reservedIds: new Set(data.entries.keys()) });
    const combiner = createCombiner({ data, store: game.store, generate });
    const app = createApp(combiner, { progress: game.progress, shop: game.shop, day: game.day, town: game.town });
    const combine = (a: string, b: string) => app.request("/api/players/ann/combine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a, b }) });
    // A hand-written recipe needs no model.
    const known = [...data.combos.values()].find((combo) => combo.inputs.every((id) => data.balance.startingEntries.includes(id)) && combo.needs.length === 0)!;
    expect((await combine(known.inputs[0], known.inputs[1])).status).toBe(200);
    // A pair with no recipe, no approved bake and no result saved would need the model.
    const starting = data.balance.startingEntries;
    const [a, b] = starting.flatMap((x) => starting.map((y) => [x, y] as const)).find(([x, y]) => !data.combos.has(comboKey(x, y)) && !data.noResults.has(comboKey(x, y)))!;
    const fresh = await combine(a, b);
    expect(fresh.status).toBe(503);
    expect(await fresh.json()).toMatchObject({ code: "model-off", error: expect.stringMatching(/^Hey, fix the model:/) });
  });
});
