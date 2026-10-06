import { createCombiner } from "../src/server/combiner";
import { loadGameData } from "../src/server/gameData";
import { createProgress } from "../src/server/progress";
import { createShop } from "../src/server/shop";
import { openStore } from "../src/server/store";

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
export function newGame(seed = 1) {
  const store = openStore(":memory:");
  const generate = async () => {
    throw new Error("the model must not be called");
  };
  const combiner = createCombiner({ data, store, generate });
  const progress = createProgress({ data, store, listDiscovered: combiner.listDiscovered });
  const shop = createShop({ data, store, progress, listDiscovered: combiner.listDiscovered, random: seeded(seed) });
  // Plays the given combos in order for one player.
  async function play(player: string, steps: [string, string][]) {
    for (const [a, b] of steps) await combiner.combine(player, a, b);
  }
  return { store, combiner, progress, shop, play };
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
