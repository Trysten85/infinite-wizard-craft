import { serve } from "@hono/node-server";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createApp } from "./app";
import { loadBlocklist } from "./blocklist";
import { slugify } from "../shared/schema";
import { PLAYER_MARKER } from "./bakePace";
import { createCombiner } from "./combiner";
import { createMadeFrom } from "./comboContext";
import { createComboGenerator } from "./comboGenerator";
import { createDay } from "./day";
import { createEvents } from "./events/service";
import { createModelEventWriter } from "./events/writer";
import { loadGameData } from "./gameData";
import { createModelClient, readModelConfig } from "./llm/config";
import { createModelTurns } from "./llm/turns";
import { createProgress } from "./progress";
import { RECIPE_KEY_FILE, renderRecipeKey } from "./recipeKey";
import { createShifts } from "./shifts/service";
import { createModelOrderWriter } from "./shifts/writer";
import { createStory } from "./story/service";
import { createModelStoryWriter } from "./story/writer";
import { createShop } from "./shop";
import { openStore } from "./store";
import { discountShare } from "../shared/town";
import { createTown, grantOwedStalls, standingBuildings } from "./town";

const root = process.cwd();
const port = Number(process.env.PORT ?? 3001);
const model = readModelConfig(root);

const data = loadGameData(root);
// Keep the recipe key in step with whatever data the server is actually running.
const keyPath = join(root, RECIPE_KEY_FILE);
const key = renderRecipeKey(data);
if (!existsSync(keyPath) || readFileSync(keyPath, "utf8") !== key) writeFileSync(keyPath, key);
mkdirSync(join(root, "var"), { recursive: true });
const store = openStore(join(root, "var/game.db"));
const voice = readFileSync(join(root, "prompts/voice.md"), "utf8");
// One model, asked to think less for a combination the player is waiting on than for an event,
// which is written out of sight and gives way whenever a combination needs the model.
// A marker the overnight bake watches: while the game is using the model, the bake stands aside.
const playerMarker = join(root, PLAYER_MARKER);
mkdirSync(dirname(playerMarker), { recursive: true });
const turns = createModelTurns({ ...model.background, onPlayerCall: () => writeFileSync(playerMarker, new Date().toISOString()) });
const generate = createComboGenerator({
  client: turns.forPlayer(createModelClient(model, "combos")),
  namingClient: turns.forPlayer(createModelClient(model, "naming")),
  log: store.logModelCall,
  voice,
  tags: data.tags.values(),
  balance: data.balance,
  storybook: data.storybook,
  reservedIds: new Set(data.entries.keys()),
  examples: data.comboExamples,
  madeFrom: createMadeFrom(data, store),
  exists: (name) => store.getEntry(slugify(name)) !== undefined,
});
const blocklist = loadBlocklist(join(root, "Blocklist.md"));
if (blocklist.size === 0) console.warn("Blocklist.md not found or empty: generated names are not being checked against it.");
// Saves from before the town are given the stall they were using. Once, at start-up, so that no
// read of the town ever writes.
const granted = grantOwedStalls(data, store);
if (granted.length > 0) console.log(`Gave the Market Stall to players saved before the town: ${granted.join(", ")}.`);
const combiner = createCombiner({
  data,
  store,
  generate,
  blocklist,
  learnShare: (player) => discountShare(standingBuildings(data, store, player), "learn-discount"),
});
// Events are written whole before the player hears of them, so one is only "ready" once it exists.
const progress = createProgress({ data, store, listDiscovered: combiner.listDiscovered, eventsWrittenAhead: true });
const day = createDay({ data, store, progress });
const town = createTown({ data, store, progress, day, listDiscovered: combiner.listDiscovered });
const shop = createShop({ data, store, progress, listDiscovered: combiner.listDiscovered });
const writer = createModelEventWriter({ client: turns.inBackground(createModelClient(model, "events")), log: store.logModelCall, voice, blocklist });
const events = createEvents({ data, store, progress, day, listDiscovered: combiner.listDiscovered, writer, writeAhead: true });
// Orders are put into words by the model, written ahead and checked against the board.
const orderWriter = createModelOrderWriter({ client: turns.inBackground(createModelClient(model, "orders")), log: store.logModelCall, voice, blocklist });
const shifts = createShifts({ data, store, progress, day, listDiscovered: combiner.listDiscovered, writer: orderWriter });
// The words of the story beats a player has played, written out of sight from prompts/story.md.
const storyWriter = createModelStoryWriter({ client: turns.inBackground(createModelClient(model, "events")), log: store.logModelCall, voice, story: readFileSync(join(root, "prompts/story.md"), "utf8"), blocklist });
const story = createStory({ data, store, writer: storyWriter });
const app = createApp(combiner, { progress, shop, day, town, events, shifts, story });

serve({ fetch: app.fetch, port }, () => {
  const effort = model.effort.combos ? `, ${model.effort.combos} effort for combinations and ${model.effort.events} for events` : "";
  console.log(`Game server on http://localhost:${port} (model ${model.model} at ${model.url}${effort})`);
});
