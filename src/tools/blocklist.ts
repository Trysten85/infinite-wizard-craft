// Scan the game's own text for blocklisted proper nouns.
//   npm run blocklist
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { loadBlocklist } from "../server/blocklist";
import { openStore } from "../server/store";

const root = process.cwd();
const blocklist = loadBlocklist(join(root, "Blocklist.md"));
if (blocklist.size === 0) {
  console.log("Blocklist.md not found or empty. Nothing to check against.");
  process.exit(0);
}

// The raw SRD download is never shown to players or the model, so it is skipped.
const SKIP = join(root, "data/srd/source");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const path = join(dir, item.name);
    if (path === SKIP) return [];
    return item.isDirectory() ? files(path) : [path];
  });
}

let hits = 0;
for (const path of [...files(join(root, "data")), ...files(join(root, "prompts"))]) {
  for (const [index, line] of readFileSync(path, "utf8").split("\n").entries()) {
    const found = blocklist.find(line);
    if (found.length === 0) continue;
    hits++;
    console.log(`${relative(root, path)}:${index + 1}  ${found.join(", ")}`);
  }
}

const dbPath = join(root, "var/game.db");
if (existsSync(dbPath)) {
  const store = openStore(dbPath);
  for (const entry of store.listEntries()) {
    const found = blocklist.find(`${entry.name}. ${entry.description}`);
    if (found.length === 0) continue;
    hits++;
    console.log(`cached entry "${entry.id}"  ${found.join(", ")}`);
  }
  store.close();
}

console.log(hits === 0 ? `No blocklisted terms found (${blocklist.size} terms checked).` : `${hits} hits.`);
