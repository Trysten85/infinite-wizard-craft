import { z } from "zod";
import { generateValidated, GenerationError } from "./llm/generate";
import type { LlmClient } from "./llm/types";
import type { ModelCall } from "./store";
import { countSentences } from "./voice";

// The step the overnight bake adds to naming a combination: the model looks over the candidates
// for a pair, gives each a mark out of five with its reason, and says which one it would keep.
// There is time overnight for it to think harder about this than it can while a player waits.

export type Mark = { mark: number; reason: string };
export type Ranking = {
  marks: Map<string, Mark>;
  // The model thinking the candidates over, written before it has marked or chosen anything.
  // Its own account, not proof, but an account of weighing them up and not of defending a pick.
  weighing: string;
  // The candidate the model said it would keep. Not always the one it marked highest.
  keep: string | null;
  // How hard it was thinking: the level asked for, "low" if that failed, "none" if both did.
  effort: string;
};

const INSTRUCTIONS = [
  "This is a cozy crafting game. A player puts two things together and one new thing comes out.",
  "Below are the two things, and a list of suggested results with the thinking behind each.",
  "First, weigh them up in two or three sentences, before you mark or choose anything.",
  "Say what each of the two things really is, which suggestions owe something to both of them and which only to one, and what is making this pair easy or hard.",
  "You have not chosen yet. Do not argue for a winner: think it through.",
  "Keep the weighing to those two or three plain sentences. No list, and no marks in it: the marks come next.",
  "Then mark each suggestion out of five for how much sense it makes:",
  "- five: nearly any child would give this answer straight away",
  "- four: a clear, natural result of both things",
  "- three: reasonable, though it takes a moment to see",
  "- two: a stretch, or it really comes from only one of the two",
  "- one: unconnected, or not a real thing at all",
  "A good result owes something to both things. Mark down a name that only plays on the two names, or one nobody would really say.",
  "If the pair has magic in it, a well-known storybook thing that comes of both is a good result.",
  "For each suggestion give your reason in one sentence first, and then the mark.",
  "Last, say which single suggestion you would keep.",
].join("\n");

export async function rankCandidates(
  deps: { thinker: LlmClient | null; thinkerEffort: string; fallback: LlmClient; log: (call: ModelCall) => void },
  pair: string,
  magical: boolean,
  candidates: { name: string; why: string }[],
): Promise<Ranking> {
  const names = candidates.map((candidate) => candidate.name) as [string, ...string[]];
  const schema = z.strictObject({
    // First of all, before any mark or choice: this is the model working it out, so that what it
    // writes is its reasoning and not a defense of something it has already decided.
    weighing: z.string().min(1).max(700),
    marks: z.array(z.strictObject({ name: z.enum(names), reason: z.string().min(1).max(400), mark: z.number().int().min(1).max(5) })).length(names.length),
    keep: z.enum(names),
  });
  const prompt = [
    pair,
    magical ? "This pair has magic in it." : "This pair has no magic in it.",
    ["Suggested results:", ...candidates.map((candidate) => `- ${candidate.name}: ${candidate.why}`)].join("\n"),
  ].join("\n\n");

  const attempts: [LlmClient, string][] = deps.thinker ? [[deps.thinker, deps.thinkerEffort], [deps.fallback, "low"]] : [[deps.fallback, "low"]];
  for (const [client, effort] of attempts) {
    try {
      const answer = await generateValidated(client, deps.log, {
        purpose: "bake-rank",
        system: INSTRUCTIONS,
        prompt,
        schema,
        reject: (value) => {
          if (new Set(value.marks.map((item) => item.name)).size !== names.length) return "Mark every suggestion once, and only once.";
          // The weighing is thinking, not the verdicts written out early.
          if (countSentences(value.weighing) > 4 || /[\n*]/.test(value.weighing)) return "Keep the weighing to two or three plain sentences, with no list and no marks in it.";
          return null;
        },
        maxAttempts: 2,
        temperature: 0,
      });
      return { marks: new Map(answer.marks.map((item) => [item.name, { mark: item.mark, reason: item.reason }])), weighing: answer.weighing, keep: answer.keep, effort };
    } catch (err) {
      // Anything but a run of bad answers (a stop, for one) is not this step's to deal with.
      if (!(err instanceof GenerationError)) throw err;
    }
  }
  return { marks: new Map(), weighing: "", keep: null, effort: "none" };
}

// Settles on one candidate from a ranking: the highest mark, and among equals the one the model
// said it would keep, and failing that the earliest. With no ranking at all, the first candidate.
export function settle<T extends { name: string }>(candidates: T[], ranking: Ranking): { pick: T; runnerUp: T | null } {
  const markOf = (candidate: T) => ranking.marks.get(candidate.name)?.mark ?? 0;
  const order = [...candidates].sort((x, y) => markOf(y) - markOf(x) || Number(y.name === ranking.keep) - Number(x.name === ranking.keep) || candidates.indexOf(x) - candidates.indexOf(y));
  return { pick: order[0]!, runnerUp: order[1] ?? null };
}
