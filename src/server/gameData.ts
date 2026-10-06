import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  balanceSchema,
  comboKey,
  comboSchema,
  entrySchema,
  jobSchema,
  ladderSchema,
  questSchema,
  schoolSchema,
  spellEntryId,
  spellMaterialSchema,
  spellRecipeSchema,
  spellSchema,
  tagSchema,
  type Balance,
  type Combo,
  type Entry,
  type GameEntry,
  type Job,
  type Ladder,
  type Quest,
  type School,
  type Spell,
  type SpellMaterial,
  type SpellRecipe,
  type Tag,
} from "../shared/schema";

export type GameData = {
  balance: Balance;
  tags: Map<string, Tag>;
  schools: Map<string, School>;
  entries: Map<string, GameEntry>;
  spells: Map<string, Spell>;
  jobs: Map<string, Job>;
  quests: Quest[];
  // comboKey -> what the pair makes, and anything else the player must have discovered first
  combos: Map<string, Recipe>;
};

export type Recipe = { inputs: [string, string]; result: string; needs: string[] };

function readJson<T>(path: string, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) throw new Error(`${path} is invalid:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

export const SPELL_RECIPES_FILE = "data/spell-recipes.json";
export const SPELL_MATERIALS_FILE = "data/spell-materials.json";

export function readOptional<T>(path: string, schema: z.ZodType<T[]>): T[] {
  return existsSync(path) ? readJson(path, schema) : [];
}

export function tierForDepth(depth: number, balance: Balance): number {
  return Math.floor(depth / balance.depthPerTier);
}

export function xpForTier(tier: number, balance: Balance): number {
  const table = balance.discoveryXpByTier;
  return table[Math.min(tier, table.length - 1)]!;
}

// Depth is how many combos an entry sits from the starting entries, by its shortest recipe.
// A recipe's needs count too, so a spell is at least one step deeper than its components.
export function computeDepths(
  entries: Entry[],
  combos: (Combo & { needs?: string[] })[],
  starting: string[],
): Map<string, number> {
  const depths = new Map<string, number>(starting.map((id) => [id, 0]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const combo of combos) {
      const required = [...combo.inputs, ...(combo.needs ?? [])].map((id) => depths.get(id));
      if (required.some((depth) => depth === undefined)) continue;
      const depth = Math.max(...(required as number[])) + 1;
      if (depth < (depths.get(combo.result) ?? Infinity)) {
        depths.set(combo.result, depth);
        changed = true;
      }
    }
  }
  const unreachable = entries.filter((e) => !depths.has(e.id)).map((e) => e.id);
  if (unreachable.length > 0) {
    throw new Error(`entries with no route from the starting set: ${unreachable.join(", ")}`);
  }
  return depths;
}

export function buildGameData(raw: {
  balance: Balance;
  tags: Tag[];
  schools: School[];
  entries: Entry[];
  combos: Combo[];
  spells?: Spell[];
  ladders?: Ladder[];
  spellRecipes?: SpellRecipe[];
  spellMaterials?: SpellMaterial[];
  jobs?: Job[];
  quests?: Quest[];
}): GameData {
  const { balance, tags, schools, combos, spells = [], ladders = [], spellRecipes = [], spellMaterials = [], jobs = [], quests = [] } = raw;
  const problems: string[] = [];
  const spellsById = new Map(spells.map((spell) => [spell.id, spell]));

  // Drafted materials and spell recipes only count once a human has marked them "ok".
  const liveMaterials = spellMaterials.filter((row) => row.status === "ok");
  for (const row of liveMaterials) {
    if (!row.inputs) problems.push(`material "${row.id}" is marked ok but has no recipe`);
    if (!row.description) problems.push(`material "${row.id}" is marked ok but has no description`);
  }
  const materialEntries: Entry[] = liveMaterials.map((row) => {
    const parents = (row.inputs ?? []).map((id) => raw.entries.find((entry) => entry.id === id));
    return {
      id: row.id,
      name: row.name,
      kind: "material",
      description: row.description || row.name,
      tags: row.tags,
      affinity: [...new Set(parents.flatMap((parent) => parent?.affinity ?? []))].slice(0, 3),
      tier: 0,
      source: "authored",
    };
  });
  const jobEntries: Entry[] = jobs.map((job) => ({
    id: job.id,
    name: job.name,
    kind: "job",
    description: job.description,
    tags: job.tags,
    affinity: [],
    tier: 0,
    source: "authored",
  }));
  const derivedTier = new Set([...materialEntries, ...jobEntries].map((entry) => entry.id));
  const keyIds = new Set([...raw.entries, ...materialEntries].map((entry) => entry.id));
  const draftIds = new Set(spellMaterials.map((row) => row.id));
  const liveRecipes = spellRecipes.filter((row) => {
    if (row.status !== "ok") return false;
    if (!row.key) problems.push(`spell recipe "${row.spell}" is marked ok but has no key`);
    else if (!keyIds.has(row.key) && !draftIds.has(row.key)) problems.push(`spell recipe "${row.spell}" has unknown key "${row.key}"`);
    // A key that is still a draft material keeps the spell out of play without being an error.
    return row.key !== null && keyIds.has(row.key);
  });

  // Schools and the spells in play are discovered like anything else, so they become entries.
  const schoolEntries: Entry[] = schools.map((school) => ({
    id: school.id,
    name: school.name,
    kind: "school",
    description: school.description,
    tags: school.tags,
    affinity: school.naturalElements,
    tier: 0,
    source: "authored",
  }));
  const prefix = spellEntryId("");
  const spellIdsInPlay = new Set([
    ...ladders.map((ladder) => ladder.spell),
    ...liveRecipes.map((row) => row.spell),
    ...combos
      .flatMap((combo) => [...combo.inputs, combo.result])
      .filter((id) => id.startsWith(prefix))
      .map((id) => id.slice(prefix.length)),
  ]);
  const spellEntries: Entry[] = [];
  for (const id of spellIdsInPlay) {
    const spell = spellsById.get(id);
    if (!spell) {
      problems.push(`"${id}" is used as a spell but is not in data/spells.json`);
      continue;
    }
    const school = schools.find((s) => s.id === spell.school)?.name ?? spell.school;
    spellEntries.push({
      id: spellEntryId(spell.id),
      name: spell.name,
      kind: "spell",
      description: spell.tier === 0 ? `A cantrip of the ${school} school.` : `A tier ${spell.tier} spell of the ${school} school.`,
      tags: spell.tags,
      affinity: spell.elements,
      school: spell.school,
      tier: spell.tier,
      source: spell.source,
    });
  }
  const entries = [...raw.entries, ...materialEntries, ...schoolEntries, ...spellEntries, ...jobEntries];
  const tagMap = new Map(tags.map((tag) => [tag.id, tag]));
  if (tagMap.size !== tags.length) problems.push("the tag vocabulary lists a tag twice");
  const entryIds = new Set<string>();
  const schoolIds = new Set(schools.map((s) => s.id));
  const elementIds = new Set(entries.filter((e) => e.kind === "element").map((e) => e.id));

  for (const entry of entries) {
    if (entryIds.has(entry.id)) problems.push(`duplicate entry id "${entry.id}"`);
    entryIds.add(entry.id);
    for (const tag of entry.tags) {
      if (!tagMap.has(tag)) problems.push(`entry "${entry.id}" uses unknown tag "${tag}"`);
    }
    for (const affinity of entry.affinity) {
      if (!elementIds.has(affinity) && !schoolIds.has(affinity)) {
        problems.push(`entry "${entry.id}" has affinity "${affinity}", which is not an element or school`);
      }
    }
  }
  for (const school of schools) {
    for (const tag of school.tags) {
      if (!tagMap.has(tag)) problems.push(`school "${school.id}" uses unknown tag "${tag}"`);
    }
  }
  const spellMap = new Map<string, Spell>();
  for (const spell of spells) {
    if (spellMap.has(spell.id)) problems.push(`duplicate spell id "${spell.id}"`);
    spellMap.set(spell.id, spell);
    if (!schoolIds.has(spell.school)) problems.push(`spell "${spell.id}" has unknown school "${spell.school}"`);
    for (const tag of spell.tags) {
      if (!tagMap.has(tag)) problems.push(`spell "${spell.id}" uses unknown tag "${tag}"`);
    }
    for (const element of spell.elements) {
      if (!elementIds.has(element)) problems.push(`spell "${spell.id}" has unknown element "${element}"`);
    }
  }
  for (const id of balance.startingEntries) {
    if (!entryIds.has(id)) problems.push(`starting entry "${id}" does not exist`);
  }

  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const recipes: Recipe[] = combos.map((combo) => ({ inputs: combo.inputs, result: combo.result, needs: [] }));

  // A hand-written combo that makes a spell is a cantrip seed: one element plus that spell's school.
  for (const combo of combos) {
    const result = entryById.get(combo.result);
    if (result?.kind !== "spell") continue;
    const kinds = combo.inputs.map((id) => entryById.get(id)?.kind).sort();
    const key = comboKey(...combo.inputs);
    if (kinds.join("+") !== "element+school") problems.push(`combo ${key} makes a spell, so it must be an element and a school`);
    else if (!combo.inputs.includes(result.school!)) problems.push(`combo ${key} makes ${result.name}, which belongs to ${result.school}`);
    else if (result.tier !== 0) problems.push(`combo ${key} makes ${result.name}, which is tier ${result.tier}, not a cantrip`);
  }

  // Each ladder rung becomes: the school + any spell of that school one tier lower = the rung's spell.
  for (const ladder of [...ladders].sort((a, b) => a.tier - b.tier)) {
    const label = `ladder ${ladder.school} tier ${ladder.tier}`;
    const spell = spellsById.get(ladder.spell);
    if (!spell) continue;
    if (!schoolIds.has(ladder.school)) problems.push(`${label} names an unknown school`);
    if (spell.school !== ladder.school) problems.push(`${label}: ${spell.name} belongs to ${spell.school}`);
    if (spell.tier !== ladder.tier) problems.push(`${label}: ${spell.name} is tier ${spell.tier}`);
    for (const need of ladder.needs) {
      if (!entryIds.has(need)) problems.push(`${label} needs unknown entry "${need}"`);
    }
    const lower = spellEntries.filter((entry) => entry.school === ladder.school && entry.tier === ladder.tier - 1);
    if (lower.length === 0) problems.push(`${label} has no tier ${ladder.tier - 1} spell to climb from`);
    for (const from of lower) {
      recipes.push({ inputs: [ladder.school, from.id], result: spellEntryId(spell.id), needs: ladder.needs });
    }
  }

  for (const row of liveMaterials) {
    if (row.inputs) recipes.push({ inputs: row.inputs, result: row.id, needs: [] });
  }
  for (const job of jobs) {
    recipes.push({ inputs: job.inputs, result: job.id, needs: [] });
    if (job.orAnySpellTagged) {
      if (!tagMap.has(job.orAnySpellTagged)) problems.push(`job "${job.id}" names unknown tag "${job.orAnySpellTagged}"`);
      const others = spellEntries.filter((entry) => entry.tags.includes(job.orAnySpellTagged!) && entry.id !== job.inputs[1]);
      for (const spell of others) recipes.push({ inputs: [job.inputs[0], spell.id], result: job.id, needs: [] });
    }
    for (const tag of job.wantedTags) {
      if (!tagMap.has(tag)) problems.push(`job "${job.id}" wants unknown tag "${tag}"`);
    }
  }

  // A drafted spell recipe: any spell of the school one tier lower + the spell's key.
  // A cantrip has no lower spell, so it is the school itself + the key.
  for (const row of liveRecipes) {
    const spell = spellsById.get(row.spell);
    if (!spell) continue;
    const key = entryById.get(row.key!);
    if (key?.kind !== "element" && key?.kind !== "material") {
      problems.push(`spell recipe "${row.spell}": the key must be an element or a material`);
      continue;
    }
    if (spell.tier === 0) {
      recipes.push({ inputs: [spell.school, key.id], result: spellEntryId(spell.id), needs: [] });
      continue;
    }
    const lower = spellEntries.filter((entry) => entry.school === spell.school && entry.tier === spell.tier - 1);
    if (lower.length === 0) problems.push(`spell recipe "${row.spell}" has no tier ${spell.tier - 1} ${spell.school} spell to build on`);
    for (const from of lower) recipes.push({ inputs: [from.id, key.id], result: spellEntryId(spell.id), needs: [] });
  }

  for (const quest of quests) {
    if (quest.done.type === "has-entry" && !entryIds.has(quest.done.entry)) {
      problems.push(`quest "${quest.id}" asks for unknown entry "${quest.done.entry}"`);
    }
    if (quest.done.type === "has-tag" && !tagMap.has(quest.done.tag)) {
      problems.push(`quest "${quest.id}" asks for unknown tag "${quest.done.tag}"`);
    }
  }

  const comboMap = new Map<string, Recipe>();
  for (const recipe of recipes) {
    const key = comboKey(...recipe.inputs);
    for (const id of [...recipe.inputs, recipe.result]) {
      if (!entryIds.has(id)) problems.push(`combo ${key} refers to unknown entry "${id}"`);
    }
    if (comboMap.has(key)) problems.push(`combo ${key} is defined twice`);
    comboMap.set(key, recipe);
  }
  if (problems.length > 0) throw new Error(`game data is invalid:\n- ${problems.join("\n- ")}`);

  const depths = computeDepths(entries, recipes, balance.startingEntries);
  const entryMap = new Map<string, GameEntry>();
  for (const entry of entries) {
    const depth = depths.get(entry.id)!;
    const tier = derivedTier.has(entry.id) ? tierForDepth(depth, balance) : entry.tier;
    entryMap.set(entry.id, { ...entry, tier, depth, xp: xpForTier(tier, balance) });
  }
  return {
    balance,
    tags: tagMap,
    schools: new Map(schools.map((s) => [s.id, s])),
    entries: entryMap,
    spells: spellMap,
    jobs: new Map(jobs.map((job) => [job.id, job])),
    quests,
    combos: comboMap,
  };
}

// The data files as written, validated but not yet assembled into a game.
export function readGameFiles(rootDir: string) {
  return {
    balance: readJson(join(rootDir, "config/balance.json"), balanceSchema),
    tags: readJson(join(rootDir, "data/tags.json"), z.array(tagSchema).min(1)),
    schools: readJson(join(rootDir, "data/schools.json"), z.array(schoolSchema)),
    entries: readJson(join(rootDir, "data/entries.json"), z.array(entrySchema)),
    combos: readJson(join(rootDir, "data/combos.json"), z.array(comboSchema)),
    spells: readJson(join(rootDir, "data/spells.json"), z.array(spellSchema)),
    ladders: readJson(join(rootDir, "data/ladders.json"), z.array(ladderSchema)),
    spellRecipes: readOptional(join(rootDir, SPELL_RECIPES_FILE), z.array(spellRecipeSchema)),
    spellMaterials: readOptional(join(rootDir, SPELL_MATERIALS_FILE), z.array(spellMaterialSchema)),
    jobs: readJson(join(rootDir, "data/jobs.json"), z.array(jobSchema)),
    quests: readJson(join(rootDir, "data/quests.json"), z.array(questSchema)),
  };
}

export function loadGameData(rootDir: string): GameData {
  return buildGameData(readGameFiles(rootDir));
}
