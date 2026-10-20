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
//   npm run bake -- seed           put the approved pairs (data/approved-combos.json) into the drafts; --dry to look first
//   npm run bake -- score --way all   score the ways of making combinations against the held-out pairs (the A/B)
//   npm run bake -- redescribe     write new descriptions for the seeded rows and put them in the game
//   npm run bake -- triage         write data/combo-triage.csv: every pair, flagged, with a suggested verdict
//   npm run bake -- import data/combo-triage.csv      read your verdicts back into the drafts
//   npm run bake -- import data/combo-triage.csv --accept-suggestions    take the suggestion wherever you left a row blank
//   npm run bake -- why bat+tea    one pair's whole trail: candidates, marks, and the model's own thinking
// How much of the PC it uses is set under "bake" in config/model.json.
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { createBaker, draftOf, withDraft, type BakeRecord } from "../server/bake";
import { createCallRecorder } from "../server/bakeLog";
import { approvedExamples, DONT_EXAMPLES, dontLine } from "../server/comboContext";
import { PROBES, renderScore, scoreRound, type Scored } from "../server/bakeScore";
import { approvedRowSchema, chooseHeldOut, heldOutSchema, planSeed } from "../server/bakeSeed";
import { BAKE_DIR, createPacer, PAUSE_FLAG, PLAYER_MARKER } from "../server/bakePace";
import { acceptanceChecks, applyVerdicts, flagsFor, isHardFlag, nameUses, parseCsv, suggestionFromFlags, toCsv, type Suggestion, type TriageRow } from "../server/bakeTriage";
import { bakePairs } from "../server/bakePairs";
import { loadBlocklist } from "../server/blocklist";
import { BAKED_FILE, loadGameData, readOptional } from "../server/gameData";
import { canonicalName } from "../server/names";
import { createModelClient, readModelConfig } from "../server/llm/config";
import { GenerationError, StopRequested } from "../server/llm/generate";
import { createOllamaClient, unloadModel } from "../server/llm/ollama";
import { bakedComboSchema, comboKey, slugify, type BakedCombo, type GameEntry } from "../shared/schema";

const root = process.cwd();
const at = (path: string) => join(root, path);
const dir = at(BAKE_DIR);
// Round 2 keeps its own record of what it has done, so round 1's 727 pairs do not count as done.
const round2 = process.argv.includes("--round2");
const pairsFile = join(dir, round2 ? "round2/pairs.jsonl" : "pairs.jsonl");
const callsFile = join(dir, "calls.jsonl");
const promptsFile = join(dir, "prompts.json");
const pidFile = join(dir, "pid");
mkdirSync(round2 ? join(dir, "round2") : dir, { recursive: true });

const settings = readModelConfig(root);
const [command = "run", ...rest] = process.argv.slice(2).filter((arg, index, all) => !arg.startsWith("--") && all[index - 1] !== "--limit" && all[index - 1] !== "--way");
const TRIAGE_FILE = "data/combo-triage.csv";
const SUGGESTIONS_FILE = "data/combo-suggestions.json";
// How pairs are made: the multi-call pipeline, or the single reasoning-first call (`single`), or
// that call without its reasoning fields (`single-lean`). `score` also takes `all`.
const wayAt = process.argv.indexOf("--way");
const WAYS = ["pipeline", "single", "single-lean"] as const;
type Way = (typeof WAYS)[number];
const way = (wayAt > 0 ? process.argv[wayAt + 1] : "pipeline") as Way | "all";
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

