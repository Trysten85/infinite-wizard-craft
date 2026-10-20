import { describe, expect, it } from "vitest";
import { createFakeClient } from "../src/server/llm/fake";
import { createShifts } from "../src/server/shifts/service";
import { checkOrder, createModelOrderWriter, tooAlike, type OrderBrief, type OrderWriter } from "../src/server/shifts/writer";
import { data, newGame, NOON } from "./helpers";

const brief: OrderBrief = {
  job: "Innkeeper",
  flavor: "Guests, rooms, meals",
  subject: "A quiet corner for two people who are not speaking",
  tags: [
    { tag: "liquid", words: "something wet" },
    { tag: "brewing", words: "brewing" },
  ],
  subjects: ["A quiet corner for two people who are not speaking"],
  others: ["A quiet corner for two people who are not speaking. It calls for energy and brewing."],
};

describe("orders that read alike", () => {
  it("are caught by their opening and by what they say", () => {
    const other = "A quiet corner for two people who are not speaking.";
    expect(tooAlike("A quiet corner for someone who snores.", [other])).toMatch(/opens the same way/);
    expect(tooAlike("Two people who are not speaking need a corner, quiet.", [other])).toMatch(/much the same/);
    expect(tooAlike("The cellar door sticks, and the cask of something wet is behind it.", [other])).toBeNull();
    // A short order is not refused for the couple of words it shares with a long one.
    const long = "The baker on Crumb Lane wants bread that rises by itself, a cellar that stays cool, and a cat that keeps out of the flour.";
    expect(tooAlike("Bread for the cellar party.", [long])).toBeNull();
  });

  it("are refused by the writer's check, which also wants every tag's words and no template phrase", () => {
    const ok = "The cellar door sticks, and the barrel of something wet is behind it, ready for brewing.";
    expect(checkOrder(brief, ok)).toBeNull();
    expect(checkOrder(brief, "The cellar door sticks and a barrel waits behind it, ready for brewing.")).toMatch(/something wet/);
    expect(checkOrder(brief, "Supper for a driver. It calls for something wet and brewing.")).toMatch(/calls for/);
    expect(checkOrder(brief, "A quiet corner for a nervous poet, with something wet and brewing.")).toMatch(/opens the same way/);
  });

  it("make the model write again until one is different", async () => {
    const same = "A quiet corner for two people with something wet and brewing.";
    const fresh = "The cellar door sticks, and the barrel of something wet is behind it, ready for brewing.";
    const client = createFakeClient([JSON.stringify({ text: same }), JSON.stringify({ text: fresh })]);
    const writer = createModelOrderWriter({ client, log: () => {}, voice: "" });
    expect(await writer.write(brief)).toBe(fresh);
    expect(client.requests).toHaveLength(2);
    expect(client.requests[1]!.prompt).toContain("rejected");
    // The writer is shown a spread of shapes and the orders it must not repeat.
    expect(client.requests[0]!.system).toContain("shapes orders can take");
    expect(client.requests[0]!.prompt).toContain("It calls for energy and brewing");
  });
});

describe("a board written ahead", () => {
  function working() {
    const game = newGame();
    for (const id of ["person", "spirits", "innkeeper"]) game.store.addDiscovery("ann", id);
    game.store.addTaught("ann", "innkeeper");
    game.progress.chooseJob("ann", "innkeeper");
    game.setDay("ann", { sun: NOON });
    return game;
  }
  const withWriter = (game: ReturnType<typeof newGame>, writer: OrderWriter) =>
    createShifts({ data, store: game.store, progress: game.progress, day: game.day, listDiscovered: game.combiner.listDiscovered, writer });

  it("holds the model's words, each written against the orders before it", async () => {
    const game = working();
    const seen: string[][] = [];
    let n = 0;
    const writer: OrderWriter = { write: async (b) => (seen.push([...b.others]), `Order number ${n++} wants ${b.tags.map((t) => t.words).join(" and ")}.`) };
    const shifts = withWriter(game, writer);
    shifts.prepare("ann");
    await shifts.idle("ann");
    const board = shifts.board("ann");
    expect(board.orders.map((order) => order.text)).toEqual([0, 1, 2].map((i) => expect.stringContaining(`Order number ${i} wants`)));
    // Each was written knowing the ones already on the board.
    expect(seen.map((others) => others.length)).toEqual([0, 1, 2]);
  });

  it("keeps the plain template when the model cannot write one", async () => {
    const game = working();
    const shifts = withWriter(game, { write: async () => { throw new Error("no model"); } });
    shifts.prepare("ann");
    await shifts.idle("ann");
    const board = shifts.board("ann");
    expect(board.orders).toHaveLength(data.balance.shifts.board);
    expect(board.orders.every((order) => /It calls for/.test(order.text))).toBe(true);
  });
});

