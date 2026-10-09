import { z } from "zod";
import { idSchema, slugify } from "../shared/schema";
import type { ComboGrade } from "./comboGrader";

// Helpers for `npm run bench`: a fixed set of pairs to measure combinations against, so that a
// change to a prompt can be judged by what it does and not by a hunch.

export const benchSchema = z.strictObject({
  // Stand-ins for things the model would have made by the time a player reaches these pairs.
  things: z.record(
    idSchema,
    z.strictObject({
      name: z.string().min(1),
      description: z.string().min(1),
      tags: z.array(z.string()),
      madeFrom: z.tuple([idSchema, idSchema]),
      wonder: z.boolean().optional(),
    }),
  ),
  pairs: z.array(
    z.strictObject({
      a: idSchema,
      b: idSchema,
      // Answers known to be right, and answers known to be wrong. Anything else is graded.
      good: z.array(z.string()),
      bad: z.array(z.string()),
    }),
  ),
});
export type Bench = z.infer<typeof benchSchema>;

export type Verdict = "good" | "plausible" | "doubtful" | "bad" | "failed";
export type BenchOutcome = {
  pair: string;
  magical: boolean;
  name: string;
  description: string;
  tags: string[];
  storybook: boolean;
  seconds: number;
  // The model calls this combination took, by kind, with rerolls marked.
  calls: string[];
  // How long each call took, and what was suggested before the pick. Missing from older runs.
  steps?: { purpose: string; seconds: number }[];
  ideas?: string[];
  verdict: Verdict;
  why: string;
};

// What the lists alone say about an answer, or null if it is on neither and needs grading.
export function settle(answer: { name: string; storybook: boolean }, pair: { good: string[]; bad: string[] }, magical: boolean): { verdict: Verdict; why: string } | null {
  const on = (list: string[]) => list.some((item) => slugify(item) === slugify(answer.name));
  if (!magical && answer.storybook) return { verdict: "bad", why: "A storybook thing from an ordinary pair." };
  if (on(pair.bad)) return { verdict: "bad", why: "On the list of wrong answers." };
  if (on(pair.good)) return { verdict: "good", why: "On the list of right answers." };
  return null;
}

// The verdict on an answer the lists did not settle, from the grader's opinion of it.
export function fromGrade(grade: ComboGrade | null): { verdict: Verdict; why: string } {
  if (!grade) return { verdict: "doubtful", why: "The grader gave no answer." };
  if (!grade.realName) return { verdict: "doubtful", why: `Not a real name. ${grade.why}` };
  return { verdict: grade.makesSense ? "plausible" : "doubtful", why: grade.why };
}

const VERDICTS: Verdict[] = ["good", "plausible", "doubtful", "bad", "failed"];
const share = (count: number, total: number) => (total === 0 ? "0" : `${count} (${Math.round((count / total) * 100)}%)`);
const average = (values: number[]) => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length);

export function summarise(outcomes: BenchOutcome[]) {
  const made = outcomes.filter((outcome) => outcome.verdict !== "failed");
  const seconds = made.map((outcome) => outcome.seconds).sort((x, y) => x - y);
  return {
    total: outcomes.length,
    counts: Object.fromEntries(VERDICTS.map((verdict) => [verdict, outcomes.filter((outcome) => outcome.verdict === verdict).length])) as Record<Verdict, number>,
    averageSeconds: average(seconds),
    slowestSeconds: seconds.at(-1) ?? 0,
    // How many different things came out. Far fewer than the pairs means the model is repeating itself.
    distinct: new Set(made.map((outcome) => slugify(outcome.name))).size,
    made: made.length,
    storybook: made.filter((outcome) => outcome.storybook).length,
    rerolls: outcomes.reduce((sum, outcome) => sum + outcome.calls.filter((call) => call.endsWith("(reroll)")).length, 0),
    secondsByStep: [...new Set(outcomes.flatMap((outcome) => (outcome.steps ?? []).map((step) => step.purpose)))].map((purpose) => ({
      purpose,
      seconds: average(outcomes.flatMap((outcome) => (outcome.steps ?? []).filter((step) => step.purpose === purpose).map((step) => step.seconds))),
    })),
  };
}

