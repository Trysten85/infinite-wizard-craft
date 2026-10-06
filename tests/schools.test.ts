import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBlocklist } from "../src/server/blocklist";
import { createCombiner, RuleError } from "../src/server/combiner";
import type { ComboGenerator } from "../src/server/comboGenerator";
import { loadGameData } from "../src/server/gameData";
import { openStore, type Store } from "../src/server/store";
import { comboKey, type ComboDraft } from "../src/shared/schema";

const data = loadGameData(process.cwd());
const entry = (id: string) => data.entries.get(id)!;

function generatorOffering(...drafts: ComboDraft[]) {
  const reasons: string[] = [];
  const generate: ComboGenerator = async (_a, _b, reject) => {
    for (const draft of drafts) {
      const reason = reject(draft);
      if (reason === null) return draft;
      reasons.push(reason);
    }
    throw new Error("every draft was rejected");
  };
  return { generate: vi.fn(generate), reasons };
}
const draft = (name: string, description = "What the fire leaves."): ComboDraft => ({ name, description, tags: [], missingTag: null });

let store: Store;
beforeEach(() => {
  store = openStore(":memory:");
});

// Plays the given combos in order for one player and returns the last result.
async function play(combiner: ReturnType<typeof createCombiner>, steps: [string, string][]) {
  let last;
  for (const [a, b] of steps) last = await combiner.combine("ann", a, b);
  return last!;
}

const TO_LIGHT_AND_SHADOW: [string, string][] = [["fire", "air"], ["light", "earth"]];
const TO_LIFE: [string, string][] = [["water", "earth"], ["mud", "light"]];
const TO_SPELLBOOK: [string, string][] = [...TO_LIFE, ["earth", "life"], ["tree", "light"]];

describe("the school pattern data", () => {
  it("puts every school at the depth the design gives it", () => {
    const depths = Object.fromEntries([...data.schools.keys()].map((id) => [id, entry(id).depth]));
    expect(depths).toEqual({
      evocation: 2, abjuration: 2, illusion: 2,
      divination: 3, conjuration: 3, enchantment: 3, transmutation: 3,
      necromancy: 4,
    });
  });

  it("gives each school its natural elements as affinity", () => {
    expect(entry("necromancy")).toMatchObject({ kind: "school", affinity: ["death", "shadow", "life"] });
  });

  it("builds the material tree to the stated depths", () => {
    const depth = (id: string) => entry(id).depth;
    expect([depth("sand"), depth("salt"), depth("sulfur"), depth("bat"), depth("bat-guano")]).toEqual([1, 2, 3, 4, 5]);
    expect(data.combos.get(comboKey("life", "air"))!.result).toBe("animal");
    expect(data.combos.get(comboKey("animal", "light"))!.result).toBe("mind");
  });

  it("has the 15 SRD cantrip seeds, each an element plus its own school", () => {
    const seeds = [...data.combos.values()].filter((recipe) => entry(recipe.result).kind === "spell" && entry(recipe.result).tier === 0);
    expect(seeds).toHaveLength(15);
    for (const seed of seeds) expect(seed.inputs, seed.result).toContain(entry(seed.result).school);
    expect(data.combos.get(comboKey("light", "evocation"))!.result).toBe("spell-light");
    expect(entry("light").kind).toBe("element");
  });

  it("turns each ladder rung into school + a lower spell of that school", () => {
    expect(data.combos.get(comboKey("evocation", "spell-fire-bolt"))).toMatchObject({ result: "spell-burning-hands", needs: [] });
    expect(data.combos.get(comboKey("evocation", "spell-ray-of-frost"))!.result).toBe("spell-burning-hands");
    expect(data.combos.get(comboKey("evocation", "spell-scorching-ray"))).toMatchObject({
      result: "spell-fireball",
      needs: ["sulfur", "bat-guano"],
    });
    expect(entry("spell-fireball")).toMatchObject({ kind: "spell", school: "evocation", tier: 3, affinity: ["fire"], source: "srd" });
  });

  it("makes a spell deeper than the components it needs", () => {
    expect(entry("spell-fireball").depth).toBeGreaterThan(entry("bat-guano").depth);
  });
});

