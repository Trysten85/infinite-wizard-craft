import { afterAction, canTurnIn, isEvening, nextDay, nightFalls, refuseAction, refuseTime, spendTime, turnIn, type DayAction, type DayState } from "../shared/day";
import type { CombineResult, DayRules, Ledger, NightReason } from "../shared/schema";
import { RuleError } from "./combiner";
import type { GameData } from "./gameData";
import type { ProgressService } from "./progress";
import type { Store } from "./store";
import { agedEnchantments, extraTime, finishRaises, nightlyPerks, standingBuildings, takingsOf, tonightOf, townState } from "./town";

export type DayService = ReturnType<typeof createDay>;

// What an action did to the day. `dusk` is a line to say when the action brought the evening on,
// and `night` is the ledger when it ended the day. Both are null for most actions.
export type DayTurn = { night: Ledger | null; dusk: string | null };

// Saves each player's day and runs it. The rules are in src/shared/day.ts: this keeps where the
// player is, moves the sun when they make something or work a shift, spends their hourglasses, and
// when night falls writes the ledger and starts the morning.
export function createDay(deps: {
  data: GameData;
  store: Store;
  progress: ProgressService;
  // A number from 0 up to, not including, 1. Tests pass their own so the lines are repeatable.
  random?: () => number;
}) {
  const { data, store, progress, random = Math.random } = deps;
  const rules = data.balance.day;
  const text = data.dayText;
  const pick = (lines: string[]) => lines[Math.floor(random() * lines.length)]!;

  const today = (player: string): DayState => store.getDay(player).state;
  // The hourglasses the town adds to an evening, from the buildings standing now.
  const extra = (player: string) => extraTime(standingBuildings(data, store, player));

  // Night. The town pays its takings, the ledger is written and kept, and the player wakes at
  // dawn on the next day.
  function fall(player: string, state: DayState, fell: NightReason): Ledger {
    return store.atomically(() => {
      // Each building standing pays for the night, once, through the gold ledger, at the quality it
      // has tonight and raised by the town's Cheer. What the perks bring is added as well.
      const built = standingBuildings(data, store, player);
      const town = townState(data, store, player, built);
      const takings = takingsOf(data, built, town);
      for (const row of takings) if (row.gold > 0) store.addLedger(player, row.gold, "takings", `${state.number}:${row.plot}`);
      const cheer = town.cheer;
      const brought = nightlyPerks(data, store, player, built, state.number, random);
      // A one-night happening the player did not take part in is gone, and the ledger says so.
      const tonight = tonightOf(data, store, player, random);
      const missed = tonight.happening && !tonight.taken ? `${tonight.happening.name} came and went without you.` : null;
      // Each enchantment takes a night off, and the ledger says when one is nearly gone.
      const faded = agedEnchantments(store, player, built);
      // A building going up is finished once tonight's takings are counted.
      const raised = finishRaises(data, store, player);
      // Anything owed is paid as well, so that a level reached today is counted today.
      progress.settle(player);
      const level = store.getStats(player).lastLevel;
      const lines = [pick(text.night[fell]), ...faded, ...raised, pick(text.morning), pick(text.shopRestocked)];
      if (progress.getProgress(player).job) lines.push(pick(text.newOrders));
      const ledger: Ledger = {
        day: state.number,
        fell,
        takings,
        cheer: built.length === 0 ? null : { points: cheer.points, band: cheer.band },
        brought,
        missed,
        deed: level > store.getDay(player).dawnLevel,
        lines,
      };
      store.startDay(player, nextDay(state), level, ledger);
      return ledger;
    });
  }

  // Saves the day as it now stands, unless that is night, in which case the day ends.
  function settle(player: string, was: DayState, now: DayState, duskLines = text.dusk): DayTurn {
    const fell = nightFalls(now, rules, extra(player));
    if (fell) return { night: fall(player, now, fell), dusk: null };
    store.setDay(player, now);
    return { night: null, dusk: !isEvening(was, rules) && isEvening(now, rules) ? pick(duskLines) : null };
  }

  type Gated = keyof DayRules["access"];
  const costOf = (action: Gated | "evening") => (action === "evening" ? 0 : rules.costs[action]);

  // Notes something the player did. Only a new discovery and a shift move the sun, and only a
  // discovery made after dusk burns the midnight oil.
  function after(player: string, action: DayAction): DayTurn {
    return store.atomically(() => {
      const was = today(player);
      return settle(player, was, afterAction(was, action, rules));
    });
  }

  // A combination, however it came out. Making something again does nothing to the day.
  function combined(player: string, result: Pick<CombineResult, "firstDiscovery">): DayTurn {
    return after(player, result.firstDiscovery ? "discovery" : "repeat");
  }

  // Refuses an action the player cannot take now. An action in the access table goes by its row:
  // an "anytime" action is never refused here, and an "evening" one waits for dusk and needs the
  // hourglasses. "evening" alone is for what is only there at night and costs nothing, such as
  // tonight's happening.
  function check(player: string, action: Gated | "evening", cost = costOf(action)): void {
    const state = today(player);
    const refusal = action === "evening" ? refuseTime(state, cost, rules, extra(player)) : refuseAction(state, action, rules, extra(player), cost);
    if (refusal === "not-evening") throw new RuleError("That is for the evening. The street lights up at dusk.", refusal);
    if (refusal === "no-time") throw new RuleError(`That takes ${cost} ⌛, and you have fewer left tonight.`, refusal);
  }

  // Spends hourglasses on an evening action. The last one brings night. An "anytime" action takes
  // nothing from the evening and leaves the day as it is.
  function spend(player: string, action: Gated | "evening", cost = costOf(action)): DayTurn {
    if (action !== "evening" && rules.access[action] === "anytime") return { night: null, dusk: null };
    return store.atomically(() => {
      check(player, action, cost);
      const was = today(player);
      store.addEvening(player);
      return settle(player, was, spendTime(was, cost));
    });
  }

  // Ends the day as far as the player may: from dusk, by going to bed, which brings night. From
  // noon, by turning in early, which brings dusk on now with a shorter evening.
  function end(player: string): DayTurn {
    return store.atomically(() => {
      const was = today(player);
      if (isEvening(was, rules)) return { night: fall(player, was, "bed"), dusk: null };
      if (!canTurnIn(was, rules)) throw new RuleError("The day has hardly begun. You can call it a day from noon.");
      return settle(player, was, turnIn(was, rules), text.turnedIn);
    });
  }

  return { today, after, combined, check, spend, end };
}
