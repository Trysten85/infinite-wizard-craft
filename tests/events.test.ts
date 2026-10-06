import { describe, expect, it } from "vitest";
import { createApp } from "../src/server/app";
import { createBlocklist } from "../src/server/blocklist";
import { eligibleSeeds, offeredTypes, repeatChance, returningWeights, seedWeight, weightedPick, type PlayerSnapshot } from "../src/server/events/picker";
import {
  checkSpellAnswer,
  checkWritten,
  createCannedEventWriter,
  createModelEventWriter,
  renderBrief,
  type EventBrief,
  type EventWriter,
  type SpellQuestion,
  type WrittenEvent,
} from "../src/server/events/writer";
import { createFakeClient } from "../src/server/llm/fake";
import { eventThreshold, repBandFor } from "../src/server/progress";
import type { Person } from "../src/server/store";
import type { ResponseType, Stakes } from "../src/shared/schema";
import { data, newGame, TO_FIRE_BOLT } from "./helpers";

const rules = data.balance.events;
const seed = (id: string) => data.eventSeeds.find((item) => item.id === id)!;
const novice: PlayerSnapshot = { level: 1, job: null, tags: new Set(), topTags: [], hasSpell: false };
const smith: PlayerSnapshot = { level: 3, job: { id: "blacksmith", name: "Blacksmith", wantedTags: ["forging", "metal"] }, tags: new Set(["metal", "forging", "brewing"]), topTags: ["metal", "brewing"], hasSpell: true };
const person = (overrides: Partial<Person>): Person => ({ id: 1, name: "Pim", role: "neighbor", traits: ["shy"], facts: [], fondness: 0, status: "active", firstDay: 1, lastDay: 1, flag: null, flagDay: null, ...overrides });

// A writer that records every brief and every spell question it is given.
function recordingWriter() {
  const briefs: EventBrief[] = [];
  const questions: SpellQuestion[] = [];
  const canned = createCannedEventWriter();
  const writer: EventWriter = {
    write: (brief) => (briefs.push(brief), canned.write(brief)),
    checkSpell: (question) => (questions.push(question), canned.checkSpell(question)),
  };
  return { writer, briefs, questions };
}

describe("the ten starter seeds", () => {
  it("load, with every tag in the vocabulary", () => {
    expect(data.eventSeeds).toHaveLength(10);
    expect(new Set(data.eventSeeds.map((item) => item.kind)).size).toBeGreaterThanOrEqual(8);
  });
});

describe("picking a seed", () => {
  it("only offers seeds whose level, job, and spell limits the player meets", () => {
    const ids = eligibleSeeds(data.eventSeeds, novice).map((item) => item.id);
    expect(ids.sort()).toEqual(["meet_cute", "not_my_mess", "small_thief", "the_official", "unhappy_someone"]);
    expect(eligibleSeeds(data.eventSeeds, smith)).toHaveLength(10);
  });

  it("favors seeds that match the player's tags", () => {
    expect(seedWeight(seed("the_official"), smith, [])).toBeGreaterThan(seedWeight(seed("the_official"), novice, []));
  });

  it("weights down a seed that fired recently, and a kind that just fired", () => {
    const fresh = seedWeight(seed("small_thief"), novice, []);
    const recent = [{ seedId: "small_thief", kind: "comic", mood: ["silly"], personId: 1 }];
    expect(seedWeight(seed("small_thief"), novice, recent)).toBeCloseTo(fresh * 0.25 * 0.5);
    const sameKind = [{ seedId: "grand_guest", kind: "social", mood: ["proud"], personId: 1 }];
    expect(seedWeight(seed("meet_cute"), novice, sameKind)).toBeCloseTo(seedWeight(seed("meet_cute"), novice, []) * 0.5);
  });

  it("leans warm or silly after two tense events in a row", () => {
    const tense = [1, 2].map((id) => ({ seedId: `x${id}`, kind: "other", mood: ["tense"], personId: id }));
    expect(seedWeight(seed("small_thief"), novice, tense)).toBeGreaterThan(seedWeight(seed("small_thief"), novice, []));
    expect(seedWeight(seed("the_official"), novice, tense)).toBeLessThan(seedWeight(seed("the_official"), novice, []));
  });

  it("picks in proportion to weight", () => {
    const items = [{ item: "a", weight: 1 }, { item: "b", weight: 3 }];
    expect(weightedPick(items, 0)).toBe("a");
    expect(weightedPick(items, 0.3)).toBe("b");
    expect(weightedPick(items, 0.999)).toBe("b");
    expect(weightedPick([{ item: "a", weight: 0 }], 0.5)).toBeUndefined();
    expect(weightedPick([], 0.5)).toBeUndefined();
  });
});

