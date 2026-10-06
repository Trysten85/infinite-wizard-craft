import type { Balance, GameEntry, Progress, Quest, Rewards } from "../shared/schema";
import { RuleError } from "./combiner";
import type { GameData } from "./gameData";
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

export function discoveryGold(entry: GameEntry, balance: Balance): number {
  const table = balance.discoveryGoldByTier;
  return table[Math.min(entry.tier, table.length - 1)]!;
}

export function learnCost(spell: GameEntry, balance: Balance): number {
  return (spell.tier + 1) * balance.learnCostPerTier;
}

// Gold, XP, level, quests, and learned spells for each player. All of it is worked out from what
// the player has discovered and from the gold ledger, so nothing here can drift out of step.
export function createProgress(deps: { data: GameData; store: Store; listDiscovered: (player: string) => GameEntry[] }) {
  const { data, store, listDiscovered } = deps;
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
  // by combining, and quests newly completed. Safe to call any number of times.
  function settle(player: string): Rewards {
    const rewards: Rewards = { gold: 0, quests: [] };
    const bought = new Set(store.getLedgerRefs(player, "shop"));
    for (const entry of listDiscovered(player)) {
      if (starting.has(entry.id) || bought.has(entry.id)) continue;
      const gold = discoveryGold(entry, data.balance);
      if (store.addLedger(player, gold, "discovery", entry.id)) rewards.gold += gold;
    }
    // A quest's gold can raise nothing that another quest checks, so one pass is enough.
    const state = measure(player);
    for (const quest of data.quests) {
      if (isDone(quest, state) && store.addLedger(player, quest.gold, "quest", quest.id)) {
        rewards.gold += quest.gold;
        rewards.quests.push({ id: quest.id, title: quest.title, gold: quest.gold });
      }
    }
    return rewards;
  }

  function getProgress(player: string): Progress {
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
    };
  }

  // Learning costs gold and needs a focus. Casting a learned spell still waits on the player's level.
  function learn(player: string, spellId: string): Rewards {
    const entries = listDiscovered(player);
    const spell = entries.find((entry) => entry.id === spellId && entry.kind === "spell");
    if (!spell) throw new RuleError("You can only learn a spell you have discovered.");
    if (!entries.some((entry) => entry.kind === "focus")) throw new RuleError("You need a focus to learn a spell.", "no-focus");
    if (store.getLearned(player).includes(spell.id)) throw new RuleError(`You already know ${spell.name}.`);
    settle(player);
    const cost = learnCost(spell, data.balance);
    const gold = store.getGold(player);
    if (cost > gold) throw new RuleError(`Learning ${spell.name} costs ${cost} gold. You have ${gold}.`, "not-enough-gold");
    store.addLedger(player, -cost, "learn", spell.id);
    store.addLearned(player, spell.id);
    return settle(player);
  }

  return { getProgress, settle, learn };
}
