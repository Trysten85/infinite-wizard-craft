// Review entries that tag poorly, and fix generated ones.
//   npm run tags
//   npm run tags -- set mist utility,area
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadGameData } from "../server/gameData";
import { openStore } from "../server/store";
import { listTagReviews, retagEntry } from "../server/tagReview";

const root = process.cwd();
const data = loadGameData(root);
const dbPath = join(root, "var/game.db");
const store = existsSync(dbPath) ? openStore(dbPath) : undefined;
const [command, id, tagList] = process.argv.slice(2);

if (command === undefined) {
  const reviews = listTagReviews(data, store);
  if (reviews.length === 0) console.log("Nothing needs tagging.");
  for (const { entry, retired, suggestion } of reviews) {
    const origin = entry.source === "generated" ? "generated" : "hand-written";
    const notes = [
      entry.tags.length === 0 ? "no tags" : `tags: ${entry.tags.join(", ")}`,
      retired.length > 0 ? `retired: ${retired.join(", ")}` : "",
      suggestion ? `model wanted: ${suggestion}` : "",
    ].filter(Boolean);
    console.log(`${entry.id}  (${origin})  ${notes.join("  |  ")}`);
    console.log(`    ${entry.description}`);
  }
} else if (command === "set" && id && store) {
  try {
    retagEntry(data, store, id, tagList ? tagList.split(",").filter(Boolean) : []);
    console.log(`Tags for ${id} set to: ${tagList || "(none)"}`);
  } catch (err) {
    console.log(err instanceof Error ? err.message : String(err));
  }
} else if (command === "set" && id) {
  console.log("No cache yet, so there are no generated entries to retag.");
} else {
  console.log("Usage: npm run tags | npm run tags -- set <entry-id> <tag,tag>");
}
store?.close();