describe("response types on offer", () => {
  const all: ResponseType[] = ["generous", "skilled", "fair", "sharp", "avoid"];

  it("offer Skilled only to a player who holds one of the skill tags", () => {
    expect(offeredTypes(["generous", "skilled", "avoid"], ["forging"], novice)).toEqual(["generous", "avoid"]);
    expect(offeredTypes(["generous", "skilled", "avoid"], ["forging"], smith)).toEqual(["generous", "skilled", "avoid"]);
  });

  it("never offer more than four, dropping by how a returning person feels", () => {
    expect(offeredTypes(all, ["forging"], smith, 4)).toEqual(["generous", "skilled", "fair", "avoid"]);
    expect(offeredTypes(all, ["forging"], smith, -4)).toEqual(["generous", "skilled", "sharp", "avoid"]);
  });
});

describe("bringing someone back", () => {
  it("never happens until the player knows a couple of people", () => {
    expect(repeatChance([], 5, data.balance)).toBe(0);
    expect(repeatChance([person({})], 5, data.balance)).toBe(0);
    expect(repeatChance([person({ id: 1 }), person({ id: 2 })], 5, data.balance)).toBe(rules.repeatShare);
  });

  it("becomes likely once a follow-up is due", () => {
    expect(repeatChance([person({ flag: "thanks", flagDay: 4 })], 5, data.balance)).toBeGreaterThanOrEqual(0.6);
    expect(repeatChance([person({ flag: "thanks", flagDay: 9 })], 5, data.balance)).toBe(0);
  });

  it("gives priority to a due follow-up, rests whoever was just seen, and rarely returns a settled story", () => {
    const people = [person({ id: 1 }), person({ id: 2, flag: "thanks", flagDay: 3 }), person({ id: 3, status: "settled" }), person({ id: 4, status: "dormant" })];
    const weights = new Map(returningWeights(people, 5, 1).map(({ item, weight }) => [item.id, weight]));
    expect([...weights.keys()]).toEqual([2, 3]);
    expect(weights.get(2)!).toBeGreaterThan(weights.get(3)! * 10);
    expect(returningWeights([person({ id: 1 })], 5, 1).map(({ item }) => item.id)).toEqual([1]);
    expect(returningWeights([], 5, undefined)).toEqual([]);
  });
});

describe("standing", () => {
  it("falls into bands that shift prices, request pay, and how soon events come", () => {
    expect(repBandFor(-6, data.balance).name).toBe("Wobbly");
    expect(repBandFor(0, data.balance).name).toBe("Fine");
    expect(repBandFor(6, data.balance).name).toBe("Liked");
    expect(repBandFor(40, data.balance).name).toBe("Beloved");
    expect(eventThreshold(0, data.balance)).toBe(15);
    expect(eventThreshold(20, data.balance)).toBeLessThan(15);
    expect(eventThreshold(-20, data.balance)).toBeGreaterThan(15);
  });

  it("makes the shop a little cheaper for a liked player and dearer for a wobbly one", () => {
    const { shop, store } = newGame();
    const before = shop.view("ann").slots[0]!.price;
    store.changeStats("ann", { rep: 20 });
    expect(shop.view("ann").slots[0]!.price).toBe(Math.max(1, Math.round(before * 0.9)));
    store.changeStats("ann", { rep: -40 });
    expect(shop.view("ann").slots[0]!.price).toBe(Math.round(before * 1.1));
  });
});

