import { createCombiner } from "../src/server/combiner";
import { createDay, type DayTurn } from "../src/server/day";
import { createEvents } from "../src/server/events/service";
import { createCannedEventWriter, type EventWriter } from "../src/server/events/writer";
import { loadGameData } from "../src/server/gameData";
import { createProgress } from "../src/server/progress";
import { createShifts } from "../src/server/shifts/service";
import { createShop } from "../src/server/shop";
import { openStore, type Store } from "../src/server/store";
import { discountShare } from "../src/shared/town";
import { createTown, standingBuildings } from "../src/server/town";
import { isEvening, type DayState } from "../src/shared/day";

export const data = loadGameData(process.cwd());

// A repeatable stand-in for Math.random, so shop stock is the same on every test run.
export function seeded(seed = 1): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

// A whole game on an empty in-memory database. The model is never called.
// `writeAhead` plays it the way the server does: events are written whole, out of sight.
export function newGame(seed = 1, writer: EventWriter = createCannedEventWriter(), options: { writeAhead?: boolean; store?: Store } = {}) {
  const { writeAhead = false } = options;
  const store = options.store ?? openStore(":memory:");
  const generate = async () => {
    throw new Error("the model must not be called");
  };
  // The town's learning discount is wired as the server wires it.
  const learnShare = (player: string) => discountShare(standingBuildings(data, store, player), "learn-discount");
  const combiner = createCombiner({ data, store, generate, learnShare });
  const progress = createProgress({ data, store, listDiscovered: combiner.listDiscovered, eventsWrittenAhead: writeAhead });
  const day = createDay({ data, store, progress, random: seeded(seed + 300) });
  const town = createTown({ data, store, progress, day, listDiscovered: combiner.listDiscovered });
  const shop = createShop({ data, store, progress, listDiscovered: combiner.listDiscovered, random: seeded(seed) });
  const events = createEvents({ data, store, progress, day, listDiscovered: combiner.listDiscovered, writer, random: seeded(seed + 100), writeAhead });
  const shifts = createShifts({ data, store, progress, day, listDiscovered: combiner.listDiscovered, random: seeded(seed + 200) });
  // Plays the given combos in order for one player. The day stands still: these are tests of
  // what the things made are worth, and `craft` is the one that lets the sun move.
  async function play(player: string, steps: [string, string][]) {
    for (const [a, b] of steps) await combiner.combine(player, a, b);
  }
  // Plays combos the way the page does, so each new thing made moves the sun. Returns what each
  // one did to the day.
  async function craft(player: string, steps: [string, string][]): Promise<DayTurn[]> {
    const turns: DayTurn[] = [];
    for (const [a, b] of steps) turns.push(day.combined(player, await combiner.combine(player, a, b)));
    return turns;
  }
  // Brings on the next dusk, as if the player had crafted up to it: tonight's if it is still
  // day, and tomorrow's if it is already evening, by going to bed first.
  function dusk(player: string) {
    if (isEvening(store.getDay(player).state, data.balance.day)) day.end(player);
    setDay(player, { sun: DUSK });
  }
  // Stands a Market Stall on the player's first plot, so that there is a shop. Tier 2 has every shelf.
  function stall(player: string, tier = 2) {
    store.addPlot(player, 0);
    store.setBuilding(player, 0, "market-stall", tier);
  }
  // Puts the player at a point in today, whatever they have done so far.
  function setDay(player: string, change: Partial<DayState>) {
    store.setDay(player, { ...store.getDay(player).state, ...change });
  }
  return { store, combiner, progress, day, town, shop, events, shifts, play, craft, setDay, dusk, stall };
}

// Where the sun stands at noon and at dusk, for putting a test player there.
export const NOON = data.balance.day.noon;
export const DUSK = data.balance.day.length;

export const TO_FIRE_BOLT: [string, string][] = [
  ["fire", "air"],
  ["water", "earth"],
  ["mud", "light"],
  ["earth", "life"],
  ["tree", "light"],
  ["fire", "light"],
  ["evocation", "fire"],
];
