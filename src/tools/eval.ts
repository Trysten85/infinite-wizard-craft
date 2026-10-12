// Compare models on the game's real prompts. Nothing in the game or the saved game is changed.
//   npm run eval -- gemma3:12b gpt-oss:20b
// Each model must already be pulled in Ollama. A side-by-side report is written under var/eval/.
// Add "@low", "@medium" or "@high" to a model name to set a reasoning model's effort (gpt-oss
// defaults to low). The word "game" stands for the model exactly as the game runs it, from
// config/model.json: one effort for combinations and another for events.
//   npm run eval -- game
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadBlocklist } from "../server/blocklist";
import { createCombiner } from "../server/combiner";
import { createMadeFrom } from "../server/comboContext";
import { createComboGenerator } from "../server/comboGenerator";
import { createDay } from "../server/day";
import { findInventedNames, renderEvalReport, type EvalCase, type EvalRun } from "../server/evalReport";
import { createEvents } from "../server/events/service";
import { checkParting, createModelEventWriter, type PartingQuestion } from "../server/events/writer";
import { loadGameData } from "../server/gameData";
import { createModelClient, readModelConfig } from "../server/llm/config";
import { createOllamaClient, type ThinkLevel } from "../server/llm/ollama";
import { createProgress } from "../server/progress";
import { openStore } from "../server/store";
import { slugify, type EventView, type GameEntry } from "../shared/schema";

const root = process.cwd();
const settings = readModelConfig(root);
const baseUrl = settings.url;
const AS_PLAYED = "game";
const data = loadGameData(root);
const voice = readFileSync(join(root, "prompts/voice.md"), "utf8");
const blocklist = loadBlocklist(join(root, "Blocklist.md"));
const PLAYER = "eval";

const ORDINARY: [string, string][] = [["sand", "water"], ["air", "air"], ["earth", "earth"], ["iron", "tree"], ["salt", "food"], ["animal", "water"], ["fire", "metal"], ["glass", "water"]];
// `none` marks the pairs where nothing on the storybook menu fits, so the right answer is an ordinary thing.
const MAGICAL: { pair: [string, string]; none?: boolean }[] = [
  { pair: ["clay", "life"] },
  { pair: ["bone-dust", "life"] },
  { pair: ["fire", "life"] },
  { pair: ["tree", "life"] },
  { pair: ["person", "death"] },
  { pair: ["iron", "light"], none: true },
  { pair: ["salt", "shadow"], none: true },
  { pair: ["life", "crystal"], none: true },
];
const EVENT_SEEDS = ["not_my_mess", "unhappy_someone", "town_needs"];
const visitor = { name: "Pim Kettlebrook", role: "neighbor", traits: ["shy", "fussy"] };
const PARTINGS: PartingQuestion[] = [
  { kind: "request", name: "Glass", madeFrom: "Sand and Fire", person: visitor, ending: "Pim felt much better about the whole thing. The player helped." },
  { kind: "hint", name: "Feather", madeFrom: "Animal and Air", person: visitor, ending: "Pim felt much better about the whole thing. The player helped." },
  { kind: "gift", name: "Iron", madeFrom: "Metal and Earth", person: visitor, ending: "Pim felt much better about the whole thing. The player helped." },
];
// A tea shop owner who knows two everyday spells, with enough on the shelf for every pair above.
const OWNED = ["light", "mud", "life", "shadow", "death", "tree", "spellbook", "transmutation", "spell-mending", "spell-prestidigitation", "person", "steam", "herb", "tea", "metal", "silver", "merchant", "tea-shop-owner", "sand", "salt", "iron", "glass", "crystal", "animal", "food", "bone-dust"];
const CLAY: GameEntry = { id: "clay", name: "Clay", kind: "material", description: "Soft earth that holds a shape.", tags: ["mineral"], affinity: ["earth"], tier: 0, source: "generated", depth: 2, xp: 10 };

