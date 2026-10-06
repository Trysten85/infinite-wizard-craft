import { comboDraftSchema, type Balance, type ComboDraft, type GameEntry, type Tag } from "../shared/schema";
import { generateValidated } from "./llm/generate";
import type { LlmClient } from "./llm/types";
import type { ModelCall } from "./store";
import { createVoiceCheck } from "./voice";

// Writes the words for a combo nobody has made before. `reject` lets the caller apply game rules.
export type ComboGenerator = (
  a: GameEntry,
  b: GameEntry,
  reject: (draft: ComboDraft) => string | null,
) => Promise<ComboDraft>;

function describe(entry: GameEntry): string {
  const tags = entry.tags.length > 0 ? `; tags: ${entry.tags.join(", ")}` : "";
  return `${entry.name} (${entry.kind}${tags}): ${entry.description}`;
}

export function createComboGenerator(deps: {
  client: LlmClient;
  log: (call: ModelCall) => void;
  voice: string;
  tags: Iterable<Tag>;
  balance: Balance;
}): ComboGenerator {
  const tags = [...deps.tags];
  const schema = comboDraftSchema(tags);
  const voiceCheck = createVoiceCheck(deps.voice);
  const tagList = tags
    .filter((tag) => tag.assignedBy === "model")
    .map((tag) => `- ${tag.id}: ${tag.meaning}`)
    .join("\n");
  const system = [
    deps.voice.trim(),
    "You name and describe the single thing made when two things are combined.",
    "The result is an ordinary, real thing: a material, a place, a kind of weather, a food, a tool, a plant, or an animal. It is not a spell.",
    "Name: the plainest everyday word for it, the one a child would say. One word if you can, two at most.",
    "The name must be a real, common word. Never invent a word, never join two words into a new one, and never give it a grand or magical-sounding name.",
    "Examples of plain names: Water + Sand = Beach. Fire + Fire = Bonfire. Air + Air = Wind. Earth + Earth = Hill. Water + Water = Pond.",
    "Steam + Air = Cloud. Mud + Fire = Brick. Metal + Tree = Axe. Tree + Tree = Forest. Sand + Sand = Desert.",
    "The humor belongs in the description, never in the name.",
    "Description: one or two short sentences.",
    "Tags: say what the result is made of or plainly does. Most results need one or two. Choosing none is fine.",
    "Do not add a tag because it might loosely apply. A tag must match its meaning below.",
    "missingTag: if the most obvious word for the result is not in the list, give that one plain word. Otherwise null.",
    "",
    "Tags and their meanings:",
    tagList,
  ].join("\n");

  return (a, b, reject) =>
    generateValidated(deps.client, deps.log, {
      purpose: "combo",
      system,
      prompt: `Combine these two:\n1. ${describe(a)}\n2. ${describe(b)}`,
      schema,
      reject: (draft) => reject(draft) ?? voiceCheck(draft.description, draft.name),
      maxAttempts: deps.balance.generation.maxAttempts,
      temperature: deps.balance.generation.temperature,
    });
}
