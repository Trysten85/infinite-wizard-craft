import { tonightComes } from "../shared/day";
import type { Building, BuildingView, GameEntry, Happening, Ledger, NeedView, Perk, QualityId, Rewards, TonightView, TownView } from "../shared/schema";
import { rankFor } from "../shared/shifts";
import {
  buildingQuality,
  cheerBand,
  cheerPoints,
  checkNeeds,
  deedsFor,
  enchantmentAfterNight,
  enchantmentBonus,
  enchantmentDays,
  enchantmentEnding,
  enchantmentFits,
  enchantmentLive,
  isRegular,
  isStockable,
  levelForPlot,
  liftsFor,
  mealCost,
  mealLift,
  perksAt,
  plotPrice,
  refusePlot,
  refuseTier,
  regularTakingsShare,
  slotsAt,
  takingsFor,
  tierCost,
  topTier,
  type Builder,
} from "../shared/town";
import { RuleError } from "./combiner";
import type { DayService, DayTurn } from "./day";
import { townWords, type GameData } from "./gameData";
import { buildPath } from "./paths";
import type { ProgressService } from "./progress";
import type { Person, Store } from "./store";

export type TownService = ReturnType<typeof createTown>;

// A building standing on one of the player's plots, with the quality it has tonight and what is
// on its shelves.
export type Standing = {
  plot: number;
  building: Building;
  tier: number;
  quality: QualityId;
  stock: { slot: number; entry: GameEntry }[];
  // What went into the quality, so the page can preview a change with the same maths: the steps
  // already applied tonight, the owner's rank bonus here, and a live enchantment's bonus.
  lifts: number;
  rankBonus: number;
  enchantBonus: number;
  // The spell cast on it, while it lasts.
  enchant: { spell: { id: string; name: string }; daysLeft: number; tier: number } | null;
};

// The job that runs a building at this tier: the one that brought its plan, unless a later tier
// hands it to another.
export function runBy(building: Building, tier: number): string | undefined {
  return building.tiers[tier - 1]?.job ?? building.job;
}

// The buildings a player has standing, in order along the street. A building the game data no
// longer has is passed over. Everything that asks about the town asks here, so this is also
// where a saved game from before the town is brought into it: a player who has bought from the
// shop without owning a plot was using a shop that needed no stall, and so is any player saved
// before the town (`stallOwed`). They are given the stall, on their first plot, at the tier that
// carries every shelf, bought from it or not.
export function standingBuildings(data: GameData, store: Store, player: string): Standing[] {
  let plots = store.listPlots(player);
  if (plots.length === 0 && (store.stallOwed(player) || store.getLedgerRefs(player, "shop").length > 0)) {
    const stall = [...data.buildings.values()].find((building) => perksAt(building, 1).some((perk) => perk.type === "opens-shop"));
    if (stall) {
      const allShelves = stall.tiers.findIndex((tier) => tier.perks.some((perk) => perk.type === "shop-shelves")) + 1;
      store.addPlot(player, 0);
      store.setBuilding(player, 0, stall.id, allShelves || stall.tiers.length);
      plots = store.listPlots(player);
      store.clearStallOwed(player);
    }
  }
  const built = plots.flatMap((plot) => {
    const building = plot.building ? data.buildings.get(plot.building) : undefined;
    return building ? [{ plot: plot.plot, building, tier: plot.tier }] : [];
  });
  // Quality is worked out here, once, from what is on the shelves and what lifts it, so
  // everything that asks about the town gets the same answer.
  const saved = store.getDay(player);
  const today = saved.state.number;
  const job = store.getStats(player).job;
  const shelves = store.listStock(player);
  const enchants = store.listEnchantments(player);
  const shifts = data.balance.shifts;
  return built.map((at) => {
    const stock = shelves
      .filter((item) => item.plot === at.plot && item.slot < slotsAt(at.tier, data.balance.town))
      .flatMap((item) => {
        const entry = data.entries.get(item.entryId) ?? store.getEntry(item.entryId);
        return entry ? [{ slot: item.slot, entry }] : [];
      });
    // The owner's own building is the one their job runs. The rank counts there, and so does a
    // good shift worked today.
    const own = job !== null && runBy(at.building, at.tier) === job;
    const rank = own ? rankFor(store.countShifts(player, job), shifts) : null;
    const rankBonus = rank?.bonus ?? 0;
    const lifts = {
      perks: liftsFor(at.building.id, built),
      hand: store.hasHand(player, at.plot, today) ? 1 : 0,
      shift: own && saved.shiftLiftDay === today ? 1 : 0,
    };
    const cast = enchants.find((item) => item.plot === at.plot && enchantmentLive(item.daysLeft));
    const enchantBonus = cast ? enchantmentBonus(cast.tier, data.balance.town) : 0;
    const enchant = cast ? { spell: { id: cast.spellId, name: cast.spellName }, daysLeft: cast.daysLeft, tier: cast.tier } : null;
    const quality = buildingQuality(at.building, at.tier, stock.map((item) => item.entry), { rankBonus, enchantBonus, lifts }, shifts);
    return { ...at, quality, stock, lifts: lifts.perks + lifts.hand + lifts.shift, rankBonus, enchantBonus, enchant };
  });
}

