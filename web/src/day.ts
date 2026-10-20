import type { DayView, Ledger, QualityId } from "../../src/shared/schema";

// The day, as the page words it. The shapes and the rules are the server's (src/shared/schema.ts
// and src/shared/day.ts). Everything here is worked out from what the server sends and nothing
// else: where the sun sits on the meter, and what the page says about orders, visitors and bed.

export type Day = DayView;

const count = (amount: number, one: string, many: string) => `${amount} ${amount === 1 ? one : many}`;
// The evening's time, as the player sees it: hourglasses, with no word for them.
const hourglasses = (amount: number) => `${amount} ⌛`;

// How far along the meter the sun and the noon mark sit, from 0 at dawn to 1 at dusk.
export function sunShare(day: Day): number {
  return Math.min(1, Math.max(0, day.sun / day.length));
}

export function noonShare(day: Day): number {
  return Math.min(1, Math.max(0, day.noon / day.length));
}

const PHASES = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" } as const;

export function phaseName(day: Day): string {
  return PHASES[day.phase];
}

// The meter in words, for a reader who can't see it.
export function sunText(day: Day): string {
  if (day.phase === "evening") return `Day ${day.number}, evening. The sun is down.`;
  return `Day ${day.number}, ${day.phase}. The sun is ${day.sun} of ${day.length} notches along, and noon is at ${day.noon}.`;
}

// The line under the job's name: whether its orders can be worked now, and if not, why not.
export function orderCue(day: Day, shiftReady: boolean): { text: string; ready: boolean } {
  if (shiftReady) return { text: "Orders are waiting", ready: true };
  if (day.shiftDone) return { text: "Today's shift is worked", ready: false };
  if (day.phase === "morning")
    return { text: `Orders at noon, ${count(day.noon - day.sun, "discovery", "discoveries")} off`, ready: false };
  if (day.phase === "evening") return { text: "The order board closed at dusk", ready: false };
  return { text: "No orders today", ready: false };
}

// Why the order board has nothing on it, for the board itself.
export function ordersClosedText(day: Day): string {
  if (day.shiftDone) return "Today's shift is worked. New orders come at noon tomorrow.";
  if (day.phase === "morning") return `The order board opens at noon, ${count(day.noon - day.sun, "discovery", "discoveries")} from now.`;
  if (day.phase === "evening") return "The order board closed at dusk. New orders come at noon tomorrow.";
  return "There are no orders today. New ones come at noon tomorrow.";
}

// How a waiting visitor is offered. They are only seen from dusk, and it takes time.
// One the player can't see tonight is still there tomorrow, so nothing here is a loss.
export function visitorCue(day: Day, place: "door" | "tavern"): { kind: "later" | "sit" | "spent"; text: string } {
  const cost = day.costs.visitor;
  const at = place === "tavern" ? "at the Tavern" : "at your door";
  if (day.phase !== "evening") return { kind: "later", text: `Someone will be ${at} this evening.` };
  if (day.time < cost)
    return { kind: "spent", text: `Someone is ${at}, but you have no ⌛ left tonight. They will be back tomorrow.` };
  return { kind: "sit", text: `Someone is ${at}. Sit with them (${hourglasses(cost)}).` };
}

// Tonight's happening, in a line, the first time it is seen on a day. `announced` is the day it
// was last told for. Null when there is none, the player has taken part, or it has been told.
export function tonightNews(day: Day, announced: number | null): string | null {
  if (!day.tonight || day.tonight.taken || announced === day.number) return null;
  return day.tonight.line;
}

// The way to end the day that is on offer now, with what it gives up, said before it happens.
// Before dusk the player can call it a day, which brings on a shorter evening. The order board
// closes at dusk, so a shift still waiting goes with it. From dusk they can go to bed, which
// gives up any time left. In the morning there is neither.
export function bedOffer(day: Day, ordersWaiting: boolean): { label: string; warning: string } | null {
  if (day.phase === "evening") {
    return {
      label: "Go to bed",
      warning: `Going to bed ends the day. You have ${hourglasses(day.time)} left, and it will be gone.`,
    };
  }
  if (!day.canTurnIn) return null;
  const orders = ordersWaiting ? " Today's orders have not been worked, and the order board closes at dusk." : "";
  return {
    label: "Call it a day",
    warning: `Calling it a day brings dusk on now, with an evening of ${hourglasses(day.turnInTime)} and not ${hourglasses(day.timeMax)}.${orders}`,
  };
}

// The count that runs down while the player crafts on past dusk without spending any time.
export function oilText(day: Day): string {
  if (day.nightIn === null) return "";
  return `Night falls after ${count(day.nightIn, "more discovery", "more discoveries")}`;
}

// The ledger names a quality by its id alone.
export function qualityName(quality: QualityId): string {
  return quality.charAt(0).toUpperCase() + quality.slice(1);
}

// Everything the night's takings came to.
export function takingsTotal(ledger: Ledger): number {
  return ledger.takings.reduce((total, row) => total + row.gold, 0);
}
