import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { benchSchema } from "../src/server/bench";
import { createMadeFrom, exampleLine, pickExamples, storybookFor, thingLine } from "../src/server/comboContext";
import { openStore } from "../src/server/store";
import { slugify, type GameEntry } from "../src/shared/schema";
import { data } from "./helpers";

const entry = (id: string) => data.entries.get(id)!;
const made = (id: string, tags: string[], wonder = false): GameEntry => ({ id, name: id[0]!.toUpperCase() + id.slice(1).replace("-", " "), kind: "material", description: "A thing.", tags, affinity: [], tier: 0, source: "generated", depth: 2, xp: 10, ...(wonder ? { wonder } : {}) });
const offered = (a: GameEntry, b: GameEntry, limit = 200) => storybookFor(data.storybook, a, b, limit);

describe("what a thing is made from", () => {
  it("comes from the hand-written recipe, or from the pair that first made it", () => {
    const store = openStore(":memory:");
    store.saveGenerated("fire+mud", "mud", "fire", made("clay", ["mineral"]));
    store.saveGenerated("clay+water", "clay", "water", made("slip", ["mineral"]));
    const madeFrom = createMadeFrom(data, store);
    expect(madeFrom("mud")).toBe("Water and Earth");
    expect(madeFrom("clay")).toBe("Mud and Fire");
    expect(madeFrom("slip")).toBe("Clay and Water");
    // The starting elements are not made from anything.
    expect(madeFrom("fire")).toBeNull();
  });

  it("is told to the model only for things the model made", () => {
    expect(thingLine(made("clay", ["mineral"]), "Mud and Fire")).toBe("Clay (material; tags: mineral), made from Mud and Fire: A thing.");
    expect(thingLine(entry("person"), "Life and Mud")).not.toContain("made from");
    expect(thingLine(entry("air"), null)).toMatch(/^Air \(element\): /);
  });
});

describe("the storybook things on offer", () => {
  it("are those one ingredient makes and the other wakes", () => {
    expect(offered(entry("tree"), entry("life"))).toEqual(expect.arrayContaining(["Treant", "Dryad"]));
    expect(offered(entry("fire"), entry("life"))).toContain("Phoenix");
    expect(offered(entry("person"), entry("death"))).toEqual(expect.arrayContaining(["Ghost", "Skeleton", "Mummy", "Zombie"]));
    expect(offered(entry("tree"), entry("spellbook"))).toEqual(expect.arrayContaining(["Wand", "Broomstick"]));
    expect(offered(entry("bone-dust"), entry("life"))).toEqual(["Skeleton"]);
  });

  it("are never something only one ingredient points to", () => {
    // A broomstick is wood, but it is a spellbook that wakes it, not Life.
    expect(offered(entry("tree"), entry("life"))).not.toContain("Broomstick");
    // A Treant can come of a marsh and Life. It cannot come of a crystal, or of a spellbook for being paper.
    expect(offered(made("marsh", ["mineral", "liquid", "plant"]), entry("life"))).toContain("Treant");
    expect(offered(made("kettle", ["plant"]), entry("life"))).not.toContain("Treant");
    expect(offered(entry("crystal"), entry("life"))).toEqual([]);
    expect(offered(entry("spellbook"), made("spirit", [], true))).not.toContain("Treant");
    // Magic alone makes nothing, and neither does a pair with no magic in it.
    expect(offered(entry("life"), entry("death"))).toEqual([]);
    expect(offered(entry("tree"), entry("water"))).toEqual([]);
  });

  it("match single words of an id, so Bone dust can make a Skeleton", () => {
    expect(offered(entry("bone-dust"), entry("death"))).toContain("Skeleton");
    expect(offered(made("crystal-ball", []), entry("light"))).toContain("Crystal Cave");
  });

  it("are cut to the limit, in the same order every time for the same pair", () => {
    expect(offered(entry("tree"), entry("life"), 4)).toHaveLength(4);
    expect(offered(entry("tree"), entry("life"), 0)).toEqual([]);
    expect(offered(entry("water"), entry("life"), 8)).toEqual(offered(entry("life"), entry("water"), 8));
  });
});

