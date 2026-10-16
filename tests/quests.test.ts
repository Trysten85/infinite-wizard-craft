import { describe, expect, it } from "vitest";
import { buildGameData, readGameFiles, xpForTier } from "../src/server/gameData";
import { xpToReach } from "../src/server/progress";
import type { Store } from "../src/server/store";
import type { GameEntry, Quest } from "../src/shared/schema";
import { data, newGame, TO_FIRE_BOLT } from "./helpers";

const { xpStep, cap } = data.balance.levels;
const levels = Array.from({ length: cap }, (_, index) => index + 1);

// Puts a player at a level without playing them there.
function raiseTo(store: Store, player: string, level: number) {
  store.changeStats(player, { bonusXp: xpToReach(level, data.balance) });
}

// A thing the model made, saved the way the combiner saves one.
function saveMade(store: Store, id: string, extra: Partial<GameEntry> = {}): GameEntry {
  const entry: GameEntry = { id, name: id, kind: "material", description: "x", tags: [], affinity: [], tier: 1, source: "generated", depth: 2, xp: 15, ...extra };
  store.saveGenerated(`fire+${id}`, "fire", id, entry);
  return entry;
}

describe("the quest list", () => {
  it("has forty-six quests, twenty-six of them main, spread over every level", () => {
    expect(data.quests).toHaveLength(46);
    expect(data.quests.filter((quest) => quest.track === "main")).toHaveLength(26);
    expect(data.quests.filter((quest) => quest.track === "side")).toHaveLength(20);
    for (const level of levels) expect(data.quests.filter((quest) => quest.level === level).length, `level ${level}`).toBeGreaterThanOrEqual(5);
  });

  it("keeps the ids of the first tutorial quests, so a quest already paid stays paid", () => {
    const ids = data.quests.map((quest) => quest.id);
    for (const id of ["first-combine", "first-focus", "first-cantrip", "first-learned", "level-two", "component", "first-job"]) expect(ids).toContain(id);
  });

  it("pays about two fifths of the XP each level takes", () => {
    for (const level of levels.slice(0, -1)) {
      const fromQuests = data.quests.filter((quest) => quest.level === level).reduce((total, quest) => total + quest.xp, 0);
      const share = fromQuests / (level * xpStep);
      expect(share, `level ${level}`).toBeGreaterThanOrEqual(0.35);
      expect(share, `level ${level}`).toBeLessThanOrEqual(0.45);
    }
  });

  it("pays no XP for reaching a level, and asks for the level after the one the quest opens at", () => {
    const reach = data.quests.filter((quest) => quest.done.type === "level");
    expect(reach.map((quest) => quest.level)).toEqual(levels.slice(0, -1));
    for (const quest of reach) {
      expect(quest).toMatchObject({ track: "main", xp: 0, done: { level: quest.level + 1 } });
      // It is the last main quest of its level, so the chain always has something to work on.
      expect(data.quests.filter((item) => item.track === "main" && item.level === quest.level).at(-1)!.id).toBe(quest.id);
    }
  });

  it("lists the main quests in the order their levels come", () => {
    const main = data.quests.filter((quest) => quest.track === "main").map((quest) => quest.level);
    expect(main).toEqual([...main].sort((a, b) => a - b));
  });

  it("only touches events by counting them", () => {
    const eventQuests = data.quests.filter((quest) => quest.done.type === "events");
    expect(eventQuests.every((quest) => quest.track === "side")).toBe(true);
    expect(eventQuests.length).toBeLessThanOrEqual(3);
  });

  it("puts each learn-a-tier quest at the level that tier can be learned", () => {
    for (const quest of data.quests) {
      if (quest.done.type === "learned-tier") expect(quest.level, quest.id).toBe(data.balance.spellLevelByTier[quest.done.tier]);
    }
  });
});

