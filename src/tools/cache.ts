// Review and delete cached combos.
//   npm run cache -- list
//   npm run cache -- delete fire+mud
//   npm run cache -- calls
import { existsSync } from "node:fs";
import { join } from "node:path";
import { openStore } from "../server/store";

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
} else {
  console.log("Usage: npm run cache -- list | delete <key> | calls");
}
store.close();
