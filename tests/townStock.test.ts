import { describe, expect, it } from "vitest";
import { createApp } from "../src/server/app";
import { comboKey, type GameEntry, type TownView } from "../src/shared/schema";
import { data, newGame } from "./helpers";

const rules = data.balance.town;
const { costs, candles } = data.balance.day;
type Game = ReturnType<typeof newGame>;

// Something the player has discovered, carrying these tags, as fine as `tier`.
function thing(game: Game, id: string, tags: string[], tier = 1, player = "ann") {
  const entry: GameEntry = { id, name: id, kind: "material", description: "x", tags, affinity: [], tier, source: "generated", depth: 3, xp: 10 };
  game.store.saveGenerated(comboKey(id, "fire"), id, "fire", entry);
  game.store.addDiscovery(player, id);
}

// A player with these buildings standing at tier 1, on plots in the order given, at dusk.
function street(...ids: string[]): Game {
  const game = newGame();
  ids.forEach((id, plot) => {
    game.store.addPlot("ann", plot);
    game.store.setBuilding("ann", plot, id, 1);
  });
  game.dusk("ann");
  return game;
}

const qualityAt = (game: Game, plot: number) => game.town.view("ann").plots[plot]!.building!.quality;

describe("stocking a building", () => {
  it("puts a discovery on a shelf, which the street shows, at any hour and for nothing", () => {
    const game = street("smithy");
    game.setDay("ann", { sun: 0 });
    thing(game, "ingot", ["metal"]);
    game.town.stock("ann", 0, 1, "ingot");
    expect(game.town.view("ann").plots[0]!.building!.stock).toEqual([{ slot: 0, entry: null }, { slot: 1, entry: { id: "ingot", name: "ingot" } }]);
    expect(game.progress.getProgress("ann").day).toMatchObject({ phase: "morning", candles });
    game.town.stock("ann", 0, 1, null);
    expect(game.town.view("ann").plots[0]!.building!.stock.every((slot) => slot.entry === null)).toBe(true);
  });

  it("keeps a discovery in one building at a time: stocking it again moves it", () => {
    const game = street("smithy", "farm");
    thing(game, "ingot", ["metal", "plant"]);
    game.town.stock("ann", 0, 0, "ingot");
    game.town.stock("ann", 1, 0, "ingot");
    const stock = game.store.listStock("ann");
    expect(stock).toEqual([{ plot: 1, slot: 0, entryId: "ingot" }]);
    // Putting it back on the same shelf, or on another shelf of the same building, is a move too.
    game.town.stock("ann", 1, 1, "ingot");
    expect(game.store.listStock("ann")).toEqual([{ plot: 1, slot: 1, entryId: "ingot" }]);
    // And something put over it takes the shelf.
    thing(game, "other", ["plant"]);
    game.town.stock("ann", 1, 1, "other");
    expect(game.store.listStock("ann")).toEqual([{ plot: 1, slot: 1, entryId: "other" }]);
  });

  it("is refused for an empty plot, a shelf the tier lacks, and what is not stockable or not found", () => {
    const game = street("smithy");
    thing(game, "ingot", ["metal"]);
    expect(() => game.town.stock("ann", 4, 0, "ingot")).toThrow(/Nothing stands on that plot/);
    expect(() => game.town.stock("ann", 0, rules.tiers[0]!.slots, "ingot")).toThrow(/has 2 shelves/);
    expect(() => game.town.stock("ann", 0, 0, "dragon")).toThrow(/only stock something you have discovered/);
    expect(() => game.town.stock("ann", 0, 0, "fire")).toThrow(/not a thing that can sit on a shelf/);
    expect(game.store.listStock("ann")).toEqual([]);
  });
});

