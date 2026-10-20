import type { Cast, CastMember, Job, Quest, RuleCode, TownRules } from "./schema";

// The rules of the hand-written cast and of learning a trade, as plain functions. Nothing here
// touches a saved game. The cast itself is data in data/cast.json; these say what it may hold and
// when a trade has been taught.

// A trade is taught, so its shift can be worked, once any one of these holds:
// - it is the starter job, taught from the first day;
// - the player already had the job before trades were taught (a saved game keeps it);
// - the person's lesson is done and their Fondness has reached `town.teachAt`.
export type Teaching = { starter: boolean; held: boolean; lessonDone: boolean; fondness: number };

export function isTaught(teaching: Teaching, rules: Pick<TownRules, "teachAt">): boolean {
  return teaching.starter || teaching.held || (teaching.lessonDone && teaching.fondness >= rules.teachAt);
}

// Why a job cannot be taken up yet, or null if it can.
export function refuseTrade(teaching: Teaching, rules: Pick<TownRules, "teachAt">): Extract<RuleCode, "not-taught"> | null {
  return isTaught(teaching, rules) ? null : "not-taught";
}

// The tag a made-by-code lesson asks for: the job's first wanted tag, leaving out `utility`, which
// the model puts on so many things that asking for it would ask for nothing.
const TOO_COMMON = new Set(["utility"]);

// The lesson for a job with no hand-written person: make two things the job wants. The Fondness
// half of teaching is the same as for anyone, so calling on the person is not in the lesson. It
// pays nothing: being taught is the reward.
export function templateLesson(job: Pick<Job, "id" | "name" | "wantedTags">): Quest {
  const tag = job.wantedTags.find((wanted) => !TOO_COMMON.has(wanted)) ?? job.wantedTags[0]!;
  return {
    id: `lesson-${job.id}`,
    title: `Show the ${job.name} what you can do`,
    detail: `Make two things with ${tag} in them, so the ${job.name} can see how you work.`,
    track: "side",
    level: 1,
    gold: 0,
    xp: 0,
    done: { type: "tag-count", tag, count: 2 },
  };
}

// The lesson that stands between the player and a job: the person's own, or the made-by-code one.
export function lessonFor(job: Pick<Job, "id" | "name" | "wantedTags">, cast: Cast): Quest[] {
  const member = cast.people.find((person) => person.job === job.id);
  return member ? member.lesson : [templateLesson(job)];
}

// Everything a person's lesson and story pay in XP at each level, so that the quests, the lessons
// and the beats together can be held to the same share of a level's XP.
export function castXpAtLevel(cast: Cast, level: number): number {
  return cast.people.reduce((total, person) => {
    const lessons = person.lesson.filter((quest) => quest.level === level).reduce((sum, quest) => sum + quest.xp, 0);
    const beats = person.beats
      .filter((beat) => beat.level === level && beat.reward.kind === "gold")
      .reduce((sum, beat) => sum + (beat.reward.kind === "gold" ? beat.reward.xp : 0), 0);
    return total + lessons + beats;
  }, 0);
}

// Fits the cast to a game that may lack some jobs or buildings, as buildings and job skins are
// fitted: a person whose job or home is missing is left out, an opinion of a missing job is
// dropped, and so is a beat that brings the plan of a missing building. A wait on a beat that
// is gone is dropped too. The real data still has every job and building, and a test holds the
// shipped cast to that, so a misspelling is caught there and not hidden here.
export function fitCast(cast: Cast, have: { jobs: ReadonlySet<string>; buildings: ReadonlySet<string> }): Cast {
  const people = cast.people.filter((person) => have.jobs.has(person.job) && (person.home === "shared" || have.buildings.has(person.home)));
  const kept = people.map((person) => ({
    ...person,
    likes: person.likes.filter((job) => have.jobs.has(job)),
    dislikes: person.dislikes.filter((job) => have.jobs.has(job)),
    beats: person.beats.filter((beat) => beat.reward.kind !== "plan" || have.buildings.has(beat.reward.building)),
  }));
  const beatIds = new Set(kept.flatMap((person) => person.beats.map((beat) => beat.id)));
  return { people: kept.map((person) => ({ ...person, beats: person.beats.map((beat) => ({ ...beat, waitsOn: beat.waitsOn.filter((id) => beatIds.has(id)) })) })) };
}

// What the cast gets wrong, for the loader to refuse it with. `known` is what the game has.
export type CastWorld = {
  jobs: ReadonlySet<string>;
  buildings: ReadonlyMap<string, { job?: string }>;
  questIds: ReadonlySet<string>;
  pool: ReadonlySet<string>;
  level: number;
};

