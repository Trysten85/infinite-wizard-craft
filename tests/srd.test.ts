import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadGameData } from "../src/server/gameData";
import { createFakeClient } from "../src/server/llm/fake";
import { convertSpell, hasThinTags, type RawSpell } from "../src/server/srd/convert";
import {
  buildMaterialList,
  cleanMaterial,
  extractMaterials,
  isGeneric,
  isGrounded,
  materialId,
  parseCost,
  type Material,
  type PhraseRow,
} from "../src/server/srd/materials";

function raw(overrides: Partial<RawSpell>): RawSpell {
  return { index: "test", name: "Test", level: 1, school: { index: "evocation" }, components: ["V", "S"], ...overrides };
}

describe("convertSpell", () => {
  it("maps name, tier, school, and components", () => {
    const spell = convertSpell(
      raw({ index: "identify", name: "Identify", level: 1, school: { index: "divination" }, components: ["V", "S", "M"], material: "A pearl worth at least 100gp and an owl feather." }),
      {},
      new Map([["A pearl worth at least 100gp and an owl feather.", ["pearl", "owl-feather"]]]),
    );
    expect(spell).toEqual({
      id: "identify",
      name: "Identify",
      tier: 1,
      school: "divination",
      elements: [],
      tags: ["knowledge"],
      components: {
        verbal: true,
        somatic: true,
        material: true,
        materialText: "A pearl worth at least 100gp and an owl feather.",
        materials: ["pearl", "owl-feather"],
        costGp: 100,
        consumed: false,
      },
      source: "srd",
    });
  });

  it("tags a fire area spell and gives it the Fire element", () => {
    const spell = convertSpell(raw({ damage: [{ damage_type: { index: "fire" } }], area_of_effect: { type: "sphere" } }));
    expect(spell.tags).toEqual(["damage", "energy", "area"]);
    expect(spell.elements).toEqual(["fire"]);
  });

  it("tags damage without energy when the damage type is not elemental force", () => {
    const spell = convertSpell(raw({ school: { index: "necromancy" }, damage: [{ damage_type: { index: "necrotic" } }] }));
    expect(spell.tags).toEqual(["damage"]);
    expect(spell.elements).toEqual(["death"]);
  });

  it("tags a healing spell and gives it the Life element", () => {
    const spell = convertSpell(raw({ heal_at_slot_level: { "1": "1d8" } }));
    expect(spell.tags).toEqual(["healing"]);
    expect(spell.elements).toEqual(["life"]);
  });

  it("leaves a plain spell with only its school's default tag, which counts as thin", () => {
    const spell = convertSpell(raw({ school: { index: "transmutation" } }));
    expect(spell.tags).toEqual(["transform"]);
    expect(spell.elements).toEqual([]);
    expect(hasThinTags(spell)).toBe(true);
    expect(hasThinTags(convertSpell(raw({ school: { index: "necromancy" } })))).toBe(true);
    expect(hasThinTags(convertSpell(raw({ damage: [{}] })))).toBe(false);
  });

  it("lets a hand override replace the derived tags and elements", () => {
    const spell = convertSpell(raw({ school: { index: "transmutation" } }), { tags: ["utility"], elements: ["earth"] });
    expect(spell.tags).toEqual(["utility"]);
    expect(spell.elements).toEqual(["earth"]);
  });
});

