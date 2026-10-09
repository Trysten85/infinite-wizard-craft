import { z } from "zod";
import { comboDraftSchema, slugify, type Balance, type ComboDraft, type ComboExample, type GameEntry, type StorybookItem, type Tag } from "../shared/schema";
import { exampleLine, pickExamples, storybookFor, thingLine, type MadeFrom } from "./comboContext";
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

type Idea = { why: string; name: string };

// A small model is poor at inventing the right answer in one go, better at choosing from a short
// list, and best when code has already cut the list down. So a new combination is named in steps:
//   1. storybook: for a magical pair, code works out which fairy-tale things one ingredient makes
//      and the other wakes. The model chooses one from that closed list, or declines them all.
//   2. ideas: otherwise the model answers three plain questions about the pair (what the two
//      make, where they are found, a thing with both in it), each with its reason before its
//      name. The first answer the game can use is taken.
//   3. describe: the words for the name that was chosen.
// Code does the rest: what each ingredient was made from, and which examples resemble the pair.
export function createComboGenerator(deps: {
  client: LlmClient;
  log: (call: ModelCall) => void;
  voice: string;
  tags: Iterable<Tag>;
  balance: Balance;
  // The storybook things, and the ids of hand-written entries, which are never offered.
  storybook?: StorybookItem[];
  reservedIds?: Set<string>;
  // Good combinations to show beside the pair.
  examples?: ComboExample[];
  // What a thing was made from, and whether a name is already something another pair makes.
  madeFrom?: MadeFrom;
  exists?: (name: string) => boolean;
  // Hears what was suggested and what was chosen, for the bench. The game does not use it.
  trace?: (step: { ideas: string[]; picked: string | null; refused?: string[] }) => void;
}): ComboGenerator {
  const rules = deps.balance.generation;
  const tags = [...deps.tags];
  const schema = comboDraftSchema(tags, rules.maxTags);
  const voiceCheck = createVoiceCheck(deps.voice);
  const madeFrom = deps.madeFrom ?? (() => null);
  const exists = deps.exists ?? (() => false);
  const menu = (deps.storybook ?? []).filter((item) => !deps.reservedIds?.has(slugify(item.name)));
  const onMenu = new Set(menu.map((item) => slugify(item.name)));
  const NONE = "none";

  const storybookSystem = [
    "In a fairy-tale world, two things are combined and something new appears.",
    "You are shown the fairy-tale things that one of the two can be made into and the other can wake.",
    "Pick the one that is the obvious result, the one a child would guess.",
    `If none of them is a clear fit for these two, answer "${NONE}".`,
    "Fits: a statue and Life make a Gargoyle. Snow and Life make a Snowman. A wolf and Shadow make a Werewolf. A well and Light make a Wishing Well.",
  ].join("\n");

  // Asking for "three ideas" gets one good answer and two strained ones. Asking three different
  // plain questions gets three answers of different kinds. They are in order of how often each
  // turns out to be the right one, so the first usable answer is the one to take.
  const LENSES = {
    made: "what you get when one is made into the other, or one acts on the other",
    place: "where the two are found together, or the scene, weather, or gathering the two make up",
    thing: "one object, plant, or animal that has both in it, or is used with both",
  } as const;
  const lensNames = Object.keys(LENSES) as (keyof typeof LENSES)[];
  const ideaSchema = z.strictObject({ why: z.string().min(1).max(200), name: z.string().min(1).max(40) });
  const ideasSchema = z.strictObject({ made: ideaSchema, place: ideaSchema, thing: ideaSchema });

  const ideasSystem = [
    "In a cozy crafting game, two things are combined and one new thing appears. You suggest what it could be, three ways.",
    // No worked example here on purpose: a small model hands the example's answer straight back.
    "Answer the way a ten-year-old would, with the first thing that comes to mind, not the way a chemist or an engineer would.",
    ...lensNames.map((lens) => `${lens}: ${LENSES[lens]}.`),
    "For each one, write the why first, in a few words, and then the name.",
    "Name: the plainest word for it, the one a child would know. One word if you can.",
    "The name must be a real, well-known word. Never invent a word and never weld two words into a new one.",
    "Two words only when the two together are themselves a well-known thing (Tea Party, Ghost Story). Never an ingredient's name stuck onto another word.",
    "Each answer is one thing, named with a noun. It is never a spell, never one of the two ingredients, and never an ingredient's name with a new ending.",
  ].join("\n");

  const pickSystem = [
    "In a crafting game, two things are combined and one new thing appears. You are shown some suggested answers.",
    "Pick the answer most ten-year-olds would give if asked what the two make. The everyday, obvious thing wins.",
    "A good answer has a clear link to both ingredients. One that only fits one of them is poor.",
    "Be wary of a name that is just the ingredients' own names joined or reworded. That is wordplay, not an answer.",
    `Only if every one of them would make a child frown, answer "${NONE}".`,
  ].join("\n");

  const tagList = tags
    .filter((tag) => tag.assignedBy === "model")
    .map((tag) => `- ${tag.id}: ${tag.meaning}`)
    .join("\n");
  const describeSystem = [
    deps.voice.trim(),
    "You describe the single thing made when two things are combined. Its name has already been chosen.",
    "Description: one or two short sentences. The humor belongs here, never in the name.",
    `Tags: say what the result is made of or plainly does. Most results need one or two, and ${rules.maxTags} is the most. Choosing none is fine.`,
    "Do not add a tag because it might loosely apply. A tag must match its meaning below.",
    "missingTag: if the most obvious word for the result is not in the list, give that one plain word. Otherwise null.",
    "",
    "Tags and their meanings:",
    tagList,
  ].join("\n");

  // Has the model choose from the storybook things code put on offer, or decline them. Choosing
  // from a closed list is the thing a small model does well.
  async function pickStorybook(pair: string, offered: string[]): Promise<string | null> {
    try {
      const { choice } = await generateValidated(deps.client, deps.log, {
        purpose: "combo-storybook",
        system: storybookSystem,
        prompt: `${pair}\n\nThe fairy-tale things these two could make: ${offered.join(", ")}.`,
        schema: z.strictObject({ choice: z.enum([NONE, ...offered]) }),
        maxAttempts: 2,
        temperature: 0,
      });
      deps.trace?.({ ideas: offered, picked: choice === NONE ? null : choice });
      return choice === NONE ? null : choice;
    } catch {
      // No pick is never a failure: the pair simply makes an everyday thing.
      return null;
    }
  }

  // Asks the three questions and keeps the answers the game can use. If the rules refuse all
  // three they are sent back with the reasons, so the next try is spent on something else.
  async function suggest(pair: string, guidance: string, usable: (idea: Idea) => string | null, turnedDown: string[]): Promise<Idea[]> {
    const read = (value: z.infer<typeof ideasSchema>) => {
      const seen = new Set(turnedDown.map(slugify));
      const given = lensNames.map((lens) => value[lens]);
      const ideas = given.filter((idea) => {
        const id = slugify(idea.name);
        if (seen.has(id) || usable(idea) !== null) return false;
        seen.add(id);
        return true;
      });
      return { ideas, refused: given.filter((idea) => !ideas.includes(idea)).map((idea) => `${idea.name} (${usable(idea) ?? "said twice"})`) };
    };
    const answer = await generateValidated(deps.client, deps.log, {
      purpose: "combo-ideas",
      system: ideasSystem,
      prompt: [pair, guidance, ...(turnedDown.length > 0 ? [`Not these, which were turned down: ${turnedDown.join(", ")}.`] : [])].join("\n\n"),
      schema: ideasSchema,
      reject: (value) => (read(value).ideas.length > 0 ? null : `None of those can be used. ${read(value).refused.join(" ")}`),
      maxAttempts: rules.maxAttempts,
      temperature: rules.ideasTemperature,
    });
    const { ideas, refused } = read(answer);
    if (refused.length > 0) deps.trace?.({ ideas: [], picked: null, refused });
    return ideas;
  }

  // Settles on one of the ideas. Normally that is the first one, unless another pair already
  // makes it and one of the others is new: making a thing several ways is fine, but reaching for
  // the same answer every time is not. With `pick` on, the model is asked to judge instead, and
  // may say that none will do.
  async function choose(pair: string, ideas: Idea[]): Promise<Idea | null> {
    const fresh = ideas.find((idea) => !exists(idea.name)) ?? ideas[0]!;
    if (!rules.pick) {
      deps.trace?.({ ideas: ideas.map((idea) => idea.name), picked: fresh.name });
      return fresh;
    }
    try {
      const { choice } = await generateValidated(deps.client, deps.log, {
        purpose: "combo-pick",
        system: pickSystem,
        prompt: [
          pair,
          ["Suggested answers:", ...ideas.map((idea) => `- ${idea.name}: ${idea.why}${exists(idea.name) ? " (already made another way)" : ""}`)].join("\n"),
          ...(ideas.some((idea) => exists(idea.name)) ? ["If two fit equally well, pick one that is not already made another way."] : []),
        ].join("\n\n"),
        schema: z.strictObject({ choice: z.enum([NONE, ...ideas.map((idea) => idea.name)]) }),
        maxAttempts: 2,
        temperature: 0,
      });
      const picked = ideas.find((idea) => idea.name === choice) ?? null;
      deps.trace?.({ ideas: ideas.map((idea) => idea.name), picked: picked?.name ?? null });
      return picked;
    } catch {
      // A judge that cannot answer never stops a combination.
      return fresh;
    }
  }

  return async (a, b, reject) => {
    const magical = isWonderPair(a, b, deps.balance);
    const pair = `Combine these two:\n1. ${thingLine(a, madeFrom(a.id))}\n2. ${thingLine(b, madeFrom(b.id))}`;

    // Only the name is at stake here. The description is written, and checked, afterwards.
    const allowed = (name: string) => reject({ name, description: "A thing.", tags: [], missingTag: null });
    // A storybook thing is only ever what code put on offer for this pair.
    const offered = magical ? storybookFor(menu, a, b, rules.storybookOffered).filter((name) => allowed(name) === null) : [];
    const usable = (idea: Idea): string | null => {
      if (slugify(idea.name) === NONE || slugify(idea.name) === "") return "Give a real thing, not a blank.";
      if (onMenu.has(slugify(idea.name))) return `"${idea.name}" is a fairy-tale thing. Give an everyday one.`;
      return allowed(idea.name);
    };

    let chosen: Idea | null = null;
    const fairy = offered.length > 0 ? await pickStorybook(pair, offered) : null;
    if (fairy) chosen = { name: fairy, why: "the fairy-tale thing these two make" };
    else {
      const examples = pickExamples(deps.examples ?? [], a, b, magical, rules.examples);
      const guidance = [
        ...(examples.length > 0 ? [["Good answers to other pairs, to show the kind of thing wanted:", ...examples.map((example) => `- ${exampleLine(example)}`)].join("\n")] : []),
        magical
          ? "Magic is in play, but the result is still an everyday, real-world thing: the kind a touch of magic could have made. Each needs a plain, real name.\nNo fairy-tale creatures."
          : "The result is an ordinary, real-world thing: a material, a place, a kind of weather, a food, a tool, a plant, or an animal.\nNo fairy-tale creatures and no enchanted objects.",
        ...(a.id === b.id ? [`Both ingredients are the same. The answer is what a great deal of ${a.name} makes, or the bigger thing it grows into.`] : []),
      ].join("\n\n");
      const first = await suggest(pair, guidance, usable, []);
      chosen = await choose(pair, first);
      if (!chosen) {
        // The judge found none of them made sense. One more round, then the best of what there is.
        const second = await suggest(pair, guidance, usable, first.map((idea) => idea.name)).catch(() => []);
        chosen = (second.length > 0 ? await choose(pair, second) : null) ?? second[0] ?? first[0]!;
      }
    }

    const storybook = fairy !== null;
    const charmed = magical && !storybook;
    const note = storybook
      ? `The result is a ${chosen.name}, the kind from fairy tales. Use exactly that name, and describe this one.`
      : charmed
        ? `The result is: ${chosen.name}. Use exactly that name. It is the everyday thing it sounds like, but magic had a hand in making it, so give it one small touch of enchantment in the description: something it quietly does that it should not be able to.`
        : `The result is: ${chosen.name}. Use exactly that name. It is an ordinary, real-world thing, with nothing magical about it.`;
    const draft = await generateValidated(deps.client, deps.log, {
      purpose: "combo",
      system: describeSystem,
      prompt: [pair, `How the two make it: ${chosen.why}`, note].join("\n\n"),
      schema: schema.extend({ name: z.literal(chosen.name) }),
      reject: (value) => reject(value) ?? voiceCheck(value.description, value.name),
      maxAttempts: rules.maxAttempts,
      temperature: rules.temperature,
    });
    return storybook || (charmed && rules.charmedCarriesMagic) ? { ...draft, storybook: true } : draft;
  };
}
