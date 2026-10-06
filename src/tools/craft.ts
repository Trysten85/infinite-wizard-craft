// Draft how the remaining SRD spells are made. Nothing drafted here is live until it is approved.
//   npm run craft -- plan [1-3]          give each spell in those tiers a recipe key (default tiers 1-3)
//   npm run craft -- materials           ask the local model for a recipe for each new material
//   npm run craft -- status              what is drafted, approved, and waiting
//   npm run craft -- approve all         approve every complete draft
//   npm run craft -- approve <id> ...    approve single spells or materials by id
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { loadBlocklist } from "../server/blocklist";
import { assignKeys, candidatesFor, existingMatches, RANKED_BASE_COST } from "../server/crafting/keys";
import { classifyMaterial, draftMaterialRecipe, rankElements } from "../server/crafting/materials";
import { loadGameData, readOptional, SPELL_MATERIALS_FILE, SPELL_RECIPES_FILE } from "../server/gameData";
import { RECIPE_KEY_FILE, renderRecipeKey } from "../server/recipeKey";
import { createOllamaClient } from "../server/llm/ollama";
import { openStore } from "../server/store";
import {
  comboKey,
  spellEntryId,
  spellMaterialSchema,
  spellRecipeSchema,
  type Spell,
  type SpellMaterial,
  type SpellRecipe,
} from "../shared/schema";

const root = process.cwd();
const recipesPath = join(root, SPELL_RECIPES_FILE);
const materialsPath = join(root, SPELL_MATERIALS_FILE);

const readRecipes = () => readOptional(recipesPath, z.array(spellRecipeSchema));
const readMaterials = () => readOptional(materialsPath, z.array(spellMaterialSchema));

// One row per line, so hand edits and git diffs stay readable.
function writeRows(path: string, rows: unknown[]): void {
  writeFileSync(path, `[\n${rows.map((row) => `  ${JSON.stringify(row)}`).join(",\n")}\n]\n`);
}

function openModel() {
  mkdirSync(join(root, "var"), { recursive: true });
  const store = openStore(join(root, "var/game.db"));
  const client = createOllamaClient({
    baseUrl: process.env.OLLAMA_URL ?? "http://192.168.56.1:11434",
    model: process.env.OLLAMA_MODEL ?? "gemma3:12b",
  });
  return { store, client, log: store.logModelCall };
}

function count<T>(items: T[], label: (item: T) => string): string {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(label(item), (counts.get(label(item)) ?? 0) + 1);
  return [...counts].map(([name, n]) => `${name}: ${n}`).join(", ") || "none";
}

