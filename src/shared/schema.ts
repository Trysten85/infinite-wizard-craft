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
  // A few plain words saying what the thing is, shown to the model beside the name. Without it
  // the model reads Spirits as ghosts and a Bat as something you swing.
  gloss: z.string().min(1).optional(),
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
// A spell also carries what it costs to learn and the level it takes, so the page can show both
// before asking.
// A model-made entry is marked `wonder` when it came from a storybook combination, so that what
// is made from it stays in that register too.
export type GameEntry = Entry & { depth: number; xp: number; learnCost?: number; learnLevel?: number; wonder?: boolean };

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

const questKindSchema = z.enum(["element", "material", "focus", "school", "spell", "job"]);
const countSchema = z.number().int().min(1);
// With `made`, only things the player made by combining count. Anything bought or given is left out.
const madeSchema = z.boolean().optional();

// A quest is done when its condition is met. Conditions are data, so quests never need code.
// Everything a condition counts leaves out the starting entries.
export const questSchema = z.strictObject({
  id: idSchema,
  title: z.string().min(1),
  detail: z.string().min(1),
  // Main quests are one chain, worked through in order. Side quests are open all at once.
  track: z.enum(["main", "side"]),
  // The quest pays once the player has reached this level, however early its condition was met.
  level: z.number().int().min(1),
  gold: z.number().int().min(0),
  xp: z.number().int().min(0),
  done: z.discriminatedUnion("type", [
    // Anything at all beyond the starting entries.
    z.strictObject({ type: z.literal("discovered-any") }),
    z.strictObject({ type: z.literal("discovered-count"), count: countSchema }),
    z.strictObject({ type: z.literal("has-kind"), kind: questKindSchema, made: madeSchema }),
    // This many things of one kind. With `tier`, only those of that tier or higher count.
    z.strictObject({ type: z.literal("kind-count"), kind: questKindSchema, count: countSchema, tier: z.number().int().min(0).optional() }),
    z.strictObject({ type: z.literal("has-entry"), entry: idSchema, made: madeSchema }),
    z.strictObject({ type: z.literal("has-tag"), tag: z.string() }),
    z.strictObject({ type: z.literal("tag-count"), tag: z.string(), count: countSchema }),
    // Something this many combos from the starting entries.
    z.strictObject({ type: z.literal("depth"), depth: countSchema, made: madeSchema }),
    z.strictObject({ type: z.literal("learned-count"), count: countSchema }),
    // A learned spell of exactly this tier.
    z.strictObject({ type: z.literal("learned-tier"), tier: z.number().int().min(0) }),
    // Learned spells from this many different schools.
    z.strictObject({ type: z.literal("learned-schools"), count: countSchema }),
    z.strictObject({ type: z.literal("level"), level: z.number().int().min(1) }),
    // Events seen through to their end, whatever the player chose.
    z.strictObject({ type: z.literal("events"), count: countSchema }),
    // Things bought from the shop.
    z.strictObject({ type: z.literal("bought"), count: countSchema }),
  ]),
});
export type Quest = z.infer<typeof questSchema>;

// "active" is the quest to work on next: the first main quest not yet done. "locked" quests open
// at a level the player has not reached. `progress` is only set for a quest that counts something.
export type QuestProgress = {
  id: string;
  title: string;
  detail: string;
  track: Quest["track"];
  level: number;
  gold: number;
  xp: number;
  state: "done" | "active" | "upcoming" | "locked";
  progress?: { have: number; need: number };
};

// Something a person from an event has asked the player to make.
export type RequestView = { id: number; from: string; ask: string; entry: { id: string; name: string }; gold: number; state: "open" | "done" };

// Something a person let slip: a thing the player has not made, and what it is made from.
export type HintView = { entry: { id: string; name: string }; recipe: string; from: string };

