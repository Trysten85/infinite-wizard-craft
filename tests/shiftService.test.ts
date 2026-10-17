import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/server/app";
import { openStore } from "../src/server/store";
import { QUALITIES, type ShiftBoard, type ShiftOrder } from "../src/shared/schema";
import { payFor } from "../src/shared/shifts";
import { data, DUSK, newGame, NOON } from "./helpers";

const rules = data.balance.shifts;
const { shiftNotches } = data.balance.day;
type Game = ReturnType<typeof newGame>;

// A player who has discovered two jobs and taken up the first of those named. It is noon, so
// the order board is open.
function working(job = "blacksmith", seed = 1): Game {
  const game = newGame(seed);
  for (const id of ["person", "forge", "blacksmith", "farmer"]) game.store.addDiscovery("ann", id);
  game.progress.chooseJob("ann", job);
  game.setDay("ann", { sun: NOON });
  return game;
}

// The ids to fill an order with: in each slot, something that covers one of its tags if anything does.
function fill(board: ShiftBoard, order: ShiftOrder) {
  const best = (slot: "base" | "method" | "touch") => (board.options[slot].find((option) => option.tags.some((tag) => order.tags.includes(tag))) ?? board.options[slot][0]!).id;
  return { order: order.id, base: best("base"), method: best("method"), touch: best("touch") };
}

// Opens the next shift without playing through to the next noon.
const reopen = (game: Game, player = "ann") => game.setDay(player, { sun: NOON, shiftDone: false });

describe("the order board", () => {
  it("is empty until a job is taken up", () => {
    const game = newGame();
    for (const id of ["person", "forge", "blacksmith"]) game.store.addDiscovery("ann", id);
    expect(game.shifts.board("ann")).toMatchObject({ job: null, rank: null, ready: false, orders: [], options: { base: [], method: [], touch: [] } });
    expect(game.progress.getProgress("ann")).toMatchObject({ shiftReady: false });
  });

  it("shows a full board for the job taken up, open from noon, with the job's own names and staples", () => {
    const game = working();
    const board = game.shifts.board("ann");
    expect(board).toMatchObject({ job: { id: "blacksmith", name: "Blacksmith" }, rank: { id: "apprentice", shifts: 0 }, ready: true });
    expect(board.orders).toHaveLength(rules.board);
    expect(board.slots).toEqual({ base: "Metal", method: "Method", touch: "Finish" });
    expect(board.options.base.map((option) => option.id)).toContain("staple:scrap-iron");
    // A staple that opens at a later rank is not on offer yet.
    expect(board.options.method.map((option) => option.id)).not.toContain("staple:fold");
    expect(board.rules).toEqual(rules);
    for (const order of board.orders) expect(order.tags.length).toBeGreaterThanOrEqual(2);
    expect(game.progress.getProgress("ann")).toMatchObject({ shiftReady: true, day: { shiftDone: false } });
  });

  it("offers the player's own things that fit, beside the staples", () => {
    const game = working();
    game.store.addDiscovery("ann", "iron");
    expect(game.shifts.board("ann").options.base).toContainEqual(expect.objectContaining({ id: "iron", own: false }));
  });

  it("keeps the same orders however often it is looked at", () => {
    const game = working();
    const first = game.shifts.board("ann").orders;
    expect(game.shifts.board("ann").orders).toEqual(first);
    expect(game.store.listOpenShiftOrders("ann", "blacksmith")).toHaveLength(rules.board);
  });

  it("keeps each job's orders for when the player comes back to it", () => {
    const game = working();
    const smithing = game.shifts.board("ann").orders;
    game.progress.chooseJob("ann", "farmer");
    const farming = game.shifts.board("ann");
    expect(farming.job!.id).toBe("farmer");
    expect(farming.orders.map((order) => order.id)).not.toEqual(smithing.map((order) => order.id));
    game.progress.chooseJob("ann", "blacksmith");
    expect(game.shifts.board("ann").orders).toEqual(smithing);
  });
});