describe("casting", () => {
  it("refuses to shape a spell without a focus", async () => {
    const combiner = createCombiner({ data, store, ...generatorOffering() });
    await play(combiner, [["fire", "air"], ["fire", "light"]]);
    await expect(combiner.combine("ann", "fire", "evocation")).rejects.toMatchObject({ code: "no-focus" });
  });

  it("makes a cantrip from a school and an element once the player has a focus", async () => {
    const combiner = createCombiner({ data, store, ...generatorOffering() });
    const result = await play(combiner, [["fire", "air"], ...TO_SPELLBOOK, ["fire", "light"], ["evocation", "fire"]]);
    expect(result).toMatchObject({ entry: { id: "spell-fire-bolt", name: "Fire Bolt" }, origin: "authored", firstDiscovery: true });
    expect(combiner.listDiscovered("ann").map((e) => e.id)).toContain("spell-fire-bolt");
  });

  it("returns nothing, without calling the model, for a school pair that has no seed", async () => {
    const { generate } = generatorOffering(draft("Ash"));
    const combiner = createCombiner({ data, store, generate });
    await play(combiner, [["fire", "air"], ...TO_SPELLBOOK, ["fire", "light"], ["water", "light"]]);
    for (const [a, b] of [["fire", "abjuration"], ["evocation", "abjuration"], ["evocation", "mud"]] as const) {
      const attempt = combiner.combine("ann", a, b);
      await expect(attempt).rejects.toThrow(RuleError);
      await expect(attempt).rejects.toMatchObject({ code: "no-result" });
    }
    expect(generate).not.toHaveBeenCalled();
  });

  it("climbs the Evocation ladder and holds Fireball back until its components are found", async () => {
    const combiner = createCombiner({ data, store, ...generatorOffering() });
    const scorchingRay = await play(combiner, [
      ["fire", "air"], ...TO_SPELLBOOK, ["fire", "light"],
      ["evocation", "fire"], ["evocation", "spell-fire-bolt"], ["evocation", "spell-burning-hands"],
    ]);
    expect(scorchingRay.entry.id).toBe("spell-scorching-ray");

    await expect(combiner.combine("ann", "evocation", "spell-scorching-ray")).rejects.toMatchObject({
      code: "missing-needs",
      message: "Fireball needs: Sulfur, Bat guano.",
    });

    await play(combiner, [["fire", "water"], ["steam", "earth"], ["fire", "salt"]]);
    await expect(combiner.combine("ann", "evocation", "spell-scorching-ray")).rejects.toThrow("Fireball needs: Bat guano.");

    await play(combiner, [["life", "air"], ["air", "water"], ["sound", "animal"], ["tree", "water"], ["bat", "food"]]);
    const fireball = await combiner.combine("ann", "evocation", "spell-scorching-ray");
    expect(fireball).toMatchObject({ entry: { id: "spell-fireball", tier: 3 }, firstDiscovery: true });
  });

  it("does not let a ladder be skipped", async () => {
    const combiner = createCombiner({ data, store, ...generatorOffering() });
    await play(combiner, [["fire", "air"], ...TO_SPELLBOOK, ["fire", "light"], ["evocation", "fire"]]);
    await expect(combiner.combine("ann", "evocation", "spell-scorching-ray")).rejects.toThrow("only combine things you have discovered");
  });

  it("reaches the deepest school, Necromancy, and its cantrip", async () => {
    const combiner = createCombiner({ data, store, ...generatorOffering() });
    const result = await play(combiner, [
      ...TO_LIGHT_AND_SHADOW, ...TO_SPELLBOOK, ["life", "shadow"], ["life", "death"], ["death", "necromancy"],
    ]);
    expect(result.entry.id).toBe("spell-chill-touch");
  });
});

describe("checks on generated text", () => {
  const blocklist = createBlocklist(["Velica", "glowmoss"]);

  it("rerolls a blocklisted name or description without telling the model the term", async () => {
    const { generate, reasons } = generatorOffering(draft("Glowmoss"), draft("Lichen", "Gathered by Velica at dusk."), draft("Ash"));
    const combiner = createCombiner({ data, store, generate, blocklist });
    expect((await combiner.combine("ann", "fire", "fire")).entry.id).toBe("ash");
    expect(reasons).toHaveLength(2);
    expect(reasons.join(" ")).not.toMatch(/velica|glowmoss/i);
  });

  it("rerolls a description with a digit or an exclamation mark", async () => {
    const { generate, reasons } = generatorOffering(draft("Coal", "Costs 2 coppers."), draft("Coal", "It burns!"), draft("Ash"));
    const combiner = createCombiner({ data, store, generate });
    expect((await combiner.combine("ann", "fire", "fire")).entry.id).toBe("ash");
    expect(reasons).toHaveLength(2);
  });

  it("rerolls a name of more than two words", async () => {
    const { generate, reasons } = generatorOffering(draft("Quicksilver Sand Slurry"), draft("Wet Sand"));
    const combiner = createCombiner({ data, store, generate });
    expect((await combiner.combine("ann", "fire", "fire")).entry.name).toBe("Wet Sand");
    expect(reasons).toEqual(["Use a plainer name: one everyday word, two at most."]);
  });

  it("rerolls a description that stops mid-sentence", async () => {
    const { generate, reasons } = generatorOffering(draft("Wind", "It drifts under doors and you will only end up"), draft("Ash"));
    const combiner = createCombiner({ data, store, generate });
    expect((await combiner.combine("ann", "fire", "fire")).entry.id).toBe("ash");
    expect(reasons[0]).toMatch(/middle of a sentence/);
  });

  it("capitalises the first letter of a generated name", async () => {
    const combiner = createCombiner({ data, store, ...generatorOffering(draft("slag")) });
    expect((await combiner.combine("ann", "fire", "fire")).entry).toMatchObject({ id: "slag", name: "Slag" });
  });
});