describe("a building's quality", () => {
  it("follows how much of what it wants its stock covers, and an empty building is Meh", () => {
    const game = street("smithy");
    expect(qualityAt(game, 0)).toBe("meh");
    thing(game, "a", ["metal", "forging"]);
    thing(game, "b", ["mineral", "industrial"]);
    thing(game, "c", ["metal"]);
    game.town.stock("ann", 0, 0, "c");
    expect(qualityAt(game, 0)).toBe("meh");
    game.town.stock("ann", 0, 0, "a");
    expect(qualityAt(game, 0)).toBe("good");
    game.town.stock("ann", 0, 1, "b");
    expect(qualityAt(game, 0)).toBe("perfect");
  });

  it("asks that the best thing on the shelf is as fine as the building's tier for the bonus", () => {
    const game = street("smithy");
    thing(game, "crude", ["metal", "forging", "mineral"], 0);
    game.town.stock("ann", 0, 0, "crude");
    expect(qualityAt(game, 0)).toBe("good");
    thing(game, "fine", ["metal", "forging", "mineral"], 1);
    game.town.stock("ann", 0, 0, "fine");
    expect(qualityAt(game, 0)).toBe("great");
  });

  it("is lifted a step by the Farm for the Tavern, but never above Perfect and never on bare shelves", () => {
    const game = street("tavern", "farm");
    expect(qualityAt(game, 0)).toBe("meh");
    thing(game, "brew", ["brewing", "liquid"]);
    game.town.stock("ann", 0, 0, "brew");
    // Half its wants and the tier bonus is Good, and the Farm lifts it to Great.
    expect(qualityAt(game, 0)).toBe("great");
    thing(game, "stew", ["plant", "animal"]);
    game.town.stock("ann", 0, 1, "stew");
    expect(qualityAt(game, 0)).toBe("perfect");
  });

  it("is lifted by a hand lent this evening, once a building, for a candle", () => {
    const game = street("smithy");
    thing(game, "a", ["metal", "forging"]);
    game.town.stock("ann", 0, 0, "a");
    expect(qualityAt(game, 0)).toBe("good");
    const turn = game.town.hand("ann", 0);
    expect(turn).toEqual({ night: null, dusk: null });
    expect(qualityAt(game, 0)).toBe("great");
    expect(game.progress.getProgress("ann").day!.candles).toBe(candles - costs.hand);
    expect(() => game.town.hand("ann", 0)).toThrow(/already lent a hand/);
    // It lasts the evening only.
    game.day.end("ann");
    expect(qualityAt(game, 0)).toBe("good");
  });

  it("is not worth a candle on bare shelves, in the morning, or past the candles", () => {
    const game = street("smithy");
    expect(() => game.town.hand("ann", 0)).toThrow(/nothing on its shelves/);
    expect(() => game.town.hand("ann", 3)).toThrow(/Nothing stands/);
    thing(game, "a", ["metal"]);
    game.town.stock("ann", 0, 0, "a");
    game.setDay("ann", { spent: candles });
    expect(() => game.town.hand("ann", 0)).toThrowError(expect.objectContaining({ code: "no-candles" }));
    game.setDay("ann", { spent: 0, sun: 0 });
    expect(() => game.town.hand("ann", 0)).toThrowError(expect.objectContaining({ code: "not-evening" }));
    expect(game.store.hasHand("ann", 0, 1)).toBe(false);
  });

  it("is lifted by a Great or Perfect shift at the player's own building, that day only", () => {
    const game = street("smithy", "farm");
    for (const id of ["person", "forge", "blacksmith"]) game.store.addDiscovery("ann", id);
    game.progress.chooseJob("ann", "blacksmith");
    thing(game, "a", ["metal", "forging"]);
    thing(game, "f", ["plant", "animal"]);
    game.town.stock("ann", 0, 0, "a");
    game.town.stock("ann", 1, 0, "f");
    expect(qualityAt(game, 0)).toBe("good");
    expect(qualityAt(game, 1)).toBe("great");
    game.store.setShiftLiftDay("ann", 1);
    expect(qualityAt(game, 0)).toBe("great");
    // The Farm belongs to the Farmer, so a good shift at the forge does nothing for it.
    expect(qualityAt(game, 1)).toBe("great");
    game.day.end("ann");
    expect(qualityAt(game, 0)).toBe("good");
  });

  it("counts the rank of the owner at their own building and nowhere else", () => {
    const game = street("smithy", "farm");
    for (const id of ["person", "forge", "blacksmith"]) game.store.addDiscovery("ann", id);
    game.progress.chooseJob("ann", "blacksmith");
    // Crude things earn no tier bonus, so every want covered is a score of exactly 1: Great.
    thing(game, "a", ["metal", "forging"], 0);
    thing(game, "b", ["mineral", "industrial"], 0);
    thing(game, "f", ["plant", "animal", "liquid"], 0);
    game.town.stock("ann", 0, 0, "a");
    game.town.stock("ann", 0, 1, "b");
    game.town.stock("ann", 1, 0, "f");
    expect([qualityAt(game, 0), qualityAt(game, 1)]).toEqual(["great", "great"]);
    const master = data.balance.shifts.ranks[2]!;
    for (let done = 0; done < master.shifts; done++) game.store.addShift("ann", { job: "blacksmith", orderTags: [], inputs: [], quality: "good", line: "x", gold: 0, xp: 0, rep: 0 });
    // A Master's bonus tips their own Smithy to Perfect, and does nothing for the Farm.
    expect([qualityAt(game, 0), qualityAt(game, 1)]).toEqual(["perfect", "great"]);
  });
});