// An event waiting on the player. It is a short conversation: `beat` counts from 1, and `earlier`
// holds what has been said so far. Outcomes and effects are only revealed by responding.
export type EventView = {
  id: number;
  beat: number;
  beats: number;
  earlier: { scene: string; chosen: string; outcome: string }[];
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
  // The conversation goes on: this is its next beat. Null when the event is over.
  next: EventView | null;
  // What the person left the player with, if anything. At most one of these is set.
  request: RequestView | null;
  hint: HintView | null;
  gift: { id: string; name: string } | null;
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
  // Recipes people have mentioned, newest last. The server always sends this.
  hints?: HintView[];
  // A visitor is waiting to be sat with. `eventIn` is counted in days: 0 while today's visitor is
  // on the way or waiting, and 1 once the player has sat with them.
  eventReady: boolean;
  eventIn: number;
  // The job the player has taken up, or null before they choose one. The server always sends
  // this. Events and the shop go by it, not by whichever job was discovered last.
  job?: { id: string; name: string } | null;
  // A shift is open: a job is taken up, it is noon or later, and today's shift is not worked.
  shiftReady?: boolean;
  // Where the player is in their day. Sent once the day is served.
  day?: DayView;
};
export type PlayerProgress = Progress & Standing;

// Why the rules refused something. A refusal comes back as { error, code }: `error` is a sentence
// for the player, and `code` is one of these, for the page to act on.
export type RuleCode =
  | "rule"
  | "no-focus"
  | "missing-needs"
  | "no-result"
  | "not-enough-gold"
  | "sold-out"
  | "level-too-low"
  | "no-job"
  | "shift-not-ready"
  // The day: an evening action tried before dusk, or with too few candles left.
  | "not-evening"
  | "no-candles"
  // The town: no deed for another plot, a building's needs not yet discovered, and the shop
  // asked for before a Market Stall stands.
  | "no-deed"
  | "needs-missing"
  | "no-shop";

// What a player just earned, for the page to announce. A filled request is listed among the
// quests, and pays no XP.
export type Rewards = { gold: number; quests: { id: string; title: string; gold: number; xp: number }[] };

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
// The shelf, which is restocked each morning.
export type ShopView = { slots: ShopSlot[] };

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

// Work shifts. A job's shift is one order filled by picking a Base, a Method, and an optional
// Touch. Code owns everything that has consequences: the order's tags and tier, the quality, the pay.
export const QUALITIES = ["meh", "good", "great", "perfect"] as const;
export type QualityId = (typeof QUALITIES)[number];
export const RANKS = ["apprentice", "journeyman", "master"] as const;
export type RankId = (typeof RANKS)[number];
export const SHIFT_SLOTS = ["base", "method", "touch"] as const;
export type ShiftSlot = (typeof SHIFT_SLOTS)[number];

// Something a job always has to hand for a slot. With `rank`, only from that rank up.
const stapleSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1),
  tags: z.array(z.string()).min(1).max(3),
  rank: z.enum(RANKS).optional(),
});
// One slot of a job's shift: its staples, and which of the player's own things fit it. A spell
// only fits once it is learned and the player's level can cast it.
const skinSlotSchema = z.strictObject({
  name: z.string().min(1),
  staples: z.array(stapleSchema).min(1),
  from: z.strictObject({ kinds: z.array(z.enum(["element", "material", "spell"])).min(1), tags: z.array(z.string()).min(1) }).optional(),
});
// How one job's shift looks: the same engine with different names. A new job only needs one of these.
export const jobSkinSchema = z.strictObject({
  job: idSchema,
  // What this job's orders tend to be about. For the writer, once the model writes orders.
  flavor: z.string().min(1),
  // What an order is for. Each one starts a sentence.
  subjects: z.array(z.string().min(1)).min(3),
  base: skinSlotSchema,
  method: skinSlotSchema,
  touch: skinSlotSchema,
});
export type JobSkin = z.infer<typeof jobSkinSchema>;

// The plain words orders and results are written in until the model writes them.
export const shiftTextSchema = z.strictObject({
  // A short noun phrase for each tag, to follow "It calls for".
  tagWords: z.record(z.string(), z.string().min(1)),
  results: z.record(z.enum(QUALITIES), z.array(z.string().min(1)).min(1)),
});
export type ShiftText = z.infer<typeof shiftTextSchema>;

// The town. A building is raised on a plot, has a tier from 1 up, and gives something back to
// crafting. The rules are in src/shared/town.ts and the design is in Town Guide.md.

