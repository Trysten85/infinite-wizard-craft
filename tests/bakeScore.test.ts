import { describe, expect, it } from "vitest";
import { renderScore, scoreRound, type ScoreContext, type Scored } from "../src/server/bakeScore";
import { canonicalName } from "../src/server/names";
import { data } from "./helpers";

const context: ScoreContext = {
  banned: data.banned,
  overused: data.overused,
  maxSentences: 2,
  attractors: new Set(["fertilizer"]),
  canonical: (name) => canonicalName(name, data.aliases),
};
const item = (key: string, expected: string | null, got: string | null, more: Partial<Scored> = {}): Scored => ({ key, expected, got, noResult: false, failed: false, description: "A thing.", tags: ["utility"], expectedTags: ["utility"], seconds: 10, ...more });

describe("scoring a round against the held-out pairs", () => {
  const held = [item("air+air", "Wind", "wind"), item("fire+fire", "Campfire", "Fertilizer"), item("water+water", "Lake", null, { failed: true }), item("earth+earth", "Soil", "Hospital", { description: "It hums. One. Two. Three." })];
  const probes = [item("salt+water", null, "salt water"), item("salt+steam", null, "Sea")];
  const summary = scoreRound(held, probes, context);

  it("counts approval by his answer, whatever the case or spelling", () => {
    expect(summary).toMatchObject({ pairs: 4, matched: 1, matchRate: 0.25, failed: 1 });
  });

  it("counts attractors, banned results, long descriptions and worn-out words among what the model gave", () => {
    expect(summary.attractors).toBe(1);
    expect(summary.banned).toBe(1);
    expect(summary.tooLong).toBe(1);
    expect(summary.wornShare).toBeCloseTo(1 / 5);
  });

  it("holds Water + Salt to Saltwater, and Steam + Salt to anything but Sea", () => {
    expect(summary.probes.map((probe) => [probe.key, probe.ok])).toEqual([["salt+water", true], ["salt+steam", false]]);
    expect(scoreRound([], [item("salt+steam", null, "Salt spray")], context).probes[1]!.ok).toBe(true);
  });

  it("averages the seconds a pair and reports it", () => {
    expect(summary.secondsEach).toBe(10);
    const report = renderScore("single", summary, held);
    expect(report).toContain("Gave Trysten's answer: 1 (25%)");
    expect(report).toContain("salt+steam should not be Sea: gave Sea, WRONG");
    expect(report).toContain("| water+water | Lake | (failed) | 10.0 |");
  });
});
