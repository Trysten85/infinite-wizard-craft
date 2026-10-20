import { slugify } from "../shared/schema";
import { isBanned, overusedIn, type Banned } from "./names";
import { countSentences } from "./voice";

// Scoring a round of baking against the held-out pairs: pairs Trysten has approved, never seeded
// and never shown to the model, so what the model gives for them can be held to his answer.

export type Scored = {
  key: string;
  // Trysten's answer. Null for a probe, which has a rule instead.
  expected: string | null;
  // The model's answer, or null when it found no result or failed.
  got: string | null;
  noResult: boolean;
  failed: boolean;
  description: string;
  tags: string[];
  expectedTags: string[];
  seconds: number;
};

export type ScoreContext = {
  banned: Banned;
  overused: string[];
  maxSentences: number;
  // Results too many pairs gave in the last round.
  attractors: Set<string>;
  // The game's one spelling of a name, so "salt water" matches Saltwater.
  canonical: (name: string) => string;
};

const same = (x: string, y: string, context: ScoreContext) => slugify(context.canonical(x)) === slugify(context.canonical(y));

// The checks the spec names: Water + Salt gives Saltwater, and Steam + Salt does not give Sea.
export const PROBES: { key: string; rule: "is" | "is-not"; name: string }[] = [
  { key: "salt+water", rule: "is", name: "Saltwater" },
  { key: "salt+steam", rule: "is-not", name: "Sea" },
];

export function scoreRound(held: Scored[], probes: Scored[], context: ScoreContext) {
  const answered = held.filter((item) => item.got !== null);
  const matched = held.filter((item) => item.expected !== null && item.got !== null && same(item.expected, item.got, context));
  const live = [...held, ...probes].filter((item) => item.got !== null);
  const tagged = answered.filter((item) => item.expectedTags.length > 0);
  const overlap = tagged.filter((item) => item.tags.some((tag) => item.expectedTags.includes(tag)));
  const seconds = [...held, ...probes].reduce((sum, item) => sum + item.seconds, 0);
  const probeResults = PROBES.map((probe) => {
    const found = probes.find((item) => item.key === probe.key);
    const got = found?.got ?? null;
    const ok = probe.rule === "is" ? got !== null && same(got, probe.name, context) : got === null || !same(got, probe.name, context);
    return { ...probe, got, ok, ran: found !== undefined };
  });
  return {
    pairs: held.length,
    // Approval: the share of held-out pairs where the model gave Trysten's answer.
    matched: matched.length,
    matchRate: held.length === 0 ? 0 : matched.length / held.length,
    noResult: held.filter((item) => item.noResult).length,
    failed: held.filter((item) => item.failed).length,
    tagOverlap: tagged.length === 0 ? 0 : overlap.length / tagged.length,
    attractors: live.filter((item) => context.attractors.has(item.got!.toLowerCase())).length,
    banned: live.filter((item) => isBanned(item.got!, context.banned)).length,
    tooLong: live.filter((item) => countSentences(item.description) > context.maxSentences).length,
    wornShare: live.length === 0 ? 0 : live.filter((item) => overusedIn(item.description, context.overused)).length / live.length,
    secondsEach: held.length + probes.length === 0 ? 0 : seconds / (held.length + probes.length),
    probes: probeResults,
  };
}

export type Summary = ReturnType<typeof scoreRound>;

const pct = (share: number) => `${Math.round(share * 100)}%`;

export function renderScore(way: string, summary: Summary, held: Scored[]): string {
  return [
    `# Round 2 score: ${way}`,
    "",
    `Held-out pairs: ${summary.pairs}. Gave Trysten's answer: ${summary.matched} (${pct(summary.matchRate)}). No result: ${summary.noResult}. Failed outright: ${summary.failed}.`,
    `Tags overlapping his: ${pct(summary.tagOverlap)}. Results that are round-1 attractors: ${summary.attractors}. On the banned list: ${summary.banned}.`,
    `Descriptions over the sentence limit: ${summary.tooLong}. Leaning on worn-out words: ${pct(summary.wornShare)}. Seconds a pair: ${summary.secondsEach.toFixed(1)}.`,
    "",
    ...summary.probes.map((probe) => `- ${probe.key} ${probe.rule === "is" ? "should be" : "should not be"} ${probe.name}: ${probe.ran ? `gave ${probe.got ?? "nothing"}, ${probe.ok ? "ok" : "WRONG"}` : "not run"}`),
    "",
    "| Pair | His answer | The model's | Seconds |",
    "|---|---|---|---|",
    ...held.map((item) => `| ${item.key} | ${item.expected ?? ""} | ${item.noResult ? "(no result)" : (item.got ?? "(failed)")} | ${item.seconds.toFixed(1)} |`),
    "",
  ].join("\n");
}
