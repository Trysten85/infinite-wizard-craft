import { describe, expect, it } from "vitest";
import { createCombiner, isInflection } from "../src/server/combiner";
import { pairShare } from "../src/server/comboContext";
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
    // The whimsy dial is off unless a test turns it on, so the same pair always reads the same here.
    balance: { ...data.balance, generation: { ...data.balance.generation, pick: false, naming: "questions", twistShare: 0, ...options.generation } },
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
    // The naming step goes by names alone, with what a model-made thing came from. The joke
    // descriptions of the hand-written things would only send it astray.
    expect(client.requests[0]!.prompt).toContain("1. Clay (made from Mud and Fire)\n2. Tree (a growing tree, and its wood)\n");
    expect(client.requests[0]!.prompt).not.toContain(entry("tree").description);
    // The step that writes the description goes by names too, so it writes about the new thing.
    expect(client.requests[1]!.prompt).toContain("1. Clay (made from Mud and Fire)\n2. Tree (a growing tree, and its wood)\n");
    expect(client.requests[1]!.prompt).not.toContain(entry("tree").description);
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

describe("naming by the one word alone", () => {
  const thin = { generation: { naming: "word" as const } };
  const word = (name: string) => JSON.stringify({ name });

  it("asks for the name and nothing else, then describes it", async () => {
    const { client, generate } = generatorWith([word("Beach"), draft("Beach")], thin);
    expect((await generate(entry("sand"), entry("water"), () => null)).name).toBe("Beach");
    expect(client.requests).toHaveLength(2);
    const [asked, describing] = client.requests;
    expect(Object.keys((asked!.jsonSchema as { properties: object }).properties)).toEqual(["name"]);
    expect(asked!.temperature).toBe(0);
    // One worked example, and no list of others.
    expect(asked!.system).toContain("Fire + Water = Steam");
    expect(asked!.prompt).not.toContain("Good answers to other pairs");
    expect(asked!.prompt).toContain("No fairy-tale creatures and no enchanted objects.");
    expect(describing!.prompt).not.toContain("How the two make it");
  });

  it("sends a refused name back with the reason", async () => {
    const { client, generate } = generatorWith([word("Mud"), word("Beach"), draft("Beach")], thin);
    const result = await generate(entry("sand"), entry("water"), (value) => (value.name === "Mud" ? "Mud already exists." : null));
    expect(result.name).toBe("Beach");
    expect(client.requests[1]!.prompt).toContain("Your previous answer was rejected: Mud already exists.");
  });

  it("leaves the storybook step as it is", async () => {
    const { client, generate } = generatorWith([pick("Treant"), draft("Treant")], thin);
    expect(await generate(entry("tree"), entry("life"), () => null)).toMatchObject({ name: "Treant", storybook: true });
    expect(client.requests).toHaveLength(2);
    const declined = generatorWith([pick("none"), word("Sapling"), draft("Sapling")], thin);
    expect((await declined.generate(entry("tree"), entry("life"), () => null)).name).toBe("Sapling");
    expect(declined.client.requests[1]!.prompt).toContain("Magic is in play");
  });
});

describe("the call that decides what a thing is", () => {
  it("can be given a model that thinks harder than the rest", async () => {
    const naming = createFakeClient([JSON.stringify({ name: "Beach" })]);
    const rest = createFakeClient([draft("Beach")]);
    const generate = createComboGenerator({
      client: rest,
      namingClient: naming,
      log: () => {},
      voice: "v",
      tags: data.tags.values(),
      balance: { ...data.balance, generation: { ...data.balance.generation, naming: "word" } },
    });
    await generate(entry("sand"), entry("water"), () => null);
    expect(naming.requests).toHaveLength(1);
    expect(rest.requests).toHaveLength(1);
  });
});