// Everyone who has become a regular: the fondness the town sets, once reached, is kept even if
// fondness falls later. Anyone newly there is noted now.
export function regularIds(data: GameData, store: Store, player: string): Set<number> {
  const known = new Set(store.listRegulars(player));
  for (const person of store.listPeople(player)) {
    if (!known.has(person.id) && isRegular(person.fondness, false, data.balance.town)) {
      store.addRegular(player, person.id);
      known.add(person.id);
    }
  }
  return known;
}

// How the town stands tonight: who the regulars are, how many at each building (a townsperson
// at the building their job runs, a person met in an event at the Tavern), how many spells are
// cast, and the Cheer that all of it comes to.
export function townState(data: GameData, store: Store, player: string, built: Standing[]) {
  const regulars = regularIds(data, store, player);
  const people = store.listPeople(player).filter((person) => regulars.has(person.id));
  const atPlot = new Map<number, number>();
  for (const person of people) {
    const home = built.find((at) => (person.job === null ? at.building.id === "tavern" : runBy(at.building, at.tier) === person.job));
    if (home) atPlot.set(home.plot, (atPlot.get(home.plot) ?? 0) + 1);
  }
  const enchantments = built.filter((at) => at.enchant !== null).length;
  const points = cheerPoints(built.map((at) => at.quality), regulars.size, enchantments);
  const band = cheerBand(points, data.balance.town);
  return { regulars, atPlot, enchantments, cheer: { points, band: band.name, share: band.takings } };
}

// How good life in the town is tonight, and the share it raises takings by.
export function townCheer(data: GameData, built: Standing[], regulars = 0, enchantments = 0) {
  const points = cheerPoints(built.map((at) => at.quality), regulars, enchantments);
  const band = cheerBand(points, data.balance.town);
  return { points, band: band.name, share: band.takings };
}

// What one building pays for the night: its tier's takings at its quality, raised by the town's
// Cheer and by the regulars who work it.
export function takingFor(data: GameData, at: Standing, cheerShare: number, regularsHere: number): number {
  const rules = data.balance.town;
  return takingsFor(at.tier, at.quality, rules, data.balance.shifts, cheerShare + regularTakingsShare(regularsHere, rules));
}

// What each standing building pays for the night.
export function takingsOf(data: GameData, built: Standing[], state: ReturnType<typeof townState>) {
  return built.map((at) => ({
    plot: at.plot,
    building: at.building.id,
    name: at.building.name,
    quality: at.quality,
    gold: takingFor(data, at, state.cheer.share, state.atPlot.get(at.plot) ?? 0),
  }));
}

