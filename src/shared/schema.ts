import { z } from "zod";

export const idSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "ids are lowercase-with-dashes");

export const MAX_TAGS = 5;

// One word of the closed tag vocabulary. Author-only tags are never offered to the model.
export const tagSchema = z.strictObject({
  id: z.string().regex(/^[a-z]+$/, "tags are lowercase single words"),
  group: z.enum(["effect", "form", "material", "craft", "society"]),
  meaning: z.string().min(1),
  assignedBy: z.enum(["model", "author"]),
});
export type Tag = z.infer<typeof tagSchema>;

// An entry as written in data/entries.json: the shared fields from the design doc.
export const entrySchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1),
  kind: z.enum(["element", "material", "focus"]),
  description: z.string().min(1),
  // An entry with no tags is allowed. It shows up in `npm run tags` for review.
  tags: z.array(z.string()).max(MAX_TAGS),
  affinity: z.array(idSchema),
  tier: z.number().int().min(0),
  source: z.enum(["start", "authored", "generated"]),
});
export type Entry = z.infer<typeof entrySchema>;

// An entry at runtime. Depth and XP are computed by code, never written by hand or by the model.
export type GameEntry = Entry & { depth: number; xp: number };

export const schoolSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()),
});
export type School = z.infer<typeof schoolSchema>;

export const spellSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1),
  tier: z.number().int().min(0).max(9),
  school: idSchema,
  elements: z.array(idSchema),
  tags: z.array(z.string()).max(MAX_TAGS),
  components: z.strictObject({
    verbal: z.boolean(),
    somatic: z.boolean(),
    material: z.boolean(),
    // The source's wording, kept verbatim. `materials` are ids from data/srd/materials.json.
    materialText: z.string().nullable(),
    materials: z.array(idSchema),
    costGp: z.number().int().min(0).nullable(),
    consumed: z.boolean(),
  }),
  source: z.enum(["srd", "authored", "generated"]),
});
export type Spell = z.infer<typeof spellSchema>;

export const comboSchema = z.strictObject({
  inputs: z.tuple([idSchema, idSchema]),
  result: idSchema,
  logic: z.string().optional(),
});
export type Combo = z.infer<typeof comboSchema>;

export const balanceSchema = z.strictObject({
  startingEntries: z.array(idSchema).min(1),
  depthPerTier: z.number().int().min(1),
  discoveryXpByTier: z.array(z.number().int().min(0)).min(1),
  generation: z.strictObject({
    maxAttempts: z.number().int().min(1),
    temperature: z.number().min(0).max(2),
  }),
});
export type Balance = z.infer<typeof balanceSchema>;

// What the model is allowed to write for a new combo. Everything else is filled in by code.
export function comboDraftSchema(tags: Iterable<Tag>) {
  const allowed = [...tags].filter((tag) => tag.assignedBy === "model").map((tag) => tag.id);
  return z.strictObject({
    name: z.string().min(1).max(40),
    description: z.string().min(1).max(240),
    tags: z.array(z.enum(allowed as [string, ...string[]])).max(MAX_TAGS),
    // One word for what the vocabulary lacked. A hint for human review, never used as a tag.
    missingTag: z.string().max(20).nullable(),
  });
}
export type ComboDraft = { name: string; description: string; tags: string[]; missingTag: string | null };

export type CombineResult = {
  entry: GameEntry;
  origin: "authored" | "cached" | "generated";
  firstDiscovery: boolean;
};

export function comboKey(a: string, b: string): string {
  return [a, b].sort().join("+");
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
