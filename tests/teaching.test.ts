import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GameData } from "../src/server/gameData";
import { openStore } from "../src/server/store";
import type { CastMember } from "../src/shared/schema";
import { data, newGame, NOON } from "./helpers";

const teachAt = data.balance.town.teachAt;
const hester = data.cast.people.find((person) => person.job === "farmer")!;
type Game = ReturnType<typeof newGame>;
const farmer = (game: Game) => game.store.listPeople("ann").find((person) => person.job === "farmer")!;
const fond = (game: Game, fondness: number) => game.store.updatePerson(farmer(game).id, { fondness });
// Hester comes to work once a Farm stands (N9): one stands on plot 0.
function farmStands(game: Game): void {
  if (game.store.listPlots("ann").some((plot) => plot.building === "farm")) return;
  game.store.addPlot("ann", 0);
  game.store.setBuilding("ann", 0, "farm", 1);
}

describe("learning a trade", () => {
  it("is needed before the job is taken up, and the person who teaches it is named", () => {
    const game = newGame();
    for (const id of ["person", "farmer"]) game.store.addDiscovery("ann", id);
    farmStands(game);
    game.town.arrive("ann");
    expect(() => game.progress.chooseJob("ann", "farmer")).toThrowError(expect.objectContaining({ code: "not-taught", message: expect.stringContaining(hester.name) }));
  });

  it("comes from the lesson done and Fondness at the teaching line, and is kept for good", () => {
    const game = newGame();
    for (const id of ["person", "farmer"]) game.store.addDiscovery("ann", id);
    farmStands(game);
    game.town.arrive("ann");
    // Fondness alone does not teach.
    fond(game, teachAt);
    game.progress.settle("ann");
    expect(game.progress.isJobTaught("ann", "farmer")).toBe(false);
    // Hester's lesson: make a tree and food. Paid as quests are, and listed in the rewards.
    for (const id of ["tree", "food"]) game.store.addDiscovery("ann", id);
    const rewards = game.progress.settle("ann");
    expect(rewards.quests.map((quest) => quest.id)).toEqual(expect.arrayContaining(hester.lesson.map((quest) => quest.id)));
    expect(game.progress.isJobTaught("ann", "farmer")).toBe(true);
    // Taught is for good.
    fond(game, 0);
    game.progress.settle("ann");
    expect(game.progress.chooseJob("ann", "farmer").job.id).toBe("farmer");
  });

  it("waits on Fondness when the lesson is done first, and the lesson only counts once the person is here", () => {
    const game = newGame();
    for (const id of ["tree", "food"]) game.store.addDiscovery("ann", id);
    game.progress.settle("ann");
    expect(game.store.getLedgerRefs("ann", "quest")).not.toContain(hester.lesson[0]!.id);
    for (const id of ["person", "farmer"]) game.store.addDiscovery("ann", id);
    farmStands(game);
    game.town.arrive("ann");
    game.progress.settle("ann");
    expect(game.store.getLedgerRefs("ann", "quest")).toEqual(expect.arrayContaining(hester.lesson.map((quest) => quest.id)));
    expect(game.progress.isJobTaught("ann", "farmer")).toBe(false);
    fond(game, teachAt);
    game.progress.settle("ann");
    expect(game.progress.isJobTaught("ann", "farmer")).toBe(true);
  });

  it("can be finished by the call that brings Fondness to the line", () => {
    const game = newGame();
    for (const id of ["person", "farmer", "tree", "food"]) game.store.addDiscovery("ann", id);
    farmStands(game);
    game.town.arrive("ann");
    game.progress.settle("ann");
    fond(game, teachAt - 1);
    game.dusk("ann");
    game.town.call("ann", farmer(game).id);
    expect(game.progress.isJobTaught("ann", "farmer")).toBe(true);
  });

  it("is never needed for the starter job", () => {
    const starter = [...data.jobs.values()].find((job) => job.starter)!;
    const game = newGame();
    expect(game.progress.isJobTaught("ann", starter.id)).toBe(true);
  });

  it("is needed to work a shift, even for a job set without being taught", () => {
    const game = newGame();
    for (const id of ["person", "forge", "blacksmith"]) game.store.addDiscovery("ann", id);
    game.store.setJob("ann", "blacksmith");
    game.setDay("ann", { sun: NOON });
    expect(game.shifts.board("ann").ready).toBe(false);
    const order = game.shifts.board("ann").orders[0]!;
    expect(() => game.shifts.work("ann", { order: order.id, base: "x", method: "y" })).toThrowError(expect.objectContaining({ code: "not-taught" }));
  });

  it("is kept by a saved game for the job it already held", () => {
    const dir = mkdtempSync(join(tmpdir(), "taught-"));
    const path = join(dir, "game.db");
    try {
      const before = openStore(path);
      before.setJob("ann", "blacksmith");
      const old = new DatabaseSync(path);
      old.exec("DROP TABLE taught_seeded; DELETE FROM taught_jobs;");
      old.close();
      const game = newGame(1, undefined, { store: openStore(path) });
      expect(game.progress.isJobTaught("ann", "blacksmith")).toBe(true);
      expect(game.progress.isJobTaught("ann", "farmer")).toBe(false);
      // Marked once: a job taken up later is not taught by the start-up mark.
      game.store.setJob("ann", "farmer");
      expect(newGame(1, undefined, { store: openStore(path) }).progress.isJobTaught("ann", "farmer")).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("story beats", () => {
  // Hester with two simple beats: one paid in gold and XP as soon as she is fond enough, and one
  // that waits on it and on a tree being made.
  const beats: CastMember["beats"] = [
    { id: "hester-test-first", title: "First", level: 1, gate: 2, waitsOn: [], reward: { kind: "gold", gold: 7, xp: 30 }, premise: "p", line: "l" },
    { id: "hester-test-second", title: "Second", level: 1, gate: 2, waitsOn: ["hester-test-first"], done: { type: "has-entry", entry: "tree" }, reward: { kind: "commission", tags: ["plant"] }, premise: "p", line: "l" },
    { id: "hester-test-later", title: "Later", level: 3, gate: 0, waitsOn: [], reward: { kind: "gold", gold: 1, xp: 0 }, premise: "p", line: "l" },
  ];
  const world: GameData = { ...data, cast: { people: data.cast.people.map((person) => (person.job === "farmer" ? { ...person, beats } : person)) } };
  function withHester(): Game {
    const game = newGame(1, undefined, { data: world });
    for (const id of ["person", "farmer"]) game.store.addDiscovery("ann", id);
    farmStands(game);
    game.town.arrive("ann");
    game.progress.settle("ann");
    return game;
  }

  it("open at their Fondness gate, pay once, and count their XP", () => {
    const game = withHester();
    expect(game.store.getLedgerRefs("ann", "beat")).toEqual([]);
    const xp = game.progress.getProgress("ann").xp;
    fond(game, 2);
    const rewards = game.progress.settle("ann");
    expect(rewards.quests).toEqual(expect.arrayContaining([{ id: "hester-test-first", title: "First", gold: 7, xp: 30 }]));
    expect(game.store.getLedgerRefs("ann", "beat")).toEqual(["hester-test-first"]);
    expect(game.progress.getProgress("ann").xp).toBe(xp + 30);
    expect(game.progress.settle("ann").quests).toEqual([]);
  });

  it("wait on the beats they name and on their own condition, and on the player's level", () => {
    const game = withHester();
    fond(game, 2);
    game.progress.settle("ann");
    expect(game.store.getLedgerRefs("ann", "beat")).not.toContain("hester-test-second");
    game.store.addDiscovery("ann", "tree");
    const rewards = game.progress.settle("ann");
    // A commission pays no gold here: the beat is played, and what it opens is the service's.
    expect(rewards.quests).toEqual(expect.arrayContaining([{ id: "hester-test-second", title: "Second", gold: 0, xp: 0 }]));
    // The level 3 beat waits for level 3, whatever the Fondness.
    expect(game.store.getLedgerRefs("ann", "beat")).not.toContain("hester-test-later");
  });

  it("are not played for someone who has not arrived", () => {
    const game = newGame(1, undefined, { data: world });
    game.progress.settle("ann");
    expect(game.store.getLedgerRefs("ann", "beat")).toEqual([]);
  });
});

describe("the People tab", () => {
  it("lists everyone in town with their home, Fondness lines, lesson progress, and a hint of the next beat", async () => {
    const { createApp } = await import("../src/server/app");
    const game = newGame();
    for (const id of ["person", "farmer", "carpenter", "tree"]) game.store.addDiscovery("ann", id);
    farmStands(game);
    game.town.arrive("ann");
    game.progress.settle("ann");
    const app = createApp(game.combiner, { progress: game.progress, shop: game.shop, day: game.day, town: game.town });
    const response = await app.request("/api/players/ann/town/people");
    expect(response.status).toBe(200);
    const view = (await response.json()) as import("../src/shared/schema").PeopleView;
    expect(view).toMatchObject({ regularAt: data.balance.town.regularAt, teachAt });
    const her = view.people.find((person) => person.job === "farmer")!;
    expect(her).toMatchObject({
      name: hester.name,
      trade: "Farmer",
      personality: hester.personality,
      home: { building: "farm", name: "Farm" },
      housed: true,
      hired: false,
      worksAt: { plot: 0, building: "farm", name: "Farm" },
      taught: false,
      fondness: 0,
    });
    expect(her.likes.length).toBe(hester.likes.length);
    // The tree is made, the food is not.
    expect(her.lesson.map((quest) => [quest.id, quest.done])).toEqual(hester.lesson.map((quest) => [quest.id, quest.id === "lesson-farmer-tree"]));
    // The next beat by title and gate only.
    expect(her.nextBeat).toEqual({ title: hester.beats[0]!.title, gate: hester.beats[0]!.gate, level: hester.beats[0]!.level });
    // A trade with no building brings nobody: a person comes only to work at a building.
    expect(view.people.find((person) => person.job === "carpenter")).toBeUndefined();
  });
});
