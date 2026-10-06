import { z } from "zod";
import { comboDraftSchema, slugify, type Balance, type ComboDraft, type GameEntry, type Tag } from "../shared/schema";
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

// Code, not the model, decides when magic is in play. A storybook result is only on the table
// when an ingredient is one of the waking forces (Life, Death, Light, Shadow, Mind), a focus, or
// something that itself came out of such a combination. Everything else makes an ordinary thing.
export function isWonderPair(a: GameEntry, b: GameEntry, balance: Balance): boolean {
  const wakes = (entry: GameEntry) => balance.generation.wonderInputs.includes(entry.id) || entry.kind === "focus" || entry.wonder === true;
  return wakes(a) || wakes(b);
}

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
  // The storybook menu, and the ids of hand-written entries, which the menu must not offer.
  storybook?: string[];
  reservedIds?: Set<string>;
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
    "The result is one thing. It is never a spell. The note under each pair says what it should be: follow it.",
    "Name: the plainest word for it, the one a child would know. One word if you can, two at most.",
    "The name must be a real, well-known word. Never invent a word and never join two words into a new one.",
    "The humor belongs in the description, never in the name.",
    "Description: one or two short sentences.",
    "Tags: say what the result is made of or plainly does. Most results need one or two. Choosing none is fine.",
    "Do not add a tag because it might loosely apply. A tag must match its meaning below.",
    "missingTag: if the most obvious word for the result is not in the list, give that one plain word. Otherwise null.",
    "",
    "Tags and their meanings:",
    tagList,
  ].join("\n");

  const menu = (deps.storybook ?? []).filter((name) => !deps.reservedIds?.has(slugify(name)));
  const NONE = "none";
  const menuSystem = [
    "In a fairy-tale world, two things are combined and something new appears.",
    "Pick the creature or object from the list that is the obvious result, the one a child would guess.",
    `Pick one only when the fit is clear. If nothing on the list plainly fits, answer "${NONE}".`,
    "Fits: Clay and Life make a Golem. Bone and Life make a Skeleton. A person and Shadow make a Ghost. Fire and Life make a Phoenix. Stone and Life make a Gargoyle.",
    `No fit: Iron and Light. Salt and Shadow. Those are "${NONE}".`,
    "",
    `The list: ${menu.join(", ")}.`,
  ].join("\n");

  // For a magical pair, the model is shown a fixed menu of storybook things and may pick one.
  // Choosing from a list is something a small model does well; inventing a fitting name is not.
  async function pickStorybook(a: GameEntry, b: GameEntry): Promise<string | null> {
    if (menu.length === 0 || !isWonderPair(a, b, deps.balance)) return null;
    try {
      const { choice } = await generateValidated(deps.client, deps.log, {
        purpose: "combo-storybook",
        system: menuSystem,
        prompt: `Combine these two:\n1. ${describe(a)}\n2. ${describe(b)}`,
        schema: z.strictObject({ choice: z.enum([NONE, ...menu]) }),
        maxAttempts: 2,
        temperature: 0,
      });
      return choice === NONE ? null : choice;
    } catch {
      // No pick is never a failure: the pair simply makes an ordinary thing.
      return null;
    }
  }

  const ORDINARY_NOTE = [
    "The result is an ordinary, real-world thing: a material, a place, a kind of weather, a food, a tool, a plant, or an animal.",
    "No fairy-tale creatures and no enchanted objects.",
    "Like this: Water + Sand = Beach. Fire + Fire = Bonfire. Air + Air = Wind. Earth + Earth = Hill. Steam + Air = Cloud. Mud + Fire = Brick. Metal + Tree = Axe.",
  ].join("\n");

  return async (a, b, reject) => {
    const pair = `Combine these two:\n1. ${describe(a)}\n2. ${describe(b)}`;
    const storybook = await pickStorybook(a, b);
    // A storybook pick that the game's rules refuse (a name already made another way, say) falls
    // back to an ordinary result instead of failing the combination.
    if (storybook && reject({ name: storybook, description: "x", tags: [], missingTag: null }) === null) {
      const draft = await generateValidated(deps.client, deps.log, {
        purpose: "combo",
        system,
        prompt: `${pair}\n\nThe result is a ${storybook}, the kind from fairy tales. Use exactly that name, and describe this one.`,
        schema: schema.extend({ name: z.literal(storybook) }),
        reject: (value) => reject(value) ?? voiceCheck(value.description, value.name),
        maxAttempts: deps.balance.generation.maxAttempts,
        temperature: deps.balance.generation.temperature,
      });
      return { ...draft, storybook: true };
    }
    return generateValidated(deps.client, deps.log, {
      purpose: "combo",
      system,
      prompt: `${pair}\n\n${ORDINARY_NOTE}`,
      schema,
      reject: (draft) => reject(draft) ?? voiceCheck(draft.description, draft.name),
      maxAttempts: deps.balance.generation.maxAttempts,
      temperature: deps.balance.generation.temperature,
    });
  };
}
