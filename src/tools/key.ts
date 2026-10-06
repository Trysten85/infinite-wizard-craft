// Rewrite the recipe key from the current game data.
//   npm run key
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadGameData } from "../server/gameData";
import { RECIPE_KEY_FILE, renderRecipeKey } from "../server/recipeKey";

const root = process.cwd();
writeFileSync(join(root, RECIPE_KEY_FILE), renderRecipeKey(loadGameData(root)));
console.log(`Wrote ${RECIPE_KEY_FILE}`);
