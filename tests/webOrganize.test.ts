import { describe, expect, it } from "vitest";
import type { GameEntry } from "../src/shared/schema";
import {
  DEFAULT_ORGANIZE,
  organizeEntries,
  parseOrganize,
  seenElements,
  serializeOrganize,
  type Organize,
} from "../web/src/organize";

function entry(name: string, kind: GameEntry["kind"], affinity: string[], tier = 0): GameEntry {
  const id = name.toLowerCase();
  return { id, name, kind, description: "x", tags: [], affinity, tier, source: "generated", depth: 0, xp: 0 };
}

// Discovery order, oldest first.
const entries = [
  entry("Fire", "element", ["fire"]),
  entry("Water", "element", ["water"]),
  entry("Steam", "material", ["fire", "water"], 1),
  entry("Mud", "material", ["water", "earth"]),
  entry("Wizard", "job", ["earth", "life", "light"], 2),
];

const names = (options: Partial<Organize>) =>
  organizeEntries(entries, { ...DEFAULT_ORGANIZE, sort: "oldest", ...options }).map((e) => e.name);

describe("organizeEntries", () => {
  it("sorts by discovery order, name, or tier", () => {
    expect(names({ sort: "oldest" })).toEqual(["Fire", "Water", "Steam", "Mud", "Wizard"]);
    expect(names({ sort: "newest" })).toEqual(["Wizard", "Mud", "Steam", "Water", "Fire"]);
    expect(names({ sort: "name" })).toEqual(["Fire", "Mud", "Steam", "Water", "Wizard"]);
    expect(names({ sort: "tier" })).toEqual(["Fire", "Mud", "Water", "Steam", "Wizard"]);
  });

  it("searches names without caring about case or surrounding spaces", () => {
    expect(names({ query: " ST " })).toEqual(["Steam"]);
    expect(names({ query: "e" })).toEqual(["Fire", "Water", "Steam"]);
  });

  it("filters by kind", () => {
    expect(names({ kind: "material" })).toEqual(["Steam", "Mud"]);
    expect(names({ kind: "job" })).toEqual(["Wizard"]);
  });

  it("keeps entries that belong to any of the chosen elements", () => {
    expect(names({ elements: ["fire"] })).toEqual(["Fire", "Steam"]);
    expect(names({ elements: ["fire", "earth"] })).toEqual(["Fire", "Steam", "Mud", "Wizard"]);
  });

  it("applies search, kind, and element filters together", () => {
    expect(names({ query: "m", kind: "material", elements: ["water"] })).toEqual(["Steam", "Mud"]);
    expect(names({ query: "m", kind: "material", elements: ["earth"] })).toEqual(["Mud"]);
    expect(names({ query: "zzz" })).toEqual([]);
  });

  it("leaves the list it was given untouched", () => {
    const before = entries.map((e) => e.name);
    names({ sort: "name" });
    names({ sort: "newest" });
    expect(entries.map((e) => e.name)).toEqual(before);
  });
});

describe("seenElements", () => {
  it("lists each element once, in the order first seen", () => {
    expect(seenElements(entries)).toEqual(["fire", "water", "earth", "life", "light"]);
  });
});

describe("parseOrganize", () => {
  it("restores saved choices but never the search text", () => {
    const saved = serializeOrganize({ query: "mud", sort: "tier", kind: "job", elements: ["fire"] });
    expect(parseOrganize(saved)).toEqual({ query: "", sort: "tier", kind: "job", elements: ["fire"] });
  });

  it("falls back to the defaults when nothing usable is saved", () => {
    expect(parseOrganize(null)).toEqual(DEFAULT_ORGANIZE);
    expect(parseOrganize("{not json")).toEqual(DEFAULT_ORGANIZE);
    expect(parseOrganize(JSON.stringify({ sort: "sideways", kind: "all", elements: [] }))).toEqual(DEFAULT_ORGANIZE);
    // A filter saved before the focus stopped being a kind of bubble.
    expect(parseOrganize(JSON.stringify({ sort: "name", kind: "focus", elements: [] }))).toEqual(DEFAULT_ORGANIZE);
  });
});
