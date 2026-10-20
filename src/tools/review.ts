// A keyboard tool for reviewing baked pairs, about five seconds a row. It shows the pair and the
// result, never the description, so the verdict is on the answer and not on how nicely it is told.
//   npm run review
// Keys:  y keep   n reject (then a failure, then five alternatives)   x nothing happens
//        1-5 pick an alternative   c type your own result   t add a note (a joke goes here)
//        s skip   q quit
// Each verdict is saved as it is made. Run `npm run bake -- redescribe` afterwards to write the
// descriptions of the results you fixed, then restart the server.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emitKeypressEvents, createInterface } from "node:readline";
import { z } from "zod";
import { approvedExamples } from "../server/comboContext";
import { approvedRowSchema, heldOutSchema } from "../server/bakeSeed";
import { flagsFor, nameUses } from "../server/bakeTriage";
import { loadBlocklist } from "../server/blocklist";
import { comboRules } from "../server/combiner";
import { BAKED_FILE, loadGameData, readOptional } from "../server/gameData";
import { createModelClient, readModelConfig } from "../server/llm/config";
import { canonicalName } from "../server/names";
import { proposeAlternatives, type Alternative } from "../server/reviewAlternatives";
import { buildQueue, decide, FAILURE_KEYS, progressLine, type Decision, type QueueItem } from "../server/reviewQueue";
import { bakedComboSchema, comboKey, slugify, type BakedCombo, type BakeFailure } from "../shared/schema";

const root = process.cwd();
const at = (path: string) => join(root, path);
const SAMPLE = 50;
const logFile = at("var/bake/round2/review.jsonl");
mkdirSync(at("var/bake/round2"), { recursive: true });

const drafts = (): BakedCombo[] => readOptional(at(BAKED_FILE), z.array(bakedComboSchema));
const saveDrafts = (rows: BakedCombo[]) => writeFileSync(at(BAKED_FILE), `[\n${rows.map((row) => `  ${JSON.stringify(row)}`).join(",\n")}\n]\n`);

const data = loadGameData(root, { baked: false });
const settings = readModelConfig(root);
const client = createModelClient(settings, "combos");
const voice = readFileSync(at("prompts/voice.md"), "utf8");
const blocklist = loadBlocklist(at("Blocklist.md"));
const rulesFor = comboRules({ data, blocklist });
const approved = existsSync(at("data/approved-combos.json")) ? z.array(approvedRowSchema).parse(JSON.parse(readFileSync(at("data/approved-combos.json"), "utf8"))) : [];
const heldOut = new Set(existsSync(at("data/combo-heldout.json")) ? heldOutSchema.parse(JSON.parse(readFileSync(at("data/combo-heldout.json"), "utf8"))).keys : []);
const nameOf = (id: string) => data.entries.get(id)?.name ?? id;
const tagIds = new Set([...data.tags.values()].filter((tag) => tag.assignedBy === "model").map((tag) => tag.id));

// ---- the keyboard ----
emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const waiting: ((key: string) => void)[] = [];
process.stdin.on("keypress", (text: string | undefined, key: { name?: string; ctrl?: boolean }) => {
  if (key.ctrl && key.name === "c") process.exit(130);
  waiting.shift()?.(text ?? key.name ?? "");
});
const key = (): Promise<string> => new Promise((resolve) => waiting.push(resolve));
async function line(prompt: string): Promise<string> {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => rl.question(prompt, resolve));
  rl.close();
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  return answer.trim();
}
const say = (text = "") => console.log(text);

// ---- one pair ----
const uses = () => nameUses(drafts());
const context = {
  words: data.words,
  banned: data.banned,
  overused: data.overused,
  maxSentences: data.balance.generation.maxSentences,
  nameCap: data.balance.generation.bakeNameCap,
  vouched: (name: string) => data.storybook.some((item) => slugify(item.name) === slugify(name)),
  nameOf,
};

async function alternativesFor(row: BakedCombo, turnedDown: string[]): Promise<Alternative[]> {
  const [a, b] = row.inputs.map((id) => data.entries.get(id)!) as [NonNullable<ReturnType<typeof data.entries.get>>, NonNullable<ReturnType<typeof data.entries.get>>];
  say("  asking the model for five alternatives...");
  try {
    const shown = approvedExamples(data.entries, approved, heldOut)
      .filter((example) => example.inputs.some((name) => [a.name, b.name].includes(name)))
      .slice(0, 6)
      .map((example) => `${example.inputs[0]} + ${example.inputs[1]} = ${example.result}`);
    return await proposeAlternatives({ client, log: () => {}, voice, a, b, avoid: turnedDown, rules: rulesFor(a, b), examples: shown });
  } catch (err) {
    say(`  the model could not be reached or gave nothing usable (${err instanceof Error ? err.message : err}). Type your own with c.`);
    return [];
  }
}

function show(item: QueueItem, index: number, queue: QueueItem[]): void {
  const { row } = item;
  const flags = flagsFor(row, uses().get(slugify(row.name)) ?? 0, context);
  say("\n" + "─".repeat(60));
  say(progressLine(index, queue));
  say(`\n  ${nameOf(row.inputs[0])} + ${nameOf(row.inputs[1])}`);
  say(`  = ${row.name}   [${row.tags.join(", ") || "no tags"}]${row.sense !== null ? `   model mark ${row.sense}` : ""}`);
  if (row.reason) say(`  its reason: ${row.reason}`);
  if (flags.length > 0) say(`  flags: ${flags.join("; ")}`);
  if (row.notes) say(`  note: ${row.notes}`);
}