async function plan(tierArg = "1-3"): Promise<void> {
  const [low, high] = tierArg.split("-").map(Number) as [number, number?];
  const data = loadGameData(root);
  const recipes = readRecipes();
  const materials = readMaterials();
  const planned = new Set(recipes.map((row) => row.spell));
  const todo = [...data.spells.values()].filter(
    (spell) => spell.tier >= low && spell.tier <= (high ?? low) && !data.entries.has(spellEntryId(spell.id)) && !planned.has(spell.id),
  );
  if (todo.length === 0) return console.log("Every spell in those tiers already has a recipe or a draft.");

  const srdMaterials: { id: string; name: string }[] = JSON.parse(readFileSync(join(root, "data/srd/materials.json"), "utf8"));
  const materialNames = new Map(srdMaterials.map((material) => [material.id, material.name]));
  const keyEntries = [...data.entries.values()].filter((entry) => entry.kind === "element" || entry.kind === "material");
  const elements = keyEntries.filter((entry) => entry.kind === "element");
  const { store, client, log } = openModel();

  // Before inventing a material, ask whether the component is just a form of one the game has.
  const keyEntryIds = keyEntries.map((entry) => entry.id);
  const unmatched = new Set(
    todo
      .flatMap((spell) => spell.components.materials.map((id) => materialNames.get(id) ?? id))
      .filter((name) => existingMatches(name, keyEntryIds).length === 0),
  );
  const sameAs = new Map<string, string>();
  for (const name of unmatched) {
    const match = await classifyMaterial({ client, log }, name, keyEntries);
    if (match) sameAs.set(name, match);
  }
  console.log(`${unmatched.size} unfamiliar components: ${sameAs.size} judged a form of an existing material, ${unmatched.size - sameAs.size} new.`);

  const groups = new Map<string, Spell[]>();
  for (const spell of todo) {
    const group = `${spell.school} ${spell.tier}`;
    groups.set(group, [...(groups.get(group) ?? []), spell]);
  }

  for (const [group, spells] of groups) {
    const candidates = [];
    for (const spell of spells) {
      const natural = data.schools.get(spell.school)!.naturalElements;
      // The model only judges spells with no component to key on. Code supplies the default order.
      const ranked = spell.components.materials.length === 0 ? await rankElements({ client, log }, spell, elements) : [];
      const elementRanking = [...new Set([...ranked, ...natural, ...elements.map((element) => element.id)])];
      candidates.push({
        id: spell.id,
        candidates: candidatesFor(spell, { materialNames, keyEntryIds, elementRanking, sameAs }),
      });
    }
    // Keys already claimed in this school and tier, by an earlier plan or by hand.
    const taken = new Set(
      recipes
        .filter((row) => row.key && `${data.spells.get(row.spell)?.school} ${data.spells.get(row.spell)?.tier}` === group)
        .map((row) => row.key!),
    );
    const assigned = assignKeys(candidates, taken);
    for (const spell of spells) {
      const choice = assigned.get(spell.id) ?? null;
      // With many component-less spells in one school and tier, the last few get whatever element
      // is left. Those are kept, but flagged, so a person picks something better.
      const poorFit = choice?.source === "ranked-element" && choice.cost - RANKED_BASE_COST >= 3;
      recipes.push({
        spell: spell.id,
        key: choice?.key ?? null,
        keySource: choice?.source ?? "hand",
        note: choice?.note,
        status: choice && !poorFit ? "draft" : "review",
      });
      if (choice?.source !== "new-material") continue;
      const existing = materials.find((row) => row.id === choice.key);
      if (existing) existing.forSpells.push(spell.id);
      else {
        const name = choice.key.replace(/-/g, " ");
        materials.push({
          id: choice.key,
          name: name[0]!.toUpperCase() + name.slice(1),
          description: "",
          tags: [],
          inputs: null,
          logic: "",
          forSpells: [spell.id],
          status: "draft",
        });
      }
    }
    writeRows(recipesPath, recipes);
    writeRows(materialsPath, materials);
    console.log(`${group}: ${spells.length} spells placed`);
  }
  store.close();

  const fresh = recipes.filter((row) => todo.some((spell) => spell.id === row.spell));
  console.log(`\nPlanned ${fresh.length} spells. Key source: ${count(fresh, (row) => row.keySource)}`);
  console.log(`New materials needing a recipe: ${materials.filter((row) => !row.inputs).length}`);
  console.log("Next: npm run craft -- materials");
}

async function draftMaterials(): Promise<void> {
  const data = loadGameData(root);
  const materials = readMaterials();
  const todo = materials.filter((row) => !row.inputs && row.status !== "ok");
  if (todo.length === 0) return console.log("No materials are waiting for a recipe.");

  const ingredients = new Map(
    [...data.entries.values()].filter((entry) => entry.kind === "element" || entry.kind === "material").map((entry) => [entry.id, entry]),
  );
  const usedPairs = new Set([...data.combos.keys(), ...materials.filter((row) => row.inputs).map((row) => comboKey(...row.inputs!))]);
  const blocklist = loadBlocklist(join(root, "Blocklist.md"));
  const voice = readFileSync(join(root, "prompts/voice.md"), "utf8");
  const { store, client, log } = openModel();

  for (const [index, row] of todo.entries()) {
    const spells = row.forSpells.map((id) => data.spells.get(id)).filter((spell) => spell !== undefined);
    const tier = Math.min(...spells.map((spell) => spell.tier));
    const depthBand = data.balance.componentDepthByTier[String(tier)];
    const draft = depthBand
      ? await draftMaterialRecipe(
          { client, log, voice, tags: [...data.tags.values()] },
          { name: row.name, usedFor: spells.map((spell) => spell.name) },
          { ingredients, usedPairs, depthBand, blocklist },
        )
      : null;
    if (draft) {
      Object.assign(row, draft, { status: "draft" });
      usedPairs.add(comboKey(...draft.inputs));
    } else {
      row.status = "review";
    }
    // Saved after every material, so an interrupted run loses nothing.
    writeRows(materialsPath, materials);
    const outcome = draft ? `${draft.inputs.join(" + ")}  (${draft.logic})` : "NEEDS REVIEW";
    console.log(`[${index + 1}/${todo.length}] ${row.name} (tier ${tier})  <-  ${outcome}`);
  }
  store.close();
  console.log(`\nDrafted ${todo.filter((row) => row.inputs).length} of ${todo.length}. Review them in ${SPELL_MATERIALS_FILE}.`);
}

