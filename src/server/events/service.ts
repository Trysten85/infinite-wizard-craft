import { RESPONSE_TYPES, type EventOutcome, type EventSeed, type EventView, type GameEntry, type HintView, type RequestView, type ResponseType, type Rewards, type Stakes } from "../../shared/schema";
import { RuleError } from "../combiner";
import { GenerationError } from "../llm/generate";
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
import { plainParting, type EventBrief, type EventWriter, type PartingQuestion, type WrittenEvent } from "./writer";

export type EventService = ReturnType<typeof createEvents>;

type Effects = { gold: number; rep: number; fondness: number };
type Choice = { type: ResponseType; text: string; outcome: string };

// An event is a conversation in two beats. This is everything kept about one while it is going on:
// the writer's text for each beat, and what code decided.
type Payload = {
  beat: 1 | 2;
  // The seed as it was resolved when the event began, including the made-up one for a returning person.
  seed: EventSeed;
  // Beat 1: the person arrives. The player's first reaction is one of the opening types.
  arrival: WrittenEvent;
  openingTypes: ResponseType[];
  opening: (Choice & { effects: Effects }) | null;
  // Beat 2: the person says what they are after. Written once the player has reacted.
  heart: WrittenEvent | null;
  responseTypes: ResponseType[];
  // What the person leaves the player with if the player helps.
  payoff: { kind: "request" | "hint" | "gift"; entryId: string; gold: number; recipe: string } | null;
  // The person's last line, which delivers the payoff when the player has helped.
  parting: string | null;
  // The spell the Skilled response uses, when the writer judged that one of the player's fits.
  spell: { id: string; name: string } | null;
  // Second beats written ahead of time, one per way the player might first react, so that the
  // conversation never stalls while the model writes.
  drafts?: Partial<Record<ResponseType, HeartDraft>>;
};
type HeartDraft = Pick<Payload, "heart" | "responseTypes" | "payoff" | "spell" | "parting">;

