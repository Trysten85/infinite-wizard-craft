import { createCombiner } from "../src/server/combiner";
import { createEvents } from "../src/server/events/service";
import { createCannedEventWriter, type EventWriter } from "../src/server/events/writer";
import { loadGameData } from "../src/server/gameData";
import { createProgress } from "../src/server/progress";
import { createShifts } from "../src/server/shifts/service";
import { createShop } from "../src/server/shop";
import { openStore, type Store } from "../src/server/store";

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
  const combiner = createCombiner({ data, store, generate });
  const progress = createProgress({ data, store, listDiscovered: combiner.listDiscovered, eventsWrittenAhead: writeAhead });
  const shop = createShop({ data, store, progress, listDiscovered: combiner.listDiscovered, random: seeded(seed) });
  const events = createEvents({ data, store, progress, listDiscovered: combiner.listDiscovered, writer, random: seeded(seed + 100), writeAhead });
  const shifts = createShifts({ data, store, progress, listDiscovered: combiner.listDiscovered, random: seeded(seed + 200) });
  // Plays the given combos in order for one player.
  async function play(player: string, steps: [string, string][]) {
    for (const [a, b] of steps) await combiner.combine(player, a, b);
  }
  return { store, combiner, progress, shop, events, shifts, play };
}

export const TO_FIRE_BOLT: [string, string][] = [
  ["fire", "air"],
  ["water", "earth"],
  ["mud", "light"],
  ["earth", "life"],
  ["tree", "light"],
  ["fire", "light"],
  ["evocation", "fire"],
];
