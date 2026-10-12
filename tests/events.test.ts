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
  checkParting,
  plainParting,
  type EventBrief,
  type EventWriter,
  type PartingQuestion,
  type SpellQuestion,
  type WrittenEvent,
} from "../src/server/events/writer";
import { createEvents } from "../src/server/events/service";
import { createFakeClient } from "../src/server/llm/fake";
import { GenerationError } from "../src/server/llm/generate";
import { repBandFor, xpToReach } from "../src/server/progress";
import type { Person } from "../src/server/store";
import { RESPONSE_TYPES, type ResponseType, type Stakes } from "../src/shared/schema";
import { data, DUSK, newGame, TO_FIRE_BOLT } from "./helpers";

const rules = data.balance.events;
const seed = (id: string) => data.eventSeeds.find((item) => item.id === id)!;
const novice: PlayerSnapshot = { level: 1, job: null, tags: new Set(), topTags: [], hasSpell: false };
const smith: PlayerSnapshot = { level: 3, job: { id: "blacksmith", name: "Blacksmith", wantedTags: ["forging", "metal"] }, tags: new Set(["metal", "forging", "brewing"]), topTags: ["metal", "brewing"], hasSpell: true };
const person = (overrides: Partial<Person>): Person => ({ id: 1, name: "Pim", job: null, pronoun: null, role: "neighbor", traits: ["shy"], facts: [], fondness: 0, status: "active", firstDay: 1, lastDay: 1, flag: null, flagDay: null, ...overrides });

// A writer that records every brief and every spell question it is given.
function recordingWriter() {
  const briefs: EventBrief[] = [];
  const questions: SpellQuestion[] = [];
  const partings: PartingQuestion[] = [];
  const canned = createCannedEventWriter();
  const writer: EventWriter = {
    write: (brief) => (briefs.push(brief), canned.write(brief)),
    checkSpell: (question) => (questions.push(question), canned.checkSpell(question)),
    writeParting: (question) => (partings.push(question), canned.writeParting(question)),
  };
  return { writer, briefs, questions, partings };
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
  it("falls into bands that shift prices and request pay", () => {
    expect(repBandFor(-6, data.balance).name).toBe("Wobbly");
    expect(repBandFor(0, data.balance).name).toBe("Fine");
    expect(repBandFor(6, data.balance).name).toBe("Liked");
    expect(repBandFor(40, data.balance).name).toBe("Beloved");
  });

  it("makes the shop a little cheaper for a liked player and dearer for a wobbly one", () => {
    const { shop, store, stall } = newGame();
    stall("ann");
    const before = shop.view("ann").slots[0]!.price;
    store.changeStats("ann", { rep: 20 });
    expect(shop.view("ann").slots[0]!.price).toBe(Math.max(1, Math.round(before * 0.9)));
    store.changeStats("ann", { rep: -40 });
    expect(shop.view("ann").slots[0]!.price).toBe(Math.round(before * 1.1));
  });
});

// Answers the arrival, and returns the second beat of the conversation.
async function openUp(game: ReturnType<typeof newGame>, type: ResponseType = "generous", player = "ann") {
  return (await game.events.respond(player, type)).next!;
}

describe("the day's visitor", () => {
  // Sits with tonight's visitor from the door to the end, and returns how it came out.
  async function sitWith(game: ReturnType<typeof newGame>, player = "ann") {
    await game.events.current(player);
    const heart = await openUp(game, "fair", player);
    return game.events.respond(player, heart.responses[0]!.type);
  }

  it("is written once the day is under way, and only seen from dusk", async () => {
    const { writer, briefs } = recordingWriter();
    const game = newGame(1, writer);
    // Nobody is written for a player who has only opened the page.
    expect(game.progress.getProgress("ann")).toMatchObject({ eventReady: false, eventIn: 0 });
    expect(await game.events.current("ann")).toEqual({ event: null });
    expect(briefs).toHaveLength(0);
    game.setDay("ann", { sun: 1 });
    expect(game.progress.getProgress("ann").eventReady).toBe(true);
    expect(await game.events.current("ann")).toEqual({ event: null });
    expect(briefs).toHaveLength(1);
    expect(game.store.listEvents("ann")[0]).toMatchObject({ day: 1, state: "pending" });
    await expect(game.events.respond("ann", "fair")).rejects.toMatchObject({ code: "not-evening" });
    game.setDay("ann", { sun: DUSK - 1 });
    expect((await game.events.current("ann")).event).toBeNull();
    game.setDay("ann", { sun: DUSK });
    expect((await game.events.current("ann")).event).toMatchObject({ beat: 1 });
    expect(briefs).toHaveLength(1);
  });

  it("takes one candle, when the conversation ends and not before", async () => {
    const game = newGame();
    game.dusk("ann");
    await game.events.current("ann");
    const candles = () => game.progress.getProgress("ann").day!.candles;
    expect(candles()).toBe(3);
    const reaction = await game.events.respond("ann", "fair");
    expect(reaction).toMatchObject({ night: null, dusk: null });
    expect(candles()).toBe(3);
    const result = await game.events.respond("ann", reaction.next!.responses[0]!.type);
    expect(result).toMatchObject({ next: null, night: null });
    expect(candles()).toBe(3 - data.balance.day.costs.visitor);
  });

  it("takes its candle at the door too, if the player turns them away", async () => {
    const game = newGame();
    game.dusk("ann");
    await game.events.current("ann");
    await game.events.respond("ann", "avoid");
    expect(game.progress.getProgress("ann").day!.candles).toBe(2);
  });

  it("brings night when it takes the last candle, and the ledger comes back with the answer", async () => {
    const game = newGame();
    game.dusk("ann");
    game.setDay("ann", { spent: 2 });
    const result = await sitWith(game);
    expect(result.night).toMatchObject({ day: 1, fell: "last-candle" });
    expect(game.progress.getProgress("ann").day).toMatchObject({ number: 2, sun: 0, phase: "morning", lastLedger: { day: 1 } });
  });

  it("is refused when the candles are too few, and nothing is changed", async () => {
    const game = newGame();
    game.dusk("ann");
    await game.events.current("ann");
    // Night falls with the last candle, so this cannot come about by playing yet. A later
    // evening action that costs two will meet it.
    game.setDay("ann", { spent: 3 });
    await expect(game.events.respond("ann", "fair")).rejects.toMatchObject({ code: "no-candles" });
    expect(game.store.listEvents("ann")[0]).toMatchObject({ state: "pending" });
    expect(game.store.listPeople("ann")[0]!.fondness).toBe(0);
  });

  it("comes once a day: nobody new is written the day one has been seen", async () => {
    const { writer, briefs } = recordingWriter();
    const game = newGame(1, writer);
    game.dusk("ann");
    await sitWith(game);
    const arrivals = () => briefs.filter((brief) => brief.stage === "arrival").length;
    expect(arrivals()).toBe(1);
    expect(game.progress.getProgress("ann").eventReady).toBe(false);
    expect(await game.events.current("ann")).toEqual({ event: null });
    expect(arrivals()).toBe(1);
    // Bed, and the next one is written once the next morning is under way.
    game.day.end("ann");
    await game.events.current("ann");
    expect(arrivals()).toBe(1);
    game.setDay("ann", { sun: 1 });
    expect(game.progress.getProgress("ann").eventReady).toBe(true);
    await game.events.current("ann");
    expect(arrivals()).toBe(2);
    expect(game.store.listEvents("ann").map((event) => event.day)).toEqual([1, 2]);
  });

  it("waits if the player does not sit with them, and nobody new is written meanwhile", async () => {
    const { writer, briefs } = recordingWriter();
    const game = newGame(1, writer);
    game.dusk("ann");
    const first = (await game.events.current("ann")).event!;
    game.day.end("ann");
    game.dusk("ann");
    game.day.end("ann");
    expect(game.day.today("ann").number).toBe(3);
    // The same visitor, still out of sight by day and at the door by dusk.
    expect((await game.events.current("ann")).event).toBeNull();
    game.dusk("ann");
    expect((await game.events.current("ann")).event).toMatchObject({ id: first.id, beat: 1 });
    expect(briefs.filter((brief) => brief.stage === "arrival")).toHaveLength(1);
    // What happens with them happens today, whenever they were written.
    await game.events.respond("ann", "avoid");
    expect(game.store.listPeople("ann")[0]!.lastDay).toBe(3);
    expect(game.store.getDay("ann").visitorDay).toBe(3);
  });

  it("carries on tomorrow evening if the player goes to bed in the middle of the conversation", async () => {
    const game = newGame();
    game.dusk("ann");
    await game.events.current("ann");
    const heart = await openUp(game, "fair");
    game.day.end("ann");
    expect((await game.events.current("ann")).event).toBeNull();
    game.dusk("ann");
    expect((await game.events.current("ann")).event).toEqual(heart);
    expect((await game.events.respond("ann", heart.responses[0]!.type)).next).toBeNull();
    expect(game.progress.getProgress("ann").day).toMatchObject({ number: 2, candles: 2 });
  });
});

