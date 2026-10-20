import { describe, expect, it } from "vitest";
import { arrivalMet, castProblems, castXpAtLevel, fitCast, neighbourShift, isTaught, lessonFor, openBeats, refuseTrade, templateLesson, type CastWorld, type Teaching } from "../src/shared/cast";
import { castMemberSchema, castSchema, type Cast, type CastMember } from "../src/shared/schema";
import { readGameFiles } from "../src/server/gameData";
import { data } from "./helpers";

const rules = data.balance.town;

const lesson = { id: "lesson-ada", title: "Ada's lesson", detail: "Make a thing.", track: "side", level: 2, gold: 0, xp: 10, done: { type: "tag-count", tag: "forging", count: 2 } } as const;

function person(extra: Partial<CastMember> = {}): CastMember {
  return {
    id: "ada",
    name: "Ada Quill",
    pronoun: "she",
    job: "blacksmith",
    home: "smithy",
    personality: "Dry and kind.",
    voice: "Short sentences.",
    traits: [],
    facts: [],
    likes: ["farmer"],
    dislikes: ["herbalist"],
    arrival: {},
    lesson: [lesson],
    beats: [],
    callingLines: ["{name} nods."],
    ...extra,
  };
}

const world: CastWorld = {
  jobs: new Set(["blacksmith", "farmer", "herbalist", "wizard"]),
  buildings: new Map([["smithy", { job: "blacksmith" }]]),
  questIds: new Set(["first-job"]),
  pool: new Set(["Pip Thistlewood"]),
  level: 5,
};

const problems = (...people: CastMember[]) => castProblems({ people }, world);

describe("learning a trade", () => {
  const base: Teaching = { starter: false, held: false, lessonDone: false, fondness: 0 };

  it("waits on the lesson and on Fondness, both", () => {
    expect(rules.teachAt).toBeLessThan(rules.regularAt);
    expect(isTaught({ ...base, lessonDone: true, fondness: rules.teachAt - 1 }, rules)).toBe(false);
    expect(isTaught({ ...base, lessonDone: false, fondness: rules.teachAt + 5 }, rules)).toBe(false);
    expect(isTaught({ ...base, lessonDone: true, fondness: rules.teachAt }, rules)).toBe(true);
  });

  it("never holds back the starter job or a job a saved game already had", () => {
    expect(isTaught({ ...base, starter: true }, rules)).toBe(true);
    expect(isTaught({ ...base, held: true }, rules)).toBe(true);
  });

  it("refuses an untaught trade with not-taught", () => {
    expect(refuseTrade(base, rules)).toBe("not-taught");
    expect(refuseTrade({ ...base, starter: true }, rules)).toBeNull();
  });

  it("starts every job but the starter untaught in the real data", () => {
    const starters = [...data.jobs.values()].filter((job) => job.starter);
    expect(starters.map((job) => job.id)).toEqual(["wizard"]);
  });
});

describe("a lesson made by code", () => {
  it("asks for two things carrying the job's first wanted tag, and pays nothing", () => {
    const lesson = templateLesson(data.jobs.get("blacksmith")!);
    expect(lesson).toMatchObject({ id: "lesson-blacksmith", track: "side", gold: 0, xp: 0, done: { type: "tag-count", count: 2 } });
  });

  it("passes over utility, which asks for nothing", () => {
    const lesson = templateLesson({ id: "tinker", name: "Tinker", wantedTags: ["utility", "metal"] });
    expect(lesson.done).toEqual({ type: "tag-count", tag: "metal", count: 2 });
    expect(templateLesson({ id: "odd", name: "Odd", wantedTags: ["utility"] }).done).toMatchObject({ tag: "utility" });
  });

  it("works for every job in the game, and gives way to a written lesson", () => {
    for (const job of data.jobs.values()) expect(lessonFor(job, { people: [] })).toHaveLength(1);
    const written = lessonFor({ id: "blacksmith", name: "Blacksmith", wantedTags: ["metal"] }, { people: [person()] });
    expect(written).toEqual([lesson]);
  });
});

