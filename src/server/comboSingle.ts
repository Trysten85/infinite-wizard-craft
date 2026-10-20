import { z } from "zod";
import { slugify, type ComboDraft, type GameEntry, type Tag } from "../shared/schema";
import { namesBoth } from "./bakeTriage";
import type { Blocklist } from "./blocklist";
import { generateValidated } from "./llm/generate";
import type { LlmClient } from "./llm/types";
import type { ModelCall } from "./store";
import { createVoiceCheck } from "./voice";

// The single-call way of making a combination, for the A/B in bake round 2. One call, one fixed
// schema, reasoning before the answer: what each input is, three candidates with reasons, the
// choice, and then the result (or no result). The rationale is for the human reviewer only. It
// is kept beside the row and is never an example or a label.

export type SingleMode = "single" | "single-lean";

export type SingleAnswer = {
  // The finished result, in the shape the rest of the bake uses. Null when nothing came of the pair.
  draft: ComboDraft | null;
  // The gentle line to show when nothing came of the pair.
  noResult: string | null;
  candidates: { name: string; reason: string }[];
  rationale: string;
  mode: "ordinary" | "whimsical" | null;
};

const MODES = ["ordinary", "whimsical"] as const;

// The schema in the order the model must fill it. "single-lean" drops the three reasoning fields,
// which is the other arm of the experiment: does thinking first earn its seconds?
export function singleSchema(tags: Tag[], maxTags: number, mode: SingleMode) {
  const result = z.strictObject({
    name: z.string().min(1).max(40),
    tags: z.array(z.enum(tags.map((tag) => tag.id) as [string, ...string[]])).min(1).max(maxTags),
    mode: z.enum(MODES),
    description: z.string().min(1).max(500),
  });
  const reasoning = {
    inputs_summary: z.string().min(1).max(400),
    candidates: z.array(z.strictObject({ name: z.string().min(1).max(40), reason: z.string().min(1).max(200) })).length(3),
    choice: z.strictObject({ name: z.string().min(1).max(40), reason: z.string().min(1).max(200) }),
  };
  const answer = {
    result: result.nullable(),
    no_result: z.boolean(),
    // Only said when there is no result: a short, gentle line. Empty otherwise.
    no_result_line: z.string().max(200),
    rationale: z.string().min(1).max(600),
  };
  return z.strictObject(mode === "single" ? { ...reasoning, ...answer } : answer);
}

export type SingleDeps = {
  client: LlmClient;
  log: (call: ModelCall) => void;
  voice: string;
  tags: Iterable<Tag>;
  maxTags: number;
  blocklist?: Blocklist;
  // The step the plain pipeline uses to set the scene: the pair as the model reads it, and the
  // examples and the lane it is shown with.
  scene: (a: GameEntry, b: GameEntry, reject: (draft: ComboDraft) => string | null) => { pair: string; guidance: string };
  // The rules a finished name and description must satisfy, for this pair.
  rules: (a: GameEntry, b: GameEntry) => (draft: ComboDraft) => string | null;
  // Names already in the game, so one is reused when it fits.
  existingNames: () => string[];
  mode: SingleMode;
  maxAttempts?: number;
  temperature?: number;
};

