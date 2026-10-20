import { QUALITIES, type Building, type GameEntry, type Need, type NeedView, type Perk, type QualityId, type ShiftRules, type TownRules } from "./schema";
import { qualityFor } from "./shifts";

// The rules of the town, as plain functions of what the player has and the numbers under `town`
// in config/balance.json. Nothing here touches a saved game. Tiers are counted from 1, and plots
// from 0.

// Something the player has discovered, and whether they made it themselves. A thing bought or
// given is held but not made.
export type Held = { entry: Pick<GameEntry, "id" | "kind" | "tags" | "depth">; made: boolean };

// What a need or a label is said in. The game data supplies these.
export type TownWords = { entryName: (id: string) => string; jobName: (id: string) => string; tagWords: (tag: string) => string };

// What a player brings to a building's door.
export type Builder = { held: Held[]; jobs: string[]; level: number; gold: number };

// What a plot costs, or null if the street has no such plot.
export function plotPrice(index: number, rules: TownRules): number | null {
  return rules.plotPrices[index] ?? null;
}

// How many plots a player of this level may own. A level past the table takes its last row.
export function deedsFor(level: number, rules: TownRules): number {
  const table = rules.deedsByLevel;
  const deeds = table[Math.min(Math.max(level, 1), table.length) - 1]!;
  return Math.min(deeds, rules.plotPrices.length);
}

// The level whose deeds first reach this plot, or null if no level's do.
export function levelForPlot(index: number, rules: TownRules): number | null {
  const at = rules.deedsByLevel.findIndex((deeds) => deeds > index);
  return at === -1 || index >= rules.plotPrices.length ? null : at + 1;
}

// Why the next plot along cannot be bought, or null if it can. Plots are bought in order, so the
// next one is the one numbered by how many the player owns. The first waits on a first job, so
// that a plot is the town's answer to someone with a trade: `jobs` is the trades that have
// arrived in town, and one of them is enough. A save that already owns a plot is never asked.
export function refusePlot(
  owned: number,
  player: Pick<Builder, "jobs" | "level" | "gold">,
  rules: TownRules,
): "no-job" | "no-deed" | "not-enough-gold" | null {
  if (owned === 0 && player.jobs.length === 0) return "no-job";
  if (owned >= deedsFor(player.level, rules)) return "no-deed";
  return plotPrice(owned, rules)! > player.gold ? "not-enough-gold" : null;
}

// What may sit on a building's shelves, and so what its made needs count: materials and spells.
export function isStockable(entry: Pick<GameEntry, "kind">): boolean {
  return entry.kind === "material" || entry.kind === "spell";
}

// Whether the player has what a need asks for.
export function needMet(need: Need, held: Held[]): boolean {
  if ("entry" in need) return held.some((thing) => thing.entry.id === need.entry);
  return held.some((thing) => thing.entry.tags.includes(need.tag) && thing.entry.depth >= (need.depth ?? 0) && (!need.made || thing.made));
}

// The different things a player made themselves that a building would want on its shelves, at
// this depth or deeper. A higher tier asks for some number of these.
export function wantedThings(building: Building, held: Held[], depth: number): Held[] {
  const seen = new Set<string>();
  return held.filter((thing) => {
    const counts = thing.made && isStockable(thing.entry) && thing.entry.depth >= depth && thing.entry.tags.some((tag) => building.wants.includes(tag));
    if (!counts || seen.has(thing.entry.id)) return false;
    seen.add(thing.entry.id);
    return true;
  });
}

// How many stock slots a building of this tier has.
export function slotsAt(tier: number, rules: TownRules): number {
  return rules.tiers[tier - 1]?.slots ?? 0;
}

export function topTier(building: Building, rules: TownRules): number {
  return Math.min(building.tiers.length, rules.tiers.length);
}

