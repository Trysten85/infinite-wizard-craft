// Measure how good new combinations are. Nothing in the game or the saved game is changed.
//   npm run bench                  every pair in data/combo-bench.json, graded
//   npm run bench -- sand spirit   only pairs that use one of these things
//   npm run bench -- --pick        with the separate judging step switched on, to see what it is worth
//   npm run bench -- --naming word --effort medium
//                                  try another way of naming, or another effort level for the naming call
// The report goes to var/bench/<date>/report.md, beside the last run's results if there is one.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { benchSchema, fromGrade, renderBenchReport, settle, type BenchOutcome } from "../server/bench";
import { loadBlocklist } from "../server/blocklist";
import { createCombiner } from "../server/combiner";
import { createMadeFrom, thingName } from "../server/comboContext";
import { createComboGenerator, isWonderPair } from "../server/comboGenerator";
import { createComboGrader } from "../server/comboGrader";
import { loadGameData, tierForDepth, xpForTier } from "../server/gameData";
import { createModelClient, readModelConfig } from "../server/llm/config";
import { createOllamaClient } from "../server/llm/ollama";
import { openStore } from "../server/store";
import { comboKey, slugify, type GameEntry } from "../shared/schema";

const root = process.cwd();
const PLAYER = "bench";
const settings = readModelConfig(root);
const data = loadGameData(root);
const bench = benchSchema.parse(JSON.parse(readFileSync(join(root, "data/combo-bench.json"), "utf8")));
const args = process.argv.slice(2);
// A flag that takes a value, such as "--naming word".
const valueOf = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const valued = ["--naming", "--effort"];
const flags = args.filter((arg) => arg.startsWith("--"));
const only = args.filter((arg, index) => !arg.startsWith("--") && !valued.includes(args[index - 1] ?? ""));
const naming = (valueOf("--naming") ?? data.balance.generation.naming) as "questions" | "word";
const namingEffort = (valueOf("--effort") ?? settings.effort.naming ?? undefined) as "low" | "medium" | "high" | undefined;
const pick = flags.includes("--pick") || data.balance.generation.pick;
// What was suggested for the pair in hand, round by round.
let ideas: string[] = [];
const pairs = bench.pairs.filter((pair) => only.length === 0 || only.includes(pair.a) || only.includes(pair.b));

const store = openStore(":memory:");
const voice = readFileSync(join(root, "prompts/voice.md"), "utf8");
const madeFrom = createMadeFrom(data, store);
const generate = createComboGenerator({
  client: createModelClient(settings, "combos"),
  log: store.logModelCall,
  voice,
  tags: data.tags.values(),
  namingClient: createModelClient({ ...settings, effort: { ...settings.effort, naming: namingEffort ?? null } }, "naming"),
  balance: { ...data.balance, generation: { ...data.balance.generation, pick, naming } },
  storybook: data.storybook,
  reservedIds: new Set(data.entries.keys()),
  examples: data.comboExamples,
  madeFrom,
  exists: (name) => store.getEntry(slugify(name)) !== undefined,
  trace: (step) => ideas.push(step.refused ? `refused: ${step.refused.join("; ")}` : `${step.ideas.join(", ")} -> ${step.picked ?? "none"}`),
});
const combiner = createCombiner({ data, store, generate, blocklist: loadBlocklist(join(root, "Blocklist.md")) });
// The grader is the same model thinking harder than it does in the game. It is not part of the game.
// (At high effort it sometimes thinks for minutes about one answer, so medium it is.)
const grade = createComboGrader({
  client: createOllamaClient({ baseUrl: settings.url, model: settings.model, think: settings.effort.combos ? "medium" : undefined, keepAlive: settings.keepAlive, timeoutMs: 90_000 }),
  log: () => {},
});