describe("the cast schema", () => {
  it("takes a person with no beats, and an empty cast", () => {
    expect(castMemberSchema.safeParse(person()).success).toBe(true);
    expect(castSchema.safeParse({ people: [] }).success).toBe(true);
  });

  it("refuses a person without a lesson or a calling line, and anything it does not know", () => {
    expect(castMemberSchema.safeParse(person({ lesson: [] })).success).toBe(false);
    expect(castMemberSchema.safeParse(person({ callingLines: [] })).success).toBe(false);
    expect(castMemberSchema.safeParse({ ...person(), mood: "grumpy" }).success).toBe(false);
  });

  it("takes the four rewards and refuses a made-up one", () => {
    const beat = (reward: unknown) => ({ id: "b1", title: "B", level: 2, gate: 2, premise: "p", line: "l", reward });
    const ok = (reward: unknown) => castMemberSchema.safeParse(person({ beats: [beat(reward)] as never })).success;
    expect(ok({ kind: "gold", gold: 5, xp: 5 })).toBe(true);
    expect(ok({ kind: "commission", tags: ["forging"] })).toBe(true);
    expect(ok({ kind: "plan", building: "smithy", tier: 2 })).toBe(true);
    expect(ok({ kind: "perk", perk: { type: "learn-discount", share: 0.1 } })).toBe(true);
    expect(ok({ kind: "plan", building: "smithy", tier: 1 })).toBe(false);
    expect(ok({ kind: "commission", tags: [] })).toBe(false);
    expect(ok({ kind: "treasure" })).toBe(false);
  });

  it("ships a cast the loader accepts, with no problem against the real data", () => {
    expect(data.cast.people.length).toBeGreaterThan(0);
    const raw = readGameFiles(".");
    const full: CastWorld = {
      jobs: new Set(raw.jobs!.map((job) => job.id)),
      buildings: new Map(raw.buildings!.map((building) => [building.id, building])),
      questIds: new Set(raw.quests!.map((quest) => quest.id)),
      pool: new Set(raw.townsfolk!.people.map((entry) => entry.name)),
      level: data.balance.levels.cap,
    };
    // Nothing is fitted away: the shipped cast is the cast the real data holds.
    expect(fitCast(raw.cast!, { jobs: full.jobs, buildings: new Set(full.buildings.keys()) })).toEqual(raw.cast);
    expect(castProblems(raw.cast!, full)).toEqual([]);
  });
});