const failure = (err: unknown) => `FAILED: ${(err instanceof Error ? err.message : String(err)).split("\n")[0]}`;
const showBeat = (view: EventView) =>
  [view.scene, "", ...view.responses.map((response) => `- (${response.type}${response.spell ? `, using ${response.spell.name}` : ""}) ${response.text}`)].join("\n");

async function runModel(spec: string): Promise<EvalRun> {
  const [model, effort] = (spec === AS_PLAYED ? [settings.model, undefined] : spec.split("@")) as [string, ThinkLevel | undefined];
  const think = effort ?? (model.startsWith("gpt-oss") ? "low" : undefined);
  const one = createOllamaClient({ baseUrl, model, timeoutMs: 300_000, think });
  const client = spec === AS_PLAYED ? createModelClient(settings, "events") : one;
  const store = openStore(":memory:");
  const generate = createComboGenerator({ client: spec === AS_PLAYED ? createModelClient(settings, "combos") : one, log: store.logModelCall, voice, tags: data.tags.values(), balance: data.balance, storybook: data.storybook, reservedIds: new Set(data.entries.keys()), examples: data.comboExamples, madeFrom: createMadeFrom(data, store), exists: (name) => store.getEntry(slugify(name)) !== undefined });
  const combiner = createCombiner({ data, store, generate, blocklist });
  const progress = createProgress({ data, store, listDiscovered: combiner.listDiscovered });
  const writer = createModelEventWriter({ client, log: store.logModelCall, voice, blocklist });
  // A fixed "random" keeps both models on the same stakes and the spell look always on.
  const events = createEvents({ data, store, progress, day: createDay({ data, store, progress }), listDiscovered: combiner.listDiscovered, writer, random: () => 0.1 });
  for (const id of OWNED) store.addDiscovery(PLAYER, id);
  for (const id of ["spell-mending", "spell-prestidigitation"]) store.addLearned(PLAYER, id);
  store.saveGenerated("eval+clay", "mud", "fire", CLAY);
  store.addDiscovery(PLAYER, "clay");
  store.addLedger(PLAYER, 500, "quest", "eval-grant");

  const started = Date.now();
  const cases: EvalCase[] = [];
  const eventText: string[] = [];
  const people: string[] = [];
  const name = (id: string) => data.entries.get(id)?.name ?? (id === "clay" ? "Clay" : id);

  for (const [a, b] of ORDINARY) {
    process.stdout.write(".");
    const title = `${name(a)} + ${name(b)}`;
    try {
      const { entry } = await combiner.combine(PLAYER, a, b);
      // An ordinary pair should never come out as a storybook creature.
      cases.push({ set: "Ordinary combinations", title, output: `**${entry.name}.** ${entry.description}  \nTags: ${entry.tags.join(", ") || "none"}`, correct: !entry.wonder });
    } catch (err) {
      cases.push({ set: "Ordinary combinations", title, output: failure(err) });
    }
  }
  for (const { pair, none } of MAGICAL) {
    process.stdout.write(".");
    const title = `${name(pair[0])} + ${name(pair[1])}${none ? "  (nothing on the menu fits)" : ""}`;
    try {
      const { entry } = await combiner.combine(PLAYER, ...pair);
      const kind = entry.wonder ? "storybook" : "ordinary";
      cases.push({ set: "Magical combinations", title, output: `**${entry.name}** (${kind}). ${entry.description}`, ...(none ? { correct: !entry.wonder } : {}) });
    } catch (err) {
      cases.push({ set: "Magical combinations", title, output: failure(err) });
    }
  }
  for (const seed of EVENT_SEEDS) {
    process.stdout.write(".");
    const title = data.eventSeeds.find((item) => item.id === seed)!.premise;
    try {
      const arrival = (await events.test(PLAYER, seed)).event!;
      const reaction = await events.respond(PLAYER, "generous");
      const heart = reaction.next!;
      const helpful = heart.responses.find((response) => ["skilled", "fair", "generous"].includes(response.type))!;
      const ending = await events.respond(PLAYER, helpful.type);
      const left = ending.request ? `a request for ${ending.request.entry.name}` : ending.hint ? `a hint about ${ending.hint.entry.name}` : ending.gift ? `a gift of ${ending.gift.name}` : "nothing";
      people.push(arrival.person.name);
      eventText.push(arrival.scene, heart.scene, ending.outcome, ...arrival.responses.map((r) => r.text), ...heart.responses.map((r) => r.text));
      cases.push({
        set: "Events",
        title,
        output: [
          `*${arrival.person.name}, ${arrival.person.role}*`,
          "",
          showBeat(arrival),
          "",
          `> You were generous. ${reaction.outcome}`,
          "",
          showBeat(heart),
          "",
          `> You chose the ${helpful.type} response. ${ending.outcome}`,
          "",
          `Left behind: ${left}.`,
        ].join("\n"),
      });
      const spell = heart.responses.find((response) => response.spell);
      cases.push({ set: "Spell look", title, output: spell ? `Offered **${spell.spell!.name}**: ${spell.text}` : "No spell offered." });
    } catch (err) {
      cases.push({ set: "Events", title, output: failure(err) });
    }
  }
  for (const question of PARTINGS) {
    process.stdout.write(".");
    const title = `A ${question.kind}: ${question.name}`;
    const before = store.listModelCalls(1000).filter((call) => call.purpose === "event-parting" && !call.ok).length;
    try {
      const line = await writer.writeParting(question);
      const rerolled = store.listModelCalls(1000).filter((call) => call.purpose === "event-parting" && !call.ok).length - before;
      // Right means it named the thing properly on its first try.
      cases.push({ set: "Parting lines", title, output: line, correct: rerolled === 0 && checkParting(question, line, blocklist) === null });
    } catch (err) {
      cases.push({ set: "Parting lines", title, output: failure(err), correct: false });
    }
  }
  console.log(` ${model} done`);

  const known = [...[...data.entries.values()].map((entry) => entry.name), ...data.storybook.map((item) => item.name), ...people, "Mending", "Prestidigitation"];
  const calls = store.listModelCalls(1000).reverse().map((call) => ({ purpose: call.purpose, ok: call.ok, latencyMs: call.latencyMs, error: call.error }));
  const label = spec === AS_PLAYED ? `${model} as played (${settings.effort.combos ?? "no"} effort for combinations, ${settings.effort.events ?? "no"} for events)` : spec;
  return { model: label, cases, calls, inventedNames: findInventedNames(eventText.join(" "), known), seconds: (Date.now() - started) / 1000 };
}

