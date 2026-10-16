import { describe, expect, it } from "vitest";
import { createApp } from "../src/server/app";
import { discoveryGold, xpToReach } from "../src/server/progress";
import { comboKey, type GameEntry, type TownView } from "../src/shared/schema";
import { extraDiscoveryGold, takingsFor } from "../src/shared/town";
import { data, newGame } from "./helpers";

const rules = data.balance.town;
const { costs, candles } = data.balance.day;
type Game = ReturnType<typeof newGame>;

const building = (id: string) => data.buildings.get(id)!;
// What an unstocked building of a tier pays for a night.
const pays = (tier: number) => takingsFor(tier, "meh", rules, data.balance.shifts);
const give = (game: Game, ids: string[], player = "ann") => ids.forEach((id) => game.store.addDiscovery(player, id));
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

// A player with a blacksmith in town, the things a Smithy needs, gold, a plot, and an evening.
function readyToBuild(): Game {
  const game = newGame();
  give(game, ["person", "blacksmith", ...needsOf("smithy")]);
  gold(game, 500);
  game.town.buyPlot("ann");
  game.dusk("ann");
  return game;
}

describe("townsfolk", () => {
  it("arrive when their job is discovered, taken up or not, and bring their plan", () => {
    const game = newGame();
    expect(game.town.view("ann")).toMatchObject({ townsfolk: [], plans: [] });
    give(game, ["blacksmith"]);
    const town = game.town.view("ann");
    const first = data.townsfolk.people[0]!;
    expect(town.townsfolk).toEqual([{ person: expect.any(Number), job: "blacksmith", name: first.name, housed: false, fondness: 0, regular: false }]);
    expect(town.plans).toHaveLength(1);
    expect(town.plans[0]).toMatchObject({ building: "smithy", name: "Smithy", price: building("smithy").price, candles: costs.build, ready: false });
    expect(town.plans[0]!.needs).toEqual([{ label: "Forge", met: false }, { label: "Iron", met: false }]);
    expect(game.progress.getProgress("ann").job).toBeNull();
    // They arrive once, however often the street is looked at.
    game.town.view("ann");
    expect(game.store.listPeople("ann")).toHaveLength(1);
    expect(game.store.listPeople("ann")[0]).toMatchObject({ job: "blacksmith", role: "Blacksmith", firstDay: 1, pronoun: first.pronoun });
  });

  it("arrive on the day the job was made, through the combine route", async () => {
    const game = newGame();
    const app = createApp(game.combiner, { progress: game.progress, shop: game.shop, day: game.day, town: game.town });
    const recipe = [...data.combos.values()].find((combo) => combo.result === "blacksmith")!;
    give(game, [...recipe.inputs, ...recipe.needs]);
    game.setDay("ann", { number: 4 });
    const body = JSON.stringify({ a: recipe.inputs[0], b: recipe.inputs[1] });
    expect((await app.request("/api/players/ann/combine", { method: "POST", headers: { "Content-Type": "application/json" }, body })).status).toBe(200);
    expect(game.store.listPeople("ann")).toMatchObject([{ job: "blacksmith", firstDay: 4 }]);
  });

  it("come with every job, though only six have a building to bring", () => {
    const game = newGame();
    const jobs = [...data.jobs.keys()];
    give(game, jobs);
    const town = game.town.view("ann");
    expect(town.townsfolk.map((person) => person.job).sort()).toEqual([...jobs].sort());
    expect(town.plans.map((plan) => plan.building).sort()).toEqual([...data.buildings.keys()].sort());
  });

  it("are kept out of the cast of visitors, and their names are not given to anyone else", async () => {
    const briefs: { takenNames: string[]; person: { returning: boolean } }[] = [];
    const { createCannedEventWriter } = await import("../src/server/events/writer");
    const canned = createCannedEventWriter();
    const game = newGame(1, { ...canned, write: (brief) => (briefs.push(brief), canned.write(brief)) });
    give(game, [...data.jobs.keys()]);
    game.town.arrive("ann");
    await expect(game.events.test("ann", "repeat")).rejects.toThrow(/has not met anyone/);
    await game.events.test("ann", "small_thief");
    expect(briefs[0]!.person.returning).toBe(false);
    expect(briefs[0]!.takenNames).toContain(data.townsfolk.people[0]!.name);
    // A street full of townsfolk does not push the people the player has met out of the story.
    const heart = (await game.events.respond("ann", "fair")).next!;
    await game.events.respond("ann", heart.responses[0]!.type);
    expect(game.store.listPeople("ann").filter((person) => person.job === null).map((person) => person.status)).toEqual(["active"]);
  });
});