export function createSingleCall(deps: SingleDeps) {
  const tags = [...deps.tags].filter((tag) => tag.assignedBy === "model");
  const voiceCheck = createVoiceCheck(deps.voice);
  const schema = singleSchema(tags, deps.maxTags, deps.mode);
  const system = [
    deps.voice.trim(),
    "",
    "In a cozy, funny, non-violent crafting game, two things are combined and one new thing appears. The same pair always gives the same result.",
    ...(deps.mode === "single"
      ? [
          "Think before you answer, in the order of the fields:",
          "inputs_summary: one line for each input: what it is and what it is known for.",
          "candidates: three candidate results, each with a one-line reason. Include the plain compound name if one exists (saltwater).",
          "choice: the one you pick and a line on why it beat the others.",
        ]
      : []),
    "result: the name, one to five tags from the list, mode (ordinary, or whimsical when the thing is a joke or a pun), and a description of one or two short sentences.",
    "no_result: true when no sensible result exists. Then result is null and no_result_line is a short, gentle line, such as: Nothing happens. The kettle looks unimpressed.",
    "rationale: two or three sentences on why this result over the runner-up. It is read only by the person reviewing it.",
    "",
    "Rules:",
    "- Blend both inputs. A result that reflects only one of them is wrong.",
    "- Use the plain compound name when one exists: saltwater, not brine.",
    "- Nothing modern or industrial: no hospital, locomotive, airplane, selfie, sandwich, and the like.",
    "- Do not fall back on an input's favourite association (bat guano to fertilizer, bat to cave, smoke to ash, silver or crystal to mirror) unless both inputs justify it.",
    "- Names are real, common words or short natural compounds. Never a glued-on invented word.",
    "- Reuse a name from the list of existing names when one fits, rather than inventing a near-duplicate.",
    "- Descriptions are one or two sentences. Avoid faint, faintly, whisper, hum, lullaby, sigh, blanket, and 'as if'.",
    "- No violence, gore, cruelty, real people, real drugs, or explicit content.",
  ].join("\n");

  async function write(a: GameEntry, b: GameEntry): Promise<SingleAnswer> {
    const rules = deps.rules(a, b);
    const { pair, guidance } = deps.scene(a, b, rules);
    const offered = tags.filter((tag) => tag.group !== "material" || a.tags.includes(tag.id) || b.tags.includes(tag.id));
    const answer = await generateValidated(deps.client, deps.log, {
      purpose: deps.mode === "single" ? "combo-single" : "combo-single-lean",
      system,
      prompt: [
        pair,
        guidance,
        `Names already in the game: ${deps.existingNames().join(", ")}.`,
        ["Tags you may use, and their meanings:", ...offered.map((tag) => `- ${tag.id}: ${tag.meaning}`)].join("\n"),
      ].join("\n\n"),
      schema,
      reject: (value) => check(a, b, value as Parsed, rules, offered),
      maxAttempts: deps.maxAttempts ?? 3,
      temperature: deps.temperature ?? 0.7,
    });
    const value = answer as Parsed;
    const candidates = value.candidates ?? [];
    if (value.no_result || !value.result) {
      return { draft: null, noResult: value.no_result_line, candidates, rationale: value.rationale, mode: null };
    }
    return { draft: { name: value.result.name, description: value.result.description, tags: value.result.tags, missingTag: null }, noResult: null, candidates, rationale: value.rationale, mode: value.result.mode };
  }

  type Parsed = {
    inputs_summary?: string;
    candidates?: { name: string; reason: string }[];
    choice?: { name: string; reason: string };
    result: { name: string; tags: string[]; mode: "ordinary" | "whimsical"; description: string } | null;
    no_result: boolean;
    no_result_line: string;
    rationale: string;
  };

  // What a schema cannot say: the rules of the game, the tags on offer, the choice being one of
  // the candidates, and a rationale that speaks of both inputs.
  function check(a: GameEntry, b: GameEntry, value: Parsed, rules: (draft: ComboDraft) => string | null, offered: Tag[]): string | null {
    if (value.no_result !== (value.result === null)) return "Set no_result to true exactly when result is null.";
    if (value.no_result) return value.no_result_line.trim() === "" ? "Give a short, gentle line for when nothing happens." : null;
    const result = value.result!;
    if (value.no_result_line.trim() !== "") return "Leave no_result_line empty when there is a result.";
    const draft: ComboDraft = { name: result.name, description: result.description, tags: result.tags, missingTag: null };
    const broken = rules(draft) ?? voiceCheck(result.description, result.name);
    if (broken) return broken;
    const allowed = new Set(offered.map((tag) => tag.id));
    const stray = result.tags.find((tag) => !allowed.has(tag));
    if (stray) return `The tag "${stray}" is not on offer for this pair. Use only the listed tags.`;
    if (value.candidates) {
      const names = value.candidates.map((candidate) => slugify(candidate.name));
      if (new Set(names).size !== names.length) return "The three candidates must be different from each other.";
      if (value.choice && !names.includes(slugify(value.choice.name))) return "The choice must be one of the three candidates.";
      if (value.choice && slugify(value.choice.name) !== slugify(result.name)) return "The result must be the thing you chose.";
    }
    if (!namesBoth(value.rationale, a.name, b.name)) return `The rationale must speak of both ${a.name} and ${b.name}. A result that reflects only one input is wrong.`;
    return null;
  }

  return { write, system, schema };
}

