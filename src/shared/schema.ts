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
  kind: z.enum(["element", "material", "focus", "school", "spell", "job"]),
  description: z.string().min(1),
  // An entry with no tags is allowed. It shows up in `npm run tags` for review.
  tags: z.array(z.string()).max(MAX_TAGS),
  affinity: z.array(idSchema),
  // Spells only: the school the spell belongs to.
  school: idSchema.optional(),
  tier: z.number().int().min(0),
  source: z.enum(["start", "authored", "generated", "srd"]),
});
export type Entry = z.infer<typeof entrySchema>;

// An entry at runtime. Depth and XP are computed by code, never written by hand or by the model.
export type GameEntry = Entry & { depth: number; xp: number };

export const schoolSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()),
  // The elements this school makes cantrips from. Not the same as the recipe that discovers it.
  naturalElements: z.array(idSchema),
});
export type School = z.infer<typeof schoolSchema>;

// One rung of a school's spell ladder: the signature spell for a tier and the materials it needs.
export const ladderSchema = z.strictObject({
  school: idSchema,
  tier: z.number().int().min(1).max(9),
  spell: idSchema,
  needs: z.array(idSchema),
});
export type Ladder = z.infer<typeof ladderSchema>;

// A job is discovered like anything else: by combining the two things in `inputs`.
export const jobSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1),
  // A magic job cannot be reached without a school or a focus somewhere in its recipe chain.
  magic: z.boolean(),
  inputs: z.tuple([idSchema, idSchema]),
  // The job is also made by the first input + any spell in play that carries this tag.
  orAnySpellTagged: z.string().optional(),
  // The job the first job quest points the player at.
  starter: z.boolean().optional(),
  description: z.string().min(1),
  // Shown in place of the job while it is still undiscovered.
  hint: z.string().min(1),
  tags: z.array(z.string()).max(MAX_TAGS),
  // What a good build for this job has. Used for score, once score exists.
  wantedTags: z.array(z.string()).min(1),
});
export type Job = z.infer<typeof jobSchema>;

// Rows drafted by `npm run craft`. Only rows with status "ok" are live in the game.
export const draftStatusSchema = z.enum(["draft", "ok", "review"]);

// How a spell outside the hand-written ladders is made: a lower spell of its school + this key.
export const spellRecipeSchema = z.strictObject({
  spell: idSchema,
  key: idSchema.nullable(),
  keySource: z.enum(["component", "new-material", "own-element", "ranked-element", "hand"]),
  // Why this key, for whoever reviews the row.
  note: z.string().optional(),
  status: draftStatusSchema,
});
export type SpellRecipe = z.infer<typeof spellRecipeSchema>;

// A material that exists because a spell needs it. `inputs` is null until a recipe is drafted.
export const spellMaterialSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1),
  description: z.string(),
  tags: z.array(z.string()).max(MAX_TAGS),
  inputs: z.tuple([idSchema, idSchema]).nullable(),
  logic: z.string(),
  forSpells: z.array(idSchema),
  status: draftStatusSchema,
});
export type SpellMaterial = z.infer<typeof spellMaterialSchema>;

// A spell appears among a player's discoveries as an entry. The prefix keeps the Light cantrip
// apart from the Light element.
export function spellEntryId(spellId: string): string {
  return `spell-${spellId}`;
}

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
  // Spell tier -> [shallowest, deepest] depth allowed for a material that keys a spell of that tier.
  componentDepthByTier: z.record(z.string(), z.tuple([z.number().int().min(1), z.number().int().min(1)])),
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
