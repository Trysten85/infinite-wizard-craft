import { slugify, type Spell, type SpellRecipe } from "../../shared/schema";

export type KeySource = SpellRecipe["keySource"];
export type KeyCandidate = { key: string; source: KeySource; cost: number; note: string };

// Lower cost is preferred. A spell's own component beats an element, and its own element beats a guess.
const COST: Record<Exclude<KeySource, "hand">, number> = {
  component: 0,
  "new-material": 10,
  "own-element": 20,
  "ranked-element": 30,
};
const UNPLACED = 1_000_000;
export const RANKED_BASE_COST = COST["ranked-element"];

// Existing entries whose name is contained in the material's name: "iron powder" is Iron, "bat fur" is Bat.
export function existingMatches(materialName: string, entryIds: Iterable<string>): string[] {
  const words = new Set(slugify(materialName).split("-"));
  return [...entryIds].filter((id) => id.split("-").every((word) => words.has(word) || words.has(`${word}s`)));
}

export function candidatesFor(
  spell: Spell,
  context: {
    // SRD material id -> its readable name
    materialNames: Map<string, string>;
    // Elements and materials already in the game
    keyEntryIds: string[];
    // Every element, best fit first
    elementRanking: string[];
    // SRD material name -> the existing entry it was judged to be a form of ("yew leaf" -> tree)
    sameAs?: Map<string, string>;
  },
): KeyCandidate[] {
  const candidates: KeyCandidate[] = [];
  const add = (key: string, source: Exclude<KeySource, "hand">, note: string, extra = 0) => {
    if (!candidates.some((candidate) => candidate.key === key)) candidates.push({ key, source, cost: COST[source] + extra, note });
  };
  const names = spell.components.materials.map((id) => context.materialNames.get(id) ?? id);
  const unmatched: string[] = [];
  for (const name of names) {
    const matches = existingMatches(name, context.keyEntryIds);
    for (const id of matches) add(id, "component", `SRD component "${name}"`);
    if (matches.length === 0) unmatched.push(name);
  }
  // A judged match is trusted a little less than a name match, and more than inventing a material.
  for (const name of unmatched) {
    const id = context.sameAs?.get(name);
    if (id) add(id, "component", `SRD component "${name}", judged a form of ${id}`, 5);
  }
  for (const [index, name] of unmatched.entries()) {
    if (!context.sameAs?.get(name)) add(slugify(name), "new-material", `SRD component "${name}"`, index);
  }
  for (const element of spell.elements) add(element, "own-element", "the spell's own element");
  for (const [index, element] of context.elementRanking.entries()) {
    add(element, "ranked-element", `no component to key on; element fit rank ${index + 1}`, index);
  }
  return candidates;
}

// Gives each spell in a group a different key at the lowest total cost (the Hungarian method).
// A spell that cannot be given any free key maps to null.
export function assignKeys(
  group: { id: string; candidates: KeyCandidate[] }[],
  taken: Set<string> = new Set(),
): Map<string, KeyCandidate | null> {
  const keys = [...new Set(group.flatMap((spell) => spell.candidates.map((c) => c.key)))].filter((key) => !taken.has(key));
  const n = group.length;
  // One spare column per spell means "left unplaced", so a full assignment always exists.
  const m = keys.length + n;
  const cost = group.map((spell) =>
    Array.from({ length: m }, (_, column) => spell.candidates.find((c) => c.key === keys[column])?.cost ?? UNPLACED),
  );

  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const match = new Array<number>(m + 1).fill(0);
  const way = new Array<number>(m + 1).fill(0);
  for (let row = 1; row <= n; row++) {
    match[0] = row;
    let column = 0;
    const slack = new Array<number>(m + 1).fill(Infinity);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[column] = true;
      const current = match[column]!;
      let delta = Infinity;
      let next = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const reduced = cost[current - 1]![j - 1]! - u[current]! - v[j]!;
        if (reduced < slack[j]!) {
          slack[j] = reduced;
          way[j] = column;
        }
        if (slack[j]! < delta) {
          delta = slack[j]!;
          next = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[match[j]!]! += delta;
          v[j]! -= delta;
        } else {
          slack[j]! -= delta;
        }
      }
      column = next;
    } while (match[column] !== 0);
    do {
      const previous = way[column]!;
      match[column] = match[previous]!;
      column = previous;
    } while (column !== 0);
  }

  const result = new Map<string, KeyCandidate | null>(group.map((spell) => [spell.id, null]));
  for (let j = 1; j <= keys.length; j++) {
    const row = match[j]!;
    if (row === 0) continue;
    const spell = group[row - 1]!;
    result.set(spell.id, spell.candidates.find((c) => c.key === keys[j - 1]) ?? null);
  }
  return result;
}
