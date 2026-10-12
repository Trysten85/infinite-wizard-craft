import type { Building, BuildingView, GameEntry, NeedView, Perk, QualityId, Rewards, TownView } from "../shared/schema";
import { checkNeeds, deedsFor, levelForPlot, perksAt, plotPrice, refusePlot, refuseTier, slotsAt, takingsFor, tierCost, topTier, type Builder } from "../shared/town";
import { RuleError } from "./combiner";
import type { DayService, DayTurn } from "./day";
import { townWords, type GameData } from "./gameData";
import type { ProgressService } from "./progress";
import type { Person, Store } from "./store";

export type TownService = ReturnType<typeof createTown>;

// A building standing on one of the player's plots. Every building is Meh until stock gives it
// a quality.
export type Standing = { plot: number; building: Building; tier: number; quality: QualityId };

// The buildings a player has standing, in order along the street. A building the game data no
// longer has is passed over. Everything that asks about the town asks here, so this is also
// where a saved game from before the town is brought into it: a player who has bought from the
// shop without owning a plot was using a shop that needed no stall, and is given the stall, on
// their first plot, at the tier that carries every shelf they had.
export function standingBuildings(data: GameData, store: Store, player: string): Standing[] {
  let plots = store.listPlots(player);
  if (plots.length === 0 && store.getLedgerRefs(player, "shop").length > 0) {
    const stall = [...data.buildings.values()].find((building) => perksAt(building, 1).some((perk) => perk.type === "opens-shop"));
    if (stall) {
      const allShelves = stall.tiers.findIndex((tier) => tier.perks.some((perk) => perk.type === "shop-shelves")) + 1;
      store.addPlot(player, 0);
      store.setBuilding(player, 0, stall.id, allShelves || stall.tiers.length);
      plots = store.listPlots(player);
    }
  }
  return plots.flatMap((plot) => {
    const building = plot.building ? data.buildings.get(plot.building) : undefined;
    return building ? [{ plot: plot.plot, building, tier: plot.tier, quality: "meh" as const }] : [];
  });
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
}) {
  const { data, store, progress, day, listDiscovered } = deps;
  const rules = data.balance.town;
  const costs = data.balance.day.costs;
  const words = townWords(data);
  const buildings = [...data.buildings.values()];

  const standing = (player: string) => standingBuildings(data, store, player);
  // The job that runs a building at this tier: the one that brought its plan, unless a later
  // tier hands it to another.
  const runBy = (building: Building, tier: number) => building.tiers[tier - 1]?.job ?? building.job;

  // The townsfolk a player has. A job the player has discovered brings its townsperson, whether
  // or not the player takes the job up: anyone not here yet arrives now. Until they are given
  // names of their own they go by their trade.
  function arrive(player: string): Person[] {
    const here = new Set(store.listPeople(player).map((person) => person.job));
    const today = day.today(player).number;
    for (const entry of listDiscovered(player)) {
      const job = entry.kind === "job" && !here.has(entry.id) ? data.jobs.get(entry.id) : undefined;
      if (job) store.addPerson(player, { name: `The ${job.name}`, role: job.name, traits: [], facts: [], job: job.id }, today);
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

  function buildingView(at: Standing, who: Builder): BuildingView {
    const { building, tier, quality } = at;
    const next = tier < topTier(building, rules) ? tier + 1 : null;
    return {
      id: building.id,
      name: building.name,
      tier,
      quality,
      takings: takingsFor(tier, quality, rules, data.balance.shifts),
      wants: building.wants,
      stock: Array.from({ length: slotsAt(tier, rules) }, (_, slot) => ({ slot, entry: null })),
      enchantment: null,
      next: next === null ? null : { ...tierCost(building, next, rules), needs: checkNeeds(building, next, who, rules, words), ready: refuseTier(building, next, who, rules) === null },
    };
  }

  function view(player: string): TownView {
    const who = builder(player);
    const built = standing(player);
    const owned = new Set(store.listPlots(player).map((plot) => plot.plot));
    const raised = new Set(built.map((at) => at.building.id));
    const housed = new Set(built.map((at) => runBy(at.building, at.tier)));
    return {
      plots: rules.plotPrices.map((price, index) => {
        const at = built.find((item) => item.plot === index);
        return { index, owned: owned.has(index), price, opensAt: levelForPlot(index, rules) ?? data.balance.levels.cap, building: at ? buildingView(at, who) : null };
      }),
      deeds: { have: deedsFor(who.level, rules), max: deedsFor(data.balance.levels.cap, rules) },
      cheer: null,
      townsfolk: store
        .listPeople(player)
        .filter((person) => person.job !== null)
        .map((person) => ({ person: person.id, job: person.job!, name: person.name, housed: housed.has(person.job!), fondness: person.fondness, regular: false })),
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
    const refusal = refusePlot(owned, level, gold, rules);
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

  return { view, arrive, buyPlot, build, upgrade, standing };
}
