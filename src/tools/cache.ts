// Review and delete cached combos.
//   npm run cache -- list
//   npm run cache -- delete fire+mud
//   npm run cache -- calls
//   npm run cache -- revoice     rewrite every cached description in the current voice guide
//   npm run cache -- review      have the model grade every cached combo and list the doubtful ones
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { loadBlocklist } from "../server/blocklist";
import { goesWith } from "../server/cacheReview";
import { createMadeFrom, thingLine } from "../server/comboContext";
import { createComboGrader } from "../server/comboGrader";
import { loadGameData } from "../server/gameData";
import { generateValidated, GenerationError } from "../server/llm/generate";
import { createModelClient, readModelConfig } from "../server/llm/config";
import { createOllamaClient } from "../server/llm/ollama";
import { openStore } from "../server/store";
import { slugify } from "../shared/schema";
import { createVoiceCheck, endsCleanly } from "../server/voice";

const dbPath = join(process.cwd(), "var/game.db");
if (!existsSync(dbPath)) {
  console.log("No cache yet. Run the game first.");
  process.exit(0);
}
const store = openStore(dbPath);
const [command, key] = process.argv.slice(2);

if (command === "list") {
  const combos = store.listCombos();
  if (combos.length === 0) console.log("The cache is empty.");
  for (const combo of combos) {
    const entry = store.getEntry(combo.resultId);
    console.log(`${combo.key}  ->  ${entry?.name ?? combo.resultId}  [${entry?.tags.join(", ")}]`);
    console.log(`    ${entry?.description}`);
  }
} else if (command === "delete" && key) {
  if (store.getCombo(key) === undefined) {
    console.log(`No cached combo "${key}". Use "list" to see the keys.`);
  } else {
    const removed = store.deleteCombo(key);
    console.log(`Deleted combo ${key}.`);
    if (removed.length > 0) console.log(`Removed entries (and anything made from them): ${removed.join(", ")}`);
  }
} else if (command === "calls") {
  for (const call of store.listModelCalls(30).reverse()) {
    const status = call.ok ? "ok  " : "FAIL";
    console.log(
      `${call.at}  ${status}  ${call.purpose}  ${call.latencyMs}ms  ${call.promptTokens}+${call.completionTokens} tokens` +
        (call.error ? `  ${call.error}` : ""),
    );
  }
} else if (command === "review") {
  // Nothing is changed here. The list is for a person to act on, one delete at a time.
  const root = process.cwd();
  const data = loadGameData(root);
  const settings = readModelConfig(root);
  const madeFrom = createMadeFrom(data, store);
  const grade = createComboGrader({
    client: createOllamaClient({ baseUrl: settings.url, model: settings.model, think: settings.effort.combos ? "medium" : undefined, keepAlive: settings.keepAlive, timeoutMs: 90_000 }),
    log: () => {},
  });
  const find = (id: string) => data.entries.get(id) ?? store.getEntry(id);
  const combos = store.listCombos();
  // A fairy-tale name from the storybook list is a real name, whatever the grader makes of it.
  const storybook = new Set(data.storybook.map((item) => slugify(item.name)));
  const invented: string[] = [];
  const doubtful: string[] = [];
  for (const combo of combos) {
    const [a, b, result] = [find(combo.a), find(combo.b), store.getEntry(combo.resultId)];
    if (!a || !b || !result) continue;
    const graded = await grade({ a: thingLine(a, madeFrom(a.id)), b: thingLine(b, madeFrom(b.id)), result: result.name, description: result.description }).catch(() => null);
    if (!graded) continue;
    const realName = graded.realName || storybook.has(result.id);
    process.stdout.write(graded.makesSense && realName ? "." : "?");
    if (graded.makesSense && realName) continue;
    const others = goesWith(combos, combo.key).filter((id) => id !== combo.resultId).map((id) => store.getEntry(id)?.name ?? id);
    const ways = combos.filter((item) => item.resultId === combo.resultId).length;
    (realName ? doubtful : invented).push(
      [
        `${a.name} + ${b.name} = ${result.name}`,
        `    ${graded.why}`,
        ways > 1
          ? `    ${result.name} is made ${ways} ways, so deleting this pair removes only the pair.`
          : `    Deleting it removes ${result.name} from the game and from players' discoveries${others.length > 0 ? `, and with it: ${others.join(", ")}` : ""}.`,
        `    npm run cache -- delete ${combo.key}`,
      ].join("\n"),
    );
  }
  console.log(`\n\nOf ${combos.length} cached combinations, ${invented.length} have a made-up name and ${doubtful.length} more look doubtful.`);
  console.log("The grader is strict and often wrong about sense. Treat the second list as things to look at, not things to delete.");
  if (invented.length > 0) console.log(`\n== Made-up names\n\n${invented.join("\n\n")}`);
  if (doubtful.length > 0) console.log(`\n== Doubtful sense\n\n${doubtful.join("\n\n")}`);
  console.log("\nNothing was changed. Back up var/game.db before deleting anything.");
} else if (command === "revoice") {
  // Names, tags, and recipes stay exactly as they are. Only the wording changes.
  const root = process.cwd();
  // A new backup each run, so an earlier one is never overwritten.
  const backup = join(root, `var/game.before-revoice-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
  copyFileSync(dbPath, backup);
  const data = loadGameData(root);
  const blocklist = loadBlocklist(join(root, "Blocklist.md"));
  const voice = readFileSync(join(root, "prompts/voice.md"), "utf8");
  const voiceCheck = createVoiceCheck(voice);
  const client = createModelClient(readModelConfig(root), "combos");
  const nameOf = (id: string) => data.entries.get(id)?.name ?? store.getEntry(id)?.name ?? id;
  const madeFrom = new Map(store.listCombos().map((combo) => [combo.resultId, `${nameOf(combo.a)} + ${nameOf(combo.b)}`]));
  for (const entry of store.listEntries()) {
    try {
      const { description } = await generateValidated(client, store.logModelCall, {
        purpose: "revoice",
        system: [
          voice.trim(),
          "",
          "Rewrite the description of one thing from a crafting game in the voice above.",
          "One or two short, plain sentences, with a small dry joke in the last few words if one fits.",
          "Keep what the thing is. Do not list its ingredients, do not start with its name, and do not use digits.",
          "The sample lines in the guide show tone only. Never reuse their wording.",
        ].join("\n"),
        prompt: `Name: ${entry.name}\nMade from: ${madeFrom.get(entry.id) ?? "unknown"}\nOld description: ${entry.description}`,
        schema: z.strictObject({ description: z.string().min(1).max(500) }),
        reject: (value) =>
          !endsCleanly(value.description)
            ? "The description stops in the middle of a sentence. Write one or two short, complete sentences."
            : /[0-9!]/.test(value.description)
            ? "The description must not contain digits or exclamation marks."
            : blocklist.find(value.description).length > 0
              ? "The description uses a proper name. Rewrite it without naming any person, place, or group."
              : voiceCheck(value.description, entry.name),
        maxAttempts: 3,
        temperature: data.balance.generation.temperature,
      });
      store.setEntryDescription(entry.id, description);
      console.log(`${entry.name}\n    was: ${entry.description}\n    now: ${description}`);
    } catch (err) {
      if (!(err instanceof GenerationError)) throw err;
      console.log(`${entry.name}: left as it was (the model's rewrites kept failing the checks)`);
    }
  }
  console.log(`\nThe previous cache was saved to ${backup}`);
} else {
  console.log("Usage: npm run cache -- list | delete <key> | calls | revoice");
}
store.close();
