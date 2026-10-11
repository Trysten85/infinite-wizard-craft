import { comboKey, type BakedCombo, type GameEntry } from "../shared/schema";
import { rankCandidates, settle } from "./bakeRank";
import type { Blocklist } from "./blocklist";
import { comboRules } from "./combiner";
import { pairShare } from "./comboContext";
import { createComboSteps, FAIRY_WHY, type Idea } from "./comboGenerator";
import type { GameData } from "./gameData";
import { GenerationError } from "./llm/generate";
import type { LlmClient } from "./llm/types";
import type { ModelCall } from "./store";

// Works one pair for the overnight bake, start to finish, and writes down everything about it.
// It uses the game's own steps for suggesting and describing, with the ranking step in between.

type Candidate = Idea & { source: "storybook" | "first round" | "second round"; mark: number | null; reason: string };

export type BakeRecord = {
  pair: string;
  a: { id: string; name: string };
  b: { id: string; name: string };
  at: string;
  model: string;
  // What code decided before the model was asked anything.
  magical: boolean;
  playful: boolean;
  offered: string[];
  storybookChoice: string | null;
  // Every usable suggestion, with the mark and reason the model later gave it.
  candidates: Candidate[];
  // Suggestions the game's rules turned down, each with the rule that did it.
  refused: string[];
  rankEffort: string;
  // The model's own account of why its pick beats the next best. Missing from the first bake.
  comparison?: string;
  // Names passed over because enough pairs make them already.
  capped?: string[];
  keep: string | null;
  pick: Candidate | null;
  runnerUp: Candidate | null;
  description: string | null;
  tags: string[];
  missingTag: string | null;
  wonder: boolean;
  // Why nothing came of the pair, when nothing did.
  failed: string | null;
  steps: { purpose: string; seconds: number; passed: boolean }[];
  seconds: number;
};

