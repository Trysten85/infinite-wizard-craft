import { describe, expect, it } from "vitest";
import { buildGameData, readGameFiles } from "../src/server/gameData";
import { createProgress } from "../src/server/progress";
import type { CastMember, Quest } from "../src/shared/schema";
import { data, newGame } from "./helpers";

// Town quest conditions, tried through a progress service that has been given quests with them.
function withQuests(done: Record<string, unknown>[]) {
  const game = newGame();
  const quests = done.map((condition, index) => ({ id: `town-${index}`, title: "t", detail: "d", track: "side", level: 1, gold: 7, xp: 0, done: condition }) as unknown as Quest);
  const progress = createProgress({ data: { ...data, quests }, store: game.store, listDiscovered: game.combiner.listDiscovered });
  const state = () => progress.getProgress("ann").quests.map((quest) => quest.state);
  return { game, progress, state };
}

describe("the town quests' conditions", () => {
  it("are met by townsfolk, plots, buildings, a named building, and evenings spent", () => {
    const { game, progress, state } = withQuests([
      { type: "townsfolk", count: 1 },
      { type: "plots", count: 2 },
      { type: "buildings", count: 1 },
      { type: "buildings", count: 1, tier: 2 },
      { type: "built", building: "smithy" },
      { type: "evenings", count: 2 },
    ]);
    expect(state().every((item) => item !== "done")).toBe(true);
    // A person comes to work once their building stands.
    game.store.addPlot("ann", 0);
    game.store.addPlot("ann", 1);
    game.store.setBuilding("ann", 0, "smithy", 1);
    game.town.arrive("ann");
    expect(state()).toEqual(["done", "done", "done", "upcoming", "done", "upcoming"]);
    game.store.setBuilding("ann", 0, "smithy", 2);
    game.dusk("ann");
    game.day.spend("ann", "call", 1);
    expect(state()[3]).toBe("done");
    expect(state()[5]).toBe("upcoming");
    game.day.spend("ann", "call", 1);
    expect(state()[5]).toBe("done");
    // Each pays once, through the ledger as any quest does.
    expect(progress.settle("ann")).toEqual({ gold: 0, quests: [] });
    expect(game.store.getLedgerRefs("ann", "quest").filter((ref) => ref.startsWith("town-"))).toHaveLength(6);
  });

  it("hold a named building to a tier when one is given", () => {
    const { game, state } = withQuests([
      { type: "built", building: "herb-garden", tier: 2 },
      { type: "built", building: "herb-garden" },
    ]);
    game.store.addPlot("ann", 0);
    game.store.setBuilding("ann", 0, "herb-garden", 1);
    expect(state()).toEqual(["upcoming", "done"]);
    game.store.setBuilding("ann", 0, "herb-garden", 2);
    expect(state()).toEqual(["done", "done"]);
  });

  it("wait on another quest being paid, such as a lesson", () => {
    const { game, state } = withQuests([
      { type: "quest-done", quest: "town-1" },
      { type: "built", building: "smithy" },
    ]);
    expect(state()).toEqual(["upcoming", "upcoming"]);
    game.store.addPlot("ann", 0);
    game.store.setBuilding("ann", 0, "smithy", 1);
    // Both pay in the same settling: the second is paid, and the pass goes round for the first.
    expect(state()).toEqual(["done", "done"]);
  });

  it("count a townsperson's Fondness by their job, and never another's", () => {
    const { game, state } = withQuests([{ type: "fondness", job: "blacksmith", fondness: 3 }]);
    const visitor = game.store.addPerson("ann", { name: "Wren", role: "visitor", traits: [], facts: [] }, 1);
    game.store.updatePerson(visitor.id, { fondness: 9 });
    expect(state()).toEqual(["upcoming"]);
    const smith = game.store.addPerson("ann", { name: "Dunstan", role: "blacksmith", traits: [], facts: [], job: "blacksmith" }, 1);
    game.store.updatePerson(smith.id, { fondness: 2 });
    expect(state()).toEqual(["upcoming"]);
    game.store.updatePerson(smith.id, { fondness: 3 });
    expect(state()).toEqual(["done"]);
  });

  it("count things made for someone who asked, and only for that townsperson when a job is named", () => {
    const { game, progress, state } = withQuests([
      { type: "requests", count: 2 },
      { type: "requests", count: 1, job: "blacksmith" },
    ]);
    const visitor = game.store.addPerson("ann", { name: "Wren", role: "visitor", traits: [], facts: [] }, 1);
    const smith = game.store.addPerson("ann", { name: "Dunstan", role: "blacksmith", traits: [], facts: [], job: "blacksmith" }, 1);
    const ask = (personId: number, entryId: string) => game.store.addRequest("ann", { personId, eventId: 0, entryId, ask: "a", gold: 0 });
    ask(visitor.id, "steam");
    ask(smith.id, "mud");
    // Asked for is not made for: an open request counts for nothing.
    expect(progress.getProgress("ann").quests[0]!.progress).toEqual({ have: 0, need: 2 });
    game.store.addDiscovery("ann", "steam");
    expect(state()).toEqual(["upcoming", "upcoming"]);
    game.store.addDiscovery("ann", "mud");
    expect(state()).toEqual(["done", "done"]);
  });

  it("are refused when they name a quest, a job, or a tier the game does not have", () => {
    const files = readGameFiles(process.cwd());
    const quest = (done: Record<string, unknown>) => ({ ...files.quests[0]!, id: "odd", done }) as Quest;
    const build = (done: Record<string, unknown>) => () => buildGameData({ ...files, quests: [...files.quests, quest(done)] });
    expect(build({ type: "quest-done", quest: "no-such-quest" })).toThrow(/waits on unknown quest "no-such-quest"/);
    expect(build({ type: "quest-done", quest: "odd" })).toThrow(/waits on unknown quest "odd"/);
    expect(build({ type: "fondness", job: "no-such-job", fondness: 1 })).toThrow(/unknown job "no-such-job"/);
    expect(build({ type: "requests", count: 1, job: "no-such-job" })).toThrow(/unknown job "no-such-job"/);
    expect(build({ type: "built", building: "smithy", tier: 9 })).toThrow(/at tier 9/);
    expect(build({ type: "quest-done", quest: files.quests[0]!.id })).not.toThrow();
  });

  it("may wait on a lesson: a cast member's own, or the made-by-code one for a trade with none", () => {
    const files = readGameFiles(process.cwd());
    const lesson = { ...files.quests[0]!, id: "lesson-hands-in-the-dirt", xp: 0, gold: 0 } as Quest;
    const hester: CastMember = {
      id: "hester", name: "Hester Furrow", pronoun: "she", job: "farmer", home: "farm", personality: "p", voice: "v",
      traits: [], facts: [], likes: [], dislikes: [], arrival: {}, lesson: [lesson], beats: [], callingLines: ["{name} nods."],
    };
    const waiting = (on: string) => ({ ...files.quests[0]!, id: "waits", done: { type: "quest-done", quest: on } }) as Quest;
    const build = (on: string) => () => buildGameData({ ...files, cast: { people: [hester] }, quests: [...files.quests, waiting(on)] });
    expect(build("lesson-hands-in-the-dirt")).not.toThrow();
    expect(build("lesson-blacksmith")).not.toThrow();
    // A trade with a written person has no made-by-code lesson.
    expect(build("lesson-farmer")).toThrow(/waits on unknown quest "lesson-farmer"/);
  });

  it("count only what is done of an evening, never what the day does for free", async () => {
    const { game } = withQuests([]);
    game.dusk("ann");
    game.store.addPlot("ann", 0);
    game.store.setBuilding("ann", 0, "smithy", 1);
    game.store.saveGenerated("a+fire", "a", "fire", { id: "a", name: "a", kind: "material", description: "x", tags: ["metal"], affinity: [], tier: 1, source: "generated", depth: 3, xp: 1 });
    game.store.addDiscovery("ann", "a");
    game.town.stock("ann", 0, 0, "a");
    expect(game.store.countEvenings("ann")).toBe(0);
    // A hand is the day's work now, free and at any hour.
    game.town.hand("ann", 0);
    expect(game.store.countEvenings("ann")).toBe(0);
    game.day.spend("ann", "call", 1);
    expect(game.store.countEvenings("ann")).toBe(1);
  });
});
