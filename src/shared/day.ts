import type { DayPhase, DayRules, DayView, Ledger, NightReason, TonightView } from "./schema";

// The rules of the day, as plain functions of where the player is in it and the numbers under
// `day` in config/balance.json. Nothing here touches a saved game or a clock: only the player's
// own actions move the day. The server runs the day with these, and the page can read it with them.

// Everything that has to be remembered about a day in progress.
export type DayState = {
  // The day number, counting from 1.
  number: number;
  // Notches the sun has moved since dawn. It stops at the day's length, which is dusk.
  sun: number;
  // Today's shift has been worked.
  shiftDone: boolean;
  // The player turned in early, so this evening is a short one.
  early: boolean;
  // Candles spent this evening.
  spent: number;
  // The midnight oil: discoveries made since dusk with no candle spent between them.
  oil: number;
};

// Dawn on the first day. Every saved player starts here.
export function firstDay(): DayState {
  return { number: 1, sun: 0, shiftDone: false, early: false, spent: 0, oil: 0 };
}

// The things a player does that the day might care about. Only the first two move the sun.
export const DAY_ACTIONS = ["discovery", "shift", "repeat", "no-result", "purchase", "gift", "learn"] as const;
export type DayAction = (typeof DAY_ACTIONS)[number];

// How far an action moves the sun. A discovery is a new thing made by combining: a combine that
// answers with a first discovery. Something bought or given is not one.
export function notchesFor(action: DayAction, rules: DayRules): number {
  if (action === "discovery") return 1;
  if (action === "shift") return rules.shiftNotches;
  return 0;
}

// Morning until the sun reaches noon, afternoon until it reaches the day's length, then evening.
export function phaseFor(sun: number, rules: DayRules): DayPhase {
  if (sun >= rules.length) return "evening";
  return sun >= rules.noon ? "afternoon" : "morning";
}

export function isEvening(state: DayState, rules: DayRules): boolean {
  return phaseFor(state.sun, rules) === "evening";
}

// How many candles this evening has in all. `extra` is any a perk adds.
export function candlesMax(state: DayState, rules: DayRules, extra = 0): number {
  return (state.early ? rules.earlyCandles : rules.candles) + extra;
}

export function candlesLeft(state: DayState, rules: DayRules, extra = 0): number {
  return Math.max(0, candlesMax(state, rules, extra) - state.spent);
}

// One shift a day, open from noon until night, to a player who has taken up a job. A shift not
// worked is gone with the day.
export function shiftOpen(state: DayState, rules: DayRules, hasJob: boolean): boolean {
  return hasJob && state.sun >= rules.noon && !state.shiftDone;
}

// From noon the player may call it a day. From dusk that is going to bed instead.
export function canTurnIn(state: DayState, rules: DayRules): boolean {
  return phaseFor(state.sun, rules) === "afternoon";
}

// The day after an action. The sun never passes dusk. A discovery made after dusk burns the
// midnight oil, and the one that brings dusk on does not.
export function afterAction(state: DayState, action: DayAction, rules: DayRules): DayState {
  const wasEvening = isEvening(state, rules);
  return {
    ...state,
    sun: Math.min(rules.length, state.sun + notchesFor(action, rules)),
    shiftDone: state.shiftDone || action === "shift",
    oil: wasEvening && action === "discovery" ? state.oil + 1 : state.oil,
  };
}

// Why an evening action costing this many candles is refused, or null if it may go ahead.
export function refuseCandles(state: DayState, cost: number, rules: DayRules, extra = 0): "not-evening" | "no-candles" | null {
  if (!isEvening(state, rules)) return "not-evening";
  return cost > candlesLeft(state, rules, extra) ? "no-candles" : null;
}

// The day after an evening action. Spending a candle starts the midnight oil again.
export function spendCandles(state: DayState, cost: number): DayState {
  return { ...state, spent: state.spent + cost, oil: cost > 0 ? 0 : state.oil };
}

// Turning in early: the sun goes straight to dusk, and the evening is a short one.
export function turnIn(state: DayState, rules: DayRules): DayState {
  return { ...state, sun: rules.length, early: true, oil: 0 };
}

// Discoveries still to make before night falls by itself. Null outside the evening.
export function nightIn(state: DayState, rules: DayRules): number | null {
  return isEvening(state, rules) ? Math.max(0, rules.nightAfter - state.oil) : null;
}

// Whether night has fallen without the player choosing it, and why: the last candle is spent, or
// they have crafted on until the evening is gone. Going to bed is the third way, and is the
// player's own doing. Null while the day goes on.
export function nightFalls(state: DayState, rules: DayRules, extra = 0): Exclude<NightReason, "bed"> | null {
  if (!isEvening(state, rules)) return null;
  if (candlesLeft(state, rules, extra) === 0) return "last-candle";
  return state.oil >= rules.nightAfter ? "midnight-oil" : null;
}

// Dawn on the day after. Nothing is carried over: not an unworked shift, not an unspent candle.
export function nextDay(state: DayState): DayState {
  return { ...firstDay(), number: state.number + 1 };
}

// Whether a day carries a one-night happening. `roll` is a number from 0 up to, not including, 1.
// `shift` is what the player's standing adds to or takes from the chance. Never two days running.
export function tonightComes(day: number, hadOneYesterday: boolean, roll: number, rules: DayRules, shift = 0): boolean {
  return day >= rules.tonight.fromDay && !hadOneYesterday && roll < rules.tonight.chance + shift;
}

// A happening is kept from the player until noon, when it is announced.
export function tonightAnnounced(state: DayState, rules: DayRules): boolean {
  return state.sun >= rules.noon;
}

// The day as the page is shown it. `tonight` is today's happening if there is one, announced or not.
export function dayView(
  state: DayState,
  rules: DayRules,
  also: { extraCandles?: number; tonight?: TonightView | null; lastLedger?: Ledger | null } = {},
): DayView {
  const extra = also.extraCandles ?? 0;
  return {
    number: state.number,
    sun: state.sun,
    length: rules.length,
    noon: rules.noon,
    phase: phaseFor(state.sun, rules),
    candles: candlesLeft(state, rules, extra),
    candlesMax: candlesMax(state, rules, extra),
    nightIn: nightIn(state, rules),
    canTurnIn: canTurnIn(state, rules),
    turnInCandles: rules.earlyCandles + extra,
    costs: rules.costs,
    shiftDone: state.shiftDone,
    tonight: also.tonight && tonightAnnounced(state, rules) ? also.tonight : null,
    lastLedger: also.lastLedger ?? null,
  };
}