describe("quest data that asks too much", () => {
  const files = readGameFiles(process.cwd());
  const withQuest = (change: Partial<Quest>) => () => buildGameData({ ...files, quests: [{ ...files.quests[0]!, id: "extra", ...change }] });

  it("is refused for more of a kind than the game holds", () => {
    expect(withQuest({ done: { type: "kind-count", kind: "school", count: 9 } })).toThrow(/asks for 9 of kind "school", and the game has 8/);
    expect(withQuest({ done: { type: "kind-count", kind: "job", count: 1, tier: 9 } })).toThrow(/kind "job"/);
    expect(withQuest({ done: { type: "kind-count", kind: "material", count: 5000 } })).not.toThrow();
  });

  it("is refused for a spell tier, a tag, or a level the game does not have", () => {
    expect(withQuest({ done: { type: "learned-tier", tier: 4 } })).toThrow(/tier 4 spell, and none is in play/);
    expect(withQuest({ done: { type: "tag-count", tag: "nonsense", count: 2 } })).toThrow(/unknown tag "nonsense"/);
    expect(withQuest({ level: cap + 1 })).toThrow(/past the cap/);
    expect(withQuest({ done: { type: "level", level: cap + 1 } })).toThrow(/past the cap/);
  });

  it("is refused for an id used twice", () => {
    expect(() => buildGameData({ ...files, quests: [files.quests[0]!, files.quests[0]!] })).toThrow(/duplicate quest id/);
  });
});

describe("a quest's level", () => {
  it("holds its pay back until the player gets there, then pays for what was already done", async () => {
    const { progress, play, store } = newGame();
    // Sand is a reagent: a component for a higher spell. That quest opens at level two.
    await play("ann", [["earth", "air"]]);
    const early = progress.getProgress("ann");
    expect(early.quests.find((quest) => quest.id === "component")).toMatchObject({ state: "locked", level: 2 });

    raiseTo(store, "ann", 2);
    const rewards = progress.settle("ann");
    expect(rewards.quests.map((quest) => quest.id)).toEqual(["level-two", "component"]);
    expect(progress.getProgress("ann").quests.find((quest) => quest.id === "component")!.state).toBe("done");
  });

  it("can be reached by a quest's own XP, which opens the next quests in the same breath", async () => {
    const { progress, play, store } = newGame();
    await play("ann", [["earth", "air"]]);
    progress.settle("ann");
    const light = data.entries.get("light")!;
    const newElement = data.quests.find((quest) => quest.id === "new-element")!;
    // Exactly one new element short of level two.
    store.changeStats("ann", { bonusXp: xpStep - progress.getProgress("ann").xp - light.xp - newElement.xp });
    await play("ann", [["fire", "air"]]);
    expect(progress.settle("ann").quests.map((quest) => quest.id)).toEqual(["new-element", "level-two", "component"]);
    expect(progress.getProgress("ann")).toMatchObject({ level: 2, levelInto: data.quests.find((quest) => quest.id === "component")!.xp });
  });
});