// The gold and the level that raising a building to this tier takes. The first tier costs the
// building's own price.
export function tierCost(building: Building, tier: number, rules: TownRules): { gold: number; level: number } {
  const row = rules.tiers[tier - 1]!;
  return { gold: row.gold ?? building.price, level: row.level };
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function article(name: string): string {
  return /^[aeiou]/i.test(name) ? "An" : "A";
}

// Everything raising a building to this tier needs, each said in words and marked met or not:
// its named things, any townsperson who must have arrived, and the things the player must have made.
export function checkNeeds(building: Building, tier: number, player: Pick<Builder, "held" | "jobs">, rules: TownRules, words: TownWords): NeedView[] {
  const own = building.tiers[tier - 1];
  const views: NeedView[] = (own?.needs ?? []).map((need) => {
    if ("entry" in need) return { label: words.entryName(need.entry), met: needMet(need, player.held) };
    const how = [need.made ? "made by you" : "", need.depth ? `${need.depth} or more steps deep` : ""].filter(Boolean);
    return { label: [capital(words.tagWords(need.tag)), ...how].join(", "), met: needMet(need, player.held) };
  });
  if (own?.needsJob) {
    const name = words.jobName(own.needsJob);
    views.push({ label: `${article(name)} ${name} in town`, met: player.jobs.includes(own.needsJob) });
  }
  const made = rules.tiers[tier - 1]?.made;
  if (made) {
    const have = Math.min(made.count, wantedThings(building, player.held, made.depth).length);
    views.push({
      label: `${made.count} things you made, ${made.depth} or more steps deep, that the ${building.name} wants`,
      met: have >= made.count,
      progress: { have, need: made.count },
    });
  }
  return views;
}

// Why a building cannot be raised to this tier, or null if it can: the level first, then the
// needs, then the gold. The plot, the hour, and the hourglasses are checked elsewhere.
export function refuseTier(building: Building, tier: number, player: Builder, rules: TownRules): "level-too-low" | "needs-missing" | "not-enough-gold" | null {
  const cost = tierCost(building, tier, rules);
  if (player.level < cost.level) return "level-too-low";
  const words: TownWords = { entryName: (id) => id, jobName: (id) => id, tagWords: (tag) => tag };
  if (checkNeeds(building, tier, player, rules, words).some((need) => !need.met)) return "needs-missing";
  return cost.gold > player.gold ? "not-enough-gold" : null;
}

// Everything a building gives at this tier.
export function perksAt(building: Building, tier: number): Perk[] {
  return building.tiers[tier - 1]?.perks ?? [];
}

// Whether meals are served here at this tier. Where a meal can be had, the evening's visitor sits
// and the page offers the meal, so all three ask this one question rather than name the Tavern.
export function servesMeals(building: Building, tier: number): boolean {
  return perksAt(building, tier).some((perk) => perk.type === "meals");
}

// Every perk of one type across the buildings standing, each with the building it comes from
// and, when the building carries one, the quality it has tonight.
export function perksOf<T extends Perk["type"]>(
  standing: { building: Building; tier: number; quality?: QualityId }[],
  type: T,
): { perk: Extract<Perk, { type: T }>; building: Building; tier: number; quality: QualityId }[] {
  return standing.flatMap(({ building, tier, quality = "meh" }) =>
    perksAt(building, tier)
      .filter((perk): perk is Extract<Perk, { type: T }> => perk.type === type)
      .map((perk) => ({ perk, building, tier, quality })),
  );
}

// The share a price is cut by, from every standing building's perk of this type, never more
// than all of it. The shop's discount and the learning discount are both read this way.
export function discountShare(
  standing: { building: Building; tier: number }[],
  type: "shop-discount" | "learn-discount",
): number {
  return Math.min(1, perksOf(standing, type).reduce((total, { perk }) => total + perk.share, 0));
}

// What a player pays to learn a spell: its base cost less the learning discount, rounded, and
// at least 1 gold unless the spell is free. The server charges exactly this and the page shows
// exactly this, so there is one number.
export function learnPrice(baseCost: number, share: number): number {
  return baseCost <= 0 ? 0 : Math.max(1, Math.round(baseCost * (1 - share)));
}

// What lifts a building's quality, each in steps: another building's `lifts` perk, a hand
// lent this evening, and a Great or Perfect shift at the player's own building.
export type Lifts = { perks: number; hand: number; shift: number };

// How many steps of lift the standing buildings give one building, by the `lifts` perks that
// name it. A building never lifts itself.
export function liftsFor(target: string, standing: { building: Building; tier: number }[]): number {
  return perksOf(standing, "lifts")
    .filter(({ perk, building }) => perk.building === target && building.id !== target)
    .reduce((total, { perk }) => total + perk.steps, 0);
}

// The shelves of a building: what is stocked on them, as the things that count toward quality.
export type Stocked = Pick<GameEntry, "tags" | "tier">;

// All a quality is read from: the tags a building wants on its shelves. It is this narrow so the
// page can ask with what the server sent it (a `BuildingView` carries the wants and no tiers)
// without pretending to hold a whole `Building`. Asking for more here means the page stops
// compiling, which is the warning we want.
export type Wanting = Pick<Building, "wants">;

// The score a building's stock earns, before any lift. It is the share of the building's wants
// covered by its stock between them, plus the shifts' tier bonus when the best stocked thing is
// at least the building's tier, plus a live enchantment's bonus, plus the owner's rank bonus
// (only at their own building). There is no luck in it. An empty building scores nothing.
export function buildingScore(
  building: Wanting,
  tier: number,
  stock: Stocked[],
  extra: { enchantBonus?: number; rankBonus?: number },
  shifts: ShiftRules,
): number {
  if (stock.length === 0) return 0;
  const carried = new Set(stock.flatMap((item) => item.tags));
  const share = building.wants.filter((want) => carried.has(want)).length / building.wants.length;
  const fine = Math.max(...stock.map((item) => item.tier)) >= tier ? shifts.tierBonus : 0;
  return share + fine + (extra.enchantBonus ?? 0) + (extra.rankBonus ?? 0);
}

// Moves a quality up by steps, never past the best. Nothing here ever lowers one.
export function liftQuality(quality: QualityId, steps: number): QualityId {
  const index = Math.min(QUALITIES.length - 1, QUALITIES.indexOf(quality) + Math.max(0, steps));
  return QUALITIES[index]!;
}

// A building's quality tonight: its stock's score on the shift's scale, then every lift, capped
// at Perfect. An empty building is Meh whatever lifts it, and still pays.
export function buildingQuality(
  building: Wanting,
  tier: number,
  stock: Stocked[],
  extra: { enchantBonus?: number; rankBonus?: number; lifts?: Partial<Lifts> },
  shifts: ShiftRules,
): QualityId {
  // Nothing on the shelves is nothing to lift: an empty building is Meh, and lifts wait for stock.
  if (stock.length === 0) return qualityFor(0, shifts);
  const base = qualityFor(buildingScore(building, tier, stock, extra, shifts), shifts);
  const lifts = extra.lifts ?? {};
  return liftQuality(base, (lifts.perks ?? 0) + (lifts.hand ?? 0) + (lifts.shift ?? 0));
}

// What the quality would be with one more thing on the shelf, or with one taken off it, so the
// page can show it before the player places or clears a discovery. `without` is an index.
export function previewQuality(
  building: Wanting,
  tier: number,
  stock: Stocked[],
  change: { add?: Stocked; without?: number },
  extra: Parameters<typeof buildingQuality>[3],
  shifts: ShiftRules,
): QualityId {
  const next = stock.filter((_, index) => index !== change.without);
  if (change.add) next.push(change.add);
  return buildingQuality(building, tier, next, extra, shifts);
}

// Cheer: one point per quality step of each building (Meh 0, Good 1, Great 2, Perfect 3), one
// per regular, one per live enchantment. Worked out each time and never stored.
export function cheerPoints(qualities: QualityId[], regulars: number, enchantments: number): number {
  return qualities.reduce((total, quality) => total + QUALITIES.indexOf(quality), 0) + regulars + enchantments;
}

// The band these points fall in: the last one whose `from` they have reached.
export function cheerBand(points: number, rules: TownRules) {
  return rules.cheer.findLast((band) => points >= band.from) ?? rules.cheer[0]!;
}

// What a building pays for the night: its tier's takings, scaled by its quality tonight, and
// raised by `share` (the town's Cheer, and anything else that lifts takings, added together).
export function takingsFor(tier: number, quality: QualityId, rules: TownRules, shifts: ShiftRules, share = 0): number {
  const base = rules.tiers[tier - 1]?.takings ?? 0;
  const scale = shifts.qualities.find((item) => item.id === quality)?.gold ?? 1;
  return Math.round(base * scale * (1 + share));
}

// The extra gold a discovery earns from buildings that pay for its kind. `base` is the gold the
// discovery pays without them. Each perk counts at the quality its building has tonight. The
// extra is rounded up, and is never less than 1 when a building pays at all: most early
// discoveries pay very little, and a perk the player cannot see paying is one they do not have.
export function extraDiscoveryGold(base: number, tags: string[], paying: { perk: Extract<Perk, { type: "discovery-gold" }>; quality: QualityId }[]): number {
  const share = paying.filter(({ perk }) => perk.tags.some((tag) => tags.includes(tag))).reduce((total, { perk, quality }) => total + perk.share[quality], 0);
  if (share <= 0) return 0;
  // The small amount taken off keeps a sum such as 10 x 1.1 from being rounded up past 11.
  return Math.max(1, Math.ceil(base * share - 1e-9));
}

// Enchantments. A learned spell can be cast on a building as an evening action.

// Whether a spell may be cast on a building: learned, within the player's level, carrying one of
// the building's enchant tags, and none of the blocked ones. `spell.learnLevel` is the level its
// tier takes. One enchantment stands on a building at a time, so a new one replaces the old.
export function enchantmentFits(spell: Pick<GameEntry, "id" | "kind" | "tags" | "learnLevel">, building: Building, learned: string[], level: number, rules: TownRules): boolean {
  if (spell.kind !== "spell" || !learned.includes(spell.id) || (spell.learnLevel ?? 1) > level) return false;
  if (spell.tags.some((tag) => rules.enchant.blockedTags.includes(tag))) return false;
  return spell.tags.some((tag) => building.enchantTags.includes(tag));
}

// How many days a spell of this tier lasts on a building: more with a perk's extra days, and
// twice as long on the night of the lantern festival.
export function enchantmentDays(tier: number, rules: TownRules, perkDays = 0, doubled = false): number {
  const days = rules.enchant.baseDays + rules.enchant.daysPerTier * tier + perkDays;
  return doubled ? days * 2 : days;
}

// What a live enchantment adds to the building's quality score.
export function enchantmentBonus(tier: number, rules: TownRules): number {
  return rules.enchant.bonus + rules.enchant.bonusPerTier * tier;
}

// A saved enchantment is a count of days left. Each night takes one; at one left the ledger says
// so, and it ends the night after. `daysLeft` is how many nights it still has, tonight included.
export function enchantmentLive(daysLeft: number): boolean {
  return daysLeft > 0;
}
export function enchantmentEnding(daysLeft: number): boolean {
  return daysLeft === 1;
}
export function enchantmentAfterNight(daysLeft: number): number {
  return Math.max(0, daysLeft - 1);
}

// Regulars. A person becomes one at the fondness the town sets, and stays one: the caller passes
// whether they already were.
export function isRegular(fondness: number, alreadyRegular: boolean, rules: TownRules): boolean {
  return alreadyRegular || fondness >= rules.regularAt;
}

// The share a building's takings are raised by for the regulars who work it.
export function regularTakingsShare(regulars: number, rules: TownRules): number {
  return regulars * rules.regularTakings;
}

// The Tavern's meal costs this much, and makes tomorrow's discoveries pay this much more. The
// lift is larger at a better Tavern (`perkLift`, as the perk gives it) and doubles at the supper.
export function mealCost(level: number, rules: TownRules): number {
  return rules.meal.goldPerLevel * level;
}
export function mealLift(rules: TownRules, perkLift?: number, doubled = false): number {
  const lift = perkLift ?? rules.meal.lift;
  return doubled ? lift * 2 : lift;
}

// What hiring a building's person costs at a tier. A tier past the table takes its last row.
export function hireCost(tier: number, rules: Pick<TownRules, "hireByTier">): number {
  const table = rules.hireByTier;
  return table[Math.min(Math.max(tier, 1), table.length) - 1]!;
}

// What raising a staffed building from one tier to the next adds to its hire: the difference,
// never less than nothing.
export function hireTopUp(from: number, to: number, rules: Pick<TownRules, "hireByTier">): number {
  return Math.max(0, hireCost(to, rules) - hireCost(from, rules));
}

// A building pays its takings only while someone is hired to run it. For now an unstaffed
// building earns nothing.
export function staffedTakings(takings: number, staffed: boolean): number {
  return staffed ? takings : 0;
}
