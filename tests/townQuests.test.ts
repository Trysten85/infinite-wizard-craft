import { describe, expect, it } from "vitest";
import { createProgress } from "../src/server/progress";
import type { Quest } from "../src/shared/schema";
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
    game.store.addDiscovery("ann", "blacksmith");
    game.town.arrive("ann");
    game.store.addPlot("ann", 0);
    game.store.addPlot("ann", 1);
    game.store.setBuilding("ann", 0, "smithy", 1);
    expect(state()).toEqual(["done", "done", "done", "upcoming", "done", "upcoming"]);
    game.store.setBuilding("ann", 0, "smithy", 2);
    game.dusk("ann");
    game.day.spend("ann", 1);
    expect(state()[3]).toBe("done");
    expect(state()[5]).toBe("upcoming");
    game.day.spend("ann", 1);
    expect(state()[5]).toBe("done");
    // Each pays once, through the ledger as any quest does.
    expect(progress.settle("ann")).toEqual({ gold: 0, quests: [] });
    expect(game.store.getLedgerRefs("ann", "quest")).toHaveLength(6);
  });

  it("count a visit, a hand, and a raise as evenings, and never a free action", async () => {
    const { game } = withQuests([]);
    game.dusk("ann");
    game.store.addPlot("ann", 0);
    game.store.setBuilding("ann", 0, "smithy", 1);
    game.store.saveGenerated("a+fire", "a", "fire", { id: "a", name: "a", kind: "material", description: "x", tags: ["metal"], affinity: [], tier: 1, source: "generated", depth: 3, xp: 1 });
    game.store.addDiscovery("ann", "a");
    game.town.stock("ann", 0, 0, "a");
    expect(game.store.countEvenings("ann")).toBe(0);
    game.town.hand("ann", 0);
    expect(game.store.countEvenings("ann")).toBe(1);
  });
});
