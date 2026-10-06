import { serve } from "@hono/node-server";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "./app";
import { loadBlocklist } from "./blocklist";
import { createCombiner } from "./combiner";
import { createComboGenerator } from "./comboGenerator";
import { loadGameData } from "./gameData";
import { createOllamaClient } from "./llm/ollama";
import { openStore } from "./store";

const root = process.cwd();
const port = Number(process.env.PORT ?? 3001);
// The host PC's address on the VirtualBox host-only network.
const ollamaUrl = process.env.OLLAMA_URL ?? "http://192.168.56.1:11434";
const ollamaModel = process.env.OLLAMA_MODEL ?? "gemma3:12b";

const data = loadGameData(root);
mkdirSync(join(root, "var"), { recursive: true });
const store = openStore(join(root, "var/game.db"));
const client = createOllamaClient({ baseUrl: ollamaUrl, model: ollamaModel });
const generate = createComboGenerator({
  client,
  log: store.logModelCall,
  voice: readFileSync(join(root, "prompts/voice.md"), "utf8"),
  tags: data.tags.values(),
  balance: data.balance,
});
const blocklist = loadBlocklist(join(root, "Blocklist.md"));
if (blocklist.size === 0) console.warn("Blocklist.md not found or empty: generated names are not being checked against it.");
const app = createApp(createCombiner({ data, store, generate, blocklist }));

serve({ fetch: app.fetch, port }, () => {
  console.log(`Game server on http://localhost:${port} (model ${ollamaModel} at ${ollamaUrl})`);
});