const save = (item: QueueItem, decision: Decision, name: string): void => {
  const k = comboKey(...item.row.inputs);
  saveDrafts(drafts().map((row) => (comboKey(...row.inputs) === k ? decide(row, decision) : row)));
  appendFileSync(logFile, `${JSON.stringify({ at: new Date().toISOString(), pair: k, was: name, group: item.group, decision })}\n`);
};

async function chooseFailure(): Promise<BakeFailure | null> {
  say("  what is wrong with it?  " + FAILURE_KEYS.map(([k, failure]) => `${k} ${failure}`).join("   ") + "   (any other key: cancel)");
  const pressed = await key();
  return FAILURE_KEYS.find(([k]) => k === pressed)?.[1] ?? null;
}

// The five alternatives, and what to do with them. Returns the decision, or null to leave the row.
async function pickAlternative(item: QueueItem, failure: BakeFailure | null, note?: string): Promise<Decision | null> {
  let options = await alternativesFor(item.row, [item.row.name]);
  for (;;) {
    options.forEach((option, i) => say(`   ${i + 1}  ${option.name}   (${option.why})`));
    say("  1-5 pick   c own result   r reject (no fix)   x nothing happens   m more   s skip");
    const pressed = await key();
    const picked = options[Number(pressed) - 1];
    if (picked) return { kind: "alternative", name: canonicalName(picked.name, data.aliases), ...(failure ? { failure } : {}), ...(note ? { note } : {}) };
    if (pressed === "c") {
      const typed = await line("  your result: ");
      if (typed) return { kind: "alternative", name: canonicalName(typed, data.aliases), ...(failure ? { failure } : {}), ...(note ? { note } : {}) };
    } else if (pressed === "r") return { kind: "reject", failure: failure ?? "attractor", ...(note ? { note } : {}) };
    else if (pressed === "x") return { kind: "nothing", ...(note ? { note } : {}) };
    else if (pressed === "m") options = await alternativesFor(item.row, [item.row.name, ...options.map((option) => option.name)]);
    else if (pressed === "s") return null;
  }
}

async function review(item: QueueItem, index: number, queue: QueueItem[]): Promise<"next" | "quit"> {
  const name = item.row.name;
  show(item, index, queue);
  let note: string | undefined;
  if (item.group === "confirm-tags") {
    say("  y confirm these tags   e edit tags   s skip   q quit");
  } else if (item.group === "alternatives") {
    const decision = await pickAlternative(item, null);
    if (decision) save(item, decision, name);
    return "next";
  } else {
    say("  y keep   n reject   x nothing happens   c own result   t note   s skip   q quit");
  }
  for (;;) {
    const pressed = await key();
    if (pressed === "q") return "quit";
    if (pressed === "s") return "next";
    if (pressed === "t") {
      note = (await line("  note: ")) || note;
      continue;
    }
    if (item.group === "confirm-tags") {
      if (pressed === "y") return (save(item, { kind: "tags", tags: item.row.tags }, name), "next");
      if (pressed === "e") {
        const tags = (await line(`  tags, comma separated, from: ${[...tagIds].join(" ")}\n  > `)).split(",").map((tag) => tag.trim()).filter(Boolean);
        const bad = tags.filter((tag) => !tagIds.has(tag));
        if (bad.length > 0 || tags.length === 0 || tags.length > data.balance.generation.maxTags) say(`  not saved: ${bad.length > 0 ? `${bad.join(", ")} is not a tag` : `give 1 to ${data.balance.generation.maxTags} tags`}.`);
        else return (save(item, { kind: "tags", tags }, name), "next");
      }
      continue;
    }
    if (pressed === "y") return (save(item, { kind: "keep" }, name), "next");
    if (pressed === "x") return (save(item, { kind: "nothing", ...(note ? { note } : {}) }, name), "next");
    if (pressed === "c") {
      const typed = await line("  your result: ");
      if (typed) return (save(item, { kind: "alternative", name: canonicalName(typed, data.aliases), ...(note ? { note } : {}) }, name), "next");
    }
    if (pressed === "n") {
      const failure = await chooseFailure();
      if (!failure) continue;
      const decision = await pickAlternative(item, failure, note);
      if (decision) save(item, decision, name);
      return "next";
    }
  }
}

const queue = buildQueue(drafts(), { heldOut, tierOf: (id) => data.entries.get(id)?.tier ?? 2, sample: SAMPLE });
// Rows already given a verdict this sitting are not asked again: the queue is built from what is saved.
say(`${queue.length} pairs to review.`);
for (let index = 0; index < queue.length; index++) {
  if ((await review(queue[index]!, index, queue)) === "quit") break;
}
try {
  loadGameData(root);
  say("\nSaved. Run `npm run bake -- redescribe` for the results you fixed, then restart the server.");
} catch (err) {
  say(`\nThe game would not start with these rows:\n${err instanceof Error ? err.message : err}`);
}
process.exit(0);