// What tonight carries, rolled the first time the day is looked at and kept after that. A
// happening comes with the chance the rules and the player's standing give, never two days
// running. Pass the random source so tests can fix it.
export function tonightOf(data: GameData, store: Store, player: string, random: () => number = Math.random): { happening: Happening | null; taken: boolean } {
  const number = store.getDay(player).state.number;
  let saved = store.getTonight(player, number);
  if (!saved) {
    const bands = data.balance.events.repBands;
    const rep = store.getStats(player).rep;
    const shift = (bands.findLast((band) => rep >= band.from) ?? bands[0]!).tonightChance;
    const yesterday = store.getTonight(player, number - 1)?.happening != null;
    const comes = data.happenings.length > 0 && tonightComes(number, yesterday, random(), data.balance.day, shift);
    const pick = comes ? data.happenings[Math.floor(random() * data.happenings.length)]! : null;
    store.setTonight(player, number, pick?.id ?? null);
    saved = store.getTonight(player, number)!;
  }
  const happening = saved.happening ? (data.happenings.find((item) => item.id === saved!.happening) ?? null) : null;
  return { happening, taken: saved.taken };
}

// Tonight's happening as the page is shown it. The day hides it until noon.
export function tonightView(data: GameData, store: Store, player: string): TonightView | null {
  const { happening, taken } = tonightOf(data, store, player);
  return happening ? { id: happening.id, name: happening.name, line: happening.line, taken } : null;
}

// What the nights do to enchantments: each takes a night off, one with a day left is said to be
// ending, and one with none is gone. Returns the remarks for the ledger.
export function agedEnchantments(store: Store, player: string, built: Standing[]): string[] {
  const lines: string[] = [];
  for (const at of built) {
    if (!at.enchant) continue;
    const left = enchantmentAfterNight(at.enchant.daysLeft);
    store.setEnchantmentDays(player, at.plot, left);
    if (!enchantmentLive(left)) lines.push(`The ${at.enchant.spell.name} on the ${at.building.name} has faded.`);
    else if (enchantmentEnding(left)) lines.push(`The ${at.enchant.spell.name} on the ${at.building.name} has one day left.`);
  }
  return lines;
}

// What the town brings when night falls, on the days its perks come round: a rumour is a hint,
// and a gift is a thing the player lacks and could reach. Anything given is kept as it is given.
export function nightlyPerks(data: GameData, store: Store, player: string, built: Standing[], day: number, random: () => number): Ledger["brought"] {
  const brought: Ledger["brought"] = [];
  const events = data.balance.events;
  const never = new Set([...data.balance.shop.neverSells, ...events.payoff.never]);
  const have = new Set(store.getDiscoveries(player));
  const reachable = (steps: number) =>
    [...data.entries.values()]
      .filter((entry) => entry.kind === "material" && !have.has(entry.id) && !never.has(entry.id))
      .filter((entry) => buildPath(data, entry.id, have).length <= steps);
  const pickOne = <T>(items: T[]): T | undefined => items[Math.floor(random() * items.length)];
  for (const at of built) {
    for (const perk of perksAt(at.building, at.tier)) {
      if (perk.type === "rumour" && day % perk.every === 0) {
        const hinted = new Set(store.listHints(player).map((hint) => hint.entryId));
        const entry = pickOne(reachable(events.payoff.hintMaxMissingSteps).filter((item) => !hinted.has(item.id)));
        const recipe = entry && [...data.combos.values()].filter((item) => item.result === entry.id).sort((a, b) => a.needs.length - b.needs.length)[0];
        if (entry && recipe) {
          const how = recipe.inputs.map((id) => data.entries.get(id)!.name).join(" and ");
          store.addHint(player, entry.id, how, at.building.name);
          brought.push({ kind: "rumour", line: `A rumour at the ${at.building.name}: ${entry.name} is made from ${how}.` });
        }
      }
      if (perk.type === "gift" && day % perk.every === 0) {
        const entry = pickOne(reachable(events.payoff.giftMaxMissingSteps).filter((item) => item.tags.some((tag) => perk.tags.includes(tag))));
        if (entry) {
          // A gift is the player's from now on, but it was not made, so it pays no discovery gold.
          store.addLedger(player, 0, "gift", entry.id);
          store.addDiscovery(player, entry.id);
          have.add(entry.id);
          brought.push({ kind: "gift", line: `The ${at.building.name} has grown you a gift: ${entry.name}.` });
        }
      }
    }
  }
  return brought;
}


