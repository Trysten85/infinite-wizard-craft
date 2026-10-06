import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadGameData } from "../src/server/gameData";
import { RECIPE_KEY_FILE, renderRecipeKey } from "../src/server/recipeKey";

const data = loadGameData(process.cwd());
const key = renderRecipeKey(data);

describe("the recipe key", () => {
  it("is up to date with the game data (if this fails, run: npm run key)", () => {
    expect(existsSync(RECIPE_KEY_FILE), `${RECIPE_KEY_FILE} is missing`).toBe(true);
    expect(readFileSync(RECIPE_KEY_FILE, "utf8") === key, `${RECIPE_KEY_FILE} is out of date. Run: npm run key`).toBe(true);
  });

  it("gives the full path to the Wizard, in order", () => {
    const section = key.slice(key.indexOf("#### Wizard\n"));
    expect(section.slice(0, section.indexOf("\n####")).trim().split("\n").slice(2)).toEqual([
      "1. Water + Earth = Mud",
      "2. Fire + Air = Light",
      "3. Mud + Light = Life",
      "4. Mud + Life = Person",
      "5. Earth + Life = Tree",
      "6. Tree + Light = Spellbook",
      "7. Person + Spellbook = Wizard",
    ]);
  });

  it("lists everything that can be made, and nothing that cannot", () => {
    for (const entry of data.entries.values()) {
      if (entry.depth > 0) expect(key, entry.name).toContain(`| ${entry.name} |`);
    }
    expect(key).not.toContain("| Thunderwave |");
  });

  it("collapses ladder recipes and shows what a spell needs", () => {
    expect(key).toContain("| Burning Hands | Evocation | 1 | any Evocation cantrip + Evocation |");
    expect(key).toContain("| Fireball | Evocation | 3 | Evocation + Scorching Ray (needs Sulfur, Bat guano) |");
    expect(key).toContain("| Healer | magic | Spare the Dying or False Life + Herbalist |");
  });
});