// The report as Markdown. `before` is the last run, shown beside this one when there is one.
export function renderBenchReport(outcomes: BenchOutcome[], when: string, label: string, before?: { when: string; outcomes: BenchOutcome[] }): string {
  const now = summarise(outcomes);
  const then = before && summarise(before.outcomes);
  const row = (title: string, value: (summary: ReturnType<typeof summarise>) => string) => `| ${title} | ${value(now)} |${then ? ` ${value(then)} |` : ""}`;
  const earlier = new Map((before?.outcomes ?? []).map((outcome) => [outcome.pair, outcome]));
  const lines = [
    `# Combination bench, ${when}`,
    "",
    label,
    "",
    `| | This run |${before ? ` Last run (${before.when}) |` : ""}`,
    `|---|---|${before ? "---|" : ""}`,
    row("Good (on the list of right answers)", (s) => share(s.counts.good, s.total)),
    row("Plausible (graded as making sense)", (s) => share(s.counts.plausible, s.total)),
    row("Doubtful (graded as not making sense)", (s) => share(s.counts.doubtful, s.total)),
    row("Bad (on the list of wrong answers, or magic from nowhere)", (s) => share(s.counts.bad, s.total)),
    row("Failed outright", (s) => String(s.counts.failed)),
    row("Seconds per new combination, average", (s) => s.averageSeconds.toFixed(1)),
    row("Seconds, slowest", (s) => s.slowestSeconds.toFixed(1)),
    row("Different results", (s) => `${s.distinct} from ${s.made} pairs`),
    row("Storybook results", (s) => String(s.storybook)),
    row("Rerolls", (s) => String(s.rerolls)),
    ...now.secondsByStep.map((step) => `| Seconds per ${step.purpose} call | ${step.seconds.toFixed(1)} |${then ? ` ${then.secondsByStep.find((item) => item.purpose === step.purpose)?.seconds.toFixed(1) ?? ""} |` : ""}`),
    "",
    "Good and bad come from the lists in `data/combo-bench.json`. Move an answer below onto one of them to settle it for next time.",
    "",
    "## Every pair",
    "",
    `| Pair | Result | Verdict | Seconds |${before ? " Last run |" : ""}`,
    `|---|---|---|---|${before ? "---|" : ""}`,
    ...outcomes.map((outcome) => {
      const last = earlier.get(outcome.pair);
      const lastCell = before ? ` ${last ? `${last.name} (${last.verdict})` : ""} |` : "";
      return `| ${outcome.pair}${outcome.magical ? " ✦" : ""} | ${outcome.name}${outcome.storybook ? " (storybook)" : ""} | ${outcome.verdict.toUpperCase()} | ${outcome.seconds.toFixed(1)} |${lastCell}`;
    }),
    "",
    "✦ marks a pair with magic in it.",
    "",
    "## In full",
    "",
    ...outcomes.flatMap((outcome) => [
      `### ${outcome.pair} = ${outcome.name}`,
      "",
      `**${outcome.verdict.toUpperCase()}.** ${outcome.why}`,
      "",
      outcome.description,
      "",
      ...(outcome.ideas && outcome.ideas.length > 0 ? [`Ideas: ${outcome.ideas.join(" | ")}`, ""] : []),
      `Tags: ${outcome.tags.join(", ") || "none"}. Calls: ${(outcome.steps ? outcome.steps.map((step, index) => `${outcome.calls[index]} ${step.seconds.toFixed(1)}s`) : outcome.calls).join(", ") || "none"}.`,
      "",
    ]),
  ];
  return lines.join("\n");
}
