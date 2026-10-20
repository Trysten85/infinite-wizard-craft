import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Banned } from "./names";
import {
  QUALITIES,
  RANKS,
  SHIFT_SLOTS,
  bakedComboSchema,
  balanceSchema,
  buildingSchema,
  comboExampleSchema,
  comboKey,
  comboSchema,
  dayTextSchema,
  townsfolkSchema,
  castSchema,
  type Cast,
  happeningSchema,
  entrySchema,
  eventSeedSchema,
  jobSchema,
  jobSkinSchema,
  ladderSchema,
  questSchema,
  schoolSchema,
  shiftTextSchema,
  slugify,
  spellEntryId,
  spellMaterialSchema,
  spellRecipeSchema,
  spellSchema,
  storybookItemSchema,
  tagSchema,
  type BakedCombo,
  type Balance,
  type Building,
  type Combo,
  type ComboExample,
  type DayText,
  type Townsfolk,
  type Happening,
  type Entry,
  type EventSeed,
  type GameEntry,
  type Job,
  type JobSkin,
  type Ladder,
  type Quest,
  type School,
  type ShiftText,
  type Spell,
  type SpellMaterial,
  type SpellRecipe,
  type StorybookItem,
  type Tag,
} from "../shared/schema";
import { castProblems, fitCast, lessonFor } from "../shared/cast";
import type { TownWords } from "../shared/town";

