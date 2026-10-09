import { z } from "zod";
import { generateValidated } from "./llm/generate";
import type { LlmClient } from "./llm/types";
import type { ModelCall } from "./store";

// A second opinion on a finished combination, for the bench and for reviewing the cache. It is
// never used while someone is playing: it is slow on purpose, and it only reports.
export type ComboGrade = {
  // Would a ten-year-old agree the two things make this?
  makesSense: boolean;
  // Is the name a real, well-known word, not something invented?
  realName: boolean;
  why: string;
};
export type ComboGrader = (question: { a: string; b: string; result: string; description: string }) => Promise<ComboGrade>;

const SYSTEM = [
  "You check answers in a children's crafting game, where two things are combined and a third thing appears.",
  "Be strict and plain. You are not being kind to the answer.",
  "makesSense: true only if a ten-year-old who was told the two ingredients would nod at the result without having it explained.",
  "Good links: one ingredient is made into the result, one acts on the other, the result is where the two are found together, or a well-known story joins them.",
  "Not good enough: the result fits only one ingredient, the link needs a paragraph to explain, or it is merely the same sort of thing.",
  "Sense: Sand + Water = Beach. Clay + Fire = Brick. Bone + Life = Skeleton. Metal + Sound = Bell.",
  "No sense: Salt + Tree = Bark. A person + Tea = Doll. Blood + Fire = Rust. A spellbook + a ghostly spirit = Soup.",
  "realName: true if the result's name is a real word or phrase most people know. False if it was invented or welded together from two words, such as Emberdark or Foglight.",
  "why: one short sentence giving your reason.",
].join("\n");

export function createComboGrader(deps: { client: LlmClient; log: (call: ModelCall) => void }): ComboGrader {
  return ({ a, b, result, description }) =>
    generateValidated(deps.client, deps.log, {
      purpose: "combo-grade",
      system: SYSTEM,
      prompt: [`Ingredient one: ${a}`, `Ingredient two: ${b}`, `The answer given: ${result}. ${description}`].join("\n"),
      schema: z.strictObject({ why: z.string().min(1).max(400), makesSense: z.boolean(), realName: z.boolean() }),
      maxAttempts: 2,
      temperature: 0,
    });
}
