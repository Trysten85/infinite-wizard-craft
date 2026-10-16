import { describe, expect, it } from "vitest";
import { createApp } from "../src/server/app";
import { comboKey, type GameEntry } from "../src/shared/schema";
import { data, newGame } from "./helpers";

const rules = data.balance.town;
const { costs, candles } = data.balance.day;
type Game = ReturnType<typeof newGame>;

function thing(game: Game, id: string, tags: string[], tier = 1, player = "ann") {
  const entry: GameEntry = { id, name: id, kind: "material", description: "x", tags, affinity: [], tier, source: "generated", depth: 3, xp: 10 };
  game.store.saveGenerated(comboKey(id, "fire"), id, "fire", entry);
  game.store.addDiscovery(player, id);
}
// A street of buildings at tier 1 on plots 0.., at dusk, with townsfolk for their jobs.
function street(...ids: string[]): Game {
  const game = newGame();
  ids.forEach((id, plot) => {
    game.store.addPlot("ann", plot);
    game.store.setBuilding("ann", plot, id, 1);
  });
  game.dusk("ann");
  return game;
}
// Fixes tonight's happening for today.
const tonight = (game: Game, happening: string | null) => game.store.setTonight("ann", game.store.getDay("ann").state.number, happening);
const gold = (game: Game, amount: number) => game.store.addLedger("ann", amount, "quest", `grant-${game.store.getGold("ann")}-${amount}`);
const who = (game: Game, job: string) => game.store.listPeople("ann").find((person) => person.job === job)!;

describe("townsfolk names", () => {
  it("are the next ones on the list, with their pronouns, and a trade-named one is renamed once", () => {
    const game = newGame();
    game.store.addPerson("ann", { name: "The Blacksmith", role: "Blacksmith", traits: [], facts: [], job: "blacksmith" }, 1);
    game.store.addDiscovery("ann", "farmer");
    game.town.arrive("ann");
    const names = game.store.listPeople("ann").map((person) => person.name);
    expect(new Set(names).size).toBe(2);
    expect(names).not.toContain("The Blacksmith");
    expect(names.every((name) => data.townsfolk.people.some((person) => person.name === name))).toBe(true);
    game.town.arrive("ann");
    expect(game.store.listPeople("ann").map((person) => person.name)).toEqual(names);
  });
});

describe("calling on someone", () => {
  it("raises fondness a step, gives their line, costs a candle, and is once a person a night", () => {
    const game = street();
    game.store.addDiscovery("ann", "blacksmith");
    game.town.arrive("ann");
    const smith = who(game, "blacksmith");
    const call = game.town.call("ann", smith.id);
    expect(call.fondness).toBe(1);
    const lines = data.townsfolk.callingLines.blacksmith ?? data.townsfolk.callingLines.default!;
    expect(lines.map((line) => line.replaceAll("{name}", smith.name))).toContain(call.line);
    expect(game.progress.getProgress("ann").day!.candles).toBe(candles - costs.call);
    expect(() => game.town.call("ann", smith.id)).toThrow(/already called on/);
    expect(() => game.town.call("ann", 9999)).toThrow(/do not know anyone/);
    expect(game.store.listPeople("ann").find((person) => person.id === smith.id)!.fondness).toBe(1);
  });

  it("is refused before dusk and past the candles", () => {
    const game = street();
    game.store.addDiscovery("ann", "blacksmith");
    const smith = game.town.arrive("ann")[0]!;
    game.setDay("ann", { spent: candles });
    expect(() => game.town.call("ann", smith.id)).toThrowError(expect.objectContaining({ code: "no-candles" }));
    game.setDay("ann", { spent: 0, sun: 0 });
    expect(() => game.town.call("ann", smith.id)).toThrowError(expect.objectContaining({ code: "not-evening" }));
  });

  it("can be on a person met in an event, with the default line", async () => {
    const game = street();
    await game.events.test("ann", "small_thief");
    const met = game.store.listPeople("ann").find((person) => person.job === null)!;
    expect(data.townsfolk.callingLines.default!.map((line) => line.replaceAll("{name}", met.name))).toContain(game.town.call("ann", met.id).line);
  });
});

