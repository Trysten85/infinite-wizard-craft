import type { LlmClient, LlmCompletion, LlmRequest } from "./types";

export function createOllamaClient(options: { baseUrl: string; model: string; timeoutMs?: number }): LlmClient {
  const { baseUrl, model, timeoutMs = 60_000 } = options;
  return {
    model,
    async complete(request: LlmRequest): Promise<LlmCompletion> {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model,
          stream: false,
          format: request.jsonSchema,
          options: { temperature: request.temperature },
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.prompt },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
      }
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