export type GameData = {
  balance: Balance;
  tags: Map<string, Tag>;
  schools: Map<string, School>;
  entries: Map<string, GameEntry>;
  spells: Map<string, Spell>;
  jobs: Map<string, Job>;
  // How each job's work shift looks, by job id, and the plain words shifts are written in.
  jobSkins: Map<string, JobSkin>;
  shiftText: ShiftText;
  // The plain lines the day's turns are told in.
  dayText: DayText;
  // The town's buildings, by id, in the order they are written.
  buildings: Map<string, Building>;
  // Names for the people who arrive in town, and what they say when called on.
  townsfolk: Townsfolk;
  // The hand-written townsfolk, one for each trade that has one, with their lessons and stories.
  cast: Cast;
  // The one-night happenings, in the order they are written.
  happenings: Happening[];
  quests: Quest[];
  eventSeeds: EventSeed[];
  // Well-known fairy-tale creatures, objects, and wonders a magical combination may produce,
  // each with what it can come from.
  storybook: StorybookItem[];
  // Good combinations to show the model: the hand-picked ones, then the hand-written recipes.
  comboExamples: ComboExample[];
  // Real words, for telling a real name from a made-up one. Empty means no such check is made.
  words: Set<string>;
  // Names and words that do not belong in this world, and words descriptions lean on too much.
  banned: Banned;
  overused: string[];
  // The one spelling the game uses for a name that could be written several ways.
  aliases: Map<string, string>;
  // Pairs a reviewer has said make nothing, and the gentle lines the game says so with.
  noResults: Set<string>;
  noResultLines: string[];
  // The things that came out of the overnight bake and were approved. They are fixed recipes
  // like the hand-written ones, but the model may still arrive at them from other pairs.
  bakedIds: Set<string>;
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
export const BAKED_FILE = "data/baked-combos.json";

export function readOptional<T>(path: string, schema: z.ZodType<T[]>): T[] {
  return existsSync(path) ? readJson(path, schema) : [];
}

export function tierForDepth(depth: number, balance: Balance): number {
  return Math.floor(depth / balance.depthPerTier);
}

// Learning a spell costs gold by tier, counting a cantrip as one tier.
export function learnCostForTier(tier: number, balance: Balance): number {
  return (tier + 1) * balance.learnCostPerTier;
}

// The level a player must reach before they can learn a spell of this tier.
export function levelForSpellTier(tier: number, balance: Balance): number {
  const table = balance.spellLevelByTier;
  return table[Math.min(tier, table.length - 1)]!;
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

// The hand-written recipes that make plain things, with the reason written beside each, are good
// examples in their own right. Recipes for schools, spells, and jobs are not: those are not
// things the model is ever asked to make.
function recipesAsExamples(combos: Combo[], entries: Map<string, GameEntry>): ComboExample[] {
  const plain = (id: string) => ["element", "material", "focus"].includes(entries.get(id)?.kind ?? "");
  return combos
    .filter((combo) => combo.logic && [...combo.inputs, combo.result].every(plain))
    .map((combo) => ({
      inputs: [entries.get(combo.inputs[0])!.name, entries.get(combo.inputs[1])!.name],
      result: entries.get(combo.result)!.name,
      why: combo.logic![0]!.toLowerCase() + combo.logic!.slice(1),
      kind: "ordinary" as const,
      authored: true,
    }));
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
  jobSkins?: JobSkin[];
  shiftText?: ShiftText;
  dayText?: DayText;
  buildings?: Building[];
  townsfolk?: Townsfolk;
  cast?: Cast;
  happenings?: Happening[];
  quests?: Quest[];
  eventSeeds?: EventSeed[];
  storybook?: StorybookItem[];
  comboExamples?: ComboExample[];
  baked?: BakedCombo[];
  words?: string[];
  banned?: Banned;
  overused?: string[];
  aliases?: Record<string, string>;
  noResultLines?: string[];
}): GameData {
  const { balance, tags, schools, combos, spells = [], ladders = [], spellRecipes = [], spellMaterials = [], jobs = [], quests = [] } = raw;
  const eventSeeds = raw.eventSeeds ?? [];
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
  // Approved pairs from the overnight bake. The first pair to make a thing gives it its words.
  // Two pairs may make the same thing.
  const liveBaked = (raw.baked ?? []).filter((row) => row.status === "ok");
  const bakedEntries: Entry[] = [];
  const bakedWonders = new Set<string>();
  for (const row of liveBaked) {
    const id = slugify(row.name);
    if (row.wonder) bakedWonders.add(id);
    if (bakedEntries.some((entry) => entry.id === id)) continue;
    const parents = row.inputs.map((input) => raw.entries.find((entry) => entry.id === input));
    bakedEntries.push({
      id,
      name: row.name,
      kind: "material",
      description: row.description,
      tags: row.tags,
      affinity: [...new Set(parents.flatMap((parent) => parent?.affinity ?? []))],
      tier: 0,
      source: "authored",
    });
  }
  const derivedTier = new Set([...materialEntries, ...jobEntries, ...bakedEntries].map((entry) => entry.id));
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
  const entries = [...raw.entries, ...materialEntries, ...schoolEntries, ...spellEntries, ...jobEntries, ...bakedEntries];
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
  for (const row of liveBaked) recipes.push({ inputs: row.inputs, result: slugify(row.name), needs: [] });
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

  const questIds = new Set<string>();
  for (const quest of quests) {
    if (questIds.has(quest.id)) problems.push(`duplicate quest id "${quest.id}"`);
    questIds.add(quest.id);
    if (quest.level > balance.levels.cap) problems.push(`quest "${quest.id}" opens at level ${quest.level}, past the cap`);
    if (quest.done.type === "level" && quest.done.level > balance.levels.cap) {
      problems.push(`quest "${quest.id}" asks for level ${quest.done.level}, past the cap`);
    }
    if (quest.done.type === "has-entry" && !entryIds.has(quest.done.entry)) {
      problems.push(`quest "${quest.id}" asks for unknown entry "${quest.done.entry}"`);
    }
    if ((quest.done.type === "has-tag" || quest.done.type === "tag-count") && !tagMap.has(quest.done.tag)) {
      problems.push(`quest "${quest.id}" asks for unknown tag "${quest.done.tag}"`);
    }
  }

  // Work shifts. A skin for a job this game does not have is simply left out, so a game built
  // from fewer jobs still loads. A misspelled job shows up as that job having no skin.
  const jobSkins = (raw.jobSkins ?? []).filter((skin) => jobs.some((job) => job.id === skin.job));
  const skinned = new Set<string>();
  for (const skin of jobSkins) {
    const label = `skin for job "${skin.job}"`;
    if (skinned.has(skin.job)) problems.push(`job "${skin.job}" has two skins`);
    skinned.add(skin.job);
    const stapleIds = new Set<string>();
    for (const slot of SHIFT_SLOTS) {
      for (const staple of skin[slot].staples) {
        if (stapleIds.has(staple.id)) problems.push(`${label} uses the id "${staple.id}" twice`);
        stapleIds.add(staple.id);
      }
      for (const tag of [...skin[slot].staples.flatMap((staple) => staple.tags), ...(skin[slot].from?.tags ?? [])]) {
        if (!tagMap.has(tag)) problems.push(`${label} uses unknown tag "${tag}"`);
      }
      // Nobody may be left with an empty slot, whatever their rank.
      if (slot !== "touch" && skin[slot].staples.every((staple) => staple.rank)) problems.push(`${label} has nothing in its ${slot} slot for a beginner`);
    }
  }
  if (raw.jobSkins) {
    for (const job of jobs) if (!skinned.has(job.id)) problems.push(`job "${job.id}" has no skin in data/job-skins.json`);
  }
  if (raw.shiftText) {
    for (const tag of Object.keys(raw.shiftText.tagWords)) {
      if (!tagMap.has(tag)) problems.push(`the shift text has words for unknown tag "${tag}"`);
    }
    for (const tag of tagMap.keys()) {
      if (!raw.shiftText.tagWords[tag]) problems.push(`the shift text has no words for tag "${tag}"`);
    }
  }
  // The town. A building that names a job this game does not have, as its own or at any tier, is
  // left out, as a skin is, so a game built from fewer jobs still loads. The test that lists the
  // real buildings is what catches a misspelled job.
  const { town } = balance;
  const buildings = (raw.buildings ?? []).filter((building) =>
    [building.job, ...building.tiers.flatMap((tier) => [tier.needsJob, tier.job])].every((named) => !named || jobs.some((job) => job.id === named)),
  );
  const buildingIds = new Set<string>();
  const housed = new Set<string>();
  const bakedThings = new Set(bakedEntries.map((entry) => entry.id));
  for (const building of buildings) {
    const label = `building "${building.id}"`;
    if (buildingIds.has(building.id)) problems.push(`duplicate building id "${building.id}"`);
    buildingIds.add(building.id);
    if (building.job) {
      if (housed.has(building.job)) problems.push(`job "${building.job}" has two buildings`);
      housed.add(building.job);
    }
    if (building.tiers.length !== town.tiers.length) problems.push(`${label} has ${building.tiers.length} tiers, and the town has ${town.tiers.length}`);
    for (const tag of [...building.wants, ...building.enchantTags]) {
      if (!tagMap.has(tag)) problems.push(`${label} uses unknown tag "${tag}"`);
    }
    // The model can never give an author-only tag, so nothing a player makes would carry it.
    for (const tag of building.wants) {
      if (tagMap.get(tag)?.assignedBy === "author") problems.push(`${label} wants "${tag}", which only an author can give`);
    }
    for (const [index, tier] of building.tiers.entries()) {
      for (const need of tier.needs ?? []) {
        if ("entry" in need) {
          // A named need must be something with a hand-written recipe, so it can always be made.
          if (!entryIds.has(need.entry) || bakedThings.has(need.entry)) problems.push(`${label} needs "${need.entry}", which has no hand-written recipe`);
        } else if (!tagMap.has(need.tag)) problems.push(`${label} needs unknown tag "${need.tag}"`);
      }
      for (const perk of tier.perks) {
        if ((perk.type === "discovery-gold" || perk.type === "gift") && perk.tags.some((tag) => !tagMap.has(tag))) problems.push(`${label} has a perk with an unknown tag at tier ${index + 1}`);
        if (perk.type === "lifts" && !(raw.buildings ?? []).some((other) => other.id === perk.building)) problems.push(`${label} lifts unknown building "${perk.building}"`);
        if (perk.type === "lifts" && perk.building === building.id) problems.push(`${label} lifts itself`);
      }
    }
  }
  // A quest may wait on a lesson as well as on another quest: a cast member's own, or the
  // made-by-code one for a trade with no written person. Lessons are checked here too.
  const lessons = jobs.flatMap((job) => lessonFor(job, raw.cast ?? { people: [] }));
  const waitable = new Set([...questIds, ...lessons.map((lesson) => lesson.id)]);
  for (const quest of [...quests, ...lessons]) {
    if (quest.done.type === "built" && buildings.length > 0 && !buildingIds.has(quest.done.building)) {
      problems.push(`quest "${quest.id}" asks for unknown building "${quest.done.building}"`);
    }
    if ((quest.done.type === "built" || quest.done.type === "buildings") && (quest.done.tier ?? 1) > town.tiers.length) {
      problems.push(`quest "${quest.id}" asks for a building at tier ${quest.done.tier}, and buildings have ${town.tiers.length}`);
    }
    if (quest.done.type === "quest-done" && (!waitable.has(quest.done.quest) || quest.done.quest === quest.id)) {
      problems.push(`quest "${quest.id}" waits on unknown quest "${quest.done.quest}"`);
    }
    const job = quest.done.type === "fondness" || quest.done.type === "requests" ? quest.done.job : undefined;
    if (job !== undefined && !jobs.some((each) => each.id === job)) problems.push(`quest "${quest.id}" names unknown job "${job}"`);
  }
  if (town.deedsByLevel.length !== balance.levels.cap) problems.push("town.deedsByLevel must have one number for each level");
  if (town.deedsByLevel.some((deeds, index) => deeds < (town.deedsByLevel[index - 1] ?? 0))) problems.push("town.deedsByLevel must never go down as the level rises");
  if (town.deedsByLevel.at(-1)! > town.plotPrices.length) problems.push("town.deedsByLevel hands out more deeds than there are plots");
  if (town.tiers.some((tier, index) => tier.level > balance.levels.cap || tier.level < (town.tiers[index - 1]?.level ?? 1))) {
    problems.push("town.tiers must ask for levels within the cap, never lower than the tier before");
  }

  if (raw.townsfolk) {
    const names = raw.townsfolk.people.map((person) => person.name);
    if (new Set(names).size !== names.length) problems.push("the townsfolk list names someone twice");
  }
  const cast = fitCast(raw.cast ?? { people: [] }, { jobs: new Set(jobs.map((job) => job.id)), buildings: new Set(buildings.map((building) => building.id)) });
  {
    problems.push(
      ...castProblems(cast, {
        jobs: new Set(jobs.map((job) => job.id)),
        buildings: new Map(buildings.map((building) => [building.id, building])),
        questIds: new Set((raw.quests ?? []).map((quest) => quest.id)),
        pool: new Set((raw.townsfolk?.people ?? []).map((person) => person.name)),
        level: balance.levels.cap,
      }),
    );
  }
  for (const [action, when] of Object.entries(balance.day.access)) {
    if (when === "anytime" && balance.day.costs[action as keyof typeof balance.day.costs] > 0) problems.push(`day.costs.${action} must be 0, because day.access lets it be taken at any time`);
  }
  if (balance.day.noon >= balance.day.length) problems.push("the day's noon must come before its length, so that there is an afternoon");
  const { qualities, ranks } = balance.shifts;
  if (qualities.some((quality, index) => quality.id !== QUALITIES[index] || quality.from < (qualities[index - 1]?.from ?? -Infinity))) {
    problems.push(`shift qualities must be ${QUALITIES.join(", ")}, each starting at a higher score than the last`);
  }
  if (qualities[0]!.from > 0) problems.push("the lowest shift quality must start at a score of 0, so that every shift earns one");
  if (ranks.some((rank, index) => rank.id !== RANKS[index] || rank.shifts < (ranks[index - 1]?.shifts ?? 0)) || ranks[0]!.shifts !== 0) {
    problems.push(`shift ranks must be ${RANKS.join(", ")}, starting at 0 shifts and each needing more than the last`);
  }

  for (const seed of eventSeeds) {
    for (const tag of [...seed.tags, ...seed.skillTags, ...(seed.spellTags ?? [])]) {
      if (!tagMap.has(tag)) problems.push(`event seed "${seed.id}" uses unknown tag "${tag}"`);
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
    const learning = entry.kind === "spell" ? { learnCost: learnCostForTier(tier, balance), learnLevel: levelForSpellTier(tier, balance) } : {};
    const wonder = bakedWonders.has(entry.id) ? { wonder: true } : {};
    entryMap.set(entry.id, { ...entry, tier, depth, xp: xpForTier(tier, balance), ...learning, ...wonder });
  }

  // A quest must not ask for more than the game holds. Materials are left out: the model makes
  // more of those. This waits until here because a job's tier comes from its depth.
  const findable = [...entryMap.values()].filter((entry) => !balance.startingEntries.includes(entry.id));
  const spellsInPlay = findable.filter((entry) => entry.kind === "spell");
  const beyond: string[] = [];
  for (const quest of quests) {
    const done = quest.done;
    if ((done.type === "has-kind" || done.type === "kind-count") && done.kind !== "material") {
      const need = done.type === "kind-count" ? done.count : 1;
      const minTier = done.type === "kind-count" ? (done.tier ?? 0) : 0;
      const have = findable.filter((entry) => entry.kind === done.kind && entry.tier >= minTier).length;
      if (have < need) beyond.push(`quest "${quest.id}" asks for ${need} of kind "${done.kind}", and the game has ${have}`);
    }
    if (done.type === "learned-tier" && !spellsInPlay.some((spell) => spell.tier === done.tier)) {
      beyond.push(`quest "${quest.id}" asks for a tier ${done.tier} spell, and none is in play`);
    }
    if (done.type === "learned-schools" && new Set(spellsInPlay.map((spell) => spell.school)).size < done.count) {
      beyond.push(`quest "${quest.id}" asks for spells from ${done.count} schools, and fewer have spells in play`);
    }
    if (done.type === "learned-count" && spellsInPlay.length < done.count) {
      beyond.push(`quest "${quest.id}" asks for ${done.count} learned spells, and the game has ${spellsInPlay.length}`);
    }
  }
  if (beyond.length > 0) throw new Error(`game data is invalid:\n- ${beyond.join("\n- ")}`);

  return {
    balance,
    tags: tagMap,
    schools: new Map(schools.map((s) => [s.id, s])),
    entries: entryMap,
    spells: spellMap,
    jobs: new Map(jobs.map((job) => [job.id, job])),
    jobSkins: new Map(jobSkins.map((skin) => [skin.job, skin])),
    buildings: new Map(buildings.map((building) => [building.id, building])),
    happenings: raw.happenings ?? [],
    cast,
    townsfolk: raw.townsfolk ?? { people: [{ name: "Pip Thistlewood", pronoun: "they" }], callingLines: { default: ["{name} is glad of the company."] } },
    dayText: raw.dayText ?? {
      dusk: ["Dusk."],
      turnedIn: ["You turn in early."],
      night: { "out-of-time": ["The sand has run out."], bed: ["You go to bed."], "midnight-oil": ["The evening has gone."] },
      morning: ["Morning."],
      shopRestocked: ["The shop has new stock."],
      newOrders: ["There are new orders on the board."],
    },
    shiftText: raw.shiftText ?? { tagWords: {}, results: { meh: ["It works."], good: ["It does the job."], great: ["The customer smiles."], perfect: ["It is worth talking about."] } },
    quests,
    eventSeeds,
    storybook: raw.storybook ?? [],
    comboExamples: [...(raw.comboExamples ?? []), ...recipesAsExamples(combos, entryMap)],
    bakedIds: new Set(bakedEntries.map((entry) => entry.id)),
    words: new Set(raw.words ?? []),
    banned: raw.banned ?? { names: [], words: [] },
    overused: raw.overused ?? [],
    aliases: new Map(Object.entries(raw.aliases ?? {})),
    noResults: new Set((raw.baked ?? []).filter((row) => row.status === "nothing").map((row) => comboKey(...row.inputs))),
    noResultLines: raw.noResultLines ?? ["Nothing happens."],
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
    baked: readOptional(join(rootDir, BAKED_FILE), z.array(bakedComboSchema)),
    // One word to a line, with a few of our own added: real words the dictionary happens to lack.
    words: [
      ...readFileSync(join(rootDir, "data/words.txt"), "utf8").split("\n").filter((word) => word !== ""),
      ...readJson(join(rootDir, "data/extra-words.json"), z.array(z.string().regex(/^[a-z]+$/))),
    ],
    banned: readJson(join(rootDir, "data/banned-results.json"), z.strictObject({ names: z.array(z.string()), words: z.array(z.string()) })),
    overused: readJson(join(rootDir, "data/overused-words.json"), z.array(z.string().min(1))),
    aliases: readJson(join(rootDir, "data/name-aliases.json"), z.record(z.string(), z.string().min(1))),
    noResultLines: readJson(join(rootDir, "data/no-result-lines.json"), z.array(z.string().min(1)).min(1)),
    jobs: readJson(join(rootDir, "data/jobs.json"), z.array(jobSchema)),
    jobSkins: readJson(join(rootDir, "data/job-skins.json"), z.array(jobSkinSchema)),
    shiftText: readJson(join(rootDir, "data/shift-text.json"), shiftTextSchema),
    dayText: readJson(join(rootDir, "data/day-text.json"), dayTextSchema),
    buildings: readJson(join(rootDir, "data/buildings.json"), z.array(buildingSchema)),
    townsfolk: readJson(join(rootDir, "data/townsfolk.json"), townsfolkSchema),
    cast: readJson(join(rootDir, "data/cast.json"), castSchema),
    happenings: readJson(join(rootDir, "data/tonight.json"), z.array(happeningSchema)),
    quests: readJson(join(rootDir, "data/quests.json"), z.array(questSchema)),
    eventSeeds: readJson(join(rootDir, "data/event-seeds.json"), z.array(eventSeedSchema)),
    storybook: readJson(join(rootDir, "data/storybook.json"), z.array(storybookItemSchema)),
    comboExamples: readJson(join(rootDir, "data/combo-examples.json"), z.array(comboExampleSchema)),
  };
}

// `baked: false` leaves the approved bakes out: the game as it stood before them. The bake and
// the bench both want that, since they are about pairs the model has yet to be asked.
// The words the town's needs are said in: the names of things and jobs, and a plain phrase for a tag.
export function townWords(data: GameData): TownWords {
  return {
    entryName: (id) => data.entries.get(id)?.name ?? id,
    jobName: (id) => data.jobs.get(id)?.name ?? id,
    tagWords: (tag) => data.shiftText.tagWords[tag] ?? tag,
  };
}

export function loadGameData(rootDir: string, options: { baked?: boolean } = {}): GameData {
  const files = readGameFiles(rootDir);
  return buildGameData(options.baked === false ? { ...files, baked: [] } : files);
}