export function castProblems(cast: Cast, world: CastWorld): string[] {
  const problems: string[] = [];
  const dupes = (what: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) problems.push(`the cast has two ${what} called ${id}`);
      seen.add(id);
    }
  };
  dupes("people", cast.people.map((person) => person.id));
  dupes("trades with a person", cast.people.map((person) => person.job));
  dupes("names", cast.people.map((person) => person.name));
  const beatIds = cast.people.flatMap((person) => person.beats.map((beat) => beat.id));
  dupes("story beats", beatIds);
  dupes("quests, lessons and beats", [...world.questIds, ...cast.people.flatMap((person) => person.lesson.map((quest) => quest.id))]);
  const beatSet = new Set(beatIds);
  for (const person of cast.people) {
    const at = `${person.name} (${person.id})`;
    if (!world.jobs.has(person.job)) problems.push(`${at} has the unknown job ${person.job}`);
    if (world.pool.has(person.name)) problems.push(`${at} has a name from the arrival pool, so two people could share it`);
    if (person.home !== "shared" && !world.buildings.has(person.home)) problems.push(`${at} lives in the unknown building ${person.home}`);
    for (const liked of person.likes) if (!world.jobs.has(liked)) problems.push(`${at} likes the unknown job ${liked}`);
    for (const disliked of person.dislikes) if (!world.jobs.has(disliked)) problems.push(`${at} dislikes the unknown job ${disliked}`);
    if (person.likes.includes(person.job) || person.dislikes.includes(person.job)) problems.push(`${at} has an opinion of their own trade`);
    if (person.likes.some((liked) => person.dislikes.includes(liked))) problems.push(`${at} both likes and dislikes the same trade`);
    if (person.arrival.quest && !world.questIds.has(person.arrival.quest)) problems.push(`${at} arrives after the unknown quest ${person.arrival.quest}`);
    if (person.arrival.level && person.arrival.level > world.level) problems.push(`${at} arrives past the level cap`);
    for (const beat of person.beats) {
      for (const waited of beat.waitsOn) {
        if (!beatSet.has(waited)) problems.push(`${beat.id} waits on the unknown beat ${waited}`);
        if (waited === beat.id) problems.push(`${beat.id} waits on itself`);
      }
      if (beat.reward.kind === "plan" && !world.buildings.has(beat.reward.building)) problems.push(`${beat.id} brings the plan of the unknown building ${beat.reward.building}`);
    }
  }
  if (!problems.length && waitsLoop(cast)) problems.push("story beats wait on each other in a circle");
  return problems;
}

// Whether the beats' `waitsOn` links ever come back round to where they began.
function waitsLoop(cast: Cast): boolean {
  const waits = new Map(cast.people.flatMap((person) => person.beats.map((beat) => [beat.id, beat.waitsOn] as const)));
  const done = new Set<string>();
  const walking = new Set<string>();
  const visit = (id: string): boolean => {
    if (done.has(id)) return false;
    if (walking.has(id)) return true;
    walking.add(id);
    const loops = (waits.get(id) ?? []).some(visit);
    walking.delete(id);
    done.add(id);
    return loops;
  };
  return [...waits.keys()].some(visit);
}

// A person's beats that can be played now, given the Fondness they have and the beats already
// done. A beat is open at its gate once everything it waits on is done.
export function openBeats(person: CastMember, fondness: number, doneBeats: ReadonlySet<string>): string[] {
  return person.beats
    .filter((beat) => !doneBeats.has(beat.id) && fondness >= beat.gate && beat.waitsOn.every((id) => doneBeats.has(id)))
    .map((beat) => beat.id);
}

// When a person arrives besides their job being discovered: every part of `arrival` that is given
// must hold. A person with no conditions arrives at once.
export type ArrivalWorld = { level: number; buildings: number; townsfolk: number; questsDone: ReadonlySet<string> };

export function arrivalMet(arrival: CastMember["arrival"], world: ArrivalWorld): boolean {
  return (
    (arrival.level === undefined || world.level >= arrival.level) &&
    (arrival.buildings === undefined || world.buildings >= arrival.buildings) &&
    (arrival.townsfolk === undefined || world.townsfolk >= arrival.townsfolk) &&
    (arrival.quest === undefined || world.questsDone.has(arrival.quest))
  );
}

// How much a building's takings change for who stands beside it. `at` is its plot, `owner` its
// person's job, and `standing` every building on the street with its plot and its person's job.
// Each neighbour within `reach` plots either side that the owner likes adds `liked`, and each
// they dislike takes off `disliked`. The sum never goes past `cap` either way. A building
// with no hand-written owner has no opinions, so nothing changes it.
export function neighbourShift(
  at: number,
  owner: string,
  standing: { plot: number; job: string }[],
  cast: Cast,
  rules: Pick<TownRules, "neighbour">,
): number {
  const person = cast.people.find((entry) => entry.job === owner);
  if (!person) return 0;
  const { reach, liked, disliked, cap } = rules.neighbour;
  let shift = 0;
  for (const next of standing) {
    if (next.plot === at || Math.abs(next.plot - at) > reach) continue;
    if (person.likes.includes(next.job)) shift += liked;
    if (person.dislikes.includes(next.job)) shift -= disliked;
  }
  return Math.max(-cap, Math.min(cap, shift));
}
