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
      // A reasoning model also returns its thinking, separately. Only the answer is used by the
      // game. The thinking is passed along for anyone who wants to keep it.
      const body = (await response.json()) as {
        message: { content: string; thinking?: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };
      return {
        text: body.message.content,
        ...(body.message.thinking ? { thinking: body.message.thinking } : {}),
        promptTokens: body.prompt_eval_count ?? 0,
        completionTokens: body.eval_count ?? 0,
      };
    },
  };
}

// Tells Ollama to let go of a model now, freeing the video memory it holds. The next call loads
// it again, which takes a little while. Failing to reach Ollama is not an error worth stopping for.
export async function unloadModel(baseUrl: string, model: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ model, keep_alive: 0 }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