const models = process.argv.slice(2);
if (models.length === 0) {
  console.log("Usage: npm run eval -- <model> [<model> ...]   for example: npm run eval -- gemma3:12b gpt-oss:20b, or: npm run eval -- game");
  process.exit(0);
}
const installed = await fetch(`${baseUrl}/api/tags`)
  .then((response) => response.json() as Promise<{ models: { name: string }[] }>)
  .then((body) => body.models.map((item) => item.name))
  .catch(() => null);
if (!installed) {
  console.log(`Ollama is not answering at ${baseUrl}.`);
  process.exit(1);
}
const missing = models.map((spec) => (spec === AS_PLAYED ? settings.model : spec.split("@")[0]!)).filter((model) => !installed.includes(model));
if (missing.length > 0) {
  console.log(`Not pulled yet: ${missing.join(", ")}. On the host PC run:`);
  for (const model of missing) console.log(`  ollama pull ${model}`);
  process.exit(1);
}

const runs: EvalRun[] = [];
for (const spec of models) runs.push(await runModel(spec));
const when = new Date().toISOString().slice(0, 16).replace("T", " ");
const dir = join(root, "var/eval", when.replace(/[: ]/g, "-"));
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "report.md"), renderEvalReport(runs, when));
writeFileSync(join(dir, "runs.json"), JSON.stringify(runs, null, 2));
console.log(`Report written to ${join(dir, "report.md")}`);
