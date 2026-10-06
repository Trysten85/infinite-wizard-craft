import type { Balance, EventSeed, GameEntry, ResponseType } from "../../shared/schema";
import type { GameData } from "../gameData";
import type { Person } from "../store";

// What the picker needs to know about a player. Worked out from their discoveries.
export type PlayerSnapshot = {
  level: number;
  // The player's newest job, until choosing a main job exists.
  job: { id: string; name: string; wantedTags: string[] } | null;
  // Every tag on anything the player has discovered.
  tags: Set<string>;
  // The tags they hold most of, most common first.
  topTags: string[];
  hasSpell: boolean;
};

// The last few events, oldest first, as far as the picker cares.
export type RecentEvent = { seedId: string; kind: string; mood: string[]; personId: number };

export function snapshotPlayer(data: GameData, discovered: GameEntry[], level: number): PlayerSnapshot {
  const starting = new Set(data.balance.startingEntries);
  const counts = new Map<string, number>();
  for (const entry of discovered) {
    if (starting.has(entry.id)) continue;
    for (const tag of entry.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  const newestJob = discovered.filter((entry) => entry.kind === "job").at(-1);
  const job = newestJob && data.jobs.get(newestJob.id);
  return {
    level,
    job: job ? { id: job.id, name: job.name, wantedTags: job.wantedTags } : null,
    tags: new Set(counts.keys()),
    topTags: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([tag]) => tag),
    hasSpell: discovered.some((entry) => entry.kind === "spell"),
  };
}

// Seeds whose limits the player meets.
export function eligibleSeeds(seeds: EventSeed[], player: PlayerSnapshot): EventSeed[] {
  return seeds.filter(
    (seed) => (seed.minLevel ?? 1) <= player.level && (!seed.needsSpell || player.hasSpell) && (!seed.needsJob || player.job !== null),
  );
}

// How likely a seed is, relative to the others. Higher for a match with the player, lower for
// anything that would feel like a repeat of what just happened.
export function seedWeight(seed: EventSeed, player: PlayerSnapshot, recent: RecentEvent[]): number {
  let weight = 1;
  const playerTags = new Set([...player.topTags, ...(player.job?.wantedTags ?? [])]);
  weight += Math.min(3, seed.tags.filter((tag) => playerTags.has(tag)).length) * 0.5;

  const lastThree = recent.slice(-3);
  if (lastThree.some((event) => event.seedId === seed.id)) weight *= 0.25;
  if (recent.at(-1)?.kind === seed.kind) weight *= 0.5;

  // After a tense run, lean toward something warm or silly.
  const lastTwo = recent.slice(-2);
  if (lastTwo.length === 2 && lastTwo.every((event) => event.mood.includes("tense"))) {
    if (seed.mood.includes("tense")) weight *= 0.5;
    else if (seed.mood.includes("warm") || seed.mood.includes("silly")) weight *= 1.5;
  }
  return weight;
}

// Picks one item at random, in proportion to its weight. `roll` is a number from 0 up to 1.
export function weightedPick<T>(items: { item: T; weight: number }[], roll: number): T | undefined {
  const total = items.reduce((sum, { weight }) => sum + weight, 0);
  if (total <= 0) return undefined;
  let remaining = roll * total;
  for (const { item, weight } of items) {
    remaining -= weight;
    if (remaining < 0) return item;
  }
  return items.at(-1)?.item;
}

// The tags that unlock the Skilled response for this seed and this player.
export function skillTagsFor(seed: Pick<EventSeed, "skillTags" | "skillFromJob">, player: PlayerSnapshot): string[] {
  return seed.skillFromJob ? (player.job?.wantedTags ?? []) : seed.skillTags;
}

// The response types to ask the writer for. Skilled is only offered to a player who holds one of
// the skill tags. At most four are offered; how a returning person feels decides which is dropped.
export function offeredTypes(allowed: ResponseType[], skillTags: string[], player: PlayerSnapshot, fondness = 0): ResponseType[] {
  let types = allowed.filter((type) => type !== "skilled" || skillTags.some((tag) => player.tags.has(tag)));
  if (types.length > 4) types = types.filter((type) => type !== (fondness >= 0 ? "sharp" : "fair"));
  return types;
}

// Whether a follow-up is waiting on this person by the given day.
export function flagDue(person: Person, day: number): boolean {
  return person.flag !== null && (person.flagDay ?? 0) <= day;
}

// How likely each known person is to come back. Someone with a follow-up waiting comes first;
// strong feelings and a long absence help; whoever was in the last event sits this one out.
export function returningWeights(people: Person[], day: number, lastPersonId: number | undefined): { item: Person; weight: number }[] {
  const candidates = people.filter((person) => person.status !== "dormant");
  const rested = candidates.filter((person) => person.id !== lastPersonId);
  return (rested.length > 0 ? rested : candidates).map((person) => {
    let weight = 1 + Math.min(Math.abs(person.fondness), 5) * 0.3 + Math.min(day - person.lastDay, 5) * 0.2;
    if (flagDue(person, day)) weight += 4;
    // A settled story only gets the occasional short closing scene.
    if (person.status === "settled") weight *= 0.1;
    return { item: person, weight };
  });
}

// The chance that the next event brings back someone the player knows.
export function repeatChance(people: Person[], day: number, balance: Balance): number {
  const known = people.filter((person) => person.status !== "dormant");
  if (known.some((person) => flagDue(person, day))) return Math.max(balance.events.repeatShare, 0.6);
  return known.length >= balance.events.repeatMinPeople ? balance.events.repeatShare : 0;
}