describe("earning an event", () => {
  it("takes fifteen points: one per discovery, two per quest, one per spell learned, three per level", async () => {
    const { progress, play, store } = newGame();
    expect(progress.getProgress("ann")).toMatchObject({ eventReady: false, eventIn: 15 });
    await play("ann", [["fire", "air"]]);
    // One discovery, plus the first tutorial quest.
    expect(progress.getProgress("ann").eventIn).toBe(15 - 1 - 2);
    await play("ann", TO_FIRE_BOLT.slice(1, 6));
    progress.settle("ann");
    const before = store.getStats("ann").eventPoints;
    await play("ann", [TO_FIRE_BOLT[6]!]);
    progress.settle("ann");
    // Fire Bolt: a discovery, the cantrip quest, and with it level two and that quest.
    expect(store.getStats("ann").eventPoints - before).toBe(1 + 2 + 3 + 2);
    const learnedAt = store.getStats("ann").eventPoints;
    progress.learn("ann", "spell-fire-bolt");
    expect(store.getStats("ann").eventPoints - learnedAt).toBe(1 + 2);
    expect(progress.getProgress("ann").eventReady).toBe(true);
  });

  it("does not count things bought in the shop", () => {
    const { shop, store, progress } = newGame();
    store.addLedger("ann", 1000, "quest", "test-grant");
    progress.settle("ann");
    const before = store.getStats("ann").eventPoints;
    const { rewards } = shop.buy("ann", 0);
    // A purchase can complete a tutorial quest, which pays its two points, but the purchase itself pays none.
    expect(rewards.quests.length).toBeGreaterThan(0);
    expect(store.getStats("ann").eventPoints - before).toBe(2 * rewards.quests.length);
  });
});

describe("an event", () => {
  async function ready(game: ReturnType<typeof newGame>, player = "ann") {
    await game.play(player, TO_FIRE_BOLT);
    game.progress.learn(player, "spell-fire-bolt");
    return (await game.events.current(player)).event!;
  }

  it("is not written until it is due", async () => {
    const { writer, briefs } = recordingWriter();
    const game = newGame(1, writer);
    expect(await game.events.current("ann")).toEqual({ event: null, eventIn: 15 });
    expect(briefs).toHaveLength(0);
  });

  it("is written once, introduces a person, and spends the points that earned it", async () => {
    const { writer, briefs } = recordingWriter();
    const game = newGame(1, writer);
    const before = async () => game.store.getStats("ann").eventPoints;
    await game.play("ann", TO_FIRE_BOLT);
    game.progress.learn("ann", "spell-fire-bolt");
    const points = await before();
    const [first, second] = await Promise.all([game.events.current("ann"), game.events.current("ann")]);
    expect(briefs).toHaveLength(1);
    expect(second).toEqual(first);
    expect(first.event).toMatchObject({ person: { returning: false } });
    expect(first.event!.responses.map((response) => response.type)).toEqual(briefs[0]!.responseTypes);
    expect(first.event!.responses.length).toBeGreaterThanOrEqual(2);
    expect(game.store.getStats("ann").eventPoints).toBe(points - 15);
    expect(game.store.listPeople("ann")).toHaveLength(1);
    expect((await game.events.current("ann")).event!.id).toBe(first.event!.id);
    expect(briefs).toHaveLength(1);
  });

  it("applies exactly what the chosen response type does, scaled by the stakes", async () => {
    const offered = (await ready(newGame())).responses.map((response) => response.type);
    for (const type of offered) {
      const game = newGame();
      await ready(game);
      const stakes = rules.stakes[game.store.listEvents("ann")[0]!.stakes as Stakes]!;
      const gold = game.progress.getProgress("ann").gold;
      const result = game.events.respond("ann", type);
      const profile = rules.effects[type]!;
      expect(result.effects, type).toEqual({
        gold: Math.round(profile.gold * stakes.gold),
        rep: Math.round(profile.rep * stakes.scale),
        fondness: Math.round(profile.fondness * stakes.scale),
      });
      const after = game.progress.getProgress("ann");
      expect(after.gold - gold, type).toBe(result.effects.gold + result.rewards.gold);
      expect(after.rep, type).toBe(result.effects.rep);
      expect(game.store.listPeople("ann")[0]!.fondness, type).toBe(result.effects.fondness);
      expect(game.store.listEvents("ann")[0]!, type).toMatchObject({ state: "resolved", chosen: type });
    }
  });

  it("never lets a generous response cost more gold than the player has", async () => {
    const game = newGame();
    for (const id of ["light", "mud"]) game.store.addDiscovery("ann", id);
    game.store.changeStats("ann", { eventPoints: 30 });
    game.progress.settle("ann");
    game.store.addLedger("ann", -game.progress.getProgress("ann").gold, "shop", "test-drain");
    const event = (await game.events.current("ann")).event!;
    if (event.responses.some((response) => response.type === "generous")) {
      expect(game.events.respond("ann", "generous").effects.gold).toBe(0);
      expect(game.progress.getProgress("ann").gold).toBeGreaterThanOrEqual(0);
    }
  });

  it("refuses a response with nothing waiting, or one that was not offered", async () => {
    const game = newGame();
    expect(() => game.events.respond("ann", "fair")).toThrow(/Nothing is waiting/);
    const event = await ready(game);
    const missing = (["generous", "skilled", "fair", "sharp", "avoid"] as const).find((type) => !event.responses.some((r) => r.type === type))!;
    expect(() => game.events.respond("ann", missing)).toThrow(/not one of the choices/);
  });
});

