import type { LlmClient, LlmRequest } from "./types";

// A stand-in model for tests. It replays the given responses in order and records what it was asked.
export function createFakeClient(responses: (string | Error)[]): LlmClient & { requests: LlmRequest[] } {
  const queue = [...responses];
  const requests: LlmRequest[] = [];
  return {
    model: "fake",
    requests,
    async complete(request) {
      requests.push(request);
      const next = queue.shift();
      if (next === undefined) throw new Error("fake model has no responses left");
      if (next instanceof Error) throw next;
      return { text: next, promptTokens: 10, completionTokens: 5 };
    },
  };
}