function status(): void {
  const data = loadGameData(root);
  const recipes = readRecipes();
  const materials = readMaterials();
  const live = [...data.entries.values()].filter((entry) => entry.kind === "spell");
  console.log(`Spells that can be made in the game now: ${live.length} of ${data.spells.size}`);
  console.log(`Spell recipes  (${SPELL_RECIPES_FILE}):  ${count(recipes, (row) => row.status)}`);
  console.log(`New materials  (${SPELL_MATERIALS_FILE}): ${count(materials, (row) => row.status)}`);
  const waiting = recipes.filter((row) => row.status === "ok" && !data.entries.has(spellEntryId(row.spell)));
  if (waiting.length > 0) {
    console.log(`Approved but not live, because their key material is not approved yet: ${waiting.map((row) => row.spell).join(", ")}`);
  }
  for (const row of materials.filter((row) => row.status === "review")) console.log(`Needs a hand-written recipe: ${row.id}`);
  for (const row of recipes.filter((row) => row.status === "review")) {
    console.log(row.key ? `Poor fit, check the key: ${row.spell} (currently ${row.key})` : `Needs a hand-picked key: ${row.spell}`);
  }
}

function approve(ids: string[]): void {
  if (ids.length === 0) return console.log("Usage: npm run craft -- approve all | <id> ...");
  const all = ids.length === 1 && ids[0] === "all";
  const recipes: SpellRecipe[] = readRecipes();
  const materials: SpellMaterial[] = readMaterials();
  const before = { recipes: structuredClone(recipes), materials: structuredClone(materials) };
  const approved: string[] = [];
  for (const row of materials) {
    // "approve all" takes drafts only. Rows flagged for review must be approved by id, after a look.
    if ((all ? row.status === "draft" : ids.includes(row.id)) && row.status !== "ok" && row.inputs && row.description) {
      row.status = "ok";
      approved.push(row.id);
    }
  }
  for (const row of recipes) {
    if ((all ? row.status === "draft" : ids.includes(row.spell)) && row.status !== "ok" && row.key) {
      row.status = "ok";
      approved.push(row.spell);
    }
  }
  writeRows(recipesPath, recipes);
  writeRows(materialsPath, materials);
  try {
    // Approved rows are now live, so the recipe key is rewritten to include them.
    writeFileSync(join(root, RECIPE_KEY_FILE), renderRecipeKey(loadGameData(root)));
  } catch (err) {
    // An approval that breaks the game data is undone, so the game always starts.
    writeRows(recipesPath, before.recipes);
    writeRows(materialsPath, before.materials);
    console.log(`Nothing was approved, because the result would be invalid:\n${err instanceof Error ? err.message : err}`);
    return;
  }
  console.log(approved.length > 0 ? `Approved ${approved.length}: ${approved.join(", ")}` : "Nothing to approve with those ids.");
  status();
}

const [command, ...args] = process.argv.slice(2);
if (command === "plan") await plan(args[0]);
else if (command === "materials") await draftMaterials();
else if (command === "status") status();
else if (command === "approve") approve(args);
else console.log("Usage: npm run craft -- plan [tiers] | materials | status | approve all|<id>...");
