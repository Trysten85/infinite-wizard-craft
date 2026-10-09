import { describe, expect, it } from "vitest";
import { createCombiner, isInflection, isWeld } from "../src/server/combiner";
import { createComboGenerator, isWonderPair } from "../src/server/comboGenerator";
import { createFakeClient } from "../src/server/llm/fake";
import { GenerationError } from "../src/server/llm/generate";
import { openStore } from "../src/server/store";
import type { Balance, ComboExample, GameEntry, StorybookItem } from "../src/shared/schema";
import { data } from "./helpers";

const entry = (id: string) => data.entries.get(id)!;
const clay: GameEntry = { id: "clay", name: "Clay", kind: "material", description: "Soft earth.", tags: ["mineral"], affinity: ["earth"], tier: 0, source: "generated", depth: 2, xp: 10 };
// The model's answers to the three questions, in the order it is asked them.
const ideas = (made: string, place: string, thing: string) =>
  JSON.stringify({ made: { why: `how the two make ${made}`, name: made }, place: { why: `where ${place} is`, name: place }, thing: { why: `what ${thing} is`, name: thing } });
const pick = (choice: string) => JSON.stringify({ choice });
const draft = (name: string, tags: string[] = []) => JSON.stringify({ name, description: "A hunched figure of packed clay.", tags, missingTag: null });

const STORYBOOK: StorybookItem[] = [
  { name: "Golem", from: ["clay", "mud"], wokenBy: ["life"] },
  { name: "Ghost", from: ["person"], wokenBy: ["shadow", "death"] },
  { name: "Treant", from: ["tree"], wokenBy: ["life"] },
  { name: "Dryad", from: ["tree"], wokenBy: ["life"] },
  { name: "Wand", from: ["tree"], wokenBy: ["spellbook"] },
  // Light is a hand-written entry, so it is never on offer.
  { name: "Light", from: ["fire"], wokenBy: ["life"] },
];
const EXAMPLES: ComboExample[] = [
  { inputs: ["Tree", "Tree"], result: "Forest", why: "a great many trees together", kind: "ordinary" },
  { inputs: ["Stone", "Life"], result: "Moss", why: "the first green on bare rock", kind: "charmed" },
];

function generatorWith(responses: string[], options: { exists?: (name: string) => boolean; generation?: Partial<Balance["generation"]>; trace?: (step: unknown) => void } = {}) {
  const client = createFakeClient(responses);
  const generate = createComboGenerator({
    client,
    log: () => {},
    voice: "v",
    tags: data.tags.values(),
    balance: { ...data.balance, generation: { ...data.balance.generation, pick: false, ...options.generation } },
    storybook: STORYBOOK,
    reservedIds: new Set(data.entries.keys()),
    examples: EXAMPLES,
    madeFrom: (id) => (id === "clay" ? "Mud and Fire" : null),
    exists: options.exists,
    trace: options.trace,
  });
  return { client, generate };
}

describe("when magic is in play", () => {
  it("is decided by code, from the ingredients", () => {
    expect(isWonderPair(clay, entry("life"), data.balance)).toBe(true);
    expect(isWonderPair(entry("shadow"), entry("iron"), data.balance)).toBe(true);
    expect(isWonderPair(entry("spellbook"), entry("iron"), data.balance)).toBe(true);
    expect(isWonderPair({ ...clay, wonder: true }, entry("fire"), data.balance)).toBe(true);
    expect(isWonderPair(entry("sand"), entry("water"), data.balance)).toBe(false);
    expect(isWonderPair(clay, entry("fire"), data.balance)).toBe(false);
  });
});

