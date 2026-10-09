import type { LlmClient, LlmCompletion, LlmRequest } from "./types";

export type ThinkLevel = "low" | "medium" | "high";

// The JSON body for one chat call. Reasoning models take a `think` level; other models must not be sent one.
// `keepAlive` is how long Ollama keeps the model loaded afterwards, such as "30m".
export function chatBody(model: string, request: LlmRequest, extras: { think?: ThinkLevel; keepAlive?: string } = {}) {
  return {
    model,
    stream: false,
    format: request.jsonSchema,
    options: { temperature: request.temperature },
    ...(extras.think ? { think: extras.think } : {}),
    ...(extras.keepAlive ? { keep_alive: extras.keepAlive } : {}),
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: request.prompt },
    ],
  };
}

export function createOllamaClient(options: { baseUrl: string; model: string; timeoutMs?: number; think?: ThinkLevel; keepAlive?: string }): LlmClient {
  const { baseUrl, model, timeoutMs = 60_000, think, keepAlive } = options;
  return {
    model,
    async complete(request: LlmRequest): Promise<LlmCompletion> {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: request.signal ? AbortSignal.any([AbortSignal.timeout(timeoutMs), request.signal]) : AbortSignal.timeout(timeoutMs),
        body: JSON.stringify(chatBody(model, request, { think, keepAlive })),
      });
      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
      }
      // A reasoning model also returns its thinking, separately. Only the answer is used.
      const body = (await response.json()) as {
        message: { content: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };
      return {
        text: body.message.content,
        promptTokens: body.prompt_eval_count ?? 0,
        completionTokens: body.eval_count ?? 0,
      };
    },
  };
}