describe("working a shift", () => {
  it("pays gold, XP, and standing by the quality, logs it, and replaces only the order that was filled", () => {
    const game = working();
    const board = game.shifts.board("ann");
    const order = board.orders[0]!;
    const before = game.progress.getProgress("ann");
    const { result, rewards } = game.shifts.work("ann", fill(board, order));

    expect(QUALITIES).toContain(result.quality.id);
    expect(result.order).toEqual(order);
    expect(result.line).toBeTruthy();
    // The pay is exactly what the rules give for that order at that quality.
    expect({ gold: result.gold, xp: result.xp, rep: result.rep }).toEqual(payFor(order, result.quality.id, rules));

    const after = game.progress.getProgress("ann");
    expect(after.gold - before.gold).toBe(result.gold + rewards.gold);
    expect(after.xp - before.xp).toBe(result.xp + rewards.quests.reduce((sum, quest) => sum + quest.xp, 0));
    expect(after.rep - before.rep).toBe(result.rep);
    expect(game.store.getLedgerRefs("ann", "shift")).toHaveLength(1);

    const [logged] = game.store.listShifts("ann");
    expect(logged).toMatchObject({ job: "blacksmith", orderTags: order.tags, quality: result.quality.id, line: result.line, gold: result.gold, xp: result.xp, rep: result.rep });
    expect(logged!.inputs).toHaveLength(3);

    const next = game.shifts.board("ann").orders;
    expect(next).toHaveLength(rules.board);
    expect(next.map((item) => item.id)).not.toContain(order.id);
    // The two it did not fill are still there.
    for (const kept of board.orders.slice(1)) expect(next).toContainEqual(kept);
  });

  it("covers every tag when the right things are chosen, and comes out better for it", () => {
    const qualityOf = (pick: (board: ShiftBoard, order: ShiftOrder) => { order: number; base: string; method: string; touch?: string }) => {
      const steps: number[] = [];
      for (let seed = 1; seed <= 30; seed++) {
        const game = working("blacksmith", seed);
        const board = game.shifts.board("ann");
        steps.push(QUALITIES.indexOf(game.shifts.work("ann", pick(board, board.orders[0]!)).result.quality.id));
      }
      return steps.reduce((sum, step) => sum + step, 0) / steps.length;
    };
    const careless = (board: ShiftBoard, order: ShiftOrder) => {
      const miss = (slot: "base" | "method") => (board.options[slot].find((option) => !option.tags.some((tag) => order.tags.includes(tag))) ?? board.options[slot][0]!).id;
      return { order: order.id, base: miss("base"), method: miss("method") };
    };
    expect(qualityOf(fill)).toBeGreaterThan(qualityOf(careless));
  });

  it("works without a touch", () => {
    const game = working();
    const board = game.shifts.board("ann");
    const { order, base, method } = fill(board, board.orders[0]!);
    expect(game.shifts.work("ann", { order, base, method }).result.gold).toBeGreaterThan(0);
    expect(game.store.listShifts("ann")[0]!.inputs).toHaveLength(2);
  });

  it("is refused without a job, for an order not on the board, or with something not on offer", () => {
    const jobless = newGame();
    expect(() => jobless.shifts.work("ann", { order: 1, base: "staple:scrap-iron", method: "staple:hammer" })).toThrowError(expect.objectContaining({ code: "no-job" }));

    const game = working();
    const board = game.shifts.board("ann");
    const choice = fill(board, board.orders[0]!);
    expect(() => game.shifts.work("ann", { ...choice, order: 9999 })).toThrow(/not on your board/);
    expect(() => game.shifts.work("ann", { ...choice, base: "gold" })).toThrow(/not on offer/);
    // A staple of a later rank, and a staple put in the wrong slot.
    expect(() => game.shifts.work("ann", { ...choice, method: "staple:fold" })).toThrow(/not on offer/);
    expect(() => game.shifts.work("ann", { ...choice, base: "staple:hammer" })).toThrow(/not on offer/);
    // Another player's order is not on this player's board.
    game.store.addDiscovery("bob", "blacksmith");
    game.progress.chooseJob("bob", "blacksmith");
    const theirs = game.shifts.board("bob").orders[0]!;
    expect(() => game.shifts.work("ann", { ...choice, order: theirs.id })).toThrow(/not on your board/);
    // Nothing was paid or logged for any of it.
    expect(game.store.listShifts("ann")).toEqual([]);
    expect(game.shifts.board("ann").orders).toEqual(board.orders);
  });
});

