import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { createOllamaClient } from "./ollama";
import type { LlmClient } from "./types";

// The two kinds of writing the game asks of the model. A combination is waited on by the player,
// so it gets less thinking. An event is written out of sight, so it can take longer.
// "naming" is the one call in a combination that decides what the thing is. It has its own effort
// level because that is where thinking harder pays, and the rest of a combination is quick work.
export type ModelJob = "combos" | "naming" | "events";

const effortSchema = z.enum(["low", "medium", "high"]);
const modelConfigSchema = z.strictObject({
  // The host PC's address on the VirtualBox host-only network.
  url: z.url(),
  model: z.string().min(1),
  // How hard a reasoning model thinks for each job. Null for a model that does not reason.
  effort: z.strictObject({ combos: effortSchema.nullable(), naming: effortSchema.nullable(), events: effortSchema.nullable() }),
  // How long Ollama keeps the model loaded after a call, so the next one does not wait for it.
  keepAlive: z.string().min(1),
  timeoutSeconds: z.strictObject({ combos: z.number().positive(), events: z.number().positive() }),
  // How writing done out of sight gives way to a call a player is waiting on. See turns.ts.
  background: z.strictObject({ quietSeconds: z.number().min(0), giveWayTimes: z.number().int().min(0) }),
  // How the overnight bake (npm run bake) shares the PC. See src/server/bakePace.ts.
  bake: z.strictObject({
    // The share of the time it works. The rest of the time it rests: 0.5 is half and half.
    share: z.number().gt(0).max(1),
    // How long it works at a stretch before resting.
    workMinutes: z.number().positive(),
    // Whether it tells Ollama to let go of the model while it rests, freeing the video memory.
    unloadWhileResting: z.boolean(),
    // How long the game must have left the model alone before the bake carries on.
    quietMinutes: z.number().min(0),
    // How hard the model thinks when it ranks its own candidates, and how long that may take.
    rankEffort: effortSchema.nullable(),
    rankTimeoutSeconds: z.number().positive(),
  }),
});
export type ModelConfig = z.infer<typeof modelConfigSchema>;

// Reads config/model.json. OLLAMA_URL and OLLAMA_MODEL override it for one run. The effort levels
// belong to the model named in the file, so a different model is sent none.
export function readModelConfig(root: string, env: Record<string, string | undefined> = process.env): ModelConfig {
  const file = modelConfigSchema.parse(JSON.parse(readFileSync(join(root, "config/model.json"), "utf8")));
  const model = env.OLLAMA_MODEL || file.model;
  return {
    ...file,
    url: env.OLLAMA_URL || file.url,
    model,
    effort: model === file.model ? file.effort : { combos: null, naming: null, events: null },
  };
}

export function createModelClient(config: ModelConfig, job: ModelJob): LlmClient {
  return createOllamaClient({
    baseUrl: config.url,
    model: config.model,
    think: config.effort[job] ?? undefined,
    keepAlive: config.keepAlive,
    timeoutMs: config.timeoutSeconds[job === "events" ? "events" : "combos"] * 1000,
  });
}