describe("a spell that solves the event", () => {
  // Plays events for a player who has learned the given spells, and returns every event seen.
  async function eventsFor(learned: string[], rounds = 12, level2 = false) {
    const { writer, questions } = recordingWriter();
    const game = newGame(5, writer);
    for (const id of ["light", "mud", "life", "tree", "spellbook", ...learned]) game.store.addDiscovery("ann", id);
    for (const id of learned) game.store.addLearned("ann", id);
    if (level2) for (const id of ["sand", "salt", "glass", "iron", "silver", "metal", "steam"]) game.store.addDiscovery("ann", id);
    const seen = [];
    for (let round = 0; round < rounds; round++) {
      game.store.changeStats("ann", { eventPoints: 20 });
      const { event } = await game.events.current("ann");
      seen.push({ event: event!, stored: game.store.listEvents("ann").at(-1)! });
      if (round < rounds - 1) game.events.respond("ann", event!.responses.at(-1)!.type);
    }
    return { game, questions, seen };
  }

  it("becomes the Skilled response, at no cost and to the player's credit", async () => {
    const { game, questions, seen } = await eventsFor(["spell-mending"]);
    expect(questions.length).toBeGreaterThan(0);
    const withSpell = seen.filter(({ event }) => event.responses.some((response) => response.spell));
    expect(withSpell.length).toBeGreaterThan(0);
    for (const { event } of withSpell) {
      const skilled = event.responses.find((response) => response.type === "skilled")!;
      expect(skilled).toMatchObject({ spell: { id: "spell-mending", name: "Mending" } });
      expect(skilled.text).toContain("Mending");
      expect(event.responses.length).toBeLessThanOrEqual(4);
    }
    // The last event was left unanswered. If it has the spell, using it costs nothing and earns standing.
    const last = seen.at(-1)!;
    if (last.event.responses.some((response) => response.spell)) {
      const result = game.events.respond("ann", "skilled");
      expect(result.effects.gold).toBe(0);
      expect(result.effects.rep).toBeGreaterThan(0);
      expect(result.outcome).toContain("Mending");
    }
  });

  it("adds a Skilled response to a seed that would not otherwise offer one", async () => {
    const { seen } = await eventsFor(["spell-mending"], 30);
    const added = seen.filter(({ event, stored }) => {
      const origin = data.eventSeeds.find((item) => item.id === stored.seedId);
      return origin && !origin.responseTypes.includes("skilled") && event.responses.some((response) => response.type === "skilled");
    });
    expect(added.length).toBeGreaterThan(0);
  });

  it("is not always asked about, so it is not on offer every time", async () => {
    const { questions, seen } = await eventsFor(["spell-mending"], 30);
    expect(questions.length).toBeLessThan(seen.length);
    expect(questions.length).toBeGreaterThan(seen.length / 3);
  });

  it("is never asked about for a player with no learned spells", async () => {
    expect((await eventsFor([])).questions).toHaveLength(0);
  });

  it("never offers a spell that bends someone's will, or one above the player's level", async () => {
    const { questions } = await eventsFor(["spell-charm-person", "spell-fireball"]);
    expect(questions).toHaveLength(0);
    const mixed = await eventsFor(["spell-charm-person", "spell-mending", "spell-fireball"]);
    for (const question of mixed.questions) expect(question.spells.map((spell) => spell.id)).toEqual(["spell-mending"]);
  });
});

