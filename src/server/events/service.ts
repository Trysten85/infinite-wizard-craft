import { RESPONSE_TYPES, type EventOutcome, type EventSeed, type EventView, type GameEntry, type RequestView, type ResponseType, type Rewards, type Stakes } from "../../shared/schema";
import { RuleError } from "../combiner";
import type { GameData } from "../gameData";
import { buildPath } from "../paths";
import { eventThreshold, repBandFor, type ProgressService } from "../progress";
import type { Person, Store, StoredEvent } from "../store";
import {
  eligibleSeeds,
  flagDue,
  offeredTypes,
  repeatChance,
  returningWeights,
  seedWeight,
  skillTagsFor,
  snapshotPlayer,
  weightedPick,
  type PlayerSnapshot,
  type RecentEvent,
} from "./picker";
import type { EventBrief, EventWriter, WrittenEvent } from "./writer";

export type EventService = ReturnType<typeof createEvents>;

// What code decided about an event before it was written, kept with the writer's text.
type Payload = {
  written: WrittenEvent;
  responseTypes: ResponseType[];
  followUp: EventSeed["followUp"];
  // The request the person makes if the player helps, with the gold it will pay.
  request: { entryId: string; gold: number } | null;
  // The spell the Skilled response uses, when the writer judged that one of the player's fits.
  spell: { id: string; name: string } | null;
};

const HELPFUL: ResponseType[] = ["generous", "skilled", "fair"];
// What a follow-up means when the person comes back, in words for the writer.
const FOLLOW_UP: Record<string, string> = {
  thanks: "to say thank you for the kindness last time",
  unfinished: "the problem the player walked away from has come back",
};