export function createBaker(deps: {
  data: GameData;
  voice: string;
  blocklist?: Blocklist;
  // The model as the game uses it, and the same model thinking harder, for the ranking.
  client: LlmClient;
  thinker: LlmClient | null;
  thinkerEffort: string;
  log?: (call: ModelCall) => void;
  // How many pairs already make a thing of this name. Past the cap it is passed over, so that
  // one ingredient's favorite answer cannot win every time.
  usesOf?: (name: string) => number;
}) {
  const { data } = deps;
  const rulesFor = comboRules({ data, blocklist: deps.blocklist });
  // Filled in as the pair in hand is worked on, and emptied for the next.
  let refused: string[] = [];
  let steps: BakeRecord["steps"] = [];
  const log = (call: ModelCall) => {
    steps.push({ purpose: call.purpose, seconds: call.latencyMs / 1000, passed: call.ok });
    deps.log?.(call);
  };
  const combo = createComboSteps({
    client: deps.client,
    log,
    voice: deps.voice,
    tags: data.tags.values(),
    balance: data.balance,
    storybook: data.storybook,
    reservedIds: new Set(data.entries.keys()),
    examples: data.comboExamples,
    trace: (step) => refused.push(...(step.refused ?? [])),
  });

  // A round of suggestions that comes to nothing is not a failure of the pair.
  const quietly = (round: Promise<Idea[]>) =>
    round.catch((err) => {
      if (err instanceof GenerationError) return [] as Idea[];
      throw err;
    });

  async function bakePair(a: GameEntry, b: GameEntry): Promise<BakeRecord> {
    refused = [];
    steps = [];
    const began = Date.now();
    const reject = rulesFor(a, b);
    const { magical, pair, offered, usable, guidance } = combo.scene(a, b, reject);
    const record: BakeRecord = {
      pair: comboKey(a.id, b.id),
      a: { id: a.id, name: a.name },
      b: { id: b.id, name: b.name },
      at: new Date().toISOString(),
      model: deps.client.model,
      magical,
      playful: !magical && pairShare(a, b) < data.balance.generation.twistShare,
      offered,
      storybookChoice: null,
      candidates: [],
      refused: [],
      rankEffort: "none",
      keep: null,
      pick: null,
      runnerUp: null,
      description: null,
      tags: [],
      missingTag: null,
      wonder: false,
      failed: null,
      steps: [],
      seconds: 0,
    };
    const finish = (failed: string | null = null): BakeRecord => ({ ...record, failed, refused, steps, seconds: (Date.now() - began) / 1000 });

    // Candidates: the storybook choice if there is one, then two rounds of the three questions.
    record.storybookChoice = offered.length > 0 ? await combo.pickStorybook(pair, offered) : null;
    const first = await quietly(combo.suggest(pair, guidance, usable, []));
    const second = await quietly(combo.suggest(pair, guidance, usable, first.map((idea) => idea.name)));
    const blank = { mark: null, reason: "" };
    record.candidates = [
      ...(record.storybookChoice ? [{ name: record.storybookChoice, why: FAIRY_WHY, source: "storybook" as const, ...blank }] : []),
      ...first.map((idea) => ({ ...idea, source: "first round" as const, ...blank })),
      ...second.map((idea) => ({ ...idea, source: "second round" as const, ...blank })),
    ];
    if (record.candidates.length === 0) return finish("The model suggested nothing the game's rules allow.");
    // A name enough pairs make already is passed over, unless there is nothing else.
    const cap = data.balance.generation.bakeNameCap;
    const fresh = record.candidates.filter((candidate) => (deps.usesOf?.(candidate.name) ?? 0) < cap);
    if (fresh.length > 0 && fresh.length < record.candidates.length) {
      record.capped = record.candidates.filter((candidate) => !fresh.includes(candidate)).map((candidate) => candidate.name);
      record.candidates = fresh;
    }

    // The model marks its own suggestions and says which it would keep.
    const ranking = await rankCandidates({ thinker: deps.thinker, thinkerEffort: deps.thinkerEffort, fallback: deps.client, log }, pair, magical, record.candidates);
    record.rankEffort = ranking.effort;
    record.comparison = ranking.comparison;
    record.keep = ranking.keep;
    record.candidates = record.candidates.map((candidate) => ({ ...candidate, mark: ranking.marks.get(candidate.name)?.mark ?? null, reason: ranking.marks.get(candidate.name)?.reason ?? "" }));
    const { pick, runnerUp } = settle(record.candidates, ranking);
    record.pick = pick;
    record.runnerUp = runnerUp;

    // The words for the pick, by the same step the game uses.
    try {
      const draft = await combo.describe(a, b, pick, pick.source === "storybook", reject);
      record.description = draft.description;
      record.tags = draft.tags;
      record.missingTag = draft.missingTag;
      record.wonder = draft.storybook === true;
    } catch (err) {
      if (!(err instanceof GenerationError)) throw err;
      return finish(`The description of ${pick.name} kept breaking the rules.`);
    }
    return finish();
  }

  return { bakePair };
}

// A finished pair as a row of the drafts file. A pair that came to nothing has no row.
export function draftOf(record: BakeRecord): BakedCombo | null {
  if (record.failed || !record.pick || !record.description) return null;
  return {
    inputs: [record.a.id, record.b.id],
    // Names are shown with a capital, as the game does with anything the model names.
    name: record.pick.name[0]!.toUpperCase() + record.pick.name.slice(1),
    description: record.description,
    tags: record.tags,
    wonder: record.wonder,
    sense: record.pick.mark,
    reason: record.pick.reason,
    status: "draft",
  };
}

// Adds a row to the drafts, in place of any earlier draft of the same pair. A row that has
// been approved or rejected is a decision someone made, and is left alone.
export function withDraft(rows: BakedCombo[], row: BakedCombo): BakedCombo[] {
  const key = comboKey(...row.inputs);
  const existing = rows.find((item) => comboKey(...item.inputs) === key);
  if (existing && existing.status !== "draft") return rows;
  return existing ? rows.map((item) => (item === existing ? row : item)) : [...rows, row];
}