describe("the day's shift", () => {
  const workOne = (game: Game) => {
    const board = game.shifts.board("ann");
    return game.shifts.work("ann", fill(board, board.orders[0]!));
  };

  it("opens at noon and not before", () => {
    const game = working();
    game.setDay("ann", { sun: NOON - 1 });
    expect(game.shifts.board("ann")).toMatchObject({ ready: false });
    expect(game.shifts.board("ann").orders).toHaveLength(rules.board);
    expect(game.progress.getProgress("ann").shiftReady).toBe(false);
    expect(() => workOne(game)).toThrowError(expect.objectContaining({ code: "shift-not-ready", message: expect.stringMatching(/opens at noon/) }));
    game.setDay("ann", { sun: NOON });
    expect(game.shifts.board("ann").ready).toBe(true);
    expect(workOne(game).result.gold).toBeGreaterThan(0);
  });

  it("is one a day, and moves the sun on", () => {
    const game = working();
    const worked = workOne(game);
    expect(worked).toMatchObject({ night: null, dusk: null });
    expect(game.day.today("ann")).toMatchObject({ sun: NOON + shiftNotches, shiftDone: true });
    expect(game.shifts.board("ann").ready).toBe(false);
    expect(game.progress.getProgress("ann")).toMatchObject({ shiftReady: false, day: { shiftDone: true } });
    expect(() => workOne(game)).toThrowError(expect.objectContaining({ code: "shift-not-ready", message: expect.stringMatching(/worked today's shift/) }));
    // Still shut that evening, and open again from the next noon.
    game.dusk("ann");
    expect(game.shifts.board("ann").ready).toBe(false);
    game.day.end("ann");
    expect(game.progress.getProgress("ann")).toMatchObject({ shiftReady: false, day: { number: 2, shiftDone: false } });
    game.setDay("ann", { sun: NOON });
    expect(workOne(game).result.gold).toBeGreaterThan(0);
  });

  it("is not saved up: days without a shift leave only today's", () => {
    const game = working();
    for (let night = 0; night < 3; night++) {
      game.dusk("ann");
      game.day.end("ann");
    }
    game.setDay("ann", { sun: NOON });
    workOne(game);
    expect(() => workOne(game)).toThrowError(expect.objectContaining({ code: "shift-not-ready" }));
    expect(game.store.listShifts("ann")).toHaveLength(1);
  });

  it("brings dusk on when it carries the sun there, and can still be worked in the evening", () => {
    const late = working();
    late.setDay("ann", { sun: DUSK - shiftNotches });
    const worked = workOne(late);
    expect(worked.night).toBeNull();
    expect(data.dayText.dusk).toContain(worked.dusk);
    expect(late.progress.getProgress("ann").day).toMatchObject({ phase: "evening", sun: DUSK, candles: 3 });

    const evening = working();
    evening.setDay("ann", { sun: DUSK, oil: 2 });
    expect(evening.shifts.board("ann").ready).toBe(true);
    expect(workOne(evening)).toMatchObject({ night: null, dusk: null });
    // A shift is not a discovery, so it burns none of the midnight oil.
    expect(evening.day.today("ann")).toMatchObject({ sun: DUSK, oil: 2, shiftDone: true });
  });
});

describe("rank", () => {
  it("rises with shifts worked in that job, is announced once, and is kept when the player changes jobs", () => {
    const game = working();
    const journeyman = rules.ranks[1]!;
    for (let done = 1; done <= journeyman.shifts; done++) {
      reopen(game);
      const board = game.shifts.board("ann");
      const { result } = game.shifts.work("ann", fill(board, board.orders[0]!));
      if (done < journeyman.shifts) expect(result.rankUp, `shift ${done}`).toBeNull();
      else expect(result.rankUp).toMatchObject({ id: "journeyman", shifts: journeyman.shifts });
    }
    reopen(game);
    const board = game.shifts.board("ann");
    expect(board.rank).toMatchObject({ id: "journeyman", next: { name: rules.ranks[2]!.name } });
    // The rank opens a new method, and is not announced a second time.
    expect(board.options.method.map((option) => option.id)).toContain("staple:fold");
    expect(game.shifts.work("ann", fill(board, board.orders[0]!)).result.rankUp).toBeNull();

    game.progress.chooseJob("ann", "farmer");
    expect(game.shifts.board("ann").rank).toMatchObject({ id: "apprentice", shifts: 0 });
    game.progress.chooseJob("ann", "blacksmith");
    expect(game.shifts.board("ann").rank!.id).toBe("journeyman");
  });
});

describe("the shift routes", () => {
  const post = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const appFor = (game: Game) => createApp(game.combiner, { progress: game.progress, shop: game.shop, day: game.day, events: game.events, shifts: game.shifts });

  it("serve the board and work an order from it", async () => {
    const game = working();
    const app = appFor(game);
    const board = (await (await app.request("/api/players/ann/shift")).json()) as ShiftBoard;
    expect(board).toMatchObject({ job: { id: "blacksmith" }, ready: true });

    const worked = await app.request("/api/players/ann/shift", post(fill(board, board.orders[0]!)));
    expect(worked.status).toBe(200);
    const body = (await worked.json()) as Record<string, any>;
    expect(body.result).toMatchObject({ order: { id: board.orders[0]!.id }, quality: { id: expect.any(String), name: expect.any(String) }, line: expect.any(String), rankUp: null });
    expect(body.rewards).toMatchObject({ gold: expect.any(Number), quests: expect.any(Array) });
    expect(body).toMatchObject({ night: null, dusk: null });
    expect(body.progress).toMatchObject({ shiftReady: false, day: { shiftDone: true, sun: NOON + shiftNotches } });
    expect(body.shift).toMatchObject({ ready: false, rank: { shifts: 1 } });
    expect(body.shift.orders).toHaveLength(rules.board);
  });

  it("refuse with a code the page can act on", async () => {
    const jobless = appFor(newGame());
    expect(await (await jobless.request("/api/players/ann/shift")).json()).toMatchObject({ job: null, orders: [] });
    const noJob = await jobless.request("/api/players/ann/shift", post({ order: 1, base: "staple:scrap-iron", method: "staple:hammer" }));
    expect(noJob.status).toBe(400);
    expect(await noJob.json()).toMatchObject({ code: "no-job" });

    const game = working();
    const app = appFor(game);
    const board = game.shifts.board("ann");
    await app.request("/api/players/ann/shift", post(fill(board, board.orders[0]!)));
    const again = game.shifts.board("ann");
    const tooSoon = await app.request("/api/players/ann/shift", post(fill(again, again.orders[0]!)));
    expect(tooSoon.status).toBe(400);
    expect(await tooSoon.json()).toMatchObject({ code: "shift-not-ready" });
    expect((await app.request("/api/players/ann/shift", post({ order: "first" }))).status).toBe(400);
  });
});

describe("a saved game from before shifts", () => {
  it("gains what shifts need when it is opened, and keeps shifts across a restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "iwc-shift-"));
    const path = join(dir, "game.db");
    const first = openStore(path);
    first.changeStats("ann", { rep: 3 });
    const orderId = first.addShiftOrder("ann", { job: "blacksmith", tags: ["metal", "forging"], tier: 0, subject: "A hinge", text: "A hinge." });
    first.addShift("ann", { job: "blacksmith", orderTags: ["metal"], inputs: ["staple:scrap-iron", "staple:hammer"], quality: "good", line: "It does the job.", gold: 10, xp: 10, rep: 0 });
    first.close();
    const second = openStore(path);
    expect(second.getStats("ann")).toMatchObject({ rep: 3 });
    expect(second.listOpenShiftOrders("ann", "blacksmith").map((order) => order.id)).toEqual([orderId]);
    expect(second.countShifts("ann", "blacksmith")).toBe(1);
    expect(second.getShiftXp("ann")).toBe(10);
    second.finishShiftOrder(orderId);
    expect(second.listOpenShiftOrders("ann", "blacksmith")).toEqual([]);
    second.close();
    rmSync(dir, { recursive: true });
  });
});
