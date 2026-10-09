import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { createOllamaClient } from "./ollama";
import type { LlmClient } from "./types";

// The two kinds of writing the game asks of the model. A combination is waited on by the player,
// so it gets less thinking. An event is written out of sight, so it can take longer.
export type ModelJob = "combos" | "events";

const effortSchema = z.enum(["low", "medium", "high"]);
const modelConfigSchema = z.strictObject({
  // The host PC's address on the VirtualBox host-only network.
  url: z.url(),
  model: z.string().min(1),
  // How hard a reasoning model thinks for each job. Null for a model that does not reason.
  effort: z.strictObject({ combos: effortSchema.nullable(), events: effortSchema.nullable() }),
  // How long Ollama keeps the model loaded after a call, so the next one does not wait for it.
  keepAlive: z.string().min(1),
  timeoutSeconds: z.strictObject({ combos: z.number().positive(), events: z.number().positive() }),
  // How writing done out of sight gives way to a call a player is waiting on. See turns.ts.
  background: z.strictObject({ quietSeconds: z.number().min(0), giveWayTimes: z.number().int().min(0) }),
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
    effort: model === file.model ? file.effort : { combos: null, events: null },
  };
}

export function createModelClient(config: ModelConfig, job: ModelJob): LlmClient {
  return createOllamaClient({
    baseUrl: config.url,
    model: config.model,
    think: config.effort[job] ?? undefined,
    keepAlive: config.keepAlive,
    timeoutMs: config.timeoutSeconds[job] * 1000,
  });
}
