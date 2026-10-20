import { lessonFor } from "../shared/cast";
import { isEvening } from "../shared/day";
import { comboKey, type GameEntry, type TestSaves, type TestSaveStep } from "../shared/schema";
import { RuleError } from "./combiner";
import { createOfflineGame, seededRandom, type OfflineGame } from "./game";
import type { GameData } from "./gameData";
import type { Store } from "./store";
import { xpToReach } from "./progress";

// Plays test-save scenarios (data/test-saves.json) through the game's own services, one player
// per scenario. Each step does what a player or the game would, so a scenario survives changes to
// the save's shape. A step the rules refuse stops the scenario with the rule's own sentence.

type Scenario = TestSaves["scenarios"][number];

export async function playScenario(game: OfflineGame, scenario: Scenario): Promise<void> {
  const { player } = scenario;
  for (const [index, step] of scenario.steps.entries()) {
    try {
      await playStep(game, player, step, index);
    } catch (err) {
      throw new Error(`${player}, step ${index + 1} (${step.do}): ${err instanceof Error ? err.message : err}`);
    }
  }
  game.progress.settle(player);
}

// A test save raises a building as a player would, given what the tier asks for, so a scenario
// need not list it: named things are discovered, a trade it needs is discovered, and the things
// the player must have made are made as plain placeholders that carry what is asked.
function meetNeeds(game: OfflineGame, player: string, buildingId: string, tier: number): void {
  const { data, store } = game;
  const building = data.buildings.get(buildingId);
  if (!building) throw new Error(`there is no building ${buildingId}`);
  const own = building.tiers[tier - 1];
  const make = (tag: string, depth: number, n: number) => {
    const id = `test-${building.id}-${tier}-${tag}-${n}`;
    const entry: GameEntry = { id, name: `Test ${tag} ${n}`, kind: "material", description: "A placeholder made for a test save.", tags: [tag], affinity: [], tier: 1, source: "generated", depth, xp: 10 };
    if (!store.getEntry(id)) store.saveGenerated(comboKey(id, "test-save"), id, "test-save", entry);
    store.addDiscovery(player, id);
  };
  for (const [n, need] of (own?.needs ?? []).entries()) {
    if ("entry" in need) store.addDiscovery(player, need.entry);
    else make(need.tag, need.depth ?? 1, n);
  }
  if (own?.needsJob) store.addDiscovery(player, own.needsJob);
  const made = data.balance.town.tiers[tier - 1]?.made;
  if (made) for (let n = 0; n < made.count; n++) make(building.wants[n % building.wants.length]!, made.depth, 100 + n);
}

async function playStep(game: OfflineGame, player: string, step: TestSaveStep, index: number): Promise<void> {
  const { data, store, progress, day, town, events } = game;
  const person = (job: string) => {
    town.arrive(player);
    const found = store.listPeople(player).find((each) => each.job === job);
    if (!found) throw new Error(`nobody of the ${job}'s trade is in town yet`);
    return found;
  };
  switch (step.do) {
    case "discover":
      for (const id of step.ids) store.addDiscovery(player, id);
      progress.settle(player);
      return;
    case "gold":
      store.addLedger(player, step.amount, "test", `step-${index}`);
      return;
    case "level": {
      progress.settle(player);
      const short = xpToReach(step.level, data.balance) - progress.getProgress(player).xp;
      if (short > 0) store.changeStats(player, { bonusXp: short });
      progress.settle(player);
      return;
    }
    case "takeJob":
      progress.chooseJob(player, step.job);
      return;
    case "buyPlot":
      town.buyPlot(player);
      return;
    case "build":
      meetNeeds(game, player, step.building, 1);
      town.build(player, step.plot, step.building);
      return;
    case "upgrade": {
      const at = store.listPlots(player).find((plot) => plot.plot === step.plot);
      if (!at?.building) throw new Error(`nothing stands on plot ${step.plot}`);
      meetNeeds(game, player, at.building, at.tier + 1);
      town.upgrade(player, step.plot);
      return;
    }
    case "hire":
      town.arrive(player);
      town.hire(player, step.plot);
      return;
    case "night":
      for (let night = 0; night < step.count; night++) {
        if (!isEvening(day.today(player), data.balance.day)) store.setDay(player, { ...day.today(player), sun: data.balance.day.length });
        day.end(player);
      }
      town.arrive(player);
      return;
    case "setDay": {
      const now = day.today(player);
      store.setDay(player, { ...now, ...(step.sun !== undefined ? { sun: step.sun } : {}), ...(step.spent !== undefined ? { spent: step.spent } : {}) });
      return;
    }
    case "fondness":
      store.updatePerson(person(step.job).id, { fondness: step.to });
      progress.settle(player);
      return;
    case "lessonDone": {
      const job = data.jobs.get(step.job);
      if (!job) throw new Error(`there is no job ${step.job}`);
      for (const quest of lessonFor(job, data.cast)) store.addLedger(player, quest.gold, "quest", quest.id);
      progress.settle(player);
      return;
    }
    case "call":
      town.call(player, person(step.job).id);
      return;
    case "visitor":
      // Today's visitor, written by the canned writer and waiting.
      await events.current(player);
      if (!store.listEvents(player).some((event) => event.state === "pending")) throw new Error("no visitor came");
      return;
  }
}

// The same seed for a scenario every time, whichever order they are built in.
export function seedFor(player: string): number {
  return [...player].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 7) || 1;
}

// Builds one scenario into a save from nothing: that player's rows are cleared, then its steps
// are played with its own seed and the model off. Used by `npm run saves` and the dev route.
export async function rebuildScenario(data: GameData, store: Store, scenario: Scenario): Promise<void> {
  store.deletePlayer(scenario.player);
  await playScenario(createOfflineGame({ data, store, random: seededRandom(seedFor(scenario.player)) }), scenario);
  if (!store.hiresSeeded()) store.markHiresSeeded();
}

export type TestSaveService = ReturnType<typeof createTestSaves>;

// The test saves inside the running server, for the page's picker: what there is, and starting
// one over. Only a player named in data/test-saves.json can be started over, so a real player's
// save can never be wiped this way.
export function createTestSaves(deps: { data: GameData; store: Store; saves: TestSaves }) {
  const { data, store, saves } = deps;
  return {
    list: () => saves.scenarios.map(({ player, about }) => ({ player, about })),
    async reset(player: string): Promise<void> {
      const scenario = saves.scenarios.find((item) => item.player === player);
      if (!scenario) throw new RuleError(`${player} is not a test save, so it cannot be started over.`);
      await rebuildScenario(data, store, scenario);
    },
  };
}
