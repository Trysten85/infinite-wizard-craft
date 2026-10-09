import type { Balance, GameEntry, PlayerProgress, Quest, RequestView, Rewards } from "../shared/schema";
import { RuleError } from "./combiner";
import { learnCostForTier, type GameData } from "./gameData";
import type { Store } from "./store";

export type ProgressService = ReturnType<typeof createProgress>;

// `into` is the XP earned inside the current level, and `span` is what that level takes in all.
export function levelFor(xp: number, balance: Balance): { level: number; into: number; span: number } {
  const { xpStep, cap } = balance.levels;
  let level = 1;
  let into = xp;
  while (level < cap && into >= level * xpStep) {
    into -= level * xpStep;
    level++;
  }
  return { level, into, span: level * xpStep };
}

// The band a player's standing falls in: the last one whose `from` they have reached.
export function repBandFor(rep: number, balance: Balance) {
  const bands = balance.events.repBands;
  return bands.findLast((band) => rep >= band.from) ?? bands[0]!;
}

// How many points the next event takes for this player. Well-liked players see events sooner.
export function eventThreshold(rep: number, balance: Balance): number {
  return Math.max(1, balance.events.every + repBandFor(rep, balance).eventEvery);
}

export function discoveryGold(entry: GameEntry, balance: Balance): number {
  const table = balance.discoveryGoldByTier;
  return table[Math.min(entry.tier, table.length - 1)]!;
}

