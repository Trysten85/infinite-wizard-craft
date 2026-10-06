import { z } from "zod";
import { comboKey, MAX_TAGS, type GameEntry, type Tag } from "../../shared/schema";
import type { Blocklist } from "../blocklist";
import { generateValidated, GenerationError } from "../llm/generate";
import type { LlmClient } from "../llm/types";
import type { ModelCall } from "../store";
import { endsCleanly } from "../voice";

export type MaterialDraft = { inputs: [string, string]; logic: string; description: string; tags: string[] };

export type DraftRules = {
  // Entries the recipe may use, by id. Only things already live in the game.
  ingredients: Map<string, GameEntry>;
  // Pairs that already make something, as combo keys.
  usedPairs: Set<string>;
  // [shallowest, deepest] depth the new material may land at.
  depthBand: [number, number];
  blocklist?: Blocklist;
};

type ModelDeps = { client: LlmClient; log: (call: ModelCall) => void };
const NONE = "none";

// Everything a drafted recipe must satisfy. Returns the reason it fails, or null.
export function checkMaterialDraft(draft: MaterialDraft, rules: DraftRules): string | null {
  const [a, b] = draft.inputs.map((id) => rules.ingredients.get(id));
  if (!a || !b) return "Both ingredients must come from the list.";
  if (a.id === b.id) return "The two ingredients must be different.";
  if (rules.usedPairs.has(comboKey(a.id, b.id))) return `${a.name} and ${b.name} already make something else. Choose a different pair.`;
  const depth = Math.max(a.depth, b.depth) + 1;
  const [shallowest, deepest] = rules.depthBand;
  if (depth < shallowest) return `That is too easy to make. Use at least one ingredient of depth ${shallowest - 1} or more.`;
  if (depth > deepest) return `That is too hard to make. Use ingredients of depth ${deepest - 1} or less.`;
  if (rules.blocklist && rules.blocklist.find(draft.description).length > 0) {
    return "The description uses a proper name. Rewrite it without naming any person, place, or group.";
  }
  if (/[0-9!]/.test(draft.description)) return "The description must not contain digits or exclamation marks.";
  if (!endsCleanly(draft.description)) return "The description stops in the middle of a sentence. Write one or two short, complete sentences.";
  return null;
}

// The ingredients that can still be paired with `first` inside the rules: the pair is unused and
// the result lands in the depth band. The model is only ever offered these, so it cannot break them.
export function validPartners(first: GameEntry, rules: DraftRules): GameEntry[] {
  const [shallowest, deepest] = rules.depthBand;
  return [...rules.ingredients.values()].filter((second) => {
    const depth = Math.max(first.depth, second.depth) + 1;
    return second.id !== first.id && depth >= shallowest && depth <= deepest && !rules.usedPairs.has(comboKey(first.id, second.id));
  });
}

// `reagent` marks anything a spell consumes, so code adds it instead of trusting the model to.
export function withReagent(tags: string[]): string[] {
  return [...new Set(["reagent", ...tags])].slice(0, MAX_TAGS);
}

const listed = (entries: GameEntry[]) => entries.map((entry) => `- ${entry.id}: ${entry.name}. ${entry.description}`);