export function createEvents(deps: {
  data: GameData;
  store: Store;
  progress: ProgressService;
  listDiscovered: (player: string) => GameEntry[];
  writer: EventWriter;
  // A number from 0 up to, not including, 1.
  random?: () => number;
}) {
  const { data, store, progress, listDiscovered, writer, random = Math.random } = deps;
  const rules = data.balance.events;
  // One event is written at a time per player, however many times the page asks.
  const writing = new Map<string, Promise<void>>();

  const pendingEvent = (player: string) => store.listEvents(player).find((event) => event.state === "pending");

  function feeling(fondness: number): string {
    if (fondness >= 3) return "fond of the player";
    if (fondness <= -3) return "cross with the player";
    return "neither warm nor cool toward the player";
  }

  // Something this player lacks, within reach, that the person could plausibly ask for.
  function planRequest(player: string, snapshot: PlayerSnapshot, discovered: GameEntry[], stakes: Stakes, skillTags: string[]): Payload["request"] {
    const have = new Set(discovered.map((entry) => entry.id));
    const alreadyAsked = new Set(store.listRequests(player).filter((request) => request.state === "open").map((request) => request.entryId));
    const neverSells = new Set(data.balance.shop.neverSells);
    const wanted = new Set([...skillTags, ...(snapshot.job?.wantedTags ?? [])]);
    const candidates = [...data.entries.values()]
      .filter((entry) => entry.kind === "material" && !have.has(entry.id) && !alreadyAsked.has(entry.id) && !neverSells.has(entry.id))
      .filter((entry) => buildPath(data, entry.id, have).length <= rules.request.maxMissingSteps)
      .map((entry) => ({ item: entry, weight: 1 + entry.tags.filter((tag) => wanted.has(tag)).length }));
    const entry = weightedPick(candidates, random());
    if (!entry) return null;
    const pay = 1 + repBandFor(store.getStats(player).rep, data.balance).requestPay;
    const gold = Math.round(rules.request.goldPerLevel * snapshot.level * rules.stakes[stakes]!.scale * pay);
    return { entryId: entry.id, gold };
  }

  // Asks the writer, some of the time, whether a spell the player has learned and can cast would
  // solve the scene. The writer only chooses the spell. What it does is the fixed Skilled effect.
  async function findSpellSolution(player: string, level: number, discovered: GameEntry[], written: WrittenEvent, personName: string) {
    if (random() >= rules.spellCheck.chance) return null;
    const learned = new Set(store.getLearned(player));
    const blocked = new Set(rules.spellCheck.blockedTags);
    const spells = discovered
      .filter((entry) => learned.has(entry.id) && entry.tier <= level && !entry.tags.some((tag) => blocked.has(tag)))
      .map((entry) => ({ id: entry.id, name: entry.name, school: data.entries.get(entry.school ?? "")?.name ?? "", tags: entry.tags }));
    if (spells.length === 0) return null;
    const answer = await writer.checkSpell({ scene: written.scene, personName, spells });
    const spell = spells.find((item) => item.id === answer.spellId);
    return spell ? { id: spell.id, name: spell.name, text: answer.text, outcome: answer.outcome } : null;
  }

  async function writeNext(player: string): Promise<void> {
    const discovered = listDiscovered(player);
    const { level } = progress.getProgress(player);
    const stats = store.getStats(player);
    const snapshot = snapshotPlayer(data, discovered, level);
    const history = store.listEvents(player);
    const day = history.length + 1;
    const people = store.listPeople(player);
    const recent: RecentEvent[] = history.map((event) => ({ seedId: event.seedId, kind: event.kind, mood: event.mood, personId: event.personId }));
    const lastPersonId = recent.at(-1)?.personId;

    // First, whether someone the player knows comes back. If so the event inherits from their story.
    let returning: Person | undefined;
    let seed: EventSeed | undefined;
    if (random() < repeatChance(people, day, data.balance)) {
      returning = weightedPick(returningWeights(people, day, lastPersonId), random());
    }
    if (returning) {
      const firstEvent = history.find((event) => event.personId === returning!.id);
      const origin = data.eventSeeds.find((item) => item.id === firstEvent?.seedId);
      seed = {
        id: "repeat",
        premise: "A person the player has met before comes back",
        kind: origin?.kind ?? "social",
        mood: origin?.mood ?? ["warm"],
        tags: [],
        skillTags: [],
        skillFromJob: true,
        who: "any",
        stakes: ["S", "M"],
        responseTypes: ["generous", "skilled", "fair", "sharp", "avoid"],
        followUp: "possible",
        canRequest: true,
        spellSolvable: true,
      };
    } else {
      const options = eligibleSeeds(data.eventSeeds, snapshot).map((item) => ({ item, weight: seedWeight(item, snapshot, recent) }));
      seed = weightedPick(options, random());
      if (!seed) return;
      // With a full cast, a seed that allows it brings back a familiar face instead of adding one.
      const active = people.filter((person) => person.status === "active");
      if (seed.who === "any" && active.length >= rules.maxActivePeople) {
        returning = weightedPick(returningWeights(active, day, lastPersonId), random());
      }
    }

    const stakes = seed.stakes[Math.floor(random() * seed.stakes.length)]!;
    const skillTags = skillTagsFor(seed, snapshot);
    const responseTypes = offeredTypes(seed.responseTypes, skillTags, snapshot, returning?.fondness);
    const request = seed.canRequest && random() < rules.request.chance ? planRequest(player, snapshot, discovered, stakes, skillTags) : null;

    const summarize = (event: StoredEvent) =>
      event.outcomeSummary ? `${event.sceneSummary} The player was ${event.chosen}: ${event.outcomeSummary}` : event.sceneSummary;
    const brief: EventBrief = {
      seed: { premise: seed.premise, kind: seed.kind, mood: seed.mood },
      stakes,
      player: { job: snapshot.job?.name ?? null, topTags: snapshot.topTags, repBand: repBandFor(stats.rep, data.balance).name },
      person: returning
        ? {
            returning: true,
            name: returning.name,
            role: returning.role,
            traits: returning.traits,
            facts: returning.facts,
            feeling: feeling(returning.fondness),
            followUp: flagDue(returning, day) ? (FOLLOW_UP[returning.flag!] ?? null) : null,
            // Only the last few meetings are sent. The full log stays on disk.
            history: history.filter((event) => event.personId === returning!.id).slice(-rules.memory).map(summarize),
          }
        : { returning: false },
      recent: history.slice(-3).map((event) => event.sceneSummary),
      responseTypes,
      ask: request ? { name: data.entries.get(request.entryId)!.name } : null,
      takenNames: people.map((person) => person.name),
    };

    const written = await writer.write(brief);
    const spell = seed.spellSolvable ? await findSpellSolution(player, level, discovered, written, returning?.name ?? written.person!.name) : null;
    if (spell) {
      // The spell becomes the Skilled way through, whether or not the player's tags had earned one.
      written.responses = [...written.responses.filter((response) => response.type !== "skilled"), { type: "skilled", text: spell.text, outcome: spell.outcome }];
    }
    let offered = RESPONSE_TYPES.filter((type) => responseTypes.includes(type) || (type === "skilled" && spell));
    // Still never more than four on offer.
    if (offered.length > 4) offered = offered.filter((type) => type !== ((returning?.fondness ?? 0) >= 0 ? "sharp" : "fair"));
    const person = returning ?? store.addPerson(player, written.person!, day);
    if (returning) store.updatePerson(returning.id, { lastDay: day, flag: null });
    const payload: Payload = { written, responseTypes: offered, followUp: seed.followUp, request, spell: spell && { id: spell.id, name: spell.name } };
    store.addEvent(player, { day, seedId: seed.id, kind: seed.kind, mood: seed.mood, personId: person.id, stakes, payload, sceneSummary: written.sceneSummary });
    // The points that brought this event are spent. Anything over carries to the next.
    store.changeStats(player, { eventPoints: -eventThreshold(stats.rep, data.balance) });
  }

  function toView(player: string, event: StoredEvent): EventView {
    const payload = event.payload as Payload;
    const person = store.listPeople(player).find((item) => item.id === event.personId);
    return {
      id: event.id,
      kind: event.kind as EventView["kind"],
      mood: event.mood as EventView["mood"],
      person: { name: person?.name ?? "Someone", role: person?.role ?? "visitor", returning: (person?.firstDay ?? event.day) < event.day },
      scene: payload.written.scene,
      responses: payload.responseTypes.map((type) => ({
        type,
        text: payload.written.responses.find((response) => response.type === type)!.text,
        ...(type === "skilled" && payload.spell ? { spell: payload.spell } : {}),
      })),
    };
  }

  // The event waiting on the player, writing the next one first if it is due.
  async function current(player: string): Promise<{ event: EventView | null; eventIn: number }> {
    progress.settle(player);
    if (!pendingEvent(player) && progress.getProgress(player).eventReady) {
      let job = writing.get(player);
      if (!job) {
        job = writeNext(player).finally(() => writing.delete(player));
        writing.set(player, job);
      }
      await job;
    }
    const pending = pendingEvent(player);
    return { event: pending ? toView(player, pending) : null, eventIn: progress.getProgress(player).eventIn };
  }

  // Applies what the chosen response type does. The story is never read to decide this.
  function respond(player: string, type: ResponseType): EventOutcome & { rewards: Rewards } {
    const event = pendingEvent(player);
    if (!event) throw new RuleError("Nothing is waiting on you right now.");
    const payload = event.payload as Payload;
    if (!payload.responseTypes.includes(type)) throw new RuleError("That is not one of the choices.");
    const response = payload.written.responses.find((item) => item.type === type)!;
    const profile = rules.effects[type]!;
    const stake = rules.stakes[event.stakes as Stakes]!;

    // A generous act never costs more than the player has.
    const gold = Math.max(Math.round(profile.gold * stake.gold), -progress.getProgress(player).gold) || 0;
    const rep = Math.round(profile.rep * stake.scale);
    const fondness = Math.round(profile.fondness * stake.scale);
    if (gold !== 0) store.addLedger(player, gold, "event", String(event.id));
    store.changeStats(player, { rep });

    const person = store.listPeople(player).find((item) => item.id === event.personId);
    if (person) {
      const newFondness = person.fondness + fondness;
      // Kindness may be thanked later, and a problem walked away from may come back.
      const flag = type === "generous" ? "thanks" : type === "avoid" ? "unfinished" : null;
      const flagged = flag !== null && random() < rules.followUpChance[payload.followUp];
      store.updatePerson(person.id, {
        fondness: newFondness,
        lastDay: event.day,
        status: Math.abs(newFondness) >= rules.settledAt ? "settled" : person.status,
        ...(flagged ? { flag, flagDay: event.day + 2 } : {}),
      });
    }

    let request: RequestView | null = null;
    if (payload.request && payload.written.ask && HELPFUL.includes(type) && person) {
      const id = store.addRequest(player, { personId: person.id, eventId: event.id, entryId: payload.request.entryId, ask: payload.written.ask, gold: payload.request.gold });
      const entry = data.entries.get(payload.request.entryId)!;
      request = { id, from: person.name, ask: payload.written.ask, entry: { id: entry.id, name: entry.name }, gold: payload.request.gold, state: "open" };
    }

    const effects = { gold, rep, fondness };
    store.resolveEvent(event.id, type, effects, response.outcome);
    retireExtraPeople(player);
    return { outcome: response.outcome, effects, request, rewards: progress.settle(player) };
  }

  // Keeps the active cast small: beyond the cap, whoever matters least to the player steps back.
  function retireExtraPeople(player: string): void {
    const active = store.listPeople(player).filter((person) => person.status === "active");
    const extra = active.length - rules.maxActivePeople;
    if (extra <= 0) return;
    const quietest = [...active].sort((a, b) => Math.abs(a.fondness) - Math.abs(b.fondness) || a.lastDay - b.lastDay);
    for (const person of quietest.slice(0, extra)) store.updatePerson(person.id, { status: "dormant" });
  }

  // Starts writing the next event, if one is due, without making anyone wait for it. The page
  // usually finds it ready by the time it asks.
  function prepare(player: string): void {
    if (pendingEvent(player) || writing.has(player) || !progress.getProgress(player).eventReady) return;
    current(player).catch((err) => console.error(`Could not write an event for ${player}:`, err instanceof Error ? err.message : err));
  }

  return { current, respond, prepare };
}