describe("regulars", () => {
  it("are those whose fondness has reached the line, and stay regulars", () => {
    const game = street("smithy");
    game.store.addDiscovery("ann", "blacksmith");
    const smith = game.town.arrive("ann")[0]!;
    expect(game.town.view("ann").townsfolk[0]!.regular).toBe(false);
    game.store.updatePerson(smith.id, { fondness: rules.regularAt });
    expect(game.town.view("ann").townsfolk[0]!.regular).toBe(true);
    expect(game.town.view("ann").cheer).toEqual({ points: 1, band: "Quiet" });
    game.store.updatePerson(smith.id, { fondness: 0 });
    expect(game.town.view("ann").townsfolk[0]!.regular).toBe(true);
  });

  it("raise the takings of the building they work at, and a visitor met by chance is the Tavern's", () => {
    const game = street("smithy", "tavern");
    // Fine buildings, so that a tenth more is more than rounding hides.
    game.store.setBuilding("ann", 0, "smithy", 3);
    game.store.setBuilding("ann", 1, "tavern", 3);
    game.store.addDiscovery("ann", "blacksmith");
    const smith = game.town.arrive("ann")[0]!;
    const before = game.town.view("ann").plots.filter((plot) => plot.building).map((plot) => plot.building!.takings);
    game.store.updatePerson(smith.id, { fondness: rules.regularAt });
    const met = game.store.addPerson("ann", { name: "Pim Kettlebrook", role: "neighbour", traits: [], facts: [] }, 1);
    game.store.updatePerson(met.id, { fondness: rules.regularAt });
    const after = game.town.view("ann").plots.filter((plot) => plot.building).map((plot) => plot.building!.takings);
    expect(after[0]!).toBeGreaterThan(before[0]!);
    expect(after[1]!).toBeGreaterThan(before[1]!);
  });
});

describe("a meal at the Tavern", () => {
  it("costs gold and a candle, once an evening, and makes tomorrow's discoveries pay more", () => {
    const game = street("tavern");
    gold(game, 500);
    const before = game.progress.getProgress("ann");
    const ate = game.town.meal("ann");
    expect(ate.cost).toBe(5 * before.level);
    expect(ate.lift).toBeCloseTo(data.buildings.get("tavern")!.tiers[0]!.perks.flatMap((perk) => (perk.type === "meals" ? [perk.lift] : []))[0]!);
    expect(game.progress.getProgress("ann")).toMatchObject({ gold: before.gold - ate.cost, day: { candles: candles - costs.meal } });
    expect(() => game.town.meal("ann")).toThrow(/already eaten/);
    game.day.end("ann");
    // Tomorrow a new discovery pays its gold and the lift; the day after, no longer.
    const payer = [...data.entries.values()].find((entry) => entry.kind === "material" && entry.depth > 0 && !game.store.getDiscoveries("ann").includes(entry.id))!;
    const base = data.balance.discoveryGoldByTier[Math.min(payer.tier, data.balance.discoveryGoldByTier.length - 1)]!;
    const owed = game.progress.getProgress("ann").gold;
    game.store.addDiscovery("ann", payer.id);
    game.progress.settle("ann");
    const more = Math.ceil(base * ate.lift - 1e-9);
    expect(game.store.getLedgerRefs("ann", "meal")).toContain(payer.id);
    expect(game.progress.getProgress("ann").gold - owed).toBeGreaterThanOrEqual(base + more);
  });

  it("is refused with no Tavern, too little gold, no candles, or before dusk", () => {
    const none = street("smithy");
    expect(() => none.town.meal("ann")).toThrow(/no Tavern/);
    const game = street("tavern");
    expect(() => game.town.meal("ann")).toThrowError(expect.objectContaining({ code: "not-enough-gold" }));
    gold(game, 500);
    game.setDay("ann", { spent: candles });
    expect(() => game.town.meal("ann")).toThrowError(expect.objectContaining({ code: "no-candles" }));
    game.setDay("ann", { spent: 0, sun: 0 });
    expect(() => game.town.meal("ann")).toThrowError(expect.objectContaining({ code: "not-evening" }));
  });

  it("lifts twice as much on the night of the harvest supper, which it then counts as taken", () => {
    const game = street("tavern");
    gold(game, 500);
    tonight(game, "harvest-supper");
    const ate = game.town.meal("ann");
    const plain = street("tavern");
    gold(plain, 500);
    expect(ate.lift).toBeCloseTo(plain.town.meal("ann").lift * 2);
    expect(game.store.getTonight("ann", 1)!.taken).toBe(true);
  });
});

