import { describe, expect, it, vi } from "vitest";
import { createBaker, draftOf, withDraft } from "../src/server/bake";
import { createCallRecorder, systemIdOf, type KeptCall } from "../src/server/bakeLog";
import { createPacer } from "../src/server/bakePace";
import { bakePairs } from "../src/server/bakePairs";
import { rankCandidates, settle } from "../src/server/bakeRank";
import { createCombiner } from "../src/server/combiner";
import { buildGameData, readGameFiles } from "../src/server/gameData";
import { createFakeClient } from "../src/server/llm/fake";
import { generateValidated, StopRequested } from "../src/server/llm/generate";
import { openStore } from "../src/server/store";
import { comboKey, type BakedCombo, type ComboDraft } from "../src/shared/schema";
import { z } from "zod";
import { data } from "./helpers";

const entry = (id: string) => data.entries.get(id)!;
const ideas = (made: string, place: string, thing: string) =>
  JSON.stringify({ made: { why: `how the two make ${made}`, name: made }, place: { why: `where ${place} is`, name: place }, thing: { why: `what ${thing} is`, name: thing } });
const marks = (given: Record<string, number>, keep: string) =>
  JSON.stringify({ marks: Object.entries(given).map(([name, mark]) => ({ name, reason: `${name} because`, mark })), weighing: "Both are sand and water. Some of these only use one.", keep });
// Sand is a mineral, so a result of sand may be tagged as one. A tree and Life offer no such tag.
const words = (name: string, tags: string[] = name === "Treant" || name === "Sapling" ? [] : ["mineral"]) => JSON.stringify({ name, description: "Sand at the edge of the water.", tags, missingTag: null });
const baker = (answers: (string | Error)[], thinking: (string | Error)[] | null = null) => {
  const client = createFakeClient(answers);
  const thinker = thinking ? createFakeClient(thinking) : null;
  return { client, thinker, ...createBaker({ data, voice: "v", client, thinker, thinkerEffort: "medium" }) };
};

describe("the pairs the bake works through", () => {
  const pairs = bakePairs(data);
  const keys = pairs.map(([a, b]) => comboKey(a.id, b.id));

  it("are the basic things two at a time, a thing with itself included, less those with a recipe", () => {
    expect(pairs.length).toBeGreaterThan(600);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("fire+fire");
    expect(keys).toContain("sand+water");
    for (const key of keys) expect(data.combos.has(key), key).toBe(false);
    for (const [a, b] of pairs) for (const thing of [a, b]) expect(["element", "material", "focus"], thing.id).toContain(thing.kind);
  });

  it("come shallowest first", () => {
    const deepest = pairs.map(([a, b]) => Math.max(a.depth, b.depth));
    expect(deepest).toEqual([...deepest].sort((x, y) => x - y));
    expect(pairs[0]!.every((thing) => data.balance.startingEntries.includes(thing.id))).toBe(true);
  });
});

