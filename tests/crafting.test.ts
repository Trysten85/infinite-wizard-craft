import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { createBlocklist } from "../src/server/blocklist";
import { createCombiner } from "../src/server/combiner";
import { assignKeys, candidatesFor, existingMatches, type KeyCandidate } from "../src/server/crafting/keys";
import { checkMaterialDraft, draftMaterialRecipe, validPartners, withReagent, type DraftRules } from "../src/server/crafting/materials";
import { buildGameData, loadGameData } from "../src/server/gameData";
import { createFakeClient } from "../src/server/llm/fake";
import { openStore } from "../src/server/store";
import { comboKey, type SpellMaterial, type SpellRecipe } from "../src/shared/schema";

const data = loadGameData(process.cwd());
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));

// The real hand-written data, with the given drafted rows in place of the files on disk.
function build(spellRecipes: SpellRecipe[], spellMaterials: SpellMaterial[] = []) {
  return buildGameData({
    balance: read("config/balance.json"),
    tags: read("data/tags.json"),
    schools: read("data/schools.json"),
    entries: read("data/entries.json"),
    combos: read("data/combos.json"),
    spells: read("data/spells.json"),
    ladders: read("data/ladders.json"),
    jobs: read("data/jobs.json"),
    spellRecipes,
    spellMaterials,
  });
}

const recipe = (spell: string, key: string | null, status: SpellRecipe["status"] = "ok"): SpellRecipe => ({ spell, key, keySource: "hand", status });
const material = (overrides: Partial<SpellMaterial> = {}): SpellMaterial => ({
  id: "mica",
  name: "Mica",
  description: "Flakes that catch the light.",
  tags: ["reagent", "mineral"],
  inputs: ["sand", "shadow"],
  logic: "x",
  forSpells: ["shatter"],
  status: "ok",
  ...overrides,
});

describe("choosing a key", () => {
  const ids = ["iron", "bat", "feather", "bone-dust", "fire", "earth"];

  it("recognises a component that is a form of an existing entry", () => {
    expect(existingMatches("iron powder", ids)).toEqual(["iron"]);
    expect(existingMatches("bat fur", ids)).toEqual(["bat"]);
    expect(existingMatches("white feathers", ids)).toEqual(["feather"]);
    expect(existingMatches("pinch of bone dust", ids)).toEqual(["bone-dust"]);
    expect(existingMatches("forked twig", ids)).toEqual([]);
  });

  it("orders candidates: named component, judged component, new material, own element, ranked element", () => {
    const spell = { ...data.spells.get("fireball")!, elements: ["fire"], components: { ...data.spells.get("fireball")!.components, materials: ["iron-powder", "yew-leaf", "mica"] } };
    const candidates = candidatesFor(spell, {
      materialNames: new Map([["iron-powder", "iron powder"], ["yew-leaf", "yew leaf"], ["mica", "mica"]]),
      keyEntryIds: [...ids, "tree"],
      elementRanking: ["earth", "fire"],
      sameAs: new Map([["yew leaf", "tree"]]),
    });
    expect(candidates.map((c) => [c.key, c.source])).toEqual([
      ["iron", "component"],
      ["tree", "component"],
      ["mica", "new-material"],
      ["fire", "own-element"],
      ["earth", "ranked-element"],
    ]);
    expect(candidates.map((c) => c.cost)).toEqual([...candidates.map((c) => c.cost)].sort((a, b) => a - b));
  });

  const option = (key: string, cost: number): KeyCandidate => ({ key, source: "component", cost, note: "" });

  it("gives every spell in a group a different key at the lowest total cost", () => {
    const assigned = assignKeys([
      { id: "a", candidates: [option("iron", 0), option("fire", 20)] },
      { id: "b", candidates: [option("iron", 0)] },
      { id: "c", candidates: [option("fire", 20), option("air", 31)] },
    ]);
    expect([assigned.get("a")?.key, assigned.get("b")?.key, assigned.get("c")?.key]).toEqual(["fire", "iron", "air"]);
  });

  it("skips keys already taken and reports a spell it cannot place", () => {
    const assigned = assignKeys([{ id: "a", candidates: [option("iron", 0), option("fire", 20)] }, { id: "b", candidates: [option("iron", 0)] }], new Set(["iron"]));
    expect(assigned.get("a")?.key).toBe("fire");
    expect(assigned.get("b")).toBeNull();
  });
});