describe("enchanting a building", () => {
  function caster(): Game {
    const game = street("smithy");
    game.store.addDiscovery("ann", "spell-mending");
    game.store.addLearned("ann", "spell-mending");
    return game;
  }
  const mending = () => data.entries.get("spell-mending")!;

  it("casts a learned spell that fits for a candle, lifts the building, and wears off", () => {
    const game = caster();
    // Mending carries utility, which the Smithy does not take: find a spell that fits it.
    const smith = data.buildings.get("smithy")!;
    const fits = [...data.entries.values()].find((entry) => entry.kind === "spell" && (entry.learnLevel ?? 1) <= 1 && entry.tags.some((tag) => smith.enchantTags.includes(tag)) && !entry.tags.includes("control"));
    expect(fits, "a first-level spell that fits the Smithy").toBeDefined();
    game.store.addDiscovery("ann", fits!.id);
    game.store.addLearned("ann", fits!.id);
    thing(game, "a", ["metal"]);
    game.town.stock("ann", 0, 0, "a");
    const before = game.town.view("ann").plots[0]!.building!;
    const cast = game.town.enchant("ann", 0, fits!.id);
    expect(cast.days).toBe(rules.enchant.baseDays + rules.enchant.daysPerTier * fits!.tier);
    const after = game.town.view("ann").plots[0]!.building!;
    expect(after.enchantment).toEqual({ spell: { id: fits!.id, name: fits!.name }, daysLeft: cast.days });
    expect(after.enchantBonus).toBeCloseTo(rules.enchant.bonus + rules.enchant.bonusPerTier * fits!.tier);
    expect(after.takings).toBeGreaterThanOrEqual(before.takings);
    expect(game.progress.getProgress("ann").day!.candles).toBe(candles - costs.enchant);
    expect(game.town.view("ann").cheer!.points).toBeGreaterThan(0);
    // Each night takes one off, says when one is left, and then it is gone.
    const lines: string[] = [];
    for (let night = 0; night < cast.days; night++) {
      lines.push(...game.day.end("ann").night!.lines);
      game.dusk("ann");
    }
    expect(lines.some((line) => /one day left/.test(line))).toBe(true);
    expect(lines.some((line) => /has faded/.test(line))).toBe(true);
    expect(game.town.view("ann").plots[0]!.building!.enchantment).toBeNull();
    expect(game.store.countEnchantments("ann")).toBe(1);
  });

  it("is refused for a spell not learned, a kind the building does not take, or an empty plot", () => {
    const game = caster();
    expect(() => game.town.enchant("ann", 0, "spell-mending")).toThrow(/will not take/);
    expect(() => game.town.enchant("ann", 3, "spell-mending")).toThrow(/Nothing stands/);
    expect(() => game.town.enchant("ann", 0, "iron")).toThrow(/spell you have discovered/);
    expect(mending().tags.length).toBeGreaterThan(0);
  });
});

