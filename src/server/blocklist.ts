import { existsSync, readFileSync } from "node:fs";

// Proper nouns the game must never produce. The list is private: it is only ever matched against
// text, and never sent to the model.
export type Blocklist = {
  size: number;
  // The blocked terms found in the text, if any.
  find(text: string): string[];
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// One term per line. Blank lines and lines starting with # are ignored.
export function parseBlocklist(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

export function createBlocklist(terms: string[]): Blocklist {
  // Whole words, case-sensitive, so "Ruin" as a name is caught and "ruin" in a sentence passes.
  // A term written in lowercase also catches its capitalised form, since names get capitalised.
  const matchers = terms.map((term) => {
    const first = term[0]!;
    const head = first === first.toLowerCase() && first !== first.toUpperCase() ? `[${first}${first.toUpperCase()}]` : escapeRegExp(first);
    return { term, pattern: new RegExp(`(?<![A-Za-z0-9])${head}${escapeRegExp(term.slice(1))}(?![A-Za-z0-9])`) };
  });
  return {
    size: terms.length,
    find: (text) => matchers.filter(({ pattern }) => pattern.test(text)).map(({ term }) => term),
  };
}

// A missing file gives an empty list, so the game still runs without it.
export function loadBlocklist(path: string): Blocklist {
  return createBlocklist(existsSync(path) ? parseBlocklist(readFileSync(path, "utf8")) : []);
}