describe("the plain board", () => {
  it("never says one subject twice", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const game = newGame(seed);
      for (const id of ["person", "spirits", "innkeeper"]) game.store.addDiscovery("ann", id);
      game.store.addTaught("ann", "innkeeper");
      game.progress.chooseJob("ann", "innkeeper");
      game.setDay("ann", { sun: NOON });
      const openers = game.shifts.board("ann").orders.map((order) => order.text.split(". It calls for")[0]);
      expect(new Set(openers).size).toBe(openers.length);
    }
  });
});

// A subject has to be kept beside the order, because the model's words say nothing about it: the
// writer is told it may invent something near the subject, and these ones never name it at all.
// Reading the subject back out of the text held only for the plain template.
describe("a board the model wrote", () => {
  it("still says one subject apiece, and keeps each order's subject", async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = newGame(seed);
      for (const id of ["person", "spirits", "innkeeper"]) game.store.addDiscovery("ann", id);
      game.store.addTaught("ann", "innkeeper");
      game.progress.chooseJob("ann", "innkeeper");
      game.setDay("ann", { sun: NOON });
      // Words of the model's own, which never contain the subject they were drafted from.
      let n = 0;
      const shifts = createShifts({
        data,
        store: game.store,
        progress: game.progress,
        day: game.day,
        listDiscovered: game.combiner.listDiscovered,
        writer: { write: async (b) => `Something quite else, the ${n++}th of its kind, wanting ${b.tags.map((t) => t.words).join(" and ")}.` },
      });
      shifts.prepare("ann");
      await shifts.idle("ann");
      expect(shifts.board("ann").orders).toHaveLength(data.balance.shifts.board);
      const subjects = game.store.listOpenShiftOrders("ann", "innkeeper").map((order) => order.subject);
      expect(subjects.every((subject) => subject !== "")).toBe(true);
      expect(new Set(subjects).size).toBe(subjects.length);
    }
  });

  it("tops a part-filled board up without repeating a subject still on it", async () => {
    const game = newGame();
    for (const id of ["person", "spirits", "innkeeper"]) game.store.addDiscovery("ann", id);
    game.store.addTaught("ann", "innkeeper");
    game.progress.chooseJob("ann", "innkeeper");
    game.setDay("ann", { sun: NOON });
    // One order filled, so the board is topped up around the two still open.
    const board = game.shifts.board("ann");
    game.store.finishShiftOrder(board.orders[0]!.id);
    const after = game.shifts.board("ann").orders;
    expect(after).toHaveLength(data.balance.shifts.board);
    const subjects = game.store.listOpenShiftOrders("ann", "innkeeper").map((order) => order.subject);
    expect(new Set(subjects).size).toBe(subjects.length);
  });
});

describe("the words an order must use", () => {
  it("are its own words, not ones hidden inside longer ones", () => {
    const air: OrderBrief = { ...brief, tags: [{ tag: "air", words: "a breath of air" }], others: [] };
    // A chair is not a breath of air, and a price is not ice.
    expect(checkOrder(air, "The chair by the window wobbles and nobody will own up to it.")).toMatch(/a breath of air/);
    expect(checkOrder(air, "The window will not shut and the room wants a breath of air.")).toBeNull();
    const ice: OrderBrief = { ...brief, tags: [{ tag: "ice", words: "ice" }], others: [] };
    expect(checkOrder(ice, "Nobody can agree on the price, and the cellar is too warm.")).toMatch(/"ice"/);
    expect(checkOrder(ice, "The cellar is too warm and the cream wants ice.")).toBeNull();
  });
});
