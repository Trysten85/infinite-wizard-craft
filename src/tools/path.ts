// Show how something is made, worked back to the starting elements.
//   npm run path -- blacksmith
//   npm run path -- spell-fireball
//   npm run path -- jobs          a one-line chain for every job
import { loadGameData } from "../server/gameData";
import { buildPath, describeStep } from "../server/paths";

const data = loadGameData(process.cwd());
const [target] = process.argv.slice(2);

if (target === "jobs") {
  for (const job of data.jobs.values()) {
    const steps = buildPath(data, job.id);
    const last = steps[steps.length - 1]!;
    console.log(`${job.name.padEnd(14)} ${job.magic ? "magic  " : "mundane"}  ${String(steps.length).padStart(2)} combos   ${describeStep(data, last)}`);
  }
} else if (target && data.entries.has(target)) {
  const steps = buildPath(data, target);
  console.log(`${data.entries.get(target)!.name}: ${steps.length} combos from the starting elements`);
  for (const [index, step] of steps.entries()) console.log(`${String(index + 1).padStart(3)}. ${describeStep(data, step)}`);
} else {
  console.log(target ? `Nothing in the game has the id "${target}".` : "Usage: npm run path -- <entry-id> | jobs");
}
