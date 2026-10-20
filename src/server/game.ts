import { discountShare } from "../shared/town";
import { createCombiner } from "./combiner";
import type { ComboGenerator } from "./comboGenerator";
import { createDay } from "./day";
import { createEvents } from "./events/service";
import { createCannedEventWriter, type EventWriter } from "./events/writer";
import type { GameData } from "./gameData";
import { ModelOff } from "./llm/generate";
import { createProgress } from "./progress";
import { createShifts } from "./shifts/service";
import { createShop } from "./shop";
import type { Store } from "./store";
import { createTown, standingBuildings } from "./town";

// The game's services wired together as the server wires them, with the model left out: the
// visitor comes from the canned writer and a new combination says the model is off. For tools
// that play the game into a save (`npm run saves`). `random` fixes every roll, so a save built
// twice comes out the same.
export function createOfflineGame(deps: { data: GameData; store: Store; random: () => number; writer?: EventWriter }) {
  const { data, store, random } = deps;
  const generate: ComboGenerator = async () => {
    throw new ModelOff("Hey, fix the model: test saves are built with the model off.");
  };
  const learnShare = (player: string) => discountShare(standingBuildings(data, store, player), "learn-discount");
  const combiner = createCombiner({ data, store, generate, learnShare });
  const progress = createProgress({ data, store, listDiscovered: combiner.listDiscovered, eventsWrittenAhead: false });
  const day = createDay({ data, store, progress, random });
  const town = createTown({ data, store, progress, day, listDiscovered: combiner.listDiscovered, random });
  const shop = createShop({ data, store, progress, listDiscovered: combiner.listDiscovered, random });
  const events = createEvents({ data, store, progress, day, listDiscovered: combiner.listDiscovered, writer: deps.writer ?? createCannedEventWriter(), random, writeAhead: false });
  const shifts = createShifts({ data, store, progress, day, listDiscovered: combiner.listDiscovered, random });
  return { data, store, combiner, progress, day, town, shop, events, shifts };
}
export type OfflineGame = ReturnType<typeof createOfflineGame>;

// A repeatable stand-in for Math.random.
export function seededRandom(seed = 1): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}
