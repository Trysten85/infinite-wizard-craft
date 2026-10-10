// The overnight bake: the model works through the basic pairs, ranks its own answers, and
// everything it does is kept. Nothing is in the game until it is approved.
//   npm run bake                   work through the pairs, carrying on from where it stopped
//   npm run bake -- --limit 10     only that many pairs, for a trial
//   npm run bake -- pause          stop within a second and let go of the model
//   npm run bake -- resume         carry on
//   npm run bake -- status         how far it has got and how long is left
//   npm run bake -- review         write a reading list to var/bake/review.md, lowest marks first
//   npm run bake -- approve 4      approve every draft marked 4 or better
//   npm run bake -- approve sand+water      approve single pairs
//   npm run bake -- reject sand+water       turn single pairs down
// How much of the PC it uses is set under "bake" in config/model.json.
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { createBaker, draftOf, withDraft, type BakeRecord } from "../server/bake";
import { createCallRecorder } from "../server/bakeLog";
import { BAKE_DIR, createPacer, PAUSE_FLAG, PLAYER_MARKER } from "../server/bakePace";
import { bakePairs } from "../server/bakePairs";
import { loadBlocklist } from "../server/blocklist";
import { BAKED_FILE, loadGameData, readOptional } from "../server/gameData";
import { createModelClient, readModelConfig } from "../server/llm/config";
import { StopRequested } from "../server/llm/generate";
import { createOllamaClient, unloadModel } from "../server/llm/ollama";
import { bakedComboSchema, comboKey, type BakedCombo } from "../shared/schema";

const root = process.cwd();
const at = (path: string) => join(root, path);
const dir = at(BAKE_DIR);
const pairsFile = join(dir, "pairs.jsonl");
const callsFile = join(dir, "calls.jsonl");
const promptsFile = join(dir, "prompts.json");
const pidFile = join(dir, "pid");
mkdirSync(dir, { recursive: true });

const settings = readModelConfig(root);
const [command = "run", ...rest] = process.argv.slice(2).filter((arg, index, all) => !arg.startsWith("--") && all[index - 1] !== "--limit");
const limitAt = process.argv.indexOf("--limit");
const limit = limitAt > 0 ? Number(process.argv[limitAt + 1]) : Infinity;

const records = (): BakeRecord[] =>
  existsSync(pairsFile)
    ? readFileSync(pairsFile, "utf8")
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => JSON.parse(line) as BakeRecord)
    : [];
const drafts = (): BakedCombo[] => readOptional(at(BAKED_FILE), z.array(bakedComboSchema));
// One row per line, so hand edits and git diffs stay readable.
const saveDrafts = (rows: BakedCombo[]) => writeFileSync(at(BAKED_FILE), `[\n${rows.map((row) => `  ${JSON.stringify(row)}`).join(",\n")}\n]\n`);
const clock = () => new Date().toTimeString().slice(0, 5);
const say = (line: string) => console.log(`${clock()}  ${line}`);

function running(): boolean {
  if (!existsSync(pidFile)) return false;
  try {
    process.kill(Number(readFileSync(pidFile, "utf8")), 0);
    return true;
  } catch {
    return false;
  }
}

