import { describe, expect, it } from "vitest";
import { createCombiner, RuleError } from "../src/server/combiner";
import { buildGameData, readGameFiles, type GameData } from "../src/server/gameData";
import { openStore } from "../src/server/store";

// Plays the game the way a player would: starting from the starting elements, it keeps making
// every hand-written combo it is allowed to, through the real combine rules (inputs must be
// discovered, spells need a focus, ladder spells need their materials), until nothing new appears.
// The model is never called, so this checks the authored paths only.
async function playEverything(data: GameData) {
  const generate = async () => {
    throw new Error("the model must not be called");
  };
  const combiner = createCombiner({ data, store: openStore(":memory:"), generate });
  const found = new Set(data.balance.startingEntries);
  // entry id -> the last reason the rules refused to make it
  const refusals = new Map<string, string>();

  for (let progressed = true; progressed; ) {
    progressed = false;
    for (const recipe of data.combos.values()) {
      if (found.has(recipe.result) || !recipe.inputs.every((id) => found.has(id))) continue;
      try {
        const { entry } = await combiner.combine("tester", ...recipe.inputs);
        expect(entry.id).toBe(recipe.result);
        found.add(entry.id);
        progressed = true;
      } catch (err) {
        if (!(err instanceof RuleError)) throw err;
        refusals.set(recipe.result, err.message);
      }
    }
  }

  const unbuildable = [...data.entries.values()]
    .filter((entry) => !found.has(entry.id))
    .map((entry) => `${entry.name} (${entry.id}): ${refusals.get(entry.id) ?? "no recipe whose inputs can be made"}`);
  return { found, unbuildable };
}

describe("every entry has a buildable path", () => {
  const files = readGameFiles(process.cwd());

  it("with the data as it is now", async () => {
    const data = buildGameData(files);
    const { found, unbuildable } = await playEverything(data);
    expect(unbuildable).toEqual([]);
    expect(found.size).toBe(data.entries.size);
  });

  it("covers every kind of thing the game has", async () => {
    const data = buildGameData(files);
    const { found } = await playEverything(data);
    const kinds = new Set([...found].map((id) => data.entries.get(id)!.kind));
    expect([...kinds].sort()).toEqual(["element", "focus", "material", "school", "spell"]);
    for (const school of data.schools.keys()) expect(found.has(school), school).toBe(true);
  });

  // The same check on what the game would be after `npm run craft -- approve all`,
  // so a draft that would strand something is caught before it is approved.
  it("with every complete draft approved", async () => {
    const approved = buildGameData({
      ...files,
      spellMaterials: files.spellMaterials.map((row) => (row.status === "draft" && row.inputs ? { ...row, status: "ok" as const } : row)),
      spellRecipes: files.spellRecipes.map((row) => (row.status === "draft" && row.key ? { ...row, status: "ok" as const } : row)),
    });
    const { unbuildable } = await playEverything(approved);
    expect(unbuildable).toEqual([]);
  });

  it("reports what is stranded when a path is broken", async () => {
    // Without the Spellbook recipe there is no focus, so no spell can be shaped.
    const broken = buildGameData({ ...files, combos: files.combos.filter((combo) => combo.result !== "spellbook"), entries: files.entries.filter((entry) => entry.id !== "spellbook") });
    const { unbuildable } = await playEverything(broken);
    expect(unbuildable.length).toBeGreaterThan(0);
    expect(unbuildable.join("\n")).toContain("Fire Bolt (spell-fire-bolt): You need a focus to shape a spell.");
  });
});
