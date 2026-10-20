import type { Balance, GameEntry, PlayerProgress, Quest, QuestProgress, RequestView, Rewards } from "../shared/schema";
import { dayView, shiftOpen, visitorDue } from "../shared/day";
import { isTaught, lessonFor, openBeats } from "../shared/cast";
import { extraDiscoveryGold } from "../shared/town";
import { RuleError } from "./combiner";
import { learnCostForTier, levelForSpellTier, type GameData } from "./gameData";
import type { Store } from "./store";
import { extraTime, perksGiven, regularIds, standingBuildings, tonightView } from "./town";

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

// The total XP at which a player becomes this level.
export function xpToReach(level: number, balance: Balance): number {
  const reached = Math.min(level, balance.levels.cap);
  return (balance.levels.xpStep * (reached - 1) * reached) / 2;
}

// The band a player's standing falls in: the last one whose `from` they have reached.
export function repBandFor(rep: number, balance: Balance) {
  const bands = balance.events.repBands;
  return bands.findLast((band) => rep >= band.from) ?? bands[0]!;
}

export function discoveryGold(entry: GameEntry, balance: Balance): number {
  const table = balance.discoveryGoldByTier;
  return table[Math.min(entry.tier, table.length - 1)]!;
}

// Gold, XP, level, quests, and learned spells for each player. All of it is worked out from what
// the player has discovered and from the gold ledger, so nothing here can drift out of step.
// XP comes from discoveries and from quests. A level once reached is kept: if the game's numbers
// change under a player, the XP they are short of that level is made up, once.
export function createProgress(deps: {
  data: GameData;
  store: Store;
  listDiscovered: (player: string) => GameEntry[];
  // When events are written whole before the player hears of them, a visitor is "ready" only once
  // they are waiting. Otherwise today's visitor is ready once the day is under way, and written
  // when the page asks.
  eventsWrittenAhead?: boolean;
}) {
  const { data, store, listDiscovered, eventsWrittenAhead = false } = deps;
  const starting = new Set(data.balance.startingEntries);
  // Every trade's lesson, the cast person's own or the one code builds. Paid like quests, under
  // the same ledger reason, so a quest can wait on one.
  const lessons = [...data.jobs.values()].flatMap((job) => lessonFor(job, data.cast).map((quest) => ({ job: job.id, quest })));
  const beats = data.cast.people.flatMap((person) => person.beats);
  const beatXp = (id: string) => {
    const beat = beats.find((item) => item.id === id);
    return beat?.reward.kind === "gold" ? beat.reward.xp : 0;
  };
  const starters = new Set([...data.jobs.values()].filter((job) => job.starter).map((job) => job.id));

  function measure(player: string) {
    const entries = listDiscovered(player);
    const found = entries.filter((entry) => !starting.has(entry.id));
    const stats = store.getStats(player);
    const paid = new Set(store.getLedgerRefs(player, "quest"));
    const beatsDone = new Set(store.getLedgerRefs(player, "beat"));
    const fromQuests =
      data.quests.reduce((total, quest) => total + (paid.has(quest.id) ? quest.xp : 0), 0) +
      lessons.reduce((total, { quest }) => total + (paid.has(quest.id) ? quest.xp : 0), 0) +
      [...beatsDone].reduce((total, id) => total + beatXp(id), 0);
    const earned = found.reduce((total, entry) => total + entry.xp, 0) + fromQuests + store.getShiftXp(player) + stats.bonusXp;
    // What the player is short of the level they had already reached, if anything.
    const short = Math.max(0, xpToReach(stats.lastLevel, data.balance) - earned);
    const xp = earned + short;
    const learned = store.getLearned(player);
    const people = store.listPeople(player);
    // Things bought or given were not made by the player.
    const handed = new Set([...store.getLedgerRefs(player, "shop"), ...store.getLedgerRefs(player, "gift")]);
    return {
      found,
      made: found.filter((entry) => !handed.has(entry.id)),
      xp,
      short,
      ...levelFor(xp, data.balance),
      learned,
      learnedSpells: learned.map((id) => data.entries.get(id)).filter((entry) => entry !== undefined),
      paid,
      beatsDone,
      events: store.countResolvedEvents(player),
      bought: store.getLedgerRefs(player, "shop").length,
      // The town: people who have arrived, plots owned, what stands on them, evenings spent.
      // Regulars and enchantments are counted from the evening's actions once those exist.
      townsfolk: people.filter((person) => person.job !== null).length,
      // Townsfolk by job, for Fondness, and requests filled, for things made for someone.
      people: people.filter((person) => person.job !== null),
      requestsFilled: store.listRequests(player).filter((request) => request.state === "done"),
      plots: store.listPlots(player),
      evenings: store.countEvenings(player),
      regulars: regularIds(data, store, player).size,
      enchantments: store.countEnchantments(player),
    };
  }
  type Measured = ReturnType<typeof measure>;

  // How far along a quest's condition is. It is met when `have` reaches `need`.
  // The town quests' conditions. They are read through a plain shape so that they can be
  // answered before the quest schema names them, and the rest of the switch is unchanged.
  function measureTown(condition: { type: string; count?: number; tier?: number; building?: string }, state: Measured): { have: number; need: number } | null {
    const count = condition.count ?? 1;
    const standing = state.plots.filter((plot) => plot.building !== null);
    switch (condition.type) {
      case "townsfolk":
        return { have: state.townsfolk, need: count };
      case "plots":
        return { have: state.plots.length, need: count };
      case "buildings":
        return { have: standing.filter((plot) => plot.tier >= (condition.tier ?? 1)).length, need: count };
      case "built":
        return { have: standing.some((plot) => plot.building === condition.building && plot.tier >= (condition.tier ?? 1)) ? 1 : 0, need: 1 };
      case "evenings":
        return { have: state.evenings, need: count };
      case "regulars":
        return { have: state.regulars, need: count };
      case "enchantments":
        return { have: state.enchantments, need: count };
      default:
        return null;
    }
  }

  function measureCondition(condition: Quest["done"], state: Measured): { have: number; need: number } {
    const town = measureTown(condition, state);
    if (town) return town;
    const things = "made" in condition && condition.made ? state.made : state.found;
    const count = (matches: (entry: GameEntry) => boolean) => things.filter(matches).length;
    switch (condition.type) {
      case "discovered-any":
        return { have: state.found.length, need: 1 };
      case "discovered-count":
        return { have: state.found.length, need: condition.count };
      case "has-kind":
        return { have: count((entry) => entry.kind === condition.kind), need: 1 };
      case "kind-count":
        return { have: count((entry) => entry.kind === condition.kind && entry.tier >= (condition.tier ?? 0)), need: condition.count };
      case "has-entry":
        return { have: count((entry) => entry.id === condition.entry), need: 1 };
      case "has-tag":
        return { have: count((entry) => entry.tags.includes(condition.tag)), need: 1 };
      case "tag-count":
        return { have: count((entry) => entry.tags.includes(condition.tag)), need: condition.count };
      case "depth":
        return { have: Math.max(0, ...things.map((entry) => entry.depth)), need: condition.depth };
      case "learned-count":
        return { have: state.learned.length, need: condition.count };
      case "learned-tier":
        return { have: state.learnedSpells.filter((spell) => spell.tier === condition.tier).length, need: 1 };
      case "learned-schools":
        return { have: new Set(state.learnedSpells.map((spell) => spell.school)).size, need: condition.count };
      case "level":
        return { have: state.level, need: condition.level };
      case "events":
        return { have: state.events, need: condition.count };
      case "bought":
        return { have: state.bought, need: condition.count };
      case "quest-done":
        return { have: state.paid.has(condition.quest) ? 1 : 0, need: 1 };
      case "fondness": {
        // Met or not. Fondness can fall below zero, so it does not read as a count.
        const person = state.people.find((each) => each.job === condition.job);
        return { have: person && person.fondness >= condition.fondness ? 1 : 0, need: 1 };
      }
      case "requests": {
        const people = new Map(state.people.map((person) => [person.id, person]));
        const filled = state.requestsFilled.filter((request) => condition.job === undefined || people.get(request.personId)?.job === condition.job);
        return { have: filled.length, need: condition.count };
      }
    }
    // A condition type this does not know yet is never met, and never blocks anything.
    return { have: 0, need: 1 };
  }

  function isDone(quest: Quest, state: Measured): boolean {
    const { have, need } = measureCondition(quest.done, state);
    return have >= need;
  }

  // Pays out anything the player has earned and not yet been paid for: gold for discoveries made
  // by combining, quests newly completed, and requests newly filled. Safe to call any number of times.
  function settle(player: string): Rewards {
    return store.atomically(() => {
      const rewards: Rewards = { gold: 0, quests: [] };
      const discovered = listDiscovered(player);
      // Things bought or given were not made by the player, so they pay no discovery gold.
      const bought = new Set([...store.getLedgerRefs(player, "shop"), ...store.getLedgerRefs(player, "gift")]);
      // What has been paid already is read once. Asking the ledger about each thing in turn is slow.
      const paid = new Set(store.getLedgerRefs(player, "discovery"));
      // Buildings that pay extra for discoveries of their kind, as they stand at this moment.
      const paying = perksGiven(standingBuildings(data, store, player), "discovery-gold");
      const meal = store.getMeal(player, store.getDay(player).state.number - 1);
      for (const entry of discovered) {
        if (starting.has(entry.id) || bought.has(entry.id) || paid.has(entry.id)) continue;
        const gold = discoveryGold(entry, data.balance);
        if (!store.addLedger(player, gold, "discovery", entry.id)) continue;
        rewards.gold += gold;
        // A meal at the Tavern last night makes today's discoveries pay more, in gold and in XP.
        if (meal) {
          const more = Math.ceil(gold * meal.lift - 1e-9);
          if (more > 0 && store.addLedger(player, more, "meal", entry.id)) rewards.gold += more;
          const moreXp = Math.ceil(entry.xp * meal.lift - 1e-9);
          if (moreXp > 0) store.changeStats(player, { bonusXp: moreXp });
        }
        const extra = extraDiscoveryGold(gold, entry.tags, paying);
        if (extra > 0 && store.addLedger(player, extra, "perk", entry.id)) rewards.gold += extra;
      }
      // A request is filled the moment the player has the thing, however they came by it. This
      // comes before the quests, since a quest may count requests filled or the Fondness they bring.
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
        rewards.quests.push({ id: `request-${request.id}`, title: `A favor for ${person?.name ?? "a friend"}`, gold: request.gold, xp: 0 });
      }
      const lastLevel = store.getStats(player).lastLevel;
      // A quest pays once its condition is met and the player has reached its level. Its XP can
      // raise that level, which opens more quests, so this goes round until a pass pays nothing.
      let state = measure(player);
      for (let paidAny = true; paidAny; ) {
        paidAny = false;
        // A trade's lesson counts once the person who teaches it has arrived.
        const arrived = new Set(state.people.map((person) => person.job));
        const due = [...data.quests, ...lessons.filter(({ job }) => arrived.has(job)).map(({ quest }) => quest)];
        for (const quest of due) {
          if (state.paid.has(quest.id) || quest.level > state.level || !isDone(quest, state)) continue;
          if (!store.addLedger(player, quest.gold, "quest", quest.id)) continue;
          rewards.gold += quest.gold;
          rewards.quests.push({ id: quest.id, title: quest.title, gold: quest.gold, xp: quest.xp });
          paidAny = true;
        }
        // A story beat is played once it is open (its Fondness gate, and the beats it waits on),
        // the player has reached its level, and its condition, if it has one, is met. Code pays
        // it; the model only writes the words.
        for (const person of data.cast.people) {
          const here = state.people.find((each) => each.job === person.job);
          if (!here) continue;
          for (const id of openBeats(person, here.fondness, state.beatsDone)) {
            const beat = person.beats.find((item) => item.id === id)!;
            if (beat.level > state.level) continue;
            if (beat.done) {
              const { have, need } = measureCondition(beat.done, state);
              if (have < need) continue;
            }
            const gold = beat.reward.kind === "gold" ? beat.reward.gold : 0;
            if (!store.addLedger(player, gold, "beat", beat.id)) continue;
            rewards.gold += gold;
            rewards.quests.push({ id: beat.id, title: beat.title, gold, xp: beatXp(beat.id) });
            paidAny = true;
          }
        }
        if (paidAny) state = measure(player);
      }
      // A trade is taught once its person's lesson is done and their Fondness has reached
      // `town.teachAt`. Taught is for good: Fondness falling later does not take it back.
      const taught = new Set(store.listTaught(player));
      for (const person of state.people) {
        const job = person.job!;
        if (taught.has(job) || !data.jobs.has(job)) continue;
        const lessonDone = lessons.filter((lesson) => lesson.job === job).every(({ quest }) => state.paid.has(quest.id));
        if (isTaught({ starter: starters.has(job), held: false, lessonDone, fondness: person.fondness }, data.balance.town)) store.addTaught(player, job);
      }
      // Whatever the player is still short of their old level is made up for good, so that the
      // next XP they earn counts on top of it.
      if (state.short > 0) store.changeStats(player, { bonusXp: state.short });
      if (state.level > lastLevel) store.changeStats(player, { lastLevel: state.level });
      return rewards;
    });
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
    // The main quest to work on is the first one not yet done. Side quests are all open at once.
    let nextMainFound = false;
    const quests = data.quests.map((quest): QuestProgress => {
      const { id, title, detail, track, level, gold, xp } = quest;
      const view = { id, title, detail, track, level, gold, xp };
      if (state.paid.has(id)) return { ...view, state: "done" };
      const isNextMain = track === "main" && !nextMainFound;
      if (isNextMain) nextMainFound = true;
      const { have, need } = measureCondition(quest.done, state);
      // Only a quest that counts something shows how far along it is.
      const counted = need > 1 && quest.done.type !== "level" ? { progress: { have: Math.min(have, need), need } } : {};
      if (level > state.level) return { ...view, ...counted, state: "locked" };
      return { ...view, ...counted, state: isNextMain ? "active" : "upcoming" };
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

  // Whether a trade has been taught: the starter job always is, and so is one taught since (or
  // held by a saved game before trades were taught).
  function isJobTaught(player: string, job: string): boolean {
    return starters.has(job) || store.listTaught(player).includes(job);
  }

  // The job a player has taken up, as long as it is still one they have discovered.
  function jobOf(player: string, jobId: string | null): { id: string; name: string } | null {
    const job = jobId ? data.jobs.get(jobId) : undefined;
    return job && store.getDiscoveries(player).includes(job.id) ? { id: job.id, name: job.name } : null;
  }

  // Takes up a job the player has discovered. From then on it is the job events and the shop go
  // by, and it stays theirs until they take up a different one.
  function chooseJob(player: string, jobId: string): { job: { id: string; name: string }; rewards: Rewards } {
    return store.atomically(() => {
      const job = listDiscovered(player).find((entry) => entry.id === jobId && entry.kind === "job");
      if (!job) throw new RuleError("You can only take up a job you have discovered.");
      if (!isJobTaught(player, job.id)) {
        const person = store.listPeople(player).find((each) => each.job === job.id);
        throw new RuleError(
          person
            ? `${person.name} has not taught you the trade yet. Finish their lesson and get to know them a little better.`
            : `Nobody in town can teach you to be a ${job.name} yet.`,
          "not-taught",
        );
      }
      store.setJob(player, job.id);
      return { job: { id: job.id, name: job.name }, rewards: settle(player) };
    });
  }

  function standing(player: string) {
    const stats = store.getStats(player);
    const day = store.getDay(player);
    const events = store.listEvents(player);
    const waiting = events.some((event) => event.state === "pending");
    // There is one visitor a day, written from the day's start, and one who has not been seen
    // yet is still the one. The rule itself is `visitorDue`, which the events service asks too,
    // so the two can no longer drift apart.
    const due = visitorDue(day.state, day.visitorDay, events.map((event) => event.state));
    const job = jobOf(player, stats.job);
    return {
      job,
      // One shift a day, from noon until night, and only once a job is taken up.
      shiftReady: shiftOpen(day.state, data.balance.day, job !== null),
      day: dayView(day.state, data.balance.day, { lastLedger: day.lastLedger, tonight: tonightView(data, store, player), extraTime: extraTime(standingBuildings(data, store, player)) }),
      rep: stats.rep,
      repBand: repBandFor(stats.rep, data.balance).name,
      requests: listRequestViews(player),
      hints: store.listHints(player).map((hint) => ({
        entry: { id: hint.entryId, name: data.entries.get(hint.entryId)?.name ?? hint.entryId },
        recipe: hint.recipe,
        from: hint.fromName,
      })),
      // A visitor is waiting. They are only seen from dusk, which the day says.
      eventReady: waiting || (!eventsWrittenAhead && due),
      // Days until the next visitor may come: 0 while today's is on the way or waiting, and 1
      // once the player has sat with them.
      eventIn: day.visitorDay < day.state.number ? 0 : 1,
    };
  }

  // Learning costs gold, and needs a focus and the level the spell's tier asks for.
  function learn(player: string, spellId: string): { spell: GameEntry; cost: number; rewards: Rewards } {
    return store.atomically(() => {
      const entries = listDiscovered(player);
      const spell = entries.find((entry) => entry.id === spellId && entry.kind === "spell");
      if (!spell) throw new RuleError("You can only learn a spell you have discovered.");
      if (!entries.some((entry) => entry.kind === "focus")) throw new RuleError("You need a focus to learn a spell.", "no-focus");
      if (store.getLearned(player).includes(spell.id)) throw new RuleError(`You already know ${spell.name}.`);
      settle(player);
      const needed = levelForSpellTier(spell.tier, data.balance);
      const { level } = measure(player);
      if (level < needed) throw new RuleError(`${spell.name} takes level ${needed} to learn. You are level ${level}.`, "level-too-low");
      // The price the view showed: the combiner fills it for this player, from the town they have.
      const cost = spell.learnPrice ?? spell.learnCost ?? learnCostForTier(spell.tier, data.balance);
      const gold = store.getGold(player);
      if (cost > gold) throw new RuleError(`Learning ${spell.name} costs ${cost} gold. You have ${gold}.`, "not-enough-gold");
      store.addLedger(player, -cost, "learn", spell.id);
      store.addLearned(player, spell.id);
      return { spell, cost, rewards: settle(player) };
    });
  }

  // How far along each of these quests is, measured once for the lot (for lessons on the People tab).
  function measureQuests(player: string, quests: Quest[]): { have: number; need: number }[] {
    const state = measure(player);
    return quests.map((quest) => measureCondition(quest.done, state));
  }

  return { getProgress, settle, learn, chooseJob, isJobTaught, measureQuests };
}