describe("naming an ordinary combination", () => {
  it("asks three plain questions, takes the first usable answer, then describes it", async () => {
    const { client, generate } = generatorWith([ideas("Shore", "Beach", "Sandcastle"), draft("Shore")]);
    const result = await generate(entry("sand"), entry("water"), () => null);
    expect(result.name).toBe("Shore");
    expect(result.storybook).toBeUndefined();
    expect(client.requests).toHaveLength(2);
    const [asked, describing] = client.requests;
    // Three questions of different kinds, and for each the reason is written before the name.
    const schema = JSON.stringify(asked!.jsonSchema);
    for (const question of ["made", "place", "thing"]) expect(schema).toContain(`"${question}"`);
    expect(schema.indexOf('"why"')).toBeLessThan(schema.indexOf('"name"'));
    expect(asked!.prompt).toContain("No fairy-tale creatures and no enchanted objects.");
    // The description is of that one name, and is told how the two make it.
    expect(JSON.stringify(describing!.jsonSchema)).toContain('"Shore"');
    expect(describing!.prompt).toContain("How the two make it: how the two make Shore");
    expect(describing!.prompt).toContain("nothing magical about it");
  });

  it("tells the model what a model-made thing is made from, and shows examples that resemble the pair", async () => {
    const { client, generate } = generatorWith([ideas("Brick", "Kiln", "Pot"), draft("Brick")]);
    await generate(clay, entry("tree"), () => null);
    expect(client.requests[0]!.prompt).toContain("Clay (material; tags: mineral), made from Mud and Fire: Soft earth.");
    // A hand-written thing is described well enough without its recipe.
    expect(client.requests[0]!.prompt).not.toContain("Tree (material; tags: plant), made from");
    expect(client.requests[0]!.prompt).toContain("- Tree + Tree = Forest (a great many trees together)");
    // Nothing magical went in, so no magical example is shown.
    expect(client.requests[0]!.prompt).not.toContain("Moss");
  });

  it("skips an answer the game's rules refuse, and takes the next", async () => {
    const seen: unknown[] = [];
    const { generate } = generatorWith([ideas("Mud", "Beach", "Sandcastle"), draft("Beach")], { trace: (step) => seen.push(step) });
    const result = await generate(entry("sand"), entry("water"), (value) => (value.name === "Mud" ? "Mud already exists." : null));
    expect(result.name).toBe("Beach");
    expect(seen).toEqual([
      { ideas: [], picked: null, refused: ["Mud (Mud already exists.)"] },
      { ideas: ["Beach", "Sandcastle"], picked: "Beach" },
    ]);
  });

  it("asks again, with the reasons, when the rules refuse all three", async () => {
    const { client, generate } = generatorWith([ideas("Mud", "Mud", "none"), ideas("Beach", "Coast", "Shell"), draft("Beach")]);
    const result = await generate(entry("sand"), entry("water"), (value) => (value.name === "Mud" ? "Mud already exists." : null));
    expect(result.name).toBe("Beach");
    expect(client.requests[1]!.prompt).toContain("None of those can be used. Mud (Mud already exists.) Mud (Mud already exists.) none (Give a real thing, not a blank.)");
  });

  it("fails only when no usable answer can be had at all", async () => {
    const { generate } = generatorWith([ideas("Mud", "Mud", "Mud"), ideas("Mud", "Mud", "Mud"), ideas("Mud", "Mud", "Mud")]);
    await expect(generate(entry("sand"), entry("water"), () => "No.")).rejects.toThrow(GenerationError);
  });

  it("is given a nudge when both ingredients are the same", async () => {
    const { client, generate } = generatorWith([ideas("Bonfire", "Camp", "Torch"), draft("Bonfire")]);
    await generate(entry("fire"), entry("fire"), () => null);
    expect(client.requests[0]!.prompt).toContain("Both ingredients are the same. The answer is what a great deal of Fire makes");
  });

  it("allows at most the set number of tags", async () => {
    const { client, generate } = generatorWith([ideas("Beach", "Coast", "Shore"), draft("Beach")]);
    await generate(entry("sand"), entry("water"), () => null);
    expect(JSON.stringify(client.requests[1]!.jsonSchema)).toContain(`"maxItems":${data.balance.generation.maxTags}`);
    expect(data.balance.generation.maxTags).toBeLessThanOrEqual(3);
  });

  it("never accepts a fairy-tale thing, whatever the model suggests", async () => {
    const { generate } = generatorWith([ideas("Golem", "Kiln", "Pot"), draft("Kiln")]);
    expect((await generate(clay, entry("fire"), () => null)).name).toBe("Kiln");
  });
});

