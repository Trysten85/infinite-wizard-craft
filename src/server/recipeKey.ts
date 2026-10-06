import type { GameEntry } from "../shared/schema";
import type { GameData, Recipe } from "./gameData";
import { buildPath, describeStep } from "./paths";

export const RECIPE_KEY_FILE = "Recipe Key.md";

const SECTIONS: { kind: GameEntry["kind"]; title: string }[] = [
  { kind: "element", title: "Elements" },
  { kind: "material", title: "Materials" },
  { kind: "focus", title: "Focus" },
  { kind: "school", title: "Schools" },
  { kind: "spell", title: "Spells" },
  { kind: "job", title: "Jobs" },
];

// Writes one entry's recipes as a short phrase. Several recipes that differ only in which lower
// spell is used collapse to "any Evocation cantrip + Air".
function describeRecipes(data: GameData, recipes: Recipe[]): string {
  const name = (id: string) => data.entries.get(id)?.name ?? id;
  if (recipes.length === 1) return describeStep(data, recipes[0]!).replace(/ = [^(]*/, " ").trim();
  const groups = new Map<string, string[]>();
  for (const recipe of recipes) {
    const [a, b] = recipe.inputs;
    // The side that stays the same across recipes is the group; the other side varies.
    const shared = recipes.every((other) => other.inputs.includes(a)) ? a : b;
    const varying = shared === a ? b : a;
    const needs = recipe.needs.length > 0 ? ` (needs ${recipe.needs.map(name).join(", ")})` : "";
    const key = `${shared}|${needs}`;
    groups.set(key, [...(groups.get(key) ?? []), varying]);
  }
  return [...groups]
    .map(([key, varying]) => {
      const [shared, needs] = key.split("|") as [string, string];
      const entries = varying.map((id) => data.entries.get(id)!);
      const first = entries[0]!;
      const sameSpellRung = entries.length > 1 && entries.every((e) => e.kind === "spell" && e.school === first.school && e.tier === first.tier);
      const rung = first.tier === 0 ? "cantrip" : `tier ${first.tier} spell`;
      const other = sameSpellRung ? `any ${name(first.school!)} ${rung}` : entries.map((e) => e.name).join(" or ");
      return `${other} + ${name(shared)}${needs}`;
    })
    .join("; or ");
}

function sorted(data: GameData, kind: GameEntry["kind"]): GameEntry[] {
  const entries = [...data.entries.values()].filter((entry) => entry.kind === kind && entry.depth > 0);
  if (kind === "job") return entries;
  if (kind === "spell") {
    return entries.sort((a, b) => a.school!.localeCompare(b.school!) || a.tier - b.tier || a.name.localeCompare(b.name));
  }
  return entries.sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));
}

// The whole key, as Markdown. Generated from the loaded game data, so it only ever lists what is live.
export function renderRecipeKey(data: GameData): string {
  const recipesFor = new Map<string, Recipe[]>();
  for (const recipe of data.combos.values()) recipesFor.set(recipe.result, [...(recipesFor.get(recipe.result) ?? []), recipe]);
  const name = (id: string) => data.entries.get(id)!.name;
  const lines: string[] = [
    "# Recipe Key",
    "",
    "Generated from the game data by `npm run key`. Do not edit by hand; it is rewritten whenever the data changes.",
    "",
    `Everything here can be made now, starting from ${data.balance.startingEntries.map(name).join(", ")}.`,
    "Drafted spells and materials are not listed until they are approved (`npm run craft -- status`).",
    "",
    "- **Quick reference:** the last combo that makes each thing.",
    "- **Full paths:** every combo in order, from the starting elements. Search this file for a name to find its path.",
    "- Casting any spell needs a focus (the Spellbook), so spell paths include it.",
    "",
    "## Quick reference",
  ];

  for (const { kind, title } of SECTIONS) {
    const entries = sorted(data, kind);
    if (entries.length === 0) continue;
    lines.push("", `### ${title} (${entries.length})`, "");
    const extra = kind === "spell" ? ["School", "Tier"] : kind === "job" ? ["Type"] : [];
    lines.push(`| ${["Name", ...extra, "Made from", "Combos"].join(" | ")} |`, `|${"---|".repeat(extra.length + 3)}`);
    for (const entry of entries) {
      const detail =
        kind === "spell" ? [name(entry.school!), String(entry.tier)] : kind === "job" ? [data.jobs.get(entry.id)!.magic ? "magic" : "mundane"] : [];
      const recipe = describeRecipes(data, recipesFor.get(entry.id) ?? []);
      lines.push(`| ${[entry.name, ...detail, recipe, String(buildPath(data, entry.id).length)].join(" | ")} |`);
    }
  }

  lines.push("", "## Full paths");
  for (const { kind, title } of SECTIONS) {
    const entries = sorted(data, kind);
    if (entries.length === 0) continue;
    lines.push("", `### ${title}`);
    for (const entry of entries) {
      const steps = buildPath(data, entry.id);
      const label = kind === "spell" ? `${entry.name} (${name(entry.school!)}, ${entry.tier === 0 ? "cantrip" : `tier ${entry.tier}`})` : entry.name;
      lines.push("", `#### ${label}`, "");
      for (const [index, step] of steps.entries()) lines.push(`${index + 1}. ${describeStep(data, step)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