describe("Cheer and takings", () => {
  it("is a point a quality step, in bands that raise what every building pays", () => {
    const game = street("smithy", "farm");
    expect(game.town.view("ann").cheer).toEqual({ points: 0, band: "Quiet" });
    thing(game, "a", ["metal", "forging"]);
    thing(game, "b", ["mineral", "industrial"]);
    thing(game, "f", ["plant", "animal"]);
    game.town.stock("ann", 0, 0, "a");
    game.town.stock("ann", 0, 1, "b");
    game.town.stock("ann", 1, 0, "f");
    // Perfect (3) at the Smithy and Great (2) at the Farm.
    const view = game.town.view("ann");
    expect(view.cheer).toEqual({ points: 5, band: "Pleasant" });
    const pleasant = rules.cheer.find((band) => band.name === "Pleasant")!;
    const share = (tier: number, quality: "great" | "perfect") =>
      Math.round(rules.tiers[tier - 1]!.takings * data.balance.shifts.qualities.find((item) => item.id === quality)!.gold * (1 + pleasant.takings));
    expect(view.plots[0]!.building!.takings).toBe(share(1, "perfect"));
    expect(view.plots[1]!.building!.takings).toBe(share(1, "great"));
    const night = game.day.end("ann").night!;
    expect(night.cheer).toEqual({ points: 5, band: "Pleasant" });
    expect(night.takings.map((row) => [row.building, row.quality, row.gold])).toEqual([
      ["smithy", "perfect", share(1, "perfect")],
      ["farm", "great", share(1, "great")],
    ]);
  });

  it("is nothing on an empty street, and the ledger says so", () => {
    const game = newGame();
    game.dusk("ann");
    expect(game.day.end("ann").night!.cheer).toBeNull();
  });
});