// Something the player must have discovered before a building can be raised or raised a tier.
// It is checked, never taken. Either a named thing with a hand-written recipe, or anything
// carrying a tag, optionally at a depth and optionally made by the player's own hand.
export const needSchema = z.union([
  z.strictObject({ entry: idSchema }),
  z.strictObject({ tag: z.string(), depth: z.number().int().min(1).optional(), made: z.boolean().optional() }),
]);
export type Need = z.infer<typeof needSchema>;

const shareSchema = z.number().min(0);
// What a building gives back. A closed list: code knows what each one does.
export const perkSchema = z.discriminatedUnion("type", [
  // The shop is open, with its random shelves.
  z.strictObject({ type: z.literal("opens-shop") }),
  // More of the shop's shelves.
  z.strictObject({ type: z.literal("shop-shelves"), shelves: z.enum(["tailored"]) }),
  // Shop prices lower by this share.
  z.strictObject({ type: z.literal("shop-discount"), share: shareSchema }),
  // More gold for a discovery carrying one of these tags, by this building's quality tonight.
  z.strictObject({ type: z.literal("discovery-gold"), tags: z.array(z.string()).min(1), share: z.record(z.enum(QUALITIES), shareSchema) }),
  // Another building's quality is this many steps better.
  z.strictObject({ type: z.literal("lifts"), building: idSchema, steps: z.number().int().min(1) }),
  // Spells cost this share less to learn.
  z.strictObject({ type: z.literal("learn-discount"), share: shareSchema }),
  // A free hint every so many days.
  z.strictObject({ type: z.literal("rumour"), every: z.number().int().min(1) }),
  // A gift carrying one of these tags every so many days.
  z.strictObject({ type: z.literal("gift"), tags: z.array(z.string()).min(1), every: z.number().int().min(1) }),
  // Enchantments last this many days longer.
  z.strictObject({ type: z.literal("enchant-days"), days: z.number().int().min(1) }),
  // More candles each evening.
  z.strictObject({ type: z.literal("candles"), count: z.number().int().min(1) }),
  // Meals are served: tomorrow's discoveries pay this share more, for this much gold a level.
  z.strictObject({ type: z.literal("meals"), lift: shareSchema, goldPerLevel: z.number().int().min(0) }),
]);
export type Perk = z.infer<typeof perkSchema>;

// One tier of one building. `perks` is everything the building gives at that tier, not only
// what the tier adds. `needs` are named things on top of what every building of that tier needs.
const buildingTierSchema = z.strictObject({
  needs: z.array(needSchema).optional(),
  // A townsperson who must have arrived first.
  needsJob: idSchema.optional(),
  // From this tier the building is run by this job and not the one that brought its plan.
  job: idSchema.optional(),
  perks: z.array(perkSchema),
});
export const buildingSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1),
  // The job whose townsperson brings this building's plan. Left out for a civic building.
  job: idSchema.optional(),
  // What raising it costs in gold. Later tiers cost what `town.tiers` says.
  price: z.number().int().min(0),
  // The tags it wants on its shelves. Its quality is how well its stock covers them.
  wants: z.array(z.string()).min(1),
  // A learned spell carrying one of these can be cast on it.
  enchantTags: z.array(z.string()),
  // Lowest first, one for each row of `town.tiers`.
  tiers: z.array(buildingTierSchema).min(1),
});
export type Building = z.infer<typeof buildingSchema>;

