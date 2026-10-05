import { z } from "zod";
import type { ModelCall } from "../store";
import type { LlmClient } from "./types";

export class GenerationError extends Error {}

export type GenerateOptions<T> = {
  purpose: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  // Rules the schema can't express. Return a reason to reject the output, or null to accept it.
  reject?: (value: T) => string | null;
  maxAttempts: number;
  temperature: number;
};

// Calls the model with schema-constrained output, validates the result, and rerolls on failure.
// Every call is logged, whether it worked or not.
export async function generateValidated<T>(
  client: LlmClient,
  log: (call: ModelCall) => void,
  options: GenerateOptions<T>,
): Promise<T> {
  const jsonSchema = z.toJSONSchema(options.schema);
  let lastReason = "";

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    const prompt = lastReason
      ? `${options.prompt}\n\nYour previous answer was rejected: ${lastReason} Give a different answer.`
      : options.prompt;
    const started = performance.now();
    let promptTokens = 0;
    let completionTokens = 0;
    let failure: string | null = null;
    let value: T | undefined;

    try {
      const completion = await client.complete({
        system: options.system,
        prompt,
        jsonSchema,
        temperature: options.temperature,
      });
      promptTokens = completion.promptTokens;
      completionTokens = completion.completionTokens;
      const parsed = options.schema.safeParse(JSON.parse(completion.text));
      if (!parsed.success) {
        failure = `It did not match the schema (${z.prettifyError(parsed.error)}).`;
      } else {
        failure = options.reject?.(parsed.data) ?? null;
        value = parsed.data;
      }
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err);
    }

    log({
      purpose: options.purpose,
      model: client.model,
      promptTokens,
      completionTokens,
      latencyMs: performance.now() - started,
      ok: failure === null,
      error: failure ?? undefined,
    });
    if (failure === null) return value as T;
    lastReason = failure;
  }

  throw new GenerationError(
    `${options.purpose} failed after ${options.maxAttempts} attempts. Last problem: ${lastReason}`,
  );
}