describe("what the buildings' perks bring", () => {
  it("adds an evening candle for a Wizard's Tower at its top tier", () => {
    const game = street("wizards-tower");
    expect(game.progress.getProgress("ann").day).toMatchObject({ candles, candlesMax: candles });
    game.store.setBuilding("ann", 0, "wizards-tower", 3);
    expect(game.progress.getProgress("ann").day).toMatchObject({ candles: candles + 1, candlesMax: candles + 1 });
    // Night does not fall on the last of the usual candles.
    game.setDay("ann", { spent: candles - 1 });
    expect(game.day.spend("ann", 1).night).toBeNull();
    expect(game.day.spend("ann", 1).night).toMatchObject({ fell: "last-candle" });
  });

  it("gives a rumour from a Tavern every few days, as a hint, and says so in the ledger", () => {
    const game = street("tavern");
    game.store.setBuilding("ann", 0, "tavern", 2);
    const every = data.buildings.get("tavern")!.tiers[1]!.perks.flatMap((perk) => (perk.type === "rumour" ? [perk.every] : []))[0]!;
    for (let day = 1; day < every; day++) {
      expect(game.day.end("ann").night!.brought, `day ${day}`).toEqual([]);
      game.dusk("ann");
    }
    const night = game.day.end("ann").night!;
    expect(night.day).toBe(every);
    expect(night.brought).toEqual([{ kind: "rumour", line: expect.stringMatching(/^A rumour at the Tavern: .+ is made from .+\.$/) }]);
    expect(game.store.listHints("ann")).toMatchObject([{ fromName: "Tavern" }]);
  });

  it("grows a gift in an Alchemist's Herb Garden every few days, which is the player's but pays nothing", () => {
    const game = street("herb-garden");
    game.store.setBuilding("ann", 0, "herb-garden", 2);
    const every = data.buildings.get("herb-garden")!.tiers[1]!.perks.flatMap((perk) => (perk.type === "gift" ? [perk.every] : []))[0]!;
    const before = game.store.getDiscoveries("ann").length;
    for (let day = 1; day < every; day++) {
      game.day.end("ann");
      game.dusk("ann");
    }
    const night = game.day.end("ann").night!;
    expect(night.brought).toEqual([{ kind: "gift", line: expect.stringMatching(/^The Herb Garden has grown you a gift: .+\.$/) }]);
    expect(game.store.getDiscoveries("ann")).toHaveLength(before + 1);
    const [given] = game.store.getLedgerRefs("ann", "gift");
    expect(data.entries.get(given!)!.tags.some((tag) => ["plant", "reagent", "healing"].includes(tag))).toBe(true);
    expect(game.store.getLedgerRefs("ann", "discovery")).not.toContain(given);
  });
});

describe("the town routes for stock and a hand", () => {
  const post = (body: unknown = {}) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("stock a shelf and lend a hand, and refuse with a sentence and a code", async () => {
    const game = street("smithy");
    const app = createApp(game.combiner, { progress: game.progress, shop: game.shop, day: game.day, town: game.town });
    const send = async (path: string, body?: unknown) => {
      const response = await app.request(`/api/players/ann${path}`, post(body));
      return { status: response.status, body: (await response.json()) as Record<string, any> };
    };
    thing(game, "a", ["metal", "forging"]);
    const hand = await send("/town/hand", { plot: 0 });
    expect(hand.status).toBe(400);
    expect(hand.body).toMatchObject({ error: expect.stringMatching(/nothing on its shelves/), code: "rule" });

    const stocked = await send("/town/stock", { plot: 0, slot: 0, entry: "a" });
    expect(stocked.status).toBe(200);
    expect(stocked.body).toMatchObject({ night: null, dusk: null, progress: { day: { candles } } });
    const street_ = (await (await app.request("/api/players/ann/town")).json()) as TownView;
    expect(street_.plots[0]!.building).toMatchObject({ quality: "good", stock: [{ slot: 0, entry: { id: "a" } }, { slot: 1, entry: null }] });

    const lent = await send("/town/hand", { plot: 0 });
    expect(lent.body).toMatchObject({ night: null, progress: { day: { candles: candles - costs.hand } } });
    expect(((await (await app.request("/api/players/ann/town")).json()) as TownView).plots[0]!.building!.quality).toBe("great");

    expect((await send("/town/stock", { plot: 0, slot: 0, entry: null })).status).toBe(200);
    expect((await send("/town/stock", { plot: 0, slot: "first", entry: "a" })).status).toBe(400);
    expect((await send("/town/stock", { plot: 0, slot: 0 })).status).toBe(400);
  });
});
