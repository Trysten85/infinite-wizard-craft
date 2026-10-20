import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createOfflineGame, seededRandom, type OfflineGame } from "../src/server/game";
import { openStore } from "../src/server/store";
import { playScenario } from "../src/server/testSaves";
import { hireStanding } from "../src/server/town";
import { testSavesSchema } from "../src/shared/schema";
import { testSaveProblems } from "../src/shared/testSaves";
import { data } from "./helpers";

const saves = testSavesSchema.parse(JSON.parse(readFileSync("data/test-saves.json", "utf8")));
const scenario = (player: string) => saves.scenarios.find((item) => item.player === player)!;

async function build(player: string, store = openStore(":memory:")): Promise<OfflineGame> {
  const game = createOfflineGame({ data, store, random: seededRandom(7) });
  await playScenario(game, scenario(player));
  return game;
}

// What a save holds for a player, for telling two builds apart.
function snapshot(game: OfflineGame, player: string) {
  const { store } = game;
  return {
    day: store.getDay(player).state,
    gold: store.getGold(player),
    plots: store.listPlots(player),
    hires: [...store.listHires(player)],
    people: store.listPeople(player).map(({ name, job, fondness }) => ({ name, job, fondness })),
    events: store.listEvents(player).map(({ seedId, state }) => ({ seedId, state })),
    job: store.getStats(player).job,
  };
}

describe("the test-save scenarios", () => {
  it("name only things, jobs, and buildings the game has", () => {
    expect(testSaveProblems(saves, { entries: new Set(data.entries.keys()), jobs: new Set(data.jobs.keys()), buildings: new Set(data.buildings.keys()) })).toEqual([]);
  });

  it("all build, each into its own player, in one save", async () => {
    const store = openStore(":memory:");
    for (const item of saves.scenarios) await build(item.player, store);
    for (const item of saves.scenarios.filter((each) => each.steps.length > 0)) expect(store.getDay(item.player).state.number, item.player).toBeGreaterThanOrEqual(1);
  });

  it("build the same twice", async () => {
    for (const item of saves.scenarios) expect(snapshot(await build(item.player), item.player), item.player).toEqual(snapshot(await build(item.player), item.player));
  });
});

describe("each test save lands where it says", () => {
  const view = (game: OfflineGame, player: string) => ({ progress: game.progress.getProgress(player), town: game.town.view(player) });
  const dunstan = data.cast.people.find((person) => person.job === "blacksmith")!.name;

  it("fresh: dawn on day 1, nothing made", async () => {
    const { progress } = view(await build("fresh"), "fresh");
    expect(progress).toMatchObject({ job: null, gold: 0, day: { number: 1, phase: "morning" } });
  });

  it("first-plot: the Wizard taken up, and the gold for the first plot", async () => {
    const game = await build("first-plot");
    const { progress, town } = view(game, "first-plot");
    expect(progress.job?.id).toBe("wizard");
    expect(progress.gold).toBeGreaterThanOrEqual(town.plots[0]!.price);
    expect(game.town.buyPlot("first-plot").plot).toBe(0);
  });

  it("smithy-built: a Smithy stands, and Dunstan has come and waits to be hired", async () => {
    const { town } = view(await build("smithy-built"), "smithy-built");
    expect(town.plots[0]!.building).toMatchObject({ id: "smithy", takings: 0, staff: { person: { name: dunstan }, hired: false } });
  });

  it("smithy-hired and apprentice-ready: Dunstan hired, and one call short of teaching", async () => {
    expect(view(await build("smithy-hired"), "smithy-hired").town.plots[0]!.building!.staff).toMatchObject({ hired: true });
    const game = await build("apprentice-ready");
    const smith = game.town.people("apprentice-ready").people.find((person) => person.job === "blacksmith")!;
    expect(smith).toMatchObject({ hired: true, taught: false, fondness: data.balance.town.teachAt - 1 });
    expect(smith.lesson.every((quest) => quest.done)).toBe(true);
    game.store.setDay("apprentice-ready", { ...game.day.today("apprentice-ready"), sun: data.balance.day.length });
    game.town.call("apprentice-ready", smith.person);
    expect(game.progress.isJobTaught("apprentice-ready", "blacksmith")).toBe(true);
  });

  it("dusk-visitor: the evening, a visitor waiting, all the time left", async () => {
    const game = await build("dusk-visitor");
    const { progress } = view(game, "dusk-visitor");
    expect(progress.day).toMatchObject({ number: 2, phase: "evening", time: progress.day!.timeMax });
    expect((await game.events.current("dusk-visitor")).event).not.toBeNull();
  });

  it("last-hourglass: one action's time left, someone to call on, and night falls after", async () => {
    const game = await build("last-hourglass");
    expect(view(game, "last-hourglass").progress.day).toMatchObject({ phase: "evening", time: 1 });
    const smith = game.store.listPeople("last-hourglass").find((person) => person.job === "blacksmith")!;
    expect(game.town.call("last-hourglass", smith.id).night).toMatchObject({ fell: "out-of-time" });
  });

  it("tansy-day-two: the Herb Garden going up to tier 2, and Tansy comes after the night", async () => {
    const game = await build("tansy-day-two");
    expect(view(game, "tansy-day-two").town.plots[0]).toMatchObject({ building: { id: "herb-garden", tier: 1 }, raising: { tier: 2 } });
    game.store.setDay("tansy-day-two", { ...game.day.today("tansy-day-two"), sun: data.balance.day.length });
    game.day.end("tansy-day-two");
    const tansy = data.cast.people.find((person) => person.job === "alchemist")!;
    expect(view(game, "tansy-day-two").town.townsfolk.map((person) => person.name)).toContain(tansy.name);
  });

  it("whole-town: all six buildings standing and hired", async () => {
    const { town } = view(await build("whole-town"), "whole-town");
    const standing = town.plots.filter((plot) => plot.building);
    expect(standing.map((plot) => plot.building!.id).sort()).toEqual([...data.buildings.keys()].sort());
    expect(standing.every((plot) => plot.building!.staff?.hired)).toBe(true);
  });
});

