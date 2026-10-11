import { describe, expect, it } from "vitest";
import { comboRules, createCombiner, RuleError } from "../src/server/combiner";
import { buildGameData, readGameFiles } from "../src/server/gameData";
import { canonicalName, isBanned, isOnlyIngredients, isRealName, overusedIn, wordsOfName } from "../src/server/names";
import { openStore } from "../src/server/store";
import type { BakedCombo, ComboDraft } from "../src/shared/schema";
import { data } from "./helpers";

const entry = (id: string) => data.entries.get(id)!;
const named = (name: string, description = "A thing."): ComboDraft => ({ name, description, tags: [], missingTag: null });
const rulesFor = comboRules({ data });

describe("telling a real name from a made-up one", () => {
  it("goes by a word list, with the game's own names vouched for", () => {
    for (const name of ["Saltwater", "Beach", "Tea Party", "Witch's Brew", "Sandcastle", "Glassworks"]) expect(isRealName(name, data.words), name).toBe(true);
    for (const name of ["Bloodfire", "Mudhat", "Braingold", "Glassbook", "glauth", "Mirrorroom", "Mudkitchen"]) expect(isRealName(name, data.words), name).toBe(false);
    expect(isRealName("Treant", new Set(), (name) => name === "Treant")).toBe(true);
    expect(wordsOfName("Jack-o'-lantern Stew")).toEqual(["jack", "o", "lantern", "stew"]);
  });

  it("lets a plain compound through and refuses a glued one", () => {
    // Salt and Water make Saltwater: a real word, however much it looks like the two stuck together.
    expect(rulesFor(entry("salt"), entry("water"))(named("Saltwater"))).toBeNull();
    expect(rulesFor(entry("blood"), entry("fire"))(named("Bloodfire"))).toMatch(/not a real, well-known word/);
    expect(rulesFor(entry("glass"), entry("bat"))(named("glauth"))).toMatch(/not a real/);
    // A storybook name is real by the game's own say-so.
    expect(rulesFor(entry("tree"), entry("life"))(named("Treant"))).toBeNull();
  });
});

describe("a name that only says what went in", () => {
  it("is spotted when every word of it is one of the ingredients again", () => {
    expect(isOnlyIngredients("Salted gold", "Salt", "Gold")).toBe(true);
    expect(isOnlyIngredients("Bone tea", "Bone dust", "Tea")).toBe(true);
    expect(isOnlyIngredients("Sulfur glass", "Glass", "Sulfur")).toBe(true);
    expect(isOnlyIngredients("Smoky glass", "Smoke", "Glass")).toBe(true);
    expect(isOnlyIngredients("Golden sand", "Sand", "Gold")).toBe(true);
    expect(isOnlyIngredients("Tea Party", "Tea", "Person")).toBe(false);
    expect(isOnlyIngredients("Salt flats", "Earth", "Salt")).toBe(false);
    // One word is another rule's business.
    expect(isOnlyIngredients("Saltwater", "Salt", "Water")).toBe(false);
  });

  it("is refused by the rules", () => {
    expect(rulesFor(entry("salt"), entry("gold"))(named("Salted gold"))).toMatch(/only says what went in/);
    expect(rulesFor(entry("tea"), entry("person"))(named("Tea Party"))).toBeNull();
  });
});

describe("things from after the age of steam", () => {
  it("are on a list, by whole name or by a telling word", () => {
    for (const name of ["Airplane", "Selfie", "Light bulb", "Lightbulb", "Smoke detector", "Blood bank", "Bloodbank", "Electric eel", "Plastic cup"]) expect(isBanned(name, data.banned), name).toBe(true);
    for (const name of ["Steam engine", "Locomotive", "Kettle", "Lantern", "Boiler", "Smokestack", "Bottle", "Window"]) expect(isBanned(name, data.banned), name).toBe(false);
  });

  it("are refused by the rules", () => {
    expect(rulesFor(entry("air"), entry("metal"))(named("Airplane"))).toMatch(/does not belong in this world/);
    expect(rulesFor(entry("steam"), entry("iron"))(named("Locomotive"))).toBeNull();
  });
});

describe("how a description may read", () => {
  it("is sent back for leaning on a worn-out word", () => {
    expect(overusedIn("It hums a little on warm days.", data.overused)).toBe("hums");
    expect(overusedIn("It sits there, as if waiting.", data.overused)).toBe("as if");
    expect(overusedIn("A humble pot. Human hands made it.", data.overused)).toBeNull();
    const rules = rulesFor(entry("sand"), entry("water"));
    expect(rules(named("Beach", "Sand by the sea, with a faint smell of salt."))).toMatch(/leans on "faint"/);
    expect(rules(named("Beach", "Sand by the sea. It keeps one of every shoe."))).toBeNull();
  });

  it("is two sentences at most", () => {
    const rules = rulesFor(entry("sand"), entry("water"));
    expect(rules(named("Beach", "Sand by the sea. It is warm. It is wide."))).toMatch(/too long/);
    expect(rules(named("Beach", "Sand by the sea. It is warm."))).toBeNull();
  });
});

describe("the one spelling of a name", () => {
  it("comes from the alias list, and otherwise is the name with a capital", () => {
    expect(canonicalName("salt water", data.aliases)).toBe("Saltwater");
    expect(canonicalName("Salt Water", data.aliases)).toBe("Saltwater");
    expect(canonicalName("beach", data.aliases)).toBe("Beach");
    expect(canonicalName("Tea Party", data.aliases)).toBe("Tea Party");
  });

  it("is what the game keeps when the model names a thing", async () => {
    const store = openStore(":memory:");
    store.addDiscovery("ann", "salt");
    const combiner = createCombiner({ data, store, generate: async () => named("salt water", "The sea, in a cup.") });
    expect((await combiner.combine("ann", "salt", "water")).entry).toMatchObject({ id: "saltwater", name: "Saltwater" });
  });
});

describe("a pair that makes nothing", () => {
  const nothing: BakedCombo = { inputs: ["salt", "crown"], name: "Sea", description: "x", tags: [], wonder: false, sense: 2, reason: "Weak.", status: "nothing", failure: "bad logic" };
  const game = buildGameData({ ...readGameFiles(process.cwd()), baked: [nothing] });

  it("is not a recipe and adds nothing to the game", () => {
    expect(game.noResults.has("crown+salt")).toBe(true);
    expect(game.combos.has("crown+salt")).toBe(false);
    expect(game.entries.has("sea")).toBe(false);
  });

  it("is refused gently, with the same line every time, and never reaches the model", async () => {
    const store = openStore(":memory:");
    for (const id of ["salt", "crown"]) store.addDiscovery("ann", id);
    let asked = 0;
    const combiner = createCombiner({ data: game, store, generate: async () => (asked++, named("Sea")) });
    const attempt = () => combiner.combine("ann", "crown", "salt").catch((err: unknown) => err as RuleError);
    const [first, second] = [await attempt(), await attempt()];
    expect(first).toBeInstanceOf(RuleError);
    expect(first).toMatchObject({ code: "no-result" });
    expect(game.noResultLines).toContain((first as RuleError).message);
    expect((second as RuleError).message).toBe((first as RuleError).message);
    expect(asked).toBe(0);
    expect(store.getDiscoveries("ann")).not.toContain("sea");
  });
});