const BEATS = 2;
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
  // Write each event whole, out of sight, before the player hears of it: the arrival, and the
  // second beat for every way of carrying on. Playing it then never waits on the model. When
  // this is off, an event is written a beat at a time, as the page asks for it.
  writeAhead?: boolean;
}) {
  const { data, store, progress, listDiscovered, writer, random = Math.random, writeAhead = false } = deps;
  const rules = data.balance.events;
  // The first reactions that lead on to a second beat. Turning the person away ends it at the door.
  const carryOn = rules.openingTypes.filter((type) => type !== "avoid");
  // One piece of writing at a time per player, however many times the page asks.
  const writing = new Map<string, Promise<unknown>>();
  // Players whose answer is waiting on the writer. Writing ahead stands aside for them.
  const answering = new Set<string>();
  // Writing going on out of sight, one job after another per player.
  const jobs = new Map<string, Promise<void>>();
  // Second beats that could not be written ahead, as "event:type". They are written when needed.
  const gaveUp = new Set<string>();

  const pendingEvent = (player: string) => store.listEvents(player).find((event) => event.state === "pending");
  // An event still being written out of sight.
  const hiddenEvent = (player: string) => store.listEvents(player).find((event) => event.state === "writing");
  const unresolved = (player: string, id: number) => store.listEvents(player).find((event) => event.id === id && event.state !== "resolved");

  // Whether the player has earned their next event. Points are counted when progress is settled.
  function isDue(player: string): boolean {
    const stats = store.getStats(player);
    return stats.eventPoints >= eventThreshold(stats.rep, data.balance);
  }

  // The points that brought an event are spent when it reaches the player. Anything over carries on.
  function spendPoints(player: string): void {
    const stats = store.getStats(player);
    store.changeStats(player, { eventPoints: -Math.min(stats.eventPoints, eventThreshold(stats.rep, data.balance)) });
  }

  // Runs a job out of sight, after any already going for this player. A failure is only logged.
  function inBackground(player: string, job: () => Promise<void>): void {
    const next: Promise<void> = (jobs.get(player) ?? Promise.resolve())
      .then(job)
      .catch((err) => console.error(`Could not write ahead for ${player}:`, err instanceof Error ? err.message : err))
      .finally(() => {
        if (jobs.get(player) === next) jobs.delete(player);
      });
    jobs.set(player, next);
  }

  // Runs one writing job for a player at a time. A second caller waits for the first.
  async function exclusively<T>(player: string, job: () => Promise<T>): Promise<T> {
    while (writing.has(player)) await writing.get(player)!.catch(() => undefined);
    const running = job().finally(() => writing.delete(player));
    writing.set(player, running);
    return running;
  }

  function feeling(fondness: number): string {
    if (fondness >= 3) return "fond of the player";
    if (fondness <= -3) return "cross with the player";
    return "neither warm nor cool toward the player";
  }

  const summarize = (event: StoredEvent) =>
    event.outcomeSummary ? `${event.sceneSummary} The player was ${event.chosen}: ${event.outcomeSummary}` : event.sceneSummary;

  // What the writer is told about someone the player already knows.
  function personRecord(player: string, person: Person, day: number, withFollowUp: boolean) {
    const meetings = store.listEvents(player).filter((event) => event.personId === person.id && event.state === "resolved");
    return {
      returning: true as const,
      name: person.name,
      pronoun: person.pronoun,
      role: person.role,
      traits: person.traits,
      facts: person.facts,
      feeling: feeling(person.fondness),
      followUp: withFollowUp && flagDue(person, day) ? (FOLLOW_UP[person.flag!] ?? null) : null,
      // Only the last few meetings are sent. The full log stays on disk.
      history: meetings.slice(-rules.memory).map(summarize),
    };
  }

  // What the person leaves the player with if the player helps: a request for something, a hint
  // about something, or a small gift. Always a material the player lacks and could reach.
  function planPayoff(player: string, snapshot: PlayerSnapshot, discovered: GameEntry[], seed: EventSeed, stakes: Stakes, skillTags: string[]): Payload["payoff"] {
    const have = new Set(discovered.map((entry) => entry.id));
    const asked = new Set(store.listRequests(player).filter((request) => request.state === "open").map((request) => request.entryId));
    const hinted = new Set(store.listHints(player).map((hint) => hint.entryId));
    const never = new Set([...data.balance.shop.neverSells, ...rules.payoff.never]);
    const wanted = new Set([...skillTags, ...(snapshot.job?.wantedTags ?? [])]);
    const reachable = [...data.entries.values()]
      .filter((entry) => entry.kind === "material" && !have.has(entry.id) && !never.has(entry.id))
      .map((entry) => ({ entry, steps: buildPath(data, entry.id, have).length }));
    const pools = {
      request: seed.canRequest ? reachable.filter(({ entry, steps }) => steps <= rules.request.maxMissingSteps && !asked.has(entry.id)) : [],
      hint: reachable.filter(({ entry, steps }) => steps <= rules.payoff.hintMaxMissingSteps && !hinted.has(entry.id)),
      gift: reachable.filter(({ steps }) => steps <= rules.payoff.giftMaxMissingSteps),
    };
    const kinds = (["request", "hint", "gift"] as const).filter((kind) => pools[kind].length > 0).map((kind) => ({ item: kind, weight: rules.payoff.weights[kind] }));
    const kind = weightedPick<"request" | "hint" | "gift" | "none">([...kinds, { item: "none", weight: rules.payoff.weights.none }], random());
    if (!kind || kind === "none") return null;
    const entry = weightedPick(pools[kind].map(({ entry }) => ({ item: entry, weight: 1 + entry.tags.filter((tag) => wanted.has(tag)).length })), random());
    if (!entry) return null;
    const recipe = [...data.combos.values()].filter((item) => item.result === entry.id).sort((a, b) => a.needs.length - b.needs.length)[0];
    const pay = 1 + repBandFor(store.getStats(player).rep, data.balance).requestPay;
    return {
      kind,
      entryId: entry.id,
      gold: kind === "request" ? Math.round(rules.request.goldPerLevel * snapshot.level * rules.stakes[stakes]!.scale * pay) : 0,
      recipe: recipe ? recipe.inputs.map((id) => data.entries.get(id)!.name).join(" and ") : "",
    };
  }

  // Asks the writer, some of the time, whether a spell the player has learned and can cast would
  // solve the scene. Only spells carrying one of the seed's spell tags are put to it, so a damage
  // spell is never the answer to a spilled pie. The writer only chooses the spell. What it does
  // is the fixed Skilled effect.
  async function findSpellSolution(player: string, level: number, discovered: GameEntry[], written: WrittenEvent, personName: string, spellTags: string[]) {
    if (spellTags.length === 0 || random() >= rules.spellCheck.chance) return null;
    const learned = new Set(store.getLearned(player));
    const blocked = new Set(rules.spellCheck.blockedTags);
    const fits = new Set(spellTags);
    const spells = discovered
      .filter((entry) => learned.has(entry.id) && entry.tier <= level)
      .filter((entry) => entry.tags.some((tag) => fits.has(tag)) && !entry.tags.some((tag) => blocked.has(tag)))
      .map((entry) => ({ id: entry.id, name: entry.name, school: data.entries.get(entry.school ?? "")?.name ?? "", tags: entry.tags }));
    if (spells.length === 0) return null;
    const answer = await writer.checkSpell({ scene: written.scene, personName, spells });
    const spell = spells.find((item) => item.id === answer.spellId);
    return spell ? { id: spell.id, name: spell.name, text: answer.text, outcome: answer.outcome } : null;
  }

  // Beat 1. Code picks the seed, the person, and the stakes; the writer has them arrive.
  // `forcedSeed` is for testing: that seed is used whatever the player's state, and no points are spent.
  // An event stored as "writing" stays out of sight until the rest of it has been written.
  // Returns the new event's id, or undefined if no seed suits the player.
  async function writeArrival(player: string, forcedSeed?: string, state: "writing" | "pending" = "pending"): Promise<number | undefined> {
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
    const wantRepeat = forcedSeed ? forcedSeed === "repeat" : random() < repeatChance(people, day, data.balance);
    if (wantRepeat) returning = weightedPick(returningWeights(people, day, lastPersonId), random());
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
        spellTags: ["utility", "healing", "knowledge"],
      };
    } else {
      const candidates = forcedSeed ? data.eventSeeds.filter((item) => item.id === forcedSeed) : eligibleSeeds(data.eventSeeds, snapshot);
      seed = weightedPick(candidates.map((item) => ({ item, weight: seedWeight(item, snapshot, recent) })), random());
      if (!seed) return;
      // With a full cast, a seed that allows it brings back a familiar face instead of adding one.
      const active = people.filter((person) => person.status === "active");
      if (seed.who === "any" && active.length >= rules.maxActivePeople) {
        returning = weightedPick(returningWeights(active, day, lastPersonId), random());
      }
    }

    const stakes = seed.stakes[Math.floor(random() * seed.stakes.length)]!;
    const brief: EventBrief = {
      stage: "arrival",
      soFar: null,
      seed: { premise: seed.premise, kind: seed.kind, mood: seed.mood },
      stakes,
      player: { job: snapshot.job?.name ?? null, topTags: snapshot.topTags, repBand: repBandFor(stats.rep, data.balance).name },
      person: returning ? personRecord(player, returning, day, true) : { returning: false },
      recent: history.slice(-3).map((event) => event.sceneSummary),
      responseTypes: rules.openingTypes,
      takenNames: people.map((person) => person.name),
    };
    const arrival = await writer.write(brief);
    const person = returning ?? store.addPerson(player, arrival.person!, day);
    if (returning) store.updatePerson(returning.id, { lastDay: day, flag: null });
    const payload: Payload = { beat: 1, seed, arrival, openingTypes: rules.openingTypes, opening: null, heart: null, responseTypes: [], payoff: null, spell: null, parting: null };
    const eventId = store.addEvent(player, { day, seedId: seed.id, kind: seed.kind, mood: seed.mood, personId: person.id, stakes, payload, sceneSummary: arrival.sceneSummary }, state);
    if (forcedSeed === undefined && state === "pending") spendPoints(player);
    return eventId;
  }

  // Beat 2. The person says what they are after, in answer to how the player first reacted.
  async function writeHeart(player: string, event: StoredEvent, payload: Payload, person: Person, opening: Choice): Promise<HeartDraft> {
    const { seed } = payload;
    const discovered = listDiscovered(player);
    const { level } = progress.getProgress(player);
    const snapshot = snapshotPlayer(data, discovered, level);
    const skillTags = skillTagsFor(seed, snapshot);
    const responseTypes = offeredTypes(seed.responseTypes, skillTags, snapshot, person.fondness);
    const payoff = planPayoff(player, snapshot, discovered, seed, event.stakes as Stakes, skillTags);
    const brief: EventBrief = {
      stage: "heart",
      soFar: { scene: payload.arrival.scene, choice: opening.text, reaction: opening.outcome },
      seed: { premise: seed.premise, kind: seed.kind, mood: seed.mood },
      stakes: event.stakes as Stakes,
      player: { job: snapshot.job?.name ?? null, topTags: snapshot.topTags, repBand: repBandFor(store.getStats(player).rep, data.balance).name },
      person: personRecord(player, person, event.day, false),
      recent: [],
      responseTypes,
      takenNames: store.listPeople(player).map((item) => item.name),
    };
    const heart = await writer.write(brief);
    const spell = await findSpellSolution(player, level, discovered, heart, person.name, seed.spellTags ?? skillTags);
    if (spell) {
      // The spell becomes the Skilled way through, whether or not the player's tags had earned one.
      heart.responses = [...heart.responses.filter((response) => response.type !== "skilled"), { type: "skilled", text: spell.text, outcome: spell.outcome }];
    }
    let offered = RESPONSE_TYPES.filter((type) => responseTypes.includes(type) || (type === "skilled" && spell));
    // Still never more than four on offer.
    if (offered.length > 4) offered = offered.filter((type) => type !== (person.fondness >= 0 ? "sharp" : "fair"));
    // The scene is written first, on its own. What the person leaves behind is then one more line,
    // so the story never has to be bent around a thing code chose.
    let parting: string | null = null;
    if (payoff) {
      const question: PartingQuestion = {
        kind: payoff.kind,
        name: data.entries.get(payoff.entryId)!.name,
        madeFrom: payoff.recipe,
        person: { name: person.name, role: person.role, traits: person.traits },
        ending: `${heart.sceneSummary} The player helped.`,
      };
      try {
        parting = await writer.writeParting(question);
      } catch (err) {
        // If the model cannot name the thing in a line of its own, a plain line does the job.
        if (!(err instanceof GenerationError)) throw err;
        parting = plainParting(question);
      }
    }
    return { heart, responseTypes: offered, payoff, spell: spell && { id: spell.id, name: spell.name }, parting };
  }

  // Writes the second beat ahead of time for each way the player might first react, one at a time.
  // Each is its own turn at the writer, so an answer the player is waiting on can go in between.
  async function writeDrafts(player: string, eventId: number): Promise<void> {
    for (const type of carryOn) {
      const write = async () => {
        const event = unresolved(player, eventId);
        const payload = event?.payload as Payload | undefined;
        if (answering.has(player)) return;
        if (!event || !payload || payload.beat !== 1 || payload.drafts?.[type]) return;
        const person = store.listPeople(player).find((item) => item.id === event.personId);
        const choice = payload.arrival.responses.find((item) => item.type === type);
        if (!person || !choice) return;
        const warmed = { ...person, fondness: person.fondness + Math.sign(rules.effects[type]!.fondness) };
        const draft = await writeHeart(player, event, payload, warmed, choice);
        // The event may have moved on while this was being written.
        const latest = unresolved(player, eventId);
        const current = latest?.payload as Payload | undefined;
        if (latest && current?.beat === 1) store.updateEvent(eventId, { ...current, drafts: { ...current.drafts, [type]: draft } }, latest.sceneSummary);
      };
      // A beat the writer cannot manage is tried once more, then left to be written when needed.
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          await exclusively(player, write);
          break;
        } catch (err) {
          if (!(err instanceof GenerationError)) throw err;
          if (attempt === 2) {
            gaveUp.add(`${eventId}:${type}`);
            console.error(`Could not write ahead for ${player}:`, err.message);
          }
        }
      }
    }
  }

  // Puts a hidden event in front of the player, once everything that can be written for it has been.
  function show(player: string, eventId: number): boolean {
    const event = hiddenEvent(player);
    // Only one event is in front of the player at a time. A second waits its turn, still hidden.
    if (!event || event.id !== eventId || pendingEvent(player)) return false;
    const drafts = (event.payload as Payload).drafts ?? {};
    if (carryOn.some((type) => !drafts[type] && !gaveUp.has(`${eventId}:${type}`))) return false;
    store.showEvent(eventId);
    spendPoints(player);
    return true;
  }

  // Writes the player's next event from start to finish, out of sight, then shows it. If this is
  // cut short, for instance by the server stopping, the next call carries on from what was written.
  async function writeWhole(player: string): Promise<void> {
    const started = Date.now();
    if (!hiddenEvent(player)) {
      await exclusively(player, async () => {
        if (pendingEvent(player) || hiddenEvent(player) || !isDue(player)) return;
        await writeArrival(player, undefined, "writing");
      });
    }
    const hidden = hiddenEvent(player);
    if (!hidden) return;
    await writeDrafts(player, hidden.id);
    if (show(player, hidden.id)) console.log(`An event is ready for ${player}, written in ${Math.round((Date.now() - started) / 1000)} seconds.`);
  }

  function toView(player: string, event: StoredEvent): EventView {
    const payload = event.payload as Payload;
    const person = store.listPeople(player).find((item) => item.id === event.personId);
    const beat = payload.beat === 2 && payload.heart ? { written: payload.heart, types: payload.responseTypes } : { written: payload.arrival, types: payload.openingTypes };
    return {
      id: event.id,
      beat: payload.beat,
      beats: BEATS,
      earlier: payload.beat === 2 && payload.opening ? [{ scene: payload.arrival.scene, chosen: payload.opening.text, outcome: payload.opening.outcome }] : [],
      kind: event.kind as EventView["kind"],
      mood: event.mood as EventView["mood"],
      person: { name: person?.name ?? "Someone", role: person?.role ?? "visitor", returning: (person?.firstDay ?? event.day) < event.day },
      scene: beat.written.scene,
      responses: beat.types.map((type) => ({
        type,
        text: beat.written.responses.find((response) => response.type === type)!.text,
        ...(type === "skilled" && payload.beat === 2 && payload.spell ? { spell: payload.spell } : {}),
      })),
    };
  }

  // The event waiting on the player. When events are written ahead this never waits: one that is
  // due is started out of sight and turns up when it is ready. Otherwise a due event is written first.
  async function current(player: string): Promise<{ event: EventView | null; eventIn: number }> {
    progress.settle(player);
    if (writeAhead) prepare(player);
    else {
      await exclusively(player, async () => {
        if (!pendingEvent(player) && isDue(player)) await writeArrival(player);
      });
    }
    const pending = pendingEvent(player);
    return { event: pending ? toView(player, pending) : null, eventIn: progress.getProgress(player).eventIn };
  }

  // Ends the event: applies what the chosen response type does, and whatever the person leaves behind.
  function finish(player: string, event: StoredEvent, payload: Payload, choice: Choice): EventOutcome & { rewards: Rewards } {
    const profile = rules.effects[choice.type]!;
    const stake = rules.stakes[event.stakes as Stakes]!;
    // A generous act never costs more than the player has.
    const gold = Math.max(Math.round(profile.gold * stake.gold), -progress.getProgress(player).gold) || 0;
    const effects: Effects = { gold, rep: Math.round(profile.rep * stake.scale), fondness: Math.round(profile.fondness * stake.scale) };
    if (gold !== 0) store.addLedger(player, gold, "event", String(event.id));
    store.changeStats(player, { rep: effects.rep });

    const person = store.listPeople(player).find((item) => item.id === event.personId);
    if (person) {
      const fondness = person.fondness + effects.fondness;
      // Kindness may be thanked later, and a problem walked away from may come back.
      const flag = choice.type === "generous" ? "thanks" : choice.type === "avoid" ? "unfinished" : null;
      const flagged = flag !== null && random() < rules.followUpChance[payload.seed.followUp];
      store.updatePerson(person.id, {
        fondness,
        lastDay: event.day,
        status: Math.abs(fondness) >= rules.settledAt ? "settled" : person.status,
        ...(flagged ? { flag, flagDay: event.day + 2 } : {}),
      });
    }

    let request: RequestView | null = null;
    let hint: HintView | null = null;
    let gift: EventOutcome["gift"] = null;
    const parting = payload.parting;
    // The event may have been written a while ago. What it planned to leave is dropped if the
    // player has since come by that thing themselves.
    const owned = payload.payoff !== null && listDiscovered(player).some((entry) => entry.id === payload.payoff!.entryId);
    if (payload.payoff && parting && person && HELPFUL.includes(choice.type) && !owned) {
      const entry = data.entries.get(payload.payoff.entryId)!;
      const named = { id: entry.id, name: entry.name };
      if (payload.payoff.kind === "request") {
        const id = store.addRequest(player, { personId: person.id, eventId: event.id, entryId: entry.id, ask: parting, gold: payload.payoff.gold });
        request = { id, from: person.name, ask: parting, entry: named, gold: payload.payoff.gold, state: "open" };
      } else if (payload.payoff.kind === "hint") {
        store.addHint(player, entry.id, payload.payoff.recipe, person.name);
        hint = { entry: named, recipe: payload.payoff.recipe, from: person.name };
      } else {
        // A gift is the player's from now on, but it was not made, so it pays no discovery gold.
        store.addLedger(player, 0, "gift", entry.id);
        store.addDiscovery(player, entry.id);
        gift = named;
      }
    }

    const outcome = parting && (request || hint || gift) ? `${choice.outcome} ${parting}` : choice.outcome;
    store.resolveEvent(event.id, choice.type, effects, choice.outcome);
    retireExtraPeople(player);
    return { outcome, effects, next: null, request, hint, gift, rewards: progress.settle(player) };
  }

  // The player's answer to the beat in front of them. The story is never read to decide what it
  // does: only the response type is. Answering the arrival takes a few seconds, because the next
  // beat is written in reply to it.
  // `expectedBeat` is the beat the player thinks they are answering. Passing it stops a double click from
  // answering the next beat by accident.
  async function respond(player: string, type: ResponseType, expectedBeat?: number): Promise<EventOutcome & { rewards: Rewards }> {
    // If the answer needs nothing written, it is given at once, even while a beat is being written
    // ahead in the background. Only a beat that must be written now waits its turn.
    const waiting = pendingEvent(player);
    const stored = waiting?.payload as Payload | undefined;
    const needsWriting = stored?.beat === 1 && type !== "avoid" && !stored.drafts?.[type];
    const answer = async () => {
      const event = pendingEvent(player);
      if (!event) throw new RuleError("Nothing is waiting on you right now.");
      const payload = event.payload as Payload;
      if (expectedBeat !== undefined && expectedBeat !== payload.beat) throw new RuleError("That moment has passed.");
      const beat = payload.beat === 2 && payload.heart ? { written: payload.heart, types: payload.responseTypes } : { written: payload.arrival, types: payload.openingTypes };
      if (!beat.types.includes(type)) throw new RuleError("That is not one of the choices.");
      const choice = beat.written.responses.find((item) => item.type === type)!;

      // Turning the person away at the door ends it there, and so does any answer to the second beat.
      if (payload.beat === 2 || type === "avoid") return finish(player, event, payload, choice);

      // Otherwise the first reaction only warms or cools them a little, and the conversation goes on.
      const person = store.listPeople(player).find((item) => item.id === event.personId)!;
      const effects: Effects = { gold: 0, rep: 0, fondness: Math.sign(rules.effects[type]!.fondness) };
      const warmed = { ...person, fondness: person.fondness + effects.fondness };
      // Use the beat written ahead for this choice if there is one. Otherwise write it now.
      const draft = payload.drafts?.[type] ?? (await writeHeart(player, event, payload, warmed, choice));
      // Nothing is changed until the next beat exists, so a failed write can simply be tried again.
      store.updatePerson(person.id, { fondness: warmed.fondness });
      const next: Payload = { ...payload, ...draft, beat: 2, opening: { ...choice, effects }, drafts: undefined };
      store.updateEvent(event.id, next, next.heart!.sceneSummary);
      return { outcome: choice.outcome, effects, next: toView(player, { ...event, payload: next }), request: null, hint: null, gift: null, rewards: progress.settle(player) };
    };
    if (!needsWriting) return answer();
    answering.add(player);
    try {
      return await exclusively(player, answer);
    } finally {
      answering.delete(player);
    }
  }

  // Keeps the active cast small: beyond the cap, whoever matters least to the player steps back.
  function retireExtraPeople(player: string): void {
    const active = store.listPeople(player).filter((person) => person.status === "active");
    const extra = active.length - rules.maxActivePeople;
    if (extra <= 0) return;
    const quietest = [...active].sort((a, b) => Math.abs(a.fondness) - Math.abs(b.fondness) || a.lastDay - b.lastDay);
    for (const person of quietest.slice(0, extra)) store.updatePerson(person.id, { status: "dormant" });
  }

  // Starts writing the next event, if one is due, without making anyone wait for it. Call it
  // after anything that can earn points. An event left half-written is carried on from there.
  function prepare(player: string): void {
    if (pendingEvent(player)) return;
    if (writeAhead) {
      if (!jobs.has(player) && (hiddenEvent(player) || isDue(player))) inBackground(player, () => writeWhole(player));
    } else if (!writing.has(player) && isDue(player)) {
      current(player).catch((err) => console.error(`Could not write an event for ${player}:`, err instanceof Error ? err.message : err));
    }
  }

  // Resolves once nothing is being written out of sight for the player. For tests and tools.
  async function idle(player: string): Promise<void> {
    while (jobs.has(player)) await jobs.get(player);
  }

  // For testing: writes a fresh event right now, without waiting for points and without spending
  // any. An event already waiting is thrown away first, along with a person it introduced.
  // The result is a real event: answering it changes gold, standing, and fondness as usual.
  async function test(player: string, seedId?: string): Promise<{ event: EventView | null; eventIn: number; seed: string }> {
    const known = ["repeat", ...data.eventSeeds.map((seed) => seed.id)];
    if (seedId !== undefined && !known.includes(seedId)) throw new RuleError(`There is no event seed "${seedId}". Seeds: ${known.join(", ")}.`);
    if (seedId === "repeat" && store.listPeople(player).length === 0) throw new RuleError("Nobody can come back yet: this player has not met anyone.");
    return exclusively(player, async () => {
      const waiting = pendingEvent(player);
      if (waiting) {
        store.deleteEvent(waiting.id);
        const introduced = store.listPeople(player).find((person) => person.id === waiting.personId && person.firstDay === waiting.day);
        if (introduced) store.deletePerson(introduced.id);
      }
      // With no seed named, one is picked the usual way from those the player qualifies for.
      const qualifying = eligibleSeeds(data.eventSeeds, snapshotPlayer(data, listDiscovered(player), progress.getProgress(player).level));
      const seed = seedId ?? weightedPick(qualifying.map((item) => ({ item: item.id, weight: 1 })), random())!;
      const eventId = await writeArrival(player, seed);
      // The test event is shown as soon as it has arrived. Its second beats follow behind it.
      if (writeAhead && eventId !== undefined) inBackground(player, () => writeDrafts(player, eventId));
      const written = pendingEvent(player);
      return { event: written ? toView(player, written) : null, eventIn: progress.getProgress(player).eventIn, seed: written?.seedId ?? seed };
    });
  }

  return { current, respond, prepare, test, idle };
}