describe("plots", () => {
  it("are bought in order, the first for nothing, at any time of day", () => {
    const game = newGame();
    expect(game.town.view("ann").plots.map((plot) => plot.owned)).toEqual(rules.plotPrices.map(() => false));
    expect(game.town.buyPlot("ann")).toMatchObject({ plot: 0 });
    expect(game.progress.getProgress("ann")).toMatchObject({ gold: 0, day: { phase: "morning" } });
    gold(game, rules.plotPrices[1]!);
    expect(game.town.buyPlot("ann").plot).toBe(1);
    expect(game.progress.getProgress("ann").gold).toBe(0);
    const town = game.town.view("ann");
    expect(town.plots.map((plot) => plot.owned)).toEqual(rules.plotPrices.map((_, index) => index < 2));
    expect(town.plots.map((plot) => plot.price)).toEqual(rules.plotPrices);
    expect(town.plots.slice(0, 4).map((plot) => plot.opensAt)).toEqual([1, 1, 2, 3]);
  });

  it("are refused past the player's deeds, and without the gold", () => {
    const game = newGame();
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
  it("takes gold and two candles of an evening, and then it stands", () => {
    const game = readyToBuild();
    expect(game.town.view("ann").plans[0]).toMatchObject({ building: "smithy", ready: true });
    const before = game.progress.getProgress("ann").gold;
    const raised = game.town.build("ann", 0, "smithy");
    expect(raised).toMatchObject({ night: null, dusk: null });
    expect(game.progress.getProgress("ann")).toMatchObject({ gold: before - building("smithy").price + raised.rewards.gold, day: { candles: candles - costs.build } });
    const town = game.town.view("ann");
    expect(town.plans).toEqual([]);
    expect(town.townsfolk[0]).toMatchObject({ job: "blacksmith", housed: true });
    expect(town.plots[0]!.building).toMatchObject({
      id: "smithy",
      name: "Smithy",
      tier: 1,
      quality: "meh",
      takings: pays(1),
      wants: building("smithy").wants,
      stock: [{ slot: 0, entry: null }, { slot: 1, entry: null }],
      enchantment: null,
      next: { gold: rules.tiers[1]!.gold, level: rules.tiers[1]!.level, ready: false },
    });
  });

  it("is refused for the longest wait first: the level, then the needs, then the gold, then the hour", () => {
    const game = newGame();
    give(game, ["person", "blacksmith"]);
    game.town.buyPlot("ann");
    const raise = () => game.town.build("ann", 0, "smithy");
    expect(raise).toThrowError(expect.objectContaining({ code: "needs-missing", message: expect.stringMatching(/Forge; Iron/) }));
    give(game, ["forge"]);
    expect(raise).toThrowError(expect.objectContaining({ code: "needs-missing", message: expect.stringMatching(/needs: Iron\./) }));
    give(game, ["iron"]);
    game.store.addLedger("ann", -game.store.getGold("ann"), "shop", "test-drain");
    expect(raise).toThrowError(expect.objectContaining({ code: "not-enough-gold" }));
    gold(game, 500);
    expect(raise).toThrowError(expect.objectContaining({ code: "not-evening" }));
    game.dusk("ann");
    game.setDay("ann", { spent: candles - costs.build + 1 });
    expect(raise).toThrowError(expect.objectContaining({ code: "no-candles" }));
    // Nothing was taken for any of that.
    expect(game.store.getLedgerRefs("ann", "building")).toEqual([]);
    expect(game.store.listPlots("ann")).toEqual([{ plot: 0, building: null, tier: 0 }]);
    game.setDay("ann", { spent: 0 });
    expect(raise().night).toBeNull();
  });

  it("needs a plot the player owns with nothing on it, a plan in hand, and is one of a kind", () => {
    const game = readyToBuild();
    expect(() => game.town.build("ann", 3, "smithy")).toThrow(/do not own that plot/);
    expect(() => game.town.build("ann", 0, "castle")).toThrow(/no such building/);
    expect(() => game.town.build("ann", 0, "farm")).toThrow(/Nobody in town knows how to run a Farm/);
    game.town.build("ann", 0, "smithy");
    give(game, ["farmer", ...needsOf("farm")]);
    game.dusk("ann");
    expect(() => game.town.build("ann", 0, "farm")).toThrow(/already stands on that plot/);
    game.town.buyPlot("ann");
    expect(() => game.town.build("ann", 1, "smithy")).toThrow(/Smithy already stands/);
    expect(game.town.build("ann", 1, "farm").night).toBeNull();
    expect(game.town.view("ann").plots.slice(0, 2).map((plot) => plot.building?.id)).toEqual(["smithy", "farm"]);
  });

  it("brings night when it takes the last candles", () => {
    const game = readyToBuild();
    game.setDay("ann", { spent: candles - costs.build });
    const raised = game.town.build("ann", 0, "smithy");
    expect(raised.night).toMatchObject({ day: 1, fell: "last-candle" });
    // It was standing when night fell, so it paid its first takings.
    expect(raised.night!.takings).toEqual([{ plot: 0, building: "smithy", name: "Smithy", quality: "meh", gold: expect.any(Number) }]);
  });

  it("cannot be done on the short evening of a player who turned in early", () => {
    const game = readyToBuild();
    game.setDay("ann", { early: true });
    expect(() => game.town.build("ann", 0, "smithy")).toThrowError(expect.objectContaining({ code: "no-candles" }));
  });
});

describe("raising a tier", () => {
  function withSmithy(): Game {
    const game = readyToBuild();
    game.town.build("ann", 0, "smithy");
    game.dusk("ann");
    return game;
  }

  it("asks for the level, things the player made that the building wants, gold, and one candle", () => {
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
    expect(game.progress.getProgress("ann")).toMatchObject({ gold: before.gold - rules.tiers[1]!.gold! + raised.rewards.gold, day: { candles: before.day!.candles - costs.upgrade } });
    expect(game.town.view("ann").plots[0]!.building).toMatchObject({ tier: 2, takings: pays(2), stock: [{ slot: 0 }, { slot: 1 }, { slot: 2 }] });
  });

  it("is refused where nothing stands, before dusk, and at the top", () => {
    const game = withSmithy();
    expect(() => game.town.upgrade("ann", 1)).toThrow(/Nothing stands on that plot/);
    level(game, 5);
    gold(game, 5000);
    for (const [index, tag] of ["metal", "forging", "mineral"].entries()) made(game, `deep-${index}`, tag, 9);
    game.day.end("ann");
    expect(() => game.town.upgrade("ann", 0)).toThrowError(expect.objectContaining({ code: "not-evening" }));
    game.dusk("ann");
    game.town.upgrade("ann", 0);
    game.town.upgrade("ann", 0);
    expect(game.town.view("ann").plots[0]!.building).toMatchObject({ tier: 3, next: null });
    game.dusk("ann");
    expect(() => game.town.upgrade("ann", 0)).toThrow(/as fine as it can be/);
  });

  it("hands the Herb Garden to the Alchemist, who must have arrived first", () => {
    const game = newGame();
    give(game, ["herbalist", ...needsOf("herb-garden")]);
    gold(game, 5000);
    level(game, 3);
    game.town.buyPlot("ann");
    game.dusk("ann");
    game.town.build("ann", 0, "herb-garden");
    for (const [index, tag] of ["plant", "healing"].entries()) made(game, `deep-herb-${index}`, tag, 6);
    game.dusk("ann");
    expect(() => game.town.upgrade("ann", 0)).toThrowError(expect.objectContaining({ code: "needs-missing", message: expect.stringMatching(/An Alchemist in town/) }));
    give(game, ["alchemist"]);
    game.town.upgrade("ann", 0);
    const housed = Object.fromEntries(game.town.view("ann").townsfolk.map((person) => [person.job, person.housed]));
    expect(housed).toEqual({ herbalist: false, alchemist: true });
  });
});

describe("takings", () => {
  it("are paid by each building at night, through the ledger, once", () => {
    const game = readyToBuild();
    game.town.build("ann", 0, "smithy");
    const before = game.progress.getProgress("ann").gold;
    const night = game.day.end("ann").night!;
    expect(pays(1)).toBeGreaterThan(0);
    expect(night.takings).toEqual([{ plot: 0, building: "smithy", name: "Smithy", quality: "meh", gold: pays(1) }]);
    expect(game.progress.getProgress("ann").gold).toBe(before + pays(1));
    expect(game.store.getLedgerRefs("ann", "takings")).toEqual(["1:0"]);
    // And again the next night, for that night.
    game.dusk("ann");
    game.day.end("ann");
    expect(game.store.getLedgerRefs("ann", "takings")).toEqual(["1:0", "2:0"]);
    expect(game.progress.getProgress("ann").gold).toBe(before + 2 * pays(1));
  });

  it("are nothing on an empty street", () => {
    const game = newGame();
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
    expect(() => smith.shop.view("ann")).toThrowError(expect.objectContaining({ code: "no-shop" }));
  });

  it("opens with the three random shelves, and gains the tailored three at the next tier", () => {
    const game = newGame();
    give(game, ["merchant", ...needsOf("market-stall")]);
    gold(game, 5000);
    game.town.buyPlot("ann");
    game.dusk("ann");
    game.town.build("ann", 0, "market-stall");
    const first = game.shop.view("ann").slots;
    expect(first.map((slot) => slot.type)).toEqual(["random", "random", "random"]);

    level(game, 3);
    for (const [index, tag] of ["reagent", "industrial"].entries()) made(game, `deep-ware-${index}`, tag, 6);
    game.dusk("ann");
    expect(game.shop.view("ann").slots).toHaveLength(3);
    game.town.upgrade("ann", 0);
    // The shelves that came with the tier are filled the next morning.
    expect(game.shop.view("ann").slots).toHaveLength(3);
    game.day.end("ann");
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
    const game = newGame();
    // As an old save had it: something bought, and no street at all.
    game.store.addLedger("ann", -5, "shop", "sulfur");
    game.store.addDiscovery("ann", "sulfur");
    expect(game.shop.view("ann").slots).toHaveLength(6);
    expect(game.store.listPlots("ann")).toEqual([{ plot: 0, building: "market-stall", tier: 2 }]);
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
    expect((await send("/town/build", { plot: 0, building: "market-stall" })).body).toMatchObject({ code: "not-evening", error: expect.any(String) });
    game.dusk("ann");
    const raised = await send("/town/build", { plot: 0, building: "market-stall" });
    expect(raised.status).toBe(200);
    expect(raised.body).toMatchObject({ rewards: { quests: expect.any(Array) }, night: null, dusk: null, progress: { day: { candles: candles - costs.build } } });
    expect((await get("/shop")).status).toBe(200);
    expect(((await (await get("/town")).json()) as TownView).plots[0]!.building).toMatchObject({ id: "market-stall", tier: 1 });

    const early = await send("/town/upgrade", { plot: 0 });
    expect(early.status).toBe(400);
    expect(early.body).toMatchObject({ code: "level-too-low" });
    level(game, 3);
    for (const [index, tag] of ["reagent", "knowledge"].entries()) made(game, `deep-ware-${index}`, tag, 6);
    const better = await send("/town/upgrade", { plot: 0 });
    // The last candle of the evening went on it, so night fell and the stall paid.
    expect(better.body).toMatchObject({ night: { fell: "last-candle", takings: [{ building: "market-stall", gold: expect.any(Number) }] }, progress: { day: { number: 2 } } });
    expect(((await (await get("/town")).json()) as TownView).plots[0]!.building!.tier).toBe(2);

    expect((await send("/town/build", { plot: "first", building: "smithy" })).status).toBe(400);
    expect((await send("/town/upgrade", {})).status).toBe(400);
  });
});
