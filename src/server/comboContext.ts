import type { ComboExample, GameEntry, StorybookItem } from "../shared/schema";
import type { GameData } from "./gameData";
import type { Store } from "./store";

// The parts of naming a combination that code does on its own, before the model is asked anything.

// What a thing was made from, as names: "Steam and Life". Null for the starting elements.
// A model does far better knowing that a Spirit came from Death and Air than from its name alone.
export type MadeFrom = (id: string) => string | null;

export function createMadeFrom(data: GameData, store: Pick<Store, "getMakers" | "getEntry">): MadeFrom {
  const authored = new Map<string, [string, string]>();
  for (const recipe of data.combos.values()) if (!authored.has(recipe.result)) authored.set(recipe.result, recipe.inputs);
  const nameOf = (id: string) => data.entries.get(id)?.name ?? store.getEntry(id)?.name ?? id;
  return (id) => {
    const makers = authored.get(id) ?? store.getMakers(id);
    return makers ? makers.map(nameOf).join(" and ") : null;
  };
}

// One ingredient as the model reads it: the name, and for a model-made thing what it came from.
// The description is left out on purpose. The hand-written ones are jokes ("Person: mud that
// stood up and asked what was for breakfast"), and a small model takes them at their word: it
// starts making things out of mud, and writes a pickle up as a slice of bread.
// A hand-written thing may carry a gloss, a few plain words saying what it is, so that Spirits is
// read as a drink and a Bat as an animal.
export function thingName(entry: GameEntry, madeFrom: string | null): string {
  if (madeFrom && entry.source === "generated") return `${entry.name} (made from ${madeFrom})`;
  return entry.gloss ? `${entry.name} (${entry.gloss})` : entry.name;
}

function hash(text: string): number {
  let value = 0;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value;
}

// A number from 0 up to 1 that belongs to this pair: the same every time, whichever way round
// the two are given. It lets code set a dial ("one pair in four") without anything being random.
export function pairShare(a: GameEntry, b: GameEntry): number {
  return (hash(`twist:${[a.id, b.id].sort().join("+")}`) % 1000) / 1000;
}

// What a storybook item's `from` words are matched against: a thing's id and the single words of
// its id, so "bone" finds Bone dust. Tags are left out on purpose. They are too loose: a
// spellbook is tagged as a plant, being paper, and that should not grow it into a Treant.
function wordsOf(entry: GameEntry): Set<string> {
  return new Set([entry.id, ...entry.id.split("-")]);
}

// The storybook things on offer for this pair, best fit first. Code decides this, not the model.
// A thing is on offer only when one ingredient is what it is made of and the other is what wakes
// it: a tree and Life, a Treant. A tree and anything else is never a Treant.
export function storybookFor(items: StorybookItem[], a: GameEntry, b: GameEntry, limit: number): string[] {
  const key = [a.id, b.id].sort().join("+");
  const fits = (item: StorybookItem, body: GameEntry, spark: GameEntry) => (item.wokenBy.includes(spark.id) ? item.from.filter((word) => wordsOf(body).has(word)).length : 0);
  return items
    .map((item) => ({ name: item.name, fit: Math.max(fits(item, a, b), fits(item, b, a)) }))
    .filter((item) => item.fit > 0)
    // Equal fits are put in an order that differs from pair to pair, so the same few names are
    // not always at the front.
    .sort((x, y) => y.fit - x.fit || hash(key + x.name) - hash(key + y.name))
    .slice(0, limit)
    .map((item) => item.name);
}

// The examples most like this pair. One that shares an ingredient comes first. A hand-written
// recipe is only shown when it does. An ordinary pair is never shown magical examples.
export function pickExamples(examples: ComboExample[], a: GameEntry, b: GameEntry, magical: boolean, count: number): ComboExample[] {
  const names = new Set([a.name.toLowerCase(), b.name.toLowerCase()]);
  const key = [a.id, b.id].sort().join("+");
  const scored = examples
    .map((example) => ({ example, shared: example.inputs.filter((input) => names.has(input.toLowerCase())).length }))
    .filter(({ example, shared }) => (magical || example.kind === "ordinary") && (shared > 0 || !example.authored))
    .sort((x, y) => y.shared - x.shared || hash(key + x.example.result) - hash(key + y.example.result));
  if (!magical) return scored.slice(0, count).map(({ example }) => example);
  // A magical pair is shown everyday things that came of magic, and ordinary ones only where an
  // ingredient is shared.
  const kinds = [scored.filter(({ example }) => example.kind === "charmed"), scored.filter(({ example, shared }) => example.kind === "ordinary" && shared > 0)];
  const picked: ComboExample[] = [];
  for (let turn = 0; picked.length < count && kinds.some((list) => list.length > 0); turn++) {
    const next = kinds[turn % kinds.length]!.shift();
    if (next) picked.push(next.example);
  }
  return picked;
}

export function exampleLine(example: ComboExample): string {
  return `${example.inputs[0]} + ${example.inputs[1]} = ${example.result} (${example.why})`;
}
