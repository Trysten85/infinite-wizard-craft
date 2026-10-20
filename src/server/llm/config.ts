import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ModelOff } from "./generate";
import { createOllamaClient } from "./ollama";
import type { LlmClient } from "./types";

// The two kinds of writing the game asks of the model. A combination is waited on by the player,
// so it gets less thinking. An event is written out of sight, so it can take longer.
// "naming" is the one call in a combination that decides what the thing is. It has its own effort
// level because that is where thinking harder pays, and the rest of a combination is quick work.
// "orders" is the order board, written ahead out of sight like events. Its keys are optional and
// fall back to the events ones.
export type ModelJob = "combos" | "naming" | "events" | "orders";

const effortSchema = z.enum(["low", "medium", "high"]);
const modelConfigSchema = z.strictObject({
  // Whether the model is reachable and in use. While false, every call to it throws a reminder
  // ("Hey, fix the model: ..."), the visitor is written by the canned writer, orders and beats
  // keep their plain words, and cached and baked combinations still work. Left out, it is on.
  enabled: z.boolean().default(true),
  // The host PC's address on the VirtualBox host-only network.
  url: z.url(),
  model: z.string().min(1),
  // How hard a reasoning model thinks for each job. Null for a model that does not reason.
  effort: z.strictObject({ combos: effortSchema.nullable(), naming: effortSchema.nullable(), events: effortSchema.nullable(), orders: effortSchema.nullable().optional() }),
  // How long Ollama keeps the model loaded after a call, so the next one does not wait for it.
  keepAlive: z.string().min(1),
  timeoutSeconds: z.strictObject({ combos: z.number().positive(), events: z.number().positive(), orders: z.number().positive().optional() }),
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
    effort: model === file.model ? file.effort : { combos: null, naming: null, events: null, orders: null },
  };
}

// The effort and timeout for a job. Orders take the events ones unless they have their own.
export function settingsFor(config: ModelConfig, job: ModelJob): { think: "low" | "medium" | "high" | undefined; timeoutMs: number } {
  const effort = job === "orders" ? (config.effort.orders === undefined ? config.effort.events : config.effort.orders) : config.effort[job];
  const seconds = job === "orders" ? (config.timeoutSeconds.orders ?? config.timeoutSeconds.events) : config.timeoutSeconds[job === "events" ? "events" : "combos"];
  return { think: effort ?? undefined, timeoutMs: seconds * 1000 };
}

// The reminder shown while the model is off: where it should be, and how to turn it back on.
export function modelOffMessage(config: Pick<ModelConfig, "url" | "model">): string {
  return `Hey, fix the model: it is turned off, so nothing new can be written. It should be ${config.model} at ${config.url}. Start Ollama there, then set "enabled": true in config/model.json and restart the server.`;
}

export function createModelClient(config: ModelConfig, job: ModelJob): LlmClient {
  if (!config.enabled) {
    return {
      model: config.model,
      async complete() {
        throw new ModelOff(modelOffMessage(config));
      },
    };
  }
  return createOllamaClient({ baseUrl: config.url, model: config.model, keepAlive: config.keepAlive, ...settingsFor(config, job) });
}
