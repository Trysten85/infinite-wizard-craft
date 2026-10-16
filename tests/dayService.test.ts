import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/server/app";
import { xpToReach } from "../src/server/progress";
import { openStore } from "../src/server/store";
import type { DayView, Ledger } from "../src/shared/schema";
import { data, DUSK, newGame, NOON, TO_FIRE_BOLT } from "./helpers";

const rules = data.balance.day;
type Game = ReturnType<typeof newGame>;

// Fixed recipes the player could make right now for something they do not have, in file order.
function makeable(game: Game, player: string): [string, string][] {
  const have = new Set(game.combiner.listDiscovered(player).map((entry) => entry.id));
  const hasFocus = [...have].some((id) => data.entries.get(id)?.kind === "focus");
  return [...data.combos.values()]
    .filter((recipe) => !have.has(recipe.result) && [...recipe.inputs, ...recipe.needs].every((id) => have.has(id)))
    .filter((recipe) => data.entries.get(recipe.result)!.kind !== "spell" || hasFocus)
    .map((recipe) => recipe.inputs as [string, string]);
}

// Makes this many new things, one after another, and returns what each did to the day.
async function discover(game: Game, player: string, count: number) {
  const turns = [];
  for (let made = 0; made < count; made++) {
    const [next] = makeable(game, player);
    if (!next) throw new Error("ran out of things to make");
    turns.push(...(await game.craft(player, [next])));
  }
  return turns;
}

const dayOf = (game: Game, player = "ann") => game.progress.getProgress(player).day!;

describe("the sun", () => {
  it("starts every player at dawn on day one", () => {
    const game = newGame();
    expect(dayOf(game)).toMatchObject({ number: 1, sun: 0, phase: "morning", candles: rules.candles, nightIn: null, canTurnIn: false, shiftDone: false, lastLedger: null });
  });

  it("moves a notch for each new thing made by combining, and for nothing else", async () => {
    const game = newGame();
    game.store.addLedger("ann", 1000, "quest", "test-grant");
    game.stall("ann");
    expect(await game.craft("ann", [["fire", "air"]])).toEqual([{ night: null, dusk: null }]);
    expect(dayOf(game).sun).toBe(1);
    // Making it again.
    await game.craft("ann", [["fire", "air"]]);
    expect(dayOf(game).sun).toBe(1);
    // A combination the rules refuse never reaches the day.
    await expect(game.craft("ann", [["fire", "glass"]])).rejects.toMatchObject({ code: "rule" });
    expect(dayOf(game).sun).toBe(1);
    // Buying, and learning a spell.
    game.shop.buy("ann", 0);
    await game.play("ann", TO_FIRE_BOLT);
    game.progress.learn("ann", "spell-fire-bolt");
    expect(dayOf(game).sun).toBe(1);
  });

  it("reaches noon, then dusk, and stops there", async () => {
    const game = newGame();
    await discover(game, "ann", NOON - 1);
    expect(dayOf(game)).toMatchObject({ phase: "morning", canTurnIn: false });
    await discover(game, "ann", 1);
    expect(dayOf(game)).toMatchObject({ sun: NOON, phase: "afternoon", canTurnIn: true });
    const turns = await discover(game, "ann", DUSK - NOON);
    // Dusk is said once, on the thing that brought it on.
    expect(turns.map((turn) => turn.dusk !== null)).toEqual([...Array(DUSK - NOON - 1).fill(false), true]);
    expect(data.dayText.dusk).toContain(turns.at(-1)!.dusk);
    expect(dayOf(game)).toMatchObject({ sun: DUSK, phase: "evening", candles: rules.candles, canTurnIn: false, nightIn: rules.nightAfter });
    await discover(game, "ann", 2);
    expect(dayOf(game)).toMatchObject({ sun: DUSK, phase: "evening", nightIn: rules.nightAfter - 2 });
  });
});

