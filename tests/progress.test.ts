import { describe, expect, it } from "vitest";
import { levelFor } from "../src/server/progress";
import { data, newGame, TO_FIRE_BOLT } from "./helpers";

describe("levels", () => {
  it("take more XP each time and stop at the cap", () => {
    expect(levelFor(0, data.balance)).toEqual({ level: 1, into: 0, span: 100 });
    expect(levelFor(99, data.balance).level).toBe(1);
    expect(levelFor(100, data.balance)).toEqual({ level: 2, into: 0, span: 200 });
    expect(levelFor(350, data.balance)).toEqual({ level: 3, into: 50, span: 300 });
    expect(levelFor(1_000_000, data.balance).level).toBe(data.balance.levels.cap);
  });
});

describe("progress", () => {
  it("starts a new player with nothing, and the first quest active", () => {
    const { progress } = newGame();
    const state = progress.getProgress("ann");
    expect(state).toMatchObject({ xp: 0, level: 1, gold: 0, learned: [] });
    expect(state.quests.map((quest) => quest.state)).toEqual(["active", ...Array(6).fill("upcoming")]);
  });

  it("pays XP, a little gold, and a quest for the first discovery, exactly once", async () => {
    const { progress, play } = newGame();
    await play("ann", [["fire", "air"]]);
    expect(progress.settle("ann")).toEqual({ gold: 6, quests: [{ id: "first-combine", title: "Combine two elements", gold: 5 }] });
    expect(progress.settle("ann")).toEqual({ gold: 0, quests: [] });
    await play("ann", [["fire", "air"]]);
    expect(progress.getProgress("ann")).toMatchObject({ xp: data.entries.get("light")!.xp, gold: 6 });
  });

  it("pays more gold for a deeper discovery", async () => {
    const { progress, play } = newGame();
    await play("ann", TO_FIRE_BOLT.slice(0, 3));
    progress.settle("ann");
    await play("ann", [["earth", "life"]]);
    const tree = data.entries.get("tree")!;
    expect(tree.tier).toBeGreaterThan(data.entries.get("mud")!.tier);
    expect(progress.settle("ann")).toEqual({ gold: data.balance.discoveryGoldByTier[tree.tier], quests: [] });
  });

  it("marks quests done in order as the player meets them", async () => {
    const { progress, play } = newGame();
    await play("ann", TO_FIRE_BOLT);
    const states = Object.fromEntries(progress.getProgress("ann").quests.map((quest) => [quest.id, quest.state]));
    expect(states).toMatchObject({ "first-combine": "done", "first-focus": "done", "first-cantrip": "done", "first-learned": "active", component: "upcoming" });
    // Sand is a reagent: a component for a higher spell.
    await play("ann", [["earth", "air"]]);
    expect(progress.getProgress("ann").quests.find((quest) => quest.id === "component")!.state).toBe("done");
  });

  it("credits a player from before gold existed, once", () => {
    const { progress, store } = newGame();
    for (const id of ["light", "mud", "life"]) store.addDiscovery("old-timer", id);
    const first = progress.getProgress("old-timer").gold;
    expect(first).toBe(3 + 5);
    expect(progress.getProgress("old-timer").gold).toBe(first);
  });
});

describe("learning a spell", () => {
  it("costs gold by tier, completes the learning quest, and is remembered", async () => {
    const { progress, play } = newGame();
    await play("ann", TO_FIRE_BOLT);
    const before = progress.getProgress("ann").gold;
    const { spell, cost, rewards } = progress.learn("ann", "spell-fire-bolt");
    expect(spell.name).toBe("Fire Bolt");
    expect(cost).toBe(10);
    expect(rewards.quests.map((quest) => quest.id)).toEqual(["first-learned"]);
    expect(progress.getProgress("ann")).toMatchObject({ gold: before - cost + 20, learned: ["spell-fire-bolt"] });
  });

  it("puts the price on every spell entry, so it can be shown before learning", async () => {
    const { combiner, play } = newGame();
    expect(data.entries.get("spell-fire-bolt")!.learnCost).toBe(10);
    expect(data.entries.get("spell-fireball")!.learnCost).toBe(40);
    expect(data.entries.get("mud")!.learnCost).toBeUndefined();
    await play("ann", TO_FIRE_BOLT.slice(0, 6));
    expect((await combiner.combine("ann", "evocation", "fire")).entry).toMatchObject({ id: "spell-fire-bolt", learnCost: 10 });
    expect(combiner.listDiscovered("ann").find((entry) => entry.kind === "spell")!.learnCost).toBe(10);
  });

  it("is refused for an unknown spell, a spell already known, or too little gold", async () => {
    const { progress, play, store } = newGame();
    await play("ann", TO_FIRE_BOLT);
    expect(() => progress.learn("ann", "spell-fireball")).toThrow(/only learn a spell you have discovered/);
    expect(() => progress.learn("ann", "light")).toThrow(/only learn a spell/);
    progress.learn("ann", "spell-fire-bolt");
    expect(() => progress.learn("ann", "spell-fire-bolt")).toThrow(/already know Fire Bolt/);

    await play("bob", TO_FIRE_BOLT);
    store.addLedger("bob", -progress.getProgress("bob").gold, "shop", "test-drain");
    expect(() => progress.learn("bob", "spell-fire-bolt")).toThrowError(expect.objectContaining({ code: "not-enough-gold" }));
    expect(progress.getProgress("bob").learned).toEqual([]);
  });

  it("needs a focus, even for a spell that was bought", () => {
    const { progress, store } = newGame();
    store.addDiscovery("ann", "spell-fire-bolt");
    expect(() => progress.learn("ann", "spell-fire-bolt")).toThrowError(expect.objectContaining({ code: "no-focus" }));
  });
});
