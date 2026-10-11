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
//   npm run bake -- triage         write data/combo-triage.csv: every pair, flagged, with a suggested verdict
//   npm run bake -- import data/combo-triage.csv      read your verdicts back into the drafts
//   npm run bake -- import data/combo-triage.csv --accept-suggestions    take the suggestion wherever you left a row blank
//   npm run bake -- why bat+tea    one pair's whole trail: candidates, marks, and the model's own thinking
// How much of the PC it uses is set under "bake" in config/model.json.
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { createBaker, draftOf, withDraft, type BakeRecord } from "../server/bake";
import { createCallRecorder } from "../server/bakeLog";
import { BAKE_DIR, createPacer, PAUSE_FLAG, PLAYER_MARKER } from "../server/bakePace";
import { acceptanceChecks, applyVerdicts, flagsFor, nameUses, parseCsv, suggestionFromFlags, toCsv, type Suggestion, type TriageRow } from "../server/bakeTriage";
import { bakePairs } from "../server/bakePairs";
import { loadBlocklist } from "../server/blocklist";
import { BAKED_FILE, loadGameData, readOptional } from "../server/gameData";
import { canonicalName } from "../server/names";
import { createModelClient, readModelConfig } from "../server/llm/config";
import { StopRequested } from "../server/llm/generate";
import { createOllamaClient, unloadModel } from "../server/llm/ollama";
import { bakedComboSchema, comboKey, slugify, type BakedCombo } from "../shared/schema";

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
const TRIAGE_FILE = "data/combo-triage.csv";
const SUGGESTIONS_FILE = "data/combo-suggestions.json";
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
    // Counted afresh for each pair, from every row still in play.
    usesOf: (name) => uses.get(slugify(canonicalName(name, data.aliases))) ?? 0,
  });
  let uses = nameUses(drafts());

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
      uses = nameUses(drafts());
      const record = await baker.bakePair(a, b);
      pacer.worked(Date.now() - began);
      appendFileSync(pairsFile, `${JSON.stringify(record)}\n`);
      const draft = draftOf(record);
      // The name is kept in the game's one spelling of it.
      if (draft) saveDrafts(withDraft(drafts(), { ...draft, name: canonicalName(draft.name, data.aliases) }));
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

// What the review tools need to know about the game: its words, its ban list, and its names.
function triageContext() {
  const data = loadGameData(root, { baked: false });
  const storybook = new Set(data.storybook.map((item) => slugify(item.name)));
  return {
    data,
    context: {
      words: data.words,
      banned: data.banned,
      overused: data.overused,
      maxSentences: data.balance.generation.maxSentences,
      nameCap: data.balance.generation.bakeNameCap,
      vouched: (name: string) => storybook.has(slugify(name)),
      nameOf: (id: string) => data.entries.get(id)?.name ?? id,
    },
  };
}

// Writes the review file. Verdicts already filled in are carried over, so it is safe to run again.
function triage(): void {
  const { context } = triageContext();
  const rows = drafts();
  const uses = nameUses(rows);
  const byPair = new Map(records().map((record) => [record.pair, record]));
  const authored: Record<string, Suggestion> = existsSync(at(SUGGESTIONS_FILE)) ? (JSON.parse(readFileSync(at(SUGGESTIONS_FILE), "utf8")) as Record<string, Suggestion>) : {};
  const earlier = new Map((existsSync(at(TRIAGE_FILE)) ? parseCsv(readFileSync(at(TRIAGE_FILE), "utf8")) : []).map((row) => [row.key, row]));
  const order = { reject: 0, nothing: 1, fix: 2, keep: 3 };
  const lines: TriageRow[] = rows
    .filter((row) => row.status === "draft")
    .map((row) => {
      const key = comboKey(...row.inputs);
      const record = byPair.get(key);
      const flags = flagsFor(row, uses.get(slugify(row.name)) ?? 0, context);
      const suggestion = authored[key] ?? suggestionFromFlags(flags);
      const kept = earlier.get(key);
      return {
        key,
        pair: `${context.nameOf(row.inputs[0])} + ${context.nameOf(row.inputs[1])}`,
        result: row.name,
        description: row.description,
        mark: row.sense === null ? "?" : String(row.sense),
        flags: flags.join("; "),
        secondChoice: record?.runnerUp ? `${record.runnerUp.name} (${record.runnerUp.mark ?? "?"})` : "",
        modelReason: row.reason,
        comparison: record?.comparison ?? "",
        suggested: suggestion.verdict,
        suggestedResult: suggestion.result ?? "",
        failure: kept?.failure || suggestion.failure || "",
        yourVerdict: kept?.yourVerdict ?? "",
        yourResult: kept?.yourResult ?? "",
        notes: kept?.notes ?? "",
      };
    })
    // The rows most in need of a look come first.
    .sort((x, y) => order[x.suggested as keyof typeof order] - order[y.suggested as keyof typeof order] || x.pair.localeCompare(y.pair));
  writeFileSync(at(TRIAGE_FILE), toCsv(lines));
  const count = (verdict: string) => lines.filter((line) => line.suggested === verdict).length;
  console.log(`${lines.length} rows written to ${TRIAGE_FILE}.`);
  console.log(`Suggested: keep ${count("keep")}, fix ${count("fix")}, nothing happens ${count("nothing")}, reject and rebake ${count("reject")}.`);
  console.log(`Your verdicts so far: ${lines.filter((line) => line.yourVerdict !== "").length} filled in.`);
  const checks = acceptanceChecks(rows, context);
  console.log("\nAcceptance checks on the rows still in play:");
  console.log(`  names used for more than ${context.nameCap} pairs: ${checks.overCap.length}${checks.overCap.length > 0 ? ` (${checks.overCap.slice(0, 8).map(([name, uses]) => `${name} ${uses}`).join(", ")}${checks.overCap.length > 8 ? ", ..." : ""})` : ""}`);
  console.log(`  results from after the age of steam: ${checks.banned}`);
  console.log(`  descriptions over ${context.maxSentences} sentences: ${checks.tooLong}`);
  console.log(`  descriptions leaning on worn-out words: ${Math.round(checks.wornShare * 100)}%`);
}