describe("an event", () => {
  async function ready(game: ReturnType<typeof newGame>, player = "ann") {
    await game.play(player, TO_FIRE_BOLT);
    game.progress.learn(player, "spell-fire-bolt");
    game.dusk(player);
    return (await game.events.current(player)).event!;
  }

  it("opens with someone arriving, and is written once", async () => {
    const { writer, briefs } = recordingWriter();
    const game = newGame(1, writer);
    await game.play("ann", TO_FIRE_BOLT);
    game.progress.learn("ann", "spell-fire-bolt");
    game.dusk("ann");
    const [first, second] = await Promise.all([game.events.current("ann"), game.events.current("ann")]);
    expect(briefs).toHaveLength(1);
    expect(briefs[0]).toMatchObject({ stage: "arrival", soFar: null });
    expect(second).toEqual(first);
    expect(first.event).toMatchObject({ beat: 1, beats: 2, earlier: [], person: { returning: false } });
    // The first reaction is always one of the opening types, whatever the seed.
    expect(first.event!.responses.map((response) => response.type)).toEqual(rules.openingTypes);
    expect(game.store.listPeople("ann")).toHaveLength(1);
    expect((await game.events.current("ann")).event!.id).toBe(first.event!.id);
    expect(briefs).toHaveLength(1);
  });

  it("goes on to a second beat that answers how the player first reacted", async () => {
    const { writer, briefs } = recordingWriter();
    const game = newGame(1, writer);
    const arrival = await ready(game);
    const reaction = await game.events.respond("ann", "generous");
    // The first reaction only warms the person a little. Nothing is paid or earned yet.
    expect(reaction.effects).toEqual({ gold: 0, rep: 0, fondness: 1 });
    expect(reaction).toMatchObject({ request: null, hint: null, gift: null });
    const heart = reaction.next!;
    expect(heart).toMatchObject({ id: arrival.id, beat: 2, beats: 2 });
    expect(heart.earlier).toEqual([{ scene: arrival.scene, chosen: arrival.responses[0]!.text, outcome: reaction.outcome }]);
    expect(heart.scene).not.toBe(arrival.scene);
    expect((await game.events.current("ann")).event).toEqual(heart);
    // The writer was told what had happened so far, and to carry on from it.
    expect(briefs[1]).toMatchObject({ stage: "heart", soFar: { scene: arrival.scene, choice: arrival.responses[0]!.text, reaction: reaction.outcome } });
    expect(briefs[1]!.person).toMatchObject({ returning: true, name: arrival.person.name });
    expect(game.store.listEvents("ann")[0]!.state).toBe("pending");
  });

  it("ends at the door if the player turns the person away", async () => {
    const { writer, briefs } = recordingWriter();
    const game = newGame(1, writer);
    await ready(game);
    const stakes = rules.stakes[game.store.listEvents("ann")[0]!.stakes as Stakes]!;
    const result = await game.events.respond("ann", "avoid");
    expect(result.next).toBeNull();
    expect(result.effects).toEqual({ gold: 0, rep: Math.round(rules.effects.avoid!.rep * stakes.scale), fondness: Math.round(rules.effects.avoid!.fondness * stakes.scale) });
    expect(game.store.listEvents("ann")[0]!).toMatchObject({ state: "resolved", chosen: "avoid" });
    expect(briefs).toHaveLength(1);
  });

  it("applies exactly what the final response type does, scaled by the stakes", async () => {
    const probe = newGame();
    await ready(probe);
    const offered = (await openUp(probe)).responses.map((response) => response.type);
    expect(offered.length).toBeGreaterThanOrEqual(2);
    for (const type of offered) {
      const game = newGame();
      await ready(game);
      await openUp(game);
      const stakes = rules.stakes[game.store.listEvents("ann")[0]!.stakes as Stakes]!;
      const gold = game.progress.getProgress("ann").gold;
      const result = await game.events.respond("ann", type);
      const profile = rules.effects[type]!;
      expect(result.next, type).toBeNull();
      expect(result.effects, type).toEqual({
        gold: Math.round(profile.gold * stakes.gold),
        rep: Math.round(profile.rep * stakes.scale),
        fondness: Math.round(profile.fondness * stakes.scale),
      });
      const after = game.progress.getProgress("ann");
      expect(after.gold - gold, type).toBe(result.effects.gold + result.rewards.gold);
      expect(after.rep, type).toBe(result.effects.rep);
      // Fondness is the small warmth from the first reaction, plus the final choice.
      expect(game.store.listPeople("ann")[0]!.fondness, type).toBe(1 + result.effects.fondness);
      expect(game.store.listEvents("ann")[0]!, type).toMatchObject({ state: "resolved", chosen: type });
    }
  });

  it("never lets a generous response cost more gold than the player has", async () => {
    const game = newGame();
    for (const id of ["light", "mud"]) game.store.addDiscovery("ann", id);
    game.dusk("ann");
    game.progress.settle("ann");
    game.store.addLedger("ann", -game.progress.getProgress("ann").gold, "shop", "test-drain");
    await game.events.current("ann");
    const heart = await openUp(game, "fair");
    if (heart.responses.some((response) => response.type === "generous")) {
      expect((await game.events.respond("ann", "generous")).effects.gold).toBe(0);
      expect(game.progress.getProgress("ann").gold).toBeGreaterThanOrEqual(0);
    }
  });

  it("refuses a response with nothing waiting, or one that was not offered", async () => {
    const game = newGame();
    await expect(game.events.respond("ann", "fair")).rejects.toThrow(/Nothing is waiting/);
    await ready(game);
    await expect(game.events.respond("ann", "sharp")).rejects.toThrow(/not one of the choices/);
    const heart = await openUp(game);
    const missing = RESPONSE_TYPES.find((type) => !heart.responses.some((response) => response.type === type))!;
    await expect(game.events.respond("ann", missing)).rejects.toThrow(/not one of the choices/);
  });
});