// The stand-in things are saved as if an earlier combination had made them.
const depthOf = (id: string): number => data.entries.get(id)?.depth ?? store.getEntry(id)?.depth ?? 1;
for (const [id, thing] of Object.entries(bench.things)) {
  const depth = Math.max(...thing.madeFrom.map(depthOf)) + 1;
  const tier = tierForDepth(depth, data.balance);
  const entry: GameEntry = { id, name: thing.name, kind: "material", description: thing.description, tags: thing.tags, affinity: [], tier, source: "generated", depth, xp: xpForTier(tier, data.balance), ...(thing.wonder ? { wonder: true } : {}) };
  store.saveGenerated(`bench+${id}`, ...thing.madeFrom, entry);
}
const find = (id: string) => data.entries.get(id) ?? store.getEntry(id);
for (const pair of pairs) for (const id of [pair.a, pair.b]) {
  if (!find(id)) throw new Error(`The bench names "${id}", which is neither a game entry nor one of its stand-in things.`);
  store.addDiscovery(PLAYER, id);
}

const outcomes: BenchOutcome[] = [];
for (const pair of pairs) {
  const [a, b] = [find(pair.a)!, find(pair.b)!];
  const title = `${a.name} + ${b.name}`;
  const magical = isWonderPair(a, b, data.balance);
  if (data.combos.has(comboKey(a.id, b.id))) {
    console.log(`${title}: skipped, it has a hand-written recipe.`);
    continue;
  }
  const before = store.listModelCalls(100_000).length;
  const started = Date.now();
  ideas = [];
  const made = () => {
    const all = store.listModelCalls(100_000);
    return all.slice(0, all.length - before).reverse();
  };
  const callsMade = () => made().map((call) => (call.ok ? call.purpose : `${call.purpose} (reroll)`));
  const steps = () => made().map((call) => ({ purpose: call.purpose, seconds: call.latencyMs / 1000 }));
  try {
    const { entry } = await combiner.combine(PLAYER, a.id, b.id);
    const seconds = (Date.now() - started) / 1000;
    const calls = callsMade();
    const answer = { name: entry.name, storybook: entry.wonder === true };
    // Only an answer the lists do not settle is worth the grader's time.
    const { verdict, why } =
      settle(answer, pair, magical) ??
      fromGrade(
        await grade({ a: thingName(a, madeFrom(a.id)), b: thingName(b, madeFrom(b.id)), result: entry.name, description: entry.description })
          // A fairy-tale name from the storybook list is a real name, whatever the grader makes of it.
          .then((graded) => ({ ...graded, realName: graded.realName || answer.storybook }))
          .catch(() => null),
      );
    outcomes.push({ pair: title, magical, name: entry.name, description: entry.description, tags: entry.tags, storybook: answer.storybook, seconds, calls, steps: steps(), ideas, verdict, why });
    console.log(`${title} = ${entry.name}  [${verdict}]  ${seconds.toFixed(1)}s`);
  } catch (err) {
    const why = (err instanceof Error ? err.message : String(err)).split("\n")[0]!;
    outcomes.push({ pair: title, magical, name: "(nothing)", description: "", tags: [], storybook: false, seconds: (Date.now() - started) / 1000, calls: callsMade(), verdict: "failed", why });
    console.log(`${title}: FAILED ${why}`);
  }
}

const when = new Date().toISOString().slice(0, 16).replace("T", " ");
const benchDir = join(root, "var/bench");
const earlier = existsSync(benchDir) ? readdirSync(benchDir).filter((name) => existsSync(join(benchDir, name, "results.json"))).sort() : [];
const last = earlier.at(-1);
const before = last && only.length === 0 ? { when: last, outcomes: JSON.parse(readFileSync(join(benchDir, last, "results.json"), "utf8")) as BenchOutcome[] } : undefined;
const dir = join(benchDir, when.replace(/[: ]/g, "-"));
mkdirSync(dir, { recursive: true });
const label = `Model: ${settings.model}. Naming by "${naming}" at ${namingEffort ?? "no"} effort${pick ? ", with the judging step on" : ""}. Graded by the same model at medium effort.`;
writeFileSync(join(dir, "report.md"), renderBenchReport(outcomes, when, label, before));
// A run of only some pairs is not kept as something to compare against.
if (only.length === 0) writeFileSync(join(dir, "results.json"), JSON.stringify(outcomes, null, 2));
console.log(`Report written to ${join(dir, "report.md")}`);
