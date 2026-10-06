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
// A spell also carries what it costs to learn, so the page can show the price before asking.
// A model-made entry is marked `wonder` when it came from a storybook combination, so that what
// is made from it stays in that register too.
export type GameEntry = Entry & { depth: number; xp: number; learnCost?: number; wonder?: boolean };

export const RESPONSE_TYPES = ["generous", "skilled", "fair", "sharp", "avoid"] as const;
export const responseTypeSchema = z.enum(RESPONSE_TYPES);
export type ResponseType = z.infer<typeof responseTypeSchema>;
export const stakesSchema = z.enum(["S", "M", "L"]);
export type Stakes = z.infer<typeof stakesSchema>;

export const EVENT_KINDS = ["oopsy", "mishap", "opportunity", "conflict", "social", "bureaucracy", "community", "trade", "comic"] as const;
export const MOODS = ["warm", "awkward", "silly", "tense", "proud", "mysterious", "bittersweet"] as const;

// An event seed: a loose premise the writer expands. Code decides everything that has consequences.
export const eventSeedSchema = z.strictObject({
  id: z.string().regex(/^[a-z]+(_[a-z]+)*$/),
  premise: z.string().min(1),
  kind: z.enum(EVENT_KINDS),
  mood: z.array(z.enum(MOODS)).min(1).max(2),
  // Player tags that make the seed more likely.
  tags: z.array(z.string()),
  // Tags that unlock the Skilled response. With `skillFromJob`, the player's job supplies them.
  skillTags: z.array(z.string()),
  skillFromJob: z.boolean().optional(),
  // "new" always introduces someone. "any" may bring back a person the player knows.
  who: z.enum(["new", "any"]),
  stakes: z.array(stakesSchema).min(1),
  responseTypes: z.array(responseTypeSchema).min(2),
  followUp: z.enum(["none", "possible", "likely"]),
  minLevel: z.number().int().min(1).optional(),
  needsSpell: z.boolean().optional(),
  needsJob: z.boolean().optional(),
  // Whether the person may ask the player to make something afterwards.
  canRequest: z.boolean().optional(),
  // A spell can only be the Skilled way through if it carries one of these tags. An empty list
  // means no spell solves this kind of event. Left out, the seed's skill tags are used.
  spellTags: z.array(z.string()).optional(),
});
export type EventSeed = z.infer<typeof eventSeedSchema>;

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

// A quest is done when its condition is met. Conditions are data, so quests never need code.
export const questSchema = z.strictObject({
  id: idSchema,
  title: z.string().min(1),
  detail: z.string().min(1),
  gold: z.number().int().min(0),
  done: z.discriminatedUnion("type", [
    // Anything at all beyond the starting entries.
    z.strictObject({ type: z.literal("discovered-any") }),
    z.strictObject({ type: z.literal("has-kind"), kind: z.enum(["material", "focus", "school", "spell", "job"]) }),
    z.strictObject({ type: z.literal("has-entry"), entry: idSchema }),
    z.strictObject({ type: z.literal("learned-count"), count: z.number().int().min(1) }),
    z.strictObject({ type: z.literal("level"), level: z.number().int().min(1) }),
    z.strictObject({ type: z.literal("has-tag"), tag: z.string() }),
  ]),
});
export type Quest = z.infer<typeof questSchema>;

// "active" is the quest to work on next: the first one not yet done.
export type QuestProgress = { id: string; title: string; detail: string; gold: number; state: "done" | "active" | "upcoming" };

// Something a person from an event has asked the player to make.
export type RequestView = { id: number; from: string; ask: string; entry: { id: string; name: string }; gold: number; state: "open" | "done" };

// An event waiting on the player. Outcomes and effects are only revealed by responding.
export type EventView = {
  id: number;
  kind: (typeof EVENT_KINDS)[number];
  mood: (typeof MOODS)[number][];
  person: { name: string; role: string; returning: boolean };
  scene: string;
  // A Skilled response that uses one of the player's spells names it in `spell`.
  responses: { type: ResponseType; text: string; spell?: { id: string; name: string } }[];
};

export type EventOutcome = {
  outcome: string;
  effects: { gold: number; rep: number; fondness: number };
  // Set when the person goes on to ask for something.
  request: RequestView | null;
};

