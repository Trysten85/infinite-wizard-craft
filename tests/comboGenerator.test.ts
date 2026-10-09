import { describe, expect, it } from "vitest";
import { createCombiner } from "../src/server/combiner";
import { createComboGenerator, isWonderPair } from "../src/server/comboGenerator";
import { createFakeClient } from "../src/server/llm/fake";
import { openStore } from "../src/server/store";
import type { GameEntry } from "../src/shared/schema";
import { data } from "./helpers";

const entry = (id: string) => data.entries.get(id)!;
const clay: GameEntry = { id: "clay", name: "Clay", kind: "material", description: "Soft earth.", tags: ["mineral"], affinity: ["earth"], tier: 0, source: "generated", depth: 2, xp: 10 };
const draft = (name: string) => JSON.stringify({ name, description: "A hunched figure of packed clay.", tags: [], missingTag: null });

function generatorWith(responses: string[], storybook = ["Golem", "Ghost", "Light"]) {
  const client = createFakeClient(responses);
  const generate = createComboGenerator({
    client,
    log: () => {},
    voice: "v",
    tags: data.tags.values(),
    balance: data.balance,
    storybook,
    reservedIds: new Set(data.entries.keys()),
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

describe("naming a new combination", () => {
  it("lets a magical pair pick from the storybook menu, then describes that thing", async () => {
    const { client, generate } = generatorWith([JSON.stringify({ choice: "Golem" }), draft("Golem")]);
    const result = await generate(clay, entry("life"), () => null);
    expect(result).toMatchObject({ name: "Golem", storybook: true });
    expect(client.requests).toHaveLength(2);
    // The menu is a closed list, and never offers something the game already makes another way.
    const menu = JSON.stringify(client.requests[0]!.jsonSchema);
    expect(menu).toContain('"Golem"');
    expect(menu).toContain('"none"');
    expect(menu).not.toContain('"Light"');
    expect(client.requests[1]!.prompt).toContain("The result is a Golem");
    expect(JSON.stringify(client.requests[1]!.jsonSchema)).toContain('"Golem"');
  });

  it("makes an ordinary thing when nothing on the menu fits", async () => {
    const { client, generate } = generatorWith([JSON.stringify({ choice: "none" }), draft("Lantern")]);
    const result = await generate(entry("iron"), entry("light"), () => null);
    expect(result.name).toBe("Lantern");
    expect(result.storybook).toBeUndefined();
    expect(client.requests[1]!.prompt).toContain("ordinary, real-world thing");
  });

  it("never shows the menu for an ordinary pair", async () => {
    const { client, generate } = generatorWith([draft("Beach")]);
    const result = await generate(entry("sand"), entry("water"), () => null);
    expect(result.name).toBe("Beach");
    expect(client.requests).toHaveLength(1);
    expect(client.requests[0]!.prompt).toContain("No fairy-tale creatures");
  });

  it("falls back to an ordinary thing when the rules refuse the storybook pick", async () => {
    const { client, generate } = generatorWith([JSON.stringify({ choice: "Ghost" }), draft("Fog")]);
    const result = await generate(entry("person"), entry("shadow"), (value) => (value.name === "Ghost" ? "taken" : null));
    expect(result.name).toBe("Fog");
    expect(client.requests[1]!.prompt).toContain("ordinary, real-world thing");
  });

  it("marks a storybook result, so that what is made from it can be storybook too", async () => {
    const { generate } = generatorWith([JSON.stringify({ choice: "Golem" }), draft("Golem")]);
    const store = openStore(":memory:");
    store.addDiscovery("ann", "life");
    store.addDiscovery("ann", "tree");
    const combiner = createCombiner({ data, store, generate });
    const { entry: golem } = await combiner.combine("ann", "life", "tree");
    expect(golem).toMatchObject({ name: "Golem", wonder: true });
    expect(isWonderPair(golem, entry("fire"), data.balance)).toBe(true);
  });
});

describe("a second look at a repeat", () => {
  it("tells the menu pick that the thing is already made, and to choose it again only if it is the best fit", async () => {
    const { client, generate } = generatorWith([JSON.stringify({ choice: "none" }), draft("Statue")]);
    const result = await generate(clay, entry("life"), () => null, "Golem");
    expect(result.name).toBe("Statue");
    expect(client.requests[0]!.prompt).toContain("Golem is already made from other things. Pick it again only if it is plainly the best fit");
    // With no storybook pick, the ordinary prompt has ruled fairy-tale things out and does not bring one up.
    expect(client.requests[1]!.prompt).not.toContain("Golem");
  });

  it("tells an ordinary pair the same, in the ordinary prompt", async () => {
    const { client, generate } = generatorWith([draft("Shore")]);
    await generate(entry("sand"), entry("water"), () => null, "Beach");
    expect(client.requests[0]!.prompt).toContain("Beach is already made from other things. If a different thing fits these two just as well, give that instead.");
    expect(client.requests[0]!.prompt).toContain("give it again");
  });

  it("says nothing of the kind the first time", async () => {
    const { client, generate } = generatorWith([JSON.stringify({ choice: "Golem" }), draft("Golem")]);
    await generate(clay, entry("life"), () => null);
    for (const request of client.requests) expect(request.prompt).not.toContain("already made");
  });
});

describe("the storybook menu", () => {
  it("is a list of well-known names, none of them already something else in the game", () => {
    expect(data.storybook.length).toBeGreaterThan(50);
    expect(new Set(data.storybook).size).toBe(data.storybook.length);
    for (const name of data.storybook) expect(name.split(" ").length, name).toBeLessThanOrEqual(2);
  });
});