describe("checking a spell answer", () => {
  const question: SpellQuestion = { scene: "A cup lies in pieces.", personName: "Pim", spells: [{ id: "spell-mending", name: "Mending", school: "Transmutation", tags: ["utility"] }] };

  it("accepts no spell, or a listed spell that is named in the response line", () => {
    expect(checkSpellAnswer(question, { spellId: null, text: "", outcome: "" })).toBeNull();
    expect(checkSpellAnswer(question, { spellId: "spell-mending", text: "Put the cup right with Mending.", outcome: "Good as new." })).toBeNull();
  });

  it("rejects an unlisted spell, a line that does not name the spell, and numbers", () => {
    expect(checkSpellAnswer(question, { spellId: "spell-fireball", text: "Fireball.", outcome: "x" })).toMatch(/listed spells/);
    expect(checkSpellAnswer(question, { spellId: "spell-mending", text: "Fix the cup.", outcome: "Good as new." })).toMatch(/must name the spell: Mending/);
    expect(checkSpellAnswer(question, { spellId: "spell-mending", text: "Mending, cast 2 times.", outcome: "Good." })).toMatch(/digits/);
    expect(checkSpellAnswer(question, { spellId: "spell-mending", text: "Use Mending.", outcome: "" })).toMatch(/both/);
  });

  it("lets the model say none, and rerolls an answer that breaks the rules", async () => {
    const none = createModelEventWriter({ client: createFakeClient([JSON.stringify({ spell: "none", text: "", outcome: "" })]), log: () => {}, voice: "v" });
    expect(await none.checkSpell(question)).toEqual({ spellId: null, text: "", outcome: "" });
    const client = createFakeClient([
      JSON.stringify({ spell: "spell-mending", text: "Fix the cup.", outcome: "Good as new." }),
      JSON.stringify({ spell: "spell-mending", text: "Put the cup right with Mending.", outcome: "Good as new." }),
    ]);
    const writer = createModelEventWriter({ client, log: () => {}, voice: "v" });
    expect((await writer.checkSpell(question)).spellId).toBe("spell-mending");
    expect(JSON.stringify(client.requests[0]!.jsonSchema)).toContain("none");
  });
});

describe("a long run of events", () => {
  it("brings people back with their fixed record and a short history, and keeps the active cast small", async () => {
    const { writer, briefs } = recordingWriter();
    const game = newGame(3, writer);
    for (const id of ["light", "mud", "life", "tree", "spellbook", "evocation", "spell-fire-bolt", "person", "forge", "blacksmith"]) game.store.addDiscovery("ann", id);
    for (let round = 0; round < 40; round++) {
      game.store.changeStats("ann", { eventPoints: 20 });
      const { event } = await game.events.current("ann");
      game.events.respond("ann", event!.responses[0]!.type);
    }
    const returning = briefs.filter((brief) => brief.person.returning);
    expect(returning.length).toBeGreaterThan(3);
    for (const brief of returning) {
      if (!brief.person.returning) continue;
      expect(brief.person.history.length).toBeLessThanOrEqual(rules.memory);
      expect(game.store.listPeople("ann").map((item) => item.name)).toContain(brief.person.name);
    }
    for (const brief of briefs) expect(brief.recent.length).toBeLessThanOrEqual(3);
    const people = game.store.listPeople("ann");
    expect(new Set(people.map((item) => item.name)).size).toBe(people.length);
    expect(people.filter((item) => item.status === "active").length).toBeLessThanOrEqual(rules.maxActivePeople);
    const events = game.store.listEvents("ann");
    expect(events.map((event) => event.day)).toEqual(events.map((_, index) => index + 1));
    // No seed fires twice in a row.
    const repeatsInARow = events.filter((event, index) => event.seedId !== "repeat" && event.seedId === events[index - 1]?.seedId);
    expect(repeatsInARow.length).toBeLessThan(4);
  });
});