describe("what the cast gets wrong", () => {
  const beat = (id: string, waitsOn: string[] = []) =>
    ({ id, title: id, level: 2, gate: 2, waitsOn, premise: "p", line: "l", reward: { kind: "gold", gold: 1, xp: 1 } }) as CastMember["beats"][number];

  it("accepts a good cast", () => {
    expect(problems(person({ beats: [beat("b1"), beat("b2", ["b1"])] }))).toEqual([]);
  });

  it("refuses two people with one id, one name, or one trade", () => {
    expect(problems(person(), person({ name: "Bea Cobb", job: "farmer" }))).toEqual(expect.arrayContaining([expect.stringContaining("two people called ada")]));
    expect(problems(person(), person({ id: "bea", job: "farmer" }))).toEqual(expect.arrayContaining([expect.stringContaining("two names called Ada Quill")]));
    expect(problems(person(), person({ id: "bea", name: "Bea Cobb" }))).toEqual(expect.arrayContaining([expect.stringContaining("two trades with a person called blacksmith")]));
  });

  it("refuses a name that is also in the arrival pool", () => {
    expect(problems(person({ name: "Pip Thistlewood" }))).toEqual([expect.stringContaining("arrival pool")]);
  });

  it("refuses unknown jobs, buildings, quests and levels", () => {
    expect(problems(person({ job: "juggler" }))[0]).toContain("unknown job juggler");
    expect(problems(person({ home: "castle" }))[0]).toContain("unknown building castle");
    expect(problems(person({ likes: ["juggler"] }))[0]).toContain("likes the unknown job");
    expect(problems(person({ dislikes: ["juggler"] }))[0]).toContain("dislikes the unknown job");
    expect(problems(person({ arrival: { quest: "nope" } }))[0]).toContain("unknown quest nope");
    expect(problems(person({ arrival: { level: 6 } }))[0]).toContain("past the level cap");
  });

  it("refuses an opinion of their own trade, or liking and disliking the same one", () => {
    expect(problems(person({ likes: ["blacksmith"] }))[0]).toContain("their own trade");
    expect(problems(person({ likes: ["farmer"], dislikes: ["farmer"] }))[0]).toContain("both likes and dislikes");
  });

  it("refuses beats that wait on something missing, on themselves, or in a circle", () => {
    expect(problems(person({ beats: [beat("b1", ["ghost"])] }))[0]).toContain("unknown beat ghost");
    expect(problems(person({ beats: [beat("b1", ["b1"])] })).join()).toContain("waits on itself");
    expect(problems(person({ beats: [beat("b1", ["b2"]), beat("b2", ["b1"])] }))).toEqual(["story beats wait on each other in a circle"]);
  });

  it("lets a beat wait on another person's beat", () => {
    const other = person({ id: "bea", name: "Bea Cobb", job: "farmer", home: "shared", likes: ["blacksmith"], dislikes: [], beats: [beat("c1")], lesson: [{ ...lesson, id: "lesson-bea" }] });
    expect(problems(person({ beats: [beat("b1", ["c1"])] }), other)).toEqual([]);
  });

  it("refuses a plan reward for a building that does not exist", () => {
    const planned = { ...beat("b1"), reward: { kind: "plan", building: "castle", tier: 2 } } as CastMember["beats"][number];
    expect(problems(person({ beats: [planned] }))[0]).toContain("unknown building castle");
  });
});

describe("story beats", () => {
  const beats = [
    { id: "b1", title: "One", level: 2, gate: 2, waitsOn: [], premise: "p", line: "l", reward: { kind: "gold", gold: 1, xp: 1 } },
    { id: "b2", title: "Two", level: 3, gate: 4, waitsOn: ["b1"], premise: "p", line: "l", reward: { kind: "gold", gold: 1, xp: 2 } },
  ] as CastMember["beats"];

  it("open at their Fondness once what they wait on is done", () => {
    const ada = person({ beats });
    expect(openBeats(ada, 1, new Set())).toEqual([]);
    expect(openBeats(ada, 2, new Set())).toEqual(["b1"]);
    expect(openBeats(ada, 6, new Set())).toEqual(["b1"]);
    expect(openBeats(ada, 6, new Set(["b1"]))).toEqual(["b2"]);
    expect(openBeats(ada, 3, new Set(["b1"]))).toEqual([]);
  });

  it("count their lessons' and gold beats' XP toward the level they pay at", () => {
    const cast: Cast = { people: [person({ beats })] };
    expect(castXpAtLevel(cast, 2)).toBe(10 + 1);
    expect(castXpAtLevel(cast, 3)).toBe(2);
    expect(castXpAtLevel(cast, 5)).toBe(0);
  });
});