describe("the storybook list", () => {
  it("is a long list of well-known names, with no repeats", () => {
    const names = data.storybook.map((item) => item.name);
    expect(names.length).toBeGreaterThan(120);
    expect(new Set(names).size).toBe(names.length);
  });

  it("is woken only by the waking forces and foci", () => {
    const sparks = new Set([...data.balance.generation.wonderInputs, ...[...data.entries.values()].filter((item) => item.kind === "focus").map((item) => item.id)]);
    for (const item of data.storybook) {
      expect(item.wokenBy.length, item.name).toBeGreaterThan(0);
      for (const spark of item.wokenBy) expect(sparks.has(spark), `${item.name}: ${spark}`).toBe(true);
      // What wakes a thing is not also what it is made of.
      for (const word of item.from) expect(sparks.has(word), `${item.name}: ${word}`).toBe(false);
    }
  });

  it("can mostly be reached from things the game already has", () => {
    const known = new Set([...data.entries.keys()].flatMap((id) => [id, ...id.split("-")]));
    const reachable = data.storybook.filter((item) => item.from.some((word) => known.has(word)));
    expect(reachable.length / data.storybook.length).toBeGreaterThan(0.9);
  });
});

describe("the examples shown with a pair", () => {
  const examples = data.comboExamples;

  it("include the hand-picked ones and the hand-written recipes for plain things", () => {
    expect(examples.filter((example) => !example.authored).length).toBeGreaterThanOrEqual(40);
    expect(examples.find((example) => example.result === "Mud")).toMatchObject({ inputs: ["Water", "Earth"], why: "wet ground", authored: true });
    // Recipes for schools, spells, and jobs are not examples of what the model makes.
    for (const example of examples) expect(data.entries.get(slugify(example.result))?.kind ?? "material", example.result).not.toMatch(/school|spell|job/);
  });

  it("put one that shares an ingredient first, and show a hand-written recipe only when it does", () => {
    const picked = pickExamples(examples, entry("tree"), entry("salt"), false, 6);
    expect(picked).toHaveLength(6);
    expect(picked[0]!.inputs).toContain("Tree");
    for (const example of picked.filter((item) => item.authored)) expect(example.inputs.some((input) => ["Tree", "Salt"].includes(input))).toBe(true);
  });

  it("never show a magical example to an ordinary pair, and show a magical pair everyday things that came of magic", () => {
    for (const example of pickExamples(examples, entry("sand"), entry("water"), false, 20)) expect(example.kind).toBe("ordinary");
    const picked = pickExamples(examples, entry("iron"), entry("light"), true, 6);
    expect(picked.filter((example) => example.kind === "charmed").length).toBeGreaterThanOrEqual(3);
    // An ordinary example reaches a magical pair only by sharing an ingredient with it.
    for (const example of picked.filter((item) => item.kind === "ordinary")) expect(example.inputs.some((input) => ["Iron", "Light"].includes(input))).toBe(true);
  });

  it("read as a sum with its reason", () => {
    expect(exampleLine({ inputs: ["Tree", "Tree"], result: "Forest", why: "a great many trees together", kind: "ordinary" })).toBe("Tree + Tree = Forest (a great many trees together)");
  });

  it("do not give away the answers to the bench", () => {
    const bench = benchSchema.parse(JSON.parse(readFileSync("data/combo-bench.json", "utf8")));
    const nameOf = (id: string) => (data.entries.get(id)?.name ?? bench.things[id]!.name).toLowerCase();
    const tested = new Set(bench.pairs.map((pair) => [nameOf(pair.a), nameOf(pair.b)].sort().join("+")));
    for (const example of examples.filter((item) => !item.authored)) {
      expect(tested.has(example.inputs.map((input) => input.toLowerCase()).sort().join("+")), exampleLine(example)).toBe(false);
    }
  });
});
