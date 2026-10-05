import { comboDraftSchema, type Balance, type ComboDraft, type GameEntry } from "../shared/schema";
import { generateValidated } from "./llm/generate";
import type { LlmClient } from "./llm/types";
import type { ModelCall } from "./store";

// Writes the words for a combo nobody has made before. `reject` lets the caller apply game rules.
export type ComboGenerator = (
  a: GameEntry,
  b: GameEntry,
  reject: (draft: ComboDraft) => string | null,
) => Promise<ComboDraft>;

function describe(entry: GameEntry): string {
  return `${entry.name} (${entry.kind}; tags: ${entry.tags.join(", ")}): ${entry.description}`;
}

export function createComboGenerator(deps: {
  client: LlmClient;
  log: (call: ModelCall) => void;
  voice: string;
  tags: string[];
  balance: Balance;
}): ComboGenerator {
  const schema = comboDraftSchema(deps.tags);
  const system = [
    deps.voice.trim(),
    "You name and describe the single thing made when two things are combined.",
    "The result is a substance, material, creature, object, or natural force. It is not a spell.",
    "Name: one to three words, a common noun, no titles or proper names.",
    "Description: one or two short sentences.",
    "Tags: one to four from the allowed list that honestly fit.",
  ].join("\n");

  return (a, b, reject) =>
    generateValidated(deps.client, deps.log, {
      purpose: "combo",
      system,
      prompt: `Combine these two:\n1. ${describe(a)}\n2. ${describe(b)}`,
      schema,
      reject,
      maxAttempts: deps.balance.generation.maxAttempts,
      temperature: deps.balance.generation.temperature,
    });
}