describe("material rules", () => {
  it("reads cost and whether the component is consumed", () => {
    expect(parseCost("A tiny ball of bat guano and sulfur.")).toEqual({ costGp: null, consumed: false });
    expect(parseCost("A diamond worth at least 1,000gp, which the spell consumes.")).toEqual({ costGp: 1000, consumed: true });
    expect(parseCost("A diamond worth at least 1,000 gp and a vessel worth at least 2,000 gp.").costGp).toBe(3000);
  });

  it("accepts only materials whose words are in the phrase, ignoring plurals", () => {
    const phrase = "Diamonds worth at least 300 gp and a pinch of bat guano.";
    expect(isGrounded("diamond", phrase)).toBe(true);
    expect(isGrounded("bat guano", phrase)).toBe(true);
    expect(isGrounded("ruby", phrase)).toBe(false);
    expect(isGrounded("bat wing", phrase)).toBe(false);
  });

  it("strips amounts and spots words that are not materials", () => {
    expect(cleanMaterial("Drop of Honey")).toBe("honey");
    expect(cleanMaterial("holy water")).toBe("holy water");
    expect(isGeneric("creatures")).toBe(true);
    expect(isGeneric("bird feather")).toBe(false);
  });

  it("gives plural and singular names one id", () => {
    expect(materialId("Diamonds")).toBe("diamond");
    expect(materialId("bat guano")).toBe("bat-guano");
    expect(materialId("glass")).toBe("glass");
  });

  it("merges materials across phrases and lists the spells that use each", () => {
    const row = (spells: string[], materials: string[]): PhraseRow => ({ phrase: "x", spells, materials, costGp: null, consumed: false, status: "ok" });
    expect(buildMaterialList([row(["revivify"], ["diamonds"]), row(["raise-dead", "revivify"], ["diamond", "sulfur"])])).toEqual([
      { id: "diamond", name: "diamonds", spells: ["raise-dead", "revivify"] },
      { id: "sulfur", name: "sulfur", spells: ["raise-dead", "revivify"] },
    ]);
  });
});

describe("extractMaterials", () => {
  const phrase = "A wing feather from any bird.";
  const answer = (materials: string[]) => JSON.stringify({ materials });

  it("rerolls an invented material, then a generic one, and tells the model why", async () => {
    const client = createFakeClient([answer(["phoenix feather"]), answer(["wing feather", "bird"]), answer(["wing feather"])]);
    expect(await extractMaterials(client, () => {}, phrase)).toEqual(["wing feather"]);
    expect(client.requests[1]!.prompt).toContain("not in the phrase: phoenix feather");
    expect(client.requests[2]!.prompt).toContain("not materials by themselves: bird");
  });

  it("returns null for review when the model never passes the checks", async () => {
    const client = createFakeClient([answer(["gold"]), answer(["gold"]), answer(["gold"])]);
    expect(await extractMaterials(client, () => {}, phrase)).toBeNull();
  });
});

describe("the imported spell data", () => {
  const data = loadGameData(process.cwd());
  const spells = [...data.spells.values()];
  const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
  const materials: Material[] = read("data/srd/materials.json");
  const phrases: PhraseRow[] = read("data/srd/material-phrases.json");

  it("has all 319 SRD spells, across tiers 0 to 9 and all eight schools", () => {
    expect(spells).toHaveLength(319);
    expect(new Set(spells.map((s) => s.tier))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(new Set(spells.map((s) => s.school))).toEqual(new Set(data.schools.keys()));
    expect(spells.filter((s) => s.tier === 0)).toHaveLength(24);
  });

  it("matches the source file spell for spell", () => {
    const source: { index: string; level: number }[] = read("data/srd/source/5e-SRD-Spells.json");
    expect(source).toHaveLength(319);
    for (const item of source) expect(data.spells.get(item.index)?.tier, item.index).toBe(item.level);
  });

  it("links every material spell to materials that exist, unless its phrase is under review", () => {
    const materialIds = new Set(materials.map((m) => m.id));
    const underReview = new Set(phrases.filter((row) => row.status === "review").map((row) => row.phrase));
    for (const spell of spells) {
      const { material, materialText, materials: ids } = spell.components;
      expect(materialText !== null, spell.id).toBe(material);
      for (const id of ids) expect(materialIds.has(id), `${spell.id}: ${id}`).toBe(true);
      if (material && !underReview.has(materialText!)) expect(ids.length, spell.id).toBeGreaterThan(0);
    }
  });

  it("matches the Tag Guide for Fireball", () => {
    expect(data.spells.get("fireball")).toMatchObject({
      tier: 3,
      school: "evocation",
      elements: ["fire"],
      tags: ["damage", "energy", "area", "explosive"],
      components: { materials: ["bat-guano", "sulfur"] },
    });
  });
});
