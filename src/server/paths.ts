import type { GameData, Recipe } from "./gameData";

// Works backwards from one entry to the starting elements, and returns the combos to make it,
// in an order a player could follow. Each needed combo appears once.
// Pass `have` to get only the combos still missing for a player who already has those entries.
export function buildPath(data: GameData, targetId: string, have: Iterable<string> = []): Recipe[] {
  const recipesFor = new Map<string, Recipe[]>();
  for (const recipe of data.combos.values()) {
    recipesFor.set(recipe.result, [...(recipesFor.get(recipe.result) ?? []), recipe]);
  }
  const depthOf = (id: string) => data.entries.get(id)?.depth ?? Infinity;

  const steps: Recipe[] = [];
  const made = new Set([...data.balance.startingEntries, ...have]);
  const focuses = [...data.entries.values()].filter((entry) => entry.kind === "focus").sort((a, b) => a.depth - b.depth);
  // A player who already owns a focus does not need to make another.
  const shallowestFocus = focuses.some((focus) => made.has(focus.id)) ? undefined : focuses[0];
  function make(id: string): void {
    if (made.has(id)) return;
    made.add(id);
    const entry = data.entries.get(id);
    const options = recipesFor.get(id);
    if (!entry || !options) throw new Error(`"${id}" has no recipe`);
    // The recipe the loader's depth came from: the one whose ingredients are shallowest.
    const cost = (recipe: Recipe) => Math.max(...[...recipe.inputs, ...recipe.needs].map(depthOf));
    const recipe = options.reduce((best, option) => (cost(option) < cost(best) ? option : best));
    // A spell cannot be shaped without a focus, so the focus is part of its path.
    if (entry.kind === "spell" && shallowestFocus) make(shallowestFocus.id);
    for (const ingredient of [...recipe.inputs, ...recipe.needs]) make(ingredient);
    steps.push(recipe);
  }
  make(targetId);
  return steps;
}

export function describeStep(data: GameData, step: Recipe): string {
  const name = (id: string) => data.entries.get(id)?.name ?? id;
  const needs = step.needs.length > 0 ? `  (needs ${step.needs.map(name).join(", ")})` : "";
  return `${name(step.inputs[0])} + ${name(step.inputs[1])} = ${name(step.result)}${needs}`;
}