describe("a result another pair already makes", () => {
  it("gives way to a new answer when there is one", async () => {
    const { generate } = generatorWith([ideas("Clay", "Beach", "Shore"), draft("Beach")], { exists: (name) => name === "Clay" });
    expect((await generate(entry("sand"), entry("water"), () => null)).name).toBe("Beach");
  });

  it("is kept when it is all there is: one thing may be made many ways", async () => {
    const { generate } = generatorWith([ideas("Clay", "Clay", "Clay"), draft("Clay")], { exists: (name) => name === "Clay" });
    expect((await generate(entry("sand"), entry("water"), () => null)).name).toBe("Clay");
  });
});

describe("naming a magical combination", () => {
  it("has the model choose from the storybook things code put on offer, and nothing else is asked", async () => {
    const { client, generate } = generatorWith([pick("Treant"), draft("Treant")]);
    const result = await generate(entry("tree"), entry("life"), () => null);
    expect(result).toMatchObject({ name: "Treant", storybook: true });
    expect(client.requests).toHaveLength(2);
    // A closed list: what a tree makes and Life wakes, or none of them. A wand is wood too, but a
    // spellbook wakes it, so it is not on offer here.
    const menu = JSON.stringify(client.requests[0]!.jsonSchema);
    for (const option of ["Treant", "Dryad", "none"]) expect(menu).toContain(`"${option}"`);
    expect(menu).not.toContain("Wand");
    expect(menu).not.toContain("Golem");
    expect(client.requests[0]!.temperature).toBe(0);
    expect(client.requests[1]!.prompt).toContain("The result is a Treant, the kind from fairy tales.");
  });

  it("makes an everyday thing touched by magic when the model declines them all", async () => {
    const { client, generate } = generatorWith([pick("none"), ideas("Sapling", "Grove", "Acorn"), draft("Sapling")]);
    const result = await generate(entry("tree"), entry("life"), () => null);
    expect(result.name).toBe("Sapling");
    expect(client.requests[1]!.prompt).toContain("Magic is in play, but the result is still an everyday, real-world thing");
    expect(client.requests[1]!.prompt).toContain("- Stone + Life = Moss (the first green on bare rock)");
    expect(client.requests[2]!.prompt).toContain("one small touch of enchantment");
  });

  it("does not ask about the storybook at all when nothing in it comes of the pair", async () => {
    const { client, generate } = generatorWith([ideas("Lantern", "Lighthouse", "Lamp"), draft("Lantern")]);
    const result = await generate(entry("iron"), entry("light"), () => null);
    expect(result.name).toBe("Lantern");
    expect(client.requests).toHaveLength(2);
    // The magic fades: what is made from it is ordinary again, unless the setting says otherwise.
    expect(result.storybook).toBeUndefined();
    const carried = generatorWith([ideas("Lantern", "Lighthouse", "Lamp"), draft("Lantern")], { generation: { charmedCarriesMagic: true } });
    expect((await carried.generate(entry("iron"), entry("light"), () => null)).storybook).toBe(true);
  });

  it("refuses a fairy-tale thing that was not on offer, even from a magical pair", async () => {
    const { generate } = generatorWith([ideas("Treant", "Geode", "Coral"), draft("Geode")]);
    expect((await generate(entry("crystal"), entry("life"), () => null)).name).toBe("Geode");
  });

  it("never offers a storybook name the game already uses, or one the rules refuse", async () => {
    // Fire and Life would make "Light" from this list, but Light is a hand-written entry.
    const reserved = generatorWith([ideas("Ember", "Hearth", "Spark"), draft("Ember")]);
    await reserved.generate(entry("fire"), entry("life"), () => null);
    expect(reserved.client.requests).toHaveLength(2);
    const refused = generatorWith([pick("Dryad"), draft("Dryad")]);
    await refused.generate(entry("tree"), entry("life"), (value) => (value.name === "Treant" ? "No." : null));
    expect(JSON.stringify(refused.client.requests[0]!.jsonSchema)).not.toContain("Treant");
  });

  it("marks a storybook result, so that what is made from it can be magical too", async () => {
    const { generate } = generatorWith([pick("Treant"), draft("Treant")]);
    const store = openStore(":memory:");
    store.addDiscovery("ann", "life");
    store.addDiscovery("ann", "tree");
    const combiner = createCombiner({ data, store, generate });
    const { entry: treant } = await combiner.combine("ann", "life", "tree");
    expect(treant).toMatchObject({ name: "Treant", wonder: true });
    expect(isWonderPair(treant, entry("fire"), data.balance)).toBe(true);
  });
});

