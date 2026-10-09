import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCombiner, RuleError } from "../src/server/combiner";
import type { ComboGenerator } from "../src/server/comboGenerator";
import { loadGameData } from "../src/server/gameData";
import { openStore, type Store } from "../src/server/store";
import type { ComboDraft } from "../src/shared/schema";

const data = loadGameData(process.cwd());

// A generator that offers each draft in turn until the combiner's rules accept one.
function generatorOffering(...drafts: ComboDraft[]) {
  const generate: ComboGenerator = async (_a, _b, reject) => {
    for (const draft of drafts) if (reject(draft) === null) return draft;
    throw new Error("every draft was rejected");
  };
  return vi.fn(generate);
}

const ash: ComboDraft = { name: "Ash", description: "What the fire leaves.", tags: ["mineral"], missingTag: null };

let store: Store;
beforeEach(() => {
  store = openStore(":memory:");
});

describe("combine", () => {
  it("uses the hand-written result and never calls the model", async () => {
    const generate = generatorOffering(ash);
    const combiner = createCombiner({ data, store, generate });
    const result = await combiner.combine("ann", "fire", "air");
    expect(result.entry.id).toBe("light");
    expect(result.origin).toBe("authored");
    expect(generate).not.toHaveBeenCalled();
  });

  it("gives the same result whichever order the inputs come in", async () => {
    const combiner = createCombiner({ data, store, generate: generatorOffering(ash) });
    const forward = await combiner.combine("ann", "water", "earth");
    const backward = await combiner.combine("ann", "earth", "water");
    expect(forward.entry.id).toBe("mud");
    expect(backward.entry.id).toBe("mud");
  });

  it("reports a first discovery once per player", async () => {
    const combiner = createCombiner({ data, store, generate: generatorOffering(ash) });
    expect((await combiner.combine("ann", "fire", "air")).firstDiscovery).toBe(true);
    expect((await combiner.combine("ann", "fire", "air")).firstDiscovery).toBe(false);
    expect((await combiner.combine("bob", "fire", "air")).firstDiscovery).toBe(true);
  });

  it("refuses inputs the player has not discovered", async () => {
    const combiner = createCombiner({ data, store, generate: generatorOffering(ash) });
    await expect(combiner.combine("ann", "fire", "death")).rejects.toThrow(RuleError);
    await expect(combiner.combine("ann", "fire", "no-such-thing")).rejects.toThrow(RuleError);
  });

  it("starts every player with the starting entries only", () => {
    const combiner = createCombiner({ data, store, generate: generatorOffering(ash) });
    expect(combiner.listDiscovered("ann").map((e) => e.id)).toEqual(data.balance.startingEntries);
  });
});