describe("a request", () => {
  it("is planned by code for something the player lacks and could reach", async () => {
    let found: { brief: EventBrief; game: ReturnType<typeof newGame> } | undefined;
    for (let gameSeed = 1; gameSeed <= 40 && !found; gameSeed++) {
      const { writer, briefs } = recordingWriter();
      const game = newGame(gameSeed, writer);
      for (const id of ["light", "mud", "life"]) game.store.addDiscovery("ann", id);
      game.store.changeStats("ann", { eventPoints: 30 });
      await game.events.current("ann");
      if (briefs[0]?.ask) found = { brief: briefs[0], game };
    }
    expect(found, "no seed in forty planned a request").toBeDefined();
    const { brief, game } = found!;
    const wanted = [...data.entries.values()].find((entry) => entry.name === brief.ask!.name)!;
    expect(wanted.kind).toBe("material");
    expect(game.combiner.listDiscovered("ann").map((entry) => entry.id)).not.toContain(wanted.id);

    const event = (await game.events.current("ann")).event!;
    const helpful = event.responses.find((response) => ["generous", "skilled", "fair"].includes(response.type))!;
    const result = game.events.respond("ann", helpful.type);
    expect(result.request).toMatchObject({ state: "open", entry: { id: wanted.id } });
    expect(result.request!.ask).toContain(wanted.name);
    expect(game.progress.getProgress("ann").requests).toHaveLength(1);
  });

  it("pays gold, standing, fondness, and two points when the player comes to have the thing", () => {
    const { store, progress } = newGame();
    const friend = store.addPerson("ann", { name: "Pim Kettlebrook", role: "neighbor", traits: ["shy"], facts: [] }, 1);
    store.addRequest("ann", { personId: friend.id, eventId: 1, entryId: "glass", ask: "Could you bring me some Glass?", gold: 30 });
    progress.settle("ann");
    expect(progress.getProgress("ann").requests[0]).toMatchObject({ from: "Pim Kettlebrook", state: "open", gold: 30 });
    const before = { gold: progress.getProgress("ann").gold, points: store.getStats("ann").eventPoints };

    store.addLedger("ann", 0, "shop", "glass");
    store.addDiscovery("ann", "glass");
    const rewards = progress.settle("ann");
    expect(rewards.quests).toContainEqual({ id: "request-1", title: "A favor for Pim Kettlebrook", gold: 30 });
    const after = progress.getProgress("ann");
    expect(after.requests[0]!.state).toBe("done");
    expect(after.gold - before.gold).toBe(30 + rewards.quests.filter((quest) => quest.id !== "request-1").reduce((sum, quest) => sum + quest.gold, 0));
    expect(after.rep).toBe(rules.request.rep);
    expect(store.listPeople("ann")[0]!.fondness).toBe(rules.request.fondness);
    expect(store.getStats("ann").eventPoints - before.points).toBeGreaterThanOrEqual(2);
    expect(progress.settle("ann")).toEqual({ gold: 0, quests: [] });
  });
});