async function run(): Promise<void> {
  if (running()) {
    console.log("The bake is already running. Use `npm run bake -- status` to see how it is doing.");
    return;
  }
  // The bake is about what the model makes of pairs with no recipe, so approved bakes are left out.
  const data = loadGameData(root, { baked: false });
  const pairs = bakePairs(data);
  const done = new Set(records().map((record) => record.pair));
  const todo = pairs.filter(([a, b]) => !done.has(comboKey(a.id, b.id))).slice(0, limit);
  say(`${pairs.length} pairs in all, ${done.size} done, ${todo.length} to do this run.`);
  if (todo.length === 0) return;
  writeFileSync(pidFile, String(process.pid));

  let stopping = false;
  let current = "";
  const pacer = createPacer({
    settings: settings.bake,
    now: Date.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    isPaused: () => existsSync(at(PAUSE_FLAG)),
    playerLastActive: () => (existsSync(at(PLAYER_MARKER)) ? statSync(at(PLAYER_MARKER)).mtimeMs : null),
    unload: () => unloadModel(settings.url, settings.model),
    say,
  });
  const prompts: Record<string, string> = existsSync(promptsFile) ? (JSON.parse(readFileSync(promptsFile, "utf8")) as Record<string, string>) : {};
  const recorder = createCallRecorder(
    {
      call: (call) => appendFileSync(callsFile, `${JSON.stringify({ pair: current, ...call })}\n`),
      system: (id, text) => {
        if (prompts[id]) return;
        prompts[id] = text;
        writeFileSync(promptsFile, JSON.stringify(prompts, null, 2));
      },
    },
    () => stopping || pacer.holdReason() !== null,
  );
  // The ranking thinks harder, and is given longer. A model that does not reason is sent no effort.
  const reasons = settings.effort.combos !== null;
  const rankEffort = reasons ? settings.bake.rankEffort : null;
  const thinker = rankEffort
    ? createOllamaClient({ baseUrl: settings.url, model: settings.model, think: rankEffort, keepAlive: settings.keepAlive, timeoutMs: settings.bake.rankTimeoutSeconds * 1000 })
    : null;
  const baker = createBaker({
    data,
    voice: readFileSync(at("prompts/voice.md"), "utf8"),
    blocklist: loadBlocklist(at("Blocklist.md")),
    client: recorder.client(createModelClient(settings, "combos"), settings.effort.combos),
    thinker: thinker && recorder.client(thinker, rankEffort),
    thinkerEffort: rankEffort ?? "low",
    log: recorder.log,
  });

  process.on("SIGINT", () => {
    stopping = true;
    say("Stopping after cutting the current call short. Start it again to carry on.");
  });

  for (let index = 0; index < todo.length && !stopping; ) {
    await pacer.clearance();
    const [a, b] = todo[index]!;
    current = comboKey(a.id, b.id);
    const began = Date.now();
    try {
      const record = await baker.bakePair(a, b);
      pacer.worked(Date.now() - began);
      appendFileSync(pairsFile, `${JSON.stringify(record)}\n`);
      const draft = draftOf(record);
      if (draft) saveDrafts(withDraft(drafts(), draft));
      const result = record.pick ? `${record.pick.name} (${record.pick.mark ?? "unmarked"} of 5, ranked at ${record.rankEffort})` : `nothing: ${record.failed}`;
      say(`[${done.size + index + 1}/${pairs.length}] ${a.name} + ${b.name} = ${result}  ${Math.round(record.seconds)}s`);
      index++;
    } catch (err) {
      // Cut short for a pause or a player. The pair is done again from the start, later.
      if (!(err instanceof StopRequested)) throw err;
      pacer.worked(Date.now() - began);
    }
  }
  rmSync(pidFile, { force: true });
  if (settings.bake.unloadWhileResting) await unloadModel(settings.url, settings.model);
  say(stopping ? "Stopped." : "This run is finished. `npm run bake -- review` writes the reading list.");
}

function status(): void {
  const all = records();
  const total = bakePairs(loadGameData(root, { baked: false })).length;
  const made = all.filter((record) => !record.failed);
  const seconds = all.reduce((sum, record) => sum + record.seconds, 0);
  const each = all.length > 0 ? seconds / all.length : 0;
  const left = Math.max(0, total - all.length);
  console.log(`${all.length} of ${total} pairs done (${all.length - made.length} came to nothing).`);
  if (all.length > 0) {
    console.log(`About ${Math.round(each)} seconds a pair. At ${Math.round(settings.bake.share * 100)}% usage, roughly ${((left * each) / settings.bake.share / 3600).toFixed(1)} hours left.`);
    for (const mark of [5, 4, 3, 2, 1]) console.log(`  marked ${mark}: ${made.filter((record) => record.pick?.mark === mark).length}`);
    console.log(`  unmarked: ${made.filter((record) => record.pick?.mark == null).length}`);
  }
  const rows = drafts();
  console.log(`Drafts: ${rows.filter((row) => row.status === "draft").length} waiting, ${rows.filter((row) => row.status === "ok").length} approved, ${rows.filter((row) => row.status === "rejected").length} rejected.`);
  console.log(existsSync(at(PAUSE_FLAG)) ? "It is paused." : running() ? "It is running." : "It is not running.");
}