// How many candles the standing buildings add to every evening.
export function extraCandles(standing: Standing[]): number {
  return perksGiven(standing, "candles").reduce((total, { perk }) => total + perk.count, 0);
}

// Every perk of one type that the standing buildings give, each with the quality of the
// building it comes from.
export function perksGiven<T extends Perk["type"]>(standing: Standing[], type: T): { perk: Extract<Perk, { type: T }>; quality: QualityId }[] {
  return standing.flatMap(({ building, tier, quality }) =>
    perksAt(building, tier)
      .filter((perk): perk is Extract<Perk, { type: T }> => perk.type === type)
      .map((perk) => ({ perk, quality })),
  );
}

// Saves each player's street and serves it. The rules are in src/shared/town.ts: what a plot
// costs, what a building needs, what it pays. This keeps who has arrived, which plots are owned
// and what stands on them, takes the gold and the candles, and says no in a sentence.
export function createTown(deps: {
  data: GameData;
  store: Store;
  progress: ProgressService;
  day: DayService;
  listDiscovered: (player: string) => GameEntry[];
  // A number from 0 up to, not including, 1. Tests pass their own so lines are repeatable.
  random?: () => number;
}) {
  const { data, store, progress, day, listDiscovered, random = Math.random } = deps;
  const rules = data.balance.town;
  const costs = data.balance.day.costs;
  const words = townWords(data);
  const buildings = [...data.buildings.values()];

  const standing = (player: string) => standingBuildings(data, store, player);

  // The townsfolk a player has. A job the player has discovered brings its townsperson, whether
  // or not the player takes the job up: anyone not here yet arrives now, with the next name on
  // the list that nobody the player knows has. One who came before names existed, and goes by
  // their trade, is given one.
  function arrive(player: string): Person[] {
    const taken = new Set(store.listPeople(player).map((person) => person.name));
    const nextName = (): { name: string; pronoun: Person["pronoun"] } | undefined => {
      const found = data.townsfolk.people.find((person) => !taken.has(person.name));
      if (found) taken.add(found.name);
      return found;
    };
    for (const person of store.listPeople(player)) {
      const job = person.job ? data.jobs.get(person.job) : undefined;
      if (job && person.name === `The ${job.name}`) {
        const named = nextName();
        if (named) store.renamePerson(person.id, named.name, named.pronoun);
      }
    }
    const here = new Set(store.listPeople(player).map((person) => person.job));
    const today = day.today(player).number;
    for (const entry of listDiscovered(player)) {
      const job = entry.kind === "job" && !here.has(entry.id) ? data.jobs.get(entry.id) : undefined;
      if (!job) continue;
      const named = nextName();
      store.addPerson(player, { name: named?.name ?? `The ${job.name}`, pronoun: named?.pronoun ?? null, role: job.name, traits: [], facts: [], job: job.id }, today);
    }
    return store.listPeople(player).filter((person) => person.job !== null);
  }

  // What the player brings to a building's door: what they hold, who has arrived, their level
  // and their gold. A thing bought or given is held, and was not made.
  function builder(player: string): Builder {
    const { level, gold } = progress.getProgress(player);
    const handed = new Set([...store.getLedgerRefs(player, "shop"), ...store.getLedgerRefs(player, "gift")]);
    const held = listDiscovered(player).map((entry) => ({ entry, made: !handed.has(entry.id) }));
    return { held, jobs: arrive(player).map((person) => person.job!), level, gold };
  }

  function buildingView(at: Standing, who: Builder, state: ReturnType<typeof townState>): BuildingView {
    const { building, tier, quality } = at;
    const next = tier < topTier(building, rules) ? tier + 1 : null;
    return {
      id: building.id,
      name: building.name,
      tier,
      quality,
      takings: takingFor(data, at, state.cheer.share, state.atPlot.get(at.plot) ?? 0),
      lifts: at.lifts,
      rankBonus: at.rankBonus,
      enchantBonus: at.enchantBonus,
      wants: building.wants,
      stock: Array.from({ length: slotsAt(tier, rules) }, (_, slot) => {
        const held = at.stock.find((item) => item.slot === slot);
        return { slot, entry: held ? { id: held.entry.id, name: held.entry.name } : null };
      }),
      enchantment: at.enchant ? { spell: at.enchant.spell, daysLeft: at.enchant.daysLeft } : null,
      next: next === null ? null : { ...tierCost(building, next, rules), needs: checkNeeds(building, next, who, rules, words), ready: refuseTier(building, next, who, rules) === null },
    };
  }

  function view(player: string): TownView {
    const who = builder(player);
    const built = standing(player);
    const owned = new Set(store.listPlots(player).map((plot) => plot.plot));
    const raised = new Set(built.map((at) => at.building.id));
    const housed = new Set(built.map((at) => runBy(at.building, at.tier)));
    const state = townState(data, store, player, built);
    const cheer = state.cheer;
    return {
      plots: rules.plotPrices.map((price, index) => {
        const at = built.find((item) => item.plot === index);
        return { index, owned: owned.has(index), price, opensAt: levelForPlot(index, rules) ?? data.balance.levels.cap, building: at ? buildingView(at, who, state) : null };
      }),
      deeds: { have: deedsFor(who.level, rules), max: deedsFor(data.balance.levels.cap, rules) },
      cheer: { points: cheer.points, band: cheer.band },
      townsfolk: store
        .listPeople(player)
        .filter((person) => person.job !== null)
        .map((person) => ({ person: person.id, job: person.job!, name: person.name, housed: housed.has(person.job!), fondness: person.fondness, regular: state.regulars.has(person.id) })),
      // A plan is in the player's hands once its townsperson has arrived, until it is raised.
      plans: buildings
        .filter((building) => building.job !== undefined && who.jobs.includes(building.job) && !raised.has(building.id))
        .map((building) => ({
          building: building.id,
          name: building.name,
          price: tierCost(building, 1, rules).gold,
          candles: costs.build,
          needs: checkNeeds(building, 1, who, rules, words),
          ready: refuseTier(building, 1, who, rules) === null,
        })),
    };
  }

  // Buys the next plot along. This can be done at any time of day.
  function buyPlot(player: string): { plot: number; rewards: Rewards } {
    // Asked for first, so that an old save's stall is on its plot before the plots are counted.
    standing(player);
    const owned = store.listPlots(player).length;
    const price = plotPrice(owned, rules);
    if (price === null) throw new RuleError("You own every plot on the street.");
    const { level, gold } = progress.getProgress(player);
    const refusal = refusePlot(owned, level, gold, builder(player).jobs.length, rules);
    if (refusal === "no-job") throw new RuleError("A plot is for someone with a trade. Take up your first job, then come back.", refusal);
    if (refusal === "no-deed") {
      const opens = levelForPlot(owned, rules);
      throw new RuleError(`Your deeds cover ${deedsFor(level, rules)} ${deedsFor(level, rules) === 1 ? "plot" : "plots"}.${opens ? ` Level ${opens} brings the next.` : ""}`, refusal);
    }
    if (refusal === "not-enough-gold") throw new RuleError(`The next plot costs ${price} gold. You have ${gold}.`, refusal);
    if (price > 0) store.addLedger(player, -price, "plot", String(owned));
    store.addPlot(player, owned);
    return { plot: owned, rewards: progress.settle(player) };
  }

  // Says why a building cannot go up to a tier, in the order the player would rather hear it:
  // the longest wait first (the level, then what is needed, then the gold), and the hour last.
  function checkRaise(player: string, building: Building, tier: number, candles: number): number {
    const who = builder(player);
    const cost = tierCost(building, tier, rules);
    const refusal = refuseTier(building, tier, who, rules);
    const what = tier === 1 ? `A ${building.name}` : `Raising the ${building.name}`;
    if (refusal === "level-too-low") throw new RuleError(`${what} takes level ${cost.level}. You are level ${who.level}.`, refusal);
    if (refusal === "needs-missing") {
      const missing = checkNeeds(building, tier, who, rules, words).filter((need: NeedView) => !need.met).map((need) => need.label);
      throw new RuleError(`${what} still needs: ${missing.join("; ")}.`, refusal);
    }
    if (refusal === "not-enough-gold") throw new RuleError(`${what} costs ${cost.gold} gold. You have ${who.gold}.`, refusal);
    day.check(player, candles);
    return cost.gold;
  }

  // Raises a new building on an empty plot. An evening's work: it takes gold and candles.
  function build(player: string, plot: number, buildingId: string): { rewards: Rewards } & DayTurn {
    const building = data.buildings.get(buildingId);
    if (!building) throw new RuleError("There is no such building.");
    const built = standing(player);
    const at = store.listPlots(player).find((item) => item.plot === plot);
    if (!at) throw new RuleError("You do not own that plot.");
    if (at.building) throw new RuleError("Something already stands on that plot.");
    if (built.some((item) => item.building.id === building.id)) throw new RuleError(`The ${building.name} already stands.`);
    if (!building.job || !arrive(player).some((person) => person.job === building.job)) throw new RuleError(`Nobody in town knows how to run a ${building.name} yet.`);
    const gold = checkRaise(player, building, 1, costs.build);
    if (gold > 0) store.addLedger(player, -gold, "building", `${building.id}:1`);
    store.setBuilding(player, plot, building.id, 1);
    const rewards = progress.settle(player);
    return { rewards, ...day.spend(player, costs.build) };
  }

  // Raises the building on a plot by one tier. An evening's work too.
  function upgrade(player: string, plot: number): { rewards: Rewards } & DayTurn {
    const at = standing(player).find((item) => item.plot === plot);
    if (!at) throw new RuleError("Nothing stands on that plot.");
    const tier = at.tier + 1;
    if (tier > topTier(at.building, rules)) throw new RuleError(`The ${at.building.name} is as fine as it can be.`);
    const gold = checkRaise(player, at.building, tier, costs.upgrade);
    if (gold > 0) store.addLedger(player, -gold, "building", `${at.building.id}:${tier}`);
    store.setBuilding(player, plot, at.building.id, tier);
    const rewards = progress.settle(player);
    return { rewards, ...day.spend(player, costs.upgrade) };
  }

  // Puts a discovery on a shelf, or clears it with `entry: null`. Free, and at any hour. A thing
  // already on another shelf is moved.
  function stock(player: string, plot: number, slot: number, entryId: string | null): void {
    const at = standing(player).find((item) => item.plot === plot);
    if (!at) throw new RuleError("Nothing stands on that plot.");
    if (slot >= slotsAt(at.tier, rules)) throw new RuleError(`The ${at.building.name} has ${slotsAt(at.tier, rules)} shelves.`);
    if (entryId !== null) {
      const entry = listDiscovered(player).find((item) => item.id === entryId);
      if (!entry) throw new RuleError("You can only stock something you have discovered.");
      if (!isStockable(entry)) throw new RuleError(`${entry.name} is not a thing that can sit on a shelf.`);
    }
    store.setStock(player, plot, slot, entryId);
  }

  // Lends a hand at a building this evening: its quality is a step better tonight. One candle,
  // once a building an evening, and not worth a candle on bare shelves.
  function hand(player: string, plot: number): DayTurn {
    const at = standing(player).find((item) => item.plot === plot);
    if (!at) throw new RuleError("Nothing stands on that plot.");
    if (at.stock.length === 0) throw new RuleError(`The ${at.building.name} has nothing on its shelves to lend a hand with.`);
    const today = day.today(player).number;
    if (store.hasHand(player, plot, today)) throw new RuleError(`You have already lent a hand at the ${at.building.name} today.`);
    day.check(player, costs.hand);
    store.addHand(player, plot, today);
    return day.spend(player, costs.hand);
  }

  // Calls on someone: Fondness is up a little, and they say a line of their own. One candle, and
  // once a person an evening. The musician's night, the first call is free and counts twice.
  function call(player: string, personId: number): { line: string; fondness: number } & DayTurn {
    const person = store.listPeople(player).find((item) => item.id === personId);
    if (!person) throw new RuleError("You do not know anyone by that name.");
    const today = day.today(player).number;
    if (store.hasCall(player, person.id, today)) throw new RuleError(`You have already called on ${person.name} today.`);
    const tonight = tonightOf(data, store, player);
    const musician = tonight.happening?.effect === "free-call" && !tonight.taken && store.countCalls(player, today) === 0;
    const cost = musician ? 0 : costs.call;
    day.check(player, cost);
    const gain = musician ? 2 : 1;
    store.updatePerson(person.id, { fondness: person.fondness + gain });
    store.addCall(player, person.id, today);
    if (musician) store.takeTonight(player, today);
    const lines = (person.job !== null ? data.townsfolk.callingLines[person.job] : undefined) ?? data.townsfolk.callingLines.default!;
    const line = lines[Math.floor(random() * lines.length)]!.replaceAll("{name}", person.name);
    regularIds(data, store, player);
    return { line, fondness: person.fondness + gain, ...day.spend(player, cost) };
  }

  // A meal at the Tavern: gold and a candle, once an evening. Tomorrow's discoveries pay more.
  function meal(player: string): { lift: number; cost: number; rewards: Rewards } & DayTurn {
    const tavern = standing(player).find((at) => perksAt(at.building, at.tier).some((perk) => perk.type === "meals"));
    if (!tavern) throw new RuleError("There is no Tavern in town to eat at.");
    const today = day.today(player).number;
    if (store.getMeal(player, today)) throw new RuleError("You have already eaten at the Tavern tonight.");
    const perk = perksAt(tavern.building, tavern.tier).find((item) => item.type === "meals");
    const { level, gold } = progress.getProgress(player);
    const cost = mealCost(level, rules);
    if (cost > gold) throw new RuleError(`A meal at the Tavern costs ${cost} gold. You have ${gold}.`, "not-enough-gold");
    day.check(player, costs.meal);
    const tonight = tonightOf(data, store, player);
    const doubled = tonight.happening?.effect === "meal-doubled" && !tonight.taken;
    const lift = mealLift(rules, perk?.type === "meals" ? perk.lift : undefined, doubled);
    store.addLedger(player, -cost, "meal", `day-${today}`);
    store.addMeal(player, today, lift);
    if (doubled) store.takeTonight(player, today);
    const rewards = progress.settle(player);
    return { lift, cost, rewards, ...day.spend(player, costs.meal) };
  }

  // Casts a learned spell on a building: one candle. One enchantment a building, and a new one
  // replaces the old.
  function enchant(player: string, plot: number, spellId: string): { days: number; rewards: Rewards } & DayTurn {
    const at = standing(player).find((item) => item.plot === plot);
    if (!at) throw new RuleError("Nothing stands on that plot.");
    const spell = listDiscovered(player).find((item) => item.id === spellId && item.kind === "spell");
    if (!spell) throw new RuleError("You can only cast a spell you have discovered.");
    const { level } = progress.getProgress(player);
    if (!enchantmentFits(spell, at.building, store.getLearned(player), level, rules)) {
      throw new RuleError(`${spell.name} will not take on the ${at.building.name}. It must be a spell you have learned and can cast, of a kind the building takes.`);
    }
    day.check(player, costs.enchant);
    const tonight = tonightOf(data, store, player);
    const doubled = tonight.happening?.effect === "enchant-doubled" && !tonight.taken;
    const perkDays = perksGiven(standing(player), "enchant-days").reduce((total, { perk }) => total + perk.days, 0);
    const days = enchantmentDays(spell.tier, rules, perkDays, doubled);
    store.setEnchantment(player, { plot, spellId: spell.id, spellName: spell.name, tier: spell.tier, daysLeft: days });
    if (doubled) store.takeTonight(player, day.today(player).number);
    const rewards = progress.settle(player);
    return { days, rewards, ...day.spend(player, costs.enchant) };
  }

  // Takes part in tonight's happening, where taking part is something to do: the pedlar's pack,
  // or the stargazer's hint. Free of candles, and for the evening only. The other happenings
  // work through the actions they change.
  function tonight(player: string): { line: string; entry: { id: string; name: string } | null; price: number; rewards: Rewards } & DayTurn {
    const { happening, taken } = tonightOf(data, store, player);
    if (!happening) throw new RuleError("Nothing is happening in town tonight.");
    if (happening.effect !== "pedlar" && happening.effect !== "free-hint") throw new RuleError(`${happening.name} is there to be enjoyed. Do what you would, and it will find you.`);
    if (taken) throw new RuleError("You have already had your share of tonight.");
    day.check(player, 0);
    const have = new Set(store.getDiscoveries(player));
    const never = new Set([...data.balance.shop.neverSells, ...data.balance.events.payoff.never]);
    const today = day.today(player).number;
    let entry: GameEntry | undefined;
    let price = 0;
    if (happening.effect === "pedlar") {
      // Something the player lacks, two or more steps deeper than anything they have made.
      const deepest = Math.max(0, ...listDiscovered(player).filter((item) => item.kind === "material").map((item) => item.depth));
      const lacking = [...data.entries.values()].filter((item) => item.kind === "material" && !have.has(item.id) && !never.has(item.id));
      entry = lacking.filter((item) => item.depth >= deepest + 2).sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id))[0] ?? lacking.filter((item) => item.depth > deepest).sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id))[0];
      if (!entry) throw new RuleError("The pedlar has nothing you do not already have.");
      const shop = data.balance.shop;
      price = shop.basePrice + shop.pricePerDepth * entry.depth;
      const { gold } = progress.getProgress(player);
      if (price > gold) throw new RuleError(`The pedlar wants ${price} gold for the ${entry.name}. You have ${gold}.`, "not-enough-gold");
      store.addLedger(player, -price, "shop", entry.id);
      store.addDiscovery(player, entry.id);
    } else {
      // A hint toward something the player could nearly make: a spell if there is one.
      const options = [...data.entries.values()]
        .filter((item) => (item.kind === "spell" || item.kind === "material") && !have.has(item.id) && !never.has(item.id))
        .map((item) => ({ item, steps: buildPath(data, item.id, have).length }))
        .filter(({ steps }) => steps > 0 && steps <= data.balance.events.payoff.hintMaxMissingSteps);
      const hinted = new Set(store.listHints(player).map((hint) => hint.entryId));
      const best = options.filter(({ item }) => !hinted.has(item.id)).sort((a, b) => Number(b.item.kind === "spell") - Number(a.item.kind === "spell") || a.steps - b.steps || a.item.id.localeCompare(b.item.id))[0];
      if (!best) throw new RuleError("The stargazer has nothing to tell you that you do not already know.");
      entry = best.item;
      const recipe = [...data.combos.values()].filter((item) => item.result === entry!.id).sort((a, b) => a.needs.length - b.needs.length)[0];
      const how = recipe ? recipe.inputs.map((id) => data.entries.get(id)!.name).join(" and ") : "";
      store.addHint(player, entry.id, how, happening.name);
    }
    store.takeTonight(player, today);
    return { line: happening.taken, entry: { id: entry.id, name: entry.name }, price, rewards: progress.settle(player), night: null, dusk: null };
  }

  return { view, arrive, buyPlot, build, upgrade, stock, hand, call, meal, enchant, tonight, standing };
}