describe("night", () => {
  it("falls when the player goes to bed, which is offered from dusk", () => {
    const game = newGame();
    expect(() => game.day.end("ann")).toThrowError(expect.objectContaining({ code: "rule", message: expect.stringMatching(/from noon/) }));
    game.dusk("ann");
    const { night, dusk } = game.day.end("ann");
    expect(dusk).toBeNull();
    expect(night).toMatchObject({ day: 1, fell: "bed", takings: [], cheer: null, brought: [], missed: null, deed: false });
    expect(data.dayText.night.bed).toContain(night!.lines[0]);
    expect(dayOf(game)).toMatchObject({ number: 2, sun: 0, phase: "morning", candles: rules.candles, shiftDone: false, lastLedger: night });
  });

  it("falls when the last candle is spent", () => {
    const game = newGame();
    expect(() => game.day.spend("ann", 1)).toThrowError(expect.objectContaining({ code: "not-evening" }));
    game.dusk("ann");
    expect(game.day.spend("ann", 1)).toEqual({ night: null, dusk: null });
    expect(() => game.day.spend("ann", 3)).toThrowError(expect.objectContaining({ code: "no-candles" }));
    expect(dayOf(game).candles).toBe(rules.candles - 1);
    const { night } = game.day.spend("ann", rules.candles - 1);
    expect(night).toMatchObject({ day: 1, fell: "last-candle" });
    expect(dayOf(game).number).toBe(2);
  });

  it("falls by itself when the player crafts on past dusk, and a candle spent starts the count again", async () => {
    const game = newGame();
    // The discovery that brings dusk on does not count.
    await discover(game, "ann", DUSK);
    expect(dayOf(game).nightIn).toBe(rules.nightAfter);
    await discover(game, "ann", rules.nightAfter - 1);
    expect(dayOf(game)).toMatchObject({ number: 1, nightIn: 1 });
    game.day.spend("ann", 1);
    expect(dayOf(game).nightIn).toBe(rules.nightAfter);
    const turns = await discover(game, "ann", rules.nightAfter);
    expect(turns.slice(0, -1).every((turn) => turn.night === null)).toBe(true);
    expect(turns.at(-1)!.night).toMatchObject({ day: 1, fell: "midnight-oil" });
    expect(data.dayText.night["midnight-oil"]).toContain(turns.at(-1)!.night!.lines[0]);
    // Unspent candles are gone with the day.
    expect(dayOf(game)).toMatchObject({ number: 2, sun: 0, candles: rules.candles });
  });

  it("is not brought on by making old things again after dusk", async () => {
    const game = newGame();
    await discover(game, "ann", DUSK);
    for (let again = 0; again < rules.nightAfter + 2; again++) await game.craft("ann", [["fire", "air"]]);
    expect(dayOf(game)).toMatchObject({ number: 1, nightIn: rules.nightAfter });
  });
});

describe("turning in early", () => {
  it("brings dusk on from noon, with a shorter evening, and does not bring night", () => {
    const game = newGame();
    game.setDay("ann", { sun: NOON });
    const turn = game.day.end("ann");
    expect(turn.night).toBeNull();
    expect(data.dayText.turnedIn).toContain(turn.dusk);
    expect(dayOf(game)).toMatchObject({ number: 1, sun: DUSK, phase: "evening", candles: rules.earlyCandles, candlesMax: rules.earlyCandles, canTurnIn: false });
    // From there the evening ends in the usual ways.
    expect(game.day.end("ann").night).toMatchObject({ fell: "bed" });
    // The next evening is a full one again.
    game.dusk("ann");
    expect(dayOf(game).candles).toBe(rules.candles);
  });
});

describe("the night ledger", () => {
  it("says how night fell and what the morning brings, with new orders only for a player with a job", () => {
    const jobless = newGame();
    jobless.dusk("ann");
    const first = jobless.day.end("ann").night!;
    expect(first.lines).toHaveLength(3);
    expect(data.dayText.morning).toContain(first.lines[1]);
    expect(data.dayText.shopRestocked).toContain(first.lines[2]);

    const smith = newGame();
    for (const id of ["person", "forge", "blacksmith"]) smith.store.addDiscovery("ann", id);
    smith.progress.chooseJob("ann", "blacksmith");
    smith.dusk("ann");
    const second = smith.day.end("ann").night!;
    expect(second.lines).toHaveLength(4);
    expect(data.dayText.newOrders).toContain(second.lines[3]);
  });

  it("notes a deed on a day the player gained a level, and not the day after", () => {
    const game = newGame();
    game.progress.settle("ann");
    game.store.changeStats("ann", { bonusXp: xpToReach(2, data.balance) });
    game.dusk("ann");
    expect(game.day.end("ann").night).toMatchObject({ day: 1, deed: true });
    game.dusk("ann");
    expect(game.day.end("ann").night).toMatchObject({ day: 2, deed: false });
  });

  it("is kept until the next night, and is still there when the game is opened again", () => {
    const dir = mkdtempSync(join(tmpdir(), "iwc-day-"));
    const path = join(dir, "game.db");
    const first = newGame(1, undefined, { store: openStore(path) });
    first.setDay("ann", { sun: DUSK, spent: 1 });
    const ledger = first.day.end("ann").night!;
    first.setDay("ann", { sun: NOON + 1 });
    first.store.close();

    const second = newGame(1, undefined, { store: openStore(path) });
    expect(dayOf(second)).toMatchObject({ number: 2, sun: NOON + 1, phase: "afternoon", lastLedger: ledger });
    second.dusk("ann");
    const next = second.day.end("ann").night!;
    expect(dayOf(second).lastLedger).toEqual(next);
    expect(next.day).toBe(2);
    second.store.close();
    rmSync(dir, { recursive: true });
  });
});