describe("checking what the writer wrote", () => {
  const brief: EventBrief = {
    seed: { premise: "A small animal takes something", kind: "comic", mood: ["silly"] },
    stakes: "S",
    player: { job: "Blacksmith", topTags: ["metal"], repBand: "Fine" },
    person: { returning: false },
    recent: [],
    responseTypes: ["generous", "fair", "avoid"],
    ask: null,
    takenNames: ["Odessa Tuck"],
  };
  const good: WrittenEvent = {
    scene: "A goose has your hammer. It is not giving it back.",
    sceneSummary: "A goose took the hammer.",
    person: { name: "Pim Kettlebrook", role: "neighbor", traits: ["shy"], facts: ["owns the goose"] },
    responses: [
      { type: "generous", text: "Offer the goose a bun.", outcome: "The goose accepts." },
      { type: "fair", text: "Ask nicely.", outcome: "The goose considers it." },
      { type: "avoid", text: "Leave it.", outcome: "You buy another hammer." },
    ],
    ask: null,
  };
  const withResponse = (index: number, change: Partial<WrittenEvent["responses"][number]>): WrittenEvent => ({
    ...good,
    responses: good.responses.map((response, i) => (i === index ? { ...response, ...change } : response)),
  });

  it("accepts an event that follows every rule", () => {
    expect(checkWritten(brief, good)).toBeNull();
  });

  it("rejects a missing, extra, or mislabeled response", () => {
    expect(checkWritten(brief, { ...good, responses: good.responses.slice(0, 2) })).toMatch(/exactly one response of each/);
    expect(checkWritten(brief, withResponse(1, { type: "generous" }))).toMatch(/exactly one response of each/);
    expect(checkWritten(brief, withResponse(1, { type: "sharp" }))).toMatch(/exactly one response of each/);
  });

  it("rejects a missing or badly named new person, and a renamed returning one", () => {
    expect(checkWritten(brief, { ...good, person: null })).toMatch(/Invent the person/);
    expect(checkWritten(brief, { ...good, person: { ...good.person!, name: "odessa tuck" } })).toMatch(/capitalised/);
    expect(checkWritten(brief, { ...good, person: { ...good.person!, name: "Odessa Tuck" } })).toMatch(/already knows someone/);
    const returning: EventBrief = { ...brief, person: { returning: true, name: "Odessa Tuck", role: "baker", traits: [], facts: [], feeling: "fond", followUp: null, history: [] } };
    expect(checkWritten(returning, good)).toMatch(/already known/);
    expect(checkWritten(returning, { ...good, person: null })).toBeNull();
  });

  it("requires the ask to name what code chose, and no ask when none was planned", () => {
    const asking = { ...brief, ask: { name: "Glass" } };
    expect(checkWritten(asking, good)).toMatch(/Write the ask/);
    expect(checkWritten(asking, { ...good, ask: "Could you find me something shiny?" })).toMatch(/must name the thing wanted: Glass/);
    expect(checkWritten(asking, { ...good, ask: "Could you bring me a bit of glass?" })).toBeNull();
    expect(checkWritten(brief, { ...good, ask: "Bring me glass." })).toMatch(/Nobody asks/);
  });

  it("rejects numbers, game terms, blocked names, and copied sample lines", () => {
    expect(checkWritten(brief, withResponse(0, { outcome: "It costs you 5 coins." }))).toMatch(/digits/);
    expect(checkWritten(brief, { ...good, scene: "Your reputation is at stake." })).toMatch(/game term/);
    expect(checkWritten(brief, { ...good, scene: "Velica has your hammer." }, { blocklist: createBlocklist(["Velica"]) })).toMatch(/not available/);
    expect(checkWritten(brief, good, { voiceCheck: (text) => (text.includes("goose has your hammer") ? "copied" : null) })).toBe("copied");
  });

  it("is never told a number", () => {
    const returning: EventBrief = { ...brief, stakes: "L", ask: { name: "Glass" }, recent: ["A goose took the hammer."], person: { returning: true, name: "Odessa Tuck", role: "baker", traits: ["fussy"], facts: ["has a cat"], feeling: "fond of the player", followUp: "to say thank you", history: ["She came by."] } };
    for (const text of [renderBrief(brief), renderBrief(returning)]) expect(text).not.toMatch(/[0-9]/);
    expect(renderBrief(returning)).toContain("Known facts, which must not change: has a cat.");
  });

  it("rerolls the model until the event passes", async () => {
    const client = createFakeClient([JSON.stringify(withResponse(0, { outcome: "It costs 5 coins." })), JSON.stringify(good)]);
    const writer = createModelEventWriter({ client, log: () => {}, voice: "v" });
    expect((await writer.write(brief)).person!.name).toBe("Pim Kettlebrook");
    expect(client.requests[1]!.prompt).toContain("Do not use digits");
  });
});

describe("the event routes", () => {
  const post = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("report when the next event is due, serve it, and resolve it", async () => {
    const game = newGame();
    const app = createApp(game.combiner, { progress: game.progress, shop: game.shop, events: game.events });
    expect(await (await app.request("/api/players/ann/event")).json()).toEqual({ event: null, eventIn: 15 });
    const player = (await (await app.request("/api/players/ann")).json()) as Record<string, any>;
    expect(player.progress).toMatchObject({ rep: 0, repBand: "Fine", requests: [], eventReady: false, eventIn: 15 });

    game.store.changeStats("ann", { eventPoints: 15 });
    const waiting = (await (await app.request("/api/players/ann/event")).json()) as Record<string, any>;
    expect(waiting.event.scene).toBeTruthy();
    expect(JSON.stringify(waiting)).not.toContain("outcome");

    const type = waiting.event.responses[0].type;
    const resolved = (await (await app.request("/api/players/ann/event/respond", post({ type }))).json()) as Record<string, any>;
    expect(resolved).toMatchObject({ outcome: expect.any(String), effects: expect.any(Object), progress: { eventReady: false } });
    expect((await app.request("/api/players/ann/event/respond", post({ type }))).status).toBe(400);
    expect((await app.request("/api/players/ann/event/respond", post({ type: "heroic" }))).status).toBe(400);
  });
});