// The pacer, the call recorder, and the baker, set up the same way for every command that
// uses the model. `state` is how a stop and the pair in hand reach them.
function makeKit(data: ReturnType<typeof loadGameData>, usesOf: (name: string) => number, gate?: (row: BakedCombo) => string[], extras?: Pick<Parameters<typeof createBaker>[0], "extraExamples" | "avoid" | "dont" | "way">) {
  const state = { stopping: false, current: "" };
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
      call: (call) => appendFileSync(callsFile, `${JSON.stringify({ pair: state.current, ...call })}\n`),
      system: (id, text) => {
        if (prompts[id]) return;
        prompts[id] = text;
        writeFileSync(promptsFile, JSON.stringify(prompts, null, 2));
      },
    },
    () => state.stopping || pacer.holdReason() !== null,
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
    usesOf,
    gate,
    ...extras,
  });
  return { pacer, baker, state };
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
  // Round 2 leaves alone what is settled (seeded, approved, rejected), the held-out pairs, and the
  // pairs waiting on a pick from alternatives: the review tool deals with those.
  const settled = new Set(
    round2
      ? [
          ...drafts().filter((row) => row.status !== "draft" || row.notes !== undefined).map((row) => comboKey(...row.inputs)),
          ...(existsSync(at(HELD_OUT_FILE)) ? heldOutSchema.parse(JSON.parse(readFileSync(at(HELD_OUT_FILE), "utf8"))).keys : []),
        ]
      : [],
  );
  const todo = pairs.filter(([a, b]) => !done.has(comboKey(a.id, b.id)) && !settled.has(comboKey(a.id, b.id))).slice(0, limit);
  say(`${pairs.length} pairs in all, ${done.size} done, ${todo.length} to do this run.`);
  if (todo.length === 0) return;
  writeFileSync(pidFile, String(process.pid));

  // Counted afresh for each pair, from every row still in play.
  let uses = new Map<string, number>();
  const { context } = triageContext();
  const { pacer, baker, state } = makeKit(data, (name) => uses.get(slugify(canonicalName(name, data.aliases))) ?? 0, (row) =>
    flagsFor(row, uses.get(slugify(row.name)) ?? 0, context).filter(isHardFlag),
    { ...roundExamples(data), way: way === "all" ? "pipeline" : way },
  );


  process.on("SIGINT", () => {
    state.stopping = true;
    say("Stopping after cutting the current call short. Start it again to carry on.");
  });

  for (let index = 0; index < todo.length && !state.stopping; ) {
    await pacer.clearance();
    const [a, b] = todo[index]!;
    state.current = comboKey(a.id, b.id);
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
  say(state.stopping ? "Stopped." : "This run is finished. `npm run bake -- review` writes the reading list.");
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
  // The model's marks are not reliable: in round 1, 86% scored 4 or 5, wrong answers included.
  if (least !== null && status === "ok" && !process.argv.includes("--i-know")) {
    return console.log("Not done: approving by the model's mark is how round 1 went wrong. Review the rows (`npm run review`), or name pairs. To do it anyway, add --i-know.");
  }
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
        weighing: record?.weighing ?? "",
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
  console.log(`  Water + Salt is Saltwater: ${checks.saltwater ? "yes" : "NO"}. Steam + Salt is not Sea: ${checks.steamSaltNotSea ? "yes" : "NO"}.`);
  console.log(`  (held-out approval, and seconds a pair, are in var/bake/round2/score-*.md from \`npm run bake -- score\`)`);
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

const APPROVED_FILE = "data/approved-combos.json";
const HELD_OUT_FILE = "data/combo-heldout.json";
const HELD_OUT_COUNT = 20;

// What the model is shown beside a pair: the approved pairs (not the held-out ones, which are
// kept for scoring), the results too many pairs give already, and the wrong answers to avoid.
function roundExamples(data: ReturnType<typeof loadGameData>) {
  const approved = existsSync(at(APPROVED_FILE)) ? z.array(approvedRowSchema).parse(JSON.parse(readFileSync(at(APPROVED_FILE), "utf8"))) : [];
  const heldOut = existsSync(at(HELD_OUT_FILE)) ? new Set(heldOutSchema.parse(JSON.parse(readFileSync(at(HELD_OUT_FILE), "utf8"))).keys) : new Set<string>();
  const cap = data.balance.generation.bakeNameCap;
  const rows = drafts();
  const crowded = new Set([...nameUses(rows)].filter(([, count]) => count > cap).map(([id]) => id));
  return {
    extraExamples: approvedExamples(data.entries, approved, heldOut),
    avoid: new Set(rows.filter((row) => crowded.has(slugify(row.name))).map((row) => row.name.toLowerCase())),
    dont: DONT_EXAMPLES.map(dontLine),
  };
}

// Puts the pairs Trysten approved into the drafts as `fix` rows (their name settled, their
// description still to be written), sets aside the held-out pairs, and lists what needs a pick
// from alternatives. `--dry` shows the plan and writes nothing. Safe to run again.
function seed(): void {
  if (!existsSync(at(APPROVED_FILE))) return console.log(`There is no ${APPROVED_FILE}.`);
  const approved = z.array(approvedRowSchema).parse(JSON.parse(readFileSync(at(APPROVED_FILE), "utf8")));
  const data = loadGameData(root, { baked: false });
  const chosen = existsSync(at(HELD_OUT_FILE)) ? heldOutSchema.parse(JSON.parse(readFileSync(at(HELD_OUT_FILE), "utf8"))) : null;
  const heldOut = chosen ?? { note: `Pairs set aside to score a round against. Never seeded and never shown to the model as examples until the round is scored. Chosen by hash, ${HELD_OUT_COUNT} of the approved pairs.`, keys: chooseHeldOut(approved, HELD_OUT_COUNT) };
  const before = drafts();
  const plan = planSeed({ drafts: before, approved, heldOut: new Set(heldOut.keys), canonical: (name) => canonicalName(name, data.aliases) });
  console.log(`${plan.seeded.length} approved pairs set to fix, ${plan.heldOut.length} held out, ${plan.queued.length} queued for alternatives.`);
  for (const item of plan.queued) console.log(`  queued: ${item.key} (${item.why})`);
  console.log(`  held out: ${plan.heldOut.join(", ")}`);
  for (const problem of plan.problems) console.log(`  problem: ${problem}`);
  if (process.argv.includes("--dry")) return console.log("Dry run: nothing written.");
  if (plan.problems.length > 0) return console.log("Not done: fix the problems above first.");
  const backup = at(`var/baked-combos.before-seed-${new Date().toISOString().slice(0, 10)}.json`);
  if (!existsSync(backup)) copyFileSync(at(BAKED_FILE), backup);
  if (!chosen) writeFileSync(at(HELD_OUT_FILE), `${JSON.stringify(heldOut, null, 2)}\n`);
  saveDrafts(plan.rows);
  console.log(`Written. The old file is kept at ${backup}. Next: \`npm run bake -- redescribe\` writes the new descriptions.`);
}

// Writes a new description for every `fix` row, under the current voice rules, then puts the row
// in the game (`ok`). The approved name and tags stand. Safe to stop and run again: each row is
// saved as it is done.
async function redescribe(): Promise<void> {
  if (running()) return console.log("The bake is running. Pause it first.");
  const data = loadGameData(root, { baked: false });
  const todo = drafts().filter((row) => row.status === "fix" && row.correction);
  if (todo.length === 0) return console.log("No rows are waiting on a description.");
  writeFileSync(pidFile, String(process.pid));
  const { pacer, baker, state } = makeKit(data, () => 0);
  process.on("SIGINT", () => {
    state.stopping = true;
    say("Stopping after cutting the current call short.");
  });
  let done = 0;
  for (const row of todo) {
    if (state.stopping) break;
    await pacer.clearance();
    const [a, b] = row.inputs.map((id) => data.entries.get(id)) as [GameEntry | undefined, GameEntry | undefined];
    if (!a || !b) {
      say(`${row.inputs.join("+")}: an ingredient is not in the game. Skipped.`);
      continue;
    }
    const name = canonicalName(row.correction!, data.aliases);
    state.current = comboKey(a.id, b.id);
    try {
      const draft = await baker.describePair(a, b, name);
      const tags = row.tags.length > 0 ? row.tags : draft.tags;
      const { correction: _c, failure: _f, notes: _n, ...rest } = row;
      const proposed = row.tags.length === 0 ? { notes: "tags proposed by the model: confirm" } : {};
      // Re-read, so a hand edit made while this ran is not lost.
      const settled: BakedCombo = { ...rest, name, description: draft.description, tags, wonder: row.name === name ? row.wonder : false, status: "ok", ...proposed };
      saveDrafts(drafts().map((item) => (comboKey(...item.inputs) === state.current ? settled : item)));
      done++;
      say(`[${done}/${todo.length}] ${a.name} + ${b.name} = ${name}: ${draft.description}`);
    } catch (err) {
      if (err instanceof StopRequested) continue;
      if (!(err instanceof GenerationError)) throw err;
      say(`${a.name} + ${b.name} = ${name}: the description kept breaking the rules. Left as fix.`);
    }
  }
  rmSync(pidFile, { force: true });
  if (settings.bake.unloadWhileResting) await unloadModel(settings.url, settings.model);
  try {
    loadGameData(root);
  } catch (err) {
    return console.log(`The game would not start with these rows:\n${err instanceof Error ? err.message : err}`);
  }
  say(`${done} of ${todo.length} described. Restart the server and they are in the game.`);
}

const ROUND_DIR = "var/bake/round2";

// Runs the held-out pairs, and the two probe pairs, through a way of making combinations, and
// scores what comes out against Trysten's answers. Nothing is written to the drafts.
// `--way all` runs every way in turn, which is the A/B.
async function score(): Promise<void> {
  if (running()) return console.log("The bake is running. Pause it first.");
  if (!existsSync(at(HELD_OUT_FILE)) || !existsSync(at(APPROVED_FILE))) return console.log("Run `npm run bake -- seed` first: there is no held-out set yet.");
  const ways: Way[] = way === "all" ? [...WAYS] : [way];
  if (ways.some((item) => !WAYS.includes(item))) return console.log(`--way is one of: ${WAYS.join(", ")}, all.`);
  const data = loadGameData(root, { baked: false });
  const approved = z.array(approvedRowSchema).parse(JSON.parse(readFileSync(at(APPROVED_FILE), "utf8")));
  const heldOut = heldOutSchema.parse(JSON.parse(readFileSync(at(HELD_OUT_FILE), "utf8"))).keys;
  const expected = new Map(approved.map((row) => [comboKey(...row.inputs), row]));
  const { context } = triageContext();
  const crowded = new Set([...nameUses(drafts())].filter(([, count]) => count > context.nameCap).map(([id]) => id));
  const attractors = new Set(drafts().filter((row) => crowded.has(slugify(row.name))).map((row) => row.name.toLowerCase()));
  const keys = [...heldOut, ...PROBES.map((probe) => probe.key)];
  mkdirSync(at(ROUND_DIR), { recursive: true });
  writeFileSync(pidFile, String(process.pid));
  for (const item of ways) {
    const kit = makeKit(data, () => 0, undefined, { way: item, dont: DONT_EXAMPLES.map(dontLine), extraExamples: roundExamples(data).extraExamples, avoid: attractors });
    process.on("SIGINT", () => (kit.state.stopping = true));
    const scored: Scored[] = [];
    for (const key of keys) {
      if (kit.state.stopping) break;
      await kit.pacer.clearance();
      const [a, b] = key.split("+").map((id) => data.entries.get(id)) as [GameEntry | undefined, GameEntry | undefined];
      if (!a || !b) continue;
      kit.state.current = key;
      let record: BakeRecord;
      try {
        record = await kit.baker.bakePair(a, b);
      } catch (err) {
        if (err instanceof StopRequested) continue;
        throw err;
      }
      appendFileSync(at(`${ROUND_DIR}/${item}.jsonl`), `${JSON.stringify(record)}\n`);
      const row = expected.get(key);
      scored.push({ key, expected: row?.result ?? null, got: record.pick?.name ?? null, noResult: record.noResult !== undefined, failed: record.failed !== null, description: record.description ?? "", tags: record.tags, expectedTags: row?.tags ?? [], seconds: record.seconds });
      say(`${item}: ${key} = ${record.pick?.name ?? record.noResult ?? "failed"}  ${Math.round(record.seconds)}s`);
    }
    const heldScored = scored.filter((entry) => heldOut.includes(entry.key));
    const probesScored = scored.filter((entry) => !heldOut.includes(entry.key));
    const summary = scoreRound(heldScored, probesScored, { banned: context.banned, overused: context.overused, maxSentences: context.maxSentences, attractors, canonical: (name) => canonicalName(name, data.aliases) });
    writeFileSync(at(`${ROUND_DIR}/score-${item}.md`), renderScore(item, summary, heldScored));
    console.log(`${item}: ${summary.matched} of ${summary.pairs} gave his answer, ${summary.secondsEach.toFixed(1)}s a pair. Report: ${ROUND_DIR}/score-${item}.md`);
  }
  rmSync(pidFile, { force: true });
  if (settings.bake.unloadWhileResting) await unloadModel(settings.url, settings.model);
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
  if (record.weighing) console.log(`\nWeighing them up, before marking any: ${record.weighing}`);
  console.log(`\nRanked at ${record.rankEffort} effort. It said it would keep: ${record.keep ?? "nothing"}. Picked: ${record.pick?.name ?? "nothing"}.`);
  if (!existsSync(callsFile)) return;
  const calls = readFileSync(callsFile, "utf8")
    .split("\n")
    .filter((line) => line.includes(`"pair":"${key}"`))
    .map((line) => JSON.parse(line) as { purpose: string; passed: boolean; seconds: number; thinking: string | null; problem: string | null });
  console.log("\nThe model's own thinking, call by call:");
  for (const call of calls) console.log(`\n--- ${call.purpose}, ${call.seconds.toFixed(1)}s${call.passed ? "" : `, sent back: ${call.problem}`}\n${call.thinking ?? "(none kept)"}`);
}

if (command === "run") await run();
else if (command === "seed") seed();
else if (command === "score") await score();
else if (command === "redescribe") await redescribe();
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
