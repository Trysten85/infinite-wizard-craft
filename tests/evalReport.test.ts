import { describe, expect, it } from "vitest";
import { findInventedNames, renderEvalReport, type EvalRun } from "../src/server/evalReport";
import { chatBody } from "../src/server/llm/ollama";

describe("finding invented names", () => {
  const known = ["Pim Kettlebrook", "Glass", "Bat guano"];

  it("picks out capitalised words in mid-sentence that the game does not know", () => {
    const text = "You were steeping a batch of Moonpetal tea when Pim came in. He asked about the Glowroot Blooms, and about Glass.";
    expect(findInventedNames(text, known)).toEqual(["Moonpetal", "Glowroot Blooms"]);
  });

  it("ignores sentence starts, speech starts, known names, and the word I", () => {
    const text = 'The bell rang. "Good morning," said Pim Kettlebrook. \'Thank you,\' she said, and I nodded. Then she left with the bat guano.';
    expect(findInventedNames(text, known)).toEqual([]);
  });

  it("lists each invented name once", () => {
    expect(findInventedNames("She wanted Dreamleaf. He wanted Dreamleaf too, and some Dreamleaf's oil.", [])).toEqual(["Dreamleaf"]);
  });
});

describe("the comparison report", () => {
  const run = (model: string, rerolls: number): EvalRun => ({
    model,
    seconds: 120,
    inventedNames: model === "old" ? ["Moonpetal"] : [],
    calls: [
      { purpose: "combo", ok: true, latencyMs: 2000 },
      { purpose: "event", ok: true, latencyMs: 10000 },
      ...Array.from({ length: rerolls }, () => ({ purpose: "event", ok: false, latencyMs: 9000, error: "Do not use digits." })),
    ],
    cases: [
      { set: "Ordinary combinations", title: "Sand + Water", output: model === "old" ? "**Slurry.** Wet." : "**Beach.** Warm." },
      { set: "Magical combinations", title: "Iron + Light", output: "**Lantern** (ordinary).", correct: model !== "old" },
      { set: "Events", title: "A goose", output: model === "old" ? "FAILED: gave up" : "A goose has your hat." },
    ],
  });
  const report = renderEvalReport([run("old", 2), run("new", 0)], "2026-10-08 12:00");

  it("puts the models side by side in a summary", () => {
    expect(report).toContain("| | old | new |");
    expect(report).toContain("| Cases that failed outright | 1 | 0 |");
    expect(report).toContain("| Rerolls (a rule was broken and it had to try again) | 2 in 4 calls | 0 in 2 calls |");
    expect(report).toContain("| Invented names in event text | 1 | 0 |");
    expect(report).toContain("| event | 9.3 | 10.0 |");
  });

  it("says why each model had to try again", () => {
    expect(report).toContain("- 2 x Do not use digits.");
    expect(report).toContain("- Never.");
    expect(report).toContain("Invented names: Moonpetal");
  });

  it("shows every case with each model's answer, marking right and wrong", () => {
    expect(report.indexOf("### Sand + Water")).toBeLessThan(report.indexOf("**Slurry.** Wet."));
    expect(report.indexOf("**Slurry.** Wet.")).toBeLessThan(report.indexOf("**Beach.** Warm."));
    expect(report).toContain("**old** (WRONG)");
    expect(report).toContain("**new** (right)");
  });
});

describe("the request sent to Ollama", () => {
  const request = { system: "s", prompt: "p", jsonSchema: { type: "object" }, temperature: 0.5 };

  it("carries a thinking level only for a reasoning model", () => {
    expect(chatBody("gpt-oss:20b", request, { think: "low" })).toMatchObject({ model: "gpt-oss:20b", think: "low", format: { type: "object" } });
    expect(chatBody("gemma3:12b", request)).not.toHaveProperty("think");
  });

  it("says how long to keep the model loaded, when told", () => {
    expect(chatBody("gpt-oss:20b", request, { keepAlive: "30m" })).toMatchObject({ keep_alive: "30m" });
    expect(chatBody("gpt-oss:20b", request)).not.toHaveProperty("keep_alive");
  });
});
