import { shiftOpen } from "../../shared/day";
import type { GameEntry, Rewards, ShiftBoard, ShiftOrder, ShiftResult } from "../../shared/schema";
import { payFor, rankFor, rankView, resolveQuality } from "../../shared/shifts";
import { RuleError } from "../combiner";
import type { DayService, DayTurn } from "../day";
import type { GameData } from "../gameData";
import type { ProgressService } from "../progress";
import type { Store, StoredShiftOrder } from "../store";
import { chosenFrom, optionsFor, resultLine, stockOrder } from "./orders";
import type { OrderWriter } from "./writer";

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
  // Writes the words of an order. With none, orders read from the plain template. The board is
  // written ahead, out of sight, so a player never waits on the model.
  writer?: OrderWriter;
  // A number from 0 up to, not including, 1. Tests pass their own so shifts are repeatable.
  random?: () => number;
}) {
  const { data, store, progress, day, listDiscovered, writer, random = Math.random } = deps;
  // How many finished orders a new one is held against, so a board is not a repeat of last week's.
  const RECENT = 6;
  // Players whose board is being written out of sight.
  const filling = new Map<string, Promise<void>>();
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

  type Situation = NonNullable<ReturnType<typeof situation>>;

  // The orders a new one must not read like: the board as it stands, and the last few finished.
  const heldAgainst = (player: string, at: Situation, extra: string[] = []) => [
    ...store.listOpenShiftOrders(player, at.job.id).map((order) => order.text),
    ...extra,
    ...store.listDoneShiftTexts(player, at.job.id, RECENT),
  ];

  // A stock order whose subject is not one already in play, so a board never says the same thing
  // twice. When every subject is in play, any may be used.
  // The subjects in play are read from the orders themselves, not from their words: the model
  // rewrites an order in its own voice, so its text says nothing reliable about its subject.
  function draftOrder(player: string, at: Situation, alsoUsed: string[] = []) {
    const inPlay = new Set([...store.listOpenShiftOrders(player, at.job.id).map((order) => order.subject), ...alsoUsed]);
    const fresh = at.skin.subjects.filter((subject) => !inPlay.has(subject));
    const skin = fresh.length > 0 ? { ...at.skin, subjects: fresh } : at.skin;
    return stockOrder(data, skin, at.level, at.rank.id, random);
  }

  // The open orders for a job, topped up to a full board with plain-template orders. An open
  // order is never dropped. A board written ahead is already full, so this is the fallback.
  function ordersFor(player: string, at: Situation): StoredShiftOrder[] {
    for (let open = store.listOpenShiftOrders(player, at.job.id).length; open < rules.board; open++) {
      store.addShiftOrder(player, { job: at.job.id, ...draftOrder(player, at) });
    }
    return store.listOpenShiftOrders(player, at.job.id);
  }

  // Tops the board up with orders the model has put into words. An order the model cannot write
  // within the rules keeps the plain template, so the board is always filled.
  async function writeBoard(player: string): Promise<void> {
    for (;;) {
      const at = situation(player);
      if (!at || !writer || store.listOpenShiftOrders(player, at.job.id).length >= rules.board) return;
      const draft = draftOrder(player, at);
      let text = draft.text;
      try {
        text = await writer.write({
          job: at.job.name,
          flavor: at.skin.flavor,
          subject: draft.subject,
          tags: draft.tags.map((tag) => ({ tag, words: data.shiftText.tagWords[tag] ?? tag })),
          subjects: at.skin.subjects,
          others: heldAgainst(player, at),
        });
      } catch (err) {
        console.error(`Could not write an order for ${player}:`, err instanceof Error ? err.message : err);
      }
      // The board may have been filled while the model was working.
      const now = situation(player);
      if (!now || store.listOpenShiftOrders(player, now.job.id).length >= rules.board) return;
      store.addShiftOrder(player, { job: now.job.id, tags: draft.tags, tier: draft.tier, subject: draft.subject, text });
    }
  }

  // Starts writing the player's board in the background, if a job is taken up and it is short.
  // Call it after anything the player does.
  function prepare(player: string): void {
    if (!writer || filling.has(player)) return;
    const at = situation(player);
    if (!at || store.listOpenShiftOrders(player, at.job.id).length >= rules.board) return;
    const job = writeBoard(player)
      .catch((err) => console.error(`Could not write orders for ${player}:`, err instanceof Error ? err.message : err))
      .finally(() => filling.delete(player));
    filling.set(player, job);
  }

  // Resolves once nothing is being written out of sight for the player.
  async function idle(player: string): Promise<void> {
    while (filling.has(player)) await filling.get(player);
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
    // A Great or Perfect shift lifts the player's own building tonight, if they have one.
    if (quality.id === "great" || quality.id === "perfect") store.setShiftLiftDay(player, day.today(player).number);

    const shiftsDone = store.countShifts(player, at.job.id);
    const rankUp = rankFor(shiftsDone, rules).id !== at.rank.id ? rankView(shiftsDone, rules) : null;
    // The shift's XP can finish a quest or raise a level, which settling pays out.
    const rewards = progress.settle(player);
    // A shift takes a piece of the day, and can bring dusk on.
    return { result: { order: toOrder(order), quality: { id: quality.id, name: quality.name }, line, ...pay, rankUp }, rewards, ...day.after(player, "shift") };
  }

  return { board, work, prepare, idle };
}