describe("with the separate judging step switched on", () => {
  const judged = { generation: { pick: true } };

  it("has the model pick among the answers, from a closed list", async () => {
    const { client, generate } = generatorWith([ideas("Mud Pie", "Beach", "Shore"), pick("Shore"), draft("Shore")], judged);
    expect((await generate(entry("sand"), entry("water"), () => null)).name).toBe("Shore");
    for (const option of ["Mud Pie", "Beach", "Shore", "none"]) expect(JSON.stringify(client.requests[1]!.jsonSchema)).toContain(`"${option}"`);
    expect(client.requests[1]!.prompt).toContain("- Beach: where Beach is");
  });

  it("marks what another pair already makes, and asks for something new if it fits as well", async () => {
    const { client, generate } = generatorWith([ideas("Clay", "Beach", "Shore"), pick("Clay"), draft("Clay")], { ...judged, exists: (name) => name === "Clay" });
    // Still used if it is the one that makes sense.
    expect((await generate(entry("sand"), entry("water"), () => null)).name).toBe("Clay");
    expect(client.requests[1]!.prompt).toContain("- Clay: how the two make Clay (already made another way)");
    expect(client.requests[1]!.prompt).toContain("If two fit equally well, pick one that is not already made another way.");
  });

  it("goes round once more when the judge says none makes sense, and never a third time", async () => {
    const { client, generate } = generatorWith([ideas("Soup", "Sage", "Coffee"), pick("none"), ideas("Bark", "Twig", "Leaf"), pick("none"), draft("Bark")], judged);
    // Still none: the best of what there is, so the combination does not fail.
    expect((await generate(entry("salt"), entry("tree"), () => null)).name).toBe("Bark");
    expect(client.requests).toHaveLength(5);
    expect(client.requests[2]!.prompt).toContain("Not these, which were turned down: Soup, Sage, Coffee.");
  });
});

describe("a name that is only the two ingredients stuck together", () => {
  it("is told apart from a real compound", () => {
    expect(isWeld("Bloodfire", "Blood", "Fire")).toBe(true);
    expect(isWeld("Mindbook", "Mind", "Spellbook")).toBe(true);
    expect(isWeld("Firewater", "Water", "Fire")).toBe(true);
    // A sandcastle has a castle in it that neither ingredient supplied.
    expect(isWeld("Sandcastle", "Sand", "Water")).toBe(false);
    expect(isWeld("Beach", "Sand", "Water")).toBe(false);
    expect(isWeld("Tea Party", "Tea", "Person")).toBe(false);
    expect(isWeld("Catfish", "Animal", "Water")).toBe(false);
  });

  it("is told apart from an ingredient's name with a new ending, which is refused too", () => {
    for (const name of ["Salted", "Salty", "Sands", "Muddy"]) expect(isInflection(name, name.startsWith("M") ? "Mud" : name.startsWith("Sand") ? "Sand" : "Salt", "Water"), name).toBe(true);
    for (const name of ["Sandcastle", "Saltcellar", "Beach", "Salt Flat", "Airship"]) expect(isInflection(name, "Sand", "Salt"), name).toBe(false);
    // Air is too short a word to judge by: plenty of real things start with it.
    expect(isInflection("Aired", "Air", "Fire")).toBe(true);
    expect(isInflection("Tea Party", "Tea", "Person")).toBe(false);
  });

  it("is refused by the game's rules", async () => {
    const store = openStore(":memory:");
    for (const id of ["blood"]) store.addDiscovery("ann", id);
    const { generate } = generatorWith([ideas("Bloodfire", "Hearth", "Fever"), draft("Hearth")]);
    const combiner = createCombiner({ data, store, generate });
    expect((await combiner.combine("ann", "blood", "fire")).entry.name).toBe("Hearth");
  });
});
