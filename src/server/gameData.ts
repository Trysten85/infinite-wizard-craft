import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  balanceSchema,
  comboKey,
  comboSchema,
  entrySchema,
  schoolSchema,
  type Balance,
  type Combo,
  type Entry,
  type GameEntry,
  type School,
} from "../shared/schema";

export type GameData = {
  balance: Balance;
  tags: string[];
  schools: Map<string, School>;
  entries: Map<string, GameEntry>;
  // comboKey -> result entry id
  combos: Map<string, string>;
};

function readJson<T>(path: string, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) throw new Error(`${path} is invalid:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

export function tierForDepth(depth: number, balance: Balance): number {
  return Math.floor(depth / balance.depthPerTier);
}

export function xpForTier(tier: number, balance: Balance): number {
  const table = balance.discoveryXpByTier;
  return table[Math.min(tier, table.length - 1)]!;
}

// Depth is how many combos an entry sits from the starting entries, by its shortest recipe.
export function computeDepths(entries: Entry[], combos: Combo[], starting: string[]): Map<string, number> {
  const depths = new Map<string, number>(starting.map((id) => [id, 0]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const combo of combos) {
      const a = depths.get(combo.inputs[0]);
      const b = depths.get(combo.inputs[1]);
      if (a === undefined || b === undefined) continue;
      const depth = Math.max(a, b) + 1;
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
  tags: string[];
  schools: School[];
  entries: Entry[];
  combos: Combo[];
}): GameData {
  const { balance, tags, schools, entries, combos } = raw;
  const problems: string[] = [];
  const entryIds = new Set<string>();
  const schoolIds = new Set(schools.map((s) => s.id));
  const elementIds = new Set(entries.filter((e) => e.kind === "element").map((e) => e.id));

  for (const entry of entries) {
    if (entryIds.has(entry.id)) problems.push(`duplicate entry id "${entry.id}"`);
    entryIds.add(entry.id);
    for (const tag of entry.tags) {
      if (!tags.includes(tag)) problems.push(`entry "${entry.id}" uses unknown tag "${tag}"`);
    }
    for (const affinity of entry.affinity) {
      if (!elementIds.has(affinity) && !schoolIds.has(affinity)) {
        problems.push(`entry "${entry.id}" has affinity "${affinity}", which is not an element or school`);
      }
    }
  }
  for (const id of balance.startingEntries) {
    if (!entryIds.has(id)) problems.push(`starting entry "${id}" does not exist`);
  }

  const comboMap = new Map<string, string>();
  for (const combo of combos) {
    const key = comboKey(...combo.inputs);
    for (const id of [...combo.inputs, combo.result]) {
      if (!entryIds.has(id)) problems.push(`combo ${key} refers to unknown entry "${id}"`);
    }
    if (comboMap.has(key)) problems.push(`combo ${key} is defined twice`);
    comboMap.set(key, combo.result);
  }
  if (problems.length > 0) throw new Error(`game data is invalid:\n- ${problems.join("\n- ")}`);

  const depths = computeDepths(entries, combos, balance.startingEntries);
  const entryMap = new Map<string, GameEntry>();
  for (const entry of entries) {
    entryMap.set(entry.id, { ...entry, depth: depths.get(entry.id)!, xp: xpForTier(entry.tier, balance) });
  }
  return { balance, tags, schools: new Map(schools.map((s) => [s.id, s])), entries: entryMap, combos: comboMap };
}

export function loadGameData(rootDir: string): GameData {
  return buildGameData({
    balance: readJson(join(rootDir, "config/balance.json"), balanceSchema),
    tags: readJson(join(rootDir, "data/tags.json"), z.array(z.string()).min(1)),
    schools: readJson(join(rootDir, "data/schools.json"), z.array(schoolSchema)),
    entries: readJson(join(rootDir, "data/entries.json"), z.array(entrySchema)),
    combos: readJson(join(rootDir, "data/combos.json"), z.array(comboSchema)),
  });
}