describe("tags handed down by code", () => {
  const tagsOffered = (request: { jsonSchema: unknown }) =>
    (request.jsonSchema as { properties: { tags: { items: { enum: string[] } } } }).properties.tags.items.enum;

  it("offers a material tag only if one of the ingredients carries it", async () => {
    const { client, generate } = generatorWith([ideas("Beach", "Coast", "Shore"), draft("Beach")]);
    await generate(entry("sand"), entry("water"), () => null);
    const offered = tagsOffered(client.requests[1]!);
    // Sand is a mineral and a reagent, and water is a liquid. Nothing here is metal, plant, or animal.
    for (const tag of ["mineral", "reagent", "liquid"]) expect(offered).toContain(tag);
    for (const tag of ["metal", "plant", "animal", "toxic"]) expect(offered).not.toContain(tag);
    // What a thing does is still the model's to say.
    for (const tag of ["utility", "area", "forging"]) expect(offered).toContain(tag);
    // Author-only tags are never on offer.
    expect(offered).not.toContain("rare");
    expect(client.requests[1]!.prompt).toContain("- liquid: ");
    expect(client.requests[1]!.prompt).not.toContain("- metal: ");
  });

  it("refuses an answer that uses one anyway", async () => {
    const { generate } = generatorWith([ideas("Beach", "Coast", "Shore"), draft("Beach", ["metal"]), draft("Beach", ["mineral"])]);
    expect((await generate(entry("sand"), entry("water"), () => null)).tags).toEqual(["mineral"]);
  });
});

describe("the whimsy dial", () => {
  const things = [...data.entries.values()].filter((item) => item.kind === "material" || item.kind === "element");

  it("gives a pair the same number every time, whichever way round", () => {
    expect(pairShare(entry("sand"), entry("water"))).toBe(pairShare(entry("water"), entry("sand")));
    expect(pairShare(entry("sand"), entry("water"))).toBeGreaterThanOrEqual(0);
    expect(pairShare(entry("sand"), entry("water"))).toBeLessThan(1);
  });

  it("marks about a quarter of pairs at the setting the game ships with", () => {
    const share = data.balance.generation.twistShare;
    expect(share).toBe(0.25);
    let marked = 0;
    let total = 0;
    for (const a of things) for (const b of things) if (a.id <= b.id) (total++, pairShare(a, b) < share && marked++);
    expect(marked / total).toBeGreaterThan(0.18);
    expect(marked / total).toBeLessThan(0.32);
  });

  it("asks for one playful twist in the words, and changes nothing else", async () => {
    const plain = generatorWith([ideas("Beach", "Coast", "Shore"), draft("Beach")], { generation: { twistShare: 0 } });
    const marked = generatorWith([ideas("Beach", "Coast", "Shore"), draft("Beach")], { generation: { twistShare: 1 } });
    const [a, b] = [await plain.generate(entry("sand"), entry("water"), () => null), await marked.generate(entry("sand"), entry("water"), () => null)];
    expect(plain.client.requests[1]!.prompt).toContain("Describe it plainly.");
    expect(marked.client.requests[1]!.prompt).toContain("one playful twist");
    expect(marked.client.requests[1]!.prompt).toContain("Nothing magical has happened to it.");
    // Same name, same tags on offer, and it is not counted as magical.
    expect(b.name).toBe(a.name);
    expect(marked.client.requests[1]!.jsonSchema).toEqual(plain.client.requests[1]!.jsonSchema);
    expect(b.storybook).toBeUndefined();
    // The naming step is not told about it at all.
    expect(marked.client.requests[0]!.prompt).toBe(plain.client.requests[0]!.prompt);
  });

  it("leaves magical pairs to their own rules", async () => {
    const { client, generate } = generatorWith([ideas("Lantern", "Lighthouse", "Lamp"), draft("Lantern")], { generation: { twistShare: 1 } });
    await generate(entry("iron"), entry("light"), () => null);
    expect(client.requests[1]!.prompt).toContain("one small touch of enchantment");
    expect(client.requests[1]!.prompt).not.toContain("one playful twist");
  });
});

describe("a description that runs on", () => {
  it("is sent back by the game's rules until it is short", async () => {
    const long = JSON.stringify({ name: "Beach", description: "Sand by the sea. It is warm. It is wide.", tags: [], missingTag: null });
    const { client, generate } = generatorWith([ideas("Beach", "Coast", "Shore"), long, draft("Beach")]);
    const store = openStore(":memory:");
    store.addDiscovery("ann", "sand");
    const { entry: beach } = await createCombiner({ data, store, generate }).combine("ann", "sand", "water");
    expect(beach.description).toBe("A hunched figure of packed clay.");
    expect(client.requests[2]!.prompt).toContain("The description is too long.");
    expect(data.balance.generation.maxSentences).toBe(2);
    expect(client.requests[1]!.system).toContain("Never more than 2.");
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

describe("a name that only says what went in", () => {
  it("is refused when it is an ingredient's name with a new ending", () => {
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
