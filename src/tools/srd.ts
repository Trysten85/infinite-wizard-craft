// Import the SRD 5.1 spells into the game's spell schema.
//   npm run srd -- download    fetch the pinned source file
//   npm run srd -- import      convert it to data/spells.json
//   npm run srd -- materials   ask the local model to split material phrases, then re-import
//   npm run srd -- review      list spells whose tags need a human (add "elements" for elements)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { createModelClient, readModelConfig } from "../server/llm/config";
import { convertSpell, hasThinTags, overridesSchema, rawSpellSchema } from "../server/srd/convert";
import {
  buildMaterialList,
  extractMaterials,
  materialId,
  parseCost,
  phraseRowSchema,
  type PhraseRow,
} from "../server/srd/materials";
import { openStore } from "../server/store";
import { spellSchema, type Spell } from "../shared/schema";

const SOURCE_COMMIT = "a6212beb4b278917c2cff41c2b04c4ef4f3e0d6f";
const SOURCE_URL = `https://raw.githubusercontent.com/5e-bits/5e-database/${SOURCE_COMMIT}/src/2014/en/5e-SRD-Spells.json`;
const EXPECTED_SPELLS = 319;

const root = process.cwd();
const paths = {
  source: join(root, "data/srd/source/5e-SRD-Spells.json"),
  overrides: join(root, "data/srd/overrides.json"),
  phrases: join(root, "data/srd/material-phrases.json"),
  materials: join(root, "data/srd/materials.json"),
  spells: join(root, "data/spells.json"),
};

function readJson<T>(path: string, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) throw new Error(`${path} is invalid:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

// One item per line, so hand edits and git diffs stay readable.
function writeRows(path: string, rows: unknown[]): void {
  writeFileSync(path, `[\n${rows.map((row) => `  ${JSON.stringify(row)}`).join(",\n")}\n]\n`);
}

function readPhraseRows(): PhraseRow[] {
  return existsSync(paths.phrases) ? readJson(paths.phrases, z.array(phraseRowSchema)) : [];
}

function tally(values: (string | number)[]): string {
  const counts = new Map<string | number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([value, count]) => `${value}: ${count}`)
    .join(", ");
}

async function download(): Promise<void> {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  mkdirSync(join(root, "data/srd/source"), { recursive: true });
  writeFileSync(paths.source, Buffer.from(await response.arrayBuffer()));
  console.log(`Saved ${paths.source}`);
}

function runImport(): Spell[] {
  const raw = readJson(paths.source, z.array(rawSpellSchema));
  if (raw.length !== EXPECTED_SPELLS) {
    throw new Error(`Expected ${EXPECTED_SPELLS} spells in the source file but found ${raw.length}.`);
  }
  const overrides = existsSync(paths.overrides) ? readJson(paths.overrides, overridesSchema) : {};
  const unknownOverrides = Object.keys(overrides).filter((id) => !raw.some((spell) => spell.index === id));
  if (unknownOverrides.length > 0) throw new Error(`overrides.json names unknown spells: ${unknownOverrides.join(", ")}`);

  const rows = readPhraseRows();
  const materialsByPhrase = new Map(rows.map((row) => [row.phrase, [...new Set(row.materials.map(materialId))]]));
  const spells = raw
    .map((spell) => spellSchema.parse(convertSpell(spell, overrides[spell.index], materialsByPhrase)))
    .sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));

  writeRows(paths.spells, spells);
  writeRows(paths.materials, buildMaterialList(rows));
  console.log(`Converted ${spells.length} spells to data/spells.json`);
  console.log(`  by tier:   ${tally(spells.map((spell) => spell.tier))}`);
  console.log(`  by school: ${tally(spells.map((spell) => spell.school))}`);
  console.log(`  with a material component: ${spells.filter((spell) => spell.components.material).length}`);
  console.log(`  tags need review: ${spells.filter(hasThinTags).length}`);
  console.log(`  no element: ${spells.filter((spell) => spell.elements.length === 0).length}`);
  return spells;
}

async function runMaterials(): Promise<void> {
  const spells = runImport();
  const rows = readPhraseRows();
  const known = new Set(rows.map((row) => row.phrase));
  const spellsByPhrase = new Map<string, string[]>();
  for (const spell of spells) {
    const text = spell.components.materialText;
    if (text) spellsByPhrase.set(text, [...(spellsByPhrase.get(text) ?? []), spell.id]);
  }
  const todo = [...spellsByPhrase.keys()].filter((phrase) => !known.has(phrase)).sort();
  console.log(`\n${spellsByPhrase.size} distinct phrases, ${todo.length} to extract.`);

  if (todo.length > 0) {
    mkdirSync(join(root, "var"), { recursive: true });
    const store = openStore(join(root, "var/game.db"));
    const client = createModelClient(readModelConfig(root), "combos");
    for (const [index, phrase] of todo.entries()) {
      const materials = await extractMaterials(client, store.logModelCall, phrase);
      rows.push({
        phrase,
        spells: spellsByPhrase.get(phrase)!.sort(),
        materials: materials ?? [],
        ...parseCost(phrase),
        status: materials ? "ok" : "review",
      });
      // Saved after every phrase, so an interrupted run loses nothing.
      writeRows(paths.phrases, rows);
      console.log(`[${index + 1}/${todo.length}] ${materials ? materials.join(", ") : "NEEDS REVIEW"}  <-  ${phrase}`);
    }
    store.close();
  }

  console.log("");
  runImport();
  const review = rows.filter((row) => row.status === "review");
  console.log(`\n${buildMaterialList(rows).length} distinct materials. ${review.length} phrases need review.`);
}

function review(what: string | undefined): void {
  const spells = readJson(paths.spells, z.array(spellSchema));
  const list = what === "elements" ? spells.filter((spell) => spell.elements.length === 0) : spells.filter(hasThinTags);
  for (const spell of list) {
    console.log(
      `${spell.id}  (tier ${spell.tier} ${spell.school})  tags: ${spell.tags.join(", ") || "none"}  |  elements: ${spell.elements.join(", ") || "none"}`,
    );
  }
  console.log(`\n${list.length} of ${spells.length} spells ${what === "elements" ? "have no element" : "have thin tags"}.`);
  console.log("Fix them in data/srd/overrides.json, then run: npm run srd -- import");
  for (const row of readPhraseRows().filter((row) => row.status === "review")) {
    console.log(`Material phrase needs review (edit data/srd/material-phrases.json): ${row.phrase}`);
  }
}

const [command, arg] = process.argv.slice(2);
if (command === "download") await download();
else if (command === "import") runImport();
else if (command === "materials") await runMaterials();
else if (command === "review") review(arg);
else console.log("Usage: npm run srd -- download | import | materials | review [elements]");