describe("quest progress", () => {
  it("counts quest XP toward the level, alongside discoveries", async () => {
    const { progress, play } = newGame();
    await play("ann", TO_FIRE_BOLT);
    const state = progress.getProgress("ann");
    const made = ["light", "mud", "life", "tree", "spellbook", "evocation", "spell-fire-bolt"];
    const fromDiscoveries = made.reduce((total, id) => total + data.entries.get(id)!.xp, 0);
    const fromQuests = state.quests.filter((quest) => quest.state === "done").reduce((total, quest) => total + quest.xp, 0);
    expect(fromQuests).toBeGreaterThan(0);
    expect(state.xp).toBe(fromDiscoveries + fromQuests);
  });

  it("shows how far along a quest that counts something is", async () => {
    const { progress, play } = newGame();
    await play("ann", TO_FIRE_BOLT);
    const quests = Object.fromEntries(progress.getProgress("ann").quests.map((quest) => [quest.id, quest]));
    expect(quests["fifteen-things"]!.progress).toEqual({ have: 7, need: 15 });
    expect(quests["first-learned"]!.progress).toBeUndefined();
    expect(quests["level-two"]!.progress).toBeUndefined();
    // A locked quest still counts what the player has done toward it.
    expect(quests["three-schools"]).toMatchObject({ state: "locked", progress: { have: 1, need: 3 } });
  });

  it("can finish every quest", () => {
    const { progress, store } = newGame();
    for (const entry of data.entries.values()) store.addDiscovery("ann", entry.id);
    for (const entry of data.entries.values()) if (entry.kind === "spell") store.addLearned("ann", entry.id);
    for (let index = 0; index < 250; index++) store.addDiscovery("ann", saveMade(store, `thing-${index}`, { depth: 10, tier: 5 }).id);
    for (let index = 0; index < 15; index++) {
      const id = store.addEvent("ann", { day: index + 1, seedId: "meet_cute", kind: "social", mood: ["warm"], personId: 1, stakes: "S", payload: {}, sceneSummary: "x" });
      store.resolveEvent(id, "fair", {}, "x");
    }
    for (let index = 0; index < 5; index++) store.addLedger("ann", 0, "shop", `bought-${index}`);
    raiseTo(store, "ann", cap);
    const open = progress.getProgress("ann").quests.filter((quest) => quest.state !== "done");
    // The town quests count things this test does not set up: townsfolk, plots, buildings, and
    // evening actions. Backend's town tests play those through, so only they may be left.
    expect(open.map((quest) => quest.id).filter((id) => !id.startsWith("town-"))).toEqual([]);
    expect(open.every((quest) => quest.track === "main" || !quest.id.startsWith("town-"))).toBe(true);
  });
});

describe("a quest that says to make something", () => {
  const state = (game: ReturnType<typeof newGame>, id: string) => game.progress.getProgress("ann").quests.find((quest) => quest.id === id)!;
  // Hands a player something the way the shop or a visitor does: they have it, and did not make it.
  function hand(store: Store, how: "shop" | "gift", id: string) {
    store.addLedger("ann", 0, how, id);
    store.addDiscovery("ann", id);
  }

  it("only counts things the player made", () => {
    const making = data.quests.filter((quest) => /\bmake\b/i.test(quest.title));
    expect(making.map((quest) => quest.id)).toEqual(["first-focus", "first-person", "six-deep", "ten-deep"]);
    for (const quest of making) expect(quest.done, quest.id).toMatchObject({ made: true });
  });

  it("is not finished by buying something deep, or by being given it", () => {
    const game = newGame();
    raiseTo(game.store, "ann", cap);
    // Animate Dead sits eight combinations from the elements, and the shop sells it.
    expect(data.entries.get("spell-animate-dead")!.depth).toBeGreaterThanOrEqual(6);
    hand(game.store, "shop", "spell-animate-dead");
    hand(game.store, "gift", saveMade(game.store, "deep-gift", { depth: 12, tier: 6 }).id);
    expect(state(game, "six-deep")).toMatchObject({ state: "upcoming", progress: { have: 0, need: 6 } });
    expect(state(game, "ten-deep").state).toBe("upcoming");

    game.store.addDiscovery("ann", saveMade(game.store, "deep-made", { depth: 6, tier: 3 }).id);
    expect(state(game, "six-deep").state).toBe("done");
    expect(state(game, "ten-deep")).toMatchObject({ state: "upcoming", progress: { have: 6, need: 10 } });
  });

  it("is not finished by a spellbook or a person that was handed over", () => {
    const game = newGame();
    raiseTo(game.store, "ann", 2);
    hand(game.store, "shop", "spellbook");
    hand(game.store, "gift", "person");
    expect(state(game, "first-focus").state).not.toBe("done");
    expect(state(game, "first-person").state).not.toBe("done");

    const made = newGame();
    raiseTo(made.store, "ann", 2);
    for (const id of ["spellbook", "person"]) made.store.addDiscovery("ann", id);
    expect(state(made, "first-focus").state).toBe("done");
    expect(state(made, "first-person").state).toBe("done");
  });

  it("still lets a quest that says find or hold count what was bought", () => {
    const game = newGame();
    hand(game.store, "shop", "spell-fire-bolt");
    expect(state(game, "first-cantrip").state).toBe("done");
  });
});