// Reads a reviewed file back into the drafts.
function importVerdicts(): void {
  const file = rest[0] ?? TRIAGE_FILE;
  if (!existsSync(at(file))) return console.log(`There is no ${file}.`);
  const before = drafts();
  const { rows, counts, problems } = applyVerdicts(before, parseCsv(readFileSync(at(file), "utf8")), { acceptSuggestions: process.argv.includes("--accept-suggestions") });
  saveDrafts(rows);
  try {
    loadGameData(root);
  } catch (err) {
    saveDrafts(before);
    return console.log(`Not done: the game would not start with that.\n${err instanceof Error ? err.message : err}`);
  }
  console.log(`Kept ${counts.keep}, to fix ${counts.fix}, nothing happens ${counts.nothing}, rejected ${counts.reject}, left as drafts ${counts.untouched}.`);
  for (const problem of problems) console.log(`  ${problem}`);
  if (counts.fix > 0) console.log("Fixed rows need their descriptions rewritten before they go live.");
  if (counts.keep + counts.nothing > 0) console.log("Restart the server and the kept pairs, and the pairs that make nothing, are in the game.");
}

// One pair's whole trail, for working out why the model went the way it did.
function why(): void {
  const key = comboKey(...((rest[0] ?? "").split("+") as [string, string]));
  const record = records().find((item) => item.pair === key);
  if (!record) return console.log(`No record of "${rest[0] ?? ""}". Give a pair such as bat+tea.`);
  console.log(`${record.a.name} + ${record.b.name}${record.magical ? "  (magic in play)" : ""}`);
  if (record.offered.length > 0) console.log(`Storybook things on offer: ${record.offered.join(", ")}. Chosen: ${record.storybookChoice ?? "none"}.`);
  console.log("\nCandidates:");
  for (const candidate of record.candidates) console.log(`  ${candidate.mark ?? "?"}  ${candidate.name}  [${candidate.source}]\n       why suggested: ${candidate.why}\n       why that mark: ${candidate.reason}`);
  if (record.refused.length > 0) console.log(`\nRefused by the rules: ${record.refused.join("; ")}`);
  console.log(`\nRanked at ${record.rankEffort} effort. It said it would keep: ${record.keep ?? "nothing"}. Picked: ${record.pick?.name ?? "nothing"}.`);
  if (record.comparison) console.log(`Its comparison: ${record.comparison}`);
  if (!existsSync(callsFile)) return;
  const calls = readFileSync(callsFile, "utf8")
    .split("\n")
    .filter((line) => line.includes(`"pair":"${key}"`))
    .map((line) => JSON.parse(line) as { purpose: string; passed: boolean; seconds: number; thinking: string | null; problem: string | null });
  console.log("\nThe model's own thinking, call by call:");
  for (const call of calls) console.log(`\n--- ${call.purpose}, ${call.seconds.toFixed(1)}s${call.passed ? "" : `, sent back: ${call.problem}`}\n${call.thinking ?? "(none kept)"}`);
}

if (command === "run") await run();
else if (command === "triage") triage();
else if (command === "import") importVerdicts();
else if (command === "why") why();
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
else console.log("Commands: (none) to run, pause, resume, status, review, triage, import, why, approve, reject.");