describe("a saved game from before there were days", () => {
  // The tables as they were, with a player part-way through the game.
  function oldSave(path: string) {
    const old = new DatabaseSync(path);
    old.exec(`
      CREATE TABLE player_stats (player TEXT PRIMARY KEY, rep INTEGER NOT NULL DEFAULT 0, event_points INTEGER NOT NULL DEFAULT 0,
        last_level INTEGER NOT NULL DEFAULT 1, bonus_xp INTEGER NOT NULL DEFAULT 0, job TEXT, shift_at INTEGER);
      CREATE TABLE people (id INTEGER PRIMARY KEY AUTOINCREMENT, player TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
        traits TEXT NOT NULL, facts TEXT NOT NULL, fondness INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active',
        first_day INTEGER NOT NULL, last_day INTEGER NOT NULL, flag TEXT, flag_day INTEGER, pronoun TEXT, UNIQUE (player, name));
      CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, player TEXT NOT NULL, day INTEGER NOT NULL, seed_id TEXT NOT NULL,
        kind TEXT NOT NULL, mood TEXT NOT NULL, person_id INTEGER NOT NULL, stakes TEXT NOT NULL, payload TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending', chosen TEXT, effects TEXT, scene_summary TEXT NOT NULL, outcome_summary TEXT,
        at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE shop_state (player TEXT PRIMARY KEY, stocked_at INTEGER NOT NULL);
      CREATE TABLE shop_stock (player TEXT NOT NULL, slot INTEGER NOT NULL, entry_id TEXT NOT NULL, type TEXT NOT NULL, reason TEXT NOT NULL,
        sold INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (player, slot));
      INSERT INTO player_stats (player, rep, event_points, last_level, bonus_xp, job, shift_at) VALUES ('ann', 6, 9, 3, 700, 'blacksmith', 40);
      INSERT INTO player_stats (player) VALUES ('bob');
      INSERT INTO people (player, name, role, traits, facts, fondness, first_day, last_day, flag, flag_day) VALUES
        ('ann', 'Odessa Tuck', 'baker', '[]', '[]', 2, 1, 3, NULL, NULL),
        ('ann', 'Pim Kettlebrook', 'neighbor', '[]', '[]', -1, 2, 4, 'thanks', 6),
        ('bob', 'Mavis Tuck', 'pedlar', '[]', '[]', 0, 1, 1, NULL, NULL);
      INSERT INTO shop_state (player, stocked_at) VALUES ('ann', 40);
      INSERT INTO shop_stock (player, slot, entry_id, type, reason) VALUES ('ann', 0, 'sulfur', 'random', '');
    `);
    const event = old.prepare("INSERT INTO events (player, day, seed_id, kind, mood, person_id, stakes, payload, state, scene_summary) VALUES (?, ?, 'small_thief', 'comic', '[]', ?, 'S', '{}', ?, 'A goose.')");
    for (const [day, person, state] of [[1, 1, "resolved"], [2, 2, "resolved"], [3, 1, "resolved"], [4, 2, "resolved"]] as const) event.run("ann", day, person, state);
    event.run("bob", 1, 3, "pending");
    old.close();
  }

  it("opens at dawn on day one, with everything it had", () => {
    const dir = mkdtempSync(join(tmpdir(), "iwc-day-"));
    const path = join(dir, "old.db");
    oldSave(path);
    const store = openStore(path);
    for (const player of ["ann", "bob", "nobody"]) {
      expect(store.getDay(player).state, player).toEqual({ number: 1, sun: 0, shiftDone: false, early: false, spent: 0, oil: 0 });
      expect(store.getDay(player)).toMatchObject({ visitorDay: 0, lastLedger: null });
    }
    expect(store.getStats("ann")).toEqual({ rep: 6, lastLevel: 3, bonusXp: 700, job: "blacksmith" });
    // A level reached before days began earns no deed on the first night.
    expect(store.getDay("ann").dawnLevel).toBe(3);
    expect(store.listPeople("ann").map((person) => person.fondness)).toEqual([2, -1]);
    // The shelf the player last saw is the shelf for their first day.
    expect(store.getShop("ann")).toMatchObject({ stockedDay: 1, slots: [{ entryId: "sulfur" }] });
    store.close();
    rmSync(dir, { recursive: true });
  });

  it("keeps the order of what happened, moved back to end before day one", () => {
    const dir = mkdtempSync(join(tmpdir(), "iwc-day-"));
    const path = join(dir, "old.db");
    oldSave(path);
    const store = openStore(path);
    expect(store.listEvents("ann").map((event) => event.day)).toEqual([-3, -2, -1, 0]);
    expect(store.listPeople("ann").map((person) => [person.firstDay, person.lastDay, person.flagDay])).toEqual([[-3, -1, null], [-2, 0, 2]]);
    // Each player is moved by their own count.
    expect(store.listEvents("bob").map((event) => event.day)).toEqual([0]);
    expect(store.listPeople("bob").map((person) => [person.firstDay, person.lastDay])).toEqual([[0, 0]]);
    store.close();
    // Opening it again moves nothing further.
    const again = openStore(path);
    expect(again.listEvents("ann").map((event) => event.day)).toEqual([-3, -2, -1, 0]);
    again.close();
    rmSync(dir, { recursive: true });
  });

  it("makes an event that was waiting tonight's visitor, and writes nobody new until they are seen", async () => {
    const dir = mkdtempSync(join(tmpdir(), "iwc-day-"));
    const path = join(dir, "old.db");
    const before = newGame(1, undefined, { store: openStore(path) });
    await before.events.test("bob", "small_thief");
    // As an old save had it: an ordinary event, waiting.
    const waiting = before.store.listEvents("bob")[0]!;
    before.store.updateEvent(waiting.id, { ...(waiting.payload as object), free: undefined }, waiting.sceneSummary);
    before.store.close();

    const game = newGame(1, undefined, { store: openStore(path) });
    expect(game.progress.getProgress("bob")).toMatchObject({ eventReady: true, eventIn: 0 });
    expect((await game.events.current("bob")).event).toBeNull();
    game.dusk("bob");
    expect((await game.events.current("bob")).event).toMatchObject({ id: waiting.id });
    expect(game.store.listEvents("bob")).toHaveLength(1);
    game.store.close();
    rmSync(dir, { recursive: true });
  });
});