describe("a level already reached", () => {
  // A player saved under older, easier numbers: a handful of discoveries and a high level.
  function oldTimer(level: number) {
    const game = newGame();
    for (const id of ["light", "mud", "life", "tree", "spellbook"]) game.store.addDiscovery("old", id);
    game.store.changeStats("old", { lastLevel: level });
    return game;
  }

  it("is kept when the numbers change under the player", () => {
    for (const level of [3, 5]) {
      const { progress, store } = oldTimer(level);
      expect(progress.getProgress("old")).toMatchObject({ level, xp: xpToReach(level, data.balance), levelInto: 0 });
      expect(store.getStats("old").lastLevel).toBe(level);
      // Asking again changes nothing.
      expect(progress.getProgress("old")).toMatchObject({ level, xp: xpToReach(level, data.balance) });
    }
  });

  it("is made up once, so the next XP earned counts on top of it", async () => {
    const { progress, store, play } = oldTimer(3);
    const before = progress.getProgress("old");
    const made = store.getStats("old").bonusXp;
    expect(made).toBeGreaterThan(0);
    await play("old", [["fire", "light"]]);
    const rewards = progress.settle("old");
    const questXp = rewards.quests.reduce((total, quest) => total + quest.xp, 0);
    expect(progress.getProgress("old").xp).toBe(before.xp + data.entries.get("evocation")!.xp + questXp);
    expect(store.getStats("old").bonusXp).toBe(made);
  });

  it("pays the quests the player had already earned at that level", () => {
    const { progress } = oldTimer(3);
    const quests = Object.fromEntries(progress.getProgress("old").quests.map((quest) => [quest.id, quest.state]));
    expect(quests).toMatchObject({ "first-combine": "done", "first-focus": "done", "level-two": "done", "level-three": "done", "level-four": "upcoming" });
  });
});

describe("XP for a saved discovery", () => {
  it("follows the balance file as it stands, not as it stood when the thing was made", () => {
    const { progress, store, combiner } = newGame();
    const deep = saveMade(store, "old-deep-thing", { tier: 3, depth: 6, xp: 100 });
    store.addDiscovery("ann", deep.id);
    const now = xpForTier(3, data.balance);
    expect(combiner.listDiscovered("ann").find((entry) => entry.id === deep.id)!.xp).toBe(now);
    const questXp = progress.getProgress("ann").quests.filter((quest) => quest.state === "done").reduce((total, quest) => total + quest.xp, 0);
    expect(progress.getProgress("ann").xp).toBe(now + questXp);
  });
});

describe("the level a spell takes", () => {
  it("is on every spell entry, by tier", () => {
    const levelOf = (id: string) => data.entries.get(id)!.learnLevel;
    expect(["spell-fire-bolt", "spell-burning-hands", "spell-scorching-ray", "spell-fireball"].map(levelOf)).toEqual(data.balance.spellLevelByTier);
    expect(data.balance.spellLevelByTier).toMatchObject({ 2: 3, 3: 5 });
    expect(data.entries.get("mud")!.learnLevel).toBeUndefined();
  });

  it("is needed to learn the spell, however it was come by", () => {
    const { progress, store } = newGame();
    for (const id of ["spellbook", "spell-scorching-ray", "spell-fireball"]) store.addDiscovery("ann", id);
    store.addLedger("ann", 1000, "quest", "test-grant");
    expect(() => progress.learn("ann", "spell-scorching-ray")).toThrowError(expect.objectContaining({ code: "level-too-low", message: expect.stringMatching(/takes level 3 to learn. You are level 1/) }));
    raiseTo(store, "ann", 3);
    expect(progress.learn("ann", "spell-scorching-ray").spell.name).toBe("Scorching Ray");
    expect(() => progress.learn("ann", "spell-fireball")).toThrowError(expect.objectContaining({ code: "level-too-low" }));
    store.changeStats("ann", { bonusXp: xpToReach(cap, data.balance) });
    expect(progress.learn("ann", "spell-fireball").spell.name).toBe("Fireball");
    expect(progress.getProgress("ann").quests.find((quest) => quest.id === "learn-tier-three")!.state).toBe("done");
  });
});