export type Progress = {
  xp: number;
  level: number;
  // XP earned inside the current level, and how much that level takes in all.
  levelInto: number;
  levelSpan: number;
  gold: number;
  // Ids of learned spell entries, oldest first.
  learned: string[];
  quests: QuestProgress[];
};

// What events add to a player's progress. The server sends both together.
export type Standing = {
  // Standing with the town, and the name of the band it falls in.
  rep: number;
  repBand: string;
  // Open requests first, then finished ones.
  requests: RequestView[];
  // An event is waiting, or will be once this many more points are earned.
  eventReady: boolean;
  eventIn: number;
};
export type PlayerProgress = Progress & Standing;

// What a player just earned, for the page to announce.
export type Rewards = { gold: number; quests: { id: string; title: string; gold: number }[] };

export type ShopSlot = {
  slot: number;
  // A tailored slot was picked for this player, and `reason` says why.
  type: "random" | "tailored";
  reason: string;
  entry: GameEntry;
  price: number;
  // Bought from this shelf, or since made by the player.
  sold: boolean;
};
export type ShopView = { slots: ShopSlot[]; restockIn: number };

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
  // Going from level N to N + 1 takes N times xpStep. Nobody goes past the cap.
  levels: z.strictObject({ xpStep: z.number().int().min(1), cap: z.number().int().min(1) }),
  // Learning a spell costs this much gold per tier, counting a cantrip as one tier.
  learnCostPerTier: z.number().int().min(0),
  // Gold for a first discovery made by combining, by the entry's tier.
  discoveryGoldByTier: z.array(z.number().int().min(0)).min(1),
  shop: z.strictObject({
    // The shelf restocks after this many new discoveries made by combining.
    restockEvery: z.number().int().min(1),
    basePrice: z.number().int().min(0),
    pricePerDepth: z.number().int().min(0),
    // "Missing steps" are the combos the player still has not made on the way to the item.
    pricePerMissingStep: z.number().int().min(0),
    spellMarkup: z.number().min(1),
    neverSells: z.array(idSchema),
  }),
  events: z.strictObject({
    // An event arrives when the player has earned this many points.
    every: z.number().int().min(1),
    points: z.strictObject({ discovery: z.number().int(), quest: z.number().int(), spell: z.number().int(), level: z.number().int() }),
    // How big an event is. `gold` is what a Generous or Sharp response moves; `scale` multiplies rep and fondness.
    stakes: z.record(stakesSchema, z.strictObject({ gold: z.number().int().min(0), scale: z.number().min(0) })),
    // What each response type does. `gold` is a multiple of the stakes' gold.
    effects: z.record(responseTypeSchema, z.strictObject({ gold: z.number(), rep: z.number().int(), fondness: z.number().int() })),
    // Lowest first. A band applies from its `from` value upward.
    repBands: z
      .array(z.strictObject({ name: z.string(), from: z.number().int(), shopPrice: z.number(), requestPay: z.number(), eventEvery: z.number().int() }))
      .min(1),
    // How often a known person comes back, once the player has met enough people.
    repeatShare: z.number().min(0).max(1),
    repeatMinPeople: z.number().int().min(1),
    followUpChance: z.strictObject({ none: z.number(), possible: z.number(), likely: z.number() }),
    request: z.strictObject({
      chance: z.number().min(0).max(1),
      goldPerLevel: z.number().int().min(0),
      rep: z.number().int(),
      fondness: z.number().int(),
      // A request never asks for something further away than this many combos.
      maxMissingSteps: z.number().int().min(1),
    }),
    // After an event is written, how often the writer is asked whether one of the player's spells
    // would solve it. Spells carrying a blocked tag are never offered as a solution.
    spellCheck: z.strictObject({ chance: z.number().min(0).max(1), blockedTags: z.array(z.string()) }),
    maxActivePeople: z.number().int().min(1),
    // How many past interactions the writer is shown.
    memory: z.number().int().min(1),
    // A person whose fondness reaches this far either way has had their story.
    settledAt: z.number().int().min(1),
  }),
  generation: z.strictObject({
    maxAttempts: z.number().int().min(1),
    temperature: z.number().min(0).max(2),
    // Combining with one of these may make a storybook thing (a golem, a ghost). Anything else
    // makes an ordinary real-world thing.
    wonderInputs: z.array(idSchema),
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
// `storybook` is set by code, never by the model: the name was chosen from the storybook list.
export type ComboDraft = { name: string; description: string; tags: string[]; missingTag: string | null; storybook?: boolean };

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