describe("a save built from nothing", () => {
  it("is never taken for an old one: the server's one-time hiring leaves its buildings alone", async () => {
    const store = openStore(":memory:");
    expect(store.hiresSeeded()).toBe(true);
    await build("smithy-built", store);
    expect(hireStanding(data, store)).toEqual([]);
    expect(store.listHires("smithy-built").size).toBe(0);
  });
});

describe("clearing one player", () => {
  it("removes that player's save and leaves the others", async () => {
    const store = openStore(":memory:");
    await build("smithy-hired", store);
    await build("first-plot", store);
    store.deletePlayer("smithy-hired");
    expect(store.listPlots("smithy-hired")).toEqual([]);
    expect(store.listPeople("smithy-hired")).toEqual([]);
    expect(store.getGold("smithy-hired")).toBe(0);
    expect(store.getGold("first-plot")).toBeGreaterThan(0);
  });
});

describe("the test-save routes", () => {
  async function server() {
    const { createApp } = await import("../src/server/app");
    const { createTestSaves } = await import("../src/server/testSaves");
    const game = createOfflineGame({ data, store: openStore(":memory:"), random: seededRandom(7) });
    const testSaves = createTestSaves({ data, store: game.store, saves });
    const app = createApp(game.combiner, { progress: game.progress, shop: game.shop, day: game.day, town: game.town, events: game.events, shifts: game.shifts, testSaves });
    return { game, app, reset: (player: string) => app.request(`/api/test-saves/${player}/reset`, { method: "POST" }) };
  }

  it("list each save's player and what it is for", async () => {
    const { app } = await server();
    const body = (await (await app.request("/api/test-saves")).json()) as { saves: { player: string; about: string }[] };
    expect(body.saves).toEqual(saves.scenarios.map(({ player, about }) => ({ player, about })));
  });

  it("start a save over in place, back where its steps leave it", async () => {
    const { game, reset } = await server();
    expect((await reset("smithy-built")).status).toBe(200);
    const fresh = snapshot(game, "smithy-built");
    // Play on: hire Dunstan and spend some gold.
    game.town.hire("smithy-built", 0);
    expect(snapshot(game, "smithy-built")).not.toEqual(fresh);
    const again = await reset("smithy-built");
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ player: "smithy-built", progress: { day: { number: 2 } } });
    expect(snapshot(game, "smithy-built")).toEqual(fresh);
  });

  it("refuse any player who is not a test save, and leave them as they were", async () => {
    const { game, reset } = await server();
    game.store.addLedger("Trysten", 500, "quest", "real");
    const refused = await reset("Trysten");
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ error: expect.stringContaining("not a test save") });
    expect(game.store.getGold("Trysten")).toBe(500);
  });

  it("are not there when the server is started without them", async () => {
    const { createApp } = await import("../src/server/app");
    const game = createOfflineGame({ data, store: openStore(":memory:"), random: seededRandom(7) });
    const app = createApp(game.combiner, { progress: game.progress, shop: game.shop, day: game.day });
    expect((await app.request("/api/test-saves")).status).toBe(404);
    expect((await app.request("/api/test-saves/fresh/reset", { method: "POST" })).status).toBe(404);
  });
});
