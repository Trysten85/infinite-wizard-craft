import { createHash } from "node:crypto";
import { StopRequested } from "./llm/generate";
import type { LlmClient } from "./llm/types";
import type { ModelCall } from "./store";

// Keeps every model call the bake makes, whole: the prompt, the answer, the model's own
// thinking, and whether the answer passed the game's checks. This is the raw material for
// anything done with the model later.

export type KeptCall = {
  at: string;
  purpose: string;
  model: string;
  effort: string | null;
  temperature: number;
  // The system prompt is long and seldom changes, so it is kept once, under this id.
  systemId: string;
  prompt: string;
  answer: string;
  thinking: string | null;
  promptTokens: number;
  answerTokens: number;
  seconds: number;
  passed: boolean;
  problem: string | null;
};

export function systemIdOf(system: string): string {
  return createHash("sha256").update(system).digest("hex").slice(0, 12);
}

// A recorder sits between the bake and the model. `client` wraps a real client so each call is
// noted as it is made. `log` is handed to generateValidated, which reports on each call just
// after it: that report says whether the answer passed, and the two are joined into one record.
export function createCallRecorder(sink: { call: (call: KeptCall) => void; system: (id: string, text: string) => void }, shouldStop: () => boolean = () => false, pollMs = 500) {
  type Noted = Omit<KeptCall, "purpose" | "passed" | "problem">;
  let noted: Noted | null = null;

  function client(inner: LlmClient, effort: string | null): LlmClient {
    return {
      model: inner.model,
      async complete(request) {
        if (shouldStop()) throw new StopRequested("stopped before a call");
        // A call in progress is cut short as soon as the bake is told to stop.
        const cut = new AbortController();
        const watch = setInterval(() => shouldStop() && cut.abort(), pollMs);
        const began = performance.now();
        const note = (answer: string, thinking: string | null, promptTokens: number, answerTokens: number) => {
          const systemId = systemIdOf(request.system);
          sink.system(systemId, request.system);
          noted = { at: new Date().toISOString(), model: inner.model, effort, temperature: request.temperature, systemId, prompt: request.prompt, answer, thinking, promptTokens, answerTokens, seconds: (performance.now() - began) / 1000 };
        };
        try {
          const done = await inner.complete({ ...request, signal: cut.signal });
          note(done.text, done.thinking ?? null, done.promptTokens, done.completionTokens);
          return done;
        } catch (err) {
          if (cut.signal.aborted) throw new StopRequested("stopped during a call");
          note("", null, 0, 0);
          throw err;
        } finally {
          clearInterval(watch);
        }
      },
    };
  }

  function log(report: ModelCall): void {
    if (!noted) return;
    sink.call({ ...noted, purpose: report.purpose, passed: report.ok, problem: report.error ?? null });
    noted = null;
  }

  return { client, log };
}
