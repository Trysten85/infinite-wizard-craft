import { z } from "zod";
import type { Entry, GameEntry } from "../../src/shared/schema";

export const SORTS = ["newest", "oldest", "name", "tier"] as const;
export const KINDS = ["all", "element", "material", "school", "spell", "job"] as const satisfies readonly (Entry["kind"] | "all")[];

// How the organizer panel narrows and orders the discovered list.
export type Organize = {
  query: string;
  sort: (typeof SORTS)[number];
  kind: (typeof KINDS)[number];
  // Element ids. An entry matches when its affinity includes any of them. Empty means no filter.
  elements: string[];
};

export const DEFAULT_ORGANIZE: Organize = { query: "", sort: "newest", kind: "all", elements: [] };

const savedSchema = z.object({
  sort: z.enum(SORTS),
  kind: z.enum(KINDS),
  elements: z.array(z.string()),
});

// `entries` must be in discovery order, oldest first, which is how the server returns them.
export function organizeEntries(entries: GameEntry[], options: Organize): GameEntry[] {
  const query = options.query.trim().toLowerCase();
  const shown = entries.filter(
    (entry) =>
      (options.kind === "all" || entry.kind === options.kind) &&
      (options.elements.length === 0 || entry.affinity.some((id) => options.elements.includes(id))) &&
      entry.name.toLowerCase().includes(query),
  );
  switch (options.sort) {
    case "oldest":
      return shown;
    case "newest":
      return shown.reverse();
    case "name":
      return shown.sort((a, b) => a.name.localeCompare(b.name));
    case "tier":
      return shown.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
  }
}

// Every element the discovered entries belong to, in the order first seen.
export function seenElements(entries: GameEntry[]): string[] {
  return [...new Set(entries.flatMap((entry) => entry.affinity))];
}

// Reads saved sort and filter choices. The search text is never saved.
export function parseOrganize(raw: string | null): Organize {
  try {
    const saved = savedSchema.safeParse(JSON.parse(raw ?? "null"));
    return saved.success ? { ...saved.data, query: "" } : DEFAULT_ORGANIZE;
  } catch {
    return DEFAULT_ORGANIZE;
  }
}

export function serializeOrganize(options: Organize): string {
  const { sort, kind, elements } = options;
  return JSON.stringify({ sort, kind, elements });
}