describe("material drafts", () => {
  const ingredients = new Map(["fire", "earth", "sand", "tree", "bat", "light"].map((id) => [id, data.entries.get(id)!]));
  const rules: DraftRules = { ingredients, usedPairs: new Set(data.combos.keys()), depthBand: [2, 4], blocklist: createBlocklist(["Velica"]) };
  const draft = (inputs: [string, string], description = "Flakes that catch the light.") => ({ inputs, logic: "x", description, tags: [] });

  it("accepts an unused pair that lands inside the depth band", () => {
    expect(checkMaterialDraft(draft(["sand", "light"]), rules)).toBeNull();
  });

  it("rejects a used pair, a wrong depth, an unknown or repeated ingredient, and bad text", () => {
    expect(checkMaterialDraft(draft(["sand", "fire"]), rules)).toMatch(/already make something else/);
    expect(checkMaterialDraft(draft(["sand", "earth"]), { ...rules, depthBand: [3, 4] })).toMatch(/too easy/);
    expect(checkMaterialDraft(draft(["bat", "light"]), rules)).toMatch(/too hard/);
    expect(checkMaterialDraft(draft(["sand", "mercury"]), rules)).toMatch(/from the list/);
    expect(checkMaterialDraft(draft(["sand", "sand"]), rules)).toMatch(/different/);
    expect(checkMaterialDraft(draft(["sand", "light"], "Mined by Velica."), rules)).toMatch(/proper name/);
    expect(checkMaterialDraft(draft(["sand", "light"], "Worth 3 coppers."), rules)).toMatch(/digits/);
  });

  it("only offers partners that keep the recipe valid", () => {
    const partners = validPartners(ingredients.get("sand")!, rules).map((entry) => entry.id);
    expect(partners).toEqual(["earth", "tree", "light"]);
    for (const id of partners) expect(checkMaterialDraft(draft(["sand", id]), rules)).toBeNull();
  });

  it("always tags a spell component as a reagent", () => {
    expect(withReagent(["mineral"])).toEqual(["reagent", "mineral"]);
    expect(withReagent(["reagent", "metal"])).toEqual(["reagent", "metal"]);
  });

  const deps = (responses: string[]) => {
    const client = createFakeClient(responses);
    return { client, log: () => {}, voice: "v", tags: [...data.tags.values()] };
  };

  it("drafts a recipe in two steps, offering the model only valid partners", async () => {
    const model = deps([
      JSON.stringify({ ingredient: "sand" }),
      JSON.stringify({ partner: "light", logic: "Sand that splits the light.", description: "Flakes that catch the light.", tags: ["mineral"] }),
    ]);
    const result = await draftMaterialRecipe(model, { name: "Mica", usedFor: ["Shatter"] }, rules);
    expect(result).toEqual({ inputs: ["sand", "light"], logic: "Sand that splits the light.", description: "Flakes that catch the light.", tags: ["reagent", "mineral"] });
    const offered = JSON.stringify(model.client.requests[1]!.jsonSchema);
    expect(offered).toContain('"tree"');
    expect(offered).not.toContain('"fire"');
  });

  it("returns nothing when the model says no ingredient fits", async () => {
    expect(await draftMaterialRecipe(deps([JSON.stringify({ ingredient: "none" })]), { name: "Mica", usedFor: [] }, rules)).toBeNull();
  });
});

