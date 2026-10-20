import { comboKey, type BakedCombo, type ComboDraft, type ComboExample, type GameEntry } from "../shared/schema";
import { rankCandidates, settle } from "./bakeRank";
import type { Blocklist } from "./blocklist";
import { comboRules } from "./combiner";
import { pairShare } from "./comboContext";
import { createComboSteps, FAIRY_WHY, type Idea } from "./comboGenerator";
import { createSingleCall, type SingleMode } from "./comboSingle";
import type { GameData } from "./gameData";
import { GenerationError } from "./llm/generate";
import type { LlmClient } from "./llm/types";
import type { ModelCall } from "./store";

// Works one pair for the overnight bake, start to finish, and writes down everything about it.
// It uses the game's own steps for suggesting and describing, with the ranking step in between.

type Candidate = Idea & { source: "storybook" | "first round" | "second round" | "single call"; mark: number | null; reason: string };

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
  // The model thinking the candidates over before it marked or chose any. Missing from the first bake.
  weighing?: string;
  // Names passed over because enough pairs make them already.
  capped?: string[];
  keep: string | null;
  pick: Candidate | null;
  runnerUp: Candidate | null;
  description: string | null;
  tags: string[];
  missingTag: string | null;
  wonder: boolean;
  // How the pair was made: the multi-call pipeline, or the single reasoning-first call.
  way?: "pipeline" | SingleMode;
  // For the reviewer only, never an example or a label: why the single call chose its result.
  rationale?: string;
  // The gentle line, when the single call found no sensible result.
  noResult?: string;
  // The flags that kept every candidate from passing the gate, when none did. The first pick
  // stands as a draft, marked as needing alternatives.
  queued?: string[];
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
  // The flags that would make a finished row be written again, for the pair's own row. With
  // none, the first pick stands.
  gate?: (row: BakedCombo) => string[];
  // Approved pairs shown as examples beside the hand-written ones, results too many pairs give
  // already, and wrong answers shown beside the right ones.
  extraExamples?: ComboExample[];
  avoid?: Set<string>;
  dont?: string[];
  // The pipeline, or one of the single-call ways. Names already in the game, for the single call.
  way?: "pipeline" | SingleMode;
  existingNames?: () => string[];
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
    examples: [...data.comboExamples, ...(deps.extraExamples ?? [])],
    avoid: deps.avoid,
    dont: deps.dont,
    trace: (step) => refused.push(...(step.refused ?? [])),
  });

  const single =
    deps.way && deps.way !== "pipeline"
      ? createSingleCall({
          client: deps.client,
          log,
          voice: deps.voice,
          tags: data.tags.values(),
          maxTags: data.balance.generation.maxTags,
          blocklist: deps.blocklist,
          scene: (a, b, reject) => combo.scene(a, b, reject),
          rules: (a, b) => rulesFor(a, b),
          existingNames: deps.existingNames ?? (() => [...data.entries.values()].map((entry) => entry.name)),
          mode: deps.way,
        })
      : null;

  // A round of suggestions that comes to nothing is not a failure of the pair.
  // (Pipeline only: the single call does its own reasoning.)
  const quietly = (round: Promise<Idea[]>) =>
    round.catch((err) => {
      if (err instanceof GenerationError) return [] as Idea[];
      throw err;
    });

  // The single call: one reasoning-first answer, laid out as the same record the pipeline writes.
  async function bakeSingle(a: GameEntry, b: GameEntry): Promise<BakeRecord> {
    const began = Date.now();
    const { magical, offered } = combo.scene(a, b, rulesFor(a, b));
    const record: BakeRecord = {
      pair: comboKey(a.id, b.id),
      a: { id: a.id, name: a.name },
      b: { id: b.id, name: b.name },
      at: new Date().toISOString(),
      model: deps.client.model,
      way: deps.way,
      magical,
      playful: false,
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
    let answer: Awaited<ReturnType<NonNullable<typeof single>["write"]>>;
    try {
      answer = await single!.write(a, b);
    } catch (err) {
      if (!(err instanceof GenerationError)) throw err;
      return finish("The single call kept breaking the rules.");
    }
    record.candidates = answer.candidates.map((candidate) => ({ name: candidate.name, why: candidate.reason, source: "single call" as const, mark: null, reason: candidate.reason }));
    record.rationale = answer.rationale;
    if (!answer.draft) {
      record.noResult = answer.noResult ?? "Nothing happens.";
      return finish();
    }
    const pick: Candidate = { name: answer.draft.name, why: "", source: "single call", mark: null, reason: answer.rationale };
    record.pick = pick;
    record.keep = pick.name;
    record.description = answer.draft.description;
    record.tags = answer.draft.tags;
    const flags = deps.gate?.(rowOf(record, pick, answer.draft)) ?? [];
    if (flags.length > 0) record.queued = flags;
    return finish();
  }

  async function bakePair(a: GameEntry, b: GameEntry): Promise<BakeRecord> {
    if (single) return bakeSingle(a, b);
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
    record.weighing = ranking.weighing;
    record.keep = ranking.keep;
    record.candidates = record.candidates.map((candidate) => ({ ...candidate, mark: ranking.marks.get(candidate.name)?.mark ?? null, reason: ranking.marks.get(candidate.name)?.reason ?? "" }));
    const { pick, runnerUp } = settle(record.candidates, ranking);
    record.pick = pick;
    record.runnerUp = runnerUp;

    // The words for the pick, by the same step the game uses. A pick whose finished row the gate
    // flags gives way to the next best candidate, up to a few tries. If none passes, the first
    // pick stands and the row is marked as needing alternatives.
    const order = [pick, ...[...record.candidates].filter((candidate) => candidate !== pick).sort((x, y) => (y.mark ?? 0) - (x.mark ?? 0))].slice(0, data.balance.generation.gateTries);
    let firstTry: { candidate: Candidate; draft: ComboDraft; flags: string[] } | null = null;
    let accepted = false;
    for (const candidate of order) {
      let draft: ComboDraft;
      try {
        draft = await combo.describe(a, b, candidate, candidate.source === "storybook", reject);
      } catch (err) {
        if (!(err instanceof GenerationError)) throw err;
        if (!firstTry && candidate === pick) return finish(`The description of ${pick.name} kept breaking the rules.`);
        continue;
      }
      const flags = deps.gate?.(rowOf(record, candidate, draft)) ?? [];
      firstTry ??= { candidate, draft, flags };
      if (flags.length === 0) {
        accepted = true;
        record.pick = candidate;
        record.runnerUp = candidate === pick ? runnerUp : pick;
        Object.assign(record, { description: draft.description, tags: draft.tags, missingTag: draft.missingTag, wonder: draft.storybook === true });
        break;
      }
    }
    if (!accepted && firstTry) {
      Object.assign(record, { description: firstTry.draft.description, tags: firstTry.draft.tags, missingTag: firstTry.draft.missingTag, wonder: firstTry.draft.storybook === true, queued: firstTry.flags });
    }
    return finish();
  }

  // The words for a name that has already been settled on: a new description, and tags, under
  // the game's rules for any other. A worn-out phrase or a long description is sent back to be
  // written again, so it never reaches a reviewer.
  async function describePair(a: GameEntry, b: GameEntry, name: string, storybook = false): Promise<ComboDraft> {
    refused = [];
    steps = [];
    const reject = rulesFor(a, b);
    return combo.describe(a, b, { name, why: "" }, storybook, reject);
  }

  return { bakePair, describePair };
}

// The row a candidate would make, for the gate to look at.
function rowOf(record: BakeRecord, candidate: Candidate, draft: ComboDraft): BakedCombo {
  return {
    inputs: [record.a.id, record.b.id],
    name: candidate.name[0]!.toUpperCase() + candidate.name.slice(1),
    description: draft.description,
    tags: draft.tags,
    wonder: draft.storybook === true,
    sense: candidate.mark,
    reason: candidate.reason,
    status: "draft",
  };
}

// A finished pair as a row of the drafts file. A pair that came to nothing has no row.
export function draftOf(record: BakeRecord): BakedCombo | null {
  // A pair the single call found no sensible result for is kept as a no-result row, to be
  // confirmed. Its line is what the game would say.
  if (record.noResult) {
    return { inputs: [record.a.id, record.b.id], name: "Nothing", description: record.noResult, tags: [], wonder: false, sense: null, reason: record.rationale ?? "", status: "draft", notes: "the model found no result: confirm with x", source: "model" };
  }
  if (record.failed || !record.pick || !record.description) return null;
  return {
    ...(record.queued ? { notes: `needs alternatives: ${record.queued.join("; ")}` } : {}),
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