describe("answering the wrong beat", () => {
  it("is refused when the page says which beat it means, so a double click cannot skip ahead", async () => {
    const game = newGame();
    await game.events.test("ann", "small_thief");
    await expect(game.events.respond("ann", "generous", 2)).rejects.toThrow(/moment has passed/);
    const heart = (await game.events.respond("ann", "generous", 1)).next!;
    // The same click arriving twice is turned away instead of answering the second beat.
    await expect(game.events.respond("ann", "generous", 1)).rejects.toThrow(/moment has passed/);
    expect((await game.events.current("ann")).event!.beat).toBe(2);
    expect((await game.events.respond("ann", heart.responses[0]!.type, 2)).next).toBeNull();
  });
});

// A writer whose second beats wait until they are let through, to look at an event half-written.
function heldWriter() {
  const recording = recordingWriter();
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const writer: EventWriter = {
    ...recording.writer,
    write: async (brief) => {
      if (brief.stage === "heart") await held;
      return recording.writer.write(brief);
    },
  };
  return { ...recording, writer, release };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("an event written ahead", () => {
  // A player at dusk, whose visitor is still to be written, in a game that writes events the way
  // the server does.
  function due(writer: EventWriter, store?: ReturnType<typeof newGame>["store"]) {
    const game = newGame(1, writer, { writeAhead: true, store });
    if (!store) game.dusk("ann");
    return game;
  }

  it("stays out of sight until all of it is written, and asking for it never waits", async () => {
    const { writer, briefs, release } = heldWriter();
    const game = due(writer);
    expect(await game.events.current("ann")).toEqual({ event: null });
    while (game.store.listEvents("ann").length === 0) await tick();
    // The person has arrived on paper, but the player has not been told.
    expect(game.store.listEvents("ann")[0]!.state).toBe("writing");
    expect(await game.events.current("ann")).toEqual({ event: null });
    expect(game.progress.getProgress("ann").eventReady).toBe(false);
    await expect(game.events.respond("ann", "fair")).rejects.toThrow(/Nothing is waiting/);

    release();
    await game.events.idle("ann");
    expect(game.store.listEvents("ann")[0]!.state).toBe("pending");
    expect(game.progress.getProgress("ann").eventReady).toBe(true);
    expect(briefs.map((brief) => brief.stage)).toEqual(["arrival", "heart", "heart"]);
    expect(briefs.slice(1).map((brief) => brief.soFar!.choice).sort()).toEqual(["Be fair about it.", "Be generous about it."]);
  });

  it("is played through without the writer being asked for anything more", async () => {
    const { writer, briefs, questions, partings } = recordingWriter();
    const game = due(writer);
    game.events.prepare("ann");
    game.events.prepare("ann");
    await game.events.idle("ann");
    const written = [briefs.length, questions.length, partings.length];
    const arrival = (await game.events.current("ann")).event!;
    expect(arrival).toMatchObject({ beat: 1, beats: 2 });
    const heart = (await game.events.respond("ann", "fair")).next!;
    expect(heart.beat).toBe(2);
    expect((await game.events.respond("ann", heart.responses[0]!.type)).next).toBeNull();
    expect([briefs.length, questions.length, partings.length]).toEqual(written);
    expect(game.store.listEvents("ann")).toHaveLength(1);
    expect(game.store.listPeople("ann")[0]!.fondness).not.toBe(0);
  });

  it("is carried on from where it stopped if the writing was cut short", async () => {
    // The first server writes the arrival and stops before the second beats.
    const stuck = heldWriter();
    const first = due(stuck.writer);
    first.events.prepare("ann");
    while (first.store.listEvents("ann").length === 0) await tick();

    const { writer, briefs } = recordingWriter();
    const second = due(writer, first.store);
    expect(second.progress.getProgress("ann").eventReady).toBe(false);
    second.events.prepare("ann");
    await second.events.idle("ann");
    expect(briefs.map((brief) => brief.stage)).toEqual(["heart", "heart"]);
    expect(second.store.listEvents("ann")).toHaveLength(1);
    expect((await second.events.current("ann")).event!.id).toBe(first.store.listEvents("ann")[0]!.id);
  });

  it("still turns up if one second beat cannot be written, and that beat is written when chosen", async () => {
    const canned = createCannedEventWriter();
    let failing = true;
    const asked: string[] = [];
    const writer: EventWriter = {
      ...canned,
      write: async (brief) => {
        if (brief.stage === "heart") asked.push(brief.soFar!.choice);
        if (failing && brief.soFar?.choice === "Be generous about it.") throw new GenerationError("nothing worked");
        return canned.write(brief);
      },
    };
    const game = due(writer);
    game.events.prepare("ann");
    await game.events.idle("ann");
    // Tried twice, then left.
    expect(asked.filter((choice) => choice === "Be generous about it.")).toHaveLength(2);
    expect(game.progress.getProgress("ann").eventReady).toBe(true);
    failing = false;
    expect((await game.events.respond("ann", "generous")).next!.beat).toBe(2);
    expect(asked.filter((choice) => choice === "Be generous about it.")).toHaveLength(3);
  });

  it("does not start a second event while one is being written or waiting", async () => {
    const { writer, briefs } = recordingWriter();
    const game = due(writer);
    game.events.prepare("ann");
    await game.events.idle("ann");
    game.events.prepare("ann");
    await game.events.idle("ann");
    expect(briefs.filter((brief) => brief.stage === "arrival")).toHaveLength(1);
    // Nor once it is over, the same day. The next one is written the next morning.
    await game.events.respond("ann", "avoid");
    game.events.prepare("ann");
    await game.events.idle("ann");
    expect(briefs.filter((brief) => brief.stage === "arrival")).toHaveLength(1);
    game.day.end("ann");
    game.setDay("ann", { sun: 1 });
    game.events.prepare("ann");
    await game.events.idle("ann");
    expect(briefs.filter((brief) => brief.stage === "arrival")).toHaveLength(2);
    expect(game.store.listEvents("ann").map((event) => event.state)).toEqual(["resolved", "pending"]);
  });

  it("lets a test event appear as soon as it has arrived, with its second beats following behind", async () => {
    const { writer, briefs, release } = heldWriter();
    const game = newGame(1, writer, { writeAhead: true });
    const { event } = await game.events.test("ann", "small_thief");
    expect(event).toMatchObject({ beat: 1 });
    expect(briefs).toHaveLength(1);
    release();
    await game.events.idle("ann");
    const written = briefs.length;
    expect(briefs.filter((brief) => brief.stage === "heart").map((brief) => brief.soFar!.choice).sort()).toEqual(["Be fair about it.", "Be generous about it."]);
    const reaction = await game.events.respond("ann", "fair");
    expect(reaction.next).toMatchObject({ beat: 2 });
    // Nothing more had to be written when the player chose.
    expect(briefs).toHaveLength(written);
    expect(game.store.listPeople("ann")[0]!.fondness).toBe(1);
  });

  it("is reported by the routes only once it is waiting", async () => {
    const { writer, release } = heldWriter();
    const game = due(writer);
    const app = createApp(game.combiner, { progress: game.progress, shop: game.shop, day: game.day, events: game.events });
    // Loading the page is enough to start the writing.
    const loading = (await (await app.request("/api/players/ann")).json()) as Record<string, any>;
    expect(loading.progress.eventReady).toBe(false);
    expect(await (await app.request("/api/players/ann/event")).json()).toEqual({ event: null });
    release();
    await game.events.idle("ann");
    const ready = (await (await app.request("/api/players/ann")).json()) as Record<string, any>;
    expect(ready.progress.eventReady).toBe(true);
    const waiting = (await (await app.request("/api/players/ann/event")).json()) as Record<string, any>;
    expect(waiting.event).toMatchObject({ beat: 1, beats: 2 });
  });
});

describe("a writer that struggles", () => {
  it("still delivers what the person leaves behind, with a plain line, when it cannot name the thing", async () => {
    const canned = createCannedEventWriter();
    const writer: EventWriter = {
      ...canned,
      writeParting: async () => {
        throw new GenerationError("could not name the thing");
      },
    };
    for (let gameSeed = 1; gameSeed <= 40; gameSeed++) {
      const game = newGame(gameSeed, writer);
      for (const id of ["light", "mud", "life"]) game.store.addDiscovery("ann", id);
      await game.events.test("ann", "unhappy_someone");
      const heart = await openUp(game);
      const result = await game.events.respond("ann", heart.responses[0]!.type);
      const left = result.request?.entry ?? result.hint?.entry ?? (result.gift && { name: result.gift.name });
      if (!left) continue;
      expect(result.outcome).toContain(left.name);
      return;
    }
    throw new Error("no game left anything behind");
  });

  it("leaves the player's standing untouched if a beat cannot be written, so they can try again", async () => {
    const canned = createCannedEventWriter();
    let fail = false;
    const writer: EventWriter = {
      ...canned,
      write: async (brief) => {
        if (fail && brief.stage === "heart") throw new GenerationError("nothing worked");
        return canned.write(brief);
      },
    };
    const game = newGame(1, writer);
    await game.events.test("ann", "small_thief");
    fail = true;
    await expect(game.events.respond("ann", "generous")).rejects.toThrow(GenerationError);
    expect(game.store.listPeople("ann")[0]!.fondness).toBe(0);
    expect((await game.events.current("ann")).event!.beat).toBe(1);
    fail = false;
    expect((await game.events.respond("ann", "generous")).next!.beat).toBe(2);
    expect(game.store.listPeople("ann")[0]!.fondness).toBe(1);
  });
});

describe("what a person leaves behind", () => {
  it("is never something that makes no sense to hand over", async () => {
    const { writer, partings } = recordingWriter();
    for (let gameSeed = 1; gameSeed <= 25; gameSeed++) {
      const game = newGame(gameSeed, writer);
      for (const id of ["light", "mud", "life", "animal"]) game.store.addDiscovery("ann", id);
      await game.events.test("ann", "unhappy_someone");
      await openUp(game);
    }
    const named = partings.map((parting) => parting.name);
    expect(named.length).toBeGreaterThan(5);
    for (const name of ["Mind", "Sound", "Person", "Wilds", "Forge"]) expect(named).not.toContain(name);
  });

  // Plays test events until one plans the wanted kind of parting, and returns it at its second beat.
  async function untilPayoff(kind: "request" | "hint" | "gift") {
    for (let gameSeed = 1; gameSeed <= 60; gameSeed++) {
      const { writer, partings } = recordingWriter();
      const game = newGame(gameSeed, writer);
      for (const id of ["light", "mud", "life"]) game.store.addDiscovery("ann", id);
      await game.events.test("ann", "unhappy_someone");
      const heart = await openUp(game);
      const ask = partings[0];
      if (ask?.kind === kind) return { game, heart, ask, wanted: [...data.entries.values()].find((entry) => entry.name === ask.name)! };
    }
    throw new Error(`no game in sixty planned a ${kind}`);
  }
  const helpful = (heart: { responses: { type: ResponseType }[] }) => heart.responses.find((response) => ["generous", "skilled", "fair"].includes(response.type))!.type;

  it("is decided by code: something the player lacks and could reach", async () => {
    for (const kind of ["request", "hint", "gift"] as const) {
      const { game, wanted } = await untilPayoff(kind);
      expect(wanted.kind, kind).toBe("material");
      expect(game.combiner.listDiscovered("ann").map((entry) => entry.id), kind).not.toContain(wanted.id);
    }
  });

  it("can be a request, which opens a favor to fill", async () => {
    const { game, heart, wanted } = await untilPayoff("request");
    const result = await game.events.respond("ann", helpful(heart));
    expect(result.request).toMatchObject({ state: "open", entry: { id: wanted.id } });
    expect(result.outcome).toContain(wanted.name);
    expect(result).toMatchObject({ hint: null, gift: null, next: null });
    expect(game.progress.getProgress("ann").requests).toHaveLength(1);
  });

  it("can be a hint, which records what an unmade thing is made from", async () => {
    const { game, heart, ask, wanted } = await untilPayoff("hint");
    expect(ask.madeFrom).toBeTruthy();
    const result = await game.events.respond("ann", helpful(heart));
    expect(result.hint).toEqual({ entry: { id: wanted.id, name: wanted.name }, recipe: ask.madeFrom, from: heart.person.name });
    expect(result).toMatchObject({ request: null, gift: null });
    expect(game.progress.getProgress("ann").hints).toEqual([result.hint]);
    // The hint tells the truth: those two things really do make it.
    const recipe = [...data.combos.values()].find((item) => item.result === wanted.id)!;
    expect(result.hint!.recipe).toBe(recipe.inputs.map((id) => data.entries.get(id)!.name).join(" and "));
    expect(game.combiner.listDiscovered("ann").map((entry) => entry.id)).not.toContain(wanted.id);
  });

  it("can be a gift, which the player then has, with its XP but no discovery gold, and the sun stays put", async () => {
    const { game, heart, wanted } = await untilPayoff("gift");
    const before = { xp: game.progress.getProgress("ann").xp, sun: game.day.today("ann").sun };
    const result = await game.events.respond("ann", helpful(heart));
    expect(result.gift).toEqual({ id: wanted.id, name: wanted.name });
    expect(game.combiner.listDiscovered("ann").map((entry) => entry.id)).toContain(wanted.id);
    const questXp = result.rewards.quests.reduce((total, quest) => total + quest.xp, 0);
    expect(game.progress.getProgress("ann").xp).toBe(before.xp + wanted.xp + questXp);
    expect(game.store.getLedgerRefs("ann", "discovery")).not.toContain(wanted.id);
    expect(game.day.today("ann").sun).toBe(before.sun);
  });

  it("is dropped if the player came by the thing themselves before the visit ended", async () => {
    const { game, heart, wanted } = await untilPayoff("hint");
    game.store.addDiscovery("ann", wanted.id);
    const result = await game.events.respond("ann", helpful(heart));
    expect(result).toMatchObject({ request: null, hint: null, gift: null });
    expect(game.progress.getProgress("ann").hints).toEqual([]);
  });

  it("is withheld from a player who was sharp or walked away", async () => {
    const { game, heart } = await untilPayoff("gift");
    const unkind = heart.responses.find((response) => ["sharp", "avoid"].includes(response.type));
    if (!unkind) return;
    const result = await game.events.respond("ann", unkind.type);
    expect(result).toMatchObject({ request: null, hint: null, gift: null });
  });

  it("pays gold, standing, and fondness when a request is filled", () => {
    const { store, progress } = newGame();
    const friend = store.addPerson("ann", { name: "Pim Kettlebrook", role: "neighbor", traits: ["shy"], facts: [] }, 1);
    store.addRequest("ann", { personId: friend.id, eventId: 1, entryId: "glass", ask: "Could you bring me some Glass?", gold: 30 });
    progress.settle("ann");
    expect(progress.getProgress("ann").requests[0]).toMatchObject({ from: "Pim Kettlebrook", state: "open", gold: 30 });
    const before = { gold: progress.getProgress("ann").gold };

    store.addLedger("ann", 0, "shop", "glass");
    store.addDiscovery("ann", "glass");
    const rewards = progress.settle("ann");
    expect(rewards.quests).toContainEqual({ id: "request-1", title: "A favor for Pim Kettlebrook", gold: 30, xp: 0 });
    const after = progress.getProgress("ann");
    expect(after.requests[0]!.state).toBe("done");
    expect(after.gold - before.gold).toBe(30 + rewards.quests.filter((quest) => quest.id !== "request-1").reduce((sum, quest) => sum + quest.gold, 0));
    expect(after.rep).toBe(rules.request.rep);
    expect(store.listPeople("ann")[0]!.fondness).toBe(rules.request.fondness);
    expect(progress.settle("ann")).toEqual({ gold: 0, quests: [] });
  });
});

describe("a spell that solves the event", () => {
  // Plays events for a player who has learned the given spells, and returns every second beat seen.
  async function eventsFor(learned: string[], rounds = 12) {
    const { writer, questions } = recordingWriter();
    const game = newGame(5, writer);
    for (const id of ["light", "mud", "life", "tree", "spellbook", ...learned]) game.store.addDiscovery("ann", id);
    for (const id of learned) game.store.addLearned("ann", id);
    const seen = [];
    for (let round = 0; round < rounds; round++) {
      game.dusk("ann");
      await game.events.current("ann");
      const heart = await openUp(game, "fair");
      seen.push({ event: heart, stored: game.store.listEvents("ann").at(-1)! });
      if (round < rounds - 1) await game.events.respond("ann", heart.responses.at(-1)!.type);
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
      const result = await game.events.respond("ann", "skilled");
      expect(result.effects.gold).toBe(0);
      expect(result.effects.rep).toBeGreaterThan(0);
      expect(result.outcome).toContain("Mending");
    }
  });

  it("is only looked for once the person has said what is wrong", async () => {
    const { writer, questions } = recordingWriter();
    const game = newGame(5, writer);
    for (const id of ["light", "mud", "life", "tree", "spellbook", "spell-mending"]) game.store.addDiscovery("ann", id);
    game.store.addLearned("ann", "spell-mending");
    const arrival = (await game.events.test("ann", "not_my_mess")).event!;
    expect(questions).toHaveLength(0);
    expect(arrival.responses.every((response) => !response.spell)).toBe(true);
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

  // Plays one test event of the given seed to its second beat, with the spell look always on, and
  // returns the spells put to the writer.
  async function spellsAskedAbout(seedId: string, learned: string[]) {
    const { writer, questions } = recordingWriter();
    const game = newGame(1, writer);
    for (const id of ["light", "mud", "life", "tree", "spellbook", ...learned]) game.store.addDiscovery("ann", id);
    for (const id of learned) game.store.addLearned("ann", id);
    // Level two, so that a first-tier spell is one the player can cast.
    game.store.changeStats("ann", { bonusXp: xpToReach(2, data.balance) });
    const always = createEvents({ data, store: game.store, progress: game.progress, day: game.day, listDiscovered: game.combiner.listDiscovered, writer, random: () => 0.1 });
    await always.test("ann", seedId);
    await always.respond("ann", "fair");
    return questions.flatMap((question) => question.spells.map((spell) => spell.id));
  }

  it("only puts forward spells whose tags fit the kind of event", async () => {
    const known = ["spell-mending", "spell-fire-bolt", "spell-detect-magic"];
    // A mess wants something practical. An inspection wants something that shows the truth.
    expect(await spellsAskedAbout("not_my_mess", known)).toEqual(["spell-mending"]);
    expect(await spellsAskedAbout("the_official", known)).toEqual(["spell-detect-magic"]);
    // Nothing needs solving when two people simply meet.
    expect(await spellsAskedAbout("meet_cute", known)).toEqual([]);
    // A damage spell fits no seed at all.
    for (const seedItem of data.eventSeeds) expect(await spellsAskedAbout(seedItem.id, ["spell-fire-bolt"]), seedItem.id).toEqual([]);
  });

  it("tags the everyday spells as practical and the will-bending ones as control", () => {
    for (const id of ["mending", "prestidigitation", "light", "mage-hand"]) expect(data.spells.get(id)!.tags, id).toContain("utility");
    for (const id of ["sleep", "hold-person", "charm-person", "command"]) expect(data.spells.get(id)!.tags, id).toContain("control");
    expect(rules.spellCheck.blockedTags).toContain("control");
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
    game.progress.chooseJob("ann", "blacksmith");
    for (let round = 0; round < 40; round++) {
      game.dusk("ann");
      await game.events.current("ann");
      const heart = await openUp(game);
      await game.events.respond("ann", heart.responses[0]!.type);
    }
    const arrivals = briefs.filter((brief) => brief.stage === "arrival");
    expect(arrivals).toHaveLength(40);
    const returning = arrivals.filter((brief) => brief.person.returning);
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
    expect(events.every((event) => event.state === "resolved")).toBe(true);
    const repeatsInARow = events.filter((event, index) => event.seedId !== "repeat" && event.seedId === events[index - 1]?.seedId);
    expect(repeatsInARow.length).toBeLessThan(4);
  });
});

describe("checking what the writer wrote", () => {
  const brief: EventBrief = {
    stage: "heart",
    soFar: { scene: "Pim came in looking worried.", choice: "Ask what is wrong.", reaction: "Pim took a breath." },
    seed: { premise: "A small animal takes something", kind: "comic", mood: ["silly"] },
    stakes: "S",
    player: { job: "Blacksmith", topTags: ["metal"], repBand: "Fine" },
    person: { returning: false },
    recent: [],
    responseTypes: ["generous", "fair", "avoid"],
    takenNames: ["Odessa Tuck"],
  };
  const good: WrittenEvent = {
    scene: "A goose has your hammer. It is not giving it back.",
    sceneSummary: "A goose took the hammer.",
    person: { name: "Pim Kettlebrook", pronoun: "they", role: "neighbor", traits: ["shy"], facts: ["owns the goose"] },
    responses: [
      { type: "generous", text: "Offer the goose a bun.", outcome: "The goose accepts." },
      { type: "fair", text: "Ask nicely.", outcome: "The goose considers it." },
      { type: "avoid", text: "Leave it.", outcome: "You buy another hammer." },
    ],
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
    expect(checkWritten(brief, { ...good, person: { ...good.person!, name: "Milo" } })).toMatch(/first name and a last name/);
    expect(checkWritten(brief, { ...good, person: { ...good.person!, name: "Auntie Wren" } })).toBeNull();
    expect(checkWritten(brief, { ...good, person: { ...good.person!, name: "Odessa Tuck" } })).toMatch(/already knows someone/);
    const returning: EventBrief = { ...brief, person: { returning: true, name: "Odessa Tuck", role: "baker", traits: [], facts: [], feeling: "fond", followUp: null, history: [] } };
    expect(checkWritten(returning, good)).toMatch(/already known/);
    expect(checkWritten(returning, { ...good, person: null })).toBeNull();
  });

  it("rejects numbers, game terms, blocked names, and copied sample lines", () => {
    expect(checkWritten(brief, withResponse(0, { outcome: "It costs you 5 coins." }))).toMatch(/digits/);
    expect(checkWritten(brief, { ...good, scene: "That is worth a good deal of XP." })).toMatch(/game term/);
    // Ordinary words that happen to be the names of scores are fine in a story.
    expect(checkWritten(brief, { ...good, scene: "She speaks of you with real fondness, and your reputation precedes you." })).toBeNull();
    expect(checkWritten(brief, { ...good, scene: "Velica has your hammer." }, { blocklist: createBlocklist(["Velica"]) })).toMatch(/not available/);
    expect(checkWritten(brief, good, { voiceCheck: (text) => (text.includes("goose has your hammer") ? "copied" : null) })).toBe("copied");
  });

  it("rejects a response told as 'I', which is the player's to do, not the writer's", () => {
    expect(checkWritten(brief, withResponse(0, { text: "I offer the goose a bun." }))).toMatch(/Never 'I offer/);
    expect(checkWritten(brief, withResponse(0, { text: "I'll fetch a bun for the goose." }))).toMatch(/Never 'I offer/);
    expect(checkWritten(brief, withResponse(0, { text: "You offer the goose a bun." }))).toBeNull();
    expect(checkWritten(brief, withResponse(0, { text: "Ignore the goose and say, 'I am busy.'" }))).toBeNull();
    const question: SpellQuestion = { scene: "A cup lies in pieces.", personName: "Pim", spells: [{ id: "spell-mending", name: "Mending", school: "Transmutation", tags: ["utility"] }] };
    expect(checkSpellAnswer(question, { spellId: "spell-mending", text: "I cast Mending on the cup.", outcome: "Good as new." })).toMatch(/Never 'I offer/);
  });

  it("rejects a line that stops mid-sentence, and leaves the model room to finish", async () => {
    expect(checkWritten(brief, withResponse(0, { text: "You gently coax the goose down and even offer to r" }))).toMatch(/middle of a sentence/);
    expect(checkWritten(brief, { ...good, scene: "A goose has your hammer and it is" })).toMatch(/middle of a sentence/);
    expect(checkWritten(brief, withResponse(0, { outcome: "The goose says, 'Thank you.'" }))).toBeNull();
    // The limits sent to the model are well above what a line needs, so they never cut one short.
    const client = createFakeClient([JSON.stringify(good)]);
    await createModelEventWriter({ client, log: () => {}, voice: "v" }).write(brief);
    const limits = [...JSON.stringify(client.requests[0]!.jsonSchema).matchAll(/"maxLength":(\d+)/g)].map((match) => Number(match[1]));
    expect(Math.min(...limits.filter((limit) => limit > 100))).toBeGreaterThanOrEqual(240);
  });

  it("tells the writer which part of the conversation it is writing", () => {
    const arrival = renderBrief({ ...brief, stage: "arrival", soFar: null });
    expect(arrival).toContain("Write only the arrival");
    expect(arrival).toContain("Do not explain the problem yet");
    expect(arrival).toContain("no response mentions the problem");
    const heart = renderBrief(brief);
    expect(heart).toContain("Pim came in looking worried.");
    expect(heart).toContain("What the player did: Ask what is wrong.");
    expect(heart).toContain("says what they are really after");
    // The second part is held to the premise, so it cannot wander off to a different problem.
    expect(heart).toContain("What comes out must be the premise itself: A small animal takes something.");
    expect(arrival).not.toContain("must be the premise itself");
  });

  it("fixes a new person's pronoun, and tells the writer to keep to it when they are written again", async () => {
    const client = createFakeClient([JSON.stringify({ ...good, person: { ...good.person!, pronoun: "she" } })]);
    const written = await createModelEventWriter({ client, log: () => {}, voice: "v" }).write(brief);
    expect(written.person!.pronoun).toBe("she");
    expect(JSON.stringify(client.requests[0]!.jsonSchema)).toContain('"she","he","they"');
    const known: EventBrief = { ...brief, person: { returning: true, name: "Pim Kettlebrook", pronoun: "she", role: "neighbor", traits: [], facts: [], feeling: "fond", followUp: null, history: [] } };
    expect(renderBrief(known)).toContain('Always refer to them as "she".');
    expect(renderBrief({ ...known, person: { ...known.person, pronoun: null } as EventBrief["person"] })).not.toContain("Always refer");
  });

  it("carries a person's pronoun from the arrival into the second beat", async () => {
    const { writer, briefs } = recordingWriter();
    const game = newGame(1, writer);
    await game.events.test("ann", "small_thief");
    expect(game.store.listPeople("ann")[0]!.pronoun).toBe("they");
    await game.events.respond("ann", "fair");
    expect(briefs[1]!.person).toMatchObject({ returning: true, pronoun: "they" });
  });

  it("is never told a number", () => {
    const returning: EventBrief = { ...brief, stakes: "L", recent: ["A goose took the hammer."], person: { returning: true, name: "Odessa Tuck", role: "baker", traits: ["fussy"], facts: ["has a cat"], feeling: "fond of the player", followUp: "to say thank you", history: ["She came by."] } };
    for (const text of [renderBrief(brief), renderBrief(returning), renderBrief({ ...brief, stage: "arrival", soFar: null })]) expect(text).not.toMatch(/[0-9]/);
    expect(renderBrief(returning)).toContain("Known facts, which must not change: has a cat.");
  });

  it("lets the schema decide whether a person is invented", async () => {
    const schemaFor = async (b: EventBrief, written: WrittenEvent) => {
      const client = createFakeClient([JSON.stringify(written)]);
      await createModelEventWriter({ client, log: () => {}, voice: "v" }).write(b);
      return (client.requests[0]!.jsonSchema as { properties: Record<string, { type?: string }> }).properties;
    };
    const known: EventBrief = { ...brief, person: { returning: true, name: "Odessa Tuck", role: "baker", traits: [], facts: [], feeling: "fond", followUp: null, history: [] } };
    expect((await schemaFor(known, { ...good, person: null })).person!.type).toBe("null");
    expect((await schemaFor(brief, good)).person!.type).toBe("object");
  });

  it("rerolls the model until the event passes", async () => {
    const client = createFakeClient([JSON.stringify(withResponse(0, { outcome: "It costs 5 coins." })), JSON.stringify(good)]);
    const writer = createModelEventWriter({ client, log: () => {}, voice: "v" });
    expect((await writer.write(brief)).person!.name).toBe("Pim Kettlebrook");
    expect(client.requests[1]!.prompt).toContain("Do not use digits");
  });
});

describe("the parting line", () => {
  const question: PartingQuestion = { kind: "hint", name: "Glass", madeFrom: "Sand and Fire", person: { name: "Pim Kettlebrook", role: "neighbor", traits: ["shy"] }, ending: "Pim felt better." };

  it("must name the thing, finish its sentence, and keep to the rules", () => {
    expect(checkParting(question, 'Pim smiles. "Glass is only sand and fire, you know."')).toBeNull();
    expect(checkParting(question, 'Pim smiles. "It is only sand and fire, you know."')).toMatch(/exact word "Glass"/);
    expect(checkParting(question, "Pim mentions that Glass comes from")).toMatch(/middle of a sentence/);
    expect(checkParting(question, "Glass takes 2 things.")).toMatch(/digits/);
    expect(checkParting(question, "Velica sells Glass.", createBlocklist(["Velica"]))).toMatch(/not available/);
  });

  it("has a plain version for each kind that always passes", () => {
    for (const kind of ["request", "hint", "gift"] as const) {
      const line = plainParting({ ...question, kind });
      expect(checkParting({ ...question, kind }, line), kind).toBeNull();
      expect(line, kind).toContain("Pim Kettlebrook");
    }
    expect(plainParting(question)).toContain("Glass comes from Sand and Fire");
  });

  it("is written by the model on its own, and rerolled until it names the thing", async () => {
    const client = createFakeClient([JSON.stringify({ line: "Pim waves goodbye." }), JSON.stringify({ line: 'Pim waves. "Glass is just sand and fire."' })]);
    const writer = createModelEventWriter({ client, log: () => {}, voice: "v" });
    expect(await writer.writeParting(question)).toContain("Glass");
    expect(client.requests[0]!.prompt).toContain("The exact name to use: Glass");
    expect(client.requests[1]!.prompt).toContain('exact word "Glass"');
  });
});

describe("a test event", () => {
  it("is written at once, at any time of day, and costs no candle", async () => {
    const game = newGame();
    const { event, seed } = await game.events.test("ann");
    expect(event).toMatchObject({ beat: 1, beats: 2 });
    expect(data.eventSeeds.map((item) => item.id)).toContain(seed);
    expect(game.progress.getProgress("ann")).toMatchObject({ eventReady: true, day: { phase: "morning" } });
    // It is in sight in the morning, which the day's own visitor never is.
    expect((await game.events.current("ann")).event).toMatchObject({ id: event!.id });
    // It is a real event: it can be played through to the end.
    const heart = await openUp(game);
    const result = await game.events.respond("ann", heart.responses[0]!.type);
    expect(result.outcome).toBeTruthy();
    expect(result).toMatchObject({ night: null, dusk: null });
    expect(game.store.listEvents("ann")[0]!.state).toBe("resolved");
    // And it is not the day's visitor: tonight's is still to come, and no candle has gone.
    expect(game.store.getDay("ann")).toMatchObject({ visitorDay: 0, state: { spent: 0 } });
    game.setDay("ann", { sun: DUSK });
    expect(game.progress.getProgress("ann").day!.candles).toBe(3);
  });

  it("uses the seed asked for, even one the player would not normally qualify for", async () => {
    const game = newGame();
    const { seed, event } = await game.events.test("ann", "grand_guest");
    expect(seed).toBe("grand_guest");
    expect(event!.kind).toBe("social");
    expect(game.store.listEvents("ann")[0]!.seedId).toBe("grand_guest");
    // The second beat offers what that seed allows.
    const heart = await openUp(game);
    expect(heart.responses.map((response) => response.type)).toEqual(["generous", "fair", "sharp"]);
  });

  it("replaces an event that was still waiting, at either beat, and the person it introduced", async () => {
    const game = newGame();
    const first = (await game.events.test("ann", "small_thief")).event!;
    await openUp(game);
    const second = (await game.events.test("ann", "not_my_mess")).event!;
    expect(second.id).not.toBe(first.id);
    expect(second.beat).toBe(1);
    expect(game.store.listEvents("ann")).toHaveLength(1);
    expect(game.store.listPeople("ann")).toHaveLength(1);
    expect((await game.events.current("ann")).event!.id).toBe(second.id);
  });

  it("can bring someone back, once the player has met someone", async () => {
    const game = newGame();
    await expect(game.events.test("ann", "repeat")).rejects.toThrow(/has not met anyone/);
    const first = (await game.events.test("ann", "small_thief")).event!;
    const heart = await openUp(game);
    await game.events.respond("ann", heart.responses[0]!.type);
    const again = await game.events.test("ann", "repeat");
    expect(again.seed).toBe("repeat");
    expect(again.event!.person).toMatchObject({ name: first.person.name, returning: true });
  });

  it("refuses a seed that does not exist", async () => {
    await expect(newGame().events.test("ann", "dragon_attack")).rejects.toThrow(/no event seed "dragon_attack"/);
  });
});

describe("the event routes", () => {
  const post = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("hold the visitor until dusk, serve them, and play the visit through both beats for a candle", async () => {
    const game = newGame();
    const app = createApp(game.combiner, { progress: game.progress, shop: game.shop, day: game.day, events: game.events });
    expect(await (await app.request("/api/players/ann/event")).json()).toEqual({ event: null });
    const player = (await (await app.request("/api/players/ann")).json()) as Record<string, any>;
    expect(player.progress).toMatchObject({ rep: 0, repBand: "Fine", requests: [], hints: [], eventReady: false, eventIn: 0, day: { number: 1, phase: "morning" } });
    game.setDay("ann", { sun: 1 });
    expect(await (await app.request("/api/players/ann/event")).json()).toEqual({ event: null });
    const early = await app.request("/api/players/ann/event/respond", post({ type: "fair" }));
    expect(early.status).toBe(400);
    expect(await early.json()).toMatchObject({ code: "not-evening" });

    game.setDay("ann", { sun: DUSK });
    const waiting = (await (await app.request("/api/players/ann/event")).json()) as Record<string, any>;
    expect(waiting.event).toMatchObject({ beat: 1, beats: 2 });
    expect(JSON.stringify(waiting)).not.toContain("outcome");

    const reaction = (await (await app.request("/api/players/ann/event/respond", post({ type: "fair" }))).json()) as Record<string, any>;
    expect(reaction).toMatchObject({ outcome: expect.any(String), next: { beat: 2 }, night: null, progress: { eventReady: true, day: { candles: 3 } } });
    const type = reaction.next.responses[0].type;
    const resolved = (await (await app.request("/api/players/ann/event/respond", post({ type }))).json()) as Record<string, any>;
    expect(resolved).toMatchObject({ outcome: expect.any(String), effects: expect.any(Object), next: null, night: null, progress: { eventReady: false, day: { candles: 2 } } });
    expect((await app.request("/api/players/ann/event/respond", post({ type }))).status).toBe(400);
    expect((await app.request("/api/players/ann/event/respond", post({ type: "heroic" }))).status).toBe(400);
  });

  it("write a test event on request, with or without a seed", async () => {
    const game = newGame();
    const app = createApp(game.combiner, { progress: game.progress, shop: game.shop, day: game.day, events: game.events });
    const any = (await (await app.request("/api/players/ann/event/test", { method: "POST" })).json()) as Record<string, any>;
    expect(any.event.responses.length).toBeGreaterThanOrEqual(2);
    const chosen = (await (await app.request("/api/players/ann/event/test", post({ seed: "the_official" }))).json()) as Record<string, any>;
    expect(chosen).toMatchObject({ seed: "the_official", event: { kind: "bureaucracy" } });
    const bad = await app.request("/api/players/ann/event/test", post({ seed: "nope" }));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as Record<string, any>).error).toContain("small_thief");
  });
});
