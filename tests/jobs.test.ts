import { describe, expect, it } from "vitest";
import { createApp } from "../src/server/app";
import { createCombiner } from "../src/server/combiner";
import { buildGameData, loadGameData, readGameFiles } from "../src/server/gameData";
import { buildPath } from "../src/server/paths";
import { openStore } from "../src/server/store";

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
    expect(jobs).toHaveLength(22);
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
    expect(body.jobs).toHaveLength(22);
    expect(body.jobs.find((job) => job.id === "spy")).toEqual({ id: "spy", magic: false, hint: "Someone works in the dark.", starter: false });
    expect(body.jobs.find((job) => job.id === "wizard")).toMatchObject({ starter: true, hint: "Someone opens the book." });
  });
});
