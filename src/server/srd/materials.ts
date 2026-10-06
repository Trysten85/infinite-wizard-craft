import { z } from "zod";
import { slugify } from "../../shared/schema";
import { generateValidated, GenerationError } from "../llm/generate";
import type { LlmClient } from "../llm/types";
import type { ModelCall } from "../store";

export const phraseRowSchema = z.strictObject({
  phrase: z.string().min(1),
  spells: z.array(z.string()),
  // Material names as extracted. Edit these by hand to correct the model.
  materials: z.array(z.string().min(1)),
  costGp: z.number().int().min(0).nullable(),
  consumed: z.boolean(),
  status: z.enum(["ok", "review"]),
});
export type PhraseRow = z.infer<typeof phraseRowSchema>;

export type Material = { id: string; name: string; spells: string[] };

// Cost and consumption are stated in fixed wording, so code reads them. Costs in one phrase are summed.
export function parseCost(text: string): { costGp: number | null; consumed: boolean } {
  const amounts = [...text.matchAll(/(\d[\d,]*)\s*gp\b/gi)].map((match) => Number(match[1]!.replace(/,/g, "")));
  return {
    costGp: amounts.length > 0 ? amounts.reduce((sum, amount) => sum + amount, 0) : null,
    consumed: /\bconsume/i.test(text),
  };
}

// A rough singular form, enough to treat "diamonds" and "diamond" as the same word.
function stem(word: string): string {
  if (/(ch|sh|ss|x|z)es$/.test(word)) return word.slice(0, -2);
  if (/(ss|us)$/.test(word)) return word;
  return word.replace(/s$/, "");
}

function stems(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]+/g) ?? []).map(stem);
}

// True when every word of the material appears in the phrase, ignoring plurals.
// This is what stops the model from inventing a material the source never mentioned.
export function isGrounded(material: string, phrase: string): boolean {
  const available = new Set(stems(phrase));
  const words = stems(material);
  return words.length > 0 && words.every((word) => available.has(word));
}

// Materials that differ only by plural share one id.
export function materialId(name: string): string {
  return slugify(stems(name).join(" "));
}

// Words that describe an amount or a source, not a material.
const GENERIC = new Set(["creature", "bird", "beast", "piece", "object", "target", "shape", "kind", "item"]);
const AMOUNT_PREFIX = /^(lump|drop|pinch|bit|piece|morsel|handful|dash|sprinkling)s? of /;

// "drop of honey" is honey. Amounts have a fixed wording, so code removes them.
export function cleanMaterial(name: string): string {
  return name.toLowerCase().trim().replace(AMOUNT_PREFIX, "");
}

export function isGeneric(material: string): boolean {
  return GENERIC.has(stems(material).join(" "));
}

const extractionSchema = z.strictObject({ materials: z.array(z.string().min(1).max(40)).max(12) });

const SYSTEM = [
  "You list the physical materials named in a spell's material component phrase.",
  "Give each distinct material as a short singular noun phrase, using only words from the phrase.",
  "Leave out quantities, sizes, prices, containers that only hold the material, and words like 'a pinch of'.",
  "If the phrase offers alternatives, list each one.",
  "A part and the thing it comes from are one material, not two. A creature, a shape, or a vague word",
  "such as 'piece', 'object', or 'offering' is never a material by itself.",
  'Example: "A tiny ball of bat guano and sulfur." gives ["bat guano", "sulfur"].',
  'Example: "Diamonds worth at least 300 gp, which the spell consumes." gives ["diamond"].',
  'Example: "A white feather or the heart of a hen." gives ["white feather", "hen heart"].',
  'Example: "Leaf of sumac." gives ["sumac leaf"].',
  'Example: "A morsel of food." gives ["food"].',
  'Example: "A piece of golden wire bent into a cup shape." gives ["golden wire"].',
].join("\n");

// Asks the model to split one phrase into materials. Returns null if it never passes the checks.
export async function extractMaterials(
  client: LlmClient,
  log: (call: ModelCall) => void,
  phrase: string,
  maxAttempts = 3,
): Promise<string[] | null> {
  try {
    const result = await generateValidated(client, log, {
      purpose: "srd-materials",
      system: SYSTEM,
      prompt: `Phrase: "${phrase}"`,
      schema: extractionSchema,
      reject: ({ materials }) => {
        if (materials.length === 0) return "List at least one material.";
        const invented = materials.filter((material) => !isGrounded(material, phrase));
        if (invented.length > 0) return `These use words that are not in the phrase: ${invented.join(", ")}.`;
        const generic = materials.filter(isGeneric);
        if (generic.length > 0) {
          return `These are not materials by themselves: ${generic.join(", ")}. Join each to the part it belongs to, or drop it.`;
        }
        return null;
      },
      maxAttempts,
      temperature: 0,
    });
    return [...new Set(result.materials.map(cleanMaterial))];
  } catch (err) {
    if (err instanceof GenerationError) return null;
    throw err;
  }
}

// The distinct materials across all phrases, each with the spells that use it.
export function buildMaterialList(rows: PhraseRow[]): Material[] {
  const byId = new Map<string, Material>();
  for (const row of rows) {
    for (const name of row.materials) {
      const id = materialId(name);
      if (!id) continue;
      const material = byId.get(id) ?? { id, name, spells: [] };
      material.spells = [...new Set([...material.spells, ...row.spells])].sort();
      byId.set(id, material);
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}