describe("loading drafted rows", () => {
  it("ignores drafts and rows under review", () => {
    const built = build([recipe("thunderwave", "air", "draft"), recipe("magic-missile", "shadow", "review")], [material({ status: "draft" })]);
    expect(built.entries.has("spell-thunderwave")).toBe(false);
    expect(built.entries.has("spell-magic-missile")).toBe(false);
    expect(built.entries.has("mica")).toBe(false);
  });

  it("makes an approved spell from any lower spell of its school plus its key", () => {
    const built = build([recipe("thunderwave", "air")]);
    expect(built.entries.get("spell-thunderwave")).toMatchObject({ kind: "spell", school: "evocation", tier: 1 });
    expect(built.combos.get(comboKey("spell-fire-bolt", "air"))!.result).toBe("spell-thunderwave");
    expect(built.combos.get(comboKey("spell-ray-of-frost", "air"))!.result).toBe("spell-thunderwave");
  });

  it("makes an approved cantrip from its school plus its key", () => {
    const built = build([recipe("thaumaturgy", "sound")]);
    expect(built.combos.get(comboKey("transmutation", "sound"))!.result).toBe("spell-thaumaturgy");
    expect(built.entries.get("spell-thaumaturgy")).toMatchObject({ kind: "spell", tier: 0 });
  });

  it("makes an approved material a real entry, with depth and tier worked out by code", () => {
    const built = build([], [material()]);
    expect(built.entries.get("mica")).toMatchObject({ kind: "material", depth: 3, tier: 1, affinity: ["earth", "air", "shadow"] });
    expect(built.combos.get(comboKey("sand", "shadow"))!.result).toBe("mica");
  });

  it("keeps a spell out of play while its key material is not approved", () => {
    const waiting = build([recipe("shatter", "mica")], [material({ status: "draft" })]);
    expect(waiting.entries.has("spell-shatter")).toBe(false);
    const live = build([recipe("shatter", "mica")], [material()]);
    expect(live.entries.get("spell-shatter")!.depth).toBeGreaterThan(live.entries.get("mica")!.depth);
  });

  it("refuses two approved spells of one school and tier with the same key", () => {
    expect(() => build([recipe("thunderwave", "air"), recipe("magic-missile", "air")])).toThrow(/defined twice/);
  });

  it("refuses an approved row that is incomplete or reuses a pair", () => {
    expect(() => build([recipe("thunderwave", null)])).toThrow(/has no key/);
    expect(() => build([recipe("thunderwave", "no-such-thing")])).toThrow(/unknown key/);
    expect(() => build([], [material({ inputs: null })])).toThrow(/has no recipe/);
    expect(() => build([], [material({ inputs: ["sand", "fire"] })])).toThrow(/defined twice/);
  });
});

describe("playing an approved spell recipe", () => {
  let combiner: ReturnType<typeof createCombiner>;
  beforeEach(() => {
    const generate = async () => {
      throw new Error("the model must not be called");
    };
    combiner = createCombiner({ data: build([recipe("thunderwave", "air")]), store: openStore(":memory:"), generate });
  });

  it("needs a focus, then makes the spell from a lower spell and the key", async () => {
    for (const [a, b] of [["fire", "air"], ["fire", "light"]]) await combiner.combine("ann", a!, b!);
    await expect(combiner.combine("ann", "fire", "evocation")).rejects.toMatchObject({ code: "no-focus" });
    for (const [a, b] of [["water", "earth"], ["mud", "light"], ["earth", "life"], ["tree", "light"], ["fire", "evocation"]]) {
      await combiner.combine("ann", a!, b!);
    }
    expect((await combiner.combine("ann", "spell-fire-bolt", "air")).entry.id).toBe("spell-thunderwave");
    await expect(combiner.combine("ann", "spell-fire-bolt", "water")).rejects.toMatchObject({ code: "no-result" });
  });
});

describe("the drafted files on disk", () => {
  const recipes: SpellRecipe[] = read("data/spell-recipes.json");

  it("name real spells and give each a different key within its school and tier", () => {
    const seen = new Set<string>();
    for (const row of recipes) {
      const spell = data.spells.get(row.spell);
      expect(spell, row.spell).toBeDefined();
      if (!row.key) continue;
      const slot = `${spell!.school} ${spell!.tier} ${row.key}`;
      expect(seen.has(slot), slot).toBe(false);
      seen.add(slot);
    }
  });
});