describe("baking one pair", () => {
  it("gathers two rounds of suggestions, has them marked, and writes up the best", async () => {
    const { client, thinker, bakePair } = baker([ideas("Mud", "Beach", "Sandcastle"), ideas("Shore", "Lagoon", "Shell"), words("Beach")], [marks({ Beach: 5, Sandcastle: 4, Shore: 4, Lagoon: 2, Shell: 3 }, "Beach")]);
    const record = await bakePair(entry("sand"), entry("water"));
    expect(record).toMatchObject({ pair: "sand+water", a: { name: "Sand" }, b: { name: "Water" }, magical: false, offered: [], storybookChoice: null, failed: null });
    expect(record.candidates.map((candidate) => [candidate.name, candidate.source, candidate.mark])).toEqual([
      ["Beach", "first round", 5],
      ["Sandcastle", "first round", 4],
      ["Shore", "second round", 4],
      ["Lagoon", "second round", 2],
      ["Shell", "second round", 3],
    ]);
    // Mud is a hand-written thing, so the rules turned it down, and the record says so.
    expect(record.refused.join(" ")).toContain("Mud");
    expect(record.pick).toMatchObject({ name: "Beach", mark: 5, reason: "Beach because", why: "where Beach is" });
    expect(record.runnerUp!.name).toBe("Sandcastle");
    expect(record).toMatchObject({ rankEffort: "medium", keep: "Beach", weighing: "Both are sand and water. Some of these only use one.", description: "Sand at the edge of the water.", tags: ["mineral"], wonder: false });
    expect(record.steps.map((step) => step.purpose)).toEqual(["combo-ideas", "combo-ideas", "bake-rank", "combo"]);
    expect(record.seconds).toBeGreaterThanOrEqual(0);
    // The ranking went to the harder-thinking model, and the second round was told what the first said.
    expect(thinker!.requests).toHaveLength(1);
    expect(thinker!.requests[0]!.prompt).toContain("- Shore: how the two make Shore");
    expect(client.requests[1]!.prompt).toContain("Not these, which were turned down: Beach, Sandcastle.");
  });

  it("puts a storybook choice in with the rest, and marks the result as magical only if it wins", async () => {
    const won = baker([JSON.stringify({ choice: "Treant" }), ideas("Sapling", "Grove", "Acorn"), ideas("Orchard", "Nursery", "Bud"), words("Treant")], [
      marks({ Treant: 5, Sapling: 4, Grove: 3, Acorn: 3, Orchard: 2, Nursery: 2, Bud: 2 }, "Treant"),
    ]);
    const record = await won.bakePair(entry("tree"), entry("life"));
    expect(record).toMatchObject({ magical: true, storybookChoice: "Treant", wonder: true });
    expect(record.offered).toContain("Treant");
    expect(record.candidates[0]).toMatchObject({ name: "Treant", source: "storybook" });
    expect(won.thinker!.requests[0]!.prompt).toContain("This pair has magic in it.");

    const lost = baker([JSON.stringify({ choice: "Treant" }), ideas("Sapling", "Grove", "Acorn"), ideas("Orchard", "Nursery", "Bud"), words("Sapling")], [
      marks({ Treant: 3, Sapling: 5, Grove: 3, Acorn: 3, Orchard: 2, Nursery: 2, Bud: 2 }, "Sapling"),
    ]);
    expect(await lost.bakePair(entry("tree"), entry("life"))).toMatchObject({ pick: { name: "Sapling" }, wonder: false });
  });

  it("passes over a name enough pairs make already, unless there is nothing else", async () => {
    const answers = () => [ideas("Beach", "Coast", "Shell"), ideas("Shore", "Lagoon", "Dune"), marks({ Coast: 3, Shell: 2, Shore: 4, Lagoon: 2, Dune: 3 }, "Shore"), words("Shore")];
    const client = createFakeClient(answers());
    const capped = createBaker({ data, voice: "v", client, thinker: null, thinkerEffort: "low", usesOf: (name) => (name === "Beach" ? data.balance.generation.bakeNameCap : 0) });
    const record = await capped.bakePair(entry("sand"), entry("water"));
    expect(record.capped).toEqual(["Beach"]);
    expect(record.candidates.map((candidate) => candidate.name)).not.toContain("Beach");
    expect(client.requests[2]!.prompt).not.toContain("Beach");
    expect(record.pick!.name).toBe("Shore");
    // If every candidate is over the cap, the cap gives way.
    const all = createBaker({ data, voice: "v", client: createFakeClient([ideas("Beach", "Coast", "Shell"), ideas("Shore", "Lagoon", "Dune"), marks({ Beach: 5, Coast: 3, Shell: 2, Shore: 4, Lagoon: 2, Dune: 3 }, "Beach"), words("Beach")]), thinker: null, thinkerEffort: "low", usesOf: () => 99 });
    const kept = await all.bakePair(entry("sand"), entry("water"));
    expect(kept.capped).toBeUndefined();
    expect(kept.pick!.name).toBe("Beach");
  });

  it("falls back to ordinary thinking if the harder kind fails, and says so", async () => {
    const slow = new Error("The operation was aborted due to timeout");
    const { bakePair } = baker([ideas("Beach", "Coast", "Shell"), ideas("Shore", "Lagoon", "Dune"), marks({ Beach: 4, Coast: 3, Shell: 2, Shore: 4, Lagoon: 2, Dune: 3 }, "Shore"), words("Shore")], [slow, slow]);
    const record = await bakePair(entry("sand"), entry("water"));
    expect(record.rankEffort).toBe("low");
    // Two share the top mark, so the one the model said it would keep is the pick.
    expect(record.pick!.name).toBe("Shore");
    expect(record.runnerUp!.name).toBe("Beach");
  });

  it("takes the first suggestion, unmarked, if it cannot be ranked at all", async () => {
    const broken = new Error("no answer");
    const { bakePair } = baker([ideas("Beach", "Coast", "Shell"), ideas("Shore", "Lagoon", "Dune"), broken, broken, words("Beach")], [broken, broken]);
    const record = await bakePair(entry("sand"), entry("water"));
    expect(record).toMatchObject({ rankEffort: "none", keep: null, pick: { name: "Beach", mark: null }, failed: null });
    expect(draftOf(record)).toMatchObject({ name: "Beach", sense: null, status: "draft" });
  });

  it("records a pair that came to nothing, and makes no draft of it", async () => {
    const { bakePair } = baker(Array.from({ length: 6 }, () => ideas("Mud", "Mud", "Steam")));
    const record = await bakePair(entry("sand"), entry("water"));
    expect(record.failed).toMatch(/nothing the game's rules allow/);
    expect(record.pick).toBeNull();
    expect(record.steps.length).toBeGreaterThan(0);
    expect(draftOf(record)).toBeNull();
  });

  it("lets a stop go straight up, instead of treating it as a bad answer", async () => {
    const { bakePair } = baker([new StopRequested("stopped")]);
    await expect(bakePair(entry("sand"), entry("water"))).rejects.toBeInstanceOf(StopRequested);
    const client = createFakeClient([new StopRequested("stopped"), "{}"]);
    await expect(generateValidated(client, () => {}, { purpose: "x", system: "s", prompt: "p", schema: z.strictObject({}), maxAttempts: 3, temperature: 0 })).rejects.toBeInstanceOf(StopRequested);
    expect(client.requests).toHaveLength(1);
  });
});

describe("ranking", () => {
  const candidates = [{ name: "Beach", why: "sand by the sea" }, { name: "Shore", why: "where they meet" }];

  it("asks for a reason before each mark, and for every candidate to be marked once", async () => {
    const client = createFakeClient([marks({ Beach: 5 }, "Beach").replace("]", ',{"name":"Beach","reason":"again","mark":4}]'), marks({ Beach: 5, Shore: 3 }, "Beach")]);
    const ranking = await rankCandidates({ thinker: null, thinkerEffort: "medium", fallback: client, log: () => {} }, "Combine these two:\n1. Sand\n2. Water", false, candidates);
    expect(ranking.marks.get("Shore")).toEqual({ mark: 3, reason: "Shore because" });
    expect(ranking).toMatchObject({ keep: "Beach", effort: "low" });
    expect(client.requests[1]!.prompt).toContain("Mark every suggestion once");
    const schema = JSON.stringify(client.requests[0]!.jsonSchema);
    expect(schema.indexOf('"reason"')).toBeLessThan(schema.indexOf('"mark"'));
    // The weighing-up comes first of all, before any mark or pick, so it is the model working
    // the pair out and not defending a choice it has already made.
    expect(schema.indexOf('"weighing"')).toBeLessThan(schema.indexOf('"marks"'));
    expect(schema.indexOf('"marks"')).toBeLessThan(schema.indexOf('"keep"'));
    expect(ranking.weighing).toBe("Both are sand and water. Some of these only use one.");
    expect(client.requests[0]!.system).toContain("before you mark or choose anything");
    expect(client.requests[0]!.system).toContain("Do not argue for a winner");
    expect(client.requests[0]!.prompt).toContain("This pair has no magic in it.");
    expect(client.requests[0]!.temperature).toBe(0);
  });

  it("sends back a weighing that has turned into the verdicts written out early", async () => {
    const rambling = JSON.stringify({ marks: [{ name: "Beach", reason: "r", mark: 5 }, { name: "Shore", reason: "r", mark: 3 }], weighing: "Sand and water.\n**Evaluations**\n- Beach: 5\n- Shore: 3", keep: "Beach" });
    const client = createFakeClient([rambling, marks({ Beach: 5, Shore: 3 }, "Beach")]);
    const ranking = await rankCandidates({ thinker: null, thinkerEffort: "medium", fallback: client, log: () => {} }, "Combine these two:\n1. Sand\n2. Water", false, candidates);
    expect(ranking.weighing).toBe("Both are sand and water. Some of these only use one.");
    expect(client.requests[1]!.prompt).toContain("two or three plain sentences");
  });

  it("settles on the highest mark, then the one the model would keep, then the earliest", () => {
    const three = [{ name: "A" }, { name: "B" }, { name: "C" }];
    const ranked = (given: Record<string, number>, keep: string | null) => ({ marks: new Map(Object.entries(given).map(([name, mark]) => [name, { mark, reason: "" }])), weighing: "", keep, effort: "medium" });
    expect(settle(three, ranked({ A: 2, B: 5, C: 4 }, "A"))).toEqual({ pick: { name: "B" }, runnerUp: { name: "C" } });
    expect(settle(three, ranked({ A: 4, B: 4, C: 4 }, "C")).pick.name).toBe("C");
    expect(settle(three, ranked({ A: 4, B: 4, C: 1 }, "C")).pick.name).toBe("A");
    expect(settle(three, ranked({}, null))).toEqual({ pick: { name: "A" }, runnerUp: { name: "B" } });
    expect(settle([{ name: "A" }], ranked({ A: 3 }, "A")).runnerUp).toBeNull();
  });
});

describe("the drafts file", () => {
  const row = (inputs: [string, string], name: string, status: BakedCombo["status"] = "draft"): BakedCombo => ({ inputs, name, description: "A thing.", tags: [], wonder: false, sense: 4, reason: "Fits.", status });

  it("takes a new draft, replaces an old draft of the same pair, and leaves a decision alone", () => {
    const rows = withDraft([], row(["sand", "water"], "Beach"));
    expect(rows).toHaveLength(1);
    // The same pair the other way round is the same pair.
    expect(withDraft(rows, row(["water", "sand"], "Shore")).map((item) => item.name)).toEqual(["Shore"]);
    const decided = [row(["sand", "water"], "Beach", "ok"), row(["air", "air"], "Wind", "rejected")];
    expect(withDraft(withDraft(decided, row(["sand", "water"], "Shore")), row(["air", "air"], "Gale"))).toEqual(decided);
    expect(withDraft(decided, row(["fire", "fire"], "Bonfire"))).toHaveLength(3);
  });
});

describe("approved bakes in the game", () => {
  const baked: BakedCombo[] = [
    { inputs: ["sand", "water"], name: "Beach", description: "Sand at the water's edge.", tags: ["mineral"], wonder: false, sense: 5, reason: "Obvious.", status: "ok" },
    { inputs: ["salt", "water"], name: "Beach", description: "A second way to the same place.", tags: [], wonder: false, sense: 4, reason: "Fine.", status: "ok" },
    { inputs: ["tree", "life"], name: "Treant", description: "A tree that got up.", tags: ["plant"], wonder: true, sense: 5, reason: "Classic.", status: "ok" },
    { inputs: ["air", "air"], name: "Wind", description: "Air in a hurry.", tags: [], wonder: false, sense: 5, reason: "Obvious.", status: "draft" },
    { inputs: ["fire", "fire"], name: "Ash", description: "What is left.", tags: [], wonder: false, sense: 2, reason: "Weak.", status: "rejected" },
  ];
  const files = readGameFiles(process.cwd());
  const game = buildGameData({ ...files, baked });

  it("become fixed recipes and things of their own, and only once approved", () => {
    expect(game.combos.get("sand+water")).toMatchObject({ result: "beach" });
    expect(game.combos.get("salt+water")).toMatchObject({ result: "beach" });
    // The first pair to make a thing gives it its words.
    expect(game.entries.get("beach")).toMatchObject({ name: "Beach", kind: "material", description: "Sand at the water's edge.", depth: 2 });
    expect(game.entries.get("treant")).toMatchObject({ wonder: true });
    expect(game.entries.get("beach")!.wonder).toBeUndefined();
    expect([...game.bakedIds].sort()).toEqual(["beach", "treant"]);
    expect(game.combos.has("air+air")).toBe(false);
    expect(game.entries.has("wind")).toBe(false);
    expect(game.entries.has("ash")).toBe(false);
  });

  it("are left out of the game data when asked, and out of the pairs still to bake", () => {
    expect(buildGameData({ ...files, baked: [] }).entries.has("beach")).toBe(false);
    const keys = bakePairs(game).map(([a, b]) => comboKey(a.id, b.id));
    expect(keys).not.toContain("sand+water");
    // A baked thing is not one of the basics, so it is not paired up itself.
    expect(keys.some((key) => key.split("+").includes("beach"))).toBe(false);
  });

  it("may not take the name of a hand-written thing", () => {
    const clash: BakedCombo = { ...baked[0]!, name: "Mud" };
    expect(() => buildGameData({ ...files, baked: [clash] })).toThrow(/duplicate entry id "mud"/);
  });

  it("can still be reached from other pairs while someone plays, unlike hand-written things", async () => {
    const answers: ComboDraft[] = [
      { name: "Mud", description: "A thing.", tags: [], missingTag: null },
      { name: "Beach", description: "The model's own words.", tags: [], missingTag: null },
    ];
    const store = openStore(":memory:");
    store.addDiscovery("ann", "sand");
    const combiner = createCombiner({
      data: game,
      store,
      generate: async (_a, _b, reject) => answers.find((answer) => reject(answer) === null)!,
    });
    const { entry: made, origin } = await combiner.combine("ann", "sand", "earth");
    expect(origin).toBe("generated");
    // It is the baked thing itself, in the words it was approved with.
    expect(made).toMatchObject({ id: "beach", description: "Sand at the water's edge." });
    // And the baked pair itself never reaches the model.
    expect((await combiner.combine("ann", "sand", "water")).origin).toBe("authored");
  });
});

describe("keeping every call", () => {
  it("joins what was asked and answered with whether it passed, and keeps the model's thinking", async () => {
    const kept: KeptCall[] = [];
    const systems = new Map<string, string>();
    const recorder = createCallRecorder({ call: (call) => kept.push(call), system: (id, text) => systems.set(id, text) });
    const inner = { model: "m", complete: async () => ({ text: '{"n":2}', thinking: "Two seems right.", promptTokens: 11, completionTokens: 7 }) };
    const client = recorder.client(inner, "medium");
    const schema = z.strictObject({ n: z.number() });
    await generateValidated(client, recorder.log, { purpose: "count", system: "Count.", prompt: "How many?", schema, reject: (value) => (value.n > 2 ? null : "Too few."), maxAttempts: 2, temperature: 0.3 }).catch(() => {});
    expect(kept).toHaveLength(2);
    expect(kept[0]).toMatchObject({ purpose: "count", model: "m", effort: "medium", temperature: 0.3, prompt: "How many?", answer: '{"n":2}', thinking: "Two seems right.", promptTokens: 11, answerTokens: 7, passed: false, problem: "Too few." });
    expect(kept[1]!.prompt).toContain("Your previous answer was rejected: Too few.");
    expect(systems.get(systemIdOf("Count."))).toBe("Count.");
    expect(kept[0]!.systemId).toBe(systemIdOf("Count."));
  });

  it("cuts a call short when told to stop, before it starts or part-way through", async () => {
    let stop = true;
    const recorder = createCallRecorder({ call: () => {}, system: () => {} }, () => stop, 5);
    const slow = {
      model: "m",
      complete: (request: { signal?: AbortSignal }) => new Promise<never>((_resolve, reject) => request.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
    };
    const client = recorder.client(slow, null);
    await expect(client.complete({ system: "s", prompt: "p", jsonSchema: {}, temperature: 0 })).rejects.toBeInstanceOf(StopRequested);
    stop = false;
    const waiting = client.complete({ system: "s", prompt: "p", jsonSchema: {}, temperature: 0 });
    setTimeout(() => (stop = true), 20);
    await expect(waiting).rejects.toBeInstanceOf(StopRequested);
  });
});

describe("sharing the PC", () => {
  // A made-up clock: sleeping moves it on, and lets the test change things while the pacer waits.
  function world(settings = { share: 0.5, workMinutes: 5, unloadWhileResting: true, quietMinutes: 3 }) {
    const state = { time: 1_000_000, paused: false, playerAt: null as number | null, slept: 0 };
    const unload = vi.fn(async () => true);
    const onSleep: ((state: { time: number; paused: boolean; playerAt: number | null }) => void)[] = [];
    const pacer = createPacer({
      settings,
      now: () => state.time,
      sleep: async (ms) => {
        state.time += ms;
        state.slept += ms;
        for (const hook of onSleep) hook(state);
      },
      isPaused: () => state.paused,
      playerLastActive: () => state.playerAt,
      unload,
    });
    return { state, unload, onSleep, pacer };
  }
  const minutes = (count: number) => count * 60_000;

  it("lets work go ahead until a stretch is used up, then rests for its share and lets go of the model", async () => {
    const { state, unload, pacer } = world();
    await pacer.clearance();
    expect(state.slept).toBe(0);
    pacer.worked(minutes(3));
    await pacer.clearance();
    expect(state.slept).toBe(0);
    pacer.worked(minutes(3));
    await pacer.clearance();
    // Six minutes worked at half and half is six minutes of rest.
    expect(state.slept).toBe(minutes(6));
    expect(unload).toHaveBeenCalledTimes(1);
    // The stretch starts afresh.
    await pacer.clearance();
    expect(state.slept).toBe(minutes(6));
  });

  it("rests longer the smaller its share, and keeps the model when told to", async () => {
    const { state, unload, pacer } = world({ share: 0.25, workMinutes: 5, unloadWhileResting: false, quietMinutes: 3 });
    pacer.worked(minutes(5));
    await pacer.clearance();
    expect(state.slept).toBe(minutes(15));
    expect(unload).not.toHaveBeenCalled();
  });

  it("waits while paused, lets go of the model once, and carries on when resumed", async () => {
    const { state, unload, onSleep, pacer } = world();
    state.paused = true;
    expect(pacer.holdReason()).toBe("paused");
    onSleep.push((now) => {
      if (now.time >= 1_000_000 + minutes(2)) now.paused = false;
    });
    await pacer.clearance();
    expect(state.slept).toBeGreaterThanOrEqual(minutes(2));
    expect(unload).toHaveBeenCalledTimes(1);
    expect(pacer.holdReason()).toBeNull();
  });

  it("stands aside while someone is playing, keeping the model loaded for them", async () => {
    const { state, unload, pacer } = world();
    state.playerAt = state.time - 10_000;
    expect(pacer.holdReason()).toBe("player");
    await pacer.clearance();
    // It waited out the rest of the quiet spell, and no longer.
    expect(state.slept).toBeGreaterThanOrEqual(minutes(3) - 10_000);
    expect(state.slept).toBeLessThan(minutes(3) + 10_000);
    expect(unload).not.toHaveBeenCalled();
    state.playerAt = null;
    expect(pacer.holdReason()).toBeNull();
  });
});
