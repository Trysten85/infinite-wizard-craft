import type { LlmClient, LlmCompletion, LlmRequest } from "./types";

export type ThinkLevel = "low" | "medium" | "high";

// The JSON body for one chat call. Reasoning models take a `think` level; other models must not be sent one.
export function chatBody(model: string, request: LlmRequest, think?: ThinkLevel) {
  return {
    model,
    stream: false,
    format: request.jsonSchema,
    options: { temperature: request.temperature },
    ...(think ? { think } : {}),
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: request.prompt },
    ],
  };
}

export function createOllamaClient(options: { baseUrl: string; model: string; timeoutMs?: number; think?: ThinkLevel }): LlmClient {
  const { baseUrl, model, timeoutMs = 60_000, think } = options;
  return {
    model,
    async complete(request: LlmRequest): Promise<LlmCompletion> {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify(chatBody(model, request, think)),
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