describe("three days through the routes, with the model never called", () => {
  const post = (body: unknown = {}) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  type Answer = Record<string, any> & { night: Ledger | null; dusk: string | null; progress: { day: DayView } & Record<string, any> };

  it("plays a morning, a shift, an evening, and each way of ending the day", async () => {
    const game = newGame();
    const app = createApp(game.combiner, { progress: game.progress, shop: game.shop, day: game.day, events: game.events, shifts: game.shifts });
    const get = async (path: string) => (await (await app.request(`/api/players/ann${path}`)).json()) as Answer;
    const send = async (path: string, body?: unknown) => {
      const response = await app.request(`/api/players/ann${path}`, post(body));
      return { status: response.status, body: (await response.json()) as Answer };
    };
    // Makes this many new things through the combine route, and returns each answer.
    const make = async (count: number) => {
      const answers: Answer[] = [];
      for (let made = 0; made < count; made++) {
        const [a, b] = makeable(game, "ann")[0]!;
        const { status, body } = await send("/combine", { a, b });
        expect(status).toBe(200);
        expect(body.firstDiscovery).toBe(true);
        answers.push(body);
      }
      return answers;
    };
    // Sits with the visitor at the door, from the first word to the last.
    const sit = async () => {
      const { event } = await get("/event");
      expect(event).toMatchObject({ beat: 1 });
      const reaction = (await send("/event/respond", { type: "fair", beat: 1 })).body;
      return (await send("/event/respond", { type: reaction.next.responses[0].type, beat: 2 })).body;
    };

    // Day one. A morning's crafting, with a job taken up on the way. A stall stands, so there is a shop.
    game.stall("ann");
    expect((await get("")).progress.day).toMatchObject({ number: 1, sun: 0, phase: "morning" });
    expect((await get("")).night).toBeNull();
    for (const id of ["person", "forge", "blacksmith"]) game.store.addDiscovery("ann", id);
    expect((await send("/job", { job: "blacksmith" })).body).toMatchObject({ night: null, progress: { shiftReady: false, day: { sun: 0 } } });
    expect((await send("/day/end")).status).toBe(400);
    const morning = await make(NOON);
    expect(morning.at(-1)!.progress).toMatchObject({ shiftReady: true, day: { sun: NOON, phase: "afternoon", canTurnIn: true } });
    // The shift, which takes a piece of the afternoon.
    const board = await get("/shift");
    expect(board.ready).toBe(true);
    const worked = await send("/shift", { order: board.orders[0].id, base: board.options.base[0].id, method: board.options.method[0].id });
    expect(worked.status).toBe(200);
    expect(worked.body).toMatchObject({ night: null, progress: { shiftReady: false, day: { sun: NOON + rules.shiftNotches, shiftDone: true } }, shift: { ready: false } });
    // The visitor cannot be seen yet.
    expect((await get("/event")).event).toBeNull();
    expect((await send("/event/respond", { type: "fair" })).body).toMatchObject({ code: "not-evening" });
    // On to dusk, and the evening: the visitor, then bed.
    const afternoon = await make(DUSK - NOON - rules.shiftNotches);
    expect(afternoon.at(-1)).toMatchObject({ night: null, dusk: expect.any(String), progress: { day: { phase: "evening", candles: rules.candles } } });
    const shelf = (await get("/shop")).slots.map((slot: { entry: { id: string } }) => slot.entry.id);
    const visit = await sit();
    expect(visit).toMatchObject({ next: null, night: null, progress: { eventReady: false, eventIn: 1, day: { candles: rules.candles - rules.costs.visitor } } });
    const bed = await send("/day/end");
    expect(bed.body).toMatchObject({ rewards: { quests: [] }, dusk: null, night: { day: 1, fell: "bed" }, progress: { day: { number: 2, sun: 0, phase: "morning", shiftDone: false } } });
    expect(bed.body.night!.lines).toHaveLength(4);

    // Day two. The morning has a new shelf and a new visitor on the way, and last night's ledger can be read again.
    const reloaded = await get("");
    expect(reloaded.progress).toMatchObject({ eventReady: true, eventIn: 0, shiftReady: false, day: { lastLedger: bed.body.night } });
    expect((await get("/shop")).slots.map((slot: { entry: { id: string } }) => slot.entry.id)).not.toEqual(shelf);
    expect((await make(DUSK))[0]!.progress.eventReady).toBe(true);
    // This time the player crafts on, and the evening goes by without them.
    const late = await make(rules.nightAfter);
    expect(late.slice(0, -1).map((answer) => answer.progress.day.nightIn)).toEqual(Array.from({ length: rules.nightAfter - 1 }, (_, index) => rules.nightAfter - 1 - index));
    expect(late.at(-1)).toMatchObject({ night: { day: 2, fell: "midnight-oil" }, progress: { day: { number: 3, sun: 0 } } });

    // Day three. The visitor nobody sat with is still the one at the door. The player turns in
    // early, and the one candle that leaves goes on the visit, which brings night.
    expect(game.store.listEvents("ann").map((event) => [event.day, event.state])).toEqual([[1, "resolved"], [2, "pending"]]);
    await make(NOON);
    const early = await send("/day/end");
    expect(early.body).toMatchObject({ night: null, dusk: expect.any(String), progress: { shiftReady: true, day: { number: 3, phase: "evening", candles: rules.earlyCandles } } });
    const last = await sit();
    expect(last).toMatchObject({ next: null, night: { day: 3, fell: "last-candle" }, progress: { day: { number: 4, sun: 0, lastLedger: { day: 3 } } } });
    // Both visitors have been seen, each on the day they were written for or a later one.
    expect(game.store.listEvents("ann").filter((event) => event.state === "resolved").map((event) => event.day)).toEqual([1, 2]);
    expect(game.store.getDay("ann").visitorDay).toBe(3);
    // Nothing was written by a model: every call would have thrown.
    expect(game.store.listModelCalls(10)).toEqual([]);
  });

  it("refuses the end of the day in the morning, and a bad player name", async () => {
    const game = newGame();
    const app = createApp(game.combiner, { progress: game.progress, shop: game.shop, day: game.day });
    const early = await app.request("/api/players/ann/day/end", post());
    expect(early.status).toBe(400);
    expect(await early.json()).toMatchObject({ code: "rule", error: expect.stringMatching(/from noon/) });
    expect((await app.request("/api/players/not%20a%20name/day/end", post())).status).toBe(400);
  });
});
