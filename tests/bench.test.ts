import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { benchSchema, fromGrade, renderBenchReport, settle, summarise, type BenchOutcome } from "../src/server/bench";
import { goesWith } from "../src/server/cacheReview";
import { openStore } from "../src/server/store";
import { comboKey, type GameEntry } from "../src/shared/schema";
import { data } from "./helpers";

const pair = { good: ["Beach", "Shore"], bad: ["Clay"] };

describe("judging a bench answer", () => {
  it("is settled by the lists where they speak, whatever the spelling", () => {
    expect(settle({ name: "beach", storybook: false }, pair, false)).toMatchObject({ verdict: "good" });
    expect(settle({ name: "Clay", storybook: false }, pair, false)).toMatchObject({ verdict: "bad" });
    expect(settle({ name: "Coast", storybook: false }, pair, false)).toBeNull();
  });

  it("counts a storybook thing from an ordinary pair as wrong, and allows one from a magical pair", () => {
    expect(settle({ name: "Mermaid", storybook: true }, pair, false)).toMatchObject({ verdict: "bad" });
    expect(settle({ name: "Mermaid", storybook: true }, pair, true)).toBeNull();
  });

  it("falls to the grader otherwise, which wants both sense and a real name", () => {
    expect(fromGrade({ makesSense: true, realName: true, why: "Fine." })).toEqual({ verdict: "plausible", why: "Fine." });
    expect(fromGrade({ makesSense: false, realName: true, why: "No link." }).verdict).toBe("doubtful");
    expect(fromGrade({ makesSense: true, realName: false, why: "Made up." })).toMatchObject({ verdict: "doubtful", why: "Not a real name. Made up." });
    expect(fromGrade(null).verdict).toBe("doubtful");
  });
});

describe("the bench report", () => {
  const outcome = (name: string, verdict: BenchOutcome["verdict"], seconds: number): BenchOutcome => ({ pair: "Sand + Water", magical: false, name, description: "Wet.", tags: [], storybook: false, seconds, calls: ["combo-ideas", "combo (reroll)", "combo"], verdict, why: "Because." });

  it("counts verdicts, time, repeats, and rerolls", () => {
    const summary = summarise([outcome("Beach", "good", 4), outcome("Beach", "good", 6), outcome("(nothing)", "failed", 30)]);
    expect(summary.counts).toMatchObject({ good: 2, failed: 1, bad: 0 });
    expect(summary.averageSeconds).toBe(5);
    expect(summary).toMatchObject({ distinct: 1, made: 2, rerolls: 3 });
  });

  it("sets this run beside the last one", () => {
    const report = renderBenchReport([outcome("Beach", "good", 4)], "now", "Model: test.", { when: "before", outcomes: [outcome("Clay", "bad", 3)] });
    expect(report).toContain("| | This run | Last run (before) |");
    expect(report).toContain("| Good (on the list of right answers) | 1 (100%) | 0 (0%) |");
    expect(report).toContain("| Sand + Water | Beach | GOOD | 4.0 | Clay (bad) |");
    expect(renderBenchReport([outcome("Beach", "good", 4)], "now", "Model: test.")).toContain("| | This run |\n");
  });
});

describe("the bench itself", () => {
  const bench = benchSchema.parse(JSON.parse(readFileSync("data/combo-bench.json", "utf8")));
  const known = (id: string) => data.entries.has(id) || id in bench.things;

  it("only names things that exist, and only pairs the model would be asked about", () => {
    expect(bench.pairs.length).toBeGreaterThanOrEqual(50);
    for (const item of bench.pairs) {
      expect(known(item.a) && known(item.b), `${item.a} + ${item.b}`).toBe(true);
      expect(data.combos.has(comboKey(item.a, item.b)), `${item.a} + ${item.b} has a hand-written recipe`).toBe(false);
    }
    for (const thing of Object.values(bench.things)) for (const id of thing.madeFrom) expect(known(id), id).toBe(true);
  });

  it("never lists the same answer as both right and wrong", () => {
    for (const item of bench.pairs) for (const name of item.good) expect(item.bad, `${item.a} + ${item.b}`).not.toContain(name);
  });
});

describe("what deleting a cached combination would take with it", () => {
  const combo = (a: string, b: string, resultId: string) => ({ key: `${a}+${b}`, a, b, resultId, createdAt: "" });
  const combos = [combo("fire", "mud", "clay"), combo("glass", "mud", "clay"), combo("clay", "fire", "brick"), combo("brick", "metal", "chimney"), combo("air", "air", "wind")];

  it("is nothing when another pair still makes the same thing", () => {
    expect(goesWith(combos, "fire+mud")).toEqual([]);
  });

  it("is the thing and everything built from it when no other pair makes it", () => {
    expect(goesWith(combos, "clay+fire")).toEqual(["brick", "chimney"]);
    expect(goesWith(combos, "air+air")).toEqual(["wind"]);
    expect(goesWith(combos, "no+such")).toEqual([]);
  });

  it("agrees with what the store really deletes", () => {
    const store = openStore(":memory:");
    const thing = (id: string): GameEntry => ({ id, name: id, kind: "material", description: "x", tags: [], affinity: [], tier: 0, source: "generated", depth: 1, xp: 0 });
    for (const item of combos) store.saveGenerated(item.key, item.a, item.b, thing(item.resultId));
    const predicted = goesWith(store.listCombos(), "clay+fire");
    expect(store.deleteCombo("clay+fire").sort()).toEqual(predicted.sort());
  });
});
