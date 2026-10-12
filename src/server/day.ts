import { afterAction, canTurnIn, isEvening, nextDay, nightFalls, refuseCandles, spendCandles, turnIn, type DayAction, type DayState } from "../shared/day";
import type { CombineResult, Ledger, NightReason } from "../shared/schema";
import { takingsFor } from "../shared/town";
import { RuleError } from "./combiner";
import type { GameData } from "./gameData";
import type { ProgressService } from "./progress";
import type { Store } from "./store";
import { standingBuildings } from "./town";

export type DayService = ReturnType<typeof createDay>;

// What an action did to the day. `dusk` is a line to say when the action brought the evening on,
// and `night` is the ledger when it ended the day. Both are null for most actions.
export type DayTurn = { night: Ledger | null; dusk: string | null };

// Saves each player's day and runs it. The rules are in src/shared/day.ts: this keeps where the
// player is, moves the sun when they make something or work a shift, spends their candles, and
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

  // Night. The town pays its takings, the ledger is written and kept, and the player wakes at
  // dawn on the next day.
  function fall(player: string, state: DayState, fell: NightReason): Ledger {
    // Each building standing pays for the night, once, through the gold ledger.
    const takings = standingBuildings(data, store, player).map(({ plot, building, tier, quality }) => ({
      plot,
      building: building.id,
      name: building.name,
      quality,
      gold: takingsFor(tier, quality, data.balance.town, data.balance.shifts),
    }));
    for (const row of takings) if (row.gold > 0) store.addLedger(player, row.gold, "takings", `${state.number}:${row.plot}`);
    // Anything owed is paid as well, so that a level reached today is counted today.
    progress.settle(player);
    const level = store.getStats(player).lastLevel;
    const lines = [pick(text.night[fell]), pick(text.morning), pick(text.shopRestocked)];
    if (progress.getProgress(player).job) lines.push(pick(text.newOrders));
    const ledger: Ledger = {
      day: state.number,
      fell,
      takings,
      cheer: null,
      brought: [],
      missed: null,
      deed: level > store.getDay(player).dawnLevel,
      lines,
    };
    store.startDay(player, nextDay(state), level, ledger);
    return ledger;
  }

  // Saves the day as it now stands, unless that is night, in which case the day ends.
  function settle(player: string, was: DayState, now: DayState, duskLines = text.dusk): DayTurn {
    const fell = nightFalls(now, rules);
    if (fell) return { night: fall(player, now, fell), dusk: null };
    store.setDay(player, now);
    return { night: null, dusk: !isEvening(was, rules) && isEvening(now, rules) ? pick(duskLines) : null };
  }

  // Notes something the player did. Only a new discovery and a shift move the sun, and only a
  // discovery made after dusk burns the midnight oil.
  function after(player: string, action: DayAction): DayTurn {
    const was = today(player);
    return settle(player, was, afterAction(was, action, rules));
  }

  // A combination, however it came out. Making something again does nothing to the day.
  function combined(player: string, result: Pick<CombineResult, "firstDiscovery">): DayTurn {
    return after(player, result.firstDiscovery ? "discovery" : "repeat");
  }

  // Refuses an evening action the player cannot take: it is not yet dusk, or the candles are short.
  function check(player: string, cost: number): void {
    const refusal = refuseCandles(today(player), cost, rules);
    if (refusal === "not-evening") throw new RuleError("That is for the evening. The street lights up at dusk.", refusal);
    if (refusal === "no-candles") throw new RuleError(`That takes ${cost} ${cost === 1 ? "candle" : "candles"}, and you have fewer left tonight.`, refusal);
  }

  // Spends candles on an evening action. The last one brings night.
  function spend(player: string, cost: number): DayTurn {
    check(player, cost);
    const was = today(player);
    return settle(player, was, spendCandles(was, cost));
  }

  // Ends the day as far as the player may: from dusk, by going to bed, which brings night. From
  // noon, by turning in early, which brings dusk on now with a shorter evening.
  function end(player: string): DayTurn {
    const was = today(player);
    if (isEvening(was, rules)) return { night: fall(player, was, "bed"), dusk: null };
    if (!canTurnIn(was, rules)) throw new RuleError("The day has hardly begun. You can call it a day from noon.");
    return settle(player, was, turnIn(was, rules), text.turnedIn);
  }

  return { today, after, combined, check, spend, end };
}
