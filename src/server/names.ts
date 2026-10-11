// Checks on a result's name that code can make without asking anyone: is it a real word, is it
// only the ingredients' own names again, does it belong in the world. The game's rules and the
// bake's review both use these.

// The plain words of a name: "Witch's Brew" is witch and brew.
export function wordsOfName(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[\s-]+/)
    .map((word) => word.replace(/['’]s$/, "").replace(/[^a-z]/g, ""))
    .filter((word) => word !== "");
}

// Whether every word of the name is a real one. `known` is for whole names the game vouches for
// (storybook things, things already in the game), which need not be in any dictionary.
export function isRealName(name: string, words: Set<string>, known: (name: string) => boolean = () => false): boolean {
  if (known(name)) return true;
  const parts = wordsOfName(name);
  return parts.length > 0 && parts.every((word) => words.has(word));
}

const stem = (word: string) => (word.length > 3 && word.endsWith("e") ? word.slice(0, -1) : word);

// A name of two words or more that is nothing but the ingredients' own names, perhaps with new
// endings: Salted gold from Salt and Gold, Bone tea from Bone dust and Tea. It says what went in.
// It is not a new thing.
export function isOnlyIngredients(name: string, a: string, b: string): boolean {
  const parts = wordsOfName(name);
  const sources = [...wordsOfName(a), ...wordsOfName(b)].filter((word) => word.length >= 3).map(stem);
  return parts.length >= 2 && parts.every((part) => sources.some((source) => part.startsWith(source)));
}

export type Banned = { names: string[]; words: string[] };

// Whether a name is on the list of things that do not belong in this world: anything from after
// the age of steam.
export function isBanned(name: string, banned: Banned): boolean {
  const whole = wordsOfName(name).join(" ");
  const joined = wordsOfName(name).join("");
  return banned.names.some((item) => item === whole || item.replace(/\s+/g, "") === joined) || wordsOfName(name).some((word) => banned.words.includes(word));
}

// The one spelling of a name the game uses: "salt water" becomes Saltwater. Otherwise the name
// as given, with a capital, as the game shows everything the model names.
export function canonicalName(name: string, aliases: Map<string, string>): string {
  const trimmed = name.trim();
  return aliases.get(wordsOfName(trimmed).join(" ")) ?? trimmed[0]!.toUpperCase() + trimmed.slice(1);
}

// The first worn-out word or phrase a description leans on, if any.
export function overusedIn(text: string, overused: string[]): string | null {
  const lower = text.toLowerCase();
  return overused.find((phrase) => new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower)) ?? null;
}