// What a player can spend a candle on in the evening: sitting with tonight's visitor, a meal at
// the Tavern, calling on a townsperson, lending a hand at a building, enchanting one, raising one
// a tier, and raising a new one.
export const EVENING_ACTIONS = ["visitor", "meal", "call", "hand", "enchant", "upgrade", "build"] as const;
export type EveningAction = (typeof EVENING_ACTIONS)[number];

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
  // The level a player must reach to learn, and so to cast, a spell of each tier. A tier past
  // the end of the list takes the last level in it.
  spellLevelByTier: z.array(z.number().int().min(1)).min(1),
  // Gold for a first discovery made by combining, by the entry's tier.
  discoveryGoldByTier: z.array(z.number().int().min(0)).min(1),
  shop: z.strictObject({
    basePrice: z.number().int().min(0),
    pricePerDepth: z.number().int().min(0),
    // "Missing steps" are the combos the player still has not made on the way to the item.
    pricePerMissingStep: z.number().int().min(0),
    spellMarkup: z.number().min(1),
    neverSells: z.array(idSchema),
  }),
  events: z.strictObject({
    // How big an event is. `gold` is what a Generous or Sharp response moves; `scale` multiplies rep and fondness.
    stakes: z.record(stakesSchema, z.strictObject({ gold: z.number().int().min(0), scale: z.number().min(0) })),
    // What each response type does. `gold` is a multiple of the stakes' gold.
    effects: z.record(responseTypeSchema, z.strictObject({ gold: z.number(), rep: z.number().int(), fondness: z.number().int() })),
    // Lowest first. A band applies from its `from` value upward.
    repBands: z
      .array(z.strictObject({ name: z.string(), from: z.number().int(), shopPrice: z.number(), requestPay: z.number() }))
      .min(1),
    // How often a known person comes back, once the player has met enough people.
    repeatShare: z.number().min(0).max(1),
    repeatMinPeople: z.number().int().min(1),
    followUpChance: z.strictObject({ none: z.number(), possible: z.number(), likely: z.number() }),
    // The ways a player can answer when someone first arrives, before they have said what they want.
    openingTypes: z.array(responseTypeSchema).min(2),
    // What a person may leave the player with, if the player helped. Weights are relative.
    payoff: z.strictObject({
      weights: z.strictObject({ request: z.number().min(0), hint: z.number().min(0), gift: z.number().min(0), none: z.number().min(0) }),
      // A hint or a gift is never for something further away than this many combos.
      hintMaxMissingSteps: z.number().int().min(1),
      giftMaxMissingSteps: z.number().int().min(1),
      // Things nobody asks for, hints at, or hands over, because they make no sense as an object.
      never: z.array(idSchema),
    }),
    request: z.strictObject({
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
  // The day is a budget of the player's own actions. Nothing here is a timer.
  day: z.strictObject({
    // Notches from dawn to dusk. A new discovery made by combining moves the sun one notch.
    length: z.number().int().min(1),
    // The notch at which the order board opens. Before it is morning, from it afternoon.
    noon: z.number().int().min(0),
    // Notches that working the shift moves the sun.
    shiftNotches: z.number().int().min(0),
    // Evening actions, and how many there are when the player turns in early.
    candles: z.number().int().min(1),
    earlyCandles: z.number().int().min(0),
    // Discoveries past dusk, with no candle spent between them, before night falls by itself.
    nightAfter: z.number().int().min(1),
    // What each evening action costs in candles.
    costs: z.record(z.enum(EVENING_ACTIONS), z.number().int().min(0)),
    // One-night happenings: the first day one may appear, and the chance of one each day.
    tonight: z.strictObject({ fromDay: z.number().int().min(1), chance: z.number().min(0).max(1) }),
  }),
  town: z.strictObject({
    // What each plot along the street costs, the first one first. They are bought in order.
    plotPrices: z.array(z.number().int().min(0)).min(1),
    // How many plots a player of each level may own, level 1 first.
    deedsByLevel: z.array(z.number().int().min(0)).min(1),
    // One row per building tier, lowest first. `gold` is null where the building's own price
    // applies. `made` asks for that many different things the player made themselves, each at
    // that depth or deeper and each carrying one of the building's wants: null asks for none.
    tiers: z
      .array(
        z.strictObject({
          gold: z.number().int().min(0).nullable(),
          level: z.number().int().min(1),
          slots: z.number().int().min(0),
          takings: z.number().int().min(0),
          made: z.strictObject({ count: z.number().int().min(1), depth: z.number().int().min(1) }).nullable(),
        }),
      )
      .min(1),
  }),
  shifts: z.strictObject({
    // How many orders the board holds.
    board: z.number().int().min(1),
    // A shift's score is the share of the order's tags the chosen inputs cover, plus this when
    // the best input's tier meets the order's tier, plus the rank's bonus.
    tierBonus: z.number().min(0),
    // Lowest first. A quality applies from its `from` score upward. `gold` and `xp` multiply the pay.
    qualities: z
      .array(z.strictObject({ id: z.enum(QUALITIES), name: z.string().min(1), from: z.number(), gold: z.number().min(0), xp: z.number().min(0), rep: z.number().int() }))
      .length(QUALITIES.length),
    // The chance a result lands one step below or above what the score says. Never below the lowest.
    variance: z.strictObject({ down: z.number().min(0).max(1), up: z.number().min(0).max(1) }),
    // What a Good shift pays, by the order's tier.
    pay: z.strictObject({ goldByTier: z.array(z.number().int().min(0)).min(1), xpByTier: z.array(z.number().int().min(0)).min(1) }),
    // Lowest first. A rank is held from `shifts` completed in that job, and is never lost.
    // `score` is the build score it will also ask for once score exists: null means not asked.
    // `orderTags` is the most tags an order asks for at that rank.
    ranks: z
      .array(z.strictObject({ id: z.enum(RANKS), name: z.string().min(1), shifts: z.number().int().min(0), score: z.number().nullable(), bonus: z.number().min(0), orderTags: z.number().int().min(1) }))
      .length(RANKS.length),
  }),
  generation: z.strictObject({
    // How many times a call is tried again when its answer breaks a rule.
    maxAttempts: z.number().int().min(1),
    // How freely the description is written.
    temperature: z.number().min(0).max(2),
    // How a thing that is not from the storybook gets its name. "questions": the model answers
    // three plain questions about the pair, each with a reason, and the first usable answer is
    // taken. "word": the model is asked for the one word and nothing else.
    naming: z.enum(["questions", "word"]),
    // How freely the answers to the three questions are thought up.
    ideasTemperature: z.number().min(0).max(2),
    // Whether the model is always asked, in a separate call, to judge between the ideas. A small
    // model judges poorly at low effort, so this is off: the first usable idea is taken, and the
    // model is asked only when that idea is something another pair already makes.
    pick: z.boolean(),
    // How many example combinations, chosen to resemble the pair, are shown with it.
    examples: z.number().int().min(0),
    // The most storybook things put forward for one magical pair.
    storybookOffered: z.number().int().min(0),
    // The most tags a model-made thing may carry.
    maxTags: z.number().int().min(0).max(MAX_TAGS),
    // How long a description may run. A longer one is sent back to be rewritten.
    maxSentences: z.number().int().min(1),
    maxWords: z.number().int().min(1),
    // In the bake, how many pairs may make the same thing before that thing is passed over.
    bakeNameCap: z.number().int().min(1),
    // The share of ordinary pairs whose description gets one playful twist. Code picks which,
    // and a pair always gets the same treatment. The name and what the thing is stay literal.
    twistShare: z.number().min(0).max(1),
    // Combining with one of these may make a storybook thing (a golem, a ghost). Anything else
    // makes an ordinary real-world thing.
    wonderInputs: z.array(idSchema),
    // A magical pair that makes an everyday thing gives it a touch of magic. Whether that thing
    // then counts as magical itself. Off, the magic fades unless a magical ingredient is added again.
    charmedCarriesMagic: z.boolean(),
  }),
});
export type Balance = z.infer<typeof balanceSchema>;

// The day. A player crafts through the morning, may work a shift from noon, spends candles in the
// evening, and sees a ledger when night falls. The rules are in src/shared/day.ts.
export type DayRules = Balance["day"];
export const DAY_PHASES = ["morning", "afternoon", "evening"] as const;
export type DayPhase = (typeof DAY_PHASES)[number];
// Why night fell: the last candle was spent, the player went to bed, or they crafted on past dusk
// until the evening had gone.
export const NIGHT_REASONS = ["last-candle", "bed", "midnight-oil"] as const;
export type NightReason = (typeof NIGHT_REASONS)[number];

// A one-night happening, once it has been announced. `taken` is set when the player took part.
export type TonightView = { id: string; name: string; line: string; taken: boolean };

// What the night's ledger shows, in the order it shows it.
export type Ledger = {
  // The day that just ended, and why it did.
  day: number;
  fell: NightReason;
  takings: { plot: number; building: string; name: string; quality: QualityId; gold: number }[];
  // Null until there is a town to be cheerful.
  cheer: { points: number; band: string } | null;
  // Anything a perk grew or brought.
  brought: { kind: "gift" | "rumour"; line: string }[];
  // A one-night happening the player did not take part in, in a line.
  missed: string | null;
  // The player gained a level today, and with it a deed.
  deed: boolean;
  // Plain remarks: how the night fell, and what the morning brings.
  lines: string[];
};

// Where the player is in their day, for the page.
export type DayView = {
  number: number;
  sun: number;
  length: number;
  noon: number;
  phase: DayPhase;
  // Evening actions left, and how many this evening has in all. Only spendable in the evening.
  candles: number;
  candlesMax: number;
  // Discoveries still to make before night falls by itself. Null outside the evening.
  nightIn: number | null;
  // The player may turn in early: it is past noon and not yet dusk. `turnInCandles` is how many
  // candles the evening would then have, so the page can say what turning in gives up.
  canTurnIn: boolean;
  turnInCandles: number;
  // What each evening action costs in candles.
  costs: Record<EveningAction, number>;
  // Today's shift has been worked.
  shiftDone: boolean;
  // Null until it is announced at noon, and on a day with no happening.
  tonight: TonightView | null;
  // Last night's ledger, so the page can show it again after a reload.
  lastLedger: Ledger | null;
};

// The plain lines the day is written in until the model writes them.
export const dayTextSchema = z.strictObject({
  dusk: z.array(z.string().min(1)).min(1),
  turnedIn: z.array(z.string().min(1)).min(1),
  night: z.record(z.enum(NIGHT_REASONS), z.array(z.string().min(1)).min(1)),
  morning: z.array(z.string().min(1)).min(1),
  shopRestocked: z.array(z.string().min(1)).min(1),
  newOrders: z.array(z.string().min(1)).min(1),
});
export type DayText = z.infer<typeof dayTextSchema>;

// The town, for the page.
export type TownRules = Balance["town"];

// One thing a building needs, in words, and whether the player has it. `progress` is only set
// for a need that counts something.
export type NeedView = { label: string; met: boolean; progress?: { have: number; need: number } };

// A building standing on a plot. `next` is what raising it a tier takes, or null at the top tier.
// Stock, quality above Meh, and enchantments arrive with slice 3 and slice 4.
export type BuildingView = {
  id: string;
  name: string;
  tier: number;
  quality: QualityId;
  // What it will pay tonight.
  takings: number;
  wants: string[];
  stock: { slot: number; entry: { id: string; name: string } | null }[];
  enchantment: { spell: { id: string; name: string }; daysLeft: number } | null;
  next: { gold: number; level: number; needs: NeedView[]; ready: boolean } | null;
};

export type TownView = {
  // Every plot along the street. `opensAt` is the level whose deeds reach that plot.
  plots: { index: number; owned: boolean; price: number; opensAt: number; building: BuildingView | null }[];
  // How many plots the player's level lets them own, and how many the highest level would.
  deeds: { have: number; max: number };
  // Null until Cheer is worked out, in slice 3.
  cheer: { points: number; band: string } | null;
  // `person` is the id of their row among the people the player knows.
  townsfolk: { person: number; job: string; name: string; housed: boolean; fondness: number; regular: boolean }[];
  // Buildings the player holds the plan for and has not raised. `ready` means the gold, the
  // level, and the needs are all there. It says nothing of the hour or the candles.
  plans: { building: string; name: string; price: number; candles: number; needs: NeedView[]; ready: boolean }[];
};

// The shift numbers the page needs to preview a result. Sent with the board.
export type ShiftRules = Balance["shifts"];

// One thing the player can put in a slot: a staple of the job (`own`), or something of theirs.
// A staple's id starts with "staple:", so it can never be mistaken for an entry.
export type ShiftOption = { id: string; name: string; tags: string[]; tier: number; own: boolean };

// An order on the board. `tags` is what it asks for and `tier` how demanding it is.
export type ShiftOrder = { id: number; text: string; tags: string[]; tier: number };

// A player's rank in one job, and how far the next one is. `next` is null at the top.
export type RankView = { id: RankId; name: string; shifts: number; next: { name: string; shifts: number } | null };

// Everything the page needs to show a shift. `job` is null until the player takes one up, and
// then the rest is empty. `ready` is true from noon until today's shift is worked.
export type ShiftBoard = {
  job: { id: string; name: string } | null;
  rank: RankView | null;
  ready: boolean;
  // The job's names for the three slots.
  slots: Record<ShiftSlot, string>;
  orders: ShiftOrder[];
  options: Record<ShiftSlot, ShiftOption[]>;
  rules: ShiftRules;
};

// How a shift went. `rankUp` is set when this shift earned a new rank.
export type ShiftResult = {
  order: ShiftOrder;
  quality: { id: QualityId; name: string };
  line: string;
  gold: number;
  xp: number;
  rep: number;
  rankUp: RankView | null;
};

// A storybook creature, object, or wonder a magical combination may produce.
// `from` is what it is made of: entry ids, or single words of an id. One of them must be in the
// pair, so a Treant is only ever on offer when a tree, a marsh, or the like is involved.
// `wokenBy` is the magic that makes it: the waking forces and foci. A Treant is a tree woken by
// Life. When the pair has both, the thing is a strong fit and is put first.
export const storybookItemSchema = z.strictObject({
  name: z.string().regex(/^[A-Z][A-Za-z'-]*( [A-Z][A-Za-z'-]*)?$/, "one or two capitalised words"),
  from: z.array(z.string().regex(/^[a-z]+$/, "single lowercase words")).min(1),
  wokenBy: z.array(idSchema),
});
export type StorybookItem = z.infer<typeof storybookItemSchema>;

// A combination known to be good, shown to the model when it resembles the pair in hand.
// "charmed" is an everyday thing that came out of a magical pair. (Storybook results are not
// here: the storybook list itself says what makes each of them.)
export const comboExampleSchema = z.strictObject({
  inputs: z.tuple([z.string().min(1), z.string().min(1)]),
  result: z.string().min(1),
  why: z.string().min(1),
  kind: z.enum(["ordinary", "charmed"]),
});
export type ComboExample = z.infer<typeof comboExampleSchema> & { authored?: boolean };

// The ways a baked result can be wrong, as a reviewer records them.
export const BAKE_FAILURES = ["attractor", "one-sided", "bad logic", "modern", "not a word", "name pun", "misread ingredient", "too abstract", "metaphorical", "wrong category"] as const;
export type BakeFailure = (typeof BAKE_FAILURES)[number];

// One pair the overnight bake has settled: what the two make, in the model's words, with the
// score it gave its own answer and why. A draft is not in the game. Set `status` to "ok" (or use
// `npm run bake -- approve`) and it becomes a fixed recipe at the next server start.
export const bakedComboSchema = z.strictObject({
  inputs: z.tuple([idSchema, idSchema]),
  name: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()).max(MAX_TAGS),
  // A storybook thing, so that what is made from it may be magical too.
  wonder: z.boolean(),
  // How much sense the model thought its answer made, from 1 to 5, and its reason. Null if it
  // could not be ranked.
  sense: z.number().int().min(1).max(5).nullable(),
  reason: z.string(),
  // draft: waiting for review. ok: in the game. rejected: wrong, to be baked again.
  // fix: the reviewer has given the right result, and its description is still to be written.
  // nothing: this pair makes nothing, and the game says so gently.
  status: z.enum(["draft", "ok", "rejected", "fix", "nothing"]),
  // What a reviewer said about a row that was not simply kept. Every rejection is a labelled
  // example for later, so the reason and the right answer are kept with it.
  failure: z.enum(BAKE_FAILURES).optional(),
  correction: z.string().min(1).optional(),
  notes: z.string().optional(),
});
export type BakedCombo = z.infer<typeof bakedComboSchema>;

// What the model is allowed to write for a new combo. Everything else is filled in by code.
export function comboDraftSchema(tags: Iterable<Tag>, maxTags = MAX_TAGS) {
  const allowed = [...tags].filter((tag) => tag.assignedBy === "model").map((tag) => tag.id);
  return z.strictObject({
    name: z.string().min(1).max(40),
    // Roomy on purpose. A tight limit cuts the model off mid-sentence.
    description: z.string().min(1).max(500),
    tags: z.array(z.enum(allowed as [string, ...string[]])).max(maxTags),
    // One word for what the vocabulary lacked. A hint for human review, never used as a tag.
    missingTag: z.string().max(20).nullable(),
  });
}
// `storybook` is set by code, never by the model: the result is a magical thing, so what is made
// from it may be magical too.
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
