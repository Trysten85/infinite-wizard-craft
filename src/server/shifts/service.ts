import { shiftOpen } from "../../shared/day";
import type { GameEntry, Rewards, ShiftBoard, ShiftOrder, ShiftResult } from "../../shared/schema";
import { payFor, rankFor, rankView, resolveQuality } from "../../shared/shifts";
import { RuleError } from "../combiner";
import type { DayService, DayTurn } from "../day";
import type { GameData } from "../gameData";
import type { ProgressService } from "../progress";
import type { Store, StoredShiftOrder } from "../store";
import { chosenFrom, optionsFor, resultLine, stockOrder } from "./orders";

export type ShiftService = ReturnType<typeof createShifts>;

// Saves work shifts and serves them. The rules live elsewhere: src/shared/shifts.ts judges a
// shift and works out its pay, orders.ts builds orders and options, and the day says when a
// shift is open: one a day, from noon until night. This keeps each player's board, pays out, and
// writes the log.
export function createShifts(deps: {
  data: GameData;
  store: Store;
  progress: ProgressService;
  day: DayService;
  listDiscovered: (player: string) => GameEntry[];
  // A number from 0 up to, not including, 1. Tests pass their own so shifts are repeatable.
  random?: () => number;
}) {
  const { data, store, progress, day, listDiscovered, random = Math.random } = deps;
  const rules = data.balance.shifts;

  const toOrder = (order: StoredShiftOrder): ShiftOrder => ({ id: order.id, text: order.text, tags: order.tags, tier: order.tier });

  // Everything about a player that a shift depends on, for the job they have taken up.
  function situation(player: string) {
    const standing = progress.getProgress(player);
    const skin = standing.job ? data.jobSkins.get(standing.job.id) : undefined;
    if (!standing.job || !skin) return null;
    const rank = rankFor(store.countShifts(player, standing.job.id), rules);
    const options = optionsFor(data, skin, { discovered: listDiscovered(player), learned: standing.learned, level: standing.level, rank: rank.id });
    return { job: standing.job, skin, level: standing.level, rank, options };
  }

  // The open orders for a job, topped up to a full board. An open order is never dropped.
  function ordersFor(player: string, at: NonNullable<ReturnType<typeof situation>>): StoredShiftOrder[] {
    for (let open = store.listOpenShiftOrders(player, at.job.id).length; open < rules.board; open++) {
      const draft = stockOrder(data, at.skin, at.level, at.rank.id, random);
      store.addShiftOrder(player, { job: at.job.id, ...draft });
    }
    return store.listOpenShiftOrders(player, at.job.id);
  }

  function board(player: string): ShiftBoard {
    const at = situation(player);
    if (!at) {
      // No job taken up: there is no board to show.
      return { job: null, rank: null, ready: false, slots: { base: "", method: "", touch: "" }, orders: [], options: { base: [], method: [], touch: [] }, rules };
    }
    return {
      job: at.job,
      rank: rankView(store.countShifts(player, at.job.id), rules),
      ready: shiftOpen(day.today(player), data.balance.day, true),
      slots: { base: at.skin.base.name, method: at.skin.method.name, touch: at.skin.touch.name },
      orders: ordersFor(player, at).map(toOrder),
      options: at.options,
      rules,
    };
  }

  // Works one order. The page says which order and what to fill it with, and nothing else:
  // the quality, the pay, and the line are all decided here.
  function work(player: string, choice: { order: number; base: string; method: string; touch?: string | null }): { result: ShiftResult; rewards: Rewards } & DayTurn {
    const at = situation(player);
    if (!at) throw new RuleError("Take up a job before you work a shift.", "no-job");
    const today = day.today(player);
    if (today.shiftDone) throw new RuleError("You have worked today's shift. New orders come at noon tomorrow.", "shift-not-ready");
    if (!shiftOpen(today, data.balance.day, true)) throw new RuleError("The order board opens at noon.", "shift-not-ready");
    const order = ordersFor(player, at).find((item) => item.id === choice.order);
    if (!order) throw new RuleError("That order is not on your board.");
    const chosen = chosenFrom(at.options, choice);
    if (!chosen) throw new RuleError("One of those is not on offer for this shift.");

    // Luck is rolled once, here, and nowhere else.
    const qualityId = resolveQuality(order, chosen, at.rank.id, random(), rules);
    const quality = rules.qualities.find((item) => item.id === qualityId)!;
    const pay = payFor(order, quality.id, rules);
    const line = resultLine(quality.id, data.shiftText, random);
    const inputs = [chosen.base.id, chosen.method.id, ...(chosen.touch ? [chosen.touch.id] : [])];
    const shiftId = store.addShift(player, { job: at.job.id, orderTags: order.tags, inputs, quality: quality.id, line, ...pay });
    if (pay.gold !== 0) store.addLedger(player, pay.gold, "shift", String(shiftId));
    if (pay.rep !== 0) store.changeStats(player, { rep: pay.rep });
    store.finishShiftOrder(order.id);

    const shiftsDone = store.countShifts(player, at.job.id);
    const rankUp = rankFor(shiftsDone, rules).id !== at.rank.id ? rankView(shiftsDone, rules) : null;
    // The shift's XP can finish a quest or raise a level, which settling pays out.
    const rewards = progress.settle(player);
    // A shift takes a piece of the day, and can bring dusk on.
    return { result: { order: toOrder(order), quality: { id: quality.id, name: quality.name }, line, ...pay, rankUp }, rewards, ...day.after(player, "shift") };
  }

  return { board, work };
}
