import type { TestSaves } from "./schema";

// What a test-save file gets wrong, so `npm run saves` refuses it before playing anything. `world`
// is the ids the game has.
export function testSaveProblems(saves: TestSaves, world: { entries: ReadonlySet<string>; jobs: ReadonlySet<string>; buildings: ReadonlySet<string> }): string[] {
  const problems: string[] = [];
  const players = new Set<string>();
  for (const { player, steps } of saves.scenarios) {
    if (players.has(player)) problems.push(`two test saves are called ${player}`);
    players.add(player);
    for (const step of steps) {
      const at = `${player}: ${step.do}`;
      if (step.do === "discover") for (const id of step.ids) if (!world.entries.has(id) && !world.jobs.has(id)) problems.push(`${at} names the unknown thing ${id}`);
      if ((step.do === "takeJob" || step.do === "fondness" || step.do === "lessonDone" || step.do === "call") && !world.jobs.has(step.job)) problems.push(`${at} names the unknown job ${step.job}`);
      if (step.do === "build" && !world.buildings.has(step.building)) problems.push(`${at} names the unknown building ${step.building}`);
    }
  }
  return problems;
}
