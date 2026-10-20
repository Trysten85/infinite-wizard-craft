import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/server/app";
import { createCombiner } from "../src/server/combiner";
import { eligibleSeeds, snapshotPlayer } from "../src/server/events/picker";
import { createCannedEventWriter } from "../src/server/events/writer";
import { buildGameData, loadGameData, readGameFiles } from "../src/server/gameData";
import { buildPath } from "../src/server/paths";
import { openStore } from "../src/server/store";
import { newGame } from "./helpers";

const data = loadGameData(process.cwd());
const jobs = [...data.jobs.values()];

function newCombiner() {
  const generate = async () => {
    throw new Error("the model must not be called");
  };
  return createCombiner({ data, store: openStore(":memory:"), generate });
}

describe("jobs", () => {
  it("are all entries of kind job, mundane and magic", () => {
    expect(jobs).toHaveLength(23);
    expect(jobs.filter((job) => job.magic)).toHaveLength(12);
    expect(data.jobs.has("sorcerer")).toBe(false);
    for (const job of jobs) expect(data.entries.get(job.id), job.id).toMatchObject({ kind: "job", name: job.name });
    for (const id of ["alchemist", "blacksmith", "runesmith", "spy", "court-mage", "hermit-wizard", "healer", "professor", "magical-scholar", "tea-shop-owner", "back-room-apothecary"]) expect(data.jobs.has(id), id).toBe(true);
  });

  // The reverse check: work each job back to the starting elements, then play that exact path
  // forward through the real rules and confirm it ends with the job.
  it.each(jobs.map((job) => [job.name, job.id]))("%s can be crafted by following its path", async (_name, id) => {
    const steps = buildPath(data, id);
    expect(steps[steps.length - 1]!.result).toBe(id);
    const combiner = newCombiner();
    let last;
    for (const step of steps) last = await combiner.combine("tester", ...step.inputs);
    expect(last!.entry).toMatchObject({ id, kind: "job" });
    expect(combiner.listDiscovered("tester").map((entry) => entry.id)).toContain(id);
  });

  it("make a magic job impossible without a school or a focus, and a mundane job possible without either", () => {
    for (const job of jobs) {
      const ingredients = buildPath(data, job.id).flatMap((step) => step.inputs).map((id) => data.entries.get(id)!.kind);
      const usesMagic = ingredients.includes("school") || ingredients.includes("focus");
      expect(usesMagic, job.id).toBe(job.magic);
    }
  });

  it("let a job build on another job", () => {
    expect(buildPath(data, "runesmith").map((step) => step.result)).toContain("blacksmith");
    expect(buildPath(data, "court-mage").map((step) => step.result)).toEqual(expect.arrayContaining(["wizard", "crown"]));
  });

  it("make a healer from a herbalist and any healing spell in play", () => {
    const makesHealer = [...data.combos.values()].filter((recipe) => recipe.result === "healer");
    expect(makesHealer.map((recipe) => recipe.inputs)).toEqual(
      expect.arrayContaining([["herbalist", "spell-spare-the-dying"], ["herbalist", "spell-false-life"]]),
    );
    for (const recipe of makesHealer) expect(data.entries.get(recipe.inputs[1])!.tags, recipe.inputs[1]).toContain("healing");
  });

  it("make an innkeeper from a person and spirits, a mundane job that wants what a tavern serves", () => {
    const innkeeper = data.jobs.get("innkeeper")!;
    expect(innkeeper).toMatchObject({ magic: false, inputs: ["person", "spirits"], wantedTags: ["brewing", "liquid", "plant", "animal"] });
    expect(data.combos.get("person+spirits")).toMatchObject({ result: "innkeeper" });
    expect(data.jobSkins.get("innkeeper")!.base.from!.tags.sort()).toEqual([...innkeeper.wantedTags].sort());
  });

  it("mark Wizard, and only Wizard, as the job for the first job quest", () => {
    expect(jobs.filter((job) => job.starter).map((job) => job.id)).toEqual(["wizard"]);
  });

  it("do not combine with anything that has no hand-written recipe, and never call the model", async () => {
    const combiner = newCombiner();
    for (const step of buildPath(data, "blacksmith")) await combiner.combine("tester", ...step.inputs);
    await expect(combiner.combine("tester", "blacksmith", "fire")).rejects.toMatchObject({ code: "no-result" });
  });

  it("refuse a wanted tag outside the vocabulary", () => {
    const files = readGameFiles(process.cwd());
    const jobsWithTypo = files.jobs.map((job, index) => (index === 0 ? { ...job, wantedTags: ["sparkly"] } : job));
    expect(() => buildGameData({ ...files, jobs: jobsWithTypo })).toThrow(/wants unknown tag "sparkly"/);
  });

  it("are listed for the journal with a hint and no name", async () => {
    const response = await createApp(newCombiner()).request("/api/jobs");
    const body = (await response.json()) as { jobs: Record<string, unknown>[] };
    expect(body.jobs).toHaveLength(23);
    expect(body.jobs.find((job) => job.id === "spy")).toEqual({ id: "spy", magic: false, hint: "Someone who likes the shade and listens well. Curtains are involved.", starter: false });
    expect(body.jobs.find((job) => job.id === "wizard")).toMatchObject({ starter: true });
  });
});