describe("generated combos", () => {
  it("asks the model once, then serves every player from the cache", async () => {
    const generate = generatorOffering(ash);
    const combiner = createCombiner({ data, store, generate });
    const first = await combiner.combine("ann", "fire", "fire");
    const again = await combiner.combine("ann", "fire", "fire");
    const other = await combiner.combine("bob", "fire", "fire");
    expect(first.origin).toBe("generated");
    expect(again.origin).toBe("cached");
    expect(other.entry).toEqual(first.entry);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("lets code, not the model, set kind, depth, tier, xp, and affinity", async () => {
    const combiner = createCombiner({ data, store, generate: generatorOffering(ash) });
    await combiner.combine("ann", "water", "earth");
    const { entry } = await combiner.combine("ann", "mud", "fire");
    expect(entry).toMatchObject({
      id: "ash",
      kind: "material",
      source: "generated",
      depth: 2,
      tier: 1,
      xp: data.balance.discoveryXpByTier[1],
    });
    expect(entry.affinity.sort()).toEqual(["earth", "fire", "water"]);
  });

  it("does not let the model hand out a hand-written entry", async () => {
    const death: ComboDraft = { name: "Death", description: "A thing.", tags: [], missingTag: null };
    const combiner = createCombiner({ data, store, generate: generatorOffering(death, ash) });
    const { entry } = await combiner.combine("ann", "fire", "fire");
    expect(entry.id).toBe("ash");
  });

  it("rejects names that are not plain words", async () => {
    const odd: ComboDraft = { name: "Ash 2.0 <b>", description: "A thing.", tags: [], missingTag: null };
    const combiner = createCombiner({ data, store, generate: generatorOffering(odd, ash) });
    expect((await combiner.combine("ann", "fire", "fire")).entry.id).toBe("ash");
  });

  it("reuses an existing generated entry when two combos make the same thing", async () => {
    const rewritten: ComboDraft = { name: "Ash", description: "A different description.", tags: ["toxic"], missingTag: null };
    const combiner = createCombiner({ data, store, generate: generatorOffering(ash) });
    const first = await combiner.combine("ann", "fire", "fire");
    const second = await createCombiner({ data, store, generate: generatorOffering(rewritten) }).combine(
      "ann",
      "water",
      "water",
    );
    expect(second.entry).toEqual(first.entry);
  });

  describe("a second look at a repeat", () => {
    const cinder: ComboDraft = { name: "Cinder", description: "A small, sulking coal.", tags: ["mineral"], missingTag: null };
    // Gives Ash, and whatever `again` says when it is asked to look a second time.
    function generatorRepeating(again: () => ComboDraft) {
      const generate: ComboGenerator = async (_a, _b, _reject, alreadyMade) => (alreadyMade ? again() : ash);
      return vi.fn(generate);
    }

    it("is not taken for a result nobody has made before", async () => {
      const generate = generatorRepeating(() => cinder);
      const { entry } = await createCombiner({ data, store, generate }).combine("ann", "fire", "fire");
      expect(entry.id).toBe("ash");
      expect(generate).toHaveBeenCalledTimes(1);
      expect(generate.mock.calls[0]![3]).toBeUndefined();
    });

    it("asks once more when a new pair lands on something already made, and uses a different answer", async () => {
      const generate = generatorRepeating(() => cinder);
      const combiner = createCombiner({ data, store, generate });
      await combiner.combine("ann", "fire", "fire");
      const { entry, origin } = await combiner.combine("ann", "water", "water");
      expect(entry.id).toBe("cinder");
      expect(origin).toBe("generated");
      expect(generate).toHaveBeenCalledTimes(3);
      // The model is told what the pair first gave.
      expect(generate.mock.calls[2]![3]).toBe("Ash");
      expect((await combiner.combine("ann", "water", "water")).entry.id).toBe("cinder");
    });

    it("keeps the same answer if the model gives it again, however many ways that makes it", async () => {
      const generate = generatorRepeating(() => ash);
      const combiner = createCombiner({ data, store, generate });
      const first = await combiner.combine("ann", "fire", "fire");
      const second = await combiner.combine("ann", "water", "water");
      expect(second.entry).toEqual(first.entry);
      // Asked exactly once more, not until it changes its mind.
      expect(generate).toHaveBeenCalledTimes(3);
      expect(store.getCombo("water+water")).toBe("ash");
    });

    it("keeps the first answer if the second look fails", async () => {
      const generate = generatorRepeating(() => {
        throw new Error("the model gave up");
      });
      const combiner = createCombiner({ data, store, generate });
      await combiner.combine("ann", "fire", "fire");
      expect((await combiner.combine("ann", "water", "water")).entry.id).toBe("ash");
    });
  });

  it("keeps the model's missing-tag hint for review without making it a tag", async () => {
    const mist: ComboDraft = { name: "Mist", description: "A thing.", tags: [], missingTag: "vapor" };
    const combiner = createCombiner({ data, store, generate: generatorOffering(mist) });
    const { entry } = await combiner.combine("ann", "air", "air");
    expect(entry.tags).toEqual([]);
    expect(entry).not.toHaveProperty("missingTag");
    expect(store.getTagSuggestion("mist")).toBe("vapor");
  });

  it("makes one model call when two players try the same new combo at once", async () => {
    const generate = generatorOffering(ash);
    const combiner = createCombiner({ data, store, generate });
    const [a, b] = await Promise.all([
      combiner.combine("ann", "fire", "fire"),
      combiner.combine("bob", "fire", "fire"),
    ]);
    expect(a.entry).toEqual(b.entry);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
