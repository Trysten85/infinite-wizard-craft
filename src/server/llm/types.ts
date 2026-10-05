// Every model call in the game goes through this interface, so the model can be swapped.
export type LlmRequest = {
  system: string;
  prompt: string;
  // JSON schema the runtime must constrain the output to.
  jsonSchema: unknown;
  temperature: number;
};

export type LlmCompletion = {
  text: string;
  promptTokens: number;
  completionTokens: number;
};

export interface LlmClient {
  readonly model: string;
  complete(request: LlmRequest): Promise<LlmCompletion>;
}