describe("one-night happenings", () => {
  it("are kept for the day once looked at, never two days running, and hidden until noon", () => {
    const game = newGame();
    game.setDay("ann", { number: 6 });
    tonight(game, "pedlar");
    expect(game.progress.getProgress("ann").day!.tonight).toBeNull();
    game.setDay("ann", { number: 6, sun: data.balance.day.noon });
    expect(game.progress.getProgress("ann").day!.tonight).toMatchObject({ id: "pedlar", taken: false });
    game.setDay("ann", { number: 7, sun: data.balance.day.noon });
    expect(game.progress.getProgress("ann").day!.tonight).toBeNull();
    for (let day = 8; day < 60; day++) {
      game.setDay("ann", { number: day });
      game.progress.getProgress("ann");
      if (game.store.getTonight("ann", day)?.happening && game.store.getTonight("ann", day - 1)?.happening) throw new Error(`two days running at ${day}`);
    }
  });

  it("are named in the ledger when missed, and not when taken", () => {
    const game = street();
    tonight(game, "musician");
    expect(game.day.end("ann").night!.missed).toMatch(/came and went without you/);
    game.dusk("ann");
    tonight(game, "musician");
    game.store.addDiscovery("ann", "blacksmith");
    game.town.call("ann", game.town.arrive("ann")[0]!.id);
    expect(game.day.end("ann").night!.missed).toBeNull();
  });

  it("make the first call free and worth twice, on the musician's night only", () => {
    const game = street();
    tonight(game, "musician");
    game.store.addDiscovery("ann", "blacksmith");
    game.store.addDiscovery("ann", "farmer");
    const [smith, farmer] = game.town.arrive("ann");
    const first = game.town.call("ann", smith!.id);
    expect(first.fondness).toBe(2);
    expect(game.progress.getProgress("ann").day!.candles).toBe(candles);
    expect(game.town.call("ann", farmer!.id).fondness).toBe(1);
    expect(game.progress.getProgress("ann").day!.candles).toBe(candles - costs.call);
  });

  it("doubles an enchantment's length on the lantern festival", () => {
    const plain = street("smithy");
    const festival = street("smithy");
    const smith = data.buildings.get("smithy")!;
    const fits = [...data.entries.values()].find((entry) => entry.kind === "spell" && (entry.learnLevel ?? 1) <= 1 && entry.tags.some((tag) => smith.enchantTags.includes(tag)) && !entry.tags.includes("control"))!;
    for (const game of [plain, festival]) {
      game.store.addDiscovery("ann", fits.id);
      game.store.addLearned("ann", fits.id);
    }
    tonight(festival, "lantern-festival");
    const one = plain.town.enchant("ann", 0, fits.id).days;
    expect(festival.town.enchant("ann", 0, fits.id).days).toBe(one * 2);
  });

  it("has the pedlar sell something deeper than the player has made, once, for gold", () => {
    const game = street();
    tonight(game, "pedlar");
    gold(game, 500);
    const before = game.progress.getProgress("ann").gold;
    const took = game.town.tonight("ann");
    expect(took.entry).not.toBeNull();
    expect(game.store.getDiscoveries("ann")).toContain(took.entry!.id);
    expect(took.price).toBeGreaterThan(0);
    expect(game.progress.getProgress("ann").gold).toBe(before - took.price + took.rewards.gold);
    expect(game.progress.getProgress("ann").day!.candles).toBe(candles);
    expect(() => game.town.tonight("ann")).toThrow(/already had your share/);
  });

  it("has the stargazer give a hint for free, and nothing happens on a quiet night", () => {
    const game = street();
    tonight(game, "stargazer");
    const took = game.town.tonight("ann");
    expect(game.store.listHints("ann")).toHaveLength(1);
    expect(took.price).toBe(0);
    const quiet = street();
    tonight(quiet, null);
    expect(() => quiet.town.tonight("ann")).toThrow(/Nothing is happening/);
    const passive = street();
    tonight(passive, "harvest-supper");
    expect(() => passive.town.tonight("ann")).toThrow(/there to be enjoyed/);
  });
});

describe("the evening's routes", () => {
  const post = (body: unknown = {}) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("call, eat, enchant, and take part, each answering with the day", async () => {
    const game = street("tavern", "smithy");
    const app = createApp(game.combiner, { progress: game.progress, shop: game.shop, day: game.day, town: game.town });
    const send = async (path: string, body?: unknown) => {
      const response = await app.request(`/api/players/ann${path}`, post(body));
      return { status: response.status, body: (await response.json()) as Record<string, any> };
    };
    game.store.addDiscovery("ann", "blacksmith");
    const smith = game.town.arrive("ann")[0]!;
    gold(game, 500);
    tonight(game, null);
    const call = await send("/town/call", { person: smith.id });
    expect(call).toMatchObject({ status: 200, body: { fondness: 1, line: expect.any(String), night: null, progress: { day: { candles: candles - costs.call } } } });
    expect((await send("/town/call", { person: smith.id })).status).toBe(400);
    const meal = await send("/town/meal");
    expect(meal).toMatchObject({ status: 200, body: { lift: expect.any(Number), cost: expect.any(Number) } });
    expect((await send("/town/meal")).body).toMatchObject({ code: "rule" });
    expect((await send("/town/enchant", { plot: 1, spell: "spell-mending" })).status).toBe(400);
    expect((await send("/town/tonight")).body).toMatchObject({ error: expect.stringMatching(/Nothing is happening/) });
    expect((await send("/town/call", { person: "me" })).status).toBe(400);
  });
});

describe("where the visitor sits", () => {
  it("is the door until a Tavern stands, and then the Tavern", async () => {
    const game = newGame();
    expect((await game.events.test("ann", "small_thief")).event!.place).toBe("door");
    game.store.addPlot("ann", 0);
    game.store.setBuilding("ann", 0, "tavern", 1);
    expect((await game.events.current("ann")).event!.place).toBe("tavern");
  });
});