describe("taking up a job", () => {
  const post = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  // A player who has discovered two jobs, Farmer first and Blacksmith second.
  function withTwoJobs() {
    const game = newGame();
    for (const id of ["person", "forge", "farmer", "blacksmith"]) game.store.addDiscovery("ann", id);
    return game;
  }

  it("is not done for the player: discovering a job is not choosing it", () => {
    const game = withTwoJobs();
    expect(game.progress.getProgress("ann").job).toBeNull();
    expect(newGame().progress.getProgress("ann").job).toBeNull();
  });

  it("is kept from then on, whatever jobs are discovered afterwards", () => {
    const game = withTwoJobs();
    game.store.addTaught("ann", "farmer");
    expect(game.progress.chooseJob("ann", "farmer").job).toEqual({ id: "farmer", name: "Farmer" });
    expect(game.progress.getProgress("ann").job).toEqual({ id: "farmer", name: "Farmer" });
    game.store.addDiscovery("ann", "herb");
    game.store.addDiscovery("ann", "herbalist");
    expect(game.progress.getProgress("ann").job).toEqual({ id: "farmer", name: "Farmer" });
    // Another player's choice is their own.
    expect(game.progress.getProgress("bob").job).toBeNull();
  });

  it("can be changed by taking up a different job", () => {
    const game = withTwoJobs();
    game.store.addTaught("ann", "farmer");
    game.progress.chooseJob("ann", "farmer");
    game.store.addTaught("ann", "blacksmith");
    game.progress.chooseJob("ann", "blacksmith");
    expect(game.progress.getProgress("ann").job).toEqual({ id: "blacksmith", name: "Blacksmith" });
  });

  it("is refused for a job the player has not discovered, and for anything that is not a job", () => {
    const game = withTwoJobs();
    expect(() => game.progress.chooseJob("ann", "wizard")).toThrow(/only take up a job you have discovered/);
    expect(() => game.progress.chooseJob("ann", "forge")).toThrow(/only take up a job/);
    expect(() => game.progress.chooseJob("ann", "no-such-job")).toThrow(/only take up a job/);
    expect(game.progress.getProgress("ann").job).toBeNull();
  });

  it("is what events go by: a job only discovered opens no job events and lends no skill", () => {
    const game = withTwoJobs();
    const discovered = game.combiner.listDiscovered("ann");
    const before = snapshotPlayer(data, discovered, 3, game.progress.getProgress("ann").job?.id ?? null);
    expect(before.job).toBeNull();
    game.store.addTaught("ann", "farmer");
    game.progress.chooseJob("ann", "farmer");
    const after = snapshotPlayer(data, discovered, 3, game.progress.getProgress("ann").job?.id ?? null);
    expect(after.job).toMatchObject({ id: "farmer", wantedTags: data.jobs.get("farmer")!.wantedTags });
    const needJob = data.eventSeeds.filter((seed) => seed.needsJob).map((seed) => seed.id);
    expect(needJob.length).toBeGreaterThan(0);
    for (const id of needJob) {
      expect(eligibleSeeds(data.eventSeeds, before).map((seed) => seed.id)).not.toContain(id);
      expect(eligibleSeeds(data.eventSeeds, { ...after, hasSpell: true }).map((seed) => seed.id)).toContain(id);
    }
    // A job id that is not among the player's discoveries counts for nothing.
    expect(snapshotPlayer(data, discovered, 3, "wizard").job).toBeNull();
  });

  it("is told to the event writer as the player's trade", async () => {
    const briefs: { player: { job: string | null } }[] = [];
    const canned = createCannedEventWriter();
    const game = newGame(1, { ...canned, write: (brief) => (briefs.push(brief), canned.write(brief)) });
    for (const id of ["person", "forge", "farmer", "blacksmith"]) game.store.addDiscovery("ann", id);
    await game.events.test("ann", "small_thief");
    game.store.addTaught("ann", "farmer");
    game.progress.chooseJob("ann", "farmer");
    await game.events.test("ann", "small_thief");
    expect(briefs.map((brief) => brief.player.job)).toEqual([null, "Farmer"]);
  });

  it("has a route, which answers with where the player now stands", async () => {
    const game = withTwoJobs();
    const app = createApp(game.combiner, { progress: game.progress, shop: game.shop, day: game.day, events: game.events });
    const before = (await (await app.request("/api/players/ann")).json()) as Record<string, any>;
    expect(before.progress.job).toBeNull();

    game.store.addTaught("ann", "blacksmith");
    const taken = await app.request("/api/players/ann/job", post({ job: "blacksmith" }));
    expect(taken.status).toBe(200);
    const body = (await taken.json()) as Record<string, any>;
    expect(body.progress.job).toEqual({ id: "blacksmith", name: "Blacksmith" });
    expect(body.rewards).toMatchObject({ gold: expect.any(Number), quests: expect.any(Array) });
    expect(((await (await app.request("/api/players/ann")).json()) as Record<string, any>).progress.job).toEqual({ id: "blacksmith", name: "Blacksmith" });

    const refused = await app.request("/api/players/ann/job", post({ job: "wizard" }));
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as Record<string, any>).error).toMatch(/only take up a job you have discovered/);
    expect((await app.request("/api/players/ann/job", post({}))).status).toBe(400);
  });

  it("survives the server being restarted", () => {
    const dir = mkdtempSync(join(tmpdir(), "iwc-job-"));
    const path = join(dir, "game.db");
    const first = openStore(path);
    first.addDiscovery("ann", "farmer");
    first.setJob("ann", "farmer");
    first.close();
    const second = openStore(path);
    expect(second.getStats("ann").job).toBe("farmer");
    expect(second.getStats("bob").job).toBeNull();
    second.close();
    rmSync(dir, { recursive: true });
  });
});
