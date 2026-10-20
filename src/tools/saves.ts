// Test saves: builds a known state for each scenario in data/test-saves.json, one player apiece,
// by playing its steps through the game's own services with a fixed seed and the model off.
//   npm run saves              back up var/game.db, wipe it, and build every scenario into it
//   npm run saves -- smithy-hired     build that one again, leaving the others
//   npm run saves -- --list    what each scenario is for
// Stop the dev server first: it holds the save open. Then start it and pick a scenario's player.
import { copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadGameData } from "../server/gameData";
import { openStore } from "../server/store";
import { rebuildScenario } from "../server/testSaves";
import { testSavesSchema } from "../shared/schema";
import { testSaveProblems } from "../shared/testSaves";

const root = process.cwd();
const dbFile = join(root, "var/game.db");
const args = process.argv.slice(2);
const data = loadGameData(root);
const saves = testSavesSchema.parse(JSON.parse(readFileSync(join(root, "data/test-saves.json"), "utf8")));

async function serverRunning(): Promise<boolean> {
  const port = Number(process.env.PORT ?? 3001);
  try {
    await fetch(`http://localhost:${port}/api/jobs`, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  if (args.includes("--list")) {
    for (const scenario of saves.scenarios) console.log(`${scenario.player.padEnd(20)} ${scenario.about}`);
    return;
  }
  const problems = testSaveProblems(saves, {
    entries: new Set(data.entries.keys()),
    jobs: new Set(data.jobs.keys()),
    buildings: new Set(data.buildings.keys()),
  });
  if (problems.length > 0) {
    console.log(`Not built: data/test-saves.json has problems:\n- ${problems.join("\n- ")}`);
    process.exitCode = 1;
    return;
  }
  const named = args.filter((arg) => !arg.startsWith("--"));
  const chosen = named.length > 0 ? saves.scenarios.filter((scenario) => named.includes(scenario.player)) : saves.scenarios;
  const unknown = named.filter((name) => !saves.scenarios.some((scenario) => scenario.player === name));
  if (unknown.length > 0) {
    console.log(`No test save called ${unknown.join(", ")}. \`npm run saves -- --list\` lists them.`);
    process.exitCode = 1;
    return;
  }
  if (await serverRunning()) {
    console.log("The dev server is running and holds var/game.db open. Stop it, run this again, then start it.");
    process.exitCode = 1;
    return;
  }

  // The save as it was is kept, whatever happens next.
  if (existsSync(dbFile)) {
    const backup = join(root, `var/game.before-test-saves-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
    copyFileSync(dbFile, backup);
    console.log(`Backed up the save to ${backup}`);
  }
  // Every scenario: the old saves are wiped. One scenario: only that player is cleared.
  if (named.length === 0) for (const file of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) rmSync(file, { force: true });
  const store = openStore(dbFile);
  let failed = 0;
  for (const scenario of chosen) {
    try {
      await rebuildScenario(data, store, scenario);
      console.log(`built  ${scenario.player.padEnd(20)} ${scenario.about}`);
    } catch (err) {
      failed++;
      console.log(`FAILED ${err instanceof Error ? err.message : err}`);
    }
  }
  // The saves built here are new, so the one-time hiring of old saves' townsfolk never applies.
  if (!store.hiresSeeded()) store.markHiresSeeded();
  console.log(failed === 0 ? "Done. Start the dev server and open the game as any of these players." : `${failed} could not be built; see above.`);
  if (failed > 0) process.exitCode = 1;
}

await main();