// Asks the model how a material is made from two things already in the game, in two steps:
// the main ingredient first, then a partner from the ones code says are still allowed.
// Returns null if the model says nothing fits, or no answer passes the checks.
export async function draftMaterialRecipe(
  deps: ModelDeps & { voice: string; tags: Tag[] },
  material: { name: string; usedFor: string[] },
  rules: DraftRules,
): Promise<MaterialDraft | null> {
  const starters = [...rules.ingredients.values()].filter((entry) => validPartners(entry, rules).length > 0);
  if (starters.length === 0) return null;
  const subject = `Material to make: ${material.name}\nIt is a component of: ${material.usedFor.join(", ")}`;

  try {
    const first = await generateValidated(deps.client, deps.log, {
      purpose: "craft-material-first",
      system: [
        "In an alchemy game, a material is made by combining two ingredients.",
        "Choose the one ingredient from the list that the material most plainly comes from. Answer with its id.",
        `If nothing on the list could sensibly be its source, answer "${NONE}".`,
        "",
        "Ingredients:",
        ...listed(starters),
      ].join("\n"),
      prompt: subject,
      schema: z.strictObject({ ingredient: z.enum([NONE, ...starters.map((entry) => entry.id)]) }),
      maxAttempts: 2,
      temperature: 0,
    });
    if (first.ingredient === NONE) return null;

    const a = rules.ingredients.get(first.ingredient)!;
    const partners = validPartners(a, rules);
    const modelTags = deps.tags.filter((tag) => tag.assignedBy === "model");
    const second = await generateValidated(deps.client, deps.log, {
      purpose: "craft-material-second",
      system: [
        deps.voice.trim(),
        "",
        `In an alchemy game, ${material.name} is made by combining ${a.name} with one other ingredient.`,
        "partner: the id of the ingredient from the list that most plainly completes it.",
        "logic: under ten plain words on why the two make it.",
        "description: one or two short sentences about the material, in the voice above. No digits.",
        "tags: at most three from the tag list, only those that plainly fit. None is fine.",
        "",
        "Ingredients:",
        ...listed(partners),
        "",
        "Tags:",
        ...modelTags.map((tag) => `- ${tag.id}: ${tag.meaning}`),
      ].join("\n"),
      prompt: subject,
      schema: z.strictObject({
        partner: z.enum(partners.map((entry) => entry.id) as [string, ...string[]]),
        logic: z.string().min(1).max(300),
        description: z.string().min(1).max(500),
        tags: z.array(z.enum(modelTags.map((tag) => tag.id) as [string, ...string[]])).max(3),
      }),
      reject: (value) => checkMaterialDraft({ ...value, inputs: [a.id, value.partner] }, rules),
      maxAttempts: 3,
      temperature: 0.4,
    });
    return { inputs: [a.id, second.partner], logic: second.logic, description: second.description, tags: withReagent(second.tags) };
  } catch (err) {
    if (err instanceof GenerationError) return null;
    throw err;
  }
}

// Asks the model whether a spell component is just a form of something already in the game
// ("yew leaf" is Tree, "iron filings" is Iron). Returns that entry's id, or null if it is new.
export async function classifyMaterial(deps: ModelDeps, name: string, existing: GameEntry[]): Promise<string | null> {
  const NEW = "new";
  try {
    const result = await generateValidated(deps.client, deps.log, {
      purpose: "craft-classify",
      system: [
        "A spell needs a material. Decide whether it is a raw piece of one of the game's existing materials,",
        `or something "${NEW}" that the game does not have yet.`,
        "Choose an existing material only when the thing is that same stuff, unworked:",
        "a yew leaf, a twig, or bark is tree; iron filings are iron; a pinch of dirt is earth; a tuft of fur is animal.",
        `Answer "${NEW}" for anything that has been made or processed, and for anything of a different kind:`,
        `a bell, a ring, cloth, ink, parchment, leather, wire, and a coin are "${NEW}";`,
        `a gem such as diamond, ruby, agate, or jade is "${NEW}"; honeycomb, spiderweb, molasses, incense, and seeds are "${NEW}".`,
        `Most things are "${NEW}". When unsure, answer "${NEW}".`,
        "",
        "Existing materials:",
        ...listed(existing),
      ].join("\n"),
      prompt: `Material: ${name}`,
      schema: z.strictObject({ sameAs: z.enum([NEW, ...existing.map((entry) => entry.id)]) }),
      maxAttempts: 2,
      temperature: 0,
    });
    return result.sameAs === NEW ? null : result.sameAs;
  } catch (err) {
    if (err instanceof GenerationError) return null;
    throw err;
  }
}

// Asks the model which elements suit a spell that has no components, best first.
export async function rankElements(
  deps: ModelDeps,
  spell: { name: string; school: string; tags: string[] },
  elements: GameEntry[],
): Promise<string[]> {
  const ids = elements.map((element) => element.id) as [string, ...string[]];
  const schema = z.strictObject({ elements: z.array(z.enum(ids)).min(3).max(ids.length) });
  const system = [
    "You match a spell to the elements it is most naturally made from.",
    "List the elements from best fit to worst, using their ids. Include at least three, with no repeats.",
    "",
    "Elements:",
    ...elements.map((element) => `- ${element.id}: ${element.description}`),
  ].join("\n");
  try {
    const result = await generateValidated(deps.client, deps.log, {
      purpose: "craft-rank-elements",
      system,
      prompt: `Spell: ${spell.name}\nSchool: ${spell.school}\nTags: ${spell.tags.join(", ") || "none"}`,
      schema,
      reject: (value) => (new Set(value.elements).size === value.elements.length ? null : "Do not repeat an element."),
      maxAttempts: 3,
      temperature: 0,
    });
    return result.elements;
  } catch (err) {
    if (err instanceof GenerationError) return [];
    throw err;
  }
}