function review(): void {
  const data = loadGameData(root, { baked: false });
  const name = (id: string) => data.entries.get(id)?.name ?? id;
  const byPair = new Map(records().map((record) => [record.pair, record]));
  const rows = drafts().sort((x, y) => (x.sense ?? 0) - (y.sense ?? 0));
  const lines = [
    "# Baked pairs to review",
    "",
    "Lowest marks first. Approve with `npm run bake -- approve 4` (everything marked 4 or better), or pair by pair.",
    "",
    "| Pair | Result | Mark | The model's reason | Its second choice | Status |",
    "|---|---|---|---|---|---|",
    ...rows.map((row) => {
      const record = byPair.get(comboKey(...row.inputs));
      const second = record?.runnerUp ? `${record.runnerUp.name} (${record.runnerUp.mark ?? "?"})` : "";
      return `| ${name(row.inputs[0])} + ${name(row.inputs[1])} \`${comboKey(...row.inputs)}\` | **${row.name}**${row.wonder ? " ✦" : ""}: ${row.description} | ${row.sense ?? "?"} | ${row.reason} | ${second} | ${row.status} |`;
    }),
    "",
    "✦ marks a storybook thing.",
  ];
  writeFileSync(join(dir, "review.md"), lines.join("\n"));
  console.log(`${rows.length} rows written to ${join(BAKE_DIR, "review.md")}`);
}

// Sets the status of drafts: all those marked at least `rest[0]` when that is a number,
// otherwise the pairs named. An approval the game data would not accept is undone.
function decide(status: "ok" | "rejected"): void {
  const before = drafts();
  const least = rest.length === 1 && /^[1-5]$/.test(rest[0]!) ? Number(rest[0]) : null;
  const named = new Set(rest.map((key) => comboKey(...(key.split("+") as [string, string]))));
  const chosen = (row: BakedCombo) => (least !== null ? row.status === "draft" && (row.sense ?? 0) >= least : named.has(comboKey(...row.inputs)));
  const after = before.map((row) => (chosen(row) ? { ...row, status } : row));
  const changed = after.filter((row, index) => row !== before[index]).length;
  if (changed === 0) return console.log("Nothing matched. Give a mark from 1 to 5, or pairs such as sand+water.");
  saveDrafts(after);
  try {
    loadGameData(root);
  } catch (err) {
    saveDrafts(before);
    return console.log(`Not done: the game would not start with that.\n${err instanceof Error ? err.message : err}`);
  }
  console.log(`${changed} ${status === "ok" ? "approved" : "rejected"}. ${status === "ok" ? "Restart the server and they are in the game." : ""}`);
}

if (command === "run") await run();
else if (command === "pause") {
  writeFileSync(at(PAUSE_FLAG), new Date().toISOString());
  await unloadModel(settings.url, settings.model);
  console.log("Paused, and the model has been let go. `npm run bake -- resume` carries on.");
} else if (command === "resume") {
  rmSync(at(PAUSE_FLAG), { force: true });
  console.log(running() ? "Carrying on." : "Not paused any more. It is not running: start it with `npm run bake`.");
} else if (command === "status") status();
else if (command === "review") review();
else if (command === "approve") decide("ok");
else if (command === "reject") decide("rejected");
else console.log("Commands: (none) to run, pause, resume, status, review, approve, reject.");
