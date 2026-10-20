import { z } from "zod";
import { slugify, type ComboDraft, type GameEntry } from "../shared/schema";
import { generateValidated } from "./llm/generate";
import type { LlmClient } from "./llm/types";
import type { ModelCall } from "./store";

// Five other results for a pair, for the reviewer to pick from with one key. The model is told to
// blend both inputs and to give the plain compound name first. Code throws out any name the
// game's rules would refuse, so what the reviewer sees is always something that could go in.

const schema = z.strictObject({
  alternatives: z.array(z.strictObject({ name: z.string().min(1).max(40), why: z.string().min(1).max(160) })).min(5).max(5),
});

export type Alternative = { name: string; why: string };

export async function proposeAlternatives(deps: {
  client: LlmClient;
  log: (call: ModelCall) => void;
  voice: string;
  a: GameEntry;
  b: GameEntry;
  // The result under review, and anything the reviewer has already turned down.
  avoid: string[];
  // The game's rules for a name and description, for this pair.
  rules: (draft: ComboDraft) => string | null;
  examples?: string[];
}): Promise<Alternative[]> {
  const gone = new Set(deps.avoid.map(slugify));
  // A name is usable when the game's rules accept it, and it is new to this list.
  const usable = (items: Alternative[]): Alternative[] => {
    const seen = new Set<string>();
    return items.filter((item) => {
      const id = slugify(item.name);
      if (gone.has(id) || seen.has(id)) return false;
      if (deps.rules({ name: item.name, description: "A plain thing.", tags: [], missingTag: null }) !== null) return false;
      seen.add(id);
      return true;
    });
  };
  const result = await generateValidated(deps.client, deps.log, {
    purpose: "review-alternatives",
    system: [
      deps.voice.trim(),
      "",
      "In a cozy crafting game, two things are combined and one new thing appears. A reviewer turned down the first answer. Give five other answers, best first.",
      "Blend both inputs. An answer that reflects only one of them is wrong.",
      "Put the plain compound name first if one exists (saltwater, not brine).",
      "Names are real, common words or short natural compounds. Nothing modern or industrial. Never an input's favourite association unless both justify it.",
      "Each why is one short line naming how both inputs make it.",
    ].join("\n"),
    prompt: [
      `${deps.a.name} + ${deps.b.name}`,
      `Turned down: ${deps.avoid.join(", ") || "nothing yet"}.`,
      ...(deps.examples && deps.examples.length > 0 ? ["Good answers to other pairs:", ...deps.examples.map((line) => `- ${line}`)] : []),
    ].join("\n"),
    schema,
    reject: (value) => (usable(value.alternatives).length >= 3 ? null : "At least three of those are names the game cannot use: made-up words, ingredients themselves, or things already turned down. Give five real, everyday things."),
    maxAttempts: 3,
    temperature: 0.8,
  });
  return usable(result.alternatives);
}