// Gold, XP, level, quests, and learned spells for each player. All of it is worked out from what
// the player has discovered and from the gold ledger, so nothing here can drift out of step.
export function createProgress(deps: {
  data: GameData;
  store: Store;
  listDiscovered: (player: string) => GameEntry[];
  // When events are written whole before the player hears of them, one is "ready" only once it
  // is waiting. Otherwise it is ready as soon as it is due, and written when the page asks for it.
  eventsWrittenAhead?: boolean;
}) {
  const { data, store, listDiscovered, eventsWrittenAhead = false } = deps;
  const starting = new Set(data.balance.startingEntries);

  function measure(player: string) {
    const entries = listDiscovered(player);
    const xp = entries.reduce((total, entry) => total + (starting.has(entry.id) ? 0 : entry.xp), 0);
    return { entries, xp, ...levelFor(xp, data.balance), learned: store.getLearned(player) };
  }

  function isDone(quest: Quest, state: ReturnType<typeof measure>): boolean {
    const found = state.entries.filter((entry) => !starting.has(entry.id));
    const condition = quest.done;
    switch (condition.type) {
      case "discovered-any":
        return found.length > 0;
      case "has-kind":
        return found.some((entry) => entry.kind === condition.kind);
      case "has-entry":
        return found.some((entry) => entry.id === condition.entry);
      case "learned-count":
        return state.learned.length >= condition.count;
      case "level":
        return state.level >= condition.level;
      case "has-tag":
        return found.some((entry) => entry.tags.includes(condition.tag));
    }
  }

  // Pays out anything the player has earned and not yet been paid for: gold for discoveries made
  // by combining, quests newly completed, and requests newly filled. It also counts the points
  // those earn toward the next event. Safe to call any number of times.
  function settle(player: string): Rewards {
    const rewards: Rewards = { gold: 0, quests: [] };
    const { points } = data.balance.events;
    let earned = 0;
    const discovered = listDiscovered(player);
    // Things bought or given were not made by the player, so they pay no discovery gold or points.
    const bought = new Set([...store.getLedgerRefs(player, "shop"), ...store.getLedgerRefs(player, "gift")]);
    // What has been paid already is read once. Asking the ledger about each thing in turn is slow.
    const paid = new Set(store.getLedgerRefs(player, "discovery"));
    for (const entry of discovered) {
      if (starting.has(entry.id) || bought.has(entry.id) || paid.has(entry.id)) continue;
      const gold = discoveryGold(entry, data.balance);
      if (store.addLedger(player, gold, "discovery", entry.id)) {
        rewards.gold += gold;
        earned += points.discovery;
      }
    }
    // A quest's gold can raise nothing that another quest checks, so one pass is enough.
    const state = measure(player);
    const questsPaid = new Set(store.getLedgerRefs(player, "quest"));
    for (const quest of data.quests) {
      if (!questsPaid.has(quest.id) && isDone(quest, state) && store.addLedger(player, quest.gold, "quest", quest.id)) {
        rewards.gold += quest.gold;
        rewards.quests.push({ id: quest.id, title: quest.title, gold: quest.gold });
        earned += points.quest;
      }
    }
    // A request is filled the moment the player has the thing, however they came by it.
    const have = new Set(discovered.map((entry) => entry.id));
    const people = new Map(store.listPeople(player).map((person) => [person.id, person]));
    for (const request of store.listRequests(player)) {
      if (request.state !== "open" || !have.has(request.entryId)) continue;
      store.finishRequest(request.id);
      store.addLedger(player, request.gold, "request", String(request.id));
      store.changeStats(player, { rep: data.balance.events.request.rep });
      const person = people.get(request.personId);
      if (person) store.updatePerson(person.id, { fondness: person.fondness + data.balance.events.request.fondness });
      rewards.gold += request.gold;
      rewards.quests.push({ id: `request-${request.id}`, title: `A favor for ${person?.name ?? "a friend"}`, gold: request.gold });
      earned += points.quest;
    }
    const stats = store.getStats(player);
    const levelsGained = Math.max(0, state.level - stats.lastLevel);
    earned += levelsGained * points.level;
    if (earned > 0 || levelsGained > 0) store.changeStats(player, { eventPoints: earned, lastLevel: state.level });
    return rewards;
  }

  function listRequestViews(player: string): RequestView[] {
    const people = new Map(store.listPeople(player).map((person) => [person.id, person.name]));
    const views = store.listRequests(player).map((request) => ({
      id: request.id,
      from: people.get(request.personId) ?? "Someone",
      ask: request.ask,
      entry: { id: request.entryId, name: data.entries.get(request.entryId)?.name ?? request.entryId },
      gold: request.gold,
      state: request.state,
    }));
    return [...views.filter((view) => view.state === "open"), ...views.filter((view) => view.state === "done")];
  }

  function getProgress(player: string): PlayerProgress {
    settle(player);
    const state = measure(player);
    const done = new Set(store.getLedgerRefs(player, "quest"));
    let activeFound = false;
    const quests = data.quests.map((quest) => {
      const { id, title, detail, gold } = quest;
      if (done.has(id)) return { id, title, detail, gold, state: "done" as const };
      const questState = activeFound ? ("upcoming" as const) : ("active" as const);
      activeFound = true;
      return { id, title, detail, gold, state: questState };
    });
    return {
      xp: state.xp,
      level: state.level,
      levelInto: state.into,
      levelSpan: state.span,
      gold: store.getGold(player),
      learned: state.learned,
      quests,
      ...standing(player),
    };
  }

  function standing(player: string) {
    const stats = store.getStats(player);
    const waiting = store.listEvents(player).some((event) => event.state === "pending");
    const eventIn = waiting ? 0 : Math.max(0, eventThreshold(stats.rep, data.balance) - stats.eventPoints);
    return {
      rep: stats.rep,
      repBand: repBandFor(stats.rep, data.balance).name,
      requests: listRequestViews(player),
      hints: store.listHints(player).map((hint) => ({
        entry: { id: hint.entryId, name: data.entries.get(hint.entryId)?.name ?? hint.entryId },
        recipe: hint.recipe,
        from: hint.fromName,
      })),
      eventReady: eventsWrittenAhead ? waiting : eventIn === 0,
      eventIn,
    };
  }

  // Learning costs gold and needs a focus. Casting a learned spell still waits on the player's level.
  function learn(player: string, spellId: string): { spell: GameEntry; cost: number; rewards: Rewards } {
    const entries = listDiscovered(player);
    const spell = entries.find((entry) => entry.id === spellId && entry.kind === "spell");
    if (!spell) throw new RuleError("You can only learn a spell you have discovered.");
    if (!entries.some((entry) => entry.kind === "focus")) throw new RuleError("You need a focus to learn a spell.", "no-focus");
    if (store.getLearned(player).includes(spell.id)) throw new RuleError(`You already know ${spell.name}.`);
    settle(player);
    const cost = spell.learnCost ?? learnCostForTier(spell.tier, data.balance);
    const gold = store.getGold(player);
    if (cost > gold) throw new RuleError(`Learning ${spell.name} costs ${cost} gold. You have ${gold}.`, "not-enough-gold");
    store.addLedger(player, -cost, "learn", spell.id);
    store.addLearned(player, spell.id);
    store.changeStats(player, { eventPoints: data.balance.events.points.spell });
    return { spell, cost, rewards: settle(player) };
  }

  return { getProgress, settle, learn };
}