describe("fitting the cast to a game with fewer jobs", () => {
  const have = { jobs: new Set(["blacksmith", "farmer"]), buildings: new Set(["smithy"]) };
  const planBeat = (id: string, building: string, waitsOn: string[] = []) =>
    ({ id, title: id, level: 2, gate: 1, waitsOn, premise: "p", line: "l", reward: { kind: "plan", building, tier: 2 } }) as CastMember["beats"][number];

  it("leaves out a person whose job or home is missing, and keeps the rest", () => {
    const cast: Cast = { people: [person(), person({ id: "wil", name: "Wil Ignatius", job: "wizard", home: "wizards-tower" }), person({ id: "bea", name: "Bea Cobb", job: "farmer", home: "shared" })] };
    expect(fitCast(cast, have).people.map((entry) => entry.id)).toEqual(["ada", "bea"]);
  });

  it("drops an opinion of a missing job, a plan for a missing building, and a wait on a beat that is gone", () => {
    const cast: Cast = { people: [person({ likes: ["farmer", "wizard"], dislikes: ["herbalist"], beats: [planBeat("b1", "wizards-tower"), planBeat("b2", "smithy", ["b1"])] })] };
    const [fitted] = fitCast(cast, have).people;
    expect(fitted!.likes).toEqual(["farmer"]);
    expect(fitted!.dislikes).toEqual([]);
    expect(fitted!.beats.map((beat) => [beat.id, beat.waitsOn])).toEqual([["b2", []]]);
  });
});

describe("who arrives when", () => {
  const here = { level: 3, buildings: 2, townsfolk: 4, questsDone: new Set(["first-job"]) };

  it("needs every condition given, and nothing for a person with none", () => {
    expect(arrivalMet({}, { ...here, level: 1, buildings: 0, townsfolk: 0, questsDone: new Set() })).toBe(true);
    expect(arrivalMet({ level: 3, buildings: 2, townsfolk: 4, quest: "first-job" }, here)).toBe(true);
    expect(arrivalMet({ level: 4 }, here)).toBe(false);
    expect(arrivalMet({ buildings: 3 }, here)).toBe(false);
    expect(arrivalMet({ townsfolk: 5 }, here)).toBe(false);
    expect(arrivalMet({ quest: "level-two" }, here)).toBe(false);
  });
});

describe("neighbours", () => {
  const smith = person({ likes: ["farmer"], dislikes: ["herbalist"] });
  const cast: Cast = { people: [smith] };
  const street = (...jobs: [number, string][]) => jobs.map(([plot, job]) => ({ plot, job }));
  const { liked, disliked, cap } = rules.neighbour;

  it("lifts takings for a liked neighbour and lowers them for a disliked one, within reach", () => {
    expect(neighbourShift(1, "blacksmith", street([0, "farmer"]), cast, rules)).toBeCloseTo(liked);
    expect(neighbourShift(1, "blacksmith", street([2, "herbalist"]), cast, rules)).toBeCloseTo(-disliked);
    expect(neighbourShift(1, "blacksmith", street([0, "farmer"], [2, "herbalist"]), cast, rules)).toBeCloseTo(liked - disliked);
  });

  it("ignores a neighbour beyond reach, itself, and a job the owner has no opinion of", () => {
    expect(neighbourShift(1, "blacksmith", street([1 + rules.neighbour.reach + 1, "farmer"]), cast, rules)).toBe(0);
    expect(neighbourShift(1, "blacksmith", street([1, "farmer"]), cast, rules)).toBe(0);
    expect(neighbourShift(1, "blacksmith", street([0, "wizard"]), cast, rules)).toBe(0);
  });

  it("never moves takings past the cap either way", () => {
    const crowd = { ...rules, neighbour: { ...rules.neighbour, reach: 9 } };
    const many = street(...Array.from({ length: 8 }, (_, index): [number, string] => [index + 2, "farmer"]));
    expect(neighbourShift(1, "blacksmith", many, cast, crowd)).toBe(cap);
    expect(neighbourShift(1, "blacksmith", street(...many.map(({ plot }): [number, string] => [plot, "herbalist"])), cast, crowd)).toBe(-cap);
  });

  it("changes nothing for a building whose owner has no written person", () => {
    expect(neighbourShift(1, "tinker", street([0, "farmer"]), cast, rules)).toBe(0);
  });
});
