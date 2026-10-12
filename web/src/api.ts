import type {
  CombineResult,
  EventOutcome,
  EventView,
  GameEntry,
  Ledger,
  PlayerProgress,
  ResponseType,
  Rewards,
  RuleCode,
  ShiftBoard,
  ShiftResult,
  ShopView,
  TownView,
} from "../../src/shared/schema";

// What comes back from anything that can change the player's standing: what that action earned,
// and where the player stands now. `night` is the ledger, when the action brought night on, and
// `dusk` a line to say when it brought the evening on. A server from before the day sends neither.
export type Earned = { rewards: Rewards; progress: PlayerProgress; night?: Ledger | null; dusk?: string | null };

// A refusal from the server, with the HTTP status it came with, and the rule's code when a rule
// was the reason.
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: RuleCode,
  ) {
    super(message);
  }
}

const UNREACHABLE = "The game server isn't answering. Check that `npm run dev` is still running.";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init).catch(() => null);
  const body = await response?.json().catch(() => null);
  // The dev proxy answers 502 to 504 with no JSON body when the game server is down.
  const unreachable = !response || (!body && response.status >= 502 && response.status <= 504);
  if (unreachable) throw new Error(UNREACHABLE);
  if (!response.ok) throw new ApiError(body?.error ?? `Request failed (${response.status}).`, response.status, body?.code);
  return body as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export function fetchPlayer(player: string): Promise<{ entries: GameEntry[]; progress: PlayerProgress }> {
  return request(`/api/players/${player}`);
}

export function combine(player: string, a: string, b: string): Promise<CombineResult & Earned> {
  return post(`/api/players/${player}/combine`, { a, b });
}

// `cost` is the gold the spell took to learn.
export function learn(player: string, spell: string): Promise<Earned & { cost: number }> {
  return post(`/api/players/${player}/learn`, { spell });
}

export function fetchShop(player: string): Promise<ShopView> {
  return request(`/api/players/${player}/shop`);
}

export function buy(player: string, slot: number): Promise<Earned & { entry: GameEntry; shop: ShopView }> {
  return post(`/api/players/${player}/shop/buy`, { slot });
}

// The event waiting on the player, or null if none is due. Can take a while: if one is due and
// not yet written, the server writes it before answering.
export function fetchEvent(player: string): Promise<{ event: EventView | null }> {
  return request(`/api/players/${player}/event`);
}

// For testing: has the server write a fresh event now, whatever the player has earned.
export function testEvent(player: string): Promise<{ event: EventView }> {
  return post(`/api/players/${player}/event/test`, {});
}

// `beat` is the part of the conversation being answered. The server refuses an answer to a part
// that has already passed, so a double click can't answer the next one by accident. An answer to
// the first part can take a while: the second may have to be written before the server replies.
export function respondToEvent(player: string, type: ResponseType, beat: number): Promise<EventOutcome & Earned> {
  return post(`/api/players/${player}/event/respond`, { type, beat });
}

// Takes up a job the player has discovered, so the server's prompts know what they work as.
export function chooseJob(player: string, job: string): Promise<Earned> {
  return post(`/api/players/${player}/job`, { job });
}

// Ends the day: going to bed from dusk, or calling it a day before then, which brings dusk on.
export function endDay(player: string): Promise<Earned> {
  return post(`/api/players/${player}/day/end`, {});
}

// The order board for the player's job: the orders waiting, and what could fill them.
export function fetchShift(player: string): Promise<ShiftBoard> {
  return request(`/api/players/${player}/shift`);
}

// Fills one order. `shift` is the board as it stands afterwards.
export function workShift(
  player: string,
  choice: { order: number; base: string; method: string; touch?: string },
): Promise<Earned & { result: ShiftResult; shift: ShiftBoard }> {
  return post(`/api/players/${player}/shift`, choice);
}

// The street: its plots, what stands on them, who has arrived, and the plans in hand.
export function fetchTown(player: string): Promise<TownView> {
  return request(`/api/players/${player}/town`);
}

// Buys the next plot along the street.
export function buyPlot(player: string): Promise<Earned> {
  return post(`/api/players/${player}/town/plots`, {});
}

// Raises a building the player holds the plan for, on an empty plot of theirs.
export function raiseBuilding(player: string, plot: number, building: string): Promise<Earned> {
  return post(`/api/players/${player}/town/build`, { plot, building });
}

// Raises the building on a plot by one tier.
export function upgradeBuilding(player: string, plot: number): Promise<Earned> {
  return post(`/api/players/${player}/town/upgrade`, { plot });
}
